/**
 * 일일/주간 컨텐츠 체크 리스트 로직 모듈
 */
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import * as config from './config';
import { ContentsCheckerItem, ResetRule, MAIN_CHAR_ID, DEFAULT_CHAR_NAME } from '../shared/types';
import { log } from './logger';
import * as diaryDb from './diaryDb';

/** 기본 컨텐츠 JSON 로드 */
function loadDefaultItems(): ContentsCheckerItem[] {
  try {
    // dist/assets/data/contents.json 경로 계산
    const jsonPath = path.join(app.getAppPath(), 'dist', 'assets', 'data', 'contents.json');
    if (fs.existsSync(jsonPath)) {
      const data = fs.readFileSync(jsonPath, 'utf-8');
      return JSON.parse(data);
    } else {
      log(`[Contents] JSON 파일을 찾을 수 없음: ${jsonPath}`);
    }
  } catch (e) {
    log(`[Contents] 기본 데이터 로드 실패: ${e}`);
  }
  return [];
}

/** 초기화 및 병합 (앱 시작 시 호출) */
export function init(): void {
  const cfg = config.load();
  const defaultItems = loadDefaultItems();
  
  let currentItems = cfg.contentsCheckerItems || [];
  let changed = false;

  // 0. ID 및 리셋 룰 마이그레이션 (일일 -> 주간)
  const ID_MIGRATION_MAP: Record<string, string> = {
    'daily-mur-1': 'weekly-mur-1',
    'daily-abyss-treasure': 'weekly-abyss-treasure',
    'daily-power-root': 'weekly-power-root',
    'daily-rune-dungeon': 'weekly-rune-dungeon',
    'daily-tesis-core': 'weekly-tesis-core',
    'daily-digsite': 'weekly-digsite',
    'daily-fortress-ghost': 'weekly-fortress-ghost',
    'daily-eclipse-6boss': 'weekly-eclipse-6boss',
    'daily-eclipse-recapture-supplies': 'weekly-eclipse-recapture-supplies',
    'daily-eclipse-special-force-suppression': 'weekly-eclipse-special-force-suppression',
    'daily-apethiria-ex': 'weekly-apethiria-ex',
    'daily-moon-queen': 'weekly-moon-queen',
    'daily-eclipse-boss': 'weekly-eclipse-boss',
    'daily-ancient-relic-shinjo': 'weekly-ancient-relic-shinjo',
    'daily-ancient-relic-kishinik': 'weekly-ancient-relic-kishinik'
  };

  currentItems.forEach((item: any) => {
    if (ID_MIGRATION_MAP[item.id]) {
      const newId = ID_MIGRATION_MAP[item.id];
      log(`[Contents Checker] 마이그레이션: ${item.id} -> ${newId}`);
      item.id = newId;
      item.resetRule = { type: 'weekly', dayOfWeek: 1, hour: 0 };
      item.maxCount = 7;

      if (item.completedState) {
        Object.keys(item.completedState).forEach(charId => {
          const state = item.completedState[charId];
          if (state.currentCount === undefined) {
            state.currentCount = state.isCompleted ? 7 : 0;
          }
        });
      }
      changed = true;
    }
  });

  // currentItems를 순회하며 defaultItems에 정의된 maxCount를 동기화
  currentItems.forEach(item => {
    const def = defaultItems.find(d => d.id === item.id);
    if (def && item.maxCount !== def.maxCount) {
      item.maxCount = def.maxCount;
      changed = true;
    }
  });

  // 1. 캐릭터 프리셋 초기화
  let characterPresets = cfg.characterPresets || [];
  if (characterPresets.length === 0) {
    characterPresets = [{ id: MAIN_CHAR_ID, name: DEFAULT_CHAR_NAME }];
    changed = true;
  }
  const selectedCharacterId = cfg.selectedCharacterId || characterPresets[0].id;
  if (!cfg.selectedCharacterId) {
    changed = true;
  }

  // 2. 데이터 마이그레이션 및 구조 일원화
  currentItems.forEach((item: any) => {
    if (!item.completedState) {
      item.completedState = {};
      changed = true;
    }

    // maxCount가 변경/지정되었으나 캐릭터별 currentCount 필드가 누락된 경우 안전하게 마이그레이션
    const max = item.maxCount || 1;
    if (item.completedState) {
      Object.keys(item.completedState).forEach(charId => {
        const state = item.completedState[charId];
        if (state.currentCount === undefined) {
          state.currentCount = state.isCompleted ? max : 0;
          changed = true;
        }
      });
    }

    // [v1.12.7 일원화] 기존 단일 필드가 존재한다면 마이그레이션 후 삭제
    if (item.isCompleted !== undefined) {
      if (!item.completedState[MAIN_CHAR_ID]) {
        item.completedState[MAIN_CHAR_ID] = {
          isCompleted: !!item.isCompleted,
          lastCompletedAt: item.lastCompletedAt
        };
      }
      // 마이그레이션 완료 후 구버전 필드 제거 (중복 관리 배제)
      delete item.isCompleted;
      delete item.lastCompletedAt;
      changed = true;
      log(`[Contents] 마이그레이션 완료: ${item.name}의 상태를 completedState로 통합`);
    }
  });

  // 3. 기본 아이템 병합 및 업데이트
  defaultItems.forEach(def => {
    const exists = currentItems.find(item => item.id === def.id);
    if (!exists) {
      currentItems.push({ 
        ...def, 
        completedState: {}, 
        sortOrder: currentItems.length 
      });
      changed = true;
    } else {
      if (exists.name !== def.name || 
          exists.category !== def.category ||
          JSON.stringify(exists.resetRule) !== JSON.stringify(def.resetRule) ||
          exists.maxCount !== def.maxCount) {
        exists.name = def.name;
        exists.category = def.category;
        exists.resetRule = def.resetRule;
        exists.maxCount = def.maxCount;
        changed = true;
      }
    }
  });

  // sortOrder가 없는 기존 항목들에 대해 순서 부여
  currentItems.forEach((item, idx) => {
    if (item.sortOrder === undefined) {
      item.sortOrder = idx;
      changed = true;
    }
  });

  if (changed || !cfg.contentsCheckerItems) {
    config.saveImmediate({ 
      contentsCheckerItems: currentItems,
      characterPresets,
      selectedCharacterId
    });
    import('./windowManager').then(wm => wm.applySettings({}));
  }
  
  checkReset();
}

/** 순서 변경 */
export function reorderItem(id: string, direction: 'up' | 'down'): void {
  const cfg = config.load();
  const items = cfg.contentsCheckerItems || [];
  const idx = items.findIndex(i => i.id === id);
  if (idx === -1) return;

  // 같은 유형(daily/weekly) 내환에서의 순서 변경이 직관적임
  const targetType = items[idx].resetRule.type;
  const sameTypeItems = items
    .filter(i => i.resetRule.type === targetType)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  
  const internalIdx = sameTypeItems.findIndex(i => i.id === id);
  if (direction === 'up' && internalIdx > 0) {
    // 이전 항목과 sortOrder 교체
    const prev = sameTypeItems[internalIdx - 1];
    const curr = sameTypeItems[internalIdx];
    const tmp = prev.sortOrder;
    prev.sortOrder = curr.sortOrder;
    curr.sortOrder = tmp;
    config.saveImmediate({ contentsCheckerItems: items });
    refreshUI();
  } else if (direction === 'down' && internalIdx < sameTypeItems.length - 1) {
    // 다음 항목과 sortOrder 교체
    const next = sameTypeItems[internalIdx + 1];
    const curr = sameTypeItems[internalIdx];
    const tmp = next.sortOrder;
    next.sortOrder = curr.sortOrder;
    curr.sortOrder = tmp;
    config.saveImmediate({ contentsCheckerItems: items });
    refreshUI();
  }
}

/** 전체 목록 순서 갱신 (드래그 앤 드롭용) */
export function reorderList(ids: string[]): void {
  const cfg = config.load();
  const items = cfg.contentsCheckerItems || [];
  
  // 전달받은 ID 배열 순서대로 sortOrder 재할당
  items.forEach(item => {
    const newIdx = ids.indexOf(item.id);
    if (newIdx !== -1) {
      item.sortOrder = newIdx;
    }
  });

  config.saveImmediate({ contentsCheckerItems: items });
  refreshUI();
}

/** 초기화 로직 (정기적으로 또는 수동 호출) */
export function checkReset(): boolean {
  const cfg = config.load();
  const items = cfg.contentsCheckerItems || [];
  const now = new Date();
  const nowTs = now.getTime();
  const lastCheck = cfg.lastContentsResetCheck || 0;

  let changed = false;

  items.forEach(item => {
    // 캐릭터별 상태 초기화
    if (item.completedState) {
      Object.keys(item.completedState).forEach(charId => {
        const state = item.completedState[charId];
        // 진행중이거나 완료된 상태이고 마지막 완료 시각이 있는 경우 초기화 검사
        if ((state.isCompleted || (state.currentCount && state.currentCount > 0)) && state.lastCompletedAt) {
          const lastCompleted = new Date(state.lastCompletedAt);
          if (shouldReset(item.resetRule, lastCompleted, now)) {
            state.isCompleted = false;
            state.lastCompletedAt = undefined;
            state.currentCount = 0;
            changed = true;
            log(`[Contents] 초기화됨: ${item.name} (캐릭터: ${charId}, ${item.resetRule.type})`);
          }
        }
      });
    }
  });

  if (changed || lastCheck === 0) {
    config.saveImmediate({ 
      contentsCheckerItems: items,
      lastContentsResetCheck: nowTs 
    });
    syncDiaryStats(items);
    refreshUI();
  }

  return changed;
}

/** 특정 규칙에 따라 초기화 여부 판단 */
function shouldReset(rule: ResetRule, lastCompleted: Date, now: Date): boolean {
  const resetHour = rule.hour ?? 0;
  
  // 기준 시각 생성 (오늘의 초기화 시각)
  const todayReset = new Date(now);
  todayReset.setHours(resetHour, 0, 0, 0);

  if (rule.type === 'daily') {
    // 마지막 완료 시점이 오늘의 초기화 시각 이전이면 초기화 대상
    return lastCompleted < todayReset && now >= todayReset;
  } 
  
  if (rule.type === 'weekly') {
    const resetDay = rule.dayOfWeek ?? 1; // 기본 월요일
    
    // 마지막 완료 시점 이후로 초기화 시점이 지났는지 확인
    const nextReset = new Date(lastCompleted);
    nextReset.setHours(resetHour, 0, 0, 0);
    
    // 요일 맞추기
    let daysDiff = (resetDay - nextReset.getDay() + 7) % 7;
    if (daysDiff === 0 && lastCompleted >= nextReset) {
      daysDiff = 7; // 오늘 이미 지났다면 다음 주로
    }
    nextReset.setDate(nextReset.getDate() + daysDiff);

    // 현재 시간이 그 다음 초기화 시각을 지났다면 초기화
    return now >= nextReset;
  }

  return false;
}

/** 일지(다이어리) 통계 동기화 */
function syncDiaryStats(items: ContentsCheckerItem[]) {
  const cfg = config.load();
  const presets = cfg.characterPresets || [{ id: MAIN_CHAR_ID, name: DEFAULT_CHAR_NAME }];
  
  let dailyTotal = 0;
  let dailyDone = 0;
  let weeklyTotal = 0;
  let weeklyDone = 0;

  // 모든 캐릭터의 숙제 현황을 합산
  presets.forEach(char => {
    const charId = char.id;
    // 해당 캐릭터에 대해 가시성이 있고 제외되지 않은 아이템만 필터링
    const visibleItems = items.filter(i => {
      const state = i.completedState?.[charId];
      return i.isVisible && !state?.isExcluded;
    });
    
    dailyTotal += visibleItems.filter(i => i.resetRule.type === 'daily').length;
    weeklyTotal += visibleItems.filter(i => i.resetRule.type === 'weekly').length;

    dailyDone += visibleItems.filter(i => {
      return i.resetRule.type === 'daily' && (i.completedState?.[charId]?.isCompleted);
    }).length;

    weeklyDone += visibleItems.filter(i => {
      return i.resetRule.type === 'weekly' && (i.completedState?.[charId]?.isCompleted);
    }).length;
  });
  
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const dateStr = String(now.getDate()).padStart(2, '0');
  const date = `${year}-${month}-${dateStr}`;
  
  diaryDb.updateHomeworkStats(date, dailyDone, dailyTotal, weeklyDone, weeklyTotal);
}

/** 화면 갱신 알림 유틸리티 */
function refreshUI() {
  import('./windowManager').then(wm => wm.applySettings({}));
}

/** 항목 토글 */
export function toggleItem(id: string, characterId?: string): void {
  const cfg = config.load();
  const items = cfg.contentsCheckerItems || [];
  const targetCharId = characterId || cfg.selectedCharacterId || MAIN_CHAR_ID;
  
  const item = items.find(i => i.id === id);
  if (item) {
    if (!item.completedState) item.completedState = {};
    if (!item.completedState[targetCharId]) {
      item.completedState[targetCharId] = { isCompleted: false };
    }

    // 제외된 항목은 체크 불가 (방어 로직)
    if (item.completedState[targetCharId].isExcluded) return;

    const state = item.completedState[targetCharId];
    const max = item.maxCount || 1;

    state.isCompleted = !state.isCompleted;
    state.currentCount = state.isCompleted ? max : 0;
    state.lastCompletedAt = state.currentCount > 0 ? Date.now() : undefined;

    config.saveImmediate({ contentsCheckerItems: items });

    // 일지 연동 로직
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const dateStr = String(now.getDate()).padStart(2, '0');
    const date = `${year}-${month}-${dateStr}`;

    const charName = cfg.characterPresets?.find(p => p.id === targetCharId)?.name || '알수없음';
    const diaryContentId = `${item.id}_${targetCharId}`;
    const diaryContentName = `[${charName}] ${item.name}`;

    if (state.isCompleted) {
      diaryDb.addHomeworkLog(date, diaryContentId, diaryContentName, item.category, item.resetRule.type, Date.now());
    } else {
      diaryDb.removeHomeworkLog(date, diaryContentId);
    }

    // 전 캐릭터 통합 다이어리 통계 동기화
    syncDiaryStats(items);

    refreshUI();
  }
}

/** 캐릭터별 숙제 제외(N/A) 토글 */
export function toggleExcludeItem(id: string, characterId: string): void {
  const cfg = config.load();
  const items = cfg.contentsCheckerItems || [];
  const item = items.find(i => i.id === id);
  
  if (item) {
    if (!item.completedState) item.completedState = {};
    if (!item.completedState[characterId]) {
      item.completedState[characterId] = { isCompleted: false };
    }

    const state = item.completedState[characterId];
    state.isExcluded = !state.isExcluded;
    
    // 제외 처리 시 완료 상태는 해제
    if (state.isExcluded) {
      state.isCompleted = false;
      state.lastCompletedAt = undefined;
      
      // 일지에서도 제거
      const now = new Date();
      const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const diaryContentId = `${item.id}_${characterId}`;
      diaryDb.removeHomeworkLog(date, diaryContentId);
    }

    config.saveImmediate({ contentsCheckerItems: items });
    
    // 전 캐릭터 통합 다이어리 통계 동기화
    syncDiaryStats(items);
    
    refreshUI();
  }
}

/** 캐릭터 관리: 추가 */
export function addCharacter(name: string): void {
  const cfg = config.load();
  const presets = cfg.characterPresets || [];
  // 더 안전한 고유 ID 생성 (시간 기반 36진수 + 랜덤 36진수)
  const newId = `char-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
  presets.push({ id: newId, name });
  
  config.saveImmediate({ 
    characterPresets: presets,
    selectedCharacterId: newId // 추가하면 바로 선택
  });
  refreshUI();
}

/** 캐릭터 관리: 삭제 */
export function removeCharacter(id: string): void {
  const cfg = config.load();
  let presets = cfg.characterPresets || [];
  if (presets.length <= 1) return; // 최소 1개는 유지

  presets = presets.filter(p => p.id !== id);
  let selectedId = cfg.selectedCharacterId;
  if (selectedId === id) {
    selectedId = presets[0].id;
  }

  // 모든 아이템에서 해당 캐릭터의 상태 삭제
  const items = cfg.contentsCheckerItems || [];
  items.forEach(item => {
    if (item.completedState) {
      delete item.completedState[id];
    }
  });

  config.saveImmediate({ 
    characterPresets: presets, 
    selectedCharacterId: selectedId,
    contentsCheckerItems: items
  });
  syncDiaryStats(items);
  refreshUI();
}

/** 캐릭터 관리: 이름 변경 */
export function renameCharacter(id: string, newName: string): void {
  const cfg = config.load();
  const presets = cfg.characterPresets || [];
  const char = presets.find(p => p.id === id);
  if (char) {
    char.name = newName;
    config.saveImmediate({ characterPresets: presets });
    refreshUI();
  }
}

/** 캐릭터 선택 */
export function selectCharacter(id: string): void {
  config.saveImmediate({ selectedCharacterId: id });
  refreshUI();
}

/** 가시성 토글 */
export function toggleVisibility(id: string): void {
  const cfg = config.load();
  const items = cfg.contentsCheckerItems || [];
  const item = items.find(i => i.id === id);
  if (item) {
    item.isVisible = !item.isVisible;
    config.saveImmediate({ contentsCheckerItems: items });
    refreshUI();
  }
}

/** 항목 수정 (이름, 카테고리, 초기화 규칙) */
export function updateItem(id: string, name: string, category: string, rule: ResetRule): void {
  const cfg = config.load();
  const items = cfg.contentsCheckerItems || [];
  const item = items.find(i => i.id === id);
  if (item) {
    item.name = name;
    item.category = category;
    item.resetRule = rule;
    
    // 규칙이 변경되었을 수 있으므로 초기화 체크 수행
    config.saveImmediate({ contentsCheckerItems: items });
    checkReset(); 
    refreshUI();
  }
}

/** 카테고리 수정 */
export function updateCategory(id: string, newCategory: string): void {
  const cfg = config.load();
  const items = cfg.contentsCheckerItems || [];
  const item = items.find(i => i.id === id);
  if (item) {
    item.category = newCategory;
    config.saveImmediate({ contentsCheckerItems: items });
    refreshUI();
  }
}

/** 이름 수정 */
export function updateName(id: string, newName: string): void {
  const cfg = config.load();
  const items = cfg.contentsCheckerItems || [];
  const item = items.find(i => i.id === id);
  if (item) {
    item.name = newName;
    config.saveImmediate({ contentsCheckerItems: items });
    refreshUI();
  }
}

/** 커스텀 항목 추가 */
export function addCustomItem(name: string, category: string, rule: ResetRule): void {
  const cfg = config.load();
  const items = cfg.contentsCheckerItems || [];
  const newItem: ContentsCheckerItem = {
    id: `custom-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`,
    name,
    category,
    isVisible: true,
    isCustom: true,
    resetRule: rule,
    sortOrder: items.length,
    completedState: {}
  };
  items.push(newItem);
  config.saveImmediate({ contentsCheckerItems: items });
  refreshUI();
}

/** 항목 삭제 (커스텀 전용) */
export function removeItem(id: string): void {
  const cfg = config.load();
  let items = cfg.contentsCheckerItems || [];
  items = items.filter(i => i.id !== id);
  config.saveImmediate({ contentsCheckerItems: items });
  refreshUI();
}

/** 특정 숙제의 완료 횟수 직접 업데이트 */
export function updateItemCount(id: string, characterId: string, count: number): void {
  const cfg = config.load();
  const items = cfg.contentsCheckerItems || [];
  const targetCharId = characterId || cfg.selectedCharacterId || MAIN_CHAR_ID;
  
  const item = items.find(i => i.id === id);
  if (item) {
    if (!item.completedState) item.completedState = {};
    if (!item.completedState[targetCharId]) {
      item.completedState[targetCharId] = { isCompleted: false };
    }

    const state = item.completedState[targetCharId];
    if (state.isExcluded) return;

    const max = item.maxCount || 1;
    const prevCompleted = state.isCompleted;

    state.currentCount = Math.max(0, Math.min(max, count));
    state.isCompleted = (state.currentCount === max);
    state.lastCompletedAt = state.currentCount > 0 ? Date.now() : undefined;

    config.saveImmediate({ contentsCheckerItems: items });

    // 일지 연동 로직
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const dateStr = String(now.getDate()).padStart(2, '0');
    const date = `${year}-${month}-${dateStr}`;

    const charName = cfg.characterPresets?.find(p => p.id === targetCharId)?.name || '알수없음';
    const diaryContentId = `${item.id}_${targetCharId}`;
    const diaryContentName = `[${charName}] ${item.name}`;

    if (state.isCompleted && !prevCompleted) {
      diaryDb.addHomeworkLog(date, diaryContentId, diaryContentName, item.category, item.resetRule.type, Date.now());
    } else if (!state.isCompleted && prevCompleted) {
      diaryDb.removeHomeworkLog(date, diaryContentId);
    }

    // 전 캐릭터 통합 다이어리 통계 동기화
    syncDiaryStats(items);
    refreshUI();
  }
}

/** 특정 숙제의 완료 횟수 증감 (채팅 로그 등 외부 연동용) */
export function incrementItemCount(id: string, characterId: string, amount: number = 1): void {
  const cfg = config.load();
  const items = cfg.contentsCheckerItems || [];
  const targetCharId = characterId || cfg.selectedCharacterId || MAIN_CHAR_ID;
  
  const item = items.find(i => i.id === id);
  if (item) {
    const current = item.completedState?.[targetCharId]?.currentCount || 0;
    updateItemCount(id, targetCharId, current + amount);
  }
}
