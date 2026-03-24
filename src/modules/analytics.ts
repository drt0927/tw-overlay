import { net, app } from 'electron';
import Store from 'electron-store';
import * as crypto from 'crypto';

import * as fs from 'fs';
import * as path from 'path';

// ========== GA4 SETTINGS ==========
let MEASUREMENT_ID = '';
let API_SECRET = '';

try {
  const envPath = path.join(__dirname, '..', 'env.json');
  if (fs.existsSync(envPath)) {
    const envData = JSON.parse(fs.readFileSync(envPath, 'utf-8'));
    MEASUREMENT_ID = envData.MEASUREMENT_ID || '';
    API_SECRET = envData.API_SECRET || '';
  }
} catch (e) {
  console.warn('[Analytics] Failed to parse env.json');
}
// ==================================

const store = new Store();

export class Analytics {
  private clientId: string;
  private sessionId: string;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor() {
    let savedId = (store as any).get('ga_client_id') as string | undefined;
    if (!savedId) {
      savedId = crypto.randomUUID();
      (store as any).set('ga_client_id', savedId);
    }
    this.clientId = savedId;
    this.sessionId = Date.now().toString();
  }

  public trackEvent(eventName: string, params: Record<string, any> = {}): void {
    if (!MEASUREMENT_ID || !API_SECRET || MEASUREMENT_ID === 'G-XXXXXXXXXX' || API_SECRET === 'XXXXXXXXXXXXXXXXXXX') {
      console.warn('[Analytics] GA4 키가 설정되지 않아 이벤트 전송을 건너뜁니다.');
      return;
    }

    if (!net.isOnline()) {
      console.warn(`[Analytics] 네트워크가 오프라인 상태입니다. '${eventName}' 전송을 건너뜁니다.`);
      return;
    }

    const payload = {
      client_id: this.clientId,
      events: [
        {
          name: eventName,
          params: {
            app_version: app.getVersion(),
            session_id: this.sessionId,
            engagement_time_msec: 1,
            ...params,
          },
        },
      ],
    };

    try {
      const request = net.request({
        method: 'POST',
        url: `https://www.google-analytics.com/mp/collect?measurement_id=${MEASUREMENT_ID}&api_secret=${API_SECRET}`,
      });

      request.on('response', (response) => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          console.log(`[Analytics] Event '${eventName}' sent successfully.`);
        } else {
          console.error(`[Analytics] Failed to send event '${eventName}': Status ${response.statusCode}`);
        }
      });

      request.on('error', (err) => {
        console.error(`[Analytics] Request error:`, err);
      });

      request.setHeader('Content-Type', 'application/json');
      request.write(JSON.stringify(payload));
      request.end();
    } catch (error) {
      console.error('[Analytics] Error sending event:', error);
    }
  }

  public startHeartbeat(intervalMs: number = 3600000): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      this.trackEvent('app_running_ping');
    }, intervalMs);
    console.log(`[Analytics] Heartbeat timer started (${intervalMs}ms)`);
  }

  public stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      console.log('[Analytics] Heartbeat timer stopped');
    }
  }
}

export const analytics = new Analytics();
