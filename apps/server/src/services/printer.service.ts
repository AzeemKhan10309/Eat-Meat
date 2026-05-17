import { exec } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Server as SocketIOServer } from 'socket.io';
import { logger } from '../utils/logger';

const PS_EXE =
  process.platform === 'win32'
    ? `${process.env.SystemRoot ?? 'C:\\Windows'}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
    : 'powershell';

const THERMAL_KEYWORDS = [
  'epson', 'xprinter', 'xp-', 'tysso', 'bixolon', 'star ',
  'citizen', 'sewoo', 'rongta', 'goojprt', 'gainscha',
  'thermal', 'receipt', 'tsp', 'tm-', 'rp-', 'srp-',
  'pos-', 'pos80', 'pos58', '80mm', '58mm', 'gp-', 'bt-',
];

interface ThermalPrinterInstance {
  alignCenter(): void; alignLeft(): void;
  bold(on: boolean): void; setTextSize(w: number, h: number): void; setTextNormal(): void;
  println(text: string): void; drawLine(): void; newLine(): void; cut(): void;
  tableCustom(cols: { text: string; align: string; width: number }[]): void;
  leftRight(left: string, right: string): void;
  execute(): Promise<void>;
}
interface ThermalPrinterCtor {
  new(opts: { type: unknown; interface: string; characterSet?: unknown;
              removeSpecialCharacters?: boolean; lineCharacter?: string; width?: number }
  ): ThermalPrinterInstance;
}

let ThermalPrinter: ThermalPrinterCtor | undefined;
let PrinterTypes: Record<string, unknown> | undefined;
let CharacterSet: Record<string, unknown> | undefined;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const m = require('node-thermal-printer') as {
    ThermalPrinter: ThermalPrinterCtor;
    PrinterTypes: Record<string, unknown>;
    CharacterSet: Record<string, unknown>;
  };
  ThermalPrinter = m.ThermalPrinter;
  PrinterTypes   = m.PrinterTypes;
  CharacterSet   = m.CharacterSet;
  logger.info('node-thermal-printer loaded (ESC/POS available)');
} catch {
  logger.warn('node-thermal-printer unavailable — text fallback only');
}

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

export class PrinterService {
  private currentPrinter: string | null = null;
  private isOnline = false;
  private printMethod: 'escpos' | 'text' | 'none' = 'none';
  private io: SocketIOServer | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  // Paper width = 48 chars for 80mm, 32 for 58mm
  // Keep at 48 — all layout math is based on this
  private readonly W = 48;

  // ESC/POS: feed 5 lines then full cut (GS V B 0 — more compatible than partial GS V A 0)
  private readonly CUT_BYTES = Buffer.from([
    0x1B, 0x64, 0x05,       // ESC d 5  — feed 5 lines
    0x1D, 0x56, 0x42, 0x00, // GS V B 0 — full cut
  ]);

  constructor() {
    setTimeout(() => this.startPolling(), 3000);
  }

  setIO(io: SocketIOServer) { this.io = io; }

  // ── Detection ─────────────────────────────────────────────────────────────

  private getWindowsPrinters(): Promise<string[]> {
    return new Promise(resolve => {
      const cmd = `"${PS_EXE}" -NonInteractive -Command "Get-Printer | Select-Object -ExpandProperty Name | ConvertTo-Json -Compress"`;
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
      const cmd = `"${PS_EXE}" -NonInteractive -Command "(Get-Printer -Name '${safe}' -ErrorAction SilentlyContinue).PrinterStatus"`;
      exec(cmd, { timeout: 5000 }, (err, stdout) => {
        if (err) { resolve(false); return; }
        resolve(['Normal', 'Idle', '3', '4', '0'].includes(stdout.trim()));
      });
    });
  }

  private async runDetection() {
    const found   = await this.detectBestPrinter();
    const hadName = this.currentPrinter;

    if (found && found !== hadName) {
      this.currentPrinter = found;
      this.isOnline        = await this.checkOnline(found);
      this.printMethod     = ThermalPrinter ? 'escpos' : 'text';
      logger.info(`Printer detected: "${found}" | online: ${this.isOnline} | method: ${this.printMethod}`);
      this.io?.emit('printer:connected', this.getStatus());
    } else if (!found && hadName) {
      logger.info(`Printer disconnected: "${hadName}"`);
      this.currentPrinter = null;
      this.isOnline        = false;
      this.printMethod     = 'none';
      this.io?.emit('printer:disconnected', { name: hadName });
    } else if (found) {
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

  async selectPrinter(name: string): Promise<PrinterStatus> {
    this.currentPrinter = name || null;
    this.isOnline        = name ? await this.checkOnline(name) : false;
    this.printMethod     = name ? (ThermalPrinter ? 'escpos' : 'text') : 'none';
    const status = this.getStatus();
    this.io?.emit(name ? 'printer:connected' : 'printer:disconnected', status);
    logger.info(`Printer manually selected: "${name || 'none'}"`);
    return status;
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

  // ── Layout helpers ────────────────────────────────────────────────────────

  /** Center a string within W chars */
  private center(text: string): string {
    // Truncate if longer than W to prevent wrap
    const t   = text.slice(0, this.W);
    const pad = Math.max(0, Math.floor((this.W - t.length) / 2));
    return ' '.repeat(pad) + t;
  }

  /** Left label + right value, truncating value if needed so total = W */
  private lr(left: string, right: string): string {
    const maxRight = this.W - left.length - 1;          // at least 1 space gap
    const r        = right.slice(0, Math.max(0, maxRight));
    const spaces   = this.W - left.length - r.length;
    return left + ' '.repeat(Math.max(1, spaces)) + r;
  }

  /** Divider line */
  private div(char = '-'): string { return char.repeat(this.W); }

  // ── Receipt text generation ───────────────────────────────────────────────

  generateReceiptText(data: ReceiptData): string {
    const c   = data.currencySymbol;
    const fmt = (n: number) => `${c}${n.toFixed(2)}`;
    const L: string[] = [];

    /*
     * Fixed column layout (total = 48):
     *   QTY  : 4  right-aligned  "  2x"
     *   GAP  : 1
     *   NAME : 32 left-aligned, truncated with ".." if overflow
     *   GAP  : 1
     *   AMT  : 10 right-aligned  "Rs1234.56"
     *
     *   4 + 1 + 32 + 1 + 10 = 48 ✓
     */
    const QW = 4, NW = 32, AW = 10;                     // QW+1+NW+1+AW = 48

    const itemLine = (qty: string, name: string, amt: string) =>
      qty.padStart(QW) + ' ' +
      name.padEnd(NW).slice(0, NW) + ' ' +
      amt.padStart(AW);

    // ── Header ──────────────────────────────────────────────────────────────
    L.push('');
    L.push(this.center('================================'));
    // Truncate restaurant name to W so it never wraps
    L.push(this.center(data.restaurantName.toUpperCase().slice(0, this.W)));
    L.push(this.center(data.restaurantAddress.slice(0, this.W)));
    if (data.restaurantPhone)
      L.push(this.center(`Tel: ${data.restaurantPhone}`.slice(0, this.W)));
    L.push(this.center('================================'));
    L.push('');

    // ── Order meta ──────────────────────────────────────────────────────────
    // Each field on its own line, label 10 chars, value right-flush
    // "Order #   : ORD-202" — total always ≤ 48
    const meta = (lbl: string, val: string) => {
      const label = lbl.padEnd(10);                      // "Order #   "
      const colon = ': ';
      const maxV  = this.W - label.length - colon.length;
      return label + colon + val.slice(0, maxV);
    };

    L.push(meta('Order #',  data.orderNumber));
    L.push(meta('Date',     data.date));
    L.push(meta('Cashier',  data.cashier));
    L.push(meta('Type',     data.orderType.replace(/_/g, ' ')));
    L.push(this.div());

    // ── Items header ────────────────────────────────────────────────────────
    L.push(itemLine('QTY', 'ITEM', 'AMOUNT'));
    L.push(this.div());

    // ── Items ────────────────────────────────────────────────────────────────
    for (const item of data.items) {
      const name = item.name.length > NW
        ? item.name.slice(0, NW - 2) + '..'
        : item.name;
      L.push(itemLine(`${item.quantity}x`, name, fmt(item.total)));
      if (item.quantity > 1)
        L.push(itemLine('', `  @ ${fmt(item.unitPrice)} each`, ''));
    }

    // ── Totals ───────────────────────────────────────────────────────────────
    L.push(this.div());
    L.push(this.lr('Subtotal',                 fmt(data.subtotal)));
    if (data.discount      > 0) L.push(this.lr('Discount',       `-${fmt(data.discount)}`));
    if (data.serviceCharge > 0) L.push(this.lr('Service Charge', fmt(data.serviceCharge)));
    if (data.tax           > 0) L.push(this.lr('Tax',            fmt(data.tax)));
    L.push(this.div('='));
    L.push(this.lr('** TOTAL **',              fmt(data.total)));
    L.push(this.div('='));

    // ── Payment ──────────────────────────────────────────────────────────────
    L.push(this.lr('Payment :', data.paymentMethod));
    if (data.cashReceived != null) {
      L.push(this.lr('Cash    :', fmt(data.cashReceived)));
      L.push(this.lr('Change  :', fmt(data.change ?? 0)));
    }
    L.push(this.div('='));

    // ── Footer ───────────────────────────────────────────────────────────────
    if (data.footer) {
      L.push('');
      data.footer.split('\n').forEach(fl => L.push(this.center(fl)));
    }
    L.push('', '', '');
    return L.join('\n');
  }

  // ── ESC/POS printing ──────────────────────────────────────────────────────

  private async printESCPOS(data: ReceiptData, printerName: string): Promise<boolean> {
    if (!ThermalPrinter) return false;
    try {
      const c   = data.currencySymbol;
      const fmt = (n: number) => `${c}${n.toFixed(2)}`;

      const p = new ThermalPrinter({
        type:                    PrinterTypes!.EPSON,
        interface:               `printer:${printerName}`,
        characterSet:            CharacterSet!.PC437_USA,
        removeSpecialCharacters: false,
        lineCharacter:           '-',
        width:                   this.W,
      });

      const sep = (ch: string) => p.println(ch.repeat(this.W));

      // ── Header ──
      p.alignCenter();
      p.println('');
      p.println('================================');
      p.bold(true); p.setTextSize(1, 1);
      p.println(data.restaurantName.toUpperCase().slice(0, this.W));
      p.bold(false); p.setTextNormal();
      p.println(data.restaurantAddress.slice(0, this.W));
      if (data.restaurantPhone)
        p.println(`Tel: ${data.restaurantPhone}`.slice(0, this.W));
      p.println('================================');
      p.println('');

      // ── Order meta — each on its own line, label padded ──
      p.alignLeft();
      const meta = (lbl: string, val: string) => {
        const label  = lbl.padEnd(10);
        const colon  = ': ';
        const maxV   = this.W - label.length - colon.length;
        p.println(label + colon + val.slice(0, maxV));
      };
      meta('Order #',  data.orderNumber);
      meta('Date',     data.date);
      meta('Cashier',  data.cashier);
      meta('Type',     data.orderType.replace(/_/g, ' '));
      p.drawLine();

      // ── Items header ──
      p.bold(true);
      p.tableCustom([
        { text: 'QTY',    align: 'RIGHT', width: 0.10 },
        { text: 'ITEM',   align: 'LEFT',  width: 0.68 },
        { text: 'AMOUNT', align: 'RIGHT', width: 0.22 },
      ]);
      p.bold(false);
      p.drawLine();

      // ── Items ──
      for (const item of data.items) {
        const name = item.name.length > 32
          ? item.name.slice(0, 30) + '..'
          : item.name;
        p.tableCustom([
          { text: `${item.quantity}x`, align: 'RIGHT', width: 0.10 },
          { text: name,                align: 'LEFT',  width: 0.68 },
          { text: fmt(item.total),     align: 'RIGHT', width: 0.22 },
        ]);
        if (item.quantity > 1)
          p.println(`       @ ${fmt(item.unitPrice)} each`);
      }

      // ── Totals ──
      p.drawLine();
      p.leftRight('Subtotal',     fmt(data.subtotal));
      if (data.discount      > 0) p.leftRight('Discount',       `-${fmt(data.discount)}`);
      if (data.serviceCharge > 0) p.leftRight('Service Charge', fmt(data.serviceCharge));
      if (data.tax           > 0) p.leftRight('Tax',            fmt(data.tax));
      sep('=');
      p.bold(true); p.setTextSize(1, 1);
      p.leftRight('** TOTAL **', fmt(data.total));
      p.bold(false); p.setTextNormal();
      sep('=');

      // ── Payment ──
      p.leftRight('Payment :', data.paymentMethod);
      if (data.cashReceived != null) {
        p.leftRight('Cash    :', fmt(data.cashReceived));
        p.leftRight('Change  :', fmt(data.change ?? 0));
      }
      sep('=');

      // ── Footer ──
      if (data.footer) {
        p.alignCenter();
        p.println('');
        data.footer.split('\n').forEach(fl => p.println(fl.slice(0, this.W)));
      }

      // 5 newlines to clear the cutter blade, then cut
      p.newLine(); p.newLine(); p.newLine(); p.newLine(); p.newLine();
      p.cut();
      await p.execute();
      return true;
    } catch (err) {
      logger.warn('ESC/POS failed, will fallback to text:', (err as Error).message);
      return false;
    }
  }

  // ── Text fallback ─────────────────────────────────────────────────────────

  private async printText(text: string, printerName: string): Promise<boolean> {
    const tempFile = join(tmpdir(), `receipt_${Date.now()}.bin`);
    try {
      const textBuf = Buffer.from(text.replace(/\r?\n/g, '\r\n'), 'latin1');
      const payload = Buffer.concat([textBuf, this.CUT_BYTES]);
      writeFileSync(tempFile, payload);

      await new Promise<void>((resolve, reject) => {
        const safePath    = tempFile.replace(/'/g, "''");
        const safePrinter = printerName.replace(/'/g, "''");
        const cmd =
          `"${PS_EXE}" -NonInteractive -Command ` +
          `"$bytes = [System.IO.File]::ReadAllBytes('${safePath}'); ` +
          `$pq = (New-Object System.Printing.PrintServer).GetPrintQueue('${safePrinter}'); ` +
          `$job = $pq.AddJob(); ` +
          `$stream = $job.JobStream; ` +
          `$stream.Write($bytes, 0, $bytes.Length); ` +
          `$stream.Close()"`;
        exec(cmd, { timeout: 15_000 }, err => err ? reject(err) : resolve());
      });
      return true;
    } catch (err) {
      logger.warn('Raw binary print failed, trying Out-Printer fallback:', (err as Error).message);
      try {
        await new Promise<void>((resolve, reject) => {
          const safePath    = tempFile.replace(/'/g, "''");
          const safePrinter = printerName.replace(/'/g, "''");
          const cmd = `"${PS_EXE}" -NonInteractive -Command "Get-Content -Path '${safePath}' -Encoding Default | Out-Printer -Name '${safePrinter}'"`;
          exec(cmd, { timeout: 15_000 }, err => err ? reject(err) : resolve());
        });
        logger.warn(`Printed via Out-Printer (no auto-cut) → "${printerName}"`);
        return true;
      } catch (err2) {
        logger.error('Text print failed:', (err2 as Error).message);
        return false;
      }
    } finally {
      try { unlinkSync(tempFile); } catch { /* ignore */ }
    }
  }

  // ── Queue management ─────────────────────────────────────────────────────

  /**
   * Remove all jobs from the Windows print queue for this printer.
   * Called after every successful print so the spooler cannot re-send the job
   * when the printer is power-cycled and reconnects.
   */
  private purgeQueue(printerName: string): Promise<void> {
    return new Promise(resolve => {
      const safe = printerName.replace(/'/g, "''");
      const cmd =
        `"${PS_EXE}" -NonInteractive -Command ` +
        `"Get-PrintJob -PrinterName '${safe}' -ErrorAction SilentlyContinue | Remove-PrintJob"`;
      exec(cmd, { timeout: 8000 }, err => {
        if (err) logger.warn(`Queue purge warning for "${printerName}":`, err.message);
        else     logger.info(`Print queue cleared for "${printerName}"`);
        resolve(); // always resolve — purge is best-effort
      });
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async printReceipt(data: ReceiptData): Promise<{ success: boolean; text: string }> {
    const text        = this.generateReceiptText(data);
    const printerName = this.currentPrinter ?? (process.env.PRINTER_NAME ?? '').trim();

    if (!printerName) {
      logger.info('No printer configured — skipping auto-print');
      return { success: true, text };
    }

    if (await this.printESCPOS(data, printerName)) {
      logger.info(`Receipt printed (ESC/POS) → "${printerName}"`);
      await this.purgeQueue(printerName);
      return { success: true, text };
    }

    if (await this.printText(text, printerName)) {
      logger.info(`Receipt printed (text) → "${printerName}"`);
      await this.purgeQueue(printerName);
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

export const printerService = new PrinterService();