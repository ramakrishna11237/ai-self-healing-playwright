import { Page, Locator } from '@playwright/test';
import { Logger } from '../utils/Logger';
import { SmartLocatorEngine, SmartLocatorOptions } from './SmartLocatorEngine';
import { SmartWaitEngine } from './SmartWaitEngine';
import { FrameHandler } from './FrameHandler';
import { DEFAULT_CONFIG } from '../config';

export interface SmartActionOptions extends SmartLocatorOptions {
  retries?: number;
  highlight?: boolean; // visually highlight element before action
  scrollIntoView?: boolean; // scroll element into view before action
  stabilityMs?: number; // wait for element to stop moving (ms)
  force?: boolean; // bypass visibility check (use sparingly)
}

const DEFAULT_ACTION_OPTS: Required<SmartActionOptions> = {
  retries: 2,
  highlight: process.env['FW_DEBUG'] === 'true',
  scrollIntoView: true,
  stabilityMs: 300,
  force: false,
  scope: '',
  timeout: DEFAULT_CONFIG.timeout,
  allowPartial: false,
  allowRegex: false,
};

/**
 * SmartActions — production-grade action layer.
 *
 * Every action:
 *  1. Finds element via SmartLocatorEngine (confidence-scored)
 *  2. Checks visibility
 *  3. Scrolls into view
 *  4. Waits for stability (element stops moving)
 *  5. Optionally highlights element
 *  6. Performs action
 *  7. Retries on failure with backoff
 *  8. Handles iframe and shadow DOM automatically
 */
export class SmartActions {
  private opts: Required<SmartActionOptions>;

  constructor(
    private page: Page,
    options: SmartActionOptions = {}
  ) {
    this.opts = { ...DEFAULT_ACTION_OPTS, ...options };
  }

  // ── Core: resolve element with all checks ──────────────────────────────────

  private async resolveElement(
    elementName: string,
    action: string,
    overrides: SmartActionOptions = {}
  ): Promise<Locator> {
    const opts = { ...this.opts, ...overrides };

    // 1. Try main frame first
    const candidate = await SmartLocatorEngine.findBest(this.page, elementName, action, {
      scope: opts.scope,
      timeout: opts.timeout,
      allowPartial: opts.allowPartial,
      allowRegex: opts.allowRegex,
    });

    if (candidate?.element) {
      return this.prepareElement(candidate.element, opts);
    }

    // 2. Try iframes automatically
    const frameEl = await FrameHandler.findInFrames(this.page, elementName, action);
    if (frameEl) {
      Logger.debug(`SmartActions: found "${elementName}" inside iframe`);
      return frameEl;
    }

    // 3. Try shadow DOM
    const shadowEl = await FrameHandler.findInShadow(this.page, elementName);
    if (shadowEl) {
      Logger.debug(`SmartActions: found "${elementName}" in shadow DOM`);
      return shadowEl;
    }

    throw new Error(`SmartActions: element not found: "${elementName}"`);
  }

  private async prepareElement(el: Locator, opts: Required<SmartActionOptions>): Promise<Locator> {
    // Scroll into view
    if (opts.scrollIntoView) {
      await el.scrollIntoViewIfNeeded().catch(() => {});
    }

    // Wait for stability (element stops moving/animating)
    if (opts.stabilityMs > 0) {
      await SmartWaitEngine.waitForStable(el, opts.stabilityMs);
    }

    // Highlight in debug mode
    if (opts.highlight) {
      await this.highlight(el);
    }

    return el;
  }

  private async highlight(el: Locator): Promise<void> {
    try {
      await el.evaluate((node) => {
        const prev = (node as HTMLElement).style.outline;
        (node as HTMLElement).style.outline = '3px solid #ff6b35';
        setTimeout(() => {
          (node as HTMLElement).style.outline = prev;
        }, 800);
      });
      await this.page.waitForTimeout(100);
    } catch {
      /* non-fatal */
    }
  }

  // ── Retry wrapper ──────────────────────────────────────────────────────────

  private async withRetry<T>(label: string, fn: () => Promise<T>, retries: number): Promise<T> {
    let lastErr: unknown;
    for (let i = 0; i <= retries; i++) {
      try {
        const result = await fn();
        if (i > 0) Logger.info(`SmartActions: "${label}" succeeded on retry ${i}`);
        return result;
      } catch (e) {
        lastErr = e;
        if (i < retries) {
          const delay = Math.pow(2, i) * 100;
          Logger.warn(
            `SmartActions: "${label}" failed (attempt ${i + 1}/${retries + 1}), retrying in ${delay}ms`
          );
          await this.page.waitForTimeout(delay);
        }
      }
    }
    throw lastErr;
  }

  // ── Public smart actions ───────────────────────────────────────────────────

  /**
   * Smart click — finds element, checks visibility, scrolls, highlights, clicks.
   */
  async smartClick(elementName: string, options: SmartActionOptions = {}): Promise<void> {
    const opts = { ...this.opts, ...options };
    Logger.info(`SmartClick: "${elementName}"`);

    await this.withRetry(
      elementName,
      async () => {
        const el = await this.resolveElement(elementName, 'click', opts);
        await el.click({ timeout: opts.timeout, force: opts.force });
        Logger.info(`SmartClick: ✅ "${elementName}"`);
      },
      opts.retries
    );
  }

  /**
   * Smart fill — clears field, checks visibility, fills value.
   */
  async smartFill(
    elementName: string,
    value: string,
    options: SmartActionOptions = {}
  ): Promise<void> {
    const opts = { ...this.opts, ...options };
    Logger.info(`SmartFill: "${elementName}" = "${value}"`);

    await this.withRetry(
      elementName,
      async () => {
        const el = await this.resolveElement(elementName, 'fill', opts);
        await el.clear();
        await el.fill(value, { timeout: opts.timeout });
        Logger.info(`SmartFill: ✅ "${elementName}"`);
      },
      opts.retries
    );
  }

  /**
   * Smart select — handles native <select>, custom dropdowns, comboboxes.
   */
  async smartSelect(
    elementName: string,
    value: string,
    options: SmartActionOptions = {}
  ): Promise<void> {
    const opts = { ...this.opts, ...options };
    Logger.info(`SmartSelect: "${elementName}" = "${value}"`);

    await this.withRetry(
      elementName,
      async () => {
        const el = await this.resolveElement(elementName, 'dropdown', opts);

        // Detect element type
        const tagName = await el
          .evaluate((n) => (n as HTMLElement).tagName.toLowerCase())
          .catch(() => '');

        if (tagName === 'select') {
          // Native <select>
          await el.selectOption({ label: value }).catch(() => el.selectOption({ value }));
        } else {
          // Custom dropdown — click to open, then click option
          await el.click({ timeout: opts.timeout });
          await SmartWaitEngine.waitForVisible(this.page, `text=${value}`, 3000);
          await this.page.getByText(value, { exact: true }).first().click();
        }

        Logger.info(`SmartSelect: ✅ "${elementName}" = "${value}"`);
      },
      opts.retries
    );
  }

  /**
   * Smart check/uncheck — handles checkboxes and radio buttons.
   */
  async smartCheck(
    elementName: string,
    check = true,
    options: SmartActionOptions = {}
  ): Promise<void> {
    const opts = { ...this.opts, ...options };
    Logger.info(`Smart${check ? 'Check' : 'Uncheck'}: "${elementName}"`);

    await this.withRetry(
      elementName,
      async () => {
        const el = await this.resolveElement(elementName, check ? 'check' : 'uncheck', opts);
        if (check) await el.check({ timeout: opts.timeout });
        else await el.uncheck({ timeout: opts.timeout });
        Logger.info(`Smart${check ? 'Check' : 'Uncheck'}: ✅ "${elementName}"`);
      },
      opts.retries
    );
  }

  /**
   * Smart hover — scrolls into view, waits for stability, hovers.
   */
  async smartHover(elementName: string, options: SmartActionOptions = {}): Promise<void> {
    const opts = { ...this.opts, ...options };
    Logger.info(`SmartHover: "${elementName}"`);

    await this.withRetry(
      elementName,
      async () => {
        const el = await this.resolveElement(elementName, 'hover', opts);
        await el.hover({ timeout: opts.timeout });
        Logger.info(`SmartHover: ✅ "${elementName}"`);
      },
      opts.retries
    );
  }

  /**
   * Smart type — types slowly character by character (for apps that need key events).
   */
  async smartType(
    elementName: string,
    value: string,
    delayMs = DEFAULT_CONFIG.slowTypeDelay,
    options: SmartActionOptions = {}
  ): Promise<void> {
    const opts = { ...this.opts, ...options };
    Logger.info(`SmartType: "${elementName}" = "${value}"`);

    await this.withRetry(
      elementName,
      async () => {
        const el = await this.resolveElement(elementName, 'fill', opts);
        await el.clear();
        await el.pressSequentially(value, { delay: delayMs });
        Logger.info(`SmartType: ✅ "${elementName}"`);
      },
      opts.retries
    );
  }

  /**
   * Smart assert visible — waits for element to be visible.
   */
  async smartAssertVisible(elementName: string, options: SmartActionOptions = {}): Promise<void> {
    const opts = { ...this.opts, ...options };
    Logger.info(`SmartAssert: "${elementName}" visible`);

    const candidate = await SmartLocatorEngine.findBest(this.page, elementName, 'assertVisible', {
      scope: opts.scope,
      timeout: opts.timeout,
      allowPartial: opts.allowPartial,
    });

    if (!candidate?.element) {
      throw new Error(`SmartAssert: "${elementName}" not visible on page`);
    }
    Logger.info(
      `SmartAssert: ✅ "${elementName}" visible (${candidate.strategy}, confidence: ${candidate.confidence})`
    );
  }

  /**
   * Smart assert text — verifies element contains expected text.
   */
  async smartAssertText(
    elementName: string,
    expectedText: string,
    options: SmartActionOptions = {}
  ): Promise<void> {
    const opts = { ...this.opts, ...options };
    const el = await this.resolveElement(elementName, 'assertText', opts);
    const actual = (await el.textContent()) ?? '';
    if (!actual.includes(expectedText)) {
      throw new Error(
        `SmartAssertText: "${elementName}" expected "${expectedText}", got "${actual.slice(0, 100)}"`
      );
    }
    Logger.info(`SmartAssertText: ✅ "${elementName}" contains "${expectedText}"`);
  }

  /**
   * Smart upload — handles file input elements.
   */
  async smartUpload(
    elementName: string,
    filePath: string,
    options: SmartActionOptions = {}
  ): Promise<void> {
    const opts = { ...this.opts, ...options };
    Logger.info(`SmartUpload: "${elementName}" = "${filePath}"`);

    const el = await this.resolveElement(elementName, 'upload', opts);
    await el.setInputFiles(filePath);
    Logger.info(`SmartUpload: ✅ "${elementName}"`);
  }

  /**
   * Smart clear — clears an input field.
   */
  async smartClear(elementName: string, options: SmartActionOptions = {}): Promise<void> {
    const opts = { ...this.opts, ...options };
    const el = await this.resolveElement(elementName, 'clearInput', opts);
    await el.clear();
    Logger.info(`SmartClear: ✅ "${elementName}"`);
  }

  /**
   * Smart get text — returns visible text of an element.
   */
  async smartGetText(elementName: string, options: SmartActionOptions = {}): Promise<string> {
    const opts = { ...this.opts, ...options };
    const el = await this.resolveElement(elementName, 'assertText', opts);
    return (await el.textContent()) ?? '';
  }

  /**
   * Smart get value — returns input value of a form field.
   */
  async smartGetValue(elementName: string, options: SmartActionOptions = {}): Promise<string> {
    const opts = { ...this.opts, ...options };
    const el = await this.resolveElement(elementName, 'assertValue', opts);
    return el.inputValue();
  }
}
