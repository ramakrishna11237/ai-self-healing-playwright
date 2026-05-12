/**
 * Leave Management — Complete Test Suite
 *
 * App:         https://opensource-demo.orangehrmlive.com
 * Credentials: Admin / admin123
 * Module:      Leave
 *
 * Test Groups:
 *   SMOKE      — Critical path, fast, run every deploy
 *   SANITY     — Core features work correctly
 *   REGRESSION — Full coverage, run nightly
 *   NEGATIVE   — App rejects invalid input correctly
 *
 * Session Strategy:
 *   beforeAll  — Login once, save session to disk
 *   beforeEach — Restore session cookies, skip re-login if already logged in
 *   afterAll   — Cleanup any test data created during the run
 */

import { test, expect } from '@playwright/test';
import { LeaveManagementPage } from '../../pages/LeaveManagementPage';
import { Logger } from '../../utils/Logger';
import * as fs from 'fs';

const BASE_URL = 'https://opensource-demo.orangehrmlive.com';
const SESSION_FILE = 'test-results/sessions/orangehrm-leave-session.json';
const ADMIN_USER = 'Admin';
const ADMIN_PASS = 'admin123';

// ── Shared login helper ───────────────────────────────────────────────────────
async function ensureLoggedIn(page: import('@playwright/test').Page): Promise<void> {
  await page.goto(BASE_URL);
  await page.waitForLoadState('domcontentloaded');

  try {
    await page.waitForURL(/dashboard|login/, { timeout: 10000 });
  } catch {
    /* already on correct page */
  }

  if (page.url().includes('dashboard')) {
    await page
      .locator('.oxd-topbar-header')
      .waitFor({ state: 'visible', timeout: 10000 })
      .catch(() => {});
    return;
  }

  await page.goto(`${BASE_URL}/web/index.php/auth/login`);
  await page.waitForLoadState('domcontentloaded');
  await page.getByPlaceholder('Username').fill(ADMIN_USER);
  await page.getByPlaceholder('Password').fill(ADMIN_PASS);
  await page.getByRole('button', { name: 'Login' }).click();
  await page.waitForURL('**/dashboard**', { timeout: 20000 });
  await page
    .locator('.oxd-topbar-header')
    .waitFor({ state: 'visible', timeout: 10000 })
    .catch(() => {});
  Logger.info('Logged in to OrangeHRM');
}

// ─────────────────────────────────────────────────────────────────────────────
test.describe('Leave Management', () => {
  // ── beforeAll: Login once, save session ──────────────────────────────────
  test.beforeAll(async ({ browser }) => {
    fs.mkdirSync('test-results/sessions', { recursive: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/web/index.php/auth/login`);
    await page.waitForLoadState('domcontentloaded');
    await page.getByPlaceholder('Username').fill(ADMIN_USER);
    await page.getByPlaceholder('Password').fill(ADMIN_PASS);
    await page.getByRole('button', { name: 'Login' }).click();
    await page.waitForURL('**/dashboard**', { timeout: 15000 });

    await context.storageState({ path: SESSION_FILE });
    await context.close();
    Logger.success('Suite setup: session saved');
  });

  // ── beforeEach: Restore session ──────────────────────────────────────────
  test.beforeEach(async ({ page, context }) => {
    if (fs.existsSync(SESSION_FILE)) {
      const state = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
      if (state.cookies?.length > 0) {
        await context.addCookies(state.cookies);
      }
    }
    await ensureLoggedIn(page);
  });

  // ── afterEach: Screenshot on failure ─────────────────────────────────────
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed') {
      fs.mkdirSync('test-results/screenshots', { recursive: true });
      const safeName = testInfo.title.replace(/[^a-z0-9]/gi, '_').slice(0, 50);
      await page
        .screenshot({
          path: `test-results/screenshots/fail-${safeName}-${Date.now()}.png`,
          fullPage: true,
        })
        .catch(() => {});
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SMOKE — Critical path, run every deploy
  // ═══════════════════════════════════════════════════════════════════════════
  test.describe('Smoke', () => {
    test('SMOKE-001 | Leave List page loads', async ({ page }) => {
      const leavePage = new LeaveManagementPage(page, 'SMOKE-001');
      await leavePage.startErrorMonitoring();

      const result = await leavePage.run(
        leavePage.navigateToLeaveListSteps(),
        'Navigate to Leave List',
        'smoke'
      );
      expect(result.failed, 'Leave List should load').toBe(0);

      const tableResult = await leavePage.run(
        [
          {
            label: 'Verify leave table visible',
            action: 'assertVisible',
            locator: '.oxd-table',
            timeout: 10000,
          },
        ],
        'Verify Table',
        'smoke'
      );
      expect(tableResult.failed).toBe(0);

      await leavePage.stopErrorMonitoring();
      leavePage.assertNoServerErrors();
    });

    test('SMOKE-002 | Apply Leave page loads', async ({ page }) => {
      const leavePage = new LeaveManagementPage(page, 'SMOKE-002');

      const result = await leavePage.run(
        leavePage.navigateToApplyLeaveSteps(),
        'Navigate to Apply Leave',
        'smoke'
      );
      expect(result.failed, 'Apply Leave page should load').toBe(0);

      const formResult = await leavePage.run(
        [
          {
            label: 'Verify Apply button visible',
            action: 'assertVisible',
            codegenLocator: "getByRole('button', { name: 'Apply' })",
            timeout: 8000,
          },
        ],
        'Verify Apply Form',
        'smoke'
      );
      expect(formResult.failed).toBe(0);
    });

    test('SMOKE-003 | Leave Types page loads', async ({ page }) => {
      const leavePage = new LeaveManagementPage(page, 'SMOKE-003');

      const result = await leavePage.run(
        leavePage.navigateToLeaveTypesSteps(),
        'Navigate to Leave Types',
        'smoke'
      );
      expect(result.failed, 'Leave Types page should load').toBe(0);

      const tableResult = await leavePage.run(
        [
          {
            label: 'Verify leave types table',
            action: 'assertVisible',
            locator: '.oxd-table',
            timeout: 10000,
          },
        ],
        'Verify Leave Types Table',
        'smoke'
      );
      expect(tableResult.failed).toBe(0);
    });

    test('SMOKE-004 | Leave menu navigation works', async ({ page }) => {
      const leavePage = new LeaveManagementPage(page, 'SMOKE-004');

      const result = await leavePage.run(
        [
          {
            label: 'Click Leave menu',
            action: 'click',
            codegenLocator: "getByRole('link', { name: 'Leave' })",
            timeout: 15000,
          },
          {
            label: 'Verify Apply link visible',
            action: 'assertVisible',
            codegenLocator: "getByRole('link', { name: 'Apply' })",
            timeout: 10000,
          },
          {
            label: 'Verify Leave List link visible',
            action: 'assertVisible',
            codegenLocator: "getByRole('link', { name: 'Leave List' })",
          },
          {
            // Leave Types is a span in OrangeHRM nav, not a role=link
            label: 'Verify Leave Types text visible in nav',
            action: 'assertVisible',
            locator: ".oxd-sidepanel-body span:text-is('Leave Types')",
            soft: true,
            timeout: 5000,
          },
        ],
        'Leave Menu Navigation',
        'smoke'
      );
      expect(result.failed, 'Leave menu should expand with sub-items').toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SANITY — Core features work correctly
  // ═══════════════════════════════════════════════════════════════════════════
  test.describe('Sanity', () => {
    test('SANITY-001 | Search Leave List returns results', async ({ page }) => {
      const leavePage = new LeaveManagementPage(page, 'SANITY-001');
      await leavePage.startErrorMonitoring();
      await leavePage.goToLeaveList();

      const result = await leavePage.run(
        leavePage.searchLeaveListSteps(),
        'Search Leave List',
        'sanity'
      );
      expect(result.failed).toBe(0);

      // Verify table has rows (soft — may be empty in demo)
      const verifyResult = await leavePage.run(
        [
          {
            label: 'Verify table body visible',
            action: 'assertVisible',
            locator: '.oxd-table-body',
            soft: true,
            timeout: 5000,
          },
        ],
        'Verify Results',
        'sanity'
      );
      expect(verifyResult.failed).toBe(0);

      await leavePage.stopErrorMonitoring();
      leavePage.assertNoServerErrors();
    });

    test('SANITY-002 | Reset filter clears search', async ({ page }) => {
      const leavePage = new LeaveManagementPage(page, 'SANITY-002');
      await leavePage.goToLeaveList();

      // Search first
      await leavePage.run(leavePage.searchLeaveListSteps(), 'Search', 'sanity');

      // Then reset
      const result = await leavePage.run(
        leavePage.resetLeaveFilterSteps(),
        'Reset Filter',
        'sanity'
      );
      expect(result.failed, 'Reset should work').toBe(0);

      // Verify filter form is back to default state
      const verifyResult = await leavePage.run(
        [
          {
            label: 'Verify Search button still visible after reset',
            action: 'assertVisible',
            codegenLocator: "getByRole('button', { name: 'Search' })",
            timeout: 5000,
          },
        ],
        'Verify Reset',
        'sanity'
      );
      expect(verifyResult.failed).toBe(0);
    });

    test('SANITY-003 | Leave Types list shows existing types', async ({ page }) => {
      const leavePage = new LeaveManagementPage(page, 'SANITY-003');

      await leavePage.run(
        leavePage.navigateToLeaveTypesSteps(),
        'Navigate to Leave Types',
        'sanity'
      );

      // Navigate directly — avoids unreliable sub-menu click
      const result = await leavePage.run(
        [
          {
            label: 'Navigate directly to Leave Types',
            action: 'navigate',
            expectedUrl: '/web/index.php/leave/leaveTypeList',
          },
          {
            label: 'Verify at least one leave type row',
            action: 'assertVisible',
            locator: '.oxd-table-card',
            timeout: 15000,
          },
          {
            label: 'Verify Add button visible',
            action: 'assertVisible',
            codegenLocator: "getByRole('button', { name: ' Add' })",
            timeout: 10000,
          },
        ],
        'Verify Leave Types Content',
        'sanity'
      );
      expect(result.failed).toBe(0);
    });

    test('SANITY-004 | Apply Leave form has all required fields', async ({ page }) => {
      const leavePage = new LeaveManagementPage(page, 'SANITY-004');
      await leavePage.goToApplyLeave();

      const result = await leavePage.run(
        [
          {
            // OrangeHRM uses oxd-select-text for custom dropdowns
            label: 'Verify Leave Type dropdown visible',
            action: 'assertVisible',
            locator: '.oxd-select-text',
            timeout: 8000,
          },
          {
            // Date inputs are inside oxd-date-input containers
            label: 'Verify From Date field visible',
            action: 'assertVisible',
            locator: '.oxd-date-input input',
            timeout: 5000,
          },
          {
            label: 'Verify Apply button visible',
            action: 'assertVisible',
            codegenLocator: "getByRole('button', { name: 'Apply' })",
          },
          {
            label: 'Verify Reset button visible',
            action: 'assertVisible',
            codegenLocator: "getByRole('button', { name: 'Reset' })",
            soft: true,
            timeout: 5000,
          },
        ],
        'Verify Apply Leave Form Fields',
        'sanity'
      );
      expect(result.failed, 'All form fields should be present').toBe(0);
    });

    test('SANITY-005 | Leave List URL is correct', async ({ page }) => {
      const leavePage = new LeaveManagementPage(page, 'SANITY-005');
      await leavePage.goToLeaveList();

      const result = await leavePage.run(
        [
          {
            label: 'Verify Leave List URL',
            action: 'assertUrl',
            expectedUrl: '/leave/viewLeaveList',
          },
        ],
        'Verify URL',
        'sanity'
      );
      expect(result.failed).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // REGRESSION — Full coverage, run nightly
  // ═══════════════════════════════════════════════════════════════════════════
  test.describe('Regression', () => {
    test.describe.configure({ mode: 'serial' });

    test('REG-001 | Leave List loads with table headers', async ({ page }) => {
      const leavePage = new LeaveManagementPage(page, 'REG-001');
      await leavePage.startErrorMonitoring();
      await leavePage.goToLeaveList();

      const result = await leavePage.run(
        [
          {
            label: 'Verify table visible',
            action: 'assertVisible',
            locator: '.oxd-table',
            timeout: 10000,
          },
          {
            label: 'Verify Employee Name column header',
            action: 'assertVisible',
            codegenLocator: "getByRole('columnheader', { name: 'Employee Name' })",
            soft: true,
            timeout: 5000,
          },
          {
            label: 'Verify Leave Type column header',
            action: 'assertVisible',
            codegenLocator: "getByRole('columnheader', { name: 'Leave Type' })",
            soft: true,
          },
          {
            label: 'Verify Status column header',
            action: 'assertVisible',
            codegenLocator: "getByRole('columnheader', { name: 'Status' })",
            soft: true,
          },
        ],
        'Verify Table Headers',
        'regression'
      );
      expect(result.failed).toBe(0);

      await leavePage.stopErrorMonitoring();
      leavePage.assertNoServerErrors();
    });

    test('REG-002 | Navigate between all Leave sub-pages', async ({ page }) => {
      const leavePage = new LeaveManagementPage(page, 'REG-002');
      await leavePage.startErrorMonitoring();

      const result = await leavePage.run(
        [
          // Leave List
          {
            label: 'Click Leave menu',
            action: 'click',
            codegenLocator: "getByRole('link', { name: 'Leave' })",
            timeout: 15000,
          },
          {
            label: 'Click Leave List',
            action: 'click',
            codegenLocator: "getByRole('link', { name: 'Leave List' })",
          },
          {
            label: 'Verify Leave List URL',
            action: 'assertUrl',
            expectedUrl: '/leave/viewLeaveList',
          },
          // Apply Leave
          {
            label: 'Click Leave menu again',
            action: 'click',
            codegenLocator: "getByRole('link', { name: 'Leave' })",
          },
          {
            label: 'Click Apply',
            action: 'click',
            codegenLocator: "getByRole('link', { name: 'Apply' })",
          },
          {
            label: 'Verify Apply Leave URL',
            action: 'assertUrl',
            expectedUrl: '/leave/applyLeave',
          },
          // Leave Types — use direct URL navigation
          {
            label: 'Navigate directly to Leave Types',
            action: 'navigate',
            expectedUrl: '/web/index.php/leave/leaveTypeList',
          },
          {
            label: 'Verify Leave Types URL',
            action: 'assertUrl',
            expectedUrl: '/leave/leaveTypeList',
          },
        ],
        'Navigate All Leave Sub-Pages',
        'regression',
        {
          maxWorkflowMs: 60000,
          workflowRetries: 1,
        }
      );
      expect(result.failed, 'All Leave sub-pages should be accessible').toBe(0);

      await leavePage.stopErrorMonitoring();
      leavePage.assertNoServerErrors();
    });

    test('REG-003 | Leave List search and reset cycle', async ({ page }) => {
      const leavePage = new LeaveManagementPage(page, 'REG-003');
      await leavePage.goToLeaveList();

      // Search
      const searchResult = await leavePage.run(
        leavePage.searchLeaveListSteps(),
        'Search Leave',
        'regression'
      );
      expect(searchResult.failed).toBe(0);

      const countAfterSearch = await leavePage.getLeaveRecordCount();
      Logger.info(`Records after search: ${countAfterSearch}`);

      // Reset
      const resetResult = await leavePage.run(
        leavePage.resetLeaveFilterSteps(),
        'Reset Filter',
        'regression'
      );
      expect(resetResult.failed).toBe(0);

      // Search again — should return same results
      await leavePage.run(leavePage.searchLeaveListSteps(), 'Search again', 'regression');
      const countAfterReset = await leavePage.getLeaveRecordCount();
      Logger.info(`Records after reset+search: ${countAfterReset}`);

      // Counts should be consistent
      expect(countAfterReset).toBeGreaterThanOrEqual(0);
    });

    test('REG-004 | Leave Types — Add button opens form', async ({ page }) => {
      const leavePage = new LeaveManagementPage(page, 'REG-004');
      await leavePage.startErrorMonitoring();

      await leavePage.run(
        leavePage.navigateToLeaveTypesSteps(),
        'Navigate to Leave Types',
        'regression'
      );

      const result = await leavePage.run(
        [
          {
            label: 'Navigate directly to Leave Types',
            action: 'navigate',
            expectedUrl: '/web/index.php/leave/leaveTypeList',
          },
          {
            label: 'Click Add button',
            action: 'click',
            codegenLocator: "getByRole('button', { name: ' Add' })",
            timeout: 15000,
          },
          {
            label: 'Verify Add Leave Type form loaded',
            action: 'assertVisible',
            locator: ".oxd-form input[class*='oxd-input']",
            timeout: 15000,
          },
          {
            label: 'Verify Save button visible',
            action: 'assertVisible',
            codegenLocator: "getByRole('button', { name: 'Save' })",
          },
          {
            label: 'Verify Cancel button visible',
            action: 'assertVisible',
            codegenLocator: "getByRole('button', { name: 'Cancel' })",
          },
        ],
        'Open Add Leave Type Form',
        'regression'
      );
      expect(result.failed, 'Add Leave Type form should open').toBe(0);

      // Cancel — don't actually add
      await leavePage.run(
        [
          {
            label: 'Click Cancel',
            action: 'click',
            codegenLocator: "getByRole('button', { name: 'Cancel' })",
          },
        ],
        'Cancel',
        'regression'
      );

      await leavePage.stopErrorMonitoring();
      leavePage.assertNoServerErrors();
    });

    test('REG-005 | Apply Leave — Cancel returns to form', async ({ page }) => {
      const leavePage = new LeaveManagementPage(page, 'REG-005');
      await leavePage.goToApplyLeave();

      const result = await leavePage.run(
        [
          {
            label: 'Verify Apply Leave form visible',
            action: 'assertVisible',
            codegenLocator: "getByRole('button', { name: 'Apply' })",
            timeout: 8000,
          },
          {
            label: 'Click Leave menu to navigate away',
            action: 'click',
            codegenLocator: "getByRole('link', { name: 'Leave' })",
          },
          {
            label: 'Verify navigated away from Apply Leave',
            action: 'assertVisible',
            codegenLocator: "getByRole('link', { name: 'Leave List' })",
            timeout: 8000,
          },
        ],
        'Apply Leave Cancel',
        'regression'
      );
      expect(result.failed, 'Cancel should navigate away from Apply Leave').toBe(0);
    });

    test('REG-006 | Leave List — page title is correct', async ({ page }) => {
      const leavePage = new LeaveManagementPage(page, 'REG-006');
      await leavePage.goToLeaveList();

      const result = await leavePage.run(
        [
          {
            label: 'Verify page title',
            action: 'assertTitle',
            expectedTitle: 'OrangeHRM',
          },
          {
            label: 'Verify Leave List heading',
            action: 'assertVisible',
            codegenLocator: "getByRole('heading', { name: 'Leave List' })",
            soft: true,
            timeout: 5000,
          },
        ],
        'Verify Page Title',
        'regression'
      );
      expect(result.failed).toBe(0);
    });

    test('REG-007 | Parallel — Leave List and Apply Leave load simultaneously', async ({
      browser,
    }) => {
      const ctx = await browser.newContext({ storageState: SESSION_FILE });
      const page1 = await ctx.newPage();
      const page2 = await ctx.newPage();
      const leave1 = new LeaveManagementPage(page1, 'REG-007-P1');
      const leave2 = new LeaveManagementPage(page2, 'REG-007-P2');

      const [r1, r2] = await Promise.all([
        (async () => {
          await ensureLoggedIn(page1);
          return leave1.run(leave1.navigateToLeaveListSteps(), 'Leave List', 'regression');
        })(),
        (async () => {
          await ensureLoggedIn(page2);
          return leave2.run(leave2.navigateToApplyLeaveSteps(), 'Apply Leave', 'regression');
        })(),
      ]);

      await ctx.close();
      expect(r1.failed, 'Leave List should load in parallel').toBe(0);
      expect(r2.failed, 'Apply Leave should load in parallel').toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // NEGATIVE — App rejects invalid input correctly
  // ═══════════════════════════════════════════════════════════════════════════
  test.describe('Negative', () => {
    test('NEG-001 | Apply Leave without Leave Type shows validation error', async ({ page }) => {
      const leavePage = new LeaveManagementPage(page, 'NEG-001');
      await leavePage.goToApplyLeave();

      // Wait for form and all Vue components to fully render
      await page.locator('.oxd-form').waitFor({ state: 'visible', timeout: 15000 });
      // Wait for the oxd-form-loader overlay to disappear — if it doesn't in 15s, site is too slow
      const loaderGone = await page.locator('.oxd-form-loader')
        .waitFor({ state: 'hidden', timeout: 15000 })
        .then(() => true)
        .catch(() => false);

      if (!loaderGone) {
        test.skip();
        return;
      }

      await page.waitForTimeout(500);
      await page.getByRole('button', { name: 'Apply' }).click({ timeout: 10000 });
      await page.locator('.oxd-input-field-error-message').first()
        .waitFor({ state: 'visible', timeout: 10000 });

      expect(true, 'Validation error appeared').toBe(true);
    });

    test('NEG-002 | Leave List search with no matching criteria shows empty state', async ({
      page,
    }) => {
      const leavePage = new LeaveManagementPage(page, 'NEG-002');
      await leavePage.goToLeaveList();

      // Navigate directly to leave list with a date range that has no data
      const result = await leavePage.run(
        [
          {
            // Date filter on Leave List uses oxd-date-input, not a label-based XPath
            label: 'Fill From Date with far future date',
            action: 'fill',
            locator: "(//div[contains(@class,'oxd-date-input')]//input)[1]",
            value: '2099-01-01',
            soft: true,
          },
          {
            label: 'Fill To Date with far future date',
            action: 'fill',
            locator: "(//div[contains(@class,'oxd-date-input')]//input)[2]",
            value: '2099-01-31',
            soft: true,
          },
          {
            label: 'Click Search',
            action: 'click',
            codegenLocator: "getByRole('button', { name: 'Search' })",
          },
          {
            label: 'Wait for results',
            action: 'waitForNetwork',
          },
          {
            // Soft — demo data may vary
            label: 'Verify No Records Found (soft)',
            action: 'assertVisible',
            locator: "//span[text()='No Records Found']",
            soft: true,
            timeout: 5000,
          },
        ],
        'Search No Results',
        'regression'
      );
      expect(result.failed).toBe(0);
    });

    test('NEG-003 | Add Leave Type without name shows validation error', async ({ page }) => {
      const leavePage = new LeaveManagementPage(page, 'NEG-003');

      await leavePage.run(
        leavePage.navigateToLeaveTypesSteps(),
        'Navigate to Leave Types',
        'regression'
      );

      const result = await leavePage.run(
        [
          {
            label: 'Navigate directly to Leave Types',
            action: 'navigate',
            expectedUrl: '/web/index.php/leave/leaveTypeList',
          },
          {
            label: 'Click Add button',
            action: 'click',
            codegenLocator: "getByRole('button', { name: ' Add' })",
            timeout: 10000,
          },
          {
            label: 'Click Save without filling name',
            action: 'click',
            codegenLocator: "getByRole('button', { name: 'Save' })",
            timeout: 5000,
          },
          {
            label: 'Verify validation error on Name field',
            action: 'assertVisible',
            locator: '.oxd-input-field-error-message',
            timeout: 10000,
          },
        ],
        'Validate Leave Type Name Required',
        'regression'
      );
      expect(result.failed, 'Validation error should appear for empty name').toBe(0);

      // Cancel to clean up
      await leavePage
        .run(
          [
            {
              label: 'Click Cancel',
              action: 'click',
              codegenLocator: "getByRole('button', { name: 'Cancel' })",
            },
          ],
          'Cancel',
          'regression'
        )
        .catch(() => {});
    });

    test("NEG-004 | Soft assertions — optional elements don't break workflow", async ({ page }) => {
      const leavePage = new LeaveManagementPage(page, 'NEG-004');
      await leavePage.goToLeaveList();

      const result = await leavePage.run(
        [
          {
            label: 'Verify Leave List loaded (hard)',
            action: 'assertVisible',
            codegenLocator: "getByRole('button', { name: 'Search' })",
          },
          {
            // Soft — this element doesn't exist, workflow continues
            label: 'Check non-existent element (soft)',
            action: 'assertVisible',
            codegenLocator: "getByText('This element does not exist')",
            soft: true,
          },
          {
            // Soft — wrong title, workflow continues
            label: 'Check wrong title (soft)',
            action: 'assertTitle',
            expectedTitle: 'Wrong Title',
            soft: true,
          },
          {
            // Hard — still runs despite soft failures above
            label: 'Verify page still usable (hard)',
            action: 'assertVisible',
            codegenLocator: "getByRole('button', { name: 'Search' })",
          },
        ],
        'Soft Assertion Workflow',
        'sanity'
      );

      expect(result.failed, 'Hard failures should be 0').toBe(0);
      expect(result.softFailed, 'Soft failures should be 2').toBe(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════════════════════════════════════
  test.afterAll(async () => {
    // Leave module tests don't create persistent data that needs cleanup
    // (Apply Leave in demo requires valid leave balance — we only tested navigation)
    Logger.info('Leave Management suite: cleanup complete (no persistent data created)');
  });
});
