/**
 * 창 관리 모듈 - 메인 윈도우, 사이드바, BrowserView 생성 및 동기화
 */
const { BrowserWindow, BrowserView, screen } = require('electron');
const path = require('path');
const { MIN_W, MIN_H, IS_DEV } = require('./constants');
const config = require('./config');

// --- 상태 ---
let mainWindow = null;
let sidebarWindow = null;
let view = null;
let gameRect = null;
let offset = { x: 10, y: 10 };
let isTracking = false;
let isProgrammaticMove = false;
let isClickThrough = false;
let isApplyingSize = false;
let isSidebarCollapsed = false;

// --- Getter ---
function getMainWindow() { return mainWindow; }
function getSidebarWindow() { return sidebarWindow; }
function getView() { return view; }
function getGameRect() { return gameRect; }
function getIsTracking() { return isTracking; }
function getIsClickThrough() { return isClickThrough; }

// --- BrowserView 영역 업데이트 ---
function updateViewBounds() {
  if (!mainWindow || !view) return;
  const b = mainWindow.getBounds();
  view.setBounds({ x: 0, y: 40, width: b.width, height: b.height - 40 });
}

// --- 창 생성 ---
function createWindows() {
  const cfg = config.load();

  // 메인 윈도우
  const windowOptions = {
    width: cfg.width, height: cfg.height,
    minWidth: MIN_W, minHeight: MIN_H,
    frame: false, transparent: true, alwaysOnTop: true, show: false, skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      devTools: true,
      backgroundThrottling: true,
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: false
    }
  };
  if (cfg.x !== undefined && cfg.y !== undefined) {
    windowOptions.x = cfg.x;
    windowOptions.y = cfg.y;
  }

  mainWindow = new BrowserWindow(windowOptions);
  mainWindow.setOpacity(cfg.opacity);
  mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));

  // 사이드바 윈도우
  sidebarWindow = new BrowserWindow({
    width: 38, height: 400,
    frame: false, transparent: true, alwaysOnTop: false, show: false, skipTaskbar: true,
    resizable: false,
    thickFrame: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true, nodeIntegration: false
    }
  });
  sidebarWindow.loadFile(path.join(__dirname, '..', 'sidebar.html'));
  sidebarWindow.on('ready-to-show', () => {
    sidebarWindow.webContents.send('config-data', config.load());
    // 투명 영역 클릭 투과 (forward: mouse move는 전달하여 hover 감지 가능)
    sidebarWindow.setIgnoreMouseEvents(true, { forward: true });
  });

  // BrowserView (웹 콘텐츠)
  view = new BrowserView({
    webPreferences: { backgroundThrottling: true }
  });
  mainWindow.setBrowserView(view);
  view.webContents.loadURL(cfg.url || cfg.homeUrl);

  // 새 창 열기 방지
  view.webContents.setWindowOpenHandler(({ url }) => {
    view.webContents.loadURL(url);
    return { action: 'deny' };
  });

  // 개발 모드 DevTools
  if (IS_DEV) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    view.webContents.openDevTools({ mode: 'detach' });
    sidebarWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // 로딩 상태 전달
  view.webContents.on('did-start-loading', () => mainWindow.webContents.send('load-status', true));
  view.webContents.on('did-stop-loading', () => mainWindow.webContents.send('load-status', false));

  // URL 변경 추적
  const updateUrl = () => {
    const currentUrl = view.webContents.getURL();
    mainWindow.webContents.send('url-change', currentUrl);
    config.save({ url: currentUrl });
  };
  view.webContents.on('did-navigate', updateUrl);
  view.webContents.on('did-navigate-in-page', updateUrl);

  // resize/move 이벤트
  mainWindow.on('resize', () => {
    updateViewBounds();
    config.save(mainWindow.getBounds());
  });

  mainWindow.on('move', () => {
    if (isProgrammaticMove || isApplyingSize) {
      isProgrammaticMove = false;
      return;
    }
    const b = mainWindow.getBounds();
    if (isTracking && gameRect) {
      const clampedX = Math.max(gameRect.x, Math.min(b.x, gameRect.x + gameRect.width - b.width));
      const clampedY = Math.max(gameRect.y, Math.min(b.y, gameRect.y + gameRect.height - b.height));
      if (Math.round(b.x) !== Math.round(clampedX) || Math.round(b.y) !== Math.round(clampedY)) {
        isProgrammaticMove = true;
        mainWindow.setPosition(Math.round(clampedX), Math.round(clampedY));
        const finalB = mainWindow.getBounds();
        offset.x = finalB.x - gameRect.x;
        offset.y = finalB.y - gameRect.y;
      } else {
        offset.x = b.x - gameRect.x;
        offset.y = b.y - gameRect.y;
      }
    }
    config.save(mainWindow.getBounds());
  });

  mainWindow.once('ready-to-show', () => {
    updateViewBounds();
    mainWindow.show();
    mainWindow.webContents.send('config-data', config.load());
  });

  return { mainWindow, sidebarWindow, view };
}

// --- 게임 창과 오버레이 동기화 ---
function syncOverlay(currentRect) {
  if (!mainWindow || isApplyingSize) return;

  if (currentRect && currentRect.x > -10000) {
    if (!mainWindow.isVisible()) mainWindow.show();
    if (sidebarWindow && !sidebarWindow.isVisible()) sidebarWindow.show();

    const scaleFactor = screen.getPrimaryDisplay().scaleFactor;
    const gX = Math.round(currentRect.x / scaleFactor);
    const gY = Math.round(currentRect.y / scaleFactor);
    const gW = Math.round(currentRect.width / scaleFactor);
    const gH = Math.round(currentRect.height / scaleFactor);

    const b = mainWindow.getBounds();
    let newW = b.width, newH = b.height, needsResize = false;
    if (b.width > gW) { newW = Math.max(MIN_W, gW); needsResize = true; }
    if (b.height > gH) { newH = Math.max(MIN_H, gH); needsResize = true; }

    if (!isTracking) {
      offset.x = Math.max(0, Math.min(b.x - gX, gW - b.width));
      offset.y = Math.max(0, Math.min(b.y - gY, gH - b.height));
      isTracking = true;
    }

    const targetX = Math.round(gX + offset.x);
    const targetY = Math.round(gY + offset.y);
    const finalX = Math.max(gX, Math.min(targetX, gX + gW - newW));
    const finalY = Math.max(gY, Math.min(targetY, gY + gH - newH));

    if (needsResize || Math.abs(b.x - finalX) > 1 || Math.abs(b.y - finalY) > 1) {
      isProgrammaticMove = true;
      mainWindow.setBounds({ x: Math.round(finalX), y: Math.round(finalY), width: Math.round(newW), height: Math.round(newH) });
    }

    // 사이드바 동기화
    if (sidebarWindow) {
      sidebarWindow.setBounds({
        x: Math.round(gX + gW),
        y: Math.round(gY + 40)
      });
    }

    gameRect = { x: gX, y: gY, width: gW, height: gH };
  } else {
    hideAll();
  }
}

// --- 클릭 투과 모드 토글 ---
function toggleClickThrough(focusFn) {
  isClickThrough = !isClickThrough;
  if (isClickThrough) {
    mainWindow.setIgnoreMouseEvents(true);
    mainWindow.blur();
    if (focusFn) setTimeout(focusFn, 50);
  } else {
    mainWindow.setIgnoreMouseEvents(false);
  }
  mainWindow.webContents.send('click-through-status', isClickThrough);
  return isClickThrough;
}

// --- 사이드바 토글 ---
function toggleSidebar() {
  isSidebarCollapsed = !isSidebarCollapsed;
  if (sidebarWindow) sidebarWindow.webContents.send('sidebar-status', isSidebarCollapsed);
  return isSidebarCollapsed;
}

// --- 전체 숨기기 ---
function hideAll() {
  if (mainWindow && mainWindow.isVisible()) mainWindow.hide();
  if (sidebarWindow && sidebarWindow.isVisible()) sidebarWindow.hide();
  isTracking = false;
}

// --- 설정 적용 (크기/URL 등) ---
function applySettings(newSettings) {
  isApplyingSize = true;
  const b = mainWindow.getBounds();
  const newW = Math.max(MIN_W, parseInt(newSettings.width));
  const newH = Math.max(MIN_H, parseInt(newSettings.height));
  let nextX = b.x, nextY = b.y;
  if (isTracking && gameRect) {
    nextX = Math.max(gameRect.x, Math.min(b.x, gameRect.x + gameRect.width - newW));
    nextY = Math.max(gameRect.y, Math.min(b.y, gameRect.y + gameRect.height - newH));
  }
  mainWindow.setBounds({ x: Math.round(nextX), y: Math.round(nextY), width: newW, height: newH });
  config.save({ ...newSettings, width: newW, height: newH });
  updateViewBounds();
  if (isTracking && gameRect) {
    const fb = mainWindow.getBounds();
    offset.x = fb.x - gameRect.x;
    offset.y = fb.y - gameRect.y;
  }
  mainWindow.webContents.send('config-data', config.load());
  setTimeout(() => { isApplyingSize = false; }, 300);
}

// --- 패널 토글 (설정/메뉴 열기 시 view 영역 조정) ---
function adjustViewForPanel(isOpen) {
  if (!view) return;
  const b = mainWindow.getBounds();
  if (isOpen) view.setBounds({ x: 0, y: 340, width: b.width, height: b.height - 340 });
  else updateViewBounds();
}

// --- 사이드바 설정 모드 (창 크기 조절) ---
function setSidebarSettingsMode(isOpen) {
  if (!sidebarWindow || !gameRect) return;
  const rightEdge = gameRect.x + gameRect.width;
  const top = gameRect.y + 40;
  const h = Math.min(gameRect.height - 40, 450);
  if (isOpen) {
    sidebarWindow.setBounds({ x: Math.round(rightEdge), y: Math.round(top), width: 320, height: h });
  } else {
    // 원래 크기로 복귀 (게임 우측 가장자리 기준)
    const sidebarW = isSidebarCollapsed ? 12 : 38;
    sidebarWindow.setBounds({ x: Math.round(rightEdge), y: Math.round(top), width: sidebarW, height: h });
  }
}

module.exports = {
  createWindows,
  getMainWindow,
  getSidebarWindow,
  getView,
  getGameRect,
  getIsTracking,
  getIsClickThrough,
  updateViewBounds,
  syncOverlay,
  toggleClickThrough,
  toggleSidebar,
  hideAll,
  applySettings,
  adjustViewForPanel,
  setSidebarSettingsMode
};
