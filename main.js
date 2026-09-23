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
    },
  });

  // The app is a single local page: never open new windows or navigate away from it.
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());

  window.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
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
