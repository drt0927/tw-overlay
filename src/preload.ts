import { contextBridge, ipcRenderer } from 'electron';
import type { QuickSlotItem, AppConfig, GalleryPost, GalleryActivity, WatchedPost, UpdateStatusInfo, EtaRankingParams, EtaRankingResult, TradePost, TradeActivity } from './shared/types';

contextBridge.exposeInMainWorld('electronAPI', {
  // 창 제어
  toggleSidebar: () => ipcRenderer.send('toggle-sidebar'),
  toggleOverlay: () => ipcRenderer.send('toggle-overlay'),
  toggleClickThrough: () => ipcRenderer.send('toggle-click-through'),
  toggleSettings: (tabId?: string) => ipcRenderer.send('toggle-settings', tabId),
  toggleGallery: () => ipcRenderer.send('toggle-gallery'),
  toggleAbbreviation: () => ipcRenderer.send('toggle-abbreviation'),
  toggleBuffs: () => ipcRenderer.send('toggle-buffs'),
  toggleBossSettings: () => ipcRenderer.send('toggle-boss-settings'),
  toggleEtaRanking: () => ipcRenderer.send('toggle-eta-ranking'),
  toggleTrade: () => ipcRenderer.send('toggle-trade'),
  setIgnoreMouseEvents: (ignore: boolean, options: { forward?: boolean }) => ipcRenderer.send('set-ignore-mouse-events', ignore, options),
  closeApp: () => ipcRenderer.send('close-app'),

  // 내비게이션
  navigate: (url: string) => ipcRenderer.send('navigate', url),
  goHome: () => ipcRenderer.send('go-home'),
  openExternal: (url: string) => ipcRenderer.send('open-external', url),

  // 데이터 및 설정
  setOpacity: (opacity: number) => ipcRenderer.send('set-opacity', opacity),
  saveQuickSlots: (slots: QuickSlotItem[]) => ipcRenderer.send('save-quick-slots', slots),
  applySettings: (settings: Partial<AppConfig>) => ipcRenderer.send('apply-settings', settings),
  previewBossSound: (soundFile: string, volume: number | null = null) => ipcRenderer.send('preview-boss-sound', soundFile, volume),
  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  startUpdateDownload: () => ipcRenderer.send('start-update-download'),
  quitAndInstall: () => ipcRenderer.send('quit-and-install'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getOptimizationStatus: () => ipcRenderer.invoke('get-optimization-status'),
  setOptimization: (enable: boolean) => ipcRenderer.invoke('set-optimization', enable),
  sidebarReady: () => ipcRenderer.send('sidebar-ready'),

  // 갤러리 모니터
  galleryAddWatch: (postNo: number) => ipcRenderer.invoke('gallery-add-watch', postNo),
  galleryRemoveWatch: (postNo: number) => ipcRenderer.send('gallery-remove-watch', postNo),
  galleryGetWatched: () => ipcRenderer.invoke('gallery-get-watched'),
  galleryForceCheck: () => ipcRenderer.invoke('gallery-force-check'),
  galleryOpenPost: (postNo: number | string) => ipcRenderer.send('gallery-open-post', postNo),
  galleryGetNotify: () => ipcRenderer.invoke('gallery-get-notify'),
  gallerySetNotify: (enabled: boolean) => ipcRenderer.send('gallery-set-notify', enabled),

  // 에타 랭킹
  getEtaRanking: (params: EtaRankingParams) => ipcRenderer.invoke('get-eta-ranking', params),

  // 거래 게시판 모니터
  tradeForceCheck: () => ipcRenderer.invoke('trade-force-check'),
  tradeGetNotify: () => ipcRenderer.invoke('trade-get-notify'),
  tradeSetNotify: (enabled: boolean) => ipcRenderer.send('trade-set-notify', enabled),
  tradeOpenPost: (url: string) => ipcRenderer.send('trade-open-post', url),
  tradeSetServer: (serverId: string) => ipcRenderer.send('trade-set-server', serverId),
  tradeGetServer: () => ipcRenderer.invoke('trade-get-server'),
  tradeGetServers: () => ipcRenderer.invoke('trade-get-servers'),

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
  onConfigData: (callback: (config: AppConfig) => void) => {
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
  onGalleryPosts: (callback: (posts: GalleryPost[]) => void) => {
    ipcRenderer.removeAllListeners('gallery-posts');
    ipcRenderer.on('gallery-posts', (_event, posts) => callback(posts));
  },
  onGalleryNewActivity: (callback: (data: GalleryActivity) => void) => {
    ipcRenderer.removeAllListeners('gallery-new-activity');
    ipcRenderer.on('gallery-new-activity', (_event, data) => callback(data));
  },
  onGalleryWatchedUpdate: (callback: (watched: Record<string, WatchedPost>) => void) => {
    ipcRenderer.removeAllListeners('gallery-watched-update');
    ipcRenderer.on('gallery-watched-update', (_event, watched) => callback(watched));
  },
  onGalleryConnectionStatus: (callback: (isConnected: boolean) => void) => {
    ipcRenderer.removeAllListeners('gallery-connection-status');
    ipcRenderer.on('gallery-connection-status', (_event, isConnected) => callback(isConnected));
  },
  onUpdateStatus: (callback: (data: UpdateStatusInfo) => void) => {
    ipcRenderer.removeAllListeners('update-status');
    ipcRenderer.on('update-status', (_event, data) => callback(data));
  },
  onBossTimesData: (callback: (times: Record<string, string[]>) => void) => {
    ipcRenderer.removeAllListeners('boss-times-data');
    ipcRenderer.on('boss-times-data', (_event, times) => callback(times));
  },
  onPlayBossSound: (callback: (data: { bossName: string, soundFile: string }) => void) => {
    ipcRenderer.removeAllListeners('play-boss-sound');
    ipcRenderer.on('play-boss-sound', (_event, data) => callback(data));
  },
  onTradePosts: (callback: (posts: TradePost[]) => void) => {
    ipcRenderer.removeAllListeners('trade-posts');
    ipcRenderer.on('trade-posts', (_event, posts) => callback(posts));
  },
  onTradeNewActivity: (callback: (data: TradeActivity) => void) => {
    ipcRenderer.removeAllListeners('trade-new-activity');
    ipcRenderer.on('trade-new-activity', (_event, data) => callback(data));
  },
  onTradeConnectionStatus: (callback: (isConnected: boolean) => void) => {
    ipcRenderer.removeAllListeners('trade-connection-status');
    ipcRenderer.on('trade-connection-status', (_event, isConnected) => callback(isConnected));
  },
  onOpenSettingsTab: (callback: (tabId: string) => void) => {
    ipcRenderer.removeAllListeners('open-settings-tab');
    ipcRenderer.on('open-settings-tab', (_event, tabId) => callback(tabId));
  },
});
