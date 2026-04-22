/**
 * 창 관리 모듈 - WebContentsView + 동적 Z-Order 스택 버전
 */
import { BrowserWindow, WebContentsView, screen } from 'electron';
import * as path from 'path';
import { MIN_W, MIN_H, IS_DEV, WindowPosition, SIDEBAR_HEIGHT, SIDEBAR_WIDTH, OVERLAY_TOOLBAR_HEIGHT, GameRect, POSITION_THRESHOLD, AppConfig } from './constants';
import * as config from './config';
import * as bossNotifier from './bossNotifier';
import * as gallery from './galleryMonitor';
import * as trade from './tradeMonitor';
import * as tracker from './tracker';
import { log } from './logger';
import { buffTimerManager } from './buffTimerManager';

// --- 상태 관리 ---
let activeWindowsStack: BrowserWindow[] = [];

/** 공통 창 생성 옵션 (DRY) */
function getStandardOptions(width: number, height: number, extraProps: any = {}): any {
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

/** TW-Overlay 포커스 시: 게임 창을 우리 창 바로 아래에 배치하여 브라우저 위로 올림 */
function bringGameAndOverlaysToTop(): void {
  if (!gameRect) return;
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
    alwaysOnTop: true,
    focusable: false,
    hasShadow: false
  }));
  gameOverlayWindow.setIgnoreMouseEvents(true);
  gameOverlayWindow.loadFile(path.join(__dirname, '..', 'game-overlay.html'));
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
  buffTimer: { ref: null, pos: { offsetX: -600, offsetY: 40 }, key: 'buffTimer', html: 'buff-timer.html', width: 600, height: 600 },
  xpHud: { ref: null, pos: { offsetX: -420, offsetY: 40 }, key: 'xpHud', html: 'xp-hud.html', width: 420, height: 500 },
};

let gameRect: GameRect | null = null;
let overlayPos: WindowPosition = { offsetX: 10, offsetY: 10 };
let isTracking = false;
const isProgrammaticMoveMap: Record<string, boolean> = {};
let isClickThrough = false;
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
export const getView = () => { if (overlayWindow) return view; return null; };
export const getIsOverlayVisible = () => isOverlayVisible;
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
    splashWindow.setAlwaysOnTop(lock);
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
    updateViewBounds();
    if (isOverlayVisible) {
      overlayWindow?.show();
      if (gameRect) { isTracking = false; syncOverlay(gameRect); }
    }
    overlayWindow?.webContents.send('config-data', config.load());
    if (IS_DEV) { overlayWindow?.webContents.openDevTools({ mode: 'detach' }); view?.webContents.openDevTools({ mode: 'detach' }); }
    if (onOverlayReady) onOverlayReady();
  });
  overlayWindow.on('closed', () => {
    if (toolbarHideTimeout) { clearTimeout(toolbarHideTimeout); toolbarHideTimeout = null; }
    if (view) { try { view.webContents.close(); } catch (e) { } view = null; }
    overlayWindow = null; isTracking = false; isClickThrough = false;
  });
  attachStackListeners(overlayWindow);
}

function createToggleableWindow(key: string, callbacks?: {
  onReady?: (win: BrowserWindow) => void,
  calcPosition?: (gr: GameRect, pos: WindowPosition) => { x: number, y: number }
}): void {
  const winCfg = windowRegistry[key];
  if (!winCfg || winCfg.ref) { if (winCfg?.ref) winCfg.ref.close(); return; }
  const win = new BrowserWindow(getStandardOptions(winCfg.width, winCfg.height));
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
  win.on('closed', () => { if (winCfg.onClose) winCfg.onClose(); winCfg.ref = null; });
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

  // ... (기존 로직)
}
export function toggleShoutHistoryWindow(): void { createToggleableWindow('shoutHistory'); }
export function toggleDiaryWindow(): void { createToggleableWindow('diary'); }
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
  
  // gameOverlayWindow도 명시적으로 포함 (스택에 없을 수 있으므로)
  if (gameOverlayWindow && !gameOverlayWindow.isDestroyed() && gameOverlayWindow.isVisible()) {
    if (!windows.includes(gameOverlayWindow)) windows.push(gameOverlayWindow);
  }

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
    if (!mainWindow.isVisible()) mainWindow.show();
    if (overlayWindow && isOverlayVisible && !overlayWindow.isVisible()) overlayWindow.show();
    const display = screen.getDisplayNearestPoint({ x: currentRect.x, y: currentRect.y });
    const scaleFactor = display.scaleFactor || 1;
    const gX = Math.round(currentRect.x / scaleFactor), gY = Math.round(currentRect.y / scaleFactor), gW = Math.round(currentRect.width / scaleFactor), gH = Math.round(currentRect.height / scaleFactor);
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
      const b = gameOverlayWindow.getBounds();
      if (Math.abs(b.x - gX) > POSITION_THRESHOLD || Math.abs(b.y - gY) > POSITION_THRESHOLD || Math.abs(b.width - gW) > POSITION_THRESHOLD || Math.abs(b.height - gH) > POSITION_THRESHOLD) {
        gameOverlayWindow.setBounds({ x: gX, y: gY, width: gW, height: gH });
      }
      // 게임 복귀 시 숨겨진 상태면 다시 표시 (isDestroyed 재확인 후 처리)
      if (!gameOverlayWindow.isDestroyed() && !gameOverlayWindow.isVisible()) gameOverlayWindow.showInactive();
    }

    const currentSidebarB = mainWindow.getBounds();
    const newSidebarX = gX + gW, newSidebarY = gY + 30; // 상단 제목 표시줄 만큼 아래로 오프셋
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
  }
}

export function applySettings(newSettings: Partial<AppConfig> & { isSidebarResize?: boolean }): void {
  if (newSettings.isSidebarResize && mainWindow) {
    const b = mainWindow.getBounds();
    setProgrammaticMove('main');
    mainWindow.setBounds({ x: b.x, y: b.y, width: newSettings.width, height: b.height });
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

  // 설정 저장 시 트레이 메뉴(숨김 메뉴 등) 즉시 동기화
  import('./tray').then(mod => {
    if (mod.updateTrayMenu) mod.updateTrayMenu();
  }).catch(e => log(`[WINDOW_MANAGER] 트레이 메뉴 업데이트 실패: ${e}`));
}

export function toggleClickThrough(): boolean {
  if (!overlayWindow) return false;
  isClickThrough = !isClickThrough;
  overlayWindow.setIgnoreMouseEvents(isClickThrough);
  if (isClickThrough && isToolbarShown) { isToolbarShown = false; updateViewBounds(); }
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

export function setMainWindowWidth(width: number): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const b = mainWindow.getBounds();
    // width가 실제로 다를 때만 업데이트하여 불필요한 이벤트 발생 방지
    if (b.width !== width) {
      mainWindow.setBounds({ x: b.x, y: b.y, width, height: b.height });
    }
  }
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

