/**
 * StockSense desktop app (Windows / macOS / Linux) - Electron shell.
 *
 * Loads the single-file Firebase edition (app/index.html) through a private, secure
 * "app://" scheme so the app has a stable origin: sign-in sessions and settings persist
 * between launches. All data goes to the Firebase project configured in that file.
 */
const { app, BrowserWindow, Menu, dialog, net, protocol, session, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const APP_HOST = 'stocksense';
const APP_ORIGIN = `app://${APP_HOST}`;
const APP_DIR = path.join(__dirname, 'app');

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
        {
          label: 'About StockSense',
          click: () =>
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About StockSense',
              message: `StockSense ${app.getVersion()}`,
              detail: 'Inventory Management System\nKaveri Distributors Pvt. Ltd.\nProject NX-2026-014\n\nData is stored securely in Firebase. An internet connection is required.',
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
  protocol.handle('app', (request) => {
    const { host, pathname } = new URL(request.url);
    if (host !== APP_HOST) return new Response('Not found', { status: 404 });
    const requested = path.normalize(path.join(APP_DIR, decodeURIComponent(pathname)));
    const file = requested.startsWith(APP_DIR) && fs.existsSync(requested) && fs.statSync(requested).isFile() ? requested : path.join(APP_DIR, 'index.html');
    return net.fetch(pathToFileURL(file).toString());
  });

  // Only clipboard access is granted (used by "Copy security rules"); everything else is denied.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'clipboard-sanitized-write' || permission === 'clipboard-read');
  });

  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
