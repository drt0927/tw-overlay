# 🎨 TW-Overlay 디자인 토큰 가이드

이 문서는 TW-Overlay의 모든 HTML 화면에서 일관된 사용자 경험(UX)과 시각적 정체성을 유지하기 위한 디자인 표준을 정의합니다.

## 1. 기본 테마 (Base Theme)
- **배경 (Background)**: 다크 테마를 기본으로 하며, 투명도와 블러 효과를 적극 활용합니다.
  - `Panel Glass`: `rgba(15, 18, 30, 0.98)` 배경 + `backdrop-filter: blur(12px)`
  - `Sidebar Glass`: `rgba(20, 20, 35, 0.95)`
  - `Card Background`: `rgba(255, 255, 255, 0.05)` 또는 `rgba(30, 35, 60, 0.4)`

## 2. 색상 (Colors)
- **Signature Color (Purple)**: `#a855f7` (Tailwind `purple-500`)
  - **TW-Overlay의 정체성을 상징하는 핵심 브랜드 컬러입니다.**
  - 강조색, 핵심 버튼, 활성화 상태 아이콘, 주요 UI 포인트에 반드시 이 색상을 최우선으로 사용합니다.
- **Danger (Red)**: `#ef4444` (Tailwind `red-500`)
  - 종료 버튼, 장판 경보, 삭제 액션에 사용
- **Info (Blue)**: `#3b82f6` (Tailwind `blue-500`)
  - 안내 배너, 팁, 정보성 텍스트에 사용
- **Success (Green)**: `#22c55e` (Tailwind `green-500`)
  - 활성화 상태(ON), 완료, 최적화 적용 상태에 사용
- **Text**:
  - `Main`: `#ffffff` (White)
  - `Muted`: `rgba(255, 255, 255, 0.5)` (Tailwind `slate-400/50`)
  - `Label`: `rgba(255, 255, 255, 0.6)` (Tailwind `slate-500`)

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
