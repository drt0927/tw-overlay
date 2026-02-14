/**
 * 게임 창 추적 모듈 - 상주 PowerShell 프로세스 관리
 * 게임 창 좌표 조회(QUERY), 포커스 전환(FOCUS) 기능 제공
 */
const { app } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const { GAME_PROCESS_NAME, PS_QUERY_TIMEOUT_MS, PS_RESTART_DELAY_MS } = require('./constants');
const { log } = require('./logger');

let psProcess = null;
let psReady = false;
let psQueryResolve = null;
let psBuffer = '';

/** 상주 PowerShell 프로세스 시작 */
function start() {
  let scriptPath = path.join(__dirname, '..', 'track.ps1');
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
    const lines = psBuffer.split(/\r?\n/);
    psBuffer = lines.pop(); // 마지막 불완전 줄은 버퍼에 유지

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed === 'READY') {
        psReady = true;
        log('[PS] 상주 PowerShell 프로세스 시작됨');
        continue;
      }

      // FOCUS 응답은 별도 처리 (쿼리 resolve에 영향 없음)
      if (trimmed === 'FOCUSED' || trimmed === 'FOCUS_FAIL') {
        log(`[PS] ${trimmed}`);
        continue;
      }

      if (psQueryResolve) {
        const resolve = psQueryResolve;
        psQueryResolve = null;

        if (trimmed === 'NOT_RUNNING') {
          resolve({ notRunning: true });
        } else if (trimmed === 'MINIMIZED') {
          resolve(null);
        } else if (!trimmed.startsWith('ERROR')) {
          const parts = trimmed.split(',');
          if (parts.length === 4) {
            const [l, t, r, b] = parts.map(Number);
            resolve({ x: l, y: t, width: r - l, height: b - t });
          } else {
            resolve(null);
          }
        } else {
          resolve(null);
        }
      }
    }
  });

  psProcess.stderr.on('data', (data) => {
    log(`[PS ERROR] ${data.toString().trim()}`);
  });

  psProcess.on('exit', (code) => {
    log(`[PS] 프로세스 종료 (code: ${code})`);
    psReady = false;
    if (psQueryResolve) { psQueryResolve(null); psQueryResolve = null; }
    if (!app.isQuitting) {
      log('[PS] 자동 재시작 시도...');
      setTimeout(() => start(), PS_RESTART_DELAY_MS);
    }
  });

  psProcess.on('error', (err) => {
    log(`[PS] spawn 에러: ${err.message}`);
    psReady = false;
    if (psQueryResolve) { psQueryResolve(null); psQueryResolve = null; }
  });
}

/** 상주 PowerShell 프로세스 종료 */
function stop() {
  if (psProcess) {
    try {
      psProcess.stdin.write('EXIT\n');
      setTimeout(() => {
        try { psProcess.kill(); } catch (_) {}
      }, 1000);
    } catch (_) {
      try { psProcess.kill(); } catch (_2) {}
    }
    psProcess = null;
  }
}

/** 게임 창 좌표 조회 (Promise) */
function queryGameRect() {
  if (!psReady || !psProcess || psQueryResolve) {
    return Promise.resolve(undefined); // 준비 안 됐거나 이전 쿼리 대기 중이면 스킵
  }
  return new Promise((resolve) => {
    psQueryResolve = resolve;
    const timeout = setTimeout(() => {
      if (psQueryResolve === resolve) {
        psQueryResolve = null;
        resolve(null);
        log('[PS] 쿼리 타임아웃');
      }
    }, PS_QUERY_TIMEOUT_MS);

    const originalResolve = resolve;
    psQueryResolve = (result) => {
      clearTimeout(timeout);
      originalResolve(result);
    };

    try {
      psProcess.stdin.write('QUERY\n');
    } catch (_) {
      clearTimeout(timeout);
      psQueryResolve = null;
      resolve(null);
    }
  });
}

/** 게임 창에 포커스 전환 */
function focusGameWindow() {
  if (!psReady || !psProcess) return;
  try {
    psProcess.stdin.write('FOCUS\n');
  } catch (e) {
    log(`[PS] FOCUS 전송 실패: ${e.message}`);
  }
}

module.exports = { start, stop, queryGameRect, focusGameWindow };
