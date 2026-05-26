import { chatParser } from './chatParser';
import * as config from './config';
import { log } from './logger';
import { Notification, BrowserWindow } from 'electron';
import { buffTimerManager } from './buffTimerManager';

/**
 * XP 추적 모듈 — 경험치 세션 통계, 분당 히스토리, 경험의 정수 알림, 팔색조 언덕 추적
 */
class XpTracker {
  private _sessionXP = 0;
  private _sessionKills = 0;
  private _startTime = Date.now();
  private _minuteHistory: number[] = [];
  private _lastMinuteTimestamp = Math.floor(Date.now() / 60000);
  private _currentMinuteXP = 0;
  private _historyTimer: NodeJS.Timeout | null = null;

  // 경험의 정수 자동 교환 버프 미감지 알람
  private static readonly ESSENCE_XP = 10_000_000_000;
  private static readonly ESSENCE_BUFFER = 1_000_000_000;
  private static readonly DEBUG_XP_MULTIPLIER = 1;
  private _xpSinceLastExchange = 0;
  private _sessionEssenceCount = 0;

  // 팔색조 언덕 상태
  private _pittaSsCount = 0;
  private _pittaLastDate = '';

  public start(): void {
    // 히스토리 갱신 타이머 (10초마다 분 롤오버 체크)
    if (this._historyTimer) clearInterval(this._historyTimer);
    this._historyTimer = setInterval(() => this.checkMinuteRollover(), 10000);

    // 경험치 변동
    chatParser.on('XP_CHANGED', (data) => {
      // 정수 교환 감지
      if (data.amount <= -9_000_000_000) {
        this._xpSinceLastExchange = 0;
        this._sessionEssenceCount++;
      }

      const cfg = config.load();
      if (cfg.ignoreNegativeXp && data.amount < 0) return;

      const amount = data.amount > 0
        ? data.amount * XpTracker.DEBUG_XP_MULTIPLIER
        : data.amount;

      this.checkMinuteRollover();
      this._sessionXP += amount;
      this._currentMinuteXP += amount;
      if (amount > 0) {
        this._sessionKills++;
        this._xpSinceLastExchange += amount;

        if (this._xpSinceLastExchange >= XpTracker.ESSENCE_XP + XpTracker.ESSENCE_BUFFER) {
          this._fireEssenceAlert();
          this._xpSinceLastExchange -= XpTracker.ESSENCE_XP;
        }
      }

      const payload = this.buildXpPayload(amount);
      const allWindows = BrowserWindow.getAllWindows();
      const gameOverlay = allWindows.find(w => !w.isDestroyed() && w.webContents.getURL().includes('game-overlay.html'));
      if (gameOverlay) gameOverlay.webContents.send('xp-update', payload);
      const xpHud = allWindows.find(w => !w.isDestroyed() && w.webContents.getURL().includes('xp-hud.html'));
      if (xpHud) xpHud.webContents.send('xp-update', payload);
    });

    // 버프 사용 감지
    chatParser.on('BUFF_USED', (data) => {
      const allowedKeywords = [
        '경험의 심장', '레어의 심장', '퇴마사의 은총',
        '로토의 부적', '속성 앰플', '앰플', '이자벨의 비법', '일루미네이션 축제 음료'
      ];
      const isAllowed = allowedKeywords.some(k => data.message.includes(k)) ||
        [
          'exp_heart', 'rare_heart', 'stat_exorcist',
          'rare_loto', 'util_ampoule', 'dmg_izabel', 'util_illumination'
        ].includes(data.buffId);
      if (isAllowed) {
        const startTime = this.parseLogTimestamp(data.date, data.timestamp);
        buffTimerManager.activateBuff(data.buffId, data.usedBy, undefined, startTime);
      }
    });

    // 팔색조 언덕 진입
    chatParser.on('PITTA_ENTRY', (data) => {
      if (this._pittaLastDate !== data.date) {
        this._pittaLastDate = data.date;
        this._pittaSsCount = 0;
      }
      if (data.grade === 'SS') {
        const currentDoneCount = 20 - data.energy;
        if (currentDoneCount >= 0 && currentDoneCount < 5) {
          if (this._pittaSsCount < currentDoneCount) {
            log(`[XP_TRACKER] 팔색조 언덕 횟수 동기화: ${this._pittaSsCount} -> ${currentDoneCount} (에너지: ${data.energy})`);
            this._pittaSsCount = currentDoneCount;
          }
        }
      }
    });

    // 팔색조 언덕 클리어
    chatParser.on('PITTA_CLEAR', (data) => {
      if (this._pittaLastDate !== data.date) {
        this._pittaLastDate = data.date;
        this._pittaSsCount = 0;
      }
      if (data.grade === 'SS') {
        this._pittaSsCount++;
        log(`[XP_TRACKER] 팔색조 언덕 SS 클리어 감지: 현재 ${this._pittaSsCount}회`);
        if (this._pittaSsCount === 5) {
          log('[XP_TRACKER] 팔색조 언덕 SS 5회 완료 - 오버레이 알림 전송');
          const allWindows = BrowserWindow.getAllWindows();
          const gameOverlay = allWindows.find(w => !w.isDestroyed() && w.webContents.getURL().includes('game-overlay.html'));
          if (gameOverlay) gameOverlay.webContents.send('pitta-alert');
        }
      }
    });
  }

  private buildXpPayload(lastGain: number) {
    const elapsedMins = (Date.now() - this._startTime) / 60000;
    const epm = Math.floor(this._sessionXP / Math.max(1, elapsedMins));
    const recentMins = Math.min(5, this._minuteHistory.length);
    let movingEpm = epm;
    if (recentMins > 0) {
      const recentSum = this._minuteHistory.slice(-recentMins).reduce((a, b) => a + b, 0) + this._currentMinuteXP;
      const denominator = recentMins + (Date.now() % 60000 / 60000);
      movingEpm = Math.floor(recentSum / Math.max(0.001, denominator));
    }
    return {
      total: this._sessionXP, epm, movingEpm, lastGain,
      history: [...this._minuteHistory, this._currentMinuteXP],
      kills: this._sessionKills,
      essenceCount: this._sessionEssenceCount,
      xpSinceLastExchange: this._xpSinceLastExchange,
    };
  }

  public checkMinuteRollover(): void {
    const nowMinute = Math.floor(Date.now() / 60000);
    if (nowMinute > this._lastMinuteTimestamp) {
      const diff = nowMinute - this._lastMinuteTimestamp;
      for (let i = 0; i < diff; i++) {
        this._minuteHistory.push(i === 0 ? this._currentMinuteXP : 0);
        if (this._minuteHistory.length > 30) this._minuteHistory.shift();
      }
      this._currentMinuteXP = 0;
      this._lastMinuteTimestamp = nowMinute;
    }
  }

  public resetXp(): void {
    this._sessionXP = 0;
    this._sessionKills = 0;
    this._startTime = Date.now();
    this._minuteHistory = [];
    this._currentMinuteXP = 0;
    this._lastMinuteTimestamp = Math.floor(Date.now() / 60000);
    this._xpSinceLastExchange = 0;
    this._sessionEssenceCount = 0;
    this._pittaSsCount = 0;

    log('[XP_TRACKER] XP 세션 초기화됨');

    const allWindows = BrowserWindow.getAllWindows();
    const gameOverlay = allWindows.find(w => !w.isDestroyed() && w.webContents.getURL().includes('game-overlay.html'));
    if (gameOverlay) {
      gameOverlay.webContents.send('xp-update', { total: 0, epm: 0, movingEpm: 0, lastGain: 0, history: [], kills: 0 });
    }
    const xpHud = allWindows.find(w => !w.isDestroyed() && w.webContents.getURL().includes('xp-hud.html'));
    if (xpHud) {
      xpHud.webContents.send('xp-reset-done', { startTime: this._startTime });
    }
  }

  public getStats() {
    this.checkMinuteRollover();
    const elapsedMins = (Date.now() - this._startTime) / 60000;
    const epm = Math.floor(this._sessionXP / Math.max(1, elapsedMins));
    const recentMins = Math.min(5, this._minuteHistory.length);
    let movingEpm = epm;
    if (recentMins > 0) {
      const recentSum = this._minuteHistory.slice(-recentMins).reduce((a, b) => a + b, 0) + this._currentMinuteXP;
      const denominator = recentMins + (Date.now() % 60000 / 60000);
      movingEpm = Math.floor(recentSum / Math.max(0.001, denominator));
    }
    return {
      total: this._sessionXP, epm, movingEpm, startTime: this._startTime,
      history: [...this._minuteHistory, this._currentMinuteXP],
      kills: this._sessionKills,
      essenceCount: this._sessionEssenceCount,
      xpSinceLastExchange: this._xpSinceLastExchange,
    };
  }

  private parseLogTimestamp(dateStr: string, timestampStr: string): number {
    try {
      const [y, m, d] = dateStr.split('-').map(Number);
      const timeOnly = timestampStr.replace(/ /g, '').replace(/[시분]/g, ':').replace('초', '');
      const [hh, mm, ss] = timeOnly.split(':').map(Number);
      return new Date(y, m - 1, d, hh, mm, ss).getTime();
    } catch (e) {
      log(`[XP_TRACKER] 시간 파싱 실패: ${e}`);
      return Date.now();
    }
  }

  private _fireEssenceAlert(): void {
    const cfg = config.load();
    if (cfg.essenceAlertEnabled === false) return;

    log('[XP_TRACKER] 경험의 정수 교환 미감지 — 버프 알람 발생');
    const allWindows = BrowserWindow.getAllWindows();

    const gameOverlay = allWindows.find(w => !w.isDestroyed() && w.webContents.getURL().includes('game-overlay.html'));
    if (gameOverlay) gameOverlay.webContents.send('essence-alert');

    const soundFile = cfg.essenceAlertSound || 'orb.mp3';
    const volume = cfg.essenceAlertVolume ?? 70;
    const sidebar = allWindows.find(w => !w.isDestroyed() && w.webContents.getURL().includes('index.html'));
    if (sidebar) sidebar.webContents.send('play-sound', { label: '경험의 정수 버프 확인', soundFile, volume });
  }
}

export const xpTracker = new XpTracker();
