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
    };
    tradeServer?: string;
    tradeKeywords?: string[];
    tradeNotify?: boolean;
    tradeLastSeen?: number;
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
    state: 'checking' | 'available' | 'latest' | 'downloading' | 'ready' | 'error' | 'dev-mode';
    version?: string;
    percent?: number;
    message?: string;
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
