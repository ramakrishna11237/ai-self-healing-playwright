import { Page } from '@playwright/test';
import { Step } from '../../types';
import { Logger } from '../../utils/Logger';
import { NavigationGuard } from '../../utils/NavigationGuard';

export async function handleNavigationAction(page: Page, action: string, step: Step): Promise<boolean | null> {
  switch (action) {
    case 'navigate': {
      if (!step.expectedUrl) { Logger.warn('navigate: no expectedUrl'); return false; }
      if (!/^(https?:\/\/|\/)/i.test(step.expectedUrl)) { Logger.warn(`navigate: blocked non-http URL "${step.expectedUrl}"`); return false; }
      const navUrl = step.expectedUrl.startsWith('/')
        ? `${new URL(page.url()).origin}${step.expectedUrl}`
        : step.expectedUrl;
      const success = await NavigationGuard.navigate(page, navUrl, {
        timeout: step.timeout ?? 60000,
        retries: 3,
      });
      if (!success) { Logger.warn(`navigate: failed to reach "${navUrl}"`); return false; }
      Logger.info(`Navigated to: ${navUrl}`);
      return true;
    }
    case 'reload': {
      await page.reload({ timeout: step.timeout || 30000 });
      Logger.info('Page reloaded');
      return true;
    }
    case 'goBack': {
      await page.goBack({ timeout: step.timeout || 10000 });
      Logger.info('Navigated back');
      return true;
    }
    case 'goForward': {
      await page.goForward({ timeout: step.timeout || 10000 });
      Logger.info('Navigated forward');
      return true;
    }
    case 'newTab': {
      const newPage = await page.context().newPage();
      if (step.expectedUrl) {
        await NavigationGuard.navigate(newPage, step.expectedUrl, { timeout: step.timeout ?? 60000 });
      }
      Logger.info(`New tab opened${step.expectedUrl ? `: ${step.expectedUrl}` : ''}`);
      return true;
    }
    case 'closeTab': {
      await page.close();
      Logger.info('Tab closed');
      return true;
    }
    case 'switchTab': {
      const pages = page.context().pages();
      const idx = step.tabIndex ?? 0;
      if (pages[idx]) { await pages[idx].bringToFront(); Logger.info(`Switched to tab ${idx}`); return true; }
      Logger.warn(`Tab index ${idx} not found (total: ${pages.length})`);
      return false;
    }
    default: return null;
  }
}
