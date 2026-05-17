const { app, BrowserWindow, ipcMain, dialog, shell, globalShortcut } = require('electron');
const path = require('path');
const fs   = require('fs');

// ── Early diagnostic — written before anything else ───────────────────────────
const DIAG = 'C:\\temp\\em_diag.txt';
try { fs.mkdirSync('C:\\temp', { recursive: true }); } catch(_) {}
function diag(msg) {
  try { fs.appendFileSync(DIAG, `[${new Date().toISOString()}] ${msg}\n`); } catch(_) {}
  console.log(msg);
}
diag('=== STARTUP ===');
diag(`node version: ${process.version}`);
diag(`isPackaged: ${app.isPackaged}`);
diag(`execPath: ${process.execPath}`);
diag(`resourcesPath: ${process.resourcesPath}`);
diag(`__dirname: ${__dirname}`);

// ── Single-instance lock ──────────────────────────────────────────────────────
diag('Before requestSingleInstanceLock');
const gotLock = app.requestSingleInstanceLock();
diag(`requestSingleInstanceLock returned: ${gotLock}`);
if (!gotLock) {
  diag('Another instance running — quitting');
  app.quit();
  process.exit(0);
}

// Detect production by bundle existence — more reliable than app.isPackaged
const _bundleCheck = path.join(process.resourcesPath, 'server', 'bundle.js');
const isDev = !fs.existsSync(_bundleCheck);
diag(`bundle exists: ${!isDev}  (checked: ${_bundleCheck})`);
diag(`isDev: ${isDev}`);

app.disableHardwareAcceleration();
diag('disableHardwareAcceleration done');

let mainWindow = null;

// ── Logging (lazy — app.getPath only valid after ready) ───────────────────────
let _logPath = null;
function getLogPath() {
  if (!_logPath) {
    const dir = path.join(app.getPath('userData'), 'logs');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    _logPath = path.join(dir, 'main.log');
  }
  return _logPath;
}
function log(msg) {
  try {
    fs.appendFileSync(getLogPath(), `[${new Date().toISOString()}] ${msg}\n`);
    diag(msg);
  } catch(_) { diag(`LOG FAILED: ${msg}`); }
}

// ── Server ────────────────────────────────────────────────────────────────────
function getServerDir() {
  return path.join(process.resourcesPath, 'server');
}

function waitForServerReady(timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      global.__onServerReady = null;
      reject(new Error('Server did not start within 60s'));
    }, timeoutMs);
    global.__onServerReady = () => {
      clearTimeout(timer);
      global.__onServerReady = null;
      resolve();
    };
  });
}

function loadDotEnv(envPath) {
  try {
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      if (key && process.env[key] === undefined) process.env[key] = val;
    }
    log(`Loaded .env from ${envPath}`);
  } catch (e) { log(`Could not load .env: ${e.message}`); }
}

function startServer() {
  if (isDev) return Promise.resolve();

  const serverDir  = getServerDir();
  const bundlePath = path.join(serverDir, 'bundle.js');
  const envPath    = path.join(serverDir, '.env');

  log(`Server dir:    ${serverDir}`);
  log(`Bundle exists: ${fs.existsSync(bundlePath)}`);

  if (!fs.existsSync(bundlePath)) {
    return Promise.reject(new Error(`Server bundle not found: ${bundlePath}`));
  }

  process.env.NODE_ENV = 'production';
  process.env.PORT     = '3001';

  const userDataDir = app.getPath('userData');
  process.env.LOG_DIR    = path.join(userDataDir, 'server-logs');
  process.env.UPLOAD_DIR = path.join(userDataDir, 'uploads');
  for (const dir of [process.env.LOG_DIR, process.env.UPLOAD_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  loadDotEnv(envPath);

  const readyPromise = waitForServerReady(60000);

  // Intercept process.exit so server error handlers can't kill Electron
  const _origExit = process.exit.bind(process);
  process.exit = (code) => {
    log(`Server called process.exit(${code}) — intercepted`);
    diag(`process.exit(${code}) intercepted`);
    global.__onServerReady = null;
    showError(`Server exited unexpectedly (code ${code}). Check if port 3001 is already in use.`);
  };

  log('Requiring server bundle in-process…');
  try {
    require(bundlePath);
  } catch (err) {
    process.exit = _origExit;
    return Promise.reject(new Error(`Server failed to load: ${err.message}`));
  }

  process.exit = _origExit;
  log('Bundle loaded — waiting for server ready signal…');
  return readyPromise;
}

// ── Window ────────────────────────────────────────────────────────────────────
const SPLASH = `data:text/html;charset=utf-8,<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0d1117;display:flex;flex-direction:column;align-items:center;
     justify-content:center;height:100vh;font-family:-apple-system,sans-serif;color:#e2e8f0}
.logo{font-size:28px;font-weight:700;margin-bottom:6px}.sub{font-size:13px;color:#94a3b8;
letter-spacing:2px;text-transform:uppercase;margin-bottom:40px}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#f97316;
animation:b 1.2s ease-in-out infinite}.dot:nth-child(2){animation-delay:.2s;background:#fb923c}
.dot:nth-child(3){animation-delay:.4s;background:#fdba74}.dots{display:flex;gap:8px}
.status{margin-top:20px;font-size:12px;color:#475569}
@keyframes b{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-12px)}}
</style></head><body><div class="logo">Eat &amp; Meet</div>
<div class="sub">POS System</div>
<div class="dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
<div class="status">Starting…</div></body></html>`;

function createWindow() {
  diag('createWindow called');
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1200, minHeight: 700,
    frame: false, titleBarStyle: 'hidden', backgroundColor: '#0d1117',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  });
  mainWindow.loadURL(SPLASH);
  mainWindow.once('ready-to-show', () => { diag('ready-to-show'); mainWindow.show(); });
  mainWindow.on('closed', () => { diag('window closed'); mainWindow = null; });
}

function loadApp() {
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    const appPath = path.join(__dirname, '../dist/index.html');
    log(`Loading app: ${appPath}`);
    mainWindow.loadFile(appPath);
  }
}

function showError(message) {
  log(`Error: ${message}`);
  if (!mainWindow) return;
  mainWindow.loadURL(`data:text/html;charset=utf-8,<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0d1117;display:flex;flex-direction:column;align-items:center;
     justify-content:center;height:100vh;font-family:-apple-system,sans-serif;
     color:#e2e8f0;padding:40px}
h2{font-size:20px;color:#ef4444;margin-bottom:12px}
p{font-size:13px;color:#94a3b8;text-align:center;line-height:1.6;max-width:480px}
.code{background:#1e293b;border:1px solid #334155;border-radius:6px;padding:12px 16px;
      margin-top:12px;font-family:monospace;font-size:11px;color:#fbbf24;max-width:540px;
      word-break:break-all;white-space:pre-wrap;text-align:left}
button{margin-top:20px;padding:10px 28px;background:#f97316;color:white;border:none;
       border-radius:8px;cursor:pointer;font-size:13px;font-weight:600}
</style></head><body>
<h2>&#x26A0; Server failed to start</h2>
<p>Make sure <strong>PostgreSQL is running</strong> and port 3001 is not in use, then restart the app.</p>
<div class="code">${message.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</div>
<button onclick="location.reload()">Retry</button>
</body></html>`);
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
diag('Registering app events…');

app.on('second-instance', () => {
  if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
});

app.whenReady().then(async () => {
  diag('whenReady fired');
  log(`Starting — packaged=${app.isPackaged}  v${app.getVersion()}`);

  createWindow();
  globalShortcut.register('F12', () => mainWindow?.webContents.toggleDevTools());

  try {
    await startServer();
    log('Server ready — loading app');
    loadApp();
  } catch (err) {
    diag(`startServer error: ${err.message}`);
    showError(err.message);
  }
}).catch(err => {
  diag(`whenReady promise rejected: ${err.message}`);
});

diag('Module load complete — waiting for ready event');

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('will-quit', () => { diag('will-quit'); globalShortcut.unregisterAll(); });

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => { if (mainWindow?.isMaximized()) mainWindow.restore(); else mainWindow?.maximize(); });
ipcMain.on('window:close',    () => mainWindow?.close());

ipcMain.handle('dialog:open',  async (_, o) => dialog.showOpenDialog(mainWindow,  o));
ipcMain.handle('dialog:save',  async (_, o) => dialog.showSaveDialog(mainWindow,  o));
ipcMain.handle('app:version',  () => app.getVersion());
ipcMain.handle('app:platform', () => process.platform);

ipcMain.handle('print:receipt', async (_, data) => {
  try {
    const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false } });
    await win.loadURL(`data:text/html,<pre style="font-family:monospace;font-size:12px;white-space:pre">${data}</pre>`);
    win.webContents.print({ silent: true, printBackground: true });
    win.close();
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
});
