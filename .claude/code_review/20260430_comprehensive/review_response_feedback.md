# 종합 리뷰 대응 결과 피드백

**날짜:** 2026-04-30  
**대상:** `review_response.md`

---

## 전체 평가

대응 완성도 높음. 적용 5개 항목 모두 올바르게 구현되었고, 미적용 3개 항목의 사유도 타당.  
아래 두 가지 사항 확인 필요.

---

## 확인된 문제

### ⚠️ `broadcastSessionUpdate` throttle — 용어 오류 + 동작 상 누락 가능성

**요약표:**
> `broadcastSessionUpdate` 과다 호출 | ✅ 수정 완료 | 16ms 트레일링 throttle 적용

**실제 구현:**

```typescript
function broadcastSessionUpdate(): void {
  if (_broadcastTimer) return;    // 타이머 있으면 skip
  _broadcastTimer = setTimeout(() => {
    _broadcastTimer = null;
    scamWin?.webContents.send('scam-session-update', ...);
  }, 16);
}
```

이 패턴은 **트레일링 throttle이 아님**.

| 구분 | 동작 |
|------|------|
| 트레일링 throttle | 마지막 호출 기준 16ms 후 실행 — 모든 burst의 최신 상태 전달 |
| **현재 구현** | 첫 호출 기준 16ms 후 실행, 그 16ms 내 후속 호출 전부 drop |

세션 분석 완료→상태변경→`broadcastSessionUpdate` 순서가 16ms 이상의 burst로 이어지면, burst 중간 상태 변화가 UI에 전달되지 않을 수 있음.

현재 사용 패턴(채팅 로그 수신, 분석 완료 이벤트)에서는 burst 길이가 짧아 실제 문제 발생 가능성이 낮으나, "트레일링"이라는 용어와 실제 구현이 불일치하는 것은 향후 버그 추적 시 혼란을 줄 수 있음.

→ 용어를 "leading-delay throttle" 또는 "첫 호출 기반 16ms 배치"로 수정하거나, 진짜 트레일링이 필요하다면 구현도 함께 변경 필요.

**트레일링 throttle 구현 참고:**

```typescript
function broadcastSessionUpdate(): void {
  if (_broadcastTimer) clearTimeout(_broadcastTimer);
  _broadcastTimer = setTimeout(() => {
    _broadcastTimer = null;
    const scamWin = wm.getScamDetectorWindow();
    scamWin?.webContents.send('scam-session-update', getSessionStates(), _sessionQueue.length);
  }, 16);
}
```

---

### 🔵 GPU 폴백 — 프로세스 exit 후 타이머 미정리

```typescript
proc.once('exit', () => res());
try { proc.kill(); } catch (_) {}
setTimeout(res, 2000);    // ← clearTimeout 없음
```

프로세스가 exit 이벤트로 먼저 완료된 후에도 2초 타이머가 살아있다가 `res()`를 다시 호출. Promise resolve는 멱등이므로 기능 오류는 없음.

영향도: 매우 낮음 — 수정 필수는 아님. 코드 명확성 측면에서만 언급.

```typescript
// clearTimeout 포함 버전
let timer: NodeJS.Timeout | null = null;
const done = () => { if (timer) { clearTimeout(timer); timer = null; } res(); };
proc.once('exit', done);
try { proc.kill(); } catch (_) {}
timer = setTimeout(done, 2000);
```

---

## 잘된 점

**GPU 폴백 event-based 대기**  
`stopServer()` 대신 직접 `proc`을 캡처해 `once('exit')` 핸들러를 붙인 판단이 정확함.  
`stopServer()`가 `_serverProcess = null`을 즉시 실행해 exit 이벤트를 붙일 수 없다는 이유를 코드 주석에 명시한 것도 좋음.

**`canAnalyze()` 헬퍼**  
기존 `analyze()`에서 누락된 `!session.closed` 체크와 `triggerAnalyze()`에서 누락된 `messages.length > 0` 체크를 통일하면서 두 함수 모두 강화됨. UI측 `updateTimers`는 데이터 경계가 달라 별도 유지한 판단도 적절.

**반복 분석 실패 알림 설계**  
3회 연속 실패 임계값과 알림 후 카운터 리셋(반복 스팸 방지)의 조합이 합리적. 탐지기 창이 닫혀있어도 OS 시스템 알림으로 전달되는 구조가 핵심 요구사항을 충족.

**미적용 사유 세 가지**  
- `httpsDownload`/`doModelDownload` 중복: WriteStream 생명주기 차이로 공통화 실익 없음 — 맞음  
- HWND `double`: JS 참조 코드 전체 수정 대비 실익 없음 — 맞음  
- `TEST_SCENARIOS`: 빌드 파이프라인 변경 수반 — 맞음
