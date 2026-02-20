/**
 * TW-Overlay 메인 프로세스
 */
import { app, globalShortcut, Notification } from 'electron';
import {
  POLLING_FAST_MS,
  POLLING_STABLE_MS,
  POLLING_UNFOCUSED_MS,
  POLLING_MINIMIZED_MS,
  POLLING_IDLE_MS,
  STABLE_THRESHOLD_COUNT,
  appState
} from './modules/constants';
import { log } from './modules/logger';
import * as config from './modules/config';
import * as tracker from './modules/tracker';
import * as wm from './modules/windowManager';
import * as ipcHandlers from './modules/ipcHandlers';
import * as gallery from './modules/galleryMonitor';
import * as tray from './modules/tray';
import { setupUpdater } from './modules/updater';
import screenWatcher from './modules/screenWatcher';
import * as path from 'path';
import os from 'os';

log(`[BOOT] Application process started at ${new Date().toISOString()}`);

// 앱 자체의 우선순위를 낮추어 게임에 리소스 양보
try {
  os.setPriority(process.pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
  log(`[BOOT] App priority set to BelowNormal`);
} catch (e) {
  log(`[BOOT] Failed to set app priority: ${e}`);
}

// 윈도우 네이티브 알림을 위한 AppUserModelId 설정
app.setAppUserModelId('com.filbertlab.twoverlay');

app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-features', 'WebRtcAllowWgcDesktopCapturer');
app.commandLine.appendSwitch('disable-gpu-sandbox');

appState.isQuitting = false;
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
  let isBoosted = false;

  async function poll(): Promise<void> {
    if (appState.isQuitting) return;
    
    const currentRect = await tracker.queryGameRect();
    let nextDelay = POLLING_FAST_MS;

    // 1. 응답이 없거나 상태 메시지(string)인 경우 예외 처리
    if (currentRect === undefined || typeof currentRect === 'string') {
      pollingTimer = setTimeout(poll, POLLING_FAST_MS);
      return;
    }

    if (currentRect && 'notRunning' in currentRect) {
      if (gameWasEverFound) { app.quit(); return; }
      wm.hideAll();
      stableCount = 0;
      isBoosted = false;
      pollingTimer = setTimeout(poll, POLLING_IDLE_MS);
      return;
    }

    // 2. 최소화 상태 확인
    if (!currentRect || (currentRect && 'x' in currentRect && currentRect.x <= -10000)) {
      if (currentRect === null && wm.getScreenWatching()) {
        log('[POLL] Game minimized. Auto-stopping ScreenWatcher.');
        wm.setScreenWatching(false);
        new Notification({
          title: 'TW-Overlay 알림',
          body: '게임 창이 최소화되어 장판 감시를 종료합니다.',
          icon: path.join(__dirname, 'icons', 'icon.ico')
        }).show();
      }
      wm.hideAll();
      stableCount = 0;
      pollingTimer = setTimeout(poll, POLLING_MINIMIZED_MS);
      return;
    }

    // 3. 게임 발견 시 최초 1회 성능 강화(우선순위 상향) 시도
    gameWasEverFound = true;
    if (!isBoosted) {
      tracker.boostGameProcess().then(res => {
        if (res === 'BOOSTED' || res === 'ALREADY_HIGH') {
          log(`[POLL] Game process priority elevated: ${res}`);
          isBoosted = true;
        }
      });
    }

    // 4. 위치 동기화 및 가변 폴링 로직
    const currentResult = JSON.stringify(currentRect);
    const mainWin = wm.getMainWindow();
    const isVisible = mainWin && mainWin.isVisible();

    if (currentResult !== lastResult || !isVisible) {
      // 위치가 바뀌었거나 사이드바가 안 보이면 즉시 동기화 (빠른 폴링)
      wm.syncOverlay(currentRect);
      lastResult = currentResult;
      stableCount = 0;
      nextDelay = POLLING_FAST_MS;
    } else {
      // 위치가 고정된 상태
      stableCount++;
      if (stableCount >= STABLE_THRESHOLD_COUNT) {
        // 1초(10프레임) 이상 고정 시 주기를 늘림 (사용자 제안 반영)
        nextDelay = POLLING_STABLE_MS;
      } else {
        nextDelay = POLLING_FAST_MS;
      }
    }

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

  // 화면 감지기 (보라색 장판)
  screenWatcher.on('danger-detected', ({ density }) => {
    // 오버레이 창에 알림
    const overlayWin = wm.getOverlayWindow();
    if (overlayWin && !overlayWin.isDestroyed()) {
      overlayWin.webContents.send('danger-alert', density);
    }
    // 감시 구역 창에 알림 (소리 재생용)
    const monitorZone = wm.getMonitorZoneWindow();
    if (monitorZone && !monitorZone.isDestroyed()) {
      monitorZone.webContents.send('danger-alert', density);
    }
  });

  screenWatcher.on('safe', () => {
    const overlayWin = wm.getOverlayWindow();
    if (overlayWin && !overlayWin.isDestroyed()) {
      overlayWin.webContents.send('danger-cleared');
    }
    const monitorZone = wm.getMonitorZoneWindow();
    if (monitorZone && !monitorZone.isDestroyed()) {
      monitorZone.webContents.send('danger-cleared');
    }
  });
});

app.on('before-quit', () => {
  appState.isQuitting = true;
  screenWatcher.stop();
  if (config.hasPending()) config.saveImmediate();
  gallery.stop();
  tray.destroyTray();
  tracker.stop();
});

app.on('window-all-closed', () => app.quit());
