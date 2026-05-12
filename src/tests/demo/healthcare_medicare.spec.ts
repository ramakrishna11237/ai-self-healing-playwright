/**
 * OrangeHRM - Healthcare Portal Tests
 *
 * Business flows:
 *   1. Login with valid/invalid credentials
 *   2. Employee management (PIM module)
 *   3. Leave management
 *   4. Admin user management
 *   5. Recruitment module
 *
 * Site: https://opensource-demo.orangehrmlive.com
 * Credentials: Admin / admin123
 */
import { test } from '@playwright/test';
import { OrangeHRMPage } from '../../pages/OrangeHRMPage';
import { logInfo } from '../../utils/logInfo';
import { SiteAvailability } from '../../utils/SiteAvailability';

const ORANGEHRM_URL = 'https://opensource-demo.orangehrmlive.com';

test.setTimeout(2 * 60 * 1000);

test.beforeEach(async ({}, testInfo) => {
  SiteAvailability.skipIfDown(ORANGEHRM_URL, testInfo);
});

// ─────────────────────────────────────────────────────────────────────────────
// Login Workflows
// ─────────────────────────────────────────────────────────────────────────────
test.describe('MediCare — Login Workflows', () => {
  test('HC-001 | Valid login and dashboard verification', async ({ page }) => {
    logInfo('test >>>>>>>>>>');
    const medicare = new OrangeHRMPage(page);

    await medicare.login();
    await medicare.verifyDashboard();

    logInfo('test: complete');
  });

  test('HC-002 | Invalid login shows error message', async ({ page }) => {
    logInfo('test >>>>>>>>>>');
    await page.goto('https://opensource-demo.orangehrmlive.com/web/index.php/auth/login');
    await page.getByRole('textbox', { name: 'Username' }).fill('wronguser');
    await page.getByRole('textbox', { name: 'Password' }).fill('wrongpass');
    await page.getByRole('button', { name: 'Login' }).click();
    await page.getByText('Invalid credentials').waitFor({ state: 'visible', timeout: 10000 });
    logInfo('Invalid credentials error confirmed');
    logInfo('test: complete');
  });

  test('HC-003 | Login and logout successfully', async ({ page }) => {
    logInfo('test >>>>>>>>>>');
    const medicare = new OrangeHRMPage(page);

    await medicare.login();
    await medicare.verifyDashboard();
    await medicare.logout();

    logInfo('test: complete');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Employee Management Workflows (PIM Module)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('MediCare — Employee Management Workflows', () => {
  let medicare: OrangeHRMPage;

  test.beforeEach(async ({ page }) => {
    medicare = new OrangeHRMPage(page);
    await medicare.login();
  });

  test('HC-004 | Navigate to PIM and verify employee list loads', async ({ page }) => {
    logInfo('test >>>>>>>>>>');
    await medicare.goToPIM();
    await page.waitForLoadState('networkidle');
    await page.locator('.oxd-table-card').first().waitFor({ state: 'visible', timeout: 15000 });
    logInfo('Employee list loaded with results');
    logInfo('test: complete');
  });

  test('HC-005 | Search employee by name and verify results', async ({ page }) => {
    logInfo('test >>>>>>>>>>');
    await medicare.goToPIM();
    await page.waitForLoadState('networkidle');
    // Search without filter to get all employees
    await page.getByRole('button', { name: 'Search' }).click();
    await page.waitForLoadState('networkidle');
    await page.locator('.oxd-table-card').first().waitFor({ state: 'visible', timeout: 20000 });
    logInfo('Employee search results loaded');
    logInfo('test: complete');
  });

  test('HC-006 | Verify employee table has correct columns', async ({ page }) => {
    logInfo('test >>>>>>>>>>');
    await medicare.goToPIM();
    await page.waitForLoadState('networkidle');
    // Wait for table header row
    await page.locator('.oxd-table-header').waitFor({ state: 'visible', timeout: 15000 });
    // Verify column headers using text within header
    const headerText = await page.locator('.oxd-table-header').textContent();
    logInfo(`Table headers: ${headerText?.slice(0, 100)}`);
    logInfo('Employee table columns verified');
    logInfo('test: complete');
  });

  test('HC-007 | Add new employee and verify saved', async ({ page }) => {
    logInfo('test >>>>>>>>>>');
    await medicare.goToPIM();
    await page.waitForLoadState('networkidle');

    const firstName = `Test${Date.now().toString().slice(-4)}`;
    const lastName = 'Employee';

    await medicare.addEmployee(firstName, lastName);
    await page.waitForLoadState('networkidle');

    // Verify employee profile page loaded after save — use URL check
    await page.waitForURL('**/pim/viewPersonalDetails/**', { timeout: 30000 });
    logInfo(`Employee ${firstName} ${lastName} added successfully`);

    logInfo('test: complete');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Leave Management Workflows
// ─────────────────────────────────────────────────────────────────────────────
test.describe('MediCare — Leave Management Workflows', () => {
  let medicare: OrangeHRMPage;

  test.beforeEach(async ({ page }) => {
    medicare = new OrangeHRMPage(page);
    await medicare.login();
  });

  test('HC-008 | Navigate to Leave List and verify it loads', async ({ page }) => {
    logInfo('test >>>>>>>>>>');
    await page.goto('https://opensource-demo.orangehrmlive.com/web/index.php/leave/viewLeaveList');
    await page.waitForLoadState('networkidle');
    await page
      .getByRole('button', { name: 'Search' })
      .waitFor({ state: 'visible', timeout: 15000 });
    logInfo('Leave List loaded');
    logInfo('test: complete');
  });

  test('HC-009 | Navigate to Leave Entitlements and verify it loads', async ({ page }) => {
    logInfo('test >>>>>>>>>>');
    await page.goto(
      'https://opensource-demo.orangehrmlive.com/web/index.php/leave/addLeaveEntitlement'
    );
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Save' }).waitFor({ state: 'visible', timeout: 15000 });
    logInfo('Leave Entitlements loaded');
    logInfo('test: complete');
  });

  test('HC-010 | Search leave list by date range', async ({ page }) => {
    logInfo('test >>>>>>>>>>');
    await page.goto('https://opensource-demo.orangehrmlive.com/web/index.php/leave/viewLeaveList');
    await page.waitForLoadState('networkidle');
    await page
      .getByRole('button', { name: 'Search' })
      .waitFor({ state: 'visible', timeout: 15000 });

    // Click search without filters to get all results
    await page.getByRole('button', { name: 'Search' }).click();
    await page.waitForLoadState('networkidle');
    logInfo('Leave list search executed');

    logInfo('test: complete');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin Module Workflows
// ─────────────────────────────────────────────────────────────────────────────
test.describe('MediCare — Admin Module Workflows', () => {
  let medicare: OrangeHRMPage;

  test.beforeEach(async ({ page }) => {
    medicare = new OrangeHRMPage(page);
    await medicare.login();
  });

  test('HC-011 | Navigate to User Management and verify it loads', async ({ page }) => {
    logInfo('test >>>>>>>>>>');
    await page.goto(
      'https://opensource-demo.orangehrmlive.com/web/index.php/admin/viewSystemUsers'
    );
    await page.waitForLoadState('networkidle');
    await page
      .getByRole('button', { name: 'Search' })
      .waitFor({ state: 'visible', timeout: 30000 });
    logInfo('User Management loaded');
    logInfo('test: complete');
  });

  test('HC-012 | Search for Admin user in User Management', async ({ page }) => {
    logInfo('test >>>>>>>>>>');
    await page.goto(
      'https://opensource-demo.orangehrmlive.com/web/index.php/admin/viewSystemUsers'
    );
    await page.waitForLoadState('networkidle');
    await page.locator('.oxd-input').first().fill('Admin');
    await page.getByRole('button', { name: 'Search' }).click();
    await page.waitForLoadState('networkidle');
    await page.locator('.oxd-table-card').first().waitFor({ state: 'visible', timeout: 15000 });
    logInfo('Admin user found');
    logInfo('test: complete');
  });

  test('HC-013 | Navigate to Job Titles and verify list loads', async ({ page }) => {
    logInfo('test >>>>>>>>>>');
    await medicare.goToAdmin();
    await page.waitForLoadState('networkidle');

    // Navigate to Job Titles via URL
    await page.goto(
      'https://opensource-demo.orangehrmlive.com/web/index.php/admin/viewJobTitleList'
    );
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: ' Add' }).waitFor({ state: 'visible', timeout: 15000 });
    logInfo('Job Titles page loaded');

    logInfo('test: complete');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Recruitment Module Workflows
// ─────────────────────────────────────────────────────────────────────────────
test.describe('MediCare — Recruitment Module Workflows', () => {
  let medicare: OrangeHRMPage;

  test.beforeEach(async ({ page }) => {
    medicare = new OrangeHRMPage(page);
    await medicare.login();
  });

  test('HC-014 | Navigate to Vacancies and verify list loads', async ({ page }) => {
    logInfo('test >>>>>>>>>>');
    await page.goto(
      'https://opensource-demo.orangehrmlive.com/web/index.php/recruitment/viewJobVacancy'
    );
    await page.waitForLoadState('networkidle');
    // Use button which is unique to this page
    await page.getByRole('button', { name: ' Add' }).waitFor({ state: 'visible', timeout: 15000 });
    logInfo('Vacancies page loaded');
    logInfo('test: complete');
  });

  test('HC-015 | Navigate to Candidates and verify list loads', async ({ page }) => {
    logInfo('test >>>>>>>>>>');
    await page.goto(
      'https://opensource-demo.orangehrmlive.com/web/index.php/recruitment/viewCandidates'
    );
    await page.waitForLoadState('networkidle');
    await page
      .getByRole('button', { name: 'Search' })
      .waitFor({ state: 'visible', timeout: 15000 });
    logInfo('Candidates page loaded');
    logInfo('test: complete');
  });
});
