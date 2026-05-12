import * as fs from 'fs';
import * as path from 'path';
import { Page } from '@playwright/test';
import { Step } from '../../types';
import { Logger } from '../../utils/Logger';
import { DEFAULT_CONFIG } from '../../config';
import { getElement, resolveLocatorStr, parseOptions } from './locatorUtils';

export async function handleAdvancedAction(page: Page, action: string, step: Step): Promise<boolean | null> {
  switch (action) {
    case 'screenshot': {
      const dir = DEFAULT_CONFIG.screenshotDir;
      fs.mkdirSync(dir, { recursive: true });
      const rawName = step.screenshotName ?? `screenshot-${Date.now()}.png`;
      const safeName = path.basename(rawName);
      const filePath = path.join(path.resolve(dir), safeName);
      const resolved = path.resolve(filePath);
      const base = path.resolve(dir);
      if (!resolved.startsWith(base + path.sep) && resolved !== base) {
        Logger.warn(`Screenshot path traversal blocked: "${rawName}"`);
        return false;
      }
      await page.screenshot({ path: filePath, fullPage: true });
      Logger.info(`Screenshot: ${filePath}`);
      return true;
    }
    case 'iframe': {
      const iframeLoc = step.iframeLocator ?? 'iframe';
      const innerLoc = resolveLocatorStr(step);
      if (!innerLoc) { Logger.warn('iframe: no inner locator'); return false; }
      const frame = page.frameLocator(iframeLoc);
      const rm = innerLoc.match(/^getByRole\(\s*['"]([^'"]+)['"]\s*(?:,\s*(\{[^}]*\}))?\s*\)/);
      const lm = innerLoc.match(/^getByLabel\(\s*['"]([^'"]+)['"]/);
      const tm = innerLoc.match(/^getByText\(\s*['"]([^'"]+)['"]/);
      const tim = innerLoc.match(/^getByTestId\(\s*['"]([^'"]+)['"]/);
      const pm = innerLoc.match(/^getByPlaceholder\(\s*['"]([^'"]+)['"]/);
      const frameEl = rm
        ? frame.getByRole(rm[1] as Parameters<Page['getByRole']>[0], parseOptions(rm[2] ?? '{}'))
        : lm ? frame.getByLabel(lm[1])
        : tm ? frame.getByText(tm[1])
        : tim ? frame.getByTestId(tim[1])
        : pm ? frame.getByPlaceholder(pm[1])
        : frame.locator(innerLoc);
      await frameEl.first().click({ timeout: step.timeout ?? DEFAULT_CONFIG.iframeTimeout });
      Logger.info(`Clicked in iframe "${iframeLoc}": ${innerLoc}`);
      return true;
    }
    case 'alert': {
      const alertAction = step.alertAction ?? 'accept';
      page.once('dialog', async (dialog: { type: () => string; message: () => string; accept: (t?: string) => Promise<void>; dismiss: () => Promise<void> }) => {
        Logger.info(`Dialog: type=${dialog.type()}, msg="${dialog.message()}"`);
        if (alertAction === 'dismiss') await dialog.dismiss();
        else await dialog.accept(step.alertText);
      });
      const el = getElement(page, step);
      if (el && (await el.count()) > 0) await el.first().click();
      Logger.info(`Alert handled: ${alertAction}`);
      return true;
    }
    case 'dispatchEvent': {
      const el = getElement(page, step);
      if (!el || !step.eventType) { Logger.warn('dispatchEvent: locator and eventType required'); return false; }
      await el.first().dispatchEvent(step.eventType, step.eventInit ?? {});
      Logger.info(`Dispatched event "${step.eventType}" on: ${resolveLocatorStr(step)}`);
      return true;
    }
    case 'evaluate': {
      if (!step.expression) { Logger.warn('evaluate: expression required'); return false; }
      const el = getElement(page, step);
      const expr = step.expression.trim();
      let result: unknown;
      const attrMatch = expr.match(/^getAttribute:([a-zA-Z][a-zA-Z0-9_-]*)$/);
      if (attrMatch) {
        if (!el) { Logger.warn('evaluate getAttribute: locator required'); return false; }
        result = await el.first().getAttribute(attrMatch[1]);
      } else if (expr.match(/^dataset:[a-zA-Z][a-zA-Z0-9_]*$/)) {
        if (!el) { Logger.warn('evaluate dataset: locator required'); return false; }
        result = await el.first().evaluate((node: Element, k: string) => (node as HTMLElement).dataset[k] ?? null, expr.slice(8));
      } else if (expr === 'textContent') {
        if (!el) { Logger.warn('evaluate textContent: locator required'); return false; }
        result = await el.first().textContent();
      } else if (expr === 'innerText') {
        if (!el) { Logger.warn('evaluate innerText: locator required'); return false; }
        result = await el.first().innerText();
      } else if (expr === 'value') {
        if (!el) { Logger.warn('evaluate value: locator required'); return false; }
        result = await el.first().inputValue();
      } else if (expr === 'checked') {
        if (!el) { Logger.warn('evaluate checked: locator required'); return false; }
        result = await el.first().isChecked();
      } else if (expr === 'disabled') {
        if (!el) { Logger.warn('evaluate disabled: locator required'); return false; }
        result = !(await el.first().isEnabled());
      } else if (expr === 'className') {
        if (!el) { Logger.warn('evaluate className: locator required'); return false; }
        result = await el.first().getAttribute('class');
      } else if (expr === 'href') {
        if (!el) { Logger.warn('evaluate href: locator required'); return false; }
        result = await el.first().getAttribute('href');
      } else if (expr === 'src') {
        if (!el) { Logger.warn('evaluate src: locator required'); return false; }
        result = await el.first().getAttribute('src');
      } else if (expr === 'scrollTop') {
        if (!el) { Logger.warn('evaluate scrollTop: locator required'); return false; }
        result = await el.first().evaluate((node: Element) => (node as HTMLElement).scrollTop);
      } else if (expr === 'scrollHeight') {
        if (!el) { Logger.warn('evaluate scrollHeight: locator required'); return false; }
        result = await el.first().evaluate((node: Element) => (node as HTMLElement).scrollHeight);
      } else {
        Logger.warn(`evaluate: "${expr}" not in safe allowlist — blocked (CWE-95)`);
        return false;
      }
      Logger.info(`Evaluate result: ${JSON.stringify(result)}`);
      if (step.extra) step.extra['evalResult'] = result;
      return true;
    }
    case 'geolocation': {
      if (step.latitude === undefined || step.longitude === undefined) { Logger.warn('geolocation: latitude and longitude required'); return false; }
      await page.context().setGeolocation({ latitude: step.latitude, longitude: step.longitude, accuracy: step.accuracy ?? 100 });
      Logger.info(`Geolocation set: ${step.latitude}, ${step.longitude}`);
      return true;
    }
    case 'emulateMedia': {
      await page.emulateMedia({ colorScheme: step.colorScheme, media: step.media });
      Logger.info(`Media emulated: colorScheme=${step.colorScheme ?? 'unchanged'}, media=${step.media ?? 'unchanged'}`);
      return true;
    }
    case 'setViewport': {
      const w = step.viewportWidth ?? 1280;
      const h = step.viewportHeight ?? 720;
      await page.setViewportSize({ width: w, height: h });
      Logger.info(`Viewport set to ${w}x${h}`);
      return true;
    }
    case 'mockDate': {
      if (!step.mockDateValue) { Logger.warn('mockDate: mockDateValue required'); return false; }
      const mockMs = new Date(step.mockDateValue).getTime();
      if (isNaN(mockMs)) { Logger.warn(`mockDate: invalid date "${step.mockDateValue}"`); return false; }
      await page.addInitScript(({ ts }: { ts: number }) => {
        const __mockNow = ts;
        const __OrigDate = Date;
        class MockDate extends __OrigDate {
          constructor(...args: unknown[]) {
            if (args.length === 0) super(__mockNow);
            else super(...(args as ConstructorParameters<typeof Date>));
          }
          static now() { return __mockNow; }
        }
        (window as unknown as { Date: typeof Date }).Date = MockDate as unknown as typeof Date;
      }, { ts: mockMs });
      Logger.info(`Date mocked to: ${step.mockDateValue}`);
      return true;
    }
    case 'networkThrottle': {
      const profile = step.networkProfile ?? 'reset';
      const cdp = await page.context().newCDPSession(page);
      const profiles: Record<string, { offline: boolean; downloadThroughput: number; uploadThroughput: number; latency: number }> = {
        offline: { offline: true, downloadThroughput: 0, uploadThroughput: 0, latency: 0 },
        slow3g: { offline: false, downloadThroughput: 50000, uploadThroughput: 20000, latency: 400 },
        fast3g: { offline: false, downloadThroughput: 180000, uploadThroughput: 84375, latency: 150 },
        '4g': { offline: false, downloadThroughput: 4000000, uploadThroughput: 3000000, latency: 20 },
        reset: { offline: false, downloadThroughput: -1, uploadThroughput: -1, latency: 0 },
      };
      const profileSettings = profiles[profile] ?? profiles['reset']!;
      await cdp.send('Network.emulateNetworkConditions', profileSettings);
      Logger.info(`Network throttled to: ${profile}`);
      return true;
    }
    default: return null;
  }
}
