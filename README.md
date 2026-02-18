# 🎮 TW-Overlay (TalesWeaver Companion Browser)

테일즈위버(TalesWeaver) 플레이어를 위한 **지능형 다중 창 오버레이 브라우저**입니다. 게임 화면과 연동되는 자석형 위젯과 독립된 브라우저 창을 통해 최상의 플레이 환경을 제공합니다.

![License](https://img.shields.io/badge/license-ISC-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey.svg)
![Version](https://img.shields.io/badge/version-1.0.5-violet.svg)

## 📸 스크린샷

![App Screenshot](./screenshot/screen1.png)

## ✨ 주요 기능 (v1.0.5 대규모 개편)

*   **🧲 4분할 독립 창 시스템:** 사이드바(메인), 오버레이, 설정, 갤러리 모니터를 각각의 독립된 창으로 분리하여 성능과 편의성을 극대화했습니다.
*   **📐 정밀 자석 트래킹:** 게임 창의 위치를 실시간 감지하여 우측 바깥쪽에 자석처럼 달라붙습니다. 모든 독립 창은 사용자가 지정한 개별 상대 좌표를 완벽하게 기억합니다.
*   **🛠 와이드 설정 대시보드:** 1000px 너비의 시원한 설정 화면에서 퀵슬롯, 키워드 알림, 브라우저 환경을 한눈에 관리할 수 있습니다.
*   **💜 지능형 퀵슬롯:** 1,400여 개의 Lucide 아이콘 라이브러리 전체 검색 및 드래그 앤 드롭 순서 변경 기능을 지원합니다.
*   **🔔 스마트 갤러리 모니터:** 특정 키워드가 포함된 게시글만 골라 알림을 받는 필터링 기능과 실시간 댓글 추적 시스템을 제공합니다.
*   **⚡ 고성능 & 안정성:** **TypeScript** 완전 전환으로 런타임 안정성을 확보했으며, PowerShell 상주 프로세스 최적화를 통해 게임 퍼포먼스 영향을 최소화했습니다.

## 🚀 설치 및 사용 방법

### 1. 설치하기
[Releases](https://github.com/drt0927/tw-overlay/releases) 페이지에서 최신 버전의 `twOverlay-Setup-1.0.5.exe` 파일을 다운로드하여 설치하세요.

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
- **UI:** Tailwind CSS, Lucide Icons
- **Scripting:** PowerShell (Win32 API Tracking)

## 📝 최신 업데이트 내역 (v1.0.5)
- **TypeScript 마이그레이션**: 전 소스 코드 타입 안전성 확보.
- **아키텍처 대개편**: 모든 패널을 독립 윈도우로 분리하여 리소스 관리 최적화.
- **자석 기능 정밀화**: 1.0.4의 안정적인 추적 로직 복구 및 개별 오프셋 저장 시스템 구축.
- **설정 UI 혁신**: 와이드 대시보드 도입, 퀵슬롯 드래그 앤 드롭, 무한 스크롤 아이콘 피커 추가.
- **키워드 알림**: 갤러리 모니터에 사용자 정의 키워드 필터링 기능 추가.

## 📄 라이선스
이 프로젝트는 ISC 라이선스를 따릅니다.

---
**Note:** 이 프로그램은 게임 메모리를 변조하지 않는 안전한 외부 도구입니다.
