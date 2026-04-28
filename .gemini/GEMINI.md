# TalesWeaver Companion Browser (TW-Overlay) 프로젝트 가이드 (v1.11.9)

이 문서는 v1.11.9 버전을 기준으로 작성되었습니다.
 상세한 프로젝트 요약은 [SUMMARY.md](./SUMMARY.md)를 참고하시고, 배포 절차는 [release_workflow.md](./release_workflow.md)를 확인하세요. UI 일관성을 위한 디자인 가이드는 [DESIGN_TOKENS.md](./DESIGN_TOKENS.md)에서 확인하실 수 있습니다.

## 📌 프로젝트 소개
TW-Overlay는 테일즈위버 게임 화면 옆에 자석처럼 붙는 사이드바 위젯과 전용 오버레이 브라우저를 제공하는 도구입니다.

## 🛠 기술 스택
- **Language:** **TypeScript** (TSConfig 기반 컴파일)
- **Runtime:** Node.js / Electron
- **Frontend:** HTML5, Tailwind CSS, Lucide Icons, **Chart.js** (로컬 에셋 번들링)
- **Backend:** Node.js (Main Process), Native Win32 API via Koffi (Window Tracking)
- **Database:** **SQLite (better-sqlite3)** - 로컬 활동 기록 저장용 (v1.11.4 스키마 확장)
- **Log Analysis:** **tail (Node.js)** - 실시간 채팅 로그 스트리밍 분석 엔진
- **Build System:** Node.js 기반 커스텀 리소스 복사 (`scripts/copy-resources.js`)
- **CI/CD:** GitHub Actions (Windows-latest 기반 빌드)

## 📂 주요 폴더 구조
- `src/`: 소스 코드 (TS 소스 및 리소스 원본)
  - `main.ts`: 앱 라이프사이클 및 오케스트레이터
  - `diary.html`: 모험 일지 UI, 활동 점수 및 **월간 수익 그래프** (v1.11.4)
  - `xp-hud.html`: 시각화 차트가 포함된 고도화된 경험치 HUD
  - `game-overlay.html`: 실시간 경험치 위젯 및 오버레이 알림
  - `assets/`: 로컬 라이브러리 및 데이터
  - `modules/`: 기능별 TS 모듈
    - `chatParser.ts`, `chatLogProcessor.ts`: 채팅 로그 분석 핵심 로직
    - `diaryDb.ts`: 데이터베이스 관리 및 **통계 최적화** (v1.11.4)
- `dist/`: 빌드 결과물 (TS 컴파일 JS + 복사된 리소스)

## 💡 핵심 규칙 및 아키텍처

### 1. 데이터베이스 및 통계 엔진 (v1.11.4 고도화)
- **Schema Expansion:** 통계 성능 향상을 위해 `activity_logs` 테이블에 수치 전용 `amount` 컬럼을 도입했습니다. 기존의 문자열 파싱 방식에서 벗어나 SQL 레벨에서 즉시 합산(`SUM`)이 가능합니다.
- **Auto-Migration:** 앱 실행 시 기존 로그 데이터를 자동으로 분석하여 `amount` 컬럼을 채워주는 마이그레이션 로직이 내장되어 있습니다.
- **Grouping UI:** 빈번한 자동 수익 로그(`[자동]`)를 날짜별/연속 시간대별로 묶어서 보여주는 축약 로직을 통해 타임라인 가독성을 확보했습니다.

### 2. 시각화 및 UI 최적화
- **Monthly Revenue Chart:** `diary.html` 내에 `Chart.js`를 추가하여 한 달간의 수익 추이를 선 그래프로 시각화합니다.
- **Window Management:** 멀티 모니터 환경에서 DPI 스케일링 오류를 해결하기 위해 `screenToDipRect` 정밀 변환을 사용하며, 창 높이가 해상도를 초과할 경우 자동으로 클램핑합니다.

### 3. 실시간 채팅 로그 분석 엔진
- **Log Streaming:** `tail` 모듈을 사용하여 실시간 분석을 유지하며, 10초 주기 백그라운드 타이머를 통해 데이터 연속성을 보장합니다.
- **Integer Safety:** 모든 숫자 처리를 `Number` 타입으로 안전하게 처리하여 21억 오버플로 문제를 근본적으로 해결했습니다.

### 4. 업데이트 히스토리

#### v1.11.9 (최신 패치)
- **추가:** XP HUD에 경험치 감소량 무시 토글 기능 추가. 100억 경험치 판매 등 감소 로그가 발생해도 세션 통계에 영향을 주지 않도록 기본 필터링 처리.
- **수정:** XP HUD 사냥 리듬 차트의 y축 라벨이 단위 중복 계산으로 인해 "0만"으로 고정되던 버그 수정.

#### v1.11.8
- **수정:** `physicalGameRect` 도입으로 `applySettings` 호출 시 DIP 이중 변환 방지 → 멀티모니터 환경에서 숙제 체크 시 사이드바 위치/높이가 누적 변형되는 버그 해결.
- **수정:** 사이드바 X 좌표 계산 시 게임 창 전체 rect 대신 엣지(left/right) 물리 좌표 1×1 기준으로 `screenToDipRect` 적용 → 게임 창이 두 모니터에 걸칠 때 사이드바가 게임창 안쪽으로 들어오는 현상 개선.

---
최종 수정일: 2026-04-28
작성자: Gemini CLI Agent
버전: v1.11.9
