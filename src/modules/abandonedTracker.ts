import { chatParser } from './chatParser';
import * as config from './config';
import { log } from './logger';
import { Notification, BrowserWindow } from 'electron';
import type { AbandonedRoadState } from '../shared/types';

/**
 * 어벤던로드 추적 모듈 — 지역별 통계, 마정석 수익, 자동 숨기기 타이머
 */
class AbandonedTracker {
  private _abandonedState: AbandonedRoadState = {
    regions: {},
    profit: 0,
    isActive: false,
    stoneGains: {},
    stoneLosses: {},
    totalFee: 0,
    currentRegion: '',
    regionDetails: {},
  };

  private _abandonedHideTimer: NodeJS.Timeout | null = null;
  private _pendingAbandonedFee = 0;

  // 마정석 가치 (금화 주머니 50만 Seed 기준)
  private readonly MAGIC_STONE_VALUES: Record<string, number> = {
    '하급': 500000,
    '중급': 5000000,
    '상급': 50000000,
    '최상급': 500000000,
  };

  public start(): void {
    // 입장료 임시 저장
    chatParser.on('ABANDONED_FEE', (data) => {
      this._pendingAbandonedFee = data.amount;
    });

    // 도전 횟수 감지
    chatParser.on('ABANDONED_ENTRY', (data) => {
      const fee = this._pendingAbandonedFee;
      this._pendingAbandonedFee = 0;
      if (fee > 0) {
        this._abandonedState.profit -= fee;
        this._abandonedState.totalFee += fee;
        log(`[ABANDONED] 입장료(실측): ${data.count}회 -${fee}, 총입장료: ${this._abandonedState.totalFee}, 현재 수익: ${this._abandonedState.profit}`);
      }
      this._abandonedState.regions[data.region] = data.count;
      this._abandonedState.currentRegion = data.region;

      const rd = this._abandonedState.regionDetails;
      if (!rd[data.region]) rd[data.region] = { count: 0, totalFee: 0, stoneGains: {}, stoneLosses: {} };
      rd[data.region].count = data.count;
      rd[data.region].totalFee += fee;

      if (data.count === 10) {
        this.sendNotification('어벤던로드 알림', `${data.region} 지역 10회 도달! 최고 효율 구간입니다.`);
        BrowserWindow.getAllWindows().forEach(win => {
          if (!win.isDestroyed()) win.webContents.send('abandoned-alert', { region: data.region, count: data.count });
        });
      }
      this._abandonedState.isActive = true;
      this.refreshAbandonedActivity();
    });

    // 마정석 획득
    chatParser.on('MAGIC_STONE_GAIN', (data) => {
      const gradeKey = data.grade.trim();
      const unitValue = this.MAGIC_STONE_VALUES[gradeKey] || 0;
      this._abandonedState.profit += (unitValue * data.count);
      this._abandonedState.stoneGains[gradeKey] = (this._abandonedState.stoneGains[gradeKey] ?? 0) + data.count;
      const region = this._abandonedState.currentRegion;
      if (region && this._abandonedState.regionDetails[region]) {
        const rds = this._abandonedState.regionDetails[region].stoneGains;
        rds[gradeKey] = (rds[gradeKey] ?? 0) + data.count;
      }
      this.notifyAbandonedUpdate();
      log(`[ABANDONED] 마정석 획득: ${gradeKey} x${data.count}, 수익 추가: +${unitValue * data.count}, 현재 수익: ${this._abandonedState.profit}`);
    });

    // 마정석 소실
    chatParser.on('MAGIC_STONE_LOSS', (data) => {
      const gradeKey = data.grade.trim();
      const unitValue = this.MAGIC_STONE_VALUES[gradeKey] || 0;
      this._abandonedState.profit -= (unitValue * data.count);
      this._abandonedState.stoneLosses[gradeKey] = (this._abandonedState.stoneLosses[gradeKey] ?? 0) + data.count;
      const region = this._abandonedState.currentRegion;
      if (region && this._abandonedState.regionDetails[region]) {
        const rdl = this._abandonedState.regionDetails[region].stoneLosses;
        rdl[gradeKey] = (rdl[gradeKey] ?? 0) + data.count;
      }
      this.notifyAbandonedUpdate();
      log(`[ABANDONED] 마정석 소실: ${gradeKey} x${data.count}, 수익 차감: -${unitValue * data.count}, 현재 수익: ${this._abandonedState.profit}`);
    });
  }

  private refreshAbandonedActivity(): void {
    if (this._abandonedHideTimer) clearTimeout(this._abandonedHideTimer);

    if (this._abandonedState.isActive) {
      const minutes = config.load().abandonedAutoHideMinutes ?? 10;
      this._abandonedHideTimer = setTimeout(() => {
        this._abandonedState.isActive = false;
        this.notifyAbandonedUpdate();
      }, minutes * 60 * 1000);
    }
    this.notifyAbandonedUpdate();
  }

  private notifyAbandonedUpdate(): void {
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send('abandoned-update', this._abandonedState);
      }
    });
  }

  public getState(): AbandonedRoadState {
    return this._abandonedState;
  }

  public forceVisible(visible: boolean): void {
    this._abandonedState.isActive = visible;
    if (!visible && this._abandonedHideTimer) {
      clearTimeout(this._abandonedHideTimer);
      this._abandonedHideTimer = null;
    }
    this.notifyAbandonedUpdate();
  }

  public reset(): void {
    this._abandonedState = {
      regions: {}, profit: 0, isActive: false,
      stoneGains: {}, stoneLosses: {}, totalFee: 0,
      currentRegion: '', regionDetails: {},
    };
    if (this._abandonedHideTimer) clearTimeout(this._abandonedHideTimer);
    this.notifyAbandonedUpdate();
  }

  private sendNotification(title: string, body: string): void {
    if (Notification.isSupported()) {
      new Notification({ title, body, silent: false }).show();
    }
  }
}

export const abandonedTracker = new AbandonedTracker();
