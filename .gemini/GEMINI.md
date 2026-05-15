# TalesWeaver Companion Browser (TW-Overlay) 프로젝트 가이드 (v1.12.7)

이 문서는 v1.12.7 버전을 기준으로 작성되었습니다.
 상세한 프로젝트 요약은 [release_note/](./release-note/) 폴더를 참고하시고, 배포 절차는 [release_workflow.md](./release_workflow.md)를 확인하세요. UI 일관성을 위한 디자인 가이드는 [DESIGN_TOKENS.md](./DESIGN_TOKENS.md)에서 확인하실 수 있습니다.

## 📌 프로젝트 소개
TW-Overlay는 테일즈위버 게임 화면 옆에 자석처럼 붙는 사이드바 위젯과 전용 오버레이 브라우저를 제공하는 도구입니다.

## 🛠 기술 스택
- **Language:** **TypeScript** (TSConfig 기반 컴파일)
- **Runtime:** Node.js / Electron
- **Frontend:** HTML5, Tailwind CSS, Lucide Icons, **Chart.js** (로컬 에셋 번들링)
- **Backend:** Node.js (Main Process), Native Win32 API via Koffi (Window Tracking)
- **Database:** **SQLite (better-sqlite3)** - 로컬 활동 기록 저장용 (v1.11.4 스키마 확장)
- **Log Analysis:** **tail (Node.js)** - 실시간 채팅 로그 스트리밍 분석 엔진
- **LLM Inference:** **llama-server (llama.cpp)** - Gemma 4 E2B GGUF 로컬 추론 (v1.12.0)
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
- **Grouping UI:** 빈번한 자동 수익 로그(`[자동]`)를 날짜별/연속 시간대별로 묶어서 보여주는 축약 로직을 통해 타임라인 가독성을 확보했습니다. (v1.12.6: 주간 단위 통합 조회 기능 추가)

### 2. 시각화 및 UI 최적화
- **Monthly/Weekly Visualization:** `Chart.js`를 통한 월간 수익 추이뿐만 아니라, v1.12.6부터는 달력의 'W' 셀 클릭 시 **주간 상세 리포트 대시보드**를 제공합니다.
- **Window Management:** 멀티 모니터 환경에서 DPI 스케일링 오류를 해결하기 위해 `screenToDipRect` 정밀 변환을 사용합니다. 게임 종료 또는 최소화 시 사이드바 가시성을 강제 제어하여 오동작을 방지합니다.

### 3. 실시간 채팅 로그 분석 엔진
- **Log Streaming:** `tail` 모듈을 사용하여 실시간 분석을 유지하며, 10초 주기 백그라운드 타이머를 통해 데이터 연속성을 보장합니다.
- **Integer Safety:** 모든 숫자 처리를 `Number` 타입으로 안전하게 처리하여 21억 오버플로 문제를 근본적으로 해결했습니다.

## 4. 업데이트 히스토리

#### v1.12.7 (최신)
- **추가:** 다중 캐릭터 숙제 관리 시스템 — 여러 부캐릭터의 숙제 현황을 Matrix UI로 한 화면에서 관리 (캐릭터별 N/A 처리 지원).
- **수정:** 모험일지 연동 강화 — 숙제 완료 시 캐릭터 태그(`[본캐]`)가 일지 로그에 기록되도록 연동.
- **수정:** 게임 종료 안내 강화 — 모든 캐릭터의 미완료 숙제 목록을 캐릭터 배지와 함께 한눈에 렌더링하도록 개선.
- **최적화:** 내부 데이터 SSOT 통합 — 단일 캐릭터 구조를 제거하고 완료 상태를 `completedState` 객체로 일원화 (자동 마이그레이션 적용).

#### v1.12.6
- **추가:** 모험일지 주간 리포트 기능 — 달력 'W' 셀 클릭 시 해당 주간의 숙제/보스/수익 요약 대시보드 및 상세 타임라인 제공.
- **추가:** 모험일지 통계 탭 주차별 수익 요약 — 이번 달 각 주차별 획득 시드 흐름을 한눈에 파악 가능.

#### v1.12.3
- **추가:** 어벤던로드(Abandoned Road) 실시간 수익 추적기 및 10회 도달 시 화면 플래시/대형 알림 기능 추가. 마정석 가치 계산기와 연동.
- **추가:** 팔색조 언덕(Pitta Hill) 에너지 기반 5회 클리어 추적 및 대형 알림 제공.
- **최적화:** GA4 이벤트 하트비트 및 에러 트래킹 보강.

---
최종 수정일: 2026-05-15
작성자: Gemini CLI Agent
버전: v1.12.7
