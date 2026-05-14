# 🎨 TW-Overlay 디자인 토큰 가이드

이 문서는 TW-Overlay의 모든 HTML 화면에서 일관된 사용자 경험(UX)과 시각적 정체성을 유지하기 위한 디자인 표준을 정의합니다.

## 1. 기본 테마 (Base Theme)
- **배경 (Background)**: 다크 테마를 기본으로 하며, 투명도와 블러 효과를 적극 활용합니다.
  - `Panel Glass`: `rgba(15, 18, 30, 0.98)` 배경 + `backdrop-filter: blur(12px)`
  - `Sidebar Glass`: `rgba(20, 20, 35, 0.95)`
  - `Card Background`: `rgba(255, 255, 255, 0.05)` 또는 `rgba(30, 35, 60, 0.4)`

## 2. 색상 (Colors)

### 2.1 시스템 컬러 (System Colors)
- **Brand (Purple)**: `#a855f7` (Tailwind `purple-500`)
  - **TW-Overlay의 정체성을 상징하는 핵심 컬러입니다.** 강조색, 핵심 버튼 등에 사용합니다.
- **Danger (Red)**: `#ef4444` (Tailwind `red-500`) - 종료, 경보, 삭제
- **Info (Blue)**: `#3b82f6` (Tailwind `blue-500`) - 안내, 정보, 팁
- **Success (Green)**: `#22c55e` (Tailwind `green-500`) - 완료, 활성화, 최적화 적용

### 2.2 기능별 시그니처 컬러 (Feature Signature Colors)
TW-Overlay의 각 기능은 고유의 시그니처 색상을 가집니다. **기능의 아이콘 색상과 UI 포인트 색상은 반드시 일치시켜야 합니다.**

| 기능 (Feature) | 시그니처 색상 (Signature Color) | Tailwind Class | 주요 용도 |
| :--- | :--- | :--- | :--- |
| **모험 일지** | Teal (`#14b8a6`) | `teal-400` | 일지 메인 탭, 출석 체크 |
| **통계 리포트 / 갤러리** | Purple (`#a855f7`) | `purple-400` | 통계 대시보드, 갤러리 모니터, 외치기 기록 |
| **마정석 계산기 / 수익** | Orange (`#f97316`) | `orange-400` | 수익 그래프, 시드 합계, 마정석 정산 |
| **필드 보스 / 사기 감지** | Red (`#f87171`) | `red-400` | 보스 알림, 처치 기록, 사기꾼 탐지 AI |
| **숙제 체크 리스트** | Cyan (`#22d3ee`) | `cyan-400` | 컨텐츠 수행 여부, 완료 상태 |
| **약어 사전** | Blue (`#60a5fa`) | `blue-400` | 테일즈위버 용어/약어 검색 |
| **버프 백과 / 득템** | Amber (`#fbbf24`) | `amber-400` | 도핑 아이템 정보, 득템 알림 |
| **버프 타이머** | Violet (`#a78bfa`) | `violet-400` | 핵심 버프 게이지, 타이머 설정 |
| **거래 게시판** | Emerald (`#34d399`) | `emerald-400` | 매직위버 연동, 매물 알림 |
| **계수 계산기 / 로그** | Indigo (`#818cf8`) | `indigo-400` | 캐릭터 계수 분석, 로그 분석 설정 |
| **에타 랭킹** | Yellow (`#facc15`) | `yellow-400` | 실시간 에타 랭킹 조회 |
| **진화 계산기** | Lime (`#a3e635`) | `lime-400` | 진화 재료 및 비용 계산 |
| **커스텀 알림** | Pink (`#f472b6`) | `pink-400` | 사용자 지정 반복 알림 |
| **제복 시뮬레이터** | Rose (`#fb7185`) | `rose-400` | 제복 염색 미리보기 |
| **시스템 공통** | Slate (`#94a3b8`) | `slate-400` | 홈, 오버레이 토글, 마우스 투과 |

### 2.3 텍스트 (Text)
- **Main**: `#ffffff` (White)
- **Muted**: `rgba(255, 255, 255, 0.5)` (Tailwind `slate-400/50`)
- **Label**: `rgba(255, 255, 255, 0.6)` (Tailwind `slate-500`)

## 3. 모양 및 간격 (Layout & Shape)
- **Border Radius**:
  - `Card / Section`: `1.5rem` (`rounded-2xl`)
  - `Button / Input`: `0.75rem` (`rounded-xl`)
  - `Outer Window`: `0.75rem` (`rounded-xl`) - 윈도우 모서리
- **Borders**:
  - `Subtle`: `1px solid rgba(255, 255, 255, 0.05)`
  - `Medium`: `1px solid rgba(255, 255, 255, 0.1)`
- **Spacing**:
  - `Section Padding`: `1.5rem` (`p-6`)
  - `Item Gap`: `1rem` (`gap-4` 또는 `space-y-4`)

## 4. 공통 컴포넌트 스타일 (Common Components)

### 입력 필드 (Input Field)
- `bg-black/40`, `border-white/10`, `focus:border-purple-500`, `transition-all`
- 텍스트 크기: `0.875rem` (`text-sm`)

### 버튼 (Buttons)
- **Primary**: `bg-purple-600`, `hover:bg-purple-500`, `shadow-lg shadow-purple-900/20`
- **Icon Button**: `bg-purple-500/10`, `border-purple-500/30`, `text-purple-400`, `hover:bg-purple-500`, `hover:text-white`

### 스크롤바 (Scrollbar)
- `custom-scroll` 클래스 사용
- 트랙: `transparent`, 핸들: `rgba(255, 255, 255, 0.1)`, 핸들 호버: `rgba(255, 255, 255, 0.2)`

## 5. 애니메이션 (Animations)
- `transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1)`
- 클릭 시: `active:scale-95`
- 카드 호버: `hover:translate-y-[-2px]`, `hover:bg-white/[0.08]`
