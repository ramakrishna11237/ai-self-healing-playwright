/**
 * NavigationGuard — Layer 0
 *
 * Wraps every page.goto() with smart resilience:
 *   1. Retry on timeout with exponential backoff
 *   2. Detect blank/error pages and reload automatically
 *   3. Detect login redirect and re-authenticate automatically
 *   4. Detect network errors and wait + retry
 *
 * End user sees:
 *   🔄 Layer 0: Navigation to "https://..." timed out — retrying (1/3)
 *   🔄 Layer 0: Blank page detected — reloading
 *   🔄 Layer 0: Login redirect detected — re-authenticating automatically
 *   ✅ Layer 0: Navigation recovered after 2 retries
 */

import { Page } from '@playwright/test';
import { Logger } from './Logger';

export interface NavigationOptions {
  timeout?: number;
  retries?: number;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
}

// Pages that indicate a login wall
const LOGIN_INDICATORS = [
  '/login',
  '/auth',
  '/signin',
  '/sign-in',
  'login.jsp',
  'auth/login',
];

// Pages that indicate an error
const ERROR_INDICATORS = [
  'about:blank',
  'chrome-error://',
  'net::ERR_',
];

// Stored credentials for auto re-auth
interface StoredCredentials {
  url: string;
  username: string;
  password: string;
  usernameSelector: string;
  passwordSelector: string;
  submitSelector: string;
  successIndicator: string;
}

const credentialStore: StoredCredentials[] = [];

export class NavigationGuard {

  // ── Register credentials for auto re-auth ──────────────────────────────────
  // Call this once in your page object constructor or beforeAll
  static registerCredentials(creds: StoredCredentials): void {
    const existing = credentialStore.findIndex(c => c.url === creds.url);
    if (existing >= 0) {
      credentialStore[existing] = creds;
    } else {
      credentialStore.push(creds);
    }
    Logger.debug(`NavigationGuard: credentials registered for "${new URL(creds.url).hostname}"`);
  }

  // ── Main navigate with full resilience ─────────────────────────────────────

  static async navigate(
    page: Page,
    url: string,
    options: NavigationOptions = {}
  ): Promise<boolean> {
    const retries = options.retries ?? 3;
    const timeout = options.timeout ?? 60000;
    const waitUntil = options.waitUntil ?? 'domcontentloaded';

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        // ── Attempt navigation ──────────────────────────────────────────────
        await page.goto(url, { waitUntil, timeout });

        // ── Check for blank/error page ──────────────────────────────────────
        const currentUrl = page.url();
        const isError = ERROR_INDICATORS.some(e => currentUrl.includes(e));
        if (isError) {
          Logger.warn(`Layer 0: error page detected ("${currentUrl}") — reloading (attempt ${attempt}/${retries})`);
          await page.waitForTimeout(1000 * attempt);
          await page.reload({ waitUntil, timeout });
          continue;
        }

        // ── Check for blank page ────────────────────────────────────────────
        const content = await page.content().catch(() => '');
        const isBlank = content.length < 200 || content === '<html><head></head><body></body></html>';
        if (isBlank) {
          Logger.warn(`Layer 0: blank page detected — reloading (attempt ${attempt}/${retries})`);
          await page.waitForTimeout(1000 * attempt);
          await page.reload({ waitUntil, timeout });
          continue;
        }

        // ── Check for login redirect ────────────────────────────────────────
        const redirectedToLogin = LOGIN_INDICATORS.some(l => currentUrl.toLowerCase().includes(l));
        const wasGoingToLogin = LOGIN_INDICATORS.some(l => url.toLowerCase().includes(l));

        if (redirectedToLogin && !wasGoingToLogin) {
          Logger.warn(`Layer 0: login redirect detected — attempting auto re-authentication`);
          const reauthed = await this.reAuthenticate(page, url);
          if (reauthed) {
            Logger.success(`Layer 0: re-authentication successful — navigating to original URL`);
            await page.goto(url, { waitUntil, timeout });
            return true;
          }
          Logger.warn(`Layer 0: re-authentication failed — no credentials registered for this site`);
        }

        // ── Success ─────────────────────────────────────────────────────────
        if (attempt > 1) {
          Logger.success(`Layer 0: navigation recovered after ${attempt - 1} retry(s) — "${url}"`);
        }
        return true;

      } catch (e) {
        const msg = String(e);
        const isTimeout = msg.includes('Timeout') || msg.includes('timeout');
        const isNetwork = msg.includes('net::ERR') || msg.includes('ECONNREFUSED');

        if (attempt < retries) {
          const waitMs = 2000 * attempt;
          if (isTimeout) {
            Logger.warn(`Layer 0: navigation timeout for "${url}" — retrying in ${waitMs}ms (${attempt}/${retries})`);
          } else if (isNetwork) {
            Logger.warn(`Layer 0: network error for "${url}" — retrying in ${waitMs}ms (${attempt}/${retries})`);
          } else {
            Logger.warn(`Layer 0: navigation failed for "${url}" — retrying in ${waitMs}ms (${attempt}/${retries})`);
          }
          await page.waitForTimeout(waitMs);
        } else {
          Logger.error(`Layer 0: navigation failed after ${retries} attempts for "${url}" — ${msg.slice(0, 120)}`);
          return false;
        }
      }
    }

    return false;
  }

  // ── Auto re-authentication ──────────────────────────────────────────────────

  private static async reAuthenticate(page: Page, originalUrl: string): Promise<boolean> {
    // Find matching credentials by origin
    let creds: StoredCredentials | undefined;
    try {
      const origin = new URL(originalUrl).origin;
      creds = credentialStore.find(c => c.url.startsWith(origin) || origin.startsWith(new URL(c.url).origin));
    } catch {
      return false;
    }

    if (!creds) return false;

    try {
      await page.locator(creds.usernameSelector).fill(creds.username);
      await page.locator(creds.passwordSelector).fill(creds.password);
      await page.locator(creds.submitSelector).click();
      await page.waitForSelector(creds.successIndicator, { timeout: 15000 });
      return true;
    } catch (e) {
      Logger.warn(`Layer 0: re-auth attempt failed — ${String(e).slice(0, 80)}`);
      return false;
    }
  }

  // ── Check if current page is healthy ───────────────────────────────────────

  static async isPageHealthy(page: Page): Promise<boolean> {
    try {
      const url = page.url();
      if (ERROR_INDICATORS.some(e => url.includes(e))) return false;
      const content = await page.content();
      if (content.length < 200) return false;
      return true;
    } catch {
      return false;
    }
  }
}
