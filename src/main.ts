/**
 * TW-Overlay 메인 프로세스 - 1.0.7 안정화 빌드
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
import { setupUpdater } from './modules/updater';

log(`[BOOT] Application process started at ${new Date().toISOString()}`);

app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

(app as any).isQuitting = false;
let pollingTimer: NodeJS.Timeout | null = null;
let gameWasEverFound = false;

// ─── 중복 실행 방지 ───
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // 두 번째 인스턴스 실행 시도 시 기존 창 활성화
    const mainWin = wm.getMainWindow();
    if (mainWin) {
      if (mainWin.isMinimized()) mainWin.restore();
      mainWin.show();
      mainWin.focus();
    }
  });
}

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
  // 1. 즉시 스플래시 화면 표시
  wm.createSplashWindow();

  // 2. 초기화 로직 즉시 실행
  const sidebar = wm.createMainWindow(); 
  tray.createTray();
  ipcHandlers.register();
  registerShortcuts();
  
  // 3. 트래커 및 폴링 즉시 시작
  tracker.start();
  startPolling();

  // 4. 업데이트 체크는 리소스 분산을 위해 약간의 지연 유지
  setTimeout(() => {
    setupUpdater(sidebar);
  }, 5000); 

  const cfg = config.load();
  if (cfg.overlayVisible !== false) wm.setOverlayVisible(true);

  // 갤러리 모니터 시작 (overlay는 아직 미생성이므로 null 전달)
  gallery.start(null, sidebar);

  // 오버레이/갤러리 창 준비 완료 시 갤러리 모니터에 참조 업데이트
  wm.onOverlayWindowReady(() => {
    gallery.updateWindows(wm.getOverlayWindow(), wm.getMainWindow(), wm.getGalleryWindow());
  });
});

app.on('before-quit', () => {
  (app as any).isQuitting = true;
  if (config.hasPending()) config.saveImmediate();
  gallery.stop();
  tray.destroyTray();
  tracker.stop();
});

app.on('window-all-closed', () => app.quit());
