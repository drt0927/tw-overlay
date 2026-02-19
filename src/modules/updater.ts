/**
 * 업데이트 관리 모듈 - UI 통합 버전 (dialog 제거)
 */
import { autoUpdater } from 'electron-updater';
import { BrowserWindow, app } from 'electron';
import { log } from './logger';
import * as config from './config';

let updateWin: BrowserWindow | null = null;
let isSetup = false;

export function setupUpdater(mainWindow: BrowserWindow | null) {
  updateWin = mainWindow;

  if (isSetup) return;
  isSetup = true;

  if (!app.isPackaged) {
    log('Development mode: skipping update check');
    return;
  }

  const cfg = config.load();
  if (cfg.autoUpdateEnabled === false) {
    log('Auto update check is disabled by user.');
    return;
  }

  autoUpdater.autoDownload = false;

  autoUpdater.on('checking-for-update', () => {
    updateWin?.webContents.send('update-status', { state: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    log(`Update available: ${info.version}`);
    updateWin?.webContents.send('update-status', { state: 'available', version: info.version });
  });

  autoUpdater.on('update-not-available', () => {
    updateWin?.webContents.send('update-status', { state: 'latest' });
  });

  autoUpdater.on('error', (err) => {
    log(`Error in auto-updater: ${err}`);
    updateWin?.webContents.send('update-status', { state: 'error', message: err.message });
  });

  autoUpdater.on('download-progress', (progressObj) => {
    updateWin?.webContents.send('update-status', {
      state: 'downloading',
      percent: Math.round(progressObj.percent)
    });
    updateWin?.setProgressBar(progressObj.percent / 100);
  });

  autoUpdater.on('update-downloaded', (info) => {
    updateWin?.setProgressBar(-1);
    updateWin?.webContents.send('update-status', { state: 'ready', version: info.version });
  });

  // 초기 체크 실행
  autoUpdater.checkForUpdatesAndNotify();
}

/** 수동 업데이트 확인 */
export async function manualCheckForUpdate(mainWindow: BrowserWindow | null) {
  updateWin = mainWindow;
  if (!app.isPackaged) {
    updateWin?.webContents.send('update-status', { state: 'dev-mode' });
    return;
  }

  try {
    updateWin?.webContents.send('update-status', { state: 'checking' });
    await autoUpdater.checkForUpdates();
  } catch (err: any) {
    log(`Manual update check error: ${err}`);
    updateWin?.webContents.send('update-status', { state: 'error', message: err.message });
  }
}

/** 업데이트 다운로드 시작 */
export function startDownload() {
  autoUpdater.downloadUpdate();
}

/** 재시작 및 설치 */
export function quitAndInstall() {
  autoUpdater.quitAndInstall();
}
