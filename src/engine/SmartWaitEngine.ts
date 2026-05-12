import { Page, Locator } from '@playwright/test';
import { Logger } from '../utils/Logger';
import { DEFAULT_CONFIG } from '../config';

/**
 * SmartWaitEngine — replaces all static waits with dynamic condition-based waits.
 *
 * Never use page.waitForTimeout() in tests — it's a fixed delay that makes
 * tests slow and flaky. Use these methods instead.
 */
export class SmartWaitEngine {
  /**
   * Wait for element to be visible.
   */
  static async waitForVisible(
    page: Page,
    locator: string,
    timeout = DEFAULT_CONFIG.waitTimeout
  ): Promise<boolean> {
    try {
      await page.locator(locator).first().waitFor({ state: 'visible', timeout });
      return true;
    } catch {
      Logger.debug(`SmartWait: timeout waiting for visible: "${locator}"`);
      return false;
    }
  }

  /**
   * Wait for element to be hidden or removed from DOM.
   */
  static async waitForHidden(
    page: Page,
    locator: string,
    timeout = DEFAULT_CONFIG.waitTimeout
  ): Promise<boolean> {
    try {
      await page.locator(locator).first().waitFor({ state: 'hidden', timeout });
      return true;
    } catch {
      Logger.debug(`SmartWait: timeout waiting for hidden: "${locator}"`);
      return false;
    }
  }

  /**
   * Wait for element to stop moving (animation/transition complete).
   * Checks bounding box twice — if position unchanged, element is stable.
   */
  static async waitForStable(el: Locator, stabilityMs = 300, maxWaitMs = 3000): Promise<void> {
    const start = Date.now();
    let prevBox = await el.boundingBox().catch(() => null);

    while (Date.now() - start < maxWaitMs) {
      await new Promise((r) => setTimeout(r, stabilityMs));
      const currBox = await el.boundingBox().catch(() => null);

      if (!prevBox || !currBox) break;

      const moved =
        Math.abs(currBox.x - prevBox.x) > 1 ||
        Math.abs(currBox.y - prevBox.y) > 1 ||
        Math.abs(currBox.width - prevBox.width) > 1 ||
        Math.abs(currBox.height - prevBox.height) > 1;

      if (!moved) {
        Logger.debug(`SmartWait: element stable after ${Date.now() - start}ms`);
        return;
      }
      prevBox = currBox;
    }
  }

  /**
   * Wait for network to be idle — no pending XHR/fetch for 500ms.
   * Falls back to domcontentloaded for apps with WebSockets/polling.
   */
  static async waitForNetworkIdle(page: Page, timeout = 5000): Promise<void> {
    try {
      await page.waitForLoadState('networkidle', { timeout });
      Logger.debug('SmartWait: network idle');
    } catch {
      Logger.debug('SmartWait: networkidle timeout — falling back to domcontentloaded');
      try {
        await page.waitForLoadState('domcontentloaded', { timeout: 3000 });
      } catch {
        /* already loaded */
      }
    }
  }

  /**
   * Wait for a specific text to appear anywhere on the page.
   */
  static async waitForText(
    page: Page,
    text: string,
    timeout = DEFAULT_CONFIG.waitTimeout
  ): Promise<boolean> {
    try {
      await page.getByText(text).first().waitFor({ state: 'visible', timeout });
      Logger.debug(`SmartWait: text visible: "${text}"`);
      return true;
    } catch {
      Logger.debug(`SmartWait: timeout waiting for text: "${text}"`);
      return false;
    }
  }

  /**
   * Wait for URL to contain a pattern.
   */
  static async waitForUrl(
    page: Page,
    pattern: string | RegExp,
    timeout = DEFAULT_CONFIG.waitTimeout
  ): Promise<boolean> {
    try {
      await page.waitForURL(pattern, { timeout });
      return true;
    } catch {
      Logger.debug(`SmartWait: timeout waiting for URL: "${pattern}"`);
      return false;
    }
  }

  /**
   * Wait for a loading spinner to disappear.
   * Common spinner selectors tried automatically if none provided.
   */
  static async waitForSpinnerGone(
    page: Page,
    spinnerLocator?: string,
    timeout = DEFAULT_CONFIG.waitTimeout
  ): Promise<void> {
    const selectors = spinnerLocator
      ? [spinnerLocator]
      : [
          '.loading',
          '.spinner',
          '[data-loading]',
          "[aria-busy='true']",
          '.loader',
          '#loading',
          '.progress',
          "[role='progressbar']",
        ];

    for (const sel of selectors) {
      try {
        const count = await page.locator(sel).count();
        if (count > 0) {
          await page.locator(sel).first().waitFor({ state: 'hidden', timeout });
          Logger.debug(`SmartWait: spinner gone: "${sel}"`);
          return;
        }
      } catch {
        /* spinner not found or already gone */
      }
    }
  }

  /**
   * Wait for element count to reach expected value.
   */
  static async waitForCount(
    page: Page,
    locator: string,
    expectedCount: number,
    timeout = DEFAULT_CONFIG.waitTimeout
  ): Promise<boolean> {
    // CWE-95: replaced page.waitForFunction with polling using native locator.count()
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        if ((await page.locator(locator).count()) === expectedCount) return true;
      } catch {
        /* not yet available */
      }
      await page.waitForTimeout(200);
    }
    Logger.debug(`SmartWait: timeout waiting for count ${expectedCount}: "${locator}"`);
    return false;
  }

  /**
   * Wait for an element's attribute to have a specific value.
   */
  static async waitForAttribute(
    page: Page,
    locator: string,
    attribute: string,
    value: string,
    timeout = DEFAULT_CONFIG.waitTimeout
  ): Promise<boolean> {
    // CWE-95: replaced page.waitForFunction with polling using native getAttribute()
    // attribute validated: only safe CSS attribute name characters allowed
    if (!/^[a-zA-Z][a-zA-Z0-9_:-]*$/.test(attribute)) {
      Logger.warn(`SmartWait.waitForAttribute: invalid attribute name "${attribute}"`);
      return false;
    }
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const actual = await page.locator(locator).first().getAttribute(attribute);
        if (actual === value) return true;
      } catch {
        /* not yet available */
      }
      await page.waitForTimeout(200);
    }
    return false;
  }

  /**
   * Wait for page to be fully interactive after navigation.
   * Combines DOM ready + spinner gone + no pending requests.
   */
  static async waitForPageReady(
    page: Page,
    spinnerLocator?: string,
    timeout = DEFAULT_CONFIG.waitTimeout
  ): Promise<void> {
    // DOM ready
    try {
      await page.waitForLoadState('domcontentloaded', { timeout: Math.min(timeout, 3000) });
    } catch {
      /* already loaded */
    }

    // Spinner gone
    await this.waitForSpinnerGone(page, spinnerLocator, Math.min(timeout, 5000));

    // JS execution complete
    try {
      await page.waitForLoadState('load', { timeout: 2000 });
    } catch {
      /* non-critical */
    }

    Logger.debug('SmartWait: page ready');
  }

  /**
   * Wait for a custom JS condition to be truthy.
   */
  static async waitForCondition(
    page: Page,
    condition: string,
    timeout = DEFAULT_CONFIG.waitTimeout
  ): Promise<boolean> {
    // CWE-95: arbitrary condition strings blocked — only named load states accepted
    const SAFE: Record<string, () => Promise<void>> = {
      load: () => page.waitForLoadState('load', { timeout }),
      domcontentloaded: () => page.waitForLoadState('domcontentloaded', { timeout }),
      networkidle: () => page.waitForLoadState('networkidle', { timeout }),
    };
    const fn = SAFE[condition.trim()];
    if (!fn) {
      Logger.warn(
        `SmartWait.waitForCondition: "${condition.slice(0, 60)}" not in allowlist — blocked (CWE-95)`
      );
      return false;
    }
    try {
      await fn();
      return true;
    } catch {
      Logger.debug(`SmartWait: condition timeout: "${condition.slice(0, 60)}"`);
      return false;
    }
  }
}
