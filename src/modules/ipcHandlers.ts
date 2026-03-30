/**
 * IPC 이벤트 핸들러 모듈
 */
import { ipcMain, shell, app, BrowserWindow } from 'electron';
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

let _registered = false;

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
    'toggle-diary': wm.toggleDiaryWindow,
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
    if (sidebar) sidebar.webContents.send('play-boss-sound', { bossName, soundFile, volume });
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
  ipcMain.on('diary-add-activity', (_e, date: string, time: string, type: 'boss' | 'calc' | 'memo' | 'loot' | 'homework', content: string) => {
    if (!isValidDate(date) || typeof time !== 'string' || !validActivityTypes.includes(type) || typeof content !== 'string') return;
    diaryDb.addActivityLog(date, time, type, content);
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

  ipcMain.on('close-app', () => { app.quit(); });
}
