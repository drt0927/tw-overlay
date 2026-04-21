# TalesWeaver Companion Browser (TW-Overlay) 프로젝트 가이드 (v1.11.1)

이 문서는 v1.11.1 버전을 기준으로 작성되었습니다.
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

### 1. 실시간 채팅 로그 분석 엔진 (v1.11.1 고도화)
- **Log Streaming:** `tail` 모듈을 사용하여 테일즈위버의 채팅 로그 파일(`ChatLog`)을 실시간으로 추적합니다. 
- **Date State Management:** (v1.11.1) 로그 파일 헤더의 `Date :` 정보를 읽어 파서 내부의 날짜 상태를 관리합니다. 자정 롤오버 시에도 새 파일의 헤더를 즉시 스캔하여 정확한 날짜에 기록이 남도록 보장합니다.
- **Multi-Event Parser:** 정규표현식을 통해 경험치, 아이템 획득, SEED 수익, 외치기 이벤트를 발생시킵니다. (v1.11.1) 대괄호`[]` 금액 패턴 및 "만/억" 단위 파싱 로직이 강화되었습니다.

### 2. 게임 오버레이 및 경험치 HUD
- **HUD (Heads-Up Display):** 게임 화면 위에 투명하게 레이어링된 `game-overlay.html`을 통해 실시간 획득 경험치와 **분당 경험치(EPM)**를 표시합니다.
- **Dynamic Positioning:** 환경 설정에서 HUD 위치를 픽셀 단위로 조정하고 '위치 즉시 적용' 기능을 사용할 수 있습니다.

### 3. 지능형 약어 사전 (v1.11.1 대규모 업데이트)
- **Data Expansion:** 공식 홈페이지와 커뮤니티(매직위버) 데이터를 통합하여 160개 이상의 방대한 용어를 수록했습니다.
- **Modern UI/UX:** Blue 시그니처 테마를 적용하고 정보 계층을 명확히 한 리디자인된 UI를 제공합니다.
- **Smart Filtering:** 카테고리 필터와 실시간 검색을 통해 필요한 정보를 즉시 찾을 수 있습니다.

### 4. 업데이트 히스토리 (v1.11.1 패치)
- **개선:** 약어 사전 데이터 확충 및 UI/UX 리디자인.
- **수정:** 채팅 로그 분석 시 자정 이후 날짜가 갱신되지 않던 버그 수정.
- **개선:** 모험 일지 수익 기록 시 상세 로그 메시지 보존 로직 추가.
- **정제:** 전체 데이터의 띄어쓰기 및 문장 부호 가독성 교정.

---
최종 수정일: 2026-04-21
작성자: Gemini CLI Agent
버전: v1.11.1
