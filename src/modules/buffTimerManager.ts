/**
 * 버프 타이머 매니저 — 채팅 로그 기반 버프 남은시간 계산 및 경고 알림
 */
import { BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as config from './config';
import { log } from './logger';
import type { BuffDefinition } from '../shared/types';

export interface ActiveBuff {
  buffId: string;
  name: string;
  durationMs: number;
  startTime: number;      // Date.now() 기준
  usedBy: string;         // 'self' 또는 닉네임
  warnedAt: Set<number>;  // 이미 경고를 보낸 임계값(초) 집합
}

export interface BuffTimerState {
  buffId: string;
  name: string;
  image: string;          // 버프 아이콘 이미지 경로
  durationMs: number;
  remainingMs: number;
  usedBy: string;
  phase: 'normal' | 'warn1' | 'warn2';
}

class BuffTimerManager {
  private _activeBuffs: Map<string, ActiveBuff> = new Map();
  private _tickInterval: NodeJS.Timeout | null = null;
  private _buffDefs: Map<string, BuffDefinition> = new Map();
  /** config.load() I/O 최소화를 위한 warnSeconds 캐시 */
  private _cachedWarnSeconds: number[] = [60, 10];

  public start(): void {
    this.loadBuffDefs();
    this._refreshWarnSecondsCache();
    if (this._tickInterval) clearInterval(this._tickInterval);
    this._tickInterval = setInterval(() => this._tick(), 1000);
    log('[BUFF_TIMER] 매니저 시작됨');
  }

  /**
   * 설정이 변경될 때 호출하여 warnSeconds 캐시를 갱신
   */
  public refreshConfig(): void {
    this._refreshWarnSecondsCache();
  }

  private _refreshWarnSecondsCache(): void {
    const cfg = config.load();
    this._cachedWarnSeconds = cfg.buffTimerWarnSeconds ?? [60, 10];
  }

  public stop(): void {
    if (this._tickInterval) {
      clearInterval(this._tickInterval);
      this._tickInterval = null;
    }
    this._activeBuffs.clear();
    log('[BUFF_TIMER] 매니저 중지됨');
  }

  /**
   * buffs.json에서 버프 정의 로드
   */
  public loadBuffDefs(): void {
    try {
      const buffsPath = path.join(__dirname, '..', 'assets', 'data', 'buffs.json');
      const raw = fs.readFileSync(buffsPath, 'utf-8');
      const buffs: BuffDefinition[] = JSON.parse(raw);
      this._buffDefs.clear();
      for (const buff of buffs) {
        this._buffDefs.set(buff.id, buff);
      }
      log(`[BUFF_TIMER] 버프 정의 로드 완료: ${this._buffDefs.size}개`);
    } catch (e) {
      log(`[BUFF_TIMER] 버프 정의 로드 실패: ${e}`);
    }
  }

  /**
   * 버프 타이머 활성화 (이미 활성화된 경우 리셋)
   */
  public activateBuff(buffId: string, usedBy: string = 'self', customDurationMs?: number): void {
    const cfg = config.load();

    // 전체 기능 비활성화 체크
    if (cfg.buffTimerEnabled === false) return;

    // 버프별 활성화 여부 체크
    const buffTimerBuffs = cfg.buffTimerBuffs ?? {};
    if (buffTimerBuffs[buffId] === false) return;

    // 테스트 활성화 시: 이미 실제 버프가 활성화 중이면 덮어쓰지 않고 스킵
    if (usedBy === 'test') {
      const existing = this._activeBuffs.get(buffId);
      if (existing && existing.usedBy !== 'test') {
        log(`[BUFF_TIMER] 테스트 스킵: ${buffId}는 실제 버프로 이미 활성화 중 (usedBy: ${existing.usedBy})`);
        return;
      }
    }

    const def = this._buffDefs.get(buffId);
    if (!def || def.durationMs <= 0) {
      log(`[BUFF_TIMER] 알 수 없는 버프 또는 지속시간 없음: ${buffId}`);
      return;
    }

    const durationMs = customDurationMs ?? def.durationMs;

    const activeBuff: ActiveBuff = {
      buffId,
      name: def.name,
      durationMs: durationMs,
      startTime: Date.now(),
      usedBy,
      warnedAt: new Set(),
    };

    this._activeBuffs.set(buffId, activeBuff);
    log(`[BUFF_TIMER] 버프 활성화: ${def.name} (${durationMs / 60000}분), 사용자: ${usedBy}`);

    // 즉시 HUD 갱신
    this._sendHudUpdate();
  }

  /**
   * 1초마다 실행 — 남은시간 계산 및 경고 트리거
   */
  private _tick(): void {
    const warnSeconds = this._cachedWarnSeconds;
    const now = Date.now();
    let changed = false;

    for (const [buffId, buff] of this._activeBuffs) {
      const elapsedMs = now - buff.startTime;
      const remainingMs = buff.durationMs - elapsedMs;

      // 만료 처리
      if (remainingMs <= 0) {
        this._activeBuffs.delete(buffId);
        log(`[BUFF_TIMER] 버프 만료: ${buff.name}`);
        changed = true;
        continue;
      }

      const remainingSec = Math.ceil(remainingMs / 1000);

      // 경고 임계값 체크 (5초 고정 알림 포함, 내림차순 정렬)
      const mergedWarnSecs = Array.from(new Set([...warnSeconds, 5])).sort((a, b) => b - a);
      for (const warnSec of mergedWarnSecs) {
        if (remainingSec <= warnSec && !buff.warnedAt.has(warnSec)) {
          buff.warnedAt.add(warnSec);
          this._triggerWarning(buff, warnSec);
          changed = true;
        }
      }
    }

    if (changed || this._activeBuffs.size > 0) {
      this._sendHudUpdate();
    }
  }

  /**
   * 경고 트리거 — 시각/청각 알림
   */
  private _triggerWarning(buff: ActiveBuff, warnSec: number): void {
    const cfg = config.load();
    const phase = warnSec <= 5 ? 'warn2' : 'warn1';
    const label = warnSec >= 60 ? `${Math.floor(warnSec / 60)}분` : `${warnSec}초`;

    log(`[BUFF_TIMER] 경고! ${buff.name} — ${label} 남음 (${phase})`);

    // game-overlay에 경고 이벤트 전송 (시각적 알림)
    if (cfg.buffTimerVisualAlert !== false) {
      this._sendToGameOverlay('buff-timer-warning', { buffId: buff.buffId, phase, warnSec });
    }

    // 청각적 알림 — 범용 play-sound 채널로 전송
    if (cfg.buffTimerAudioAlert !== false) {
      const soundFile = cfg.buffTimerSound || 'voice_boss_first.wav';
      const volume = cfg.buffTimerVolume ?? 70;
      const label2 = phase === 'warn2' ? `[임박] ${buff.name} 5초 전!` : `[경고] ${buff.name} ${label} 남음`;
      this._sendToMainWindow('play-sound', { label: label2, soundFile, volume, isCustom: true });
    }
  }

  /**
   * 현재 활성 버프 목록을 HUD에 전송
   */
  private _sendHudUpdate(): void {
    const warnSeconds = [...this._cachedWarnSeconds].sort((a, b) => b - a);
    const now = Date.now();

    const states: BuffTimerState[] = [];
    for (const buff of this._activeBuffs.values()) {
      const remainingMs = Math.max(0, buff.durationMs - (now - buff.startTime));
      const remainingSec = Math.ceil(remainingMs / 1000);

      // phase 계산: 5초 이하이면 무조건 warn2, 아니면 설정된 사전 경고 이하일 때 warn1
      let phase: BuffTimerState['phase'] = 'normal';
      if (remainingSec <= 5) {
        phase = 'warn2';
      } else if (warnSeconds.length > 0 && remainingSec <= warnSeconds[0]) {
        phase = 'warn1';
      }

      const def = this._buffDefs.get(buff.buffId);
      states.push({
        buffId: buff.buffId,
        name: buff.name,
        image: def?.image ?? '',
        durationMs: buff.durationMs,
        remainingMs,
        usedBy: buff.usedBy,
        phase,
      });
    }

    // 남은시간 오름차순 정렬 (곧 만료되는 것이 위)
    states.sort((a, b) => a.remainingMs - b.remainingMs);

    this._sendToGameOverlay('buff-timer-update', states);
  }

  /**
   * game-overlay.html 창에 IPC 전송
   */
  private _sendToGameOverlay(channel: string, data: any): void {
    const wins = BrowserWindow.getAllWindows();
    const overlay = wins.find(w => {
      if (w.isDestroyed()) return false;
      try { return w.webContents.getURL().includes('game-overlay.html'); } catch { return false; }
    });
    if (overlay) overlay.webContents.send(channel, data);
  }

  /**
   * mainWindow에 IPC 전송
   */
  private _sendToMainWindow(channel: string, data: any): void {
    const wins = BrowserWindow.getAllWindows();
    const main = wins.find(w => {
      if (w.isDestroyed()) return false;
      try { return w.webContents.getURL().includes('index.html'); } catch { return false; }
    });
    if (main) main.webContents.send(channel, data);
  }

  public getActiveBuffs(): ActiveBuff[] {
    return Array.from(this._activeBuffs.values());
  }

  /**
   * 테스트로 강제 활성화된 버프만 제거 (usedBy === 'test')
   */
  public clearTestBuffs(): void {
    let changed = false;
    for (const [buffId, buff] of this._activeBuffs) {
      if (buff.usedBy === 'test') {
        this._activeBuffs.delete(buffId);
        changed = true;
      }
    }
    if (changed) {
      this._sendHudUpdate();
      log('[BUFF_TIMER] 테스트 버프 제거 완료');
    }
  }
}

export const buffTimerManager = new BuffTimerManager();
