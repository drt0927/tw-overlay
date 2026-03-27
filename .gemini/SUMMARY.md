# TalesWeaver Companion Browser (TW-Overlay) 프로젝트 가이드 (v1.9.0)

이 문서는 v1.9.0 버전을 기준으로 작성되었습니다.

## 1. 개요 및 최종 상태
- **목적:** 테일즈위버 전용 지능형 오버레이 브라우저 및 게임 동기화 위젯.
- **최종 빌드:** **TypeScript**, Electron, **Native Win32 API(Koffi)** 기반.
- **주요 개선:** 커스텀 알림 시스템 도입 및 GA4 분석 시스템 표준화.

## 2. 주요 기능 명세
- **Evolution Material Cost Calculator (New):** 장비 및 무기 진화에 필요한 소모 재료의 단가를 입력하여 총 시드 및 엘소 비용을 한 눈에 시뮬레이션 할 수 있는 전용 계산 창 추가.
- **Custom Alerts (New):** 매일 특정 시각 또는 매시 특정 분에 울리는 반복 알림을 설정하고 관리할 수 있는 전용 시스템 추가 (`custom-alert.html`).
- **GA4 Analytics (Enhanced):** v1.9.0에서 이벤트를 1-depth로 평탄화하고 표준 세션 파라미터를 도입하여 분석의 정확도와 편의성을 대폭 개선. 수동 하트비트 로직을 제거하여 성능 최적화.
- **Contents Checker (Enhanced):** 테일즈위버의 30여종 기본 숙제와 커스텀 항목을 관리할 수 있는 전용 체크 리스트. 드래그 앤 드롭 순서 변경, 하이브리드 섹션 뷰, 지능형 자동 초기화 및 실시간 백그라운드 갱신 지원.
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

- **업데이트 히스토리 (v1.9.0 핵심)**
- **신규 기능: 커스텀 알림 (Custom Alerts)** 기능 추가 및 편집 기능 구현.
- **분석 개편:** GA4 이벤트 구조 평탄화 및 표준 세션 시스템 적용.
- **UI 최적화:** 필드 보스 설정의 전역 옵션을 전용 설정 패널(`boss-settings.html`)로 통합.
- **버그 수정:** DEV 모드 스플래시 화면 잔류 오류 수정.

- **업데이트 히스토리 (v1.8.1 핵심)**
- **기능 추가:** 장비 진화 계산기에 손목(방패), 손목(보조/브레이슬릿) 데이터가 추가되었습니다.
- **분석 강화:** 앱 사용 지속 시간을 추정하기 위한 Heartbeat(Ping) 핑 기능이 도입되었습니다. (v1.9.0에서 표준 방식으로 대체)

- **업데이트 히스토리 (v1.8.0 핵심)**
- **신규 기능:** 진화 장비(엔키라, 인퍼널, 아퀼루스, 어비스, 이클립스 등) 재료비 통합 계산기 추가. (시드/엘소 결제 분리 옵션 포함)
- **개선 사항:** 앱 내 활용도 측정을 위한 GA4 트래킹 시스템 통합. 창 최소화 너비 등 최적화 적용 반영.

- **업데이트 히스토리 (v1.7.4 핵심)**
- **기능 개선:** 필드 보스 알림 UI를 간소화하고 위치를 사이드바 오버레이 버튼 옆으로 재조정. 환경설정에서의 보스 알림 미리보기 시 해당 보스의 이름이 노출되도록 개선했습니다.

- **업데이트 히스토리 (v1.7.3 핵심)**
- **기능 개선:** Contents Checker에 드래그 앤 드롭 순서 변경 기능을 추가하고, 조회 모드에서 미완료/완료 섹션을 분리하여 가독성을 높였습니다.

- **업데이트 히스토리 (v1.7.2 핵심)**
- **데이터 수정:** Contents Checker의 이클립스 관련 항목들의 중복 ID 오류를 수정하여 각각의 상태가 개별적으로 저장되도록 개선했습니다.

- **업데이트 히스토리 (v1.7.1 핵심)**
- **데이터 수정:** 숙제 체크 리스트 및 일부 내부 컨텐츠 데이터의 오류를 수정.

- **업데이트 히스토리 (v1.7.0 핵심)**
- **신규 기능:** "일일/주간 숙제 체크 리스트" 기능 추가. 실시간 검색, 카테고리 사용자화, 지능형 초기화 지원.
- **기능 개선:** 게임 종료 리마인더에 "미완료 숙제 목록" 표시 기능 추가 및 전체 UI 디자인 고도화.
