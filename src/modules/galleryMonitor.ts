/**
 * DC인사이드 갤러리 모니터 모듈
 * - 1페이지 새 글 감지 → 알림
 * - 등록된 글번호 댓글 변화 감지 → 알림 (POST API 사용)
 * - 블락 방지: 랜덤 딜레이, 요청 간격 제한, 쿨다운
 */
import * as https from 'https';
import { Notification, BrowserWindow, shell } from 'electron';
import { log } from './logger';
import * as config from './config';
import { WatchedPost } from './constants';

interface Post {
  no: number;
  title: string;
  replyCount: number;
  writer: string;
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
  const trRegex = /<tr[^>]*class="ub-content[^"]*"[^>]*data-no="(\d+)"[^>]*>([\s\S]*?)<\/tr>/gi;
  let match;
  while ((match = trRegex.exec(html)) !== null) {
    const no = parseInt(match[1], 10);
    const trContent = match[2];
    if (isNaN(no) || no <= 0) continue;

    const trTag = match[0];
    if (/data-type="icon_notice"/i.test(trTag)) continue;
    if (/data-type="icon_survey"/i.test(trTag)) continue;
    if (/icon_ad|광고/i.test(trContent)) continue;

    let title = '';
    const titleMatch = trContent.match(/<td[^>]*class="gall_tit[^"]*"[^>]*>[\s\S]*?<a[^>]*href="[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    if (titleMatch) {
      title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
    }

    let replyCount = 0;
    const replyMatch = trContent.match(/reply_num[^>]*>\[?(\d+)\]?/i);
    if (replyMatch) replyCount = parseInt(replyMatch[1], 10);

    let writer = '';
    const writerMatch = trContent.match(/data-nick="([^"]*)"/i);
    if (writerMatch) writer = writerMatch[1];

    if (title) {
      posts.push({ no, title, replyCount, writer });
    }
  }
  return posts;
}

/** 목록 HTML에서 e_s_n_o 토큰 추출 */
function extractEsno(html: string): string {
  const match = html.match(/name="e_s_n_o"\s+value="([^"]+)"/i)
    || html.match(/id="e_s_n_o"[^>]*value="([^"]+)"/i);
  if (match) {
    cachedEsno = match[1];
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
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }
          const json = JSON.parse(data);
          const count = json.total_cnt != null ? parseInt(json.total_cnt, 10) : 0;
          resolve(count);
        } catch (e: any) {
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
        shell.openExternal(VIEW_URL(postNo));
      }
    });
    noti.show();
  } catch (e: any) {
    log(`[GALLERY] 알림 실패: ${e.message}`);
  }
}

// ─── 새 글 체크 ───
async function checkNewPosts(): Promise<boolean> {
  try {
    const html = await fetchPage(LIST_URL);
    extractEsno(html);
    const posts = parsePostList(html);
    if (posts.length === 0) return true;

    const latestNo = Math.max(...posts.map(p => p.no));

    if (lastSeenPostNo === 0) {
      lastSeenPostNo = latestNo;
      config.save({ galleryLastSeen: latestNo } as any);
      return true;
    }

    const newPosts = posts.filter(p => p.no > lastSeenPostNo);
    if (newPosts.length > 0) {
      sendNewActivity('post', newPosts.length);

      let toNotify = newPosts;
      if (galleryKeywords && galleryKeywords.length > 0) {
        const pattern = galleryKeywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
        const regex = new RegExp(pattern, 'i');
        toNotify = newPosts.filter(p => regex.test(p.title));
      }

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

    sendPostListToSidebar(posts);
    return true;
  } catch (e: any) {
    log(`[GALLERY] 목록 체크 실패: ${e.message}`);
    return false;
  }
}

// ─── 댓글 변화 체크 (POST API + 블락 방지) ───
async function checkWatchedComments(): Promise<void> {
  const watchNos = Object.keys(watchedPosts);
  if (watchNos.length === 0) return;

  if (!cachedEsno) return;

  const toCheck = watchNos.slice(0, RATE_LIMIT.MAX_COMMENT_CHECKS);

  for (const noStr of toCheck) {
    try {
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

  if (!notifyEnabled) {
    checkTimer = setTimeout(doCheck, CHECK_INTERVAL_MS);
    return;
  }

  const backoff = getBackoffMs();
  if (backoff > 0) {
    consecutiveErrors = Math.max(0, consecutiveErrors - 1);
    checkTimer = setTimeout(doCheck, backoff);
    return;
  }

  const listSuccess = await checkNewPosts();

  if (listSuccess) {
    await randomDelay();
    await checkWatchedComments();
    if (consecutiveErrors > 0) {
      if (galleryWindowRef && !galleryWindowRef.isDestroyed()) {
        galleryWindowRef.webContents.send('gallery-connection-status', true);
      }
    }
    consecutiveErrors = 0;
  } else {
    consecutiveErrors++;
    log(`[GALLERY Error] 목록 체크 실패 (연속 ${consecutiveErrors}회)`);
    if (galleryWindowRef && !galleryWindowRef.isDestroyed()) {
      galleryWindowRef.webContents.send('gallery-connection-status', false);
    }
  }

  checkTimer = setTimeout(doCheck, CHECK_INTERVAL_MS);
}

// ─── 공개 API ───

export function start(overlayWin: BrowserWindow | null, sidebarWin: BrowserWindow): void {
  mainWindowRef = overlayWin;
  sidebarWindowRef = sidebarWin;

  const cfg = config.load();
  lastSeenPostNo = cfg.galleryLastSeen || 0;
  watchedPosts = cfg.galleryWatched || {};
  notifyEnabled = cfg.galleryNotify !== false;
  galleryKeywords = cfg.galleryKeywords || [];

  isRunning = true;
  doCheck();
}

export function stop(): void {
  isRunning = false;
  if (checkTimer) { clearTimeout(checkTimer); checkTimer = null; }
}

export function updateWindows(overlayWin: BrowserWindow | null, sidebarWin: BrowserWindow | null, galleryWin: BrowserWindow | null = null): void {
  if (overlayWin) mainWindowRef = overlayWin;
  if (sidebarWin) sidebarWindowRef = sidebarWin;
  if (galleryWin) galleryWindowRef = galleryWin;

  const cfg = config.load();
  galleryKeywords = cfg.galleryKeywords || [];
}

/** 글 감시 추가 */
export async function addWatch(postNo: number): Promise<WatchedPost> {
  const noStr = String(postNo);
  if (watchedPosts[noStr]) return watchedPosts[noStr];

  try {
    const html = await fetchPage(VIEW_URL(postNo));
    extractEsno(html);

    let commentCount = 0;
    if (cachedEsno) {
      await randomDelay();
      commentCount = await fetchCommentCount(postNo);
    }

    let title = `#${postNo}`;
    const titleMatch = html.match(/<span[^>]*class="title_subject"[^>]*>([\s\S]*?)<\/span>/i);
    if (titleMatch) title = titleMatch[1].replace(/<[^>]+>/g, '').trim();

    watchedPosts[noStr] = { title, commentCount, addedAt: Date.now() };
    saveWatchedPosts();
    return watchedPosts[noStr];
  } catch (e: any) {
    log(`[GALLERY] 감시 추가 실패 #${postNo}: ${e.message}`);
    watchedPosts[noStr] = { title: `#${postNo}`, commentCount: -1, addedAt: Date.now() };
    saveWatchedPosts();
    return watchedPosts[noStr];
  }
}

/** 글 감시 제거 */
export function removeWatch(postNo: number): void {
  delete watchedPosts[String(postNo)];
  saveWatchedPosts();
}

/** 감시 목록 조회 */
export function getWatchedPosts(): Record<string, WatchedPost> {
  return { ...watchedPosts };
}

function saveWatchedPosts(): void {
  config.save({ galleryWatched: { ...watchedPosts } } as any);
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
    lastSeenPostNo = 0;
    for (const noStr of Object.keys(watchedPosts)) {
      watchedPosts[noStr].commentCount = -1;
    }
    saveWatchedPosts();
  }
}

export function getNotifyEnabled(): boolean {
  return notifyEnabled;
}
