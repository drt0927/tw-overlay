# TalesWeaver Companion Browser (TW-Overlay) 프로젝트 가이드 (v1.7.2)

이 문서는 v1.7.2 버전을 기준으로 작성되었습니다.

## 1. 개요 및 최종 상태
- **목적:** 테일즈위버 전용 지능형 오버레이 브라우저 및 게임 동기화 위젯.
- **최종 빌드:** **TypeScript**, Electron, **Native Win32 API(Koffi)** 기반.
- **주요 개선:** Contents Checker 데이터 오류 수정 및 안정성 향상.

## 2. 주요 기능 명세
- **Contents Checker (New):** 테일즈위버의 30여종 기본 숙제와 커스텀 항목을 관리할 수 있는 전용 체크 리스트. 지능형 자동 초기화 및 실시간 백그라운드 갱신 지원.
- **Game Exit Reminder (Enhanced):** 게임 종료 시 미완료된 숙제 목록을 추출하여 리마인더 팝업창에 자동으로 표시.
- **Trade Monitor:** 매직위버 카페의 하이아칸/네냐플 거래 게시판을 실시간으로 감시하여 알림 및 목록 조회 기능을 제공.
- **UI Unification:** 모든 창의 디자인 시스템(Purple & Glass 테마) 통합 및 가독성 최적화.
- **ETA Ranking System:** 테일즈위버 ETA 랭킹 정보를 실시간으로 확인하고 검색할 수 있는 전용 창 제공.
- **Polling Loop Orchestrator:** 메인 프로세스의 루프 로직을 모듈화하여 성능과 가독성을 개선.
- **Native Window Tracker:** Win32 API를 직접 호출하여 창 위치를 추적 (응답 속도 획기적 개선).
- **Fast Ping (Game Optimizer):** 네이글 알고리즘 최적화를 통한 게임 응답 속도 향상 기능.
- **Sidebar Menu Management:** 사용자의 필요에 따라 특정 메뉴를 숨기거나 정렬할 수 있는 커스터마이징 기능.
- **Multi-Tab Settings:** 설정을 8개의 카테고리로 분류하여 직관적인 UI 제공.
- **Field Boss Notifier:** 필드 보스 출현 시간 알림 및 지능형 시간 표시 UI.
- **Buff Manager & Calculator:** 선택한 버프들의 효과를 실시간으로 합산하고 프리셋으로 저장/관리.
- **Performance Booster:** 게임 프로세스(`InphaseNXD`) 감지 시 CPU 우선순위를 '높음'으로 자동 설정.

## 3. 기술 스택 및 구조
- **Language:** TypeScript (Strict Type System).
- **Frontend:** HTML5, Tailwind CSS, Local JS Assets (Lucide, Tailwind).
- **Backend:** Node.js (Main), **Native Win32 API via Koffi** (Tracking & GDI Capture).
- **Communication:** IPC, **SharedArrayBuffer (Worker Threads Zero-copy)**.
- **Update Source:** GitHub Releases API via `electron-updater`.

## 4. 실행 및 배포 가이드
1. **빌드:** `npm run build` (Node 기반 리소스 통합).
2. **배포:** `npm run dist` (GitHub 배포 설정 및 설치본 생성).
3. **워크플로우:** [release_workflow.md](./release_workflow.md) 참고.

- **업데이트 히스토리 (v1.7.2 핵심)**
- **데이터 수정:** Contents Checker의 이클립스 관련 항목들의 중복 ID 오류를 수정하여 각각의 상태가 개별적으로 저장되도록 개선했습니다.

- **업데이트 히스토리 (v1.7.1 핵심)**
- **데이터 수정:** 숙제 체크 리스트 및 일부 내부 컨텐츠 데이터의 오류를 수정.

- **업데이트 히스토리 (v1.7.0 핵심)**
- **신규 기능:** "일일/주간 숙제 체크 리스트" 기능 추가. 실시간 검색, 카테고리 사용자화, 지능형 초기화 지원.
- **기능 개선:** 게임 종료 리마인더에 "미완료 숙제 목록" 표시 기능 추가 및 전체 UI 디자인 고도화.
