/**
 * OrangeHRM - Login Workflow
 *
 * Business flow:
 *   1. Navigate to OrangeHRM demo
 *   2. Login with valid credentials
 *   3. Verify Dashboard loads
 *   4. Logout and verify login page returns
 */
import { test, expect } from '@playwright/test';
import { OrangeHRMPage } from '../../pages/OrangeHRMPage';
import { logInfo } from '../../utils/logInfo';

test.setTimeout(2 * 60 * 1000);

test.describe('OrangeHRM Login Workflow', () => {
  test('Login with valid credentials and verify dashboard', async ({ page }) => {
    logInfo('test >>>>>>>>>>');
    const orangeHRM = new OrangeHRMPage(page);

    await orangeHRM.login();
    await orangeHRM.verifyDashboard();

    logInfo('test: complete');
  });

  test('Login and logout successfully', async ({ page }) => {
    logInfo('test >>>>>>>>>>');
    const orangeHRM = new OrangeHRMPage(page);

    await orangeHRM.login();
    await orangeHRM.verifyDashboard();
    await orangeHRM.logout();

    logInfo('test: complete');
  });
});
