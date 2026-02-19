# 🚀 TW-Overlay 개발 가이드 (v1.0.7)

이 문서는 **TW-Overlay (TalesWeaver Companion Browser)** 프로젝트의 내부 구조와 개발 프로세스를 안내합니다. 상세한 프로젝트 요약은 [SUMMARY.md](./SUMMARY.md)를 참고하시고, 배포 절차는 [release_workflow.md](./release_workflow.md)를 확인하세요.

## 📌 프로젝트 소개
TW-Overlay는 테일즈위버 게임 화면 옆에 자석처럼 붙는 사이드바 위젯과 전용 오버레이 브라우저를 제공하는 도구입니다. 1.0.7 버전부터는 **강력한 자동 업데이트 시스템**과 **성능 최적화된 로딩 프로세스**를 제공합니다.

## 🛠 기술 스택
- **Language:** **TypeScript** (TSConfig 기반 컴파일)
- **Runtime:** Node.js / Electron
- **Frontend:** HTML5, Tailwind CSS, Lucide Icons (로컬 에셋 번들링)
- **Backend:** Node.js (Main Process), PowerShell (Window Tracking)
- **Build System:** Node.js 기반 커스텀 리소스 복사 (`scripts/copy-resources.js`)
- **CI/CD:** GitHub Actions (Windows-latest 기반 빌드)

## 📂 주요 폴더 구조
- `src/`: 소스 코드 (TS 소스 및 리소스 원본)
  - `main.ts`: 앱 라이프사이클 및 오케스트레이터
  - `splash.html`: 앱 구동 초기 스플래시 화면
  - `assets/`: 로컬 라이브러리 (tailwind, lucide 등)
  - `modules/`: 기능별 TS 모듈 (windowManager, updater, tracker 등)
- `scripts/`: 빌드 및 유틸리티 스크립트
  - `copy-resources.js`: 플랫폼 독립적인 리소스 복사 로직
- `dist/`: 빌드 결과물 (TS 컴파일 JS + 복사된 리소스)

## 💡 핵심 규칙 및 아키텍처

### 1. 빌드 프로세스 (Modernized)
- 모든 소스 수정 후에는 `npm run build`를 실행합니다.
- `tsc` 컴파일 후 `node scripts/copy-resources.js`가 실행되어 HTML, CSS, PS1, Assets 파일을 `dist/` 폴더로 통합합니다.
- 윈도우 전용 PowerShell 명령어를 제거하여 빌드 환경의 범용성을 확보했습니다.

### 2. 성능 최적화 (Perceived Performance)
- **로컬 에셋:** 외부 CDN 의존성을 제거하고 Tailwind, Lucide 등을 `src/assets`에 내장하여 창 로딩 속도를 극대화했습니다.
- **스플래시 화면:** 앱 초기화(PowerShell 구동 등) 동안 사용자에게 즉각적인 피드백을 제공합니다.
- **지능형 초기화:** 트래커가 준비되는 즉시 스플래시를 닫고 사이드바를 노출하는 이벤트 기반 로직을 사용합니다.

### 3. 자동 업데이트 시스템
- `electron-updater`를 통합하여 GitHub Releases 기반의 업데이트를 지원합니다.
- 환경설정 내 '앱 정보' 메뉴에서 업데이트 확인, 다운로드, 설치를 사용자가 직접 제어할 수 있는 통합 UI를 제공합니다.

### 4. 독립 창 시스템
모든 보조 창은 독립된 인스턴스로 관리되며, 사용하지 않을 때 파괴(Destroy)하여 메모리를 확보합니다.

## 🚀 배포 프로세스
1. `main` 브랜치에 코드를 푸시합니다.
2. `package.json` 버전을 업데이트합니다.
3. [release_workflow.md](./release_workflow.md)의 체크리스트를 따라 배포를 진행합니다.
   ```bash
   git tag v1.0.7
   git push origin v1.0.7
   ```

---
최종 수정일: 2026-02-19
작성자: Gemini CLI Agent
