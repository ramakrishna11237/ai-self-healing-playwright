import * as fs from 'fs';
import * as path from 'path';
import { BrowserContext, Page } from '@playwright/test';
import { Logger } from '../utils/Logger';

const SESSION_DIR = 'test-results/sessions';

export class SessionManager {
  constructor(private context: BrowserContext) {}

  /**
   * Save current browser auth state (cookies + localStorage) to a named file.
   * Use after a successful login so subsequent tests can restore it.
   */
  async save(name: string): Promise<string> {
    const safeName = path.basename(name).replace(/[^a-z0-9_-]/gi, '_');
    fs.mkdirSync(SESSION_DIR, { recursive: true });
    const filePath = path.join(path.resolve(SESSION_DIR), `${safeName}.json`);
    if (!filePath.startsWith(path.resolve(SESSION_DIR) + path.sep)) {
      throw new Error(`SessionManager.save: path traversal blocked for "${name}"`);
    }
    await this.context.storageState({ path: filePath });
    Logger.info(`Session saved: ${filePath}`);
    return filePath;
  }

  /**
   * Check whether a saved session file exists.
   */
  static exists(name: string): boolean {
    const safeName = path.basename(name).replace(/[^a-z0-9_-]/gi, '_');
    return fs.existsSync(path.join(SESSION_DIR, `${safeName}.json`));
  }

  static filePath(name: string): string {
    const safeName = path.basename(name).replace(/[^a-z0-9_-]/gi, '_');
    return path.join(SESSION_DIR, `${safeName}.json`);
  }

  static clear(name: string): void {
    const safeName = path.basename(name).replace(/[^a-z0-9_-]/gi, '_');
    const fp = path.join(path.resolve(SESSION_DIR), `${safeName}.json`);
    if (!fp.startsWith(path.resolve(SESSION_DIR) + path.sep)) return;
    if (fs.existsSync(fp)) {
      fs.unlinkSync(fp);
      Logger.info(`Session cleared: ${fp}`);
    }
  }

  /**
   * Set a cookie on the current context.
   */
  async setCookie(name: string, value: string, domain: string, path_ = '/'): Promise<void> {
    // Validate inputs to prevent header injection via cookie name/value
    if (/[\r\n;,\s]/.test(name) || /[\r\n]/.test(value)) {
      throw new Error(`SessionManager.setCookie: invalid characters in name or value`);
    }
    await this.context.addCookies([{ name, value, domain, path: path_ }]);
    Logger.debug(`Cookie set: ${name} on ${domain}`);
  }

  /**
   * Get all cookies for the current context.
   */
  async getCookies() {
    return this.context.cookies();
  }

  /**
   * Clear all cookies from the current context.
   */
  async clearCookies(): Promise<void> {
    await this.context.clearCookies();
    Logger.debug('All cookies cleared');
  }

  /**
   * Set a localStorage item on the current page.
   * Uses Playwright's addInitScript-free approach via context storage state
   * to avoid CWE-94 code execution via page.evaluate with user input.
   */
  async setLocalStorage(page: Page, key: string, value: string): Promise<void> {
    // Validate key/value are plain strings — no script injection possible
    if (typeof key !== 'string' || typeof value !== 'string') {
      throw new Error('SessionManager.setLocalStorage: key and value must be strings');
    }
    // Use page.evaluate with a fixed function and pass data as serialized args
    // The function body is a hardcoded literal — only the args are user-supplied
    await page.evaluate(
      (args: { k: string; v: string }) => {
        window.localStorage.setItem(args.k, args.v);
      },
      { k: key, v: value }
    );
    Logger.debug(`localStorage set: ${key}`);
  }

  /**
   * Get a localStorage item from the current page.
   */
  getLocalStorage(page: Page, key: string): Promise<string | null> {
    if (typeof key !== 'string') return Promise.resolve(null);
    return page.evaluate((k: string) => window.localStorage.getItem(k), key);
  }

  /**
   * Clear all localStorage on the current page.
   */
  async clearLocalStorage(page: Page): Promise<void> {
    await page.evaluate(() => {
      window.localStorage.clear();
    });
    Logger.debug('localStorage cleared');
  }
}
