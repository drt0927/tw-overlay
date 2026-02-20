import { desktopCapturer, ipcMain } from 'electron';
import { EventEmitter } from 'events';
import * as wm from './windowManager';
import * as config from './config';
import { log } from './logger';
import * as fs from 'fs';
import * as path from 'path';
import { IS_DEV } from './constants';

class ScreenWatcher extends EventEmitter {
    private isRunning = false;
    private cachedSourceId: string | null = null;
    private checkSourceInterval: NodeJS.Timeout | null = null;

    constructor() {
        super();
        this.setupIPC();
    }

    private setupIPC() {
        // 렌더러로부터 감지 결과 수신
        ipcMain.on('renderer-danger-detected', (_e, { density }) => {
            if (this.isRunning) {
                this.emit('danger-detected', { density });
            }
        });

        ipcMain.on('renderer-danger-safe', () => {
            if (this.isRunning) {
                this.emit('safe');
            }
        });

        // 디버그 이미지 저장 (렌더러에서 보냄, IS_DEV가 true일 때만 동작)
        ipcMain.on('save-debug-image', (_e, dataUrl, fileName) => {
            if (!IS_DEV) return;
            
            try {
                const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
                const debugPath = path.join(process.cwd(), fileName || 'debug_capture.png');
                fs.writeFileSync(debugPath, base64Data, 'base64');
                log(`[ScreenWatcher] Debug frame saved to: ${debugPath}`);
            } catch (e) {
                log(`[ScreenWatcher] Debug save error: ${e}`);
            }
        });

        // 렌더러가 준비되었을 때 설정 전달 (모니터 존 창)
        ipcMain.on('overlay-ready-for-watcher', (event) => {
            this.sendSourceToRenderer(event.sender);
        });
    }

    public async start() {
        if (this.isRunning) return;
        this.isRunning = true;
        
        log('[ScreenWatcher] Starting (MonitorZone Renderer-based)');
        
        this.notifyRendererStatus(true);
        
        // 소스 찾기 즉시 실행 및 주기적 실행
        this.findAndSendSource();
        this.checkSourceInterval = setInterval(() => this.findAndSendSource(), 5000);

        wm.setMonitorZoneClickThrough(true);
    }

    public stop() {
        if (!this.isRunning) return;
        this.isRunning = false;
        
        log('[ScreenWatcher] Stopping');
        if (this.checkSourceInterval) {
            clearInterval(this.checkSourceInterval);
            this.checkSourceInterval = null;
        }

        this.notifyRendererStatus(false);
        wm.setMonitorZoneClickThrough(false);
    }

    private async findAndSendSource() {
        if (!this.isRunning) return;

        try {
            const sources = await desktopCapturer.getSources({ types: ['window'] });
            const gameSource = sources.find(s => s.name.toLowerCase().includes('talesweaver'));
            
            if (gameSource) {
                this.cachedSourceId = gameSource.id;
                
                const monitorZone = wm.getMonitorZoneWindow();
                if (monitorZone && !monitorZone.isDestroyed()) {
                    this.sendSourceToRenderer(monitorZone.webContents);
                }
            }
        } catch (e) {
            log(`[ScreenWatcher] Error finding source: ${e}`);
        }
    }

    private sendSourceToRenderer(webContents: any) {
        if (this.cachedSourceId) {
            const cfg = config.load();
            const gameRect = wm.getGameRect();
            const zoneBounds = wm.getMonitorZoneBounds();
            
            // 정보가 부족하더라도 일단 ID는 보냄
            webContents.send('watcher-source-id', {
                sourceId: this.cachedSourceId,
                threshold: (cfg.dangerThreshold || 2.0) / 100,
                gameRect,
                zoneBounds
            });
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
