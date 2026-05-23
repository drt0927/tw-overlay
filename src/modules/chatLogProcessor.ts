import { chatParser } from './chatParser';
import * as diaryDb from './diaryDb';
import * as config from './config';
import { log } from './logger';
import { Notification, BrowserWindow } from 'electron';
import { xpTracker } from './xpTracker';
import { abandonedTracker } from './abandonedTracker';
import * as contentsChecker from './contentsChecker';

/**
 * 파싱된 채팅 데이터를 실제 앱 기능(DB 저장, 알림 등)으로 연결하는 프로세서
 *
 * XP 추적은 xpTracker, 어벤던로드는 abandonedTracker에 위임합니다.
 * 이 클래스는 SEED/아이템/외치기 핸들러와 외부 API를 관리합니다.
 */
class ChatLogProcessor {
  private lastRelicType: 'shinjo' | 'kishinik' | null = null;
  private lastRelicTypeTime: number = 0;

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
      // 고대 렐릭의 성소 구분용 전리품 감지 캐싱
      if (data.message.includes('신조의 가루') || data.message.includes('신조의 정수') || data.message.includes('신조의 깃털')) {
        this.lastRelicType = 'shinjo';
        this.lastRelicTypeTime = Date.now();
      } else if (data.message.includes('키시니크의 가루') || data.message.includes('키시니크의 정수') || data.message.includes('키시니크의 파편')) {
        this.lastRelicType = 'kishinik';
        this.lastRelicTypeTime = Date.now();
      }

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

    // 5. 이클립스 보스 클리어 처리
    chatParser.on('ECLIPSE_BOSS_CLEAR', (data) => {
      const bossMapping: Record<string, string> = {
        '에토스': 'weekly-eclipse-boss-ethos',
        '마티아': 'weekly-eclipse-boss-matias',
        '티로로스': 'weekly-eclipse-boss-tyrorost',
        '라이코스': 'weekly-eclipse-boss-lycos',
        '체리아': 'weekly-eclipse-boss-cheria',
        '셀피나': 'weekly-eclipse-boss-selfina'
      };
      const id = bossMapping[data.bossName];
      if (id) {
        contentsChecker.queuePendingHomework(id, data.count, false);
      }
    });
 
    // 6. 머큐리얼 보스 클리어 처리
    chatParser.on('MERCURIAL_BOSS_CLEAR', (data) => {
      const bossMapping: Record<string, string> = {
        '실반': 'weekly-mur-sylvan',
        '샐리온': 'weekly-mur-salion',
        '실라이론': 'weekly-mur-silyron',
        '샐레아나': 'weekly-mur-saleana',
        '루미너스': 'weekly-mur-luminous',
        '루미너스 (EX)': 'weekly-mur-luminous-ex',
        '루미너스(EX)': 'weekly-mur-luminous-ex'
      };
      const id = bossMapping[data.bossName];
      if (id) {
        contentsChecker.queuePendingHomework(id, data.count, false);
      }
    });
 
    // 7. 코어 마스터 클리어 처리
    chatParser.on('CORE_MASTER_CLEAR', (data) => {
      const coreMapping: Record<string, string> = {
        '심층Ⅰ': 'weekly-abyss-core-master-1',
        '심층Ⅱ': 'weekly-abyss-core-master-2',
        '심층ⅠⅠ': 'weekly-abyss-core-master-2', // 복수 표기 대응 가능성 등
        '심층Ⅲ': 'weekly-abyss-core-master-3',
        '실반': 'weekly-mur-core-master-sylvan',
        '샐리온': 'weekly-mur-core-master-salion',
        '실라이론': 'weekly-mur-core-master-silyron',
        '샐레아나': 'weekly-mur-core-master-saleana',
        '루미너스': 'weekly-mur-core-master-luminous'
      };
      const id = coreMapping[data.contentName];
      if (id) {
        contentsChecker.queuePendingHomework(id, data.count, false);
      }
    });
 
    // 8. 고대 렐릭의 성소 클리어 처리
    chatParser.on('RELIC_SANCTUARY_CLEAR', (data) => {
      const now = Date.now();
      let targetId = 'weekly-ancient-relic-shinjo';
      if (this.lastRelicType && (now - this.lastRelicTypeTime < 5000)) {
        if (this.lastRelicType === 'kishinik') {
          targetId = 'weekly-ancient-relic-kishinik';
        }
      }
      contentsChecker.queuePendingHomework(targetId, data.count, false);
    });
 
    // 9. 테시스 코어 던전 클리어 처리
    chatParser.on('TESIS_CORE_CLEAR', (data) => {
      contentsChecker.queuePendingHomework('weekly-tesis-core', 1, true);
    });
 
    // 10. 힘의 근원 클리어 처리
    chatParser.on('POWER_ROOT_CLEAR', (data) => {
      contentsChecker.queuePendingHomework('weekly-power-root', data.count, false);
    });
 
    // 11. 심연의 보물창고 입장 처리
    chatParser.on('ABYSS_TREASURE_ENTRY', (data) => {
      contentsChecker.queuePendingHomework('weekly-abyss-treasure', data.count, false);
    });
 
    // 12. 보급품 탈환 클리어 처리
    chatParser.on('ECLIPSE_SUPPLIES_CLEAR', (data) => {
      contentsChecker.queuePendingHomework('weekly-eclipse-recapture-supplies', data.count, false);
    });
 
    // 13. 별동대 토벌 클리어 처리
    chatParser.on('ECLIPSE_SPECIAL_FORCE_CLEAR', (data) => {
      contentsChecker.queuePendingHomework('weekly-eclipse-special-force-suppression', data.count, false);
    });
 
    // 14. 지하요새의 망령 클리어 처리
    chatParser.on('FORTRESS_GHOST_CLEAR', (data) => {
      contentsChecker.queuePendingHomework('weekly-fortress-ghost', data.count, false);
    });
 
    // 15. 발굴지 입장 처리
    chatParser.on('DIGSITE_ENTRY', (data) => {
      if (typeof data.count === 'number') {
        contentsChecker.queuePendingHomework('weekly-digsite', data.count, false);
      } else {
        contentsChecker.queuePendingHomework('weekly-digsite', 1, true);
      }
    });
 
    // 16. 신조의 둥지 클리어 처리
    chatParser.on('CONTENT_SHINJO_NEST_CLEAR', (data) => {
      contentsChecker.queuePendingHomework('weekly-shinjo-nest', 1, true);
    });
 
    // 17. 어비스 보스 (심층 1~3) 클리어 처리
    chatParser.on('ABYSS_DUNGEON_CLEAR', (data) => {
      contentsChecker.queuePendingHomework('weekly-abyss-dungeon', data.count, false);
    });
 
    // 18. 어비스 보스전 (EX) 클리어 처리
    chatParser.on('ABYSS_BOSS_EX_CLEAR', (data) => {
      contentsChecker.queuePendingHomework('weekly-abyss-boss-ex', data.count, false);
    });
 
    // 19. 프라바 방어전 (1인) 클리어 처리
    chatParser.on('PRAVA_DEFENSE_CLEAR', (data) => {
      contentsChecker.queuePendingHomework('weekly-prava-defense', 1, true);
    });
 
    // 20. 망각의 카타콤 (지옥) 클리어 처리
    chatParser.on('CATACOMB_CLEAR', (data) => {
      contentsChecker.queuePendingHomework('weekly-catacomb-hell', 1, true);
    });
 
    // 21. 시오칸하임 보스 토벌전 클리어 처리
    chatParser.on('SIOKAN_BOSS_CLEAR', (data) => {
      contentsChecker.queuePendingHomework('weekly-siokan-boss', data.count, false);
    });
 
    // 22. 오를리 방어전 클리어 처리
    chatParser.on('ORLY_DEFENSE_CLEAR', (data) => {
      contentsChecker.queuePendingHomework('weekly-orly-defense', 1, true);
    });
 
    // 23. 베스티지 클리어 처리
    chatParser.on('VESTIGE_CLEAR', (data) => {
      contentsChecker.queuePendingHomework('weekly-vestige', 1, true);
    });
 
    // 24. 아페티리아 (일반/어려움) 클리어 처리
    chatParser.on('APETHIRIA_RAID_CLEAR', (data) => {
      contentsChecker.queuePendingHomework('weekly-apethiria-raid', 1, true);
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