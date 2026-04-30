# UI/UX 리뷰 2차: 사기꾼 탐지 + 풀스크린 업스케일링

**날짜:** 2026-04-30  
**대상 브랜치:** `feature/20260424_fullscreen`  
**리뷰 대상 파일:**
- `src/scam-detector.html`
- `src/fullscreen.html`

---

## 우선순위 요약

| 중요도 | 항목 | 위치 |
|--------|------|------|
| 🔴 기능 누락 | 탐지기 창 닫힌 상태에서 분석 결과 영구 유실 | `scamMonitor.ts` / `scam-detector.html` |
| 🔴 기능 누락 | 분석 로그가 창 재오픈 시 초기화 | `scam-detector.html` |
| 🟠 UX버그 | ZIP 해제 중 다운로드 진행률 100%에서 멈춤 | `scam-detector.html` |
| 🟠 UX | 다운로드 취소 불가 | `scam-detector.html` |
| 🟠 UX | llama-server 시작 중인지 AI 추론 중인지 구분 불가 | `scam-detector.html` |
| 🟠 UX | 게임 미실행 경고가 빨간 에러 스타일 | `fullscreen.html` |
| 🟠 UX | 전체화면 시작 중 버튼 피드백 없음 | `fullscreen.html` |
| 🟡 불편 | 세션 파일명이 날짜 기반 — 대화 상대 식별 불가 | `scam-detector.html` |
| 🟡 불편 | 캡처 모드 선택이 저장되지 않음 | `fullscreen.html` |
| 🟡 불편 | GPU 감지 결과를 다운로드 전에 미리 볼 수 없음 | `scam-detector.html` |
| 🟡 불편 | 탐지 토글 OFF 시 서버 종료 여부 UI 반영 지연 3초 | `scam-detector.html` |

---

## 1. 사기꾼 탐지 UI (`scam-detector.html`)

### 🔴 탐지기 창이 닫혀있으면 분석 결과 영구 유실

```typescript
// scamMonitor.ts
wm.getScamDetectorWindow()?.webContents.send('scam-analysis-result', result);
```

`scam-analysis-result` IPC가 창이 열려있을 때만 전달됨. 게임 중에 창을 닫아둔 상태에서 분석이 완료되면 결과가 버려짐. 사기 시도가 있었는지 나중에 창을 열어서 확인하는 것이 불가능.

`scam-analysis-token`(스트리밍)도 동일. 창이 열려있지 않으면 실시간 추론 자체도 확인 불가.

**수정 방안:** 분석 결과를 `scamMonitor.ts` 내 메모리 버퍼(최대 20개)에 보관하고, 창 열릴 때 `init()` 시점에 전체 조회:

```typescript
// scamMonitor.ts
const _recentResults: ScamAnalysisResult[] = [];

export function getRecentResults(): ScamAnalysisResult[] {
  return [..._recentResults];
}

// analyze() 완료 시
_recentResults.unshift(result);
if (_recentResults.length > 20) _recentResults.pop();
```

```javascript
// scam-detector.html init()
const past = await window.electronAPI.scamGetRecentResults();
past.forEach(r => appendLog(r));
```

---

### 🔴 분석 로그가 창 재오픈 시 초기화

```javascript
let _logEntries = [];   // 창 닫으면 리셋됨
```

`_logEntries`가 렌더러 메모리에만 존재. 창을 닫고 다시 열면 "분석 결과가 없습니다."로 초기화. 위 이슈와 연계하여 백엔드에 결과를 보관하면 함께 해결됨.

---

### 🟠 ZIP 해제 중 다운로드 진행률 100%에서 멈춤

`extractZip`이 PowerShell 프로세스를 spawn하고 `on('exit')`만 기다리는 구조라 압축 해제 중 진행률 콜백이 없음. 사용자 입장에서는 100% 직후 수 초~수십 초(4GB 압축 해제) 동안 바가 멈춰있다가 완료됨.

```typescript
// scamMonitor.ts:183-192
function extractZip(zipPath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('powershell', [...]);
    proc.on('exit', (code) => code === 0 ? resolve() : reject(...));
  });
}
```

**수정 방안:** 압축 해제 시작 시 UI에 단계 텍스트 전환:

```typescript
// downloadServerBinary에서 extractZip 전후
onProgress(100, '압축 해제 중...');
await extractZip(zipPath, binDir);
onProgress(100, '설치 완료');
```

```javascript
// scam-detector.html
res.on('data', (chunk) => {
    ...
    if (total > 0) onProgress(Math.round((received / total) * 100));
});
// onProgress의 두 번째 인수를 progress-label에 반영
```

---

### 🟠 다운로드 취소 불가

모델 3.15GB + 바이너리 34MB 다운로드 시작 후 중단 버튼이 없음. 실수로 시작하거나 네트워크가 느려 취소하고 싶을 때 앱을 강제 종료해야 함. `.tmp` 파일이 남아있을 수 있음.

**수정 방안:** 다운로드 중 취소 버튼 추가. `httpsDownload`/`doModelDownload` 내부에 `AbortController` 또는 `cancelled` 플래그 주입:

```typescript
let _downloadAbortFlag = false;

export function abortDownload(): void { _downloadAbortFlag = true; }

// doGet 내 data 핸들러에서 체크
res.on('data', (chunk) => {
  if (_downloadAbortFlag) { res.destroy(); return; }
  ...
});
```

---

### 🟠 llama-server 시작 중인지 AI 추론 중인지 구분 불가

첫 분석 시 llama-server를 최초로 시작하는 과정(최대 60초)과 실제 AI 추론 과정(5~20초)이 UI에서 동일하게 "🔍 AI 분석 중..."으로 표시됨.

세션 카드:

```javascript
const timerText = s.analyzing
    ? '🔍 AI 분석 중...'   // 서버 시작 중인지 추론 중인지 구분 없음
    : ...
```

서버 도트(주황 깜빡임)는 "탐지 제어" 섹션에 있어서 스크롤해야 보임.

**수정 방안:** `getServerStatus()`의 `ready` 필드를 세션 렌더링에 활용:

```javascript
const timerText = s.analyzing
    ? (serverReady ? '🔍 AI 분석 중...' : '⚙️ AI 서버 시작 중... (최초 1회)')
    : ...
```

또는 분석 시작 시 서버 도트가 주황인 경우 세션 카드 하단에 "AI 서버 로드 중" 인라인 표시.

---

### 🟡 세션 파일명이 날짜 기반 — 대화 상대 식별 불가

```javascript
// 세션 카드
<div class="font-bold text-slate-200 truncate" style="font-size:12px;">${escapeHtml(s.fileName)}</div>
// 표시 예: 2026-04-30-14-30-00-123.html
```

게임에서 1:1 채팅을 여러 명과 동시에 하면 "14:30에 시작한 대화" 외에 상대방이 누구인지 알 수 없음.

HTML 파일 내부에서 최초 발신자 이름을 파싱하면 "홍길동과의 대화" 형식으로 표시 가능. 단, 파싱 비용이 있으므로 세션 시작 시 첫 메시지의 `sender`를 기록하는 방식이 현실적:

```typescript
// ActiveSession에 displayName 추가
displayName: string;  // 첫 상대방 메시지의 sender

// onNewLine에서 첫 비-SYSTEM 메시지의 sender 캡처
if (!session.displayName && !msg.isSystem) {
  session.displayName = msg.sender;
}
```

---

### 🟡 GPU 감지 결과를 다운로드 전에 미리 볼 수 없음

```javascript
// startDownload() — 버튼 클릭 후에야 GPU 감지
const gpu = await window.electronAPI.scamDetectGpu();
gpuInfoEl.textContent = `감지됨: ${gpu.gpuName}...`;
```

사용자는 다운로드 시작 전까지 어떤 바이너리(CUDA/Vulkan/CPU)가 설치될지 모름. 특히 CUDA 12.x가 설치되는데 본인 환경이 맞는지 확인하고 싶은 사용자에게 불편.

**수정 방안:** `init()` 시점에 GPU 감지 결과를 미리 표시:

```javascript
// init() 내
const gpu = await window.electronAPI.scamDetectGpu();
const vLabel = { 'cuda-12.4':'NVIDIA CUDA 12.x', ... }[gpu.binaryVariant];
gpuInfoEl.textContent = `감지됨: ${gpu.gpuName} → ${vLabel} 다운로드 예정`;
gpuInfoEl.classList.remove('hidden');
```

---

### 🟡 탐지 토글 OFF 시 서버 종료 3초 지연 반영

탐지 토글을 끄면 `scam.stop()` → `stopServer()` 순으로 서버가 즉시 종료되지만, UI는 3초 폴링(`_statusInterval`)까지 기다려야 서버 도트가 회색으로 바뀜. 사용자가 토글을 끄고 즉시 서버 도트를 보면 아직 초록인 채로 보임.

**수정 방안:** `onToggleEnabled(false)` 시 즉시 `refreshServerStatus()` 호출:

```javascript
function onToggleEnabled(enabled) {
  window.electronAPI.scamSetEnabled(enabled);
  ...
  if (!enabled) setTimeout(refreshServerStatus, 500);  // 종료 직후 1회 즉시 갱신
}
```

---

## 2. 풀스크린 UI (`fullscreen.html`)

### 🟠 게임 미실행 경고가 빨간 에러 스타일

```javascript
// fullscreen.html:342-344
const gameRunning = await api.isGameRunning();
if (!gameRunning) {
    errMsg.textContent = '⚠️ 게임이 실행 중이지 않습니다. 게임을 먼저 실행해 주세요.';
    errMsg.style.display = '';   // ← 빨간 배경의 errMsg 박스 사용
}
```

`errMsg`는 `bg-red-500/10`, `border-red-500/20`, `text-red-400` 스타일. 게임이 안 켜진 것은 에러가 아닌 일반적인 사용 순서 문제인데 빨간 박스로 표시되어 사용자가 "뭔가 고장났나?" 오해.

**수정 방안:** 별도 안내용 박스 추가:

```html
<div id="warningMsg"
  class="text-[12px] text-amber-400 text-center p-2.5 bg-amber-500/10 rounded-xl border border-amber-500/20"
  style="display:none"></div>
```

```javascript
if (!gameRunning) {
    warningMsg.textContent = '⚠️ 게임이 실행 중이지 않습니다. 게임을 먼저 실행해 주세요.';
    warningMsg.style.display = '';
    mainBtn.disabled = true;
}
```

---

### 🟠 전체화면 시작 중 버튼 피드백 없음

```javascript
mainBtn.disabled = true;   // 비활성화
// ... await api.fullscreenStart(...)  최대 5초 대기
mainBtn.disabled = false;
```

클릭 후 최대 5초(C++ 초기화 타임아웃) 동안 버튼이 `disabled` 상태 + 텍스트 그대로 "전체화면 시작". 처리 중임을 알 수 없어 사용자가 버튼을 여러 번 클릭하려 할 수 있음 (disabled라 반응은 없지만).

**수정 방안:**

```javascript
mainBtn.disabled = true;
mainBtn.textContent = '시작 중...';
// ...
// 성공 시: mainBtn.textContent = '전체화면 종료'
// 실패 시: mainBtn.textContent = '전체화면 시작'
```

---

### 🟡 캡처 모드 선택이 저장되지 않음

창을 닫고 다시 열면 캡처 모드가 항상 WGC(기본값)로 초기화됨. DXGI를 써야 하는 환경에서 매번 수동 선택 필요.

```javascript
// 현재: 저장 로직 없음
// fullscreen.html의 captureModeGroup 버튼 클릭 핸들러
btn.addEventListener('click', () => {
    group.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    // captureMode 저장 없음
});
```

**수정 방안:** `localStorage` 또는 `config`에 선택값 저장:

```javascript
// 선택 시 저장
localStorage.setItem('fullscreen-captureMode', btn.dataset.value);

// 초기화 시 복원
const saved = localStorage.getItem('fullscreen-captureMode') ?? 'wgc';
document.querySelectorAll('#captureModeGroup .mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === saved);
});
```

---

### 🟡 캡처 중단 에러 메시지가 지나치게 일반적

```javascript
// updateStatus() — 캡처 백엔드 IsDead() 상태 감지 시
errMsg.textContent = '캡처가 중단되었습니다. 다시 시도해 주세요.';
```

사용자가 이 메시지를 보면:
- 왜 중단됐는지 (게임 종료? PC 슬립? 드라이버 충돌?)
- 다시 시도 외에 다른 방법이 있는지 (DXGI로 전환?)

를 알 수 없음.

**수정 방안:**

```javascript
errMsg.textContent = '캡처가 중단되었습니다. 게임이 종료됐거나 드라이버 문제일 수 있습니다. 다시 시도하거나 캡처 모드를 변경해 보세요.';
```

캡처 모드 섹션도 다시 표시하여 즉시 모드 변경 후 재시도 가능하게:

```javascript
document.getElementById('captureModeSection').style.display = '';
```

---

## 정리

| 항목 | 수정 방향 |
|------|-----------|
| 분석 결과 유실 | 백엔드 메모리 버퍼 보관 + 창 열릴 때 초기 로드 |
| ZIP 해제 진행률 | label 텍스트로 "압축 해제 중..." 단계 표시 |
| 다운로드 취소 | abort 플래그 + 취소 버튼 |
| 서버/AI 구분 | 서버 상태 기반 세션 카드 메시지 분기 |
| 게임 미실행 경고 | 별도 amber 스타일 박스로 분리 |
| 시작 중 피드백 | 버튼 텍스트 "시작 중..." 전환 |
| 캡처 모드 저장 | localStorage 저장/복원 |
| 대화 상대 표시 | 첫 상대방 메시지 sender를 displayName으로 캡처 |
