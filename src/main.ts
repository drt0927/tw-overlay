/**
 * TW-Overlay 메인 프로세스 - 1.0.5 정식 복구 버전
 */
import { app, globalShortcut } from 'electron';
import { POLLING_FAST_MS, POLLING_SLOW_MS, POLLING_COOLDOWN } from './modules/constants';
import { log } from './modules/logger';
import * as config from './modules/config';
import * as tracker from './modules/tracker';
import * as wm from './modules/windowManager';
import * as ipcHandlers from './modules/ipcHandlers';
import * as gallery from './modules/galleryMonitor';
import * as tray from './modules/tray';

app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

(app as any).isQuitting = false;
let pollingTimer: NodeJS.Timeout | null = null;
let gameWasEverFound = false;

function registerShortcuts(): void {
  globalShortcut.unregisterAll();
  globalShortcut.register('CommandOrControl+Shift+T', () => {
    wm.toggleClickThrough();
    tracker.focusGameWindow();
  });
}

function startPolling(): void {
  let lastResult = '';
  let stableCount = 0;

  async function poll(): Promise<void> {
    if ((app as any).isQuitting) return;
    const currentRect = await tracker.queryGameRect();
    let nextDelay = stableCount >= POLLING_COOLDOWN ? POLLING_SLOW_MS : POLLING_FAST_MS;

    if (currentRect === undefined) {
      pollingTimer = setTimeout(poll, POLLING_FAST_MS);
      return;
    }

    if (currentRect && (currentRect as any).notRunning) {
      if (gameWasEverFound) { app.quit(); return; }
      wm.hideAll();
      stableCount = POLLING_COOLDOWN;
      pollingTimer = setTimeout(poll, POLLING_SLOW_MS);
      return;
    }

    if (!currentRect || currentRect.x <= -10000) {
      wm.hideAll();
      stableCount = POLLING_COOLDOWN;
      pollingTimer = setTimeout(poll, POLLING_SLOW_MS);
      return;
    }

    gameWasEverFound = true;
    const currentResult = JSON.stringify(currentRect);
    if (currentResult !== lastResult || (wm.getMainWindow() && !wm.getMainWindow()?.isVisible())) {
      wm.syncOverlay(currentRect);
      lastResult = currentResult;
      stableCount = 0;
    } else {
      stableCount++;
    }
    nextDelay = stableCount >= POLLING_COOLDOWN ? POLLING_SLOW_MS : POLLING_FAST_MS;
    pollingTimer = setTimeout(poll, nextDelay);
  }
  poll();
}

app.whenReady().then(() => {
  const sidebar = wm.createMainWindow(); 
  tray.createTray();
  ipcHandlers.register();
  registerShortcuts();
  tracker.start();
  startPolling();
  
  const cfg = config.load();
  if (cfg.overlayVisible !== false) wm.setOverlayVisible(true);
  gallery.start(wm.getOverlayWindow() as any, sidebar);
});

app.on('before-quit', () => {
  (app as any).isQuitting = true;
  if (config.hasPending()) config.saveImmediate();
  gallery.stop();
  tray.destroyTray();
  tracker.stop();
});

app.on('window-all-closed', () => app.quit());
