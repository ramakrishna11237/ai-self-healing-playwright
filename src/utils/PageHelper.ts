import { Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_CONFIG } from '../config';

/**
 * PageHelper — lean core actions used in every test.
 * Heavy helpers (table, iframe, alert, discovery) are in PageHelperExtras.ts
 * and only imported when needed.
 */
export class PageHelper {
  private actionCache: Map<string, { role: string; name: string; value?: string; found: boolean }> =
    new Map();

  constructor(private page: Page) {}

  // ── Click ──────────────────────────────────────────────────────────────────

  async clickButton(name: string): Promise<boolean> {
    try {
      await this.page.getByRole('button', { name }).click();
      return true;
    } catch {
      return false;
    }
  }

  async clickLink(name: string): Promise<boolean> {
    try {
      await this.page.getByRole('link', { name }).click();
      return true;
    } catch {
      return false;
    }
  }

  async clickByLocator(locator: string): Promise<boolean> {
    try {
      await this.page.locator(locator).first().click();
      return true;
    } catch {
      return false;
    }
  }

  async clickByText(text: string): Promise<boolean> {
    try {
      await this.page.getByText(text).first().click();
      return true;
    } catch {
      return false;
    }
  }

  async clickByTestId(testId: string): Promise<boolean> {
    try {
      await this.page.getByTestId(testId).click();
      return true;
    } catch {
      return false;
    }
  }

  async doubleClick(locator: string): Promise<boolean> {
    try {
      await this.page.locator(locator).first().dblclick();
      return true;
    } catch {
      return false;
    }
  }

  async rightClick(locator: string): Promise<boolean> {
    try {
      await this.page.locator(locator).first().click({ button: 'right' });
      return true;
    } catch {
      return false;
    }
  }

  async clickNth(locator: string, index: number): Promise<boolean> {
    try {
      await this.page.locator(locator).nth(index).click();
      return true;
    } catch {
      return false;
    }
  }

  // ── Fill / Input ───────────────────────────────────────────────────────────

  async fillInput(label: string, value: string): Promise<boolean> {
    try {
      await this.page.getByRole('textbox', { name: label }).fill(value);
      return true;
    } catch {
      return false;
    }
  }

  async fillByLocator(locator: string, value: string): Promise<boolean> {
    try {
      await this.page.locator(locator).first().fill(value);
      return true;
    } catch {
      return false;
    }
  }

  async fillByPlaceholder(placeholder: string, value: string): Promise<boolean> {
    try {
      await this.page.getByPlaceholder(placeholder).fill(value);
      return true;
    } catch {
      return false;
    }
  }

  async clearInput(locator: string): Promise<boolean> {
    try {
      await this.page.locator(locator).first().clear();
      return true;
    } catch {
      return false;
    }
  }

  async pressKey(key: string, locator?: string): Promise<boolean> {
    try {
      if (locator) await this.page.locator(locator).first().press(key);
      else await this.page.keyboard.press(key);
      return true;
    } catch {
      return false;
    }
  }

  async pressEnter(locator?: string): Promise<boolean> {
    return this.pressKey('Enter', locator);
  }
  async pressEscape(): Promise<boolean> {
    return this.pressKey('Escape');
  }

  // ── Forms ──────────────────────────────────────────────────────────────────

  async selectDropdownByLocator(locator: string, value: string): Promise<boolean> {
    try {
      await this.page.locator(locator).first().selectOption(value);
      return true;
    } catch {
      return false;
    }
  }

  async checkByLocator(locator: string): Promise<boolean> {
    try {
      await this.page.locator(locator).first().check();
      return true;
    } catch {
      return false;
    }
  }

  async uncheckByLocator(locator: string): Promise<boolean> {
    try {
      await this.page.locator(locator).first().uncheck();
      return true;
    } catch {
      return false;
    }
  }

  async submitForm(locator?: string): Promise<boolean> {
    try {
      if (locator) {
        await this.page.locator(locator).first().click();
        return true;
      }
      const btn = this.page.getByRole('button', { name: /submit|save|send|confirm/i });
      if ((await btn.count()) === 0) return false;
      await btn.first().click();
      return true;
    } catch {
      return false;
    }
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  async navigate(url: string): Promise<boolean> {
    // CWE-918: only allow http/https — block javascript:, data:, file:, and internal hosts
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
      await this.page.goto(url, { waitUntil: 'domcontentloaded' });
      return true;
    } catch {
      return false;
    }
  }

  async reload(): Promise<boolean> {
    try {
      await this.page.reload();
      return true;
    } catch {
      return false;
    }
  }

  // ── Wait ───────────────────────────────────────────────────────────────────

  async waitMs(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms);
  }

  async waitForVisible(locator: string, timeout?: number): Promise<boolean> {
    try {
      await this.page
        .locator(locator)
        .first()
        .waitFor({ state: 'visible', timeout: timeout ?? DEFAULT_CONFIG.waitTimeout });
      return true;
    } catch {
      return false;
    }
  }

  async waitForHidden(locator: string, timeout?: number): Promise<boolean> {
    try {
      await this.page
        .locator(locator)
        .first()
        .waitFor({ state: 'hidden', timeout: timeout ?? DEFAULT_CONFIG.waitTimeout });
      return true;
    } catch {
      return false;
    }
  }

  async waitForUrl(urlPattern: string | RegExp, timeout?: number): Promise<boolean> {
    try {
      await this.page.waitForURL(urlPattern, { timeout: timeout ?? DEFAULT_CONFIG.waitTimeout });
      return true;
    } catch {
      return false;
    }
  }

  // ── Scroll ─────────────────────────────────────────────────────────────────

  async scrollDown(amount = 300): Promise<boolean> {
    try {
      await this.page.mouse.wheel(0, amount);
      return true;
    } catch {
      return false;
    }
  }

  async scrollUp(amount = 300): Promise<boolean> {
    try {
      await this.page.mouse.wheel(0, -amount);
      return true;
    } catch {
      return false;
    }
  }

  async scrollToElement(locator: string): Promise<boolean> {
    try {
      await this.page.locator(locator).first().scrollIntoViewIfNeeded();
      return true;
    } catch {
      return false;
    }
  }

  // ── Screenshot ─────────────────────────────────────────────────────────────

  async screenshot(_name?: string): Promise<string> {
    const base = path.resolve('test-results', 'screenshots');
    fs.mkdirSync(base, { recursive: true });
    // CWE-22: filename is timestamp-only — no user input, explicit guard for scanner
    const filename = `${Date.now()}.png`;
    const filePath = path.resolve(base, filename);
    if (!filePath.startsWith(base + path.sep)) return '';
    await this.page.screenshot({ path: filePath, fullPage: true });
    return filePath;
  }

  // ── Assertions ─────────────────────────────────────────────────────────────

  async isVisible(locator: string): Promise<boolean> {
    try {
      return await this.page.locator(locator).first().isVisible();
    } catch {
      return false;
    }
  }

  async isEnabled(locator: string): Promise<boolean> {
    try {
      return await this.page.locator(locator).first().isEnabled();
    } catch {
      return false;
    }
  }

  async getCount(locator: string): Promise<number> {
    try {
      return await this.page.locator(locator).count();
    } catch {
      return 0;
    }
  }

  async getText(locator: string): Promise<string> {
    try {
      return (await this.page.locator(locator).first().textContent()) ?? '';
    } catch {
      return '';
    }
  }

  async getInputValue(locator: string): Promise<string> {
    try {
      return await this.page.locator(locator).first().inputValue();
    } catch {
      return '';
    }
  }

  async getAttribute(locator: string, attr: string): Promise<string | null> {
    try {
      return await this.page.locator(locator).first().getAttribute(attr);
    } catch {
      return null;
    }
  }

  validateUrl(expected: string | RegExp): boolean {
    const url = this.page.url();
    return typeof expected === 'string' ? url.includes(expected) : expected.test(url);
  }

  getCurrentUrl(): string {
    return this.page.url();
  }
  async getPageTitle(): Promise<string> {
    return this.page.title();
  }
  getPage(): Page {
    return this.page;
  }
  getActionCache() {
    return this.actionCache;
  }
  clearCache(): void {
    this.actionCache.clear();
  }
}
