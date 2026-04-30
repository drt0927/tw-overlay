# UX 리뷰 2 대응 결과

**리뷰 파일:** `review.md` (2026-04-30)  
**대응 브랜치:** `feature/20260424_fullscreen`

---

## 결과 요약

| 구분 | 항목 | 상태 | 비고 |
|------|------|------|------|
| scam-detector | 최근 분석 결과 내역 복원 | ✅ 수정 완료 | `_recentResults` 인메모리 20개 + 창 열 때 로드 |
| scam-detector | 다운로드 취소 버튼 | ✅ 수정 완료 | `_downloadAbortFlag` + `cancelDownload()` |
| scam-detector | 서버/AI 텍스트 분기 | ✅ 수정 완료 | `_serverStatus.ready` 기반 분기 |
| scam-detector | 압축 해제 진행 표시 | ✅ 수정 완료 | `onProgress(100, '압축 해제 중...')` label 전달 |
| scam-detector | 토글 OFF 즉시 상태 갱신 | ✅ 수정 완료 | `setTimeout(refreshServerStatus, 500)` |
| scam-detector | GPU 정보 미리 표시 | ✅ 수정 완료 | `loadModelStatus()`에서 `scamDetectGpu()` 호출 |
| scam-detector | 상대방 이름 표시 | ✅ 수정 완료 | `displayName` → "XXX와의 대화" |
| fullscreen | warningMsg 분리 | ✅ 수정 완료 | 앰버 색상 div, errMsg는 실제 오류에만 사용 |
| fullscreen | 시작 버튼 피드백 | ✅ 수정 완료 | 클릭 시 "시작 중..." 표시 |
| fullscreen | 캡처 모드 localStorage | ✅ 수정 완료 | 선택 시 저장, 창 열 때 복원 |
| fullscreen | 캡처 중단 메시지 개선 | ✅ 수정 완료 | 더 자세한 안내 + captureModeSection 노출 |

---

## 세부 내용

### ✅ 최근 분석 결과 인메모리 저장 (`scamMonitor.ts`)

```typescript
let _recentResults: ScamAnalysisResult[] = [];

export function getRecentResults(): ScamAnalysisResult[] {
  return _recentResults;
}
```

`analyze()` 내부, IPC send 직전:
```typescript
_recentResults.unshift(result);
if (_recentResults.length > 20) _recentResults.pop();
```

앱 재시작 시 초기화됨 (인메모리 저장). `scam-detector.html` `init()`에서:
```javascript
const past = await window.electronAPI.scamGetRecentResults();
past.forEach(r => appendLog(r));
```

---

### ✅ 다운로드 취소 (`scamMonitor.ts`, `scam-detector.html`)

`_downloadAbortFlag` 플래그를 `doModelDownload` 및 `httpsDownload` data 핸들러에서 체크:
```typescript
if (_downloadAbortFlag) {
  res.destroy();
  file.close();
  fs.unlink(tmpPath, () => {});
  _modelDownloading = false;
  reject(new Error('ABORTED'));
  return;
}
```

`downloadModel()` 시작 시 `_downloadAbortFlag = false` 리셋.

progress-area에 취소 버튼 추가 → `cancelDownload()` 호출 → UI 복원.

---

### ✅ 서버/AI 텍스트 분기 (`scam-detector.html`)

`_serverStatus` 모듈 레벨 변수에 `refreshServerStatus()` 결과 저장:
```javascript
_serverStatus = s;
```

분석 중 타이머 텍스트:
```javascript
// renderSessions
timerText = _serverStatus.ready ? '🔍 AI 분석 중...' : '⚙️ AI 서버 시작 중...';
// updateTimers
el.textContent = _serverStatus.ready ? '🔍 AI 분석 중...' : '⚙️ AI 서버 시작 중...';
```

---

### ✅ 압축 해제 진행 표시 (`scamMonitor.ts`, `ipcHandlers.ts`, `preload.ts`)

`onProgress` 시그니처 확장: `(pct: number, label?: string) => void`

각 `extractZip()` 호출 전:
```typescript
onProgress(100, '압축 해제 중...');
await extractZip(zipPath, binDir);
```

IPC 전달: `win?.webContents.send('scam-progress', pct, label)`

UI에서 label 수신: `document.getElementById('progress-label').textContent = label;`

---

### ✅ 토글 OFF 즉시 상태 갱신 (`scam-detector.html`)

```javascript
function onToggleEnabled(enabled) {
  window.electronAPI.scamSetEnabled(enabled);
  ...
  if (!enabled) setTimeout(refreshServerStatus, 500);
}
```

---

### ✅ GPU 정보 미리 표시 (`scam-detector.html`)

`loadModelStatus()`의 다운로드 필요 분기에서:
```javascript
const gpuInfo = await window.electronAPI.scamDetectGpu();
gpuInfoEl.textContent = gpuInfo?.gpuName ? `감지된 GPU: ${gpuInfo.gpuName}` : 'GPU 정보를 가져올 수 없습니다';
gpuInfoEl.classList.remove('hidden');
```

(`gpu-info-text` 엘리먼트는 기존에 `download-area` 내부에 이미 존재)

---

### ✅ 상대방 이름 표시 (`scamMonitor.ts`, `shared/types.ts`, `scam-detector.html`)

`SessionState.displayName?: string` 추가.

`ActiveSession.displayName: string` 추가, `startSession()`에서 `displayName: ''` 초기화.

`onNewLine()`에서 첫 non-SYSTEM 발신자 설정:
```typescript
if (!session.displayName && !msg.isSystem && msg.sender) {
  session.displayName = msg.sender;
}
```

세션 카드 표시:
```javascript
s.displayName ? escapeHtml(s.displayName) + '와의 대화' : escapeHtml(s.fileName)
```

---

### ✅ `warningMsg` 분리 (`fullscreen.html`)

앰버 색상 div 추가:
```html
<div id="warningMsg" class="text-[12px] text-amber-400 text-center p-2.5 bg-amber-500/10 rounded-xl border border-amber-500/20" style="display:none"></div>
```

게임 미실행 감지 → `warningMsg` 사용 + `mainBtn.disabled = true`. `errMsg`는 실제 기술 오류에만 사용.

---

### ✅ 시작 버튼 피드백 (`fullscreen.html`)

클릭 시 `mainBtn.textContent = '시작 중...'` 설정. 실패 시 `'전체화면 시작'`으로 복원.

---

### ✅ 캡처 모드 localStorage (`fullscreen.html`)

클릭 시 저장:
```javascript
localStorage.setItem('fullscreen-captureMode', btn.dataset.value);
```

초기화 시 복원:
```javascript
const savedCaptureMode = localStorage.getItem('fullscreen-captureMode');
if (savedCaptureMode) {
  document.querySelectorAll('#captureModeGroup .mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === savedCaptureMode);
  });
}
```

---

### ✅ 캡처 중단 메시지 개선 (`fullscreen.html`)

```javascript
errMsg.textContent = '캡처가 중단되었습니다. 캡처 모드를 변경하거나 재시작해보세요.';
document.getElementById('captureModeSection').style.display = '';
```

---

## 빌드 결과

```
✅ Resources copied to dist/ successfully.
```

TypeScript 컴파일 오류 없음.
