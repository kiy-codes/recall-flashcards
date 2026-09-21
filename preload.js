const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('recallDesktop', {
  platform: process.platform,
  isElectron: true,
});
