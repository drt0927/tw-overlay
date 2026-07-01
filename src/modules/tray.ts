/**
 * 시스템 트레이 관리 모듈
 */
import { app, Tray, Menu, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as wm from './windowManager';
import * as config from './config';
import { log } from './logger';
import { appState } from './constants';

let tray: Tray | null = null;

function buildMenuTemplate(): any[] {
  let menuTemplate: any[] = [];
  try {
    const menusPath = path.join(__dirname, '..', 'assets', 'data', 'sidebar_menus.json');
    if (fs.existsSync(menusPath)) {
      const menus = JSON.parse(fs.readFileSync(menusPath, 'utf8'));
      
      const cfg = config.load();
      let hiddenMenuIds = cfg.hiddenMenuIds;
      if (!hiddenMenuIds && cfg.visibleMenuIds) {
        const oldKnownMenuIds = ['gallery-btn', 'abbreviation-btn', 'buffs-btn', 'boss-btn', 'custom-alert-btn', 'eta-ranking-btn', 'trade-btn', 'contents-checker-btn', 'home-btn', 'overlay-toggle-btn', 'click-through-btn'];
        hiddenMenuIds = oldKnownMenuIds.filter(id => !cfg.visibleMenuIds!.includes(id));
      } else if (!hiddenMenuIds) {
        hiddenMenuIds = [];
      }

       const apiMapping: Record<string, () => void> = {
        'openGallery': wm.toggleGalleryWindow,
        'toggleTrade': wm.toggleTradeWindow,
        'toggleShoutHistory': wm.toggleShoutHistoryWindow,
        'toggleWordAlarm': wm.toggleWordAlarmWindow,
        'toggleDiscordAlarm': wm.toggleDiscordAlarmWindow,
        'toggleAbbreviation': wm.toggleAbbreviationWindow,
        'toggleEquipmentDic': wm.toggleEquipmentDicWindow,
        'toggleBuffs': wm.toggleBuffsWindow,
        'toggleCoefficientCalculator': wm.toggleCoefficientCalculatorWindow,
        'toggleBossSettings': wm.toggleBossSettingsWindow,
        'toggleCustomAlert': wm.toggleCustomAlertWindow,
        'toggleBuffTimer': wm.toggleBuffTimerWindow,
        'toggleXpHud': wm.toggleXpHudWindow,
        'toggleEtaRanking': wm.toggleEtaRankingWindow,
        'toggleContentsChecker': wm.toggleContentsCheckerWindow,
        'toggleEvolutionCalculator': wm.toggleEvolutionCalculatorWindow,
        'toggleMagicStoneCalculator': wm.toggleMagicStoneCalculatorWindow,
        'toggleDiary': wm.toggleDiaryWindow,
        'toggleUniformColor': wm.toggleUniformColorWindow,
        'toggleScamDetector': wm.toggleScamDetectorWindow,
        'toggleSienaAura': wm.toggleSienaAuraWindow,
        'toggleHuntingPathSimulator': wm.toggleHuntingPathSimulatorWindow,
        'toggleOverlay': wm.toggleOverlay,
        'toggleClickThrough': wm.toggleClickThrough,
        'toggleChatOverlay': wm.toggleChatOverlayWindow,
        'toggleWelcomeGuide': wm.toggleWelcomeGuideWindow
      };

      // 1. 카테고리 정의
      const CATEGORIES = [
        { id: 'monitoring', label: '실시간 모니터링' },
        { id: 'alarms', label: '알림 설정' },
        { id: 'calculators', label: '전문 계산기' },
        { id: 'information', label: '정보 & 도감' },
        { id: 'utilities', label: '편의 유틸리티' },
        { id: 'homework', label: '숙제 체크' },
        { id: 'records', label: '플레이 기록' }
      ];

      // 2. 카테고리별 서브메뉴 빌드
      CATEGORIES.forEach(cat => {
        const catMenus = menus.filter((m: any) => m.category === cat.id && !m.isSystem && !m.isComment);

        if (cat.id === 'homework') {
          catMenus.forEach((m: any) => {
            if (hiddenMenuIds.includes(m.id)) return;

            const apiKey = m.api || m.action;
            if (apiKey && apiMapping[apiKey]) {
              menuTemplate.push({
                label: m.label,
                click: () => apiMapping[apiKey]()
              });
            }
          });
          return;
        }

        const subItems: any[] = [];

        catMenus.forEach((m: any) => {
          if (hiddenMenuIds.includes(m.id)) return;

          const apiKey = m.api || m.action;
          if (apiKey && apiMapping[apiKey]) {
            subItems.push({
              label: m.label,
              click: () => apiMapping[apiKey]()
            });
          }
        });

        if (subItems.length > 0) {
          menuTemplate.push({
            label: cat.label,
            submenu: Menu.buildFromTemplate(subItems)
          });
        }
      });

      // 3. 시스템 관련 독립 제어 메뉴 추가
      const systemMenus = menus.filter((m: any) => m.isSystem);
      if (systemMenus.length > 0) {
        menuTemplate.push({ type: 'separator' });
        systemMenus.forEach((m: any) => {
          if (hiddenMenuIds.includes(m.id)) return;

          const apiKey = m.api || m.action;
          if (apiKey && apiMapping[apiKey]) {
            menuTemplate.push({
              label: m.label,
              click: () => apiMapping[apiKey]()
            });
          }
        });
      }

      if (menuTemplate.length > 0) {
        menuTemplate.push({ type: 'separator' });
      }
    }
  } catch (e) {
    log(`[TRAY] 메뉴 데이터 로드 실패: ${e}`);
  }

  // 4. 기본 관리 메뉴 추가 (설정, 종료)
  menuTemplate.push({
    label: '환경 설정',
    click: () => wm.toggleSettingsWindow()
  });
  menuTemplate.push({
    label: '앱 종료',
    click: () => {
      appState.isQuitting = true;
      app.quit();
    }
  });

  return menuTemplate;
}

export function createTray(): Tray {
  let iconPath = path.join(__dirname, '..', 'icons', 'icon.ico');

  // 아이콘 파일이 없는 경우를 대비한 방어 로직
  if (!fs.existsSync(iconPath)) {
    log(`[TRAY] 아이콘 파일을 찾을 수 없음: ${iconPath}`);
  }

  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate(buildMenuTemplate());

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

export function updateTrayMenu(): void {
  if (!tray) return;
  const contextMenu = Menu.buildFromTemplate(buildMenuTemplate());
  tray.setContextMenu(contextMenu);
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
