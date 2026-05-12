/**
 * ParaBank - Banking Application Tests
 *
 * Business flows:
 *   1. Login with valid/invalid credentials
 *   2. View account overview and details
 *   3. Transfer funds between accounts
 *   4. Open new account
 *   5. Find transactions by amount
 *
 * Site: https://parabank.parasoft.com/parabank
 * Credentials: john / demo
 */
import { test } from '@playwright/test';
import { ParaBankPage } from '../../pages/ParaBankPage';
import { logInfo } from '../../utils/logInfo';
import { SiteAvailability } from '../../utils/SiteAvailability';

const PARABANK_URL = 'http://localhost:8090';

test.setTimeout(2 * 60 * 1000);

test.beforeEach(async ({}, testInfo) => {
  SiteAvailability.skipIfDown(PARABANK_URL, testInfo);
});

// ─────────────────────────────────────────────────────────────────────────────
// Login Workflows
// ─────────────────────────────────────────────────────────────────────────────
test.describe('ParaBank — Login Workflows', () => {
  test('BANK-001 | Valid login and account overview verification', async ({ page }) => {
    logInfo('test >>>>>>>>>>');
    const paraBank = new ParaBankPage(page);

    await paraBank.login();
    await paraBank.verifyDashboard();

    logInfo('test: complete');
  });

  test('BANK-002 | Invalid login shows error message', async ({ page }) => {
    logInfo('test >>>>>>>>>>');
    const paraBank = new ParaBankPage(page);

    await page.goto('https://parabank.parasoft.com/parabank/index.htm');
    await page.locator("[name='username']").fill('wronguser');
    await page.locator("[name='password']").fill('wrongpass');
    await page.locator("[value='Log In']").click();
    await paraBank.verifyLoginError();

    logInfo('test: complete');
  });

  test('BANK-003 | Login and logout successfully', async ({ page }) => {
    logInfo('test >>>>>>>>>>');
    const paraBank = new ParaBankPage(page);

    await paraBank.login();
    await paraBank.verifyDashboard();
    await paraBank.logout();

    logInfo('test: complete');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Account Workflows
// ─────────────────────────────────────────────────────────────────────────────
test.describe('ParaBank — Account Workflows', () => {
  let paraBank: ParaBankPage;

  test.beforeEach(async ({ page }) => {
    paraBank = new ParaBankPage(page);
    await paraBank.login();
  });

  test('BANK-004 | View account overview and verify accounts listed', async ({ page }) => {
    logInfo('test >>>>>>>>>>');
    await paraBank.verifyDashboard();

    // Verify accounts table is visible
    await page.waitForLoadState('networkidle');
    const accountRows = page.locator('#accountTable tr');
    await accountRows.first().waitFor({ state: 'visible', timeout: 15000 });
    const count = await accountRows.count();
    logInfo(`Account rows found: ${count}`);

    logInfo('test: complete');
  });

  test('BANK-005 | Open new savings account', async ({ page }) => {
    logInfo('test >>>>>>>>>>');
    await paraBank.goToOpenAccount();
    await paraBank.openNewAccount('1'); // 1 = SAVINGS
    await paraBank.verifyAccountOpened();

    // Verify new account number is shown
    await page.getByText('Your new account number:').waitFor({ state: 'visible', timeout: 15000 });
    const newAccountId = await page.locator('#newAccountId').textContent();
    logInfo(`New account number: ${newAccountId}`);

    logInfo('test: complete');
  });

  test('BANK-006 | Open new checking account', async ({ page }) => {
    logInfo('test >>>>>>>>>>');
    await paraBank.goToOpenAccount();
    await paraBank.openNewAccount('0'); // 0 = CHECKING
    await paraBank.verifyAccountOpened();

    logInfo('test: complete');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Transfer Workflows
// ─────────────────────────────────────────────────────────────────────────────
test.describe('ParaBank — Transfer Workflows', () => {
  let paraBank: ParaBankPage;

  test.beforeEach(async ({ page }) => {
    paraBank = new ParaBankPage(page);
    await paraBank.login();
  });

  test('BANK-007 | Transfer funds between accounts', async ({ page }) => {
    logInfo('test >>>>>>>>>>');
    await paraBank.goToTransferFunds();
    await paraBank.transferFunds('100');
    await paraBank.verifyTransferComplete();

    // Verify transfer amount shown in confirmation
    await page.getByText('100.00').waitFor({ state: 'visible', timeout: 10000 });
    logInfo('Transfer amount confirmed in summary');

    logInfo('test: complete');
  });

  test('BANK-008 | Transfer funds page loads with account dropdowns', async ({ page }) => {
    logInfo('test >>>>>>>>>>');
    await paraBank.goToTransferFunds();

    // Verify both dropdowns are present
    await page.waitForLoadState('networkidle');
    const fromDropdown = page.locator('select#fromAccountId');
    const toDropdown = page.locator('select#toAccountId');
    await fromDropdown.waitFor({ state: 'visible', timeout: 10000 });
    await toDropdown.waitFor({ state: 'visible', timeout: 10000 });

    const fromOptions = await fromDropdown.locator('option').count();
    logInfo(`From account options: ${fromOptions}`);

    logInfo('test: complete');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Transaction Workflows
// ─────────────────────────────────────────────────────────────────────────────
test.describe('ParaBank — Transaction Workflows', () => {
  let paraBank: ParaBankPage;

  test.beforeEach(async ({ page }) => {
    paraBank = new ParaBankPage(page);
    await paraBank.login();
  });

  test('BANK-009 | Find transactions by amount', async ({ page }) => {
    logInfo('test >>>>>>>>>>');
    await paraBank.goToFindTransactions();
    await paraBank.findByAmount('100');
    await paraBank.verifyTransactionResults();

    logInfo('test: complete');
  });

  test('BANK-010 | Find transactions page loads correctly', async ({ page }) => {
    logInfo('test >>>>>>>>>>');
    await paraBank.goToFindTransactions();

    // Verify all search options are present
    await page.waitForLoadState('networkidle');
    // Verify the findByAmount button is present (unique to this page)
    await page.locator("[id='findByAmount']").waitFor({ state: 'visible', timeout: 10000 });

    // Verify account dropdown is present
    const accountDropdown = page.locator('select#accountId');
    await accountDropdown.waitFor({ state: 'visible', timeout: 10000 });
    logInfo('Find Transactions page verified');

    logInfo('test: complete');
  });

  test('BANK-011 | View account transaction history', async ({ page }) => {
    logInfo('test >>>>>>>>>>');
    await paraBank.verifyDashboard();

    // Click first account link
    await page.waitForLoadState('networkidle');
    const firstAccountLink = page.locator('#accountTable a').first();
    await firstAccountLink.waitFor({ state: 'visible', timeout: 15000 });
    const accountId = await firstAccountLink.textContent();
    logInfo(`Clicking account: ${accountId}`);
    await firstAccountLink.click();

    // Verify account details page
    await page.waitForLoadState('networkidle');
    await page.getByText('Account Details').waitFor({ state: 'visible', timeout: 15000 });
    await page.getByText('Balance').waitFor({ state: 'visible', timeout: 10000 });
    logInfo('Account details page loaded');

    logInfo('test: complete');
  });
});
