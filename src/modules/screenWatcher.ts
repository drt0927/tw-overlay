import { desktopCapturer } from 'electron';
import { EventEmitter } from 'events';
import * as wm from './windowManager';
import * as config from './config';
import { IS_DEV } from './constants';
import * as fs from 'fs';
import * as path from 'path';

interface ScreenWatcherOptions {
    checkIntervalMs: number;
    colorThreshold: {
        rMin: number;
        gMax: number;
        bMin: number;
    };
    densityThreshold: number;
}

// 백오프 관련 상수
const BACKOFF_TRIGGER = 3;       // 연속 N회 실패 시 백오프 적용
const MAX_INTERVAL_MS = 5000;    // 최대 캡처 간격 (5초)

class ScreenWatcher extends EventEmitter {
    private options: ScreenWatcherOptions;
    private intervalId: NodeJS.Timeout | null = null;
    private isRunning = false;
    private saveNextFrame = false;
    private cachedThreshold: number;
    private checkCount: number = 0;
    private consecutiveErrors: number = 0;
    private currentIntervalMs: number = 0;
    private cachedSourceId: string | null = null;

    constructor(options: Partial<ScreenWatcherOptions> = {}) {
        super();
        this.options = {
            checkIntervalMs: 1000,
            colorThreshold: {
                rMin: 150,
                gMax: 200,
                bMin: 180
            },
            densityThreshold: 0.02,
            ...options
        };
        this.cachedThreshold = this.options.densityThreshold;
        this.currentIntervalMs = this.options.checkIntervalMs;
    }

    public start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.saveNextFrame = true;
        // 시작 시 config에서 threshold 로드
        const cfg = config.load();
        this.cachedThreshold = (cfg.dangerThreshold || 2.0) / 100;
        this.currentIntervalMs = this.options.checkIntervalMs;
        this.consecutiveErrors = 0;
        this.intervalId = setInterval(() => this.checkScreen(), this.currentIntervalMs);
        wm.setMonitorZoneClickThrough(true);
    }

    public stop() {
        if (!this.isRunning) return;
        this.isRunning = false;
        if (this.intervalId) clearInterval(this.intervalId);
        this.intervalId = null;
        this.cachedSourceId = null;
        wm.setMonitorZoneClickThrough(false);
    }

    private async checkScreen() {
        try {
            const zoneBounds = wm.getMonitorZoneBounds();
            if (!zoneBounds) return;

            const gameRectBounds = wm.getGameRect();
            if (!gameRectBounds) return;

            // 게임 창만 캡처 (전체 화면 대신)
            const sources = await desktopCapturer.getSources({
                types: ['window'],
                thumbnailSize: { width: gameRectBounds.width, height: gameRectBounds.height }
            });

            // 캐시된 ID로 먼저 찾고, 없으면 이름으로 폴백
            let gameSource = this.cachedSourceId
                ? sources.find(s => s.id === this.cachedSourceId)
                : null;

            if (!gameSource) {
                gameSource = sources.find(s =>
                    s.name.toLowerCase().includes('talesweaver')
                );
                if (!gameSource) return;
                this.cachedSourceId = gameSource.id;
            }

            const gameImage = gameSource.thumbnail;
            const imgSize = gameImage.getSize();
            if (imgSize.width <= 0 || imgSize.height <= 0) return;

            // 모니터 존 좌표를 게임 창 기준 상대 좌표로 변환
            const scaleX = imgSize.width / gameRectBounds.width;
            const scaleY = imgSize.height / gameRectBounds.height;

            const cropRect = {
                x: Math.max(0, Math.floor((zoneBounds.x - gameRectBounds.x) * scaleX)),
                y: Math.max(0, Math.floor((zoneBounds.y - gameRectBounds.y) * scaleY)),
                width: Math.min(Math.floor(zoneBounds.width * scaleX), imgSize.width),
                height: Math.min(Math.floor(zoneBounds.height * scaleY), imgSize.height)
            };

            if (cropRect.width <= 0 || cropRect.height <= 0) return;
            if (cropRect.x + cropRect.width > imgSize.width) cropRect.width = imgSize.width - cropRect.x;
            if (cropRect.y + cropRect.height > imgSize.height) cropRect.height = imgSize.height - cropRect.y;

            const zoneImage = gameImage.crop(cropRect);

            if (this.saveNextFrame) {
                this.saveNextFrame = false;
                if (IS_DEV) {
                    const buffer = zoneImage.toPNG();
                    const debugPath = path.join(process.cwd(), 'debug_capture.png');
                    fs.writeFileSync(debugPath, buffer);
                    console.log(`[ScreenWatcher] Precision zone debug frame saved: ${debugPath}`);
                }
            }

            const bitmap = zoneImage.toBitmap();
            const { width, height } = zoneImage.getSize();

            // ~30초마다 config에서 threshold 새로고침 (300ms * 100 = 30초)
            if (++this.checkCount % 100 === 0) {
                const cfg = config.load();
                this.cachedThreshold = (cfg.dangerThreshold || 2.0) / 100;
            }

            // 픽셀 샘플링: 4개 중 1개만 검사하여 CPU 부하 감소
            const SAMPLE_STEP = 4;
            let matchCount = 0;
            let sampledPixels = 0;

            for (let i = 0; i < bitmap.length; i += 4 * SAMPLE_STEP) {
                sampledPixels++;
                const b = bitmap[i];
                const g = bitmap[i + 1];
                const r = bitmap[i + 2];

                if (r > this.options.colorThreshold.rMin &&
                    b > this.options.colorThreshold.bMin &&
                    g < this.options.colorThreshold.gMax) {
                    if (b > g + 20) matchCount++;
                }
            }

            const density = sampledPixels > 0 ? matchCount / sampledPixels : 0;

            if (density > this.cachedThreshold) {
                if (IS_DEV) {
                    try {
                        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                        const capturePath = path.join(process.cwd(), `danger_${timestamp}.png`);
                        fs.writeFileSync(capturePath, zoneImage.toPNG());
                        console.log(`[ScreenWatcher] 📸 Screenshot saved: ${capturePath}`);
                    } catch (_) { }
                }
                this.emit('danger-detected', { density });
            } else {
                this.emit('safe');
            }

            // 캡처 성공 시 에러 카운터 리셋 & 백오프 복구
            if (this.consecutiveErrors > 0) {
                this.consecutiveErrors = 0;
                this.restoreInterval();
            }

        } catch (error) {
            this.consecutiveErrors++;
            console.error(`[ScreenWatcher] Capture error (${this.consecutiveErrors}x consecutive):`, error);

            // 연속 실패 시 백오프: interval을 점진적으로 늘림
            if (this.consecutiveErrors >= BACKOFF_TRIGGER && this.consecutiveErrors % BACKOFF_TRIGGER === 0) {
                this.applyBackoff();
            }
        }
    }

    /** 백오프 적용: interval을 2배로 늘림 (최대 MAX_INTERVAL_MS) */
    private applyBackoff() {
        const newInterval = Math.min(this.currentIntervalMs * 2, MAX_INTERVAL_MS);
        if (newInterval !== this.currentIntervalMs) {
            this.currentIntervalMs = newInterval;
            this.resetTimer();
            console.warn(`[ScreenWatcher] Backoff applied: interval → ${this.currentIntervalMs}ms`);
        }
    }

    /** 원래 interval로 복구 */
    private restoreInterval() {
        if (this.currentIntervalMs !== this.options.checkIntervalMs) {
            this.currentIntervalMs = this.options.checkIntervalMs;
            this.resetTimer();
        }
    }

    /** setInterval 재설정 */
    private resetTimer() {
        if (this.intervalId) clearInterval(this.intervalId);
        if (this.isRunning) {
            this.intervalId = setInterval(() => this.checkScreen(), this.currentIntervalMs);
        }
    }
}

export default new ScreenWatcher();
