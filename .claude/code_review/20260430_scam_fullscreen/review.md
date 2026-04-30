# 코드 리뷰: AI 사기꾼 탐지 + 풀스크린 업스케일링

**날짜:** 2026-04-30  
**대상 브랜치:** `feature/20260424_fullscreen` + `main` (v1.12.0)  
**리뷰 대상 파일:**
- `src/modules/scamMonitor.ts`
- `src/modules/fullscreenManager.ts`
- `src/modules/ipcHandlers.ts` (관련 부분)
- `src/modules/windowManager.ts` (관련 부분)
- `native/src/addon.cpp`
- `native/src/scaling_window.cpp`
- `native/src/d3d11_renderer.cpp`
- `native/src/input_forwarder.cpp`

---

## 우선순위 요약

| 중요도 | 항목 | 위치 |
|--------|------|------|
| 🔴 버그 | `startServer()` 동시 호출 시 프로세스 이중 실행 | `scamMonitor.ts:404` |
| 🟠 버그 | Detached 스레드의 `BringToTop` 무조건 실행 (타임아웃 시 플리커) | `addon.cpp:155` |
| 🟠 버그 | `session.messages` 무제한 증가 | `scamMonitor.ts:789` |
| 🟡 취약 | HTTP 리다이렉트 카운터 없음 | `scamMonitor.ts:145, 248` |
| 🟡 검증필요 | 타임스탬프 정규식이 실제 로그 포맷과 일치하는지 확인 | `scamMonitor.ts:500` |
| 🟢 경미 | Anime4K 텍스처 크기 상한 없음 | `d3d11_renderer.cpp:274` |
| 🟢 경미 | `extractZip` 경로에 따옴표 포함 시 실패 가능 | `scamMonitor.ts:176` |

---

## 1. AI 사기꾼 탐지 (`scamMonitor.ts`)

### 🔴 버그: `startServer()` 동시 호출 시 프로세스 이중 실행 (`:404`)

```typescript
async function startServer(): Promise<void> {
  if (_serverReady) return;  // ← 원자적이지 않음
  // ...
  await spawnServer(99);
```

**재현 조건:** `MAX_SESSIONS = 5`인 상황에서 여러 채팅 파일이 동시에 60초 인터벌을 맞히면,  
서로 다른 두 세션이 각각 `analyze()` → `startServer()`를 동시에 호출 가능.  
`_serverReady` 체크가 비원자적이라 두 곳 모두 통과 → `spawnServer` 두 번 호출 → `llama-server.exe` 프로세스 이중 생성 + 포트 18765 충돌.

`_llmQueue`는 LLM 호출만 직렬화하고 `startServer()` 호출은 보호하지 않음.

**수정 방안:**

```typescript
let _startingServer: Promise<void> | null = null;

async function startServer(): Promise<void> {
  if (_serverReady) return;
  if (_startingServer) return _startingServer;
  _startingServer = _doStartServer().finally(() => { _startingServer = null; });
  return _startingServer;
}

async function _doStartServer(): Promise<void> {
  // 기존 startServer() 로직
}
```

---

### 🟠 버그: `session.messages` 배열 무제한 증가 (`:789`)

```typescript
session.messages.push(msg);
```

분석 프롬프트는 `MAX_MESSAGES_FOR_PROMPT = 80`개만 사용하지만(`buildConversationText`),  
배열 자체는 세션 내내 쌓임. 장시간 거래 세션(수천 줄 로그)에서 메모리 누수성 증가.

**수정 방안:**

```typescript
session.messages.push(msg);
if (session.messages.length > MAX_MESSAGES_FOR_PROMPT * 2) {
  session.messages = session.messages.slice(-MAX_MESSAGES_FOR_PROMPT);
}
```

---

### 🟡 취약: HTTP 리다이렉트 무한 루프 가능 (`:145`, `:248`)

`httpsDownload`와 `downloadModel` 내 `doGet` 함수 모두 리다이렉트를 재귀로 처리하며 카운터가 없음.  
GitHub/HuggingFace는 보통 2회 이내이지만, 서버 이상 시 스택 오버플로우 가능.

**수정 방안:**

```typescript
const doGet = (u: string, redirectCount = 0) => {
  if (redirectCount > 10) { reject(new Error('Too many redirects')); return; }
  https.get(u, ..., (res) => {
    if ([301,302,307,308].includes(status) && res.headers.location) {
      doGet(res.headers.location, redirectCount + 1);
      return;
    }
    // ...
  });
};
```

---

### 🟡 검증 필요: 타임스탬프 정규식과 실제 로그 포맷 일치 여부 (`:500`)

```typescript
const TS_RE = /color="white">\s*\[(\d+)분\s+(\d+)분\s+(\d+)분\]/;
```

테스트 데이터(`makeLogLine`)는 `[H분 M분 S분]` 형식으로 생성되어 이 정규식과 일치함.  
실제 게임 로그가 `[HH시 MM분 SS초]` 형식이라면 매칭 실패 → 모든 메시지 `timestamp`가 빈 문자열.  
파싱 자체는 `MSG_RE`가 독립적으로 동작하므로 분석은 유지되지만, 프롬프트에 시간 정보가 빠짐.

**→ 실제 MsgerLog 파일로 직접 검증 필요.**

---

### 🟢 경미: `extractZip` 경로에 작은따옴표 포함 시 PowerShell 오작동 (`:176`)

```typescript
`Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destDir}' -Force`
```

`app.getPath('userData')` 반환값에 `'` 포함(예: `C:\Users\O'Brien`)이면 PowerShell 구문 오류.  
실제 발생 빈도는 낮지만 방어적 처리 권장. 또는 `spawn` 배열 인자 방식으로 전달.

---

### ✅ 잘된 점

- **`_llmQueue` 직렬화** (`:681`): `llama-server`의 단일 추론 제약을 Promise 체이닝으로 우아하게 해결. 에러 발생해도 큐가 막히지 않도록 `.catch(() => {})` 처리 정확.
- **세션 생명주기 관리**: `closed` 플래그, 타이머 3종(debounce/interval/inactivity) 정리, `_testFilePaths` Set 분리가 명확.
- **큐 대기 중 세션 종료 처리** (`:684`): `if (session.closed) throw`로 큐 대기 중 종료된 세션을 정확히 스킵.
- **GPU 폴백 로직** (`:421`): GPU 모드 실패 시 1.5초 후 CPU로 자동 재시도. 프로세스 종료 대기에 적절한 지연.
- **스트리밍 토큰 실시간 전송** (`:649`): SSE 파싱하며 토큰을 창으로 즉시 전달. `sseBuffer`로 청크 경계 처리가 정확.
- **IPC 입력 검증** (`ipcHandlers.ts`): `VALID_CAPTURE_MODES`, `VALID_UPSCALE_MODES`, `ALLOWED_DOCK_FEATURES` 허용 목록으로 렌더러 입력 검증.

---

## 2. 풀스크린 업스케일링 + 독 오버레이

### 🟠 버그: 타임아웃된 스레드가 `BringToTop` 무조건 실행 (`addon.cpp:155`)

```cpp
if (g_renderGen.load(...) == myGen) {
    // GWLP_HWNDPARENT 설정 (타임아웃 시 스킵됨) ✓
} else {
    NativeLog("...Generation mismatch — skipping GWLP_HWNDPARENT");
}
// ← BringToTop은 generation 체크 없이 무조건 실행 ✗
NativeLog("RenderThread: [5b] Calling BringToTop...");
scalingWin.BringToTop(cppHwnd, gameHwnd);
```

**현상:** 5초 타임아웃 후 main thread가 스레드를 detach하면서 generation을 올림.  
Detached 스레드는 GWLP_HWNDPARENT는 건너뛰지만, `BringToTop`은 그 후에 실행됨.  
결과: 전체화면 창이 순간 등장했다가 사라지는 시각적 플리커 발생 가능.

**수정 방안:**

```cpp
if (g_renderGen.load(std::memory_order_relaxed) == myGen) {
    HWND eHwnd = g_electronHwnd.load(std::memory_order_relaxed);
    if (eHwnd) {
        SetWindowLongPtrW(eHwnd, GWLP_HWNDPARENT, (LONG_PTR)cppHwnd);
        // ...
    }
    scalingWin.BringToTop(cppHwnd, gameHwnd);  // generation 블록 안으로 이동
} else {
    NativeLog("RenderThread: [5b] Generation mismatch — aborting startup");
    // BringToTop 없이 바로 cleanup으로 진행
}
```

---

### 🟢 경미: Anime4K 텍스처 크기 상한 없음 (`d3d11_renderer.cpp:274`)

```cpp
mkTex(w*2, h*2, DXGI_FORMAT_R8G8B8A8_UNORM, ...);  // 출력 텍스처
// 중간 버퍼 4개: R16G16B16A16_FLOAT @ w×h
```

4K(3840×2160) 게임 창 기준: 출력 텍스처 ~128MB + 중간 버퍼 4개 ~1GB VRAM 필요.  
모니터 해상도를 초과하는 창은 일반적으로 없으므로 실제 문제 발생 가능성은 낮음.  
단, `CreateTexture2D` 실패 시 `m_a4kOutUAV == nullptr` 상태에서 `RunAnime4K` 호출될 수 있으므로  
`EnsureAnime4KTextures`에서 생성 실패를 명시적으로 반환값으로 처리하면 더 안전.

---

### ✅ 잘된 점

**`addon.cpp` - 스레드 안전성**

- **Generation counter 패턴**: Detached 스레드의 전역 상태 오염을 `myGen != g_renderGen` 체크로 방지. 심플하면서 효과적인 설계.
- **`g_electronHwnd` atomic exchange** (`:326`): `exchange(nullptr)` 한 쪽만 `SetWindowLongPtrW` 복원을 담당 — 이중 복원 또는 누락 없음. 매우 세심한 처리.
- **promise/future 시퀀싱 주석** (`:135~157`): `hwndPromise.set_value` → main thread unblock → `SetWindowLongPtrW` → `BringToTop` 순서가 deadlock을 피하는 이유가 주석으로 명확히 설명되어 있음.
- **`StopFullscreen`에서 항상 join** (`:336`): 자연 종료 경로에서도 joinable 상태 방치 시 `std::terminate` 발생하는 문제를 "Always join if joinable" 주석과 함께 정확히 처리.

**`scaling_window.cpp` - DWM 앵커 창**

- 게임이 `Windowed Independent Flip`(WIF/FSO) 사용 시 DXGI Desktop Duplication으로 캡처 불가능한 문제를, 2×2 투명 창으로 DWM 컴포지션을 강제 활성화해 우회. 기법과 이유가 주석으로 잘 설명됨.
- `WS_EX_NOREDIRECTIONBITMAP` + `WDA_EXCLUDEFROMCAPTURE` 조합으로 스케일링 창 자체가 캡처에 잡히는 피드백 루프 방지.

**`d3d11_renderer.cpp` - 백그라운드 셰이더 컴파일**

- Rasterizer 셰이더 컴파일 후 5초 시작 약속을 바로 이행하고, Anime4K compute 셰이더는 백그라운드에서 계속 컴파일.
- `m_csSReady`/`m_csLReady` 원자 플래그로 준비 전 dispatch를 정확히 차단.
- `m_cancelCompile` 플래그로 Shutdown 시 불필요한 컴파일 조기 종료.

**`input_forwarder.cpp` - 커서 관리**

- Magpie와 동일한 감도 테이블 기반 커서 속도 조정. 가속 on/off 분기 처리 정확.
- `SetOverlayActive(true)` 시 즉시 `StopCapture()` 호출 → `ClipCursor` 해제, 커서 속도 복원, 커서 표시가 원자적으로 복원. 독 열 때 커서가 게임 영역에 갇히는 문제 없음.
- `WS_EX_TRANSPARENT` 토글로 마우스 이벤트를 OS 레벨에서 게임 창으로 직접 전달 — 게임 포커스 유지.

**`windowManager.ts` - 풀스크린 모드 전환**

- `setFullscreenMode(true/false)` 내에서 단축키 등록/해제, 창 show/hide, alwaysOnTop 상태 저장/복원이 일관되게 처리.
- `_prevMainAlwaysOnTop`, `_prevOverlayAlwaysOnTop`으로 진입 전 상태를 저장해 종료 시 정확히 복원.
- `_dockOpenedWindows` Set으로 독에서 열린 창들을 추적하고 독 종료 시 일괄 정리.

**`fullscreen.html` - UI 상태 관리**

- `_stopping` 플래그로 중복 종료 호출 방지.
- 창 재오픈 시 `fullscreenGetStatus()`로 실행 상태를 복원하는 IIFE.
- `beforeunload`에서 `statusTimer` 정리.
