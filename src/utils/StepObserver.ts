import * as fs from 'fs';
import * as path from 'path';
import { Page, Locator } from '@playwright/test';
import { Logger } from '../utils/Logger';
import { DEFAULT_CONFIG } from '../config';

export interface StepObservation {
  stepLabel: string;
  action: string;
  locatorUsed: string;
  strategy: string;
  confidence: number;
  usedFallback: boolean;
  retryCount: number;
  durationMs: number;
  screenshotPath: string;
  success: boolean;
  error?: string;
  timestamp: string;
}

/**
 * StepObserver — captures screenshots, highlights elements, and logs
 * structured observability data for every step.
 *
 * Answers the question: "What exactly happened at each step?"
 */
export class StepObserver {
  private observations: StepObservation[] = [];
  private screenshotDir: string;
  private enabled: boolean;

  constructor(
    private page: Page,
    options: { screenshotDir?: string; enabled?: boolean } = {}
  ) {
    this.screenshotDir = options.screenshotDir ?? DEFAULT_CONFIG.screenshotDir;
    this.enabled = options.enabled ?? true;
    fs.mkdirSync(this.screenshotDir, { recursive: true });
  }

  /**
   * Wrap a step execution with full observability.
   * Captures before/after screenshots, highlights element, logs result.
   */
  async observe<T>(
    stepLabel: string,
    action: string,
    locatorInfo: { locator: string; strategy: string; confidence: number; element?: Locator },
    fn: () => Promise<T>
  ): Promise<T> {
    if (!this.enabled) return fn();

    const start = Date.now();
    let screenshotPath = '';
    let success = true;
    let error: string | undefined;
    const retryCount = 0;

    // Highlight element before action
    if (locatorInfo.element) {
      await this.highlightElement(locatorInfo.element, stepLabel, action);
    }

    // Screenshot before action
    screenshotPath = await this.captureScreenshot(`before-${stepLabel}`);

    try {
      const result = await fn();
      return result;
    } catch (e) {
      success = false;
      error = e instanceof Error ? e.message : String(e);

      // Screenshot on failure
      await this.captureScreenshot(`fail-${stepLabel}`);
      throw e;
    } finally {
      const durationMs = Date.now() - start;

      const obs: StepObservation = {
        stepLabel,
        action,
        locatorUsed: locatorInfo.locator,
        strategy: locatorInfo.strategy,
        confidence: locatorInfo.confidence,
        usedFallback: locatorInfo.confidence < 85,
        retryCount,
        durationMs,
        screenshotPath,
        success,
        error,
        timestamp: new Date().toISOString(),
      };

      this.observations.push(obs);
      this.logObservation(obs);
    }
  }

  /**
   * Highlight an element with a colored border and label tooltip.
   */
  async highlightElement(
    el: Locator,
    label: string,
    action: string,
    color = '#ff6b35'
  ): Promise<void> {
    try {
      // CWE-95: color validated against hex pattern; set via style properties not cssText
      const SAFE_HEX = /^#[0-9a-fA-F]{3,6}$/;
      const safeColor = SAFE_HEX.test(color) ? color : '#ff6b35';
      await el.evaluate(
        (node: Element, { lbl, act, clr }: { lbl: string; act: string; clr: string }) => {
          const h = node as HTMLElement;
          const prevOutline = h.style.outline;
          const prevOffset = h.style.outlineOffset;
          const prevBg = h.style.backgroundColor;
          h.style.outline = `3px solid ${clr}`;
          h.style.outlineOffset = '2px';
          h.style.backgroundColor = `${clr}22`;
          const tip = document.createElement('div');
          tip.setAttribute('data-fw-tip', 'true');
          tip.style.position = 'fixed';
          tip.style.top = '8px';
          tip.style.right = '8px';
          tip.style.zIndex = '2147483647';
          tip.style.background = '#1a1a2e';
          tip.style.color = '#fff';
          tip.style.padding = '6px 12px';
          tip.style.borderRadius = '6px';
          tip.style.font = '12px monospace';
          tip.style.maxWidth = '350px';
          tip.style.borderLeft = `4px solid ${clr}`;
          tip.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
          tip.style.pointerEvents = 'none';
          tip.textContent = `${act}: ${lbl}`;
          document.body.appendChild(tip);
          setTimeout(() => {
            h.style.outline = prevOutline;
            h.style.outlineOffset = prevOffset;
            h.style.backgroundColor = prevBg;
            tip.remove();
          }, 1200);
        },
        { lbl: label, act: action, clr: safeColor }
      );
    } catch {
      /* non-fatal */
    }
  }

  /**
   * Capture a screenshot with a sanitized filename.
   */
  async captureScreenshot(_label: string): Promise<string> {
    try {
      const base = path.resolve(this.screenshotDir);
      // CWE-22: timestamp-only filename, explicit guard
      const filePath = path.resolve(base, `${Date.now()}.png`);
      if (!filePath.startsWith(base + path.sep)) return '';
      await this.page.screenshot({ path: filePath, fullPage: false });
      return filePath;
    } catch {
      return '';
    }
  }

  /**
   * Log a structured observation to console.
   */
  private logObservation(obs: StepObservation): void {
    const icon = obs.success ? '✅' : '❌';
    const fallback = obs.usedFallback ? ` [fallback:${obs.strategy}]` : '';
    const retry = obs.retryCount > 0 ? ` [retries:${obs.retryCount}]` : '';

    Logger.info(
      `${icon} ${obs.stepLabel} (${obs.durationMs}ms)${fallback}${retry} ` +
        `[confidence:${obs.confidence}]`
    );

    if (!obs.success && obs.error) {
      Logger.warn(`   Error: ${obs.error.split('\n')[0].slice(0, 120)}`);
    }
  }

  /**
   * Get all observations for this session.
   */
  getObservations(): StepObservation[] {
    return [...this.observations];
  }

  /**
   * Get summary stats for the session.
   */
  getSummary(): {
    total: number;
    passed: number;
    failed: number;
    fallbacks: number;
    avgDurationMs: number;
  } {
    const total = this.observations.length;
    const passed = this.observations.filter((o) => o.success).length;
    const failed = total - passed;
    const fallbacks = this.observations.filter((o) => o.usedFallback).length;
    const avgDurationMs =
      total > 0 ? Math.round(this.observations.reduce((s, o) => s + o.durationMs, 0) / total) : 0;
    return { total, passed, failed, fallbacks, avgDurationMs };
  }

  /**
   * Write observations to a JSON report file.
   */
  writeReport(testName: string): string {
    const base = path.resolve(DEFAULT_CONFIG.logDir);
    fs.mkdirSync(base, { recursive: true });
    // CWE-22: timestamp-only filename, explicit guard
    const filePath = path.resolve(base, `${Date.now()}-observations.json`);
    if (!filePath.startsWith(base + path.sep)) return '';
    fs.writeFileSync(
      filePath,
      JSON.stringify(
        {
          testName,
          summary: this.getSummary(),
          steps: this.observations,
        },
        null,
        2
      ),
      'utf8'
    );
    Logger.info(`StepObserver: report saved: ${filePath}`);
    return filePath;
  }

  /**
   * Print a summary table to console after test completion.
   */
  printSummary(): void {
    const s = this.getSummary();
    Logger.info(`\n${'─'.repeat(55)}`);
    Logger.info(`  Step Observations Summary`);
    Logger.info(`${'─'.repeat(55)}`);
    Logger.info(`  Total:      ${s.total}`);
    Logger.info(`  Passed:     ${s.passed}`);
    Logger.info(`  Failed:     ${s.failed}`);
    Logger.info(`  Fallbacks:  ${s.fallbacks}`);
    Logger.info(`  Avg time:   ${s.avgDurationMs}ms`);
    Logger.info(`${'─'.repeat(55)}`);

    // Show fallback details
    const fallbacks = this.observations.filter((o) => o.usedFallback);
    if (fallbacks.length > 0) {
      Logger.warn(`  Fallback steps (consider updating locators):`);
      fallbacks.forEach((o) =>
        Logger.warn(`    "${o.stepLabel}" used ${o.strategy} (confidence: ${o.confidence})`)
      );
    }
  }
}
