/**
 * 사기꾼 탐지 모니터
 * MsgerLog 폴더의 1:1 채팅 로그를 실시간으로 감시하고
 * llama-server (llama.cpp) 를 자식 프로세스로 실행해 Gemma 4 E2B로 사기 여부를 분석한다.
 */
import { Tail } from 'tail';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import * as iconv from 'iconv-lite';
import type { ChildProcess } from 'child_process';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
import { app, Notification } from 'electron';
import * as config from './config';
import * as wm from './windowManager';
import { log } from './logger';
import type { MessengerMessage, ScamAnalysisResult, ModelStatus, GpuDetectionResult, LlamaServerVariant, ServerStatus, SessionState } from '../shared/types';

// ──────────────────────────────────────────────────────
// 상수
// ──────────────────────────────────────────────────────

const MODEL_FILE_NAME = 'gemma-4-E2B-it-Q4_K_M.gguf';
const MODEL_URL =
  'https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF/resolve/main/gemma-4-E2B-it-Q4_K_M.gguf?download=true';

// llama.cpp b8969 바이너리 URL 맵 (GPU 종류별)
const LLAMA_BASE = 'https://github.com/ggml-org/llama.cpp/releases/download/b8969';
const BINARY_URLS: Record<string, { binary: string; cudart?: string }> = {
  'cuda-13.1': {
    binary: `${LLAMA_BASE}/llama-b8969-bin-win-cuda-13.1-x64.zip`,
    cudart: `${LLAMA_BASE}/cudart-llama-bin-win-cuda-13.1-x64.zip`,
  },
  'cuda-12.4': {
    binary: `${LLAMA_BASE}/llama-b8969-bin-win-cuda-12.4-x64.zip`,
    cudart: `${LLAMA_BASE}/cudart-llama-bin-win-cuda-12.4-x64.zip`,
  },
  'vulkan': {
    binary: `${LLAMA_BASE}/llama-b8969-bin-win-vulkan-x64.zip`,
  },
  'cpu': {
    binary: `${LLAMA_BASE}/llama-b8969-bin-win-cpu-x64.zip`,
  },
};
const LLAMA_SERVER_EXE_NAME = 'llama-server.exe';
const LLAMA_SERVER_PORT = 18765;
const LLAMA_SERVER_HEALTH_TIMEOUT_MS = 60_000;
const LLAMA_SERVER_HEALTH_POLL_MS = 1_000;

const MAX_SESSIONS = 5;
const DEBOUNCE_MS = 3_000;
const ANALYSIS_INTERVAL_MS = 60_000;
const INACTIVITY_TIMEOUT_MS = 10 * 60_000;
const MAX_MESSAGES_FOR_PROMPT = 80;
const SCAM_ALERT_SOUND = 'gongseubgyeongbo-gongseubgyeongbo.mp3';
const END_KEYWORDS = ['종료', '나가셨습니다', '대화를 마쳤습니다', '채팅이 종료'];

// ──────────────────────────────────────────────────────
// 내부 타입
// ──────────────────────────────────────────────────────

interface ActiveSession {
  filePath: string;
  tail: Tail;
  messages: MessengerMessage[];
  newSinceLastAnalysis: number;
  lastMessageTime: number;
  lastAnalysisAt: number;
  analysisTimer: NodeJS.Timeout | null;   // 60s max-wait interval
  debounceTimer: NodeJS.Timeout | null;   // 3s debounce
  inactivityTimer: NodeJS.Timeout | null;
  analyzing: boolean;
  lastVerdict: ScamAnalysisResult['verdict'];
  closed: boolean;
  consecutiveFailures: number;
  displayName: string;
}

// ──────────────────────────────────────────────────────
// 상태
// ──────────────────────────────────────────────────────

let _serverProcess: ChildProcess | null = null;
let _serverReady = false;
let _startingServer: Promise<void> | null = null;
let _modelDownloading = false;
let _modelProgress = 0;
let _binaryDownloading = false;
const _sessions = new Map<string, ActiveSession>();
const _sessionQueue: Array<{ filePath: string; isTest: boolean }> = [];
const _testFilePaths = new Set<string>();
let _folderWatcher: fs.FSWatcher | null = null;
let _folderPollTimer: NodeJS.Timeout | null = null;
// llama-server는 동시 추론을 지원하지 않으므로 순차 실행 큐로 직렬화
let _llmQueue: Promise<void> = Promise.resolve();
let _broadcastTimer: NodeJS.Timeout | null = null;
let _recentResults: ScamAnalysisResult[] = [];
let _downloadAbortFlag = false;

// ──────────────────────────────────────────────────────
// 경로
// ──────────────────────────────────────────────────────

export function getModelPath(): string {
  return path.join(app.getPath('userData'), 'models', MODEL_FILE_NAME);
}

function getServerBinDir(): string {
  return path.join(app.getPath('userData'), 'bin');
}

function getServerBinaryPath(): string {
  return path.join(getServerBinDir(), LLAMA_SERVER_EXE_NAME);
}

function getMsgerLogPath(): string | null {
  const cfg = config.load();
  if (cfg.msgerLogPath) return cfg.msgerLogPath;
  if (!cfg.chatLogPath) return null;
  return path.join(path.dirname(cfg.chatLogPath), 'MsgerLog');
}

export function getCurrentMsgerLogPath(): string {
  return getMsgerLogPath() ?? '';
}

// ──────────────────────────────────────────────────────
// 모델 상태 & 다운로드
// ──────────────────────────────────────────────────────

export function getConstants() {
  return { analysisIntervalSec: ANALYSIS_INTERVAL_MS / 1000 };
}

export function getModelStatus(): ModelStatus {
  const modelPath = getModelPath();
  return {
    downloaded: fs.existsSync(modelPath) && fs.existsSync(getServerBinaryPath()),
    downloading: _modelDownloading || _binaryDownloading,
    progress: _modelProgress,
    modelPath,
    serverBinaryReady: fs.existsSync(getServerBinaryPath()),
  };
}

function httpsDownload(url: string, onProgress: (pct: number, label?: string) => void, skipSSLVerify = false): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    const doGet = (u: string, redirectCount = 0) => {
      if (redirectCount > 10) { reject(new Error('Too many redirects')); return; }
      https.get(u, { headers: { 'User-Agent': 'tw-overlay/1.0' }, rejectUnauthorized: !skipSSLVerify }, (res) => {
        const status = res.statusCode ?? 0;
        if ([301, 302, 307, 308].includes(status) && res.headers.location) {
          doGet(res.headers.location, redirectCount + 1);
          return;
        }
        if (status !== 200) { reject(new Error(`HTTP ${status}`)); return; }

        const total = parseInt(res.headers['content-length'] ?? '0', 10);
        let received = 0;

        res.on('data', (chunk: Buffer) => {
          if (_downloadAbortFlag) {
            res.destroy();
            reject(new Error('ABORTED'));
            return;
          }
          chunks.push(chunk);
          received += chunk.length;
          if (total > 0) onProgress(Math.round((received / total) * 100));
        });
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', (err) => {
        if (!skipSSLVerify && /certificate|SSL|CERT/i.test(err.message)) {
          log(`[SCAM] SSL 검증 실패, 재시도: ${err.message}`);
          httpsDownload(url, onProgress, true).then(resolve).catch(reject);
          return;
        }
        reject(err);
      });
    };

    doGet(url);
  });
}

function extractZip(zipPath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('powershell', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
      `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
    ], { stdio: 'ignore' });
    proc.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`Expand-Archive 실패 (exit ${code})`)));
    proc.on('error', reject);
  });
}

export async function detectGpu(): Promise<GpuDetectionResult> {
  try {
    const { stdout } = await execAsync('powershell -NoProfile -Command "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name"');
    const gpuNames = stdout.split('\n').map(l => l.trim()).filter(l => l && l !== 'Name');

    const nvidiaName = gpuNames.find(n => /nvidia/i.test(n));
    const amdName = gpuNames.find(n => /amd|radeon/i.test(n));
    const intelName = gpuNames.find(n => /intel/i.test(n));

    if (nvidiaName) {
      // nvidia-smi 호출 생략 — BSOD 유발 가능성 있음 (0x0000000a).
      // cudart DLL 번들 덕분에 CUDA 12.4는 드라이버 버전 무관하게 동작한다.
      return {
        gpuType: 'nvidia', gpuName: nvidiaName,
        binaryVariant: 'cuda-12.4',
        binaryUrl: BINARY_URLS['cuda-12.4'].binary,
        cudartUrl: BINARY_URLS['cuda-12.4'].cudart,
      };
    }

    if (amdName) {
      return {
        gpuType: 'amd', gpuName: amdName,
        binaryVariant: 'vulkan',
        binaryUrl: BINARY_URLS['vulkan'].binary,
      };
    }

    if (intelName) {
      return {
        gpuType: 'intel', gpuName: intelName,
        binaryVariant: 'vulkan',
        binaryUrl: BINARY_URLS['vulkan'].binary,
      };
    }
  } catch (_) { }

  return {
    gpuType: 'none', gpuName: 'GPU 없음',
    binaryVariant: 'cpu',
    binaryUrl: BINARY_URLS['cpu'].binary,
  };
}

export async function downloadModel(onProgress: (pct: number, label?: string) => void): Promise<void> {
  const modelPath = getModelPath();
  const modelDir = path.dirname(modelPath);
  if (!fs.existsSync(modelDir)) fs.mkdirSync(modelDir, { recursive: true });

  _downloadAbortFlag = false;
  _modelDownloading = true;
  _modelProgress = 0;

  try {
    // 모델이 이미 있으면 건너뜀
    if (fs.existsSync(modelPath)) {
      log('[SCAM] 모델 파일 이미 존재, 다운로드 건너뜀');
    } else {
      const tmpPath = modelPath + '.tmp';
      const doModelDownload = (skipSSLVerify: boolean) => new Promise<void>((resolve, reject) => {
        const file = fs.createWriteStream(tmpPath);
        let _aborted = false;

        const doGet = (url: string, redirectCount = 0) => {
          if (redirectCount > 10) { reject(new Error('Too many redirects')); return; }
          https.get(url, { headers: { 'User-Agent': 'tw-overlay/1.0' }, rejectUnauthorized: !skipSSLVerify }, (res) => {
            const status = res.statusCode ?? 0;
            if ([301, 302, 307, 308].includes(status) && res.headers.location) {
              doGet(res.headers.location, redirectCount + 1); return;
            }
            if (status !== 200) {
              file.close(); fs.unlink(tmpPath, () => { });
              _modelDownloading = false;
              reject(new Error(`HTTP ${status}`)); return;
            }

            const total = parseInt(res.headers['content-length'] ?? '0', 10);
            let received = 0;

            res.on('data', (chunk: Buffer) => {
              if (_downloadAbortFlag) {
                _aborted = true;
                res.destroy();
                file.close(() => fs.unlink(tmpPath, () => {}));
                _modelDownloading = false;
                reject(new Error('ABORTED'));
                return;
              }
              received += chunk.length;
              if (total > 0) {
                _modelProgress = Math.round((received / total) * 100);
                onProgress(_modelProgress);
              }
            });

            res.pipe(file);
            file.on('finish', () => {
              file.close(() => {
                try {
                  if (fs.existsSync(modelPath)) fs.unlinkSync(modelPath);
                  fs.renameSync(tmpPath, modelPath);
                  _modelDownloading = false;
                  _modelProgress = 100;
                  resolve();
                } catch (e) { _modelDownloading = false; reject(e); }
              });
            });
            file.on('error', (err) => {
              if (_aborted) return;
              file.close(); fs.unlink(tmpPath, () => { });
              _modelDownloading = false; reject(err);
            });
          }).on('error', (err) => {
            if (!skipSSLVerify && /certificate|SSL|CERT/i.test(err.message)) {
              log(`[SCAM] 모델 다운로드 SSL 검증 실패, 재시도: ${err.message}`);
              file.close(() => {
                fs.unlink(tmpPath, () => {
                  doModelDownload(true).then(resolve).catch(reject);
                });
              });
              return;
            }
            file.close(); fs.unlink(tmpPath, () => { });
            _modelDownloading = false; reject(err);
          });
        };

        doGet(MODEL_URL);
      });
      await doModelDownload(false);
    }

    // llama-server 바이너리가 없을 때만 다운로드
    if (!fs.existsSync(getServerBinaryPath())) {
      log('[SCAM] GPU 감지 중...');
      const gpuResult = await detectGpu();
      log(`[SCAM] GPU 감지 결과: ${gpuResult.gpuName} → ${gpuResult.binaryVariant}`);
      await downloadServerBinary(gpuResult, onProgress);
    } else {
      log('[SCAM] llama-server 바이너리 이미 존재, 다운로드 건너뜀');
    }
  } catch (e) {
    _modelDownloading = false;
    throw e;
  }
}

export async function downloadServerBinary(
  gpuResult: GpuDetectionResult,
  onProgress: (pct: number, label?: string) => void,
): Promise<void> {
  const binDir = getServerBinDir();
  if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });

  _binaryDownloading = true;
  const zipPath = path.join(binDir, 'llama-server.zip');

  try {
    log(`[SCAM] llama-server 다운로드 중... (${gpuResult.binaryVariant})`);
    const buf = await httpsDownload(gpuResult.binaryUrl, onProgress);
    await fs.promises.writeFile(zipPath, buf);
    log('[SCAM] llama-server ZIP 압축 해제 중...');
    onProgress(100, '압축 해제 중...');
    await extractZip(zipPath, binDir);
    await fs.promises.unlink(zipPath);

    // CUDA 빌드는 cudart(런타임 DLL)도 함께 받아야 CUDA 설치 없이 동작
    if (gpuResult.cudartUrl) {
      log('[SCAM] CUDA 런타임 DLL 다운로드 중...');
      const cudartBuf = await httpsDownload(gpuResult.cudartUrl, onProgress);
      const cudartZipPath = path.join(binDir, 'cudart.zip');
      await fs.promises.writeFile(cudartZipPath, cudartBuf);
      log('[SCAM] CUDA 런타임 ZIP 압축 해제 중...');
      onProgress(100, '압축 해제 중...');
      await extractZip(cudartZipPath, binDir);
      await fs.promises.unlink(cudartZipPath);
    }

    // 사용한 variant 저장 (startServer에서 CPU/GPU 판단용)
    config.save({ scamGpuVariant: gpuResult.binaryVariant });
    log(`[SCAM] llama-server 준비 완료 (${gpuResult.binaryVariant})`);
  } finally {
    _binaryDownloading = false;
  }
}

// ──────────────────────────────────────────────────────
// llama-server 프로세스 관리
// ──────────────────────────────────────────────────────

async function waitForServerReady(): Promise<void> {
  const url = `http://127.0.0.1:${LLAMA_SERVER_PORT}/health`;
  const deadline = Date.now() + LLAMA_SERVER_HEALTH_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      await new Promise<void>((resolve, reject) => {
        http.get(url, (res) => {
          res.resume();
          res.statusCode === 200 ? resolve() : reject(new Error(`status ${res.statusCode}`));
        }).on('error', reject);
      });
      return;
    } catch (_) {
      await new Promise(r => setTimeout(r, LLAMA_SERVER_HEALTH_POLL_MS));
    }
  }
  throw new Error('llama-server 준비 시간 초과');
}

async function spawnServer(gpuLayers: number): Promise<void> {
  const binaryPath = getServerBinaryPath();
  const modelPath = getModelPath();

  log(`[SCAM] llama-server 시작 중... (GPU 레이어: ${gpuLayers})`);

  _serverProcess = spawn(binaryPath, [
    '--model', modelPath,
    '--port', String(LLAMA_SERVER_PORT),
    '--host', '127.0.0.1',
    '--ctx-size', '4096',
    '--n-gpu-layers', String(gpuLayers),
    '--threads', '4',
    '--log-disable',
  ], { stdio: 'ignore', detached: false });

  _serverProcess.on('error', (err) => {
    log(`[SCAM] llama-server 오류: ${err}`);
    _serverReady = false;
    _serverProcess = null;
  });

  _serverProcess.on('exit', (code) => {
    log(`[SCAM] llama-server 종료 (코드: ${code})`);
    _serverReady = false;
    _serverProcess = null;
  });

  await waitForServerReady();
  _serverReady = true;
  log(`[SCAM] llama-server 준비 완료 (port ${LLAMA_SERVER_PORT}, GPU 레이어: ${gpuLayers})`);
}

async function startServer(): Promise<void> {
  if (_serverReady) return;
  if (_startingServer) return _startingServer;
  _startingServer = _doStartServer().finally(() => { _startingServer = null; });
  return _startingServer;
}

async function _doStartServer(): Promise<void> {
  const binaryPath = getServerBinaryPath();
  if (!fs.existsSync(binaryPath)) {
    throw new Error('llama-server.exe 가 없습니다. 다운로드 후 다시 시도해주세요.');
  }
  const modelPath = getModelPath();
  if (!fs.existsSync(modelPath)) {
    throw new Error('모델 파일이 없습니다. 먼저 모델을 다운로드해주세요.');
  }

  const variant = config.load().scamGpuVariant ?? 'vulkan';
  if (variant === 'cpu') {
    await spawnServer(0);
  } else {
    // GPU 시도 → 실패 시 CPU 폴백
    try {
      await spawnServer(99);
    } catch (gpuErr) {
      log(`[SCAM] GPU 모드 실패 (${gpuErr}), CPU 모드로 재시도...`);
      await new Promise<void>((res) => {
        const proc = _serverProcess;
        if (!proc) { res(); return; }
        let timer: NodeJS.Timeout | null = null;
        const done = () => { if (timer) { clearTimeout(timer); timer = null; } res(); };
        proc.once('exit', done);
        try { proc.kill(); } catch (_) {}
        timer = setTimeout(done, 2000); // 2초 후 강제 진행 (보험)
      });
      _serverProcess = null;
      _serverReady = false;
      await spawnServer(0);
    }
  }
}

export function stopServer(): void {
  if (_serverProcess) {
    try { _serverProcess.kill(); } catch (_) { }
    _serverProcess = null;
  }
  _serverReady = false;
}

export function getServerStatus(): ServerStatus {
  return {
    running: _serverProcess !== null,
    ready: _serverReady,
    pid: _serverProcess?.pid ?? null,
    activeSessions: _sessions.size,
  };
}

export function getSessionStates(): SessionState[] {
  return [..._sessions.values()].map(s => ({
    filePath: s.filePath,
    fileName: path.basename(s.filePath),
    messageCount: s.messages.length,
    newSinceLastAnalysis: s.newSinceLastAnalysis,
    analyzing: s.analyzing,
    debounceActive: s.debounceTimer !== null,
    lastVerdict: s.lastVerdict,
    lastMessageTime: s.lastMessageTime,
    lastAnalysisAt: s.lastAnalysisAt,
    displayName: s.displayName,
  }));
}

export function getRecentResults(): ScamAnalysisResult[] {
  return _recentResults;
}

export function abortDownload(): void {
  _downloadAbortFlag = true;
}

export function triggerAnalyze(filePath: string): void {
  const session = _sessions.get(filePath);
  if (!session || !canAnalyze(session)) return;
  if (session.debounceTimer) {
    clearTimeout(session.debounceTimer);
    session.debounceTimer = null;
  }
  void analyze(session);
}

export function getQueueLength(): number {
  return _sessionQueue.length;
}

export function closeSession(filePath: string): void {
  const session = _sessions.get(filePath);
  if (session) {
    cleanupSession(session);
  } else {
    // 대기열에 있으면 제거
    const idx = _sessionQueue.findIndex(q => q.filePath === filePath);
    if (idx !== -1) {
      _sessionQueue.splice(idx, 1);
      broadcastSessionUpdate();
    }
  }
}

function broadcastSessionUpdate(): void {
  if (_broadcastTimer) clearTimeout(_broadcastTimer);
  _broadcastTimer = setTimeout(() => {
    _broadcastTimer = null;
    const scamWin = wm.getScamDetectorWindow();
    scamWin?.webContents.send('scam-session-update', getSessionStates(), _sessionQueue.length);
  }, 16);
}

// ──────────────────────────────────────────────────────
// HTML 파싱
// ──────────────────────────────────────────────────────

const TS_RE = /color="white">\s*\[(\d+)분\s+(\d+)분\s+(\d+)분\]/;
const MSG_RE = /color="(?:#c8ffc8|#ffffff)">([\s\S]*?)<\/font>/;
const SYS_RE = /color="#c8c8ff">([\s\S]*?)<\/font>/;

function parseLine(line: string): MessengerMessage | null {
  const tsMatch = line.match(TS_RE);
  const timestamp = tsMatch
    ? `${String(tsMatch[1]).padStart(2, '0')}:${String(tsMatch[2]).padStart(2, '0')}:${String(tsMatch[3]).padStart(2, '0')}`
    : '';

  const sysMatch = line.match(SYS_RE);
  if (sysMatch) {
    const content = sysMatch[1].trim();
    if (!content) return null;
    return { timestamp, sender: 'SYSTEM', content, isSystem: true };
  }

  const msgMatch = line.match(MSG_RE);
  if (msgMatch) {
    const raw = msgMatch[1].trim();
    const colonIdx = raw.indexOf(':');
    if (colonIdx < 0) return null;
    const sender = raw.slice(0, colonIdx).trim();
    const content = raw.slice(colonIdx + 1).trim();
    if (!sender || !content) return null;
    return { timestamp, sender, content, isSystem: false };
  }

  return null;
}

// ──────────────────────────────────────────────────────
// 프롬프트
// ──────────────────────────────────────────────────────

const SCAM_SYSTEM_PROMPT = `[Role & Objective]

너는 테일즈위버 게임 내 1:1 채팅 및 거래 로그를 분석하여 사기 위험성을 판독하는 전문 보안 조사관이야.

사용자가 대화 내용, 정황, 또는 채팅 로그를 입력하면, 아래의 [테일즈위버 사기 패턴 데이터베이스]를 바탕으로 뉘앙스와 키워드를 분석해 위험도(안전/주의/위험)를 엄격하게 평가하고 그 이유를 설명해줘.



[테일즈위버 사기 패턴 데이터베이스]

1. 존재하지 않는 시스템/단어 언급 (위험도: 1000%)

- 정상적인 1:1 거래는 교환창에 아이템을 올리고 그에 맞는 '시드'를 교환하는 것뿐이다.
- 위험 키워드: 쪽지, 코드, 별전, 보증, Ctrl 1 2, 가중치, 상속거래, 녜힁, 롤벤 등. (사기꾼은 매번 단어를 지어내므로, 단순 교환 이외의 시스템이나 절차를 언급하면 무조건 사기)
- 행동 패턴: 거래를 풀기 위해 특정 과정이 필요하다거나, 쪽지로 코드를 입력하라고 유도함.


2. 교묘한 2인 1조 사칭 (위험도: 1000%)

- 상황: 거래 중인 판매자와 동시에, 소속 클럽장/클럽원으로 위장한 아이디가 1:1 대화를 걸어옴.
- 위장 패턴: 아이디 앞에 특수문자나 직책을 붙임 (예: 클럽장- 햄찌, M- 햄찌, [클럽]햄찌).
- 목적: 가짜 시스템(가중치, 롤벤 등)이 실제 존재하는 것처럼 바람을 잡음. 뉴비/복귀 유저의 판단력을 흐리게 만듦.


3. 추가 시드 및 현금 유도 (위험도: 1000%)

- 사기 진행 중 "시드가 막혔다", "거래 정지를 먹었다", "가중치를 풀어야 한다" 등의 핑계를 댐.
- 네냐플 시드 판매자나 외부 거래소(매니아 등)에서 추가로 시드를 구매해 넘기도록 유도함. (고소를 피하기 위해 현금 대신 시드를 집요하게 요구함)


4. 거래 상대방의 스펙 및 행동 이상 (위험도: 99%)

- 레벨 및 에타 레벨 확인: 거래 상대방의 레벨이 310 미만이거나, '에타 레벨'이 없거나 현저히 낮은 경우. (에타 레벨은 육성 난이도가 매우 높아 사기꾼의 도용/급조 계정은 에타 레벨이 높은 경우가 거의 없음. 특히 Lv 200 언저리의 녹턴, 로아미니는 도용 계정일 확률이 매우 높음)
- 아이템 미등록: 교환창을 열고 3분 이상 구매하려는 아이템을 올리지 않고 말로만 시간을 끄는 경우.


5. 3자 사기 정황 (위험도: 99%)

- 사기꾼이 아이템 판매자와 구매자 사이에서 중개인 행세를 하며, 타 게임(예: 메이플스토리 등)의 재화 거래를 엮어 계좌 입금을 유도함.
- 방어책 회피: 무통장/계좌이체 거래 시 입금자명을 '테일즈위버 본인아이디 @@@억' 형태로 강제하는 것을 회피하거나 거부하면 사기.


6. 🟢 정상 거래 판단 기준 — 아래 조건을 모두 충족할 때만 🟢안전으로 판정할 것

- 거래 절차가 "교환창 아이템 확인 → 시드 확인 → 교환" 이외의 추가 절차를 요구하지 않는다.
- 쪽지, 코드, 가중치, 별전, 보증, 외부 거래소, 추가 시드 요구 등 1~3번, 5번 패턴이 전혀 없다.
- 4번 행동 이상(레벨 310 미만, 에타 레벨 없음, 아이템 미등록 지연)도 전혀 없다.
- 시드 액수가 크더라도(수십억~수백억) 그 자체는 사기 근거가 아니다. 테일즈위버에서 고가 아이템 거래는 일상적이다.
- 거래가 성사되었다는 시스템 메시지가 있으면 정상 거래로 간주한다.
- 불필요한 주의 경고를 남발하지 않되, 4번 행동 이상이 하나라도 있으면 반드시 🟡주의 이상으로 판정한다.



[Output Format]

반드시 아래의 1~5번 양식에 맞추어 답변을 출력해.

1. 판정: [🟢안전 / 🟡주의 / 🚨위험(사기 1000%)]

2. 감지된 사기 유형: (예: 시스템 단어 조작, 2인 1조 사칭, 3자 사기 의심, 감지된 특이사항 없음 등)

3. 분석 이유: 입력된 채팅 로그에서 어떤 부분(키워드, 뉘앙스, 정황)이 데이터베이스의 패턴과 일치하는지 구체적으로 지적해서 설명.

4. 행동 지침: (예: "즉시 1:1 대화를 종료하고 Ctrl+B를 눌러 차단하세요.", "상대방의 에타 레벨을 꼭 확인해보세요.")

5. ⚠️ 필수 안내: "※ AI의 판정 결과는 참고용입니다. '안전' 판정이 나오더라도 신종 사기 수법일 수 있으므로 100% 안전을 보장하지 않습니다. 거래 시에는 항상 [상대방 레벨 310 및 에타 레벨 확인], [교환창 아이템 직접 확인] 등 기본 수칙을 반드시 지켜주세요."`;

function buildConversationText(messages: MessengerMessage[]): string {
  return messages
    .slice(-MAX_MESSAGES_FOR_PROMPT)
    .map((m) => {
      if (m.isSystem) return `[시스템] ${m.content}`;
      return `[${m.timestamp}] ${m.sender}: ${m.content}`;
    })
    .join('\n');
}

// ──────────────────────────────────────────────────────
// LLM 호출 (llama-server OpenAI 호환 API)
// ──────────────────────────────────────────────────────

async function callLlm(userMessage: string, filePath: string): Promise<string> {
  const bodyStr = JSON.stringify({
    model: 'gemma4',
    messages: [
      { role: 'system', content: SCAM_SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    max_tokens: 2048,
    temperature: 0.1,
    stream: true,
  });

  return new Promise((resolve, reject) => {
    let accumulated = '';
    let sseBuffer = '';

    const req = http.request({
      hostname: '127.0.0.1',
      port: LLAMA_SERVER_PORT,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`llama-server HTTP ${res.statusCode}`));
        return;
      }

      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        sseBuffer += chunk;
        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const json = JSON.parse(data);
            const token: string = json.choices?.[0]?.delta?.content ?? '';
            if (token) {
              accumulated += token;
              wm.getScamDetectorWindow()?.webContents.send('scam-analysis-token', { filePath, token });
            }
          } catch (_) { }
        }
      });
      res.on('end', () => resolve(accumulated));
      res.on('error', reject);
    });

    req.setTimeout(120_000, () => req.destroy(new Error('llama-server 응답 시간 초과')));
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

// LLM 호출 직렬화 래퍼: 여러 세션이 동시에 callLlm을 호출하면 llama-server가
// 빈 응답을 반환하므로, 큐에 쌓아 한 번에 하나씩 실행한다.
async function callLlmQueued(session: ActiveSession, userMessage: string): Promise<string> {
  let raw = '';
  const slot = _llmQueue.then(async () => {
    if (session.closed) throw new Error('세션 종료됨 - LLM 건너뜀');
    raw = await callLlm(userMessage, session.filePath);
  });
  _llmQueue = slot.catch(() => {}); // 에러 발생해도 큐 막히지 않도록
  await slot;                        // 에러는 호출자(analyze)의 catch로 전파
  return raw;
}

// ──────────────────────────────────────────────────────
// 응답 파싱
// ──────────────────────────────────────────────────────

function parseResponse(raw: string): Omit<ScamAnalysisResult, 'filePath' | 'analyzedAt'> {
  let verdict: ScamAnalysisResult['verdict'] = 'UNKNOWN';

  // 1. 판정 줄만 먼저 추출해서 우선 매칭 (모델이 이모지 전후에 공백을 넣는 경우 대응)
  const verdictLine = raw.match(/1\s*[.:）)]\s*판정[^\n]*/)?.[0] ?? raw;

  if (/🚨|위험|사기\s*1000|1000\s*%/.test(verdictLine)) verdict = 'SCAM';
  else if (/🟡|주의/.test(verdictLine)) verdict = 'SUSPICIOUS';
  else if (/🟢|안전/.test(verdictLine)) verdict = 'SAFE';

  // 판정 줄 매칭 실패 시 전체 응답에서 재시도
  if (verdict === 'UNKNOWN') {
    if (/🚨|위험|사기\s*1000|1000\s*%/.test(raw)) verdict = 'SCAM';
    else if (/🟡|주의/.test(raw)) verdict = 'SUSPICIOUS';
    else if (/🟢|안전/.test(raw)) verdict = 'SAFE';
  }

  const getSection = (n: number): string => {
    const endPattern = n < 5 ? String(n + 1) + '\\.' : '$';
    const m = raw.match(new RegExp(`${n}\\s*[.:）)]?\\s*[^\\n]*\\n([\\s\\S]*?)(?=\\n\\s*${endPattern}|$)`, ''));
    return m?.[1]?.trim() ?? '';
  };

  return {
    verdict,
    detectedScamTypes: getSection(2),
    analysisReason: getSection(3),
    actionGuidance: getSection(4),
    rawResponse: raw,
  };
}

// ──────────────────────────────────────────────────────
// 알람
// ──────────────────────────────────────────────────────

async function sendAlert(result: ScamAnalysisResult): Promise<void> {
  const isScam = result.verdict === 'SCAM';
  const label = isScam
    ? '🚨 사기 위험 감지! 즉시 대화를 종료하세요!'
    : '⚠️ 사기 의심 대화 감지 - 주의하세요!';

  const sidebar = wm.getMainWindow();
  const alertSound = config.load().scamAlertSound || SCAM_ALERT_SOUND;
  sidebar?.webContents.send('play-sound', { label, soundFile: alertSound, volume: 100 });

  sidebar?.webContents.send('scam-alert', result);
}

// ──────────────────────────────────────────────────────
// 세션 관리
// ──────────────────────────────────────────────────────

function resetInactivityTimer(session: ActiveSession): void {
  if (session.inactivityTimer) clearTimeout(session.inactivityTimer);
  session.inactivityTimer = setTimeout(async () => {
    if (!session.closed) {
      log(`[SCAM] 무활동 타임아웃: ${path.basename(session.filePath)}`);
      await analyze(session);
      cleanupSession(session);
    }
  }, INACTIVITY_TIMEOUT_MS);
}

function cleanupSession(session: ActiveSession): void {
  if (session.closed) return;
  session.closed = true;
  if (session.analysisTimer) clearInterval(session.analysisTimer);
  if (session.debounceTimer) clearTimeout(session.debounceTimer);
  if (session.inactivityTimer) clearTimeout(session.inactivityTimer);
  try { session.tail.unwatch(); } catch (_) { }
  _sessions.delete(session.filePath);
  _testFilePaths.delete(session.filePath);
  log(`[SCAM] 세션 종료: ${path.basename(session.filePath)}`);

  // 대기열에서 다음 세션 시작
  while (_sessionQueue.length > 0 && _sessions.size < MAX_SESSIONS) {
    const next = _sessionQueue.shift()!;
    if (fs.existsSync(next.filePath)) {
      log(`[SCAM] 대기열에서 세션 시작: ${path.basename(next.filePath)} (남은 대기 ${_sessionQueue.length}개)`);
      startSession(next.filePath, next.isTest);
      break;
    }
  }

  broadcastSessionUpdate();
}

function onNewLine(session: ActiveSession, line: string): void {
  if (session.closed) return;
  const msg = parseLine(line);
  if (!msg) return;

  session.messages.push(msg);
  if (session.messages.length > MAX_MESSAGES_FOR_PROMPT * 2) {
    session.messages = session.messages.slice(-MAX_MESSAGES_FOR_PROMPT);
  }
  session.lastMessageTime = Date.now();
  session.newSinceLastAnalysis++;
  if (!session.displayName && !msg.isSystem && msg.sender) {
    session.displayName = msg.sender;
  }
  broadcastSessionUpdate();

  resetInactivityTimer(session);

  if (msg.isSystem && END_KEYWORDS.some((k) => msg.content.includes(k))) {
    log(`[SCAM] 대화 종료 감지: ${msg.content}`);
    if (session.debounceTimer) { clearTimeout(session.debounceTimer); session.debounceTimer = null; }
    analyze(session).finally(() => cleanupSession(session));
    return;
  }

  // 디바운스: 마지막 메시지로부터 DEBOUNCE_MS 만큼 조용하면 한 번만 분석 고려
  // 단, 직전 분석으로부터 ANALYSIS_INTERVAL_MS 미만이면 스킵 — 60s 인터벌이 처리
  if (session.debounceTimer) clearTimeout(session.debounceTimer);
  session.debounceTimer = setTimeout(() => {
    session.debounceTimer = null;
    broadcastSessionUpdate();
    const elapsed = Date.now() - session.lastAnalysisAt;
    if (!session.closed && !session.analyzing && session.newSinceLastAnalysis > 0
        && elapsed >= ANALYSIS_INTERVAL_MS) {
      void analyze(session);
    }
  }, DEBOUNCE_MS);
  broadcastSessionUpdate();
}

function canAnalyze(session: ActiveSession): boolean {
  return !session.closed && !session.analyzing && session.messages.length > 0;
}

async function analyze(session: ActiveSession): Promise<void> {
  if (!canAnalyze(session)) return;
  session.analyzing = true;
  const savedCount = session.newSinceLastAnalysis;
  session.newSinceLastAnalysis = 0;
  session.lastAnalysisAt = Date.now();
  broadcastSessionUpdate();

  log(`[SCAM] 분석 시작: ${path.basename(session.filePath)} (${session.messages.length}개 메시지)`);

  try {
    await startServer();

    const userMessage = `[분석할 대화 내용]\n${buildConversationText(session.messages)}`;
    const raw = await callLlmQueued(session, userMessage);

    const parsed = parseResponse(raw);
    const result: ScamAnalysisResult = {
      ...parsed,
      filePath: session.filePath,
      analyzedAt: Date.now(),
    };

    log(`[SCAM] 분석 결과: ${result.verdict} | 응답 앞부분: ${raw.slice(0, 120).replace(/\n/g, '↵')}`);

    // 모든 결과를 스캠 탐지 창 로그에 기록
    _recentResults.unshift(result);
    if (_recentResults.length > 20) _recentResults.pop();
    wm.getScamDetectorWindow()?.webContents.send('scam-analysis-result', result);

    const shouldAlert =
      (result.verdict === 'SCAM' || result.verdict === 'SUSPICIOUS') &&
      result.verdict !== session.lastVerdict;
    session.lastVerdict = result.verdict;
    session.consecutiveFailures = 0;

    if (shouldAlert) await sendAlert(result);
  } catch (e) {
    session.newSinceLastAnalysis = savedCount;
    session.consecutiveFailures++;
    log(`[SCAM] 분석 실패 (${session.consecutiveFailures}회 연속): ${e}`);
    if (session.consecutiveFailures >= 3) {
      new Notification({
        title: '사기꾼 탐지 AI',
        body: `분석이 ${session.consecutiveFailures}회 연속 실패했습니다. 탐지기에서 서버 상태를 확인해주세요.`,
      }).show();
      session.consecutiveFailures = 0; // 알림 후 리셋 (반복 스팸 방지)
    }
  } finally {
    session.analyzing = false;
    broadcastSessionUpdate();
    // 분석 중 쌓인 메시지는 60s 인터벌(setInterval)이 처리 — 여기서 재예약 불필요
  }
}

// ──────────────────────────────────────────────────────
// 폴더 감시
// ──────────────────────────────────────────────────────

function startSession(filePath: string, isTest = false): void {
  if (_sessions.has(filePath)) return;
  if (_sessions.size >= MAX_SESSIONS) {
    // 슬롯 부족 → 대기열에 추가 (중복 제외)
    if (!_sessionQueue.some(q => q.filePath === filePath)) {
      _sessionQueue.push({ filePath, isTest });
      log(`[SCAM] 세션 슬롯 부족, 대기열 추가: ${path.basename(filePath)} (대기 ${_sessionQueue.length}개)`);
      broadcastSessionUpdate();
    }
    return;
  }

  let tail: Tail;
  try {
    tail = new Tail(filePath, {
      fromBeginning: true,
      follow: true,
      useWatchFile: true,
      fsWatchOptions: { interval: 1000 },
      encoding: 'binary',
    });
  } catch (e) {
    log(`[SCAM] Tail 생성 실패 (${path.basename(filePath)}): ${e}`);
    return;
  }

  const session: ActiveSession = {
    filePath,
    tail,
    messages: [],
    newSinceLastAnalysis: 0,
    lastMessageTime: Date.now(),
    lastAnalysisAt: 0, // 0 = 아직 분석한 적 없음 → 첫 디바운스에서 즉시 분석
    analysisTimer: null,
    debounceTimer: null,
    inactivityTimer: null,
    analyzing: false,
    lastVerdict: 'UNKNOWN',
    closed: false,
    consecutiveFailures: 0,
    displayName: '',
  };

  tail.on('line', (data: string) => {
    const buf = Buffer.from(data, 'binary');
    onNewLine(session, iconv.decode(buf, 'euc-kr'));
  });
  tail.on('error', (err) => log(`[SCAM] Tail 오류: ${err}`));

  // 60초 max-wait: 디바운스가 계속 밀려도 최대 60초 안에는 분석 실행
  session.analysisTimer = setInterval(() => {
    if (!session.closed && session.newSinceLastAnalysis >= 1 && !session.analyzing) {
      if (session.debounceTimer) { clearTimeout(session.debounceTimer); session.debounceTimer = null; }
      void analyze(session);
    }
  }, ANALYSIS_INTERVAL_MS);

  if (!isTest) {
    resetInactivityTimer(session);
  }

  _sessions.set(filePath, session);
  log(`[SCAM] 새 1:1 대화 감지: ${path.basename(filePath)}${isTest ? ' [테스트]' : ''}`);
  broadcastSessionUpdate();
}

function startWatcher(msgerLogPath: string): void {
  if (_folderWatcher) return;
  try {
    _folderWatcher = fs.watch(msgerLogPath, (eventType, filename) => {
      if (eventType === 'rename' && filename?.endsWith('.html')) {
        const filePath = path.join(msgerLogPath, filename);
        setTimeout(() => {
          if (fs.existsSync(filePath) && !_sessions.has(filePath)) {
            startSession(filePath, _testFilePaths.has(filePath));
          }
        }, 500);
      }
    });
    log(`[SCAM] 사기꾼 탐지 모니터 시작 → ${msgerLogPath}`);
  } catch (e) {
    log(`[SCAM] 폴더 감시 시작 실패: ${e}`);
  }
}

// ──────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────

export function start(): void {
  const msgerLogPath = getMsgerLogPath();
  if (!msgerLogPath) {
    log('[SCAM] chatLogPath 미설정 → MsgerLog 경로 불명, 감시 건너뜀');
    return;
  }

  if (fs.existsSync(msgerLogPath)) {
    startWatcher(msgerLogPath);
  } else {
    log(`[SCAM] MsgerLog 폴더 없음, 1분마다 재시도: ${msgerLogPath}`);
  }

  if (!_folderPollTimer) {
    _folderPollTimer = setInterval(() => {
      if (_folderWatcher) return;
      const p = getMsgerLogPath();
      if (p && fs.existsSync(p)) {
        log('[SCAM] MsgerLog 폴더 생성 감지, 감시 시작');
        startWatcher(p);
      }
    }, 60_000);
  }
}

export function stop(): void {
  if (_folderPollTimer) {
    clearInterval(_folderPollTimer);
    _folderPollTimer = null;
  }
  if (_folderWatcher) {
    _folderWatcher.close();
    _folderWatcher = null;
  }
  for (const session of [..._sessions.values()]) {
    cleanupSession(session);
  }
  stopServer();
  log('[SCAM] 사기꾼 탐지 모니터 중지');
}

// 샘플 사기 대화 라인 생성 헬퍼
function makeLogLine(hour: number, min: number, sec: number, color: string, content: string): string {
  return `<font color="white">[${hour}분 ${min}분 ${sec}분]</font><font color="${color}">${content}</font><br>`;
}

// 테스트 시나리오별 대화 라인 생성
const TEST_SCENARIOS: Record<string, (h: number, m: number) => string[]> = {
  // 1. 가중치/코드/별전 — 확실한 사기 키워드
  scam_keyword: (h, m) => [
    makeLogLine(h, m, 0, '#c8ffc8', '사기꾼A: 안녕하세요~ 아이템 판매하시나요?'),
    makeLogLine(h, m, 5, '#ffffff', '나: 네 맞습니다'),
    makeLogLine(h, m, 10, '#c8ffc8', '사기꾼A: 거래 전에 가중치 코드 확인해야 해요'),
    makeLogLine(h, m, 15, '#ffffff', '나: 가중치 코드가 뭔가요?'),
    makeLogLine(h, m, 20, '#c8ffc8', '사기꾼A: 테일즈위버 거래 시스템인데요 쪽지로 코드 보내드릴게요'),
    makeLogLine(h, m, 25, '#c8ffc8', '사기꾼A: Ctrl+1 누르고 코드 입력하시면 거래 잠금 풀려요'),
    makeLogLine(h, m, 30, '#ffffff', '나: 그런 시스템이 있나요?'),
    makeLogLine(h, m, 35, '#c8ffc8', '사기꾼A: 네 최근에 업데이트됐어요 가중치 안 풀면 시드가 막혀요'),
    makeLogLine(h, m, 40, '#c8ffc8', '사기꾼A: 빨리 해주셔야 해요 다른 분도 기다리고 계셔서'),
    makeLogLine(h, m, 45, '#ffffff', '나: 잠깐만요 좀 이상한거같은데'),
    makeLogLine(h, m, 50, '#c8ffc8', '사기꾼A: 별전으로 보증금 먼저 주시면 바로 처리해드려요'),
  ],
  // 2. 2인 1조 사칭 — 클럽장 위장 + 상속거래
  scam_duo: (h, m) => [
    makeLogLine(h, m, 0, '#c8ffc8', '판매자햄찌: 안녕하세요 아이템 사고싶어서요'),
    makeLogLine(h, m, 5, '#ffffff', '나: 네 교환창 열게요'),
    makeLogLine(h, m, 10, '#c8ffc8', '클럽장-햄찌: 잠깐요 저희 클럽원이랑 거래 중이신가요?'),
    makeLogLine(h, m, 15, '#ffffff', '나: 네 그런데요?'),
    makeLogLine(h, m, 20, '#c8ffc8', '클럽장-햄찌: 저희 클럽에서는 상속거래 시스템 써야 해요'),
    makeLogLine(h, m, 25, '#c8ffc8', '클럽장-햄찌: 녜힁 코드 입력 안 하면 거래 취소돼요'),
    makeLogLine(h, m, 30, '#c8ffc8', '판매자햄찌: 클럽장님 말씀이 맞아요 롤벤 피하려면 해야해요'),
    makeLogLine(h, m, 35, '#ffffff', '나: 롤벤이 뭔가요?'),
    makeLogLine(h, m, 40, '#c8ffc8', '클럽장-햄찌: 계정 정지예요 빨리 쪽지로 코드 받으세요'),
    makeLogLine(h, m, 45, '#c8ffc8', '판매자햄찌: 서두르세요 다른 분 기다려요'),
  ],
  // 3. 추가 시드 유도 — 거래 정지/시드 막힘 핑계
  scam_seed: (h, m) => [
    makeLogLine(h, m, 0, '#c8ffc8', '사기꾼B: 아이템 교환창 열었는데 제 시드가 막혔어요'),
    makeLogLine(h, m, 5, '#ffffff', '나: 시드가 왜 막혀요?'),
    makeLogLine(h, m, 10, '#c8ffc8', '사기꾼B: 거래 정지 먹어서 가중치를 풀어야 해요'),
    makeLogLine(h, m, 15, '#c8ffc8', '사기꾼B: 네냐플에서 시드 50억 사서 저한테 보내주시면 풀어드릴게요'),
    makeLogLine(h, m, 20, '#ffffff', '나: 그게 말이 되나요?'),
    makeLogLine(h, m, 25, '#c8ffc8', '사기꾼B: 네 운영자 규정이에요 안 하시면 아이템 못 받아요'),
    makeLogLine(h, m, 30, '#c8ffc8', '사기꾼B: 매니아에서 사셔도 돼요 빠르게 부탁드려요'),
    makeLogLine(h, m, 35, '#ffffff', '나: 처음 듣는 시스템인데'),
    makeLogLine(h, m, 40, '#c8ffc8', '사기꾼B: 뉴비분들은 잘 모르세요 고소 피하려면 해야해요'),
    makeLogLine(h, m, 45, '#c8ffc8', '사기꾼B: 현금 말고 시드로만 받아요'),
  ],
  // 4. 의심스러운 대화 — 명확한 키워드는 없지만 행동 이상 (저레벨 + 아이템 장기 미등록)
  suspicious: (h, m) => {
    // 타임스탬프를 분 단위로 증가시켜 실제 경과 시간 표현
    const m2 = (m + 1) % 60, m5 = (m + 5) % 60, m6 = (m + 6) % 60;
    const m8 = (m + 8) % 60, m9 = (m + 9) % 60, m11 = (m + 11) % 60;
    const m12 = (m + 12) % 60, m13 = (m + 13) % 60;
    return [
      makeLogLine(h, m,  0, '#c8ffc8', '저레벨유저: 안녕하세요 아이템 팔려고요'),
      makeLogLine(h, m,  30, '#ffffff', '나: 네 교환창 열게요'),
      makeLogLine(h, m2, 10, '#c8ffc8', '저레벨유저: 잠깐만요 준비 중이에요'),
      makeLogLine(h, m2, 50, '#ffffff', '나: 아이템 올려주세요'),
      makeLogLine(h, m5, 20, '#c8ffc8', '저레벨유저: 조금만요 확인 중이에요'),
      makeLogLine(h, m6,  0, '#ffffff', '나: 교환창 연 지 5분이 넘었는데 아직도 아이템을 안 올리시네요'),
      makeLogLine(h, m6, 30, '#c8ffc8', '저레벨유저: 죄송해요 컴퓨터가 느려서요'),
      makeLogLine(h, m8,  0, '#ffffff', '나: 레벨이 몇이세요?'),
      makeLogLine(h, m8, 20, '#c8ffc8', '저레벨유저: 185레벨이에요 에타는 아직 못 했어요'),
      makeLogLine(h, m9,  0, '#ffffff', '나: 10분 가까이 됐는데 아이템을 왜 안 올리시나요'),
      makeLogLine(h, m11, 0, '#c8ffc8', '저레벨유저: 기다려주세요 곧 올릴게요'),
      makeLogLine(h, m12, 0, '#ffffff', '나: 이상한데 그냥 교환창 닫을게요'),
      makeLogLine(h, m13, 0, '#c8ffc8', '저레벨유저: 잠깐만요 지금 올릴게요 꼭 거래해야해요'),
    ];
  },
  // 5. 정상 거래 — 안전한 대화
  safe: (h, m) => [
    makeLogLine(h, m, 0, '#c8ffc8', '일반유저: 안녕하세요 전설 반지 팔려고 올리셨나요?'),
    makeLogLine(h, m, 5, '#ffffff', '나: 네 맞아요 교환창 열게요'),
    makeLogLine(h, m, 10, '#c8ffc8', '일반유저: 감사합니다 확인할게요'),
    makeLogLine(h, m, 15, '#c8ffc8', '일반유저: 아이템 올렸어요 가격은 30억으로 알고 있는데 맞나요?'),
    makeLogLine(h, m, 20, '#ffffff', '나: 네 30억 맞아요'),
    makeLogLine(h, m, 25, '#c8ffc8', '일반유저: 시드 확인했어요 교환 누를게요'),
    makeLogLine(h, m, 30, '#ffffff', '나: 저도 확인했어요 교환할게요'),
    makeLogLine(h, m, 35, '#c8c8ff', '거래가 성사되었습니다.'),
    makeLogLine(h, m, 40, '#c8ffc8', '일반유저: 감사합니다 좋은 하루 되세요'),
    makeLogLine(h, m, 45, '#ffffff', '나: 감사합니다'),
  ],
};

/** 사용자 선택(nvidia/amd/intel/none)에서 GpuDetectionResult를 구성한다.
 *  NVIDIA는 nvidia-smi로 CUDA 버전을 자동 감지한다. */
export async function buildGpuResultForUserChoice(choice: string): Promise<GpuDetectionResult> {
  if (choice === 'nvidia') {
    // nvidia-smi 호출 없이 CUDA 12.4 고정 사용.
    // cudart DLL을 함께 번들하므로 드라이버 버전과 무관하게 동작하고,
    // nvidia-smi 가 드라이버 버그로 BSOD를 유발할 수 있어 호출하지 않는다.
    return {
      gpuType: 'nvidia', gpuName: 'NVIDIA GPU',
      binaryVariant: 'cuda-12.4',
      binaryUrl: BINARY_URLS['cuda-12.4'].binary,
      cudartUrl: BINARY_URLS['cuda-12.4'].cudart,
    };
  }
  if (choice === 'amd') {
    return { gpuType: 'amd', gpuName: 'AMD GPU', binaryVariant: 'vulkan', binaryUrl: BINARY_URLS['vulkan'].binary };
  }
  if (choice === 'intel') {
    return { gpuType: 'intel', gpuName: 'Intel GPU', binaryVariant: 'vulkan', binaryUrl: BINARY_URLS['vulkan'].binary };
  }
  return { gpuType: 'none', gpuName: 'GPU 없음', binaryVariant: 'cpu', binaryUrl: BINARY_URLS['cpu'].binary };
}

export function injectTestSession(scenario = 'scam_keyword'): { success: boolean; error?: string } {
  const msgerLogPath = getMsgerLogPath();
  if (!msgerLogPath) return { success: false, error: 'MsgerLog 경로를 알 수 없습니다. ChatLog 경로를 먼저 설정해주세요.' };

  const scenarioFn = TEST_SCENARIOS[scenario] ?? TEST_SCENARIOS['scam_keyword'];

  try {
    if (!fs.existsSync(msgerLogPath)) fs.mkdirSync(msgerLogPath, { recursive: true });

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    const fileName = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}-${ms}.html`;
    const filePath = path.join(msgerLogPath, fileName);

    const h = now.getHours(), m = now.getMinutes();
    const lines = scenarioFn(h, m);

    fs.writeFileSync(filePath, iconv.encode(lines.join('\n') + '\n', 'euc-kr'));
    log(`[SCAM] 테스트 파일 생성: ${fileName} (시나리오: ${scenario})`);

    _testFilePaths.add(filePath);

    if (!_folderWatcher) {
      startWatcher(msgerLogPath);
    }

    // fs.watch에 의존하지 않고 직접 세션 시작 (Windows에서 이벤트 누락 방지)
    if (!_sessions.has(filePath)) {
      startSession(filePath, true);
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
