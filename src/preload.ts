import { contextBridge, ipcRenderer } from 'electron';
import type { QuickSlotItem, AppConfig, GalleryPost, GalleryActivity, WatchedPost, UpdateStatusInfo, EtaRankingParams, TradePost, TradeActivity, ScamAnalysisResult, ModelStatus, GpuDetectionResult, ServerStatus, SessionState } from './shared/types';

const DEFAULT_CONFIG: AppConfig = {
  width: 800, height: 600, opacity: 1.0,
  url: 'https://www.youtube.com',
  homeUrl: 'https://www.youtube.com',
  overlayVisible: false,
  galleryNotify: false,
  diaryKeepDays: 180,
  quickSlots: [
    {
      label: "테일즈 가이드 요약",
      icon: "BookOpenCheck",
      url: "https://gall.dcinside.com/mini/board/view/?id=talesweaver&no=209726",
      external: true,
      iconType: "icon"
    }
  ],
  autoUpdateEnabled: true,
  fieldBossNotifyEnabled: true,
  fieldBossNotifyOffsets: [5],
  fieldBossNotifyVolume: 30,
  fieldBossSettings: {
    '골론': { name: '골론', enabled: true, soundFile: 'orb.mp3' },
    '파멸의 기원': { name: '파멸의 기원', enabled: true, soundFile: 'orb.mp3' },
    '스페르첸드': { name: '스페르첸드', enabled: true, soundFile: 'orb.mp3' },
    '골모답': { name: '골모답', enabled: true, soundFile: 'orb.mp3' },
    '아칸': { name: '아칸', enabled: true, soundFile: 'orb.mp3' },
    '혼란한 대지': { name: '혼란한 대지', enabled: true, soundFile: 'orb.mp3' },
  },
  positions: {
    overlay: { offsetX: 10, offsetY: 10 },
    settings: { offsetX: -1010, offsetY: 40 },
    gallery: { offsetX: -320, offsetY: 40 },
    abbreviation: { offsetX: -320, offsetY: 40 },
    buffs: { offsetX: -1000, offsetY: 40 },
    bossSettings: { offsetX: -320, offsetY: 40 },
    etaRanking: { offsetX: -380, offsetY: 40 },
    trade: { offsetX: -380, offsetY: 40 },
    coefficientCalculator: { offsetX: -850, offsetY: 40 },
    contentsChecker: { offsetX: -320, offsetY: 40 },
    chatOverlay: { offsetX: -460, offsetY: 450 },
    chatOverlaySub: { offsetX: -460, offsetY: 240 },
    chatOverlaySub2: { offsetX: -460, offsetY: 40 }
  },
  tradeServer: 'RyXp',
  tradeKeywords: [],
  tradeNotify: true,
  gameExitReminderEnabled: false,
  gameExitReminderMessage: '',
  contentsCheckerItems: [],
  lastContentsResetCheck: 0,
  shortcuts: {
    toggleClickThrough: 'CommandOrControl+Shift+T',
    toggleContentsChecker: 'CommandOrControl+Shift+C',
    toggleBuffHud: 'CommandOrControl+Shift+B',
    toggleDock: 'CommandOrControl+Shift+D',
    toggleChatOverlaySync: 'CommandOrControl+Shift+H',
    resetXpSession: 'CommandOrControl+Shift+X',
    toggleXpSession: 'CommandOrControl+Shift+Z',
    clearAllBuffs: 'CommandOrControl+Shift+E'
  },
  volumeContentsChecker: 30,
  volumeCalculators: 30,
  sidebarPosition: 'right',
  chatLogPath: '',
  lootKeywords: [],
  shoutKeywords: [],
  wordAlarmEnabled: true,
  wordAlarmKeywords: [],
  wordAlarmSound: 'orb.mp3',
  wordAlarmVolume: 40,
  wordAlarmHistoryEnabled: true,
  showXpWidget: true,
  xpAutoStart: true,
  ignoreNegativeXp: true,
  xpWidgetPos: { left: 200, bottom: 0 },
  buffTimerEnabled: true,
  showBuffHud: true,
  buffTimerWarnSeconds: [60, 10],
  buffTimerVisualAlert: true,
  buffTimerAudioAlert: true,
  buffTimerVolume: 40,
  buffTimerBuffs: {
    'exp_heart': true,
    'rare_heart': true,
    'stat_exorcist': true,
    'stat_sami_sunryeong': true,
    'rare_loto': true,
    'util_ampoule': true,
    'dmg_izabel': true,
    'util_illumination': true,
    'insight_elixir_large': true,
    'insight_elixir_special': true,
    'exp_eos_supreme': true,
    'exp_sweetpotato_legend': true,
    'exp_earlybird': true,
  },
  buffTimerCenterAlert: true,
  buffTimerHudPos: { left: 350, bottom: 0 },
  essenceAlertEnabled: true,
  essenceAlertSound: 'orb.mp3',
  essenceAlertVolume: 40,
  abandonedAutoHideMinutes: 10,
  abandonedEnabled: true,
  abandonedWidgetPos: { left: 200, bottom: 63 },
  abyssApostleAlertEnabled: false,
  ethosAlertEnabled: false,
  lokagosAlertEnabled: false,
  waveMonsterWarningEnabled: true,
  waveMonsterWarningSound: 'orb.mp3',
  waveMonsterWarningVolume: 40,
  discordWebhookUrl: '',
  discordAlertEnabled: false,
  discordKeywords: [],
  discordRules: [],
  chatOverlayEnabled: false,
  chatOverlaySubEnabled: false,
  chatOverlaySub2Enabled: false,
  chatOverlayOpacity: 0.8,
  chatOverlaySubOpacity: 0.8,
  chatOverlaySub2Opacity: 0.8,
  chatOverlayFontSize: 14,
  chatOverlayClickThrough: true,
  chatOverlayKeywords: [],
  userServer: 7,
  etaDataUrl: '',
  chatOverlayWidth: 450,
  chatOverlayHeight: 400,
  chatOverlaySelectedChannels: ['general', 'whisper', 'team', 'club', 'shout', 'system'],
  chatOverlaySubWidth: 450,
  chatOverlaySubHeight: 400,
  chatOverlayTab: 'Basic',
  chatOverlaySubTab: 'Basic',
  chatOverlaySub2Width: 450,
  chatOverlaySub2Height: 400,
  chatOverlaySub2Tab: 'Basic',
  chatOverlayShowNpcChat: true,
  chatOverlayShowXpGain: false,
  chatOverlayShowElsoGain: false,
  chatOverlayHighlightScamNicknames: true,
  chatOverlayColorGeneral: '#ffffff',
  chatOverlayColorWhisper: '#64ff64',
  chatOverlayColorTeam: '#f7b73c',
  chatOverlayColorClub: '#94ddfa',
  chatOverlayColorShout: '#c896c8',
  chatOverlayNicknameColorMode: 'same',
  chatOverlayNicknameColorGeneral: '#94a3b8',
  chatOverlayNicknameColorWhisper: '#94a3b8',
  chatOverlayNicknameColorTeam: '#94a3b8',
  chatOverlayNicknameColorClub: '#94a3b8',
  chatOverlayNicknameColorShout: '#94a3b8',
  forgeQuestHudPos: { left: 50, bottom: 215 },
};

contextBridge.exposeInMainWorld('electronAPI', {
  DEFAULT_CONFIG,
  // 창 제어
  toggleSidebar: () => ipcRenderer.send('toggle-sidebar'),
  toggleDock: () => ipcRenderer.send('toggle-dock'),
  toggleOverlay: () => ipcRenderer.send('toggle-overlay'),
  toggleClickThrough: () => ipcRenderer.send('toggle-click-through'),
  toggleSettings: (tabId?: string) => ipcRenderer.send('toggle-settings', tabId),
  toggleGallery: () => ipcRenderer.send('toggle-gallery'),
  toggleAbbreviation: () => ipcRenderer.send('toggle-abbreviation'),
  toggleEquipmentDic: () => ipcRenderer.send('toggle-equipment-dic'),
  toggleBuffs: () => ipcRenderer.send('toggle-buffs'),
  toggleBossSettings: () => ipcRenderer.send('toggle-boss-settings'),
  toggleEtaRanking: () => ipcRenderer.send('toggle-eta-ranking'),
  toggleTrade: () => ipcRenderer.send('toggle-trade'),
  toggleCoefficientCalculator: () => ipcRenderer.send('toggle-coefficient-calculator'),
  openCoefficientCalculator: () => ipcRenderer.send('open-coefficient-calculator'),
  sendEquipmentToCoefficient: (item: any) => ipcRenderer.send('send-to-coefficient', item),
  sendEquipmentToEvolution: (item: any) => ipcRenderer.send('send-to-evolution', item),
  toggleContentsChecker: () => ipcRenderer.send('toggle-contents-checker'),
  toggleEvolutionCalculator: () => ipcRenderer.send('toggle-evolution-calculator'),
  toggleMagicStoneCalculator: () => ipcRenderer.send('toggle-magic-stone-calculator'),
  toggleCustomAlert: () => ipcRenderer.send('toggle-custom-alert'),
  toggleScamDetector: () => ipcRenderer.send('toggle-scam-detector'),
  toggleUniformColor: () => ipcRenderer.send('toggle-uniform-color'),
  toggleDiary: () => ipcRenderer.send('toggle-diary'),
  toggleXpHud: () => ipcRenderer.send('toggle-xp-hud'),
  toggleSienaAura: () => ipcRenderer.send('toggle-siena-aura'),
  toggleHuntingPathSimulator: () => ipcRenderer.send('toggle-hunting-path-simulator'),
  toggleWelcomeGuide: () => ipcRenderer.send('toggle-welcome-guide'),
  toggleStopwatch: () => ipcRenderer.send('toggle-stopwatch'),
  getHuntingGrounds: () => ipcRenderer.invoke('get-hunting-grounds'),
  getHuntingPath: (groundId: string) => ipcRenderer.invoke('get-hunting-path', groundId),
  saveHuntingPath: (groundId: string, points: Array<[number, number, string?]>) => ipcRenderer.send('save-hunting-path', groundId, points),
  resetXp: () => ipcRenderer.send('xp-reset'),
  startXpSession: () => ipcRenderer.send('xp-start-session'),
  stopXpSession: () => ipcRenderer.send('xp-stop-session'),
  abandonedReset: () => ipcRenderer.send('abandoned-reset'),
  startChatLogWatch: () => ipcRenderer.send('start-chat-log-watch'),
  checkChatLogStatus: () => ipcRenderer.invoke('check-chat-log-status'),
  sendRendererReady: (windowKey: string) => ipcRenderer.send('renderer-ready', windowKey),
  openAndHighlight: (key: string) => ipcRenderer.send('open-and-highlight', key),
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),

  contentsToggleItem: (id: string, characterId?: string) => ipcRenderer.send('contents-toggle-item', id, characterId),
  contentsUpdateCount: (id: string, characterId: string, count: number) => ipcRenderer.send('contents-update-count', id, characterId, count),
  contentsToggleExclude: (id: string, characterId: string) => ipcRenderer.send('contents-toggle-exclude', id, characterId),
  contentsToggleVisibility: (id: string) => ipcRenderer.send('contents-toggle-visibility', id),
  contentsUpdateCategory: (id: string, category: string) => ipcRenderer.send('contents-update-category', id, category),
  contentsUpdateName: (id: string, name: string) => ipcRenderer.send('contents-update-name', id, name),
  contentsUpdateItem: (id: string, name: string, category: string, rule: any, maxCount?: number) => ipcRenderer.send('contents-update-item', id, name, category, rule, maxCount),
  contentsAddCustom: (name: string, category: string, rule: any, maxCount?: number) => ipcRenderer.send('contents-add-custom', name, category, rule, maxCount),
  contentsRemoveItem: (id: string) => ipcRenderer.send('contents-remove-item', id),
  contentsReorderItem: (id: string, direction: 'up' | 'down') => ipcRenderer.send('contents-reorder-item', id, direction),
  contentsReorderList: (ids: string[]) => ipcRenderer.send('contents-reorder-list', ids),
  contentsManualReset: () => ipcRenderer.send('contents-manual-reset'),
  contentsAddCharacter: (name: string) => ipcRenderer.send('contents-add-character', name),
  contentsRemoveCharacter: (id: string) => ipcRenderer.send('contents-remove-character', id),
  contentsRenameCharacter: (id: string, name: string) => ipcRenderer.send('contents-rename-character', id, name),
  contentsSelectCharacter: (id: string) => ipcRenderer.send('contents-select-character', id),
  contentsApplyPending: (characterId: string) => ipcRenderer.send('contents-apply-pending', characterId),
  contentsClearPending: () => ipcRenderer.send('contents-clear-pending'),
  setIgnoreMouseEvents: (ignore: boolean, options: { forward?: boolean }) => ipcRenderer.send('set-ignore-mouse-events', ignore, options),
  welcomeGuideClose: () => ipcRenderer.send('welcome-guide-close'),
  welcomeGuideOpen: () => ipcRenderer.send('welcome-guide-open'),
  closeApp: () => ipcRenderer.send('close-app'),
  toolbarMouseEnter: () => ipcRenderer.send('toolbar-mouse-enter'),
  toolbarMouseLeave: () => ipcRenderer.send('toolbar-mouse-leave'),

  // 내비게이션
  navigate: (url: string) => ipcRenderer.send('navigate', url),
  goHome: () => ipcRenderer.send('go-home'),
  openExternal: (url: string) => ipcRenderer.send('open-external', url),

  // 데이터 및 설정
  setOpacity: (opacity: number) => ipcRenderer.send('set-opacity', opacity),
  saveQuickSlots: (slots: QuickSlotItem[]) => ipcRenderer.send('save-quick-slots', slots),
  applySettings: (settings: Partial<AppConfig>) => ipcRenderer.send('apply-settings', settings),
  setChatOverlaySize: (mode: 'main' | 'sub1' | 'sub2', width: number, height: number) => ipcRenderer.send('set-chat-overlay-size', mode, width, height),
  previewBossSound: (soundFile: string, volume: number | null = null, bossName: string = '미리보기') => ipcRenderer.send('preview-boss-sound', soundFile, volume, bossName),
  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  startUpdateDownload: () => ipcRenderer.send('start-update-download'),
  quitAndInstall: () => ipcRenderer.send('quit-and-install'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getGameStatus: () => ipcRenderer.invoke('get-game-status'),
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

  // 일지 (Adventure Log) 시스템
  diaryGetByDate: (date: string) => ipcRenderer.invoke('diary-get-by-date', date),
  diaryGetByMonth: (yearMonth: string) => ipcRenderer.invoke('diary-get-by-month', yearMonth),
  diaryGetMonthlySummary: (yearMonth: string) => ipcRenderer.invoke('diary-get-monthly-summary', yearMonth),
  diaryGetStatistics: (yearMonth: string) => ipcRenderer.invoke('diary-get-statistics', yearMonth),
  diaryGetMonthlyRevenue: (yearMonth: string) => ipcRenderer.invoke('diary-get-monthly-revenue', yearMonth),
  diaryAddActivity: (date: string, time: string, type: 'boss' | 'calc' | 'memo' | 'loot' | 'homework', content: string, amount: number = 0) => ipcRenderer.send('diary-add-activity', date, time, type, content, amount),
  diaryRemoveActivity: (date: string, type: string, content: string) => ipcRenderer.send('diary-remove-activity', date, type, content),
  diaryUpdateMonster: (date: string, monsterId: string) => ipcRenderer.send('diary-update-monster', date, monsterId),

  shortcutsUnregister: () => ipcRenderer.send('shortcuts-unregister'),
  shortcutsRegister: () => ipcRenderer.send('shortcuts-register'),
  requestGameFocus: () => ipcRenderer.send('request-game-focus'),

  // 백업 및 복구
  backupExport: () => ipcRenderer.invoke('backup-export'),
  backupImport: () => ipcRenderer.invoke('backup-import'),
  testDiscordWebhook: (webhookUrl: string) => ipcRenderer.invoke('test-discord-webhook', webhookUrl),

  // 채팅 로그
  openChatLogFolderDialog: () => ipcRenderer.invoke('dialog:openChatLogFolder'),
  getShoutHistory: (hours: number, searchQuery: string) => ipcRenderer.invoke('diary-get-shout-history', hours, searchQuery),
  toggleShoutHistory: () => ipcRenderer.send('toggle-shout-history'),
  
  // 채팅 오버레이
  toggleChatOverlay: () => ipcRenderer.send('toggle-chat-overlay'),
  toggleChatOverlaySub: (subNum: 1 | 2) => ipcRenderer.send('toggle-chat-overlay-sub', subNum),
  getChatHistory: (category: string) => ipcRenderer.invoke('chat-get-history', category),
  getMoreChatHistory: (category: string) => ipcRenderer.invoke('chat-get-more-history', category),
  openTodayLog: () => ipcRenderer.send('chat-open-today-log'),
  fetchEtaRankings: () => ipcRenderer.invoke('chat-fetch-eta-rankings'),
  getEtaCacheStatus: () => ipcRenderer.invoke('chat-get-eta-cache-status'),
  
  playSound: (file: string, volume: number) => ipcRenderer.send('play-sound', { file, volume }),
  toggleWordAlarm: () => ipcRenderer.send('toggle-word-alarm'),
  toggleDiscordAlarm: () => ipcRenderer.send('toggle-discord-alarm'),
  getWordAlarmHistory: (hours: number) => ipcRenderer.invoke('word-alarm-get-history', hours),
  getWordAlarmContext: (alarmId: number) => ipcRenderer.invoke('word-alarm-get-context', alarmId),
  deleteWordAlarmHistoryItem: (id: number) => ipcRenderer.send('word-alarm-delete-item', id),
  clearWordAlarmHistory: () => ipcRenderer.send('word-alarm-clear-history'),

  // 사기꾼 탐지
  scamSetEnabled: (enabled: boolean) => ipcRenderer.send('scam-set-enabled', enabled),
  scamGetModelStatus: (): Promise<ModelStatus> => ipcRenderer.invoke('scam-get-model-status'),
  scamGetConstants: (): Promise<{ analysisIntervalSec: number }> => ipcRenderer.invoke('scam-get-constants'),
  scamGetMsgerLogPath: (): Promise<string> => ipcRenderer.invoke('scam-get-msger-log-path'),
  openMsgerLogFolderDialog: (): Promise<string | null> => ipcRenderer.invoke('dialog:openMsgerLogFolder'),
  scamDownloadModel: (): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('scam-download-model'),
  scamDetectGpu: (): Promise<GpuDetectionResult> => ipcRenderer.invoke('scam-detect-gpu'),
  scamGetServerStatus: (): Promise<ServerStatus> => ipcRenderer.invoke('scam-get-server-status'),
  scamGetSessionStates: (): Promise<SessionState[]> => ipcRenderer.invoke('scam-get-session-states'),
  scamGetQueueLength: (): Promise<number> => ipcRenderer.invoke('scam-get-queue-length'),
  scamCloseSession: (filePath: string) => ipcRenderer.send('scam-close-session', filePath),
  scamTriggerAnalyze: (filePath: string) => ipcRenderer.send('scam-trigger-analyze', filePath),
  scamStopServer: () => ipcRenderer.send('scam-stop-server'),
  scamInjectTest: (scenario?: string): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('scam-inject-test', scenario),
  scamDownloadBinaryVariant: (variant: string): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('scam-download-binary-variant', variant),

  // 이스터애그
  triggerJellyppyRainGlobal: () => ipcRenderer.send('trigger-jellyppy-rain-global'),
  onTriggerJellyppyRain: (callback: () => void) => {
    ipcRenderer.removeAllListeners('trigger-jellyppy-rain');
    ipcRenderer.on('trigger-jellyppy-rain', () => callback());
  },
  triggerFireworkGlobal: () => ipcRenderer.send('trigger-firework-global'),
  onTriggerFirework: (callback: () => void) => {
    ipcRenderer.removeAllListeners('trigger-firework');
    ipcRenderer.on('trigger-firework', () => callback());
  },

  // 이벤트 리스너 (중복 등록 방지를 위해 기존 리스너 제거 후 재등록)
  onSidebarStatus: (callback: (isCollapsed: boolean) => void) => {
    ipcRenderer.removeAllListeners('sidebar-status');
    ipcRenderer.on('sidebar-status', (_event, isCollapsed) => callback(isCollapsed));
  },
  onOverlayStatus: (callback: (status: boolean) => void) => {
    ipcRenderer.removeAllListeners('overlay-status');
    ipcRenderer.on('overlay-status', (_event, status) => callback(status));
  },
  onChatOverlayStatus: (callback: (status: boolean) => void) => {
    ipcRenderer.removeAllListeners('chat-overlay-status');
    ipcRenderer.on('chat-overlay-status', (_event, status) => callback(status));
  },
  onClickThroughStatus: (callback: (status: boolean) => void) => {
    ipcRenderer.removeAllListeners('click-through-status');
    ipcRenderer.on('click-through-status', (_event, status) => callback(status));
  },
  onActiveWindows: (callback: (activeKeys: string[]) => void) => {
    ipcRenderer.removeAllListeners('active-windows');
    ipcRenderer.on('active-windows', (_event, activeKeys) => callback(activeKeys));
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
  onPlaySound: (callback: (data: { label: string, soundFile: string, spawnTime?: string, offset?: number, isCustom?: boolean, isAlreadyRecorded?: boolean, volume?: number, isPreview?: boolean }) => void) => {
    ipcRenderer.removeAllListeners('play-sound');
    ipcRenderer.on('play-sound', (_event, data) => callback(data));
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
  onHighlightAlarmSettings: (callback: () => void) => {
    ipcRenderer.removeAllListeners('highlight-alarm-settings');
    ipcRenderer.on('highlight-alarm-settings', () => callback());
  },
  onToolbarHover: (callback: (isHover: boolean) => void) => {
    ipcRenderer.removeAllListeners('toolbar-hover');
    ipcRenderer.on('toolbar-hover', (_event, isHover) => callback(isHover));
  },
  onReminderMessage: (callback: (message: string) => void) => {
    ipcRenderer.removeAllListeners('reminder-message');
    ipcRenderer.on('reminder-message', (_event, message) => callback(message));
  },
  onIncompleteContents: (callback: (items: any[]) => void) => {
    ipcRenderer.removeAllListeners('incomplete-contents');
    ipcRenderer.on('incomplete-contents', (_event, items) => callback(items));
  },
  onDiaryUpdated: (callback: () => void) => {
    ipcRenderer.removeAllListeners('diary-updated');
    ipcRenderer.on('diary-updated', () => callback());
  },
  onXpUpdate: (callback: (data: { total: number, epm: number, movingEpm: number, lastGain: number, history: number[], kills?: number, essenceCount?: number, xpSinceLastExchange?: number }) => void) => {
    ipcRenderer.removeAllListeners('xp-update');
    ipcRenderer.on('xp-update', (_event, data) => callback(data));
  },
  onShoutHistoryUpdated: (callback: () => void) => {
    ipcRenderer.removeAllListeners('shout-history-updated');
    ipcRenderer.on('shout-history-updated', () => callback());
  },
  onBuffTimerUpdate: (callback: (states: any[]) => void) => {
    ipcRenderer.removeAllListeners('buff-timer-update');
    ipcRenderer.on('buff-timer-update', (_event, states) => callback(states));
  },
  onBuffTimerWarning: (callback: (data: { buffId: string, phase: string, warnSec: number }) => void) => {
    ipcRenderer.removeAllListeners('buff-timer-warning');
    ipcRenderer.on('buff-timer-warning', (_event, data) => callback(data));
  },
  toggleBuffTimer: () => ipcRenderer.send('toggle-buff-timer'),
  buffTimerTest: (seconds?: number) => ipcRenderer.send('buff-timer-test', seconds),
  buffTimerClearTest: () => ipcRenderer.send('buff-timer-clear-test'),
  buffTimerClearAll: () => ipcRenderer.send('buff-timer-clear-all'),
  buffTimerDeactivate: (buffId: string) => ipcRenderer.send('buff-timer-deactivate', buffId),
  onXpResetDone: (callback: (data: { startTime: number }) => void) => {
    ipcRenderer.removeAllListeners('xp-reset-done');
    ipcRenderer.on('xp-reset-done', (_event, data) => callback(data));
  },
  onEssenceAlert: (callback: () => void) => {
    ipcRenderer.removeAllListeners('essence-alert');
    ipcRenderer.on('essence-alert', () => callback());
  },
  onPittaHillAlert: (callback: () => void) => {
    ipcRenderer.removeAllListeners('pitta-alert');
    ipcRenderer.on('pitta-alert', () => callback());
  },
  onEthosAlert: (callback: (data: { password: string; message: string }) => void) => {
    ipcRenderer.removeAllListeners('ethos-alert');
    ipcRenderer.on('ethos-alert', (_event, data) => callback(data));
  },
  onAbyssApostleAlert: (callback: (data: { message: string }) => void) => {
    ipcRenderer.removeAllListeners('abyss-apostle-alert');
    ipcRenderer.on('abyss-apostle-alert', (_event, data) => callback(data));
  },
  onWaveWarningAlert: (callback: () => void) => {
    ipcRenderer.removeAllListeners('wave-warning-alert');
    ipcRenderer.on('wave-warning-alert', () => callback());
  },
  onLokagosAlert: (callback: (data: { type: 'EXCLUDE' | 'TARGET'; zone: '알파' | '브라보' | '찰리' | '델타'; message: string }) => void) => {
    ipcRenderer.removeAllListeners('lokagos-alert');
    ipcRenderer.on('lokagos-alert', (_event, data) => callback(data));
  },
  onQuestStarted: (callback: (data: { questType: 'forge' | 'golgotha' | 'void', startTime: number, duration: number, startKills: number, targetKills: number }) => void) => {
    ipcRenderer.removeAllListeners('quest-started');
    ipcRenderer.on('quest-started', (_event, data) => callback(data));
  },
  onQuestUpdate: (callback: (data: { currentKills: number }) => void) => {
    ipcRenderer.removeAllListeners('quest-update');
    ipcRenderer.on('quest-update', (_event, data) => callback(data));
  },
  onQuestComplete: (callback: (data: { questType: 'forge' | 'golgotha' | 'void' }) => void) => {
    ipcRenderer.removeAllListeners('quest-complete');
    ipcRenderer.on('quest-complete', (_event, data) => callback(data));
  },
  onQuestCancelled: (callback: () => void) => {
    ipcRenderer.removeAllListeners('quest-cancelled');
    ipcRenderer.on('quest-cancelled', () => callback());
  },
  onScamAlert: (callback: (result: ScamAnalysisResult) => void) => {
    ipcRenderer.removeAllListeners('scam-alert');
    ipcRenderer.on('scam-alert', (_event, result) => callback(result));
  },
  onScamAnalysisResult: (callback: (result: ScamAnalysisResult) => void) => {
    ipcRenderer.removeAllListeners('scam-analysis-result');
    ipcRenderer.on('scam-analysis-result', (_event, result) => callback(result));
  },
  onScamProgress: (callback: (pct: number) => void) => {
    ipcRenderer.removeAllListeners('scam-progress');
    ipcRenderer.on('scam-progress', (_event, pct) => callback(pct));
  },
  onScamSessionUpdate: (callback: (sessions: SessionState[]) => void) => {
    ipcRenderer.removeAllListeners('scam-session-update');
    ipcRenderer.on('scam-session-update', (_event, sessions) => callback(sessions));
  },
  onScamAnalysisToken: (callback: (data: { filePath: string; token: string }) => void) => {
    ipcRenderer.removeAllListeners('scam-analysis-token');
    ipcRenderer.on('scam-analysis-token', (_event, data) => callback(data));
  },
  onAutoSelectEquipment: (callback: (item: any) => void) => {
    ipcRenderer.removeAllListeners('auto-select-equipment');
    ipcRenderer.on('auto-select-equipment', (_event, item) => callback(item));
  },
  onAutoSelectEvolution: (callback: (data: any) => void) => {
    ipcRenderer.removeAllListeners('auto-select-evolution');
    ipcRenderer.on('auto-select-evolution', (_event, data) => callback(data));
  },
  onAbandonedUpdate: (callback: (state: any) => void) => {
    ipcRenderer.removeAllListeners('abandoned-update');
    ipcRenderer.on('abandoned-update', (_event, state) => callback(state));
  },
  onAbandonedAlert: (callback: (data: { region: string, count: number }) => void) => {
    ipcRenderer.removeAllListeners('abandoned-alert');
    ipcRenderer.on('abandoned-alert', (_event, data) => callback(data));
  },
  onAbandonedHideNow: (callback: () => void) => {
    ipcRenderer.removeAllListeners('abandoned-hide-now');
    ipcRenderer.on('abandoned-hide-now', () => callback());
  },
  onChatUpdated: (callback: (chatItem: any) => void) => {
    ipcRenderer.removeAllListeners('chat-updated');
    ipcRenderer.on('chat-updated', (_event, chatItem) => callback(chatItem));
  },
  onChatHistoryCleared: (callback: () => void) => {
    ipcRenderer.removeAllListeners('chat-history-cleared');
    ipcRenderer.on('chat-history-cleared', () => callback());
  },
  onChatOverlayMode: (callback: (mode: 'main' | 'sub1' | 'sub2') => void) => {
    ipcRenderer.removeAllListeners('chat-overlay-mode');
    ipcRenderer.on('chat-overlay-mode', (_event, mode) => callback(mode));
  },
  onChatLogStatusChanged: (callback: (isValid: boolean) => void) => {
    ipcRenderer.removeAllListeners('chat-log-status-changed');
    ipcRenderer.on('chat-log-status-changed', (_event, isValid) => callback(isValid));
  },
  abandonedGetState: () => ipcRenderer.invoke('abandoned-get-state'),
  abandonedForceVisible: (visible: boolean) => ipcRenderer.send('abandoned-force-visible', visible),
  abandonedSetEnabled: (enabled: boolean) => ipcRenderer.send('abandoned-set-enabled', enabled),
  abandonedHideNow: () => ipcRenderer.send('abandoned-hide-now'),
  setAbandonedAutoHide: (minutes: number) => ipcRenderer.send('set-abandoned-autohide', minutes),
  getAlarmLogs: (limit?: number) => ipcRenderer.invoke('alarm-get-logs', limit),
  clearAlarmLogs: () => ipcRenderer.send('alarm-clear-logs'),
  onAlarmLogsUpdated: (callback: () => void) => {
    ipcRenderer.removeAllListeners('alarm-logs-updated');
    ipcRenderer.on('alarm-logs-updated', () => callback());
  },

  onTimerToggle: (callback: (state: 'start' | 'stop' | 'toggle') => void) => {
    ipcRenderer.removeAllListeners('timer-toggle');
    ipcRenderer.on('timer-toggle', (_event, state) => callback(state));
  },
  onTimerUpdated: (callback: () => void) => {
    ipcRenderer.removeAllListeners('timer-updated');
    ipcRenderer.on('timer-updated', () => callback());
  },
  timerSaveRecord: (record: any) => ipcRenderer.send('timer-save-record', record),
  timerGetRecords: () => ipcRenderer.invoke('timer-get-records'),
  timerUpdateTitle: (id: number, title: string) => ipcRenderer.send('timer-update-title', id, title),
  timerUpdateSeriesCore: (
    id: number, 
    series: string, 
    core_master: string, 
    coefficient: number,
    char_main: number,
    char_sub: number,
    base_main: number,
    enchant_main: number,
    base_sub: number,
    enchant_sub: number,
    accuracy: number
  ) => ipcRenderer.send(
    'timer-update-series-core', 
    id, 
    series, 
    core_master, 
    coefficient,
    char_main,
    char_sub,
    base_main,
    enchant_main,
    base_sub,
    enchant_sub,
    accuracy
  ),
  timerDeleteRecord: (id: number) => ipcRenderer.send('timer-delete-record', id),
  timerToggleSession: (state: 'start' | 'stop') => ipcRenderer.send('timer-toggle-session', state),


  cleanupAllListeners: () => {
    const events = [
      'sidebar-status', 'overlay-status', 'chat-overlay-status', 'click-through-status', 'config-data',
      'url-change', 'load-status', 'gallery-posts', 'gallery-new-activity',
      'gallery-watched-update', 'gallery-connection-status', 'update-status',
      'boss-times-data', 'play-sound', 'trade-posts', 'trade-new-activity',
      'trade-connection-status', 'open-settings-tab', 'toolbar-hover', 'reminder-message',
      'incomplete-contents', 'diary-updated', 'xp-update', 'shout-history-updated',
      'buff-timer-update', 'buff-timer-warning', 'xp-reset-done', 'abandoned-update', 'abandoned-alert', 'abandoned-hide-now', 'pitta-alert', 'ethos-alert', 'abyss-apostle-alert',
      'scam-alert', 'scam-progress', 'scam-session-update', 'scam-analysis-token', 'scam-analysis-result', 'wave-warning-alert', 'lokagos-alert', 'chat-updated', 'chat-overlay-mode', 'chat-history-cleared',
      'auto-select-equipment', 'auto-select-evolution',
      'quest-started', 'quest-update', 'quest-complete', 'quest-cancelled',
      'trigger-jellyppy-rain', 'trigger-firework', 'chat-log-status-changed',
      'alarm-logs-updated', 'highlight-alarm-settings', 'timer-toggle', 'timer-updated'
    ];
    events.forEach(event => ipcRenderer.removeAllListeners(event));
  }
});

contextBridge.exposeInMainWorld('testChat', (rawLine: string) => {
  ipcRenderer.send('inject-test-chat', rawLine);
});

contextBridge.exposeInMainWorld('testEssence', (count: number = 1) => {
  const today = new Date().toISOString().split('T')[0];
  ipcRenderer.send('inject-test-chat', `Date : ${today}`);
  const xpAmount = count * 10_000_000_000;
  const formattedXp = xpAmount.toLocaleString();
  // 파서의 시간 정규식 매칭을 위해 오전/오후 단어를 제거하고 24시간 형식의 [22시 50분 00초] 형태로 보냅니다.
  ipcRenderer.send('inject-test-chat', `[22시 50분 00초] 경험치가 ${formattedXp} 감소하였습니다.`);
});

contextBridge.exposeInMainWorld('testQuestStart', (type: 'forge' | 'golgotha' | 'void' = 'forge') => {
  const questName = type === 'forge' ? '대장간' : type === 'golgotha' ? '골고다' : '공허';
  ipcRenderer.send('inject-test-chat', `[22시 50분 00초] [twOverlay] ${questName} 도전과제 시작`);
});

contextBridge.exposeInMainWorld('testQuestKill', (count: number = 100) => {
  const today = new Date().toISOString().split('T')[0];
  ipcRenderer.send('inject-test-chat', `Date : ${today}`);
  for (let i = 0; i < count; i++) {
    ipcRenderer.send('inject-test-chat', `[22시 50분 00초] 경험치가 1,000 올랐습니다.`);
  }
});
