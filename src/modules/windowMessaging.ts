/**
 * BrowserWindow 검색과 렌더러 IPC 전송을 한곳에서 처리한다.
 * 페이지별 첫 창 전송/전체 창 전송/앱 전체 브로드캐스트를 구분해
 * 기존 각 호출부의 전송 범위를 그대로 유지한다.
 */
import { BrowserWindow, WebContents } from 'electron';

function isPageWindow(window: BrowserWindow, pageName: string): boolean {
  if (window.isDestroyed()) return false;
  try {
    return window.webContents.getURL().includes(pageName);
  } catch {
    return false;
  }
}

export function findFirstWindowByPage(pageName: string): BrowserWindow | undefined {
  return BrowserWindow.getAllWindows().find(window => isPageWindow(window, pageName));
}

export function sendToFirstWindowByPage(
  pageName: string,
  channel: string,
  ...args: unknown[]
): boolean {
  const target = findFirstWindowByPage(pageName);
  if (!target) return false;
  target.webContents.send(channel, ...args);
  return true;
}

export function sendToAllWindowsByPage(
  pageName: string,
  channel: string,
  ...args: unknown[]
): number {
  let sentCount = 0;
  BrowserWindow.getAllWindows().forEach(window => {
    if (!isPageWindow(window, pageName)) return;
    window.webContents.send(channel, ...args);
    sentCount++;
  });
  return sentCount;
}

export function broadcastToAllWindows(channel: string, ...args: unknown[]): number {
  let sentCount = 0;
  BrowserWindow.getAllWindows().forEach(window => {
    if (window.isDestroyed()) return;
    window.webContents.send(channel, ...args);
    sentCount++;
  });
  return sentCount;
}

export function broadcastToAllWindowsExcept(
  excludedWebContents: WebContents,
  channel: string,
  ...args: unknown[]
): number {
  let sentCount = 0;
  BrowserWindow.getAllWindows().forEach(window => {
    if (window.isDestroyed() || window.webContents === excludedWebContents) return;
    window.webContents.send(channel, ...args);
    sentCount++;
  });
  return sentCount;
}
