/**
 * 설정 관리 모듈 - 로드/저장/디바운스
 */
import * as fs from 'fs';
import { get_CONFIG_PATH, DEFAULT_CONFIG, SAVE_DEBOUNCE_MS, AppConfig } from './constants';

let _saveTimer: NodeJS.Timeout | null = null;
let _pendingConfig: AppConfig | null = null;

/** 설정 파일 로드 (없으면 기본값 반환) */
export function load(): AppConfig {
  try {
    const configPath = get_CONFIG_PATH();
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch (_) {}
  return { ...DEFAULT_CONFIG };
}

/** 디바운스 저장 - move/resize 등 빈번한 이벤트에 사용 */
export function save(newConfig: Partial<AppConfig>): void {
  try {
    if (!_pendingConfig) _pendingConfig = load();
    _pendingConfig = { ..._pendingConfig, ...newConfig };
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => {
      try {
        if (_pendingConfig) {
          fs.writeFileSync(get_CONFIG_PATH(), JSON.stringify(_pendingConfig, null, 2));
        }
      } catch (_) {}
      _pendingConfig = null;
      _saveTimer = null;
    }, SAVE_DEBOUNCE_MS);
  } catch (_) {}
}

/** 즉시 저장 - 앱 종료 시 사용 */
export function saveImmediate(newConfig: Partial<AppConfig> = {}): void {
  try {
    if (_saveTimer) clearTimeout(_saveTimer);
    const current = _pendingConfig || load();
    fs.writeFileSync(get_CONFIG_PATH(), JSON.stringify({ ...current, ...newConfig }, null, 2));
    _pendingConfig = null;
    _saveTimer = null;
  } catch (_) {}
}

/** 미저장 데이터 존재 여부 */
export function hasPending(): boolean {
  return _pendingConfig !== null;
}
