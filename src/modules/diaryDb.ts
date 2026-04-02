import * as path from 'path';
import { app, BrowserWindow } from 'electron';
import Database = require('better-sqlite3');
import { log } from './logger';
import { DiaryEntry, HomeworkLog, ActivityLog, DiaryData } from '../shared/types';

let db: Database.Database | null = null;

// 포인트 산정 규칙
const POINTS = {
  DAILY_HOMEWORK: 10,
  WEEKLY_HOMEWORK: 0, // 주간 숙제는 포인트 제외
  BOSS_KILL: 10,
  CALC_RECORD: 10
};

/** 일지 창에 갱신 신호를 보냅니다. */
function notifyUpdate(): void {
  BrowserWindow.getAllWindows().forEach(win => {
    win.webContents.send('diary-updated');
  });
}

export function initDb(): void {
  if (db) return; // 이미 초기화된 경우 스킵
  try {
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'diary.db');
    db = new Database(dbPath);

    // 외래 키 제약 조건 활성화
    db.pragma('foreign_keys = ON');

    // 테이블 생성
    db.exec(`
      CREATE TABLE IF NOT EXISTS diaries (
        date TEXT PRIMARY KEY,
        total_score INTEGER DEFAULT 0,
        monster_id TEXT DEFAULT '',
        daily_done INTEGER DEFAULT 0,
        daily_total INTEGER DEFAULT 0,
        weekly_done INTEGER DEFAULT 0,
        weekly_total INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS homework_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        content_id TEXT NOT NULL,
        content_name TEXT NOT NULL,
        category TEXT NOT NULL,
        type TEXT NOT NULL,
        completed_at INTEGER NOT NULL,
        FOREIGN KEY (date) REFERENCES diaries(date)
      );

      CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        time TEXT NOT NULL,
        FOREIGN KEY (date) REFERENCES diaries(date)
      );
    `);
    log('[DiaryDB] Database initialized successfully.');
  } catch (error) {
    log(`[DiaryDB] Failed to initialize database: ${error}`);
    console.error('[DiaryDB] Error:', error);
  }
}

/** 데이터베이스 연결을 명시적으로 닫습니다 (백업 복구용). */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
    log('[DiaryDB] Database connection closed.');
  }
}

/** 특정 날짜의 일지가 없으면 생성합니다. */
function ensureDiaryExists(date: string): void {
  if (!db) initDb();
  if (!db) return;
  const stmt = db.prepare('INSERT OR IGNORE INTO diaries (date) VALUES (?)');
  stmt.run(date);
}

/** 날짜별 일지 데이터를 모두 가져옵니다. */
export function getDiaryByDate(date: string): DiaryData {
  if (!db) initDb();
  if (!db) return { diary: null, homeworkLogs: [], activityLogs: [] };

  ensureDiaryExists(date);
  const diary = db.prepare('SELECT * FROM diaries WHERE date = ?').get(date) as DiaryEntry;
  const homeworkLogs = db.prepare('SELECT * FROM homework_logs WHERE date = ? ORDER BY completed_at ASC').all(date) as HomeworkLog[];
  const activityLogs = db.prepare('SELECT * FROM activity_logs WHERE date = ? ORDER BY time ASC').all(date) as ActivityLog[];

  return { diary, homeworkLogs, activityLogs };
}

/** 특정 월의 달력 렌더링을 위해 요약 데이터 목록을 가져옵니다. (주변 날짜 포함) */
export function getDiariesByMonth(yearMonth: string): DiaryEntry[] {
  if (!db) initDb();
  if (!db) return [];

  // 현재 월의 시작일과 다음 달의 시작일 기준 범위를 넓게 가져옴 (주간 합계 계산용)
  const stmt = db.prepare(`
    SELECT * FROM diaries 
    WHERE date >= date(?, '-7 days') 
      AND date <= date(?, '+1 month', '+7 days') 
    ORDER BY date ASC
  `);
  return stmt.all(`${yearMonth}-01`, `${yearMonth}-01`) as DiaryEntry[];
}

/** 점수를 업데이트하고 몬스터 단계를 결정합니다. (자동 호출됨) */
function addScore(date: string, points: number): void {
  if (!db) return;
  const stmt = db.prepare('UPDATE diaries SET total_score = total_score + ? WHERE date = ?');
  stmt.run(points, date);
}

function subtractScore(date: string, points: number): void {
  if (!db) return;
  const stmt = db.prepare('UPDATE diaries SET total_score = MAX(0, total_score - ?) WHERE date = ?');
  stmt.run(points, date);
}

/** 특정 활동이 이미 기록되어 있는지 확인합니다. */
export function isActivityLogged(date: string, content: string): boolean {
  if (!db) initDb();
  if (!db) return false;
  const existing = db.prepare('SELECT id FROM activity_logs WHERE date = ? AND content = ?').get(date, content);
  return !!existing;
}

/** 타임라인에 활동 기록을 추가합니다. (보스 처치, 계산기 등) */
export function addActivityLog(date: string, time: string, type: 'boss' | 'calc' | 'memo' | 'loot' | 'homework', content: string): boolean {
  if (!db) initDb();
  if (!db) return false;

  let result = false;
  const transaction = db.transaction(() => {
    ensureDiaryExists(date);

    // 보스 처치 기록인 경우 중복 체크 (동일 날짜, 동일 내용)
    if (type === 'boss') {
      const existing = db!.prepare('SELECT id FROM activity_logs WHERE date = ? AND content = ?').get(date, content);
      if (existing) {
        log(`[DIARY_DB] 이미 존재하는 보스 기록입니다. 스킵: ${content}`);
        result = false;
        return;
      }
    }

    const stmt = db!.prepare('INSERT INTO activity_logs (date, type, content, time) VALUES (?, ?, ?, ?)');
    stmt.run(date, type, content, time);

    // 포인트 부여
    if (type === 'boss') addScore(date, POINTS.BOSS_KILL);
    if (type === 'calc') addScore(date, POINTS.CALC_RECORD);
    result = true;
  });
  transaction();
  if (result) notifyUpdate();
  return result;
}

/** 활동 기록을 삭제합니다 (토글 해제용). */
export function removeActivityLog(date: string, type: string, content: string): void {
  if (!db) initDb();
  if (!db) return;

  let changed = false;
  const transaction = db.transaction(() => {
    const stmt = db!.prepare('DELETE FROM activity_logs WHERE date = ? AND type = ? AND content = ?');
    const info = stmt.run(date, type, content);

    // 삭제된 행이 있을 때만 포인트 차감
    if (info.changes > 0) {
      if (type === 'boss') subtractScore(date, POINTS.BOSS_KILL);
      if (type === 'calc') subtractScore(date, POINTS.CALC_RECORD);
      changed = true;
    }
  });
  transaction();
  if (changed) notifyUpdate();
}

/** 숙제 완료 기록을 추가합니다. */
export function addHomeworkLog(date: string, contentId: string, contentName: string, category: string, type: 'daily' | 'weekly', completedAt: number): void {
  if (!db) initDb();
  if (!db) return;

  let added = false;
  const transaction = db.transaction(() => {
    ensureDiaryExists(date);

    // 이미 해당 숙제가 오늘/이번주 기록되어 있는지 확인
    const existing = db!.prepare('SELECT id FROM homework_logs WHERE date = ? AND content_id = ?').get(date, contentId);
    if (existing) return;

    const stmt = db!.prepare('INSERT INTO homework_logs (date, content_id, content_name, category, type, completed_at) VALUES (?, ?, ?, ?, ?, ?)');
    stmt.run(date, contentId, contentName, category, type, completedAt);

    // 포인트 부여
    if (type === 'daily') addScore(date, POINTS.DAILY_HOMEWORK);
    if (type === 'weekly') addScore(date, POINTS.WEEKLY_HOMEWORK);
    added = true;
  });
  transaction();
  if (added) notifyUpdate();
}

/** 숙제 체크 해제 시 기록을 삭제합니다. */
export function removeHomeworkLog(date: string, contentId: string): void {
  if (!db) initDb();
  if (!db) return;

  let removed = false;
  const transaction = db.transaction(() => {
    const existing = db!.prepare('SELECT type FROM homework_logs WHERE date = ? AND content_id = ?').get(date, contentId) as { type: string } | undefined;
    if (!existing) return;

    const stmt = db!.prepare('DELETE FROM homework_logs WHERE date = ? AND content_id = ?');
    stmt.run(date, contentId);

    // 포인트 차감
    if (existing.type === 'daily') subtractScore(date, POINTS.DAILY_HOMEWORK);
    if (existing.type === 'weekly') subtractScore(date, POINTS.WEEKLY_HOMEWORK);
    removed = true;
  });
  transaction();
  if (removed) notifyUpdate();
}

/** 그 날의 전체 숙제 통계(완료/전체)를 갱신합니다. */
export function updateHomeworkStats(date: string, dailyDone: number, dailyTotal: number, weeklyDone: number, weeklyTotal: number): void {
  if (!db) initDb();
  if (!db) return;

  ensureDiaryExists(date);
  const stmt = db.prepare(`
    UPDATE diaries 
    SET daily_done = ?, daily_total = ?, weekly_done = ?, weekly_total = ? 
    WHERE date = ?
  `);
  stmt.run(dailyDone, dailyTotal, weeklyDone, weeklyTotal, date);
  notifyUpdate();
}

/** 몬스터 스티커 설정을 업데이트합니다. */
export function updateDiaryMonster(date: string, monsterId: string): void {
  if (!db) initDb();
  if (!db) return;

  ensureDiaryExists(date);
  const stmt = db.prepare('UPDATE diaries SET monster_id = ? WHERE date = ?');
  stmt.run(monsterId, date);
  notifyUpdate();
}

/** 특정 월의 요약 정보 (득템 수, 누적 시드, 상세 목록)를 가져옵니다. */
export function getMonthlySummary(yearMonth: string): { totalLoots: number, totalSeed: number, lootList: any[], seedList: any[] } {
  if (!db) initDb();
  if (!db) return { totalLoots: 0, totalSeed: 0, lootList: [], seedList: [] };

  const logs = db.prepare("SELECT date, type, content FROM activity_logs WHERE date LIKE ? AND type IN ('loot', 'calc') ORDER BY date DESC, time DESC").all(`${yearMonth}-%`) as { date: string, type: string, content: string }[];

  let totalLoots = 0;
  let totalSeed = 0;
  const lootList: { date: string, content: string }[] = [];
  const seedList: { date: string, content: string }[] = [];

  logs.forEach(log => {
    if (log.type === 'loot') {
      lootList.push({ date: log.date, content: log.content });
      const match = log.content.match(/(\d+)개$/);
      if (match) {
        totalLoots += parseInt(match[1], 10);
      } else {
        totalLoots += 1;
      }
    } else if (log.type === 'calc') {
      seedList.push({ date: log.date, content: log.content });

      // 금액 추출 로직 개선 (한글 단위 대응)
      const match = log.content.match(/\(([^)]+)\)/);
      if (match) {
        const s = match[1];
        let val = 0;
        const joMatch = s.match(/(\d+)조/);
        const eokMatch = s.match(/(\d+)억/);
        const manMatch = s.match(/(\d+)만/);
        const rawMatch = s.match(/([\d,]+)/);

        if (joMatch) val += parseInt(joMatch[1], 10) * 1000000000000;
        if (eokMatch) val += parseInt(eokMatch[1], 10) * 100000000;
        if (manMatch) val += parseInt(manMatch[1], 10) * 10000;

        // '억', '만' 단위가 없는 순수 숫자 처리
        if (!eokMatch && !manMatch && rawMatch) {
          val = parseInt(rawMatch[1].replace(/,/g, ''), 10);
        }
        totalSeed += val;
      }
    }
  });

  return { totalLoots, totalSeed, lootList, seedList };
}

/** 월간 통계 데이터를 추출합니다 (인포그래픽용). */
export function getMonthlyStatistics(yearMonth: string): any {
  if (!db) initDb();
  if (!db) return null;

  const year = parseInt(yearMonth.split('-')[0], 10);
  const month = parseInt(yearMonth.split('-')[1], 10);
  const totalDays = new Date(year, month, 0).getDate();

  // 1. 기본 로그 가져오기
  const logs = db.prepare("SELECT date, type, content FROM activity_logs WHERE date LIKE ?").all(`${yearMonth}-%`) as { date: string, type: string, content: string }[];
  
  // 2. 출석일수 (활동 로그가 있는 고유 날짜 수)
  const attendanceDays = new Set(logs.map(l => l.date)).size;

  // 3. 보람찬 활동들 (보스, 득템, 수익)
  let totalBosses = 0;
  let totalLoots = 0;
  let totalSeed = 0;
  const bossCounts: Record<string, number> = {};
  const weeklyActivity = [0, 0, 0, 0, 0, 0, 0]; // 월~일 (0~6)
  const heatmap: Record<string, number> = {};

  logs.forEach(log => {
    // 요일별 활동량 계산
    const day = new Date(log.date).getDay();
    const dayIdx = day === 0 ? 6 : day - 1; // 월요일(0) ~ 일요일(6)로 변환
    weeklyActivity[dayIdx]++;

    // 히트맵용 일별 활동량
    heatmap[log.date] = (heatmap[log.date] || 0) + 1;

    if (log.type === 'boss') {
      totalBosses++;
      // 보스 이름 추출 (예: "[보스 처치] 어비스" -> "어비스")
      const bossName = log.content.replace('[보스 처치] ', '').trim();
      bossCounts[bossName] = (bossCounts[bossName] || 0) + 1;
    } else if (log.type === 'loot') {
      const match = log.content.match(/(\d+)개$/);
      totalLoots += match ? parseInt(match[1], 10) : 1;
    } else if (log.type === 'calc') {
      const match = log.content.match(/\(([^)]+)\)/);
      if (match) {
        const s = match[1];
        let val = 0;
        const joMatch = s.match(/(\d+)조/);
        const eokMatch = s.match(/(\d+)억/);
        const manMatch = s.match(/(\d+)만/);
        const rawMatch = s.match(/([\d,]+)/);
        if (joMatch) val += parseInt(joMatch[1], 10) * 1000000000000;
        if (eokMatch) val += parseInt(eokMatch[1], 10) * 100000000;
        if (manMatch) val += parseInt(manMatch[1], 10) * 10000;
        if (!eokMatch && !manMatch && rawMatch) val = parseInt(rawMatch[1].replace(/,/g, ''), 10);
        totalSeed += val;
      }
    }
  });

  // 4. 최애 보스 Top 3
  const topBosses = Object.entries(bossCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => ({ name, count }));

  // 5. 히트맵 배열 변환
  const heatmapList = Object.entries(heatmap).map(([date, count]) => ({ date, count }));

  // 6. 등급 산출 로직 (출석일수 기준)
  let grade: 'S' | 'A' | 'B' | 'C' | 'D' = 'D';
  if (attendanceDays >= 25) grade = 'S';
  else if (attendanceDays >= 20) grade = 'A';
  else if (attendanceDays >= 12) grade = 'B';
  else if (attendanceDays >= 5) grade = 'C';

  return {
    attendanceDays,
    totalDays,
    totalBosses,
    totalLoots,
    totalSeed,
    topBosses,
    weeklyActivity,
    heatmap: heatmapList,
    grade
  };
}
