const { contextBridge, ipcRenderer } = require('electron');

// The overlay page (served by the hub) only gets these two calls.
contextBridge.exposeInMainWorld('overlay', {
  onVisible: fn => ipcRenderer.on('overlay:visible', (_e, visible) => fn(visible)),
  close: () => ipcRenderer.send('overlay:close-request')
});
