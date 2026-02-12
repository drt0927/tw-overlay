# 🎮 TW-Overlay (TalesWeaver Companion Browser)

테일즈위버(TalesWeaver) 플레이어를 위한 **자석형 오버레이 브라우저**입니다. 게임 화면 위에 공략, 유튜브, 커뮤니티 등을 띄워두고 게임과 한 몸처럼 움직이는 편리한 환경을 제공합니다.

![License](https://img.shields.io/badge/license-ISC-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey.svg)
![Version](https://img.shields.io/badge/version-1.0.0-green.svg)

## ✨ 주요 기능

*   **🧲 자석 트래킹 (Magnet Tracking):** 게임 창의 위치와 크기를 실시간으로 감지하여, 게임 창 내부에 오버레이가 항상 따라다닙니다.
*   **📏 자동 경계 제한 (Boundary Clamping):** 오버레이가 게임 화면 밖으로 나가지 않도록 자동으로 위치를 보정합니다.
*   **🌗 다크 모드 & Glassmorphism UI:** 테일즈위버의 분위기와 잘 어울리는 세련된 디자인의 대시보드를 제공합니다.
*   **🔗 통합 대시보드:** 즐겨찾기 관리, 투명도 조절, 홈 URL 설정을 한곳에서 처리할 수 있습니다.
*   **⚡ 성능 최적화:** 게임 성능에 영향을 주지 않도록 CPU 및 메모리 점유율을 최소화했습니다.

## 🚀 설치 및 사용 방법

### 1. 설치하기
[Releases](https://github.com/drt0927/tw-overlay/releases) 페이지에서 최신 버전의 `twOverlay-Setup-1.0.0.exe` 파일을 다운로드하여 설치하세요.

### 2. 실행하기
1. 테일즈위버를 실행합니다.
2. `twOverlay`를 실행합니다.
3. 자동으로 테일즈위버 창을 찾아 우측 상단에 붙습니다.

### 3. 주요 단축키
- **`Ctrl + Shift + T`**: **클릭 투과 모드** 토글 (브라우저 뒤의 게임을 직접 클릭해야 할 때 사용하세요).

## 🛠 기술 스택
- **Engine:** Electron
- **UI:** Tailwind CSS, Lucide Icons
- **Tracking:** PowerShell (Windows API 호출)

## 📄 라이선스
이 프로젝트는 ISC 라이선스를 따릅니다.

---
**Note:** 이 프로그램은 게임의 메모리를 변조하거나 데이터에 접근하지 않는 안전한 오버레이 도구입니다.
