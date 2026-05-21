import { chatParser } from './chatParser';
import * as diaryDb from './diaryDb';
import * as config from './config';
import { log } from './logger';
import { Notification, BrowserWindow } from 'electron';
import { xpTracker } from './xpTracker';
import { abandonedTracker } from './abandonedTracker';

/**
 * 파싱된 채팅 데이터를 실제 앱 기능(DB 저장, 알림 등)으로 연결하는 프로세서
 *
 * XP 추적은 xpTracker, 어벤던로드는 abandonedTracker에 위임합니다.
 * 이 클래스는 SEED/아이템/외치기 핸들러와 외부 API를 관리합니다.
 */
class ChatLogProcessor {
  public start(): void {
    log('[CHAT_PROCESSOR] 시작됨 - 이벤트 리스너 등록');

    // 1. SEED 획득 처리
    chatParser.on('SEED_GAINED', (data) => {
      const timeOnly = data.timestamp.replace(/ /g, '').replace(/[시분]/g, ':').replace('초', '');
      const content = `[자동] ${data.message} (${this.formatNumber(data.amount)})`;
      diaryDb.addActivityLog(data.date, timeOnly, 'calc', content, data.amount);
    });

    // 2. 아이템 획득 처리
    chatParser.on('ITEM_LOOTED', (data) => {
      const cfg = config.load();
      const keywords = cfg.lootKeywords || [];
      const matchedKeyword = keywords.find(k => data.message.includes(k));
      if (matchedKeyword) {
        const timeOnly = data.timestamp.replace(/ /g, '').replace(/[시분]/g, ':').replace('초', '');
        const amountMatch = data.message.match(/(\d+)개/);
        const amount = amountMatch ? parseInt(amountMatch[1], 10) : 1;
        diaryDb.addActivityLog(data.date, timeOnly, 'loot', `[득템] ${data.message}`, amount);
        this.sendNotification('아이템 획득 알림', data.message);
      }
    });

    // 3. 외치기 처리
    chatParser.on('TRADE_SHOUT', (data) => {
      diaryDb.addShoutLog(data.sender, data.message);
      const allWindows = BrowserWindow.getAllWindows();
      const historyWin = allWindows.find(w => !w.isDestroyed() && w.webContents.getURL().includes('shout-history.html'));
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

    // 4. 에토스 기믹 알림 처리
    chatParser.on('ETHOS_PASSWORD', (data) => {
      const cfg = config.load();
      if (!cfg.ethosAlertEnabled) return;

      const allWindows = BrowserWindow.getAllWindows();
      const gameOverlay = allWindows.find(w => !w.isDestroyed() && w.webContents.getURL().includes('game-overlay.html'));
      if (gameOverlay) {
        gameOverlay.webContents.send('ethos-alert', data);
      }
    });

    // XP 추적 (xpTracker에 위임)
    xpTracker.start();

    // 어벤던로드 추적 (abandonedTracker에 위임)
    abandonedTracker.start();
  }

  // ── 외부 API (기존 호출자 호환성 유지) ──

  public resetXp(): void {
    xpTracker.resetXp();
    abandonedTracker.reset();
    log('[CHAT_PROCESSOR] XP 및 어벤던로드 세션 초기화됨');

    const allWindows = BrowserWindow.getAllWindows();
    const gameOverlay = allWindows.find(w => !w.isDestroyed() && w.webContents.getURL().includes('game-overlay.html'));
    if (gameOverlay) {
      gameOverlay.webContents.send('abandoned-update', abandonedTracker.getState());
    }
  }

  public getStats() {
    return xpTracker.getStats();
  }

  public getAbandonedState() {
    return abandonedTracker.getState();
  }

  public forceAbandonedVisible(visible: boolean): void {
    abandonedTracker.forceVisible(visible);
  }

  private formatNumber(num: number): string {
    if (num === 0) return '0';
    const units = [
      { label: '조', value: 1000000000000 },
      { label: '억', value: 100000000 },
      { label: '만', value: 10000 },
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
    if (result === '') result = remainder.toLocaleString();
    return result.trim();
  }

  private sendNotification(title: string, body: string): void {
    if (Notification.isSupported()) {
      new Notification({ title, body, silent: false }).show();
    }
  }
}

export const chatLogProcessor = new ChatLogProcessor();