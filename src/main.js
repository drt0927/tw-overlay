/**
 * TW-Overlay 메인 프로세스 진입점
 * 각 모듈을 초기화하고 앱 라이프사이클을 관리하는 오케스트레이터
 */
const { app, globalShortcut } = require('electron');
const { POLLING_FAST_MS, POLLING_SLOW_MS, POLLING_COOLDOWN } = require('./modules/constants');
const { log } = require('./modules/logger');
const config = require('./modules/config');
const tracker = require('./modules/tracker');
const wm = require('./modules/windowManager');
const ipcHandlers = require('./modules/ipcHandlers');
const gallery = require('./modules/galleryMonitor');

// ─── Chromium 최적화 플래그 ───
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=256');
app.commandLine.appendSwitch('disk-cache-size', '52428800');
app.commandLine.appendSwitch('disable-gpu-process-for-vfx');
app.commandLine.appendSwitch('disable-breakpad');
app.commandLine.appendSwitch('disable-software-rasterizer');

// ─── 앱 상태 ───
app.isQuitting = false;
let pollingTimer = null;
let gameWasEverFound = false;

// ─── 적응형 폴링 루프 ───
// 창 위치 변화 시 빠르게(50ms), 정지 시 느리게(500ms) 폴링
function startPolling() {
  let lastResult = '';
  let stableCount = 0; // 변화 없음 연속 횟수

  async function poll() {
    if (app.isQuitting) return;

    const currentRect = await tracker.queryGameRect();
    let nextDelay = stableCount >= POLLING_COOLDOWN ? POLLING_SLOW_MS : POLLING_FAST_MS;

    if (currentRect === undefined) {
      // 이전 쿼리 진행 중 → 잠시 후 재시도
      pollingTimer = setTimeout(poll, POLLING_FAST_MS);
      return;
    }

    // 게임 프로세스 종료 감지
    if (currentRect && currentRect.notRunning) {
      if (gameWasEverFound) {
        log('[APP] 게임 프로세스 종료 감지 - 앱 종료');
        app.quit();
        return;
      }
      wm.hideAll();
      stableCount = POLLING_COOLDOWN; // 게임 없으면 slow
      pollingTimer = setTimeout(poll, POLLING_SLOW_MS);
      return;
    }

    // 게임창 없거나 최소화
    if (!currentRect || currentRect.x <= -10000) {
      const mainWin = wm.getMainWindow();
      if (mainWin && mainWin.isVisible()) {
        wm.hideAll();
        lastResult = 'hidden';
      }
      stableCount = POLLING_COOLDOWN;
      pollingTimer = setTimeout(poll, POLLING_SLOW_MS);
      return;
    }

    // 게임 창 정상 감지
    gameWasEverFound = true;

    const currentResult = JSON.stringify(currentRect);
    const mainWin = wm.getMainWindow();
    if (currentResult !== lastResult || (mainWin && !mainWin.isVisible())) {
      wm.syncOverlay(currentRect);
      lastResult = currentResult;
      stableCount = 0; // 변화 감지 → fast 모드
    } else {
      stableCount++;
    }

    nextDelay = stableCount >= POLLING_COOLDOWN ? POLLING_SLOW_MS : POLLING_FAST_MS;
    pollingTimer = setTimeout(poll, nextDelay);
  }

  poll();
}

// ─── 단축키 등록 ───
function registerShortcuts() {
  globalShortcut.register('CommandOrControl+Shift+T', () => {
    wm.toggleClickThrough(() => tracker.focusGameWindow());
  });
}

// ─── 앱 라이프사이클 ───
app.whenReady().then(() => {
  wm.createWindows();
  ipcHandlers.register();
  registerShortcuts();
  tracker.start();
  startPolling();
  // 갤러리 모니터 시작
  gallery.start(wm.getMainWindow(), wm.getSidebarWindow());
  log('[APP] 앱 시작 완료');
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (config.hasPending()) config.saveImmediate();
  if (pollingTimer) { clearTimeout(pollingTimer); pollingTimer = null; }
  gallery.stop();
  tracker.stop();
  log('[APP] 정상 종료');
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
