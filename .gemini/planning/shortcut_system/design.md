# ⌨️ 포커스 기반 동적 단축키 시스템 설계 (Shortcut System Design)

## 1. 개요 (Overview)
본 문서는 TW-Overlay의 단축키 관리 방식을 하드코딩에서 **사용자 정의 및 동적 등록/해제 구조**로 고도화하기 위한 설계안을 담고 있습니다.

### 핵심 원칙
- **리소스 효율성:** 테일즈위버 또는 본 프로그램이 포커스된 상태에서만 단축키가 동작하며, 포커스를 잃으면 즉시 해제하여 타 프로그램과의 충돌을 방지합니다.
- **확장성:** 새로운 기능(타이머, 메모장 등)이 추가될 때 단축키 연동이 용이하도록 중앙 집중식 레지스트리 구조를 가집니다.
- **사용자 편의성:** 사용자가 원하는 키 조합으로 단축키를 변경할 수 있도록 설정을 제공합니다.

---

## 2. 데이터 구조 (Data Schema)

### `src/shared/types.ts` 확장
`AppConfig` 인터페이스에 `shortcuts` 항목을 추가합니다.

```typescript
export interface ShortcutsConfig {
  /** 창 투과(Click-through) 토글 */
  toggleClickThrough: string;
  /** (향후 추가 예정) 커스텀 타이머 1 */
  customTimer1?: string;
}

// AppConfig 인터페이스에 추가
export interface AppConfig {
  // ... 기존 필드
  shortcuts: ShortcutsConfig;
}
```

### `src/modules/constants.ts` 기본값
```typescript
export const DEFAULT_CONFIG: AppConfig = {
  // ... 기존 설정
  shortcuts: {
    toggleClickThrough: 'CommandOrControl+Shift+T'
  }
};
```

---

## 3. 모듈 설계 (Module Architecture)

### `src/modules/shortcutManager.ts` (신설)
단축키의 실제 등록/해제 및 액션 실행을 담당하는 전담 모듈입니다.

#### 주요 메서드 (API)
1. **`setup(mainWindow: BrowserWindow)`**: 메인 윈도우 참조를 확보하여 액션 실행 시 활용합니다.
2. **`updateFocusState(isFocused: boolean)`**: 포커스 여부에 따라 전체 단축키를 등록(`registerAll`)하거나 해제(`unregisterAll`)합니다.
3. **`registerAll()`**: 설정 파일의 `shortcuts` 정보를 기반으로 `globalShortcut.register`를 수행합니다.
4. **`unregisterAll()`**: 모든 등록된 단축키를 해제합니다.

---

## 4. 통합 흐름 (Integration Flow)

### `src/main.ts` 리팩토링 방향
기존의 하드코딩된 단축키 로직을 제거하고 `shortcutManager`를 호출하는 구조로 변경합니다.

```typescript
// src/main.ts
tracker.setForegroundChangeListener((isGameFocused, focusedHwndStr) => {
  const electronHwnds = wm.getAllWindowHwnds();
  const isAppFocused = electronHwnds.includes(focusedHwndStr);
  
  // 통합된 포커스 상태를 shortcutManager에 전달
  shortcutManager.updateFocusState(isGameFocused || isAppFocused);
});
```

---

## 5. 구현 단계 (Implementation Steps)

### Phase 1: 기반 인프라 구축
1. `src/shared/types.ts`에 `ShortcutsConfig` 타입 정의.
2. `src/modules/constants.ts`에 기본 단축키 값 추가.
3. `src/modules/shortcutManager.ts` 신설 및 `globalShortcut` 로직 구현.

### Phase 2: 메인 프로세스 연동
1. `src/main.ts`에서 기존 하드코딩된 단축키 코드 제거.
2. `shortcutManager`를 초기화하고 포커스 이벤트와 연결.

### Phase 3: 설정 UI 구현 (추후 진행)
1. `settings.html`에 단축키 설정 섹션 추가.
2. 사용자가 키를 입력하면 해당 조합을 텍스트로 변환하여 저장하는 로직 구현.
3. 단축키 변경 시 즉시 앱에 반영되도록 IPC 통신 연결.
