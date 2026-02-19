/**
 * 게임 창 추적 모듈 - 안전성 극대화 버전
 */
import { app } from 'electron';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { GAME_PROCESS_NAME, PS_RESTART_DELAY_MS } from './constants';
import { log } from './logger';

let psProcess: ChildProcess | null = null;
let psReady = false;
let psQueryResolve: ((value: any) => void) | null = null;
let psBuffer = '';
let isStopping = false;

function getScriptPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'track.ps1');
  }
  return path.join(app.getAppPath(), 'dist', 'track.ps1');
}

export function start(): void {
  if (isStopping) return;
  try {
    const scriptPath = getScriptPath();
    log(`[TRACKER] 스크립트 경로 시도: ${scriptPath}`);

    psProcess = spawn('powershell', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath,
      '-processName', GAME_PROCESS_NAME, '-loop'
    ], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });

    psProcess.stdout?.on('data', (data) => {
      psBuffer += data.toString();
      const lines = psBuffer.split(/\r?\n/);
      psBuffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === 'READY') {
          psReady = true;
          log('[TRACKER] PowerShell READY');
          continue;
        }
        
        if (psQueryResolve) {
          const resolve = psQueryResolve;
          psQueryResolve = null;
          
          if (trimmed === 'NOT_RUNNING') resolve({ notRunning: true });
          else if (trimmed === 'MINIMIZED') resolve(null);
          else if (trimmed.includes(',')) {
            const [l, t, r, b] = trimmed.split(',').map(Number);
            resolve({ x: l, y: t, width: r - l, height: b - t });
          } else resolve(null);
        }
      }
    });

    psProcess.stderr?.on('data', (data) => {
      log(`[TRACKER STDERR] ${data.toString().trim()}`);
    });

    psProcess.on('error', (err) => {
      log(`[TRACKER ERROR] spawn 에러: ${err.message}`);
    });

    // 프로세스 종료 시 자동 재시작
    psProcess.on('exit', (code, signal) => {
      psReady = false;
      psProcess = null;
      if (psQueryResolve) {
        psQueryResolve(null);
        psQueryResolve = null;
      }
      if (!isStopping) {
        log(`[TRACKER] PowerShell 종료 (code=${code}, signal=${signal}), ${PS_RESTART_DELAY_MS}ms 후 재시작`);
        setTimeout(() => start(), PS_RESTART_DELAY_MS);
      }
    });

  } catch (e: any) {
    log(`[TRACKER CRITICAL] ${e.message}`);
  }
}

export async function queryGameRect(): Promise<any> {
  if (!psReady || !psProcess || psQueryResolve) return undefined;
  
  return new Promise((resolve) => {
    psQueryResolve = resolve;
    // 3초 타임아웃
    setTimeout(() => { if (psQueryResolve === resolve) { psQueryResolve = null; resolve(null); } }, 3000);
    try {
      psProcess?.stdin?.write('QUERY\n');
    } catch (e) {
      psQueryResolve = null;
      resolve(null);
    }
  });
}

export function stop() {
  isStopping = true;
  if (psProcess) {
    try { psProcess.stdin?.write('EXIT\n'); } catch (_) {}
    psProcess.kill();
    psProcess = null;
  }
  psReady = false;
}

/** 게임 창에 포커스 전환 */
export function focusGameWindow(): void {
  if (!psReady || !psProcess) return;
  try {
    psProcess.stdin?.write('FOCUS\n');
  } catch (e: any) {
    log(`[TRACKER] FOCUS 명령 실패: ${e.message}`);
  }
}

