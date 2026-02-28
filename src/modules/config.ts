/**
 * 설정 관리 모듈 - 로드/저장/디바운스 + 메모리 캐시
 */
import * as fs from 'fs';
import { get_CONFIG_PATH, DEFAULT_CONFIG, SAVE_DEBOUNCE_MS, AppConfig } from './constants';
import { log } from './logger';

let _saveTimer: NodeJS.Timeout | null = null;
let _pendingConfig: AppConfig | null = null;
/** 메모리 캐시: 디스크 I/O를 최소화하기 위해 로드된 설정을 캐싱 */
let _cachedConfig: AppConfig | null = null;

/** 설정 파일 로드 (메모리 캐시 우선, 없으면 디스크 읽기) */
export function load(): AppConfig {
  if (_cachedConfig) return { ..._cachedConfig };
  try {
    const configPath = get_CONFIG_PATH();
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Partial<AppConfig>;
      _cachedConfig = { ...DEFAULT_CONFIG, ...parsed };
      return { ..._cachedConfig };
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    log(`[CONFIG] 설정 로드 실패: ${msg}`);
  }
  _cachedConfig = { ...DEFAULT_CONFIG };
  return { ..._cachedConfig };
}

/** 디바운스 저장 - move/resize 등 빈번한 이벤트에 사용 */
export function save(newConfig: Partial<AppConfig>): void {
  try {
    if (!_pendingConfig) _pendingConfig = load();
    _pendingConfig = { ..._pendingConfig, ...newConfig };
    // 메모리 캐시도 즉시 업데이트 (디스크 쓰기 전에도 최신 상태 반영)
    _cachedConfig = { ..._pendingConfig };
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => {
      try {
        if (_pendingConfig) {
          fs.writeFileSync(get_CONFIG_PATH(), JSON.stringify(_pendingConfig, null, 2));
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        log(`[CONFIG] 디바운스 저장 실패: ${msg}`);
      }
      _pendingConfig = null;
      _saveTimer = null;
    }, SAVE_DEBOUNCE_MS);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    log(`[CONFIG] 저장 준비 실패: ${msg}`);
  }
}

/** 즉시 저장 - 앱 종료 시 사용 */
export function saveImmediate(newConfig: Partial<AppConfig> = {}): void {
  try {
    if (_saveTimer) clearTimeout(_saveTimer);
    const current = _pendingConfig || load();
    const merged = { ...current, ...newConfig };
    fs.writeFileSync(get_CONFIG_PATH(), JSON.stringify(merged, null, 2));
    _cachedConfig = merged;
    _pendingConfig = null;
    _saveTimer = null;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    log(`[CONFIG] 즉시 저장 실패: ${msg}`);
  }
}

/** 미저장 데이터 존재 여부 */
export function hasPending(): boolean {
  return _pendingConfig !== null;
}
