/**
 * OrangeHRM - Admin Module Workflow*
 * Business flow:
 *   1. Login
 *   2. Navigate to Admin module
 *   3. Go to User Management
 *   4. Verify user list loads
 *   5. Search for Admin user
 */
import { test } from '@playwright/test';
import { OrangeHRMPage } from '../../pages/OrangeHRMPage';
import { logInfo } from '../../utils/logInfo';

test.setTimeout(2 * 60 * 1000);

test.describe('OrangeHRM Admin Module Workflow', () => {
  let orangeHRM: OrangeHRMPage;

  test.beforeEach(async ({ page }) => {
    orangeHRM = new OrangeHRMPage(page);
    await orangeHRM.login();
  });

  test('Navigate to User Management and verify it loads', async ({ page }) => {
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

  test('Search for Admin user in User Management', async ({ page }) => {
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
});
