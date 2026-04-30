# 코드 리뷰 수정 결과

**날짜:** 2026-04-30  
**대상 브랜치:** `feature/20260424_fullscreen`  
**리뷰 원본:** `review.md`

---

## 수정 완료 항목

### 🔴 `startServer()` 동시 호출 시 프로세스 이중 실행 — **수정 완료**

**파일:** `src/modules/scamMonitor.ts`

`_serverReady` 체크와 `spawnServer()` 호출 사이의 async 갭에서 여러 세션이 동시에 진입할 수 있던 문제.

**변경 내용:**
- 모듈 상태에 `let _startingServer: Promise<void> | null = null` 추가
- `startServer()`를 진행 중인 Promise를 반환하는 진입점으로 교체
- 실제 로직은 `_doStartServer()`로 분리
- `.finally()`로 완료 후 `_startingServer = null` 초기화 보장

```typescript
// 수정 전
async function startServer(): Promise<void> {
  if (_serverReady) return;
  // ... (동시 호출 시 둘 다 통과)
}

// 수정 후
async function startServer(): Promise<void> {
  if (_serverReady) return;
  if (_startingServer) return _startingServer;   // 진행 중이면 같은 Promise 반환
  _startingServer = _doStartServer().finally(() => { _startingServer = null; });
  return _startingServer;
}
```

---

### 🟠 Detached 스레드의 `BringToTop` 무조건 실행 — **수정 완료**

**파일:** `native/src/addon.cpp`

5초 타임아웃 후 generation이 올라간 상태에서 `BringToTop`이 if-else 블록 밖에 있어 무조건 실행되던 문제.

**변경 내용:**
- `bool startupOk = false` 플래그 도입 (`goto` 대신 — cross-initialization 회피)
- `BringToTop`을 generation 체크 블록 안으로 이동, `startupOk = true` 설정
- 렌더 루프 진입 조건에 `startupOk &&` 추가
- generation 불일치 시 렌더 루프 진입 없이 cleanup으로 낙하

```cpp
// 수정 전
if (g_renderGen == myGen) {
    // SetWindowLongPtrW
} else {
    NativeLog("... skipping GWLP_HWNDPARENT");
}
scalingWin.BringToTop(...);  // ← 항상 실행됨

// 수정 후
bool startupOk = false;
if (g_renderGen == myGen) {
    // SetWindowLongPtrW
    scalingWin.BringToTop(...);  // generation 블록 안으로 이동
    startupOk = true;
} else {
    NativeLog("... aborting startup");
}
while (startupOk && g_running && g_renderGen == myGen) { ... }
```

---

### 🟠 `session.messages` 배열 무제한 증가 — **수정 완료**

**파일:** `src/modules/scamMonitor.ts`

프롬프트는 최대 80개(`MAX_MESSAGES_FOR_PROMPT`)만 사용하지만 배열이 무제한으로 쌓이던 문제.

**변경 내용:**
- `session.messages.push(msg)` 직후 길이가 `MAX_MESSAGES_FOR_PROMPT * 2`를 초과하면 최근 `MAX_MESSAGES_FOR_PROMPT`개로 트림

```typescript
session.messages.push(msg);
if (session.messages.length > MAX_MESSAGES_FOR_PROMPT * 2) {
  session.messages = session.messages.slice(-MAX_MESSAGES_FOR_PROMPT);
}
```

---

### 🟡 HTTP 리다이렉트 무한 루프 — **수정 완료**

**파일:** `src/modules/scamMonitor.ts` (2개소: `httpsDownload`, `downloadModel`)

재귀 `doGet` 함수에 카운터가 없어 서버 오작동 시 스택 오버플로우 가능.

**변경 내용:** 두 `doGet` 함수 모두 `redirectCount = 0` 파라미터 추가, 10회 초과 시 reject

```typescript
const doGet = (u: string, redirectCount = 0) => {
  if (redirectCount > 10) { reject(new Error('Too many redirects')); return; }
  // ...
  doGet(res.headers.location, redirectCount + 1);
};
```

---

### 🟢 `extractZip` 경로에 작은따옴표 포함 시 PowerShell 오작동 — **수정 완료**

**파일:** `src/modules/scamMonitor.ts`

리뷰의 "spawn 배열 방식으로 전달" 제안은 이미 적용된 상태였고, 실제 문제는 `-Command` 문자열 내부의 PowerShell 따옴표 이스케이프 누락이었음.

**변경 내용:** `zipPath`와 `destDir`의 작은따옴표를 PowerShell 규칙대로 `''`으로 이스케이프

```typescript
// 수정 전
`Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destDir}' -Force`

// 수정 후
`Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`
```

---

### 🟢 `EnsureAnime4KTextures` `CreateTexture2D` 실패 미처리 — **수정 완료**

**파일:** `native/src/d3d11_renderer.cpp`, `native/src/d3d11_renderer.h`

`CreateTexture2D` 실패 시 `nullptr` 상태의 UAV/SRV로 `RunAnime4K`가 실행될 수 있던 문제.

**변경 내용:**
- 반환 타입 `void` → `bool`
- `mkTex` 람다도 `bool` 반환, `FAILED(CreateTexture2D)` 시 로그 출력 후 `false` 반환
- 중간 버퍼/출력 버퍼 생성 실패 시 즉시 `return false`
- `RunAnime4K`에서 반환값 체크 후 실패 시 조기 종료

```cpp
// 수정 전
void D3D11Renderer::EnsureAnime4KTextures(int w, int h) { ... }
void D3D11Renderer::RunAnime4K(int mode, int inW, int inH) {
    EnsureAnime4KTextures(inW, inH);
    // m_a4kOutUAV가 nullptr인 채로 dispatch 가능

// 수정 후
bool D3D11Renderer::EnsureAnime4KTextures(int w, int h) { ... return true/false; }
void D3D11Renderer::RunAnime4K(int mode, int inW, int inH) {
    if (!EnsureAnime4KTextures(inW, inH)) return;
```

---

## 미수정 항목

### 🟡 타임스탬프 정규식 (`TS_RE`) — **실제 로그 검증 필요**

```typescript
const TS_RE = /color="white">\s*\[(\d+)분\s+(\d+)분\s+(\d+)분\]/;
```

실제 테일즈위버 MsgerLog 파일 형식을 확인해야 수정 가능. 파싱 자체(`MSG_RE`)는 독립적으로 동작하므로 분석 기능에는 영향 없음. 실제 로그 샘플로 검증 후 수정 권장.

---

## 빌드 결과

| 대상 | 결과 |
|------|------|
| TypeScript (`npm run build`) | ✅ 성공 |
| `tw_native.node` (node-gyp rebuild) | ✅ 성공 |
| `tw_capture_helper.exe` | ✅ (변경 없음, 기존 바이너리 유지) |

`tw_native.node` → 루트 디렉토리 복사 완료.
