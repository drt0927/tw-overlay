import { Tail } from 'tail';
import * as fs from 'fs';
import * as path from 'path';
import * as iconv from 'iconv-lite';
import { log } from './logger';
import { chatParser } from './chatParser';
import * as config from './config';

class ChatLogManager {
  private _tail: Tail | null = null;
  private _currentFilePath: string | null = null;
  private _watchTimer: NodeJS.Timeout | null = null;

  /**
   * 스트리밍 시작
   */
  public start(): void {
    this.stop();
    this.initWatch();
    
    // 1분마다 날짜 변경(자정) 및 파일 존재 여부 체크
    this._watchTimer = setInterval(() => this.checkFileChange(), 60000);
    log('[CHAT_LOG] 매니저 시작됨');
  }

  /**
   * 스트리밍 중지
   */
  public stop(): void {
    if (this._tail) {
      this._tail.unwatch();
      this._tail = null;
    }
    if (this._watchTimer) {
      clearInterval(this._watchTimer);
      this._watchTimer = null;
    }
    this._currentFilePath = null;
    log('[CHAT_LOG] 매니저 중지됨');
  }

  /**
   * 오늘 날짜에 해당하는 로그 파일 경로 생성
   */
  private getTodayFilePath(): string | null {
    const cfg = config.load();
    if (!cfg.chatLogPath || !fs.existsSync(cfg.chatLogPath)) return null;

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    
    const fileName = `TWChatLog_${yyyy}_${mm}_${dd}.html`;
    return path.join(cfg.chatLogPath, fileName);
  }

  /**
   * 파일 감시 초기화
   */
  private initWatch(): void {
    const filePath = this.getTodayFilePath();
    if (!filePath) {
      log('[CHAT_LOG] 로그 폴더가 설정되지 않았거나 유효하지 않습니다.');
      return;
    }

    if (!fs.existsSync(filePath)) {
      log(`[CHAT_LOG] 오늘의 로그 파일이 아직 생성되지 않음: ${filePath}`);
      this._currentFilePath = filePath; // 경로는 저장해둠
      return;
    }

    // [추가] 새 파일을 읽기 시작할 때, 상단 헤더를 읽어 날짜 정보를 파서에 전달
    try {
      const initialContent = fs.readFileSync(filePath, 'binary');
      const decodedContent = iconv.decode(Buffer.from(initialContent, 'binary'), 'euc-kr');
      const lines = decodedContent.split('\n');
      // 상단 20줄 이내에서 날짜 정보 검색
      for (let i = 0; i < Math.min(lines.length, 20); i++) {
        if (lines[i].includes('Date :')) {
          chatParser.parseLine(lines[i]);
          break;
        }
      }
    } catch (e) {
      log(`[CHAT_LOG] 초기 날짜 읽기 실패: ${e}`);
    }

    try {
      this._tail = new Tail(filePath, {
        fromBeginning: false,
        follow: true,
        useWatchFile: true, // 네트워크 드라이브나 특정 윈도우 환경 대응
        fsWatchOptions: { interval: 1000 },
        encoding: 'binary' // 원본 바이너리 보존을 위해 binary로 읽음
      });

      this._tail.on('line', (data: string) => {
        // 바이너리 문자열을 Buffer로 변환 후 EUC-KR 디코딩
        const buffer = Buffer.from(data, 'binary');
        const decodedLine = iconv.decode(buffer, 'euc-kr');
        
        // 회복 로그 등 너무 빈번한 로그는 여기서 1차 커트 (성능 최적화)
        if (decodedLine.includes('회복되었습니다')) return;

        chatParser.parseLine(decodedLine);
      });

      this._tail.on('error', (error) => {
        log(`[CHAT_LOG] Tail 오류: ${error}`);
      });

      this._currentFilePath = filePath;
      log(`[CHAT_LOG] 파일 감시 시작: ${filePath}`);

    } catch (err) {
      log(`[CHAT_LOG] 감시 시작 실패: ${err}`);
    }
  }

  /**
   * 날짜 변경 또는 파일 생성 감지
   */
  private checkFileChange(): void {
    const todayPath = this.getTodayFilePath();
    
    // 파일 경로가 바뀌었거나(자정), 이전에 파일이 없었는데 새로 생겼을 경우
    if (todayPath !== this._currentFilePath || (todayPath && !this._tail && fs.existsSync(todayPath))) {
      log('[CHAT_LOG] 로그 파일 변경 감지, 재연결 시도');
      this.start();
    }
  }
}

export const chatLogManager = new ChatLogManager();
