import { Page } from '@playwright/test';
import { Step } from '../../types';
import { Logger } from '../../utils/Logger';
import { DEFAULT_CONFIG } from '../../config';
import { resolveLocatorStr, resolvePlaywrightLocator } from './locatorUtils';

export async function handleWaitAction(page: Page, action: string, step: Step): Promise<boolean | null> {
  switch (action) {
    case 'wait': {
      const ms = step.waitMs ?? 1000;
      await page.waitForTimeout(ms);
      Logger.info(`Waited ${ms}ms`);
      return true;
    }
    case 'waitForUrl': {
      if (!step.expectedUrl) { Logger.warn('waitForUrl: no expectedUrl'); return false; }
      await page.waitForURL(step.expectedUrl, { timeout: step.timeout ?? DEFAULT_CONFIG.waitTimeout });
      Logger.info(`URL reached: ${step.expectedUrl}`);
      return true;
    }
    case 'waitForText': {
      const loc = resolveLocatorStr(step) || 'body';
      const el = resolvePlaywrightLocator(page, loc) ?? page.locator(loc);
      await el.filter({ hasText: step.expectedText ?? '' }).first().waitFor({ state: 'visible', timeout: step.timeout ?? DEFAULT_CONFIG.waitTimeout });
      Logger.info(`Text visible: "${step.expectedText}"`);
      return true;
    }
    case 'waitForNetwork': {
      try {
        await page.waitForLoadState('networkidle', { timeout: step.timeout ?? 5000 });
      } catch {
        Logger.debug('waitForNetwork: networkidle timeout — falling back to domcontentloaded');
        try { await page.waitForLoadState('domcontentloaded', { timeout: step.timeout ?? 5000 }); } catch { /* already loaded */ }
      }
      Logger.info('Network stable');
      return true;
    }
    case 'waitForFunction': {
      if (!step.expression) { Logger.warn('waitForFunction: expression required'); return false; }
      const expr = step.expression.trim();
      const timeout = step.timeout ?? DEFAULT_CONFIG.waitTimeout;
      if (expr === "document.readyState === 'complete'" || expr === 'load') {
        await page.waitForLoadState('load', { timeout });
      } else if (expr === "document.readyState !== 'loading'" || expr === 'domcontentloaded') {
        await page.waitForLoadState('domcontentloaded', { timeout });
      } else if (expr === 'networkidle') {
        await page.waitForLoadState('networkidle', { timeout });
      } else if (expr === 'document.body !== null') {
        await page.locator('body').first().waitFor({ state: 'attached', timeout });
      } else {
        Logger.warn(`waitForFunction: "${expr.slice(0, 80)}" not in safe allowlist — blocked (CWE-95)`);
        return false;
      }
      Logger.info(`waitForFunction resolved: ${expr.slice(0, 60)}`);
      return true;
    }
    case 'waitForSelector': {
      const loc = resolveLocatorStr(step);
      if (!loc) { Logger.warn('waitForSelector: locator required'); return false; }
      const state = step.waitForState ?? 'visible';
      await page.locator(loc).first().waitFor({ state, timeout: step.timeout ?? DEFAULT_CONFIG.waitTimeout });
      Logger.info(`waitForSelector "${loc}" state=${state}`);
      return true;
    }
    case 'waitForVisible': {
      const loc = step.waitLocator ?? resolveLocatorStr(step);
      if (!loc) { Logger.warn('waitForVisible: locator required'); return false; }
      await (resolvePlaywrightLocator(page, loc) ?? page.locator(loc)).first().waitFor({ state: 'visible', timeout: step.timeout ?? DEFAULT_CONFIG.waitTimeout });
      Logger.info(`Element visible: "${loc}"`);
      return true;
    }
    case 'waitForHidden': {
      const loc = step.waitLocator ?? resolveLocatorStr(step);
      if (!loc) { Logger.warn('waitForHidden: locator required'); return false; }
      await (resolvePlaywrightLocator(page, loc) ?? page.locator(loc)).first().waitFor({ state: 'hidden', timeout: step.timeout ?? DEFAULT_CONFIG.waitTimeout });
      Logger.info(`Element hidden: "${loc}"`);
      return true;
    }
    case 'waitForDownload': {
      const { getElement } = await import('./locatorUtils');
      const el = getElement(page, step);
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: step.downloadTimeout ?? 30000 }),
        el ? el.first().click() : Promise.resolve(),
      ]);
      const { default: path } = await import('path');
      const { default: fs } = await import('fs');
      const rawName = download.suggestedFilename() || `download-${Date.now()}`;
      const safeName = path.basename(rawName.replace(/[^a-z0-9._-]/gi, '_'));
      const savePath = step.downloadSavePath ?? path.join(DEFAULT_CONFIG.downloadDir, safeName);
      fs.mkdirSync(path.dirname(savePath), { recursive: true });
      await download.saveAs(savePath);
      if (step.extra) step.extra['downloadPath'] = savePath;
      Logger.info(`Download completed: ${savePath}`);
      return true;
    }
    default: return null;
  }
}
