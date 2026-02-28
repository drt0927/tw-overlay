/**
 * 게임 창 추적 폴링 루프
 * main.ts에서 분리된 모듈 — 게임 창 위치/상태를 주기적으로 확인하고 오버레이를 동기화합니다.
 */
import { app } from 'electron';
import {
    POLLING_FAST_MS,
    POLLING_STABLE_MS,
    POLLING_MINIMIZED_MS,
    POLLING_IDLE_MS,
    STABLE_THRESHOLD_COUNT,
    WINDOW_MINIMIZED_THRESHOLD,
    EVENT_DEBOUNCE_MS,
    GameRect,
    GameQueryResult,
    appState
} from './constants';
import { log } from './logger';
import * as tracker from './tracker';
import * as wm from './windowManager';
import * as path from 'path';

let pollingTimer: NodeJS.Timeout | null = null;
let gameWasEverFound = false;

export function start(): void {
    let lastRect: GameQueryResult = null;
    let stableCount = 0;
    let isBoosted = false;

    const rectEquals = (a: GameQueryResult, b: GameQueryResult): boolean => {
        if (!a || !b) return a === b;
        if ('x' in a && 'x' in b) {
            return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height && a.isForeground === b.isForeground;
        }
        return false;
    };

    // 윈도우 이벤트(이동, 활성화 등) 발생 시 즉시 폴링 함수 실행
    let isProcessingEvent = false;
    tracker.setWindowEventListener(() => {
        if (isProcessingEvent) return;

        if (pollingTimer) {
            clearTimeout(pollingTimer);
            isProcessingEvent = true;
            setTimeout(() => {
                isProcessingEvent = false;
                poll();
            }, EVENT_DEBOUNCE_MS);
        }
    });

    async function poll(): Promise<void> {
        if (appState.isQuitting) return;

        const currentRect = await tracker.queryGameRect();
        let nextDelay = POLLING_FAST_MS;

        if (currentRect === undefined || (currentRect !== null && 'error' in currentRect)) {
            pollingTimer = setTimeout(poll, POLLING_FAST_MS);
            return;
        }

        if (currentRect && 'notRunning' in currentRect) {
            if (gameWasEverFound) { app.quit(); return; }
            wm.hideAll();
            stableCount = 0;
            isBoosted = false;
            pollingTimer = setTimeout(poll, POLLING_IDLE_MS);
            return;
        }

        if (!currentRect || (currentRect && 'x' in currentRect && currentRect.x <= WINDOW_MINIMIZED_THRESHOLD)) {
            wm.hideAll();
            stableCount = 0;
            pollingTimer = setTimeout(poll, POLLING_MINIMIZED_MS);
            return;
        }

        gameWasEverFound = true;
        if (!isBoosted) {
            tracker.boostGameProcess().then(res => {
                if (res === 'BOOSTED' || res === 'ALREADY_HIGH') {
                    log(`[POLL] Game process priority elevated: ${res}`);
                    isBoosted = true;
                }
            }).catch(e => log(`[POLL] boostGameProcess failed: ${e}`));
        }

        const mainWin = wm.getMainWindow();
        const isVisible = mainWin && mainWin.isVisible();

        // Z-Order 관리: 위치 변경이든 안정 상태든 promoteWindows는 한 번만 호출
        if (currentRect && 'gameHwnd' in currentRect) {
            const { isGameOrAppFocused } = tracker.promoteWindows(currentRect.gameHwnd, wm.getAllWindowHwnds());
            wm.setAllAlwaysOnTop(isGameOrAppFocused);
        }

        if (!rectEquals(currentRect, lastRect) || !isVisible) {
            wm.syncOverlay(currentRect as GameRect);
            lastRect = currentRect;
            stableCount = 0;
            nextDelay = POLLING_FAST_MS;
        } else {
            stableCount++;
            nextDelay = (stableCount >= STABLE_THRESHOLD_COUNT) ? POLLING_STABLE_MS : POLLING_FAST_MS;
        }

        pollingTimer = setTimeout(poll, nextDelay);
    }
    poll();
}
