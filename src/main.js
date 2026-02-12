const { app, BrowserWindow, BrowserView, ipcMain, screen, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

// [CPU 및 메모리 최적화] 하드웨어 및 렌더러 제한 설정
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=256'); // V8 메모리 제한 (256MB)
app.commandLine.appendSwitch('disk-cache-size', '52428800'); // 디스크 캐시 제한 (50MB)
app.commandLine.appendSwitch('disable-gpu-process-for-vfx'); // GPU 불필요 프로세스 억제
app.commandLine.appendSwitch('disable-breakpad'); // 에러 리포팅 비활성화 (메모리 절약)
app.commandLine.appendSwitch('disable-software-rasterizer');

const configPath = path.join(app.getPath('userData'), 'config.json');
const logPath = path.join(app.getPath('userData'), 'debug.log');
const GAME_PROCESS_NAME = 'InphaseNXD';
const isDev = process.argv.includes('--dev');
const MIN_W = 400;
const MIN_H = 300;

function logger(message) {
  const logMessage = `[${new Date().toISOString()}] ${message}\n`;
  if (isDev) console.log(message);
  try { fs.appendFileSync(logPath, logMessage); } catch (err) {}
}

function loadConfig() {
  try { if (fs.existsSync(configPath)) return JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch (e) {}
  return { width: 800, height: 600, opacity: 1.0, url: 'https://www.youtube.com', homeUrl: 'https://www.youtube.com',
    favorites: [
      { label: 'Youtube', url: 'https://www.youtube.com' },
      { label: 'Google', url: 'https://www.google.com' },
      { label: 'Netflix', url: 'https://www.netflix.com' }
    ]
  };
}

function saveConfig(newConfig) {
  try {
    const current = loadConfig();
    fs.writeFileSync(configPath, JSON.stringify({ ...current, ...newConfig }, null, 2));
  } catch (e) {}
}

let mainWindow, view, gameRect = null, offset = { x: 10, y: 10 };
let isTracking = false, isProgrammaticMove = false, isClickThrough = false, isApplyingSize = false;
let isPolling = false; // PowerShell 중복 실행 방지 플래그

const updateViewBounds = () => {
  if (!mainWindow || !view) return;
  const b = mainWindow.getBounds();
  view.setBounds({ x: 0, y: 40, width: b.width, height: b.height - 40 });
};

const getGameWindowRect = () => {
  if (isPolling) return Promise.resolve(undefined); // 이전 호출이 아직 실행 중이면 스킵
  isPolling = true;
  return new Promise((resolve) => {
    let scriptPath = path.join(__dirname, 'track.ps1');
    if (app.isPackaged) {
      scriptPath = scriptPath.replace('app.asar', 'app.asar.unpacked');
    }
    const child = exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}" -processName "${GAME_PROCESS_NAME}"`, { timeout: 3000 }, (error, stdout) => {
      isPolling = false;
      const result = stdout ? stdout.trim() : '';
      if (result && !result.startsWith('ERROR')) {
        const parts = result.split(',');
        if (parts.length === 4) {
          const [l, t, r, b] = parts.map(Number);
          resolve({ x: l, y: t, width: r - l, height: b - t });
          return;
        }
      }
      resolve(null);
    });
    child.on('error', () => { isPolling = false; resolve(null); });
  });
};

// [CPU 최적화] 변화가 있을 때만 동기화 수행
async function syncOverlay(currentRect) {
  if (!mainWindow || isApplyingSize) return;
  
  if (currentRect && currentRect.x > -10000) {
    if (!mainWindow.isVisible()) mainWindow.show();
    const scaleFactor = screen.getPrimaryDisplay().scaleFactor;
    const gX = Math.round(currentRect.x / scaleFactor), gY = Math.round(currentRect.y / scaleFactor);
    const gW = Math.round(currentRect.width / scaleFactor), gH = Math.round(currentRect.height / scaleFactor);
    
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
    gameRect = { x: gX, y: gY, width: gW, height: gH };
  } else {
    if (mainWindow.isVisible()) mainWindow.hide();
    isTracking = false;
  }
}

function createWindow() {
  const config = loadConfig();
  const windowOptions = {
    width: config.width, height: config.height,
    minWidth: MIN_W, minHeight: MIN_H,
    frame: false, transparent: true, alwaysOnTop: true, show: false, skipTaskbar: true,
    webPreferences: { 
      preload: path.join(__dirname, 'preload.js'), 
      devTools: true,
      backgroundThrottling: true,
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: false // 맞춤법 검사 비활성화 (메모리 절약)
    }
  };

  if (config.x !== undefined && config.y !== undefined) {
    windowOptions.x = config.x; windowOptions.y = config.y;
  }

  mainWindow = new BrowserWindow(windowOptions);
  mainWindow.setOpacity(config.opacity);
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  
  view = new BrowserView({
    webPreferences: { backgroundThrottling: true } // [CPU 최적화] 뷰 리소스 제한
  });
  mainWindow.setBrowserView(view);
  view.webContents.loadURL(config.url || config.homeUrl);
  
  view.webContents.setWindowOpenHandler(({ url }) => { view.webContents.loadURL(url); return { action: 'deny' }; });
  if (isDev) { mainWindow.webContents.openDevTools({ mode: 'detach' }); view.webContents.openDevTools({ mode: 'detach' }); }

  view.webContents.on('did-start-loading', () => mainWindow.webContents.send('load-status', true));
  view.webContents.on('did-stop-loading', () => mainWindow.webContents.send('load-status', false));

  const updateUrl = () => {
    const currentUrl = view.webContents.getURL();
    mainWindow.webContents.send('url-change', currentUrl);
    saveConfig({ url: currentUrl });
  };
  view.webContents.on('did-navigate', updateUrl);
  view.webContents.on('did-navigate-in-page', updateUrl);

  mainWindow.on('resize', () => { updateViewBounds(); saveConfig(mainWindow.getBounds()); });
  mainWindow.on('move', () => {
    if (isProgrammaticMove || isApplyingSize) { isProgrammaticMove = false; return; }
    
    const b = mainWindow.getBounds();
    
    // --- 강력한 경계 제한 로직 복구 ---
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
    // ---------------------------------

    saveConfig(mainWindow.getBounds());
  });

  mainWindow.once('ready-to-show', () => { updateViewBounds(); mainWindow.show(); mainWindow.webContents.send('config-data', loadConfig()); });

  globalShortcut.register('CommandOrControl+Shift+T', () => {
    isClickThrough = !isClickThrough;
    mainWindow.setIgnoreMouseEvents(isClickThrough, { forward: true });
    mainWindow.webContents.send('click-through-status', isClickThrough);
  });

  // [CPU 최적화] 게임창 위치 변화가 있을 때만 동기화 로직 실행
  let lastResult = "";
  setInterval(async () => {
    const currentRect = await getGameWindowRect();
    if (currentRect === undefined) return; // 이전 폴링 진행 중이면 스킵
    
    // 1. 게임창이 없거나 최소화된 경우 (전류 상태 우선 처리)
    if (!currentRect || currentRect.x <= -10000) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
        isTracking = false;
        lastResult = "hidden";
      }
      return;
    }

    // 2. 위치 변화 감지
    const currentResult = JSON.stringify(currentRect);
    if (currentResult !== lastResult || !mainWindow.isVisible()) {
      syncOverlay(currentRect);
      lastResult = currentResult;
    }
  }, 500);

  ipcMain.on('set-opacity', (e, o) => { mainWindow.setOpacity(o); saveConfig({ opacity: o }); });
  ipcMain.on('navigate', (e, u) => {
    let t = u.trim(); if (!t.startsWith('http')) t = 'https://' + t;
    view.webContents.loadURL(t);
  });
  ipcMain.on('go-home', () => { const c = loadConfig(); view.webContents.loadURL(c.homeUrl); });
  
  ipcMain.on('apply-settings', (e, newSettings) => {
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
    saveConfig({ ...newSettings, width: newW, height: newH });
    updateViewBounds();
    if (isTracking && gameRect) {
      const fb = mainWindow.getBounds();
      offset.x = fb.x - gameRect.x; offset.y = fb.y - gameRect.y;
    }
    mainWindow.webContents.send('config-data', loadConfig());
    setTimeout(() => { isApplyingSize = false; }, 300);
  });

  ipcMain.on('toggle-settings', (e, isOpen) => {
    if (!view) return;
    const b = mainWindow.getBounds();
    if (isOpen) view.setBounds({ x: 0, y: 340, width: b.width, height: b.height - 340 });
    else updateViewBounds();
  });

  ipcMain.on('toggle-menu', (e, isOpen) => {
    if (!view) return;
    const b = mainWindow.getBounds();
    if (isOpen) view.setBounds({ x: 0, y: 340, width: b.width, height: b.height - 340 });
    else updateViewBounds();
  });

  ipcMain.on('close-app', () => app.quit());
}

app.whenReady().then(createWindow);
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
