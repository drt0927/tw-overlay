const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  setOpacity: (opacity) => ipcRenderer.send('set-opacity', opacity),
  navigate: (url) => ipcRenderer.send('navigate', url),
  goHome: () => ipcRenderer.send('go-home'),
  closeApp: () => ipcRenderer.send('close-app'),
  applySettings: (settings) => ipcRenderer.send('apply-settings', settings),
  toggleSettings: (isOpen) => ipcRenderer.send('toggle-settings', isOpen),
  toggleMenu: (isOpen) => ipcRenderer.send('toggle-menu', isOpen), // 추가
  onClickThroughStatus: (callback) => ipcRenderer.on('click-through-status', (event, status) => callback(status)),
  onLoadStatus: (callback) => ipcRenderer.on('load-status', (event, isLoading) => callback(isLoading)),
  onUrlChange: (callback) => ipcRenderer.on('url-change', (event, url) => callback(url)),
  onConfigData: (callback) => ipcRenderer.on('config-data', (event, config) => callback(config)),
});
