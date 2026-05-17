import { exec } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Server as SocketIOServer } from 'socket.io';
import { logger } from '../utils/logger';

// ── Thermal printer brand/keyword fingerprints ─────────────────────────────
const THERMAL_KEYWORDS = [
  'epson', 'xprinter', 'xp-', 'tysso', 'bixolon', 'star ',
  'citizen', 'sewoo', 'rongta', 'goojprt', 'gainscha',
  'thermal', 'receipt', 'tsp', 'tm-', 'rp-', 'srp-',
  'pos-', 'pos80', 'pos58', '80mm', '58mm', 'gp-', 'bt-',
];

// ── ESC/POS lib (optional — graceful no-op if unavailable) ─────────────────
let ThermalPrinter: any, PrinterTypes: any, CharacterSet: any;
try {
  const m = require('node-thermal-printer');
  ThermalPrinter = m.ThermalPrinter;
  PrinterTypes   = m.PrinterTypes;
  CharacterSet   = m.CharacterSet;
  logger.info('node-thermal-printer loaded (ESC/POS available)');
} catch {
  logger.warn('node-thermal-printer unavailable — text fallback only');
}

// ── Types ──────────────────────────────────────────────────────────────────
export interface PrinterStatus {
  detected: boolean;
  name: string | null;
  online: boolean;
  method: 'escpos' | 'text' | 'none';
  lastChecked: string;
}

export interface ReceiptData {
  orderNumber: string;
  restaurantName: string;
  restaurantAddress: string;
  restaurantPhone: string;
  date: string;
  cashier: string;
  orderType: string;
  items: Array<{ name: string; quantity: number; unitPrice: number; total: number }>;
  subtotal: number;
  discount: number;
  tax: number;
  serviceCharge: number;
  total: number;
  paymentMethod: string;
  currencySymbol: string;
  cashReceived?: number;
  change?: number;
  footer?: string;
}

// ── Service ────────────────────────────────────────────────────────────────
export class PrinterService {
  private currentPrinter: string | null = null;
  private isOnline = false;
  private printMethod: 'escpos' | 'text' | 'none' = 'none';
  private io: SocketIOServer | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private readonly W = 48;

  constructor() {
    // Delay first detection until server is fully started
    setTimeout(() => this.startPolling(), 3000);
  }

  setIO(io: SocketIOServer) {
    this.io = io;
  }

  // ── Detection ────────────────────────────────────────────────────────────

  private getWindowsPrinters(): Promise<string[]> {
    return new Promise(resolve => {
      const cmd = 'powershell -NonInteractive -Command "Get-Printer | Select-Object -ExpandProperty Name | ConvertTo-Json -Compress"';
      exec(cmd, { timeout: 8000 }, (err, stdout) => {
        if (err || !stdout.trim()) { resolve([]); return; }
        try {
          const parsed = JSON.parse(stdout.trim());
          resolve(Array.isArray(parsed) ? parsed : typeof parsed === 'string' ? [parsed] : []);
        } catch { resolve([]); }
      });
    });
  }

  private isThermal(name: string): boolean {
    const lower = name.toLowerCase();
    return THERMAL_KEYWORDS.some(k => lower.includes(k));
  }

  private async detectBestPrinter(): Promise<string | null> {
    const envName = (process.env.PRINTER_NAME || '').trim();
    if (envName) return envName;
    const printers = await this.getWindowsPrinters();
    return printers.find(p => this.isThermal(p)) ?? null;
  }

  async listAvailablePrinters(): Promise<string[]> {
    return this.getWindowsPrinters();
  }

  private checkOnline(printerName: string): Promise<boolean> {
    return new Promise(resolve => {
      const safe = printerName.replace(/'/g, "''");
      const cmd = `powershell -NonInteractive -Command "(Get-Printer -Name '${safe}' -ErrorAction SilentlyContinue).PrinterStatus"`;
      exec(cmd, { timeout: 5000 }, (err, stdout) => {
        if (err) { resolve(false); return; }
        const s = stdout.trim();
        // PrinterStatus values: Normal/3/Idle = ready, 4 = printing — all mean online
        resolve(['Normal', 'Idle', '3', '4', '0'].includes(s));
      });
    });
  }

  private async runDetection() {
    const found   = await this.detectBestPrinter();
    const hadName = this.currentPrinter;

    if (found && found !== hadName) {
      // New printer connected (or first detection)
      this.currentPrinter = found;
      this.isOnline        = await this.checkOnline(found);
      this.printMethod     = ThermalPrinter ? 'escpos' : 'text';
      logger.info(`Printer detected: "${found}" | online: ${this.isOnline} | method: ${this.printMethod}`);
      this.io?.emit('printer:connected', this.getStatus());

    } else if (!found && hadName) {
      // Printer unplugged
      logger.info(`Printer disconnected: "${hadName}"`);
      this.currentPrinter = null;
      this.isOnline        = false;
      this.printMethod     = 'none';
      this.io?.emit('printer:disconnected', { name: hadName });

    } else if (found) {
      // Same printer — refresh online flag
      const online = await this.checkOnline(found);
      if (online !== this.isOnline) {
        this.isOnline = online;
        this.io?.emit('printer:status', this.getStatus());
      }
    }
  }

  private startPolling() {
    this.runDetection();
    this.pollTimer = setInterval(() => this.runDetection(), 10_000);
  }

  async forceDetect() {
    await this.runDetection();
    return this.getStatus();
  }

  getStatus(): PrinterStatus {
    return {
      detected:    this.currentPrinter !== null,
      name:        this.currentPrinter,
      online:      this.isOnline,
      method:      this.printMethod,
      lastChecked: new Date().toISOString(),
    };
  }

  // ── Receipt text generation ───────────────────────────────────────────────

  private center(text: string): string {
    const pad = Math.max(0, Math.floor((this.W - text.length) / 2));
    return ' '.repeat(pad) + text;
  }

  private lr(left: string, right: string): string {
    return left + ' '.repeat(Math.max(1, this.W - left.length - right.length)) + right;
  }

  private div(char = '-'): string { return char.repeat(this.W); }

  generateReceiptText(data: ReceiptData): string {
    const c   = data.currencySymbol;
    const fmt = (n: number) => `${c}${n.toFixed(2)}`;
    const L: string[] = [];

    L.push(this.center(data.restaurantName.toUpperCase()));
    L.push(this.center(data.restaurantAddress));
    if (data.restaurantPhone) L.push(this.center(data.restaurantPhone));
    L.push(this.div('='));
    L.push(this.lr('Order:',   data.orderNumber));
    L.push(this.lr('Date:',    data.date));
    L.push(this.lr('Cashier:', data.cashier));
    L.push(this.lr('Type:',    data.orderType.replace('_', ' ')));
    L.push(this.div());
    L.push(this.lr('ITEM', 'TOTAL'));
    L.push(this.div());

    for (const item of data.items) {
      L.push(item.name);
      L.push(this.lr(`  ${item.quantity} x ${fmt(item.unitPrice)}`, fmt(item.total)));
    }

    L.push(this.div());
    L.push(this.lr('Subtotal:', fmt(data.subtotal)));
    if (data.discount     > 0) L.push(this.lr('Discount:',       `-${fmt(data.discount)}`));
    if (data.serviceCharge > 0) L.push(this.lr('Service Charge:', fmt(data.serviceCharge)));
    if (data.tax          > 0) L.push(this.lr('Tax:',             fmt(data.tax)));
    L.push(this.div('='));
    L.push(this.lr('TOTAL:', fmt(data.total)));
    L.push(this.div());
    L.push(this.lr('Payment:', data.paymentMethod));
    if (data.cashReceived) {
      L.push(this.lr('Cash:',   fmt(data.cashReceived)));
      L.push(this.lr('Change:', fmt(data.change ?? 0)));
    }
    L.push(this.div('='));
    if (data.footer) {
      L.push('');
      data.footer.split('\n').forEach(fl => L.push(this.center(fl)));
    }
    L.push('', '', '');
    return L.join('\n');
  }

  // ── ESC/POS printing (node-thermal-printer) ───────────────────────────────

  private async printESCPOS(data: ReceiptData, printerName: string): Promise<boolean> {
    if (!ThermalPrinter) return false;
    try {
      const c   = data.currencySymbol;
      const fmt = (n: number) => `${c}${n.toFixed(2)}`;

      const p = new ThermalPrinter({
        type:                   PrinterTypes.EPSON,
        interface:              `printer:${printerName}`,
        characterSet:           CharacterSet.PC437_USA,
        removeSpecialCharacters: false,
        lineCharacter:          '-',
        width:                  this.W,
      });

      // Header
      p.alignCenter();
      p.bold(true); p.setTextSize(1, 1);
      p.println(data.restaurantName.toUpperCase());
      p.bold(false); p.setTextNormal();
      p.println(data.restaurantAddress);
      if (data.restaurantPhone) p.println(data.restaurantPhone);
      p.drawLine();

      // Meta
      p.alignLeft();
      p.println(`Order:   ${data.orderNumber}`);
      p.println(`Date:    ${data.date}`);
      p.println(`Cashier: ${data.cashier}`);
      p.println(`Type:    ${data.orderType.replace('_', ' ')}`);
      p.drawLine();

      // Items
      p.tableCustom([
        { text: 'ITEM',  align: 'LEFT',  width: 0.6 },
        { text: 'TOTAL', align: 'RIGHT', width: 0.4 },
      ]);
      p.drawLine();

      for (const item of data.items) {
        p.println(item.name);
        p.tableCustom([
          { text: `  ${item.quantity} x ${fmt(item.unitPrice)}`, align: 'LEFT',  width: 0.6 },
          { text: fmt(item.total),                               align: 'RIGHT', width: 0.4 },
        ]);
      }

      p.drawLine();
      p.leftRight('Subtotal:', fmt(data.subtotal));
      if (data.discount     > 0) p.leftRight('Discount:',       `-${fmt(data.discount)}`);
      if (data.serviceCharge > 0) p.leftRight('Service Charge:', fmt(data.serviceCharge));
      if (data.tax          > 0) p.leftRight('Tax:',             fmt(data.tax));
      p.drawLine();

      p.bold(true); p.setTextSize(1, 1);
      p.leftRight('TOTAL:', fmt(data.total));
      p.bold(false); p.setTextNormal();
      p.drawLine();

      p.leftRight('Payment:', data.paymentMethod);
      if (data.cashReceived) {
        p.leftRight('Cash:',   fmt(data.cashReceived));
        p.leftRight('Change:', fmt(data.change ?? 0));
      }
      p.drawLine();

      if (data.footer) {
        p.alignCenter();
        data.footer.split('\n').forEach(fl => p.println(fl));
      }

      p.newLine(); p.newLine(); p.cut();
      await p.execute();
      return true;
    } catch (err) {
      logger.warn('ESC/POS failed, will fallback to text:', (err as Error).message);
      return false;
    }
  }

  // ── Text fallback (PowerShell Out-Printer) ────────────────────────────────

  private async printText(text: string, printerName: string): Promise<boolean> {
    const tempFile = join(tmpdir(), `receipt_${Date.now()}.txt`);
    try {
      writeFileSync(tempFile, text.replace(/\r?\n/g, '\r\n'), 'latin1');
      await new Promise<void>((resolve, reject) => {
        const safePath    = tempFile.replace(/'/g, "''");
        const safePrinter = printerName.replace(/'/g, "''");
        const cmd = `powershell -NonInteractive -Command "Get-Content -Path '${safePath}' -Encoding Default | Out-Printer -Name '${safePrinter}'"`;
        exec(cmd, { timeout: 15_000 }, err => err ? reject(err) : resolve());
      });
      return true;
    } catch (err) {
      logger.error('Text print failed:', (err as Error).message);
      return false;
    } finally {
      try { unlinkSync(tempFile); } catch { /* ignore */ }
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async printReceipt(data: ReceiptData): Promise<{ success: boolean; text: string }> {
    const text        = this.generateReceiptText(data);
    const printerName = this.currentPrinter ?? (process.env.PRINTER_NAME ?? '').trim();

    if (!printerName) {
      logger.info('No printer configured — skipping auto-print');
      return { success: true, text };
    }

    // Try ESC/POS first; fall back to plain text
    if (await this.printESCPOS(data, printerName)) {
      logger.info(`Receipt printed (ESC/POS) → "${printerName}"`);
      return { success: true, text };
    }

    if (await this.printText(text, printerName)) {
      logger.info(`Receipt printed (text) → "${printerName}"`);
      return { success: true, text };
    }

    logger.error(`All print methods failed for "${printerName}"`);
    return { success: false, text };
  }

  async testPrint(overridePrinter?: string): Promise<{ success: boolean; message: string }> {
    const target = overridePrinter ?? this.currentPrinter ?? (process.env.PRINTER_NAME ?? '').trim();
    if (!target) return { success: false, message: 'No printer detected or configured' };

    const { success } = await this.printReceipt({
      orderNumber:       'TEST-001',
      restaurantName:    'EAT & MEET',
      restaurantAddress: 'Thermal Printer Test',
      restaurantPhone:   '',
      date:              new Date().toLocaleString('en-GB'),
      cashier:           'System',
      orderType:         'TAKEAWAY',
      items:             [{ name: 'Test Item', quantity: 1, unitPrice: 0, total: 0 }],
      subtotal:          0, discount: 0, tax: 0, serviceCharge: 0, total: 0,
      paymentMethod:     'TEST',
      currencySymbol:    'Rs',
      footer:            'Printer test successful!\nEat & Meet POS',
    });

    return {
      success,
      message: success
        ? `Test page sent to "${target}"`
        : `Failed to print to "${target}" — check printer is online`,
    };
  }

  destroy() {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }
}

// Module singleton — shared across routes and index.ts
export const printerService = new PrinterService();
