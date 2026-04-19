/**
 * 공유 타입 정의 — 메인 프로세스와 렌더러 프로세스 양쪽에서 사용
 * constants.ts와 preload.ts 모두 여기서 import합니다.
 */

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
}

export interface ResetRule {
    type: 'daily' | 'weekly';
    dayOfWeek?: number;
    hour?: number;
}

export interface ContentsCheckerItem {
    id: string;
    name: string;
    isCompleted: boolean;
    isVisible: boolean;
    isCustom: boolean;
    category: string;
    resetRule: ResetRule;
    lastCompletedAt?: number;
    sortOrder?: number;
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
    };
    tradeServer?: string;
    tradeKeywords?: string[];
    tradeNotify?: boolean;
    tradeLastSeen?: number;
    gameExitReminderEnabled?: boolean;
    gameExitReminderMessage?: string;
    contentsCheckerItems?: ContentsCheckerItem[];
    lastContentsResetCheck?: number;
    shortcuts?: ShortcutsConfig;
    customAlerts?: CustomAlert[];

    // --- Chat Log Settings ---
    chatLogPath?: string;
    lootKeywords?: string[];
    shoutKeywords?: string[];
    showXpWidget?: boolean;
    xpWidgetPos?: { left: number; bottom: number };
    enableMagicCircleAlert?: boolean;
    magicCircleAlertSound?: string;
    
    // --- Sound Settings ---
    volumeContentsChecker?: number;
    volumeCalculators?: number;
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
