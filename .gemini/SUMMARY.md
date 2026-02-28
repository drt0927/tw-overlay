# TalesWeaver Companion Browser (TW-Overlay) 프로젝트 가이드 (v1.6.0)

이 문서는 **매직위버 거래 게시판 모니터** 기능이 추가되고 UI가 통합된 v1.6.0 버전을 기준으로 작성되었습니다.

## 1. 개요 및 최종 상태
- **목적:** 테일즈위버 전용 지능형 오버레이 브라우저 및 게임 동기화 위젯.
- **최종 빌드:** **TypeScript**, Electron, **Native Win32 API(Koffi)** 기반.
- **주요 개선:** 매직위버 거래 게시판 모니터링 모듈 추가, 갤러리/거래 모니터 UI 통합.

## 2. 주요 기능 명세
- **Trade Monitor (New):** 매직위버 카페의 하이아칸/네냐플 거래 게시판을 실시간으로 감시하여 알림 및 목록 조회 기능을 제공.
- **UI Unification (New):** 거래 및 갤러리 모니터 창의 디자인, 사이즈(380x600), 설정 바로가기 배너 등을 일관성 있게 통합.
- **ETA Ranking System:** 테일즈위버 ETA 랭킹 정보를 실시간으로 확인하고 검색할 수 있는 전용 창 제공.
- **Polling Loop Orchestrator:** 메인 프로세스의 루프 로직을 모듈화하여 성능과 가독성을 개선.
- **Native Window Tracker:** Win32 API를 직접 호출하여 창 위치를 추적 (응답 속도 획기적 개선).
- **Fast Ping (Game Optimizer):** 네이글 알고리즘 최적화를 통한 게임 응답 속도 향상 기능.
- **Sidebar Menu Management:** 사용자의 필요에 따라 특정 메뉴를 숨기거나 정렬할 수 있는 커스터마이징 기능 (`hiddenMenuIds` 방식).
- **Multi-Tab Settings:** 설정을 8개의 카테고리로 분류하여 직관적인 UI 제공.
- **Field Boss Notifier:** 필드 보스 출현 시간 알림 및 지능형 시간 표시 UI.
- **Buff Manager & Calculator:** 선택한 버프들의 효과를 실시간으로 합산하고 프리셋으로 저장/관리.
- **Smart Z-Order:** 게임 창 활성 상태에 따른 오버레이 레이어 지능형 전환 시스템.
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

## 5. 업데이트 히스토리 (v1.6.0 핵심)
- **신규 기능:** 매직위버 하이아칸/네냐플 거래 게시판 실시간 모니터링 모듈 개발 완료.
- **UI 통합:** 거래소 및 갤러리 모니터 헤더에서 불필요한 아이콘 제거 및 상단 안내 대역(배너) 디자인 일원화.
- **편의성:** 설정 창의 특정 탭으로 바로 이동할 수 있는 단축 경로 IPC 연동.
- **기능 제거:** 게임 보안 정책 변화에 따라 기존의 화면 분석 기반 '장판 감지' 및 '버프 자동 감지' 기능을 완전히 폐쇄하고 관련 코드를 정리.
- **안정성:** 모든 md 파일 및 문서에서 제거된 기능에 대한 설명을 삭제하고 v1.6.0 기준으로 최신화.
