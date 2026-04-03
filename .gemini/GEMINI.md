# TalesWeaver Companion Browser (TW-Overlay) 프로젝트 가이드 (v1.10.6)

이 문서는 v1.10.6 버전을 기준으로 작성되었습니다.
 상세한 프로젝트 요약은 [SUMMARY.md](./SUMMARY.md)를 참고하시고, 배포 절차는 [release_workflow.md](./release_workflow.md)를 확인하세요. UI 일관성을 위한 디자인 가이드는 [DESIGN_TOKENS.md](./DESIGN_TOKENS.md)에서 확인하실 수 있습니다.

## 📌 프로젝트 소개
TW-Overlay는 테일즈위버 게임 화면 옆에 자석처럼 붙는 사이드바 위젯과 전용 오버레이 브라우저를 제공하는 도구입니다.

## 🛠 기술 스택
- **Language:** **TypeScript** (TSConfig 기반 컴파일)
- **Runtime:** Node.js / Electron
- **Frontend:** HTML5, Tailwind CSS, Lucide Icons (로컬 에셋 번들링)
- **Backend:** Node.js (Main Process), Native Win32 API via Koffi (Window Tracking)
- **Database:** **SQLite (better-sqlite3)** - 로컬 활동 기록 저장용
- **Build System:** Node.js 기반 커스텀 리소스 복사 (`scripts/copy-resources.js`)
- **CI/CD:** GitHub Actions (Windows-latest 기반 빌드)

## 📂 주요 폴더 구조
- `src/`: 소스 코드 (TS 소스 및 리소스 원본)
  - `main.ts`: 앱 라이프사이클 및 오케스트레이터
  - `diary.html`: 모험 일지 UI 및 활동 점수 시스템
  - `uniform-color.html`: 제복 색상 시뮬레이터 연동 창 (v1.10.6 추가)
  - `assets/`: 로컬 라이브러리 및 데이터 (sidebar_menus.json 등)
    - `mouse/`: 커스텀 마우스 커서 에셋 (.cur, .ani) 및 매니페스트
  - `modules/`: 기능별 TS 모듈 (diaryDb, backupManager, windowManager 등)
- `dist/`: 빌드 결과물 (TS 컴파일 JS + 복사된 리소스)

## 💡 핵심 규칙 및 아키텍처

### 1. WebContentsView 기반 외부 서비스 연동 (v1.10.6 도입)
- **독립 레이어 구조:** 오버레이 브라우저와 동일한 `WebContentsView` 방식을 채택하여 외부 웹 서비스(제복 색상 시뮬레이터 등)를 안전하고 깔끔하게 연동합니다.
- **CSS 동적 주입:** `insertCSS`를 사용하여 외부 사이트의 불필요한 영역을 숨기거나(`overflow: hidden`), 특정 위치로 컨텐츠를 정렬하여 앱 내 도구처럼 자연스럽게 통합합니다.
- **표준 헤더 및 드래그:** 모든 외부 연동 창은 `win-header` 표준을 따르며, 헤더 영역을 통한 자유로운 창 이동을 지원합니다.

### 2. 하이브리드 알림 시스템 (v1.10.5 강화)
- **Windows 네이티브 알림 통합:** 게임 창이 최소화되었거나 종료된 상태에서도 중요한 알림(필드보스, 커스텀 알람)을 놓치지 않도록 Windows Toast 알림 기능을 추가했습니다.
- **상태 기반 지능형 알림:** `pollingLoop`를 통해 게임 상태를 실시간 모니터링하며, 게임 화면이 보이지 않을 때만 네이티브 알림을 발송하여 중복 피로도를 최소화합니다.

### 3. 모험 일지 및 데이터 무결성 (v1.10.5 개선)
- **자동 날짜 선택:** 일지 창을 열 때 번거로운 클릭 없이 오늘의 활동을 바로 기록할 수 있도록 현재 날짜가 자동으로 선택됩니다.
- **DB 레벨 중복 방지:** 사이드바 팝업 등에서 발생할 수 있는 중복 기록 클릭을 DB 유니크 제약 및 사전 체크 로직을 통해 근본적으로 차단합니다. 기록 성공 여부를 UI에 즉각 반영('이미 기록됨!')하여 사용자 신뢰도를 높였습니다.

### 4. 커스텀 마우스 커서 시스템 (v1.10.4 도입)
- **애니메이션 커서 지원:** Windows Aero 스타일 및 커스텀 애니메이션 커서(`.ani`, `.cur`)를 전역 CSS에 적용했습니다.
- **매니페스트 기반 관리:** `cursor_manifest.json`을 통해 다양한 커서 상태(default, pointer, loading 등)를 구조적으로 관리합니다.

### 5. 데이터 백업 및 복구 (Backup & Restore)
- **압축 기반 백업:** `adm-zip`을 사용하여 `config.json`과 `diary.db`를 하나의 ZIP 파일로 묶어 백업합니다.
- **안전한 복구:** 복구 시 현재 DB 연결을 안전하게 종료(`closeDb`)한 후 파일을 교체하며, 앱을 자동 재시작하여 환경을 동기화합니다.

### 6. 업데이트 히스토리 (v1.10.6 핵심)
- **신규 기능:** 제복 색상 시뮬레이터 (비설화님 twsnowflower 연동) 추가.
- **기술 개선:** 외부 연동 창에 `WebContentsView` 아키텍처 적용 및 CSS 주입 최적화.
- **안정성:** 개발자 도구(DevTools) 자동 실행 (Dev 환경 전용) 및 창 드래그 안정성 확보.

---
최종 수정일: 2026-04-04
작성자: Gemini CLI Agent
버전: v1.10.6
