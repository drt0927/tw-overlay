# 종합 리뷰 대응 결과

**리뷰 파일:** `review.md` (2026-04-30)  
**대응 브랜치:** `feature/20260424_fullscreen`

---

## 결과 요약

| 관점 | 항목 | 상태 | 비고 |
|------|------|------|------|
| 아키텍처 | `httpsDownload` / `doModelDownload` 중복 | ⏭ 미적용 | 역할이 달라 통합 실익 없음 (하단 참조) |
| 아키텍처 | `getStandardOptions` `any` 타입 | ✅ 수정 완료 | `Electron.BrowserWindowConstructorOptions`로 교체 |
| 보안 | `scam-close-session` / `scam-trigger-analyze` filePath 미검증 | ✅ 수정 완료 | `typeof filePath !== 'string'` 가드 추가 |
| 보안 | HWND `double` 정밀도 손실 | ⏭ 미적용 | 실제 위험 없음 (하단 참조) |
| 동시성 | GPU 폴백 1500ms 고정 대기 | ✅ 수정 완료 | `exit` 이벤트 기반 + 2초 보험 타임아웃 |
| 에러 처리 | 반복 분석 실패 시 사용자 알림 없음 | ✅ 수정 완료 | 연속 3회 실패 시 `Notification` 팝업 |
| 성능 | `broadcastSessionUpdate` 과다 호출 | ✅ 수정 완료 | 16ms 트레일링 throttle 적용 (burst 최신 상태 보장) |
| 코드 품질 | `analyze()` 진입 조건 분산 | ✅ 수정 완료 | `canAnalyze()` 헬퍼로 통일 |
| 코드 품질 | `TEST_SCENARIOS` 프로덕션 번들 포함 | ⏭ 미적용 | 장기 리팩토링 (하단 참조) |

---

## 세부 내용

### ✅ `getStandardOptions` 타이핑 (`windowManager.ts`)

```typescript
// 변경 전
function getStandardOptions(width: number, height: number, extraProps: any = {}): any

// 변경 후
function getStandardOptions(
  width: number, height: number,
  extraProps: Electron.BrowserWindowConstructorOptions = {}
): Electron.BrowserWindowConstructorOptions
```

오타 및 유효하지 않은 옵션을 컴파일 타임에 잡을 수 있게 됨.

---

### ✅ `filePath` 타입 검증 (`ipcHandlers.ts`)

```typescript
// 변경 전
ipcMain.on('scam-close-session', (_e, filePath: string) => scam.closeSession(filePath));

// 변경 후
ipcMain.on('scam-close-session', (_e, filePath: unknown) => {
  if (typeof filePath === 'string') scam.closeSession(filePath);
});
```

`scam-trigger-analyze`도 동일하게 적용. 런타임 타입 방어.

---

### ✅ GPU 폴백 event-based 대기 (`scamMonitor.ts`)

```typescript
// 변경 전
stopServer();
await new Promise(r => setTimeout(r, 1500));
await spawnServer(0);

// 변경 후
await new Promise<void>((res) => {
  const proc = _serverProcess;
  if (!proc) { res(); return; }
  proc.once('exit', () => res());
  try { proc.kill(); } catch (_) {}
  setTimeout(res, 2000); // 2초 후 강제 진행 (보험)
});
_serverProcess = null;
_serverReady = false;
await spawnServer(0);
```

`proc.kill()` 후 OS가 프로세스를 실제로 종료할 때까지 대기. 2초 보험으로 무한 대기 방지.  
`stopServer()` 대신 직접 처리하는 이유: `stopServer()`는 `_serverProcess = null`을 즉시 실행해 exit 이벤트를 붙일 수 없음.

---

### ✅ 반복 분석 실패 알림 (`scamMonitor.ts`)

`ActiveSession`에 `consecutiveFailures: number` 필드 추가. 분석 성공 시 0으로 리셋, 실패 시 증가. 3회 연속 실패 시 `Electron.Notification`으로 시스템 알림 표시 후 카운터 리셋(반복 스팸 방지):

```typescript
} catch (e) {
  session.newSinceLastAnalysis = savedCount;
  session.consecutiveFailures++;
  log(`[SCAM] 분석 실패 (${session.consecutiveFailures}회 연속): ${e}`);
  if (session.consecutiveFailures >= 3) {
    new Notification({
      title: '사기꾼 탐지 AI',
      body: `분석이 ${session.consecutiveFailures}회 연속 실패했습니다. 탐지기에서 서버 상태를 확인해주세요.`,
    }).show();
    session.consecutiveFailures = 0;
  }
}
```

탐지기 창이 닫혀있어도 OS 시스템 알림으로 전달.

---

### ✅ `broadcastSessionUpdate` 16ms 트레일링 throttle (`scamMonitor.ts`)

```typescript
let _broadcastTimer: NodeJS.Timeout | null = null;

function broadcastSessionUpdate(): void {
  if (_broadcastTimer) clearTimeout(_broadcastTimer);  // 기존 타이머 리셋
  _broadcastTimer = setTimeout(() => {
    _broadcastTimer = null;
    const scamWin = wm.getScamDetectorWindow();
    scamWin?.webContents.send('scam-session-update', getSessionStates(), _sessionQueue.length);
  }, 16);
}
```

호출마다 타이머를 리셋해 16ms 정적 후 가장 최신 상태를 전송. burst의 마지막 상태가 항상 UI에 전달됨. (초기 구현의 `if (_broadcastTimer) return` 패턴은 첫 호출만 살리고 burst 내 후속 상태가 누락될 수 있었음 — 수정 완료)

---

### ✅ `canAnalyze()` 헬퍼 (`scamMonitor.ts`)

```typescript
function canAnalyze(session: ActiveSession): boolean {
  return !session.closed && !session.analyzing && session.messages.length > 0;
}
```

기존에 세 곳에 분산된 진입 조건을 통일:
- `analyze()`: `if (session.analyzing || session.messages.length === 0)` → `if (!canAnalyze(session))`
- `triggerAnalyze()`: `if (!session || session.closed || session.analyzing)` → `if (!session || !canAnalyze(session))`

(UI측 `updateTimers`의 `data-message-count` 기반 체크는 서버와 데이터 경계가 달라 별도 유지)

---

## 미적용 항목 사유

### `httpsDownload` / `doModelDownload` 중복 리팩토링

두 함수의 핵심 차이:
- `httpsDownload`: 메모리 Buffer 수집 → SSL 폴백은 함수 자신을 재귀 호출
- `doModelDownload`: 파일 WriteStream 스트리밍 → SSL 폴백은 `file.close() → fs.unlink() → 재귀` 콜백 체인

공통 request builder를 추출해도 WriteStream 생명주기(생성/error핸들러/close) 처리가 각 함수에 남아 코드 절감이 미미함. 오히려 추상화 복잡도가 늘어남. 현상 유지.

### HWND `double` 정밀도

Windows HWND는 64비트 커널 주소가 아닌 32비트 핸들 테이블 인덱스(상위 비트 0)이므로 실제로 `2^53`을 초과한 사례 없음. `BigInt` 교체 시 JS 측 참조 코드 전체 수정 필요. 실익 대비 비용 과다. 현상 유지.

### `TEST_SCENARIOS` 프로덕션 번들 분리

IPC 핸들러(`scam-inject-test`)가 ipcHandlers.ts에 등록되어 있어 단순 파일 분리로는 해결 안 됨. 빌드 플래그 기반 조건부 컴파일(`#ifdef DEV`) 또는 `electron-builder extraResources` 패턴 적용이 필요하며, 현재 빌드 파이프라인 변경이 수반됨. 보안 영향 없으므로 장기 과제로 이월.

---

## 빌드 결과

```
✅ Resources copied to dist/ successfully.
```

TypeScript 컴파일 오류 없음.
