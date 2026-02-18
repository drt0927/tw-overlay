/**
 * 로깅 모듈 - 파일 로그 + 콘솔 출력
 * 로그 파일 크기 제한(1MB)과 자동 로테이션 포함
 */
import * as fs from 'fs';
import { get_LOG_PATH, LOG_MAX_SIZE, IS_DEV } from './constants';

export function log(message: string): void {
  const logMessage = `[${new Date().toISOString()}] ${message}
`;
  if (IS_DEV) console.log(message);
  try {
    const logPath = get_LOG_PATH();
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
