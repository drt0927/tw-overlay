/**
 * 스플래시 화면 전용 Preload 스크립트
 * update-status IPC 이벤트를 렌더러로 전달합니다.
 */
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('splashAPI', {
    onUpdateStatus: (callback: (data: any) => void) => {
        ipcRenderer.on('update-status', (_e, data) => callback(data));
    }
});
