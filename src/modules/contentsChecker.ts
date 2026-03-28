/**
 * 일일/주간 컨텐츠 체크 리스트 로직 모듈
 */
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import * as config from './config';
import { ContentsCheckerItem, ResetRule } from '../shared/types';
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

  // 기본 아이템 중 신규 추가된 항목이 있으면 병합
  defaultItems.forEach(def => {
    const exists = currentItems.find(item => item.id === def.id);
    if (!exists) {
      // 신규 항목은 클론하여 안전하게 추가 (isCompleted 강제 false)
      currentItems.push({ 
        ...def, 
        isCompleted: false, 
        lastCompletedAt: undefined,
        sortOrder: currentItems.length 
      });
      changed = true;
    } else {
      // 이름이나 초기화 규칙이 변경되었을 수 있으므로 업데이트
      if (exists.name !== def.name || JSON.stringify(exists.resetRule) !== JSON.stringify(def.resetRule)) {
        exists.name = def.name;
        exists.resetRule = def.resetRule;
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

  // 혹시라도 비정상적으로 모든 항목이 체크되어 있다면 (사용자 보고 대응)
  // 단, 실제로 다 했을 수도 있으므로 최초 1회만 수행되도록 lastContentsResetCheck 활용 가능
  if (!cfg.lastContentsResetCheck && currentItems.some(i => i.isCompleted)) {
    currentItems.forEach(i => { i.isCompleted = false; i.lastCompletedAt = undefined; });
    changed = true;
  }

  if (changed || !cfg.contentsCheckerItems) {
    config.saveImmediate({ contentsCheckerItems: currentItems });
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
    if (!item.isCompleted || !item.lastCompletedAt) return;

    const lastCompleted = new Date(item.lastCompletedAt);
    if (shouldReset(item.resetRule, lastCompleted, now)) {
      item.isCompleted = false;
      item.lastCompletedAt = undefined;
      changed = true;
      log(`[Contents] 초기화됨: ${item.name} (${item.resetRule.type})`);
    }
  });

  if (changed || lastCheck === 0) {
    config.saveImmediate({ 
      contentsCheckerItems: items,
      lastContentsResetCheck: nowTs 
    });
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
    // 더 간단하고 확실한 방법: 마지막 완료일과 현재일 사이의 "초기화 시점" 존재 여부 체크
    // 1. 마지막 완료일 이후 가장 가까운 초기화 날짜를 구함
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
  const visibleItems = items.filter(i => i.isVisible);
  const dailyTotal = visibleItems.filter(i => i.resetRule.type === 'daily').length;
  const dailyDone = visibleItems.filter(i => i.resetRule.type === 'daily' && i.isCompleted).length;
  const weeklyTotal = visibleItems.filter(i => i.resetRule.type === 'weekly').length;
  const weeklyDone = visibleItems.filter(i => i.resetRule.type === 'weekly' && i.isCompleted).length;
  
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
export function toggleItem(id: string): void {
  const cfg = config.load();
  const items = cfg.contentsCheckerItems || [];
  const item = items.find(i => i.id === id);
  if (item) {
    item.isCompleted = !item.isCompleted;
    item.lastCompletedAt = item.isCompleted ? Date.now() : undefined;
    config.saveImmediate({ contentsCheckerItems: items });

    // 일지 연동 로직
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const dateStr = String(now.getDate()).padStart(2, '0');
    const date = `${year}-${month}-${dateStr}`;

    if (item.isCompleted) {
      diaryDb.addHomeworkLog(date, item.id, item.name, item.category, item.resetRule.type, Date.now());
    } else {
      diaryDb.removeHomeworkLog(date, item.id);
    }
    syncDiaryStats(items);

    refreshUI();
  }
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

/** 커스텀 항목 추가 */
export function addCustomItem(name: string, category: string, rule: ResetRule): void {
  const cfg = config.load();
  const items = cfg.contentsCheckerItems || [];
  const newItem: ContentsCheckerItem = {
    id: `custom-${Date.now()}`,
    name,
    category,
    isCompleted: false,
    isVisible: true,
    isCustom: true,
    resetRule: rule,
    sortOrder: items.length
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
