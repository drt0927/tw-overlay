/**
 * 게임 창 추적 모듈 - Native Win32 API (Koffi) 버전
 * 
 * [주요 기능]
 * 1. WinEventHook을 통한 실시간 창 이동 및 포커스 감지
 * 2. 샌드위치 Z-Order 로직: 게임 위에 붙으면서도 다른 앱(브라우저 등) 뒤로 숨음
 * 3. 메모리 및 깜박임 최적화 (Buffer 재사용 및 포커스 캐싱)
 */
import { GAME_PROCESS_NAME, GameQueryResult, TITLE_BUFFER_LENGTH } from './constants';
import { log } from './logger';
import * as win32 from './win32';
import koffi from 'koffi';

let cachedHwnd: bigint | null = null;
let lastProcessId: number | null = null;
let hEventHook: bigint | null = null;
let onWindowEventCallback: (() => void) | null = null;
let onForegroundChangeCallback: ((isGameFocused: boolean, focusedHwnd: string) => void) | null = null;
let lastIsGameOrAppFocused: boolean = false;

// --- 메모리 최적화를 위한 재사용 버퍼 ---
const titleBuffer = Buffer.alloc(TITLE_BUFFER_LENGTH * 2);
const nameBuffer = Buffer.alloc(512);
const pidPtr = Buffer.alloc(4);
const sizePtr = Buffer.alloc(4);
const rectOut = { left: 0, top: 0, right: 0, bottom: 0 };

// --- 콜백 등록 ---

// 1. 창 열거(EnumWindows) 콜백
const EnumWindowsProc = koffi.proto('__stdcall', 'bool', ['intptr', 'intptr']);
const EnumWindowsProcPtr = koffi.pointer(EnumWindowsProc);

let _tempFoundHwnd: bigint | null = null;
let _tempFoundPid: number | null = null;

const enumCallback = koffi.register((hwnd: bigint, _lParam: bigint) => {
    const titleLen = win32.GetWindowTextW(hwnd, titleBuffer, TITLE_BUFFER_LENGTH);
    if (titleLen === 0) return true;

    const title = titleBuffer.toString('utf16le', 0, titleLen * 2);
    if (title.includes('Talesweaver')) {
        win32.GetWindowThreadProcessId(hwnd, pidPtr);
        const pid = pidPtr.readUInt32LE(0);

        let hProcess = 0n;
        try {
            hProcess = win32.OpenProcess(win32.PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
            if (hProcess !== 0n) {
                sizePtr.writeUInt32LE(TITLE_BUFFER_LENGTH, 0);
                if (win32.QueryFullProcessImageNameW(hProcess, 0, nameBuffer, sizePtr)) {
                    const nameLen = sizePtr.readUInt32LE(0);
                    const fullPath = nameBuffer.toString('utf16le', 0, nameLen * 2);
                    if (fullPath.toLowerCase().includes(GAME_PROCESS_NAME.toLowerCase())) {
                        _tempFoundHwnd = hwnd;
                        _tempFoundPid = pid;
                        return false;
                    }
                }
            }
        } catch {
            // 프로세스 접근 실패 시 무시
        } finally {
            if (hProcess !== 0n) win32.CloseHandle(hProcess);
        }
    }
    return true;
}, EnumWindowsProcPtr);

// 2. 윈도우 이벤트(WinEvent) 콜백
const WinEventProcProto = koffi.proto('__stdcall', 'void', ['intptr', 'uint32', 'intptr', 'int32', 'int32', 'uint32', 'uint32']);
const WinEventProcPtr = koffi.pointer(WinEventProcProto);

const winEventProcInstance = koffi.register((hWinEventHook: bigint, event: number, hwnd: bigint, idObject: number, idChild: number, dwEventThread: number, dwmsEventTime: number) => {
    if (cachedHwnd && hwnd === cachedHwnd) {
        if (onWindowEventCallback) onWindowEventCallback();
    }
    // 포그라운드 변경 이벤트: 즉각적인 포커스 감지
    if (event === win32.EVENT_SYSTEM_FOREGROUND && onForegroundChangeCallback) {
        const isGameFocused = cachedHwnd !== null && hwnd === cachedHwnd;
        onForegroundChangeCallback(isGameFocused, hwnd.toString());
    }
}, WinEventProcPtr);


// --- 내부 함수 ---

function setupEventHook(): void {
    if (hEventHook) return;
    hEventHook = win32.SetWinEventHook(
        win32.EVENT_SYSTEM_FOREGROUND,
        win32.EVENT_OBJECT_LOCATIONCHANGE,
        0n,
        winEventProcInstance,
        0,
        0,
        win32.WINEVENT_OUTOFCONTEXT
    );
}

function findGameWindow(): bigint | null {
    _tempFoundHwnd = null;
    _tempFoundPid = null;
    try {
        win32.EnumWindows(enumCallback, 0);
    } catch (e) {
        log(`[TRACKER] EnumWindows Error: ${e}`);
    }

    if (_tempFoundHwnd) {
        lastProcessId = _tempFoundPid;
        setupEventHook();
        return _tempFoundHwnd;
    }
    return null;
}

function isHwndValid(hwnd: bigint): boolean {
    if (!hwnd) return false;
    const threadId = win32.GetWindowThreadProcessId(hwnd, pidPtr);
    if (threadId === 0) return false;
    return pidPtr.readUInt32LE(0) === lastProcessId;
}

// --- 외부 API ---

export function start(): void {
    log('[TRACKER] Native tracker initialized.');
}

export function setWindowEventListener(callback: () => void): void {
    onWindowEventCallback = callback;
}

export function setForegroundChangeListener(callback: (isGameFocused: boolean, focusedHwnd: string) => void): void {
    onForegroundChangeCallback = callback;
}

export async function queryGameRect(): Promise<GameQueryResult> {
    try {
        if (!cachedHwnd || !isHwndValid(cachedHwnd)) {
            cachedHwnd = findGameWindow();
            if (!cachedHwnd) return { notRunning: true };
            log(`[TRACKER] Found game window: ${cachedHwnd} (PID: ${lastProcessId})`);
        }

        if (win32.IsIconic(cachedHwnd)) return null;

        let res = win32.DwmGetWindowAttribute(cachedHwnd, win32.DWMWA_EXTENDED_FRAME_BOUNDS, rectOut, 16);
        if (res !== 0 && !win32.GetWindowRect(cachedHwnd, rectOut)) {
            return { error: 'Failed to get rect' };
        }

        return {
            x: rectOut.left,
            y: rectOut.top,
            width: rectOut.right - rectOut.left,
            height: rectOut.bottom - rectOut.top,
            gameHwnd: cachedHwnd.toString(),
            isForeground: BigInt(win32.GetForegroundWindow()) === cachedHwnd
        };
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        log(`[TRACKER] queryGameRect Error: ${msg}`);
        return undefined;
    }
}

export function stop() {
    if (hEventHook) {
        win32.UnhookWinEvent(hEventHook);
        hEventHook = null;
    }
    cachedHwnd = null;
}

/** 
 * 오버레이 창들을 게임 바로 위로 올림 (Z-Order 샌드위치 최적화 로직)
 */
export function promoteWindows(gameHwndStr: string | undefined, electronHwnds: string[]): { isGameOrAppFocused: boolean } {
    if (!gameHwndStr || electronHwnds.length === 0 || !win32.SetWindowPos) return { isGameOrAppFocused: false };

    let isFocused = false;
    try {
        const gameHwnd = BigInt(gameHwndStr);
        const flags = win32.SWP_NOMOVE | win32.SWP_NOSIZE | win32.SWP_NOACTIVATE |
            win32.SWP_NOOWNERZORDER | win32.SWP_NOSENDCHANGING |
            win32.SWP_DEFERERASE | win32.SWP_NOCOPYBITS;

        const fgHwnd = BigInt(win32.GetForegroundWindow());
        const isGameFocused = (fgHwnd === gameHwnd);
        const electronHwndBigInts = electronHwnds.map(h => BigInt(h));
        // 사이드바를 포함한 모든 앱 윈도우 중 하나라도 포커스를 가졌는지 체크
        const isOurAppFocused = electronHwndBigInts.includes(fgHwnd);

        isFocused = isGameFocused || isOurAppFocused;

        // 항상 샌드위치 배치: 게임 창 바로 앞(Z+1)에 오버레이 배치
        const prevHwnd = win32.GetWindow(gameHwnd, win32.GW_HWNDPREV);
        const isAlreadySandwiched = electronHwndBigInts.some(h => h === prevHwnd);

        if (!isAlreadySandwiched) {
            if (prevHwnd !== 0n) {
                let hwndInsertAfter = prevHwnd;
                for (let i = electronHwndBigInts.length - 1; i >= 0; i--) {
                    const hBigInt = electronHwndBigInts[i];
                    win32.SetWindowPos(hBigInt, hwndInsertAfter, 0, 0, 0, 0, flags);
                    hwndInsertAfter = hBigInt;
                }
            }
        }

        lastIsGameOrAppFocused = isFocused;

    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        log(`[TRACKER] Promote failed: ${msg}`);
    }
    return { isGameOrAppFocused: isFocused };
}

export async function boostGameProcess(): Promise<string | undefined> {
    if (!lastProcessId) return 'BOOST_FAIL';
    let hProcess = 0n;
    try {
        hProcess = win32.OpenProcess(win32.PROCESS_SET_INFORMATION, false, lastProcessId);
        if (hProcess === 0n) return 'BOOST_FAIL';
        return win32.SetPriorityClass(hProcess, win32.HIGH_PRIORITY_CLASS) ? 'BOOSTED' : 'BOOST_FAIL';
    } catch (e) {
        return 'BOOST_FAIL';
    } finally {
        if (hProcess !== 0n) win32.CloseHandle(hProcess);
    }
}

export function focusGameWindow(): void {
    if (!cachedHwnd || !isHwndValid(cachedHwnd)) return;
    try {
        // 이미 게임 창이 활성화 상태라면 아무것도 하지 않습니다 (깜박임 방지)
        const fgHwnd = BigInt(win32.GetForegroundWindow());
        if (fgHwnd === cachedHwnd) return;

        // Alt 키 트릭 (SetForegroundWindow 제약 우회)
        win32.keybd_event(win32.VK_MENU, 0, 0, 0);
        win32.keybd_event(win32.VK_MENU, 0, win32.KEYEVENTF_KEYUP, 0);

        win32.ShowWindow(cachedHwnd, win32.SW_RESTORE);
        win32.BringWindowToTop(cachedHwnd);
        win32.SetForegroundWindow(cachedHwnd);
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        log(`[TRACKER] Focus failed: ${msg}`);
    }
}
