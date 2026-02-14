# TalesWeaver Companion Browser (TW-Overlay) 최종 프로젝트 가이드

이 문서는 프로젝트 환경을 이전하거나 새로운 개발자가 투입될 때 즉시 작업을 재개할 수 있도록 작성된 종합 정리본입니다.

## 1. 개요 및 최종 상태
- **목적:** 테일즈위버(InphaseNXD.exe) 전용 오버레이 브라우저.
- **최종 빌드:** Electron 기반, 윈도우용 **NSIS 설치형(.exe)** 배포 자동화 완료.
- **UI/UX:** Tailwind CSS 기반의 다크 모드/Glassmorphism 대시보드 디자인.

## 2. 주요 기능 명세
- **Magnet Tracking:** PowerShell(`src/track.ps1`)을 통해 게임 창 위치 실시간 동기화.
- **Boundary Clamping:** 창 이동 시 게임 화면 밖으로 나가지 못하게 강제 보정.
- **Auto Resize:** 게임 창이 오버레이보다 작아지면 자동으로 오버레이 크기 축소.
- **Unified Dashboard:** ☰ 버튼 클릭 시 나타나는 전면 패널에서 즐겨찾기, 설정, 가이드를 통합 제공.
- **Customization:**
    - 홈 URL 설정 기능.
    - 즐겨찾기(Favorites) 동적 추가/삭제 및 메뉴 연동.
    - 투명도 조절 및 클릭 투과 모드 지원 (`Ctrl+Shift+T`).
- **Optimization:** CPU/메모리 점유율을 낮추기 위한 크로미움 하드웨어 가속 및 스로틀링 최적화.

## 3. 핵심 파일 요약
- `src/main.js`: 메인 프로세스. 창 관리, 자석 로직, IPC 통신 및 **빌드 시 스크립트 경로 보정** 로직 포함.
- `src/index.html`: 프론트엔드. Tailwind CSS 기반 반응형 대시보드 UI.
- `src/preload.js`: 보안을 유지하며 렌더러에 Electron API 노출.
- `src/track.ps1`: PowerShell 기반 윈도우 좌표 및 최소화 상태 감지기 (**asarUnpack 설정 필수**).
- `package.json`: 빌드 설정(NSIS, asarUnpack) 및 의존성 관리.
- `.github/workflows/build.yml`: GitHub Actions를 이용한 **자동 빌드 및 Release** 설정.

## 4. 환경 재구축 및 실행 가이드 (새 폴더 기준)

1. **의존성 설치:**
   ```powershell
   npm install
   ```

2. **개발 모드 실행:** (개발자 도구 포함)
   ```powershell
   npm run dev
   ```

3. **배포용 빌드 (로컬):**
   ```powershell
   npm run dist
   ```

## 5. 배포 및 자동화 (CI/CD)
- **GitHub Actions:** `v*` 형태의 태그를 푸시하면 자동으로 빌드가 시작되고 GitHub Release에 업로드됩니다.
- **권한 설정:** 워크플로우에 `contents: write` 권한이 설정되어 있어 자동으로 Release 생성이 가능합니다.
- **실행 파일:** NSIS 설치형으로 빌드되어 기존 포터블 방식보다 실행 속도가 현저히 빠릅니다.

## 6. 빌드 관련 주요 해결 사항
- **PowerShell 경로 문제:** 빌드 후 `.asar` 내부의 스크립트를 외부 프로세스(PowerShell)가 실행할 수 없는 문제를 `asarUnpack`과 `app.isPackaged` 경로 치환 로직으로 해결.
- **실행 속도 최적화:** 포터블(`.portable`) 방식의 압축 해제 지연 시간을 없애기 위해 설치형(`.nsis`) 방식으로 전환.
- **CI/CD 환경 대응:** GitHub Actions 빌드 시 `package-lock.json` 누락으로 인한 캐시 에러 해결.

## 7. 개발 히스토리
- **Phase 1~8:** 초기 기능 및 대시보드 UI 구현.
- **Phase 9:** 빌드 설정 및 PowerShell 경로 문제 해결.
- **Phase 10:** NSIS 전환 및 GitHub Actions 배포 자동화 완성 (v1.0.0).
- **Phase 11:** v1.0.1 - 버전 업데이트 및 문서 최적화 (2026-02-12).
- **Phase 12:** v1.0.2 - 성능 최적화 (PowerShell 상주 모드, I/O 디바운스, 로그 관리) (2026-02-12).
- **Phase 13:** v1.0.3 - 클릭 투과 모드 포커스 전환 개선, 게임 종료 시 오버레이 자동 종료 (2026-02-14).
