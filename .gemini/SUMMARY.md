# TalesWeaver Companion Browser (TW-Overlay) 프로젝트 가이드 (v1.0.8)

이 문서는 사운드 알람 기능이 추가된 v1.0.8 버전을 기준으로 작성되었습니다.

## 1. 개요 및 최종 상태
- **목적:** 테일즈위버 전용 지능형 오버레이 브라우저 및 게임 동기화 위젯.
- **최종 빌드:** **TypeScript**, Electron, GitHub Actions 기반 CI/CD.
- **주요 개선:** 구동 속도 최적화, 자동 업데이트 내장, 사운드 알람 시스템.

## 2. 주요 기능 명세
- **Sound Alerts:** 보라색 장판 감지 시 효과음(.webm) 재생 기능을 추가하여 UX를 강화했습니다.
- **Splash Screen:** 앱 시작 시 로고와 로딩 상태를 즉시 노출하여 시스템 초기화 중 대기 시간 보완.
- **Integrated Auto-Updater:** GitHub Releases와 연동된 앱 정보 메뉴를 통해 새 버전 확인, 다운로드, 재시작 설치 지원.
- **Local Asset Performance:** Tailwind, Lucide 등 필수 라이브러리를 내장하여 창 전환 및 로딩 속도 획기적 단축.
- **Modern Build System:** Node.js 기반 `copy-resources.js`를 통해 PowerShell 없이도 간결하고 안정적인 리소스 배포.
- **Magnet Tracking:** 게임 창 좌표를 실시간 추적하여 사이드바와 오버레이를 유동적으로 동기화.

## 3. 기술 스택 및 구조
- **Language:** TypeScript.
- **Frontend:** HTML5, Tailwind CSS, Local JS Assets.
- **Backend:** Node.js (Main), PowerShell (Tracking Service).
- **Update Source:** GitHub Releases API via `electron-updater`.

## 4. 실행 및 배포 가이드
1. **빌드:** `npm run build` (Node 기반 리소스 통합).
2. **배포:** `npm run dist` (GitHub 배포 설정 및 설치본 생성).
3. **워크플로우:** [release_workflow.md](./release_workflow.md) 참고.

## 5. 업데이트 히스토리 (v1.0.8 핵심)
- **알람:** 보라색 장판 감지 시 효과음 재생 기능 추가.
- **성능:** 외부 CDN 제거 및 창 생성 로직 개선으로 로딩 속도 최적화.
- **업데이트:** 환경설정 내 통합 업데이트 UI 구현.
- **안정성:** 부팅 로그 최적화 및 스플래시 화면 도입.
- **빌드:** PowerShell 의존성 제거 및 빌드 자동화 스크립트 고도화.
