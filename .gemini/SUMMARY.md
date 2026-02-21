# TalesWeaver Companion Browser (TW-Overlay) 프로젝트 가이드 (v1.3.0)

이 문서는 **Native Win32 엔진** 도입과 **게임 최적화(Fast Ping)** 기능이 추가된 v1.3.0 버전을 기준으로 작성되었습니다.

## 1. 개요 및 최종 상태
- **목적:** 테일즈위버 전용 지능형 오버레이 브라우저 및 게임 동기화 위젯.
- **최종 빌드:** **TypeScript**, Electron, **Native Win32 API(Koffi)** 기반.
- **주요 개선:** PowerShell 의존성 제거, GDI 직접 캡처 방식의 장판 감시, 사이드바 메뉴 관리 기능 추가.

## 2. 주요 기능 명세
- **Native Window Tracker:** Win32 API를 직접 호출하여 창 위치를 추적 (응답 속도 획기적 개선).
- **Fast Ping (Game Optimizer):** 네이글 알고리즘 최적화를 통한 게임 응답 속도 향상 기능.
- **Sidebar Menu Management:** 사용자가 사이드바에 표시할 메뉴를 직접 선택할 수 있는 커스터마이징 기능.
- **Multi-Tab Settings:** 설정을 8개의 카테고리로 분류하여 직관적인 UI 제공.
- **Field Boss Notifier:** 필드 보스 출현 시간 알림 및 지능형 시간 표시 UI.
- **Buff Manager & Calculator:** 선택한 버프들의 효과를 실시간으로 합산하고 프리셋으로 저장/관리.
- **Smart Z-Order:** 게임 창 활성 상태에 따른 오버레이 레이어 지능형 전환 시스템.
- **Performance Booster:** 게임 프로세스(`InphaseNXD`) 감지 시 CPU 우선순위를 '높음'으로 자동 설정.

## 3. 기술 스택 및 구조
- **Language:** TypeScript.
- **Frontend:** HTML5, Tailwind CSS, Local JS Assets (Lucide, Tailwind).
- **Backend:** Node.js (Main), **Native Win32 API via Koffi** (Tracking & GDI Capture).
- **Update Source:** GitHub Releases API via `electron-updater`.

## 4. 실행 및 배포 가이드
1. **빌드:** `npm run build` (Node 기반 리소스 통합).
2. **배포:** `npm run dist` (GitHub 배포 설정 및 설치본 생성).
3. **워크플로우:** [release_workflow.md](./release_workflow.md) 참고.

## 5. 업데이트 히스토리 (v1.1.0 핵심)
- **신규:** 1000px 대화면 기반의 지능형 버프 매니저 창 추가.
- **프리셋:** 기본 국룰 도핑 세트 및 사용자 정의 프리셋 저장 기능 도입.
- **데이터:** 최신 이벤트 버프 및 등급별 버프(스승의 증표 등) 정밀 데이터화.
- **UX:** 폰트 크기 상향 및 드래그 핸들 가시성 개선으로 고해상도 환경 대응.
