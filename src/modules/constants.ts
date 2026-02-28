/**
 * 앱 전역 상수 정의
 */
import { app } from 'electron';
import * as path from 'path';

// 타입은 shared/types.ts에서 통합 관리 (preload.ts와 공유)
export { QuickSlotItem, WatchedPost, WindowPosition, GameRect, GameNotRunning, GameError, GameQueryResult, BossSetting, AppConfig, GalleryPost, GalleryActivity, UpdateStatusInfo, TradePost, TradeActivity } from '../shared/types';
import type { AppConfig } from '../shared/types';

// 테일즈위버 실제 프로세스 명 (확장자 제외)
export const GAME_PROCESS_NAME = 'InphaseNXD';
export const IS_DEV = process.argv.includes('--dev');
export const MIN_W = 400;
export const MIN_H = 300;
export const LOG_MAX_SIZE = 1 * 1024 * 1024; // 1MB
export const SAVE_DEBOUNCE_MS = 300;
export const POLLING_FAST_MS = 100;
export const POLLING_STABLE_MS = 1000;
export const POLLING_MINIMIZED_MS = 2000;
export const POLLING_IDLE_MS = 3000;
export const STABLE_THRESHOLD_COUNT = 10;
export const SIDEBAR_HEIGHT = 800;
export const SIDEBAR_WIDTH = 200;
export const OVERLAY_TOOLBAR_HEIGHT = 40;

// --- 매직 넘버 상수화 ---
/** 창 좌표가 이 값 이하이면 최소화 상태로 판정 */
export const WINDOW_MINIMIZED_THRESHOLD = -10000;
/** 윈도우 이벤트 처리 디바운스 시간(ms) */
export const EVENT_DEBOUNCE_MS = 16;
/** 위치 변경 감지 임계값(px) — 이 값 이하의 차이는 무시 */
export const POSITION_THRESHOLD = 2;
/** 마우스 투과 전환 후 게임 포커스까지 지연시간(ms) */
export const FOCUS_DELAY_MS = 50;
/** GetWindowTextW 호출용 타이틀 버퍼 길이 */
export const TITLE_BUFFER_LENGTH = 256;

export const get_CONFIG_PATH = () => path.join(app.getPath('userData'), 'config.json');
export const get_LOG_PATH = () => path.join(app.getPath('userData'), 'debug.log');

/** 리소스 경로 유틸리티 (dist 폴더 기준) */
export const get_RESOURCE_PATH = (...paths: string[]) => {
  return path.join(app.getAppPath(), 'dist', ...paths);
};

export const DEFAULT_CONFIG: AppConfig = {
  width: 800, height: 600, opacity: 1.0,
  url: 'https://www.youtube.com',
  homeUrl: 'https://www.youtube.com',
  overlayVisible: false,
  quickSlots: [
    {
      label: "테일즈 가이드 요약",
      icon: "BookOpenCheck",
      url: "https://gall.dcinside.com/mini/board/view/?id=talesweaver&no=209726",
      external: true,
      iconType: "icon"
    }
  ],
  autoUpdateEnabled: true,
  fieldBossNotifyEnabled: true,
  fieldBossNotifyOffsets: [5],
  fieldBossNotifyVolume: 50,
  fieldBossSettings: {
    '골론': { name: '골론', enabled: true, soundFile: 'uaaaaa.webm' },
    '파멸의 기원': { name: '파멸의 기원', enabled: true, soundFile: 'uaaaaa.webm' },
    '스페르첸드': { name: '스페르첸드', enabled: true, soundFile: 'uaaaaa.webm' },
    '골모답': { name: '골모답', enabled: true, soundFile: 'uaaaaa.webm' },
    '아칸': { name: '아칸', enabled: true, soundFile: 'uaaaaa.webm' },
  },
  positions: {
    overlay: { offsetX: 10, offsetY: 10 },
    settings: { offsetX: -1010, offsetY: 40 },
    gallery: { offsetX: -320, offsetY: 40 },
    abbreviation: { offsetX: -320, offsetY: 40 },
    buffs: { offsetX: -1000, offsetY: 40 },
    bossSettings: { offsetX: -320, offsetY: 40 },
    etaRanking: { offsetX: -380, offsetY: 40 },
    trade: { offsetX: -380, offsetY: 40 }
  },
  tradeServer: 'RyXp',
  tradeKeywords: [],
  tradeNotify: true
};

/** 앱 전역 공유 상태 (any 캐스팅 대체) */
export const appState = { isQuitting: false };
