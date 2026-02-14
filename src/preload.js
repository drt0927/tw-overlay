const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  setIgnoreMouseEvents: (ignore, options) => ipcRenderer.send('set-ignore-mouse-events', ignore, options),
  setOpacity: (opacity) => ipcRenderer.send('set-opacity', opacity),
  navigate: (url) => ipcRenderer.send('navigate', url),
  goHome: () => ipcRenderer.send('go-home'),
  closeApp: () => ipcRenderer.send('close-app'),
  applySettings: (settings) => ipcRenderer.send('apply-settings', settings),
  toggleSettings: (isOpen) => ipcRenderer.send('toggle-settings', isOpen),
  toggleMenu: (isOpen) => ipcRenderer.send('toggle-menu', isOpen),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  toggleSidebar: () => ipcRenderer.send('toggle-sidebar'),
  saveQuickSlots: (slots) => ipcRenderer.send('save-quick-slots', slots),
  sidebarSettingsMode: (isOpen) => ipcRenderer.send('sidebar-settings-mode', isOpen),

  // 갤러리 모니터
  galleryAddWatch: (postNo) => ipcRenderer.invoke('gallery-add-watch', postNo),
  galleryRemoveWatch: (postNo) => ipcRenderer.send('gallery-remove-watch', postNo),
  galleryGetWatched: () => ipcRenderer.invoke('gallery-get-watched'),
  galleryForceCheck: () => ipcRenderer.invoke('gallery-force-check'),
  galleryOpenPost: (postNo) => ipcRenderer.send('gallery-open-post', postNo),
  galleryGetNotify: () => ipcRenderer.invoke('gallery-get-notify'),
  gallerySetNotify: (enabled) => ipcRenderer.send('gallery-set-notify', enabled),
  onGalleryPosts: (callback) => ipcRenderer.on('gallery-posts', (event, posts) => callback(posts)),
  onGalleryNewActivity: (callback) => ipcRenderer.on('gallery-new-activity', (event, data) => callback(data)),

  onClickThroughStatus: (callback) => ipcRenderer.on('click-through-status', (event, status) => callback(status)),
  onSidebarStatus: (callback) => ipcRenderer.on('sidebar-status', (event, isCollapsed) => callback(isCollapsed)),
  onLoadStatus: (callback) => ipcRenderer.on('load-status', (event, isLoading) => callback(isLoading)),
  onUrlChange: (callback) => ipcRenderer.on('url-change', (event, url) => callback(url)),
  onConfigData: (callback) => ipcRenderer.on('config-data', (event, config) => callback(config)),
});
