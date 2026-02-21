import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // 창 제어
  toggleSidebar: () => ipcRenderer.send('toggle-sidebar'),
  toggleOverlay: () => ipcRenderer.send('toggle-overlay'),
  toggleClickThrough: () => ipcRenderer.send('toggle-click-through'),
  toggleSettings: () => ipcRenderer.send('toggle-settings'),
  toggleGallery: () => ipcRenderer.send('toggle-gallery'),
  toggleAbbreviation: () => ipcRenderer.send('toggle-abbreviation'),
  toggleBuffs: () => ipcRenderer.send('toggle-buffs'),
  toggleBossSettings: () => ipcRenderer.send('toggle-boss-settings'),
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
  previewBossSound: (soundFile: string, volume: number | null = null) => ipcRenderer.send('preview-boss-sound', soundFile, volume),
  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  startUpdateDownload: () => ipcRenderer.send('start-update-download'),
  quitAndInstall: () => ipcRenderer.send('quit-and-install'),
  toggleScreenWatcher: (enabled: boolean) => ipcRenderer.send('screen-watcher-toggle', enabled),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getOptimizationStatus: () => ipcRenderer.invoke('get-optimization-status'),
  setOptimization: (enable: boolean) => ipcRenderer.invoke('set-optimization', enable),

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
  onMonitorZoneWindowStatus: (callback: (isOpen: boolean) => void) => {
    ipcRenderer.removeAllListeners('monitor-zone-window-status');
    ipcRenderer.on('monitor-zone-window-status', (_event, isOpen) => callback(isOpen));
  },
  onBossTimesData: (callback: (times: Record<string, string[]>) => void) => {
    ipcRenderer.removeAllListeners('boss-times-data');
    ipcRenderer.on('boss-times-data', (_event, times) => callback(times));
  },
  onPlayBossSound: (callback: (data: { bossName: string, soundFile: string }) => void) => {
    ipcRenderer.removeAllListeners('play-boss-sound');
    ipcRenderer.on('play-boss-sound', (_event, data) => callback(data));
  },

  // 장판 감시 (렌더러용)
  onWatcherToggle: (callback: (enabled: boolean) => void) => {
    ipcRenderer.removeAllListeners('watcher-toggle');
    ipcRenderer.on('watcher-toggle', (_event, enabled) => callback(enabled));
  },
  onWatcherSourceId: (callback: (data: { sourceId: string, threshold: number }) => void) => {
    ipcRenderer.removeAllListeners('watcher-source-id');
    ipcRenderer.on('watcher-source-id', (_event, data) => callback(data));
  },
  sendDangerDetected: (density: number) => ipcRenderer.send('renderer-danger-detected', { density }),
  sendDangerSafe: () => ipcRenderer.send('renderer-danger-safe'),
  saveDebugImage: (dataUrl: string, fileName: string) => ipcRenderer.send('save-debug-image', dataUrl, fileName),
  overlayReadyForWatcher: () => ipcRenderer.send('overlay-ready-for-watcher'),
});
