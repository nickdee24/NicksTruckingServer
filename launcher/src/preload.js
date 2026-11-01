const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcher', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: next => ipcRenderer.invoke('settings:set', next),
  findGame: () => ipcRenderer.invoke('game:find'),
  play: serverId => ipcRenderer.invoke('play', serverId),
  copy: text => ipcRenderer.invoke('clipboard:write', text),
  openExternal: url => ipcRenderer.invoke('open:external', url),
  toggleOverlay: () => ipcRenderer.invoke('overlay:toggle'),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  close: () => ipcRenderer.invoke('window:close'),
  onProgress: fn => ipcRenderer.on('play:progress', (_e, msg) => fn(msg)),
  onGameExited: fn => ipcRenderer.on('game:exited', () => fn())
});
