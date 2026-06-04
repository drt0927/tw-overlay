/**
 * 공유 타입 정의 — 메인 프로세스와 렌더러 프로세스 양쪽에서 사용
 * constants.ts와 preload.ts 모두 여기서 import합니다.
 */

// ── ChatParser 이벤트 타입 맵 ──
// chatParser.emit() / chatParser.on() 에서 컴파일 타임 타입 검증에 사용

export const MAIN_CHAR_ID = 'char-main';
export const DEFAULT_CHAR_NAME = '본캐';

export interface ChatParserEventMap {
    SEED_GAINED: { date: string; timestamp: string; amount: number; message: string };
    ABANDONED_FEE: { date: string; timestamp: string; amount: number; message: string };
    ABANDONED_ENTRY: { date: string; timestamp: string; region: string; count: number; message: string };
    MAGIC_STONE_GAIN: { date: string; timestamp: string; grade: string; count: number; message: string };
    MAGIC_STONE_LOSS: { date: string; timestamp: string; grade: string; count: number; message: string };
    ITEM_LOOTED: { date: string; timestamp: string; message: string };
    XP_CHANGED: { date: string; timestamp: string; amount: number; message: string };
    TRADE_SHOUT: { date: string; timestamp: string; sender: string; message: string };
    BUFF_USED: { date: string; timestamp: string; buffId: string; usedBy: string; message: string };
    PITTA_ENTRY: { date: string; timestamp: string; energy: number; grade: string; message: string };
    PITTA_CLEAR: { date: string; timestamp: string; grade: string; itemName: string; message: string };
    ETHOS_PASSWORD: { date: string; timestamp: string; password: string; message: string };
    ECLIPSE_BOSS_CLEAR: { date: string; timestamp: string; bossName: string; count: number; message: string };
    ECLIPSE_SUPPLIES_CLEAR: { date: string; timestamp: string; count: number; message: string };
    ECLIPSE_SPECIAL_FORCE_CLEAR: { date: string; timestamp: string; count: number; message: string };
    MERCURIAL_BOSS_CLEAR: { date: string; timestamp: string; bossName: string; count: number; message: string };
    CORE_MASTER_CLEAR: { date: string; timestamp: string; contentName: string; count: number; isIncrement?: boolean; message: string };
    RELIC_SANCTUARY_CLEAR: { date: string; timestamp: string; count: number; message: string };
    TESIS_CORE_CLEAR: { date: string; timestamp: string; message: string };
    POWER_ROOT_CLEAR: { date: string; timestamp: string; count: number; message: string };
    ABYSS_TREASURE_ENTRY: { date: string; timestamp: string; count: number; message: string };
    FORTRESS_GHOST_CLEAR: { date: string; timestamp: string; count: number; message: string };
    DIGSITE_ENTRY: { date: string; timestamp: string; count?: number; message: string };
    CONTENT_SHINJO_NEST_CLEAR: { date: string; timestamp: string; message: string };
    ABYSS_DUNGEON_CLEAR: { date: string; timestamp: string; depth: string; count: number; message: string };
    ABYSS_BOSS_EX_CLEAR: { date: string; timestamp: string; count: number; message: string };
    PRAVA_DEFENSE_CLEAR: { date: string; timestamp: string; count: number; message: string };
    CATACOMB_CLEAR: { date: string; timestamp: string; count: number; message: string };
    SIOKAN_BOSS_CLEAR: { date: string; timestamp: string; count: number; message: string };

    VESTIGE_CLEAR: { date: string; timestamp: string; message: string };
    APETHIRIA_RAID_CLEAR: { date: string; timestamp: string; count: number; message: string };
    NORMAL_CHAT: { date: string; timestamp: string; sender: string; message: string; color: string };
    ABYSS_APOSTLE_PATTERN: { date: string; timestamp: string; message: string };
    WAVE_MONSTER_WARNING: { date: string; timestamp: string; message: string };
}

// ── 어벤던로드 상태 타입 ──
export interface AbandonedRoadState {
    regions: Record<string, number>;
    profit: number;
    isActive: boolean;
    isEnabled: boolean;
    stoneGains: Record<string, number>;
    stoneLosses: Record<string, number>;
    totalFee: number;
    currentRegion: string;
    regionDetails: Record<string, {
        count: number;
        totalFee: number;
        stoneGains: Record<string, number>;
        stoneLosses: Record<string, number>;
    }>;
}

export interface QuickSlotItem {
    label: string;
    icon: string;
    url: string;
    external: boolean;
    iconType?: 'icon' | 'text';
    textChar?: string;
}

export interface WatchedPost {
    title: string;
    commentCount: number;
    addedAt: number;
}

export interface WindowPosition {
    offsetX: number;
    offsetY: number;
}

export interface GameRect {
    x: number;
    y: number;
    width: number;
    height: number;
    gameHwnd?: string;
    isForeground?: boolean;
}

export interface GameNotRunning {
    notRunning: true;
}

export interface GameError {
    error: string;
}

export type GameQueryResult = GameRect | GameNotRunning | GameError | null | undefined;

export interface BossSetting {
    name: string;
    enabled: boolean;
    soundFile: string;
}

export interface CustomAlert {
    id: string;
    enabled: boolean;
    type: 'daily' | 'hourly';  // daily: 매일 HH:mm, hourly: 매시 ?분
    time?: string;      // 'daily' 전용: "HH:mm"
    minute?: number;    // 'hourly' 전용: 0~59
    offsets: number[];  // e.g. [10, 5, 0]
    message: string;
    soundFile: string;
}

export interface ShortcutsConfig {
    /** 창 투과(Click-through) 토글 */
    toggleClickThrough: string;
    /** 숙제 체크 리스트 창 토글 */
    toggleContentsChecker?: string;
    /** 버프 타이머 HUD 표시 토글 */
    toggleBuffHud?: string;
    /** Dock 바 토글 */
    toggleDock?: string;
    /** 채팅창 오버레이 토글/싱크 */
    toggleChatOverlaySync?: string;
}

/** 채팅 로그 버프 감지 트리거 */
export type ChatPatternType = 'SELF_USE' | 'PARTY_ITEM' | 'EFFECT_APPLIED' | 'FIXED_MSG';

export interface ChatTrigger {
    pattern: ChatPatternType;
    keyword: string;
    matchType?: 'exact' | 'contains'; // 기본값: 'exact'
}

/** buffs.json 단일 항목 타입 */
export interface BuffDefinition {
    id: string;
    name: string;
    category: string;
    effect: string;
    duration: string;
    durationMs: number;
    group: string;
    removeOnExit?: boolean;
    removeOnDeath?: boolean;
    image: string;
    chatTriggers: ChatTrigger[];
    description: string;
}


export interface ResetRule {
    type: 'daily' | 'weekly';
    dayOfWeek?: number;
    hour?: number;
}

export interface ContentsCheckerItem {
    id: string;
    name: string;
    category: string;
    isVisible: boolean;
    isCustom?: boolean;
    resetRule: ResetRule;
    sortOrder?: number;
    maxCount?: number; // 최대 완료 필요 횟수 (생략 시 기본값: 1)
    auto?: boolean;    // 실시간 채팅 로그를 통한 자동 체크 지원 여부

    /** 캐릭터별 완료 상태 (다중 캐릭터 지원) */
    completedState: {
        [characterId: string]: {
            isCompleted: boolean;
            lastCompletedAt?: number;
            isExcluded?: boolean; // 캐릭터별 참여 제외 여부
            currentCount?: number; // 현재 완료 횟수 (0 ~ maxCount)
        }
    };
}

export interface CharacterPreset {
    id: string;   // 고유 ID (예: 'char-1')
    name: string; // 사용자 지정 이름 (예: '본캐', '티치엘')
}

export interface PendingHomework {
    id: string;         // 숙제 ID (예: 'weekly-eclipse-boss-ethos')
    count: number;      // 감지된 횟수
    isIncrement: boolean; // 횟수 누적 방식 여부
    timestamp: number;  // 감지된 시간
}

export interface DiscordKeywordRule {
    keyword: string;          // 감지할 키워드
    targetNormal: boolean;    // 일반 채팅 감지 여부 (#ffffff & #c8ffc8)
    targetClub: boolean;      // 클럽 채팅 감지 여부 (#94ddfa)
    targetShout: boolean;     // 외치기 감지 여부 (#c896c8)
    targetSender?: string;    // 특정 보낸 사람 필터 (비어있으면 전체 감지)
}

export interface AppConfig {
    width: number;
    height: number;
    opacity: number;
    url: string;
    homeUrl: string;
    quickSlots: QuickSlotItem[];
    galleryLastSeen?: number;
    galleryWatched?: Record<string, WatchedPost>;
    galleryNotify?: boolean;
    overlayVisible?: boolean;
    autoLaunch?: boolean;
    autoUpdateEnabled?: boolean;
    galleryKeywords?: string[];
    hiddenMenuIds?: string[];
    visibleMenuIds?: string[];
    fieldBossNotifyEnabled?: boolean;
    fieldBossNotifyOffsets?: number[];
    fieldBossNotifyVolume?: number;
    fieldBossSettings?: Record<string, BossSetting>;
    positions?: {
        overlay?: WindowPosition;
        settings?: WindowPosition;
        gallery?: WindowPosition;
        abbreviation?: WindowPosition;
        buffs?: WindowPosition;
        bossSettings?: WindowPosition;
        etaRanking?: WindowPosition;
        trade?: WindowPosition;
        coefficientCalculator?: WindowPosition;
        contentsChecker?: WindowPosition;
        evolutionCalculator?: WindowPosition;
        magicStoneCalculator?: WindowPosition;
        customAlert?: WindowPosition;
        diary?: WindowPosition;
        buffTimer?: WindowPosition;
        scamDetector?: WindowPosition;
        chatOverlay?: WindowPosition;
        chatOverlaySub?: WindowPosition;
        chatOverlaySub2?: WindowPosition;
      };
    tradeServer?: string;
    tradeKeywords?: string[];
    tradeNotify?: boolean;
    tradeLastSeen?: number;
    gameExitReminderEnabled?: boolean;
    gameExitReminderMessage?: string;
    contentsCheckerItems?: ContentsCheckerItem[];
    characterPresets?: CharacterPreset[];
    selectedCharacterId?: string;
    pendingHomeworks?: PendingHomework[];
    lastContentsResetCheck?: number;
    shortcuts?: ShortcutsConfig;
    customAlerts?: CustomAlert[];

    // --- Chat Log Settings ---
    chatLogPath?: string;
    chatLogAutoDeleteDays?: number;
    lootKeywords?: string[];
    shoutKeywords?: string[];
    ethosAlertEnabled?: boolean;
    abyssApostleAlertEnabled?: boolean;
    wordAlarmEnabled?: boolean;
    wordAlarmKeywords?: string[];
    wordAlarmSound?: string;
    wordAlarmVolume?: number;
    wordAlarmHistoryEnabled?: boolean;
    showXpWidget?: boolean;
    ignoreNegativeXp?: boolean;
    xpWidgetPos?: { left: number; bottom: number };
    waveMonsterWarningEnabled?: boolean;
    waveMonsterWarningSound?: string;
    waveMonsterWarningVolume?: number;

    // --- Buff Timer Settings ---
    buffTimerEnabled?: boolean;
    showBuffHud?: boolean;
    buffTimerWarnSeconds?: number[];
    buffTimerAudioAlert?: boolean;
    buffTimerVisualAlert?: boolean;
    buffTimerVolume?: number;
    buffTimerSound?: string;
    buffTimerBuffs?: { [buffId: string]: boolean }; // buffId → 감지 활성화 여부
    buffTimerCenterAlert?: boolean;
    buffTimerHudPos?: { left: number; bottom: number };

    // --- Essence Alert Settings ---
    essenceAlertEnabled?: boolean;
    essenceAlertSound?: string;
    essenceAlertVolume?: number;

    // --- Abandoned Road Settings ---
    abandonedAutoHideMinutes?: number;
    abandonedEnabled?: boolean;
    abandonedWidgetPos?: { left: number; bottom: number };

    // --- Scam Detector Settings ---
    scamDetectorEnabled?: boolean;
    msgerLogPath?: string;
    scamAlertSound?: string;
    scamGpuVariant?: LlamaServerVariant;
    scamLlmDisabled?: boolean;

    // --- Discord Webhook Settings ---
    discordWebhookUrl?: string;
    discordAlertEnabled?: boolean;
    discordKeywords?: string[];
    discordRules?: DiscordKeywordRule[];

    // --- Sound Settings ---
    volumeContentsChecker?: number;
    volumeCalculators?: number;
    sidebarPosition?: 'left' | 'right' | 'dock';

    // --- Chat Overlay Settings ---
    chatOverlayEnabled?: boolean;
    chatOverlaySubEnabled?: boolean; // 신규 추가
    chatOverlaySub2Enabled?: boolean;
    chatOverlayOpacity?: number;
    chatOverlayFontSize?: number;
    chatOverlayClickThrough?: boolean;
    chatOverlayKeywords?: string[];
    userServer?: number; // 16: 네냐플, 7: 하이아칸
    etaDataUrl?: string;
    chatOverlayWidth?: number;
    chatOverlayHeight?: number;
    chatOverlaySelectedChannels?: string[];
    chatOverlaySubWidth?: number;
    chatOverlaySubHeight?: number;
    chatOverlayTab?: string;
    chatOverlaySubTab?: string;
    chatOverlaySub2Width?: number;
    chatOverlaySub2Height?: number;
    chatOverlaySub2Tab?: string;
}

export interface GalleryPost {
    no: number;
    title: string;
    writer: string;
    replyCount: number;
    time: string;
}

export interface GalleryActivity {
    type: string;
    count: number;
    postNo?: string;
}

export interface UpdateStatusInfo {
    state: 'checking' | 'available' | 'latest' | 'downloading' | 'ready' | 'error' | 'dev-mode' | 'mandatory';
    isMandatory?: boolean;
    version?: string;
    percent?: number;
    message?: string;
    releaseNotes?: string;
}

export interface EtaRankingEntry {
    rank: number;
    character: string;
    nickname: string;
    level: number;
    point: number;
}

export interface EtaRankingResult {
    lastUpdate: string;
    entries: EtaRankingEntry[];
}

export interface EtaRankingParams {
    sc?: number;
    cc?: number;
    page?: number;
    search?: string;
}

export interface TradePost {
    no: number;
    title: string;
    writer: string;
    date: string;
    url: string;
}

export interface TradeActivity {
    type: string;
    count: number;
}

// --- Scam Detector Types ---

export interface MessengerMessage {
  timestamp: string;
  sender: string;
  content: string;
  isSystem: boolean;
  etaLevel?: number | null;
  isSelf?: boolean;
}

export interface ScamAnalysisResult {
  verdict: 'SCAM' | 'SUSPICIOUS' | 'SAFE' | 'UNKNOWN';
  detectedScamTypes: string;
  analysisReason: string;
  actionGuidance: string;
  rawResponse: string;
  filePath: string;
  analyzedAt: number;
}

export interface ModelStatus {
  downloaded: boolean;
  downloading: boolean;
  progress: number;
  modelPath: string;
  serverBinaryReady: boolean;
}

export interface ServerStatus {
  running: boolean;
  ready: boolean;
  pid: number | null;
  activeSessions: number;
}

export interface SessionState {
  filePath: string;
  fileName: string;
  messageCount: number;
  newSinceLastAnalysis: number;
  analyzing: boolean;
  debounceActive: boolean;
  lastVerdict: 'SCAM' | 'SUSPICIOUS' | 'SAFE' | 'UNKNOWN';
  lastMessageTime: number;
  lastAnalysisAt: number;
  messages?: MessengerMessage[];
}

export type LlamaServerVariant = 'cuda-13.1' | 'cuda-12.4' | 'vulkan' | 'cpu';

export interface GpuDetectionResult {
  gpuType: 'nvidia' | 'amd' | 'intel' | 'none';
  gpuName: string;
  cudaVersion?: string;     // e.g. "12.4", "13.1"
  binaryVariant: LlamaServerVariant;
  binaryUrl: string;
  cudartUrl?: string;       // CUDA 빌드 전용 — 런타임 DLL zip
}

// --- Diary (Adventure Log) System Types ---

export interface DiaryEntry {
    date: string;         // YYYY-MM-DD
    total_score: number;
    monster_id: string;
    daily_done: number;
    daily_total: number;
    weekly_done: number;
    weekly_total: number;
}

export interface HomeworkLog {
    id?: number;
    date: string;         // YYYY-MM-DD
    content_id: string;
    content_name: string;
    category: string;
    type: 'daily' | 'weekly';
    completed_at: number; // Timestamp
}

export interface ActivityLog {
    id?: number;
    date: string;         // YYYY-MM-DD
    type: 'boss' | 'calc' | 'memo' | 'loot' | 'homework';
    content: string;
    time: string;         // HH:mm:ss
}

export interface DiaryData {
    diary: DiaryEntry | null;
    homeworkLogs: HomeworkLog[];
    activityLogs: ActivityLog[];
}

export interface AbandonedRoadState {
    regions: Record<string, number>;
    profit: number;
    isActive: boolean;
    stoneGains: Record<string, number>;
    stoneLosses: Record<string, number>;
    totalFee: number;
    currentRegion: string;
    regionDetails: Record<string, {
        count: number;
        totalFee: number;
        stoneGains: Record<string, number>;
        stoneLosses: Record<string, number>;
    }>;
}
