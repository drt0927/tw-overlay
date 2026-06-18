import { chatParser } from './chatParser';
import * as config from './config';
import { log } from './logger';
import { Notification, BrowserWindow } from 'electron';
import { buffTimerManager } from './buffTimerManager';
import * as diaryDb from './diaryDb';

export const QUEST_DEFINITIONS = {
  forge: { name: '대장간', target: 1500, icon: 'hammer' },
  golgotha: { name: '골고다', target: 1000, icon: 'shield' },
  void: { name: '공허', target: 800, icon: 'orbit' }
};

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

  // 도전과제 추적 상태
  private _questActive = false;
  private _questType: 'forge' | 'golgotha' | 'void' | null = null;
  private _questStartKills = 0;
  private _questStartTime = 0;
  private _questTimer: NodeJS.Timeout | null = null;

  public start(): void {
    // 히스토리 갱신 타이머 (10초마다 분 롤오버 체크)
    if (this._historyTimer) clearInterval(this._historyTimer);
    this._historyTimer = setInterval(() => this.checkMinuteRollover(), 10000);

    // 도전과제 매크로 감지
    chatParser.on('NORMAL_CHAT', (data) => {
      if (data.message.includes('[twOverlay] 대장간 도전과제 시작')) {
        this.startQuest('forge');
      } else if (data.message.includes('[twOverlay] 골고다 도전과제 시작')) {
        this.startQuest('golgotha');
      } else if (data.message.includes('[twOverlay] 공허 도전과제 시작')) {
        this.startQuest('void');
      }
    });

    // 경험치 변동
    chatParser.on('XP_CHANGED', (data) => {
      // 정수 교환 감지
      if (data.amount <= -9_000_000_000) {
        this._xpSinceLastExchange = 0;
        this._sessionEssenceCount++;

        // 모험일지에 경험의 정수 교환 기록 추가
        try {
          const timeOnly = data.timestamp.replace(/ /g, '').replace(/[시분]/g, ':').replace('초', '');
          const count = Math.round(Math.abs(data.amount) / 10_000_000_000);
          const content = count > 1 ? `[득템] 경험의 정수 ${count}개` : `[득템] 경험의 정수`;
          diaryDb.addActivityLog(data.date, timeOnly, 'loot', content, count);
          log(`[XP_TRACKER] 경험의 정수 교환 일지 기록 완료: ${count}개`);
        } catch (e) {
          log(`[XP_TRACKER] 경험의 정수 일지 기록 중 에러 발생: ${e}`);
        }
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

        // 도전과제 킬 카운트 갱신 및 완료 검사
        if (this._questActive && this._questType) {
          const currentKills = this._sessionKills - this._questStartKills;
          const target = QUEST_DEFINITIONS[this._questType].target;
          if (currentKills >= target) {
            this.finishQuest();
          } else {
            const allWindows = BrowserWindow.getAllWindows();
            const gameOverlay = allWindows.find(w => !w.isDestroyed() && w.webContents.getURL().includes('game-overlay.html'));
            if (gameOverlay) {
              gameOverlay.webContents.send('quest-update', { currentKills });
            }
          }
        }

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
        '로토의 부적', '속성 앰플', '앰플', '이자벨의 비법', '일루미네이션 축제 음료',
        '최상급 에오스의 파편', '전설의 군고구마', '얼리버드 경험치 부스터'
      ];
      const isAllowed = allowedKeywords.some(k => data.message.includes(k)) ||
        [
          'exp_heart', 'rare_heart', 'stat_exorcist',
          'rare_loto', 'util_ampoule', 'dmg_izabel', 'util_illumination',
          'exp_eos_supreme', 'exp_sweetpotato_legend', 'exp_earlybird'
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
      startTime: this._startTime,
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

  private startQuest(type: 'forge' | 'golgotha' | 'void'): void {
    if (this._questTimer) clearTimeout(this._questTimer);
    
    this._questActive = true;
    this._questType = type;
    this._questStartKills = this._sessionKills;
    this._questStartTime = Date.now();
    
    const questName = QUEST_DEFINITIONS[type].name;
    const targetKills = QUEST_DEFINITIONS[type].target;
    log(`[XP_TRACKER] ${questName} 도전과제 추적 시작: 현재 킬수 ${this._questStartKills}, 목표 ${targetKills}`);
    
    // 20분 제한 시간 타이머 등록 (20분 = 1200000 ms)
    this._questTimer = setTimeout(() => {
      log(`[XP_TRACKER] ${questName} 도전과제 시간 초과 (20분 경과) - 취소 처리`);
      this.cancelQuest();
    }, 1200000);

    const allWindows = BrowserWindow.getAllWindows();
    const gameOverlay = allWindows.find(w => !w.isDestroyed() && w.webContents.getURL().includes('game-overlay.html'));
    if (gameOverlay) {
      gameOverlay.webContents.send('quest-started', {
        questType: type,
        startTime: this._questStartTime,
        duration: 1200000,
        startKills: this._questStartKills,
        targetKills: targetKills
      });
    }
  }

  private cancelQuest(): void {
    if (this._questTimer) {
      clearTimeout(this._questTimer);
      this._questTimer = null;
    }
    const questName = this._questType ? QUEST_DEFINITIONS[this._questType].name : '도전과제';
    this._questActive = false;
    this._questType = null;
    log(`[XP_TRACKER] ${questName} 도전과제 추적 취소됨`);
    
    const allWindows = BrowserWindow.getAllWindows();
    const gameOverlay = allWindows.find(w => !w.isDestroyed() && w.webContents.getURL().includes('game-overlay.html'));
    if (gameOverlay) {
      gameOverlay.webContents.send('quest-cancelled');
    }
  }

  private finishQuest(): void {
    if (this._questTimer) {
      clearTimeout(this._questTimer);
      this._questTimer = null;
    }
    const type = this._questType;
    const questName = type ? QUEST_DEFINITIONS[type].name : '도전과제';
    const targetKills = type ? QUEST_DEFINITIONS[type].target : 1500;
    this._questActive = false;
    this._questType = null;
    log(`[XP_TRACKER] ${questName} 도전과제 추적 완료! (${targetKills}마리 처치 달성)`);

    const allWindows = BrowserWindow.getAllWindows();
    const gameOverlay = allWindows.find(w => !w.isDestroyed() && w.webContents.getURL().includes('game-overlay.html'));
    if (gameOverlay) {
      gameOverlay.webContents.send('quest-complete', { questType: type });
    }

    // 완료 알림 사운드 재생
    const cfg = config.load();
    const soundFile = cfg.essenceAlertSound || 'orb.mp3';
    const volume = cfg.essenceAlertVolume ?? 70;
    const sidebar = allWindows.find(w => !w.isDestroyed() && w.webContents.getURL().includes('index.html'));
    if (sidebar) {
      sidebar.webContents.send('play-sound', { label: `${questName} 도전과제 완료`, soundFile, volume });
    }
  }

  public resetXp(): void {
    if (this._questActive) {
      this.cancelQuest();
    }
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
      gameOverlay.webContents.send('xp-update', { total: 0, epm: 0, movingEpm: 0, lastGain: 0, history: [], kills: 0, startTime: this._startTime });
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
