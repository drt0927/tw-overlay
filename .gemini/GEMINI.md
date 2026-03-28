# TalesWeaver Companion Browser (TW-Overlay) 프로젝트 가이드 (v1.10.0)

이 문서는 v1.10.0 버전을 기준으로 작성되었습니다.
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
  - `assets/`: 로컬 라이브러리 및 데이터 (sidebar_menus.json 등)
  - `modules/`: 기능별 TS 모듈 (diaryDb, backupManager, windowManager 등)
- `dist/`: 빌드 결과물 (TS 컴파일 JS + 복사된 리소스)

## 💡 핵심 규칙 및 아키텍처

### 1. 모험 일지 시스템 (Adventure Log & SQLite)
- **SQLite 통합:** `better-sqlite3`를 사용하여 사용자의 보스 처치, 숙제 완료, 득템 및 수익 내역을 로컬 DB에 안전하게 저장합니다.
- **활동 트래킹:** 보스 알림 클릭, 숙제 체크, 마정석 계산기 이용 시 자동으로 해당 날짜의 일지에 활동 로그가 생성됩니다.
- **활동 점수 시스템:** 획득한 활동 포인트(보스 처치, 숙제 등)에 따라 캐릭터의 성장 단계를 보여주는 시각적 아이콘 시스템을 제공합니다.

### 2. 데이터 백업 및 복구 (Backup & Restore)
- **압축 기반 백업:** `adm-zip`을 사용하여 `config.json`과 `diary.db`를 하나의 ZIP 파일로 묶어 백업합니다.
- **안전한 복구:** 복구 시 현재 DB 연결을 안전하게 종료(`closeDb`)한 후 파일을 교체하며, 앱을 자동 재시작하여 환경을 동기화합니다.

### 3. 동적 사이드바 및 테마 시스템
- **데이터 중심 관리:** `sidebar_menus.json`을 통해 모든 메뉴의 아이콘, 색상, 실행 명령을 중앙 관리합니다.
- **색상 통일:** 사이드바 아이콘 색상에 맞춰 각 서브 화면의 헤더, 버튼, 포인트 컬러가 자동으로 매칭되는 통합 테마 시스템을 구축했습니다.

### 4. 안정성 및 성능 최적화
- **자원 관리:** `isDestroyed()` 체크 로직을 폴링 루프와 윈도우 매니저에 적용하여, 창을 닫는 과정에서 발생할 수 있는 비정상 종료를 원천 차단했습니다.
- **Native Window Tracking:** `koffi`를 통해 Win32 API를 직접 호출하여 추적 반응성을 극대화했습니다.

### 5. 업데이트 히스토리 (v1.10.0 핵심)
- **신규 기능: 모험 일지 (Adventure Log)** 시스템 추가.
- **신규 기능: 마정석 계산기 (Magic Stone Calculator)** 추가 (수익 자동 일지 연동).
- **신규 기능: 데이터 백업 및 복구** 기능 추가 (환경 설정).
- **UI 개편:** 알록달록한 아이콘 테마 및 서브 화면별 컬러 매칭 시스템 적용.
- **기술 개선:** SQLite 도입 및 전용 DB 관리 모듈(`diaryDb.ts`) 구축.
- **활동 시각화:** 플레이 점수에 따른 성장 아이콘 변화 로직 구현.

---
최종 수정일: 2026-03-29
작성자: Gemini CLI Agent
버전: v1.10.0
