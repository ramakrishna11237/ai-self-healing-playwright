import { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { Step } from '../types';
import { Logger } from '../utils/Logger';

const APP_URL = process.env['APP_URL'] ?? 'https://the-internet.herokuapp.com/login';
const getUsername = () => process.env['APP_USERNAME'] || (() => { throw new Error('APP_USERNAME is not set'); })();
const getPassword = () => process.env['APP_PASSWORD'] || (() => { throw new Error('APP_PASSWORD is not set'); })();

// ── Locators (Codegen-sourced) ────────────────────────────────────────────────
const Locators = {
  usernameField: "getByRole('textbox', { name: 'Username' })",
  passwordField: "getByRole('textbox', { name: 'Password' })",
  loginButton: "getByRole('button', { name: 'Login' })",
  modulesLink: "getByRole('link', { name: 'Modules' })",
  logoutButton: "getByRole('button', { name: 'Logout' })",
} as const;

export class LoginPage extends BasePage {
  protected url = APP_URL;
  protected pageIdentifier = Locators.loginButton;

  constructor(page: Page, testName = 'Login Page') {
    super(page, testName);
  }

  // ── Step definitions ────────────────────────────────────────────────────────

  /** Steps to navigate to the login page and log in */
  loginSteps(username = getUsername(), password = getPassword()): Step[] {
    return [
      {
        label: 'Navigate to login page',
        action: 'navigate',
        description: 'Open the OnCallSuite Records login page',
        expectedUrl: APP_URL,
      },
      {
        label: 'Enter username',
        action: 'fill',
        description: 'Type username into the Username field',
        codegenLocator: Locators.usernameField,
        value: username,
      },
      {
        label: 'Enter password',
        action: 'fill',
        description: 'Type password into the Password field',
        codegenLocator: Locators.passwordField,
        value: password,
      },
      {
        label: 'Click Login button',
        action: 'click',
        description: 'Submit login credentials',
        codegenLocator: Locators.loginButton,
      },
      {
        label: 'Verify login succeeded',
        action: 'assertVisible',
        description: 'Confirm the Modules navigation link is visible — user is logged in',
        codegenLocator: Locators.modulesLink,
      },
    ];
  }

  /** Steps to log out */
  logoutSteps(): Step[] {
    return [
      {
        label: 'Click Logout',
        action: 'click',
        description: 'Log out of the application',
        codegenLocator: Locators.logoutButton,
      },
      {
        label: 'Verify logged out',
        action: 'assertVisible',
        description: 'Confirm the login page is shown after logout',
        codegenLocator: Locators.loginButton,
      },
    ];
  }

  // ── Reusable high-level methods ─────────────────────────────────────────────

  /** Login and assert success in one call */
  async login(username = getUsername(), password = getPassword()): Promise<void> {
    const result = await this.run(this.loginSteps(username, password), 'Login', 'smoke');
    if (result.failed > 0) {
      const failed = result.steps.find((s) => !s.result.success);
      throw new Error(`Login failed at step: "${failed?.label}" — ${failed?.result.error}`);
    }
    Logger.success('Login successful');
  }

  /** Logout and assert success in one call */
  async logout(): Promise<void> {
    const result = await this.run(this.logoutSteps(), 'Logout', 'smoke');
    if (result.failed > 0) {
      throw new Error('Logout failed');
    }
    Logger.success('Logout successful');
  }

  /** Check if the user is currently logged in */
  async isLoggedIn(): Promise<boolean> {
    return this.isVisible(Locators.modulesLink);
  }
}
