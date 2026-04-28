# 📦 TW-Overlay Release Note [v1.11.8]

v1.11.8 패치는 멀티모니터 DPI 환경에서 발생하는 두 가지 사이드바 위치 버그를 수정했습니다.

## 🐞 Fixed (버그 수정)

- **이중 DIP 변환 버그 수정 (숙제 체크 시 사이드바 위치/높이 누적 변형)**:
  - 숙제 체크리스트 체크/해제 시 `applySettings` → `syncOverlay` 재호출 경로에서 이미 DIP로 변환된 `gameRect`를 다시 `screenToDipRect`로 변환하여 좌표값이 `1/scaleFactor`씩 누적 축소되던 문제를 수정했습니다.
  - Win32 물리 좌표를 `physicalGameRect`에 별도 저장하고, `applySettings`에서 `syncOverlay` 재호출 시 이 물리 좌표를 사용하도록 변경하여 이중 변환을 원천 차단합니다.

- **사이드바 엣지 정렬 개선 (게임창이 두 모니터에 걸칠 때 안쪽 침범)**:
  - 게임 창이 서로 다른 DPI의 두 모니터에 걸쳐 있을 때, 게임 창 전체 rect 중심 기준으로 모니터를 감지하여 사이드바가 붙는 엣지의 DPI가 잘못 계산되던 문제를 개선했습니다.
  - 사이드바가 붙는 쪽(왼쪽/오른쪽) 물리 좌표 1×1 픽셀 rect를 기준으로 `screenToDipRect`를 호출하여 해당 엣지가 속한 모니터의 DPI가 정확히 적용되도록 수정했습니다.

---
**drt0927** / TW-Overlay Developer
---
