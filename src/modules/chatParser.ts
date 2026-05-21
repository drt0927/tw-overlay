import { EventEmitter } from 'events';
import { log } from './logger';
import * as fs from 'fs';
import * as path from 'path';
import type { ChatTrigger, ChatPatternType, ChatParserEventMap } from '../shared/types';

/**
 * 테일즈위버 채팅 로그 파싱 결과 타입 정의
 */
export interface ParsedChatData {
  type: 'SEED' | 'ITEM' | 'XP' | 'TRADE' | 'ALERT' | 'PROGRESS' | 'BUFF_USED';
  originalTime: string; // [HH시 mm분 ss초]
  message: string;      // HTML 제거된 순수 메시지
  data?: any;           // 가공된 숫자나 객체 데이터
}

/**
 * Type-safe EventEmitter 선언 병합
 * chatParser.on('EVENT_NAME', ...) 호출 시 이벤트명과 페이로드를 컴파일 타임에 검증
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface ChatParser {
  on<K extends keyof ChatParserEventMap>(event: K, listener: (data: ChatParserEventMap[K]) => void): this;
  emit<K extends keyof ChatParserEventMap>(event: K, data: ChatParserEventMap[K]): boolean;
}

/**
 * 채팅 로그 파서 엔진
 */
class ChatParser extends EventEmitter {
  private _currentDate: string = ''; // YYYY-MM-DD 형식

  // 버프 트리거 역인덱스: keyword → [{ buffId, trigger }]
  private _triggerIndex: Map<string, Array<{ buffId: string; trigger: ChatTrigger }>> = new Map();
  // FIXED_MSG 전용: 고정 메시지 → buffId
  private _fixedMsgIndex: Map<string, string> = new Map();

  constructor() {
    super();
    // 초기값은 오늘 날짜로 설정 (로그 헤더 감지 전 대비)
    this._currentDate = new Date().toISOString().split('T')[0];
    this.loadBuffTriggers();
  }

  /**
   * buffs.json에서 chatTriggers를 로드하여 역인덱스 구성
   */
  public loadBuffTriggers(): void {
    try {
      const buffsPath = path.join(__dirname, '..', 'assets', 'data', 'buffs.json');
      const raw = fs.readFileSync(buffsPath, 'utf-8');
      const buffs: Array<{ id: string; chatTriggers?: ChatTrigger[] }> = JSON.parse(raw);

      this._triggerIndex.clear();
      this._fixedMsgIndex.clear();

      for (const buff of buffs) {
        if (!buff.chatTriggers || buff.chatTriggers.length === 0) continue;
        for (const trigger of buff.chatTriggers) {
          if (trigger.pattern === 'FIXED_MSG') {
            this._fixedMsgIndex.set(trigger.keyword, buff.id);
          } else {
            const key = trigger.keyword.toLowerCase();
            if (!this._triggerIndex.has(key)) this._triggerIndex.set(key, []);
            this._triggerIndex.get(key)!.push({ buffId: buff.id, trigger });
          }
        }
      }
      log(`[CHAT_PARSER] 버프 트리거 로드 완료: ${this._triggerIndex.size}개 keyword, ${this._fixedMsgIndex.size}개 FIXED_MSG`);
    } catch (e) {
      log(`[CHAT_PARSER] 버프 트리거 로드 실패: ${e}`);
    }
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
      return Number(cleanText);
    }

    let total = 0;
    const unitRegex = /(\d+)(억|만)?/g;
    let match;
    let foundAny = false;

    while ((match = unitRegex.exec(cleanText)) !== null) {
      foundAny = true;
      const num = Number(match[1]);
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
    // 파일 헤더의 Date : YYYY-MM-DD 패턴 감지
    const headerDateMatch = rawLine.match(/Date\s*:\s*(\d{4}-\d{2}-\d{2})/);
    if (headerDateMatch) {
      if (this._currentDate !== headerDateMatch[1]) {
        log(`[CHAT_PARSER] 날짜 변경 감지 (헤더): ${this._currentDate} -> ${headerDateMatch[1]}`);
        this._currentDate = headerDateMatch[1];
      }
      return;
    }

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

    // G. 어벤던로드 특화 패턴
    // 1. 입장료 (예: "입장료 5680만 Seed를 지불 하였습니다.", "입장료 1억 40만 Seed를 지불 하였습니다.")
    if (cleanMsg.includes('입장료') && (cleanMsg.toLowerCase().includes('seed') || cleanMsg.includes('시드'))) {
        const feeMatch = cleanMsg.match(/입장료\s+([\d,\s억만]+?)\s*Seed를\s+지불\s+하였습니다/i);
        if (feeMatch) {
            const amount = this.parseKoreanNumber(feeMatch[1]);
            this.emit('ABANDONED_FEE', { date: this._currentDate, timestamp, amount, message: cleanMsg });
            return;
        }
    }

    // 2. 도전 횟수 (예: "이번 주 어밴던로드 카디프 지역의 도전 횟수는 5번 입니다.")
    if (cleanMsg.includes('어벤던로드') || cleanMsg.includes('어밴던로드')) {
        const entryMatch = cleanMsg.match(/이번\s+주\s+어[벤밴]던로드\s+(.*?)\s+지역의\s+도전\s+횟\s*수\s*는\s+(\d+)\s*번\s*입니다/);
        if (entryMatch) {
            const region = entryMatch[1].trim();
            const count = parseInt(entryMatch[2], 10);
            this.emit('ABANDONED_ENTRY', { date: this._currentDate, timestamp, region, count, message: cleanMsg });
            return;
        }
    }

    // H. 팔색조 언덕 특화 패턴
    // 1. 보스 진입 (예: "현재 남은 에너지는 [15]이고, 보스 퇴치 시 획득 가능한 보상 등급은 [S]입니다.")
    if (cleanMsg.includes('남은 에너지는') && cleanMsg.includes('보상 등급은')) {
        const pittaEntryMatch = cleanMsg.match(/현재\s+남은\s+에너지는\s+\[(\d+)\]이고,\s+보스\s+퇴치\s+시\s+획득\s+가능한\s+보상\s+등급은\s+\[(.*?)\]입니다/);
        if (pittaEntryMatch) {
            const energy = parseInt(pittaEntryMatch[1], 10);
            const grade = pittaEntryMatch[2].trim();
            this.emit('PITTA_ENTRY', { date: this._currentDate, timestamp, energy, grade, message: cleanMsg });
            return;
        }
    }

    // 2. 보상 획득 (예: "[S]등급 보상으로 [봉인된 페어리 피타 암릿] 아이템을 획득 하였습니다.")
    if (cleanMsg.includes('등급 보상으로') && cleanMsg.includes('획득')) {
        const pittaClearMatch = cleanMsg.match(/\[(.*?)\]등급\s+보상으로\s+\[(.*?)\]\s*아이템을\s*획득\s*하였습니다/);
        if (pittaClearMatch) {
            const grade = pittaClearMatch[1].trim();
            const itemName = pittaClearMatch[2].trim();
            this.emit('PITTA_CLEAR', { date: this._currentDate, timestamp, grade, itemName, message: cleanMsg });
            // return하지 않음 (일반 ITEM_LOOTED로도 흐르게 두거나, 필요에 따라 return)
        }
    }

    // 3. 마정석 입수 (예: "[중급 마정석] 1개를 입수했습니다.")
    if (cleanMsg.includes('마정석') && cleanMsg.includes('입수했습니다')) {
        const stonePickupMatch = cleanMsg.match(/\[(하급|중급|상급|최상급)\s*마정석\]\s*(\d+)개를\s*입수했습니다/);
        if (stonePickupMatch) {
            const grade = stonePickupMatch[1].trim();
            const count = parseInt(stonePickupMatch[2], 10);
            this.emit('MAGIC_STONE_GAIN', { date: this._currentDate, timestamp, grade, count, message: cleanMsg });
            return;
        }
    }

    // 4. 마정석 소실 (예: "누에게 하급 마정석 20개를 빼앗겼습니다.")
    if (cleanMsg.includes('마정석') && cleanMsg.includes('빼앗겼습니다')) {
        const lossMatch = cleanMsg.match(/누에게\s+(하급|중급|상급|최상급)\s+마정석\s+(\d+)개를\s+빼앗겼습니다/);
        if (lossMatch) {
            const grade = lossMatch[1].trim();
            const count = parseInt(lossMatch[2], 10);
            this.emit('MAGIC_STONE_LOSS', { date: this._currentDate, timestamp, grade, count, message: cleanMsg });
            return;
        }
    }

    // I. 에토스 기믹 특화 패턴
    // (예: "수색대장, 에토스 : 암호는 갈퀴 모양 번개")
    if (cleanMsg.includes('수색대장, 에토스') && cleanMsg.includes('암호는')) {
        const ethosMatch = cleanMsg.match(/암호는\s+(.*)/);
        if (ethosMatch) {
            const password = ethosMatch[1].trim();
            this.emit('ETHOS_PASSWORD', { date: this._currentDate, timestamp, password, message: cleanMsg });
            return;
        }
    }

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
    if (cleanMsg.includes('획득 하였습니다') || cleanMsg.includes('획득하였습니다')) {
        // 어벤던로드 마정석 획득 특화 (예: "하급 마정석 1개를 획득 하였습니다.")
        const magicStoneGainMatch = cleanMsg.match(/(하급|중급|상급|최상급)\s+마정석\s+(\d+)개를\s+획득\s+하였습니다/);
        if (magicStoneGainMatch) {
            // 타인 획득 메시지 (시스템 브로드캐스트)는 제외
            if (cleanMsg.startsWith('누군가')) {
                return;
            }
            const grade = magicStoneGainMatch[1].trim();
            const count = parseInt(magicStoneGainMatch[2], 10);
            this.emit('MAGIC_STONE_GAIN', { date: this._currentDate, timestamp, grade, count, message: cleanMsg });
            return;
        }
        this.emit('ITEM_LOOTED', { date: this._currentDate, timestamp, message: cleanMsg });
        return;
    }

    // F. 버프 사용 감지
    this._detectBuffUsed(rawLine, cleanMsg, timestamp);
  }

  /**
   * 버프 사용 채팅 메시지 감지
   */
  private _detectBuffUsed(rawLine: string, cleanMsg: string, timestamp: string): void {
    // FIXED_MSG: 고정 메시지 포함 여부 체크
    for (const [keyword, buffId] of this._fixedMsgIndex) {
      if (cleanMsg.includes(keyword)) {
        this.emit('BUFF_USED', { date: this._currentDate, timestamp, buffId, usedBy: 'self', message: cleanMsg });
        return;
      }
    }

    // SELF_USE: "XXX를/을 사용하였습니다."
    const selfUseMatch = cleanMsg.match(/^(.+?)(?:를|을) 사용하였습니다\.?$/);
    if (selfUseMatch) {
      const keyword = selfUseMatch[1].trim().toLowerCase();
      const hits = this._lookupTrigger(keyword, 'SELF_USE');
      if (hits.length > 0) {
        hits.forEach(({ buffId }) => {
          this.emit('BUFF_USED', { date: this._currentDate, timestamp, buffId, usedBy: 'self', message: cleanMsg });
        });
        return;
      }
    }

    // PARTY_ITEM: "[닉네임]님이 [아이템명] 아이템을 사용하셨습니다"
    const partyItemMatch = cleanMsg.match(/\[(.+?)\]님이 \[(.+?)\] 아이템을 사용하셨습니다/);
    if (partyItemMatch) {
      const usedBy = partyItemMatch[1].trim();
      const itemName = partyItemMatch[2].trim().toLowerCase();
      const hits = this._lookupTrigger(itemName, 'PARTY_ITEM');
      if (hits.length > 0) {
        hits.forEach(({ buffId }) => {
          this.emit('BUFF_USED', { date: this._currentDate, timestamp, buffId, usedBy, message: cleanMsg });
        });
        return;
      }
    }

    // EFFECT_APPLIED: "[아이템명] 효과가 발동/적용"
    const effectMatch = cleanMsg.match(/\[(.+?)\] 효과가/);
    if (effectMatch) {
      const itemName = effectMatch[1].trim().toLowerCase();
      const hits = this._lookupTrigger(itemName, 'EFFECT_APPLIED');
      if (hits.length > 0) {
        hits.forEach(({ buffId }) => {
          this.emit('BUFF_USED', { date: this._currentDate, timestamp, buffId, usedBy: 'self', message: cleanMsg });
        });
        return;
      }
    }
  }

  /**
   * 트리거 인덱스에서 keyword와 pattern으로 매칭
   * exact 또는 contains 매칭 지원
   */
  private _lookupTrigger(inputKey: string, pattern: ChatPatternType): Array<{ buffId: string; trigger: ChatTrigger }> {
    const results: Array<{ buffId: string; trigger: ChatTrigger }> = [];
    for (const [key, entries] of this._triggerIndex) {
      for (const entry of entries) {
        if (entry.trigger.pattern !== pattern) continue;
        const matchType = entry.trigger.matchType ?? 'exact';
        if (matchType === 'contains' ? inputKey.includes(key) : inputKey === key) {
          results.push(entry);
        }
      }
    }
    return results;
  }
}

export const chatParser = new ChatParser();
