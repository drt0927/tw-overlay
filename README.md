# 🎮 TW-Overlay (테일즈위버 오버레이 프로그램)

테일즈위버(TalesWeaver) 플레이어를 위한 **올인원 테일즈위버 오버레이 프로그램**입니다. 
구글에서 많이 검색하시는 테일즈위버 채팅 오버레이, 실시간 경험치 오버레이 HUD, 지능형 버프 타이머 등 게임 화면과 연동되는 자석형 위젯과 다양한 게임 내 편리 도구를 통해 최상의 플레이 환경을 제공합니다.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey.svg)
![Version](https://img.shields.io/badge/version-1.19.0-violet.svg)

## 📸 스크린샷

![App Screenshot](./screenshot/screen1.png)

## 🚀 최신 버전: v1.19.0 (2026.06.26)
이번 업데이트는 **'사냥터 동선 시뮬레이션' 기능의 메인 프로그램 통합 연동 및 관련 데이터베이스 영구 저장 설계**와 **마우스 투과 모드 버그 수정**이 적용되었습니다.

- **🗺️ 사냥터 동선 시뮬레이션 기능 신규 통합**:
  * 기존의 외부 경로 편집기를 지우고, 메인 프로그램에 어울리는 Emerald 디자인의 사냥터 동선 시뮬레이션 창을 이식했습니다.
  * `diary.db` 파일 내에 `hunting_grounds` 및 `hunting_paths` 테이블을 추가하여, 작성한 사냥 동선 좌표가 실시간으로 영구 저장되고 창 재개방 시 즉시 복원되도록 설계했습니다.
  * 맵 위의 불필요한 기본 선 및 파란색 기준점 요소를 완전히 삭제하고 0개 노드까지 제한 없이 마음대로 추가/삭제/이동 편집할 수 있도록 사용성을 대폭 완화했습니다.
- **⚡ 마우스 투과(Click-Through) 상태 복구 버그 수정**:
  * 마우스 투과 상태로 설정한 채 프로그램을 종료 후 재부팅할 때, 초기 구동 시 투과 플래그 불일치 문제로 토글을 두 번 연속 눌러야만 비투과 상태로 정상 복귀하던 현상을 해결했습니다.
  * 트레이(Tray) 우클릭 메뉴에서도 "사냥터 동선 시뮬레이션"을 직접 열고 닫을 수 있도록 메뉴 맵핑을 보강했습니다.

---

## 🌟 주요 기능 카탈로그 (테일즈위버 오버레이 핵심 기능)

테일즈위버 오버레이(TW-Overlay)에서 제공하는 모든 편리 도구를 분류하였습니다. 각 제목을 클릭하면 상세 가이드 페이지로 이동합니다.

### 📊 실시간 게임 데이터 분석
- **[실시간 경험치 HUD](./docs/experience-hud.md)**: 실시간 획득 경험치, EPM, 사냥 리듬 차트 및 정수 기댓값 표시
- **[실시간 로그 엔진](./docs/realtime-log-engine.md)**: 채팅 로그 실시간 추적을 통한 자동 일지 기록 및 득템 알림
- **[지능형 버프 타이머](./docs/intelligent-buff-timer.md)**: 핵심 버프(심장류, 퇴마사)를 감지하여 뱃지 형태로 남은 시간을 보여줍니다.

### 🛡 보안 및 사기 방지
- **[사기꾼 탐지 AI (BETA)](./docs/scam-detector.md)**: 1:1 메신저 대화를 Gemma 4 E2B 로컬 LLM으로 실시간 분석하여 사기 패턴 감지 및 경보

### 🔔 알림 및 실시간 모니터링
- **[지정 단어 알림 설정](./docs/word-alarm.md)**: 특정 키워드 감지 시 사운드 경보 및 전후 10분 대화 DB 기록
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
- **[전투 장비 사전](./docs/equipment-dic.md)**: 전체 무기 및 장비 능력치 한계값 확인 및 대조 비교
- **[게임 용어 사전](./docs/abbreviation.md)**: 테일즈위버에서 통용되는 줄임말 및 용어 검색
- **[버프 정보 도감](./docs/buffs.md)**: 주요 버프의 효과 및 획득처 정보 확인
- **[인게임 채팅 오버레이](./docs/chat-overlay.md)**: 게임 화면 위에 얹히는 투명 채팅창 위젯 및 투과 모드 설정
- **[사이드바 위젯](./docs/index.md)**: 게임 화면에 밀착되는 메인 컨트롤 패널 UI
- **[오버레이 브라우저](./docs/overlay.md)**: 게임 화면 위에 고정되어 통과 및 클릭 제어가 가능한 오버레이 위젯 창
- **[환경 설정](./docs/settings.md)**: 앱 버전 관리, 단축키, 사운드, 최적화 등 전반적인 설정

## 🚀 시작하기 (테일즈위버 오버레이 프로그램 설치 및 다운로드)

### 설치 방법
[Releases](https://github.com/drt0927/tw-overlay/releases) 페이지에서 최신 버전의 `twOverlay-Setup-1.19.0.exe` 파일을 다운로드하여 실행하세요.

### 단축키 및 팁
- **단축키:** 
  - `Ctrl + Shift + T`: 브라우저 클릭 투과 모드 토글 (기본값)
  - `Ctrl + Shift + C`: 숙제 체크리스트 창 열기/닫기 (기본값)
  - `Ctrl + Shift + D`: 하단 독(Dock) 런처 보이기/숨기기 (기본값)
- **관리자 권한:** 게임 네트워크 최적화(Fast Ping) 기능을 활성화하려면 반드시 관리자 권한으로 실행해야 합니다.
- **데이터 관리:** 모든 설정과 일지 기록은 환경 설정의 '데이터 관리' 탭에서 ZIP 파일로 백업할 수 있습니다.

## 🛠 기술 스택 및 라이선스
- **Engine:** Electron (Node.js) / TypeScript
- **Backend:** Native Win32 API (Koffi), SQLite (better-sqlite3)
- **Frontend:** HTML5, Tailwind CSS, Lucide Icons, **Chart.js**
- **License:** MIT License

---
**drt0927** / TW-Overlay Developer