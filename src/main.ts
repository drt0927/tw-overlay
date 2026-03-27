import { app, globalShortcut } from 'electron';
import {
  FOCUS_DELAY_MS,
  appState
} from './modules/constants';
import { log } from './modules/logger';
import * as config from './modules/config';
import * as tracker from './modules/tracker';
import * as wm from './modules/windowManager';
import * as ipcHandlers from './modules/ipcHandlers';
import * as gallery from './modules/galleryMonitor';
import * as tray from './modules/tray';
import * as bossNotifier from './modules/bossNotifier';
import * as customNotifier from './modules/customNotifier';
import { setupUpdater } from './modules/updater';
import * as pollingLoop from './modules/pollingLoop';
import { setupAutoStart } from './modules/autoStart';
import * as trade from './modules/tradeMonitor';
import * as sm from './modules/shortcutManager';
import { analytics } from './modules/analytics';

log(`[BOOT] Application process started at ${new Date().toISOString()}`);

app.setAppUserModelId('com.filbertlab.twoverlay');

app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-gpu-sandbox');

appState.isQuitting = false;

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const mainWin = wm.getMainWindow();
    if (mainWin) {
      if (mainWin.isMinimized()) mainWin.restore();
      mainWin.show();
      mainWin.focus();
    }
  });
}

app.whenReady().then(() => {
  wm.createSplashWindow();

  const sidebar = wm.createMainWindow();
  tray.createTray();

  analytics.trackEvent('app_open');
  analytics.startHeartbeat(); // 기본 1시간 간격 생존신고(ping) 시작

  ipcHandlers.register();

  tracker.start();
  tracker.setForegroundChangeListener((isGameFocused, focusedHwndStr) => {
    const electronHwnds = wm.getAllWindowHwnds();
    const isAppFocused = electronHwnds.includes(focusedHwndStr);
    sm.updateFocusState(isGameFocused || isAppFocused);
  });

  // DEV 테스트: mandatory 업데이트 시뮬레이션
  // wm.setMandatoryUpdateLock(true);
  // setupUpdater(sidebar);

  pollingLoop.start();
  bossNotifier.start();
  customNotifier.start();

  setTimeout(() => {
    setupUpdater(sidebar);
  }, 5000);

  const cfg = config.load();
  if (cfg.overlayVisible !== false) wm.setOverlayVisible(true);

  if (cfg.autoLaunch !== undefined) {
    setupAutoStart(cfg.autoLaunch);
  }

  gallery.start(null, sidebar);
  trade.start(sidebar);

  wm.onOverlayWindowReady(() => {
    gallery.updateWindows(wm.getOverlayWindow(), wm.getMainWindow(), wm.getGalleryWindow());
    trade.updateWindows(wm.getMainWindow(), wm.getTradeWindow());
  });
});

app.on('before-quit', () => {
  appState.isQuitting = true;
  if (config.hasPending()) config.saveImmediate();
  pollingLoop.stop();
  bossNotifier.stop();
  customNotifier.stop();
  gallery.stop();
  trade.stop();
  tray.destroyTray();
  tracker.stop();
  analytics.stopHeartbeat();
});

app.on('window-all-closed', () => app.quit());
