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
  private _startTime: number = Date.now();

  public start(): void {
    log('[CHAT_PROCESSOR] 시작됨 - 이벤트 리스너 등록');

    // 1. SEED 획득 처리
    chatParser.on('SEED_GAINED', (data: { date: string, timestamp: string, amount: number, message: string }) => {
      const timeOnly = data.timestamp.replace(/ /g, '').replace(/[시분]/g, ':').replace('초', '');
      const content = `[자동] ${data.message} (${this.formatNumber(data.amount)})`;
      diaryDb.addActivityLog(data.date, timeOnly, 'calc', content);
    });

    // 2. 아이템 획득 처리
    chatParser.on('ITEM_LOOTED', (data: { date: string, timestamp: string, message: string }) => {
      const cfg = config.load();
      const keywords = cfg.lootKeywords || [];
      const matchedKeyword = keywords.find(k => data.message.includes(k));
      if (matchedKeyword) {
        const timeOnly = data.timestamp.replace(/ /g, '').replace(/[시분]/g, ':').replace('초', '');
        diaryDb.addActivityLog(data.date, timeOnly, 'loot', `[득템] ${data.message}`);
        this.sendNotification('아이템 획득 알림', data.message);
      }
    });

    // 3. 외치기 처리
    chatParser.on('TRADE_SHOUT', (data: { timestamp: string, sender: string, message: string }) => {
      // 모든 외치기를 DB 히스토리에 저장
      diaryDb.addShoutLog(data.sender, data.message);

      // 외치기 히스토리 창이 열려있다면 즉시 갱신 신호 전송
      const allWindows = BrowserWindow.getAllWindows();
      const historyWin = allWindows.find(w => w.webContents.getURL().includes('shout-history.html'));
      if (historyWin) {
        historyWin.webContents.send('shout-history-updated');
      }

      const cfg = config.load();
      const keywords = cfg.shoutKeywords || [];
      const matchedKeyword = keywords.find(k => data.message.includes(k));
      if (matchedKeyword) {
        this.sendNotification(`외치기 알림: [${data.sender}]`, data.message);
      }
    });

    // 5. 경험치 변동
    chatParser.on('XP_CHANGED', (data: { timestamp: string, amount: number, message: string }) => {
      this._sessionXP += data.amount;

      const allWindows = BrowserWindow.getAllWindows();
      const elapsedMins = (Date.now() - this._startTime) / 60000;
      const epm = elapsedMins > 0 ? Math.floor(this._sessionXP / elapsedMins) : 0;
      const xpPayload = { total: this._sessionXP, epm, lastGain: data.amount };

      const gameOverlay = allWindows.find(w => !w.isDestroyed() && w.webContents.getURL().includes('game-overlay.html'));
      if (gameOverlay) gameOverlay.webContents.send('xp-update', xpPayload);

      // xp-hud 창에도 실시간 전송
      const xpHud = allWindows.find(w => !w.isDestroyed() && w.webContents.getURL().includes('xp-hud.html'));
      if (xpHud) xpHud.webContents.send('xp-update', xpPayload);
    });

    // 6. 버프 사용 감지 → 타이머 활성화
    chatParser.on('BUFF_USED', (data: { date: string, timestamp: string, buffId: string, usedBy: string, message: string }) => {
      log(`[CHAT_PROCESSOR] 버프 감지: ${data.buffId} (사용자: ${data.usedBy})`);
      buffTimerManager.activateBuff(data.buffId, data.usedBy);
    });
  }

  /**
   * 세션 XP 초기화 — xp-hud의 초기화 버튼에서 호출
   */
  public resetXp(): void {
    this._sessionXP = 0;
    this._startTime = Date.now();
    log('[CHAT_PROCESSOR] XP 세션 초기화됨');

    const allWindows = BrowserWindow.getAllWindows();
    // game-overlay에 0으로 초기화된 값 전송
    const gameOverlay = allWindows.find(w => !w.isDestroyed() && w.webContents.getURL().includes('game-overlay.html'));
    if (gameOverlay) {
      gameOverlay.webContents.send('xp-update', { total: 0, epm: 0, lastGain: 0 });
    }
    // xp-hud 창에 초기화 완료 이벤트 전송
    const xpHud = allWindows.find(w => !w.isDestroyed() && w.webContents.getURL().includes('xp-hud.html'));
    if (xpHud) {
      xpHud.webContents.send('xp-reset-done', { startTime: this._startTime });
    }
  }

  private formatNumber(num: number): string {
    if (num >= 100000000) {
      const eok = Math.floor(num / 100000000);
      const remainder = num % 100000000;
      if (remainder >= 10000) return `${eok}억 ${Math.floor(remainder / 10000)}만`;
      return `${eok}억`;
    }
    if (num >= 10000) return `${Math.floor(num / 10000)}만`;
    return num.toLocaleString();
  }

  private sendNotification(title: string, body: string, urgency: 'normal' | 'critical' = 'normal'): void {
    if (Notification.isSupported()) {
      const notif = new Notification({
        title,
        body,
        silent: false, // 윈도우 기본 알림음 사용
      });
      notif.show();
    }
  }
}

export const chatLogProcessor = new ChatLogProcessor();
