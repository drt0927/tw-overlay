/**
 * 앱 전역 상수 정의
 */
const { app } = require('electron');
const path = require('path');

module.exports = {
  GAME_PROCESS_NAME: 'InphaseNXD',
  IS_DEV: process.argv.includes('--dev'),
  MIN_W: 400,
  MIN_H: 300,
  LOG_MAX_SIZE: 1 * 1024 * 1024, // 1MB
  SAVE_DEBOUNCE_MS: 300,
  POLLING_FAST_MS: 50,     // 창 이동 감지 시 빠른 폴링 (실시간 추적)
  POLLING_SLOW_MS: 500,    // 변화 없을 때 느린 폴링 (CPU 절약)
  POLLING_COOLDOWN: 5,     // 변화 없음 N회 연속 시 slow로 전환
  PS_QUERY_TIMEOUT_MS: 3000,
  PS_RESTART_DELAY_MS: 1000,
  FOCUS_DELAY_MS: 50,

  // 경로 (app.getPath는 app ready 이후 사용 가능하므로 getter 사용)
  get CONFIG_PATH() { return path.join(app.getPath('userData'), 'config.json'); },
  get LOG_PATH() { return path.join(app.getPath('userData'), 'debug.log'); },

  DEFAULT_CONFIG: {
    width: 800,
    height: 600,
    opacity: 1.0,
    url: 'https://www.youtube.com',
    homeUrl: 'https://www.youtube.com',
    favorites: [
      { label: 'Youtube', url: 'https://www.youtube.com' },
      { label: 'Google', url: 'https://www.google.com' },
      { label: 'Netflix', url: 'https://www.netflix.com' }
    ],
    quickSlots: [
      { label: 'Y', icon: 'youtube', url: 'https://www.youtube.com', external: false },
      { label: 'G', icon: 'search', url: 'https://www.google.com', external: false },
      { label: 'M', icon: 'map', url: 'https://cafe.daum.net/MagicWeaver', external: true },
      { label: 'D', icon: 'message-square', url: 'https://discord.com', external: true }
    ]
  }
};
