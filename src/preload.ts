import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // 창 제어
  toggleSidebar: () => ipcRenderer.send('toggle-sidebar'),
  toggleOverlay: () => ipcRenderer.send('toggle-overlay'),
  toggleSettings: () => ipcRenderer.send('toggle-settings'),
  toggleGallery: () => ipcRenderer.send('toggle-gallery'),
  setIgnoreMouseEvents: (ignore: boolean, options: any) => ipcRenderer.send('set-ignore-mouse-events', ignore, options),
  closeApp: () => ipcRenderer.send('close-app'),
  
  // 내비게이션
  navigate: (url: string) => ipcRenderer.send('navigate', url),
  goHome: () => ipcRenderer.send('go-home'),
  openExternal: (url: string) => ipcRenderer.send('open-external', url),
  
  // 데이터 및 설정
  setOpacity: (opacity: number) => ipcRenderer.send('set-opacity', opacity),
  saveQuickSlots: (slots: any[]) => ipcRenderer.send('save-quick-slots', slots),
  applySettings: (settings: any) => ipcRenderer.send('apply-settings', settings),
  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  startUpdateDownload: () => ipcRenderer.send('start-update-download'),
  quitAndInstall: () => ipcRenderer.send('quit-and-install'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // 갤러리 모니터
  galleryAddWatch: (postNo: number) => ipcRenderer.invoke('gallery-add-watch', postNo),
  galleryRemoveWatch: (postNo: number) => ipcRenderer.send('gallery-remove-watch', postNo),
  galleryGetWatched: () => ipcRenderer.invoke('gallery-get-watched'),
  galleryForceCheck: () => ipcRenderer.invoke('gallery-force-check'),
  galleryOpenPost: (postNo: number | string) => ipcRenderer.send('gallery-open-post', postNo),
  galleryGetNotify: () => ipcRenderer.invoke('gallery-get-notify'),
  gallerySetNotify: (enabled: boolean) => ipcRenderer.send('gallery-set-notify', enabled),

  // 이벤트 리스너
  onSidebarStatus: (callback: (isCollapsed: boolean) => void) => ipcRenderer.on('sidebar-status', (_event, isCollapsed) => callback(isCollapsed)),
  onOverlayStatus: (callback: (status: boolean) => void) => ipcRenderer.on('overlay-status', (_event, status) => callback(status)),
  onClickThroughStatus: (callback: (status: boolean) => void) => ipcRenderer.on('click-through-status', (_event, status) => callback(status)),
  onConfigData: (callback: (config: any) => void) => ipcRenderer.on('config-data', (_event, config) => callback(config)),
  onUrlChange: (callback: (url: string) => void) => ipcRenderer.on('url-change', (_event, url) => callback(url)),
  onLoadStatus: (callback: (isLoading: boolean) => void) => ipcRenderer.on('load-status', (_event, isLoading) => callback(isLoading)),
  onGalleryPosts: (callback: (posts: any[]) => void) => ipcRenderer.on('gallery-posts', (_event, posts) => callback(posts)),
  onGalleryNewActivity: (callback: (data: any) => void) => ipcRenderer.on('gallery-new-activity', (_event, data) => callback(data)),
  onGalleryWatchedUpdate: (callback: (watched: any) => void) => ipcRenderer.on('gallery-watched-update', (_event, watched) => callback(watched)),
  onGalleryConnectionStatus: (callback: (isConnected: boolean) => void) => ipcRenderer.on('gallery-connection-status', (_event, isConnected) => callback(isConnected)),
  onUpdateStatus: (callback: (data: any) => void) => ipcRenderer.on('update-status', (_event, data) => callback(data)),
});
