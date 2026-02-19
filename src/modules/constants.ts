/**
 * 앱 전역 상수 정의
 */
import { app } from 'electron';
import * as path from 'path';

export interface QuickSlotItem {
  label: string;
  icon: string;
  url: string;
  external: boolean;
  iconType?: 'icon' | 'text';
  textChar?: string;
}

export interface WatchedPost {
  title: string;
  commentCount: number;
  addedAt: number;
}

export interface WindowPosition {
  offsetX: number;
  offsetY: number;
}

export interface GameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GameNotRunning {
  notRunning: true;
}

export type GameQueryResult = GameRect | GameNotRunning | null | undefined;

export interface AppConfig {
  width: number;
  height: number;
  opacity: number;
  url: string;
  homeUrl: string;
  quickSlots: QuickSlotItem[];
  galleryLastSeen?: number;
  galleryWatched?: Record<string, WatchedPost>;
  galleryNotify?: boolean;
  overlayVisible?: boolean;
  autoLaunch?: boolean;
  autoUpdateEnabled?: boolean;
  galleryKeywords?: string[];
  dangerThreshold?: number;
  dangerSoundEnabled?: boolean;
  dangerSoundVolume?: number;
  positions?: {
    overlay?: WindowPosition;
    settings?: WindowPosition;
    gallery?: WindowPosition;
  };
}

// 테일즈위버 실제 프로세스 명 (확장자 제외)
export const GAME_PROCESS_NAME = 'InphaseNXD';
export const IS_DEV = process.argv.includes('--dev');
export const MIN_W = 400;
export const MIN_H = 300;
export const LOG_MAX_SIZE = 1 * 1024 * 1024; // 1MB
export const SAVE_DEBOUNCE_MS = 300;
export const POLLING_FAST_MS = 100;
export const POLLING_SLOW_MS = 500;
export const POLLING_COOLDOWN = 5;
export const SIDEBAR_HEIGHT = 800;
export const PS_QUERY_TIMEOUT_MS = 3000;
export const PS_RESTART_DELAY_MS = 1000;
export const FOCUS_DELAY_MS = 50;
export const SIDEBAR_WIDTH = 38;
export const OVERLAY_TOOLBAR_HEIGHT = 40;

export const get_CONFIG_PATH = () => path.join(app.getPath('userData'), 'config.json');
export const get_LOG_PATH = () => path.join(app.getPath('userData'), 'debug.log');

export const DEFAULT_CONFIG: AppConfig = {
  width: 800, height: 600, opacity: 1.0,
  url: 'https://www.youtube.com',
  homeUrl: 'https://www.youtube.com',
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
  dangerThreshold: 2.0,
  dangerSoundEnabled: true,
  dangerSoundVolume: 50,
  positions: {
    overlay: { offsetX: 10, offsetY: 10 },
    settings: { offsetX: -1010, offsetY: 40 },
    gallery: { offsetX: -320, offsetY: 40 }
  }
};

/** 앱 전역 공유 상태 (any 캐스팅 대체) */
export const appState = { isQuitting: false };
