/**
 * OrangeHRM - Recruitment Module Workflow
 */
import { test } from '@playwright/test';
import { OrangeHRMPage } from '../../pages/OrangeHRMPage';
import { logInfo } from '../../utils/logInfo';

test.setTimeout(2 * 60 * 1000);

test.describe('OrangeHRM Recruitment Module Workflow', () => {
  let orangeHRM: OrangeHRMPage;

  test.beforeEach(async ({ page }) => {
    orangeHRM = new OrangeHRMPage(page);
    await orangeHRM.login();
  });

  test('Navigate to Vacancies and verify list loads', async ({ page }) => {
    logInfo('test >>>>>>>>>>');
    await page.goto(
      'https://opensource-demo.orangehrmlive.com/web/index.php/recruitment/viewJobVacancy'
    );
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Add' }).waitFor({ state: 'visible', timeout: 15000 });
    logInfo('Vacancies list loaded');
    logInfo('test: complete');
  });

  test('Navigate to Candidates and verify list loads', async ({ page }) => {
    logInfo('test >>>>>>>>>>');
    await page.goto(
      'https://opensource-demo.orangehrmlive.com/web/index.php/recruitment/viewCandidates'
    );
    await page.waitForLoadState('networkidle');
    await page
      .getByRole('button', { name: 'Search' })
      .waitFor({ state: 'visible', timeout: 15000 });
    logInfo('Candidates list loaded');
    logInfo('test: complete');
  });
});
