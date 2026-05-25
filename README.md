# 🎮 TW-Overlay (TalesWeaver Companion Browser)

테일즈위버(TalesWeaver) 플레이어를 위한 **지능형 다중 창 오버레이 브라우저**입니다. 게임 화면과 연동되는 자석형 위젯과 독립된 유틸리티 창을 통해 최상의 플레이 환경을 제공합니다.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey.svg)
![Version](https://img.shields.io/badge/version-1.14.0-violet.svg)

## 📸 스크린샷

![App Screenshot](./screenshot/screen1.png)

## 🚀 최신 버전: v1.14.0 (2026.05.25)
이번 업데이트는 **지정 단어 알림 및 10분 대화 히스토리 저장**, **심연의 제2사도 기믹 알림(반사)**, **버프 타이머 HUD 단축키(Ctrl+Shift+B) 추가** 및 **각종 숙제 자동 체크 오류 수정(고대 렐릭의 성소 통합)**이 반영된 Minor 버전입니다.

- **💬 지정 단어 알림 및 10분 대화 히스토리**: 잠수 혹은 사냥 중 나를 부르는 닉네임이나 특정 거래 단어가 포착되면 알림음과 함께 감지 시점 **전후 5분(총 10분)** 간의 대화 내용을 SQLite DB에 기록하여 언제든 복기할 수 있는 기능이 신설되었습니다. (24시간 경과 시 대화는 자동 청소됩니다.)
- **⚔️ 심연의 제2사도 반사 알림**: 제2사도의 반사 대사 감지 시 오버레이 화면 중앙에 붉은색 경고창을 띄우고, 6.5초 후 자동으로 초록색 종료 표출로 전환시켜 피아 구분을 명확히 해줍니다. (설정창에서 사용으로 켜야 작동합니다.)
- **⏱️ 버프 타이머 HUD 단축키 및 리셋 오류 방지**: `Ctrl+Shift+B`를 통해 버프 HUD를 신속히 숨기고 켤 수 있으며, 맵 진입 시 버프 가동 중에 시간이 무한 초기화되던 치명적인 리셋 문제를 수정했습니다.
- **📅 숙제 자동 체크 개선 및 고대 렐릭 성소 통합**:
  - 자동 체크가 불가능하던 오를리 방어전을 완전 수동으로 전환했습니다.
  - 이클립스 (로카고스) 누락분을 수정 및 승계 마이그레이션했습니다.
  - 코어 마스터 및 아페티리아 파서 정규식을 개선했습니다.
  - 고대 렐릭의 성소(신조/키시니크)를 하나의 공유 숙제로 결합하고 관련 전리품 식별 코드를 제거하여 직관화했습니다. (기존 데이터 자동 합산 마이그레이션 포함)

---

## 🌟 주요 기능 카탈로그

TW-Overlay에서 제공하는 모든 기능을 성격별로 분류하였습니다. 각 제목을 클릭하면 상세 가이드 페이지로 이동합니다.

### 📊 실시간 게임 데이터 분석
- **[실시간 경험치 HUD](./docs/experience-hud.md)**: 실시간 획득 경험치, EPM, 사냥 리듬 차트 및 정수 기댓값 표시
- **[실시간 로그 엔진](./docs/realtime-log-engine.md)**: 채팅 로그 실시간 추적을 통한 자동 일지 기록 및 득템 알림
- **[지능형 버프 타이머](./docs/intelligent-buff-timer.md)**: 핵심 버프(심장류, 퇴마사)를 감지하여 뱃지 형태로 남은 시간을 보여줍니다.

### 🛡 보안 및 사기 방지
- **[사기꾼 탐지 AI (BETA)](./docs/scam-detector.md)**: 1:1 메신저 대화를 Gemma 4 E2B 로컬 LLM으로 실시간 분석하여 사기 패턴 감지 및 경보

### 🔔 알림 및 실시간 모니터링
- **[외치기 히스토리](./docs/shout-history.md)**: 실시간 외치기 수집 및 검색, 닉네임 원클릭 복사
- **[필드보스 알림 설정](./docs/boss-settings.md)**: 주요 보스 출현 시간 관리 및 알림 수신 설정
- **[사용자 지정 알림 설정](./docs/custom-alert.md)**: 특정 아이템 획득이나 이벤트 발생 시 사운드 및 오버레이 경보 시스템
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
- **[오버레이 브라우저](./docs/overlay.md)**: 게임 화면 위에 고정되어 통과 및 클릭 제어가 가능한 오버레이 위젯 창
- **[환경 설정](./docs/settings.md)**: 앱 버전 관리, 단축키, 사운드, 최적화 등 전반적인 설정

## 🚀 시작하기

### 설치 방법
[Releases](https://github.com/drt0927/tw-overlay/releases) 페이지에서 최신 버전의 `twOverlay-Setup-1.14.0.exe` 파일을 다운로드하여 실행하세요.

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