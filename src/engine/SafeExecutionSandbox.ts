import { Page, BrowserContext } from '@playwright/test';
import { Logger } from '../utils/Logger';
import { Step } from '../types';
import { SecurityEnforcer } from '../security/SecurityEnforcer';

export interface SandboxResult {
  success: boolean;
  error?: string;
  sideEffects?: string[];
  domChanges?: number;
  executionTime: number;
  rollbackSuccessful: boolean;
}

interface PageState {
  url: string;
  title: string;
  domSnapshot: string;
  cookies: string;
  localStorage: string;
  sessionStorage: string;
}

export class SafeExecutionSandbox {
  private static isEnabled = process.env.FW_SANDBOX_EXECUTION === 'true';
  private static readonly MAX_SANDBOX_TIME_MS = 10000; // 10 seconds
  private static readonly ALLOWED_DOM_CHANGES = 3;

  private static readonly ALLOWED_ACTIONS = new Set([
    'click', 'fill', 'check', 'uncheck', 'hover', 'focus', 'dblclick', 'doubleClick',
    'assertVisible', 'assertHidden', 'assertText', 'assertValue', 'assertChecked',
    'assertEnabled', 'assertDisabled', 'screenshot', 'goto', 'goBack', 'goForward',
    'select',
  ]);

  static async executeInSandbox(
    page: Page,
    action: string,
    step: Step,
    locator: string
  ): Promise<SandboxResult> {
    if (!this.ALLOWED_ACTIONS.has(action)) {
      return {
        success: false,
        error: `Blocked unsanitized action: "${action}"`,
        executionTime: 0,
        rollbackSuccessful: true,
        sideEffects: [],
      };
    }
    const locatorScan = SecurityEnforcer.scanLocator(locator);
    if (!locatorScan.safe) {
      return {
        success: false,
        error: `Blocked unsafe locator: ${locatorScan.risks.join(', ')}`,
        executionTime: 0,
        rollbackSuccessful: true,
        sideEffects: [],
      };
    }
    if (!this.isEnabled || this.isLowRiskAction(action)) {
      try {
        const result = await this.executeAction(page, action, step, locator);
        return { success: result, executionTime: 0, rollbackSuccessful: true, sideEffects: [] };
      } catch (error) {
        return {
          success: false,
          error: String(error),
          executionTime: 0,
          rollbackSuccessful: true,
          sideEffects: [],
        };
      }
    }

    const startTime = Date.now();

    // Enforce MAX_SANDBOX_TIME_MS via a race
    const timeoutResult: SandboxResult = {
      success: false,
      error: `Sandbox timed out after ${this.MAX_SANDBOX_TIME_MS}ms`,
      executionTime: this.MAX_SANDBOX_TIME_MS,
      rollbackSuccessful: true,
      sideEffects: [],
    };
    const sandboxTimeout = new Promise<SandboxResult>((resolve) =>
      setTimeout(() => resolve(timeoutResult), this.MAX_SANDBOX_TIME_MS)
    );

    const sandboxExecution = this.runInSandbox(page, action, step, locator, startTime);

    return Promise.race([sandboxExecution, sandboxTimeout]);
  }

  private static async runInSandbox(
    page: Page,
    action: string,
    step: Step,
    locator: string,
    startTime: number
  ): Promise<SandboxResult> {
    let sandboxContext: BrowserContext | null = null;
    try {
      sandboxContext = await this.createSandboxContext(page);
      const sandboxPage = await sandboxContext.newPage();

      const initialState = await this.capturePageState(sandboxPage);
      const currentUrl = page.url();
      if (!SecurityEnforcer.validateUrl(currentUrl)) {
        return {
          success: false,
          error: `Blocked unsafe URL: "${currentUrl}"`,
          executionTime: Date.now() - startTime,
          rollbackSuccessful: true,
          sideEffects: [],
        };
      }
      await sandboxPage.goto(currentUrl, { waitUntil: 'domcontentloaded' });

      const executionSuccess = await this.executeAction(sandboxPage, action, step, locator);
      if (!executionSuccess) {
        return {
          success: false,
          error: 'Action failed in sandbox',
          executionTime: Date.now() - startTime,
          rollbackSuccessful: true,
          sideEffects: [],
        };
      }

      const finalState = await this.capturePageState(sandboxPage);
      const sideEffects = this.analyzeSideEffects(initialState, finalState);
      const domChanges = this.countDOMChanges(initialState, finalState);
      const hasUnexpectedEffects = this.hasUnexpectedSideEffects(sideEffects, action);

      if (hasUnexpectedEffects || domChanges > this.ALLOWED_DOM_CHANGES) {
        Logger.warn(`Sandbox blocked action due to side effects: ${action}`, {
          sideEffects,
          domChanges,
          locator,
        });
        return {
          success: false,
          error: 'Unexpected side effects detected',
          sideEffects,
          domChanges,
          executionTime: Date.now() - startTime,
          rollbackSuccessful: true,
        };
      }

      const realResult = await this.executeAction(page, action, step, locator);
      return {
        success: realResult,
        sideEffects,
        domChanges,
        executionTime: Date.now() - startTime,
        rollbackSuccessful: true,
      };
    } catch (error) {
      Logger.error('Sandbox execution failed', error);
      return {
        success: false,
        error: String(error),
        executionTime: Date.now() - startTime,
        rollbackSuccessful: true,
        sideEffects: [],
      };
    } finally {
      if (sandboxContext) {
        await sandboxContext.close().catch(() => {});
      }
    }
  }

  private static async createSandboxContext(page: Page): Promise<BrowserContext> {
    const browser = page.context().browser();
    if (!browser) {
      throw new Error('Browser not available for sandbox');
    }
    return await browser.newContext({
      viewport: page.viewportSize(),
      userAgent: await page.evaluate(() => navigator.userAgent),
      javaScriptEnabled: true,
      // bypassCSP intentionally omitted — do not disable CSP in sandbox
    });
  }

  private static async capturePageState(page: Page): Promise<PageState> {
    return await page.evaluate(() => ({
      url: window.location.href,
      title: document.title,
      domSnapshot: document.documentElement.outerHTML,
      cookies: document.cookie,
      localStorage: JSON.stringify({ ...window.localStorage }),
      sessionStorage: JSON.stringify({ ...window.sessionStorage }),
    }));
  }

  private static analyzeSideEffects(initialState: PageState, finalState: PageState): string[] {
    const effects: string[] = [];
    if (initialState.url !== finalState.url) effects.push('navigation');
    if (initialState.title !== finalState.title) effects.push('title_change');
    if (initialState.cookies !== finalState.cookies) effects.push('cookies_modified');
    if (initialState.localStorage !== finalState.localStorage)
      effects.push('local_storage_modified');
    if (initialState.sessionStorage !== finalState.sessionStorage)
      effects.push('session_storage_modified');
    if (initialState.domSnapshot !== finalState.domSnapshot) effects.push('dom_modified');
    return effects;
  }

  private static countDOMChanges(initialState: PageState, finalState: PageState): number {
    if (initialState.domSnapshot === finalState.domSnapshot) return 0;
    const initialLines = initialState.domSnapshot.split('\n').length;
    const finalLines = finalState.domSnapshot.split('\n').length;
    return Math.abs(initialLines - finalLines);
  }

  private static hasUnexpectedSideEffects(sideEffects: string[], action: string): boolean {
    return sideEffects.some((effect) => !this.getExpectedEffects(action).includes(effect));
  }

  private static getExpectedEffects(action: string): string[] {
    const effectMap: Record<string, string[]> = {
      click: ['dom_modified'],
      fill: ['dom_modified'],
      select: ['dom_modified'],
      check: ['dom_modified'],
      uncheck: ['dom_modified'],
      goto: ['navigation', 'title_change', 'cookies_modified', 'dom_modified'],
      goBack: ['navigation', 'title_change', 'dom_modified'],
      goForward: ['navigation', 'title_change', 'dom_modified'],
    };
    return effectMap[action] ?? ['dom_modified'];
  }

  private static isLowRiskAction(action: string): boolean {
    const lowRiskActions = new Set([
      'assertVisible',
      'assertHidden',
      'assertText',
      'assertValue',
      'assertChecked',
      'assertEnabled',
      'assertDisabled',
      'screenshot',
    ]);
    return lowRiskActions.has(action);
  }

  private static async executeAction(
    page: Page,
    action: string,
    step: Step,
    locator: string
  ): Promise<boolean> {
    try {
      const safeLocator = SecurityEnforcer.sanitizeLocator(locator);
      const element = page.locator(safeLocator);
      switch (action) {
        case 'click':
          await element.click();
          break;
        case 'fill':
          const fillValue = step.text ?? step.value ?? '';
          if (typeof fillValue === 'string' && fillValue.length <= 10000) {
            await element.fill(fillValue);
          } else {
            Logger.warn('SafeExecutionSandbox: blocked fill with invalid or oversized value');
            return false;
          }
          break;
        case 'check':
          await element.check();
          break;
        case 'uncheck':
          await element.uncheck();
          break;
        case 'hover':
          await element.hover();
          break;
        case 'focus':
          await element.focus();
          break;
        case 'dblclick':
        case 'doubleClick':
          await element.dblclick();
          break;
        default:
          Logger.debug(`SafeExecutionSandbox: unknown action "${action}" — attempting click`);
          await element.click();
      }
      return true;
    } catch (error) {
      Logger.debug(`Action failed in sandbox: ${action}`, { error: String(error) });
      return false;
    }
  }
}
