import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // 창 제어
  toggleSidebar: () => ipcRenderer.send('toggle-sidebar'),
  toggleOverlay: () => ipcRenderer.send('toggle-overlay'),
  toggleSettings: () => ipcRenderer.send('toggle-settings'),
  toggleGallery: () => ipcRenderer.send('toggle-gallery'),
  toggleMonitorZone: () => ipcRenderer.send('toggle-monitor-zone'),
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
  toggleScreenWatcher: (enabled: boolean) => ipcRenderer.send('screen-watcher-toggle', enabled),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // 갤러리 모니터
  galleryAddWatch: (postNo: number) => ipcRenderer.invoke('gallery-add-watch', postNo),
  galleryRemoveWatch: (postNo: number) => ipcRenderer.send('gallery-remove-watch', postNo),
  galleryGetWatched: () => ipcRenderer.invoke('gallery-get-watched'),
  galleryForceCheck: () => ipcRenderer.invoke('gallery-force-check'),
  galleryOpenPost: (postNo: number | string) => ipcRenderer.send('gallery-open-post', postNo),
  galleryGetNotify: () => ipcRenderer.invoke('gallery-get-notify'),
  gallerySetNotify: (enabled: boolean) => ipcRenderer.send('gallery-set-notify', enabled),

  // 이벤트 리스너 (중복 등록 방지를 위해 기존 리스너 제거 후 재등록)
  onSidebarStatus: (callback: (isCollapsed: boolean) => void) => {
    ipcRenderer.removeAllListeners('sidebar-status');
    ipcRenderer.on('sidebar-status', (_event, isCollapsed) => callback(isCollapsed));
  },
  onOverlayStatus: (callback: (status: boolean) => void) => {
    ipcRenderer.removeAllListeners('overlay-status');
    ipcRenderer.on('overlay-status', (_event, status) => callback(status));
  },
  onClickThroughStatus: (callback: (status: boolean) => void) => {
    ipcRenderer.removeAllListeners('click-through-status');
    ipcRenderer.on('click-through-status', (_event, status) => callback(status));
  },
  onConfigData: (callback: (config: any) => void) => {
    ipcRenderer.removeAllListeners('config-data');
    ipcRenderer.on('config-data', (_event, config) => callback(config));
  },
  onUrlChange: (callback: (url: string) => void) => {
    ipcRenderer.removeAllListeners('url-change');
    ipcRenderer.on('url-change', (_event, url) => callback(url));
  },
  onLoadStatus: (callback: (isLoading: boolean) => void) => {
    ipcRenderer.removeAllListeners('load-status');
    ipcRenderer.on('load-status', (_event, isLoading) => callback(isLoading));
  },
  onGalleryPosts: (callback: (posts: any[]) => void) => {
    ipcRenderer.removeAllListeners('gallery-posts');
    ipcRenderer.on('gallery-posts', (_event, posts) => callback(posts));
  },
  onGalleryNewActivity: (callback: (data: any) => void) => {
    ipcRenderer.removeAllListeners('gallery-new-activity');
    ipcRenderer.on('gallery-new-activity', (_event, data) => callback(data));
  },
  onGalleryWatchedUpdate: (callback: (watched: any) => void) => {
    ipcRenderer.removeAllListeners('gallery-watched-update');
    ipcRenderer.on('gallery-watched-update', (_event, watched) => callback(watched));
  },
  onGalleryConnectionStatus: (callback: (isConnected: boolean) => void) => {
    ipcRenderer.removeAllListeners('gallery-connection-status');
    ipcRenderer.on('gallery-connection-status', (_event, isConnected) => callback(isConnected));
  },
  onUpdateStatus: (callback: (data: any) => void) => {
    ipcRenderer.removeAllListeners('update-status');
    ipcRenderer.on('update-status', (_event, data) => callback(data));
  },
  onDangerAlert: (callback: (density: number) => void) => {
    ipcRenderer.removeAllListeners('danger-alert');
    ipcRenderer.on('danger-alert', (_event, density) => callback(density));
  },
  onDangerCleared: (callback: () => void) => {
    ipcRenderer.removeAllListeners('danger-cleared');
    ipcRenderer.on('danger-cleared', (_event) => callback());
  },
  onClickThroughMode: (callback: (status: boolean) => void) => {
    ipcRenderer.removeAllListeners('click-through-mode');
    ipcRenderer.on('click-through-mode', (_event, status) => callback(status));
  },
  onScreenWatcherStatus: (callback: (isWatching: boolean) => void) => {
    ipcRenderer.removeAllListeners('screen-watcher-status');
    ipcRenderer.on('screen-watcher-status', (_event, isWatching) => callback(isWatching));
  },
});
