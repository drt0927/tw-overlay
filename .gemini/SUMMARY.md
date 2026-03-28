# TalesWeaver Companion Browser (TW-Overlay) 프로젝트 가이드 (v1.10.0)

이 문서는 v1.10.0 버전을 기준으로 작성되었습니다.

## 1. 개요 및 최종 상태
- **목적:** 테일즈위버 전용 지능형 오버레이 브라우저 및 게임 동기화 위젯.
- **최종 빌드:** **TypeScript**, Electron, **Native Win32 API(Koffi)**, **SQLite(better-sqlite3)** 기반.
- **주요 개선:** 모험 일지 시스템 및 데이터 백업 기능 도입.

## 2. 주요 기능 명세
- **Adventure Log (New):** 사용자의 모든 플레이 기록(보스, 숙제, 득템, 수익)을 SQLite DB에 영구 저장하고 달력 형태로 시각화하는 시스템. 플레이 포인트에 따른 성장 아이콘 변화 포함.
- **Data Backup & Restore (New):** 사용자의 소중한 설정과 일지 데이터를 ZIP 파일로 안전하게 백업하고 원클릭으로 복구할 수 있는 기능 추가.
- **Unified Dynamic Theme (New):** `sidebar_menus.json`을 통한 중앙 집중식 메뉴 관리 및 아이콘 색상에 맞춘 서브 윈도우 컬러 테마 자동 적용.
- **Evolution Material Cost Calculator:** 장비 및 무기 진화 재료 시뮬레이터. (v1.10.0에서 라임색 테마로 업데이트)
- **Magic Stone Calculator:** 마정석 수익 계산 및 일지 자동 연동 기능.
- **Contents Checker:** 일일/주간 숙제 관리 시스템. 자동 초기화 및 게임 종료 리마인더 연동.
- **Field Boss Notifier:** 필드 보스 알림 및 처치 여부 일지 기록 연동.
- **Game Optimizer (Fast Ping):** 네이글 알고리즘 최적화를 통한 핑 개선 기능.

## 3. 기술 스택 및 구조
- **Language:** TypeScript (Strict Type System).
- **Database:** SQLite 3 (`better-sqlite3`) - 로컬 데이터 지속성 확보.
- **Frontend:** HTML5, Tailwind CSS, Lucide Icons.
- **Backend:** Node.js (Main), **Native Win32 API via Koffi** (Tracking).
- **Update Source:** GitHub Releases API via `electron-updater`.

## 4. 실행 및 배포 가이드
1. **빌드:** `npm run build` (리소스 복사 스크립트 포함).
2. **배포:** `npm run dist` (GitHub Actions 자동 연동).
3. **워크플로우:** [release_workflow.md](./release_workflow.md) 참고.

- **업데이트 히스토리 (v1.10.0 핵심)**
- **신규 기능:** SQLite 기반 '모험 일지' 추가 및 활동 점수 기반 성장 아이콘 시스템 구현.
- **신규 기능:** '마정석 계산기' 추가 및 일지 수익 자동 기록 연동.
- **신규 기능:** 데이터 백업/복구 (ZIP 압축 방식) 기능 추가.
- **디자인:** 사이드바 아이콘 컬러와 서브 윈도우 테마 컬러 통합.
- **안정성:** 이미 닫힌 창에 대한 접근 보호 로직(`isDestroyed`) 강화로 앱 크래시 방지.
