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
      // Get-Printer requires PrintManagement (absent on Windows Home/IoT).
      // Win32_Printer WMI works on all editions — use as fallback.
      const psBody =
        `try{Get-Printer -ErrorAction Stop|Select-Object -ExpandProperty Name|ConvertTo-Json -Compress}` +
        `catch{Get-WmiObject Win32_Printer|Select-Object -ExpandProperty Name|ConvertTo-Json -Compress}`;
      const cmd = `"${PS_EXE}" -NonInteractive -Command "${psBody}"`;
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
      // Get-Printer absent on Windows Home — WMI PrinterStatus works everywhere.
      // Get-Printer returns strings ("Normal","Idle"); WMI returns integers (3=Idle, 4=Printing).
      const psBody =
        `try{(Get-Printer -Name '${safe}' -ErrorAction Stop).PrinterStatus}` +
        `catch{$p=Get-WmiObject Win32_Printer|Where-Object{$_.Name -eq '${safe}'}|Select-Object -First 1;if($p){$p.PrinterStatus}}`;
      const cmd = `"${PS_EXE}" -NonInteractive -Command "${psBody}"`;
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
      this.printMethod     = 'text';
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
    this.printMethod     = name ? 'text' : 'none';
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

  private async printESCPOS(_data: ReceiptData, _printerName: string): Promise<boolean> {
    // The printer: interface requires the native `printer` npm package as `driver`.
    // It is not bundled — skip this path entirely; printReceipt falls to the winspool path.
    return false;
  }

  // ── Text fallback — raw bytes via winspool.drv P/Invoke (RAW data type) ───

  private async printText(text: string, printerName: string): Promise<boolean> {
    const ts      = Date.now();
    const tempBin = join(tmpdir(), `rcpt_${ts}.bin`);
    const tempPs  = join(tmpdir(), `rprint_${ts}.ps1`);
    try {
      const init    = Buffer.from([0x1B, 0x40]); // ESC @ — reset printer state
      const textBuf = Buffer.from(text.replace(/\r?\n/g, '\r\n'), 'latin1');
      writeFileSync(tempBin, Buffer.concat([init, textBuf, this.CUT_BYTES]));

      const psBin     = tempBin.replace(/'/g, "''");
      const psPrinter = printerName.replace(/'/g, "''");

      // Build PS1 as array so the closing '@ sits at column 0 (PowerShell requirement)
      const ps1Lines = [
        `Add-Type -TypeDefinition @'`,
        `using System;`,
        `using System.Runtime.InteropServices;`,
        `public class WinSpool {`,
        `    [DllImport("winspool.drv",CharSet=CharSet.Ansi,SetLastError=true)]`,
        `    public static extern bool OpenPrinter(string n,out IntPtr h,IntPtr d);`,
        `    [DllImport("winspool.drv",SetLastError=true)]`,
        `    public static extern bool ClosePrinter(IntPtr h);`,
        `    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Ansi)]`,
        `    public class DI{public string pDocName="Receipt";public string pOutputFile=null;public string pDataType="RAW";}`,
        `    [DllImport("winspool.drv",CharSet=CharSet.Ansi,SetLastError=true)]`,
        `    public static extern int StartDocPrinter(IntPtr h,int lv,[In,MarshalAs(UnmanagedType.LPStruct)]DI di);`,
        `    [DllImport("winspool.drv",SetLastError=true)]`,
        `    public static extern bool EndDocPrinter(IntPtr h);`,
        `    [DllImport("winspool.drv",SetLastError=true)]`,
        `    public static extern bool StartPagePrinter(IntPtr h);`,
        `    [DllImport("winspool.drv",SetLastError=true)]`,
        `    public static extern bool EndPagePrinter(IntPtr h);`,
        `    [DllImport("winspool.drv",SetLastError=true)]`,
        `    public static extern bool WritePrinter(IntPtr h,IntPtr b,int c,out int w);`,
        `}`,
        `'@ -ErrorAction SilentlyContinue`,
        `$h=[IntPtr]::Zero`,
        `[WinSpool]::OpenPrinter('${psPrinter}',[ref]$h,[IntPtr]::Zero)|Out-Null`,
        `if($h-eq[IntPtr]::Zero){throw 'OpenPrinter failed for printer: ${psPrinter}'}`,
        `try{`,
        `  $di=New-Object WinSpool+DI`,
        `  if([WinSpool]::StartDocPrinter($h,1,$di)-le 0){throw 'StartDocPrinter failed'}`,
        `  try{`,
        `    [WinSpool]::StartPagePrinter($h)|Out-Null`,
        `    $b=[System.IO.File]::ReadAllBytes('${psBin}')`,
        `    $p=[Runtime.InteropServices.Marshal]::AllocHGlobal($b.Length)`,
        `    [Runtime.InteropServices.Marshal]::Copy($b,0,$p,$b.Length)`,
        `    $w=0;[WinSpool]::WritePrinter($h,$p,$b.Length,[ref]$w)|Out-Null`,
        `    [Runtime.InteropServices.Marshal]::FreeHGlobal($p)`,
        `    [WinSpool]::EndPagePrinter($h)|Out-Null`,
        `  }finally{[WinSpool]::EndDocPrinter($h)|Out-Null}`,
        `}finally{[WinSpool]::ClosePrinter($h)|Out-Null}`,
        `Write-Output 'PRINTED_OK'`,
      ];
      writeFileSync(tempPs, ps1Lines.join('\n'), 'utf8');

      const ok = await new Promise<boolean>(resolve => {
        const cmd = `"${PS_EXE}" -NonInteractive -ExecutionPolicy Bypass -File "${tempPs}"`;
        exec(cmd, { timeout: 20_000 }, (_err, stdout, stderr) => {
          if (stdout.includes('PRINTED_OK')) { resolve(true); return; }
          logger.warn('winspool script stderr:', stderr?.trim() || _err?.message || 'no output');
          resolve(false);
        });
      });

      if (!ok) throw new Error('winspool script did not output PRINTED_OK');
      return true;
    } catch (err) {
      logger.error('Raw winspool print failed:', (err as Error).message);
      return false;
    } finally {
      try { unlinkSync(tempBin); } catch { /* ignore */ }
      try { unlinkSync(tempPs);  } catch { /* ignore */ }
    }
  }

  // ── Queue management ─────────────────────────────────────────────────────

  /**
   * Remove all jobs from the Windows print queue for this printer.
   * Uses both PrintManagement cmdlets and WMI Win32_PrintJob for maximum compatibility.
   * Called before AND after every print to prevent the spooler from re-sending on reconnect.
   */
  private purgeQueue(printerName: string): Promise<void> {
    return new Promise(resolve => {
      const safe = printerName.replace(/'/g, "''");
      // WMI Win32_PrintJob works on all Windows editions (Win32_PrintJob.Name = "printer,jobid").
      // Get-PrintJob/Remove-PrintJob need PrintManagement — try as secondary, swallow errors.
      const cmd =
        `"${PS_EXE}" -NonInteractive -Command ` +
        `"Get-WmiObject Win32_PrintJob -ErrorAction SilentlyContinue | ` +
        `Where-Object { $_.Name -like '${safe},*' } | ` +
        `ForEach-Object { $_.Delete() }; ` +
        `try { Get-PrintJob -PrinterName '${safe}' -ErrorAction SilentlyContinue | Remove-PrintJob -ErrorAction SilentlyContinue } catch {}"`;
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

    // Purge stale jobs BEFORE printing so an old stuck job can't reprint
    await this.purgeQueue(printerName);

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