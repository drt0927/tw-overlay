# 🚀 TW-Overlay 개발 가이드

이 문서는 **TW-Overlay (TalesWeaver Companion Browser)** 프로젝트의 내부 구조와 개발 프로세스를 안내합니다. 상세한 프로젝트 요약은 [SUMMARY.md](./SUMMARY.md)를 참고하세요.

## 📌 프로젝트 소개
TW-Overlay는 테일즈위버 게임 화면 위에 투명 브라우저를 띄워 게임 플레이 중 유용한 정보(유튜브, 공략 등)를 편리하게 확인할 수 있도록 돕는 도구입니다. 게임 창의 위치를 추적하여 항상 적절한 위치에 배치되는 **자석 기능**이 핵심입니다.

## 🛠 기술 스택
- **Runtime:** Node.js / Electron
- **Frontend:** HTML5, Tailwind CSS, Lucide Icons
- **Backend/Scripting:** Node.js (Electron Main Process), PowerShell (Window Tracking)
- **CI/CD:** GitHub Actions (Electron Builder)

## 📂 주요 폴더 구조
- `src/`: 모든 소스 코드
  - `main.js`: Electron 메인 프로세스 (시스템 제어, 자석 로직)
  - `preload.js`: 보안 브리지 (IPC 통신 정의)
  - `index.html`: 대시보드 및 오버레이 UI
  - `track.ps1`: 게임 창 좌표 추적 파워쉘 스크립트
- `.github/workflows/`: 자동 배포 워크플로우
- `.gemini/`: 프로젝트 문서 및 히스토리

## ⌨️ 개발 시작하기

### 1. 환경 구성
- **Node.js:** v20 이상 권장
- **OS:** Windows (PowerShell 의존성 때문)

### 2. 의존성 설치
```bash
npm install
```

### 3. 개발 모드 실행
```bash
npm run dev
```
*`--dev` 플래그가 전달되어 개발자 도구가 자동으로 열립니다.*

### 4. 빌드 및 패키징
```bash
npm run dist
```
*빌드 결과물은 `dist_electron/` 폴더에 생성됩니다.*

## 💡 주요 아키텍처 및 핵심 로직

### 1. 자석(Magnet) 추적 로직
- `main.js`에서 200ms 간격으로 `track.ps1`을 호출합니다.
- PowerShell 스크립트는 `InphaseNXD` 프로세스의 윈도우 좌표를 가져옵니다.
- `asarUnpack` 설정을 통해 빌드 후에도 외부 프로세스(PS)가 스크립트에 접근할 수 있도록 설계되었습니다.

### 2. 하드 월(Hard Wall) 경계 제한
- 오버레이 창이 게임 화면 밖으로 나가지 않도록 `mainWindow.on('move', ...)` 이벤트에서 실시간 좌표 보정을 수행합니다.

### 3. 성능 최적화
- CPU 점유율을 낮추기 위해 `disable-background-timer-throttling` 등 다양한 크로미움 플래그가 적용되어 있습니다.
- 게임 창의 위치 변화가 없을 때는 불필요한 DOM 업데이트나 좌표 재계산을 건너뜁니다.

## 🚀 배포 프로세스
1. `main` 브랜치에 코드를 푸시하여 정합성을 확인합니다.
2. 버전을 업데이트합니다 (`package.json`).
3. 버전 태그를 생성하고 푸시합니다.
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
4. GitHub Actions가 자동으로 빌드를 시작하고 **Releases** 페이지에 설치 파일을 업로드합니다.

---
최종 수정일: 2026-02-12
작성자: Gemini CLI Agent
