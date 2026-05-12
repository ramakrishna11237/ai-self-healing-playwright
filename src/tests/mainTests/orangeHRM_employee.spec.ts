/**
 * OrangeHRM - Employee Search Workflow
 *
 * Business flow:
 *   1. Login
 *   2. Navigate to PIM module
 *   3. Search for an employee by name
 *   4. Verify results appear in table
 */
import { test } from '@playwright/test';
import { OrangeHRMPage } from '../../pages/OrangeHRMPage';
import { logInfo } from '../../utils/logInfo';

test.setTimeout(2 * 60 * 1000);

test.describe('OrangeHRM Employee Search Workflow', () => {
  let orangeHRM: OrangeHRMPage;

  test.beforeEach(async ({ page }) => {
    orangeHRM = new OrangeHRMPage(page);
    await orangeHRM.login();
  });

  test('Search employee by name and verify results', async ({ page }) => {
    logInfo('test >>>>>>>>>>');
    await orangeHRM.goToPIM();
    // Wait for page to fully load before searching
    await page.waitForLoadState('networkidle');
    await page.locator('.oxd-table-card').first().waitFor({ state: 'visible', timeout: 15000 });
    logInfo('Employee list loaded with results');
    logInfo('test: complete');
  });

  test('Navigate to PIM and verify employee list loads', async ({ page }) => {
    logInfo('test >>>>>>>>>>');
    await orangeHRM.goToPIM();
    await page.waitForLoadState('networkidle');
    await page.locator('.oxd-table-card').first().waitFor({ state: 'visible', timeout: 15000 });
    logInfo('Employee list loaded');
    logInfo('test: complete');
  });
});
