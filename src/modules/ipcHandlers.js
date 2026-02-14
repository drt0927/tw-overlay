/**
 * IPC 이벤트 핸들러 모듈 - 렌더러 프로세스 ↔ 메인 프로세스 통신
 */
const { ipcMain, shell, app, BrowserWindow } = require('electron');
const config = require('./config');
const wm = require('./windowManager');
const gallery = require('./galleryMonitor');

function register() {
  // 사이드바 투명 영역 클릭 투과용
  ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.setIgnoreMouseEvents(ignore, options || {});
  });

  ipcMain.on('set-opacity', (_e, opacity) => {
    const win = wm.getMainWindow();
    if (win) win.setOpacity(opacity);
    config.save({ opacity });
  });

  ipcMain.on('navigate', (_e, url) => {
    const view = wm.getView();
    if (!view) return;
    let t = url.trim();
    if (!t.startsWith('http')) t = 'https://' + t;
    view.webContents.loadURL(t);
  });

  ipcMain.on('go-home', () => {
    const view = wm.getView();
    if (!view) return;
    const cfg = config.load();
    view.webContents.loadURL(cfg.homeUrl);
  });

  ipcMain.on('apply-settings', (_e, newSettings) => {
    wm.applySettings(newSettings);
  });

  ipcMain.on('toggle-settings', (_e, isOpen) => {
    wm.adjustViewForPanel(isOpen);
  });

  ipcMain.on('toggle-menu', (_e, isOpen) => {
    wm.adjustViewForPanel(isOpen);
  });

  ipcMain.on('open-external', (_e, url) => {
    if (url) shell.openExternal(url);
  });

  ipcMain.on('toggle-sidebar', () => {
    wm.toggleSidebar();
  });

  ipcMain.on('save-quick-slots', (_e, slots) => {
    config.saveImmediate({ quickSlots: slots });
    // 사이드바에 갱신된 설정 즉시 전송
    const sidebar = wm.getSidebarWindow();
    if (sidebar) sidebar.webContents.send('config-data', config.load());
  });

  ipcMain.on('sidebar-settings-mode', (_e, isOpen) => {
    wm.setSidebarSettingsMode(isOpen);
  });

  // ─── 갤러리 모니터 ───
  ipcMain.handle('gallery-add-watch', async (_e, postNo) => {
    return await gallery.addWatch(postNo);
  });

  ipcMain.on('gallery-remove-watch', (_e, postNo) => {
    gallery.removeWatch(postNo);
  });

  ipcMain.handle('gallery-get-watched', async () => {
    return gallery.getWatchedPosts();
  });

  ipcMain.handle('gallery-force-check', async () => {
    await gallery.forceCheck();
    return gallery.getWatchedPosts();
  });

  ipcMain.handle('gallery-get-notify', () => {
    return gallery.getNotifyEnabled();
  });

  ipcMain.on('gallery-set-notify', (_e, enabled) => {
    gallery.setNotifyEnabled(enabled);
  });

  ipcMain.on('gallery-open-post', (_e, postNo) => {
    const { shell } = require('electron');
    shell.openExternal(`https://gall.dcinside.com/mini/board/view/?id=talesweaver&no=${postNo}`);
  });

  ipcMain.on('close-app', () => {
    app.quit();
  });
}

module.exports = { register };
