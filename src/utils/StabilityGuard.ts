import { Page } from '@playwright/test';
import { Logger } from './Logger';
import { DEFAULT_CONFIG } from '../config';
import { resolveLocatorToPlaywright } from '../engine/ActionRouter';
import { SecurityEnforcer } from '../security/SecurityEnforcer';

export interface StabilityOptions {
  /** Locator that proves the session is still valid — use a Codegen locator */
  sessionAliveLocator?: string;
  /** URL to navigate to when session expires */
  loginUrl?: string;
  /** Callback to re-login when session expires */
  onSessionExpired?: (page: Page) => Promise<void>;
  /** Max attempts to restore session before giving up. Default: 2 */
  maxSessionRestoreAttempts?: number;
  /** How long to wait after each action for the app to settle (ms). Default: 0 */
  postActionWaitMs?: number;
}

export class StabilityGuard {
  private sessionRestoreAttempts = 0;

  constructor(
    private page: Page,
    private options: StabilityOptions = {}
  ) {}

  // ── Page health ─────────────────────────────────────────────────────────────

  /** Check the page is still open and not navigating away */
  isPageAlive(): boolean {
    // page.isClosed() is synchronous and executes no browser code — CWE-94 safe
    return !this.page.isClosed();
  }

  // ── Stability waits ─────────────────────────────────────────────────────────

  /**
   * Wait for the page to be stable after a navigation or form submission.
   * Waits for DOM content loaded + optional post-action delay.
   */
  async waitForStability(timeout = DEFAULT_CONFIG.waitTimeout): Promise<void> {
    try {
      await this.page.waitForLoadState('domcontentloaded', { timeout });
    } catch {
      /* already loaded */
    }

    if (this.options.postActionWaitMs && this.options.postActionWaitMs > 0) {
      await this.page.waitForTimeout(this.options.postActionWaitMs);
    }
  }

  /**
   * Wait for network to be completely idle.
   * Use before assertions that depend on API responses.
   */
  async waitForNetworkIdle(timeout = 10000): Promise<void> {
    try {
      await this.page.waitForLoadState('networkidle', { timeout });
    } catch {
      Logger.debug('waitForNetworkIdle: timeout — continuing');
    }
  }

  // ── Session management ──────────────────────────────────────────────────────

  /**
   * Check if the current session is still valid.
   * Uses resolveLocatorToPlaywright so Codegen strings like
   * getByRole('link', { name: 'Modules' }) work correctly.
   */
  async isSessionAlive(): Promise<boolean> {
    if (!this.options.sessionAliveLocator) return true;
    if (!this.isPageAlive()) return false;

    try {
      // Use resolveLocatorToPlaywright — handles Codegen strings correctly
      const el = resolveLocatorToPlaywright(this.page, this.options.sessionAliveLocator);
      if (!el) return false;
      const count = await el.count();
      return count > 0;
    } catch {
      return false;
    }
  }

  /**
   * Restore an expired session.
   * Returns true if session was restored, false if max attempts exceeded.
   */
  async restoreSession(): Promise<boolean> {
    const maxAttempts = this.options.maxSessionRestoreAttempts ?? 2;

    if (this.sessionRestoreAttempts >= maxAttempts) {
      Logger.error(`Session restore failed after ${maxAttempts} attempts`);
      return false;
    }

    this.sessionRestoreAttempts++;
    Logger.warn(
      `Session expired — restoring (attempt ${this.sessionRestoreAttempts}/${maxAttempts})`
    );

    try {
      if (this.options.onSessionExpired) {
        await this.options.onSessionExpired(this.page);
        Logger.success('Session restored via onSessionExpired callback');
        return true;
      }
      if (this.options.loginUrl) {
        if (!SecurityEnforcer.validateUrl(this.options.loginUrl)) {
          Logger.error(`Session restore: invalid or unsafe loginUrl "${this.options.loginUrl}"`);
          return false;
        }
        await this.page.goto(this.options.loginUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });
        Logger.info(`Navigated to login URL: ${this.options.loginUrl}`);
        return true;
      }
    } catch (e) {
      Logger.error('Session restore failed', e);
    }

    return false;
  }

  /**
   * Execute an action with automatic session recovery.
   *
   * Only attempts session recovery when:
   * 1. The action throws an error AND
   * 2. The session locator is no longer visible (confirmed session expiry)
   *
   * This prevents false session-restore attempts on legitimate test failures.
   *
   * @example
   *   const guard = new StabilityGuard(page, {
   *     sessionAliveLocator: "getByRole('link', { name: 'Modules' })",
   *     onSessionExpired: async (page) => {
   *       const loginPage = new LoginPage(page);
   *       await loginPage.login();
   *     }
   *   });
   *
   *   await guard.withSessionRecovery(
   *     () => navPage.goToModule("Leave"),
   *     () => navPage.goToModule("Leave")  // retry after re-login
   *   );
   */
  async withSessionRecovery<T>(
    action: () => Promise<T>,
    onRetry?: () => Promise<void>
  ): Promise<T> {
    try {
      return await action();
    } catch (e) {
      // Only attempt session recovery if session locator is configured
      // AND the session is confirmed to be gone
      if (this.options.sessionAliveLocator && !(await this.isSessionAlive())) {
        Logger.warn('Action failed and session appears expired — attempting recovery');
        const restored = await this.restoreSession();
        if (restored) {
          if (onRetry) await onRetry();
          return await action();
        }
      }
      // Re-throw original error — not a session issue
      throw e;
    }
  }

  // ── Pre/post condition checks ───────────────────────────────────────────────

  /**
   * Verify a pre-condition before starting a test phase.
   * Accepts both Codegen strings and CSS selectors.
   * Throws a clear, descriptive error if the pre-condition is not met.
   *
   * @example
   *   await guard.assertPreCondition(
   *     "getByRole('link', { name: 'Add New Record' })",
   *     "Module page must be open before creating a record"
   *   )
   */
  async assertPreCondition(
    locator: string,
    message: string,
    timeout = DEFAULT_CONFIG.waitTimeout
  ): Promise<void> {
    if (!this.isPageAlive()) {
      throw new Error(`Pre-condition failed: page is not accessible\nCondition: ${message}`);
    }

    try {
      const el = resolveLocatorToPlaywright(this.page, locator) ?? this.page.locator(locator);
      await el.first().waitFor({ state: 'visible', timeout });
      Logger.debug(`Pre-condition met: ${message}`);
    } catch {
      throw new Error(`Pre-condition failed: ${message}\nLocator not found: ${locator}`);
    }
  }

  /**
   * Wait for a result element to appear after an action.
   * Accepts both Codegen strings and CSS selectors.
   * Returns true if found, false if not — never throws.
   *
   * @example
   *   const saved = await guard.waitForResult(
   *     "getByText('Record saved.')",
   *     "Record save confirmation"
   *   );
   *   if (!saved) throw new Error("Record was not saved");
   */
  async waitForResult(
    locator: string,
    description: string,
    timeout = DEFAULT_CONFIG.waitTimeout
  ): Promise<boolean> {
    if (!this.isPageAlive()) {
      Logger.warn(`waitForResult: page not accessible for "${description}"`);
      return false;
    }

    try {
      const el = resolveLocatorToPlaywright(this.page, locator) ?? this.page.locator(locator);
      await el.first().waitFor({ state: 'visible', timeout });
      Logger.info(`Result confirmed: ${description}`);
      return true;
    } catch {
      Logger.warn(`Result not found: ${description} (${locator})`);
      return false;
    }
  }

  /** Reset session restore counter — call at the start of each test */
  reset(): void {
    this.sessionRestoreAttempts = 0;
    Logger.debug('StabilityGuard reset');
  }
}
