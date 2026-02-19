/**
 * DC인사이드 갤러리 모니터 모듈
 * - 1페이지 새 글 감지 → 알림
 * - 등록된 글번호 댓글 변화 감지 → 알림 (POST API 사용)
 * - 블락 방지: 랜덤 딜레이, 요청 간격 제한, 쿨다운
 */
import * as https from 'https';
import { Notification, BrowserWindow } from 'electron';
import { log } from './logger';
import * as config from './config';

interface Post {
  no: number;
  title: string;
  replyCount: number;
  writer: string;
}

interface WatchedPost {
  title: string;
  commentCount: number;
  addedAt: number;
}

const GALLERY_ID = 'talesweaver';
const LIST_URL = `https://gall.dcinside.com/mini/board/lists/?id=${GALLERY_ID}&page=1`;
const VIEW_URL = (no: number | string) => `https://gall.dcinside.com/mini/board/view/?id=${GALLERY_ID}&no=${no}`;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
  'Referer': 'https://gall.dcinside.com/',
};

const COMMENT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/javascript, */*; q=0.01',
  'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
  'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  'Referer': `https://gall.dcinside.com/mini/board/view/?id=${GALLERY_ID}`,
  'Origin': 'https://gall.dcinside.com',
  'X-Requested-With': 'XMLHttpRequest',
};

const CHECK_INTERVAL_MS = 60000; // 60초마다 체크

// ─── 블락 방지 정책 ───
const RATE_LIMIT = {
  MIN_DELAY_MS: 1500,        // 요청 간 최소 간격 1.5초
  MAX_DELAY_MS: 3000,        // 요청 간 최대 간격 3초
  MAX_COMMENT_CHECKS: 5,     // 한 사이클에 최대 댓글 체크 수
  BACKOFF_BASE_MS: 60000,    // 에러 시 백오프 기본 시간 (1분)
  MAX_BACKOFF_MS: 300000,    // 최대 백오프 (5분)
};
let consecutiveErrors = 0;   // 연속 에러 횟수 (백오프용)
let cachedEsno = '';         // 캐시된 e_s_n_o 토큰

let lastSeenPostNo = 0;           // 마지막으로 본 최신글 번호
let watchedPosts: Record<string, WatchedPost> = {};            // { postNo: { title, commentCount } }
let galleryKeywords: string[] = []; // 알림 키워드 목록
let checkTimer: NodeJS.Timeout | null = null;
let isRunning = false;
let notifyEnabled = true;      // 알림 on/off
let mainWindowRef: BrowserWindow | null = null;
let sidebarWindowRef: BrowserWindow | null = null;
let galleryWindowRef: BrowserWindow | null = null;

// ─── 블락 방지 유틸 ───

/** 랜덤 딜레이 (min~max ms) */
function randomDelay(): Promise<void> {
  const ms = RATE_LIMIT.MIN_DELAY_MS + Math.random() * (RATE_LIMIT.MAX_DELAY_MS - RATE_LIMIT.MIN_DELAY_MS);
  return new Promise(resolve => setTimeout(resolve, Math.floor(ms)));
}

/** 에러 시 지수 백오프 딜레이 */
function getBackoffMs(): number {
  if (consecutiveErrors <= 0) return 0;
  const ms = Math.min(RATE_LIMIT.BACKOFF_BASE_MS * Math.pow(2, consecutiveErrors - 1), RATE_LIMIT.MAX_BACKOFF_MS);
  return ms;
}

// ─── HTTP 요청 유틸 ───
function fetchPage(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: HEADERS, timeout: 10000, rejectUnauthorized: false }, (res) => {
      // 리다이렉트 처리
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchPage(res.headers.location).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        res.resume();
        return;
      }
      let data = '';
      res.setEncoding('utf-8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        log(`[GALLERY] fetchPage 완료: ${url.substring(0, 80)} (status=${res.statusCode}, length=${data.length})`);
        resolve(data);
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// ─── HTML 파싱 (정규식 기반 경량 파서) ───

/** 글 목록 파싱 - 게시글 번호, 제목, 댓글수 추출 */
function parsePostList(html: string): Post[] {
  const posts: Post[] = [];
  // gall_list 내 tbody의 tr[data-no] 패턴
  const trRegex = /<tr[^>]*class="ub-content[^"]*"[^>]*data-no="(\d+)"[^>]*>([\s\S]*?)<\/tr>/gi;
  log(`[GALLERY] parsePostList: HTML length=${html.length}, ub-content 포함=${html.includes('ub-content')}, data-no 포함=${html.includes('data-no')}`);
  let match;
  while ((match = trRegex.exec(html)) !== null) {
    const no = parseInt(match[1], 10);
    const trContent = match[2];
    if (isNaN(no) || no <= 0) continue;

    // 공지, AD, 설문 제외 (data-type 속성으로 판별)
    const trTag = match[0];
    if (/data-type="icon_notice"/i.test(trTag)) continue;            // 공지글
    if (/data-type="icon_survey"/i.test(trTag)) continue;            // 설문
    if (/icon_ad|광고/i.test(trContent)) continue;                   // 광고

    // 제목 추출
    let title = '';
    const titleMatch = trContent.match(/<td[^>]*class="gall_tit[^"]*"[^>]*>[\s\S]*?<a[^>]*href="[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    if (titleMatch) {
      title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
    }

    // 댓글 수 추출
    let replyCount = 0;
    const replyMatch = trContent.match(/reply_num[^>]*>\[?(\d+)\]?/i);
    if (replyMatch) replyCount = parseInt(replyMatch[1], 10);

    // 작성자
    let writer = '';
    const writerMatch = trContent.match(/data-nick="([^"]*)"/i);
    if (writerMatch) writer = writerMatch[1];

    if (title) {
      posts.push({ no, title, replyCount, writer });
    }
  }
  log(`[GALLERY] parsePostList 결과: ${posts.length}개 게시글 파싱됨`);
  if (posts.length > 0) log(`[GALLERY] 첫 번째 글: #${posts[0].no} "${posts[0].title}"`);
  return posts;
}

/** 목록 HTML에서 e_s_n_o 토큰 추출 */
function extractEsno(html: string): string {
  const match = html.match(/name="e_s_n_o"\s+value="([^"]+)"/i)
    || html.match(/id="e_s_n_o"[^>]*value="([^"]+)"/i);
  if (match) {
    cachedEsno = match[1];
    log(`[GALLERY] e_s_n_o 토큰 갱신: ${cachedEsno}`);
  }
  return cachedEsno;
}

/** POST 방식 댓글 API로 댓글 수 조회 (가벼움, JSON 응답) */
function fetchCommentCount(postNo: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const body = [
      `id=${GALLERY_ID}`,
      `no=${postNo}`,
      `cmt_id=${GALLERY_ID}`,
      `cmt_no=${postNo}`,
      `focus_cno=`,
      `focus_pno=`,
      `e_s_n_o=${cachedEsno}`,
      `comment_page=1`,
      `sort=D`,
      `prevCnt=`,
      `board_type=`,
      `_GALLTYPE_=MI`,
      `secret_article_key=`,
    ].join('&');

    const options = {
      hostname: 'gall.dcinside.com',
      path: '/board/comment/',
      method: 'POST',
      headers: {
        ...COMMENT_HEADERS,
        'Content-Length': Buffer.byteLength(body),
        'Referer': `https://gall.dcinside.com/mini/board/view/?id=${GALLERY_ID}&no=${postNo}`,
      },
      timeout: 10000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.setEncoding('utf-8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            log(`[GALLERY] 댓글 API HTTP ${res.statusCode} (#${postNo})`);
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }
          const json = JSON.parse(data);
          // total_cnt 또는 댓글 배열 길이로 판별
          const count = json.total_cnt != null ? parseInt(json.total_cnt, 10) : 0;
          log(`[GALLERY] 댓글 API #${postNo}: ${count}개`);
          resolve(count);
        } catch (e: any) {
          log(`[GALLERY] 댓글 API 파싱 실패 #${postNo}: ${e.message}`);
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(body);
    req.end();
  });
}

// ─── 알림 발송 ───
function notify(title: string, body: string, postNo?: number): void {
  if (!notifyEnabled) return;
  try {
    const noti = new Notification({ title, body, silent: false });
    noti.on('click', () => {
      if (postNo) {
        const wm = require('./windowManager');
        wm.setOverlayVisible(true); // 알림 클릭 시 오버레이 강제 오픈
        
        // 창이 생성될 시간을 고려하여 약간의 지연 후 URL 이동
        setTimeout(() => {
          const view = wm.getView();
          if (view) view.webContents.loadURL(VIEW_URL(postNo));
        }, 100);
      }
    });
    noti.show();
    log(`[GALLERY] 알림: ${title} - ${body}`);
  } catch (e: any) {
    log(`[GALLERY] 알림 실패: ${e.message}`);
  }
}

// ─── 새 글 체크 ───
async function checkNewPosts(): Promise<void> {
  try {
    log(`[GALLERY] checkNewPosts 시작...`);
    const html = await fetchPage(LIST_URL);
    // e_s_n_o 토큰 추출 (댓글 API에 필요)
    extractEsno(html);
    const posts = parsePostList(html);
    if (posts.length === 0) return;

    // 최신 글 번호 기준
    const latestNo = Math.max(...posts.map(p => p.no));

    if (lastSeenPostNo === 0) {
      // 최초 실행 시 현재 상태를 기준으로 설정 (알림 안 보냄)
      lastSeenPostNo = latestNo;
      config.save({ galleryLastSeen: latestNo } as any);
      log(`[GALLERY] 초기 기준 설정: #${latestNo}`);
      return;
    }

    // 새 글 감지
    const newPosts = posts.filter(p => p.no > lastSeenPostNo);
    if (newPosts.length > 0) {
      // 사이드바에 레드닷 알림
      sendNewActivity('post', newPosts.length);
      
      // 키워드 필터링 적용
      let toNotify = newPosts;
      if (galleryKeywords && galleryKeywords.length > 0) {
        // 특수문자 이스케이프 및 정규식 생성
        const pattern = galleryKeywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
        const regex = new RegExp(pattern, 'i');
        toNotify = newPosts.filter(p => regex.test(p.title));
      }

      // 필터링된 글에 대해서만 푸시 알림 발송 (최신 3개)
      const notifyItems = toNotify.sort((a, b) => b.no - a.no).slice(0, 3);
      for (const p of notifyItems) {
        notify('🆕 새 글', `${p.title}${p.replyCount > 0 ? ` [${p.replyCount}]` : ''} - ${p.writer}`, p.no);
      }
      
      if (toNotify.length > 3) {
        notify('🆕 새 글', `외 ${toNotify.length - 3}개의 키워드 일치 새 글이 있습니다.`);
      }

      lastSeenPostNo = latestNo;
      config.save({ galleryLastSeen: latestNo } as any);
    }

    // 사이드바에 최신 글 목록 전송
    sendPostListToSidebar(posts);
  } catch (e: any) {
    log(`[GALLERY] 목록 체크 실패: ${e.message}
${e.stack}`);
  }
}

// ─── 댓글 변화 체크 (POST API + 블락 방지) ───
async function checkWatchedComments(): Promise<void> {
  const watchNos = Object.keys(watchedPosts);
  if (watchNos.length === 0) return;

  if (!cachedEsno) {
    log('[GALLERY] e_s_n_o 토큰 없음 - 댓글 체크 스킵');
    return;
  }

  // 한 사이클에 최대 N개만 체크 (블락 방지)
  const toCheck = watchNos.slice(0, RATE_LIMIT.MAX_COMMENT_CHECKS);
  log(`[GALLERY] 댓글 체크: ${toCheck.length}/${watchNos.length}개`);

  for (const noStr of toCheck) {
    try {
      // 요청 간 랜덤 딜레이
      await randomDelay();

      const no = parseInt(noStr, 10);
      const currentCount = await fetchCommentCount(no);
      const prev = watchedPosts[noStr];

      if (prev.commentCount >= 0 && currentCount > prev.commentCount) {
        const diff = currentCount - prev.commentCount;
        sendNewActivity('comment', diff, noStr);
        notify('💬 새 댓글', `[${prev.title}]에 ${diff}개의 새 댓글`, no);
      }
      watchedPosts[noStr].commentCount = currentCount;
    } catch (e: any) {
      log(`[GALLERY] 댓글 체크 실패 #${noStr}: ${e.message}`);
    }
  }
  saveWatchedPosts();
}

// ─── 주기 체크 루프 (백오프 포함) ───
async function doCheck(): Promise<void> {
  if (!isRunning) return;

  // 알림 OFF면 주기 체크 스킵 (서버 요청 안 함)
  if (!notifyEnabled) {
    checkTimer = setTimeout(doCheck, CHECK_INTERVAL_MS);
    return;
  }

  // 에러 백오프 적용
  const backoff = getBackoffMs();
  if (backoff > 0) {
    log(`[GALLERY] 백오프 ${Math.round(backoff / 1000)}초 대기 (연속 에러 ${consecutiveErrors}회)`);
    checkTimer = setTimeout(doCheck, backoff);
    return;
  }

  try {
    await checkNewPosts();
    await randomDelay();
    await checkWatchedComments();
    if (consecutiveErrors > 0) {
      log(`[GALLERY] 네트워크 복구됨`);
      if (galleryWindowRef && !galleryWindowRef.isDestroyed()) {
        galleryWindowRef.webContents.send('gallery-connection-status', true);
      }
    }
    consecutiveErrors = 0; 
  } catch (e: any) {
    consecutiveErrors++;
    log(`[GALLERY Error] (연속 ${consecutiveErrors}회): ${e.message}`);
    if (galleryWindowRef && !galleryWindowRef.isDestroyed()) {
      galleryWindowRef.webContents.send('gallery-connection-status', false);
    }
  }

  checkTimer = setTimeout(doCheck, CHECK_INTERVAL_MS);
}

// ─── 공개 API ───

export function start(mainWindow: BrowserWindow, sidebarWindow: BrowserWindow): void {
  mainWindowRef = mainWindow;
  sidebarWindowRef = sidebarWindow;

  // 저장된 상태 복원
  const cfg = config.load() as any;
  lastSeenPostNo = cfg.galleryLastSeen || 0;
  watchedPosts = cfg.galleryWatched || {};
  notifyEnabled = cfg.galleryNotify !== false; // 기본 true
  galleryKeywords = cfg.galleryKeywords || []; // 키워드 로드

  isRunning = true;
  log('[GALLERY] 갤러리 모니터 시작');
  doCheck();
}

export function stop(): void {
  isRunning = false;
  if (checkTimer) { clearTimeout(checkTimer); checkTimer = null; }
  log('[GALLERY] 갤러리 모니터 중지');
}

export function updateWindows(mainWindow: BrowserWindow, sidebarWindow: BrowserWindow, galleryWindow: BrowserWindow | null = null): void {
  mainWindowRef = mainWindow;
  sidebarWindowRef = sidebarWindow;
  if (galleryWindow) galleryWindowRef = galleryWindow;

  // 설정에서 키워드가 바뀌었을 수 있으므로 다시 로드
  const cfg = config.load() as any;
  galleryKeywords = cfg.galleryKeywords || [];
}

/** 글 감시 추가 */
export async function addWatch(postNo: number): Promise<WatchedPost> {
  const noStr = String(postNo);
  if (watchedPosts[noStr]) return watchedPosts[noStr];

  try {
    const html = await fetchPage(VIEW_URL(postNo));
    // 글 페이지에서 e_s_n_o 추출 (캐시 갱신)
    extractEsno(html);

    // 댓글 수: POST API 사용 (가벼움)
    let commentCount = 0;
    if (cachedEsno) {
      await randomDelay();
      commentCount = await fetchCommentCount(postNo);
    }

    // 제목 추출
    let title = `#${postNo}`;
    const titleMatch = html.match(/<span[^>]*class="title_subject"[^>]*>([\s\S]*?)<\/span>/i);
    if (titleMatch) title = titleMatch[1].replace(/<[^>]+>/g, '').trim();

    watchedPosts[noStr] = { title, commentCount, addedAt: Date.now() };
    saveWatchedPosts();
    log(`[GALLERY] 감시 추가: #${postNo} "${title}" (댓글 ${commentCount})`);
    return watchedPosts[noStr];
  } catch (e: any) {
    log(`[GALLERY] 감시 추가 실패 #${postNo}: ${e.message}`);
    // 최소 정보로 추가
    watchedPosts[noStr] = { title: `#${postNo}`, commentCount: -1, addedAt: Date.now() };
    saveWatchedPosts();
    return watchedPosts[noStr];
  }
}

/** 글 감시 제거 */
export function removeWatch(postNo: number): void {
  delete watchedPosts[String(postNo)];
  saveWatchedPosts();
  log(`[GALLERY] 감시 제거: #${postNo}`);
}

/** 감시 목록 조회 */
export function getWatchedPosts(): Record<string, WatchedPost> {
  return { ...watchedPosts };
}

function saveWatchedPosts(): void {
  config.save({ galleryWatched: { ...watchedPosts } } as any);
  // 갤러리 창이 열려있다면 즉시 화면 갱신 명령 전송
  if (galleryWindowRef && !galleryWindowRef.isDestroyed()) {
    galleryWindowRef.webContents.send('gallery-watched-update', watchedPosts);
  }
}

function sendPostListToSidebar(posts: Post[]): void {
  if (galleryWindowRef && !galleryWindowRef.isDestroyed()) {
    galleryWindowRef.webContents.send('gallery-posts', posts);
  }
}

/** 사이드바에 새 활동(새 글/댓글) 알림 */
function sendNewActivity(type: 'post' | 'comment', count: number, postNo?: string): void {
  if (sidebarWindowRef && !sidebarWindowRef.isDestroyed()) {
    sidebarWindowRef.webContents.send('gallery-new-activity', { type, count, postNo });
  }
}

/** 즉시 체크 트리거 */
export async function forceCheck(): Promise<void> {
  await checkNewPosts();
  await checkWatchedComments();
}

/** 알림 on/off 설정 */
export function setNotifyEnabled(enabled: boolean): void {
  notifyEnabled = !!enabled;
  config.save({ galleryNotify: notifyEnabled } as any);

  if (notifyEnabled) {
    // ON 전환 시 현재 상태를 기준점으로 리셋 (쌓인 알림 방지)
    lastSeenPostNo = 0; // 다음 체크에서 최신글로 자동 설정됨 (초기화 로직)
    // 감시 글 댓글 수도 현재 기준으로 리셋 (-1로 설정하면 다음 체크에서 갱신만 하고 알림 안 보냄)
    for (const noStr of Object.keys(watchedPosts)) {
      watchedPosts[noStr].commentCount = -1;
    }
    saveWatchedPosts();
    log(`[GALLERY] 알림 ON - 기준점 리셋 (이전 알림 무시)`);
  } else {
    log(`[GALLERY] 알림 OFF`);
  }
}

export function getNotifyEnabled(): boolean {
  return notifyEnabled;
}
