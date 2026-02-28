/**
 * 필드보스 알림 모듈
 */
import * as config from './config';
import * as wm from './windowManager';
import { log } from './logger';

interface BossTime {
  time: string; // HH:mm
  name: string;
}

export const BOSS_SCHEDULE: BossTime[] = [
  { time: '00:00', name: '골론' },
  { time: '00:30', name: '파멸의 기원' },
  { time: '01:00', name: '스페르첸드' },
  { time: '04:00', name: '스페르첸드' },
  { time: '05:00', name: '골모답' },
  { time: '06:00', name: '골론' },
  { time: '08:00', name: '스페르첸드' },
  { time: '11:00', name: '파멸의 기원' },
  { time: '12:00', name: '골론' },
  { time: '13:00', name: '골모답' },
  { time: '14:30', name: '아칸' },
  { time: '16:00', name: '스페르첸드' },
  { time: '18:00', name: '골론' },
  { time: '19:00', name: '스페르첸드' },
  { time: '20:00', name: '파멸의 기원' },
  { time: '21:00', name: '골모답' },
  { time: '21:30', name: '아칸' },
  { time: '23:00', name: '스페르첸드' },
];

/** 보스별 출현 시간 문자열 반환 */
export function getBossTimes(bossName: string): string[] {
  return BOSS_SCHEDULE.filter(b => b.name === bossName).map(b => b.time);
}

let _timer: NodeJS.Timeout | null = null;
let _lastNotifiedTime: string | null = null;

/** 알림 루프 시작 */
export function start(): void {
  if (_timer) return;
  log('[BOSS] 보스 알림 감시 시작 (정밀 동기화 모드)');
  scheduleNextTick();
}

/** 다음 정각(00초)에 맞춰 실행 스케줄링 */
function scheduleNextTick(): void {
  const now = new Date();
  // 다음 00초까지 남은 시간 계산 (100ms 여유를 두어 이전 분에 걸리는 현상 방지)
  const msUntilNextMinute = 60000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 100;

  _timer = setTimeout(() => {
    checkBossTime();
    scheduleNextTick(); // 재귀적으로 다음 정각 예약
  }, msUntilNextMinute);
}

/** 알림 루프 중지 */
export function stop(): void {
  if (_timer) {
    clearTimeout(_timer);
    _timer = null;
  }
}

function checkBossTime(): void {
  const cfg = config.load();
  if (!cfg.fieldBossNotifyEnabled) return;

  const now = new Date();
  const currentTimeKey = `${now.getHours()}:${now.getMinutes()}`;
  if (_lastNotifiedTime === currentTimeKey) return;

  const offsets = cfg.fieldBossNotifyOffsets || [0];

  offsets.forEach(offset => {
    // 현재 시간에 오프셋을 더해 '곧 출현할 보스'를 찾음
    const targetTime = new Date(now.getTime() + offset * 60000);
    const HHmm = `${String(targetTime.getHours()).padStart(2, '0')}:${String(targetTime.getMinutes()).padStart(2, '0')}`;

    const boss = BOSS_SCHEDULE.find(b => b.time === HHmm);
    if (boss) {
      const bossSetting = cfg.fieldBossSettings?.[boss.name];
      if (bossSetting && bossSetting.enabled) {
        const message = offset === 0 ? boss.name : `${boss.name} ${offset}분 전`;
        log(`[BOSS] 알림 조건 충족: ${message} (사운드: ${bossSetting.soundFile})`);
        notify(message, bossSetting.soundFile);
        _lastNotifiedTime = currentTimeKey;
      }
    }
  });
}

function notify(bossName: string, soundFile: string): void {
  log(`[BOSS] 필드보스 출현 알림: ${bossName}`);
  const sidebar = wm.getMainWindow();
  if (sidebar) {
    sidebar.webContents.send('play-boss-sound', { bossName, soundFile });
  }
}
