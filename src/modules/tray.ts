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

  // 사이드바 메뉴 데이터를 읽어와 트레이 메뉴 구성
  let menuTemplate: any[] = [];
  try {
    const menusPath = path.join(__dirname, '..', 'assets', 'data', 'sidebar_menus.json');
    if (fs.existsSync(menusPath)) {
      const menus = JSON.parse(fs.readFileSync(menusPath, 'utf8'));
      
      const apiMapping: Record<string, () => void> = {
        'openGallery': wm.toggleGalleryWindow,
        'toggleTrade': wm.toggleTradeWindow,
        'toggleAbbreviation': wm.toggleAbbreviationWindow,
        'toggleBuffs': wm.toggleBuffsWindow,
        'toggleCoefficientCalculator': wm.toggleCoefficientCalculatorWindow,
        'toggleBossSettings': wm.toggleBossSettingsWindow,
        'toggleEtaRanking': wm.toggleEtaRankingWindow,
        'toggleContentsChecker': wm.toggleContentsCheckerWindow,
        'toggleEvolutionCalculator': wm.toggleEvolutionCalculatorWindow,
        'toggleMagicStoneCalculator': wm.toggleMagicStoneCalculatorWindow,
        'toggleDiary': wm.toggleDiaryWindow,
        'toggleOverlay': wm.toggleOverlay,
        'toggleClickThrough': wm.toggleClickThrough
      };

      menus.forEach((m: any) => {
        // 시스템 버튼(isSystem: true)은 트레이 메뉴에서 제외
        if (m.isSystem) return;

        const apiKey = m.api || m.action;
        if (apiKey && apiMapping[apiKey]) {
          menuTemplate.push({
            label: m.label,
            click: () => apiMapping[apiKey]()
          });
        }
      });

      if (menuTemplate.length > 0) {
        menuTemplate.push({ type: 'separator' });
      }
    }
  } catch (e) {
    log(`[TRAY] 메뉴 데이터 로드 실패: ${e}`);
  }

  // 기본 메뉴 추가 (설정, 종료)
  menuTemplate.push({
    label: '설정',
    click: () => wm.toggleSettingsWindow()
  });
  menuTemplate.push({
    label: '앱 종료',
    click: () => {
      appState.isQuitting = true;
      app.quit();
    }
  });

  const contextMenu = Menu.buildFromTemplate(menuTemplate);

  tray.setToolTip('TW-Overlay');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    // 게임이 실행 중이고 추적 중일 때만 사이드바 노출
    if (!wm.getGameRect()) return;

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
