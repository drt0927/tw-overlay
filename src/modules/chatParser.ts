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
    
    // 콤마 및 공백 제거, 소문자화 (Seed/SEED 대응)
    const cleanText = text.replace(/,/g, '').replace(/\s+/g, '');
    
    // 순수 숫자인 경우
    if (/^\d+$/.test(cleanText)) {
      return parseInt(cleanText, 10);
    }

    let total = 0;
    // 억, 만 단위를 정규식으로 매칭 (숫자와 단위를 그룹화)
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
    // 1. 시간대 추출 [ HH시 mm분 ss초 ]
    const timeMatch = rawLine.match(/\[\s*(\d+시\s*\d+분\s*\d+초)\s*\]/);
    if (!timeMatch) return;

    const timestamp = timeMatch[1];
    const cleanMsg = this.stripHtml(rawLine.replace(/\[.*?\]/, '')); // 시간 부분 제외하고 HTML 제거

    // 2. 카테고리별 분류 및 이벤트 발송 (기초 뼈대)
    
    // A. SEED 획득
    if (cleanMsg.includes('SEED를 획득') || cleanMsg.includes('Seed를 획득') || cleanMsg.includes('시드를 획득')) {
        const amountMatch = cleanMsg.match(/(?:보상으로\s+)?(.*?)\s*SEED|Seed|시드/i);
        if (amountMatch) {
            const amount = this.parseKoreanNumber(amountMatch[1]);
            this.emit('SEED_GAINED', { timestamp, amount, message: cleanMsg });
            return;
        }
    }

    // B. 경험치 변동
    if (cleanMsg.includes('경험치가')) {
        const xpMatch = cleanMsg.match(/경험치가\s+(.*?)\s*(올랐|상승|감소|차감)/);
        if (xpMatch) {
            const amount = this.parseKoreanNumber(xpMatch[1]);
            const isGain = xpMatch[2] === '올랐' || xpMatch[2] === '상승';
            this.emit('XP_CHANGED', { timestamp, amount: isGain ? amount : -amount, message: cleanMsg });
            return;
        }
    }

    // C. 긴급 알림 (마법진)
    if (cleanMsg.includes('발 밑에 마법진이 나타났다!')) {
        this.emit('EMERGENCY_ALERT', { timestamp, type: 'MAGIC_CIRCLE', message: cleanMsg });
        return;
    }

    // D. 외치기
    if (rawLine.includes('color="#c896c8"') && cleanMsg.includes('외치기 :')) {
        const shoutContent = cleanMsg.replace('외치기 :', '').trim();
        
        // 유저명 추출 시도 (보통 [유저명] 님 형식)
        const userMatch = shoutContent.match(/\[(.*?)\]/);
        const sender = userMatch ? userMatch[1] : 'Unknown';

        // [시스템 외치기 필터링]: 유저가 직접 발송한 외치기는 메시지 끝에 항상 [캐릭터명]이 붙습니다.
        // 시스템 자동 외치기(아이템 획득 알림 등)는 이 접미사가 없으므로 이를 통해 필터링합니다.
        // 정규식: 대괄호로 감싸진 캐릭터명이 줄의 마지막에 위치하는지 검사
        const userShoutSuffixRegex = /\[[^\]]+\]$/;
        if (userShoutSuffixRegex.test(shoutContent)) {
            this.emit('TRADE_SHOUT', { timestamp, sender, message: shoutContent });
        }
        return;
    }

    // E. 아이템 획득 (키워드 매칭은 하위 모듈에서 처리하도록 원본 전달)
    if (cleanMsg.includes('획득하였습니다') || cleanMsg.includes('습득했습니다') || cleanMsg.includes('획득했습니다')) {
        this.emit('ITEM_LOOTED', { timestamp, message: cleanMsg });
        return;
    }
  }
}

export const chatParser = new ChatParser();
