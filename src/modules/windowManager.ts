/**
 * 창 관리 모듈 - WebContentsView + 창별 독립 플래그 버전
 */
import { BrowserWindow, WebContentsView, screen, Rectangle } from 'electron';
import * as path from 'path';
import { MIN_W, MIN_H, IS_DEV, AppConfig, WindowPosition, SIDEBAR_HEIGHT } from './constants';
import * as config from './config';
import { log } from './logger';

// --- 상태 관리 ---
let mainWindow: BrowserWindow | null = null; // 사이드바
let overlayWindow: BrowserWindow | null = null; // 오버레이
let settingsWindow: BrowserWindow | null = null;
let galleryWindow: BrowserWindow | null = null;
let view: WebContentsView | null = null;

let gameRect: Rectangle | null = null;
let overlayPos: WindowPosition = { offsetX: 10, offsetY: 10 };
let settingsPos: WindowPosition = { offsetX: -1010, offsetY: 40 };
let galleryPos: WindowPosition = { offsetX: -320, offsetY: 40 };

let isTracking = false;
const isProgrammaticMoveMap: Record<string, boolean> = {};
let isClickThrough = false;
let isApplyingSize = false;
let isSidebarCollapsed = false;
let isOverlayVisible = false;
let onOverlayReady: (() => void) | null = null;

function setProgrammaticMove(key: string): void { isProgrammaticMoveMap[key] = true; }
function consumeProgrammaticMove(key: string): boolean {
  if (isProgrammaticMoveMap[key]) { isProgrammaticMoveMap[key] = false; return true; }
  return false;
}

// 초기 설정 로드
function init() {
  const cfg = config.load();
  if (cfg.positions) {
    if (cfg.positions.overlay) overlayPos = { ...cfg.positions.overlay };
    if (cfg.positions.settings) settingsPos = { ...cfg.positions.settings };
    if (cfg.positions.gallery) galleryPos = { ...cfg.positions.gallery };
  }
}
init();

function savePosition(winType: 'overlay' | 'settings' | 'gallery', pos: WindowPosition, immediate = false) {
  const currentCfg = config.load();
  const positions = { ...(currentCfg.positions || {}), [winType]: { ...pos } };
  if (immediate) config.saveImmediate({ positions } as any);
  else config.save({ positions } as any);
}

export const getMainWindow = () => mainWindow;
export const getOverlayWindow = () => overlayWindow;
export const getSettingsWindow = () => settingsWindow;
export const getGalleryWindow = () => galleryWindow;
export const getView = () => { if (overlayWindow) return view; return null; };
export const getIsOverlayVisible = () => isOverlayVisible;

/** 오버레이 창 준비 완료 시 콜백 등록 (순환 참조 회피) */
export function onOverlayWindowReady(callback: () => void): void {
  onOverlayReady = callback;
}

/** 메인 사이드바 생성 - 사용자 설정 반영 */
export function createMainWindow(): BrowserWindow {
  const cfg = config.load();
  isOverlayVisible = cfg.overlayVisible !== false;

  mainWindow = new BrowserWindow({
    width: 38, 
    height: SIDEBAR_HEIGHT,
    frame: false, 
    transparent: true, 
    alwaysOnTop: true,
    show: false, 
    skipTaskbar: true,
    resizable: false, 
    thickFrame: false, 
    focusable: false, 
    acceptFirstMouse: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true, nodeIntegration: false
    }
  });
  
  mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));
  
  mainWindow.on('ready-to-show', () => {
    if (IS_DEV) {
      mainWindow?.webContents.openDevTools({ mode: 'detach' });
    }
    mainWindow?.webContents.send('config-data', config.load());
  });
  mainWindow.on('move', () => { consumeProgrammaticMove('main'); });
  return mainWindow;
}

/** 오버레이 브라우저 생성 */
function createOverlayWindow(targetUrl?: string): void {
  if (overlayWindow) return;
  const cfg = config.load();

  overlayWindow = new BrowserWindow({
    width: cfg.width, height: cfg.height,
    minWidth: MIN_W, minHeight: MIN_H,
    frame: false, transparent: true, alwaysOnTop: true, show: false, skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true, nodeIntegration: false, backgroundThrottling: true
    }
  });
  
  overlayWindow.setOpacity(cfg.opacity);
  overlayWindow.loadFile(path.join(__dirname, '..', 'overlay.html'));

  view = new WebContentsView({ webPreferences: { backgroundThrottling: true } });
  overlayWindow.contentView.addChildView(view);
  
  view.webContents.setWindowOpenHandler(({ url }) => {
    if (view) view.webContents.loadURL(url);
    return { action: 'deny' };
  });

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
      const clampedX = Math.max(gameRect.x, Math.min(b.x, gameRect.x + gameRect.width - b.width));
      const clampedY = Math.max(gameRect.y, Math.min(b.y, gameRect.y + gameRect.height - b.height));
      if (Math.round(b.x) !== Math.round(clampedX) || Math.round(b.y) !== Math.round(clampedY)) {
        setProgrammaticMove('overlay');
        overlayWindow.setPosition(Math.round(clampedX), Math.round(clampedY));
        const finalB = overlayWindow.getBounds();
        overlayPos.offsetX = finalB.x - gameRect.x;
        overlayPos.offsetY = finalB.y - gameRect.y;
      } else {
        overlayPos.offsetX = b.x - gameRect.x;
        overlayPos.offsetY = b.y - gameRect.y;
      }
      savePosition('overlay', overlayPos);
    }
  });

  overlayWindow.once('ready-to-show', () => {
    updateViewBounds();
    if (isOverlayVisible) {
      overlayWindow?.show();
      if (gameRect) { isTracking = false; syncOverlay(gameRect); }
    }
    overlayWindow?.webContents.send('config-data', config.load());
    if (IS_DEV) {
      overlayWindow?.webContents.openDevTools({ mode: 'detach' });
      view?.webContents.openDevTools({ mode: 'detach' });
    }
    // 콜백으로 갤러리 모니터에 창 참조 전달 (순환 참조 회피)
    if (onOverlayReady) onOverlayReady();
  });

  overlayWindow.on('closed', () => { overlayWindow = null; view = null; isTracking = false; });
}

export function toggleSettingsWindow(): void {
  if (settingsWindow) { settingsWindow.close(); return; }
  settingsWindow = new BrowserWindow({
    width: 1000, height: 650, frame: false, transparent: true, alwaysOnTop: true, show: false,
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  settingsWindow.loadFile(path.join(__dirname, '..', 'settings.html'));
  settingsWindow.on('ready-to-show', () => {
    if (gameRect) {
      const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;
      let targetX = Math.round(gameRect.x + gameRect.width + settingsPos.offsetX);
      let targetY = Math.round(gameRect.y + settingsPos.offsetY);
      if (targetX < 0) targetX = 10;
      if (targetX + 1000 > screenWidth) targetX = screenWidth - 1010;
      settingsWindow?.setPosition(targetX, targetY);
    }
    settingsWindow?.webContents.send('config-data', config.load());
    settingsWindow?.show();
    if (IS_DEV) settingsWindow?.webContents.openDevTools({ mode: 'detach' });
  });
  settingsWindow.on('move', () => {
    if (consumeProgrammaticMove('settings') || !settingsWindow || !gameRect) return;
    const b = settingsWindow.getBounds();
    settingsPos.offsetX = b.x - (gameRect.x + gameRect.width);
    settingsPos.offsetY = b.y - gameRect.y;
    savePosition('settings', settingsPos);
  });
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

export function toggleGalleryWindow(): void {
  if (galleryWindow) { galleryWindow.close(); return; }
  galleryWindow = new BrowserWindow({
    width: 320, height: 500, frame: false, transparent: true, alwaysOnTop: true, show: false,
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  galleryWindow.loadFile(path.join(__dirname, '..', 'gallery.html'));
  galleryWindow.on('ready-to-show', () => {
    if (gameRect) {
      galleryWindow?.setPosition(Math.round(gameRect.x + gameRect.width + galleryPos.offsetX), Math.round(gameRect.y + galleryPos.offsetY));
    }
    galleryWindow?.webContents.send('config-data', config.load());
    galleryWindow?.show();
    if (IS_DEV) galleryWindow?.webContents.openDevTools({ mode: 'detach' });
    // 콜백으로 갤러리 창 참조 전달 (순환 참조 회피)
    if (onOverlayReady) onOverlayReady();
  });
  galleryWindow.on('move', () => {
    if (consumeProgrammaticMove('gallery') || !galleryWindow || !gameRect) return;
    const b = galleryWindow.getBounds();
    galleryPos.offsetX = b.x - (gameRect.x + gameRect.width);
    galleryPos.offsetY = b.y - gameRect.y;
    savePosition('gallery', galleryPos);
  });
  galleryWindow.on('closed', () => { galleryWindow = null; });
}

export function updateViewBounds(): void {
  if (!overlayWindow || !view) return;
  const b = overlayWindow.getBounds();
  view.setBounds({ x: 0, y: 40, width: b.width, height: b.height - 40 });
}

export function setOverlayVisible(visible: boolean, targetUrl?: string): boolean {
  if (isOverlayVisible === visible && (visible ? !!overlayWindow : !overlayWindow)) {
    if (visible && targetUrl && view) { view.webContents.loadURL(targetUrl); }
    return isOverlayVisible;
  }
  isOverlayVisible = visible;
  if (isOverlayVisible) createOverlayWindow(targetUrl);
  else if (overlayWindow) {
    savePosition('overlay', overlayPos, true);
    overlayWindow.close(); overlayWindow = null; view = null; isTracking = false;
  }
  if (mainWindow) mainWindow.webContents.send('overlay-status', isOverlayVisible);
  config.save({ overlayVisible: isOverlayVisible });
  return isOverlayVisible;
}

export function toggleOverlay(): boolean { return setOverlayVisible(!isOverlayVisible); }

export function syncOverlay(currentRect: any): void {
  if (!mainWindow || isApplyingSize) return;
  if (currentRect && currentRect.x > -10000) {
    const wasVisible = mainWindow.isVisible();
    if (!wasVisible) mainWindow.show();
    if (overlayWindow && isOverlayVisible && !overlayWindow.isVisible()) overlayWindow.show();

    const scaleFactor = screen.getPrimaryDisplay().scaleFactor;
    const gX = Math.round(currentRect.x / scaleFactor);
    const gY = Math.round(currentRect.y / scaleFactor);
    const gW = Math.round(currentRect.width / scaleFactor);
    const gH = Math.round(currentRect.height / scaleFactor);

    if (overlayWindow && isOverlayVisible) {
      const b = overlayWindow.getBounds();
      let newW = b.width, newH = b.height;
      if (b.width > gW) newW = Math.max(MIN_W, gW);
      if (b.height > gH) newH = Math.max(MIN_H, gH);
      if (!isTracking) isTracking = true;
      const targetX = Math.round(gX + overlayPos.offsetX);
      const targetY = Math.round(gY + overlayPos.offsetY);
      const finalX = Math.max(gX, Math.min(targetX, gX + gW - newW));
      const finalY = Math.max(gY, Math.min(targetY, gY + gH - newH));
      if (Math.abs(b.x - finalX) > 1 || Math.abs(b.y - finalY) > 1) {
        setProgrammaticMove('overlay');
        overlayWindow.setBounds({ x: finalX, y: finalY, width: newW, height: newH });
      }
    } else if (isOverlayVisible && !overlayWindow) createOverlayWindow();

    // 사이드바 이동 (현재 너비 유지하면서 높이는 SIDEBAR_HEIGHT 고정)
    const currentSidebarB = mainWindow.getBounds();
    const wasOffScreen = currentSidebarB.x <= -1000;

    setProgrammaticMove('main');
    const newSidebarBounds = { x: gX + gW, y: gY + 40, width: currentSidebarB.width, height: SIDEBAR_HEIGHT };
    mainWindow.setBounds(newSidebarBounds);



    if (settingsWindow && !settingsWindow.isDestroyed() && settingsWindow.isVisible()) {
      setProgrammaticMove('settings');
      settingsWindow.setPosition(Math.round(gX + gW + settingsPos.offsetX), Math.round(gY + settingsPos.offsetY));
    }
    if (galleryWindow && !galleryWindow.isDestroyed() && galleryWindow.isVisible()) {
      setProgrammaticMove('gallery');
      galleryWindow.setPosition(Math.round(gX + gW + galleryPos.offsetX), Math.round(gY + galleryPos.offsetY));
    }
    gameRect = { x: gX, y: gY, width: gW, height: gH };
  } else hideAll();
}

export function applySettings(newSettings: any): void {
  // 사이드바 일시적 리사이징 요청 (툴팁 공간 확보)
  if (newSettings.isSidebarResize && mainWindow) {
    const b = mainWindow.getBounds();
    setProgrammaticMove('main');
    mainWindow.setBounds({ x: b.x, y: b.y, width: newSettings.width, height: SIDEBAR_HEIGHT });
    return;
  }

  const current = config.load();
  const updated = { ...current, ...newSettings };
  config.saveImmediate(updated);
  
  if (overlayWindow) {
    isApplyingSize = true;
    const b = overlayWindow.getBounds();
    const newW = Math.max(MIN_W, updated.width);
    const newH = Math.max(MIN_H, updated.height);
    overlayWindow.setBounds({ x: b.x, y: b.y, width: newW, height: newH });
    overlayWindow.setOpacity(updated.opacity);
    updateViewBounds();
    setTimeout(() => { isApplyingSize = false; }, 300);
  }
  
  [mainWindow, overlayWindow, settingsWindow, galleryWindow].forEach(win => {
    win?.webContents.send('config-data', updated);
  });
}

export function toggleClickThrough(): boolean {
  if (!overlayWindow) return false;
  isClickThrough = !isClickThrough;
  overlayWindow.setIgnoreMouseEvents(isClickThrough);
  overlayWindow.webContents.send('click-through-status', isClickThrough);
  return isClickThrough;
}

export function toggleSidebar(): boolean {
  isSidebarCollapsed = !isSidebarCollapsed;
  mainWindow?.webContents.send('sidebar-status', isSidebarCollapsed);
  return isSidebarCollapsed;
}

export function hideAll(): void {
  [overlayWindow, mainWindow, settingsWindow, galleryWindow].forEach(win => {
    if (win && win.isVisible()) win.hide();
  });
  isTracking = false;
}
