# 🚀 TW-Overlay 개발 가이드 (v1.0.6)

이 문서는 **TW-Overlay (TalesWeaver Companion Browser)** 프로젝트의 내부 구조와 개발 프로세스를 안내합니다. 상세한 프로젝트 요약은 [SUMMARY.md](./SUMMARY.md)를 참고하세요.

## 📌 프로젝트 소개
TW-Overlay는 테일즈위버 게임 화면 옆에 자석처럼 붙는 사이드바 위젯과 전용 오버레이 브라우저를 제공하는 도구입니다. 1.0.6 버전부터는 향상된 안정성의 **TypeScript 기반의 4분할 독립 창 시스템**으로 운영됩니다.

## 🛠 기술 스택
- **Language:** **TypeScript** (TSConfig 기반 컴파일)
- **Runtime:** Node.js / Electron
- **Frontend:** HTML5, Tailwind CSS, Lucide Icons (통합 `style.css` 관리)
- **Backend:** Node.js (Main Process), PowerShell (Window Tracking)
- **CI/CD:** GitHub Actions (Windows-latest 기반 빌드)

## 📂 주요 폴더 구조
- `src/`: 소스 코드 (TS 소스 및 리소스 원본)
  - `main.ts`: 앱 라이프사이클 및 오케스트레이터
  - `preload.ts`: IPC 통신 브릿지 (표준화된 API 정의)
  - `index.html`: 메인 사이드바 (컨트롤러)
  - `overlay.html`: 브라우저 오버레이 창
  - `settings.html`: 와이드 설정 대시보드
  - `gallery.html`: 갤러리 모니터 창
  - `modules/`: 기능별 TS 모듈 (windowManager, tracker, galleryMonitor 등)
  - `track.ps1`: 게임 창 추적 파워쉘 스크립트 (원본 복구 버전)
- `dist/`: 빌드 결과물 (TS 컴파일 JS + 복사된 리소스)
- `backup/`: 1.0.4 버전(JS) 소스 코드 백업 (비교용)

## 💡 핵심 규칙 및 아키텍처

### 1. 빌드 프로세스 (필수)
모든 소스 수정 후에는 반드시 `npm run build`를 실행해야 합니다. 
`tsc` 컴파일과 함께 HTML, CSS, PS1 파일이 `dist/` 폴더로 통합됩니다. 실행은 항상 `dist/main.js`를 기점으로 이루어집니다.

### 2. 자석(Magnet) 추적 로직 (Fixed)
- 가장 안정적이었던 **1.0.4 버전의 좌표 계산 로직**을 유지합니다.
- 사이드바는 게임 창 우측 바깥(`gX + gW`)에 정확히 붙습니다.
- `isProgrammaticMove` 플래그는 `move` 이벤트 핸들러 내부에서 즉시 해제되어야 합니다.

### 3. 독립 창 시스템
모든 보조 창(오버레이, 설정, 갤러리)은 독립된 인스턴스로 관리되며, 사용하지 않을 때 파괴(Destroy)하여 메모리를 확보합니다. 각 창은 게임 창 대비 개별적인 상대 좌표(`positions` 객체)를 가집니다.

### 4. 성능 및 안정성
- PowerShell 상주 프로세스와의 `QUERY` 통신을 통해 CPU 점유율을 최소화합니다.
- `try-catch` 및 에러 경계 로직을 통해 런타임 안정성을 보장합니다.

## 🚀 배포 프로세스
1. `main` 브랜치에 코드를 푸시합니다.
2. `package.json` 버전을 업데이트합니다.
3. 버전 태그를 생성하고 푸시하면 GitHub Actions가 자동으로 빌드를 시작합니다.
   ```bash
   git tag v1.0.6
   git push origin v1.0.6
   ```

---
최종 수정일: 2026-02-19
작성자: Gemini CLI Agent
