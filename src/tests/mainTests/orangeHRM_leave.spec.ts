/**
 * OrangeHRM - Leave Module Workflow
 */
import { test } from '@playwright/test';
import { OrangeHRMPage } from '../../pages/OrangeHRMPage';
import { logInfo } from '../../utils/logInfo';

test.setTimeout(2 * 60 * 1000);

test.describe('OrangeHRM Leave Module Workflow', () => {
  let orangeHRM: OrangeHRMPage;

  test.beforeEach(async ({ page }) => {
    orangeHRM = new OrangeHRMPage(page);
    await orangeHRM.login();
  });

  test('Navigate to Leave List and verify it loads', async ({ page }) => {
    logInfo('test >>>>>>>>>>');
    await page.goto('https://opensource-demo.orangehrmlive.com/web/index.php/leave/viewLeaveList');
    await page.waitForLoadState('networkidle');
    await page
      .getByRole('button', { name: 'Search' })
      .waitFor({ state: 'visible', timeout: 15000 });
    logInfo('Leave List loaded');
    logInfo('test: complete');
  });

  test('Navigate to Leave Entitlements and verify it loads', async ({ page }) => {
    logInfo('test >>>>>>>>>>');
    await page.goto(
      'https://opensource-demo.orangehrmlive.com/web/index.php/leave/addLeaveEntitlement'
    );
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Save' }).waitFor({ state: 'visible', timeout: 15000 });
    logInfo('Leave Entitlements loaded');
    logInfo('test: complete');
  });
});
