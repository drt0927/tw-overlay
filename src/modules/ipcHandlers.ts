/**
 * IPC 이벤트 핸들러 모듈 - 1.0.8 안정화 빌드
 */
import { ipcMain, shell, app, BrowserWindow } from 'electron';
import * as config from './config';
import * as wm from './windowManager';
import * as gallery from './galleryMonitor';
import screenWatcher from './screenWatcher';

export function register(): void {
  // 순환 참조 회피: windowManager에서 감시 중지 시 콜백으로 screenWatcher.stop() 호출
  wm.onScreenWatcherStop(() => {
    screenWatcher.stop();
  });

  ipcMain.on('screen-watcher-toggle', (_e, enabled: boolean) => {
    if (enabled) {
      screenWatcher.start();
      wm.setScreenWatching(true);
    } else {
      wm.setScreenWatching(false);
    }
  });

  ipcMain.on('set-ignore-mouse-events', (event, ignore: boolean, options: any) => {
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
    wm.setOverlayVisible(true, t);
  });

  ipcMain.on('go-home', () => {
    const cfg = config.load();
    wm.setOverlayVisible(true, cfg.homeUrl);
  });

  ipcMain.on('apply-settings', (_e, newSettings: any) => {
    wm.applySettings(newSettings);
    if (newSettings.autoLaunch !== undefined) {
      app.setLoginItemSettings({ openAtLogin: newSettings.autoLaunch, path: app.getPath('exe') });
    }
  });

  ipcMain.on('toggle-settings', () => { wm.toggleSettingsWindow(); });
  ipcMain.on('toggle-gallery', () => { wm.toggleGalleryWindow(); });
  ipcMain.on('toggle-abbreviation', () => { wm.toggleAbbreviationWindow(); });
  ipcMain.on('toggle-buffs', () => { wm.toggleBuffsWindow(); });
  ipcMain.on('toggle-boss-settings', () => { wm.toggleBossSettingsWindow(); });
  ipcMain.on('toggle-monitor-zone', () => { wm.toggleMonitorZone(); });
  ipcMain.on('toggle-sidebar', () => { wm.toggleSidebar(); });
  ipcMain.on('toggle-overlay', () => { wm.toggleOverlay(); });
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

  ipcMain.on('open-external', (_e, url: string) => { if (url) shell.openExternal(url); });

  ipcMain.on('preview-boss-sound', (_e, soundFile: string, volume: number | null) => {
    const sidebar = wm.getMainWindow();
    if (sidebar) sidebar.webContents.send('play-boss-sound', { bossName: '미리보기', soundFile, volume });
  });

  ipcMain.on('save-quick-slots', (_e, slots: any[]) => {
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

  ipcMain.on('close-app', () => { app.quit(); });
}
