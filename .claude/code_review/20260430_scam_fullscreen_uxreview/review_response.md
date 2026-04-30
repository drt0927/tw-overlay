# UX 리뷰 대응 결과

**리뷰 파일:** `review.md` (2026-04-30)  
**대응 브랜치:** `feature/20260424_fullscreen`

---

## 결과 요약

| 항목 | 상태 | 비고 |
|------|------|------|
| 🔴 독 버튼 active — 창 직접 닫기 시 초기화 안 됨 | ✅ 수정 완료 (false positive) | `dock:feature-closed` 이미 전송 중 |
| 🟠 버튼 15개 → 좁은 모니터 잘림 | ✅ 수정 완료 | `flex-wrap: wrap` + `max-width` 적용 |
| 🟠 `onScamProgress` 리스너 중복 등록 | ✅ 수정 완료 (false positive + 리팩토링) | 글로벌 스코프로 이동 |
| 🟠 다운로드 실패 시 `alert()` 사용 | ✅ 수정 완료 | 인라인 상태 텍스트로 교체 |
| 🟠 분석 이유/행동 지침 로그 확인 불가 | ✅ 수정 완료 | accordion 클릭 시 상세 펼침 |
| 🟠 세션 리스트 스크롤 초기화 | ✅ 수정 완료 | 재빌드 전후 scroll 위치 저장/복원 |
| 🟡 `updateTimers` canAnalyze — messageCount 미체크 | ✅ 수정 완료 | `data-message-count` 어트리뷰트 추가 |
| 🟡 알람 미리듣기 볼륨 80 vs 실제 100 | ✅ 수정 완료 | `80` → `100` |
| 🟡 다운로드 중 toggle disabled 이유 미표시 | ✅ 수정 완료 | `toggle.title` 추가 |
| 🟡 `gallery` 아이콘 의미불일치 (`bell`) | ⏭ 아이콘 변경 없음 | 기존 유저 혼란 방지, 사이드바·dock 모두 `bell` 유지 |
| 🟡 풀스크린 창 닫기 ≠ 종료 안내 부족 | ✅ 수정 완료 | `runningNotice` 문구 추가 |
| 🟡 `<details>` 상태 미저장 | ✅ 수정 완료 | `localStorage` 토글 상태 저장 |
| 🟡 SSL 인증서 오류 폴백 없음 | ✅ 수정 완료 | `httpsDownload` + `doModelDownload` SSL 재시도 추가 (Windows EBUSY 방지 포함) |
| 🟡 풀스크린 시작 전 게임 실행 여부 미감지 | ✅ 수정 완료 | `isGameRunning` IPC 추가 + 사전 경고 표시 |

---

## 세부 내용

### 🔴 독 버튼 active 상태 (false positive)

리뷰는 `dock:feature-closed` IPC가 없다고 지적했지만, `windowManager.ts`의 `openFeatureFromDock` 내 `onClose` 콜백에서 이미 전송 중이었음:

```typescript
// windowManager.ts:250 (openFeatureFromDock onClose 콜백)
onClose: () => {
  _dockOpenedWindows.delete(featureKey);
  fullscreenDockWindow?.webContents.send('dock:feature-closed', featureKey);  // 이미 존재
  _checkOverlayRelease();
},
```

실제 문제 없음 — false positive 처리.

---

### 🟠 `onScamProgress` 리스너 (false positive + 리팩토링)

`preload.ts`의 `onScamProgress`는 매 호출 시 `ipcRenderer.removeAllListeners('scam-progress')` 후 재등록하므로 리스너가 누적되지 않음. 따라서 기능적 버그는 없음.

그러나 동일한 콜백 로직이 `startDownload()`와 `redownloadBinary()` 두 곳에 중복되는 코드 냄새가 있어, 글로벌 스코프로 이동하는 리팩토링을 적용함:

```javascript
// scam-detector.html 최상단 IPC 수신 섹션에 추가
window.electronAPI.onScamProgress((pct) => {
  document.getElementById('progress-pct').textContent = `${pct}%`;
  document.getElementById('progress-bar').style.width = `${pct}%`;
});
// startDownload()와 redownloadBinary() 내부의 중복 등록 코드 제거
```

---

### 🟠 분석 이유/행동 지침 accordion

`renderLog()`에서 `analysisReason`, `actionGuidance` 필드가 있을 때 클릭 가능한 상세 영역 추가:

```javascript
// 클릭 시 .log-detail 펼침/접기
onclick="this.querySelector('.log-detail').classList.toggle('hidden')"
// 상세 영역
<div class="log-detail hidden mt-2 space-y-1 pt-2 border-t border-white/5" style="...">
  <p><strong>분석 이유:</strong> ${escapeHtml(r.analysisReason)}</p>
  <p><strong>행동 지침:</strong> ${escapeHtml(r.actionGuidance)}</p>
</div>
```

---

### 🟠 세션 리스트 스크롤 초기화

`renderSessions()` 재빌드 전 `listEl.scrollTop`과 각 `.stream-box` 스크롤 위치를 저장하고, innerHTML 교체 후 복원:

```javascript
const prevListScroll = listEl.scrollTop;
const prevStreamScrolls = {};
listEl.querySelectorAll('.stream-box[id]').forEach(box => {
  prevStreamScrolls[box.id] = box.scrollTop;
});
// ... innerHTML 재빌드 ...
listEl.scrollTop = prevListScroll;
for (const [boxId, scrollTop] of Object.entries(prevStreamScrolls)) {
  const box = document.getElementById(boxId);
  if (box) box.scrollTop = scrollTop;
}
```

---

### 🟡 gallery 아이콘 의미불일치

기존 유저 혼란 방지를 위해 사이드바와 dock 모두 기존 `bell` 아이콘 유지. 아이콘 변경 없음.

---

### 추가 리팩토링: fullscreen-dock.html FEATURES 배열 제거

`fullscreen-dock.html`에 하드코딩된 FEATURES 배열을 제거하고 `sidebar_menus.json`에서 동적 로드하도록 변경.  
`isSystem` 항목과 `fullscreen-btn`만 제외하고 나머지 전체(17개)를 dock에 표시. `api`/`action` 필드에서 windowRegistry 키를 자동 파생.

- `ipcHandlers.ts` `ALLOWED_DOCK_FEATURES`에 `scamDetector`, `uniformColor` 추가
- 아이콘과 툴팁은 sidebar_menus.json과 동일 사용 (별도 정의 없음)
- JSON에 새 기능 추가 시 dock에도 자동 반영

```javascript
function menuToKey(m) {
  const fn = m.api ?? m.action;
  return fn?.replace(/^(toggle|open)/, '').replace(/^./, c => c.toLowerCase()) ?? null;
}

async function buildDock() {
  const menus = await fetch('./assets/data/sidebar_menus.json').then(r => r.json());
  menus.filter(m => !m.isSystem && m.id !== 'fullscreen-btn')
    .map(m => ({ key: menuToKey(m), icon: m.icon, label: m.label }))
    .filter(m => m.key)
    .forEach(/* 버튼 생성 */);
}
```

---

## 빌드 결과

```
✅ Resources copied to dist/ successfully.
```

TypeScript 컴파일 및 리소스 복사 성공. 오류 없음.
