/**
 * 시스템 트레이 관리 모듈
 */
import { app, Tray, Menu, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as wm from './windowManager';
import { log } from './logger';
import { appState } from './constants';

let tray: Tray | null = null;

export function createTray(): Tray {
  let iconPath = path.join(__dirname, '..', 'icons', 'icon.ico');

  // 아이콘 파일이 없는 경우를 대비한 방어 로직
  if (!fs.existsSync(iconPath)) {
    log(`[TRAY] 아이콘 파일을 찾을 수 없음: ${iconPath}`);
  }

  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '앱 종료',
      click: () => {
        appState.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('TW-Overlay');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    const sidebar = wm.getMainWindow();
    if (sidebar) {
      if (sidebar.isMinimized()) sidebar.restore();
      sidebar.show();
      sidebar.focus();
    }
  });

  return tray;
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
