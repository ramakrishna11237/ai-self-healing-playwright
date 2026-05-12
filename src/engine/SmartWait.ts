import { Page } from '@playwright/test';
import { Logger } from '../utils/Logger';
import { DEFAULT_CONFIG } from '../config';
import { resolveLocatorToPlaywright } from './ActionRouter';

export async function waitForElement(
  page: Page,
  locator: string,
  timeout?: number,
  scope?: string
): Promise<boolean> {
  const ms = timeout ?? DEFAULT_CONFIG.waitTimeout;
  try {
    let el = resolveLocatorToPlaywright(page, locator);
    if (scope && el) el = page.locator(scope).locator(el);
    if (!el) return false;
    // Single waitFor call — Playwright internally polls visibility, no need for count() first
    await el.first().waitFor({ state: 'visible', timeout: ms });
    return true;
  } catch {
    Logger.debug(`waitForElement timeout for "${locator}"`);
    return false;
  }
}

/**
 * Wait for the page to be stable after a navigation or form submission.
 *
 * Strategy (in order):
 * 1. Wait for DOM content to be loaded
 * 2. Wait for no pending fetch/XHR requests (networkidle)
 * 3. Wait for any loading spinners to disappear
 *
 * This eliminates the most common cause of flaky tests:
 * the next step running before the app has finished responding.
 *
 * @param page           Playwright page
 * @param spinnerLocator Optional CSS locator for a loading spinner to wait for disappearance
 * @param timeout        Max wait time in ms
 */
export async function waitForPageStable(
  page: Page,
  spinnerLocator?: string,
  timeout = DEFAULT_CONFIG.waitTimeout,
  networkCheck = false // opt-in only — networkidle hangs on WebSocket/polling apps
): Promise<void> {
  // Step 1: DOM ready — fast, always safe
  try {
    await page.waitForLoadState('domcontentloaded', { timeout: Math.min(timeout, 3000) });
  } catch {
    /* already loaded */
  }

  // Step 2: networkidle — opt-in only, skipped by default
  // Apps with WebSockets, polling, or analytics beacons never reach networkidle
  if (networkCheck) {
    try {
      await page.waitForLoadState('networkidle', { timeout: Math.min(timeout, 5000) });
    } catch {
      Logger.debug('waitForPageStable: networkidle timeout — skipping');
    }
  }

  // Step 3: spinner gone
  if (spinnerLocator) {
    try {
      const spinner = page.locator(spinnerLocator);
      await spinner
        .first()
        .waitFor({ state: 'hidden', timeout })
        .catch(() => {});
      Logger.debug(`waitForPageStable: spinner gone "${spinnerLocator}"`);
    } catch {
      Logger.debug(`waitForPageStable: spinner wait timeout "${spinnerLocator}"`);
    }
  }
}

/**
 * Wait for a URL change — confirms navigation completed.
 * More reliable than waitForLoadState after clicks that trigger navigation.
 */
export async function waitForUrlChange(
  page: Page,
  previousUrl: string,
  timeout = DEFAULT_CONFIG.waitTimeout
): Promise<boolean> {
  // CWE-95: replaced page.waitForFunction with Playwright native waitForURL predicate
  try {
    await page.waitForURL((url) => url.href !== previousUrl, { timeout });
    Logger.debug(`URL changed from: ${previousUrl} → ${page.url()}`);
    return true;
  } catch {
    Logger.debug(`URL did not change from: ${previousUrl}`);
    return false;
  }
}

/**
 * Wait for an element count to change — useful after adding/removing items.
 */
export async function waitForCountChange(
  page: Page,
  locator: string,
  previousCount: number,
  timeout = DEFAULT_CONFIG.waitTimeout
): Promise<boolean> {
  // CWE-95: replaced page.waitForFunction with polling using native locator.count()
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      if ((await page.locator(locator).count()) !== previousCount) return true;
    } catch {
      /* not yet available */
    }
    await page.waitForTimeout(200);
  }
  return false;
}
