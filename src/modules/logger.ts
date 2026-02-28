/**
 * 로깅 모듈 - 파일 로그 + 콘솔 출력
 * 로그 파일 크기 제한(1MB)과 자동 로테이션 포함
 * 성능: 비동기 I/O 사용 + 크기 체크 횟수 기반 최적화
 */
import * as fs from 'fs';
import { get_LOG_PATH, LOG_MAX_SIZE, IS_DEV } from './constants';

/** 로그 크기 체크 간격 (매번 체크하지 않고 N회마다) */
const SIZE_CHECK_INTERVAL = 100;
let writeCount = 0;

export function log(message: string): void {
  const logMessage = `[${new Date().toISOString()}] ${message}\n`;
  if (IS_DEV) console.log(logMessage);
  try {
    const logPath = get_LOG_PATH();

    // 매 SIZE_CHECK_INTERVAL 회마다만 크기 체크 (동기 I/O 빈도 최소화)
    if (writeCount % SIZE_CHECK_INTERVAL === 0) {
      try {
        const stats = fs.statSync(logPath);
        if (stats.size > LOG_MAX_SIZE) {
          const backupPath = logPath.replace('.log', '.old.log');
          try { fs.unlinkSync(backupPath); } catch { /* 백업 파일 없을 수 있음 */ }
          fs.renameSync(logPath, backupPath);
        }
      } catch { /* 파일이 아직 없는 경우 무시 */ }
    }
    writeCount++;

    // 비동기 쓰기로 메인 프로세스 블로킹 방지
    fs.appendFile(logPath, logMessage, () => { /* fire-and-forget */ });
  } catch { /* 로깅 실패는 조용히 무시 */ }
}
