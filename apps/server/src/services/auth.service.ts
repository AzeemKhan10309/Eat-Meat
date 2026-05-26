import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { AppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';

const envCandidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'apps/server/.env'),
  path.resolve(__dirname, '../../.env'),
];

for (const envPath of envCandidates) {
  dotenv.config({ path: envPath, override: false });
  if (process.env.DATABASE_URL) break;
}

const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'refresh-secret';
const JWT_ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '15m';
const JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000;

export class AuthService {
  async login(email: string, password: string) {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

    if (!user) throw new AppError('Invalid credentials', 401);
    if (!user.isActive) throw new AppError('Account is inactive', 401);

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      throw new AppError(`Account locked. Try again in ${minutes} minutes`, 423);
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      const attempts = user.loginAttempts + 1;
      const updateData: Record<string, unknown> = { loginAttempts: attempts };

      if (attempts >= MAX_LOGIN_ATTEMPTS) {
        updateData.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION);
        updateData.loginAttempts = 0;
      }

      await prisma.user.update({ where: { id: user.id }, data: updateData });
      throw new AppError('Invalid credentials', 401);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { loginAttempts: 0, lockedUntil: null, lastLogin: new Date() },
    });

    const tokens = this.generateTokens(user.id, user.email, user.role);

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: tokens.refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    logger.info(`User logged in: ${user.email}`);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _p, ...safeUser } = user;
    return { user: safeUser, tokens };
  }

  async loginWithPin(pin: string | number) {
    const normalizedPin = String(pin).trim();

    if (!/^\d{4}$/.test(normalizedPin)) {
      throw new AppError('PIN must be a 4-digit code', 400);
    }
    const users = await this.getActiveUsersWithPin();

    for (const user of users) {
          if (user.pin && await this.isValidPin(normalizedPin, user.pin)) {
        await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });
        const tokens = this.generateTokens(user.id, user.email, user.role);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password: _p, pin: _pin, ...safeUser } = user;
        return { user: safeUser, tokens };
      }
    }

    throw new AppError('Invalid PIN', 401);
  }
  private async getActiveUsersWithPin() {
    try {
      return await prisma.user.findMany({ where: { isActive: true, pin: { not: null } } });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);

      if (message.includes('DATABASE_URL')) {
        const attemptedPaths = envCandidates.join(', ');
        throw new AppError(
          `Server is not configured: DATABASE_URL is missing. Create apps/server/.env from apps/server/.env.example and set DATABASE_URL. Tried: ${attemptedPaths}`,
          500,
        );
      }

      throw err;
    }
  }

  private async isValidPin(inputPin: string, storedPin: string) {
    // Support both hashed pins and legacy plain-text pins already in DB.
    try {
      if (await bcrypt.compare(inputPin, storedPin)) return true;
    } catch {
      // Non-bcrypt value (e.g. legacy plain-text PIN), fall back to direct match.
    }

    return inputPin === storedPin;
  }
  async refreshTokens(refreshToken: string) {
    const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
    if (!stored || stored.expiresAt < new Date()) {
      throw new AppError('Invalid or expired refresh token', 401);
    }

    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as { userId: string };
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user || !user.isActive) throw new AppError('User not found', 401);

    await prisma.refreshToken.delete({ where: { token: refreshToken } });

    const tokens = this.generateTokens(user.id, user.email, user.role);
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: tokens.refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return tokens;
  }

  async logout(refreshToken: string) {
    await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
  }

  private generateTokens(userId: string, email: string, role: string) {
    const accessToken = jwt.sign({ userId, email, role }, JWT_SECRET, { expiresIn: JWT_ACCESS_EXPIRY } as jwt.SignOptions);
    const refreshToken = jwt.sign({ userId, jti: uuidv4() }, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRY } as jwt.SignOptions);
    return { accessToken, refreshToken, expiresIn: 900 };
  }
}
