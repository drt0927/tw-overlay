# UX 리뷰 2 대응 결과 피드백

**날짜:** 2026-04-30  
**대상:** `review_response.md`

---

## 전체 평가

11개 항목 전부 처리됨. 특히 `_recentResults` 백엔드 버퍼 패턴과 `warningMsg` 분리가 핵심 이슈를 정확히 해결함.  
아래 세 가지 사항 확인 필요.

---

## 확인된 문제

### ⚠️ `displayName` — 첫 발신자가 "나"일 수 있음

```typescript
// scamMonitor.ts — onNewLine()
if (!session.displayName && !msg.isSystem && msg.sender) {
  session.displayName = msg.sender;  // 첫 발신자가 내 아이디일 수 있음
}
```

파서가 `color="#c8ffc8"` (상대방)과 `color="#ffffff"` (나) 양쪽을 동일하게 처리하므로,  
내가 먼저 말을 건 대화에서는 `displayName`이 내 아이디로 설정됨.  
세션 카드에 "내아이디와의 대화"가 표시되어 혼란을 줄 수 있음.

근본 해결은 어려움 — "나"의 아이디를 판별할 기준이 없음.  
대신 `config`에 저장된 캐릭터명이나 계정명이 있다면 비교 가능하나, 현재 구조에서는 해당 정보가 없음.

**현실적 대응 방안:**

파일명 fallback이 이미 적용되어 있어(`s.displayName ? ... : s.fileName`) 최악의 경우는 방지됨.  
추가로 `displayName`이 설정됐더라도 세션 카드에 파일명을 서브텍스트로 병기하면 혼란 감소:

```javascript
// 변경 전
s.displayName ? escapeHtml(s.displayName) + '와의 대화' : escapeHtml(s.fileName)

// 변경 후 (병기)
`${s.displayName ? escapeHtml(s.displayName) + '와의 대화' : escapeHtml(s.fileName)}
 <span class="text-slate-600" style="font-size:10px;">${escapeHtml(s.fileName)}</span>`
```

수정 필수는 아님. 인지하고 현행 유지도 무방.

---

### ❌ 다운로드 취소 시 `file.close()` / `fs.unlink()` 이중 호출 가능

```typescript
// _downloadAbortFlag 체크 블록
if (_downloadAbortFlag) {
  res.destroy();                         // ← 내부적으로 'error' 이벤트 발생 가능
  file.close();
  fs.unlink(tmpPath, () => {});
  _modelDownloading = false;
  reject(new Error('ABORTED'));
  return;
}

// file error 핸들러
file.on('error', (err) => {
  file.close(); fs.unlink(tmpPath, () => {});   // ← 취소로 인한 에러 시 중복 호출
  _modelDownloading = false; reject(err);
});
```

`res.destroy()` 호출 시 Node.js는 내부적으로 'error' 이벤트를 발생시킬 수 있음.  
Promise 이중 reject는 무시되지만 `file.close()` / `fs.unlink()` 가 두 번 호출되어  
불필요한 에러 로그가 찍히거나 이미 닫힌 fd에 접근할 수 있음.

**수정 방안:** 함수 스코프 로컬 플래그로 이중 처리 차단:

```typescript
let _aborted = false;

if (_downloadAbortFlag) {
  _aborted = true;
  res.destroy();
  file.close(() => fs.unlink(tmpPath, () => {}));  // close 완료 후 unlink (순서 보장)
  _modelDownloading = false;
  reject(new Error('ABORTED'));
  return;
}

file.on('error', (err) => {
  if (_aborted) return;   // 취소로 인한 에러면 무시
  file.close(); fs.unlink(tmpPath, () => {});
  _modelDownloading = false; reject(err);
});
```

---

### ❌ `progress-label`에 `undefined` 텍스트 표시 가능

```javascript
// scam-detector.html — onScamProgress 핸들러
window.electronAPI.onScamProgress((pct, label) => {
  document.getElementById('progress-pct').textContent = `${pct}%`;
  document.getElementById('progress-bar').style.width  = `${pct}%`;
  document.getElementById('progress-label').textContent = label;  // label 미전달 시 "undefined"
});
```

일반 다운로드 진행률 업데이트에서는 `label`을 전달하지 않으므로 `undefined`.  
`"다운로드 중..."` 텍스트가 `"undefined"`로 덮어씌워짐.

**수정 방안:**

```javascript
window.electronAPI.onScamProgress((pct, label) => {
  document.getElementById('progress-pct').textContent = `${pct}%`;
  document.getElementById('progress-bar').style.width  = `${pct}%`;
  if (label !== undefined) document.getElementById('progress-label').textContent = label;
});
```

---

## 잘된 점

**`_recentResults` 백엔드 버퍼 패턴**  
가장 중요한 이슈(창 닫혀있을 때 분석 결과 유실)를 모듈 레벨 버퍼로 정확히 해결.  
`init()`에서 `past.forEach(r => appendLog(r))`로 창 재오픈 시 자동 복원.  
앱 재시작 시 초기화된다는 한계를 명시한 것도 좋음.

**`_downloadAbortFlag` 설계**  
모듈 레벨 플래그로 `httpsDownload`와 `doModelDownload` 양쪽을 동시에 커버할 수 있는 구조.  
`downloadModel()` 시작 시 플래그 리셋으로 재시도 흐름도 처리됨.

**`warningMsg` 분리**  
`errMsg`(빨간색)를 실제 기술 오류 전용으로 명확히 분리. 게임 미실행 안내가 앰버 색상으로 표시되어 사용자 혼란 제거.

**`captureModeSection` 재노출 (캡처 중단 시)**  
중단 에러 메시지와 함께 캡처 모드 선택 UI를 다시 표시해 "DXGI로 전환 후 재시도" 흐름을 자연스럽게 유도. 메시지만 바꿔선 안 되고 UI도 복원해야 한다는 점을 놓치지 않음.
