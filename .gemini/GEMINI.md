# 🚀 TW-Overlay 개발 가이드

이 문서는 **TW-Overlay (TalesWeaver Companion Browser)** 프로젝트의 내부 구조와 개발 프로세스를 안내합니다. 상세한 프로젝트 요약은 [SUMMARY.md](./SUMMARY.md)를 참고하시고, 배포 절차는 [release_workflow.md](./release_workflow.md)를 확인하세요. UI 일관성을 위한 디자인 가이드는 [DESIGN_TOKENS.md](./DESIGN_TOKENS.md)에서 확인하실 수 있습니다.

## 📌 프로젝트 소개
TW-Overlay는 테일즈위버 게임 화면 옆에 자석처럼 붙는 사이드바 위젯과 전용 오버레이 브라우저를 제공하는 도구입니다.

## 🛠 기술 스택
- **Language:** **TypeScript** (TSConfig 기반 컴파일)
- **Runtime:** Node.js / Electron
- **Frontend:** HTML5, Tailwind CSS, Lucide Icons (로컬 에셋 번들링)
- **Backend:** Node.js (Main Process), Native Win32 API via Koffi (Window Tracking)
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
- **성능 최적화 (Zero-copy):** `SharedArrayBuffer`를 도입하여 메인 스레드와 워커 스레드 간의 픽셀 데이터 복사 오버헤드를 완전히 제거하고 GC 부하를 최소화했습니다.
- **메모리 풀링:** 매 주기마다 발생하는 버퍼 할당을 제거하고 재사용 가능한 버퍼 구조를 도입하여 효율적인 자원 관리를 수행합니다.
- **스플래시 화면:** 앱 초기화(Native 라이브러리 로드 등) 동안 사용자에게 즉각적인 피드백을 제공합니다.

### 3. 자동 업데이트 시스템
- `electron-updater`를 통합하여 GitHub Releases 기반의 업데이트를 지원합니다.
- 환경설정 내 '앱 정보' 메뉴에서 업데이트 확인, 다운로드, 설치를 사용자가 직접 제어할 수 있는 통합 UI를 제공합니다.

### 4. 독립 창 시스템 (Registry Architecture)
- **WindowManager Registry:** 모든 독립 창 정보를 `windowRegistry` 객체로 통합 관리하여 코드 중복(DRY)을 제거하고 확장성을 확보했습니다.
- **Lifecycle Hooks:** 창의 생성(`onOpen`) 및 소멸(`onClose`) 시점에 연동 로직을 실행할 수 있는 유연한 구조를 제공합니다.
- **오버레이 창 (Overlay Window)**: 항상 열려 있는 것이 아니며, 사용자의 필요에 따라 동적으로 생성/파괴(Destroy)됩니다.
- **지능형 Z-Order 관리**: 게임 창 활성화 여부에 따라 오버레이의 레이어 순위를 동적으로 조정하여 게임 위 고정과 일반 작업 방해 금지를 동시에 실현합니다.

### 5. 필드 보스 알림 시스템 (Field Boss Notifier)
- **정밀 동기화**: 매분 00초 정각에 시스템 시계와 동기화하여 알림을 체크하는 재귀적 스케줄링 로직을 사용합니다.
- **다중 오프셋 지원**: 사용자 설정에 따라 '정각', '1분 전', '5분 전', '10분 전' 등 여러 시점의 알림을 동시에 처리할 수 있도록 설계되었습니다.

### 6. 메인 폴링 루프 (Polling Loop Orchestrator)
- **모듈화**: 기존 `main.ts`에 산재해 있던 창 추적, 게임 감지, Z-Order 관리 등의 주기적 로직을 `pollingLoop.ts`로 통합 관리합니다.
- **상태 관리**: 전역 싱글톤 패턴을 사용하여 루프의 실행/중지 상태를 안전하게 제어하며, 리소스 낭비를 최소화합니다.

### 7. ETA 랭킹 조회 시스템 (ETA Ranking)
- **실시간 조회**: 외부 API를 통해 테일즈위버 ETA 랭킹 데이터를 실시간으로 가져와 사용자에게 제공합니다.
- **검색 및 필터링**: 캐릭터명이나 특정 조건으로 랭킹 내 데이터를 빠르게 검색할 수 있는 고성능 UI를 구현했습니다.

## 🚀 배포 프로세스
1. **Push 전 사용자 확인**: 원격 저장소로 `push`하기 전 반드시 사용자에게 최종 승인을 받습니다.
2. `main` 브랜치에 코드를 푸시합니다.
3. `package.json` 버전을 업데이트합니다.
4. [release_workflow.md](./release_workflow.md)의 체크리스트를 따라 배포를 진행합니다.
   ```bash
   git tag v1.6.0
   git push origin v1.6.0
   ```

---
최종 수정일: 2026-02-28
작성자: Gemini CLI Agent
