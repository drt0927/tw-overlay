import { globalShortcut } from 'electron';
import * as config from './config';
import * as wm from './windowManager';
import * as tracker from './tracker';
import { FOCUS_DELAY_MS } from './constants';
import { log } from './logger';

let _isFocused = false;

/**
 * 모든 단축키 등록
 */
export function registerAll(): void {
  const cfg = config.load();
  const shortcuts = cfg.shortcuts;
  if (!shortcuts) return;

  // 1. 창 투과 토글
  if (shortcuts.toggleClickThrough) {
    globalShortcut.register(shortcuts.toggleClickThrough, () => {
      log('[SHORTCUT] Toggle Click-Through');
      const isClickThrough = wm.toggleClickThrough();
      if (isClickThrough) {
        // 투과 활성화 시 게임창에 포커스 주어 조작 편의성 제공
        setTimeout(() => {
          tracker.focusGameWindow();
        }, FOCUS_DELAY_MS);
      }
    });
  }

  log('[SHORTCUT] All shortcuts registered');
}

/**
 * 모든 단축키 해제
 */
export function unregisterAll(): void {
  globalShortcut.unregisterAll();
  log('[SHORTCUT] All shortcuts unregistered');
}

/**
 * 포커스 상태 업데이트에 따른 단축키 동적 제어
 * @param isFocused 게임 창 또는 앱 창이 포커스되었는지 여부
 */
export function updateFocusState(isFocused: boolean): void {
  // 풀스크린 모드 중에는 fullscreen 단축키(Alt+Shift+F, Alt+Shift+O)를 보호하기 위해
  // unregisterAll을 실행하지 않는다. fullscreen 종료 시 setFullscreenMode(false)가
  // 해당 단축키를 직접 해제하므로 shortcutManager가 개입할 필요 없음.
  if (wm.isFullscreenMode()) return;
  if (_isFocused === isFocused) return;
  _isFocused = isFocused;

  if (_isFocused) {
    unregisterAll(); // 안전을 위해 기존 단축키 제거 후 재등록
    registerAll();
  } else {
    unregisterAll();
  }
}

/**
 * 설정 변경 시 단축키 갱신 (설정 페이지에서 호출 예정)
 */
export function reloadShortcuts(): void {
  if (wm.isFullscreenMode()) return;
  if (_isFocused) {
    unregisterAll();
    registerAll();
  }
}
