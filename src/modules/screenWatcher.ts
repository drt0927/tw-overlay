import { ipcMain, screen } from 'electron';
import { EventEmitter } from 'events';
import * as wm from './windowManager';
import * as config from './config';
import { log } from './logger';
import * as win32 from './win32';

/**
 * 장판 감시 모듈 - Native GDI 기반
 * 화면의 특정 영역(MonitorZone)을 캡처하여 보라색 장판의 비율을 분석합니다.
 */
class ScreenWatcher extends EventEmitter {
    private isRunning = false;
    private watchInterval: NodeJS.Timeout | null = null;

    // --- 성능 최적화를 위한 재사용 버퍼 (Pooling) ---
    private bmiBuffer = Buffer.alloc(40); // BITMAPINFOHEADER 고정 크기
    private pixelBuffer: Buffer | null = null;
    private currentBufferSize = 0;

    constructor() {
        super();
        this.setupIPC();
        this.initBMIBuffer();
    }

    private initBMIBuffer() {
        this.bmiBuffer.writeUInt32LE(40, 0); // biSize
        this.bmiBuffer.writeUInt16LE(1, 12); // biPlanes
        this.bmiBuffer.writeUInt16LE(32, 14); // biBitCount
        this.bmiBuffer.writeUInt32LE(win32.BI_RGB, 16); // biCompression
    }

    private setupIPC() {
        ipcMain.on('overlay-ready-for-watcher', (event) => {
            event.sender.send('watcher-toggle', this.isRunning);
        });
    }

    public start() {
        if (this.isRunning) return;
        this.isRunning = true;
        
        log('[ScreenWatcher] Starting');
        
        this.notifyRendererStatus(true);
        wm.setMonitorZoneClickThrough(true);

        // 1초마다 화면 분석 수행
        this.watchInterval = setInterval(() => this.performAnalysis(), 1000);
    }

    public stop() {
        if (!this.isRunning) return;
        this.isRunning = false;
        
        log('[ScreenWatcher] Stopping');
        if (this.watchInterval) {
            clearInterval(this.watchInterval);
            this.watchInterval = null;
        }

        this.notifyRendererStatus(false);
        wm.setMonitorZoneClickThrough(false);
    }

    private performAnalysis() {
        if (!this.isRunning) return;

        const logicalBounds = wm.getMonitorZoneBounds();
        if (!logicalBounds) return;

        // DPI 배율은 시작 시나 해상도 변경 시만 가져와도 되지만, 일단 캐싱 없이 최적화
        const scale = screen.getPrimaryDisplay().scaleFactor;

        const inset = Math.floor(2 * scale); 
        const x = Math.floor(logicalBounds.x * scale) + inset;
        const y = Math.floor(logicalBounds.y * scale) + inset;
        const width = Math.floor(logicalBounds.width * scale) - (inset * 2);
        const height = Math.floor(logicalBounds.height * scale) - (inset * 2);

        if (width <= 0 || height <= 0) return;

        // 픽셀 버퍼 크기가 바뀌었을 때만 새로 할당 (메모리 재사용 핵심)
        const requiredSize = width * height * 4;
        if (!this.pixelBuffer || this.currentBufferSize !== requiredSize) {
            this.pixelBuffer = Buffer.alloc(requiredSize);
            this.currentBufferSize = requiredSize;
            
            // BMI 헤더 정보 업데이트
            this.bmiBuffer.writeInt32LE(width, 4); 
            this.bmiBuffer.writeInt32LE(-height, 8); 
        }

        let hScreenDC = 0n;
        let hMemoryDC = 0n;
        let hBitmap = 0n;
        let hOldBitmap = 0n;

        try {
            hScreenDC = win32.GetDC(0n);
            if (hScreenDC === 0n) return;

            hMemoryDC = win32.CreateCompatibleDC(hScreenDC);
            hBitmap = win32.CreateCompatibleBitmap(hScreenDC, width, height);
            hOldBitmap = win32.SelectObject(hMemoryDC, hBitmap);

            win32.BitBlt(hMemoryDC, 0, 0, width, height, hScreenDC, x, y, win32.SRCCOPY);

            // 미리 만들어둔 bmiBuffer와 pixelBuffer 사용
            const lines = win32.GetDIBits(hMemoryDC, hBitmap, 0, height, this.pixelBuffer, this.bmiBuffer, win32.DIB_RGB_COLORS);

            if (lines > 0) {
                this.analyzePixels(this.pixelBuffer);
            }

        } catch (e) {
            log(`[ScreenWatcher] GDI Error: ${e}`);
        } finally {
            if (hOldBitmap) win32.SelectObject(hMemoryDC, hOldBitmap);
            if (hBitmap) win32.DeleteObject(hBitmap);
            if (hMemoryDC) win32.DeleteDC(hMemoryDC);
            if (hScreenDC) win32.ReleaseDC(0n, hScreenDC);
        }
    }

    private analyzePixels(data: Buffer) {
        const cfg = config.load();
        const threshold = (cfg.dangerThreshold || 10.0) / 100;
        
        const STEP = 4; 
        let matchCount = 0;
        let sampled = 0;

        for (let i = 0; i < data.length; i += 4 * STEP) {
            sampled++;
            const b = data[i];
            const g = data[i + 1];
            const r = data[i + 2];

            // 청보라색 장판 특화 조건
            const isBluishPurple = (b > g * 1.5) && (b > r * 1.2);
            const saturation = Math.max(r, g, b) - Math.min(r, g, b);

            if (isBluishPurple && saturation > 60) {
                matchCount++;
            }
        }

        const density = sampled > 0 ? matchCount / sampled : 0;

        if (density > threshold) {
            this.emit('danger-detected', { density });
        } else {
            this.emit('safe');
        }
    }

    private notifyRendererStatus(enabled: boolean) {
        const monitorZone = wm.getMonitorZoneWindow();
        if (monitorZone && !monitorZone.isDestroyed()) {
            monitorZone.webContents.send('watcher-toggle', enabled);
        }
    }
}

export default new ScreenWatcher();
