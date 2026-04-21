import { EventEmitter } from 'events';
import { log } from './logger';

/**
 * 테일즈위버 채팅 로그 파싱 결과 타입 정의
 */
export interface ParsedChatData {
  type: 'SEED' | 'ITEM' | 'XP' | 'TRADE' | 'ALERT' | 'PROGRESS';
  originalTime: string; // [HH시 mm분 ss초]
  message: string;      // HTML 제거된 순수 메시지
  data?: any;           // 가공된 숫자나 객체 데이터
}

/**
 * 채팅 로그 파서 엔진
 */
class ChatParser extends EventEmitter {
  private _currentDate: string = ''; // YYYY-MM-DD 형식

  constructor() {
    super();
    // 초기값은 오늘 날짜로 설정 (로그 헤더 감지 전 대비)
    this._currentDate = new Date().toISOString().split('T')[0];
  }

  /**
   * HTML 태그를 제거하고 텍스트만 추출
   */
  public stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').trim();
  }

  /**
   * 한국어 숫자 단위(억, 만)를 포함한 문자열을 숫자로 변환
   * 예: "8억 5000만" -> 850000000
   */
  public parseKoreanNumber(text: string): number {
    if (!text) return 0;
    
    // 대괄호, 콤마 및 공백 제거
    const cleanText = text.replace(/[\[\]]/g, '').replace(/,/g, '').replace(/\s+/g, '');
    
    // 순수 숫자인 경우
    if (/^\d+$/.test(cleanText)) {
      return parseInt(cleanText, 10);
    }

    let total = 0;
    const unitRegex = /(\d+)(억|만)?/g;
    let match;
    let foundAny = false;

    while ((match = unitRegex.exec(cleanText)) !== null) {
      foundAny = true;
      const num = parseInt(match[1], 10);
      const unit = match[2];

      if (unit === '억') total += num * 100000000;
      else if (unit === '만') total += num * 10000;
      else total += num;
    }

    return foundAny ? total : 0;
  }

  /**
   * 로그 한 줄을 파싱하여 적절한 이벤트를 발생시킴
   */
  public parseLine(rawLine: string): void {
    const cleanLine = this.stripHtml(rawLine);

    // 1. 날짜 헤더 감지 (Date : 2026년 4월 19일)
    const dateMatch = rawLine.match(/Date\s*:\s*(\d+)년\s*(\d+)월\s*(\d+)일/);
    if (dateMatch) {
      const y = dateMatch[1];
      const m = dateMatch[2].padStart(2, '0');
      const d = dateMatch[3].padStart(2, '0');
      this._currentDate = `${y}-${m}-${d}`;
      log(`[CHAT_PARSER] 날짜 인식: ${this._currentDate}`);
      return;
    }

    // 2. 시간대 추출 [ HH시 mm분 ss초 ]
    const timeMatch = rawLine.match(/\[\s*(\d+시\s*\d+분\s*\d+초)\s*\]/);
    if (!timeMatch) return;

    const timestamp = timeMatch[1];
    const cleanMsg = this.stripHtml(rawLine.replace(/\[.*?\]/, '')); // 시간 부분 제외하고 HTML 제거

    // A. SEED 획득 (콘텐츠 보상 및 일반 습득 모두 대응)
    if (cleanMsg.includes('SEED를') || cleanMsg.includes('Seed를') || cleanMsg.includes('시드를')) {
        // "보상으로 1500만 SEED", "[300000]SEED", "1500만 SEED를 획득" 등
        const amountMatch = cleanMsg.match(/(?:보상으로\s+)?([\[\]\d,억만\s]+)(?:SEED|Seed|시드)/i);
        if (amountMatch) {
            const amount = this.parseKoreanNumber(amountMatch[1]);
            if (amount > 0) {
                this.emit('SEED_GAINED', { date: this._currentDate, timestamp, amount, message: cleanMsg });
                return;
            }
        }
    }

    // B. 경험치 변동
    if (cleanMsg.includes('경험치가')) {
        const xpMatch = cleanMsg.match(/경험치가\s+([\[\]\d,억만\s]+)\s*(올랐|상승|감소|차감)/);
        if (xpMatch) {
            const amount = this.parseKoreanNumber(xpMatch[1]);
            const isGain = xpMatch[2] === '올랐' || xpMatch[2] === '상승';
            this.emit('XP_CHANGED', { date: this._currentDate, timestamp, amount: isGain ? amount : -amount, message: cleanMsg });
            return;
        }
    }

    // D. 외치기
    if (rawLine.includes('color="#c896c8"') && cleanMsg.includes('외치기 :')) {
        const shoutContent = cleanMsg.replace('외치기 :', '').trim();
        const userShoutSuffixRegex = /\[([^\]]+)\]$/;
        const userMatch = shoutContent.match(userShoutSuffixRegex);

        if (userMatch) {
            const sender = userMatch[1];
            const pureMessage = shoutContent.replace(userShoutSuffixRegex, '').trim();
            this.emit('TRADE_SHOUT', { date: this._currentDate, timestamp, sender, message: pureMessage });
        }
        return;
    }

    // E. 아이템 획득
    if (cleanMsg.includes('획득하였습니다') || cleanMsg.includes('습득했습니다') || cleanMsg.includes('획득했습니다')) {
        this.emit('ITEM_LOOTED', { date: this._currentDate, timestamp, message: cleanMsg });
        return;
    }
  }
}

export const chatParser = new ChatParser();
