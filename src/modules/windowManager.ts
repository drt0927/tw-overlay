/**
 * 창 관리 모듈 - WebContentsView + 동적 Z-Order 스택 버전
 */
import { BrowserWindow, WebContentsView, screen } from 'electron';
import * as path from 'path';
import { MIN_W, MIN_H, IS_DEV, WindowPosition, SIDEBAR_HEIGHT, SIDEBAR_WIDTH, OVERLAY_TOOLBAR_HEIGHT, GameRect, POSITION_THRESHOLD, AppConfig, appState, FOCUS_RESTORE_DELAY_MS, MAIN_CHAR_ID, DEFAULT_CHAR_NAME } from './constants';
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
let focusRestoreTimer: NodeJS.Timeout | null = null;
let suppressFocusRestore = false;

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
    alwaysOnTop: false,
    focusable: false,
    hasShadow: false
  }));
  gameOverlayWindow.setIgnoreMouseEvents(true);
  gameOverlayWindow.loadFile(path.join(__dirname, '..', 'game-overlay.html'));
  attachStackListeners(gameOverlayWindow);
  
  // 개발 환경에서만 테스트 편의를 위해 개발자 도구 자동 활성화
  if (IS_DEV) {
    gameOverlayWindow.webContents.openDevTools({ mode: 'detach' });
  }

  gameOverlayWindow.once('ready-to-show', () => {
    gameOverlayWindow?.showInactive();
    // 생성 직후 최신 설정 전송 (경험치 HUD 위치 등 반영용)
    gameOverlayWindow?.webContents.send('config-data', config.load());
  });

  // HTML 파싱 및 스크립트 로드 완료 후 확실하게 한 번 더 전송 (Race Condition 방지)
  gameOverlayWindow.webContents.on('did-finish-load', () => {
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
  skipTaskbar?: boolean;
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
  gallery: { ref: null, pos: { offsetX: -450, offsetY: 40 }, key: 'gallery', html: 'gallery.html', width: 450, height: 600 },
  abbreviation: { ref: null, pos: { offsetX: -510, offsetY: 40 }, key: 'abbreviation', html: 'abbreviation.html', width: 500, height: 700 },
  buffs: { ref: null, pos: { offsetX: -1000, offsetY: 40 }, key: 'buffs', html: 'buffs.html', width: 1000, height: 700 },
  bossSettings: { ref: null, pos: { offsetX: -410, offsetY: 40 }, key: 'bossSettings', html: 'boss-settings.html', width: 410, height: 750 },
  etaRanking: { ref: null, pos: { offsetX: -400, offsetY: 40 }, key: 'etaRanking', html: 'eta-ranking.html', width: 400, height: 600 },
  trade: { ref: null, pos: { offsetX: -450, offsetY: 40 }, key: 'trade', html: 'trade.html', width: 450, height: 600 },
  coefficientCalculator: { ref: null, pos: { offsetX: -1360, offsetY: 40 }, key: 'coefficientCalculator', html: 'coefficient-calculator.html', width: 1350, height: 1080 },
  contentsChecker: { ref: null, pos: { offsetX: -400, offsetY: 40 }, key: 'contentsChecker', html: 'contents-checker.html', width: 400, height: 1200 },
  evolutionCalculator: { ref: null, pos: { offsetX: -580, offsetY: 40 }, key: 'evolutionCalculator', html: 'evolution-calculator.html', width: 580, height: 720 },
  magicStoneCalculator: { ref: null, pos: { offsetX: -400, offsetY: 40 }, key: 'magicStoneCalculator', html: 'magic-stone-calculator.html', width: 400, height: 800 },
  customAlert: { ref: null, pos: { offsetX: -420, offsetY: 40 }, key: 'customAlert', html: 'custom-alert.html', width: 420, height: 640 },
  diary: { ref: null, pos: { offsetX: -850, offsetY: 40 }, key: 'diary', html: 'diary.html', width: 1000, height: 850 },
  uniformColor: { ref: null, pos: { offsetX: -360, offsetY: 40 }, key: 'uniformColor', html: 'uniform-color.html', width: 360, height: 800 },
  shoutHistory: { ref: null, pos: { offsetX: -460, offsetY: 40 }, key: 'shoutHistory', html: 'shout-history.html', width: 450, height: 600 },
  gameOverlay: { ref: null, pos: { offsetX: 0, offsetY: 0 }, key: 'gameOverlay', html: 'game-overlay.html', width: 0, height: 0 },
  buffTimer: { ref: null, pos: { offsetX: -900, offsetY: 40 }, key: 'buffTimer', html: 'buff-timer.html', width: 900, height: 850 },
  xpHud: { ref: null, pos: { offsetX: -420, offsetY: 40 }, key: 'xpHud', html: 'xp-hud.html', width: 420, height: 1050 },
  scamDetector: { ref: null, pos: { offsetX: -480, offsetY: 40 }, key: 'scamDetector', html: 'scam-detector.html', width: 480, height: 780 },
  sienaAura: { ref: null, pos: { offsetX: -850, offsetY: 40 }, key: 'sienaAura', html: 'siena-aura.html', width: 1180, height: 930 },
  wordAlarm: { ref: null, pos: { offsetX: -450, offsetY: 40 }, key: 'wordAlarm', html: 'word-alarm.html', width: 450, height: 950 },
  discordAlarm: { ref: null, pos: { offsetX: -450, offsetY: 40 }, key: 'discordAlarm', html: 'discord-alarm.html', width: 450, height: 950 },
  chatOverlay: {
    ref: null,
    pos: { offsetX: -460, offsetY: 450 },
    key: 'chatOverlay',
    html: 'chat-overlay.html',
    width: 450,
    height: 400,
    skipTaskbar: true,
    onOpen: (win) => {
      const cfg = config.load();
      if (cfg.chatOverlayClickThrough) {
        win.setIgnoreMouseEvents(true, { forward: true });
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('chat-overlay-status', true);
      }
      win.webContents.send('chat-overlay-mode', 'main');
    },
    onClose: () => {
      // 게임 창 최소화/숨김 시 닫히는 경우와 사용자가 직접 닫은 경우를 구분하기 위해,
      // config 저장 및 isChatOverlayVisible 변수 갱신은 toggleChatOverlayWindow()에서만 수행합니다.
      // 여기서는 닫혔을 때 UI 상태 갱신 및 서브 창 닫기 동작만 수행합니다.
      const updated = config.load();

      const dockCfg = windowRegistry['dock'];
      [mainWindow, dockCfg?.ref].forEach(win => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('config-data', updated);
        }
      });

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('chat-overlay-status', false);
      }

      // 서브 창들도 함께 닫아줌
      const subWinCfg = windowRegistry['chatOverlaySub'];
      const sub2WinCfg = windowRegistry['chatOverlaySub2'];
      if (subWinCfg.ref && !subWinCfg.ref.isDestroyed()) {
        subWinCfg.ref.close();
      }
      if (sub2WinCfg.ref && !sub2WinCfg.ref.isDestroyed()) {
        sub2WinCfg.ref.close();
      }
    }
  },
  chatOverlaySub: {
    ref: null,
    pos: { offsetX: -460, offsetY: 240 }, // Main 창과 겹치지 않게 기본 Y축 오프셋을 240으로 배치
    key: 'chatOverlaySub',
    html: 'chat-overlay.html',
    width: 450,
    height: 400,
    skipTaskbar: true,
    onOpen: (win) => {
      const cfg = config.load();
      if (cfg.chatOverlayClickThrough) {
        win.setIgnoreMouseEvents(true, { forward: true });
      }
      win.webContents.send('chat-overlay-mode', 'sub1');
    },
    onClose: () => {
      // 게임 창 최소화 등으로 인해 닫히는 동작에서는 설정 저장을 무시하기 위해,
      // config 저장 및 isChatOverlaySubVisible 변수 갱신은 toggleSubWindow()에서만 수행합니다.
      broadcastConfig();
    }
  },
  chatOverlaySub2: {
    ref: null,
    pos: { offsetX: -460, offsetY: 40 }, // Main 창과 겹치지 않게 기본 Y축 오프셋을 40으로 배치
    key: 'chatOverlaySub2',
    html: 'chat-overlay.html',
    width: 450,
    height: 400,
    skipTaskbar: true,
    onOpen: (win) => {
      const cfg = config.load();
      if (cfg.chatOverlayClickThrough) {
        win.setIgnoreMouseEvents(true, { forward: true });
      }
      win.webContents.send('chat-overlay-mode', 'sub2');
    },
    onClose: () => {
      // 게임 창 최소화 등으로 인해 닫히는 동작에서는 설정 저장을 무시하기 위해,
      // config 저장 및 isChatOverlaySub2Visible 변수 갱신은 toggleSubWindow()에서만 수행합니다.
      broadcastConfig();
    }
  },
  dock: {
    ref: null,
    pos: { offsetX: 0, offsetY: 0 },
    key: 'dock',
    html: 'dock.html',
    width: 800,
    height: 380,
    onOpen: (_win) => {
      sendActiveWindowsStatus();
    },
    calcPosition: (gr, _pos) => {
      const targetX = Math.round(gr.x + (gr.width - 800) / 2);
      const targetY = Math.round(gr.y + gr.height - 380 - 20); // 하단 내부 중앙 배치 (20px 여백)
      return { x: targetX, y: targetY };
    }
  }
};

let gameRect: GameRect | null = null;
let physicalGameRect: GameRect | null = null; // syncOverlay 재호출용 물리(Win32) 좌표 — DIP 이중 변환 방지
let overlayPos: WindowPosition = { offsetX: 10, offsetY: 10 };
let isTracking = false;
const programmaticMoveTimeMap: Record<string, number> = {};
let isClickThrough = false;
let isApplyingSize = false;
let isToolbarShown = true;
let isSidebarCollapsed = false;
let isOverlayVisible = false;
let isChatOverlayVisible = false;
let isChatOverlaySubVisible = false; // 신규 추가
let isChatOverlaySub2Visible = false; // 신규 추가
let onOverlayReady: (() => void) | null = null;
let mandatoryUpdateLock = false;

function setProgrammaticMove(key: string): void { programmaticMoveTimeMap[key] = Date.now(); }
function consumeProgrammaticMove(key: string): boolean {
  const lastTime = programmaticMoveTimeMap[key] || 0;
  return (Date.now() - lastTime) < 200; // 200ms 시간 안전 가드
}

function init() {
  const cfg = config.load();
  isChatOverlayVisible = !!cfg.chatOverlayEnabled;
  isChatOverlaySubVisible = !!cfg.chatOverlaySubEnabled; // 신규 추가
  isChatOverlaySub2Visible = !!cfg.chatOverlaySub2Enabled; // 신규 추가
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
      if (physicalGameRect) { isTracking = false; syncOverlay(physicalGameRect); }
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
}): boolean {
  const winCfg = windowRegistry[key];
  if (!winCfg || winCfg.ref) {
    if (winCfg?.ref) {
      winCfg.ref.close();
    }
    return false; // 닫힘
  }

  // 새 창이 열리므로 예약된 포커스 복구 취소 (레이스 컨디션 방지)
  if (focusRestoreTimer) {
    clearTimeout(focusRestoreTimer);
    focusRestoreTimer = null;
  }

  // 현재 게임 창이 있는 모니터(없으면 주 모니터)의 작업 영역 높이 확인
  const display = gameRect 
    ? screen.getDisplayNearestPoint({ x: gameRect.x, y: gameRect.y }) 
    : screen.getPrimaryDisplay();
  const maxH = display.workAreaSize.height;
  
  // 설정된 높이가 모니터 높이보다 크면 클램핑
  let finalW = winCfg.width;
  let finalH = winCfg.height;
  if (key === 'chatOverlay') {
    const cfg = config.load();
    if (cfg.chatOverlayWidth) finalW = cfg.chatOverlayWidth;
    if (cfg.chatOverlayHeight) finalH = cfg.chatOverlayHeight;
  } else if (key === 'chatOverlaySub') {
    const cfg = config.load();
    if (cfg.chatOverlaySubWidth) finalW = cfg.chatOverlaySubWidth;
    if (cfg.chatOverlaySubHeight) finalH = cfg.chatOverlaySubHeight;
  } else if (key === 'chatOverlaySub2') {
    const cfg = config.load();
    if (cfg.chatOverlaySub2Width) finalW = cfg.chatOverlaySub2Width;
    if (cfg.chatOverlaySub2Height) finalH = cfg.chatOverlaySub2Height;
  }
  finalH = Math.min(finalH, maxH - 40); // 상단 여백 등 고려하여 약간의 여유(40px) 둠

  const win = new BrowserWindow(getStandardOptions(finalW, finalH, {
    skipTaskbar: !!winCfg.skipTaskbar
  }));
  winCfg.ref = win;
  attachStackListeners(win);
  win.loadFile(path.join(__dirname, '..', winCfg.html));
  win.on('ready-to-show', () => {
    if (gameRect) {
      let { x, y } = (callbacks?.calcPosition || winCfg.calcPosition)
        ? (callbacks?.calcPosition || winCfg.calcPosition)!(gameRect, winCfg.pos)
        : { x: Math.round(gameRect.x + gameRect.width + winCfg.pos.offsetX), y: Math.round(gameRect.y + winCfg.pos.offsetY) };
      
      // 채팅 오버레이 창(Main/Sub1/Sub2)의 경우
      if (key === 'chatOverlay' || key === 'chatOverlaySub' || key === 'chatOverlaySub2') {
        const cfg = config.load();
        const hasSavedPos = cfg.positions && cfg.positions[key as keyof typeof cfg.positions];
        
        // 사용자가 수동 드래그하여 저장한 위치가 없을 때(최초 오픈)만 게임창 내부 범위로 강제 클램핑 처리
        if (!hasSavedPos) {
          const minY = gameRect.y;
          const maxY = Math.max(minY, gameRect.y + gameRect.height - finalH);
          y = Math.max(minY, Math.min(y, maxY));
          
          const minX = gameRect.x;
          const maxX = Math.max(minX, gameRect.x + gameRect.width - finalW);
          x = Math.max(minX, Math.min(x, maxX));
        }
      }
      
      win.setPosition(x, y);
    } else {
      win.center();
    }
    win.webContents.send('config-data', config.load());
    if (callbacks?.onReady || winCfg.onOpen) (callbacks?.onReady || winCfg.onOpen)!(win);
    win.show();
    if (IS_DEV) win.webContents.openDevTools({ mode: 'detach' });
  });
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('config-data', config.load());
    if (key === 'chatOverlay') {
      win.webContents.send('chat-overlay-mode', 'main');
    } else if (key === 'chatOverlaySub') {
      win.webContents.send('chat-overlay-mode', 'sub1');
    } else if (key === 'chatOverlaySub2') {
      win.webContents.send('chat-overlay-mode', 'sub2');
    }
  });
  win.on('move', () => {
    if (consumeProgrammaticMove(key) || !winCfg.ref || !gameRect) return;
    const b = winCfg.ref.getBounds();
    winCfg.pos = { offsetX: b.x - (gameRect.x + gameRect.width), offsetY: b.y - gameRect.y };
    savePosition(key, winCfg.pos);
  });
  win.on('closed', () => {
    if (winCfg.onClose) winCfg.onClose();
    winCfg.ref = null;

    // 창이 닫힐 때(사용자가 X를 누르거나, ESC로 닫거나 등) 게임으로 포커스 복구
    // 3단계 방어: isQuitting(앱 종료) → suppressFocusRestore(hideAll) → gameRect(게임 미추적)
    if (!appState.isQuitting && !suppressFocusRestore) {
      if (focusRestoreTimer) clearTimeout(focusRestoreTimer);
      focusRestoreTimer = setTimeout(() => {
        focusRestoreTimer = null;
        if (gameRect) {
          tracker.focusGameWindow();
        }
      }, FOCUS_RESTORE_DELAY_MS);
    }
  });
  return true; // 열림
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
export function toggleGalleryWindow(): boolean {
  return createToggleableWindow('gallery', {
    onReady: (win) => { gallery.updateWindows(null, win, null); if (onOverlayReady) onOverlayReady(); }
  });
}
export function toggleAbbreviationWindow(): boolean { return createToggleableWindow('abbreviation'); }
export function toggleBuffsWindow(): boolean { return createToggleableWindow('buffs'); }
export function toggleBossSettingsWindow(): boolean {
  return createToggleableWindow('bossSettings', {
    onReady: (win) => {
      const bossTimes: Record<string, string[]> = {};
      const bosses = ['골론', '파멸의 기원', '스페르첸드', '골모답', '아칸'];
      bosses.forEach(name => { bossTimes[name] = bossNotifier.getBossTimes(name); });
      win.webContents.send('boss-times-data', bossTimes);
    }
  });
}
export function toggleEtaRankingWindow(): boolean { return createToggleableWindow('etaRanking'); }
export function toggleTradeWindow(): boolean {
  return createToggleableWindow('trade', {
    onReady: (win) => { trade.updateWindows(null, win); }
  });
}
export function toggleCoefficientCalculatorWindow(): boolean { return createToggleableWindow('coefficientCalculator'); }
export function toggleEvolutionCalculatorWindow(): boolean { return createToggleableWindow('evolutionCalculator'); }
export function toggleMagicStoneCalculatorWindow(): boolean { return createToggleableWindow('magicStoneCalculator'); }
export function toggleCustomAlertWindow(): boolean { return createToggleableWindow('customAlert'); }
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

    // 창이 닫힐 때 게임으로 포커스 복구 (createToggleableWindow과 동일한 패턴)
    if (!appState.isQuitting && !suppressFocusRestore) {
      if (focusRestoreTimer) clearTimeout(focusRestoreTimer);
      focusRestoreTimer = setTimeout(() => {
        focusRestoreTimer = null;
        if (gameRect) {
          tracker.focusGameWindow();
        }
      }, FOCUS_RESTORE_DELAY_MS);
    }
  });
}

export function toggleShoutHistoryWindow(): boolean { return createToggleableWindow('shoutHistory'); }
export function toggleDiaryWindow(): boolean { return createToggleableWindow('diary'); }
export function toggleScamDetectorWindow(): boolean { return createToggleableWindow('scamDetector'); }
export function toggleBuffTimerWindow(): boolean { return createToggleableWindow('buffTimer'); }
export function toggleXpHudWindow(): boolean { return createToggleableWindow('xpHud'); }
export function toggleSienaAuraWindow(): boolean { return createToggleableWindow('sienaAura'); }
export function toggleWordAlarmWindow(): boolean { return createToggleableWindow('wordAlarm'); }
export function toggleDiscordAlarmWindow(): boolean { return createToggleableWindow('discordAlarm'); }
export function toggleChatOverlayWindow(): boolean {
  isChatOverlayVisible = !isChatOverlayVisible;
  config.save({ chatOverlayEnabled: isChatOverlayVisible });

  const updated = { ...config.load(), chatOverlayEnabled: isChatOverlayVisible };
  const dockCfg = windowRegistry['dock'];
  [mainWindow, dockCfg?.ref].forEach(win => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('config-data', updated);
    }
  });

  const chatWinCfg = windowRegistry['chatOverlay'];
  const subWinCfg = windowRegistry['chatOverlaySub'];
  const sub2WinCfg = windowRegistry['chatOverlaySub2'];

  if (isChatOverlayVisible) {
    if (!chatWinCfg.ref || chatWinCfg.ref.isDestroyed()) {
      createToggleableWindow('chatOverlay');
    }
    
    // Main 창이 켜질 때, 설정에 저장되어 있던 활성화 상태에 따라 sub1, sub2도 복원
    const cfg = config.load();
    if (cfg.chatOverlaySubEnabled) {
      isChatOverlaySubVisible = true;
      if (!subWinCfg.ref || subWinCfg.ref.isDestroyed()) {
        createToggleableWindow('chatOverlaySub');
      }
    }
    if (cfg.chatOverlaySub2Enabled) {
      isChatOverlaySub2Visible = true;
      if (!sub2WinCfg.ref || sub2WinCfg.ref.isDestroyed()) {
        createToggleableWindow('chatOverlaySub2');
      }
    }
  } else {
    // 꺼질 때는 Main 및 모든 서브 창 닫기
    if (chatWinCfg.ref && !chatWinCfg.ref.isDestroyed()) {
      chatWinCfg.ref.close();
    }
    if (subWinCfg.ref && !subWinCfg.ref.isDestroyed()) {
      subWinCfg.ref.close();
    }
    if (sub2WinCfg.ref && !sub2WinCfg.ref.isDestroyed()) {
      sub2WinCfg.ref.close();
    }
  }
  return isChatOverlayVisible;
}

export function broadcastConfig(): void {
  const cfg = config.load();
  const dockCfg = windowRegistry['dock'];
  const chatWin = windowRegistry['chatOverlay'];
  const sub1Win = windowRegistry['chatOverlaySub'];
  const sub2Win = windowRegistry['chatOverlaySub2'];
  
  [mainWindow, dockCfg?.ref, chatWin?.ref, sub1Win?.ref, sub2Win?.ref].forEach(win => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('config-data', cfg);
    }
  });
}

export function toggleSubWindow(subNum: 1 | 2): void {
  if (subNum === 1) {
    const winCfg = windowRegistry['chatOverlaySub'];
    if (!isChatOverlaySubVisible) {
      isChatOverlaySubVisible = true;
      config.saveImmediate({ chatOverlaySubEnabled: true });
      if (!winCfg.ref || winCfg.ref.isDestroyed()) {
        createToggleableWindow('chatOverlaySub');
      }
    } else {
      isChatOverlaySubVisible = false;
      config.saveImmediate({ chatOverlaySubEnabled: false });
      if (winCfg.ref && !winCfg.ref.isDestroyed()) {
        winCfg.ref.close();
      }
    }
    broadcastConfig();
  } else if (subNum === 2) {
    const winCfg = windowRegistry['chatOverlaySub2'];
    if (!isChatOverlaySub2Visible) {
      isChatOverlaySub2Visible = true;
      config.saveImmediate({ chatOverlaySub2Enabled: true });
      if (!winCfg.ref || winCfg.ref.isDestroyed()) {
        createToggleableWindow('chatOverlaySub2');
      }
    } else {
      isChatOverlaySub2Visible = false;
      config.saveImmediate({ chatOverlaySub2Enabled: false });
      if (winCfg.ref && !winCfg.ref.isDestroyed()) {
        winCfg.ref.close();
      }
    }
    broadcastConfig();
  }
}

let isDockVisible = false;
export function toggleDockWindow(): void {
  const cfg = config.load();
  if (cfg.sidebarPosition !== 'dock') return;

  const winCfg = windowRegistry['dock'];
  if (winCfg.ref && !winCfg.ref.isDestroyed()) {
    if (winCfg.ref.isVisible()) {
      isDockVisible = false;
      winCfg.ref.close();
    } else {
      isDockVisible = true;
      winCfg.ref.show();
      if (gameRect) {
        const { x, y } = winCfg.calcPosition!(gameRect, winCfg.pos);
        winCfg.ref.setPosition(x, y);
      }
    }
  } else {
    isDockVisible = true;
    createToggleableWindow('dock');
  }
}
export function toggleContentsCheckerWindow(): boolean {
  return createToggleableWindow('contentsChecker', {
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

  // 사이드바(mainWindow)와 독바(dock)를 항상 Z-Order 최하단에 배치
  const dockWin = windowRegistry.dock?.ref;
  windows.sort((a, b) => {
    const isSpecialA = (a === mainWindow || a === dockWin);
    const isSpecialB = (b === mainWindow || b === dockWin);
    if (isSpecialA && !isSpecialB) return -1;
    if (!isSpecialA && isSpecialB) return 1;
    if (isSpecialA && isSpecialB) {
      if (a === mainWindow) return -1;
      if (b === mainWindow) return 1;
    }
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
    const cfg = config.load();
    const sidebarPos = cfg.sidebarPosition || 'right';

    if (sidebarPos === 'dock') {
      if (mainWindow.isVisible()) mainWindow.hide();
      const dockCfg = windowRegistry['dock'];
      if (!isDockVisible) {
        if (dockCfg.ref && !dockCfg.ref.isDestroyed()) {
          dockCfg.ref.close();
        }
      }
    } else {
      if (!mainWindow.isVisible()) mainWindow.show();
      const dockCfg = windowRegistry['dock'];
      if (dockCfg.ref && !dockCfg.ref.isDestroyed()) {
        dockCfg.ref.close();
      }
    }

    if (overlayWindow && isOverlayVisible && !overlayWindow.isVisible()) overlayWindow.show();
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
      const b = gameOverlayWindow.getBounds();
      if (Math.abs(b.x - gX) > POSITION_THRESHOLD || Math.abs(b.y - gY) > POSITION_THRESHOLD || Math.abs(b.width - gW) > POSITION_THRESHOLD || Math.abs(b.height - gH) > POSITION_THRESHOLD) {
        gameOverlayWindow.setBounds({ x: gX, y: gY, width: gW, height: gH });
      }
      // 게임 복귀 시 숨겨진 상태면 다시 표시 (isDestroyed 재확인 후 처리)
      if (!gameOverlayWindow.isDestroyed() && !gameOverlayWindow.isVisible()) gameOverlayWindow.showInactive();
    }

    // --- 채팅 오버레이 자동 동기화 및 띄우기 ---
    if (isChatOverlayVisible) {
      const chatWinCfg = windowRegistry['chatOverlay'];
      if (!chatWinCfg.ref || chatWinCfg.ref.isDestroyed()) {
        createToggleableWindow('chatOverlay');
      } else {
        if (!chatWinCfg.ref.isVisible()) {
          chatWinCfg.ref.showInactive();
        }
      }
    } else {
      const chatWinCfg = windowRegistry['chatOverlay'];
      if (chatWinCfg.ref && !chatWinCfg.ref.isDestroyed()) {
        chatWinCfg.ref.close();
      }
    }

    // --- 채팅 오버레이 자동 동기화 및 띄우기 (Sub) ---
    if (isChatOverlayVisible && isChatOverlaySubVisible) {
      const subWinCfg = windowRegistry['chatOverlaySub'];
      if (!subWinCfg.ref || subWinCfg.ref.isDestroyed()) {
        createToggleableWindow('chatOverlaySub');
      } else {
        if (!subWinCfg.ref.isVisible()) {
          subWinCfg.ref.showInactive();
        }
      }
    } else {
      const subWinCfg = windowRegistry['chatOverlaySub'];
      if (subWinCfg.ref && !subWinCfg.ref.isDestroyed()) {
        subWinCfg.ref.close();
      }
    }

    // --- 채팅 오버레이 자동 동기화 및 띄우기 (Sub 2) ---
    if (isChatOverlayVisible && isChatOverlaySub2Visible) {
      const sub2WinCfg = windowRegistry['chatOverlaySub2'];
      if (!sub2WinCfg.ref || sub2WinCfg.ref.isDestroyed()) {
        createToggleableWindow('chatOverlaySub2');
      } else {
        if (!sub2WinCfg.ref.isVisible()) {
          sub2WinCfg.ref.showInactive();
        }
      }
    } else {
      const sub2WinCfg = windowRegistry['chatOverlaySub2'];
      if (sub2WinCfg.ref && !sub2WinCfg.ref.isDestroyed()) {
        sub2WinCfg.ref.close();
      }
    }

    if (sidebarPos === 'dock') {
      const dockCfg = windowRegistry['dock'];
      if (isDockVisible) {
        const scaledGameRect = { x: gX, y: gY, width: gW, height: gH, isForeground: currentRect.isForeground };
        const { x, y } = dockCfg.calcPosition!(scaledGameRect, dockCfg.pos);
        if (!dockCfg.ref || dockCfg.ref.isDestroyed()) {
          createToggleableWindow('dock');
        } else {
          if (!dockCfg.ref.isVisible()) dockCfg.ref.showInactive();
          const b = dockCfg.ref.getBounds();
          if (Math.abs(b.x - x) > POSITION_THRESHOLD || Math.abs(b.y - y) > POSITION_THRESHOLD) {
            setProgrammaticMove('dock');
            dockCfg.ref.setPosition(x, y);
          }
        }
      }
    } else {
      const currentSidebarB = mainWindow.getBounds();
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
    }

    Object.keys(windowRegistry).forEach(key => {
      if (key === 'dock') return;
      const winCfg = windowRegistry[key];
      if (winCfg.ref && !winCfg.ref.isDestroyed() && winCfg.ref.isVisible()) {
        // 스케일링된 좌표(gX, gY 등)를 기반으로 위치 계산
        const scaledGameRect = { x: gX, y: gY, width: gW, height: gH, isForeground: currentRect.isForeground };
        const { x, y } = (winCfg.calcPosition)
          ? winCfg.calcPosition(scaledGameRect, winCfg.pos)
          : { x: Math.round(gX + gW + winCfg.pos.offsetX), y: Math.round(gY + winCfg.pos.offsetY) };
        
        const b = winCfg.ref.getBounds();
        if (Math.abs(b.x - x) > POSITION_THRESHOLD || Math.abs(b.y - y) > POSITION_THRESHOLD) {
          setProgrammaticMove(key);
          winCfg.ref.setPosition(x, y);
        }
      }
    });
    gameRect = { x: gX, y: gY, width: gW, height: gH, isForeground: currentRect.isForeground };
    closeSplashWindow();
    sendActiveWindowsStatus();
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
    if (mainWindow.isVisible()) {
      mainWindow.setBounds({ x: Math.round(newX), y: b.y, width: newSettings.width, height: b.height });
    }

    // 열려있는 자식 창들도 재배치 (사이드바 X 변경에 따른 오프셋 보정)
    if (gameRect) {
      Object.keys(windowRegistry).forEach(key => {
        const winCfg = windowRegistry[key];
        if (winCfg.ref && !winCfg.ref.isDestroyed() && winCfg.ref.isVisible()) {
          const { x, y } = winCfg.calcPosition
            ? winCfg.calcPosition(gameRect!, winCfg.pos)
            : { x: Math.round(gameRect!.x + gameRect!.width + winCfg.pos.offsetX), y: Math.round(gameRect!.y + winCfg.pos.offsetY) };
          
          const b = winCfg.ref.getBounds();
          if (Math.abs(b.x - x) > POSITION_THRESHOLD || Math.abs(b.y - y) > POSITION_THRESHOLD) {
            setProgrammaticMove(key);
            winCfg.ref.setPosition(x, y);
          }
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

  if (newSettings.chatOverlayClickThrough !== undefined) {
    const chatWin = windowRegistry.chatOverlay.ref;
    if (chatWin && !chatWin.isDestroyed()) {
      chatWin.setIgnoreMouseEvents(newSettings.chatOverlayClickThrough, { forward: true });
    }
    const subWin = windowRegistry.chatOverlaySub.ref;
    if (subWin && !subWin.isDestroyed()) {
      subWin.setIgnoreMouseEvents(newSettings.chatOverlayClickThrough, { forward: true });
    }
    const sub2Win = windowRegistry.chatOverlaySub2.ref;
    if (sub2Win && !sub2Win.isDestroyed()) {
      sub2Win.setIgnoreMouseEvents(newSettings.chatOverlayClickThrough, { forward: true });
    }
  }

  if (newSettings.chatOverlayEnabled !== undefined) {
    isChatOverlayVisible = newSettings.chatOverlayEnabled;
    const chatWinCfg = windowRegistry['chatOverlay'];
    if (isChatOverlayVisible) {
      if (gameRect && (!chatWinCfg.ref || chatWinCfg.ref.isDestroyed())) {
        createToggleableWindow('chatOverlay');
      }
    } else {
      if (chatWinCfg.ref && !chatWinCfg.ref.isDestroyed()) {
        chatWinCfg.ref.close();
      }
    }
  }

  if (newSettings.chatOverlayWidth !== undefined || newSettings.chatOverlayHeight !== undefined) {
    const chatWinCfg = windowRegistry['chatOverlay'];
    if (chatWinCfg.ref && !chatWinCfg.ref.isDestroyed()) {
      const b = chatWinCfg.ref.getBounds();
      const w = newSettings.chatOverlayWidth ?? b.width;
      const h = newSettings.chatOverlayHeight ?? b.height;
      chatWinCfg.ref.setBounds({ x: b.x, y: b.y, width: w, height: h });
    }
  }

  if (newSettings.chatOverlaySubWidth !== undefined || newSettings.chatOverlaySubHeight !== undefined) {
    const subWinCfg = windowRegistry['chatOverlaySub'];
    if (subWinCfg.ref && !subWinCfg.ref.isDestroyed()) {
      const b = subWinCfg.ref.getBounds();
      const w = newSettings.chatOverlaySubWidth ?? b.width;
      const h = newSettings.chatOverlaySubHeight ?? b.height;
      subWinCfg.ref.setBounds({ x: b.x, y: b.y, width: w, height: h });
    }
  }

  if (newSettings.chatOverlaySub2Width !== undefined || newSettings.chatOverlaySub2Height !== undefined) {
    const sub2WinCfg = windowRegistry['chatOverlaySub2'];
    if (sub2WinCfg.ref && !sub2WinCfg.ref.isDestroyed()) {
      const b = sub2WinCfg.ref.getBounds();
      const w = newSettings.chatOverlaySub2Width ?? b.width;
      const h = newSettings.chatOverlaySub2Height ?? b.height;
      sub2WinCfg.ref.setBounds({ x: b.x, y: b.y, width: w, height: h });
    }
  }

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
  const chatWin = windowRegistry.chatOverlay.ref;
  const subWin = windowRegistry.chatOverlaySub.ref;
  const sub2Win = windowRegistry.chatOverlaySub2.ref;
  // 오버레이 창들이 모두 닫혀 있다면 작동 무시
  if (!overlayWindow && (!chatWin || chatWin.isDestroyed()) && (!subWin || subWin.isDestroyed()) && (!sub2Win || sub2Win.isDestroyed())) {
    return false;
  }

  isClickThrough = !isClickThrough;

  // 1. 웹 브라우저 오버레이 투과 제어
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.setIgnoreMouseEvents(isClickThrough);
    if (isClickThrough && isToolbarShown) { isToolbarShown = false; updateViewBounds(); }
    overlayWindow.webContents.send('click-through-status', isClickThrough);
  }

  // 2. 채팅 오버레이 투과 제어 및 설정 실시간 동기화/저장
  if (chatWin && !chatWin.isDestroyed()) {
    chatWin.setIgnoreMouseEvents(isClickThrough, { forward: true });
  }
  if (subWin && !subWin.isDestroyed()) {
    subWin.setIgnoreMouseEvents(isClickThrough, { forward: true });
  }
  if (sub2Win && !sub2Win.isDestroyed()) {
    sub2Win.setIgnoreMouseEvents(isClickThrough, { forward: true });
  }

  config.save({ chatOverlayClickThrough: isClickThrough });
  const updatedCfg = config.load();
  if (chatWin && !chatWin.isDestroyed()) chatWin.webContents.send('config-data', updatedCfg);
  if (subWin && !subWin.isDestroyed()) subWin.webContents.send('config-data', updatedCfg);
  if (sub2Win && !sub2Win.isDestroyed()) sub2Win.webContents.send('config-data', updatedCfg);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('click-through-status', isClickThrough);
    mainWindow.webContents.send('config-data', config.load());
  }

  // 설정 화면이 켜져 있는 경우 UI 체크박스 실시간 반응을 위해 config 재송신
  const settingsWin = windowRegistry.settings.ref;
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.webContents.send('config-data', config.load());
  }

  return isClickThrough;
}

export function toggleSidebar(): boolean {
  isSidebarCollapsed = !isSidebarCollapsed;
  mainWindow?.webContents.send('sidebar-status', isSidebarCollapsed);
  return isSidebarCollapsed;
}

export function hideAll(): void {
  // 게임 종료/최소화 시 포커스 복구 억제 (closed 이벤트가 동기 발생하는 경우 방어)
  suppressFocusRestore = true;

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

  suppressFocusRestore = false;

  // closed 이벤트가 비동기 발생하는 경우를 대비하여 gameRect를 먼저 null 처리
  // → 타이머 콜백의 gameRect 체크가 최종 방어선 역할
  isTracking = false;
  gameRect = null; // 게임 상태 초기화
  physicalGameRect = null;

  // 동기 closed에서 설정된 타이머도 정리
  if (focusRestoreTimer) {
    clearTimeout(focusRestoreTimer);
    focusRestoreTimer = null;
  }

  closeSplashWindow();
}

export function getMainWindow(): BrowserWindow | null {
  return (mainWindow && !mainWindow.isDestroyed()) ? mainWindow : null;
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

  // 독바 숨김
  const dockCfg = windowRegistry['dock'];
  if (dockCfg && dockCfg.ref && !dockCfg.ref.isDestroyed() && dockCfg.ref.isVisible()) {
    dockCfg.ref.hide();
  }

  // 채팅 오버레이 닫기
  const chatWinCfg = windowRegistry['chatOverlay'];
  if (chatWinCfg && chatWinCfg.ref && !chatWinCfg.ref.isDestroyed()) {
    chatWinCfg.ref.close();
  }
  const subWinCfg = windowRegistry['chatOverlaySub'];
  if (subWinCfg && subWinCfg.ref && !subWinCfg.ref.isDestroyed()) {
    subWinCfg.ref.close();
  }
  const sub2WinCfg = windowRegistry['chatOverlaySub2'];
  if (sub2WinCfg && sub2WinCfg.ref && !sub2WinCfg.ref.isDestroyed()) {
    sub2WinCfg.ref.close();
  }

  isTracking = false;
  gameRect = null; // 게임 상태 초기화
  physicalGameRect = null;
  closeSplashWindow();
}
export function showGameExitReminder(): void {
  const cfg = config.load();
  if (!cfg.gameExitReminderEnabled || !cfg.gameExitReminderMessage?.trim()) return;

  const presets = cfg.characterPresets || [{ id: MAIN_CHAR_ID, name: DEFAULT_CHAR_NAME }];
  const items = cfg.contentsCheckerItems || [];
  
  const incompleteItems: any[] = [];

  // 모든 캐릭터를 순회하며 미완료 숙제 수집
  presets.forEach(char => {
    items.forEach(item => {
      const state = item.completedState?.[char.id];
      // 가시성이 있고, 해당 캐릭터가 제외되지 않았으며, 아직 완료하지 않은 항목
      if (item.isVisible && !state?.isExcluded && !state?.isCompleted) {
        incompleteItems.push({
          charName: char.name,
          name: item.name,
          category: item.category,
          type: item.resetRule.type
        });
      }
    });
  });

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

export function sendActiveWindowsStatus(): void {
  const activeKeys: string[] = [];
  Object.keys(windowRegistry).forEach(key => {
    if (key === 'dock') return;
    const winCfg = windowRegistry[key];
    if (winCfg.ref && !winCfg.ref.isDestroyed() && winCfg.ref.isVisible()) {
      activeKeys.push(key);
    }
  });
  const dockCfg = windowRegistry['dock'];
  if (dockCfg && dockCfg.ref && !dockCfg.ref.isDestroyed()) {
    dockCfg.ref.webContents.send('active-windows', activeKeys);
  }
}

export function setChatOverlaySize(mode: 'main' | 'sub1' | 'sub2', width: number, height: number): void {
  const key = mode === 'main' ? 'chatOverlay' : (mode === 'sub1' ? 'chatOverlaySub' : 'chatOverlaySub2');
  const winCfg = windowRegistry[key];
  if (winCfg.ref && !winCfg.ref.isDestroyed()) {
    const b = winCfg.ref.getBounds();
    winCfg.ref.setBounds({ x: b.x, y: b.y, width, height });
  }
}


