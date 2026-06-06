import { chatParser } from './chatParser';
import * as diaryDb from './diaryDb';
import * as config from './config';
import { log } from './logger';
import { Notification, BrowserWindow } from 'electron';
import { xpTracker } from './xpTracker';
import { abandonedTracker } from './abandonedTracker';
import * as contentsChecker from './contentsChecker';
import { discordNotifier } from './discordNotifier';
import { etaCacheManager } from './etaCacheManager';

/**
 * 파싱된 채팅 데이터를 실제 앱 기능(DB 저장, 알림 등)으로 연결하는 프로세서
 *
 * XP 추적은 xpTracker, 어벤던로드는 abandonedTracker에 위임합니다.
 * 이 클래스는 SEED/아이템/외치기 핸들러와 외부 API를 관리합니다.
 */
class ChatLogProcessor {
  private _chatContextCache: Array<{ timestamp: number; sender: string; message: string; color: string }> = [];
  private _activeTrackingAlarms: Array<{ alarmId: number; endTime: number }> = [];

  // 채팅 오버레이 탭별 히스토리 저장 버퍼스토어
  private _chatHistoryStore: Record<string, Array<any>> = {
    Basic: [],
    General: [],
    Team: [],
    Club: [],
    Shout: [],
    Whisper: [],
    System: []
  };
  private readonly _maxHistoryCount = 150;

  private addChatToHistory(tab: string, chat: any): void {
    const list = this._chatHistoryStore[tab];
    if (!list) return;
    list.push(chat);
    if (list.length > this._maxHistoryCount) {
      list.shift();
    }
  }

  private broadcastChatUpdate(chatItem: any): void {
    const allWindows = BrowserWindow.getAllWindows();
    for (const win of allWindows) {
      if (!win.isDestroyed() && win.webContents.getURL().includes('chat-overlay.html')) {
        win.webContents.send('chat-updated', chatItem);
      }
    }
  }

  public getChatHistory(category: string): any[] {
    return this._chatHistoryStore[category] || [];
  }

  /**
   * 앱 시작 시 오늘 로그에서 읽어온 기존 채팅을 히스토리에만 추가 (알림/DB 저장 없이)
   */
  public replayChat(
    targetTab: string,
    data: {
      type: 'normal' | 'shout' | 'system';
      timestamp: string;
      sender: string;
      message: string;
      color: string;
      serverCode: number;
    }
  ): void {
    const rankInfo = etaCacheManager.getRankInfo(data.serverCode, data.sender);
    const level = rankInfo ? rankInfo.level : null;
    const characterCode = rankInfo ? rankInfo.characterCode : null;

    let type = 'system';
    if (data.type === 'shout') {
      type = 'shout';
    } else if (data.type === 'normal') {
      type = data.color === '#f7b73c' ? 'team' : 
             (data.color === '#94ddfa' ? 'club' : 
             (data.color === '#64ff64' ? 'whisper' : 'general'));
    }

    const chatItem = {
      id: `replay-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      type,
      timestamp: data.timestamp,
      sender: data.sender || (data.type === 'system' ? '시스템' : ''),
      message: data.message,
      color: data.color || '#a8a8a8',
      level,
      characterCode
    };

    this.addChatToHistory(targetTab, chatItem);
  }

  public start(): void {
    log('[CHAT_PROCESSOR] 시작됨 - 이벤트 리스너 등록');

    // 1. SEED 획득 처리
    chatParser.on('SEED_GAINED', (data) => {
      const timeOnly = data.timestamp.replace(/ /g, '').replace(/[시분]/g, ':').replace('초', '');
      const content = `[자동] ${data.message} (${this.formatNumber(data.amount)})`;
      diaryDb.addActivityLog(data.date, timeOnly, 'calc', content, data.amount);

      const chatItem = {
        id: `chat-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        type: 'system',
        timestamp: data.timestamp,
        sender: '시스템',
        message: data.message,
        color: '#a8a8a8',
        level: null,
        characterCode: null
      };
      this.addChatToHistory('Basic', chatItem);
      this.addChatToHistory('System', chatItem);
      this.broadcastChatUpdate(chatItem);
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
        // 경험의 정수 교환 기록은 xpTracker에서 직접 계산해 처리하므로 중복 방지를 위해 스킵합니다.
        const isEssence = data.message.includes('경험의 정수') || data.message.includes('경험의정수');
        if (!isEssence) {
          diaryDb.addActivityLog(data.date, timeOnly, 'loot', `[득템] ${data.message}`, amount);
        }
        this.sendNotification('아이템 획득 알림', data.message);
      }

      const chatItem = {
        id: `chat-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        type: 'system',
        timestamp: data.timestamp,
        sender: '시스템',
        message: data.message,
        color: '#ffd700',
        level: null,
        characterCode: null
      };
      this.addChatToHistory('Basic', chatItem);
      this.addChatToHistory('System', chatItem);
      this.broadcastChatUpdate(chatItem);
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

      // 에타 랭킹 정보 조회 및 탭 히스토리 누적
      const serverCode = cfg.userServer || 16;
      const rankInfo = etaCacheManager.getRankInfo(serverCode, data.sender);
      const level = rankInfo ? rankInfo.level : null;
      const characterCode = rankInfo ? rankInfo.characterCode : null;

      const chatItem = {
        id: `chat-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        type: 'shout',
        timestamp: data.timestamp,
        sender: data.sender,
        message: data.message,
        color: '#c896c8',
        level,
        characterCode
      };
      this.addChatToHistory('Basic', chatItem);
      this.addChatToHistory('Shout', chatItem);
      this.broadcastChatUpdate(chatItem);

      // 디스코드 전용 알림 처리 (외치기 전용)
      if (cfg.discordAlertEnabled && cfg.discordWebhookUrl) {
        const rules = cfg.discordRules || [];
        for (const rule of rules) {
          if (!data.message.includes(rule.keyword)) continue;

          // 1. 발송 대상(외치기) 필터링
          if (!rule.targetShout) continue;

          // 2. 발신인(보낸 사람) 닉네임 필터링
          if (rule.targetSender && rule.targetSender.trim() !== '') {
            if (data.sender !== rule.targetSender.trim()) continue;
          }

          // 모든 필터를 통과하면 디스코드에 알림 발송
          void discordNotifier.sendWord(data.sender, data.message, rule.keyword);
          break; // 단어 하나가 매칭되어 발송되었다면 한 메시지에 대해 중복 발송 차단
        }
      }
    });

    // 3-2. 일반 채팅 알림 처리
    chatParser.on('NORMAL_CHAT', (data) => {
      const now = Date.now();

      // 1. 만료된(5분이 경과한) 실시간 감지 추적 목록 필터링
      this._activeTrackingAlarms = this._activeTrackingAlarms.filter(a => now <= a.endTime);

      // 2. 대화 캐시 적재 및 5분 만료 처리
      this._chatContextCache.push({
        timestamp: now,
        sender: data.sender,
        message: data.message,
        color: data.color
      });
      // 5분(300초) 이상 지난 데이터 삭제
      this._chatContextCache = this._chatContextCache.filter(c => now - c.timestamp <= 5 * 60 * 1000);

      const cfg = config.load();

      // 에타 랭킹 정보 조회 및 탭 히스토리 누적
      const serverCode = cfg.userServer || 16;
      const rankInfo = etaCacheManager.getRankInfo(serverCode, data.sender);
      const level = rankInfo ? rankInfo.level : null;
      const characterCode = rankInfo ? rankInfo.characterCode : null;

      // #ffffff = 타인 일반, #c8ffc8 = 본인 일반, #94ddfa = 클럽, #f7b73c = 팀, #64ff64 = 귓속말
      let type = 'general';
      if (data.sender === '시스템' || data.color === '#a8a8a8') {
        type = 'system';
      } else if (data.color === '#f7b73c') {
        type = 'team';
      } else if (data.color === '#94ddfa') {
        type = 'club';
      } else if (data.color === '#64ff64') {
        type = 'whisper';
      }

      const chatItem = {
        id: `chat-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        type,
        timestamp: data.timestamp,
        sender: data.sender,
        message: data.message,
        color: data.color,
        level,
        characterCode
      };

      this.addChatToHistory('Basic', chatItem);
      if (type === 'general') this.addChatToHistory('General', chatItem);
      else if (type === 'team') this.addChatToHistory('Team', chatItem);
      else if (type === 'club') this.addChatToHistory('Club', chatItem);
      else if (type === 'whisper') this.addChatToHistory('Whisper', chatItem);
      else if (type === 'system') this.addChatToHistory('System', chatItem);

      this.broadcastChatUpdate(chatItem);

      // 3. 현재 추적 활성 상태인 알림들에 대해 감지 이후의 후속 대화 기입
      for (const active of this._activeTrackingAlarms) {
        diaryDb.addWordAlarmContextLine(active.alarmId, now, data.sender, data.message, data.color);
      }

      // 디스코드 전용 알림 처리 (독립 동작)
      if (cfg.discordAlertEnabled && cfg.discordWebhookUrl) {
        // 기존 discordKeywords 필드만 있고 discordRules가 없는 구버전 설정을 위한 마이그레이션
        let rules = cfg.discordRules || [];
        if (rules.length === 0 && cfg.discordKeywords && cfg.discordKeywords.length > 0) {
          rules = cfg.discordKeywords.map(kw => ({
            keyword: kw,
            targetNormal: true,
            targetClub: true,
            targetShout: true
          }));
        }

        for (const rule of rules) {
          if (!data.message.includes(rule.keyword)) continue;

          // 1. 발송 대상(대화 유형별) 필터링
          let isTarget = false;
          if (type === 'general' && rule.targetNormal) isTarget = true;
          if (type === 'club' && rule.targetClub) isTarget = true;
          if (!isTarget) continue;

          // 2. 발신인(보낸 사람) 닉네임 필터링
          if (rule.targetSender && rule.targetSender.trim() !== '') {
            if (data.sender !== rule.targetSender.trim()) continue;
          }

          // 모든 필터를 통과하면 디스코드에 알림 발송
          void discordNotifier.sendWord(data.sender, data.message, rule.keyword);
          break; // 단어 하나가 매칭되어 발송되었다면 한 메시지에 대해 중복 발송 차단
        }
      }

      // 4. 지정 단어 알림 처리
      if (!cfg.wordAlarmEnabled) return;
      if (type === 'system') return;
      if (data.sender === '클럽 공지') return;

      const keywords = cfg.wordAlarmKeywords || [];
      const matchedKeyword = keywords.find(k => data.message.includes(k));
      
      if (keywords.length > 0 && matchedKeyword) {
        // DB에 히스토리 및 현재 대화 캐시 큐 목록 저장 (대화 기록이 켜져있을 때만 캐시 제공)
        const historyContext = cfg.wordAlarmHistoryEnabled !== false ? [...this._chatContextCache] : [];
        const alarmId = diaryDb.addWordAlarmHistory(matchedKeyword, data.sender, data.message, historyContext);
        
        // 새로 생성된 알림에 대해 향후 5분 동안 발생하는 대화를 추적하도록 등록 (대화 기록이 켜져있을 때만)
        if (alarmId !== -1 && cfg.wordAlarmHistoryEnabled !== false) {
          this._activeTrackingAlarms.push({
            alarmId,
            endTime: now + 5 * 60 * 1000 // 5분 동안 후속 수집
          });
        }

        // OS 토스트 알림 발송
        this.sendNotification(`일반 채팅 알림: [${data.sender}]`, data.message);

        // 지정 사운드 재생
        if (cfg.wordAlarmSound) {
          const allWindows = BrowserWindow.getAllWindows();
          const sidebar = allWindows.find(w => !w.isDestroyed() && w.webContents.getURL().includes('index.html'));
          if (sidebar) {
            sidebar.webContents.send('play-sound', {
              label: '지정 단어 알림',
              soundFile: cfg.wordAlarmSound,
              volume: cfg.wordAlarmVolume !== undefined ? cfg.wordAlarmVolume : 70
            });
          }
        }
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

    // 4-2. 심연의 제2사도 기믹 알림 처리
    chatParser.on('ABYSS_APOSTLE_PATTERN', (data) => {
      const cfg = config.load();
      if (!cfg.abyssApostleAlertEnabled) return;

      const allWindows = BrowserWindow.getAllWindows();
      const gameOverlay = allWindows.find(w => !w.isDestroyed() && w.webContents.getURL().includes('game-overlay.html'));
      if (gameOverlay) {
        gameOverlay.webContents.send('abyss-apostle-alert', data);
      }
    });

    // 4-3. 몬스터 웨이브 종료 대기 알림 처리
    chatParser.on('WAVE_MONSTER_WARNING', (data) => {
      const cfg = config.load();
      if (!cfg.waveMonsterWarningEnabled) return;

      const allWindows = BrowserWindow.getAllWindows();
      const gameOverlay = allWindows.find(w => !w.isDestroyed() && w.webContents.getURL().includes('game-overlay.html'));
      if (gameOverlay) {
        gameOverlay.webContents.send('wave-warning-alert', data);
      }

      if (cfg.waveMonsterWarningSound) {
        const sidebar = allWindows.find(w => !w.isDestroyed() && w.webContents.getURL().includes('index.html'));
        if (sidebar) {
          sidebar.webContents.send('play-sound', {
            label: '몬스터 웨이브 종료 대기 알림',
            soundFile: cfg.waveMonsterWarningSound,
            volume: cfg.waveMonsterWarningVolume !== undefined ? cfg.waveMonsterWarningVolume : 70
          });
        }
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
        '로카고스': 'weekly-eclipse-boss-lokagos'
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
        contentsChecker.queuePendingHomework(id, data.count, data.isIncrement !== false);
      }
    });
 
    // 8. 고대 렐릭의 성소 클리어 처리
    chatParser.on('RELIC_SANCTUARY_CLEAR', (data) => {
      contentsChecker.queuePendingHomework('weekly-ancient-relic', data.count, false);
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
      const depthMap: Record<string, string> = {
        '심층Ⅰ': 'weekly-abyss-dungeon-1',
        '심층Ⅱ': 'weekly-abyss-dungeon-2',
        '심층Ⅲ': 'weekly-abyss-dungeon-3'
      };
      const id = depthMap[data.depth];
      if (id) {
        contentsChecker.queuePendingHomework(id, data.count, false);
      }
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
 

 
    // 23. 베스티지 클리어 처리
    chatParser.on('VESTIGE_CLEAR', (data) => {
      contentsChecker.queuePendingHomework('weekly-vestige', 1, true);
    });
 
    // 24. 아페티리아 (일반/어려움) 클리어 처리
    chatParser.on('APETHIRIA_RAID_CLEAR', (data) => {
      contentsChecker.queuePendingHomework('weekly-apethiria-raid', data.count, false);
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