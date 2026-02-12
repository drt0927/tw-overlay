# TalesWeaver Companion Browser (TW-Overlay) 최종 프로젝트 가이드

이 문서는 프로젝트 환경을 이전하거나 새로운 개발자가 투입될 때 즉시 작업을 재개할 수 있도록 작성된 종합 정리본입니다.

## 1. 개요 및 최종 상태
- **목적:** 테일즈위버(InphaseNXD.exe) 전용 오버레이 브라우저.
- **최종 빌드:** Electron 기반, 윈도우용 포터블(.exe) 배포 준비 완료.
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
- `src/main.js`: 메인 프로세스. 모든 창 관리, 자석 로직, IPC 통신 및 성능 최적화 플래그 포함.
- `src/index.html`: 프론트엔드. Tailwind CSS 기반 반응형 대시보드 UI.
- `src/preload.js`: 보안을 유지하며 렌더러에 Electron API 노출.
- `src/track.ps1`: PowerShell 기반 윈도우 좌표 및 최소화 상태 감지기.
- `config.json`: 사용자의 설정(크기, 위치, 즐겨찾기 등)이 저장되는 파일.

## 4. 환경 재구축 및 실행 가이드 (새 폴더 기준)

1. **의존성 설치:** (인증서 에러 발생 시 환경변수 활용)
   ```powershell
   $env:NODE_TLS_REJECT_UNAUTHORIZED=0
   npm install
   ```

2. **개발 모드 실행:** (개발자 도구 포함)
   ```powershell
   npm run dev
   ```

3. **일반 실행:**
   ```powershell
   npm start
   ```

4. **배포용 빌드 (.exe 생성):**
   ```powershell
   $env:NODE_TLS_REJECT_UNAUTHORIZED=0
   npm run dist
   ```

## 5. 알려진 팁 및 문제 해결
- **DPI Scaling:** 윈도우 화면 배율에 따라 좌표가 어긋날 경우 `main.js`의 `scaleFactor` 보정 로직을 확인하세요.
- **BrowserView Conflict:** 크기 조절 시 유튜브 화면이 마우스 이벤트를 가로채지 않도록 `removeBrowserView` 또는 `lock` 로직을 사용합니다.
- **Icons:** 모든 아이콘은 Lucide Icons 라이브러리를 사용하며 `freshIcons()`를 통해 동적 업데이트됩니다.

## 6. 개발 히스토리
- **Phase 1~6:** 초기 기능 구현 (창 추적, 투명도, 한글화 등).
- **Phase 7:** 설정/메뉴 패널 대시보드 스타일 전면 리뉴얼.
- **Phase 8:** 자동 축소 기능 및 경계선 강제 보정(Hard Wall) 로직 완성.
- **Phase 9:** CPU/메모리 최적화 및 빌드(Packaging) 설정 추가.
