# TalesWeaver Companion Browser (TW-Overlay) 프로젝트 가이드 (v1.11.0)

이 문서는 v1.11.0 버전을 기준으로 작성되었습니다.
 상세한 프로젝트 요약은 [SUMMARY.md](./SUMMARY.md)를 참고하시고, 배포 절차는 [release_workflow.md](./release_workflow.md)를 확인하세요. UI 일관성을 위한 디자인 가이드는 [DESIGN_TOKENS.md](./DESIGN_TOKENS.md)에서 확인하실 수 있습니다.

## 📌 프로젝트 소개
TW-Overlay는 테일즈위버 게임 화면 옆에 자석처럼 붙는 사이드바 위젯과 전용 오버레이 브라우저를 제공하는 도구입니다.

## 🛠 기술 스택
- **Language:** **TypeScript** (TSConfig 기반 컴파일)
- **Runtime:** Node.js / Electron
- **Frontend:** HTML5, Tailwind CSS, Lucide Icons (로컬 에셋 번들링)
- **Backend:** Node.js (Main Process), Native Win32 API via Koffi (Window Tracking)
- **Database:** **SQLite (better-sqlite3)** - 로컬 활동 기록 저장용
- **Log Analysis:** **tail (Node.js)** - 실시간 채팅 로그 스트리밍 분석 엔진
- **Build System:** Node.js 기반 커스텀 리소스 복사 (`scripts/copy-resources.js`)
- **CI/CD:** GitHub Actions (Windows-latest 기반 빌드)

## 📂 주요 폴더 구조
- `src/`: 소스 코드 (TS 소스 및 리소스 원본)
  - `main.ts`: 앱 라이프사이클 및 오케스트레이터
  - `diary.html`: 모험 일지 UI 및 활동 점수 시스템
  - `shout-history.html`: 외치기 히스토리 뷰어 (v1.11.0 추가)
  - `game-overlay.html`: 실시간 경험치 HUD 및 오버레이 알림 (v1.11.0 강화)
  - `assets/`: 로컬 라이브러리 및 데이터
  - `modules/`: 기능별 TS 모듈
    - `chatParser.ts`, `chatLogProcessor.ts`: 채팅 로그 분석 핵심 로직
    - `diaryDb.ts`, `backupManager.ts`, `windowManager.ts` 등
- `dist/`: 빌드 결과물 (TS 컴파일 JS + 복사된 리소스)

## 💡 핵심 규칙 및 아키텍처

### 1. 실시간 채팅 로그 분석 엔진 (v1.11.0 도입)
- **Log Streaming:** `tail` 모듈을 사용하여 테일즈위버의 채팅 로그 파일(`ChatLog`)을 실시간으로 추적합니다. 파일이 커져도 메모리 점유율을 낮게 유지하며, 자정 롤오버(파일 교체) 시에도 자동으로 새 파일을 감지합니다.
- **Multi-Event Parser:** 감지된 로그를 정규표현식 및 키워드 기반으로 분석하여 경험치(XP), 아이템 획득(Loot), SEED 수익, 외치기(Shout) 등 다양한 이벤트를 발생시킵니다.
- **Data Synergy:** 분석된 데이터는 실시간 HUD(경험치), 모험 일지(수익/득템 기록), 외치기 뷰어로 즉시 전달되어 데이터 간 시너지를 창출합니다.

### 2. 게임 오버레이 및 경험치 HUD
- **HUD (Heads-Up Display):** 게임 화면 위에 투명하게 레이어링된 `game-overlay.html`을 통해 실시간 획득 경험치와 **분당 경험치(EPM)**를 표시합니다.
- **Dynamic Positioning:** 사용자가 환경 설정에서 HUD의 위치를 픽셀 단위로 조정할 수 있으며, '위치 즉시 적용' 기능을 통해 게임 실행 중에도 최적의 위치를 잡을 수 있습니다.

### 3. 외치기 히스토리 및 검색
- **Smart Filtering:** 단순 외치기뿐만 아니라 유저가 발송한 외치기만 선별 수집하며, 시스템 메시지를 필터링하여 가독성을 높였습니다.
- **Search & Copy:** Chrome Highlight API를 이용한 정교한 검색을 지원하며, 닉네임 클릭 시 클립보드에 자동 복사되어 게임 내 소통 편의성을 극대화했습니다.

### 4. WebContentsView 기반 외부 서비스 연동
- **독립 레이어 구조:** 오버레이 브라우저와 동일한 `WebContentsView` 방식을 채택하여 외부 웹 서비스(제복 색상 시뮬레이터 등)를 안전하고 깔끔하게 연동합니다.
- **CSS 동적 주입:** `insertCSS`를 사용하여 외부 사이트의 불필요한 영역을 숨기거나 특정 위치로 컨텐츠를 정렬하여 앱 내 도구처럼 자연스럽게 통합합니다.

### 5. 업데이트 히스토리 (v1.11.0 핵심)
- **신규 기능:** 실시간 채팅 로그 분석 엔진 도입.
- **신규 기능:** 실시간 경험치 HUD (총 경험치, 분당 경험치) 추가.
- **신규 기능:** 외치기 히스토리 뷰어 및 검색/복사 기능 추가.
- **데이터 연동:** 채팅 로그 기반 모험 일지 자동 기록 (SEED 수익, 득템 아이템).
- **최적화:** `tail` 기반 로그 스트리밍으로 저사양 환경 배려 및 안정성 확보.

---
최종 수정일: 2026-04-21
작성자: Gemini CLI Agent
버전: v1.11.0
