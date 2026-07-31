import assert = require('node:assert/strict');
import crypto = require('node:crypto');
import fs = require('node:fs');
import path = require('node:path');
import vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..');
const sourceRoot = path.join(projectRoot, 'src');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

function createUiUtilsSandbox(): any {
  const registeredListeners: Record<string, Array<() => void>> = {};
  const window: any = {
    addEventListener(event: string, callback: () => void) {
      (registeredListeners[event] ||= []).push(callback);
    },
    __registeredListeners: registeredListeners,
  };
  const sandbox = {
    window,
    document: {},
    fetch: async () => ({ json: async () => [] }),
    setInterval,
    clearInterval,
    console,
  };
  vm.runInNewContext(read('dist/assets/ui-utils.js'), sandbox, {
    filename: 'dist/assets/ui-utils.js',
  });
  return window;
}

function checkCommonFormatters() {
  const ui = createUiUtilsSandbox();

  assert.equal(ui.formatElapsedTime(0), '00:00:00');
  assert.equal(ui.formatElapsedTime(3_661_000), '01:01:01');
  assert.equal(ui.formatSeedAmount(0), '0 시드');
  assert.equal(ui.formatSeedAmount(9_999), '9,999 시드');
  assert.equal(ui.formatSeedAmount(123_456_789), '1억 2345만 시드');
  assert.equal(
    ui.normalizeChatDisplayText('앞&nbsp;중간&nbsp뒤\u00a0끝'),
    '앞 중간 뒤 끝',
  );
  assert.equal(
    ui.normalizeChatDisplayText('&nbsp &nbsp &nbsp &nbsp &nbsp 을 것이오!'),
    '을 것이오!',
  );
  assert.deepEqual(
    ['하늘2', '가람', '하늘10', '나래'].sort(ui.compareKoreanText),
    ['가람', '나래', '하늘2', '하늘10'],
  );
  assert.equal(ui.escapeHtml('<a "b">&'), '&lt;a &quot;b&quot;&gt;&amp;');
  assert.equal(ui.escapeHtmlText('<a "b">&'), '&lt;a "b"&gt;&amp;');
  assert.equal(ui.escapeHtmlAttribute(`'"><&`), '&#039;&quot;&gt;&lt;&amp;');

  assert.deepEqual(
    { ...ui.getBossToastPresentation('골론', false, '12:30', 5) },
    {
      isRealBoss: true,
      validSpawnTime: '12:30',
      displayName: '[12:30] 골론 <span class="text-xs text-slate-500 font-medium ml-1">5분 전</span>',
      iconName: 'skull',
      iconColor: 'text-[#a855f7]',
    },
  );
  assert.deepEqual(
    { ...ui.getScamToastPresentation({
      verdict: 'SCAM',
      analysisReason: '<송금> & 요구\n둘째 줄',
    }) },
    {
      isScam: true,
      title: '🚨 사기 위험 감지!',
      colorClass: 'text-red-400',
      reason: '&lt;송금&gt; &amp; 요구',
    },
  );

  let cleanupCount = 0;
  ui.electronAPI = { cleanupAllListeners: () => cleanupCount++ };
  ui.bindElectronListenerCleanup();
  ui.bindElectronListenerCleanup();
  assert.equal(ui.__registeredListeners.beforeunload.length, 1);
  ui.__registeredListeners.beforeunload[0]();
  assert.equal(cleanupCount, 1);
}

function checkAnalyticsProtocol(): void {
  const analyticsProtocol = require(path.join(
    projectRoot,
    'dist',
    'modules',
    'analyticsProtocol.js',
  )) as {
    createGaClientId(now?: number, randomPart?: number): string;
    isValidGaClientId(value: unknown): boolean;
    normalizeGaEventName(eventName: string): string;
    normalizeGaEventParams(
      params: Record<string, unknown>,
    ): Record<string, unknown>;
    normalizeGaClientId(
      value: unknown,
      now?: number,
      randomPart?: number,
    ): { clientId: string; migrated: boolean };
  };

  assert.equal(analyticsProtocol.isValidGaClientId('123456789.1722150000'), true);
  assert.equal(analyticsProtocol.isValidGaClientId('123456789'), false);
  assert.equal(analyticsProtocol.isValidGaClientId(crypto.randomUUID()), false);
  assert.equal(
    analyticsProtocol.createGaClientId(1_722_150_000_000, 123_456_789),
    '123456789.1722150000',
  );
  assert.deepEqual(
    analyticsProtocol.normalizeGaClientId('123456789.1722150000'),
    {
      clientId: '123456789.1722150000',
      migrated: false,
    },
  );
  assert.deepEqual(
    analyticsProtocol.normalizeGaClientId(
      '2cca639a-ef75-4087-8317-595539727182',
      1_722_150_000_000,
      987_654_321,
    ),
    {
      clientId: '987654321.1722150000',
      migrated: true,
    },
  );
  assert.equal(
    analyticsProtocol.normalizeGaEventName('toggle_settings_chatlog:sub-tab-overlay'),
    'toggle_settings_chatlog_sub_tab_overlay',
  );
  assert.equal(
    analyticsProtocol.normalizeGaEventName('123 invalid event name'),
    'event_123_invalid_event_name',
  );
  assert.equal(
    Array.from(analyticsProtocol.normalizeGaEventName(`event_${'가'.repeat(50)}`)).length,
    40,
  );
  assert.deepEqual(
    analyticsProtocol.normalizeGaEventParams({
      error_message: '오'.repeat(101),
      ga_session_number: 3,
      enabled: true,
    }),
    {
      error_message: '오'.repeat(100),
      ga_session_number: 3,
      enabled: true,
    },
  );
}

function checkDevtoolsInitializationIsIdempotent() {
  const messages: unknown[][] = [];
  const window: any = {};
  const sandbox = {
    window,
    document: { getElementById: () => ({}) },
    gameOverlayAlerts: {
      showEssenceAlert() {},
      showSpecialMonsterAlert() {},
    },
    triggerLokagosAlert() {},
    showEthosAlert: () => 'N',
    showAbyssApostleAlert: () => true,
    ETHOS_PASSWORD_BY_DIRECTION: { N: '번개' },
    currentConfig: null,
    console: {
      log: (...args: unknown[]) => messages.push(['log', ...args]),
      error: (...args: unknown[]) => messages.push(['error', ...args]),
    },
  };
  const code = read('dist/renderer/game-overlay/devtools.js');
  vm.runInNewContext(code, sandbox, { filename: 'devtools.js' });
  const firstRunCount = messages.length;
  vm.runInNewContext(code, sandbox, { filename: 'devtools.js' });

  assert.equal(messages.length, firstRunCount, 'DevTools 가이드가 중복 출력되었습니다.');
  assert.equal(typeof window.testSpecialMonsterAlert, 'function');
  assert.equal(typeof window.testEthos, 'function');
}

function checkInlineScriptSyntax() {
  const htmlFiles = fs.readdirSync(sourceRoot).filter(file => file.endsWith('.html'));
  const inlineScriptPattern = /<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;
  let checkedBlockCount = 0;
  const checkedPages = new Set<string>();

  for (const file of htmlFiles) {
    const html = fs.readFileSync(path.join(sourceRoot, file), 'utf8');
    let match;
    let index = 0;
    while ((match = inlineScriptPattern.exec(html)) !== null) {
      index++;
      new vm.Script(match[1], { filename: `${file}:inline-script-${index}` });
      checkedBlockCount++;
      checkedPages.add(file);
    }
  }

  assert.ok(checkedBlockCount > 0, '검사된 HTML 인라인 스크립트가 없습니다.');
  assert.ok(checkedPages.size > 0, '인라인 스크립트 검사 대상 페이지가 없습니다.');
}

function checkPageScriptNamespaceCollisions() {
  const htmlFiles = fs.readdirSync(sourceRoot).filter(file => file.endsWith('.html'));
  const scriptPattern = /<script([^>]*)>([\s\S]*?)<\/script>/gi;

  for (const file of htmlFiles) {
    const html = fs.readFileSync(path.join(sourceRoot, file), 'utf8');
    const scripts = [];
    let match;

    while ((match = scriptPattern.exec(html)) !== null) {
      const sourceMatch = match[1].match(/\bsrc=["']([^"']+)["']/i);
      if (!sourceMatch) {
        scripts.push(match[2]);
        continue;
      }

      const relativeScriptPath = sourceMatch[1].split(/[?#]/, 1)[0];
      if (/\.min\.js$/i.test(relativeScriptPath)) continue;

      const sourcePath = path.join(sourceRoot, relativeScriptPath);
      const builtPath = path.join(projectRoot, 'dist', relativeScriptPath);
      const resolvedPath = fs.existsSync(sourcePath)
        ? sourcePath
        : fs.existsSync(builtPath)
          ? builtPath
          : null;
      if (resolvedPath) scripts.push(fs.readFileSync(resolvedPath, 'utf8'));
    }

    new vm.Script(scripts.join('\n;\n'), {
      filename: `${file}:combined-page-scripts`,
    });
  }
}

function checkHtmlScriptResourcesAndHandlers(): void {
  const htmlFiles = fs.readdirSync(sourceRoot).filter(file => file.endsWith('.html'));
  const scriptPattern = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
  const inlineHandlerPattern = /\bon(?:click|change|input|submit|keydown|keyup|blur|focus)=["']([^"']+)["']/gi;
  const ignoredCalls = new Set([
    'Boolean', 'Number', 'String', 'clearInterval', 'clearTimeout', 'if',
    'parseFloat', 'parseInt', 'setInterval', 'setTimeout',
  ]);

  for (const file of htmlFiles) {
    const html = fs.readFileSync(path.join(sourceRoot, file), 'utf8');
    const externalReferences: string[] = [];
    const pageScripts: string[] = [];
    let scriptMatch: RegExpExecArray | null;

    while ((scriptMatch = scriptPattern.exec(html)) !== null) {
      const sourceMatch = scriptMatch[1].match(/\bsrc=["']([^"']+)["']/i);
      if (!sourceMatch) {
        pageScripts.push(scriptMatch[2]);
        continue;
      }

      const relativePath = sourceMatch[1].split(/[?#]/, 1)[0];
      if (/^https?:\/\//i.test(relativePath)) continue;
      externalReferences.push(relativePath);

      const sourceJavaScriptPath = path.join(sourceRoot, relativePath);
      const builtJavaScriptPath = path.join(projectRoot, 'dist', relativePath);
      assert.ok(
        fs.existsSync(sourceJavaScriptPath) || fs.existsSync(builtJavaScriptPath),
        `${file}의 스크립트 경로가 존재하지 않습니다: ${relativePath}`,
      );
      assert.ok(
        fs.existsSync(builtJavaScriptPath),
        `${file}의 빌드 스크립트가 존재하지 않습니다: ${relativePath}`,
      );

      if (!relativePath.endsWith('.min.js')) {
        const sourceTypeScriptPath = path.join(
          sourceRoot,
          relativePath.replace(/\.js$/i, '.ts'),
        );
        assert.ok(
          fs.existsSync(sourceTypeScriptPath),
          `${file}의 직접 작성 스크립트에 대응하는 TS 원본이 없습니다: ${relativePath}`,
        );
        pageScripts.push(fs.readFileSync(builtJavaScriptPath, 'utf8'));
      }
    }

    assert.equal(
      new Set(externalReferences).size,
      externalReferences.length,
      `${file}에 중복 로드되는 외부 스크립트가 있습니다.`,
    );

    const combinedCode = pageScripts.join('\n;\n');
    let handlerMatch: RegExpExecArray | null;
    while ((handlerMatch = inlineHandlerPattern.exec(html)) !== null) {
      const calledNames = Array.from(
        handlerMatch[1].matchAll(/(?:^|[^.\w])([A-Za-z_$][\w$]*)\s*\(/g),
        match => match[1],
      ).filter(name => !ignoredCalls.has(name));

      for (const functionName of calledNames) {
        const escapedName = functionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const declarationPattern = new RegExp(
          `(?:function\\s+${escapedName}\\s*\\(|(?:window\\.)?${escapedName}\\s*=|(?:const|let|var)\\s+${escapedName}\\s*=|class\\s+${escapedName}\\b)`,
        );
        assert.match(
          combinedCode,
          declarationPattern,
          `${file}의 인라인 이벤트 핸들러 ${functionName} 정의를 찾지 못했습니다.`,
        );
      }
    }
  }
}

function checkRendererResources() {
  const requiredSourceResources = [
    'src/renderer/game-overlay/alerts.ts',
    'src/renderer/game-overlay/devtools.ts',
    'src/renderer/settings/sound-preview.ts',
    'src/renderer/settings/list-rendering.ts',
    'src/renderer/contents-checker/audio-feedback.ts',
    'src/renderer/contents-checker/dom-rendering.ts',
    'src/renderer/diary/log-utils.ts',
  ];
  const requiredBuiltResources = requiredSourceResources.map(resource => (
    resource.replace(/^src/, 'dist').replace(/\.ts$/, '.js')
  ));
  [...requiredSourceResources, ...requiredBuiltResources].forEach(resource => {
    assert.equal(fs.existsSync(path.join(projectRoot, resource)), true, `${resource} 파일이 없습니다.`);
  });

  const copyScript = read('scripts/copy-resources.ts');
  assert.match(
    copyScript,
    /dirsToCopy\s*=\s*\[[^\]]*['"]renderer['"]/,
    'renderer 리소스 복사 규칙이 없습니다.',
  );

  const gameOverlay = read('src/game-overlay.html');
  const guideCount = (
    read('src/renderer/game-overlay/devtools.ts').match(/\[TW-Overlay 테스트 가이드\]/g)
    || []
  ).length;
  assert.equal(guideCount, 1, 'DevTools 테스트 가이드 정의가 하나가 아닙니다.');
  assert.match(gameOverlay, /renderer\/game-overlay\/devtools\.js/);

  requiredBuiltResources
    .concat([
      'dist/assets/ui-utils.js',
      'dist/shared/chatConstants.js',
      'dist/shared/buffConstants.js',
      'dist/shared/sidebarCategories.js',
    ])
    .forEach(resource => {
      new vm.Script(read(resource), { filename: resource });
    });

  const chatOverlayBundle = read('dist/chatOverlayRenderer.js');
  assert.doesNotMatch(
    chatOverlayBundle,
    /Object\.defineProperty\(exports|\brequire\(/,
    '브라우저에서 직접 로드하는 채팅 오버레이 번들에 CommonJS 런타임 코드가 포함되었습니다.',
  );
}

function checkCoefficientCalculatorVisibilityContract(): void {
  const html = read('src/coefficient-calculator.html');

  assert.match(
    html,
    /\.custom-dropdown-menu\.hidden\s*\{\s*display:\s*none;\s*\}/,
    '계수 계산기에서 닫힌 장비 드롭다운이 표시될 수 있습니다.',
  );
  assert.match(
    html,
    /<script src="assets\/tailwind\.min\.js"><\/script>/,
    '계수 계산기의 기존 Tailwind 런타임 로드 방식이 변경되었습니다.',
  );
  assert.doesNotMatch(
    html,
    /assets\/tailwind\.css/,
    '계수 계산기에 기존 스타일 우선순위를 깨뜨리는 정적 Tailwind CSS가 연결되었습니다.',
  );
}

function checkHuntingPathArrowSizing(): void {
  const html = read('src/hunting-path-simulator.html');
  assert.match(html, /const PATH_STROKE_WIDTH = 3\.0;/);
  assert.match(html, /const ARROW_MARKER_SIZE = 4\.3;/);
  assert.match(
    html,
    /line\.style\.strokeWidth = \(PATH_STROKE_WIDTH \* currentScale\) \+ 'px';/,
  );
  assert.match(
    html,
    /const mWidth = \(ARROW_MARKER_SIZE \* currentScale\)\.toFixed\(2\);/,
  );
  assert.match(html, /const refY = '5';/);
  assert.match(
    html,
    /orient="auto-start-reverse" overflow="visible"/,
    '사냥터 동선 화살촉이 SVG 마커 경계에서 잘릴 수 있습니다.',
  );
}

function checkContentsChecklistOrdering(): void {
  const html = read('src/contents-checker.html');

  assert.doesNotMatch(
    html,
    /\.sort\(\(a,\s*b\)\s*=>\s*window\.compareKoreanText\(a\.name,\s*b\.name\)\)/,
    '숙제 체크리스트가 저장된 사용자 순서 대신 이름순으로 다시 정렬됩니다.',
  );
  assert.match(
    html,
    /visibleItems\.forEach\(item\s*=>/,
    '숙제 체크리스트가 저장 배열 순서로 렌더링되지 않습니다.',
  );
  assert.match(
    html,
    /contentsReorderCategory\(drop\.resetType, drop\.sourceName, drop\.targetName, drop\.position\)/,
    '숙제 체크리스트의 카테고리 드래그 재배치 연결이 누락되었습니다.',
  );
  assert.match(
    html,
    /contentsReorderItem\(drop\.sourceId, drop\.targetId, drop\.position\)/,
    '숙제 체크리스트의 항목 드래그 재배치 연결이 누락되었습니다.',
  );
  assert.match(
    html,
    /table\.ondrop = event => commitDragPreview\(event\)/,
    '숙제 체크리스트의 테이블 드롭 커밋 연결이 누락되었습니다.',
  );
  assert.match(
    html,
    /title = '드래그하여 숙제 순서 변경'/,
    '숙제 체크리스트의 드래그 핸들이 누락되었습니다.',
  );
  assert.match(
    html,
    /const isCustomItem = item\.isCustom === true \|\| item\.id\.startsWith\('custom-'\);/,
    '구버전 커스텀 숙제 판별 호환성이 누락되었습니다.',
  );
  assert.match(
    html,
    /createBadge\(\s*'CUSTOM'/,
    '커스텀 숙제의 CUSTOM 딱지가 누락되었습니다.',
  );
}

function checkLifecycleAndIpcSafetyContracts(): void {
  [
    'src/modules/chatLogProcessor.ts',
    'src/modules/xpTracker.ts',
    'src/modules/abandonedTracker.ts',
  ].forEach(file => {
    const source = read(file);
    assert.match(source, /private _started = false;/, `${file}에 시작 상태 가드가 없습니다.`);
    assert.match(
      source,
      /public start\(\): void \{\s*if \(this\._started\)/,
      `${file}의 start()가 중복 실행을 차단하지 않습니다.`,
    );
    assert.match(
      source,
      /this\._started = true;/,
      `${file}이 시작 상태를 기록하지 않습니다.`,
    );
  });

  const preload = read('src/preload.ts');
  assert.doesNotMatch(
    preload,
    /\binvoke:\s*\(channel:\s*string/,
    'preload에 임의 IPC 채널을 호출하는 범용 invoke가 남아 있습니다.',
  );
  assert.match(preload, /getXpStats:\s*\(\): Promise<XpStats>/);
  assert.doesNotMatch(read('src/game-overlay.html'), /electronAPI\.invoke\(/);
  assert.doesNotMatch(read('src/xp-hud.html'), /electronAPI\.invoke\(/);

  const windowMessaging = read('src/modules/windowMessaging.ts');
  assert.match(
    windowMessaging,
    /function safeSend\(window: BrowserWindow,[\s\S]*window\.webContents\.isDestroyed\(\)/,
    '공용 IPC 전송에 폐기된 webContents 차단이 없습니다.',
  );
  assert.match(
    windowMessaging,
    /catch \(error\) \{[\s\S]*error\.message\.includes\('Render frame was disposed'\)/,
    '렌더 프레임 폐기 경쟁 상태의 전송 예외 처리가 없습니다.',
  );
  assert.match(
    windowMessaging,
    /throw error;/,
    '예상하지 못한 IPC 전송 오류를 다시 발생시키지 않습니다.',
  );
  assert.ok(
    (windowMessaging.match(/safeSend\(window, channel, \.\.\.args\)/g) || []).length >= 3,
    '전체 창 IPC 전송 경로가 안전 전송 함수를 사용하지 않습니다.',
  );

  const { resolveSafeChildFile } = require(
    path.join(projectRoot, 'dist/modules/safePath.js'),
  ) as {
    resolveSafeChildFile(parent: string, filename: string): string | null;
  };
  const base = path.join(projectRoot, 'test-sounds');
  assert.equal(resolveSafeChildFile(base, 'custom_safe.wav'), path.join(base, 'custom_safe.wav'));
  assert.equal(resolveSafeChildFile(base, '../outside.wav'), null);
  assert.equal(resolveSafeChildFile(base, '..\\outside.wav'), null);
  assert.equal(resolveSafeChildFile(base, 'nested/file.wav'), null);

  const ipcHandlers = read('src/modules/ipcHandlers.ts');
  assert.match(
    ipcHandlers,
    /resolveSafeChildFile\(customSoundsDir, filename\)/,
    '커스텀 사운드 삭제 경로 검증이 누락되었습니다.',
  );
}

function checkExtractedPureModules(): void {
  const { collectIncompleteContents } = require(
    path.join(projectRoot, 'dist/modules/contentsSummary.js'),
  ) as {
    collectIncompleteContents(config: {
      characterPresets: Array<{ id: string; name: string }>;
      contentsCheckerItems: Array<{
        id: string;
        name: string;
        category: string;
        isVisible: boolean;
        resetRule: { type: 'daily' | 'weekly'; hour: number };
        completedState: Record<string, { isCompleted: boolean; isExcluded?: boolean }>;
      }>;
    }): Array<{ charName: string; name: string }>;
  };

  const result = collectIncompleteContents({
    characterPresets: [
      { id: 'a', name: '가람' },
      { id: 'b', name: '나래' },
    ],
    contentsCheckerItems: [
      {
        id: 'visible',
        name: '표시 숙제',
        category: '테스트',
        isVisible: true,
        resetRule: { type: 'weekly', hour: 0 },
        completedState: {
          a: { isCompleted: false },
          b: { isCompleted: true },
        },
      },
      {
        id: 'excluded',
        name: '제외 숙제',
        category: '테스트',
        isVisible: true,
        resetRule: { type: 'daily', hour: 0 },
        completedState: {
          a: { isCompleted: false, isExcluded: true },
          b: { isCompleted: false, isExcluded: true },
        },
      },
    ],
  });
  assert.deepEqual(result, [{
    charName: '가람',
    name: '표시 숙제',
    category: '테스트',
    type: 'weekly',
  }]);
}

function checkCoreInternalTypesStayStrict(): void {
  [
    'src/preload.ts',
    'src/modules/windowManager.ts',
    'src/modules/contentsChecker.ts',
    'src/modules/chatLogProcessor.ts',
    'src/chatOverlayRenderer.ts',
    'src/shared/types.ts',
  ].forEach(file => {
    assert.doesNotMatch(
      read(file),
      /\bany\b/,
      `${file}의 핵심 내부 데이터에 any가 다시 추가되었습니다.`,
    );
  });
}

function checkLegacyContentsOrderingRemoved(): void {
  const sources = [
    'src/modules/contentsChecker.ts',
    'src/modules/ipcHandlers.ts',
    'src/preload.ts',
    'src/shared/types.ts',
  ].map(read).join('\n');

  [
    'sortOrder',
    'contentsReorderList',
    'contents-reorder-list',
    'reorderList',
  ].forEach(legacyName => {
    assert.equal(
      sources.includes(legacyName),
      false,
      `숙제 수동 정렬 레거시 코드가 남아 있습니다: ${legacyName}`,
    );
  });
}

function checkSharedUiDependencies() {
  const pagesUsingSharedUi = [];
  const sharedCallPattern = /window\.(?:bindEscapeClose|bindElectronListenerCleanup|bindChatLogStatusWarning|highlightElement|formatElapsedTime|formatLocaleNumber|formatSeedAmount|escapeHtml(?:Text|Attribute)?)\s*\(/;

  for (const file of fs.readdirSync(sourceRoot).filter(name => name.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(sourceRoot, file), 'utf8');
    if (!sharedCallPattern.test(html)) continue;
    pagesUsingSharedUi.push(file);
    const dependencyIndex = html.indexOf('assets/ui-utils.js');
    const firstCallIndex = html.search(sharedCallPattern);
    assert.notEqual(dependencyIndex, -1, `${file}에 ui-utils.js 참조가 없습니다.`);
    assert.ok(dependencyIndex < firstCallIndex, `${file}에서 ui-utils.js보다 공통 함수가 먼저 실행됩니다.`);
  }

  assert.ok(pagesUsingSharedUi.length > 0);
}

function loadBrowserConstantModule(relativePath: string, exposedProperty: string): any {
  const window: Record<string, any> = {};
  vm.runInNewContext(read(relativePath), { window }, { filename: relativePath });
  return window[exposedProperty];
}

function checkSharedConstants() {
  const chatConstants = loadBrowserConstantModule(
    'dist/shared/chatConstants.js',
    'chatConstants',
  );
  assert.deepEqual(
    Array.from(chatConstants.NPC_SENDER_BLACKLIST),
    [
      '데스포이나', '신조', '키시니크', '에레오스', '로카고스',
      '마티아', '티로로스', '라이코스', '체리아', '실반',
      '샐리온', '실라이론', '샐레아나', '루미너스', '크라모르',
    ],
  );
  assert.equal(chatConstants.isNpcSender('크라모르'), true);
  assert.equal(chatConstants.isLegacyNpcSender('크라모르'), false);
  assert.equal(chatConstants.isNpcSender('일반유저'), false);

  const chatParser = read('src/modules/chatParser.ts');
  const chatLogManager = read('src/modules/chatLogManager.ts');
  const chatOverlayRenderer = read('src/chatOverlayRenderer.ts');
  assert.match(chatParser, /require\('\.\.\/shared\/chatConstants'\)/);
  assert.match(chatLogManager, /require\('\.\.\/shared\/chatConstants'\)/);
  assert.doesNotMatch(
    chatOverlayRenderer,
    /\bconst\s*\{\s*NPC_SENDER_BLACKLIST\s*\}/,
    '채팅 오버레이가 공통 NPC 상수를 같은 이름으로 다시 선언합니다.',
  );
  assert.match(chatOverlayRenderer, /window\.chatConstants\.isNpcSender\(/);

  const buffConstants = loadBrowserConstantModule(
    'dist/shared/buffConstants.js',
    'buffConstants',
  );
  assert.equal(buffConstants.STANDARD_BUFFS.length, 9);
  assert.equal(buffConstants.STANDARD_BUFFS[0], 'util_snowman');
  assert.equal(buffConstants.STANDARD_BUFFS[8], 'util_haste');

  const sidebarCategories: any[] = loadBrowserConstantModule(
    'dist/shared/sidebarCategories.js',
    'sidebarCategories',
  );
  assert.deepEqual(
    Array.from(sidebarCategories, category => category.id),
    ['monitoring', 'alarms', 'calculators', 'information', 'utilities', 'records', 'homework'],
  );
  assert.deepEqual(
    Array.from([...sidebarCategories].sort((a, b) => a.trayOrder - b.trayOrder), category => category.id),
    ['monitoring', 'alarms', 'calculators', 'information', 'utilities', 'homework', 'records'],
  );

  const chatOverlay = read('src/chat-overlay.html');
  assert.ok(
    chatOverlay.indexOf('shared/chatConstants.js')
      < chatOverlay.indexOf('chatOverlayRenderer.js'),
    'chat-overlay 상수 모듈이 렌더러보다 늦게 로드됩니다.',
  );
  const coefficientCalculator = read('src/coefficient-calculator.html');
  assert.ok(
    coefficientCalculator.indexOf('shared/buffConstants.js')
      < coefficientCalculator.indexOf('coefficient-calculator-renderer.js'),
    '버프 상수 모듈이 계수 계산기 렌더러보다 늦게 로드됩니다.',
  );
}

function checkPreloadDefaultConfigCompatibility() {
  const preloadSource = read('src/preload.ts');
  const objectMatch = preloadSource.match(
    /const DEFAULT_CONFIG: AppConfig = (\{[\s\S]*?\r?\n\});\r?\n\r?\nfunction bindIpcListener/,
  );
  assert.ok(objectMatch, 'sandbox preload의 독립 DEFAULT_CONFIG 객체를 찾지 못했습니다.');

  const compatibilityHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(vm.runInNewContext(`(${objectMatch[1]})`)))
    .digest('hex');
  assert.equal(
    compatibilityHash,
    '9d691eceafb7ef1823eb6f9d67fee44c98e28a9185a57eef54d39f1e2cf77578',
    'preload DEFAULT_CONFIG의 기존 값 또는 열거 순서가 변경되었습니다.',
  );

  const runtimeImports = Array.from(
    preloadSource.matchAll(/^import(?!\s+type\b)[\s\S]*?from\s+['"]([^'"]+)['"];?$/gm),
    match => match[1],
  );
  assert.deepEqual(
    runtimeImports,
    ['electron'],
    'sandbox preload에 로컬 런타임 import가 추가되었습니다.',
  );

  const builtPreloadPath = path.join(projectRoot, 'dist/preload.js');
  if (fs.existsSync(builtPreloadPath)) {
    const builtPreload = fs.readFileSync(builtPreloadPath, 'utf8');
    assert.doesNotMatch(
      builtPreload,
      /require\(["']\.{1,2}\//,
      '빌드된 sandbox preload에 상대경로 require가 포함되었습니다.',
    );

    const exposedGlobals: Record<string, any> = {};
    const ipcRenderer = {
      send() {},
      invoke() {},
      removeAllListeners() {},
      on() {},
    };
    vm.runInNewContext(builtPreload, {
      exports: {},
      module: { exports: {} },
      require(moduleName: string) {
        assert.equal(moduleName, 'electron', `sandbox preload가 허용되지 않은 모듈을 요청했습니다: ${moduleName}`);
        return {
          contextBridge: {
            exposeInMainWorld(name: string, api: unknown) {
              exposedGlobals[name] = api;
            },
          },
          ipcRenderer,
        };
      },
    }, { filename: 'dist/preload.js' });
    const exposedApi = exposedGlobals.electronAPI;
    assert.ok(exposedApi);
    assert.equal(typeof exposedApi.onPlaySound, 'function');
    assert.equal(typeof exposedApi.onSpecialMonsterAlert, 'function');
  }

  const directListenerCount = (preloadSource.match(/ipcRenderer\.on\(/g) || []).length;
  assert.equal(directListenerCount, 1, 'IPC 이벤트 구독이 공통 바인더 밖에 남아 있습니다.');

  const listenerChannels = Array.from(
    preloadSource.matchAll(/bindIpcListener(?:<[^>]*>)?\(\s*'([^']+)'/g),
    match => match[1],
  );
  assert.deepEqual(listenerChannels, [
    'trigger-jellyppy-rain', 'trigger-firework', 'sidebar-status', 'overlay-status',
    'chat-overlay-status', 'click-through-status', 'active-windows', 'config-data',
    'url-change', 'load-status', 'gallery-posts', 'gallery-new-activity',
    'gallery-watched-update', 'gallery-connection-status', 'update-status',
    'boss-times-data', 'play-sound', 'trade-posts', 'trade-new-activity',
    'trade-connection-status', 'open-settings-tab', 'highlight-alarm-settings',
    'toolbar-hover', 'reminder-message', 'incomplete-contents', 'diary-updated',
    'xp-update', 'shout-history-updated', 'buff-timer-update', 'buff-timer-warning',
    'xp-reset-done', 'essence-alert', 'pitta-alert', 'special-monster-alert',
    'ethos-alert', 'abyss-apostle-alert', 'wave-warning-alert', 'lokagos-alert',
    'quest-started', 'quest-update', 'quest-complete', 'quest-cancelled',
    'scam-alert', 'scam-analysis-result', 'scam-progress', 'scam-session-update',
    'scam-analysis-token', 'auto-select-equipment', 'auto-select-evolution',
    'abandoned-update', 'abandoned-alert', 'abandoned-hide-now', 'chat-updated',
    'chat-history-cleared', 'chat-overlay-mode', 'chat-log-status-changed',
    'alarm-logs-updated', 'timer-toggle', 'timer-updated',
  ]);
}

function checkRequestedFeatureContracts() {
  const contents: any[] = JSON.parse(read('src/assets/data/contents.json'));
  const eternalFloor = contents.find(item => item.id === 'weekly-eternal-floor');
  assert.ok(eternalFloor, '이터널 플로어 숙제가 없습니다.');
  assert.equal(eternalFloor.category, '재화');
  assert.equal(eternalFloor.maxCount, 10);
  assert.equal(eternalFloor.resetRule.type, 'weekly');
  [
    ['weekly-orly-defense', 7],
    ['weekly-shinjo-nest', 7],
    ['weekly-vestige', 7],
  ].forEach(([id, maxCount]) => {
    const item = contents.find(candidate => candidate.id === id);
    assert.ok(item, `${id} 숙제가 없습니다.`);
    assert.equal(item.maxCount, maxCount, `${id}의 주간 횟수가 변경되었습니다.`);
  });

  const parser = read('src/modules/chatParser.ts');
  [
    'SPECIAL_MONSTER_SPAWN',
    'ETERNAL_FLOOR_CLEAR',
    'ORLY_DEFENSE_CLEAR',
    'CONTENT_SHINJO_NEST_CLEAR',
    'VESTIGE_CLEAR',
    '성난\\s*빅테디의\\s*별사탕',
    '이번\\s*주\\s*신조\\s*보상을',
    '남은\\s*공격\\s*횟수',
  ].forEach(contract => assert.ok(parser.includes(contract), `채팅 파서 계약 누락: ${contract}`));

  const processor = read('src/modules/chatLogProcessor.ts');
  assert.match(processor, /queueFixedHomework\('ETERNAL_FLOOR_CLEAR', 'weekly-eternal-floor'\)/);
  assert.match(
    processor,
    /queueCountHomework\('CONTENT_SHINJO_NEST_CLEAR', 'weekly-shinjo-nest'\)/,
  );
  [
    "['ORLY_DEFENSE_CLEAR', 'weekly-orly-defense']",
    "['VESTIGE_CLEAR', 'weekly-vestige']",
  ].forEach(mapping => {
    assert.ok(processor.includes(mapping), `숙제 카운팅 매핑 누락: ${mapping}`);
  });
  assert.match(processor, /sendGameOverlayEvent\('special-monster-alert', data\)/);

  const gameOverlay = read('src/game-overlay.html');
  assert.match(gameOverlay, /onSpecialMonsterAlert/);
  assert.match(read('src/renderer/game-overlay/devtools.ts'), /testSpecialMonsterAlert/);
}

function checkRequestedChatSamples(): void {
  const { chatParser } = require(path.join(projectRoot, 'dist/modules/chatParser.js')) as {
    chatParser: {
      once(event: string, listener: (data: { count?: number }) => void): void;
      parseLine(line: string): void;
    };
  };
  const samples: Array<[event: string, line: string, expectedCount?: number]> = [
    [
      'SPECIAL_MONSTER_SPAWN',
      '<font size="2" color="white"> [17시 11분  8초] </font><font>맵 어딘가에 특별 몬스터가 출현하였습니다.</font></br>',
    ],
    [
      'ETERNAL_FLOOR_CLEAR',
      '<font size="2" color="white"> [17시 11분  8초] </font><font>[이터널 플로어 보상 상자] 아이템을 획득하였습니다.</font></br>',
    ],
    [
      'ORLY_DEFENSE_CLEAR',
      '<font size="2" color="white"> [21시 33분 22초] </font><font>남은 공격 횟수 : 1</font></br>',
    ],
    [
      'VESTIGE_CLEAR',
      '<font size="2" color="white"> [21시 42분 59초] </font><font>[성난 빅테디의 별사탕] 아이템을 획득하였습니다.</font></br>',
    ],
    [
      'CONTENT_SHINJO_NEST_CLEAR',
      '<font size="2" color="white"> [12시 18분 38초] </font><font>이번 주 신조 보상을 5회 획득 하셨습니다. 한 주에 7회까지 획득 할 수 있습니다.</font></br>',
      5,
    ],
  ];

  for (const [event, line, expectedCount] of samples) {
    let emittedCount = 0;
    let parsedCount: number | undefined;
    chatParser.once(event, data => {
      emittedCount++;
      parsedCount = data.count;
    });
    chatParser.parseLine(line);
    assert.equal(emittedCount, 1, `${event} 이벤트가 정확히 한 번 발생하지 않았습니다.`);
    if (expectedCount !== undefined) {
      assert.equal(parsedCount, expectedCount, `${event} 횟수 파싱에 실패했습니다.`);
    }
  }
}

function checkNoAuthoredJavaScriptSources(): void {
  const authoredJavaScriptFiles: string[] = [];

  function walk(directory: string): void {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
      } else if (entry.name.endsWith('.js') && !entry.name.endsWith('.min.js')) {
        authoredJavaScriptFiles.push(path.relative(projectRoot, absolutePath));
      }
    }
  }

  walk(path.join(projectRoot, 'src'));
  walk(path.join(projectRoot, 'scripts'));
  assert.deepEqual(
    authoredJavaScriptFiles,
    [],
    `직접 작성한 JavaScript 원본이 남아 있습니다: ${authoredJavaScriptFiles.join(', ')}`,
  );
}

function checkAgentDocumentationLocations(): void {
  [
    '.agents/AGENTS.md',
    '.agents/PROJECT_GUIDE.md',
    '.agents/DESIGN_TOKENS.md',
    '.agents/release_workflow.md',
  ].forEach(file => {
    assert.equal(fs.existsSync(path.join(projectRoot, file)), true, `${file} 파일이 없습니다.`);
  });
  [
    '.gemini/DESIGN_TOKENS.md',
    '.gemini/release_workflow.md',
  ].forEach(file => {
    assert.equal(
      fs.existsSync(path.join(projectRoot, file)),
      false,
      `사용 중단된 Gemini 문서 경로가 다시 추가되었습니다: ${file}`,
    );
  });

  const agentRules = read('.agents/AGENTS.md');
  assert.match(agentRules, /\[PROJECT_GUIDE\.md\]\(\.\/PROJECT_GUIDE\.md\)/);
  assert.match(agentRules, /\[DESIGN_TOKENS\.md\]\(\.\/DESIGN_TOKENS\.md\)/);
  assert.match(agentRules, /\[release_workflow\.md\]\(\.\/release_workflow\.md\)/);

  const projectGuide = read('.agents/PROJECT_GUIDE.md');
  [
    'src/main.ts',
    'src/modules',
    'src/shared',
    'src/renderer',
    'ChatLogManager',
    'ChatParser',
    'ChatLogProcessor',
    'npm run typecheck',
    'npm test',
  ].forEach(requiredText => assert.ok(
    projectGuide.includes(requiredText),
    `프로젝트 가이드에 필수 설명이 없습니다: ${requiredText}`,
  ));

  const releaseWorkflow = read('.agents/release_workflow.md');
  ['npm run typecheck', 'npm test', 'npm audit --omit=dev', 'npm run dist', 'npm run build-tools']
    .forEach(command => assert.ok(
      releaseWorkflow.includes(command),
      `릴리즈 워크플로우에 필수 명령이 없습니다: ${command}`,
    ));

  const buildWorkflow = read('.github/workflows/build.yml');
  [
    'actions/checkout@v6',
    'actions/setup-node@v6',
    'node-version: 24',
    'npm ci',
    'npm run typecheck',
    'npm test',
    'npm audit --omit=dev',
    'npm exec electron-builder -- --win --publish never',
    'softprops/action-gh-release@v3',
    'draft: true',
    'fail_on_unmatched_files: true',
    'dist_electron/twOverlay-Setup-*.exe',
    'dist_electron/twOverlay-Setup-*.exe.blockmap',
    'dist_electron/latest.yml',
  ]
    .forEach(command => assert.ok(
      buildWorkflow.includes(command),
      `GitHub Actions 배포 검증에 필수 명령이 없습니다: ${command}`,
    ));
  assert.equal(
    (buildWorkflow.match(/softprops\/action-gh-release@v3/g) || []).length,
    1,
    'GitHub Draft Release 생성 단계는 정확히 하나여야 합니다.',
  );
  assert.doesNotMatch(
    buildWorkflow,
    /action-electron-builder|--publish\s+(?:always|onTag|onTagOrDraft)/,
    'Electron Builder가 GitHub Release를 직접 게시하면 Draft가 중복 생성될 수 있습니다.',
  );
}

function checkBuffTimerChatTriggers(): void {
  const { chatParser } = require(path.join(projectRoot, 'dist', 'modules', 'chatParser.js'));

  const detected: Array<{ buffId: string; usedBy: string }> = [];
  const listener = (data: { buffId: string; usedBy: string }) => {
    detected.push({ buffId: data.buffId, usedBy: data.usedBy });
  };

  chatParser.on('BUFF_USED', listener);

  try {
    // 실제 게임 로그 형식: 시간 태그 + 색상 태그가 한 줄에 존재
    chatParser.parseLine('<font size="2" color="white"> [21시 35분 5초] </font><font size="2" color="#ff64ff">[전기세비싸]님이 [통찰의 비약(대)] 아이템을 사용하셨습니다</font>');
    chatParser.parseLine('<font size="2" color="white"> [21시 35분 59초] </font><font size="2" color="#ff64ff">[전기세비싸]님이 [통찰의 비약(특대)] 아이템을 사용하셨습니다</font>');
    chatParser.parseLine('<font size="2" color="white"> [21시 00분 00초] </font>[경험의 심장]을(를) 사용하였습니다.');
    chatParser.parseLine('<font size="2" color="white"> [21시 00분 01초] </font>[홍길동]님이 [로토의 부적] 아이템을 사용하셨습니다.');
    chatParser.parseLine('<font size="2" color="white"> [12시  3분 20초] </font> <font size="2" color="#ff64ff">친구들이 주는 신뢰가 힘을 주고 있다. 모든 능력치 31 증가.</font></br>');

    assert.equal(detected.length, 4, `타이머 표시 대상 4개만 감지되어야 합니다. (실제: ${detected.length}개, buffIds: ${detected.map(d => d.buffId).join(', ')})`);
    assert.deepEqual(detected[0], { buffId: 'insight_elixir_large', usedBy: '전기세비싸' });
    assert.deepEqual(detected[1], { buffId: 'insight_elixir_special', usedBy: '전기세비싸' });
    assert.deepEqual(detected[2], { buffId: 'exp_heart', usedBy: 'self' });
    assert.deepEqual(detected[3], { buffId: 'rare_loto', usedBy: '홍길동' });
  } finally {
    chatParser.removeListener('BUFF_USED', listener);
  }
}

checkCommonFormatters();
checkAnalyticsProtocol();
checkDevtoolsInitializationIsIdempotent();
checkInlineScriptSyntax();
checkPageScriptNamespaceCollisions();
checkHtmlScriptResourcesAndHandlers();
checkRendererResources();
checkCoefficientCalculatorVisibilityContract();
checkHuntingPathArrowSizing();
checkContentsChecklistOrdering();
checkLifecycleAndIpcSafetyContracts();
checkExtractedPureModules();
checkCoreInternalTypesStayStrict();
checkLegacyContentsOrderingRemoved();
checkSharedUiDependencies();
checkSharedConstants();
checkPreloadDefaultConfigCompatibility();
checkRequestedFeatureContracts();
checkRequestedChatSamples();
checkNoAuthoredJavaScriptSources();
checkAgentDocumentationLocations();
checkBuffTimerChatTriggers();

console.log('Refactor regression checks passed.');
