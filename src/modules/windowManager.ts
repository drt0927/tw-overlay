/**
 * 창 관리 모듈 - WebContentsView + 동적 Z-Order 스택 버전
 */
import { BrowserWindow, WebContentsView, screen, globalShortcut } from 'electron';
import * as path from 'path';
import { MIN_W, MIN_H, IS_DEV, WindowPosition, SIDEBAR_HEIGHT, SIDEBAR_WIDTH, OVERLAY_TOOLBAR_HEIGHT, GameRect, POSITION_THRESHOLD, AppConfig } from './constants';
import * as config from './config';
import * as bossNotifier from './bossNotifier';
import * as gallery from './galleryMonitor';
import * as trade from './tradeMonitor';
import * as tracker from './tracker';
import { log } from './logger';
import { buffTimerManager } from './buffTimerManager';
import * as fullscreenManager from './fullscreenManager';

// --- 상태 관리 ---
let activeWindowsStack: BrowserWindow[] = [];

/** 공통 창 생성 옵션 (DRY) */
function getStandardOptions(width: number, height: number, extraProps: Electron.BrowserWindowConstructorOptions = {}): Electron.BrowserWindowConstructorOptions {
  return {
    width, height,
    frame: false, transparent: true, alwaysOnTop: false, show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
      backgroundThrottling: false,
      ...extraProps.webPreferences
    },
    ...extraProps
  };
}

function pushToStack(win: BrowserWindow | null): void {
  if (!win || win.isDestroyed()) return;
  activeWindowsStack = activeWindowsStack.filter(w => w !== win && !w.isDestroyed());
  activeWindowsStack.push(win);
}

function removeFromStack(win: BrowserWindow | null): void {
  activeWindowsStack = activeWindowsStack.filter(w => w !== win);
}

let focusDebounceTimer: NodeJS.Timeout | null = null;

function attachStackListeners(win: BrowserWindow): void {
  win.on('focus', () => {
    pushToStack(win);
    if (focusDebounceTimer) clearTimeout(focusDebounceTimer);
    focusDebounceTimer = setTimeout(() => {
      bringGameAndOverlaysToTop();
    }, 50);
  });
  win.on('show', () => pushToStack(win));
  win.on('closed', () => removeFromStack(win));
  pushToStack(win);
}

export function isFullscreenMode(): boolean {
  return _isFullscreenMode;
}

export function getFullscreenShortcutWarning(): string | null { return _fullscreenShortcutWarning; }

export function setFullscreenMode(active: boolean): void {
  _isFullscreenMode = active;
  if (active) {
    const failedKeys: string[] = [];
    if (!globalShortcut.isRegistered('Ctrl+Shift+F')) {
      if (!globalShortcut.register('Ctrl+Shift+F', stopFullscreenForCleanup)) {
        log('[WM] Ctrl+Shift+F 단축키 등록 실패 (다른 앱이 선점 중일 수 있음)');
        failedKeys.push('Ctrl+Shift+F');
      }
    }
    if (!globalShortcut.isRegistered('Ctrl+Shift+D')) {
      if (!globalShortcut.register('Ctrl+Shift+D', toggleFullscreenDock)) {
        log('[WM] Ctrl+Shift+D 단축키 등록 실패 (다른 앱이 선점 중일 수 있음)');
        failedKeys.push('Ctrl+Shift+D');
      }
    }
    _fullscreenShortcutWarning = failedKeys.length > 0
      ? `단축키 등록 실패 (${failedKeys.join(', ')}). 전체화면 종료는 독의 종료 버튼을 사용하세요.`
      : null;
    _prevMainAlwaysOnTop = mainWindow && !mainWindow.isDestroyed() ? mainWindow.isAlwaysOnTop() : false;
    _prevOverlayAlwaysOnTop = overlayWindow && !overlayWindow.isDestroyed() ? overlayWindow.isAlwaysOnTop() : false;
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.setAlwaysOnTop(true, 'screen-saver');           // screen-saver band: TOPMOST보다 상위
      overlayWindow.setIgnoreMouseEvents(true, { forward: true }); // 기본: 마우스 투과
      tracker.setWindowCaptureExclusion(overlayWindow.getNativeWindowHandle(), true);
      // cppHwnd를 owner로 설정 → TOPMOST 그룹 내에서 cppHwnd 위 보장 (gameOverlayWindow와 동일)
      const scalingHwnd = fullscreenManager.getScalingHwnd();
      if (scalingHwnd) tracker.setWindowOwner(overlayWindow.getNativeWindowHandle(), scalingHwnd);
    }
    _overlayMouseThrough = true;
    // 열려있는 피처 창 처리: fullscreen 창은 onClose 부작용 방지를 위해 hide, 나머지는 close
    Object.entries(windowRegistry).forEach(([key, winCfg]) => {
      if (key === 'gameOverlay' || !winCfg.ref || winCfg.ref.isDestroyed()) return;
      if (key === 'fullscreen') {
        winCfg.ref.hide();
      } else {
        winCfg.ref.close();
      }
    });
  } else {
    globalShortcut.unregister('Ctrl+Shift+F');
    globalShortcut.unregister('Ctrl+Shift+D');
    _fullscreenShortcutWarning = null;
    // _dockOpenedWindows를 먼저 스냅샷 후 비워야 onClose 콜백에서 closeDock() 재진입 방지
    const keysToClose = [..._dockOpenedWindows];
    _dockOpenedWindows.clear();
    _dockCascadeCounter = 0;
    keysToClose.forEach(key => {
      const winCfg = windowRegistry[key];
      if (winCfg?.ref && !winCfg.ref.isDestroyed()) winCfg.ref.close();
    });
    if (fullscreenDockWindow && !fullscreenDockWindow.isDestroyed()) {
      fullscreenDockWindow.close();
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setAlwaysOnTop(_prevMainAlwaysOnTop);
      mainWindow.show();
    }
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      if (_prevOverlayAlwaysOnTop) overlayWindow.setAlwaysOnTop(true, 'screen-saver');
      else overlayWindow.setAlwaysOnTop(false);
      overlayWindow.setIgnoreMouseEvents(false);
      tracker.setWindowCaptureExclusion(overlayWindow.getNativeWindowHandle(), false);
    }
    // _overlayMouseThrough는 다음 풀스크린 진입의 초기 상태. 여기서는 true(투과)로 리셋만.
    _overlayMouseThrough = true;
    // 풀스크린 진입 시 숨겨뒀던 fullscreen 컨트롤 창 복원
    const hiddenFsWin = windowRegistry['fullscreen']?.ref;
    if (hiddenFsWin && !hiddenFsWin.isDestroyed()) {
      hiddenFsWin.show();
      hiddenFsWin.focus();
    }
  }
  // 풀스크린 컨트롤 창도 항상 위에 유지 (종료 버튼 접근 가능하게)
  const fsWin = windowRegistry['fullscreen']?.ref;
  if (fsWin && !fsWin.isDestroyed()) {
    if (active) fsWin.setAlwaysOnTop(true, 'screen-saver'); else fsWin.setAlwaysOnTop(false);
  }
  // gameOverlayWindow는 평소 stack 기반 Z-order 관리 (v1.11.10), 풀스크린 중에는 C++ 창 위에 올려야 하므로 screen-saver band로 전환
  if (gameOverlayWindow && !gameOverlayWindow.isDestroyed()) {
    if (active) gameOverlayWindow.setAlwaysOnTop(true, 'screen-saver'); else gameOverlayWindow.setAlwaysOnTop(false);
    gameOverlayWindow.webContents.send('fullscreen:active', active);
    tracker.setWindowCaptureExclusion(gameOverlayWindow.getNativeWindowHandle(), active);
  }
  if (gameOverlayWindow && !gameOverlayWindow.isDestroyed() && physicalGameRect) {
    const dipRect = screen.screenToDipRect(null, physicalGameRect);
    if (active) {
      const targetDisplay = screen.getDisplayNearestPoint({ x: dipRect.x, y: dipRect.y });
      gameOverlayWindow.setBounds(targetDisplay.bounds);
    } else {
      gameOverlayWindow.setBounds({ x: dipRect.x, y: dipRect.y, width: dipRect.width, height: dipRect.height });
    }
  }
}

export function stopFullscreenForCleanup(): void {
  if (!fullscreenManager.isFullscreenActive()) return;
  // cppHwnd(owner) 파괴 전에 overlayWindow ownership 해제 — owner 파괴 시 owned 창 자동 소멸 방지
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    tracker.clearWindowOwner(overlayWindow.getNativeWindowHandle());
  }
  fullscreenManager.stopFullscreen();
  setFullscreenMode(false);
}

// ─── 풀스크린 독 ─────────────────────────────────────────────────────────────

function _positionDockOnDisplay(): void {
  if (!fullscreenDockWindow || fullscreenDockWindow.isDestroyed()) return;
  const display = gameRect
    ? screen.getDisplayNearestPoint({ x: gameRect.x, y: gameRect.y })
    : screen.getPrimaryDisplay();
  fullscreenDockWindow.setBounds(display.bounds);
}

function createFullscreenDockWindow(): void {
  if (fullscreenDockWindow && !fullscreenDockWindow.isDestroyed()) return;
  const display = gameRect
    ? screen.getDisplayNearestPoint({ x: gameRect.x, y: gameRect.y })
    : screen.getPrimaryDisplay();
  const { bounds } = display;
  fullscreenDockWindow = new BrowserWindow(getStandardOptions(bounds.width, bounds.height, {
    x: bounds.x,
    y: bounds.y,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: true,
    hasShadow: false,
  }));
  fullscreenDockWindow.setContentProtection(true);
  fullscreenDockWindow.setIgnoreMouseEvents(false);
  attachStackListeners(fullscreenDockWindow);
  fullscreenDockWindow.loadFile(path.join(__dirname, '..', 'fullscreen-dock.html'));
  fullscreenDockWindow.webContents.once('did-fail-load', () => {
    fullscreenDockWindow?.close();
  });
  fullscreenDockWindow.once('ready-to-show', () => {
    _positionDockOnDisplay();
    fullscreenDockWindow?.show();
    fullscreenDockWindow?.setAlwaysOnTop(true, 'screen-saver');
  });
  fullscreenDockWindow.on('closed', () => {
    fullscreenDockWindow = null;
    _dockOpenedWindows.clear();
    _dockCascadeCounter = 0;
    // 오버레이가 투과 상태일 때만 C++ 입력 포워딩 복원 (interactive 상태 유지)
    if (_overlayMouseThrough) {
      fullscreenManager.setOverlayActive(false);
    }
  });
}

export function toggleFullscreenDock(): void {
  if (!_isFullscreenMode) return;
  if (!fullscreenDockWindow || fullscreenDockWindow.isDestroyed()) {
    fullscreenManager.setOverlayActive(true);
    createFullscreenDockWindow();
  } else {
    closeDock();
  }
}

export function closeDock(): void {
  // 오버레이가 투과 상태일 때만 C++ 입력 포워딩 복원 — interactive 상태면 유지
  if (_overlayMouseThrough) {
    fullscreenManager.setOverlayActive(false);
  }
  // 스냅샷 후 비워야 closed 이벤트 핸들러에서 재진입 방지
  const keysToClose = [..._dockOpenedWindows];
  _dockOpenedWindows.clear();
  _dockCascadeCounter = 0;
  keysToClose.forEach(key => {
    const winCfg = windowRegistry[key];
    if (winCfg?.ref && !winCfg.ref.isDestroyed()) winCfg.ref.close();
  });
  if (fullscreenDockWindow && !fullscreenDockWindow.isDestroyed()) {
    fullscreenDockWindow.close();
  }
}


export function openFeatureFromDock(featureKey: string): void {
  if (!_isFullscreenMode) return;

  if (featureKey === 'overlay') {
    const newVisible = toggleOverlay();
    // 독을 닫지 않고 버튼 상태만 갱신 — 오버레이는 기본적으로 투과 상태이므로 Z-order 충돌 없음
    fullscreenDockWindow?.webContents.send(
      newVisible ? 'dock:feature-opened' : 'dock:feature-closed', 'overlay'
    );
    return;
  }
  if (featureKey === 'clickThrough') {
    toggleClickThrough();
    // _overlayMouseThrough가 true = 투과 ON = "마우스 투과" 버튼 active 상태
    fullscreenDockWindow?.webContents.send(
      _overlayMouseThrough ? 'dock:feature-opened' : 'dock:feature-closed', 'clickThrough'
    );
    return;
  }

  const winCfg = windowRegistry[featureKey];
  if (!winCfg) return;

  if (winCfg.ref && !winCfg.ref.isDestroyed()) {
    // 이미 열려있어도 추적 목록에 등록 — 풀스크린 종료 시 반드시 닫히게 보장
    _dockOpenedWindows.add(featureKey);
    winCfg.ref.focus();
    return;
  }

  _dockOpenedWindows.add(featureKey);

  const display = gameRect
    ? screen.getDisplayNearestPoint({ x: gameRect.x, y: gameRect.y })
    : screen.getPrimaryDisplay();
  const { bounds } = display;
  const cascadeOffset = _dockCascadeCounter * 30;
  _dockCascadeCounter++;

  const specialOnReady = (win: BrowserWindow) => {
    win.setAlwaysOnTop(true, 'screen-saver');
    fullscreenDockWindow?.webContents.send('dock:feature-opened', featureKey);
    if (featureKey === 'gallery') {
      gallery.updateWindows(null, win, null);
    } else if (featureKey === 'bossSettings') {
      const bossTimes: Record<string, string[]> = {};
      ['골론', '파멸의 기원', '스페르첸드', '골모답', '아칸'].forEach(name => {
        bossTimes[name] = bossNotifier.getBossTimes(name);
      });
      win.webContents.send('boss-times-data', bossTimes);
    } else if (featureKey === 'trade') {
      trade.updateWindows(null, win);
    } else if (featureKey === 'contentsChecker') {
      import('./contentsChecker').then(mod => {
        mod.init();
        win.webContents.send('config-data', config.load());
      });
    }
  };

  createToggleableWindow(featureKey, {
    calcPosition: (_gr, _pos) => ({
      x: Math.round(bounds.x + (bounds.width - winCfg.width) / 2) + cascadeOffset,
      y: Math.round(bounds.y + (bounds.height - winCfg.height) / 2) + cascadeOffset,
    }),
    onReady: specialOnReady,
    onClose: () => {
      _dockOpenedWindows.delete(featureKey);
      fullscreenDockWindow?.webContents.send('dock:feature-closed', featureKey);
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────

/** TW-Overlay 포커스 시: 게임 창을 우리 창 바로 아래에 배치하여 브라우저 위로 올림 */
function bringGameAndOverlaysToTop(): void {
  if (!gameRect) return;
  if (_isFullscreenMode) return;
  const gameHwndStr = tracker.getGameHwnd();
  if (!gameHwndStr) return;
  const focusedWin = BrowserWindow.getFocusedWindow();
  if (!focusedWin || focusedWin.isDestroyed()) return;
  // 포커스된 우리 창의 HWND를 기준점으로 게임을 바로 아래에 배치 (포커스 유지)
  const focusedHwnd = focusedWin.getNativeWindowHandle().readBigUInt64LE().toString();
  tracker.placeGameBelowWindow(focusedHwnd);
  // 나머지 오버레이도 게임 위로 재배치
  const hwnds = getAllWindowHwnds();
  if (hwnds.length > 0) {
    tracker.promoteWindows(gameHwndStr, hwnds);
  }
}

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let view: WebContentsView | null = null;
let uniformColorView: WebContentsView | null = null;
let gameOverlayWindow: BrowserWindow | null = null;

function createGameOverlayWindow(): void {
  if (gameOverlayWindow) return;
  gameOverlayWindow = new BrowserWindow(getStandardOptions(0, 0, {
    skipTaskbar: true,
    alwaysOnTop: false,
    focusable: false,
    hasShadow: false,
  }));
  gameOverlayWindow.setContentProtection(true);
  gameOverlayWindow.setIgnoreMouseEvents(true);
  gameOverlayWindow.loadFile(path.join(__dirname, '..', 'game-overlay.html'));
  attachStackListeners(gameOverlayWindow);
  gameOverlayWindow.once('ready-to-show', () => {
    gameOverlayWindow?.showInactive();
    // 생성 직후 최신 설정 전송 (경험치 HUD 위치 등 반영용)
    gameOverlayWindow?.webContents.send('config-data', config.load());
  });
  gameOverlayWindow.on('closed', () => {
    gameOverlayWindow = null;
  });
}

// --- 창 레지스트리 정의 ---
interface ManagedWindow {
  ref: BrowserWindow | null;
  pos: WindowPosition;
  key: string;
  html: string;
  width: number;
  height: number;
  onOpen?: (win: BrowserWindow) => void;
  onClose?: () => void;
  calcPosition?: (gr: GameRect, pos: WindowPosition) => { x: number, y: number };
}

const windowRegistry: Record<string, ManagedWindow> = {
  settings: {
    ref: null, pos: { offsetX: -1010, offsetY: 40 }, key: 'settings', html: 'settings.html', width: 1000, height: 650,
    calcPosition: (gr, pos) => {
      const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;
      let targetX = Math.round(gr.x + gr.width + pos.offsetX);
      const targetY = Math.round(gr.y + pos.offsetY);
      if (targetX < 0) targetX = 10;
      if (targetX + 1000 > screenWidth) targetX = screenWidth - 1010;
      return { x: targetX, y: targetY };
    }
  },
  gallery: { ref: null, pos: { offsetX: -380, offsetY: 40 }, key: 'gallery', html: 'gallery.html', width: 380, height: 600 },
  abbreviation: { ref: null, pos: { offsetX: -510, offsetY: 40 }, key: 'abbreviation', html: 'abbreviation.html', width: 500, height: 700 },
  buffs: { ref: null, pos: { offsetX: -1000, offsetY: 40 }, key: 'buffs', html: 'buffs.html', width: 1000, height: 700 },
  bossSettings: { ref: null, pos: { offsetX: -370, offsetY: 40 }, key: 'bossSettings', html: 'boss-settings.html', width: 370, height: 750 },
  etaRanking: { ref: null, pos: { offsetX: -380, offsetY: 40 }, key: 'etaRanking', html: 'eta-ranking.html', width: 380, height: 600 },
  trade: { ref: null, pos: { offsetX: -380, offsetY: 40 }, key: 'trade', html: 'trade.html', width: 380, height: 600 },
  coefficientCalculator: { ref: null, pos: { offsetX: -850, offsetY: 40 }, key: 'coefficientCalculator', html: 'coefficient-calculator.html', width: 850, height: 1150 },
  contentsChecker: { ref: null, pos: { offsetX: -400, offsetY: 40 }, key: 'contentsChecker', html: 'contents-checker.html', width: 400, height: 1200 },
  evolutionCalculator: { ref: null, pos: { offsetX: -580, offsetY: 40 }, key: 'evolutionCalculator', html: 'evolution-calculator.html', width: 580, height: 720 },
  magicStoneCalculator: { ref: null, pos: { offsetX: -400, offsetY: 40 }, key: 'magicStoneCalculator', html: 'magic-stone-calculator.html', width: 400, height: 800 },
  customAlert: { ref: null, pos: { offsetX: -420, offsetY: 40 }, key: 'customAlert', html: 'custom-alert.html', width: 420, height: 640 },
  diary: { ref: null, pos: { offsetX: -850, offsetY: 40 }, key: 'diary', html: 'diary.html', width: 1000, height: 850 },
  uniformColor: { ref: null, pos: { offsetX: -360, offsetY: 40 }, key: 'uniformColor', html: 'uniform-color.html', width: 360, height: 800 },
  shoutHistory: { ref: null, pos: { offsetX: -460, offsetY: 40 }, key: 'shoutHistory', html: 'shout-history.html', width: 450, height: 600 },
  gameOverlay: { ref: null, pos: { offsetX: 0, offsetY: 0 }, key: 'gameOverlay', html: 'game-overlay.html', width: 0, height: 0 },
  buffTimer: { ref: null, pos: { offsetX: -600, offsetY: 40 }, key: 'buffTimer', html: 'buff-timer.html', width: 600, height: 850 },
  xpHud: { ref: null, pos: { offsetX: -420, offsetY: 40 }, key: 'xpHud', html: 'xp-hud.html', width: 420, height: 1050 },
  fullscreen: {
    ref: null, pos: { offsetX: -420, offsetY: 40 }, key: 'fullscreen', html: 'fullscreen.html', width: 420, height: 620,
    onClose: () => { stopFullscreenForCleanup(); }
  },
  scamDetector: { ref: null, pos: { offsetX: -480, offsetY: 40 }, key: 'scamDetector', html: 'scam-detector.html', width: 480, height: 780 },
};

let gameRect: GameRect | null = null;
let physicalGameRect: GameRect | null = null; // syncOverlay 재호출용 물리(Win32) 좌표 — DIP 이중 변환 방지
let overlayPos: WindowPosition = { offsetX: 10, offsetY: 10 };
let isTracking = false;
let _isFullscreenMode = false;
let _prevMainAlwaysOnTop = false;
let _prevOverlayAlwaysOnTop = false;
let fullscreenDockWindow: BrowserWindow | null = null;
let _dockOpenedWindows: Set<string> = new Set();
let _dockCascadeCounter = 0;
let _fullscreenShortcutWarning: string | null = null;
const isProgrammaticMoveMap: Record<string, boolean> = {};
let isClickThrough = false;
let _overlayMouseThrough = true; // 전체화면 중 overlay 마우스 투과 상태
let isApplyingSize = false;
let isToolbarShown = true;
let isSidebarCollapsed = false;
let isOverlayVisible = false;
let onOverlayReady: (() => void) | null = null;
let mandatoryUpdateLock = false;

function setProgrammaticMove(key: string): void { isProgrammaticMoveMap[key] = true; }
function consumeProgrammaticMove(key: string): boolean {
  if (isProgrammaticMoveMap[key]) { isProgrammaticMoveMap[key] = false; return true; }
  return false;
}

function init() {
  const cfg = config.load();
  if (cfg.positions) {
    if (cfg.positions.overlay) overlayPos = { ...cfg.positions.overlay };
    Object.keys(windowRegistry).forEach(key => {
      const pos = cfg.positions![key as keyof typeof cfg.positions];
      if (pos) windowRegistry[key].pos = { ...pos };
    });
  }
}
init();

function savePosition(winType: string, pos: WindowPosition, immediate = false) {
  const currentCfg = config.load();
  const positions = { ...(currentCfg.positions || {}), [winType]: { ...pos } };
  if (immediate) config.saveImmediate({ positions });
  else config.save({ positions });
}

export const getSplashWindow = () => splashWindow;
export const getOverlayWindow = () => overlayWindow;
export const getSettingsWindow = () => windowRegistry.settings.ref;
export const getGalleryWindow = () => windowRegistry.gallery.ref;
export const getAbbreviationWindow = () => windowRegistry.abbreviation.ref;
export const getBuffsWindow = () => windowRegistry.buffs.ref;
export const getBossSettingsWindow = () => windowRegistry.bossSettings.ref;
export const getEtaRankingWindow = () => windowRegistry.etaRanking.ref;
export const getTradeWindow = () => windowRegistry.trade.ref;
export const getCoefficientCalculatorWindow = () => windowRegistry.coefficientCalculator.ref;
export const getContentsCheckerWindow = () => windowRegistry.contentsChecker.ref;
export const getEvolutionCalculatorWindow = () => windowRegistry.evolutionCalculator.ref;
export const getCustomAlertWindow = () => windowRegistry.customAlert.ref;
export const getUniformColorWindow = () => windowRegistry.uniformColor.ref;
export const getScamDetectorWindow = () => windowRegistry.scamDetector.ref;
export const getView = () => { if (overlayWindow) return view; return null; };
export const getIsOverlayVisible = () => isOverlayVisible;
export const isOverlayMouseThrough = () => _overlayMouseThrough;
export const getGameRect = () => gameRect;

export function onOverlayWindowReady(callback: () => void): void { onOverlayReady = callback; }

export function createSplashWindow(): BrowserWindow {
  splashWindow = new BrowserWindow(getStandardOptions(400, 500, {
    center: true, skipTaskbar: true, resizable: false, movable: false, focusable: false,
    webPreferences: { preload: path.join(__dirname, '..', 'splashPreload.js'), contextIsolation: true, nodeIntegration: false }
  }));
  splashWindow.setIgnoreMouseEvents(true);
  splashWindow.loadFile(path.join(__dirname, '..', 'splash.html'));
  splashWindow.once('ready-to-show', () => { splashWindow?.show(); });
  return splashWindow;
}

export function closeSplashWindow(): void {
  if (mandatoryUpdateLock) return; // 필수 업데이트 진행 중에는 스플래시 유지
  if (splashWindow) { splashWindow.close(); splashWindow = null; }
}

/** 필수 업데이트 잠금 설정 — 잠금 중에는 스플래시만 표시 */
export function setMandatoryUpdateLock(lock: boolean): void {
  mandatoryUpdateLock = lock;
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.setIgnoreMouseEvents(false);
    if (lock) splashWindow.setAlwaysOnTop(true, 'screen-saver'); else splashWindow.setAlwaysOnTop(false);
    if (lock) splashWindow.focus();
  }
  if (lock) {
    // 사이드바, 오버레이, 모든 독립 창 숨기기
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
    if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.hide();
    Object.values(windowRegistry).forEach(winCfg => {
      if (winCfg.ref && !winCfg.ref.isDestroyed()) winCfg.ref.hide();
    });
  }
}

export function createMainWindow(): BrowserWindow {
  const cfg = config.load();
  isOverlayVisible = cfg.overlayVisible !== false;
  // focusable: true로 변경하여 클릭 신호 수신 안정화
  mainWindow = new BrowserWindow(getStandardOptions(SIDEBAR_WIDTH, SIDEBAR_HEIGHT, { skipTaskbar: true, resizable: false, thickFrame: false, focusable: true, acceptFirstMouse: true }));
  mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));
  mainWindow.on('ready-to-show', () => {
    if (IS_DEV) mainWindow?.webContents.openDevTools({ mode: 'detach' });
    mainWindow?.webContents.send('config-data', config.load());
    mainWindow?.webContents.send('click-through-status', isClickThrough);
  });
  mainWindow.on('move', () => { consumeProgrammaticMove('main'); });
  attachStackListeners(mainWindow);
  return mainWindow;
}

function createOverlayWindow(targetUrl?: string): void {
  if (overlayWindow) return;
  const cfg = config.load();
  overlayWindow = new BrowserWindow(getStandardOptions(cfg.width, cfg.height, { minWidth: MIN_W, minHeight: MIN_H, skipTaskbar: true }));
  overlayWindow.setContentProtection(true);
  overlayWindow.setOpacity(cfg.opacity);
  overlayWindow.loadFile(path.join(__dirname, '..', 'overlay.html'));
  view = new WebContentsView({ webPreferences: { backgroundThrottling: false, preload: path.join(__dirname, '..', 'overlay-view-preload.js') } });
  overlayWindow.contentView.addChildView(view);
  view.webContents.setWindowOpenHandler(({ url }) => { if (view) view.webContents.loadURL(url); return { action: 'deny' }; });
  view.webContents.loadURL(targetUrl || cfg.url || cfg.homeUrl);
  const updateUrl = () => {
    if (view && overlayWindow) {
      const currentUrl = view.webContents.getURL();
      overlayWindow.webContents.send('url-change', currentUrl);
      config.save({ url: currentUrl });
    }
  };
  view.webContents.on('did-navigate', updateUrl);
  view.webContents.on('did-navigate-in-page', updateUrl);
  overlayWindow.on('move', () => {
    if (consumeProgrammaticMove('overlay') || isApplyingSize || !overlayWindow) return;
    const b = overlayWindow.getBounds();
    if (isTracking && gameRect) {
      overlayPos.offsetX = b.x - gameRect.x;
      overlayPos.offsetY = b.y - gameRect.y;
      savePosition('overlay', overlayPos);
    }
  });

  // 헤더 자동 숨김: 이벤트 기반 (mouseenter/mouseleave IPC)
  let mouseInToolbar = false;
  let mouseInWcv = false;
  let toolbarHideTimeout: NodeJS.Timeout | null = null;
  isToolbarShown = false;

  const showToolbar = () => {
    if (toolbarHideTimeout) { clearTimeout(toolbarHideTimeout); toolbarHideTimeout = null; }
    if (!isToolbarShown && !isClickThrough) { isToolbarShown = true; updateViewBounds(); }
  };
  const scheduleHide = () => {
    if (toolbarHideTimeout) clearTimeout(toolbarHideTimeout);
    toolbarHideTimeout = setTimeout(() => {
      if (!overlayWindow || overlayWindow.isDestroyed() || mouseInToolbar || mouseInWcv) return;
      // bounds 변경으로 인한 허위 leave 이벤트 방어: 실제 커서 위치 1회 검증
      const cursor = screen.getCursorScreenPoint();
      const b = overlayWindow.getBounds();
      if (cursor.x >= b.x && cursor.x < b.x + b.width && cursor.y >= b.y && cursor.y < b.y + b.height) return;
      isToolbarShown = false; updateViewBounds();
    }, 300);
  };

  // WCV 영역 마우스 이벤트 (overlay-view-preload에서 전송)
  view.webContents.ipc.on('overlay-wcv-mouse-enter', () => { mouseInWcv = true; showToolbar(); });
  view.webContents.ipc.on('overlay-wcv-mouse-leave', () => { mouseInWcv = false; if (!mouseInToolbar) scheduleHide(); });

  // 툴바 영역 마우스 이벤트 (overlay.html에서 전송)
  overlayWindow.webContents.ipc.on('toolbar-mouse-enter', () => { mouseInToolbar = true; showToolbar(); });
  overlayWindow.webContents.ipc.on('toolbar-mouse-leave', () => { mouseInToolbar = false; if (!mouseInWcv) scheduleHide(); });

  overlayWindow.once('ready-to-show', () => {
    if (_isFullscreenMode && overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.setAlwaysOnTop(true, 'screen-saver');           // screen-saver band: TOPMOST보다 상위
      overlayWindow.setIgnoreMouseEvents(true, { forward: true });
      tracker.setWindowCaptureExclusion(overlayWindow.getNativeWindowHandle(), true);
      _overlayMouseThrough = true;
      // cppHwnd를 owner로 설정 → TOPMOST 그룹 내에서 cppHwnd 위 보장 (gameOverlayWindow와 동일)
      const scalingHwnd = fullscreenManager.getScalingHwnd();
      if (scalingHwnd) tracker.setWindowOwner(overlayWindow.getNativeWindowHandle(), scalingHwnd);
    }
    updateViewBounds();
    if (isOverlayVisible) {
      overlayWindow?.show();
      if (physicalGameRect) { isTracking = false; syncOverlay(physicalGameRect); }
    }
    overlayWindow?.webContents.send('config-data', config.load());
    if (IS_DEV) { overlayWindow?.webContents.openDevTools({ mode: 'detach' }); view?.webContents.openDevTools({ mode: 'detach' }); }
    if (onOverlayReady) onOverlayReady();
  });
  overlayWindow.on('closed', () => {
    if (toolbarHideTimeout) { clearTimeout(toolbarHideTimeout); toolbarHideTimeout = null; }
    if (view) { try { view.webContents.close(); } catch (e) { } view = null; }
    // 전체화면 interactive 상태에서 닫힌 경우 → setOverlayActive 해제해야 C++ 창에 WS_EX_TRANSPARENT 복원
    if (_isFullscreenMode && !_overlayMouseThrough) {
      fullscreenManager.setOverlayActive(false);
      _overlayMouseThrough = true;
    }
    overlayWindow = null; isTracking = false; isClickThrough = false;
  });
  attachStackListeners(overlayWindow);
}

function createToggleableWindow(key: string, callbacks?: {
  onReady?: (win: BrowserWindow) => void,
  calcPosition?: (gr: GameRect, pos: WindowPosition) => { x: number, y: number },
  onClose?: () => void,
}): void {
  const winCfg = windowRegistry[key];
  if (!winCfg || winCfg.ref) { if (winCfg?.ref) winCfg.ref.close(); return; }

  // 현재 게임 창이 있는 모니터(없으면 주 모니터)의 작업 영역 높이 확인
  const display = gameRect 
    ? screen.getDisplayNearestPoint({ x: gameRect.x, y: gameRect.y }) 
    : screen.getPrimaryDisplay();
  const maxH = display.workAreaSize.height;
  
  // 설정된 높이가 모니터 높이보다 크면 클램핑
  const finalW = winCfg.width;
  const finalH = Math.min(winCfg.height, maxH - 40); // 상단 여백 등 고려하여 약간의 여유(40px) 둠

  const win = new BrowserWindow(getStandardOptions(finalW, finalH));
  winCfg.ref = win;
  attachStackListeners(win);
  win.loadFile(path.join(__dirname, '..', winCfg.html));
  win.on('ready-to-show', () => {
    if (gameRect) {
      const { x, y } = (callbacks?.calcPosition || winCfg.calcPosition)
        ? (callbacks?.calcPosition || winCfg.calcPosition)!(gameRect, winCfg.pos)
        : { x: Math.round(gameRect.x + gameRect.width + winCfg.pos.offsetX), y: Math.round(gameRect.y + winCfg.pos.offsetY) };
      win.setPosition(x, y);
    } else {
      win.center();
    }
    win.webContents.send('config-data', config.load());
    if (callbacks?.onReady || winCfg.onOpen) (callbacks?.onReady || winCfg.onOpen)!(win);
    win.show();
    if (IS_DEV) win.webContents.openDevTools({ mode: 'detach' });
  });
  win.webContents.on('did-finish-load', () => win.webContents.send('config-data', config.load()));
  win.on('move', () => {
    if (consumeProgrammaticMove(key) || !winCfg.ref || !gameRect) return;
    const b = winCfg.ref.getBounds();
    winCfg.pos = { offsetX: b.x - (gameRect.x + gameRect.width), offsetY: b.y - gameRect.y };
    savePosition(key, winCfg.pos);
  });
  win.on('closed', () => {
    callbacks?.onClose?.();
    winCfg.onClose?.();
    winCfg.ref = null;
  });
}

export function toggleSettingsWindow(tabId?: string): void {
  const winCfg = windowRegistry['settings'];
  if (winCfg && winCfg.ref && !winCfg.ref.isDestroyed()) {
    winCfg.ref.show();
    winCfg.ref.focus();
    if (tabId) winCfg.ref.webContents.send('open-settings-tab', tabId);
    return;
  }
  createToggleableWindow('settings', {
    onReady: (win) => {
      import('./updater').then(mod => { const info = mod.getCurrentStatus(); if (info) win.webContents.send('update-status', info); });
      if (tabId) setTimeout(() => win.webContents.send('open-settings-tab', tabId), 100);
    }
  });
}
export function toggleGalleryWindow(): void {
  createToggleableWindow('gallery', {
    onReady: (win) => { gallery.updateWindows(null, win, null); if (onOverlayReady) onOverlayReady(); }
  });
}
export function toggleAbbreviationWindow(): void { createToggleableWindow('abbreviation'); }
export function toggleBuffsWindow(): void { createToggleableWindow('buffs'); }
export function toggleBossSettingsWindow(): void {
  createToggleableWindow('bossSettings', {
    onReady: (win) => {
      const bossTimes: Record<string, string[]> = {};
      const bosses = ['골론', '파멸의 기원', '스페르첸드', '골모답', '아칸'];
      bosses.forEach(name => { bossTimes[name] = bossNotifier.getBossTimes(name); });
      win.webContents.send('boss-times-data', bossTimes);
    }
  });
}
export function toggleEtaRankingWindow(): void { createToggleableWindow('etaRanking'); }
export function toggleTradeWindow(): void {
  createToggleableWindow('trade', {
    onReady: (win) => { trade.updateWindows(null, win); }
  });
}
export function toggleCoefficientCalculatorWindow(): void { createToggleableWindow('coefficientCalculator'); }
export function toggleEvolutionCalculatorWindow(): void { createToggleableWindow('evolutionCalculator'); }
export function toggleMagicStoneCalculatorWindow(): void { createToggleableWindow('magicStoneCalculator'); }
export function toggleCustomAlertWindow(): void { createToggleableWindow('customAlert'); }
export function toggleUniformColorWindow(): void {
  const winCfg = windowRegistry['uniformColor'];
  if (winCfg && winCfg.ref && !winCfg.ref.isDestroyed()) {
    winCfg.ref.close();
    return;
  }

  // 1. 독립 창 생성 및 로드
  const win = new BrowserWindow(getStandardOptions(winCfg.width, winCfg.height));
  winCfg.ref = win;
  attachStackListeners(win);
  win.loadFile(path.join(__dirname, '..', winCfg.html));

  // 2. 외부 페이지용 WebContentsView 생성 및 부착
  uniformColorView = new WebContentsView({
    webPreferences: {
      backgroundThrottling: false,
      preload: path.join(__dirname, '..', 'overlay-view-preload.js')
    }
  });
  win.contentView.addChildView(uniformColorView);

  // 3. 뷰 영역 배치 (헤더 56px, 푸터 28px 제외)
  const b = win.getContentBounds();
  uniformColorView.setBounds({ x: 0, y: 56, width: b.width, height: b.height - 56 - 28 });

  // 4. URL 로드 및 CSS 교정 (여백 제거 및 배경색 통일)
  uniformColorView.webContents.loadURL('https://twsnowflower.github.io/uniform_color/spin.html');
  uniformColorView.webContents.on('did-finish-load', () => {
    if (uniformColorView) {
      uniformColorView.webContents.insertCSS('body { overflow: hidden !important; margin-top: -79px !important; margin-left: 0px !important; background: #0f121e !important; }', { cssOrigin: 'user' });
    }
  });

  win.once('ready-to-show', () => {
    if (gameRect) {
      const { x, y } = winCfg.calcPosition
        ? winCfg.calcPosition(gameRect, winCfg.pos)
        : { x: Math.round(gameRect.x + gameRect.width + winCfg.pos.offsetX), y: Math.round(gameRect.y + winCfg.pos.offsetY) };
      win.setPosition(x, y);
    }
    if (IS_DEV) {
      win.webContents.openDevTools({ mode: 'detach' });
      uniformColorView?.webContents.openDevTools({ mode: 'detach' });
    }
    win.show();
  });

  win.on('move', () => {
    if (consumeProgrammaticMove('uniformColor') || !winCfg.ref || !gameRect) return;
    const b = winCfg.ref.getBounds();
    winCfg.pos = { offsetX: b.x - (gameRect.x + gameRect.width), offsetY: b.y - gameRect.y };
    savePosition('uniformColor', winCfg.pos);
  });

  win.on('closed', () => {
    if (uniformColorView) {
      try { uniformColorView.webContents.close(); } catch (e) { }
      uniformColorView = null;
    }
    winCfg.ref = null;
  });
}

export function toggleFullscreenWindow(): void {
  const winCfg = windowRegistry['fullscreen'];
  // 풀스크린 모드 중 hide된 창은 show로 복원 (close 대신)
  if (winCfg?.ref && !winCfg.ref.isDestroyed() && !winCfg.ref.isVisible()) {
    winCfg.ref.show();
    winCfg.ref.focus();
    return;
  }
  createToggleableWindow('fullscreen');
}
export function toggleShoutHistoryWindow(): void { createToggleableWindow('shoutHistory'); }
export function toggleDiaryWindow(): void { createToggleableWindow('diary'); }
export function toggleScamDetectorWindow(): void { createToggleableWindow('scamDetector'); }
export function toggleBuffTimerWindow(): void { createToggleableWindow('buffTimer'); }
export function toggleXpHudWindow(): void { createToggleableWindow('xpHud'); }
export function toggleContentsCheckerWindow(): void {
  createToggleableWindow('contentsChecker', {
    onReady: (win) => {
      // 1. 데이터 초기화 수행
      import('./contentsChecker').then(mod => {
        mod.init();
        // 2. 초기화 완료 후 명시적으로 최신 데이터 전송
        win.webContents.send('config-data', config.load());
      });
    }
  });
}


export function getAllWindowHwnds(): string[] {
  const windows = activeWindowsStack.filter(win => win && !win.isDestroyed() && win.isVisible());

  // 사이드바(mainWindow)를 항상 첫 번째로 → promoteWindows에서 최하단 Z-Order 유지
  windows.sort((a, b) => {
    if (a === mainWindow) return -1;
    if (b === mainWindow) return 1;
    return 0;
  });

  const results: string[] = [];
  for (const win of windows) {
    if (win && !win.isDestroyed()) {
      try {
        results.push(win.getNativeWindowHandle().readBigUint64LE().toString());
      } catch (e) {
        // 무시: 수집 중 파괴된 경우
      }
    }
  }
  return results;
}

export function isAnyElectronWindowFocused(hwnd: string): boolean {
  return BrowserWindow.getAllWindows().some(win => {
    if (win.isDestroyed()) return false;
    try {
      const buf = win.getNativeWindowHandle();
      return (buf.length >= 8 ? buf.readBigUInt64LE(0) : BigInt(buf.readUInt32LE(0))).toString() === hwnd;
    } catch { return false; }
  });
}

export function updateViewBounds(): void {
  if (!overlayWindow || !view) return;
  const b = overlayWindow.getBounds();
  if (isToolbarShown) {
    view.setBounds({ x: 0, y: OVERLAY_TOOLBAR_HEIGHT, width: b.width, height: b.height - OVERLAY_TOOLBAR_HEIGHT });
  } else {
    view.setBounds({ x: 0, y: 0, width: b.width, height: b.height });
  }
}
export function setOverlayVisible(visible: boolean, targetUrl?: string): boolean {
  if (mandatoryUpdateLock) return isOverlayVisible; // 필수 업데이트 중에는 오버레이 조작 차단
  if (isOverlayVisible === visible && (visible ? !!overlayWindow : !overlayWindow)) { if (visible && targetUrl && view) view.webContents.loadURL(targetUrl); return isOverlayVisible; }
  isOverlayVisible = visible;
  if (isOverlayVisible) createOverlayWindow(targetUrl);
  else if (overlayWindow) {
    savePosition('overlay', overlayPos, true);
    if (view) { try { overlayWindow.contentView.removeChildView(view); view.webContents.close(); } catch (e) { } view = null; }
    overlayWindow.close(); overlayWindow = null; isTracking = false;
  }
  if (mainWindow) mainWindow.webContents.send('overlay-status', isOverlayVisible);
  config.save({ overlayVisible: isOverlayVisible });
  return isOverlayVisible;
}
export function toggleOverlay(): boolean { return setOverlayVisible(!isOverlayVisible); }

export function syncOverlay(currentRect: GameRect): void {
  if (!mainWindow || isApplyingSize) return;
  if (mandatoryUpdateLock) return; // 필수 업데이트 중에는 창 동기화 중지
  if (currentRect && currentRect.x > -10000) {
    if (!mainWindow.isVisible() && !_isFullscreenMode) mainWindow.show();
    if (overlayWindow && isOverlayVisible && !overlayWindow.isVisible() && !_overlaysTemporarilyHidden) overlayWindow.show();
    // 물리 좌표를 보존 — applySettings에서 syncOverlay 재호출 시 이중 DIP 변환 방지
    physicalGameRect = { x: currentRect.x, y: currentRect.y, width: currentRect.width, height: currentRect.height, isForeground: currentRect.isForeground };
    // Win32 물리 좌표를 Electron 논리 좌표(DIP)로 변환
    // null을 전달하면 rect에 가장 가까운 모니터(= 게임 창이 있는 모니터)의 DPI를 자동 적용함.
    // mainWindow(사이드바)를 전달하면 사이드바가 다른 모니터에 있을 때 잘못된 DPI가 적용되므로 부적합.
    const dipRect = screen.screenToDipRect(null, {
      x: currentRect.x,
      y: currentRect.y,
      width: currentRect.width,
      height: currentRect.height
    });
    const gX = dipRect.x, gY = dipRect.y, gW = dipRect.width, gH = dipRect.height;
    if (overlayWindow && isOverlayVisible) {
      const b = overlayWindow.getBounds();
      let newW = b.width, newH = b.height;
      if (!isTracking) isTracking = true;
      const finalX = Math.round(gX + overlayPos.offsetX), finalY = Math.round(gY + overlayPos.offsetY);
      if (Math.abs(b.x - finalX) > POSITION_THRESHOLD || Math.abs(b.y - finalY) > POSITION_THRESHOLD || Math.abs(b.width - newW) > POSITION_THRESHOLD || Math.abs(b.height - newH) > POSITION_THRESHOLD) {
        setProgrammaticMove('overlay'); overlayWindow.setBounds({ x: finalX, y: finalY, width: newW, height: newH });
      }
    } else if (isOverlayVisible && !overlayWindow) createOverlayWindow();

    // --- 게임 전용 오버레이 동기화 ---
    if (!gameOverlayWindow) createGameOverlayWindow();
    if (gameOverlayWindow) {
      const targetBounds = _isFullscreenMode
        ? screen.getDisplayNearestPoint({ x: gX, y: gY }).bounds
        : { x: gX, y: gY, width: gW, height: gH };
      const b = gameOverlayWindow.getBounds();
      if (Math.abs(b.x - targetBounds.x) > POSITION_THRESHOLD || Math.abs(b.y - targetBounds.y) > POSITION_THRESHOLD || Math.abs(b.width - targetBounds.width) > POSITION_THRESHOLD || Math.abs(b.height - targetBounds.height) > POSITION_THRESHOLD) {
        gameOverlayWindow.setBounds(targetBounds);
      }
      // 게임 복귀 시 숨겨진 상태면 다시 표시 (isDestroyed 재확인 후 처리, Alt+Tab 임시숨김 중에는 복원 금지)
      if (!gameOverlayWindow.isDestroyed() && !gameOverlayWindow.isVisible() && !_overlaysTemporarilyHidden) gameOverlayWindow.showInactive();
    }

    const currentSidebarB = mainWindow.getBounds();
    const cfg = config.load();
    const sidebarPos = cfg.sidebarPosition || 'right';
    // 게임 창이 두 모니터에 걸쳐 있을 때, 중심 기반 모니터 감지가 아닌
    // 사이드바가 붙는 쪽 엣지(물리 좌표 1×1)를 기준으로 DIP 변환하여 정확히 정렬
    const edgePhysX = sidebarPos === 'left'
      ? currentRect.x
      : currentRect.x + currentRect.width;
    const edgeDipX = screen.screenToDipRect(null, { x: edgePhysX, y: currentRect.y, width: 1, height: 1 }).x;
    const newSidebarX = sidebarPos === 'left' ? edgeDipX - currentSidebarB.width : edgeDipX;
    const newSidebarY = gY + 30; // 상단 제목 표시줄 만큼 아래로 오프셋
    const newSidebarH = gH - 30; // 제목 표시줄 두께만큼 높이 축소

    if (Math.abs(currentSidebarB.x - newSidebarX) > POSITION_THRESHOLD ||
      Math.abs(currentSidebarB.y - newSidebarY) > POSITION_THRESHOLD ||
      Math.abs(currentSidebarB.height - newSidebarH) > POSITION_THRESHOLD) {
      setProgrammaticMove('main');
      mainWindow.setBounds({ x: newSidebarX, y: newSidebarY, width: currentSidebarB.width, height: newSidebarH });
    }
    Object.keys(windowRegistry).forEach(key => {
      const winCfg = windowRegistry[key];
      if (winCfg.ref && !winCfg.ref.isDestroyed() && winCfg.ref.isVisible()) {
        setProgrammaticMove(key);
        // 스케일링된 좌표(gX, gY 등)를 기반으로 위치 계산
        const scaledGameRect = { x: gX, y: gY, width: gW, height: gH, isForeground: currentRect.isForeground };
        const { x, y } = (winCfg.calcPosition)
          ? winCfg.calcPosition(scaledGameRect, winCfg.pos)
          : { x: Math.round(gX + gW + winCfg.pos.offsetX), y: Math.round(gY + winCfg.pos.offsetY) };
        winCfg.ref.setPosition(x, y);
      }
    });
    gameRect = { x: gX, y: gY, width: gW, height: gH, isForeground: currentRect.isForeground };
    closeSplashWindow();
  } else {
    // 게임 창을 찾을 수 없는 경우: 사이드바/오버레이 숨김 및 추적 해제
    hideOverlayWindows();
    gameRect = null;
    physicalGameRect = null;
  }
}

export function applySettings(newSettings: Partial<AppConfig> & { isSidebarResize?: boolean }): void {
  if (newSettings.isSidebarResize && mainWindow) {
    const b = mainWindow.getBounds();
    const cfg = config.load();
    const sidebarPos = cfg.sidebarPosition || 'right';
    let newX = b.x;
    if (sidebarPos === 'left') {
      // 사이드바 우측 끝을 게임 좌측에 고정하면서 너비만 변경
      newX = b.x + b.width - newSettings.width!;
    }
    // X(right 방향)와 Y/H는 syncOverlay가 관리 — stale gameRect 사용 금지
    setProgrammaticMove('main');
    mainWindow.setBounds({ x: Math.round(newX), y: b.y, width: newSettings.width, height: b.height });

    // 열려있는 자식 창들도 재배치 (사이드바 X 변경에 따른 오프셋 보정)
    if (gameRect) {
      Object.keys(windowRegistry).forEach(key => {
        const winCfg = windowRegistry[key];
        if (winCfg.ref && !winCfg.ref.isDestroyed() && winCfg.ref.isVisible()) {
          setProgrammaticMove(key);
          const { x, y } = winCfg.calcPosition
            ? winCfg.calcPosition(gameRect!, winCfg.pos)
            : { x: Math.round(gameRect!.x + gameRect!.width + winCfg.pos.offsetX), y: Math.round(gameRect!.y + winCfg.pos.offsetY) };
          winCfg.ref.setPosition(x, y);
        }
      });
    }
    return;
  }
  const current = config.load(), updated = { ...current, ...newSettings };
  config.saveImmediate(updated);
  if (overlayWindow) {
    isApplyingSize = true;
    const b = overlayWindow.getBounds();
    overlayWindow.setBounds({ x: b.x, y: b.y, width: Math.max(MIN_W, updated.width), height: Math.max(MIN_H, updated.height) });
    overlayWindow.setOpacity(updated.opacity);
    updateViewBounds();
    setTimeout(() => { isApplyingSize = false; }, 300);
  }
  [mainWindow, overlayWindow, gameOverlayWindow].forEach(win => win?.webContents.send('config-data', updated));
  Object.values(windowRegistry).forEach(winCfg => winCfg.ref?.webContents.send('config-data', updated));

  // buffTimerManager warnSeconds 캐시 갱신
  buffTimerManager.refreshConfig();

  // 설정 변경 즉시 반영 (물리 좌표 사용 — DIP 이중 변환 방지)
  if (physicalGameRect) syncOverlay(physicalGameRect);

  // 설정 저장 시 트레이 메뉴(숨김 메뉴 등) 즉시 동기화
  import('./tray').then(mod => {
    if (mod.updateTrayMenu) mod.updateTrayMenu();
  }).catch(e => log(`[WINDOW_MANAGER] 트레이 메뉴 업데이트 실패: ${e}`));
}

export function toggleClickThrough(): boolean {
  if (!overlayWindow) return false;
  if (_isFullscreenMode) {
    _overlayMouseThrough = !_overlayMouseThrough;
    isClickThrough = _overlayMouseThrough;
    if (_overlayMouseThrough) {
      overlayWindow.setIgnoreMouseEvents(true, { forward: true });
      fullscreenManager.setOverlayActive(false);
    } else {
      overlayWindow.setIgnoreMouseEvents(false);
      fullscreenManager.setOverlayActive(true);
      // moveTop()은 HWND_TOP을 사용해 TOPMOST 창을 강등시키므로 사용 금지.
      // setAlwaysOnTop(true, 'screen-saver')로 screen-saver band 최상단 보장 후 focus.
      overlayWindow.setAlwaysOnTop(true, 'screen-saver');
      overlayWindow.focus();
    }
  } else {
    isClickThrough = !isClickThrough;
    overlayWindow.setIgnoreMouseEvents(isClickThrough);
    if (isClickThrough && isToolbarShown) { isToolbarShown = false; updateViewBounds(); }
  }
  overlayWindow.webContents.send('click-through-status', isClickThrough);
  if (mainWindow) mainWindow.webContents.send('click-through-status', isClickThrough);
  return isClickThrough;
}

export function toggleSidebar(): boolean {
  isSidebarCollapsed = !isSidebarCollapsed;
  mainWindow?.webContents.send('sidebar-status', isSidebarCollapsed);
  return isSidebarCollapsed;
}

export function hideAll(): void {
  // 오버레이 창 종료 (Close)
  if (overlayWindow) {
    savePosition('overlay', overlayPos, true);
    if (view) { try { overlayWindow.contentView.removeChildView(view); view.webContents.close(); } catch (e) { } view = null; }
    overlayWindow.close();
    overlayWindow = null;
  }

  // 사이드바는 숨김 (Hide) - 앱 실행 유지를 위함
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
    mainWindow.hide();
  }

  // 게임 전용 오버레이 숨김
  if (gameOverlayWindow && !gameOverlayWindow.isDestroyed() && gameOverlayWindow.isVisible()) {
    gameOverlayWindow.hide();
  }

  // 모든 유틸리티 창 종료 (Close)
  Object.values(windowRegistry).forEach(winCfg => {
    if (winCfg.ref && !winCfg.ref.isDestroyed()) {
      winCfg.ref.close(); // closed 이벤트에 의해 winCfg.ref = null 처리됨
    }
  });

  isTracking = false;
  gameRect = null; // 게임 상태 초기화
  closeSplashWindow();
}

export function getMainWindow(): BrowserWindow | null {
  return (mainWindow && !mainWindow.isDestroyed()) ? mainWindow : null;
}

export function getGameOverlayHwnd(): string | null {
  if (!gameOverlayWindow || gameOverlayWindow.isDestroyed()) return null;
  try {
    const buf = gameOverlayWindow.getNativeWindowHandle();
    return (buf.length >= 8 ? buf.readBigUInt64LE(0) : BigInt(buf.readUInt32LE(0))).toString();
  } catch { return null; }
}

let _tempHiddenForAltTab: BrowserWindow[] = [];
let _overlaysTemporarilyHidden = false;
let _hideDebounceTimer: NodeJS.Timeout | null = null;

export function isOverlaysTemporarilyHidden(): boolean { return _overlaysTemporarilyHidden; }

export function temporarilyHideOverlays(): void {
  if (!_isFullscreenMode) return;
  if (_overlaysTemporarilyHidden) return;
  // 400ms 디바운스: 렌더러 프로세스 창의 일시적 포그라운드 활성화(<50ms)를 걸러냄
  if (_hideDebounceTimer) clearTimeout(_hideDebounceTimer);
  _hideDebounceTimer = setTimeout(() => {
    _hideDebounceTimer = null;
    if (!_isFullscreenMode || _overlaysTemporarilyHidden) return;
    _overlaysTemporarilyHidden = true;
    _tempHiddenForAltTab = [];
    const candidates: (BrowserWindow | null | undefined)[] = [
      overlayWindow,
      gameOverlayWindow,
      fullscreenDockWindow,
    ];
    for (const key of _dockOpenedWindows) {
      candidates.push(windowRegistry[key]?.ref ?? null);
    }
    for (const win of candidates) {
      if (win && !win.isDestroyed() && win.isVisible()) {
        win.hide();
        _tempHiddenForAltTab.push(win);
      }
    }
  }, 400);
}

export function restoreOverlays(): void {
  // 대기 중인 숨김 타이머 취소 (일시적 포그라운드 변경 후 게임/앱이 복귀한 경우)
  if (_hideDebounceTimer) {
    clearTimeout(_hideDebounceTimer);
    _hideDebounceTimer = null;
  }
  if (!_overlaysTemporarilyHidden) return;
  _overlaysTemporarilyHidden = false;
  for (const win of _tempHiddenForAltTab) {
    if (!win.isDestroyed()) {
      win.show();
      if (win.isAlwaysOnTop()) win.setAlwaysOnTop(true, 'screen-saver');
    }
  }
  _tempHiddenForAltTab = [];
}

export function hideOverlayWindows(): void {
  // 오버레이 창 종료 (Close)
  if (overlayWindow) {
    savePosition('overlay', overlayPos, true);
    if (view) { try { overlayWindow.contentView.removeChildView(view); view.webContents.close(); } catch (e) { } view = null; }
    overlayWindow.close();
    overlayWindow = null;
  }

  // 사이드바 숨김 (Hide)
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
    mainWindow.hide();
  }

  // 게임 전용 오버레이 숨김 (게임 창 최소화/종료 시)
  if (gameOverlayWindow && !gameOverlayWindow.isDestroyed() && gameOverlayWindow.isVisible()) {
    gameOverlayWindow.hide();
  }

  isTracking = false;
  gameRect = null; // 게임 상태 초기화
  closeSplashWindow();
}
export function showGameExitReminder(): void {
  const cfg = config.load();
  if (!cfg.gameExitReminderEnabled || !cfg.gameExitReminderMessage?.trim()) return;

  const incompleteItems = (cfg.contentsCheckerItems || [])
    .filter(item => item.isVisible && !item.isCompleted)
    .map(item => ({
      name: item.name,
      category: item.category,
      type: item.resetRule.type
    }));

  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
  const winWidth = 500, winHeight = 560;

  const reminderWin = new BrowserWindow(getStandardOptions(winWidth, winHeight, {
    center: true, resizable: false, skipTaskbar: false, alwaysOnTop: true,
    transparent: false, backgroundColor: '#0f121e',
    x: Math.round((screenWidth - winWidth) / 2),
    y: Math.round((screenHeight - winHeight) / 2),
  }));

  reminderWin.loadFile(path.join(__dirname, '..', 'game-exit-reminder.html'));
  reminderWin.once('ready-to-show', () => {
    reminderWin.webContents.send('reminder-message', cfg.gameExitReminderMessage);
    reminderWin.webContents.send('incomplete-contents', incompleteItems);
    reminderWin.show();
    reminderWin.focus();
  });
}

