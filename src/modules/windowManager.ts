/**
 * 창 관리 모듈 - WebContentsView + 동적 Z-Order 스택 버전
 */
import { BrowserWindow, WebContentsView, screen, Rectangle } from 'electron';
import * as path from 'path';
import { MIN_W, MIN_H, IS_DEV, WindowPosition, SIDEBAR_HEIGHT, SIDEBAR_WIDTH, OVERLAY_TOOLBAR_HEIGHT, GameRect } from './constants';
import * as config from './config';
import { log } from './logger';
import * as bossNotifier from './bossNotifier';

// --- 상태 관리 ---
let activeWindowsStack: BrowserWindow[] = []; // 창 겹침 순서 스택 (뒤로 갈수록 위쪽)

/** 창을 스택의 맨 위(가장 나중)로 이동 */
function pushToStack(win: BrowserWindow | null): void {
  if (!win || win.isDestroyed()) return;
  activeWindowsStack = activeWindowsStack.filter(w => w !== win && !w.isDestroyed());
  activeWindowsStack.push(win);
}

/** 창이 닫힐 때 스택에서 제거 */
function removeFromStack(win: BrowserWindow | null): void {
  activeWindowsStack = activeWindowsStack.filter(w => w !== win);
}

/** 창에 포커스/표시 이벤트 리스너 등록 */
function attachStackListeners(win: BrowserWindow): void {
  win.on('focus', () => pushToStack(win));
  win.on('show', () => pushToStack(win));
  win.on('closed', () => removeFromStack(win));
  // 생성 즉시 스택에 추가
  pushToStack(win);
}

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let galleryWindow: BrowserWindow | null = null;
let abbreviationWindow: BrowserWindow | null = null;
let buffsWindow: BrowserWindow | null = null;
let bossSettingsWindow: BrowserWindow | null = null;
let monitorZoneWindow: BrowserWindow | null = null;
let view: WebContentsView | null = null;

let gameRect: Rectangle | null = null;
let overlayPos: WindowPosition = { offsetX: 10, offsetY: 10 };
let settingsPos: WindowPosition = { offsetX: -1010, offsetY: 40 };
let galleryPos: WindowPosition = { offsetX: -320, offsetY: 40 };
let abbreviationPos: WindowPosition = { offsetX: -320, offsetY: 40 };
let buffsPos: WindowPosition = { offsetX: -1000, offsetY: 40 };
let bossSettingsPos: WindowPosition = { offsetX: -320, offsetY: 40 };
let monitorZonePos: WindowPosition = { offsetX: 400, offsetY: 300 };

let isTracking = false;
const isProgrammaticMoveMap: Record<string, boolean> = {};
let isClickThrough = false;
let isApplyingSize = false;
let isSidebarCollapsed = false;
let isOverlayVisible = false;
let isScreenWatching = false;
let onOverlayReady: (() => void) | null = null;
let onScreenWatchStop: (() => void) | null = null;

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
    if (cfg.positions.abbreviation) abbreviationPos = { ...cfg.positions.abbreviation };
    if (cfg.positions.buffs) buffsPos = { ...cfg.positions.buffs };
    if (cfg.positions.bossSettings) bossSettingsPos = { ...cfg.positions.bossSettings };
  }
}
init();

function savePosition(winType: string, pos: WindowPosition, immediate = false) {
  const currentCfg = config.load();
  const positions = { ...(currentCfg.positions || {}), [winType]: { ...pos } };
  if (immediate) config.saveImmediate({ positions } as any);
  else config.save({ positions } as any);
}

export const getMainWindow = () => mainWindow;
export const getSplashWindow = () => splashWindow;
export const getOverlayWindow = () => overlayWindow;
export const getSettingsWindow = () => settingsWindow;
export const getGalleryWindow = () => galleryWindow;
export const getAbbreviationWindow = () => abbreviationWindow;
export const getBuffsWindow = () => buffsWindow;
export const getBossSettingsWindow = () => bossSettingsWindow;
export const getMonitorZoneWindow = () => monitorZoneWindow;
export const getView = () => { if (overlayWindow) return view; return null; };
export const getIsOverlayVisible = () => isOverlayVisible;
export const getGameRect = () => gameRect;

export function onOverlayWindowReady(callback: () => void): void { onOverlayReady = callback; }
export function onScreenWatcherStop(callback: () => void): void { onScreenWatchStop = callback; }

export function createSplashWindow(): BrowserWindow {
  splashWindow = new BrowserWindow({
    width: 400, height: 500,
    frame: false, transparent: true, alwaysOnTop: false,
    show: false, center: true, skipTaskbar: true,
    resizable: false, movable: false, focusable: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });
  splashWindow.setIgnoreMouseEvents(true);
  splashWindow.loadFile(path.join(__dirname, '..', 'splash.html'));
  splashWindow.once('ready-to-show', () => { splashWindow?.show(); });
  return splashWindow;
}

export function closeSplashWindow(): void {
  if (splashWindow) { splashWindow.close(); splashWindow = null; }
}

export function createMainWindow(): BrowserWindow {
  const cfg = config.load();
  isOverlayVisible = cfg.overlayVisible !== false;

  mainWindow = new BrowserWindow({
    width: SIDEBAR_WIDTH, height: SIDEBAR_HEIGHT,
    frame: false, transparent: true, alwaysOnTop: false, show: false, skipTaskbar: true,
    resizable: false, thickFrame: false, focusable: false, acceptFirstMouse: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true, nodeIntegration: false
    }
  });

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

  overlayWindow = new BrowserWindow({
    width: cfg.width, height: cfg.height,
    minWidth: MIN_W, minHeight: MIN_H,
    frame: false, transparent: true, alwaysOnTop: false, show: false, skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true, nodeIntegration: false, backgroundThrottling: false
    }
  });

  overlayWindow.setOpacity(cfg.opacity);
  overlayWindow.loadFile(path.join(__dirname, '..', 'overlay.html'));

  view = new WebContentsView({ webPreferences: { backgroundThrottling: false } });
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
    if (onOverlayReady) onOverlayReady();
  });

  overlayWindow.on('closed', () => {
    if (view) {
      try {
        // @ts-ignore: destroy exists at runtime but not in type defs
        view.webContents.destroy();
      } catch (e) { }
      view = null;
    }
    overlayWindow = null;
    isTracking = false;
    isClickThrough = false; // 오버레이 닫힘 시 투과 상태 초기화
  });

  attachStackListeners(overlayWindow);
}

export function toggleSettingsWindow(): void {
  if (settingsWindow) { settingsWindow.close(); return; }
  settingsWindow = new BrowserWindow({
    width: 1000, height: 650, frame: false, transparent: true, alwaysOnTop: false, show: false,
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  attachStackListeners(settingsWindow);
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
    import('./updater').then(mod => {
      const status = mod.getCurrentStatus();
      if (status) settingsWindow?.webContents.send('update-status', status);
    });
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
    width: 320, height: 500, frame: false, transparent: true, alwaysOnTop: false, show: false,
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  attachStackListeners(galleryWindow);
  galleryWindow.loadFile(path.join(__dirname, '..', 'gallery.html'));
  galleryWindow.on('ready-to-show', () => {
    if (gameRect) {
      galleryWindow?.setPosition(Math.round(gameRect.x + gameRect.width + galleryPos.offsetX), Math.round(gameRect.y + galleryPos.offsetY));
    }
    galleryWindow?.webContents.send('config-data', config.load());
    galleryWindow?.show();
    if (IS_DEV) galleryWindow?.webContents.openDevTools({ mode: 'detach' });
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

export function toggleAbbreviationWindow(): void {
  if (abbreviationWindow) { abbreviationWindow.close(); return; }
  abbreviationWindow = new BrowserWindow({
    width: 320, height: 500, frame: false, transparent: true, alwaysOnTop: false, show: false,
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  attachStackListeners(abbreviationWindow);
  abbreviationWindow.loadFile(path.join(__dirname, '..', 'abbreviation.html'));
  abbreviationWindow.on('ready-to-show', () => {
    if (gameRect) {
      abbreviationWindow?.setPosition(Math.round(gameRect.x + gameRect.width + abbreviationPos.offsetX), Math.round(gameRect.y + abbreviationPos.offsetY));
    }
    abbreviationWindow?.show();
    if (IS_DEV) abbreviationWindow?.webContents.openDevTools({ mode: 'detach' });
  });
  abbreviationWindow.on('move', () => {
    if (consumeProgrammaticMove('abbreviation') || !abbreviationWindow || !gameRect) return;
    const b = abbreviationWindow.getBounds();
    abbreviationPos.offsetX = b.x - (gameRect.x + gameRect.width);
    abbreviationPos.offsetY = b.y - gameRect.y;
    savePosition('abbreviation', abbreviationPos);
  });
  abbreviationWindow.on('closed', () => { abbreviationWindow = null; });
}

export function toggleBuffsWindow(): void {
  if (buffsWindow) { buffsWindow.close(); return; }
  buffsWindow = new BrowserWindow({
    width: 1000, height: 700, frame: false, transparent: true, alwaysOnTop: false, show: false,
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  attachStackListeners(buffsWindow);
  buffsWindow.loadFile(path.join(__dirname, '..', 'buffs.html'));
  buffsWindow.on('ready-to-show', () => {
    if (gameRect) {
      buffsWindow?.setPosition(Math.round(gameRect.x + gameRect.width + buffsPos.offsetX), Math.round(gameRect.y + buffsPos.offsetY));
    }
    buffsWindow?.show();
    if (IS_DEV) buffsWindow?.webContents.openDevTools({ mode: 'detach' });
  });
  buffsWindow.on('move', () => {
    if (consumeProgrammaticMove('buffs') || !buffsWindow || !gameRect) return;
    const b = buffsWindow.getBounds();
    buffsPos.offsetX = b.x - (gameRect.x + gameRect.width);
    buffsPos.offsetY = b.y - gameRect.y;
    savePosition('buffs', buffsPos);
  });
  buffsWindow.on('closed', () => { buffsWindow = null; });
}

export function toggleBossSettingsWindow(): void {
  if (bossSettingsWindow) { bossSettingsWindow.close(); return; }
  bossSettingsWindow = new BrowserWindow({
    width: 320, height: 600, frame: false, transparent: true, alwaysOnTop: false, show: false,
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  attachStackListeners(bossSettingsWindow);
  bossSettingsWindow.loadFile(path.join(__dirname, '..', 'boss-settings.html'));
  bossSettingsWindow.on('ready-to-show', () => {
    if (gameRect) {
      bossSettingsWindow?.setPosition(Math.round(gameRect.x + gameRect.width + bossSettingsPos.offsetX), Math.round(gameRect.y + bossSettingsPos.offsetY));
    }
    const cfg = config.load();
    bossSettingsWindow?.webContents.send('config-data', cfg);
    const bossTimes: Record<string, string[]> = {};
    const bosses = ['골론', '파멸의 기원', '스페르첸드', '골모답', '아칸'];
    bosses.forEach(name => { bossTimes[name] = bossNotifier.getBossTimes(name); });
    bossSettingsWindow?.webContents.send('boss-times-data', bossTimes);
    bossSettingsWindow?.show();
    if (IS_DEV) bossSettingsWindow?.webContents.openDevTools({ mode: 'detach' });
  });
  bossSettingsWindow.on('move', () => {
    if (consumeProgrammaticMove('bossSettings') || !bossSettingsWindow || !gameRect) return;
    const b = bossSettingsWindow.getBounds();
    bossSettingsPos.offsetX = b.x - (gameRect.x + gameRect.width);
    bossSettingsPos.offsetY = b.y - gameRect.y;
    savePosition('bossSettings', bossSettingsPos);
  });
  bossSettingsWindow.on('closed', () => { bossSettingsWindow = null; });
}

export function setAllAlwaysOnTop(enabled: boolean): void {
  [
    mainWindow, overlayWindow, settingsWindow, galleryWindow,
    abbreviationWindow, buffsWindow, bossSettingsWindow, monitorZoneWindow
  ].forEach(win => {
    if (win && !win.isDestroyed()) {
      if (win.isAlwaysOnTop()) win.setAlwaysOnTop(false);
    }
  });
}

export function getAllWindowHwnds(): string[] {
  return activeWindowsStack
    .filter(win => win && !win.isDestroyed() && win.isVisible())
    .map(win => {
      const handle = win!.getNativeWindowHandle();
      return handle.readBigUint64LE().toString();
    });
}

export function updateViewBounds(): void {
  if (!overlayWindow || !view) return;
  const b = overlayWindow.getBounds();
  view.setBounds({ x: 0, y: OVERLAY_TOOLBAR_HEIGHT, width: b.width, height: b.height - OVERLAY_TOOLBAR_HEIGHT });
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
    if (view) {
      try {
        overlayWindow.contentView.removeChildView(view);
        // @ts-ignore: destroy exists at runtime but not in type defs
        view.webContents.destroy();
      } catch (e) { log(`[WM] Error destroying view: ${e}`); }
      view = null;
    }
    overlayWindow.close();
    overlayWindow = null;
    isTracking = false;
  }
  if (mainWindow) mainWindow.webContents.send('overlay-status', isOverlayVisible);
  config.save({ overlayVisible: isOverlayVisible });
  return isOverlayVisible;
}

export function toggleOverlay(): boolean { return setOverlayVisible(!isOverlayVisible); }

export function syncOverlay(currentRect: GameRect): void {
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
      
      const diffX = Math.abs(b.x - finalX);
      const diffY = Math.abs(b.y - finalY);
      const diffW = Math.abs(b.width - newW);
      const diffH = Math.abs(b.height - newH);

      if (diffX > 2 || diffY > 2 || diffW > 2 || diffH > 2) {
        setProgrammaticMove('overlay');
        overlayWindow.setBounds({ x: finalX, y: finalY, width: newW, height: newH });
      }
    } else if (isOverlayVisible && !overlayWindow) createOverlayWindow();

    const currentSidebarB = mainWindow.getBounds();
    const newSidebarX = gX + gW;
    const newSidebarY = gY + 40;

    if (Math.abs(currentSidebarB.x - newSidebarX) > 2 || Math.abs(currentSidebarB.y - newSidebarY) > 2) {
      setProgrammaticMove('main');
      mainWindow.setBounds({ x: newSidebarX, y: newSidebarY, width: currentSidebarB.width, height: SIDEBAR_HEIGHT });
    }

    if (settingsWindow && !settingsWindow.isDestroyed() && settingsWindow.isVisible()) {
      setProgrammaticMove('settings');
      settingsWindow.setPosition(Math.round(gX + gW + settingsPos.offsetX), Math.round(gY + settingsPos.offsetY));
    }
    if (galleryWindow && !galleryWindow.isDestroyed() && galleryWindow.isVisible()) {
      setProgrammaticMove('gallery');
      galleryWindow.setPosition(Math.round(gX + gW + galleryPos.offsetX), Math.round(gY + galleryPos.offsetY));
    }
    if (abbreviationWindow && !abbreviationWindow.isDestroyed() && abbreviationWindow.isVisible()) {
      setProgrammaticMove('abbreviation');
      abbreviationWindow.setPosition(Math.round(gX + gW + abbreviationPos.offsetX), Math.round(gY + abbreviationPos.offsetY));
    }
    if (buffsWindow && !buffsWindow.isDestroyed() && buffsWindow.isVisible()) {
      setProgrammaticMove('buffs');
      buffsWindow.setPosition(Math.round(gX + gW + buffsPos.offsetX), Math.round(gY + buffsPos.offsetY));
    }
    if (bossSettingsWindow && !bossSettingsWindow.isDestroyed() && bossSettingsWindow.isVisible()) {
      setProgrammaticMove('bossSettings');
      bossSettingsWindow.setPosition(Math.round(gX + gW + bossSettingsPos.offsetX), Math.round(gY + bossSettingsPos.offsetY));
    }
    if (monitorZoneWindow && !monitorZoneWindow.isDestroyed() && monitorZoneWindow.isVisible()) {
      setProgrammaticMove('monitorZone');
      monitorZoneWindow.setPosition(Math.round(gX + monitorZonePos.offsetX), Math.round(gY + monitorZonePos.offsetY));
    }
    gameRect = { x: gX, y: gY, width: gW, height: gH };
    closeSplashWindow();
  } else hideAll();
}

export function applySettings(newSettings: any): void {
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
  [mainWindow, overlayWindow, settingsWindow, galleryWindow, abbreviationWindow, buffsWindow, bossSettingsWindow].forEach(win => {
    win?.webContents.send('config-data', updated);
  });
}

export function toggleClickThrough(): boolean {
  if (!overlayWindow) return false;
  isClickThrough = !isClickThrough;
  overlayWindow.setIgnoreMouseEvents(isClickThrough);
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
  [overlayWindow, mainWindow, settingsWindow, galleryWindow, abbreviationWindow, buffsWindow, bossSettingsWindow, monitorZoneWindow].forEach(win => {
    if (win && win.isVisible()) win.hide();
  });
  isTracking = false;
  closeSplashWindow();
}

export function toggleMonitorZone(): void {
  if (isScreenWatching) { setScreenWatching(false); return; }
  if (monitorZoneWindow) { monitorZoneWindow.close(); monitorZoneWindow = null; return; }
  monitorZoneWindow = new BrowserWindow({
    width: 210, height: 120,
    frame: false, transparent: true, alwaysOnTop: false,
    show: false, skipTaskbar: true, resizable: false,
    webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
  });
  attachStackListeners(monitorZoneWindow);
  monitorZoneWindow.loadFile(path.join(__dirname, '..', 'monitor-zone.html'));
  monitorZoneWindow.on('ready-to-show', () => {
    mainWindow?.webContents.send('monitor-zone-window-status', true);
    if (gameRect) {
      monitorZonePos.offsetX = Math.round((gameRect.width - 210) / 2);
      monitorZonePos.offsetY = Math.round((gameRect.height - 120) / 2);
      monitorZoneWindow?.setPosition(Math.round(gameRect.x + monitorZonePos.offsetX), Math.round(gameRect.y + monitorZonePos.offsetY));
    }
    monitorZoneWindow?.show();
    monitorZoneWindow?.webContents.send('config-data', config.load());
  });
  monitorZoneWindow.on('move', () => {
    if (consumeProgrammaticMove('monitorZone') || !monitorZoneWindow || !gameRect) return;
    const b = monitorZoneWindow.getBounds();
    monitorZonePos.offsetX = b.x - gameRect.x;
    monitorZonePos.offsetY = b.y - gameRect.y;
  });
  monitorZoneWindow.on('closed', () => {
    monitorZoneWindow = null;
    mainWindow?.webContents.send('monitor-zone-window-status', false);
    if (isScreenWatching) setScreenWatching(false);
  });
}

export function setMonitorZoneClickThrough(ignore: boolean): void {
  if (monitorZoneWindow && !monitorZoneWindow.isDestroyed()) {
    monitorZoneWindow.setIgnoreMouseEvents(ignore, { forward: true });
    monitorZoneWindow.webContents.send('click-through-mode', ignore);
  }
}

export function getMonitorZoneBounds(): Rectangle | null {
  if (!monitorZoneWindow || monitorZoneWindow.isDestroyed()) return null;
  return monitorZoneWindow.getBounds();
}

export function setScreenWatching(watching: boolean): void {
  isScreenWatching = watching;
  if (!watching && onScreenWatchStop) onScreenWatchStop();
  notifyScreenWatcherStatus();
}

export function getScreenWatching(): boolean { return isScreenWatching; }

function notifyScreenWatcherStatus(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('screen-watcher-status', isScreenWatching);
  }
}
