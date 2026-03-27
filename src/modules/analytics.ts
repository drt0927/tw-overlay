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
  private sessionId: number = 0;
  private sessionNumber: number = 1;


  constructor() {
    // 1. Client ID persistence
    let savedClientId = (store as any).get('ga_client_id') as string | undefined;
    if (!savedClientId) {
      savedClientId = crypto.randomUUID();
      (store as any).set('ga_client_id', savedClientId);
    }
    this.clientId = savedClientId;

    // 2. Session ID & Number (Start new session on every restart)
    const now = Date.now();
    let savedSessionNumber = (store as any).get('ga_session_number') as number | undefined;

    this.sessionId = Math.floor(now / 1000);
    this.sessionNumber = (savedSessionNumber || 0) + 1;
      
    (store as any).set('ga_session_id', this.sessionId);
    (store as any).set('ga_session_number', this.sessionNumber);
    (store as any).set('ga_last_active_time', now);

    console.log(`[Analytics] ClientID: ${this.clientId}, SessionID: ${this.sessionId}, Session#: ${this.sessionNumber}`);
  }

  public trackEvent(eventName: string, params: Record<string, any> = {}): void {
    if (!MEASUREMENT_ID || !API_SECRET || MEASUREMENT_ID === 'G-XXXXXXXXXX' || API_SECRET === 'XXXXXXXXXXXXXXXXXXX') {
      console.warn('[Analytics] GA4 키가 설정되지 않아 이벤트 전송을 건너뜁니다.');
      return;
    }

    if (!net.isOnline()) return;

    const payload = {
      client_id: this.clientId,
      events: [
        {
          name: eventName,
          params: {
            app_version: app.getVersion(),
            ga_session_id: this.sessionId,
            ga_session_number: this.sessionNumber,
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
}

export const analytics = new Analytics();
