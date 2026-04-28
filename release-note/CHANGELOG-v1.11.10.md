# 📦 TW-Overlay Release Note (v1.11.10)

## 📅 릴리즈 날짜: 2026-04-28

이번 업데이트는 오버레이 윈도우들의 계층 관리(Z-Order)를 최적화하여, 특정 상황에서 오버레이 창이 다른 애플리케이션 창을 가리거나 레이어 순서가 꼬이는 문제를 해결하는 데 집중했습니다.

### 🛠 Fixed (버그 수정)
- **Z-Order 관리 로직 개선**: `gameOverlayWindow`(실시간 경험치/알림 오버레이)가 `alwaysOnTop: true` 설정으로 인해 다른 앱(브라우저, 탐색기 등) 위로 항상 노출되던 문제를 수정했습니다.
- **윈도우 스택 리스너 통합**: 이제 `gameOverlayWindow`도 앱의 공통 윈도우 스택 관리 로직에 포함되어, 사이드바나 다른 도구 창들과 함께 테일즈위버 게임 화면 바로 위 레이어에서 자연스럽게 정렬됩니다.

### ⚙️ Technical Changes (기술적 변경 사항)
- `src/modules/windowManager.ts`:
  - `gameOverlayWindow` 생성 옵션에서 `alwaysOnTop`을 `false`로 변경.
  - `attachStackListeners(gameOverlayWindow)`를 추가하여 스택 관리 자동화.
  - `getAllWindowHwnds()`에서 `gameOverlayWindow`를 포함하도록 필터링 조건 수정.
