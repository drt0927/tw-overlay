/**
 * IPC 이벤트 핸들러 모듈
 */
import { ipcMain, shell, app, BrowserWindow, dialog } from 'electron';
import * as config from './config';
import { AppConfig, QuickSlotItem } from './constants';
import * as wm from './windowManager';
import * as gallery from './galleryMonitor';
import * as trade from './tradeMonitor';
import * as optimizer from './optimizer';
import { fetchEtaRanking } from './etaRanking';
import type { EtaRankingParams } from '../shared/types';
import { setupAutoStart } from './autoStart';
import * as sm from './shortcutManager';
import { analytics } from './analytics';
import * as diaryDb from './diaryDb';
import * as backup from './backupManager';
import { buffTimerManager } from './buffTimerManager';
import * as fullscreenManager from './fullscreenManager';
import * as tracker from './tracker';
import * as scam from './scamMonitor';

let _registered = false;

const VALID_CAPTURE_MODES = new Set(['wgc', 'dxgi']);
const VALID_UPSCALE_MODES = new Set(['passthrough', 'anime4k-s', 'anime4k-l']);
const ALLOWED_DOCK_FEATURES = new Set([
  'buffTimer', 'xpHud', 'bossSettings', 'shoutHistory',
  'gallery', 'trade', 'customAlert', 'contentsChecker',
  'abbreviation', 'buffs', 'coefficientCalculator', 'etaRanking',
  'evolutionCalculator', 'magicStoneCalculator', 'diary',
  'scamDetector', 'uniformColor',
  'overlay', 'clickThrough',
]);

export function register(): void {
  if (_registered) return;
  _registered = true;

  ipcMain.on('set-ignore-mouse-events', (event, ignore: boolean, options: { forward?: boolean }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.setIgnoreMouseEvents(ignore, options || {});
  });

  ipcMain.on('set-opacity', (_e, opacity: number) => {
    const win = wm.getOverlayWindow();
    if (win) win.setOpacity(opacity);
    config.save({ opacity });
  });

  ipcMain.on('navigate', (_e, url: string) => {
    let t = url.trim();
    if (!t.startsWith('http://') && !t.startsWith('https://')) t = 'https://' + t;
    try {
      const parsedUrl = new URL(t);
      if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
        wm.setOverlayVisible(true, parsedUrl.href);
      }
    } catch (e) {
      console.warn('[IPC] Invalid URL in navigate:', url);
    }
  });

  ipcMain.on('go-home', () => {
    const cfg = config.load();
    wm.setOverlayVisible(true, cfg.homeUrl);
  });

  ipcMain.on('apply-settings', (_e, newSettings: Partial<AppConfig>) => {
    wm.applySettings(newSettings);
    if (newSettings.autoLaunch !== undefined) {
      setupAutoStart(newSettings.autoLaunch!);
    }
    if (newSettings.shortcuts) {
      sm.reloadShortcuts();
    }
    // 설정 변경 후 모니터러 상태 갱신 (윈도우 참조 없이 설정 재로드만)
    gallery.updateWindows(null, null, null);
    trade.updateWindows(null, null);
  });

  // 창 토글 핸들러 일괄 등록
  const toggleHandlers: Record<string, () => void> = {
    'toggle-scam-detector': wm.toggleScamDetectorWindow,
    'toggle-gallery': wm.toggleGalleryWindow,
    'toggle-abbreviation': wm.toggleAbbreviationWindow,
    'toggle-buffs': wm.toggleBuffsWindow,
    'toggle-boss-settings': wm.toggleBossSettingsWindow,
    'toggle-eta-ranking': wm.toggleEtaRankingWindow,
    'toggle-sidebar': wm.toggleSidebar,
    'toggle-overlay': wm.toggleOverlay,
    'toggle-click-through': wm.toggleClickThrough,
    'toggle-trade': wm.toggleTradeWindow,
    'toggle-coefficient-calculator': wm.toggleCoefficientCalculatorWindow,
    'toggle-contents-checker': wm.toggleContentsCheckerWindow,
    'toggle-evolution-calculator': wm.toggleEvolutionCalculatorWindow,
    'toggle-magic-stone-calculator': wm.toggleMagicStoneCalculatorWindow,
    'toggle-custom-alert': wm.toggleCustomAlertWindow,
    'toggle-uniform-color': wm.toggleUniformColorWindow,
    'toggle-diary': wm.toggleDiaryWindow,
    'toggle-buff-timer': wm.toggleBuffTimerWindow,
    'toggle-xp-hud': wm.toggleXpHudWindow,
    'toggle-fullscreen': wm.toggleFullscreenWindow,
  };

  Object.entries(toggleHandlers).forEach(([event, handler]) => {
    ipcMain.on(event, () => {
      analytics.trackEvent(event.replace(/-/g, '_'));
      handler();
    });
  });

  // 컨텐츠 체크 리스트 조작 핸들러
  ipcMain.on('contents-toggle-item', (_e, id: string) => {
    import('./contentsChecker').then(mod => mod.toggleItem(id));
  });
  ipcMain.on('contents-toggle-visibility', (_e, id: string) => {
    import('./contentsChecker').then(mod => mod.toggleVisibility(id));
  });
  ipcMain.on('contents-update-category', (_e, id: string, category: string) => {
    import('./contentsChecker').then(mod => mod.updateCategory(id, category));
  });
  ipcMain.on('contents-update-name', (_e, id: string, name: string) => {
    import('./contentsChecker').then(mod => mod.updateName(id, name));
  });
  ipcMain.on('contents-add-custom', (_e, name: string, category: string, rule: any) => {
    import('./contentsChecker').then(mod => mod.addCustomItem(name, category, rule));
  });
  ipcMain.on('contents-remove-item', (_e, id: string) => {
    import('./contentsChecker').then(mod => mod.removeItem(id));
  });
  ipcMain.on('contents-reorder-item', (_e, id: string, direction: 'up' | 'down') => {
    import('./contentsChecker').then(mod => mod.reorderItem(id, direction));
  });
  ipcMain.on('contents-reorder-list', (_e, ids: string[]) => {
    import('./contentsChecker').then(mod => mod.reorderList(ids));
  });
  ipcMain.on('contents-manual-reset', () => {
    import('./contentsChecker').then(mod => mod.checkReset());
  });

  // 특별 인수가 필요한 토글 핸들러 개별 등록
  ipcMain.on('toggle-settings', (_event, tabId?: string) => {
    const eventName = tabId ? `toggle_settings_${tabId}` : 'toggle_settings';
    analytics.trackEvent(eventName, { tabId });
    wm.toggleSettingsWindow(tabId);
  });

  // 네트워크 최적화 (Fast Ping) 핸들러
  ipcMain.handle('get-optimization-status', async () => {
    return await optimizer.getOptimizationStatus();
  });
  ipcMain.handle('set-optimization', async (_e, enable: boolean) => {
    const eventName = `set_optimization_${enable ? 'on' : 'off'}`;
    analytics.trackEvent(eventName, { enable });
    return await optimizer.setOptimization(enable);
  });

  ipcMain.on('check-for-updates', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    import('./updater').then(mod => mod.manualCheckForUpdate(win));
  });
  ipcMain.on('start-update-download', () => {
    import('./updater').then(mod => mod.startDownload());
  });
  ipcMain.on('quit-and-install', () => {
    import('./updater').then(mod => mod.quitAndInstall());
  });
  ipcMain.handle('get-app-version', () => app.getVersion());

  ipcMain.on('open-external', (_e, url: string) => {
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
        shell.openExternal(parsedUrl.href);
      }
    } catch (e) {
      console.warn('[IPC] Invalid URL in open-external:', url);
    }
  });

  ipcMain.on('preview-boss-sound', (_e, soundFile: string, volume: number | null, bossName: string = '미리보기') => {
    const sidebar = wm.getMainWindow();
    if (sidebar) sidebar.webContents.send('play-sound', { label: bossName, soundFile, volume });
  });

  ipcMain.on('save-quick-slots', (_e, slots: QuickSlotItem[]) => {
    config.saveImmediate({ quickSlots: slots });
    const sidebar = wm.getMainWindow();
    if (sidebar) sidebar.webContents.send('config-data', config.load());
  });

  // 갤러리 모니터 핸들러
  ipcMain.handle('gallery-add-watch', async (_e, postNo: number) => { return await gallery.addWatch(postNo); });
  ipcMain.on('gallery-remove-watch', (_e, postNo: number) => { gallery.removeWatch(postNo); });
  ipcMain.handle('gallery-get-watched', async () => { return gallery.getWatchedPosts(); });
  ipcMain.handle('gallery-force-check', async () => { await gallery.forceCheck(); return gallery.getWatchedPosts(); });
  ipcMain.handle('gallery-get-notify', () => { return gallery.getNotifyEnabled(); });
  ipcMain.on('gallery-set-notify', (_e, enabled: boolean) => { gallery.setNotifyEnabled(enabled); });
  ipcMain.on('gallery-open-post', (_e, postNo: number | string) => {
    shell.openExternal(`https://gall.dcinside.com/mini/board/view/?id=talesweaver&no=${postNo}`);
  });

  // 에타 랭킹 모듈 핸들러
  ipcMain.handle('get-eta-ranking', async (_e, params: EtaRankingParams) => {
    return await fetchEtaRanking(params);
  });

  // 거래 게시판 모니터 핸들러
  ipcMain.handle('trade-force-check', async () => { return await trade.forceCheck(); });
  ipcMain.handle('trade-get-notify', () => { return trade.getNotifyEnabled(); });
  ipcMain.on('trade-set-notify', (_e, enabled: boolean) => { trade.setNotifyEnabled(enabled); });
  ipcMain.on('trade-open-post', (_e, url: string) => {
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
        shell.openExternal(parsedUrl.href);
      }
    } catch (e) {
      console.warn('[IPC] Invalid URL in trade-open-post:', url);
    }
  });
  ipcMain.on('trade-set-server', (_e, serverId: string) => { trade.setServer(serverId); });
  ipcMain.handle('trade-get-server', () => { return trade.getServer(); });
  ipcMain.handle('trade-get-servers', () => { return trade.getServers(); });

  // --- Diary (Adventure Log) System ---
  const isValidDate = (d: string) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
  const isValidYearMonth = (ym: string) => typeof ym === 'string' && /^\d{4}-\d{2}$/.test(ym);
  const validActivityTypes = ['boss', 'calc', 'memo', 'loot', 'homework'];

  ipcMain.handle('diary-get-by-date', (_e, date: string) => {
    if (!isValidDate(date)) return { diary: null, homeworkLogs: [], activityLogs: [] };
    return diaryDb.getDiaryByDate(date);
  });
  ipcMain.handle('diary-get-by-month', (_e, yearMonth: string) => {
    if (!isValidYearMonth(yearMonth)) return [];
    return diaryDb.getDiariesByMonth(yearMonth);
  });
  ipcMain.handle('diary-get-monthly-summary', (_e, yearMonth: string) => {
    if (!isValidYearMonth(yearMonth)) return { totalLoots: 0, totalSeed: 0, lootList: [], seedList: [] };
    return diaryDb.getMonthlySummary(yearMonth);
  });
  ipcMain.handle('diary-get-statistics', (_e, yearMonth: string) => {
    if (!isValidYearMonth(yearMonth)) return null;
    return diaryDb.getMonthlyStatistics(yearMonth);
  });
  ipcMain.handle('diary-get-monthly-revenue', (_e, yearMonth: string) => {
    if (!isValidYearMonth(yearMonth)) return [];
    return diaryDb.getMonthlyRevenueData(yearMonth);
  });
  ipcMain.handle('diary-get-shout-history', (_e, hours: number, searchQuery: string) => {
    return diaryDb.getShoutHistory(hours || 24, searchQuery || '');
  });
  ipcMain.on('toggle-shout-history', () => {
    wm.toggleShoutHistoryWindow();
  });
  ipcMain.on('play-sound', (_e, { file, volume }) => {
    const sidebar = wm.getMainWindow();
    if (sidebar) sidebar.webContents.send('play-sound', { label: '미리보기', soundFile: file, volume });
  });
  ipcMain.on('diary-add-activity', (_e, date: string, time: string, type: 'boss' | 'calc' | 'memo' | 'loot' | 'homework', content: string, amount: number = 0) => {
    if (!isValidDate(date) || typeof time !== 'string' || !validActivityTypes.includes(type) || typeof content !== 'string') return;
    diaryDb.addActivityLog(date, time, type, content, amount);
  });
  ipcMain.on('diary-remove-activity', (_e, date: string, type: string, content: string) => {
    if (!isValidDate(date) || typeof type !== 'string' || typeof content !== 'string') return;
    diaryDb.removeActivityLog(date, type, content);
  });
  ipcMain.on('diary-update-monster', (_e, date: string, monsterId: string) => {
    if (!isValidDate(date) || typeof monsterId !== 'string') return;
    diaryDb.updateDiaryMonster(date, monsterId);
  });

  // --- Shortcut Control ---
  ipcMain.on('shortcuts-unregister', () => sm.unregisterAll());
  ipcMain.on('shortcuts-register', () => sm.registerAll());

  // --- Backup & Restore ---
  ipcMain.handle('backup-export', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win ? await backup.exportBackup(win) : false;
  });
  ipcMain.handle('backup-import', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win ? await backup.importBackup(win) : false;
  });

  // 채팅 로그 폴더 선택 다이얼로그
  ipcMain.handle('dialog:openChatLogFolder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return null;

    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: '테일즈위버 ChatLog 폴더 선택'
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.on('close-app', () => { app.quit(); });

  // --- 풀스크린 업스케일링 ---
  ipcMain.handle('fullscreen:isAvailable', () => fullscreenManager.isAddonAvailable());

  ipcMain.handle('fullscreen:start', (_e, opts: { captureMode?: string; upscaleMode?: string } = {}) => {
    if (opts.captureMode !== undefined && !VALID_CAPTURE_MODES.has(opts.captureMode))
      return { success: false, error: `Invalid captureMode: ${opts.captureMode}` };
    if (opts.upscaleMode !== undefined && !VALID_UPSCALE_MODES.has(opts.upscaleMode))
      return { success: false, error: `Invalid upscaleMode: ${opts.upscaleMode}` };

    const gameOverlayHwnd = wm.getGameOverlayHwnd();
    if (!gameOverlayHwnd) return { success: false, error: 'Game overlay window not ready' };
    const gameHwnd = tracker.getGameHwnd();
    if (!gameHwnd) return { success: false, error: '게임이 실행 중이지 않습니다' };
    const result = fullscreenManager.startFullscreen(gameOverlayHwnd, gameHwnd, opts);
    if (result.success) {
      wm.setFullscreenMode(true);
    }
    return result;
  });

  ipcMain.handle('fullscreen:stop', () => {
    wm.stopFullscreenForCleanup();
    return { success: true };
  });

  ipcMain.on('fullscreen:setOverlayActive', (_e, active: boolean) => {
    fullscreenManager.setOverlayActive(active);
  });

  ipcMain.on('fullscreen:setUpscaleMode', (_e, mode: string) => {
    if (!VALID_UPSCALE_MODES.has(mode)) return;
    fullscreenManager.setUpscaleMode(mode);
  });

  ipcMain.handle('fullscreen:getStatus', () => fullscreenManager.getStatus());
  ipcMain.handle('tracker:isGameRunning', () => !!tracker.getGameHwnd());

  // --- 풀스크린 독 ---
  ipcMain.on('dock:open-feature', (_e, featureKey: string) => {
    if (typeof featureKey !== 'string' || !ALLOWED_DOCK_FEATURES.has(featureKey)) return;
    analytics.trackEvent(`dock_open_${featureKey}`);
    wm.openFeatureFromDock(featureKey);
  });

  ipcMain.on('dock:close', () => {
    wm.closeDock();
  });

  ipcMain.handle('dock:get-initial-state', () => ({
    overlayVisible: wm.getIsOverlayVisible(),
    overlayInteractive: !wm.isOverlayMouseThrough(),
    hiddenMenuIds: config.load().hiddenMenuIds || [],
    shortcutWarning: wm.getFullscreenShortcutWarning(),
  }));

  // --- 사기꾼 탐지 ---
  ipcMain.on('scam-set-enabled', (_e, enabled: boolean) => {
    config.save({ scamDetectorEnabled: enabled });
    if (enabled) scam.start();
    else scam.stop();
  });
  ipcMain.handle('scam-get-model-status', () => scam.getModelStatus());
  ipcMain.handle('scam-get-constants', () => scam.getConstants());
  ipcMain.handle('scam-get-msger-log-path', () => scam.getCurrentMsgerLogPath());
  ipcMain.handle('dialog:openMsgerLogFolder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: '테일즈위버 MsgerLog 폴더 선택'
    });
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
  });
  ipcMain.handle('scam-detect-gpu', () => scam.detectGpu());
  ipcMain.handle('scam-get-server-status', () => scam.getServerStatus());
  ipcMain.handle('scam-get-session-states', () => scam.getSessionStates());
  ipcMain.handle('scam-get-queue-length', () => scam.getQueueLength());
  ipcMain.on('scam-close-session', (_e, filePath: unknown) => { if (typeof filePath === 'string') scam.closeSession(filePath); });
  ipcMain.on('scam-trigger-analyze', (_e, filePath: unknown) => { if (typeof filePath === 'string') scam.triggerAnalyze(filePath); });
  ipcMain.on('scam-stop-server', () => scam.stopServer());
  ipcMain.handle('scam-inject-test', (_e, scenario?: string) => scam.injectTestSession(scenario));
  ipcMain.handle('scam-get-recent-results', () => scam.getRecentResults());
  ipcMain.on('scam-abort-download', () => scam.abortDownload());
  ipcMain.handle('scam-download-binary-variant', async (event, gpuChoice: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    try {
      scam.stopServer();
      const gpuResult = await scam.buildGpuResultForUserChoice(gpuChoice);
      await scam.downloadServerBinary(gpuResult, (pct, label?) => {
        win?.webContents.send('scam-progress', pct, label);
      });
      return { success: true, binaryVariant: gpuResult.binaryVariant };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  });
  ipcMain.handle('scam-download-model', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    try {
      await scam.downloadModel((pct, label?) => {
        win?.webContents.send('scam-progress', pct, label);
      });
      return { success: true };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  });

  // 버프 타이머 테스트 — 3개 버프 강제 활성화
  ipcMain.on('buff-timer-test', (event, seconds?: number) => {
   const TEST_BUFFS = ['exp_heart', 'rare_heart', 'stat_exorcist'];
   const durationMs = (seconds && seconds > 0) ? seconds * 1000 : undefined;
   TEST_BUFFS.forEach(buffId => buffTimerManager.activateBuff(buffId, 'test', durationMs));
  });
  // 버프 타이머 테스트 종료 — 테스트 버프 제거
  ipcMain.on('buff-timer-clear-test', () => {
    buffTimerManager.clearTestBuffs();
  });
  // XP 세션 제어
  ipcMain.handle('xp-get-stats', async () => {
    const mod = await import('./chatLogProcessor');
    return mod.chatLogProcessor.getStats();
  });
  ipcMain.on('xp-reset', () => {
    import('./chatLogProcessor').then(mod => mod.chatLogProcessor.resetXp());
  });
}
