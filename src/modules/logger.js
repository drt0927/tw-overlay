/**
 * 로깅 모듈 - 파일 로그 + 콘솔 출력
 * 로그 파일 크기 제한(1MB)과 자동 로테이션 포함
 */
const fs = require('fs');
const { LOG_PATH, LOG_MAX_SIZE, IS_DEV } = require('./constants');

function log(message) {
  const logMessage = `[${new Date().toISOString()}] ${message}\n`;
  if (IS_DEV) console.log(message);
  try {
    const logPath = LOG_PATH;
    if (fs.existsSync(logPath)) {
      const stats = fs.statSync(logPath);
      if (stats.size > LOG_MAX_SIZE) {
        const backupPath = logPath.replace('.log', '.old.log');
        try { fs.unlinkSync(backupPath); } catch (_) {}
        fs.renameSync(logPath, backupPath);
      }
    }
    fs.appendFileSync(logPath, logMessage);
  } catch (_) {}
}

module.exports = { log };
