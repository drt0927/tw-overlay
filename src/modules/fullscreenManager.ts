import { app } from 'electron';
import * as path from 'path';
import { log } from './logger';

let nativeAddon: any = null;
let _isActive = false;
let _scalingHwnd: string | null = null;
let _upscaleMode: string = 'passthrough';

function loadAddon(): any {
  if (nativeAddon) return nativeAddon;
  try {
    const addonPath = app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar.unpacked', 'native', 'build', 'Release', 'tw_native.node')
      : path.join(__dirname, '..', '..', 'native', 'build', 'Release', 'tw_native.node');
    nativeAddon = require(addonPath);
    log('[FULLSCREEN] Native addon loaded');
  } catch (e) {
    log(`[FULLSCREEN] Failed to load native addon: ${e}`);
    nativeAddon = null;
  }
  return nativeAddon;
}

export function isAddonAvailable(): boolean {
  return !!loadAddon();
}

export function isFullscreenActive(): boolean {
  return _isActive;
}

export function getScalingHwnd(): string | null {
  return _scalingHwnd;
}

export function startFullscreen(
  electronHwnd: string,
  gameHwnd: string,
  options: { captureMode?: string; upscaleMode?: string } = {}
): { success: boolean; captureMode?: string; hwnd?: string; error?: string } {
  const addon = loadAddon();
  if (!addon) return { success: false, error: 'Native addon not available' };
  if (_isActive) return { success: false, error: 'Already active' };

  try {
    // Native addon expects HWNDs as numbers (doubles ok for Windows HWND range)
    const result = addon.startFullscreen(parseInt(electronHwnd, 10), parseInt(gameHwnd, 10), options);
    if (result && result.success) {
      _isActive = true;
      _scalingHwnd = result.hwnd != null ? result.hwnd.toString() : null;
      _upscaleMode = options.upscaleMode ?? 'passthrough';
    }
    return result;
  } catch (e) {
    log(`[FULLSCREEN] startFullscreen error: ${e}`);
    return { success: false, error: String(e) };
  }
}

export function stopFullscreen(): void {
  const addon = loadAddon();
  try {
    if (addon && _isActive) addon.stopFullscreen();
  } catch (e) {
    log(`[FULLSCREEN] stopFullscreen error: ${e}`);
  } finally {
    _isActive = false;
    _scalingHwnd = null;
    _upscaleMode = 'passthrough';
  }
}

export function setOverlayActive(active: boolean): void {
  const addon = loadAddon();
  if (!addon || !_isActive) return;
  try {
    addon.setOverlayActive(active);
  } catch (e) {
    log(`[FULLSCREEN] setOverlayActive error: ${e}`);
  }
}

export function setUpscaleMode(mode: string): void {
  const addon = loadAddon();
  if (!addon || !_isActive) return;
  try {
    addon.setUpscaleMode(mode);
    _upscaleMode = mode;
  } catch (e) {
    log(`[FULLSCREEN] setUpscaleMode error: ${e}`);
  }
}

export function getStatus(): { fps: number; captureMode: string; frameTimeMs: number; isActive: boolean; upscaleMode: string } {
  const addon = loadAddon();
  if (!addon || !_isActive) return { fps: 0, captureMode: 'none', frameTimeMs: 0, isActive: false, upscaleMode: 'passthrough' };
  try {
    const s = addon.getStatus();
    // native 렌더 스레드가 스스로 종료한 경우 (캡처 백엔드 사망 등)를 isActive로 전달.
    // _isActive는 변경하지 않음 — stopFullscreen() 호출 경로가 제대로 setFullscreenMode(false)까지 처리하게 함.
    const isActive = s.running ?? false;
    return { fps: s.fps ?? 0, captureMode: s.captureMode ?? 'none', frameTimeMs: s.frameTimeMs ?? 0, isActive, upscaleMode: _upscaleMode };
  } catch (e) {
    return { fps: 0, captureMode: 'none', frameTimeMs: 0, isActive: false, upscaleMode: 'passthrough' };
  }
}
