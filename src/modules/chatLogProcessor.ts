import { chatParser } from './chatParser';
import * as diaryDb from './diaryDb';
import * as config from './config';
import { log } from './logger';
import { Notification, BrowserWindow } from 'electron';
import { buffTimerManager } from './buffTimerManager';

/**
 * 파싱된 채팅 데이터를 실제 앱 기능(DB 저장, 알림 등)으로 연결하는 프로세서
 */
class ChatLogProcessor {
  private _sessionXP: number = 0;
  private _sessionKills: number = 0;
  private _startTime: number = Date.now();
  private _minuteHistory: number[] = []; // 최근 30분간의 분당 획득량
  private _lastMinuteTimestamp: number = Math.floor(Date.now() / 60000);
  private _currentMinuteXP: number = 0;
  private _historyTimer: NodeJS.Timeout | null = null;

  // 경험의 정수 자동 교환 버프 미감지 알람
  private static readonly ESSENCE_XP = 10_000_000_000; // 100억
  private static readonly ESSENCE_BUFFER = 1_000_000_000; // 10억 — 교환 로그 지연 오차 허용
  private static readonly DEBUG_XP_MULTIPLIER = 1; // 테스트용, 1로 되돌리면 비활성화
  private _xpSinceLastExchange: number = 0; // 마지막 교환 이후 누적 XP
  private _sessionEssenceCount: number = 0;

  public start(): void {
    log('[CHAT_PROCESSOR] 시작됨 - 이벤트 리스너 등록');

    // 히스토리 갱신 타이머 (10초마다 체크하여 분이 바뀌었는지 확인)
    if (this._historyTimer) clearInterval(this._historyTimer);
    this._historyTimer = setInterval(() => this.checkMinuteRollover(), 10000);

    // 1. SEED 획득 처리 (기존 로직 유지)
    chatParser.on('SEED_GAINED', (data: { date: string, timestamp: string, amount: number, message: string }) => {
      const timeOnly = data.timestamp.replace(/ /g, '').replace(/[시분]/g, ':').replace('초', '');
      const content = `[자동] ${data.message} (${this.formatNumber(data.amount)})`;
      diaryDb.addActivityLog(data.date, timeOnly, 'calc', content, data.amount);
    });

    // 2. 아이템 획득 처리 (기존 로직 유지)
    chatParser.on('ITEM_LOOTED', (data: { date: string, timestamp: string, message: string }) => {
      const cfg = config.load();
      const keywords = cfg.lootKeywords || [];
      const matchedKeyword = keywords.find(k => data.message.includes(k));
      if (matchedKeyword) {
        const timeOnly = data.timestamp.replace(/ /g, '').replace(/[시분]/g, ':').replace('초', '');

        // 아이템 개수 추출 시도 (예: "포션 5개 획득")
        const amountMatch = data.message.match(/(\d+)개/);
        const amount = amountMatch ? parseInt(amountMatch[1], 10) : 1;

        diaryDb.addActivityLog(data.date, timeOnly, 'loot', `[득템] ${data.message}`, amount);
        this.sendNotification('아이템 획득 알림', data.message);
      }
    });

    // 3. 외치기 처리 (기존 로직 유지)
    chatParser.on('TRADE_SHOUT', (data: { timestamp: string, sender: string, message: string }) => {
      diaryDb.addShoutLog(data.sender, data.message);
      const allWindows = BrowserWindow.getAllWindows();
      const historyWin = allWindows.find(w => w.webContents.getURL().includes('shout-history.html'));
      if (historyWin) {
        historyWin.webContents.send('shout-history-updated');
      }
      const cfg = config.load();
      const keywords = cfg.shoutKeywords || [];
      const matchedKeyword = keywords.find(k => data.message.includes(k));
      if (keywords.length > 0 && matchedKeyword) {
        this.sendNotification(`외치기 알림: [${data.sender}]`, data.message);
      }
    });

    // 5. 경험치 변동
    chatParser.on('XP_CHANGED', (data: { timestamp: string, amount: number, message: string }) => {
      // 정수 교환 감지 (ignoreNegativeXp 필터 전에 처리)
      if (data.amount <= -9_000_000_000) {
        // 교환 발생: 게임 경험치 0으로 리셋됨 → 기준점 재정렬
        this._xpSinceLastExchange = 0;
        this._sessionEssenceCount++;
      }

      const cfg = config.load();
      if (cfg.ignoreNegativeXp && data.amount < 0) {
        return;
      }

      const amount = data.amount > 0
        ? data.amount * ChatLogProcessor.DEBUG_XP_MULTIPLIER
        : data.amount;

      this.checkMinuteRollover();
      this._sessionXP += amount;
      this._currentMinuteXP += amount;
      if (amount > 0) {
        this._sessionKills++;
        this._xpSinceLastExchange += amount;

        // 마지막 교환 이후 100억+10억 쌓였는데 교환 안 왔으면 버프 미감지
        if (this._xpSinceLastExchange >= ChatLogProcessor.ESSENCE_XP + ChatLogProcessor.ESSENCE_BUFFER) {
          this._fireEssenceAlert();
          this._xpSinceLastExchange -= ChatLogProcessor.ESSENCE_XP; // 100억만 차감, 잉여분 이월
        }
      }

      const allWindows = BrowserWindow.getAllWindows();
      const elapsedMins = (Date.now() - this._startTime) / 60000;
      const epm = Math.floor(this._sessionXP / Math.max(1, elapsedMins));

      // 최근 5분 이동 평균 계산 (더 민감한 지표용)
      const recentMins = Math.min(5, this._minuteHistory.length);
      let movingEpm = epm;
      if (recentMins > 0) {
        const recentSum = this._minuteHistory.slice(-recentMins).reduce((a, b) => a + b, 0) + this._currentMinuteXP;
        movingEpm = Math.floor(recentSum / (recentMins + (Date.now() % 60000 / 60000)));
      }

      const xpPayload = {
        total: this._sessionXP,
        epm,
        movingEpm,
        lastGain: amount,
        history: [...this._minuteHistory, this._currentMinuteXP],
        kills: this._sessionKills,
        essenceCount: this._sessionEssenceCount,
        xpSinceLastExchange: this._xpSinceLastExchange
      };

      const gameOverlay = allWindows.find(w => !w.isDestroyed() && w.webContents.getURL().includes('game-overlay.html'));
      if (gameOverlay) gameOverlay.webContents.send('xp-update', xpPayload);

      const xpHud = allWindows.find(w => !w.isDestroyed() && w.webContents.getURL().includes('xp-hud.html'));
      if (xpHud) xpHud.webContents.send('xp-update', xpPayload);
    });

    // 6. 버프 사용 감지
    chatParser.on('BUFF_USED', (data: { date: string, timestamp: string, buffId: string, usedBy: string, message: string }) => {
      // 허용된 버프 명칭 리스트 (심장 2종 + 퇴마사)
      const allowedKeywords = ['경험의 심장', '레어의 심장', '퇴마사의 은총'];

      // 메시지 내용에 키워드가 포함되어 있거나, 알려진 ID인 경우에만 활성화
      const isAllowed = allowedKeywords.some(k => data.message.includes(k)) ||
        ['exp_heart', 'rare_heart', 'stat_exorcist'].includes(data.buffId);

      if (isAllowed) {
        const startTime = this.parseLogTimestamp(data.date, data.timestamp);
        buffTimerManager.activateBuff(data.buffId, data.usedBy, undefined, startTime);
      }
    });
  }

  /**
   * 로그 날짜와 시간 문자열을 기반으로 타임스탬프(ms) 계산
   */
  private parseLogTimestamp(dateStr: string, timestampStr: string): number {
    try {
      // dateStr: "2026-04-26", timestampStr: "12시 34분 56초"
      const [y, m, d] = dateStr.split('-').map(Number);
      const timeOnly = timestampStr.replace(/ /g, '').replace(/[시분]/g, ':').replace('초', '');
      const [hh, mm, ss] = timeOnly.split(':').map(Number);

      const date = new Date(y, m - 1, d, hh, mm, ss);
      return date.getTime();
    } catch (e) {
      log(`[CHAT_PROCESSOR] 시간 파싱 실패: ${e}`);
      return Date.now();
    }
  }

  private _fireEssenceAlert(): void {
    const cfg = config.load();
    if (cfg.essenceAlertEnabled === false) return;

    log('[CHAT_PROCESSOR] 경험의 정수 교환 미감지 — 버프 알람 발생');
    const allWindows = BrowserWindow.getAllWindows();

    const gameOverlay = allWindows.find(w => !w.isDestroyed() && w.webContents.getURL().includes('game-overlay.html'));
    if (gameOverlay) gameOverlay.webContents.send('essence-alert');

    const soundFile = cfg.essenceAlertSound || 'orb.mp3';
    const volume = cfg.essenceAlertVolume ?? 70;
    const sidebar = allWindows.find(w => !w.isDestroyed() && w.webContents.getURL().includes('index.html'));
    if (sidebar) sidebar.webContents.send('play-sound', { label: '경험의 정수 버프 확인', soundFile, volume });
  }

  private checkMinuteRollover(): void {
    const nowMinute = Math.floor(Date.now() / 60000);
    if (nowMinute > this._lastMinuteTimestamp) {
      // 1분 이상 차이 나면 그 사이 빈 분들은 0으로 채움
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

    log('[CHAT_PROCESSOR] XP 세션 초기화됨');

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
    this.checkMinuteRollover(); // 호출 시점에도 롤오버 체크
    const elapsedMins = (Date.now() - this._startTime) / 60000;
    const epm = Math.floor(this._sessionXP / Math.max(1, elapsedMins));

    const recentMins = Math.min(5, this._minuteHistory.length);
    let movingEpm = epm;
    if (recentMins > 0) {
      const recentSum = this._minuteHistory.slice(-recentMins).reduce((a, b) => a + b, 0) + this._currentMinuteXP;
      movingEpm = Math.floor(recentSum / (recentMins + (Date.now() % 60000 / 60000)));
    }

    return {
      total: this._sessionXP,
      epm,
      movingEpm,
      startTime: this._startTime,
      history: [...this._minuteHistory, this._currentMinuteXP],
      kills: this._sessionKills,
      essenceCount: this._sessionEssenceCount,
      xpSinceLastExchange: this._xpSinceLastExchange
    };
  }

  private formatNumber(num: number): string {
    if (num === 0) return '0';
    const units = [
      { label: '조', value: 1000000000000 },
      { label: '억', value: 100000000 },
      { label: '만', value: 10000 }
    ];
    let result = '';
    let remainder = num;

    for (const unit of units) {
      if (remainder >= unit.value) {
        const value = Math.floor(remainder / unit.value);
        result += `${value}${unit.label} `;
        remainder %= unit.value;
      }
    }

    // 만 단위 이상 기록이 있으면 나머지는 버림, 없으면(1만 미만) 숫자 표시
    if (result === '') {
      result = remainder.toLocaleString();
    }

    return result.trim();
  }

  private sendNotification(title: string, body: string): void {
    if (Notification.isSupported()) {
      const notif = new Notification({ title, body, silent: false });
      notif.show();
    }
  }
}

export const chatLogProcessor = new ChatLogProcessor();