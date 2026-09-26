const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 920,
    minHeight: 680,
    backgroundColor: '#faf8f3',
    title: 'Recall Flashcards',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
    },
  });

  // The desktop shell only runs its packaged, local page. Links, redirects,
  // popups, permission prompts, and embedded webviews must not gain a renderer.
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('will-redirect', event => event.preventDefault());
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  window.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', event => event.preventDefault());
  });
  const { session } = require('electron');
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Keep the app's canvas clean while retaining standard shortcuts such as copy/paste.
Menu.setApplicationMenu(null);
