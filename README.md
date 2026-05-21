# 🎮 TW-Overlay (TalesWeaver Companion Browser)

테일즈위버(TalesWeaver) 플레이어를 위한 **지능형 다중 창 오버레이 브라우저**입니다. 게임 화면과 연동되는 자석형 위젯과 독립된 유틸리티 창을 통해 최상의 플레이 환경을 제공합니다.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey.svg)
![Version](https://img.shields.io/badge/version-1.13.3-violet.svg)

## 📸 스크린샷

![App Screenshot](./screenshot/screen1.png)

## 🚀 최신 버전: v1.13.3 (2026.05.21)
이번 업데이트는 **숙제 체크리스트 주간화/횟수제 개편 및 에토스 기믹 알림 가시성 극대화**를 주요 목표로 합니다.

- **📅 숙제 체크리스트 주간화 및 횟수제 UI/UX 개편**: 기존의 일일 숙제 15종이 주간 숙제(매주 월요일 0시 리셋)로 전면 개편되었습니다. 이와 함께 마우스 좌클릭(+1), 우클릭(-1), 그리고 즉시 완료 체크박스를 클릭하여 쉽게 조작할 수 있는 직관적인 횟수 카운터형 컴포넌트(0/7)가 적용되었으며 누락되었던 숙제 3종이 추가되었습니다. 기존 데이터는 첫 구동 시 안전하게 자동 마이그레이션됩니다.
- **✨ 에토스 기믹 알림 UI 간소화 및 홀로그램 디자인**: 화면 상단의 텍스트 안내를 과감히 생략하고 직관적인 방향 화살표 지시자만 노출하도록 개편하였습니다. 기존의 촌스러운 원색을 걷어내고 세련된 반투명 화이트 본체, 예리한 스카이블루 테두리, 그리고 은은한 블루 Glow 펄스 효과의 홀로그램 스타일 80px 화살표를 적용하여 게임 플레이 중 가시성과 인게임 몰입도를 크게 개선했습니다.

---

## 🌟 주요 기능 카탈로그

TW-Overlay에서 제공하는 모든 기능을 성격별로 분류하였습니다. 각 제목을 클릭하면 상세 가이드 페이지로 이동합니다.

### 📊 실시간 게임 데이터 분석
- **[실시간 경험치 HUD](./docs/experience-hud.md)**: 실시간 획득 경험치, EPM, 사냥 리듬 차트 및 정수 기댓값 표시
- **[실시간 로그 엔진](./docs/realtime-log-engine.md)**: 채팅 로그 실시간 추적을 통한 자동 일지 기록 및 득템 알림
- **[지능형 버프 타이머](./docs/intelligent-buff-timer.md)**: 핵심 버프(심장류, 퇴마사)를 감지하여 뱃지 형태로 남은 시간을 보여줍니다.

### 🛡 보안 및 사기 방지
- **사기꾼 탐지 AI (BETA)**: 1:1 메신저 대화를 Gemma 4 E2B 로컬 LLM으로 실시간 분석하여 사기 패턴 감지 및 경보

### 🔔 알림 및 실시간 모니터링
- **[외치기 히스토리](./docs/shout-history.md)**: 실시간 외치기 수집 및 검색, 닉네임 원클릭 복사
- **[필드보스 알림 설정](./docs/boss-settings.md)**: 주요 보스 출현 시간 관리 및 알림 수신 설정
- **[갤러리 모니터](./docs/gallery.md)**: 커뮤니티 최신글 실시간 감시 및 키워드 알림
- **[매직위버 거래 게시판](./docs/trade.md)**: 서버별 거래 게시물 모니터링 및 매물 알림
- **[ETA 랭킹](./docs/eta-ranking.md)**: 실시간 에타 랭킹 조회

### 🧮 전문 계산기 및 시뮬레이터
- **[시에나의 기운 시뮬레이터](./docs/siena-aura.md) (v1.13.1 Hot)**: 증폭, 능력치 재설정, 추가 옵션 시뮬레이션 및 자동 설정 기능
- **[캐릭터 계수 계산기](./docs/coefficient-calculator.md)**: 스탯 투자에 따른 정밀 데미지 상승폭 분석
- **[제복 색상 시뮬레이터](./docs/uniform-color.md)**: 캐릭터 제복 염색 미리보기 (비설화님 twsnowflower 연동)
- **[마정석 가치 계산기](./docs/magic-stone-calculator.md)**: 획득한 마정석 수량별 수익 정산 도구
- **[강화 및 진화 시뮬레이터](./docs/evolution-calculator.md)**: 아이템 강화 확률 및 기댓값 계산

### 📖 활동 기록 및 체크리스트
- **[스마트 모험 일지](./docs/diary.md)**: 활동 점수, **월간 수익 그래프**, 득템 현황 및 자동 기록 축약 리포트
- **[숙제 체크리스트](./docs/contents-checker.md)**: 일일/주간 컨텐츠 수행 여부 관리 및 자동 초기화

### 📚 정보 사전 및 시스템 설정
- **[게임 용어 사전](./docs/abbreviation.md)**: 테일즈위버에서 통용되는 줄임말 및 용어 검색
- **[버프 정보 도감](./docs/buffs.md)**: 주요 버프의 효과 및 획득처 정보 확인
- **[사이드바 위젯](./docs/index.md)**: 게임 화면에 밀착되는 메인 컨트롤 패널 UI
- **[환경 설정](./docs/settings.md)**: 앱 버전 관리, 단축키, 사운드, 최적화 등 전반적인 설정

## 🚀 시작하기

### 설치 방법
[Releases](https://github.com/drt0927/tw-overlay/releases) 페이지에서 최신 버전의 `twOverlay-Setup-1.13.3.exe` 파일을 다운로드하여 실행하세요.

### 단축키 및 팁
- **단축키:** 
  - `Ctrl + Shift + T`: 브라우저 클릭 투과 모드 토글 (기본값)
  - `Ctrl + Shift + C`: 숙제 체크리스트 창 열기/닫기 (기본값)
- **관리자 권한:** 게임 네트워크 최적화(Fast Ping) 기능을 활성화하려면 반드시 관리자 권한으로 실행해야 합니다.
- **데이터 관리:** 모든 설정과 일지 기록은 환경 설정의 '데이터 관리' 탭에서 ZIP 파일로 백업할 수 있습니다.

## 🛠 기술 스택 및 라이선스
- **Engine:** Electron (Node.js) / TypeScript
- **Backend:** Native Win32 API (Koffi), SQLite (better-sqlite3)
- **Frontend:** HTML5, Tailwind CSS, Lucide Icons, **Chart.js**
- **License:** MIT License

---
**drt0927** / TW-Overlay Developer