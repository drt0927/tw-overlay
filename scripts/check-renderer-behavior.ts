import assert = require('node:assert/strict');
import fs = require('node:fs');
import os = require('node:os');
import path = require('node:path');
import { app, BrowserWindow } from 'electron';

const projectRoot = path.resolve(__dirname, '..');
const testUserDataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-overlay-renderer-test-'));

async function waitForSelector(
  window: BrowserWindow,
  selector: string,
  timeoutMs = 5_000,
): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const exists = await window.webContents.executeJavaScript(
      `Boolean(document.querySelector(${JSON.stringify(selector)}))`,
    ) as boolean;
    if (exists) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`렌더러 요소 대기 시간 초과: ${selector}`);
}

async function checkContentsChecklist(window: BrowserWindow): Promise<void> {
  await window.loadFile(path.join(projectRoot, 'dist', 'contents-checker.html'));
  const result = await window.webContents.executeJavaScript(`
    (() => {
      const characterName = '캐릭터"><img id="injected-character">';
      const makeItem = (id, name, category, isCustom = false) => ({
        id,
        name,
        category,
        isVisible: true,
        isCustom,
        resetRule: { type: 'weekly', dayOfWeek: 1, hour: 0 },
        maxCount: 7,
        completedState: {
          'char-main': { isCompleted: false, currentCount: 0 }
        }
      });
      configData = {
        characterPresets: [{ id: 'char-main', name: characterName }],
        contentsCheckerItems: [
          makeItem('normal-10', '하늘10', '테스트'),
          makeItem('normal-ga', '가람', '테스트'),
          makeItem('normal-2', '하늘2', '테스트'),
          makeItem('normal-na', '나래', '테스트'),
          makeItem('custom-safe', '<img id="injected-item">사용자 숙제', '사용자"><img id="injected-category">', true)
        ],
        pendingHomeworks: []
      };
      render();

      const orderedNames = Array.from(document.querySelectorAll('.item-info'))
        .filter(cell => cell.title.startsWith('[테스트]'))
        .map(cell => cell.querySelector('.text-xs')?.textContent);
      const customCell = Array.from(document.querySelectorAll('.item-info'))
        .find(cell => cell.title.includes('사용자 숙제'));
      const displayText = window.normalizeChatDisplayText('&nbsp &nbsp &nbsp 을 것이오!');
      const displayNode = document.createElement('span');
      displayNode.textContent = displayText;

      const moveCalls = [];
      window.electronAPI = {
        contentsReorderItem: (...args) => moveCalls.push(['item', ...args]),
        contentsReorderCategory: (...args) => moveCalls.push(['category', ...args])
      };
      isEditMode = true;
      configData.contentsCheckerItems = [
        makeItem('category-b-1', 'B 첫째', 'B 카테고리'),
        makeItem('category-a-1', 'A 첫째', 'A 카테고리'),
        makeItem('category-b-2', 'B 둘째', 'B 카테고리')
      ];
      render();
      const orderedCategories = Array.from(document.querySelectorAll('.category-row > span'))
        .map(span => span.textContent);
      const categoryHandles = document.querySelectorAll('[title="드래그하여 카테고리 순서 변경"]');
      categoryHandles[0]?.dispatchEvent(new Event('dragstart', { bubbles: true }));
      document.querySelectorAll('.category-row')[1]?.dispatchEvent(new MouseEvent('dragover', { bubbles: true, clientY: 9999 }));
      const previewCategories = Array.from(document.querySelectorAll('.category-row > span')).map(span => span.textContent);
      categoryHandles[0]?.dispatchEvent(new Event('dragend', { bubbles: true }));
      const restoredCategories = Array.from(document.querySelectorAll('.category-row > span')).map(span => span.textContent);
      categoryHandles[0]?.dispatchEvent(new Event('dragstart', { bubbles: true }));
      document.querySelectorAll('.category-row')[1]?.dispatchEvent(new MouseEvent('dragover', { bubbles: true, clientY: 9999 }));
      document.getElementById('matrix-table')?.dispatchEvent(new MouseEvent('drop', { bubbles: true, clientY: 9999 }));
      categoryHandles[0]?.dispatchEvent(new Event('dragend', { bubbles: true }));
      const committedCategories = Array.from(document.querySelectorAll('.category-row > span')).map(span => span.textContent);
      render();
      const itemHandles = document.querySelectorAll('[title="드래그하여 숙제 순서 변경"]');
      itemHandles[0]?.dispatchEvent(new Event('dragstart', { bubbles: true }));
      document.querySelectorAll('.item-info')[1]?.dispatchEvent(new MouseEvent('dragover', { bubbles: true, clientY: 9999 }));
      const previewItems = Array.from(document.querySelectorAll('.item-info')).map(cell => cell.querySelector('.text-xs')?.textContent);
      itemHandles[0]?.dispatchEvent(new Event('dragend', { bubbles: true }));
      const restoredItems = Array.from(document.querySelectorAll('.item-info')).map(cell => cell.querySelector('.text-xs')?.textContent);
      itemHandles[0]?.dispatchEvent(new Event('dragstart', { bubbles: true }));
      document.querySelectorAll('.item-info')[1]?.dispatchEvent(new MouseEvent('dragover', { bubbles: true, clientY: 9999 }));
      document.getElementById('matrix-table')?.dispatchEvent(new MouseEvent('drop', { bubbles: true, clientY: 9999 }));
      itemHandles[0]?.dispatchEvent(new Event('dragend', { bubbles: true }));
      const committedItems = Array.from(document.querySelectorAll('.item-info')).map(cell => cell.querySelector('.text-xs')?.textContent);

      return {
        orderedNames,
        orderedCategories,
        previewCategories,
        restoredCategories,
        committedCategories,
        previewItems,
        restoredItems,
        committedItems,
        moveCalls,
        characterName: document.querySelector('.char-name')?.textContent,
        customName: customCell?.querySelector('.text-xs')?.textContent,
        customBadge: Array.from(customCell?.querySelectorAll('span') || [])
          .some(span => span.textContent === 'CUSTOM'),
        injectedElementCount: document.querySelectorAll(
          '#injected-character, #injected-item, #injected-category'
        ).length,
        displayText: displayNode.textContent
      };
    })()
  `) as {
    orderedNames: string[];
    orderedCategories: string[];
    previewCategories: string[];
    restoredCategories: string[];
    committedCategories: string[];
    previewItems: Array<string | undefined>;
    restoredItems: Array<string | undefined>;
    committedItems: Array<string | undefined>;
    moveCalls: unknown[][];
    characterName: string;
    customName: string;
    customBadge: boolean;
    injectedElementCount: number;
    displayText: string;
  };

  assert.deepEqual(result.orderedNames, ['하늘10', '가람', '하늘2', '나래']);
  assert.deepEqual(result.orderedCategories, ['B 카테고리 (2)', 'A 카테고리 (1)']);
  assert.deepEqual(result.previewCategories, ['A 카테고리 (1)', 'B 카테고리 (2)']);
  assert.deepEqual(result.restoredCategories, result.orderedCategories);
  assert.deepEqual(result.committedCategories, result.previewCategories);
  assert.deepEqual(result.previewItems, ['B 둘째', 'B 첫째', 'A 첫째']);
  assert.deepEqual(result.restoredItems, ['B 첫째', 'B 둘째', 'A 첫째']);
  assert.deepEqual(result.committedItems, result.previewItems);
  assert.deepEqual(result.moveCalls, [
    ['category', 'weekly', 'B 카테고리', 'A 카테고리', 'after'],
    ['item', 'category-b-1', 'category-b-2', 'after']
  ]);
  assert.equal(result.characterName, '캐릭터"><img id="injected-character">');
  assert.equal(result.customName, '<img id="injected-item">사용자 숙제');
  assert.equal(result.customBadge, true);
  assert.equal(result.injectedElementCount, 0);
  assert.equal(result.displayText, '을 것이오!');
}

async function checkLifecycleStartIsIdempotent(): Promise<void> {
  const { chatParser } = require(path.join(projectRoot, 'dist/modules/chatParser.js')) as {
    chatParser: {
      eventNames(): Array<string | symbol>;
      listenerCount(event: string | symbol): number;
    };
  };
  const { chatLogProcessor } = require(
    path.join(projectRoot, 'dist/modules/chatLogProcessor.js'),
  ) as {
    chatLogProcessor: { start(): void };
  };

  chatLogProcessor.start();
  const afterFirstStart = Object.fromEntries(
    chatParser.eventNames().map(event => [String(event), chatParser.listenerCount(event)]),
  );
  chatLogProcessor.start();
  const afterSecondStart = Object.fromEntries(
    chatParser.eventNames().map(event => [String(event), chatParser.listenerCount(event)]),
  );

  assert.deepEqual(afterSecondStart, afterFirstStart);
  assert.equal(afterFirstStart.SPECIAL_MONSTER_SPAWN, 1);
  assert.equal(afterFirstStart.ETERNAL_FLOOR_CLEAR, 1);
}

async function checkBuffRefreshPolicy(): Promise<void> {
  const { buffTimerManager } = require(
    path.join(projectRoot, 'dist/modules/buffTimerManager.js'),
  ) as {
    buffTimerManager: {
      loadBuffDefs(): void;
      activateBuff(buffId: string, usedBy?: string, customDurationMs?: number, startTime?: number): void;
      getActiveBuffs(): Array<{ buffId: string; startTime: number; warnedAt: Set<number> }>;
      clearAllBuffs(): void;
    };
  };

  buffTimerManager.loadBuffDefs();
  buffTimerManager.clearAllBuffs();

  const initialStartTime = Date.now() - 10_000;
  buffTimerManager.activateBuff('exp_potato_900', 'self', undefined, initialStartTime);
  const initialBuff = buffTimerManager.getActiveBuffs().find(buff => buff.buffId === 'exp_potato_900');
  assert.ok(initialBuff);
  initialBuff.warnedAt.add(60);

  const refreshedStartTime = initialStartTime + 1_000;
  buffTimerManager.activateBuff('exp_potato_900', 'self', undefined, refreshedStartTime);
  const refreshedBuff = buffTimerManager.getActiveBuffs().find(buff => buff.buffId === 'exp_potato_900');
  assert.ok(refreshedBuff);
  assert.equal(refreshedBuff.startTime, refreshedStartTime);
  assert.equal(refreshedBuff.warnedAt.size, 0);

  buffTimerManager.activateBuff('exp_potato_900', 'self', undefined, initialStartTime);
  assert.equal(
    buffTimerManager.getActiveBuffs().find(buff => buff.buffId === 'exp_potato_900')?.startTime,
    refreshedStartTime,
  );

  buffTimerManager.clearAllBuffs();
}

async function checkContentsOrderingPersistence(): Promise<void> {
  const configModule = require(path.join(projectRoot, 'dist/modules/config.js')) as {
    load(): { contentsCheckerItems?: Array<{ id: string; completedState: Record<string, unknown> }> };
    saveImmediate(value: Record<string, unknown>): void;
  };
  const contentsChecker = require(path.join(projectRoot, 'dist/modules/contentsChecker.js')) as {
    moveItem(id: string, direction: 'up' | 'down'): void;
    moveCategory(resetType: 'daily' | 'weekly', category: string, direction: 'up' | 'down'): void;
    reorderItem(sourceId: string, targetId: string, position: 'before' | 'after'): void;
    reorderCategory(resetType: 'daily' | 'weekly', sourceCategory: string, targetCategory: string, position: 'before' | 'after'): void;
  };
  const makeItem = (id: string, category: string, type: 'daily' | 'weekly') => ({
    id,
    name: id,
    category,
    isVisible: true,
    resetRule: { type },
    completedState: { 'char-main': { isCompleted: id === 'daily-a-1' } },
  });

  configModule.saveImmediate({
    contentsCheckerItems: [
      makeItem('daily-a-1', 'A', 'daily'),
      makeItem('weekly-x-1', 'X', 'weekly'),
      makeItem('daily-b-1', 'B', 'daily'),
      makeItem('daily-a-2', 'A', 'daily'),
    ],
  });

  contentsChecker.moveItem('daily-a-2', 'up');
  assert.deepEqual(
    configModule.load().contentsCheckerItems?.map(item => item.id),
    ['daily-a-2', 'weekly-x-1', 'daily-b-1', 'daily-a-1'],
  );

  contentsChecker.moveCategory('daily', 'B', 'up');
  const reorderedItems = configModule.load().contentsCheckerItems ?? [];
  assert.deepEqual(
    reorderedItems.map(item => item.id),
    ['daily-b-1', 'weekly-x-1', 'daily-a-2', 'daily-a-1'],
  );
  assert.deepEqual(reorderedItems.find(item => item.id === 'daily-a-1')?.completedState, {
    'char-main': { isCompleted: true },
  });

  contentsChecker.moveCategory('daily', 'B', 'up');
  assert.deepEqual(
    configModule.load().contentsCheckerItems?.map(item => item.id),
    ['daily-b-1', 'weekly-x-1', 'daily-a-2', 'daily-a-1'],
  );

  contentsChecker.reorderItem('daily-a-2', 'daily-a-1', 'after');
  assert.deepEqual(
    configModule.load().contentsCheckerItems?.map(item => item.id),
    ['daily-b-1', 'weekly-x-1', 'daily-a-1', 'daily-a-2'],
  );

  contentsChecker.reorderCategory('daily', 'B', 'A', 'after');
  assert.deepEqual(
    configModule.load().contentsCheckerItems?.map(item => item.id),
    ['daily-a-1', 'weekly-x-1', 'daily-a-2', 'daily-b-1'],
  );
}

async function checkRendererHelpers(window: BrowserWindow): Promise<void> {
  const alertsCode = fs.readFileSync(
    path.join(projectRoot, 'dist', 'renderer', 'game-overlay', 'alerts.js'),
    'utf8',
  );
  const settingsCode = fs.readFileSync(
    path.join(projectRoot, 'dist', 'renderer', 'settings', 'list-rendering.js'),
    'utf8',
  );

  const result = await window.webContents.executeJavaScript(`
    (() => {
      ${alertsCode}
      ${settingsCode}

      const alert = document.createElement('div');
      alert.id = 'special-monster-alert';
      document.body.appendChild(alert);
      window.gameOverlayAlerts.showSpecialMonsterAlert();

      let removeCount = 0;
      const tag = window.settingsListRendering.createKeywordTag(
        '<img id="injected-keyword">키워드',
        'keyword-tag',
        () => removeCount++
      );
      document.body.appendChild(tag);
      tag.querySelector('button').click();

      const soundRow = window.settingsListRendering.createCustomSoundRow({
        sound: { name: '<img id="injected-sound">알림음', file: 'safe.wav' },
        onPreview: () => {},
        onRename: () => {},
        onDelete: () => {}
      });
      document.body.appendChild(soundRow);

      return {
        alertShown: alert.classList.contains('show'),
        keywordText: tag.firstChild?.textContent,
        removeCount,
        soundName: soundRow.querySelector('input')?.value,
        injectedCount: document.querySelectorAll('#injected-keyword, #injected-sound').length
      };
    })()
  `) as {
    alertShown: boolean;
    keywordText: string;
    removeCount: number;
    soundName: string;
    injectedCount: number;
  };

  assert.equal(result.alertShown, true);
  assert.equal(result.keywordText, '<img id="injected-keyword">키워드 ');
  assert.equal(result.removeCount, 1);
  assert.equal(result.soundName, '<img id="injected-sound">알림음');
  assert.equal(result.injectedCount, 0);
}

async function checkCoefficientDropdown(window: BrowserWindow): Promise<void> {
  await window.loadFile(path.join(projectRoot, 'dist', 'coefficient-calculator.html'));
  await waitForSelector(window, '.custom-dropdown-menu');

  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const menu = document.querySelector('.custom-dropdown-menu');
      const trigger = document.querySelector('.custom-dropdown-trigger');
      const initiallyHidden = menu.classList.contains('hidden')
        && getComputedStyle(menu).display === 'none';
      trigger.click();
      await new Promise(resolve => setTimeout(resolve, 0));
      const opened = !menu.classList.contains('hidden')
        && getComputedStyle(menu).display !== 'none';
      document.body.click();
      await new Promise(resolve => setTimeout(resolve, 0));
      const closed = menu.classList.contains('hidden')
        && getComputedStyle(menu).display === 'none';
      return { initiallyHidden, opened, closed };
    })()
  `) as { initiallyHidden: boolean; opened: boolean; closed: boolean };

  assert.deepEqual(result, { initiallyHidden: true, opened: true, closed: true });
}

async function main(): Promise<void> {
  app.commandLine.appendSwitch('disable-gpu');
  app.setPath('userData', testUserDataDirectory);
  await app.whenReady();
  await checkLifecycleStartIsIdempotent();
  await checkBuffRefreshPolicy();
  await checkContentsOrderingPersistence();
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  try {
    await checkContentsChecklist(window);
    await checkRendererHelpers(window);
    await checkCoefficientDropdown(window);
    console.log('Renderer behavior checks passed.');
  } finally {
    if (!window.isDestroyed()) window.destroy();
    app.quit();
    try {
      fs.rmSync(testUserDataDirectory, { recursive: true, force: true });
    } catch {
      // Windows에서 SQLite 핸들이 종료 직전까지 유지되는 경우는 다음 임시 폴더 정리에 맡깁니다.
    }
  }
}

main().catch(error => {
  console.error(error);
  app.exit(1);
});
