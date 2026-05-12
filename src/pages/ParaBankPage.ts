/**
 * ParaBankPage
 *
 * Page object for ParaBank banking application.
 * URL: https://parabank.parasoft.com/parabank
 * Credentials: john / demo
 *
 * All locators centralised here — specs contain zero raw locators.
 * Follows exact same pattern as OrangeHRMPage.
 */
import { Page } from '@playwright/test';
import { HealingPage } from '../utils/HealingPage';
import { logInfo } from '../utils/logInfo';

const APP_URL = 'http://localhost:8090/parabank/index.htm';
const USERNAME = 'john';
const PASSWORD = 'demo';

const Locators = {
  // Login — ParaBank uses name attributes, no aria-label
  usernameField: "[name='username']",
  passwordField: "[name='password']",
  loginButton: "[value='Log In']",

  // Dashboard — ParaBank shows 'Accounts Overview' after login
  accountOverview: "getByText('Accounts Overview')",
  welcomeMsg: "getByText('Welcome')",

  // Navigation
  openAccountLink: "getByRole('link', { name: 'Open New Account' })",
  transferFundsLink: "getByRole('link', { name: 'Transfer Funds' })",
  billPayLink: "getByRole('link', { name: 'Bill Pay' })",
  findTransactionLink: "getByRole('link', { name: 'Find Transactions' })",
  myInfoLink: "getByRole('link', { name: 'Update Contact Info' })",
  logoutLink: "getByRole('link', { name: 'Log Out' })",

  // Open Account — use h1 heading which is unique
  openAccountHeader: 'h1.title',
  accountTypeDropdown: "[id='type']",
  openAccountBtn: "getByRole('button', { name: 'Open New Account' })",
  accountOpenedMsg: "getByText('Congratulations, your account is now open.')",
  newAccountNumber: "getByText('Your new account number:')",

  // Transfer Funds — use h1 heading which is unique
  transferHeader: 'h1.title',
  amountField: "[id='amount']",
  fromAccountDropdown: "[id='fromAccountId']",
  toAccountDropdown: "[id='toAccountId']",
  transferBtn: "getByRole('button', { name: 'Transfer' })",
  transferCompleteMsg: "getByText('Transfer Complete!')",

  // Find Transactions — use h1 heading which is unique
  findTxHeader: 'h1.title',
  findByAmountBtn: "[id='findByAmount']",
  txResultsHeader: 'h1.title',

  // Error — ParaBank uses different messages, check for either variant
  errorMsg: '.error',

  // Register
  registerHeader: "getByText('Signing up is easy!')",
  firstNameField: "[name='customer.firstName']",
  lastNameField: "[name='customer.lastName']",
} as const;

export class ParaBankPage {
  private hp: HealingPage;

  constructor(private page: Page) {
    this.hp = new HealingPage(page);
  }

  /** Login to ParaBank */
  async login(username = USERNAME, password = PASSWORD): Promise<void> {
    logInfo('Login: navigating to ParaBank');
    await this.hp.goto(APP_URL);
    await this.hp.fill(Locators.usernameField, 'Username', username);
    await this.hp.fill(Locators.passwordField, 'Password', password);
    await this.hp.click(Locators.loginButton, 'Log In button');
    // Wait for account table — present on all post-login pages
    await this.page.waitForLoadState('networkidle');
    await this.page
      .locator('#accountTable, #rightPanel')
      .first()
      .waitFor({ state: 'visible', timeout: 30000 });
    logInfo('Login: success');
  }

  /** Logout */
  async logout(): Promise<void> {
    logInfo('Logout: logging out');
    await this.hp.click(Locators.logoutLink, 'Log Out link');
    await this.hp.waitForVisible(Locators.loginButton, 'Login page shown');
    logInfo('Logout: success');
  }

  /** Verify dashboard is visible */
  async verifyDashboard(): Promise<void> {
    logInfo('Verify: checking dashboard');
    // ParaBank overview page — verify account table is present
    await this.page.locator('#accountTable').waitFor({ state: 'visible', timeout: 15000 });
    logInfo('Verify: dashboard confirmed');
  }

  /** Navigate to Open New Account */
  async goToOpenAccount(): Promise<void> {
    logInfo('Navigation: going to Open New Account');
    await this.hp.click(Locators.openAccountLink, 'Open New Account link');
    await this.page.waitForLoadState('networkidle');
    await this.page.locator('#openAccountForm').waitFor({ state: 'visible', timeout: 15000 });
    logInfo('Navigation: Open Account page loaded');
  }

  /** Open a new account */
  async openNewAccount(type: string): Promise<void> {
    logInfo(`Account: opening new ${type} account`);
    await this.page.locator('select#type').selectOption(type);
    await this.hp.click(Locators.openAccountBtn, 'Open New Account button');
    await this.page.waitForLoadState('networkidle');
    logInfo('Account: new account opened');
  }

  /** Verify account opened */
  async verifyAccountOpened(): Promise<void> {
    logInfo('Verify: checking account opened');
    await this.hp.waitForVisible(Locators.accountOpenedMsg, 'Account Opened message');
    logInfo('Verify: account opened confirmed');
  }

  /** Navigate to Transfer Funds */
  async goToTransferFunds(): Promise<void> {
    logInfo('Navigation: going to Transfer Funds');
    await this.hp.click(Locators.transferFundsLink, 'Transfer Funds link');
    await this.page.waitForLoadState('networkidle');
    await this.page.locator('#transferForm').waitFor({ state: 'visible', timeout: 15000 });
    logInfo('Navigation: Transfer Funds page loaded');
  }

  /** Transfer funds */
  async transferFunds(amount: string): Promise<void> {
    logInfo(`Transfer: transferring $${amount}`);
    await this.hp.fill(Locators.amountField, 'Amount', amount);
    await this.hp.click(Locators.transferBtn, 'Transfer button');
    await this.page.waitForLoadState('networkidle');
    logInfo('Transfer: complete');
  }

  /** Verify transfer complete */
  async verifyTransferComplete(): Promise<void> {
    logInfo('Verify: checking transfer complete');
    await this.hp.waitForVisible(Locators.transferCompleteMsg, 'Transfer Complete message');
    logInfo('Verify: transfer confirmed');
  }

  /** Navigate to Find Transactions */
  async goToFindTransactions(): Promise<void> {
    logInfo('Navigation: going to Find Transactions');
    await this.hp.click(Locators.findTransactionLink, 'Find Transactions link');
    await this.page.waitForLoadState('networkidle');
    await this.page.locator("[id='findByAmount']").waitFor({ state: 'visible', timeout: 15000 });
    logInfo('Navigation: Find Transactions page loaded');
  }

  /** Find transactions by amount */
  async findByAmount(amount: string): Promise<void> {
    logInfo(`Find: searching transactions by amount $${amount}`);
    await this.hp.fill(Locators.amountField, 'Amount', amount);
    await this.hp.click(Locators.findByAmountBtn, 'Find Transactions button');
    await this.page.waitForLoadState('networkidle');
    logInfo('Find: search complete');
  }

  /** Verify transaction results */
  async verifyTransactionResults(): Promise<void> {
    logInfo('Verify: checking transaction results');
    await this.page
      .locator('#transactionTable, .ng-scope')
      .first()
      .waitFor({ state: 'visible', timeout: 15000 });
    logInfo('Verify: results confirmed');
  }

  /** Verify invalid login error */
  async verifyLoginError(): Promise<void> {
    logInfo('Verify: checking login error');
    // ParaBank shows error in .error or p.error or inside #rightPanel
    await this.page.waitForLoadState('domcontentloaded');
    await this.page
      .locator('.error, p.error, #rightPanel .error')
      .first()
      .waitFor({ state: 'attached', timeout: 15000 });
    logInfo('Verify: login error confirmed');
  }
}
