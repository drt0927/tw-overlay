# 📦 TW-Overlay Release Note [v1.11.7]

v1.11.7 패치는 멀티모니터 DPI 오류, 창 Z-order 역전, 리사이즈 시 오래된 게임창 좌표 참조 문제를 근본적으로 수정하여 사이드바 위치 안정성을 개선했습니다.

## 🐞 Fixed (버그 수정)

- **Z-order 역전 버그 수정**:
  - `alwaysOnTop(TOPMOST)` 속성의 게임 오버레이 창이 `promoteWindows` 대상 목록에 포함되어, 일반 창들이 게임 창 뒤로 밀리던 문제를 해결했습니다.
  - `getAllWindowHwnds()`에서 `gameOverlayWindow`를 명시적으로 제외하여 Win32 Z-order가 올바르게 유지됩니다.

- **멀티모니터 DPI 좌표 오류 수정**:
  - `syncOverlay()`에서 `screenToDipRect(null, ...)` 호출 시 주 모니터 DPI가 기준으로 사용되어 보조 모니터에서 창 위치가 어긋나던 문제를 수정했습니다.
  - `null` 대신 `mainWindow`를 전달하여 게임 창이 위치한 모니터의 DPI 스케일이 정확히 적용됩니다.

- **리사이즈 시 stale gameRect 참조 제거**:
  - 사이드바 너비 조절(`isSidebarResize`) 시 마지막으로 저장된 오래된 `gameRect`로 Y/Height를 계산하여 위치가 어긋나던 문제를 수정했습니다.
  - 이제 현재 창 bounds를 기준으로 너비와 X 위치만 조정하며, Y/Height 동기화는 `syncOverlay`에 위임합니다.

## 🧹 Removed (제거)

- **`setMainWindowWidth()` 함수 삭제**:
  - 호출부가 없는 미사용(dead code) 함수를 제거했습니다.

---
**drt0927** / TW-Overlay Developer
---
