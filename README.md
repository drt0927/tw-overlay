# 🎮 TW-Overlay (TalesWeaver Companion Browser)

테일즈위버(TalesWeaver) 플레이어를 위한 **지능형 다중 창 오버레이 브라우저**입니다. 게임 화면과 연동되는 자석형 위젯과 독립된 브라우저 창을 통해 최상의 플레이 환경을 제공합니다.

![License](https://img.shields.io/badge/license-ISC-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey.svg)
![Version](https://img.shields.io/badge/version-1.0.7-violet.svg)

## 📸 스크린샷

![App Screenshot](./screenshot/screen1.png)

## ✨ 주요 기능 (v1.0.7 최적화 및 업데이트)

*   **⚡ 초고속 로딩:** 외부 CDN 의존성을 완전히 제거하고 라이브러리(Tailwind, Lucide)를 내장하여 창 전환 및 초기 구동 속도를 획기적으로 개선했습니다.
*   **🆙 통합 자동 업데이트:** 이제 앱 내 '환경설정 > 앱 정보' 메뉴에서 새 버전을 확인하고, 다운로드 및 설치를 직접 관리할 수 있습니다.
*   **🎨 브랜드 스플래시 화면:** 앱 구동 초기 초기화 과정을 시각적으로 보여주는 세련된 로딩 화면을 추가했습니다.
*   **🧲 정밀 자석 트래킹:** 게임 창의 위치를 실시간 감지하여 우측 바깥쪽에 자석처럼 달라붙습니다. 모든 독립 창은 사용자가 지정한 개별 상대 좌표를 완벽하게 기억합니다.
*   **🛠 와이드 설정 대시보드:** 1000px 너비의 시원한 설정 화면에서 퀵슬롯, 키워드 알림, 브라우저 환경을 한눈에 관리할 수 있습니다.
*   **🔔 스마트 갤러리 모니터:** 특정 키워드가 포함된 게시글만 골라 알림을 받는 필터링 기능과 실시간 댓글 추적 시스템을 제공합니다.

## 🚀 설치 및 사용 방법

### 1. 설치하기
[Releases](https://github.com/drt0927/tw-overlay/releases) 페이지에서 최신 버전의 `twOverlay-Setup-1.0.7.exe` 파일을 다운로드하여 설치하세요. 기존 사용자는 앱 내 업데이트 기능을 사용할 수 있습니다.

### 2. 실행하기
1. 테일즈위버를 실행합니다.
2. `twOverlay`를 실행하면 자동으로 게임 창 우측에 사이드바가 나타납니다.
3. 사이드바의 **레이아웃 아이콘**을 클릭하여 브라우저 오버레이를 켜거나 끌 수 있습니다.

### 3. 주요 단축키
- **`Ctrl + Shift + T`**: **클릭 투과 모드** 토글 (오버레이 뒤의 게임을 직접 조작할 때 사용).
- **`ESC`**: 설정 창 및 갤러리 모니터 창 즉시 닫기.

## 🛠 기술 스택
- **Language:** TypeScript
- **Engine:** Electron (Multi-Window Architecture)
- **Asset Management:** Localized JS Bundling
- **Build System:** Custom Node.js Resource Orchestrator

## 📝 최신 업데이트 내역 (v1.0.7)
- **성능 최적화:** 로컬 에셋 도입 및 창 생성 로직 개선으로 로딩 지연 해결.
- **업데이트 시스템:** GitHub Releases 기반 자동 업데이트 확인 및 환경설정 내 통합 UI 구현.
- **UX 개선:** 스플래시 화면 추가 및 초기 구동 부하 분산 처리.
- **빌드 시스템 개선:** PowerShell 기반 복사 로직을 Node.js 스크립트로 전면 교체하여 안정성 확보.

## 📄 라이선스
이 프로젝트는 ISC 라이선스를 따릅니다.

---
**Note:** 이 프로그램은 게임 메모리를 변조하지 않는 안전한 외부 도구입니다.
