import { Page, expect } from '@playwright/test';
import { runSteps } from '../core/WorkflowRunner';
import { WorkflowResult, WorkflowOptions } from '../core/WorkflowRunner';
import { Step, SuiteType } from '../types';
import { Logger } from '../utils/Logger';
import { ErrorLogger } from '../utils/ErrorLogger';
import { DEFAULT_CONFIG } from '../config';
import { resolveLocatorToPlaywright } from '../engine/ActionRouter';
import * as fs from 'fs';
import * as path from 'path';

export abstract class BasePage {
  protected errorLogger: ErrorLogger;

  constructor(
    protected page: Page,
    testName = 'Unknown Test'
  ) {
    // Auto-wire ErrorLogger — every page model captures 400/500 errors automatically
    this.errorLogger = new ErrorLogger(page, testName);
  }

  protected abstract url: string;
  protected abstract pageIdentifier: string;

  // ── Error monitoring ────────────────────────────────────────────────────────

  /** Start capturing HTTP 4xx/5xx errors. Call in test beforeEach or at start of test. */
  async startErrorMonitoring(): Promise<void> {
    await this.errorLogger.start();
  }

  /** Stop capturing and write log file. Call in test afterEach or at end of test. */
  async stopErrorMonitoring(): Promise<void> {
    await this.errorLogger.stop();
  }

  /** Assert no HTTP errors occurred — throws with full details if any found */
  assertNoHttpErrors(): void {
    this.errorLogger.assertNoErrors();
  }

  /** Assert no 5xx server errors — 4xx may be expected in negative tests */
  assertNoServerErrors(): void {
    this.errorLogger.assertNoServerErrors();
  }

  /** Get all captured HTTP errors for custom assertions */
  getHttpErrors() {
    return this.errorLogger.getErrors();
  }

  // ── Navigation ──────────────────────────────────────────────────────────────

  async goto(
    waitUntil: 'domcontentloaded' | 'networkidle' | 'load' = 'domcontentloaded'
  ): Promise<void> {
    await this.page.goto(this.url, { waitUntil, timeout: 30000 });
    Logger.info(`Navigated to: ${this.url}`);
  }

  async waitForLoad(timeout = DEFAULT_CONFIG.waitTimeout): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded', { timeout });
  }

  async assertOnPage(timeout = DEFAULT_CONFIG.waitTimeout): Promise<void> {
    await this.page.locator(this.pageIdentifier).first().waitFor({ state: 'visible', timeout });
    Logger.info(`On page: ${this.constructor.name}`);
  }

  // ── Step runner ─────────────────────────────────────────────────────────────

  async run(
    steps: Step[],
    name: string,
    suite: SuiteType = 'general',
    options: Partial<WorkflowOptions> = {}
  ): Promise<WorkflowResult> {
    return runSteps(this.page, steps, {
      name,
      suite,
      stopOnFailure: true,
      screenshotOnFailure: true,
      ...options,
    });
  }

  // ── Dropdown helpers ────────────────────────────────────────────────────────

  /**
   * Select from a native HTML <select> element by visible text, value, or index.
   *
   * @param locator  CSS/Codegen locator for the <select> element
   * @param option   The option to select — can be visible text, value attribute, or index
   * @param by       How to match: "label" (visible text), "value" (value attr), "index"
   *
   * @example
   *   await page.selectDropdown("#status", "Active")
   *   await page.selectDropdown("#status", "active", "value")
   *   await page.selectDropdown("#status", "0", "index")
   */
  async selectDropdown(
    locator: string,
    option: string,
    by: 'label' | 'value' | 'index' = 'label'
  ): Promise<void> {
    const el = this.page.locator(locator).first();
    await el.waitFor({ state: 'visible', timeout: DEFAULT_CONFIG.waitTimeout });

    if (by === 'label') await el.selectOption({ label: option });
    else if (by === 'value') await el.selectOption({ value: option });
    else if (by === 'index') await el.selectOption({ index: parseInt(option, 10) });

    const selected = await el.inputValue();
    Logger.info(`Dropdown "${locator}" → selected: "${selected}" (by ${by}: "${option}")`);
  }

  /**
   * Select from a Select2 custom dropdown (used in OnCallSuite and many legacy apps).
   * Select2 replaces native <select> with a custom div-based widget.
   *
   * @param triggerLocator  CSS locator for the Select2 trigger element (the visible dropdown)
   * @param optionText      Exact visible text of the option to select
   *
   * @example
   *   await page.selectSelect2Dropdown(
   *     "#s2id_record_leaveType > .select2-choice",
   *     "-MAJOR NON-TRAFFIC"
   *   )
   */
  async selectSelect2Dropdown(triggerLocator: string, optionText: string): Promise<void> {
    // Step 1: Click the trigger to open the dropdown
    await this.page.locator(triggerLocator).first().click();
    Logger.debug(`Select2: opened dropdown "${triggerLocator}"`);

    // Step 2: Wait for the options list to appear
    const optionsList = this.page.locator('.select2-results li, .select2-drop li');
    await optionsList.first().waitFor({ state: 'visible', timeout: DEFAULT_CONFIG.waitTimeout });

    // Step 3: Click the matching option by text
    const option = this.page.getByRole('option', { name: optionText });
    const optionCount = await option.count();

    if (optionCount > 0) {
      await option.first().click();
    } else {
      // Fallback: find by text content in the list
      await this.page.locator(`.select2-results li:has-text("${optionText}")`).first().click();
    }

    Logger.info(`Select2 "${triggerLocator}" → selected: "${optionText}"`);
  }

  /**
   * Select multiple options from a native multi-select <select> element.
   *
   * @param locator  CSS locator for the <select multiple> element
   * @param options  Array of option texts or values to select
   */
  async selectMultiple(locator: string, options: string[]): Promise<void> {
    const el = this.page.locator(locator).first();
    await el.waitFor({ state: 'visible', timeout: DEFAULT_CONFIG.waitTimeout });
    await el.selectOption(options.map((o) => ({ label: o })));
    Logger.info(`Multi-select "${locator}" → selected: [${options.join(', ')}]`);
  }

  // ── Date picker helpers ─────────────────────────────────────────────────────

  /**
   * Fill a plain date input field directly with a formatted date string.
   * Use this for standard <input type="date"> or text inputs that accept dates.
   *
   * @param locator     CSS/Codegen locator for the date input
   * @param dateValue   Date string in the format the field expects (e.g. "2024-01-15", "01/15/2024")
   *
   * @example
   *   await page.fillDate("#startDate", "2024-01-15")
   *   await page.fillDate("getByLabel('Start Date')", "01/15/2024")
   */
  async fillDate(locator: string, dateValue: string): Promise<void> {
    const el = this.page.locator(locator).first();
    await el.waitFor({ state: 'visible', timeout: DEFAULT_CONFIG.waitTimeout });
    await el.clear();
    await el.fill(dateValue);
    // Press Tab to confirm the date entry and trigger any change events
    await el.press('Tab');
    Logger.info(`Date field "${locator}" → filled: "${dateValue}"`);
  }

  /**
   * Select a date from a calendar/datepicker widget by clicking the trigger
   * then clicking the day number.
   *
   * Works with most calendar widgets that show a grid of day buttons.
   *
   * @param triggerLocator  CSS locator for the calendar icon/trigger button
   * @param day             Day number to click (e.g. "4", "15", "28")
   * @param timeFieldLocator  Optional: locator for the time text field to click after date selection
   * @param timeValue         Optional: value to fill into the time field (e.g. "00", "1200")
   *
   * @example
   *   // Simple date selection
   *   await page.selectDateFromPicker("#leaveDate_df", "4")
   *
   *   // Date + time
   *   await page.selectDateFromPicker("#leaveDate_df", "4", "#leaveDate_tf", "00")
   */
  async selectDateFromPicker(
    triggerLocator: string,
    day: string,
    timeFieldLocator?: string,
    timeValue?: string
  ): Promise<void> {
    // Step 1: Click the calendar trigger to open the picker
    await this.page.locator(triggerLocator).first().click();
    Logger.debug(`DatePicker: opened "${triggerLocator}"`);

    // Step 2: Wait for the calendar to appear and click the day
    const dayButton = this.page.getByRole('button', { name: day, exact: true });
    await dayButton.first().waitFor({ state: 'visible', timeout: DEFAULT_CONFIG.waitTimeout });
    await dayButton.first().click();
    Logger.info(`DatePicker "${triggerLocator}" → selected day: ${day}`);

    // Step 3: If a time field is provided, fill it
    if (timeFieldLocator) {
      await this.page.locator(timeFieldLocator).first().click();
      if (timeValue !== undefined) {
        await this.page.locator(timeFieldLocator).first().fill(timeValue);
        Logger.info(`Time field "${timeFieldLocator}" → filled: "${timeValue}"`);
      }
    }
  }

  /**
   * Select a date from a month/year navigation calendar.
   * Navigates to the correct month/year first, then clicks the day.
   *
   * @param triggerLocator   CSS locator for the calendar trigger
   * @param targetDate       Date object or ISO string (e.g. "2024-03-15")
   * @param prevMonthLocator CSS locator for the "previous month" button
   * @param nextMonthLocator CSS locator for the "next month" button
   * @param monthYearLocator CSS locator for the month/year display text
   */
  async selectDateWithNavigation(
    triggerLocator: string,
    targetDate: Date | string,
    prevMonthLocator = '.datepicker-prev, .prev',
    nextMonthLocator = '.datepicker-next, .next',
    monthYearLocator = '.datepicker-switch, .month'
  ): Promise<void> {
    const target = typeof targetDate === 'string' ? new Date(targetDate) : targetDate;
    const targetMonth = target.getMonth();
    const targetYear = target.getFullYear();
    const targetDay = target.getDate().toString();

    await this.page.locator(triggerLocator).first().click();
    Logger.debug(`DatePicker with nav: opened "${triggerLocator}"`);

    // Navigate to the correct month/year (max 24 attempts)
    for (let attempt = 0; attempt < 24; attempt++) {
      const headerText = (await this.page.locator(monthYearLocator).first().textContent()) ?? '';

      // Parse month/year from header text using regex — avoids locale-dependent new Date(string)
      // Handles formats like "March 2024", "Mar 2024", "2024-03"
      const monthNames = [
        'jan',
        'feb',
        'mar',
        'apr',
        'may',
        'jun',
        'jul',
        'aug',
        'sep',
        'oct',
        'nov',
        'dec',
      ];
      const yearMatch = headerText.match(/(\d{4})/);
      const monthMatch = headerText.toLowerCase().match(/([a-z]{3,})/);

      if (!yearMatch || !monthMatch) break; // can't parse — stop navigating

      const currentYear = parseInt(yearMatch[1], 10);
      const currentMonth = monthNames.findIndex((m) => monthMatch[1].startsWith(m));

      if (currentYear === targetYear && currentMonth === targetMonth) break;

      const isAfter =
        currentYear > targetYear || (currentYear === targetYear && currentMonth > targetMonth);

      if (isAfter) await this.page.locator(prevMonthLocator).first().click();
      else await this.page.locator(nextMonthLocator).first().click();

      await this.page.waitForTimeout(200);
    }

    await this.page.getByRole('button', { name: targetDay, exact: true }).first().click();
    Logger.info(`DatePicker "${triggerLocator}" → selected: ${target.toDateString()}`);
  }

  // ── Assertions ──────────────────────────────────────────────────────────────

  async assertVisible(locator: string, timeout = DEFAULT_CONFIG.waitTimeout): Promise<void> {
    // Use resolveLocatorToPlaywright so Codegen strings like getByRole(...) work here too
    const el = resolveLocatorToPlaywright(this.page, locator) ?? this.page.locator(locator);
    await el.first().waitFor({ state: 'visible', timeout });
  }

  async assertText(locator: string, expectedText: string): Promise<void> {
    const text = await this.page.locator(locator).first().textContent();
    expect(text ?? '').toContain(expectedText);
  }

  async assertUrl(contains: string): Promise<void> {
    expect(this.page.url()).toContain(contains);
  }

  async assertTitle(contains: string): Promise<void> {
    const title = await this.page.title();
    expect(title).toContain(contains);
  }

  // ── Queries ─────────────────────────────────────────────────────────────────

  async isVisible(locator: string): Promise<boolean> {
    try {
      const el = resolveLocatorToPlaywright(this.page, locator) ?? this.page.locator(locator);
      return await el.first().isVisible();
    } catch {
      return false;
    }
  }

  async getInputValue(locator: string): Promise<string> {
    try {
      return await this.page.locator(locator).first().inputValue();
    } catch {
      return '';
    }
  }

  async getText(locator: string): Promise<string> {
    try {
      return (await this.page.locator(locator).first().textContent()) ?? '';
    } catch {
      return '';
    }
  }

  async hasText(text: string): Promise<boolean> {
    return (await this.page.locator(`text=${text}`).count()) > 0;
  }

  async waitForVisible(locator: string, timeout = DEFAULT_CONFIG.waitTimeout): Promise<boolean> {
    try {
      await this.page.locator(locator).first().waitFor({ state: 'visible', timeout });
      return true;
    } catch {
      return false;
    }
  }

  async waitForHidden(locator: string, timeout = DEFAULT_CONFIG.waitTimeout): Promise<boolean> {
    try {
      await this.page.locator(locator).first().waitFor({ state: 'hidden', timeout });
      return true;
    } catch {
      return false;
    }
  }

  async count(locator: string): Promise<number> {
    try {
      return await this.page.locator(locator).count();
    } catch {
      return 0;
    }
  }

  // ── Utilities ───────────────────────────────────────────────────────────────

  async screenshot(name?: string): Promise<string> {
    const dir = DEFAULT_CONFIG.screenshotDir;
    fs.mkdirSync(dir, { recursive: true });
    const rawName = name ?? `${this.constructor.name}-${Date.now()}.png`;
    const safeName = path.basename(rawName.replace(/[^a-z0-9._-]/gi, '_'));
    const base = path.resolve(dir);
    const file = path.join(base, safeName);
    if (!file.startsWith(base + path.sep)) {
      throw new Error(`BasePage.screenshot: path traversal blocked for "${name}"`);
    }
    await this.page.screenshot({ path: file, fullPage: true });
    Logger.info(`Screenshot: ${file}`);
    return file;
  }

  async waitMs(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms);
  }

  get currentUrl(): string {
    return this.page.url();
  }
}
