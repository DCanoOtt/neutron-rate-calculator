// Desktop shell for the Neutron Reaction Rate Calculator: loads the self-contained index.html in a window.
const { app, BrowserWindow, Menu, shell, session } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1500, height: 960, minWidth: 900, minHeight: 600,
    title: 'Neutron Reaction Rate Calculator',
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: '#dfe9ee',
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false }
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  // links to other sites open in the system browser, never inside the app
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
}

app.whenReady().then(() => {
  // the page reads the cross-section folder through the File System Access API: allow it without a second prompt
  const ok = p => p === 'fileSystem' || p === 'clipboard-sanitized-write' || p === 'clipboard-read';
  session.defaultSession.setPermissionRequestHandler((wc, p, cb) => cb(ok(p)));
  session.defaultSession.setPermissionCheckHandler((wc, p) => ok(p));
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { role: 'fileMenu' }, { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { role: 'windowMenu' }
  ]));
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
