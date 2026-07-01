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
    if (cleanMsg.trim().length === 0) return;

    // J. 숙제 체크 관련 특화 패턴
    // 1. 이클립스 보스전
    const eclipseBossMatch = cleanMsg.match(/이클립스 보스전\((.*?)\) 클리어 횟수: \[(\d+)회\/7회\]/);
    if (eclipseBossMatch) {
      this.emit('ECLIPSE_BOSS_CLEAR', {
        date: this._currentDate,
        timestamp,
        bossName: eclipseBossMatch[1].trim(),
        count: parseInt(eclipseBossMatch[2], 10),
        message: cleanMsg
      });
      return;
    }

    // 2. 머큐리얼 보스전
    const mercurialBossMatch = cleanMsg.match(/^(실반|샐리온|실라이론|샐레아나|루미너스|루미너스\s*\(EX\))\s*클리어 횟수: \[(\d+)회\/7회\]/);
    if (mercurialBossMatch) {
      this.emit('MERCURIAL_BOSS_CLEAR', {
        date: this._currentDate,
        timestamp,
        bossName: mercurialBossMatch[1].trim(),
        count: parseInt(mercurialBossMatch[2], 10),
        message: cleanMsg
      });
      return;
    }

    // 3. 코어 마스터 던전 (절대 횟수 표기형)
    // 3-1-A. 머큐리얼 코어 마스터
    const mercurialCoreMasterMatch = cleanMsg.match(/^(실반|샐리온|실라이론|샐레아나|루미너스)\s*코어\s*마스터\s*던전\s*클리어\s*횟수\s*:\s*\[(\d+)회\/7회\]/);
    if (mercurialCoreMasterMatch) {
      this.emit('CORE_MASTER_CLEAR', {
        date: this._currentDate,
        timestamp,
        contentName: mercurialCoreMasterMatch[1].trim(),
        count: parseInt(mercurialCoreMasterMatch[2], 10),
        isIncrement: false,
        message: cleanMsg
      });
      return;
    }

    // 3-1-B. 어비스 심층 코어 마스터 (예: 코어 마스터 - 심층Ⅰ 클리어 횟수: [1회/7회])
    const abyssCoreMasterMatch = cleanMsg.match(/^코어\s*마스터\s*-\s*(심층Ⅰ|심층Ⅱ|심층Ⅲ|심층\s*I|심층\s*II|심층\s*III)\s*클리어\s*횟수\s*:\s*\[(\d+)회\/7회\]/);
    if (abyssCoreMasterMatch) {
      let contentName = abyssCoreMasterMatch[1].trim().replace(/\s+/g, '');
      // 심층 로마자/영어 정규화
      if (contentName === '심층I') contentName = '심층Ⅰ';
      if (contentName === '심층II') contentName = '심층Ⅱ';
      if (contentName === '심층III') contentName = '심층Ⅲ';

      this.emit('CORE_MASTER_CLEAR', {
        date: this._currentDate,
        timestamp,
        contentName,
        count: parseInt(abyssCoreMasterMatch[2], 10),
        isIncrement: false,
        message: cleanMsg
      });
      return;
    }

    // 4. 고대 렐릭의 성소
    const relicSanctuaryMatch = cleanMsg.match(/고대 렐릭의 성소.*?주간 무료 클리어 횟수\s*:\s*(\d+)/);
    if (relicSanctuaryMatch) {
      this.emit('RELIC_SANCTUARY_CLEAR', {
        date: this._currentDate,
        timestamp,
        count: parseInt(relicSanctuaryMatch[1], 10),
        message: cleanMsg
      });
      return;
    }

    // 5. 힘의 근원
    const powerRootMatch = cleanMsg.match(/수르트의 힘의 근원 클리어 횟수: \[(\d+)회\/7회\]/);
    if (powerRootMatch) {
      this.emit('POWER_ROOT_CLEAR', {
        date: this._currentDate,
        timestamp,
        count: parseInt(powerRootMatch[1], 10),
        message: cleanMsg
      });
      return;
    }

    // 6. 심연의 보물창고
    const abyssTreasureMatch = cleanMsg.match(/심연의 보물창고 입장 횟수: \[(\d+)회\/7회\]/);
    if (abyssTreasureMatch) {
      this.emit('ABYSS_TREASURE_ENTRY', {
        date: this._currentDate,
        timestamp,
        count: parseInt(abyssTreasureMatch[1], 10),
        message: cleanMsg
      });
      return;
    }

    // 7. 보급품 탈환
    const suppliesMatch = cleanMsg.match(/보급품 탈환 클리어 횟수: \[(\d+)회\/7회\]/);
    if (suppliesMatch) {
      this.emit('ECLIPSE_SUPPLIES_CLEAR', {
        date: this._currentDate,
        timestamp,
        count: parseInt(suppliesMatch[1], 10),
        message: cleanMsg
      });
      return;
    }

    // 8. 별동대 토벌
    const specialForceMatch = cleanMsg.match(/별동대 토벌 클리어 횟수: \[(\d+)회\/7회\]/);
    if (specialForceMatch) {
      this.emit('ECLIPSE_SPECIAL_FORCE_CLEAR', {
        date: this._currentDate,
        timestamp,
        count: parseInt(specialForceMatch[1], 10),
        message: cleanMsg
      });
      return;
    }

    // 9. 지하요새의 망령
    const fortressGhostMatch = cleanMsg.match(/지하요새의 망령 클리어 횟수: \[(\d+)회\/7회\]/);
    if (fortressGhostMatch) {
      this.emit('FORTRESS_GHOST_CLEAR', {
        date: this._currentDate,
        timestamp,
        count: parseInt(fortressGhostMatch[1], 10),
        message: cleanMsg
      });
      return;
    }

    // 10. 테시스 코어 던전
    if (cleanMsg.includes('던전을 클리어 하였습니다. 곧 마을로 돌아가게 됩니다.')) {
      this.emit('TESIS_CORE_CLEAR', {
        date: this._currentDate,
        timestamp,
        message: cleanMsg
      });
      return;
    }

    // 11. 발굴지
    const digsiteMatch = cleanMsg.match(/무료 입장 횟수 (\d+)회 중 (\d+)회째 입장합니다\./);
    if (digsiteMatch) {
      this.emit('DIGSITE_ENTRY', {
        date: this._currentDate,
        timestamp,
        count: parseInt(digsiteMatch[2], 10),
        message: cleanMsg
      });
      return;
    }

    // 12. 신조의 둥지
    if (/미션을\s*완료했습니다\.\s*:\s*신조의\s*둥지\s*-\s*신조\s*처치/.test(cleanMsg)) {
      this.emit('CONTENT_SHINJO_NEST_CLEAR', {
        date: this._currentDate,
        timestamp,
        message: cleanMsg
      });
      return;
    }

    // 13. 어비스 보스 (심층 1~3)
    const abyssDungeonMatch = cleanMsg.match(/어비스\s*-\s*(심층Ⅰ|심층Ⅱ|심층Ⅲ)\(보스전\)\s*플레이를\s*이번\s*주에\s*(\d+)회\s*중\s*(\d+)회째\s*하고\s*계십니다/);
    if (abyssDungeonMatch) {
      this.emit('ABYSS_DUNGEON_CLEAR', {
        date: this._currentDate,
        timestamp,
        depth: abyssDungeonMatch[1].trim(),
        count: parseInt(abyssDungeonMatch[3], 10),
        message: cleanMsg
      });
      return;
    }

    // 14. 어비스 보스전 (EX)
    const abyssBossExMatch = cleanMsg.match(/어비스\s*보스전\(EX\)\s*클리어\s*횟수:\s*\[(\d+)회\/7회\]/);
    if (abyssBossExMatch) {
      this.emit('ABYSS_BOSS_EX_CLEAR', {
        date: this._currentDate,
        timestamp,
        count: parseInt(abyssBossExMatch[1], 10),
        message: cleanMsg
      });
      return;
    }

    // 15. 프라바 방어전 (1인)
    if (/프라바\s*방어전\s*성공\s*보상으로\s*경험치\s*(?:\d+만|[\d,]+)\s*을\s*획득\s*했습니다\./.test(cleanMsg)) {
      this.emit('PRAVA_DEFENSE_CLEAR', {
        date: this._currentDate,
        timestamp,
        count: 1,
        message: cleanMsg
      });
      return;
    }

    // 15-2. 오를리 방어전 지옥 난이도 클리어
    if (/미션을\s*완료했습니다\.\s*:\s*오를리\s*방어전\s*지옥\s*난이도\s*클리어/.test(cleanMsg)) {
      this.emit('ORLY_DEFENSE_CLEAR', {
        date: this._currentDate,
        timestamp,
        message: cleanMsg
      });
      return;
    }

    // 16. 망각의 카타콤 (지옥)
    if (/\[카타콤\s*훈장\]\s*을\(를\)\s*\d+개\s*획득하였습니다\./.test(cleanMsg)) {
      this.emit('CATACOMB_CLEAR', {
        date: this._currentDate,
        timestamp,
        count: 1,
        message: cleanMsg
      });
      return;
    }

    // 17. 시오칸하임 보스 토벌전
    const siokanBossMatch = cleanMsg.match(/시오칸하임\s*-\s*보스\s*토벌전의\s*클리어\s*횟수\s*:\s*(\d+)\s*회/);
    if (siokanBossMatch) {
      this.emit('SIOKAN_BOSS_CLEAR', {
        date: this._currentDate,
        timestamp,
        count: parseInt(siokanBossMatch[1], 10),
        message: cleanMsg
      });
      return;
    }

    // 17-2. 시오칸하임 오딘 전면전
    const siokanOdinMatch = cleanMsg.match(/시오칸하임\s*-\s*오딘\s*전면전의\s*클리어\s*횟수\s*:\s*(\d+)\s*회/);
    if (siokanOdinMatch) {
      this.emit('SIOKAN_ODIN_CLEAR', {
        date: this._currentDate,
        timestamp,
        count: parseInt(siokanOdinMatch[1], 10),
        message: cleanMsg
      });
      return;
    }

    // 17-3. 이클립스 보스 토벌전
    const eclipseSubjugationMatch = cleanMsg.match(/이클립스\s*보스\s*토벌전\s*클리어\s*횟수\s*:\s*\[(\d+)회\/21회\]/);
    if (eclipseSubjugationMatch) {
      this.emit('ECLIPSE_BOSS_SUBJUGATION_CLEAR', {
        date: this._currentDate,
        timestamp,
        count: parseInt(eclipseSubjugationMatch[1], 10),
        message: cleanMsg
      });
      return;
    }

    // 17-4. 달여왕 군대 훈련소
    const moonQueenTrainingMatch = cleanMsg.match(/달여왕\s*군대\s*훈련소\s*클리어\s*횟수\s*:\s*\[(\d+)회\/7회\]/);
    if (moonQueenTrainingMatch) {
      this.emit('MOON_QUEEN_TRAINING_CLEAR', {
        date: this._currentDate,
        timestamp,
        count: parseInt(moonQueenTrainingMatch[1], 10),
        message: cleanMsg
      });
      return;
    }



    // 19. 베스티지
    if (/미션을\s*완료했습니다\.\s*:\s*베스티지\s*던전\s*클리어/.test(cleanMsg)) {
      this.emit('VESTIGE_CLEAR', {
        date: this._currentDate,
        timestamp,
        message: cleanMsg
      });
      return;
    }

    // 20. 아페티리아 (일반/어려움)
    const apethiriaMatch = cleanMsg.match(/^아페티리아\s*클리어\s*횟수\s*:\s*\[(\d+)회\/7회\]/);
    if (apethiriaMatch) {
      this.emit('APETHIRIA_RAID_CLEAR', {
        date: this._currentDate,
        timestamp,
        count: parseInt(apethiriaMatch[1], 10),
        message: cleanMsg
      });
      return;
    }

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

    // J. 심연의 제2사도 기믹 특화 패턴
    if (cleanMsg.includes('심연의 제2사도 : 절제와 균형의 중심에서 빗나간 힘은 칼날이 되어 돌아오지.')) {
        this.emit('ABYSS_APOSTLE_PATTERN', { date: this._currentDate, timestamp, message: cleanMsg });
        return;
    }

    // K. 몬스터 웨이브 종료 대기 알림 특화 패턴
    if (cleanMsg.includes('몬스터가 남아있으면 다음 웨이브로 넘어가지 않습니다.')) {
        this.emit('WAVE_MONSTER_WARNING', { date: this._currentDate, timestamp, message: cleanMsg });
        return;
    }

    // L. 로카고스 기믹 특화 패턴
    if (cleanMsg.includes('선봉대장, 로카고스')) {
        if (cleanMsg.includes('제외한 구역에 마법 공격 지원 바란다!')) {
            const match = cleanMsg.match(/(알파|브라보|찰리|델타)를 제외한 구역/);
            if (match) {
                const zone = match[1].trim() as '알파' | '브라보' | '찰리' | '델타';
                this.emit('LOKAGOS_PATTERN', { date: this._currentDate, timestamp, type: 'EXCLUDE', zone, message: cleanMsg });
                return;
            }
        } else if (cleanMsg.includes('구역에 마법 공격 지원 바란다!')) {
            const match = cleanMsg.match(/(알파|브라보|찰리|델타) 구역에/);
            if (match) {
                const zone = match[1].trim() as '알파' | '브라보' | '찰리' | '델타';
                this.emit('LOKAGOS_PATTERN', { date: this._currentDate, timestamp, type: 'TARGET', zone, message: cleanMsg });
                return;
            }
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

    // 경험의 정수 획득 감지 (3번 유형 및 중복 방지)
    if (cleanMsg.includes('경험의 정수')) {
        // 2번 유형 중복 방지: '경험치 100억이 차감되고' 메시지는 XP_CHANGED에서 이미 처리함
        if (!cleanMsg.includes('경험치 100억이 차감되고')) {
            const isGained = cleanMsg.includes('획득했습니다') || 
                             cleanMsg.includes('획득하였습니다') || 
                             cleanMsg.includes('획득 하였습니다');
            
            if (isGained) {
                let count = 1;
                // 1. "경험의 정수 N개" 패턴 매칭
                const countMatch = cleanMsg.match(/경험의\s*정수\s*(\d+)개/);
                // 2. "[경험의 정수] 아이템을 N개" 패턴 매칭
                const itemMatch = cleanMsg.match(/\[경험의\s*정수\]\s*아이템을\s*(\d+)개/);
                
                if (countMatch) {
                    count = parseInt(countMatch[1], 10);
                } else if (itemMatch) {
                    count = parseInt(itemMatch[1], 10);
                }
                
                this.emit('ESSENCE_GAINED', { 
                    date: this._currentDate, 
                    timestamp, 
                    count, 
                    message: cleanMsg 
                });
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

    // 일반 대화 색상(#ffffff)으로 기록되며 닉네임 형식을 취하는 보스/NPC 예외 목록
    const NPC_BLACK_LIST = [
        '데스포이나', '신조', '키시니크', '에레오스', '로카고스',
        '마티아', '티로로스', '라이코스', '체리아', '실반',
        '샐리온', '실라이론', '샐레아나', '루미너스', '크라모르'
    ];

    // D-2. 색상 최우선 기반 카테고리 분류 적용
    let color = '#a8a8a8';
    const colorMatch = rawLine.match(/color=["']?(#[0-9a-fA-F]{6})["']?/);
    if (colorMatch) {
        color = colorMatch[1].toLowerCase();
    }

    // 색상에 따른 분류 처리
    if (color === '#94ddfa') { // 1. 클럽 메시지 (클럽 대화, 클럽 공지, 클럽 접속 알림 등)
        const chatMatch = cleanMsg.match(/^(.+?)\s*:\s*(.*)$/);
        let sender = '클럽 알림';
        let message = cleanMsg;
        if (chatMatch) {
            sender = chatMatch[1].trim();
            message = chatMatch[2].trim();
        } else if (cleanMsg.includes('[클럽 공지]')) {
            sender = '클럽 공지';
        }
        this.emit('NORMAL_CHAT', { date: this._currentDate, timestamp, sender, message, color: '#94ddfa' });
        return;
    } 
    else if (color === '#f7b73c') { // 2. 팀 메시지
        const chatMatch = cleanMsg.match(/^(.+?)\s*:\s*(.*)$/);
        let sender = '팀 알림';
        let message = cleanMsg;
        if (chatMatch) {
            sender = chatMatch[1].trim();
            message = chatMatch[2].trim();
        }
        this.emit('NORMAL_CHAT', { date: this._currentDate, timestamp, sender, message, color: '#f7b73c' });
        return;
    } 
    else if (color === '#64ff64') { // 3. 귓속말
        const chatMatch = cleanMsg.match(/^(.+?)\s*:\s*(.*)$/);
        let sender = '귓속말';
        let message = cleanMsg;
        if (chatMatch) {
            sender = chatMatch[1].trim();
            message = chatMatch[2].trim();
        }
        this.emit('NORMAL_CHAT', { date: this._currentDate, timestamp, sender, message, color: '#64ff64' });
        return;
    } 
    else if (color === '#ffffff' || color === '#c8ffc8') { // 4. 일반 메시지 후보
        const chatMatch = cleanMsg.match(/^(.+?)\s*:\s*(.*)$/);
        if (chatMatch) {
            const sender = chatMatch[1].trim();
            const message = chatMatch[2].trim();
            // 일반 메시지인 경우에만 닉네임 유효성(공백/쉼표 검사) 및 NPC 검사를 진행
            if (!sender.includes(' ') && !sender.includes(',') && !NPC_BLACK_LIST.includes(sender)) {
                this.emit('NORMAL_CHAT', { date: this._currentDate, timestamp, sender, message, color });
                return;
            }
        }
        // 형식 탈락 시 시스템 메시지로 흐르게 함
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

    // G. 어떤 분기에도 걸리지 않고 흘러내려온 시스템 메시지 폴백
    this.emit('NORMAL_CHAT', {
      date: this._currentDate,
      timestamp,
      sender: '시스템',
      message: cleanMsg,
      color: color
    });
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
