/**
 * IPC 이벤트 핸들러 모듈
 */
import { ipcMain, shell, app, BrowserWindow, dialog, screen } from 'electron';
import * as config from './config';
import { AppConfig, QuickSlotItem } from './constants';
import * as fs from 'fs';
import { chatLogManager } from './chatLogManager';
import * as wm from './windowManager';
import * as gallery from './galleryMonitor';
import * as trade from './tradeMonitor';
import * as optimizer from './optimizer';
import { fetchEtaRanking } from './etaRanking';
import type { EtaRankingParams } from '../shared/types';
import { setupAutoStart } from './autoStart';
import * as sm from './shortcutManager';
import { analytics } from './analytics';
import * as tracker from './tracker';
import { FOCUS_RESTORE_DELAY_MS } from './constants';
import * as diaryDb from './diaryDb';
import * as backup from './backupManager';
import { buffTimerManager } from './buffTimerManager';
import * as scam from './scamMonitor';
import { discordNotifier } from './discordNotifier';
import { chatParser } from './chatParser';

let _registered = false;

export function register(): void {
  if (_registered) return;
  _registered = true;

  ipcMain.on('set-ignore-mouse-events', (event, ignore: boolean, options: { forward?: boolean }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.setIgnoreMouseEvents(ignore, options || {});
  });

  ipcMain.on('set-always-on-top', (event, flag: boolean) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      win.setAlwaysOnTop(flag, flag ? 'screen-saver' : 'normal');
      // 오버레이 해제(flag === false) 시, 게임창 뒤로 창이 숨겨지지 않도록 포커스를 다시 줌
      if (!flag) {
        win.show();
        win.focus();
      }
    }
  });

  ipcMain.on('set-window-size', (event, width: number, height: number) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      const isResizable = win.isResizable();
      win.setResizable(true);
      win.setSize(Math.round(width), Math.round(height));
      win.setResizable(isResizable);
    }
  });

  ipcMain.on('set-window-position', (event, x: number, y: number) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      win.setPosition(Math.round(x), Math.round(y));
    }
  });

  ipcMain.on('welcome-guide-close', () => {
    config.save({ hasSeenWelcomeGuide: true });
    const guideWin = wm.getWelcomeGuideWindow();
    if (guideWin && !guideWin.isDestroyed()) {
      guideWin.close();
    }
  });

  ipcMain.on('welcome-guide-open', () => {
    wm.createWelcomeGuideWindow();
  });

  ipcMain.on('trigger-jellyppy-rain-global', () => {
    let overlayWin = wm.getGameOverlayWindow();
    let isNew = false;
    if (!overlayWin || overlayWin.isDestroyed()) {
      wm.createGameOverlayWindow();
      overlayWin = wm.getGameOverlayWindow();
      isNew = true;
    }
    if (overlayWin && !overlayWin.isDestroyed()) {
      const bounds = overlayWin.getBounds();
      if (bounds.width === 0 || bounds.height === 0 || !overlayWin.isVisible()) {
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width, height } = primaryDisplay.workAreaSize;
        overlayWin.setBounds({ x: 0, y: 0, width, height });
        overlayWin.showInactive();
      }

      // 비 내리는 동안 임시로 항상 위에 노출 (다른 윈도우 가림 방지)
      overlayWin.setAlwaysOnTop(true, 'screen-saver');
      setTimeout(() => {
        try {
          if (overlayWin && !overlayWin.isDestroyed()) {
            overlayWin.setAlwaysOnTop(false);
          }
        } catch (e) {}
      }, 6500);

      if (isNew) {
        overlayWin.webContents.once('did-finish-load', () => {
          if (overlayWin && !overlayWin.isDestroyed()) {
            overlayWin.webContents.send('trigger-jellyppy-rain');
          }
        });
      } else {
        overlayWin.webContents.send('trigger-jellyppy-rain');
      }
    }
  });

  ipcMain.on('trigger-firework-global', () => {
    console.log('[IPC] trigger-firework-global event received from renderer in Main Process.');
    analytics.trackEvent('trigger_firework_global');
    let overlayWin = wm.getGameOverlayWindow();
    let isNew = false;
    if (!overlayWin || overlayWin.isDestroyed()) {
      console.log('[IPC] gameOverlayWindow not active. Creating window...');
      wm.createGameOverlayWindow();
      overlayWin = wm.getGameOverlayWindow();
      isNew = true;
    }
    if (overlayWin && !overlayWin.isDestroyed()) {
      const bounds = overlayWin.getBounds();
      if (bounds.width === 0 || bounds.height === 0 || !overlayWin.isVisible()) {
        console.log('[IPC] gameOverlayWindow size is 0 or hidden. Setting full screen bounds...');
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width, height } = primaryDisplay.workAreaSize;
        overlayWin.setBounds({ x: 0, y: 0, width, height });
        overlayWin.showInactive();
      }

      // 폭죽 터지는 동안 임시로 항상 위에 노출 (다른 윈도우 가림 방지)
      overlayWin.setAlwaysOnTop(true, 'screen-saver');
      setTimeout(() => {
        try {
          if (overlayWin && !overlayWin.isDestroyed()) {
            overlayWin.setAlwaysOnTop(false);
          }
        } catch (e) {}
      }, 5500);

      console.log('[IPC] Forwarding trigger-firework to gameOverlayWindow webContents.');
      if (isNew) {
        overlayWin.webContents.once('did-finish-load', () => {
          if (overlayWin && !overlayWin.isDestroyed()) {
            overlayWin.webContents.send('trigger-firework');
          }
        });
      } else {
        overlayWin.webContents.send('trigger-firework');
      }
    } else {
      console.warn('[IPC] Failed to forward event: gameOverlayWindow is null or destroyed.');
    }
  });

  ipcMain.on('set-opacity', (_e, opacity: number) => {
    const win = wm.getOverlayWindow();
    if (win) win.setOpacity(opacity);
    config.save({ opacity });
  });

  ipcMain.on('set-chat-overlay-size', (_e, mode: 'main' | 'sub1' | 'sub2', width: number, height: number) => {
    wm.setChatOverlaySize(mode, width, height);
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
    
    // 챗로그 상태 변경 여부를 모든 창에 브로드캐스트
    broadcastChatLogStatus();

    // 모험 일지 보관 설정 변경 시 즉시 오래된 데이터 정리 실행
    if (newSettings.diaryKeepDays !== undefined) {
      const keepDays = newSettings.diaryKeepDays;
      if (keepDays > 0) {
        analytics.trackEvent('diary_data_cleanup', { keepDays, trigger: 'settings_change' });
        diaryDb.cleanOldDiaryData(keepDays);
      }
    }
  });

  function broadcastChatLogStatus(): void {
    const cfg = config.load();
    const chatLogPath = cfg.chatLogPath;
    let isValid = false;
    try {
      if (chatLogPath && fs.existsSync(chatLogPath)) {
        const files = fs.readdirSync(chatLogPath);
        isValid = files.some(file => file.startsWith('TWChatLog_') && file.endsWith('.html'));
      }
    } catch {}

    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send('chat-log-status-changed', isValid);
      }
    });
  }

  // 창 토글 핸들러 일괄 등록
  const toggleHandlers: Record<string, () => void> = {
    'toggle-scam-detector': wm.toggleScamDetectorWindow,
    'toggle-gallery': wm.toggleGalleryWindow,
    'toggle-abbreviation': wm.toggleAbbreviationWindow,
    'toggle-equipment-dic': wm.toggleEquipmentDicWindow,
    'toggle-buffs': wm.toggleBuffsWindow,
    'toggle-boss-settings': wm.toggleBossSettingsWindow,
    'toggle-eta-ranking': wm.toggleEtaRankingWindow,
    'toggle-sidebar': wm.toggleSidebar,
    'toggle-dock': wm.toggleDockWindow,
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
    'toggle-siena-aura': wm.toggleSienaAuraWindow,
    'toggle-word-alarm': wm.toggleWordAlarmWindow,
    'toggle-discord-alarm': wm.toggleDiscordAlarmWindow,
    'toggle-chat-overlay': wm.toggleChatOverlayWindow,
    'toggle-hunting-path-simulator': wm.toggleHuntingPathSimulatorWindow,
    'toggle-welcome-guide': wm.toggleWelcomeGuideWindow,
    'toggle-shout-history': wm.toggleShoutHistoryWindow,
    'toggle-stopwatch': wm.toggleStopwatchWindow,
  };

  Object.entries(toggleHandlers).forEach(([event, handler]) => {
    ipcMain.on(event, () => {
      analytics.trackEvent(event.replace(/-/g, '_'));
      handler();
    });
  });

  ipcMain.on('open-and-highlight', (_e, key: string) => {
    wm.openAndHighlightWindow(key);
  });

  // 컨텐츠 체크 리스트 조작 핸들러
  ipcMain.on('contents-toggle-item', (_e, id: string, characterId?: string) => {
    import('./contentsChecker').then(mod => mod.toggleItem(id, characterId));
  });
  ipcMain.on('contents-apply-pending', (_e, characterId: string) => {
    import('./contentsChecker').then(mod => mod.applyPendingHomeworks(characterId));
  });
  ipcMain.on('contents-clear-pending', () => {
    import('./contentsChecker').then(mod => mod.clearPendingHomeworks());
  });
  ipcMain.on('contents-update-count', (_e, id: string, characterId: string, count: number) => {
    import('./contentsChecker').then(mod => mod.updateItemCount(id, characterId, count));
  });
  ipcMain.on('contents-toggle-exclude', (_e, id: string, characterId: string) => {
    import('./contentsChecker').then(mod => mod.toggleExcludeItem(id, characterId));
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
  ipcMain.on('contents-update-item', (_e, id: string, name: string, category: string, rule: any, maxCount?: number) => {
    import('./contentsChecker').then(mod => mod.updateItem(id, name, category, rule, maxCount));
  });
  ipcMain.on('contents-add-custom', (_e, name: string, category: string, rule: any, maxCount?: number) => {
    import('./contentsChecker').then(mod => mod.addCustomItem(name, category, rule, maxCount));
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
  ipcMain.on('contents-add-character', (_e, name: string) => {
    import('./contentsChecker').then(mod => mod.addCharacter(name));
  });
  ipcMain.on('contents-remove-character', (_e, id: string) => {
    import('./contentsChecker').then(mod => mod.removeCharacter(id));
  });
  ipcMain.on('contents-rename-character', (_e, id: string, name: string) => {
    import('./contentsChecker').then(mod => mod.renameCharacter(id, name));
  });
  ipcMain.on('contents-select-character', (_e, id: string) => {
    import('./contentsChecker').then(mod => mod.selectCharacter(id));
  });

  // 특별 인수가 필요한 토글 핸들러 개별 등록
  ipcMain.on('toggle-settings', (_event, tabId?: string) => {
    const eventName = tabId ? `toggle_settings_${tabId}` : 'toggle_settings';
    analytics.trackEvent(eventName, { tabId });
    wm.toggleSettingsWindow(tabId);
  });

  ipcMain.on('open-coefficient-calculator', () => {
    wm.openCoefficientCalculatorWindow();
  });

  ipcMain.on('send-to-coefficient', (_event, item) => {
    wm.sendEquipmentToCoefficient(item);
  });

  ipcMain.on('send-to-evolution', (_event, item) => {
    wm.sendEquipmentToEvolution(item);
  });

  ipcMain.on('renderer-ready', (_event, windowKey) => {
    wm.handleRendererReady(windowKey, _event.sender);
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

  ipcMain.handle('get-game-status', async () => {
    const { getGameStatus } = await import('./pollingLoop');
    return getGameStatus();
  });

  ipcMain.on('preview-boss-sound', (_e, soundFile: string, volume: number | null, bossName: string = '미리보기') => {
    wm.sendPlaySound({ label: bossName, soundFile, volume: volume !== null ? volume : undefined, isPreview: true });
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
  ipcMain.handle('word-alarm-get-history', (_e, hours: number) => {
    return diaryDb.getWordAlarmHistory(hours || 24);
  });
  ipcMain.handle('word-alarm-get-context', (_e, alarmId: number) => {
    return diaryDb.getWordAlarmContext(alarmId);
  });
  ipcMain.on('word-alarm-delete-item', (_e, id: number) => {
    diaryDb.deleteWordAlarmHistoryItem(id);
  });
  ipcMain.on('word-alarm-clear-history', () => {
    diaryDb.clearWordAlarmHistory();
  });
  ipcMain.on('play-sound', (_e, { file, volume }) => {
    wm.sendPlaySound({ label: '미리보기', soundFile: file, volume, isPreview: true });
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

  // --- Hunting Path Simulator System ---
  ipcMain.handle('get-hunting-grounds', () => {
    return diaryDb.getHuntingGrounds();
  });
  ipcMain.handle('get-hunting-path', (_e, groundId: string) => {
    if (typeof groundId !== 'string') return [];
    return diaryDb.getHuntingPath(groundId);
  });
  ipcMain.on('save-hunting-path', (_e, groundId: string, points: Array<[number, number, string?]>) => {
    if (typeof groundId !== 'string' || !Array.isArray(points)) return;
    diaryDb.saveHuntingPath(groundId, points);
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

  // 어벤던로드 상태 요청
  ipcMain.handle('abandoned-get-state', async () => {
    const { chatLogProcessor } = await import('./chatLogProcessor');
    return chatLogProcessor.getAbandonedState();
  });

  // 어벤던로드 오버레이 강제 표시/숨김
  ipcMain.on('abandoned-force-visible', async (_e, visible: boolean) => {
    const { chatLogProcessor } = await import('./chatLogProcessor');
    chatLogProcessor.forceAbandonedVisible(visible);
  });

  // 어벤던로드 추적기능 활성/비활성
  ipcMain.on('abandoned-set-enabled', async (_e, enabled: boolean) => {
    const { abandonedTracker } = await import('./abandonedTracker');
    abandonedTracker.setEnabled(enabled);
  });

  // 어벤던로드 즉시 숨김 (isActive 유지, 다음 입장 로그 시 재표시)
  ipcMain.on('abandoned-hide-now', () => {
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) win.webContents.send('abandoned-hide-now');
    });
  });

  // 어벤던로드 자동 숨김 시간 설정
  ipcMain.on('set-abandoned-autohide', (_e, minutes: number) => {
    config.save({ abandonedAutoHideMinutes: minutes });
  });

  ipcMain.on('close-app', () => { app.quit(); });

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
  ipcMain.on('scam-close-session', (_e, filePath: string) => scam.closeSession(filePath));
  ipcMain.on('scam-trigger-analyze', (_e, filePath: string) => scam.triggerAnalyze(filePath));
  ipcMain.on('scam-stop-server', () => scam.stopServer());
  ipcMain.handle('scam-inject-test', (_e, scenario?: string) => scam.injectTestSession(scenario));
  ipcMain.handle('scam-download-binary-variant', async (event, gpuChoice: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    try {
      scam.stopServer();
      const gpuResult = await scam.buildGpuResultForUserChoice(gpuChoice);
      await scam.downloadServerBinary(gpuResult, (pct) => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('scam-progress', pct);
        }
      });
      return { success: true, binaryVariant: gpuResult.binaryVariant };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  });
  ipcMain.handle('scam-download-model', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    try {
      await scam.downloadModel((pct) => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('scam-progress', pct);
        }
      });
      return { success: true };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  });

  // 버프 타이머 테스트 — 모든 감지 대상 버프 강제 활성화
  ipcMain.on('buff-timer-test', (event, seconds?: number) => {
   const TEST_BUFFS = [
     'exp_heart', 'rare_heart', 'stat_exorcist', 'stat_sami_sunryeong',
     'rare_loto', 'util_ampoule', 'dmg_izabel', 'util_illumination',
     'insight_elixir_large', 'insight_elixir_special',
     'exp_eos_supreme', 'exp_sweetpotato_legend', 'exp_earlybird'
   ];
   const durationMs = (seconds && seconds > 0) ? seconds * 1000 : undefined;
   TEST_BUFFS.forEach(buffId => buffTimerManager.activateBuff(buffId, 'test', durationMs));
  });
  // 버프 타이머 테스트 종료 — 테스트 버프 제거
  ipcMain.on('buff-timer-clear-test', () => {
    buffTimerManager.clearTestBuffs();
  });
  // 버프 타이머 모든 버프 삭제
  ipcMain.on('buff-timer-clear-all', () => {
    buffTimerManager.clearAllBuffs();
  });
  // 버프 타이머 강제 비활성화
  ipcMain.on('buff-timer-deactivate', (_e, buffId: string) => {
    buffTimerManager.deactivateBuff(buffId);
  });
  // XP 세션 제어
  ipcMain.handle('xp-get-stats', async () => {
    const mod = await import('./chatLogProcessor');
    return mod.chatLogProcessor.getStats();
  });
  ipcMain.on('xp-reset', () => {
    import('./chatLogProcessor').then(mod => mod.chatLogProcessor.resetXp());
  });
  ipcMain.on('xp-start-session', () => {
    import('./xpTracker').then(mod => mod.xpTracker.startSession());
  });
  ipcMain.on('xp-stop-session', () => {
    import('./xpTracker').then(mod => mod.xpTracker.stopSession());
  });

  // 어벤던로드 세션 제어
  ipcMain.on('abandoned-reset', () => {
    import('./chatLogProcessor').then(mod => mod.chatLogProcessor.resetAbandoned());
  });

  // 챗로그 감시 재기동
  ipcMain.on('start-chat-log-watch', () => {
    chatLogManager.start();
    broadcastChatLogStatus();
  });

  // 챗로그 경로 유효성 검사
  ipcMain.handle('check-chat-log-status', () => {
    const cfg = config.load();
    const chatLogPath = cfg.chatLogPath;
    if (!chatLogPath) return false;
    
    try {
      if (!fs.existsSync(chatLogPath)) return false;
      const stat = fs.statSync(chatLogPath);
      if (!stat.isDirectory()) return false;
      
      const files = fs.readdirSync(chatLogPath);
      const hasChatLog = files.some(file => file.startsWith('TWChatLog_') && file.endsWith('.html'));
      return hasChatLog;
    } catch (e) {
      return false;
    }
  });

  ipcMain.on('request-game-focus', () => {
    setTimeout(() => {
      tracker.focusGameWindow();
    }, FOCUS_RESTORE_DELAY_MS);
  });

  ipcMain.handle('test-discord-webhook', async (_e, webhookUrl: string) => {
    try {
      await discordNotifier.sendTest(webhookUrl);
      return true;
    } catch (e) {
      console.error('[DISCORD TEST ERROR]', e);
      return false;
    }
  });

  // --- Chat Overlay IPC ---
  ipcMain.handle('chat-get-history', async (_e, category: string) => {
    const { chatLogProcessor } = await import('./chatLogProcessor');
    const { chatLogManager } = await import('./chatLogManager');
    chatLogManager.resetLastReadIndex(category);
    return chatLogProcessor.getChatHistory(category);
  });

  ipcMain.handle('chat-get-more-history', async (_e, category: string) => {
    const { chatLogManager } = await import('./chatLogManager');
    return await chatLogManager.getMoreHistory(category);
  });

  ipcMain.on('chat-open-today-log', async () => {
    const { chatLogManager } = await import('./chatLogManager');
    const fs = await import('fs');
    const filePath = chatLogManager.getTodayFilePath();
    if (filePath && fs.existsSync(filePath)) {
      shell.openPath(filePath);
    }
  });

  ipcMain.on('toggle-chat-overlay-sub', (_e, subNum: number) => {
    wm.toggleSubWindow(subNum as 1 | 2);
  });
  ipcMain.handle('chat-fetch-eta-rankings', async () => {
    const { etaCacheManager } = await import('./etaCacheManager');
    return await etaCacheManager.fetchRemoteData(true);
  });
  ipcMain.handle('chat-get-eta-cache-status', async () => {
    const { etaCacheManager } = await import('./etaCacheManager');
    return etaCacheManager.getCacheStatus();
  });

  ipcMain.on('inject-test-chat', (_e, rawLine: string) => {
    chatParser.parseLine(rawLine);
  });

  // --- Alarm Logs IPC ---
  ipcMain.handle('alarm-get-logs', (_e, limit?: number) => {
    return diaryDb.getAlarmLogs(limit);
  });
  ipcMain.on('alarm-clear-logs', () => {
    diaryDb.clearAlarmLogs();
  });

  // --- Timer IPC ---
  ipcMain.on('timer-save-record', (_e, record: any) => {
    diaryDb.addTimerRecord(record);
  });
  ipcMain.handle('timer-get-records', () => {
    return diaryDb.getTimerRecords();
  });
  ipcMain.on('timer-update-title', (_e, id: number, title: string) => {
    diaryDb.updateTimerRecordTitle(id, title);
  });
  ipcMain.on('timer-update-series-core', (
    _e, 
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
  ) => {
    diaryDb.updateTimerRecordSeriesAndCore(
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
    );
  });
  ipcMain.on('timer-delete-record', (_e, id: number) => {
    diaryDb.deleteTimerRecord(id);
  });
  ipcMain.on('timer-toggle-session', (event, state: 'start' | 'stop') => {
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed() && win.webContents !== event.sender) {
        win.webContents.send('timer-toggle', state);
      }
    });
  });
}
