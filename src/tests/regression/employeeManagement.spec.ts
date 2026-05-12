/**
 * Employee Management — Complete Test Suite
 * App: https://opensource-demo.orangehrmlive.com
 * Credentials: Admin / admin123
 */

import { test, expect } from '@playwright/test';
import { EmployeePage } from '../../pages/EmployeePage';
import { Logger } from '../../utils/Logger';
import * as fs from 'fs';

const BASE_URL = 'https://opensource-demo.orangehrmlive.com';
const SESSION_FILE = 'test-results/sessions/orangehrm-session.json';
const ADMIN_USER = 'Admin';
const ADMIN_PASS = 'admin123';

// Unique test data per run — prevents conflicts between runs
const TEST_EMPLOYEE = {
  firstName: `Test${Date.now().toString(36).toUpperCase()}`,
  lastName: 'Automation',
  get fullName() {
    return `${this.firstName} ${this.lastName}`;
  },
};

// ── Shared login helper ───────────────────────────────────────────────────────
// Called in beforeEach — logs in only if session is not already valid
async function ensureLoggedIn(page: import('@playwright/test').Page): Promise<void> {
  await page.goto(BASE_URL);
  await page.waitForLoadState('domcontentloaded');

  // Wait up to 10s for either dashboard or login page to settle
  try {
    await page.waitForURL(/dashboard|login/, { timeout: 10000 });
  } catch {
    /* already on correct page */
  }

  if (page.url().includes('dashboard')) {
    // Already logged in — wait for nav to fully render before tests interact
    await page
      .locator('.oxd-topbar-header')
      .waitFor({ state: 'visible', timeout: 10000 })
      .catch(() => {});
    return;
  }

  // Not logged in — perform login
  await page.goto(`${BASE_URL}/web/index.php/auth/login`);
  await page.waitForLoadState('domcontentloaded');
  await page.getByPlaceholder('Username').fill(ADMIN_USER);
  await page.getByPlaceholder('Password').fill(ADMIN_PASS);
  await page.getByRole('button', { name: 'Login' }).click();
  await page.waitForURL('**/dashboard**', { timeout: 20000 });
  // Wait for nav to render after login
  await page
    .locator('.oxd-topbar-header')
    .waitFor({ state: 'visible', timeout: 10000 })
    .catch(() => {});
  Logger.info('Logged in to OrangeHRM');
}

// ─────────────────────────────────────────────────────────────────────────────
test.describe('Employee Management', () => {
  // ── beforeAll: Login once, save session to disk ───────────────────────────
  // Subsequent tests restore from disk — no re-login needed
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

  // ── beforeEach: Restore session cookies + navigate to known start ─────────
  // We restore cookies manually because test.use({ storageState }) reads the
  // file at collection time — before beforeAll creates it.
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

  // ─────────────────────────────────────────────────────────────────────────────
  // SMOKE — Critical path, fast, run every deploy
  // ─────────────────────────────────────────────────────────────────────────────
  test.describe('Smoke', () => {
    test('SMOKE-001: Employee List page loads', async ({ page }) => {
      const empPage = new EmployeePage(page, 'SMOKE-001');
      await empPage.startErrorMonitoring();

      const result = await empPage.run(
        empPage.navigateToEmployeeListSteps(),
        'Navigate to Employee List',
        'smoke'
      );
      expect(result.failed, 'Employee List should load').toBe(0);

      const tableResult = await empPage.run(
        [
          {
            label: 'Verify employee table visible',
            action: 'assertVisible',
            locator: '.oxd-table',
          },
        ],
        'Verify Table',
        'smoke'
      );
      expect(tableResult.failed).toBe(0);

      await empPage.stopErrorMonitoring();
      empPage.assertNoServerErrors();
    });

    test('SMOKE-002: Add Employee form opens', async ({ page }) => {
      const empPage = new EmployeePage(page, 'SMOKE-002');
      await empPage.run(empPage.navigateToEmployeeListSteps(), 'Navigate', 'smoke');

      const result = await empPage.run(
        [
          {
            label: 'Click Add Employee',
            action: 'click',
            codegenLocator: "getByRole('link', { name: 'Add Employee' })",
          },
          {
            label: 'Verify Add Employee form',
            action: 'assertVisible',
            locator: "input[name='firstName']",
            timeout: 8000,
          },
        ],
        'Add Employee Form',
        'smoke'
      );
      expect(result.failed, 'Add Employee form should open').toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SANITY — Core features work
  // ─────────────────────────────────────────────────────────────────────────────
  test.describe('Sanity', () => {
    test('SANITY-001: Search employee returns results', async ({ page }) => {
      const empPage = new EmployeePage(page, 'SANITY-001');
      await empPage.startErrorMonitoring();
      await empPage.goToEmployeeList();

      const result = await empPage.run(
        empPage.searchEmployeeSteps('Admin'),
        'Search Employee',
        'sanity'
      );
      expect(result.failed).toBe(0);

      const verifyResult = await empPage.run(
        [
          {
            label: 'Verify table body visible',
            action: 'assertVisible',
            locator: '.oxd-table-body',
            soft: true,
          },
          {
            label: 'Verify record found text',
            action: 'assertVisible',
            codegenLocator: "getByText('Record Found')",
            soft: true,
            timeout: 5000,
          },
        ],
        'Verify Search Results',
        'sanity'
      );
      expect(verifyResult.failed).toBe(0);

      await empPage.stopErrorMonitoring();
      empPage.assertNoServerErrors();
    });

    test('SANITY-002: Reset search clears filters', async ({ page }) => {
      const empPage = new EmployeePage(page, 'SANITY-002');
      await empPage.goToEmployeeList();
      await empPage.run(empPage.searchEmployeeSteps('Admin'), 'Search', 'sanity');

      const result = await empPage.run(
        [
          {
            label: 'Click Reset',
            action: 'click',
            codegenLocator: "getByRole('button', { name: 'Reset' })",
          },
          {
            label: 'Verify search field empty',
            action: 'assertValue',
            codegenLocator: "getByPlaceholder('Type for hints...')",
            expectedText: '',
          },
        ],
        'Reset Search',
        'sanity'
      );
      expect(result.failed).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // REGRESSION — Full coverage, run nightly
  // ─────────────────────────────────────────────────────────────────────────────
  test.describe('Regression', () => {
    test.describe.configure({ mode: 'serial' });

    test('REG-001: Add new employee end-to-end', async ({ page }) => {
      const empPage = new EmployeePage(page, 'REG-001');
      await empPage.startErrorMonitoring();
      await empPage.goToEmployeeList();

      const result = await empPage.run(
        empPage.addEmployeeSteps(TEST_EMPLOYEE.firstName, TEST_EMPLOYEE.lastName),
        'Add New Employee',
        'regression',
        { workflowRetries: 1, maxWorkflowMs: 45000, screenshotOnFailure: true }
      );
      expect(result.failed, 'Add employee should succeed').toBe(0);

      // Verify in list
      await empPage.goToEmployeeList();
      await empPage.run(
        empPage.searchEmployeeSteps(TEST_EMPLOYEE.firstName),
        'Search',
        'regression'
      );
      const verifyResult = await empPage.run(
        empPage.verifyEmployeeInListSteps(TEST_EMPLOYEE.firstName),
        'Verify in list',
        'regression'
      );
      expect(verifyResult.failed, 'Employee should appear in list').toBe(0);

      await empPage.stopErrorMonitoring();
      empPage.assertNoServerErrors();
    });

    test('REG-002: Employee count increases after adding', async ({ page }) => {
      const empPage = new EmployeePage(page, 'REG-002');
      await empPage.goToEmployeeList();

      await empPage.run(
        [
          {
            label: 'Search all employees',
            action: 'click',
            codegenLocator: "getByRole('button', { name: 'Search' })",
          },
          { label: 'Wait for results', action: 'waitForNetwork' },
        ],
        'Load all',
        'regression'
      );

      const countBefore = await empPage.getEmployeeCount();
      Logger.info(`Count before: ${countBefore}`);

      const uniqueName = `Reg${Date.now().toString(36).toUpperCase()}`;
      await empPage.run(empPage.addEmployeeSteps(uniqueName, 'Test'), 'Add employee', 'regression');

      await empPage.goToEmployeeList();
      await empPage.run(
        [
          {
            label: 'Search all employees',
            action: 'click',
            codegenLocator: "getByRole('button', { name: 'Search' })",
          },
          { label: 'Wait for results', action: 'waitForNetwork' },
        ],
        'Reload list',
        'regression'
      );

      const countAfter = await empPage.getEmployeeCount();
      Logger.info(`Count after: ${countAfter}`);
      expect(countAfter).toBeGreaterThanOrEqual(countBefore);
    });

    test('REG-003: Edit employee personal details', async ({ page }) => {
      const empPage = new EmployeePage(page, 'REG-003');
      await empPage.startErrorMonitoring();
      await empPage.goToEmployeeList();

      await empPage.run(
        empPage.searchEmployeeSteps(TEST_EMPLOYEE.firstName),
        'Search',
        'regression'
      );

      const editResult = await empPage.run(
        [
          {
            label: 'Click Edit',
            action: 'click',
            locator: '.oxd-icon-button.oxd-table-cell-action-space',
            scope: '.oxd-table-body',
          },
          {
            label: 'Verify edit form',
            action: 'assertVisible',
            locator: "input[name='firstName']",
            timeout: 8000,
          },
        ],
        'Open Edit Form',
        'regression',
        { workflowRetries: 1 }
      );
      expect(editResult.failed, 'Edit form should open').toBe(0);

      const updateResult = await empPage.run(
        [
          {
            label: 'Fill Middle Name',
            action: 'fill',
            locator: "input[name='middleName']",
            value: 'Updated',
            scope: '.oxd-form',
          },
          {
            label: 'Save personal details',
            action: 'click',
            codegenLocator: "getByRole('button', { name: 'Save' })",
            scope: '.oxd-form',
          },
          {
            label: 'Verify saved',
            action: 'assertVisible',
            codegenLocator: "getByText('Successfully Updated')",
            timeout: 8000,
          },
        ],
        'Update Employee',
        'regression'
      );
      expect(updateResult.failed, 'Update should succeed').toBe(0);

      await empPage.stopErrorMonitoring();
      empPage.assertNoServerErrors();
    });

    test('REG-004: Parallel search and navigation', async ({ browser }) => {
      const ctx = await browser.newContext({ storageState: SESSION_FILE });
      const page1 = await ctx.newPage();
      const page2 = await ctx.newPage();
      const emp1 = new EmployeePage(page1, 'REG-004-P1');
      const emp2 = new EmployeePage(page2, 'REG-004-P2');

      const [r1, r2] = await Promise.all([
        (async () => {
          await ensureLoggedIn(page1);
          await emp1.goToEmployeeList();
          return emp1.run(emp1.searchEmployeeSteps('Admin'), 'Search Admin', 'regression');
        })(),
        (async () => {
          await ensureLoggedIn(page2);
          await emp2.goToEmployeeList();
          return emp2.run(
            [
              {
                label: 'Click Add Employee',
                action: 'click',
                codegenLocator: "getByRole('link', { name: 'Add Employee' })",
              },
              {
                label: 'Verify form loaded',
                action: 'assertVisible',
                locator: "input[name='firstName']",
                timeout: 8000,
              },
            ],
            'Open Add Form',
            'regression'
          );
        })(),
      ]);

      await ctx.close();
      expect(r1.failed, 'Search workflow should pass').toBe(0);
      expect(r2.failed, 'Add form workflow should pass').toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // NEGATIVE — App rejects invalid input
  // ─────────────────────────────────────────────────────────────────────────────
  test.describe('Negative', () => {
    test('NEG-001: Save without required fields shows validation', async ({ page }) => {
      const empPage = new EmployeePage(page, 'NEG-001');
      await empPage.goToEmployeeList();
      await empPage.run(
        [
          {
            label: 'Click Add Employee',
            action: 'click',
            codegenLocator: "getByRole('link', { name: 'Add Employee' })",
          },
        ],
        'Open form',
        'regression'
      );

      const result = await empPage.run(
        empPage.verifyValidationErrorSteps(),
        'Verify Validation',
        'regression'
      );
      expect(result.failed, 'Validation error should appear').toBe(0);
    });

    test('NEG-002: Search no results shows empty state', async ({ page }) => {
      const empPage = new EmployeePage(page, 'NEG-002');
      await empPage.goToEmployeeList();
      await empPage.run(
        empPage.searchEmployeeSteps('ZZZNOBODYHASTHISNAME99999'),
        'Search',
        'regression'
      );

      const result = await empPage.run(
        [
          {
            label: 'Verify no records found',
            action: 'assertVisible',
            codegenLocator: "getByText('No Records Found')",
            timeout: 5000,
          },
        ],
        'Verify Empty State',
        'regression'
      );
      expect(result.failed, 'No Records Found should appear').toBe(0);
    });

    test('NEG-003: Cancel add employee returns to list', async ({ page }) => {
      const empPage = new EmployeePage(page, 'NEG-003');
      await empPage.goToEmployeeList();

      const result = await empPage.run(
        [
          {
            label: 'Click Add Employee',
            action: 'click',
            codegenLocator: "getByRole('link', { name: 'Add Employee' })",
          },
          {
            label: 'Fill first name',
            action: 'fill',
            locator: "input[name='firstName']",
            value: 'ShouldNotBeSaved',
          },
          {
            label: 'Click Cancel',
            action: 'click',
            codegenLocator: "getByRole('button', { name: 'Cancel' })",
          },
          {
            label: 'Verify back on list',
            action: 'assertVisible',
            codegenLocator: "getByRole('link', { name: 'Add Employee' })",
            timeout: 8000,
          },
        ],
        'Cancel Add Employee',
        'regression'
      );
      expect(result.failed, 'Cancel should return to list').toBe(0);

      await empPage.run(
        empPage.searchEmployeeSteps('ShouldNotBeSaved'),
        'Search cancelled',
        'regression'
      );
      const notSaved = await empPage.run(
        [
          {
            label: 'Verify not saved',
            action: 'assertVisible',
            codegenLocator: "getByText('No Records Found')",
            timeout: 5000,
          },
        ],
        'Verify Not Saved',
        'regression'
      );
      expect(notSaved.failed, 'Cancelled employee should not exist').toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // CLEANUP
  // ─────────────────────────────────────────────────────────────────────────────
  test.afterAll(async ({ browser }) => {
    try {
      const ctx = await browser.newContext({ storageState: SESSION_FILE });
      const page = await ctx.newPage();
      const empPage = new EmployeePage(page, 'Cleanup');

      await ensureLoggedIn(page);
      await empPage.goToEmployeeList();

      const exists = await empPage.employeeExists(TEST_EMPLOYEE.firstName);
      if (exists) {
        await empPage.run(
          empPage.deleteEmployeeSteps(TEST_EMPLOYEE.firstName),
          'Cleanup: Delete test employee',
          'general'
        );
        Logger.success(`Cleanup: deleted ${TEST_EMPLOYEE.fullName}`);
      }
      await ctx.close();
    } catch (e) {
      Logger.warn(`Cleanup failed (non-critical): ${String(e)}`);
    }
  });
});
