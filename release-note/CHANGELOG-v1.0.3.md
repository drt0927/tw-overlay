# v1.0.3 - 클릭 투과 모드 개선 및 게임 연동 강화 (2026-02-14)

## 변경 사항

### 1. 클릭 투과 모드(Ctrl+Shift+T) 포커스 전환 개선

**문제:**
- 투과 모드 활성화 후에도 키보드 입력이 테일즈위버로 전달되지 않아 스킬 사용 등이 불가
- 투과 상태에서 마우스를 움직이면 브라우저의 hover 이벤트가 그대로 작동

**원인:**
- `SetForegroundWindow`만으로는 Windows 포커스 도용 방지 정책에 의해 다른 프로세스의 창에 포커스를 줄 수 없음
- `setIgnoreMouseEvents(true, { forward: true })`의 `forward: true` 옵션이 마우스 이동 이벤트를 Chromium에 계속 전달하여 CSS `:hover` 상태가 유지됨

**해결:**
- **track.ps1**: `keybd_event`(Alt 키 시뮬레이션) → `ShowWindow` → `BringWindowToTop` → `SetForegroundWindow` 순서로 호출하는 `FOCUS` 명령 추가
- **main.js**: 투과 ON 시 `setIgnoreMouseEvents(true)` (forward 없이, hover 완전 차단) + `mainWindow.blur()` → 50ms 후 `focusGameWindow()` 호출

**수정 파일:**
- `src/track.ps1`: Win32 API 추가 (`SetForegroundWindow`, `BringWindowToTop`, `keybd_event`, `ShowWindow`), `FOCUS` 명령 핸들러 구현
- `src/main.js`: `focusGameWindow()` 함수 추가, `FOCUSED`/`FOCUS_FAIL` 응답 파서 추가, 투과 모드 토글 로직 변경

---

### 2. 테일즈위버 종료 시 오버레이 자동 종료

**문제:**
- 게임을 종료해도 오버레이가 계속 남아있어 수동으로 닫아야 함

**해결:**
- **track.ps1**: 에러 응답을 `NOT_RUNNING`(프로세스 없음) / `MINIMIZED`(최소화)로 세분화
- **main.js**: `gameWasEverFound` 플래그로 게임이 한 번이라도 감지된 후 `NOT_RUNNING` 응답 시 `app.quit()` 호출
- 오버레이를 게임보다 먼저 실행한 경우에는 종료되지 않고 게임 시작을 대기

**수정 파일:**
- `src/track.ps1`: `Get-GameRect` 함수 반환값 변경 (`ERROR: Window not found` → `NOT_RUNNING`, `ERROR: Window is minimized` → `MINIMIZED`)
- `src/main.js`: `gameWasEverFound` 변수 추가, 폴링 루프에 `notRunning` 분기 추가

---

## 수정 파일 목록

| 파일 | 변경 내용 |
|------|-----------|
| `src/track.ps1` | Win32 API 4종 추가, FOCUS 명령 핸들러, 응답 문자열 세분화 |
| `src/main.js` | focusGameWindow 함수, 투과 모드 로직 개선, 게임 종료 감지 |
| `package.json` | 버전 1.0.2 → 1.0.3 |
