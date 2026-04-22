# TalesWeaver Companion Browser (TW-Overlay) 프로젝트 가이드 (v1.11.2)

이 문서는 v1.11.2 버전을 기준으로 작성되었습니다.
 상세한 프로젝트 요약은 [SUMMARY.md](./SUMMARY.md)를 참고하시고, 배포 절차는 [release_workflow.md](./release_workflow.md)를 확인하세요. UI 일관성을 위한 디자인 가이드는 [DESIGN_TOKENS.md](./DESIGN_TOKENS.md)에서 확인하실 수 있습니다.

## 📌 프로젝트 소개
TW-Overlay는 테일즈위버 게임 화면 옆에 자석처럼 붙는 사이드바 위젯과 전용 오버레이 브라우저를 제공하는 도구입니다.

## 🛠 기술 스택
- **Language:** **TypeScript** (TSConfig 기반 컴파일)
- **Runtime:** Node.js / Electron
- **Frontend:** HTML5, Tailwind CSS, Lucide Icons, **Chart.js** (로컬 에셋 번들링)
- **Backend:** Node.js (Main Process), Native Win32 API via Koffi (Window Tracking)
- **Database:** **SQLite (better-sqlite3)** - 로컬 활동 기록 저장용
- **Log Analysis:** **tail (Node.js)** - 실시간 채팅 로그 스트리밍 분석 엔진
- **Build System:** Node.js 기반 커스텀 리소스 복사 (`scripts/copy-resources.js`)
- **CI/CD:** GitHub Actions (Windows-latest 기반 빌드)

## 📂 주요 폴더 구조
- `src/`: 소스 코드 (TS 소스 및 리소스 원본)
  - `main.ts`: 앱 라이프사이클 및 오케스트레이터
  - `diary.html`: 모험 일지 UI 및 활동 점수 시스템
  - `xp-hud.html`: 시각화 차트가 포함된 고도화된 경험치 HUD (v1.11.2 강화)
  - `game-overlay.html`: 실시간 경험치 위젯 및 오버레이 알림
  - `assets/`: 로컬 라이브러리 및 데이터
  - `modules/`: 기능별 TS 모듈
    - `chatParser.ts`, `chatLogProcessor.ts`: 채팅 로그 분석 핵심 로직
    - `diaryDb.ts`, `backupManager.ts`, `windowManager.ts` 등
- `dist/`: 빌드 결과물 (TS 컴파일 JS + 복사된 리소스)

## 💡 핵심 규칙 및 아키텍처

### 1. 실시간 채팅 로그 분석 엔진 (v1.11.2 고도화)
- **Log Streaming:** `tail` 모듈을 사용하여 실시간 분석을 유지하며, **10초 주기 백그라운드 타이머**를 통해 사냥 중단 시에도 차트 데이터의 연속성을 보장합니다.
- **Data Persistence:** (v1.11.2) HUD 창을 닫아도 메인 프로세스에서 통계 데이터를 상시 관리하며, 창 재오픈 시 IPC `invoke` 패턴을 통해 즉시 상태를 복구합니다.
- **Integer Safety:** (v1.11.2) 21억(32비트) 오버플로 문제를 해결하기 위해 모든 숫자 파싱 및 전송 로직을 `Number` 타입으로 안전하게 처리하며, 차트 데이터는 '만' 단위 스케일링 기법을 적용합니다.

### 2. 게임 오버레이 및 경험치 HUD 시각화
- **HUD (Heads-Up Display):** `xp-hud.html`은 `Chart.js`를 통해 최근 30분간의 사냥 리듬을 선 그래프로 표시하며, **경험의 정수(100억 XP)** 기대값을 실시간 예측합니다.
- **Unit Scaling:** (v1.11.2) 긴 숫자가 UI를 깨뜨리지 않도록 "조/억/만" 단위를 작게 스타일링하고, 만 단위 미만을 생략하는 지능형 포맷팅을 적용합니다.

### 3. 버프 타이머 및 필터링 시스템
- **Targeted Monitoring:** 사냥에 필수적인 핵심 3종 버프(경험의 심장, 레어의 심장, 퇴마사의 은총)만 HUD에 선별적으로 표시하여 정보 가독성을 높였습니다.

### 4. 업데이트 히스토리 (v1.11.2 패치)
- **신규:** 실시간 사냥 리듬 차트 및 경험의 정수 기대값 계산 지표 추가.
- **수정:** 21억 이상 경험치 획득 시 마이너스로 표시되는 오버플로 버그 해결.
- **개선:** 창을 껐다 켜도 데이터가 유지되는 영속성 로직 구현.
- **보완:** 오프라인 환경 대응을 위한 Chart.js 로컬 라이브러리 전환.
- **정제:** 버프 필터링 명칭을 게임 내 실제 용어(심장)로 교정.

---
최종 수정일: 2026-04-22
작성자: Gemini CLI Agent
버전: v1.11.2
