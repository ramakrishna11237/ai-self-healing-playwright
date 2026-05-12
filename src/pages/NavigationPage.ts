import { Page } from '@playwright/test';
import { BasePage } from './BasePage';
import { Logger } from '../utils/Logger';

// ── Locators (Codegen-sourced) ────────────────────────────────────────────────
const Locators = {
  modulesLink: "getByRole('link', { name: 'Modules' })",
} as const;

export class NavigationPage extends BasePage {
  protected url = '';
  protected pageIdentifier = Locators.modulesLink;

  constructor(page: Page, testName = 'Navigation Page') {
    super(page, testName);
  }

  // ── Reusable high-level methods ─────────────────────────────────────────────

  async goToModule(moduleName: string): Promise<void> {
    await this.page.locator(Locators.modulesLink).first().click();

    const moduleLink = this.page.getByRole('link', { name: moduleName, exact: true });
    await moduleLink.waitFor({ state: 'visible', timeout: 10000 });
    await moduleLink.click();

    Logger.success(`On ${moduleName} module`);
  }
}
