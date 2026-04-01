# TalesWeaver Companion Browser (TW-Overlay) 프로젝트 가이드 (v1.10.4)

이 문서는 v1.10.4 버전을 기준으로 작성되었습니다.
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
    - `mouse/`: 커스텀 마우스 커서 에셋 (.cur, .ani) 및 매니페스트
  - `modules/`: 기능별 TS 모듈 (diaryDb, backupManager, windowManager 등)
- `dist/`: 빌드 결과물 (TS 컴파일 JS + 복사된 리소스)

## 💡 핵심 규칙 및 아키텍처

### 1. 커스텀 마우스 커서 시스템 (v1.10.4 추가)
- **애니메이션 커서 지원:** Windows Aero 스타일 및 커스텀 애니메이션 커서(`.ani`, `.cur`)를 전역 CSS에 적용했습니다.
- **매니페스트 기반 관리:** `cursor_manifest.json`을 통해 다양한 커서 상태(default, pointer, loading 등)를 구조적으로 관리합니다.

### 2. 모험 일지 시스템 (Adventure Log & SQLite)
- **SQLite 통합:** `better-sqlite3`를 사용하여 사용자의 보스 처치, 숙제 완료, 득템 및 수익 내역을 로컬 DB에 안전하게 저장합니다.
- **활동 트래킹:** 보스 알림 클릭, 숙제 체크, 마정석 계산기 이용 시 자동으로 해당 날짜의 일지에 활동 로그가 생성됩니다.

### 3. 데이터 백업 및 복구 (Backup & Restore)
- **압축 기반 백업:** `adm-zip`을 사용하여 `config.json`과 `diary.db`를 하나의 ZIP 파일로 묶어 백업합니다.
- **안전한 복구:** 복구 시 현재 DB 연결을 안전하게 종료(`closeDb`)한 후 파일을 교체하며, 앱을 자동 재시작하여 환경을 동기화합니다.

### 4. 사운드 피드백 시스템 (v1.10.4 강화)
- **동적 볼륨 제어:** 환경 설정에서 '숙제 완료'와 '일지 기록' 볼륨을 개별 제어할 수 있습니다.
- **상태별 사운드 분기:** 일일 숙제 완료("와우!"), 주간 숙제 완료("Max Affection") 등 유저 경험을 강화하는 사운드 피드백 로직이 적용되었습니다.

### 5. 업데이트 히스토리 (v1.10.4 핵심)
- **커스텀 마우스 커서:** 앱 전체에 테일즈위버 감성을 담은 커스텀 마우스 커서 시스템 도입.
- **사운드 강화:** 일일/주간 숙제 완료 및 보스 일지 기록 시 전용 효과음 추가.
- **UI/UX 개선:** 필드보스 설정 화면 내 가이드 배너 및 상태별 아이콘(칼, 체크 등) 추가.

---
최종 수정일: 2026-04-02
작성자: Gemini CLI Agent
버전: v1.10.4
