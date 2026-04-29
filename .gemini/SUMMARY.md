# TalesWeaver Companion Browser (TW-Overlay) 프로젝트 가이드 (v1.12.0)

이 문서는 v1.12.0 버전을 기준으로 작성되었습니다.

## 1. 개요 및 최종 상태
- **목적:** 테일즈위버 전용 지능형 오버레이 브라우저 및 실시간 게임 데이터 시각화 분석기.
- **최종 빌드:** **TypeScript**, Electron, **Chart.js**, **tail**, **SQLite**, **llama-server(llama.cpp)** 기반.
- **최신 고도화:** Gemma 4 E2B 로컬 LLM 기반 1:1 채팅 실시간 사기꾼 탐지 기능 추가 (BETA).

## 2. 주요 기능 명세
- **[Real-time Log Engine](./docs/realtime-log-engine.md):** 테일즈위버 채팅 로그를 실시간 분석하여 경험치, 아이템, 외치기 이벤트를 추출 및 시각화.
- **Adventure Log Statistics:** `amount` 컬럼 기반의 고속 통계 쿼리를 사용하여 월간 활동 점수, 수익 추이, 득템 현황을 리포팅.
- **Revenue Visualization:** 한 달간의 수익 흐름을 `Chart.js` 선 그래프로 제공하며, '조/억/만' 단위의 지능형 포맷팅 적용.
- **Auto-Grouping UI:** 공간을 많이 차지하는 자동 수익 기록을 날짜별/시간별로 묶어 접기/펴기(아코디언) 형태로 제공하여 가독성 극대화.
- **Smart Window Tracking:** 멀티 모니터 및 다양한 DPI 환경에서 게임 창 위치를 정확히 추적하고, 해상도에 맞춰 UI 크기를 자동 최적화(Clamping).
- **[XP Visualization HUD](./docs/experience-hud.md):** 최근 30분 사냥 리듬을 표시하고 시간당 기대 정수(100억 XP) 생산량을 실시간 예측.
- **Integer Safety:** 모든 숫자 처리 로직을 `Number` 기반으로 전환하여 21억(32비트) 오버플로 버그 원천 차단.
- **[Buff Timer HUD](./docs/intelligent-buff-timer.md):** 핵심 3종 버프(심장 2종, 퇴마사)를 자동 감지하여 뱃지 및 프로그레스 링으로 남은 시간 시각화.

- **업데이트 히스토리 (v1.12.0)**
- **사기꾼 탐지 AI (BETA):** MsgerLog 폴더 실시간 감시 → Gemma 4 E2B 로컬 LLM 추론 → SCAM/SUSPICIOUS/SAFE 판정 및 시청각 경보. GPU 자동 감지(NVIDIA CUDA/AMD-Intel Vulkan/CPU), 디바운스+60초 배치, LLM 직렬화 큐, 테스트 케이스 5종 내장.

- **업데이트 히스토리 (v1.11.10 패치)**
- **Z-Order 최적화:** `gameOverlayWindow`를 최상단 고정에서 해제하고 통합 윈도우 스택 리스너를 적용하여, 다른 앱 창 위로 불필요하게 노출되는 현상 수정.

- **업데이트 히스토리 (v1.11.9 패치)**
- **경험치 필터링:** XP HUD에 경험치 감소량 무시 토글 추가 (기본값: 무시). 경험치 판매 시 통계가 깎이는 혼동 방지.
- **차트 버그 수정:** 최근 30분 사냥 리듬 차트의 y축 라벨이 중복 스케일링으로 인해 "0만"으로 고정되던 문제 해결.
