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

export function start(): void {
  try {
    // 1. 스크립트 경로를 더 명확하게 계산
    let scriptPath = path.join(app.getAppPath(), 'dist', 'track.ps1');
    if (app.isPackaged) {
      scriptPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'track.ps1');
    }
    
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

    psProcess.on('error', (err) => {
      log(`[TRACKER ERROR] spawn 에러: ${err.message}`);
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
  if (psProcess) {
    psProcess.kill();
    psProcess = null;
  }
}

export function focusGameWindow() {} // 형상 유지
