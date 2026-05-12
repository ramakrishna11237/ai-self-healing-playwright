import { Page, Locator } from '@playwright/test';
import { resolveLocatorToPlaywright } from '../engine/ActionRouter';
import { runStepDetailed } from '../core/Runner';
import { Step } from '../types';
import { Logger } from './Logger';
import { NavigationGuard } from './NavigationGuard';

/**
 * Thin wrapper that resolves codegen-style locator strings through the
 * framework's full 5-layer recovery pipeline instead of failing immediately.
 */
export class HealingPage {
  constructor(private page: Page) {}

  /** Resolves a locator string using ActionRouter — same parser used by the full engine. */
  private resolve(locator: string): Locator {
    if (!locator) return this.page.locator('body');
    return resolveLocatorToPlaywright(this.page, locator) ?? this.page.locator(locator);
  }

  /** Run a step through the full 5-layer Runner (healing, LLM, learning DB). */
  private async run(step: Step): Promise<void> {
    const result = await runStepDetailed(this.page, step);
    if (!result.success) throw new Error(result.error ?? `Step failed: "${step.label}"`);
  }

  async goto(url: string, retries = 3) {
    const success = await NavigationGuard.navigate(this.page, url, { retries, timeout: 60000 });
    if (!success) throw new Error(`Layer 0: navigation failed after ${retries} retries for "${url}"`);
  }

  async fill(locator: string, label: string, value: string) {
    await this.run({ label, action: 'fill', codegenLocator: locator, value });
  }

  async click(locator: string, label: string) {
    await this.run({ label, action: 'click', codegenLocator: locator });
  }

  async assertVisible(locator: string, label: string) {
    await this.run({ label, action: 'assertVisible', codegenLocator: locator });
  }

  async waitForVisible(locator: string, label: string) {
    await this.resolve(locator).waitFor({ state: 'visible', timeout: 15_000 });
  }

  async waitMs(ms: number) {
    await this.page.waitForTimeout(ms);
  }
}
