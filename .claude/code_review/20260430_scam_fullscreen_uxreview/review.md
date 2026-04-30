# UI/UX 리뷰: AI 사기꾼 탐지 + 풀스크린 업스케일링

**날짜:** 2026-04-30  
**대상 브랜치:** `feature/20260424_fullscreen` + `main` (v1.12.0)  
**리뷰 대상 파일:**
- `src/scam-detector.html`
- `src/fullscreen-dock.html`
- `src/fullscreen.html`
- `src/modules/windowManager.ts` (독 관련 부분)

---

## 우선순위 요약

| 중요도 | 항목 | 위치 |
|--------|------|------|
| 🔴 UX버그 | 독 버튼 active 상태 — 창 직접 닫기 시 초기화 안 됨 | `fullscreen-dock.html` / `windowManager.ts` |
| 🟠 UX버그 | 버튼 15개 한 줄 → 작은 모니터에서 독 잘림 | `fullscreen-dock.html` |
| 🟠 UX버그 | `onScamProgress` 리스너 중복 등록 → progress bar 역주행 가능 | `scam-detector.html:745,772` |
| 🟠 일관성 | 다운로드 실패 시 `alert()` 사용 | `scam-detector.html:757` |
| 🟠 기능누락 | 분석 이유/행동 지침이 로그에서 확인 불가 | `scam-detector.html:892` |
| 🟠 UX | 세션 리스트 전체 재구성으로 스크롤 초기화 | `scam-detector.html:581` |
| 🟡 불일치 | `updateTimers`의 `canAnalyze`가 `messageCount` 미체크 | `scam-detector.html:683` |
| 🟡 UX | 알람 미리듣기 볼륨이 실제 알람(100)과 다름 (80) | `scam-detector.html:814` |
| 🟡 안내부족 | 다운로드 중 toggle disabled 이유 미표시 | `scam-detector.html:537` |
| 🟡 의미불일치 | `gallery`에 `bell` 아이콘 | `fullscreen-dock.html:246` |
| 🟡 안내부족 | 풀스크린 창 닫기 ≠ 풀스크린 종료임을 미안내 | `fullscreen.html` |
| 🟡 편의 | `<details>` 상태 미저장 | `scam-detector.html:210,294` |
| 🟡 누락 | SSL 인증서 오류 시 다운로드 실패 + 폴백 로직 없음 | `scamMonitor.ts:144` / `scam-detector.html` |

---

## 1. 풀스크린 독 (`fullscreen-dock.html`)

### 🔴 UX버그: 독 버튼 active 상태가 창 직접 닫기 시 초기화되지 않음

`dock:feature-opened` IPC는 `openFeatureFromDock`의 `ready-to-show` 콜백에서 전송되지만,  
기능 창을 **독 외부에서 직접 닫을 때** `dock:feature-closed`를 전송하는 핸들러가 없음.

```typescript
// windowManager.ts — openFeatureFromDock 내부
win.webContents.once('ready-to-show', ...) => {
    fullscreenDockWindow?.webContents.send('dock:feature-opened', featureKey);
    // win.on('closed', ...) 에서 dock:feature-closed 전송 코드 없음
```

**현상:** 사용자가 버프 타이머 창의 ✕ 버튼으로 직접 닫아도 독 버튼이 파란 `active` 상태로 남음.  
`closeDock()` 또는 `Alt+Shift+F`로 풀스크린을 종료해야만 초기화됨.

**수정 방안:**

```typescript
// openFeatureFromDock에서 win 생성 직후 close 핸들러 추가
win.on('closed', () => {
    _dockOpenedWindows.delete(featureKey);
    fullscreenDockWindow?.webContents.send('dock:feature-closed', featureKey);
});
```

---

### 🟠 UX버그: 버튼 15개 한 줄 고정 → 작은 모니터에서 독 바가 화면 밖으로 나감

```css
.dock-items {
  display: flex;
  align-items: center;
  gap: 4px;
  /* flex-wrap 없음 */
}
```

버튼 15개 × 52px + 구분선 + 종료/닫기 버튼 = 약 900px 이상.  
1280px 이하 모니터(노트북, 1366×768)에서 독이 화면 좌측 밖으로 잘릴 수 있음.

**수정 방안 (택 1):**
- `flex-wrap: wrap` + `max-width: 90vw` + `justify-content: center` 적용
- 자주 쓰는 기능만 우선 배치하고 나머지는 "더보기" 버튼으로 숨기는 구조
- 버튼 크기를 `52px → 44px`로 줄여 전체 폭 축소

---

### 🟡 의미불일치: `gallery`에 `bell` 아이콘

```javascript
{ key: 'gallery', icon: 'bell', tooltip: '갤러리 모니터' },
```

`bell`은 알림/종 이미지로 갤러리 모니터와 의미가 맞지 않음.  
`image`, `monitor`, `layout-grid` 아이콘이 더 직관적.

---

### 🟡 독 열기 힌트 텍스트가 기능 창에 가려질 수 있음

```css
.overlay-hint { bottom: 76px; ... pointer-events: none; }
```

독에서 기능 창을 열면 힌트 텍스트 위치에 창이 겹쳐 안 보일 수 있음.  
힌트를 독 바 내부 우측에 통합하거나 첫 진입 시에만 표시하는 방식 권장.

---

## 2. 사기꾼 탐지 UI (`scam-detector.html`)

### 🟠 UX버그: `onScamProgress` 리스너 중복 등록 (`:745`, `:772`)

```javascript
// startDownload() — 클릭할 때마다 새 리스너 등록
window.electronAPI.onScamProgress((pct) => {
    document.getElementById('progress-pct').textContent = `${pct}%`;
    document.getElementById('progress-bar').style.width = `${pct}%`;
});

// redownloadBinary() — 또 다른 새 리스너 등록
window.electronAPI.onScamProgress((pct) => { ... });
```

다운로드 실패 후 재시도하거나, 두 함수를 순서대로 호출하면 리스너가 누적됨.  
이벤트 하나에 콜백 2개 이상 실행 → progress bar가 뒤로 가는 것처럼 보이는 시각 오류 발생 가능.

**수정 방안:** 리스너를 함수 외부에서 한 번만 등록.

```javascript
// 최상단 초기화 시 한 번만 등록
window.electronAPI.onScamProgress((pct) => {
    document.getElementById('progress-pct').textContent = `${pct}%`;
    document.getElementById('progress-bar').style.width = `${pct}%`;
});

// startDownload(), redownloadBinary() 내부의 onScamProgress 등록 코드 제거
```

---

### 🟠 일관성: 다운로드 실패 시 `alert()` 사용 (`:757`)

```javascript
alert(`다운로드 실패: ${result.error}`);
```

나머지 에러는 모두 인라인 상태 텍스트로 표시하는데 여기만 OS 기본 `alert()`.  
블로킹 모달이 뜨고 앱 스타일과 완전히 다른 다이얼로그가 나타남.

**수정 방안:**

```javascript
// alert() 제거 후 인라인으로 통일
statusEl.textContent = `❌ 다운로드 실패: ${result.error}`;
statusEl.style.color = '#f87171';
progressArea.classList.add('hidden');
downloadArea.classList.remove('hidden');
btn.disabled = false;
```

---

### 🟠 기능누락: 분석 이유/행동 지침이 최근 분석 결과 로그에서 확인 불가 (`:892`)

"최근 분석 결과" 로그 카드가 판정+시간+파일명+사기유형만 보여주고,  
LLM이 생성한 **분석 이유**(`analysisReason`)와 **행동 지침**(`actionGuidance`)을 볼 수 없음.

```javascript
// renderLog() — analysisReason, actionGuidance 미사용
return `<div class="log-entry ${r.verdict} mb-1.5">
  ...
  ${r.detectedScamTypes ? `<div ...>${escapeHtml(r.detectedScamTypes)}</div>` : ''}
  <!-- analysisReason, actionGuidance 없음 -->
</div>`;
```

세션 스트림 박스에서 실시간으로는 보이지만, 분석 완료 후에는 스트림 박스가 사라지고  
로그에서도 확인이 불가능해짐. 가장 중요한 "왜 위험한가", "어떻게 대응하라"가 휘발됨.

**수정 방안:** 로그 엔트리 클릭 시 상세 내용을 펼치는 accordion 추가.

```javascript
return `<div class="log-entry ${r.verdict} mb-1.5" onclick="this.querySelector('.log-detail').classList.toggle('hidden')">
  <div class="flex items-center justify-between gap-2">
    <span class="font-bold">${icon} ${label}</span>
    <span class="text-slate-500">${time}</span>
  </div>
  <div class="text-slate-500 mt-0.5" style="font-size:11px;">${escapeHtml(file)}</div>
  ${r.detectedScamTypes ? `<div ...>${escapeHtml(r.detectedScamTypes)}</div>` : ''}
  <div class="log-detail hidden mt-2 space-y-1" style="font-size:11px; color:#94a3b8;">
    ${r.analysisReason   ? `<p><strong>분석 이유:</strong> ${escapeHtml(r.analysisReason)}</p>` : ''}
    ${r.actionGuidance   ? `<p><strong>행동 지침:</strong> ${escapeHtml(r.actionGuidance)}</p>` : ''}
  </div>
</div>`;
```

---

### 🟠 UX: `renderSessions` 전체 innerHTML 재구성으로 스크롤 위치 소실 (`:581`)

```javascript
function renderSessions(sessions, queueLength = 0) {
    listEl.innerHTML = sessions.map(s => { ... }).join('');
    // 모든 DOM이 재생성됨
```

`scam-session-update` 이벤트마다(메시지 수신, 디바운스, 분석 시작/완료 등 자주 발생)  
세션 리스트 전체를 파괴 후 재생성. 사용자가 스트림 박스를 스크롤해 읽는 중 갑자기 위로 튀어오를 수 있음.

`updateTimers()`가 타이머 텍스트만 인플레이스 업데이트하는 아이디어는 잘 적용했지만,  
세션 카드 border 클래스 변경(analyzing 전환 시)도 같은 방식으로 분리 가능.

**수정 방안:** 세션 카드를 처음에만 생성하고, 이후 업데이트는 DOM 속성만 변경.

```javascript
function updateSessionCard(s) {
    const card = document.getElementById(`session-${makeBoxId(s.filePath)}`);
    if (!card) return createSessionCard(s);  // 없으면 신규 생성
    // 기존 카드의 클래스, 텍스트만 교체
    card.className = `session-card ${s.analyzing ? 'analyzing' : s.lastVerdict.toLowerCase()} mb-2`;
    // ... 개별 요소만 업데이트
}
```

---

### 🟡 불일치: `updateTimers`의 `canAnalyze`가 `messageCount` 미체크 (`:683`)

```javascript
// renderSessions: messageCount도 체크 (올바름)
const canAnalyze = !s.analyzing && s.messageCount > 0;

// updateTimers: analyzing만 체크 (불일치)
const canAnalyze = !analyzing;  // messageCount 없음
```

첫 렌더링에서 메시지 0개 세션의 버튼이 비활성화되지만,  
다음 `updateTimers` tick에서 활성화됨.

클릭해도 `analyze()` 내부에서 `session.messages.length === 0`으로 바로 반환하므로  
기능적 문제는 없지만, 버튼이 활성화되어 보여 사용자를 헷갈리게 함.

**수정 방안:** `data-message-count` 어트리뷰트 추가 후 `updateTimers`에서 참조.

---

### 🟡 UX: 알람 미리듣기 볼륨이 실제 알람과 다름 (`:814`)

```javascript
// 미리듣기 (볼륨 80)
window.electronAPI.playSound(sel.value, 80);

// 실제 알람 (scamMonitor.ts — 볼륨 100)
sidebar?.webContents.send('play-sound', { ..., volume: 100 });
```

미리듣기로 볼륨을 가늠하면 실제 알람이 더 크게 느껴짐.  
미리듣기도 100으로 통일하거나, "실제 알람 볼륨으로 재생" 레이블 추가 권장.

---

### 🟡 안내부족: 다운로드 중 toggle disabled 이유 미표시 (`:537`)

```javascript
if (toggle) toggle.disabled = true;  // tooltip 없음
```

다운로드 중 토글이 비활성화되지만 이유를 알 수 없음.

**수정 방안:**

```javascript
if (toggle) {
    toggle.disabled = true;
    toggle.title = '다운로드 완료 후 활성화됩니다.';
}
```

---

### 🟡 편의: `<details>` 섹션 상태 미저장 (`:210`, `:294`)

"권장 사양"과 "1:1 메신저 로그 기록 활성화 방법" `<details>`가 항상 `open`으로 초기화됨.  
창을 닫았다 다시 열면 사용자가 접어둔 상태가 초기화되어 스크롤이 길어짐.

**수정 방안:** `toggle` 이벤트에서 `localStorage`에 상태 저장.

```javascript
document.querySelectorAll('details').forEach(el => {
    const key = `details-${el.querySelector('summary').textContent.trim().slice(0, 20)}`;
    if (localStorage.getItem(key) === 'closed') el.open = false;
    el.addEventListener('toggle', () => {
        localStorage.setItem(key, el.open ? 'open' : 'closed');
    });
});
```

---

### 🟡 누락: SSL 인증서 오류 시 다운로드 실패 + 폴백 로직 없음 (`scamMonitor.ts:144`)

기업망/VPN/일부 공유기 환경에서는 HTTPS 요청이 중간에 자체 서명 인증서(self-signed certificate)로 가로채여 아래 에러와 함께 다운로드가 실패함.

```
Error: self-signed certificate in certificate chain
Error: unable to verify the first certificate
Error: certificate has expired
```

`galleryMonitor.ts`의 `fetchPage`는 이 케이스를 이미 처리하고 있음.

```typescript
// galleryMonitor.ts:102-108 — SSL 실패 시 rejectUnauthorized: false로 자동 재시도
req.on('error', (err) => {
  if (!skipSSLVerify && (err.message.includes('certificate') ||
                         err.message.includes('SSL') ||
                         err.message.includes('CERT'))) {
    log(`[GALLERY] SSL 검증 실패, 재시도: ${err.message}`);
    fetchPage(url, true).then(resolve).catch(reject);  // ← 폴백
    return;
  }
  reject(err);
});
```

반면 `scamMonitor.ts`의 `httpsDownload`에는 동일한 폴백이 없어,  
같은 환경에서 모델/바이너리 다운로드가 무조건 실패하고 사용자는 원인을 알 수 없음.

**코드 수정 방안:** `galleryMonitor.ts`와 동일한 패턴으로 `httpsDownload`에 폴백 추가.

```typescript
// scamMonitor.ts — httpsDownload 수정안
function httpsDownload(url: string, onProgress: (pct: number) => void, skipSSLVerify = false): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    const doGet = (u: string, redirectCount = 0) => {
      if (redirectCount > 10) { reject(new Error('Too many redirects')); return; }
      const options: https.RequestOptions = {
        headers: { 'User-Agent': 'tw-overlay/1.0' },
        rejectUnauthorized: !skipSSLVerify,  // ← 추가
      };
      https.get(u, options, (res) => {
        // ... 기존 로직
      }).on('error', (err) => {
        // SSL 오류 시 rejectUnauthorized: false로 자동 재시도
        if (!skipSSLVerify && /certificate|SSL|CERT/i.test(err.message)) {
          log(`[SCAM] SSL 검증 실패, 재시도: ${err.message}`);
          httpsDownload(url, onProgress, true).then(resolve).catch(reject);
          return;
        }
        reject(err);
      });
    };

    doGet(url);
  });
}
```

`downloadModel` 내부의 스트리밍 다운로드 함수(`doGet`)에도 동일하게 적용 필요.

**UI 안내 추가:** 폴백 재시도 중임을 사용자에게 알려주면 더 좋음.

```javascript
// scam-detector.html — startDownload() 내 에러 처리
// 현재: alert(`다운로드 실패: ${result.error}`)
// 개선: SSL 오류 메시지 감지 시 전용 안내 표시
if (result.error?.includes('certificate') || result.error?.includes('SSL')) {
    statusEl.textContent = '❌ SSL 인증서 오류로 다운로드 실패. 자동 재시도 중...';
} else {
    statusEl.textContent = `❌ 다운로드 실패: ${result.error}`;
}
```

---

## 3. 풀스크린 제어 창 (`fullscreen.html`)

### 🟡 안내부족: 풀스크린 창 닫기 ≠ 풀스크린 종료임을 명확히 안내하지 않음

창에 "닫기(ESC)" 버튼이 있고, 실제로 닫아도 풀스크린은 계속 실행됨.  
상단 statusBadge "ON"으로 힌트는 주지만, 처음 쓰는 사용자에게는 혼란.

**수정 방안:** 실행 중 상태에서 닫기 버튼 근처 또는 하단에 안내 문구 추가.

```html
<!-- isRunning 상태일 때 표시 -->
<div id="runningNotice" class="text-[11px] text-white/30 text-center" style="display:none">
  이 창을 닫아도 전체화면은 계속 실행됩니다
</div>
```

---

### 🟡 안내부족: 풀스크린 시작 전 게임 실행 여부 사전 감지 없음

창을 열었을 때 게임이 실행 중인지 확인하지 않음.  
버튼을 눌러야 `게임이 실행 중이지 않습니다` 에러를 볼 수 있음.

**수정 방안:** 창 초기화 IIFE에서 게임 상태 조회 후 미실행 시 경고 배너 표시.

```javascript
(async () => {
    const available = await api.fullscreenIsAvailable();
    if (!available) { /* ... */ return; }

    // 게임 실행 여부 사전 체크 추가
    const status = await api.fullscreenGetStatus();
    if (!status.isActive) {
        const gameRunning = await api.isGameRunning();  // 별도 IPC 필요
        if (!gameRunning) {
            errMsg.textContent = '⚠️ 게임이 실행 중이지 않습니다. 게임 실행 후 시작하세요.';
            errMsg.style.display = '';
            mainBtn.disabled = true;
        }
    }
})();
```
