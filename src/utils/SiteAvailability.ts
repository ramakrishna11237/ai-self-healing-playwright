/**
 * SiteAvailability — Intelligent site health detection
 *
 * Checks site reachability once at startup and stores results.
 * Tests can call SiteAvailability.skipIfDown(url) to gracefully
 * skip instead of failing with a cryptic timeout error.
 *
 * End user sees:
 *   SKIPPED: "OrangeHRM demo site is currently unreachable (timeout after 8s).
 *             This test was skipped to avoid a false failure.
 *             Try again later or check https://opensource-demo.orangehrmlive.com"
 */

import * as http from 'http';
import * as https from 'https';
import { Logger } from './Logger';

export interface SiteStatus {
  url: string;
  reachable: boolean;
  responseMs: number;
  slow: boolean;         // reachable but > SLOW_THRESHOLD_MS
  error?: string;
  checkedAt: string;
}

const SLOW_THRESHOLD_MS = 5000;
const TIMEOUT_MS = 8000;

// In-memory store — populated once in globalSetup, read by tests
const statusStore = new Map<string, SiteStatus>();

export class SiteAvailability {

  // ── Check a single URL ──────────────────────────────────────────────────────

  static async check(url: string): Promise<SiteStatus> {
    const start = Date.now();
    let reachable = false;
    let responseMs = 0;
    let error: string | undefined;

    try {
      responseMs = await this.ping(url, TIMEOUT_MS);
      reachable = true;
    } catch (e) {
      error = String(e).replace('Error: ', '');
      responseMs = Date.now() - start;
    }

    const status: SiteStatus = {
      url,
      reachable,
      responseMs,
      slow: reachable && responseMs > SLOW_THRESHOLD_MS,
      error,
      checkedAt: new Date().toISOString(),
    };

    statusStore.set(url, status);

    if (!reachable) {
      Logger.warn(`SiteAvailability: "${url}" is unreachable — ${error}`);
    } else if (status.slow) {
      Logger.warn(`SiteAvailability: "${url}" is slow (${responseMs}ms) — tests may be flaky`);
    } else {
      Logger.info(`SiteAvailability: "${url}" is healthy (${responseMs}ms)`);
    }

    return status;
  }

  // ── Check multiple URLs in parallel ────────────────────────────────────────

  static async checkAll(urls: string[]): Promise<SiteStatus[]> {
    const dockerUrls: Record<string, string> = {
      'https://the-internet.herokuapp.com': 'http://localhost:7080',
      'https://parabank.parasoft.com': 'http://localhost:8090',
    };
    const resolvedUrls = urls.map(url => dockerUrls[url] ?? url);
    return Promise.all(resolvedUrls.map((url) => this.check(url)));
  }

  // ── Get stored status ───────────────────────────────────────────────────────

  static getStatus(url: string): SiteStatus | undefined {
    // Match by base URL (ignore path)
    for (const [key, status] of statusStore.entries()) {
      try {
        const stored = new URL(key).origin;
        const requested = new URL(url).origin;
        if (stored === requested) return status;
      } catch {
        if (key === url) return status;
      }
    }
    return undefined;
  }

  // ── skipIfDown — call this inside beforeEach using testInfo ──────────────────
  //
  // Usage in test:
  //   test.beforeEach(async ({}, testInfo) => {
  //     SiteAvailability.skipIfDown('https://opensource-demo.orangehrmlive.com', testInfo);
  //   });

  static skipIfDown(url: string, testInfo: { skip: () => void; annotations: { type: string; description?: string }[] }): void {
    const status = this.getStatus(url);

    if (!status) return;

    if (!status.reachable) {
      const reason =
        `"${new URL(url).hostname}" is currently unreachable (${status.error ?? 'timeout'}). ` +
        `This test was skipped to avoid a false failure. Try again later or check: ${url}`;
      testInfo.annotations.push({ type: 'skip', description: reason });
      testInfo.skip();
    }

    if (status.slow) {
      Logger.warn(
        `SiteAvailability: "${new URL(url).hostname}" is slow (${status.responseMs}ms) — test may be flaky`
      );
    }
  }

  // ── Plain English summary ───────────────────────────────────────────────────

  static summary(): string[] {
    const lines: string[] = [];
    for (const status of statusStore.values()) {
      const host = (() => { try { return new URL(status.url).hostname; } catch { return status.url; } })();
      if (!status.reachable) {
        lines.push(`  ⚠️  Site check   : "${host}" is DOWN — related tests will be skipped automatically`);
      } else if (status.slow) {
        lines.push(`  ⚠️  Site check   : "${host}" is SLOW (${status.responseMs}ms) — tests may take longer`);
      } else {
        lines.push(`  ✅ Site check   : "${host}" is healthy (${status.responseMs}ms)`);
      }
    }
    return lines;
  }

  // ── Internal ping ───────────────────────────────────────────────────────────

  private static ping(url: string, timeoutMs: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      let parsed: URL;
      try { parsed = new URL(url); } catch { return reject(new Error(`Invalid URL: ${url}`)); }
      const lib = parsed.protocol === 'https:' ? https : http;
      const req = lib.request(
        {
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
          path: '/',
          method: 'HEAD',
          timeout: timeoutMs,
        },
        (res) => { res.resume(); resolve(Date.now() - start); }
      );
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error(`timeout after ${timeoutMs}ms`)); });
      req.end();
    });
  }
}
