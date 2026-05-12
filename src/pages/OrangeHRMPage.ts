/**
 * OrangeHRMPage
 *
 * Page object for OrangeHRM demo application.
 * URL: https://opensource-demo.orangehrmlive.com
 * Credentials: Admin / admin123
 *
 * All locators centralised here — specs contain zero raw locators.
 */
import { Page } from '@playwright/test';
import { HealingPage } from '../utils/HealingPage';
import { logInfo } from '../utils/logInfo';

const APP_URL = process.env['ORANGEHRM_URL'] ?? 'https://opensource-demo.orangehrmlive.com/web/index.php/auth/login';
const USERNAME = process.env['ORANGEHRM_USERNAME'] || (() => { throw new Error('ORANGEHRM_USERNAME is not set'); })();
const PASSWORD = process.env['ORANGEHRM_PASSWORD'] || (() => { throw new Error('ORANGEHRM_PASSWORD is not set'); })();

const Locators = {
  // Login
  usernameField: "getByPlaceholder('Username')",
  passwordField: "getByPlaceholder('Password')",
  loginButton: "getByRole('button', { name: 'Login' })",
  dashboardHeader: "getByRole('heading', { name: 'Dashboard' })",

  // Top nav
  userDropdown: "getByRole('banner').getByRole('img', { name: 'profile picture' })",
  logoutLink: '.oxd-userdropdown-link',

  // Side menu
  adminMenu: "getByRole('link', { name: 'Admin' })",
  pimMenu: "getByRole('link', { name: 'PIM' })",
  leaveMenu: "getByRole('link', { name: 'Leave' })",
  timeMenu: "getByRole('link', { name: 'Time' })",
  recruitmentMenu: "getByRole('link', { name: 'Recruitment' })",
  myInfoMenu: "getByRole('link', { name: 'My Info' })",

  // Employee List
  addEmployeeBtn: "getByRole('button', { name: ' Add' })",
  searchBtn: "getByRole('button', { name: 'Search' })",
  employeeNameInput: "getByPlaceholder('Type for hints...')",
  employeeTable: '.oxd-table-card',
  firstTableRow: '.oxd-table-card',

  // Add Employee form
  firstNameField: "//input[@name='firstName']",
  lastNameField: "//input[@name='lastName']",
  employeeIdField: "//div[label[text()='Employee Id']]//input",
  saveBtn: "getByRole('button', { name: 'Save' })",
  successToast: '.oxd-toast--success',

  // Leave
  leaveTypeDropdown: "//div[label[text()='Leave Type']]//div[@class='oxd-select-text-input']",
  fromDateField: "//div[label[text()='From Date']]//input",
  toDateField: "//div[label[text()='To Date']]//input",
  applyBtn: "getByRole('button', { name: 'Apply' })",

  // Admin - User Management
  userManagementMenu: "//nav//span[text()='User Management']",
  usersSubmenu: "//nav//a[text()='Users']",
  addUserBtn: "getByRole('button', { name: ' Add' })",
  userRoleDropdown: "//div[label[text()='User Role']]//div[@class='oxd-select-text-input']",
  statusDropdown: "//div[label[text()='Status']]//div[@class='oxd-select-text-input']",
  usernameInput: "//div[label[text()='Username']]//input",
  passwordInput: "//div[label[text()='Password']]//input",
  confirmPasswordInput: "//div[label[text()='Confirm Password']]//input",

  // Search results
  recordsFound: "//span[contains(text(),'Record Found') or contains(text(),'Records Found')]",
  noRecords: "//span[text()='No Records Found']",
} as const;

export class OrangeHRMPage {
  private hp: HealingPage;

  constructor(private page: Page) {
    this.hp = new HealingPage(page);
  }

  /** Login to OrangeHRM */
  async login(): Promise<void> {
    logInfo('Login: navigating to OrangeHRM');
    await this.hp.goto(APP_URL);
    await this.hp.fill(Locators.usernameField, 'Username', USERNAME);
    await this.hp.fill(Locators.passwordField, 'Password', PASSWORD);
    await this.hp.click(Locators.loginButton, 'Login button');
    await this.hp.waitForVisible(Locators.dashboardHeader, 'Dashboard loaded');
    logInfo('Login: success');
  }

  /** Logout */
  async logout(): Promise<void> {
    logInfo('Logout: logging out');
    // Click profile picture in top nav — use direct CSS which is more reliable
    await this.page.locator('.oxd-userdropdown-tab').click();
    await this.hp.waitMs(500);
    await this.page.locator(Locators.logoutLink).last().click();
    await this.page.waitForLoadState('networkidle');
    await this.hp.waitForVisible(Locators.usernameField, 'Login page shown');
    logInfo('Logout: success');
  }

  /** Navigate to Admin module */
  async goToAdmin(): Promise<void> {
    logInfo('Navigation: going to Admin');
    await this.hp.click(Locators.adminMenu, 'Admin menu');
    await this.page.waitForLoadState('networkidle');
    logInfo('Navigation: Admin opened');
  }

  /** Navigate to PIM (Employee List) */
  async goToPIM(): Promise<void> {
    logInfo('Navigation: going to PIM');
    await this.hp.click(Locators.pimMenu, 'PIM menu');
    await this.page.waitForLoadState('networkidle');
    logInfo('Navigation: PIM opened');
  }

  /** Navigate to Leave module */
  async goToLeave(): Promise<void> {
    logInfo('Navigation: going to Leave');
    await this.hp.click(Locators.leaveMenu, 'Leave menu');
    await this.page.waitForLoadState('networkidle');
    logInfo('Navigation: Leave opened');
  }

  /** Search employee by name */
  async searchEmployee(name: string): Promise<void> {
    logInfo(`Search: searching for employee "${name}"`);
    await this.hp.fill(Locators.employeeNameInput, 'Employee Name', name);
    await this.hp.waitMs(1000);
    await this.hp.click(Locators.searchBtn, 'Search button');
    await this.page.waitForLoadState('networkidle');
    logInfo('Search: complete');
  }

  /** Add a new employee */
  async addEmployee(firstName: string, lastName: string): Promise<void> {
    logInfo(`Add Employee: ${firstName} ${lastName}`);
    await this.hp.click(Locators.addEmployeeBtn, 'Add Employee button');
    await this.page.waitForLoadState('networkidle');
    await this.hp.fill(Locators.firstNameField, 'First Name', firstName);
    await this.hp.fill(Locators.lastNameField, 'Last Name', lastName);
    await this.hp.click(Locators.saveBtn, 'Save button');
    await this.page.waitForLoadState('networkidle');
    logInfo('Add Employee: saved');
  }

  /** Verify dashboard is visible */
  async verifyDashboard(): Promise<void> {
    logInfo('Verify: checking dashboard');
    await this.hp.assertVisible(Locators.dashboardHeader, 'Dashboard header');
    logInfo('Verify: dashboard confirmed');
  }

  /** Verify records found in table */
  async verifyRecordsFound(): Promise<void> {
    logInfo('Verify: checking records found');
    await this.hp.waitForVisible(Locators.recordsFound, 'Records found message');
    logInfo('Verify: records confirmed');
  }

  /** Verify employee table has rows */
  async verifyEmployeeTable(): Promise<void> {
    logInfo('Verify: checking employee table');
    await this.hp.waitForVisible(Locators.employeeTable, 'Employee table');
    logInfo('Verify: table confirmed');
  }

  /** Go to User Management */
  async goToUserManagement(): Promise<void> {
    logInfo('Navigation: going to User Management');
    await this.page.locator(Locators.userManagementMenu).click();
    await this.hp.waitMs(500);
    await this.page.locator(Locators.usersSubmenu).click();
    await this.page.waitForLoadState('networkidle');
    logInfo('Navigation: User Management opened');
  }
}
