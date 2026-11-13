/**
 * StockSense desktop app (Windows / macOS / Linux) - Electron shell.
 *
 * Loads the single-file Firebase edition through a private, secure "app://" scheme so the
 * app has a stable origin: sign-in sessions and settings persist between launches.
 *
 * Automatic updates (no reinstall): on start-up and every few hours the app downloads the
 * latest web-app release from the update channel (updates/latest.json in the StockSense
 * GitHub repository), verifies its SHA-256 checksum and size, stores it in the user's
 * profile and uses it from then on. If anything is wrong it keeps the working version.
 */
const { app, BrowserWindow, Menu, dialog, net, protocol, session, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');

const APP_HOST = 'stocksense';
const APP_ORIGIN = `app://${APP_HOST}`;
const APP_DIR = path.join(__dirname, 'app');

// Update channel: the first URL that answers wins. "main" is used once the project is merged there.
const UPDATE_URLS = process.env.STOCKSENSE_UPDATE_URL
  ? [process.env.STOCKSENSE_UPDATE_URL]
  : [
      'https://raw.githubusercontent.com/xtraskill112-boop/NEXASSOFTWARE/main/updates/latest.json',
      'https://raw.githubusercontent.com/xtraskill112-boop/NEXASSOFTWARE/claude/stocksense-inventory-system-e47qsb/updates/latest.json',
    ];
const UPDATES_ENABLED = process.env.STOCKSENSE_DISABLE_UPDATES !== '1';
const FIRST_CHECK_DELAY_MS = Number(process.env.STOCKSENSE_UPDATE_DELAY_MS || 5000);
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const MAX_UPDATE_BYTES = 25 * 1024 * 1024;

// Optional, for networks that require a proxy: set STOCKSENSE_PROXY=http://host:port
if (process.env.STOCKSENSE_PROXY) app.commandLine.appendSwitch('proxy-server', process.env.STOCKSENSE_PROXY);

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

// One running copy only; a second launch focuses the existing window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let mainWindow = null;

/* --------------------------------------------------------------- updates */
const updateDir = () => path.join(app.getPath('userData'), 'app-update');
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function compareVersions(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1;
  }
  return 0;
}

function bundledVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(APP_DIR, 'version.json'), 'utf8')).version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/** Chooses the newest valid app: a verified downloaded update, else the bundled copy. */
function resolveActiveApp() {
  const bundled = { dir: APP_DIR, version: bundledVersion(), source: 'bundled' };
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(updateDir(), 'version.json'), 'utf8'));
    const html = fs.readFileSync(path.join(updateDir(), 'index.html'));
    const shellOk = !meta.minShellVersion || compareVersions(app.getVersion(), meta.minShellVersion) >= 0;
    if (sha256(html) === meta.sha256 && shellOk && compareVersions(meta.version, bundled.version) > 0) {
      return { dir: updateDir(), version: meta.version, source: 'update' };
    }
  } catch {
    /* no (valid) update downloaded */
  }
  return bundled;
}

let activeApp = null;
let checking = false;
let readyVersion = null;

function validManifest(m) {
  return (
    m &&
    typeof m.version === 'string' &&
    /^\d+\.\d+\.\d+$/.test(m.version) &&
    typeof m.sha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(m.sha256) &&
    typeof m.file === 'string' &&
    /^[A-Za-z0-9._-]+\.html$/.test(m.file) &&
    Number.isInteger(m.size) &&
    m.size > 0 &&
    m.size <= MAX_UPDATE_BYTES
  );
}

/**
 * Looks for a newer release on the update channel and installs it into the user profile.
 * Returns { status: 'up-to-date' | 'downloaded' | 'unavailable' | 'needs-installer', version? }.
 */
async function checkForUpdates() {
  if (checking) return { status: 'busy' };
  checking = true;
  try {
    for (const url of UPDATE_URLS) {
      let manifest;
      try {
        const res = await net.fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) continue;
        manifest = await res.json();
      } catch {
        continue;
      }
      if (!validManifest(manifest)) continue;
      const current = readyVersion && compareVersions(readyVersion, activeApp.version) > 0 ? readyVersion : activeApp.version;
      if (compareVersions(manifest.version, current) <= 0) return { status: 'up-to-date', version: current };
      if (manifest.minShellVersion && compareVersions(app.getVersion(), manifest.minShellVersion) < 0) {
        return { status: 'needs-installer', version: manifest.version };
      }
      const fileUrl = new URL(manifest.file, url).toString();
      const res = await net.fetch(`${fileUrl}?v=${manifest.version}`, { cache: 'no-store' });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length !== manifest.size || sha256(buf) !== manifest.sha256) continue; // corrupted or tampered download
      fs.mkdirSync(updateDir(), { recursive: true });
      const meta = { version: manifest.version, sha256: manifest.sha256, minShellVersion: manifest.minShellVersion || null, notes: manifest.notes || '', downloadedAt: new Date().toISOString() };
      fs.writeFileSync(path.join(updateDir(), 'index.html.tmp'), buf);
      fs.writeFileSync(path.join(updateDir(), 'version.json.tmp'), JSON.stringify(meta, null, 2));
      fs.renameSync(path.join(updateDir(), 'index.html.tmp'), path.join(updateDir(), 'index.html'));
      fs.renameSync(path.join(updateDir(), 'version.json.tmp'), path.join(updateDir(), 'version.json'));
      readyVersion = manifest.version;
      return { status: 'downloaded', version: manifest.version, notes: manifest.notes || '' };
    }
    return { status: 'unavailable' };
  } finally {
    checking = false;
  }
}

function applyUpdateNow() {
  activeApp = resolveActiveApp();
  mainWindow?.loadURL(`${APP_ORIGIN}/index.html`);
}

async function promptRestart(result) {
  if (!mainWindow) return;
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update ready',
    message: `StockSense ${result.version} is ready to use`,
    detail: `${result.notes ? `${result.notes}\n\n` : ''}Restart now to use the new version, or it will be used the next time you open StockSense.`,
    buttons: ['Restart now', 'Later'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0) applyUpdateNow();
}

async function backgroundCheck() {
  if (!UPDATES_ENABLED) return;
  try {
    const result = await checkForUpdates();
    if (result.status === 'downloaded') await promptRestart(result);
  } catch {
    /* never disturb the user because of an update problem */
  }
}

async function manualCheck() {
  if (!UPDATES_ENABLED) {
    await dialog.showMessageBox(mainWindow, { type: 'info', message: 'Automatic updates are turned off on this computer.' });
    return;
  }
  const result = await checkForUpdates().catch(() => ({ status: 'unavailable' }));
  if (result.status === 'downloaded') return promptRestart(result);
  const messages = {
    'up-to-date': `You have the latest version (${activeApp.version}).`,
    'needs-installer': `Version ${result.version} needs a new installer. Download the latest StockSense Setup to get it.`,
    unavailable: 'Could not reach the update server. Check your internet connection and try again.',
    busy: 'An update check is already running.',
  };
  await dialog.showMessageBox(mainWindow, { type: 'info', title: 'StockSense updates', message: messages[result.status] || messages.unavailable });
}

/* ----------------------------------------------------------- window state */
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');
function loadWindowState() {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    if (s && s.width >= 800 && s.height >= 600) return s;
  } catch {
    /* first launch */
  }
  return { width: 1360, height: 860, maximized: true };
}
function saveWindowState(win) {
  try {
    const maximized = win.isMaximized();
    const bounds = maximized ? win.getNormalBounds() : win.getBounds();
    fs.writeFileSync(stateFile(), JSON.stringify({ ...bounds, maximized }));
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ menu */
function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.webContents.reload() },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit', label: 'Exit' },
      ],
    },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'toggleDevTools', label: 'Developer Tools' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Check for updates…', click: () => manualCheck() },
        { type: 'separator' },
        {
          label: 'About StockSense',
          click: () =>
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About StockSense',
              message: `StockSense ${activeApp.version}`,
              detail: `Inventory Management System\nKaveri Distributors Pvt. Ltd.\nProject NX-2026-014\n\nApp version ${activeApp.version} (${activeApp.source === 'update' ? 'updated automatically' : 'installed'})\nDesktop version ${app.getVersion()}\n\nData is stored securely in Firebase. An internet connection is required.`,
            }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ---------------------------------------------------------------- window */
function createWindow() {
  const state = loadWindowState();
  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 960,
    minHeight: 640,
    title: 'StockSense',
    backgroundColor: '#0b0d11',
    icon: path.join(__dirname, 'build', 'icon.png'),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  if (state.maximized) mainWindow.maximize();
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('close', () => saveWindowState(mainWindow));
  mainWindow.on('closed', () => (mainWindow = null));

  // Links that leave the app (Firebase console, help pages) open in the default browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url) || url.startsWith('mailto:')) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(APP_ORIGIN)) {
      event.preventDefault();
      if (/^https?:\/\//.test(url)) shell.openExternal(url);
    }
  });

  mainWindow.loadURL(`${APP_ORIGIN}/index.html`);
}

/* -------------------------------------------------------------- app flow */
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  // Serve the bundled single-file app from app://stocksense/ (any route falls back to index.html).
  activeApp = resolveActiveApp();
  protocol.handle('app', (request) => {
    const { host, pathname } = new URL(request.url);
    if (host !== APP_HOST) return new Response('Not found', { status: 404 });
    const root = activeApp.dir;
    const requested = path.normalize(path.join(root, decodeURIComponent(pathname)));
    const file = requested.startsWith(root) && fs.existsSync(requested) && fs.statSync(requested).isFile() ? requested : path.join(root, 'index.html');
    return net.fetch(pathToFileURL(file).toString());
  });

  // Only clipboard access is granted (used by "Copy security rules"); everything else is denied.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'clipboard-sanitized-write' || permission === 'clipboard-read');
  });

  buildMenu();
  createWindow();

  if (UPDATES_ENABLED) {
    setTimeout(backgroundCheck, FIRST_CHECK_DELAY_MS);
    setInterval(backgroundCheck, CHECK_INTERVAL_MS);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
