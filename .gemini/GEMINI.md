# 🚀 TW-Overlay 개발 가이드

이 문서는 **TW-Overlay (TalesWeaver Companion Browser)** 프로젝트의 내부 구조와 개발 프로세스를 안내합니다. 상세한 프로젝트 요약은 [SUMMARY.md](./SUMMARY.md)를 참고하시고, 배포 절차는 [release_workflow.md](./release_workflow.md)를 확인하세요. UI 일관성을 위한 디자인 가이드는 [DESIGN_TOKENS.md](./DESIGN_TOKENS.md)에서 확인하실 수 있습니다.

## 📌 프로젝트 소개
TW-Overlay는 테일즈위버 게임 화면 옆에 자석처럼 붙는 사이드바 위젯과 전용 오버레이 브라우저를 제공하는 도구입니다.

## 🛠 기술 스택
- **Language:** **TypeScript** (TSConfig 기반 컴파일)
- **Runtime:** Node.js / Electron
- **Frontend:** HTML5, Tailwind CSS, Lucide Icons (로컬 에셋 번들링)
- **Backend:** Node.js (Main Process), Native Win32 API via Koffi (Window Tracking), GDI (Screen Capture)
- **Build System:** Node.js 기반 커스텀 리소스 복사 (`scripts/copy-resources.js`)
- **CI/CD:** GitHub Actions (Windows-latest 기반 빌드)

## 📂 주요 폴더 구조
- `src/`: 소스 코드 (TS 소스 및 리소스 원본)
  - `main.ts`: 앱 라이프사이클 및 오케스트레이터
  - `splash.html`: 앱 구동 초기 스플래시 화면
  - `assets/`: 로컬 라이브러리 (tailwind, lucide 등)
  - `modules/`: 기능별 TS 모듈 (windowManager, updater, tracker, win32 등)
- `scripts/`: 빌드 및 유틸리티 스크립트
  - `copy-resources.js`: 플랫폼 독립적인 리소스 복사 로직
- `dist/`: 빌드 결과물 (TS 컴파일 JS + 복사된 리소스)

## 💡 핵심 규칙 및 아키텍처

### 1. 빌드 프로세스 (Modernized)
- 모든 소스 수정 후에는 `npm run build`를 실행합니다.
- `tsc` 컴파일 후 `node scripts/copy-resources.js`가 실행되어 HTML, CSS, Assets 파일을 `dist/` 폴더로 통합합니다.
- `koffi`를 통한 Native Win32 API 호출 방식을 사용하여 외부 런타임(PowerShell 등) 의존성을 제거했습니다.

### 2. 성능 최적화 (Native & Memory)
- **Native Window Tracking:** `koffi`를 통해 `GetForegroundWindow`, `GetWindowRect` 등 Win32 API를 직접 호출하여 추적 반응성을 극대화했습니다.
- **GDI Screen Capture:** 장판 감시 시 Chromium의 무거운 비디오 스트림 대신 GDI를 사용하여 감시 영역만 정밀하게 캡처하며, CPU 점유율을 획기적으로 낮췄습니다.
- **메모리 풀링:** 매 주기마다 발생하는 버퍼 할당을 제거하고 재사용 가능한 Singleton 버퍼를 도입하여 GC 부하를 최소화했습니다.
- **스플래시 화면:** 앱 초기화(Native 라이브러리 로드 등) 동안 사용자에게 즉각적인 피드백을 제공합니다.

### 3. 자동 업데이트 시스템
- `electron-updater`를 통합하여 GitHub Releases 기반의 업데이트를 지원합니다.
- 환경설정 내 '앱 정보' 메뉴에서 업데이트 확인, 다운로드, 설치를 사용자가 직접 제어할 수 있는 통합 UI를 제공합니다.

### 4. 독립 창 시스템 (Dynamic Lifecycle)
- **오버레이 창 (Overlay Window)**: 항상 열려 있는 것이 아니며, 사용자의 필요에 따라 동적으로 생성/파괴(Destroy)됩니다.
- **지능형 Z-Order 관리**: 게임 창 활성화 여부에 따라 오버레이의 레이어 순위를 동적으로 조정하여 게임 위 고정과 일반 작업 방해 금지를 동시에 실현합니다.
- **감시 영역 창 (Monitor Zone)**: 장판 감시(`ScreenWatcher`) 기능의 핵심 로직(GDI 캡처 기반 픽셀 분석)을 담당합니다.

### 5. 필드 보스 알림 시스템 (Field Boss Notifier)
- **정밀 동기화**: 매분 00초 정각에 시스템 시계와 동기화하여 알림을 체크하는 재귀적 스케줄링 로직을 사용합니다.
- **다중 오프셋 지원**: 사용자 설정에 따라 '정각', '1분 전', '5분 전', '10분 전' 등 여러 시점의 알림을 동시에 처리할 수 있도록 설계되었습니다.

## 🚀 배포 프로세스
1. `main` 브랜치에 코드를 푸시합니다.
2. `package.json` 버전을 업데이트합니다.
3. [release_workflow.md](./release_workflow.md)의 체크리스트를 따라 배포를 진행합니다.
   ```bash
   git tag v1.3.0
   git push origin v1.3.0
   ```

---
최종 수정일: 2026-02-22
작성자: Gemini CLI Agent
