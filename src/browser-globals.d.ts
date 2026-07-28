type BrowserAppConfig = import('./shared/types').AppConfig;
type BrowserChatItem = import('./shared/types').ChatItem;

interface SoundListItem {
  name: string;
  file: string;
}

interface BossToastPresentation {
  isRealBoss: boolean;
  validSpawnTime: string | null;
  displayName: string;
  iconName: string;
  iconColor: string;
}

interface ScamToastPresentation {
  isScam: boolean;
  title: string;
  colorClass: string;
  reason: string;
}

interface GameOverlayAlerts {
  showAbandonedAlert(region: string): void;
  showEssenceAlert(): void;
  showPittaAlert(): void;
  showSpecialMonsterAlert(): void;
  showQuestComplete(options: {
    questName: string;
    target: number;
    iconName: string;
  }): void;
}

interface SettingsSoundPreview {
  previewAlertSound(options: {
    soundElementId: string;
    volumeElementId: string;
    label: string;
    fallbackSound?: string | null;
    fallbackVolume: number;
    allowNone?: boolean;
  }): void;
}

interface SettingsListRendering {
  createKeywordTag(
    keyword: string,
    className: string,
    onRemove: () => void,
  ): HTMLSpanElement;
  createCustomSoundRow(options: {
    sound: SoundListItem;
    onPreview: () => void;
    onRename: (name: string) => void;
    onDelete: () => void;
  }): HTMLDivElement;
}

interface ContentsAudioFeedback {
  getVolume(config: { volumeContentsChecker?: number } | null | undefined): number;
  play(
    config: { volumeContentsChecker?: number } | null | undefined,
    soundFile: string,
  ): void;
  getCompletionSound(resetType: string): string;
}

interface ContentsDomRendering {
  createElement<K extends keyof HTMLElementTagNameMap>(
    tagName: K,
    className?: string,
    text?: string,
  ): HTMLElementTagNameMap[K];
  createIcon(name: string, className: string): HTMLElement;
  createBadge(text: string, className: string): HTMLSpanElement;
  createIconButton(options: {
    icon: string;
    className: string;
    iconClassName: string;
    title?: string;
    onClick: (event: MouseEvent) => void;
  }): HTMLButtonElement;
  setStatusButtonContent(
    button: HTMLButtonElement,
    characterName: string,
    statusText: string,
    statusClassName: string,
  ): void;
}

interface DiaryLogUtils {
  parseAutoLogAmount(content: string): number;
  formatLogContent(content: string): string;
}

interface Window {
  lucide?: {
    createIcons(): void;
  };
  REAL_BOSSES: readonly string[];
  refreshIcons(): void;
  replayAnimation(element: HTMLElement | null, className?: string): void;
  bindEscapeClose(): void;
  bindElectronListenerCleanup(): void;
  highlightElement(
    element: HTMLElement | null,
    activeStyle: { borderColor: string; boxShadow: string },
  ): void;
  loadSoundList(): Promise<SoundListItem[]>;
  updateRangeValue(inputElement: HTMLInputElement, targetId: string): void;
  formatElapsedTime(milliseconds: number): string;
  formatLocaleNumber(value: number): string;
  compareKoreanText(left: unknown, right: unknown): number;
  normalizeChatDisplayText(value: unknown): string;
  formatSeedAmount(seed: number): string;
  playPreview(soundFile: string, volume?: number | null, bossName?: string): void;
  escapeHtml(value: string): string;
  escapeHtmlText(value: string): string;
  escapeHtmlAttribute(value: string): string;
  getBossToastPresentation(
    bossName: string,
    isCustomFromApi: boolean,
    spawnTime: string | null | undefined,
    offset: number,
  ): BossToastPresentation;
  getScamToastPresentation(result: {
    verdict: string;
    analysisReason?: string;
    detectedScamTypes?: string;
  }): ScamToastPresentation;
  showChatLogWarningBanner(options?: { variant?: 'overlay' }): void;
  bindChatLogStatusWarning(options?: { variant?: 'overlay' }): void;
  gameOverlayAlerts: GameOverlayAlerts;
  settingsSoundPreview: SettingsSoundPreview;
  settingsListRendering: SettingsListRendering;
  contentsAudioFeedback: ContentsAudioFeedback;
  contentsDomRendering: ContentsDomRendering;
  diaryLogUtils: DiaryLogUtils;
  __twEscapeCloseBound?: boolean;
  __twElectronListenerCleanupBound?: boolean;
  __twChatLogStatusWarningBound?: boolean;
  __twOverlayDevtoolsInitialized?: boolean;
  testEssenceAlert(): void;
  testSpecialMonsterAlert(): void;
  testLokagos(type?: string, zone?: string): void;
  testEthos(passwordOrDirection?: string): void;
  testAbyssApostle(): void;
}
