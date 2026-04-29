# 📦 TW-Overlay Release Note (v1.12.0)

## 📅 릴리즈 날짜: 2026-04-30

이번 업데이트는 테일즈위버 1:1 메신저 대화를 실시간으로 분석해 사기 패턴을 감지하는 **사기꾼 탐지 AI (BETA)** 기능을 신규 추가합니다. Gemma 4 E2B GGUF 모델을 llama-server(llama.cpp)로 완전 로컬 추론하여 인터넷 전송 없이 개인정보를 보호합니다.

---

### ✨ Added (신규 기능)

- **사기꾼 탐지 AI (BETA)**: MsgerLog 폴더를 `fs.watch`로 실시간 감시하여 신규 1:1 대화 HTML 파일이 생성되면 자동으로 세션을 시작합니다.
  - **EUC-KR 디코딩**: 테일즈위버 채팅 로그(EUC-KR 인코딩)를 `iconv-lite`로 정확히 파싱합니다.
  - **분석 주기**: 디바운스(3초) + 최대 60초 배치 방식으로 빈번한 추론을 방지합니다. 즉시 분석 버튼으로 수동 트리거도 지원합니다.
  - **LLM 직렬화 큐**: 여러 세션이 동시에 분석 요청을 보내도 llama-server에 순차적으로 전달하여 빈 응답(UNKNOWN) 문제를 방지합니다.
  - **4단계 판정**: 🚨 위험(SCAM) / 🟡 주의(SUSPICIOUS) / 🟢 안전(SAFE) / ❓ 대기(UNKNOWN)
  - **SSE 스트리밍 출력**: LLM 추론 결과를 토큰 단위로 실시간 스트리밍하여 세션 카드에 즉시 표시합니다.
  - **시청각 알람**: SCAM·SUSPICIOUS 판정 시 사이드바를 통해 경보음을 재생합니다.
  - **GPU 자동 감지**: `Get-CimInstance Win32_VideoController`로 GPU를 감지하여 NVIDIA CUDA 12.4 / AMD·Intel Vulkan / CPU 중 최적 llama-server 바이너리를 자동 설치합니다.
  - **바이너리 교체**: 설치 완료 후 GPU 종류를 수동으로 변경해 바이너리를 재설치할 수 있습니다.
  - **테스트 케이스 5종**: 가중치·쪽지 사기 / 2인 1조 클럽장 사칭 / 추가 시드 유도 / 저레벨 행동 이상(주의) / 정상 거래(안전) 시나리오.
  - **모델 미설치·탐지 비활성 시 테스트 버튼 잠금**: 두 조건이 모두 충족되어야 테스트 케이스 버튼이 활성화됩니다.
  - **BETA 표시**: 사이드바 툴팁 및 탐지 창 헤더에 BETA 뱃지를 표시합니다.

### ⚙️ Technical Changes (기술적 변경 사항)

- `src/modules/scamMonitor.ts` (신규):
  - `ActiveSession` 관리, `fs.watch` 폴더 감시, `Tail` 기반 파일 스트리밍, EUC-KR 파싱, llama-server 프로세스 관리, GPU 감지, 모델·바이너리 다운로드, LLM 직렬화 큐(`_llmQueue`), 분석 결과 IPC 전송, 알람 발송.
  - `injectTestSession`: 파일명에 밀리초 추가로 동시 다중 테스트 시 파일명 충돌 방지.
- `src/scam-detector.html` (신규): 탐지 제어, 활성 세션 목록(SSE 스트리밍 박스 포함), 최근 분석 결과 로그, AI 모델 설치 관리, 설정 패널, 테스트 케이스 UI.
- `src/shared/types.ts`: `MessengerMessage`, `ScamAnalysisResult`, `ModelStatus`, `ServerStatus`, `SessionState`, `GpuDetectionResult`, `LlamaServerVariant` 타입 추가. `AppConfig`에 Scam Detector 설정 필드 추가.
- `src/modules/ipcHandlers.ts`: scam 관련 IPC 핸들러 추가 (활성화 토글, 모델 상태 조회, 다운로드, 세션 관리, GPU 감지 등).
- `src/preload.ts`: scam 관련 API 메서드 추가.
- `src/assets/data/sidebar_menus.json`: 사기꾼 탐지 AI 메뉴 항목 추가.
- `src/main.ts`: `scamDetectorEnabled` 설정에 따라 `scamMonitor.start()` 연동.
