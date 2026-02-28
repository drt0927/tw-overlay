/**
 * 업데이트 관리 모듈 - 필수 업데이트(Mandatory Update) 지원
 */
import { autoUpdater } from 'electron-updater';
import { BrowserWindow, app, Notification } from 'electron';
import { log } from './logger';
import * as config from './config';
import * as path from 'path';

let isSetup = false;
let isMandatory = false;

import type { UpdateStatusInfo } from '../shared/types';

let currentUpdateInfo: UpdateStatusInfo | null = null;

/** 릴리즈 노트에서 [Mandatory Update] 태그 확인 */
function checkMandatory(info: any): boolean {
  const tag = '[Mandatory Update]';
  // releaseName (릴리즈 제목) 확인
  if (typeof info.releaseName === 'string' && info.releaseName.includes(tag)) {
    return true;
  }
  // releaseNotes가 문자열인 경우 (단일 릴리즈 노트)
  if (typeof info.releaseNotes === 'string' && info.releaseNotes.includes(tag)) {
    return true;
  }
  // releaseNotes가 배열인 경우 (다중 릴리즈 노트 형식)
  if (Array.isArray(info.releaseNotes)) {
    return info.releaseNotes.some((n: any) => (n.note || '').includes(tag));
  }
  return false;
}

/** 모든 관련 창에 업데이트 상태 전송 */
function broadcastStatus(data: UpdateStatusInfo) {
  currentUpdateInfo = data;
  import('./windowManager').then(wm => {
    const mainWin = wm.getMainWindow();
    const settingsWin = wm.getSettingsWindow();
    const splashWin = wm.getSplashWindow();

    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('update-status', data);
    }
    if (settingsWin && !settingsWin.isDestroyed()) {
      settingsWin.webContents.send('update-status', data);
    }
    // 스플래시 창에도 전송 (필수 업데이트 진행 UI 용)
    if (splashWin && !splashWin.isDestroyed()) {
      splashWin.webContents.send('update-status', data);
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
    // DEV 테스트: 아래 주석을 해제하면 mandatory 업데이트 UI 흐름을 시뮬레이션합니다
    // simulateMandatoryUpdate();
    return;
  }

  const cfg = config.load();
  const autoUpdateDisabled = cfg.autoUpdateEnabled === false;

  autoUpdater.autoDownload = false;

  autoUpdater.on('checking-for-update', () => {
    broadcastStatus({ state: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    log(`Update available: ${info.version}`);
    isMandatory = checkMandatory(info);

    if (isMandatory) {
      log(`[MANDATORY] Mandatory update detected: v${info.version}`);
      broadcastStatus({ state: 'mandatory', version: info.version, isMandatory: true });

      // 필수 업데이트: 스플래시 잠금 후 즉시 다운로드
      import('./windowManager').then(wm => wm.setMandatoryUpdateLock(true));
      autoUpdater.downloadUpdate();
      return;
    }

    // 일반 업데이트: 자동 업데이트 비활성화 시 무시
    if (autoUpdateDisabled) {
      log('Auto update disabled, skipping non-mandatory update.');
      return;
    }

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

    // 필수 업데이트 실패 시 잠금 해제
    if (isMandatory) {
      import('./windowManager').then(wm => wm.setMandatoryUpdateLock(false));
      isMandatory = false;
    }
  });

  autoUpdater.on('download-progress', (progressObj) => {
    broadcastStatus({
      state: 'downloading',
      percent: Math.round(progressObj.percent),
      isMandatory
    });

    // 메인 창의 작업표시줄 진행바 업데이트
    import('./windowManager').then(wm => {
      wm.getMainWindow()?.setProgressBar(progressObj.percent / 100);
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    broadcastStatus({ state: 'ready', version: info.version, isMandatory });
    import('./windowManager').then(wm => {
      wm.getMainWindow()?.setProgressBar(-1);
    });

    // 필수 업데이트: 다운로드 완료 즉시 설치 및 재시작
    if (isMandatory) {
      log('[MANDATORY] Download complete. Installing and restarting...');
      setTimeout(() => {
        autoUpdater.quitAndInstall();
      }, 1500);
    }
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

/**
 * [DEV ONLY] 필수 업데이트 UI 흐름 시뮬레이션
 * setupUpdater()의 dev 모드 분기에서 주석 해제하여 사용:
 *   simulateMandatoryUpdate();
 */
function simulateMandatoryUpdate() {
  log('[DEV] Simulating mandatory update flow...');

  // 즉시 스플래시 잠금 (다른 로직에 의해 닫히지 않도록)
  import('./windowManager').then(wm => wm.setMandatoryUpdateLock(true));

  // 1단계: mandatory 감지 알림
  setTimeout(() => {
    broadcastStatus({ state: 'mandatory', version: '99.0.0', isMandatory: true });
    log('[DEV] → state: mandatory');
  }, 2000);

  // 2단계: 다운로드 진행 시뮬레이션 (0% → 100%)
  const steps = 20;
  for (let i = 1; i <= steps; i++) {
    setTimeout(() => {
      const percent = Math.round((i / steps) * 100);
      broadcastStatus({ state: 'downloading', percent, isMandatory: true });
      if (i % 5 === 0) log(`[DEV] → downloading: ${percent}%`);
    }, 2000 + i * 200);
  }

  // 3단계: 다운로드 완료
  setTimeout(() => {
    broadcastStatus({ state: 'ready', version: '99.0.0', isMandatory: true });
    log('[DEV] → state: ready (would quitAndInstall in production)');
  }, 2000 + (steps + 1) * 200);

  // 4단계: 실제 quitAndInstall 대신 잠금 해제 + 스플래시 닫기
  setTimeout(() => {
    import('./windowManager').then(wm => {
      wm.setMandatoryUpdateLock(false);
      wm.closeSplashWindow();
    });
    log('[DEV] Simulation complete — splash unlocked and closed.');
  }, 2000 + (steps + 3) * 200);
}
