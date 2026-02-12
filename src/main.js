const { app, BrowserWindow, BrowserView, ipcMain, screen, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

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

const LOG_MAX_SIZE = 1 * 1024 * 1024; // 1MB
function logger(message) {
  const logMessage = `[${new Date().toISOString()}] ${message}\n`;
  if (isDev) console.log(message);
  try {
    // 로그 파일 크기 제한: 1MB 초과 시 백업 후 새로 시작
    if (fs.existsSync(logPath)) {
      const stats = fs.statSync(logPath);
      if (stats.size > LOG_MAX_SIZE) {
        const backupPath = logPath.replace('.log', '.old.log');
        try { fs.unlinkSync(backupPath); } catch (e) {}
        fs.renameSync(logPath, backupPath);
      }
    }
    fs.appendFileSync(logPath, logMessage);
  } catch (err) {}
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

// [성능 개선] 디바운싱된 설정 저장 - move/resize 이벤트 폭주 시 디스크 I/O 감소
let _saveTimer = null;
let _pendingConfig = null;
function saveConfig(newConfig) {
  try {
    if (!_pendingConfig) _pendingConfig = loadConfig();
    _pendingConfig = { ..._pendingConfig, ...newConfig };
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => {
      try {
        fs.writeFileSync(configPath, JSON.stringify(_pendingConfig, null, 2));
      } catch (e) {}
      _pendingConfig = null;
      _saveTimer = null;
    }, 300);
  } catch (e) {}
}

// 즉시 저장 (앱 종료 시 사용)
function saveConfigImmediate(newConfig) {
  try {
    if (_saveTimer) clearTimeout(_saveTimer);
    const current = _pendingConfig || loadConfig();
    fs.writeFileSync(configPath, JSON.stringify({ ...current, ...newConfig }, null, 2));
    _pendingConfig = null;
    _saveTimer = null;
  } catch (e) {}
}

let mainWindow, view, gameRect = null, offset = { x: 10, y: 10 };
let isTracking = false, isProgrammaticMove = false, isClickThrough = false, isApplyingSize = false;
let psProcess = null;    // 상주 PowerShell 프로세스
let pollingTimer = null; // setInterval 핸들 (종료 시 정리용)

const updateViewBounds = () => {
  if (!mainWindow || !view) return;
  const b = mainWindow.getBounds();
  view.setBounds({ x: 0, y: 40, width: b.width, height: b.height - 40 });
};

// =============================================================
// [핵심 개선] 상주 PowerShell 프로세스
// 기존: 매 폴링마다 powershell.exe를 새로 생성 → CPU 폭주
// 개선: 프로세스 1개를 유지하고 stdin/stdout으로 통신
// =============================================================
let psReady = false;
let psQueryResolve = null; // 현재 대기 중인 Promise resolve
let psBuffer = '';

function startPersistentPS() {
  let scriptPath = path.join(__dirname, 'track.ps1');
  if (app.isPackaged) {
    scriptPath = scriptPath.replace('app.asar', 'app.asar.unpacked');
  }

  psProcess = spawn('powershell', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath,
    '-processName', GAME_PROCESS_NAME, '-loop'
  ], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });

  psBuffer = '';
  psReady = false;

  psProcess.stdout.on('data', (data) => {
    psBuffer += data.toString();
    // 줄 단위로 파싱
    let lines = psBuffer.split(/\r?\n/);
    psBuffer = lines.pop(); // 마지막 불완전 줄은 버퍼에 유지

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed === 'READY') {
        psReady = true;
        logger('[PS] 상주 PowerShell 프로세스 시작됨');
        continue;
      }

      if (psQueryResolve) {
        const resolve = psQueryResolve;
        psQueryResolve = null;

        if (!trimmed.startsWith('ERROR')) {
          const parts = trimmed.split(',');
          if (parts.length === 4) {
            const [l, t, r, b] = parts.map(Number);
            resolve({ x: l, y: t, width: r - l, height: b - t });
            continue;
          }
        }
        resolve(null);
      }
    }
  });

  psProcess.stderr.on('data', (data) => {
    logger(`[PS ERROR] ${data.toString().trim()}`);
  });

  psProcess.on('exit', (code) => {
    logger(`[PS] 프로세스 종료 (code: ${code})`);
    psReady = false;
    if (psQueryResolve) { psQueryResolve(null); psQueryResolve = null; }
    // 앱이 아직 살아있으면 자동 재시작
    if (!app.isQuitting) {
      logger('[PS] 자동 재시작 시도...');
      setTimeout(() => startPersistentPS(), 1000);
    }
  });

  psProcess.on('error', (err) => {
    logger(`[PS] spawn 에러: ${err.message}`);
    psReady = false;
    if (psQueryResolve) { psQueryResolve(null); psQueryResolve = null; }
  });
}

function stopPersistentPS() {
  if (psProcess) {
    try {
      psProcess.stdin.write('EXIT\n');
      // 1초 후에도 살아있으면 강제 종료
      setTimeout(() => {
        try { psProcess.kill(); } catch (e) {}
      }, 1000);
    } catch (e) {
      try { psProcess.kill(); } catch (e2) {}
    }
    psProcess = null;
  }
}

const getGameWindowRect = () => {
  if (!psReady || !psProcess || psQueryResolve) {
    return Promise.resolve(undefined); // 준비 안 됐거나 이전 쿼리 대기 중이면 스킵
  }
  return new Promise((resolve) => {
    psQueryResolve = resolve;
    // 3초 타임아웃: 응답이 없으면 null 반환
    const timeout = setTimeout(() => {
      if (psQueryResolve === resolve) {
        psQueryResolve = null;
        resolve(null);
        logger('[PS] 쿼리 타임아웃');
      }
    }, 3000);
    // 타임아웃 정리를 위해 원래 resolve를 래핑
    const originalResolve = resolve;
    psQueryResolve = (result) => {
      clearTimeout(timeout);
      originalResolve(result);
    };
    try {
      psProcess.stdin.write('QUERY\n');
    } catch (e) {
      clearTimeout(timeout);
      psQueryResolve = null;
      resolve(null);
    }
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

  // 상주 PowerShell 프로세스 시작
  startPersistentPS();

  // [CPU 최적화] 게임창 위치 변화가 있을 때만 동기화 로직 실행
  let lastResult = "";
  pollingTimer = setInterval(async () => {
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

app.isQuitting = false;

app.whenReady().then(createWindow);

app.on('before-quit', () => {
  app.isQuitting = true;
  // 미저장 설정 즉시 기록
  if (_pendingConfig) saveConfigImmediate({});
  // 폴링 타이머 정리
  if (pollingTimer) { clearInterval(pollingTimer); pollingTimer = null; }
  // 상주 PowerShell 종료
  stopPersistentPS();
  logger('[APP] 정상 종료');
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
