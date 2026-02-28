/**
 * 업데이트 관리 모듈 - UI 통합 버전 (dialog 제거)
 */
import { autoUpdater } from 'electron-updater';
import { BrowserWindow, app, Notification } from 'electron';
import { log } from './logger';
import * as config from './config';
import * as path from 'path';

let isSetup = false;

import type { UpdateStatusInfo } from '../shared/types';

let currentUpdateInfo: UpdateStatusInfo | null = null;

/** 모든 관련 창에 업데이트 상태 전송 */
function broadcastStatus(data: UpdateStatusInfo) {
  currentUpdateInfo = data;
  import('./windowManager').then(wm => {
    const mainWin = wm.getMainWindow();
    const settingsWin = wm.getSettingsWindow();

    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('update-status', data);
    }
    if (settingsWin && !settingsWin.isDestroyed()) {
      settingsWin.webContents.send('update-status', data);
    }
  });
}

export function setupUpdater(mainWindow: BrowserWindow | null) {
  if (isSetup) {
    if (currentUpdateInfo) {
      mainWindow?.webContents.send('update-status', currentUpdateInfo);
    }
    return;
  }
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
    broadcastStatus({ state: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    log(`Update available: ${info.version}`);
    broadcastStatus({ state: 'available', version: info.version });

    // 네이티브 알림 표시
    try {
      const notification = new Notification({
        title: 'TW-Overlay 업데이트 알림',
        body: `새로운 버전 v${info.version}이(가) 출시되었습니다.`,
        icon: path.join(__dirname, '..', 'icons', 'icon.ico')
      });
      notification.show();
      notification.on('click', () => {
        import('./windowManager').then(wm => wm.toggleSettingsWindow());
      });
    } catch (e) {
      log(`Notification error: ${e}`);
    }
  });

  autoUpdater.on('update-not-available', () => {
    broadcastStatus({ state: 'latest' });
  });

  autoUpdater.on('error', (err) => {
    log(`Error in auto-updater: ${err}`);
    broadcastStatus({ state: 'error', message: err.message });
  });

  autoUpdater.on('download-progress', (progressObj) => {
    broadcastStatus({
      state: 'downloading',
      percent: Math.round(progressObj.percent)
    });

    // 메인 창의 작업표시줄 진행바 업데이트
    import('./windowManager').then(wm => {
      wm.getMainWindow()?.setProgressBar(progressObj.percent / 100);
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    broadcastStatus({ state: 'ready', version: info.version });
    import('./windowManager').then(wm => {
      wm.getMainWindow()?.setProgressBar(-1);
    });
  });

  // 초기 체크 실행
  log('Starting auto update check...');
  autoUpdater.checkForUpdates();
}

/** 현재 업데이트 상태 반환 */
export function getCurrentStatus() {
  return currentUpdateInfo;
}

/** 수동 업데이트 확인 */
export async function manualCheckForUpdate(mainWindow: BrowserWindow | null) {
  if (!app.isPackaged) {
    mainWindow?.webContents.send('update-status', { state: 'dev-mode' });
    return;
  }

  try {
    broadcastStatus({ state: 'checking' });
    await autoUpdater.checkForUpdates();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`Manual update check error: ${msg}`);
    broadcastStatus({ state: 'error', message: msg });
  }
}

/** 업데이트 다운로드 시작 */
export function startDownload() {
  log('Starting update download...');
  autoUpdater.downloadUpdate();
}

/** 재시작 및 설치 */
export function quitAndInstall() {
  autoUpdater.quitAndInstall();
}
