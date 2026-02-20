# TalesWeaver Companion Browser (TW-Overlay) 프로젝트 가이드 (v1.0.9)

이 문서는 성능 강화 및 지능형 리소스 관리가 도입된 v1.0.9 버전을 기준으로 작성되었습니다.

## 1. 개요 및 최종 상태
- **목적:** 테일즈위버 전용 지능형 오버레이 브라우저 및 게임 동기화 위젯.
- **최종 빌드:** **TypeScript**, Electron, GitHub Actions 기반 CI/CD.
- **주요 개선:** CPU 우선순위 자동 조정(Performance Booster), 지능형 폴링(Smart Polling), 리소스 최적화.

## 2. 주요 기능 명세
- **Performance Booster:** 게임 프로세스(`InphaseNXD`) 감지 시 CPU 우선순위를 '높음'으로 설정하여 프레임 안정성 확보.
- **Smart Polling:** 정지 상태 감지 시 트래킹 주기를 늘려(100ms -> 1000ms) 시스템 리소스 최소화.
- **Sound Alerts:** 보라색 장판 감지 시 효과음(.webm) 재생 기능을 추가하여 UX를 강화했습니다.
- **Integrated Auto-Updater:** GitHub Releases와 연동된 앱 정보 메뉴를 통해 새 버전 확인, 다운로드, 재시작 설치 지원.
- **Magnet Tracking:** 게임 창 좌표를 실시간 추적하여 사이드바와 오버레이를 유동적으로 동기화.

## 3. 기술 스택 및 구조
- **Language:** TypeScript.
- **Frontend:** HTML5, Tailwind CSS, Local JS Assets.
- **Backend:** Node.js (Main), PowerShell (Tracking Service & Process Priority).
- **Update Source:** GitHub Releases API via `electron-updater`.

## 4. 실행 및 배포 가이드
1. **빌드:** `npm run build` (Node 기반 리소스 통합).
2. **배포:** `npm run dist` (GitHub 배포 설정 및 설치본 생성).
3. **워크플로우:** [release_workflow.md](./release_workflow.md) 참고.

## 5. 업데이트 히스토리 (v1.0.9 핵심)
- **성능:** 게임 프로세스 CPU 우선순위 자동 조정 기능 추가.
- **효율:** 지능형 폴링 시스템 도입으로 유휴 상태 리소스 소모 최소화.
- **안정성:** 프로세스 감지 로직 고도화 및 갤러리 모니터 알림 버그 수정.
- **정책:** 매크로 방지 정책 지지 안내 및 장판 감지 개발 취지 명시.
