# 종합 리뷰: AI 사기꾼 탐지 + 풀스크린 업스케일링

**날짜:** 2026-04-30  
**대상 브랜치:** `feature/20260424_fullscreen`  
**리뷰 관점:** 아키텍처, 보안, 동시성, 에러 처리, 성능, 코드 품질  
**리뷰 대상 파일:**
- `src/modules/scamMonitor.ts`
- `src/modules/windowManager.ts`
- `src/modules/ipcHandlers.ts`
- `native/src/addon.cpp`

---

## 1. 아키텍처 & 설계

### ✅ 레이어 분리 명확함

```
[Renderer process HTML/JS]
    ↕ contextBridge (preload.ts)
[Main process TypeScript]
    ↕ N-API (node-addon-api)
[C++ 렌더 스레드 (addon.cpp)]
    ↕ Win32 / DXGI / WGC
```

contextIsolation 준수, nodeIntegration 비활성화, preload에서만 API 노출 — 올바른 구조.

### ✅ windowRegistry 패턴으로 창 관리 통일

`windowRegistry`로 17개 창의 생성/위치/토글을 `createToggleableWindow` 한 곳에서 처리. `fullscreen` 창만 hide/show 특수 처리하는 예외도 코드에 명시되어 있음.

### ✅ `_llmQueue` Promise 체인으로 LLM 직렬화

```typescript
const slot = _llmQueue.then(async () => { ... });
_llmQueue = slot.catch(() => {});   // 에러 발생해도 큐 막히지 않도록
await slot;                          // 에러는 호출자로 전파
```

`catch(() => {})`가 큐 체인 전용 에러 억제, `await slot`이 실제 에러를 호출자에게 전파하는 이중 패턴 — 올바름.

### ⚠️ `httpsDownload`와 `doModelDownload` 기능 중복

동일한 HTTPS 리다이렉트 + SSL 폴백 로직이 두 함수에 별도로 구현되어 있음.  
`httpsDownload`는 in-memory Buffer, `doModelDownload`는 파일 스트리밍이라 분리가 불가피하지만,  
공통 로직(리다이렉트 추적, SSL 폴백, User-Agent 헤더)이 복제되어 있어 한쪽 수정 시 다른 쪽 누락 위험.

```typescript
// 공통 request builder를 추출하면 중복 제거 가능
function buildHttpsRequest(url: string, skipSSL: boolean, redirectCount: number, ...): http.ClientRequest
```

심각도: 낮음 — 현재 두 함수 모두 동일하게 유지되고 있으므로 즉각 수정 불필요.

### ⚠️ `getStandardOptions`의 `any` 타입

```typescript
function getStandardOptions(width: number, height: number, extraProps: any = {}): any {
```

`extraProps`와 반환 타입이 모두 `any`. `Electron.BrowserWindowConstructorOptions`로 타이핑하면 오타/속성 불일치를 컴파일 타임에 잡을 수 있음.

---

## 2. 보안

### ✅ IPC allowlist 검증

```typescript
// dock:open-feature — ALLOWED_DOCK_FEATURES allowlist
if (typeof featureKey !== 'string' || !ALLOWED_DOCK_FEATURES.has(featureKey)) return;

// fullscreen:start — enum 검증
const VALID_CAPTURE_MODES = new Set(['wgc', 'dxgi']);
const VALID_UPSCALE_MODES = new Set(['passthrough', 'anime4k-s', 'anime4k-l']);
if (opts.captureMode !== undefined && !VALID_CAPTURE_MODES.has(opts.captureMode)) return error;
```

### ✅ URL 파싱 후 protocol 검증

`navigate`, `open-external`, `trade-open-post` 모두 `new URL()` → `protocol === 'http:'||'https:'` 검증 후 사용. JavaScript 스킴 인젝션 방지.

### ✅ PowerShell 경로 이스케이프

```typescript
`-LiteralPath '${zipPath.replace(/'/g, "''")}'`
```

`-LiteralPath` + 작은따옴표 이스케이프로 경로 내 공백/특수문자 처리. `-Path` 사용 시 와일드카드 해석 위험 없음.

### ✅ llama-server 로컬 바인딩

```typescript
'--host', '127.0.0.1',
```

18765 포트를 localhost에만 바인딩하여 외부 노출 없음.

### 🟡 `scam-close-session` / `scam-trigger-analyze` filePath 입력 검증 없음

```typescript
// ipcHandlers.ts:378-379
ipcMain.on('scam-close-session', (_e, filePath: string) => scam.closeSession(filePath));
ipcMain.on('scam-trigger-analyze', (_e, filePath: string) => scam.triggerAnalyze(filePath));
```

`filePath`의 타입/범위 검증 없이 바로 모듈로 전달. 실제 영향은 낮음(Map 키 조회 후 없으면 무시), FS 접근은 `startSession` 시점에만 발생하므로 임의 경로로 파일을 읽히는 경로 없음.

다만 방어적으로 타입 검증 정도는 추가 권장:

```typescript
ipcMain.on('scam-close-session', (_e, filePath: unknown) => {
  if (typeof filePath !== 'string') return;
  scam.closeSession(filePath);
});
```

### 🟡 HWND → `double` 정밀도 손실 가능성 (addon.cpp)

```cpp
// addon.cpp:297
result.Set("hwnd", Napi::Number::New(env, (double)(uintptr_t)cppHwnd));
```

JavaScript `Number`는 64비트 부동소수점(IEEE 754)으로 안전 정수 범위가 `2^53 - 1`. Windows 64비트 HWND는 커널 주소 공간에서 할당되어 이론상 `2^53`을 초과할 수 있음.

**현재 실제 위험도:** 낮음. Windows HWND는 32비트 핸들 테이블 인덱스(상위 비트 제한)이므로 실제로 정밀도 손실이 발생한 사례는 드묾. 그러나 `BigInt`로 교체하는 것이 더 안전:

```cpp
result.Set("hwnd", Napi::BigInt::New(env, (uint64_t)(uintptr_t)cppHwnd));
// JS 측: BigInt.asUintN(64, hwnd)
```

---

## 3. 동시성 & 스레드 안전성

### ✅ generation counter 패턴

```cpp
static std::atomic<uint32_t> g_renderGen { 0 };
// StartFullscreen: fetch_add 후 renderThread에 myGen 전달
// RenderLoop: g_renderGen == myGen 지속 체크
// 5초 타임아웃 시: 추가 fetch_add로 구식 스레드 무력화
```

detached된 구식 렌더 스레드가 전역 상태를 덮어쓰는 문제를 generation 비교로 원천 차단. 잘 구현됨.

### ✅ atomic HWND 교환으로 단독 처리 보장

```cpp
// StopFullscreen 또는 렌더 스레드 자연 종료 중 하나만 GWLP_HWNDPARENT 복원
HWND eHwnd = g_electronHwnd.exchange(nullptr, std::memory_order_acq_rel);
if (eHwnd && IsWindow(eHwnd)) {
    SetWindowLongPtrW(eHwnd, GWLP_HWNDPARENT, 0);
}
```

`exchange(nullptr)` 원자 교환으로 두 경로 중 정확히 하나만 복원 로직을 실행. 올바른 패턴.

### ✅ promise/future로 스레드 초기화 결과 전달

`hwndPromise.set_value(cppHwnd)` → 메인 스레드 `wait_for(5s)` 패턴으로 렌더 스레드 초기화 성공/실패를 동기적으로 전달. 5초 타임아웃 후 detach + generation 무효화도 올바름.

### ✅ JS 단일 스레드 상태 관리

`_sessions` Map, `_sessionQueue`, `_llmQueue` 등은 JS 이벤트 루프 단일 스레드에서만 접근되므로 별도 동기화 불필요. `session.analyzing`, `session.closed` 플래그도 동일.

### ✅ `_startingServer` Promise 싱글턴

```typescript
if (_startingServer) return _startingServer;
_startingServer = _doStartServer().finally(() => { _startingServer = null; });
return _startingServer;
```

성공/실패 모두 `finally`에서 `null` 처리. 동시 호출이 동일 Promise 대기. 올바름.

### 🟡 GPU 폴백 시 `stopServer` 후 1500ms 고정 대기

```typescript
stopServer();                              // kill() 호출, 종료 보장 없음
await new Promise(r => setTimeout(r, 1500));  // 고정 대기
await spawnServer(0);                      // CPU 모드로 재시작
```

`_serverProcess.kill()` 이후 OS가 프로세스를 실제로 종료하는 시점이 보장되지 않음.  
1500ms는 대부분의 환경에서 충분하지만, 무거운 GPU 컨텍스트 해제 시 더 오래 걸릴 수 있음.

더 안전한 방법:
```typescript
await new Promise<void>((res) => {
  if (!_serverProcess) { res(); return; }
  _serverProcess.once('exit', () => res());
  _serverProcess.kill();
  // 2초 후에도 exit 이벤트 없으면 강제 진행
  setTimeout(res, 2000);
});
```

---

## 4. 에러 처리 & 복원력

### ✅ SSL 폴백 — `review_response_feedback` 이슈 이미 수정됨

`review_response_feedback.md`에서 지적한 "SSL 재시도 전 file close/unlink 미완료" race condition이 실제 코드에서 **이미 수정**되어 있음:

```typescript
// scamMonitor.ts:296-304
}).on('error', (err) => {
    if (!skipSSLVerify && /certificate|SSL|CERT/i.test(err.message)) {
        file.close(() => {                          // ✅ close 완료 후
            fs.unlink(tmpPath, () => {              // ✅ unlink 완료 후
                doModelDownload(true).then(resolve).catch(reject);
            });
        });
        return;
    }
```

피드백 문서가 잘못된 이전 버전을 기준으로 작성된 것으로, 실제 코드는 이미 수정 완료 상태.

### ✅ GPU 실패 시 CPU 자동 폴백

```typescript
try {
    await spawnServer(99);          // GPU 99 레이어
} catch (gpuErr) {
    stopServer();
    await new Promise(r => setTimeout(r, 1500));
    await spawnServer(0);           // CPU 폴백
}
```

GPU 불가 환경에서 자동 복구. `_doStartServer`에서만 처리하므로 `startServer` 싱글턴과 조합되어 중복 실행 없음.

### ✅ 캡처 백엔드 이중 폴백

WGC → DXGI 또는 DXGI → WGC 양방향 폴백. `IsDead()` 체크로 캡처 백엔드 런타임 실패 감지.

### ✅ 분석 실패 시 `newSinceLastAnalysis` 복원

```typescript
const savedCount = session.newSinceLastAnalysis;
session.newSinceLastAnalysis = 0;
// ...
} catch (e) {
    session.newSinceLastAnalysis = savedCount;  // 실패 시 복원 → 다음 분석 기회 유지
```

실패한 분석 구간을 버리지 않고 다음 60초 인터벌에서 재시도할 수 있게 복원. 올바름.

### ✅ `_folderPollTimer`로 MsgerLog 폴더 생성 대기

MsgerLog 폴더가 없을 때 즉시 실패하지 않고 1분마다 폴링하여 폴더 생성 시 자동 감시 시작.

### 🟡 분석 오류 시 사용자 알림 없음

```typescript
} catch (e) {
    session.newSinceLastAnalysis = savedCount;
    log(`[SCAM] 분석 실패: ${e}`);       // 로그에만 기록
} finally {
    session.analyzing = false;
    broadcastSessionUpdate();             // UI 상태만 업데이트
}
```

`startServer()` 실패(바이너리 없음, 모델 없음 등)나 `callLlm` 실패가 반복되어도 사용자에게 알림이 없음. `broadcastSessionUpdate()`가 UI를 갱신하지만, 탐지기 창이 닫혀있으면 아무 피드백 없이 분석이 조용히 실패.

개선안: 연속 실패 카운터 + 임계값 초과 시 사이드바/트레이 알림 추가.

---

## 5. 성능

### ✅ 렌더 스레드 타이머 해상도 조정

```cpp
timeBeginPeriod(1);    // Windows 타이머 해상도를 1ms로 상승
// ... 렌더 루프 ...
timeEndPeriod(1);      // 정리 시 복원
```

미조정 시 `Sleep(1)`이 실제로 ~15ms 슬립하여 렌더링 캡 ~67fps 발생. `timeBeginPeriod(1)` 없이는 Anime4K 품질이 의미 없음.

### ✅ `MAX_SESSIONS = 5` + 대기열 패턴

활성 세션을 5개로 제한하고 초과 파일을 `_sessionQueue`에 보관. 세션 종료 시 대기열에서 자동 승격. llama-server 단일 추론 특성과 맞는 설계.

### ✅ messages 트림

```typescript
session.messages.push(msg);
if (session.messages.length > MAX_MESSAGES_FOR_PROMPT * 2) {
    session.messages = session.messages.slice(-MAX_MESSAGES_FOR_PROMPT);  // 160개 초과 시 80개로 트림
}
```

메모리 무제한 증가 방지. 최신 메시지 우선으로 분석 정확도 유지.

### ✅ SSE 스트리밍으로 LLM 토큰 실시간 전달

```typescript
res.on('data', (chunk: string) => {
    sseBuffer += chunk;
    const lines = sseBuffer.split('\n');
    sseBuffer = lines.pop() ?? '';       // 불완전 라인 보존
    for (const line of lines) {
        // data: {...} 파싱 → scam-analysis-token IPC 전송
    }
});
```

부분 청크에서 불완전 JSON 파싱하지 않도록 버퍼링. 올바른 SSE 파싱 패턴.

### 🟡 `broadcastSessionUpdate()` 과다 호출

`onNewLine`에서 메시지 수신마다 2회 호출(push 직후 + debounce 설정 직후). 세션이 5개 활성화되어 메시지가 빠르게 들어오면 `webContents.send` 빈도가 높아질 수 있음.

개선안: 16ms throttle 또는 rAF 기반 배치 전송 고려. 현재 사용량 패턴(채팅 로그)에서는 충분히 낮은 빈도라 즉각 수정 불필요.

---

## 6. 코드 품질 & 유지보수성

### ✅ `sidebar_menus.json` 동적 로드로 dock 자동 동기화

`fullscreen-dock.html`의 `buildDock()`이 `sidebar_menus.json`을 fetch → 사이드바에 새 메뉴 추가 시 dock에 자동 반영.  
`menuToKey()` 함수의 `api ?? action` → `toggle`/`open` 접두사 제거 로직이 windowRegistry 키 파생에 적합.

### ✅ IPC 핸들러 일괄 등록 패턴

```typescript
const toggleHandlers: Record<string, () => void> = {
    'toggle-scam-detector': wm.toggleScamDetectorWindow,
    // ... 20개 핸들러
};
Object.entries(toggleHandlers).forEach(([event, handler]) => {
    ipcMain.on(event, () => { analytics.trackEvent(...); handler(); });
});
```

analytics 추적까지 한 번에 적용. 핸들러 추가 시 toggleHandlers 객체에만 추가하면 됨.

### ✅ 로그 태그로 출처 구분

`[SCAM]`, `[WM]`, `[GALLERY]` 등 모듈 태그가 일관됨. 필터링으로 특정 모듈 로그만 추적 가능.

### 🟡 `analyze()` 진입 조건 분산

`analyze()` 진입 가능 여부 체크가 세 곳에 분산:
1. `analyze()` 자체: `session.analyzing || session.messages.length === 0` 
2. `updateTimers` (scam-detector.html): `data-message-count` 어트리뷰트 + `!analyzing`
3. `triggerAnalyze()`: `session.closed || session.analyzing`

기능상 문제는 없지만 조건이 달라 혼란. `canAnalyze()` 헬퍼 함수 하나로 통일하면 유지보수 용이.

### 🟡 `TEST_SCENARIOS` 헬퍼 코드가 프로덕션 번들에 포함

`injectTestSession()`, `TEST_SCENARIOS`, `makeLogLine()` 등 개발 전용 코드가 메인 모듈에 포함되어 빌드 번들에 포함됨. 보안 영향은 없으나(IPC에 allowlist 없이 노출되지 않음), 번들 크기 증가 및 엔드유저 환경 오용 가능성 존재.

장기적으로는 `#if DEV` 조건부 빌드 또는 별도 test 모듈로 분리 권장.

---

## 7. 미해결 / 참고 사항

### 📌 `review_response_feedback`의 SSL race condition — 이미 수정됨

피드백이 지적한 `file.close()` / `fs.unlink()` 완료 대기 없이 즉시 재시도하는 문제는  
실제 코드(`scamMonitor.ts:296-304`)에서 이미 콜백 체인으로 수정되어 있음.  
피드백 문서 자체를 수정할 필요 없으나, 향후 혼란을 피하기 위해 문서에 "수정 완료" 표시 추가 권장.

### 📌 `gallery` 아이콘 요약표 오기재

`review_response.md` 요약표에 "dock에서만 `layout-grid`"로 기재되어 있으나,  
실제 `sidebar_menus.json`의 gallery 항목은 여전히 `"icon": "bell"`.  
세부 내용("아이콘 변경 없음")이 정확하고 요약표가 오기재된 것 — review_response.md 수정 필요.

---

## 요약

| 관점 | 평가 | 주요 이슈 |
|------|------|-----------|
| 아키텍처 | ✅ 양호 | httpsDownload 중복 (낮음) |
| 보안 | ✅ 양호 | filePath 미검증 (낮음), HWND double 정밀도 (낮음) |
| 동시성 | ✅ 양호 | GPU 폴백 1500ms 고정 대기 (낮음) |
| 에러 처리 | ✅ 양호 | 반복 분석 실패 시 무음 (중간) |
| 성능 | ✅ 양호 | broadcastSessionUpdate 과다 호출 (낮음) |
| 코드 품질 | ✅ 양호 | TEST_SCENARIOS 프로덕션 포함 (낮음) |

전반적으로 구조와 동시성 설계가 탄탄하다. 이전 리뷰들에서 지적된 대부분의 이슈가 처리되었으며, 남은 이슈들은 모두 낮은 심각도.  
가장 실질적인 개선 여지는 **반복 분석 실패 시 사용자 알림 부재** 항목.
