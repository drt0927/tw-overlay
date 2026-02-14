# TW-Overlay 변경 이력

## 아키텍처 개요

```
src/
├── main.js                  # 앱 진입점 (라이프사이클, 폴링, 단축키)
├── preload.js               # 렌더러 ↔ 메인 프로세스 브릿지 (contextBridge)
├── index.html               # 메인 윈도우 UI (상단바, 메뉴, 설정)
├── sidebar.html             # 사이드바 UI (퀵슬롯, 설정편집, 갤러리 모니터)
├── style.css                # 추가 스타일
├── track.ps1                # 게임 창 좌표 추적 PowerShell 스크립트
└── modules/
    ├── constants.js          # 전역 상수 (경로, 타이밍, 기본설정)
    ├── logger.js             # 파일 로깅 (1MB 로테이션)
    ├── config.js             # 설정 로드/저장 (디바운스)
    ├── tracker.js            # 게임 창 추적 (상주 PowerShell 프로세스)
    ├── windowManager.js      # 창 관리 (메인, 사이드바, BrowserView)
    ├── ipcHandlers.js        # IPC 이벤트 핸들러 등록
    └── galleryMonitor.js     # DC인사이드 갤러리 모니터
```

---

## 주요 변경사항

### 1. 모듈 분리 리팩토링

기존 `main.js` 단일 파일(1000줄+)을 6개 모듈로 분리.

| 모듈 | 역할 |
|---|---|
| `constants.js` | 게임 프로세스명, 타이밍 상수, 기본 설정값 |
| `logger.js` | 파일 로깅 + 1MB 로테이션 |
| `config.js` | JSON 설정 로드/저장, 디바운스 저장 |
| `tracker.js` | PowerShell 상주 프로세스로 게임 창 좌표 추적 |
| `windowManager.js` | 메인/사이드바/BrowserView 생성 및 동기화 |
| `ipcHandlers.js` | 모든 IPC 이벤트 등록 (한 곳에서 관리) |

### 2. 사이드바 퀵슬롯

- 게임 창 우측 가장자리에 36px 슬롯 바 표시
- 아이콘/텍스트 모드 지원 (Lucide 아이콘 피커 포함)
- 외부 브라우저 열기 옵션 (보라색 점 표시)
- 퀵슬롯 설정 패널: 추가/삭제/순서변경/아이콘선택
- 사이드바 접기/펼치기 토글

### 3. DC인사이드 갤러리 모니터

#### 기능
- 테일즈위버 마이너갤러리 1페이지 새 글 감지 → 알림
- 특정 글번호 댓글 변화 감지 → 알림
- 글 클릭 시 시스템 기본 브라우저로 열기 (`shell.openExternal`)

#### 댓글 조회 방식
기존 HTML GET + 정규식 파싱 → **POST `/board/comment/` API** (JSON 응답)로 변경.

```
POST https://gall.dcinside.com/board/comment/
Content-Type: application/x-www-form-urlencoded
X-Requested-With: XMLHttpRequest

id=talesweaver&no={postNo}&cmt_id=talesweaver&cmt_no={postNo}
&e_s_n_o={token}&comment_page=1&sort=D&_GALLTYPE_=MI
```

#### 블락 방지 정책
| 정책 | 값 |
|---|---|
| 요청 간 랜덤 딜레이 | 1.5~3초 |
| 한 사이클 최대 댓글 체크 | 5개 |
| 에러 시 지수 백오프 | 1분 → 2분 → 4분 → 5분(max) |
| 체크 주기 | 60초 |

#### 알림 on/off
- 사이드바 갤러리 패널 헤더에 벨/벨-off 토글 버튼
- OFF 시 목록/댓글 체크 모두 스킵 (폴링 유지, 실제 요청 안 함)
- OFF → ON 전환 시 기준점 리셋 (알림 홍수 방지):
  - `lastSeenPostNo = 0` → 다음 체크에서 현재 상태를 기준으로 설정
  - 감시 글 `commentCount = -1` → 다음 체크에서 갱신만 하고 알림 안 보냄

#### 레드닷 (알림 배지)
- `gallery-new-activity` IPC 이벤트로 정확한 시점에만 표시
- 새 글 감지 또는 댓글 수 증가 시에만 활성화
- 갤러리 패널 열면 자동 숨김

#### 글 목록 파싱 필터
- 공지: `data-type="icon_notice"` 제외
- 설문: `data-type="icon_survey"` 제외
- 광고: `data-no` 속성 없는 AD 자동 필터링

### 4. 클릭 투과 모드 개선

#### 변경 전
- `Ctrl+Shift+T` 시 메인 윈도우 + 사이드바 모두 투과

#### 변경 후
- **메인 윈도우만** 투과 (사이드바는 항상 클릭 가능)
- 사이드바 투명 영역 클릭 통과 처리:
  - `setIgnoreMouseEvents(true, { forward: true })` 기본 설정
  - UI 요소(`wrapper`, `gallery-panel`, `settings-panel`) `mouseenter` → 클릭 활성화
  - UI 요소 `mouseleave` → 다시 클릭 통과

#### 사이드바 윈도우 최적화
| 옵션 | 값 | 이유 |
|---|---|---|
| `width` | 38px | 실제 UI 크기에 맞춤 (투명 영역 최소화) |
| `resizable` | `false` | 리사이즈 핸들 영역 제거 |
| `thickFrame` | `false` | Windows WS_THICKFRAME 스타일 제거 (~5px 패딩 방지) |
| `box-sizing` | `border-box` | border가 width 안에 포함되도록 |

### 5. 갤러리 패널 방향

- 갤러리/설정 패널을 게임 창 **안쪽이 아닌 바깥**으로 펼침
- `setSidebarSettingsMode`: 게임 우측 가장자리(`rightEdge`)에서 시작하여 320px 확장

### 6. UI/UX 개선

- 벨 아이콘: 사이드바 최상단 (접기 버튼 바로 아래)
- 다크네이비 + 바이올렛 통일 테마
- 아이콘 피커: Lucide 아이콘 전체 목록, 검색, 페이징
- 슬롯 아이콘/텍스트 모드 토글

---

## 파일별 주요 변경

### `windowManager.js`
- 사이드바 윈도우: `width: 38px`, `resizable: false`, `thickFrame: false`
- `ready-to-show`에서 `setIgnoreMouseEvents(true, { forward: true })` 설정
- `toggleClickThrough`: 사이드바 `setIgnoreMouseEvents` 호출 제거 (메인만 투과)
- `setSidebarSettingsMode`: 패널 방향 게임 밖으로

### `ipcHandlers.js`
- `set-ignore-mouse-events` IPC 핸들러 추가 (사이드바 투과용)
- `gallery-*` IPC 핸들러 추가 (add-watch, remove-watch, get-watched, force-check, get-notify, set-notify, open-post)

### `preload.js`
- `setIgnoreMouseEvents` API 추가
- `gallery*` API 추가 (galleryAddWatch, galleryRemoveWatch, galleryGetWatched, galleryForceCheck, galleryOpenPost, galleryGetNotify, gallerySetNotify)
- `onGalleryPosts`, `onGalleryNewActivity` 이벤트 리스너

### `sidebar.html`
- `box-sizing: border-box` 추가
- 벨 아이콘 + 레드닷 배지 (최상단)
- 갤러리 패널 (글 목록, 감시 목록, 알림 토글)
- `mouseenter/mouseleave`로 투명 영역 클릭 투과

### `galleryMonitor.js`
- POST 댓글 API (`/board/comment/`)
- 블락 방지 (랜덤 딜레이, 최대 체크 수, 지수 백오프)
- 알림 on/off + 기준점 리셋
- `gallery-new-activity` IPC 이벤트

---

## 단축키

| 단축키 | 기능 |
|---|---|
| `Ctrl+Shift+T` | 클릭 투과 모드 토글 (메인 윈도우만) |
| `Enter` (주소창) | URL 이동 |
