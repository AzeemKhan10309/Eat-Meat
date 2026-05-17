import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import { apiRouter } from './routes/index';
import { errorHandler, notFound } from './middleware/error.middleware';
import { logger } from './utils/logger';
import { printerService } from './services/printer.service';

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: process.env.CORS_ORIGIN || 'http://localhost:5173', methods: ['GET', 'POST'] },
});

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('combined', { stream: { write: msg => logger.http(msg.trim()) } }));

// Rate limiting
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: 'Too many login attempts' }));
app.use('/api/', rateLimit({ windowMs: 1 * 60 * 1000, max: 300 }));

// Static uploads
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api', apiRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

// ── WebSocket ─────────────────────────────────────────────────────────────────
io.on('connection', socket => {
  logger.info(`WS connected: ${socket.id}`);

  socket.on('join:pos', () => socket.join('pos'));

  socket.on('disconnect', () => logger.info(`WS disconnected: ${socket.id}`));
});

// Give printer service access to Socket.io for real-time events
printerService.setIO(io);

// Export io for use in services
export { io };

// ── Error handling ────────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3001');
const HOST = process.env.HOST || 'localhost';

httpServer.listen(PORT, HOST, () => {
  logger.info(`🚀 Eat & Meet Server running at http://${HOST}:${PORT}`);
  logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`🔌 WebSocket ready`);
  // Signal Electron main process that the server is ready (in-process mode)
  if (typeof (global as any).__onServerReady === 'function') {
    (global as any).__onServerReady();
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  printerService.destroy();
  httpServer.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

export default app;
