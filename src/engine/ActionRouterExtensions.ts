/**
 * ActionRouterExtensions — 35 deep automation actions (Part 1 of 2)
 *
 * Split into two files purely for maintainability (file size):
 *   ActionRouterExtensions.ts  → Actions 1-35  (rich text, cookies, API, visual, keyboard, scroll, window, conditional, data extraction)
 *   ActionRouterExtensions2.ts → Actions 36-98 (navigation, mouse, keyboard, forms, DOM, mobile, performance, assertions, waits)
 *
 * To add a new action:
 *   - If total actions in this file < 40: add here
 *   - Otherwise: add to ActionRouterExtensions2.ts
 *   - Register in ActionRouter.ts chain
 */

import * as fs from 'fs';
import * as path from 'path';
import { Page } from '@playwright/test';
import { Step } from '../types';
import { Logger } from '../utils/Logger';
import { DEFAULT_CONFIG } from '../config';
import { resolveLocatorToPlaywright } from './ActionRouter';

function getEl(page: Page, step: Step) {
  const loc = step.codegenLocator || step.locator || '';
  if (!loc) return null;
  return resolveLocatorToPlaywright(page, loc);
}

function locStr(step: Step): string {
  return step.codegenLocator || step.locator || '';
}

export async function handleExtendedAction(
  page: Page,
  action: string,
  step: Step
): Promise<boolean | null> {
  try {
    switch (action) {
      // ── Rich text / editor ──────────────────────────────────────────────────

      case 'richTextClick': {
        const loc = step.richTextLocator ?? locStr(step);
        if (!loc) {
          Logger.warn('richTextClick: richTextLocator required');
          return false;
        }
        await page.locator(loc).first().click();
        Logger.info(`Rich text clicked: ${loc}`);
        return true;
      }

      case 'richTextType': {
        const loc = step.richTextLocator ?? locStr(step);
        if (!loc) {
          Logger.warn('richTextType: richTextLocator required');
          return false;
        }
        const el = page.locator(loc).first();
        await el.click();
        // CWE-95: use Playwright native isEditable() instead of evaluate(isContentEditable)
        const isEditable = await el.isEditable().catch(() => false);
        if (isEditable) {
          await el.pressSequentially(step.value ?? step.text ?? '', { delay: step.delay ?? 30 });
        } else {
          await el.fill(step.value ?? step.text ?? '');
        }
        Logger.info(`Rich text typed: ${loc}`);
        return true;
      }

      case 'richTextClear': {
        const loc = step.richTextLocator ?? locStr(step);
        if (!loc) {
          Logger.warn('richTextClear: richTextLocator required');
          return false;
        }
        const el = page.locator(loc).first();
        await el.click();
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
        await page.keyboard.press('Delete');
        Logger.info(`Rich text cleared: ${loc}`);
        return true;
      }

      // ── Cookie / storage ────────────────────────────────────────────────────

      case 'setCookie': {
        if (!step.cookieName || !step.cookieValue) {
          Logger.warn('setCookie: cookieName and cookieValue required');
          return false;
        }
        if (/[\r\n;,\s]/.test(step.cookieName) || /[\r\n]/.test(step.cookieValue)) {
          Logger.warn('setCookie: invalid characters');
          return false;
        }
        const domain = step.cookieDomain ?? new URL(page.url()).hostname;
        if (/[\r\n;,\s]/.test(domain)) {
          Logger.warn('setCookie: invalid domain characters');
          return false;
        }
        await page
          .context()
          .addCookies([{ name: step.cookieName, value: step.cookieValue, domain, path: '/' }]);
        Logger.info(`Cookie set: ${step.cookieName}`);
        return true;
      }

      case 'getCookie': {
        if (!step.cookieName) {
          Logger.warn('getCookie: cookieName required');
          return false;
        }
        const cookies = await page.context().cookies();
        const cookie = cookies.find((c) => c.name === step.cookieName);
        if (step.extra) step.extra['cookieValue'] = cookie?.value ?? null;
        Logger.info(`Cookie "${step.cookieName}": ${cookie?.value ?? '(not found)'}`);
        return true;
      }

      case 'clearCookies': {
        await page.context().clearCookies();
        Logger.info('All cookies cleared');
        return true;
      }

      case 'setLocalStorage': {
        if (!step.storageKey || step.storageValue === undefined) {
          Logger.warn('setLocalStorage: storageKey and storageValue required');
          return false;
        }
        await page.evaluate(
          ({ k, v }: { k: string; v: string }) => window.localStorage.setItem(k, v),
          { k: step.storageKey, v: step.storageValue }
        );
        Logger.info(`localStorage set: ${step.storageKey}`);
        return true;
      }

      case 'clearLocalStorage': {
        await page.evaluate(() => window.localStorage.clear());
        Logger.info('localStorage cleared');
        return true;
      }

      // ── API / network ────────────────────────────────────────────────────────

      case 'interceptRequest': {
        if (!step.urlPattern) {
          Logger.warn('interceptRequest: urlPattern required');
          return false;
        }
        await page.route(step.urlPattern, async (route) => {
          if (step.extra) step.extra['interceptedUrl'] = route.request().url();
          await route.continue();
        });
        Logger.info(`Request interceptor set: ${step.urlPattern}`);
        return true;
      }

      case 'mockApiResponse': {
        if (!step.urlPattern) {
          Logger.warn('mockApiResponse: urlPattern required');
          return false;
        }
        const status = step.mockStatus ?? 200;
        const body = step.mockBody !== undefined ? JSON.stringify(step.mockBody) : '{}';
        await page.route(step.urlPattern, async (route) => {
          await route.fulfill({
            status,
            contentType: 'application/json',
            body,
            headers: step.mockHeaders ?? {},
          });
        });
        Logger.info(`API mock set: ${step.urlPattern} → ${status}`);
        return true;
      }

      case 'waitForRequest': {
        if (!step.urlPattern) {
          Logger.warn('waitForRequest: urlPattern required');
          return false;
        }
        const req = await page.waitForRequest(step.urlPattern, {
          timeout: step.requestTimeout ?? DEFAULT_CONFIG.waitTimeout,
        });
        if (step.extra) step.extra['requestUrl'] = req.url();
        Logger.info(`Request received: ${req.url()}`);
        return true;
      }

      case 'waitForResponse': {
        if (!step.urlPattern) {
          Logger.warn('waitForResponse: urlPattern required');
          return false;
        }
        const res = await page.waitForResponse(step.urlPattern, {
          timeout: step.requestTimeout ?? DEFAULT_CONFIG.waitTimeout,
        });
        if (step.extra) {
          step.extra['responseStatus'] = res.status();
          step.extra['responseUrl'] = res.url();
        }
        Logger.info(`Response received: ${res.url()} → ${res.status()}`);
        return true;
      }

      // ── Visual / accessibility ───────────────────────────────────────────────

      case 'assertSnapshot': {
        const snapshot = await page.ariaSnapshot();
        if (step.extra) step.extra['ariaSnapshot'] = snapshot;
        if (step.expectedText && !snapshot.includes(step.expectedText)) {
          Logger.warn(`assertSnapshot: "${step.expectedText}" not in snapshot`);
          return false;
        }
        Logger.info(`Aria snapshot captured (${snapshot.length} bytes)`);
        return true;
      }

      case 'assertAccessibility': {
        const { AccessibilityChecker } = await import('../utils/AccessibilityChecker');
        const checker = new AccessibilityChecker(page);
        const result = await checker.audit(locStr(step) || undefined);
        if (step.extra) step.extra['a11yResult'] = result;
        Logger.info(`Accessibility: ${result.summary}`);
        return result.passed;
      }

      case 'assertNoConsoleErrors': {
        const errors: string[] = [];
        const handler = (msg: { type: () => string; text: () => string }) => {
          if (msg.type() === 'error') {
            const text = msg.text();
            const pattern = step.consoleErrorPattern ? new RegExp(step.consoleErrorPattern) : null;
            if (!pattern || pattern.test(text)) errors.push(text);
          }
        };
        page.on('console', handler);
        await page.waitForTimeout(500);
        page.off('console', handler);
        if (errors.length > 0) {
          Logger.warn(`Console errors: ${errors.slice(0, 3).join(' | ')}`);
          if (step.extra) step.extra['consoleErrors'] = errors;
          return false;
        }
        Logger.info('No console errors');
        return true;
      }

      // ── Keyboard combos ──────────────────────────────────────────────────────

      case 'keyCombo': {
        const combo = step.keyCombo ?? step.key ?? 'Control+A';
        const el = getEl(page, step);
        if (el && (await el.count()) > 0) await el.first().press(combo);
        else await page.keyboard.press(combo);
        Logger.info(`Key combo: ${combo}`);
        return true;
      }

      case 'keySequence': {
        const keys = step.keySequence ?? [];
        if (keys.length === 0) {
          Logger.warn('keySequence: keySequence array required');
          return false;
        }
        const el = getEl(page, step);
        for (const key of keys) {
          if (el && (await el.count()) > 0) await el.first().press(key);
          else await page.keyboard.press(key);
          if (step.delay) await page.waitForTimeout(step.delay);
        }
        Logger.info(`Key sequence: [${keys.join(', ')}]`);
        return true;
      }

      // ── Advanced scroll ──────────────────────────────────────────────────────

      case 'scrollToBottom': {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        Logger.info('Scrolled to bottom');
        return true;
      }

      case 'scrollToTop': {
        await page.evaluate(() => window.scrollTo(0, 0));
        Logger.info('Scrolled to top');
        return true;
      }

      case 'scrollByPercent': {
        const pct = (step.scrollPercent ?? 50) / 100;
        await page.evaluate((p: number) => window.scrollTo(0, document.body.scrollHeight * p), pct);
        Logger.info(`Scrolled to ${step.scrollPercent ?? 50}%`);
        return true;
      }

      // ── Window / frame ───────────────────────────────────────────────────────

      case 'resizeWindow': {
        await page.setViewportSize({
          width: step.viewportWidth ?? 1280,
          height: step.viewportHeight ?? 720,
        });
        Logger.info(
          `Window resized to ${step.viewportWidth ?? 1280}x${step.viewportHeight ?? 720}`
        );
        return true;
      }

      case 'maximizeWindow': {
        await page.setViewportSize({ width: 1920, height: 1080 });
        Logger.info('Window maximized');
        return true;
      }

      case 'switchToFrame': {
        const frames = page.frames();
        let target = frames[0];
        if (step.frameIndex !== undefined) target = frames[step.frameIndex] ?? frames[0];
        else if (step.frameName)
          target = frames.find((f) => f.name() === step.frameName) ?? frames[0];
        else if (step.frameUrl)
          target = frames.find((f) => f.url().includes(step.frameUrl!)) ?? frames[0];
        if (step.extra) step.extra['frame'] = target;
        Logger.info(`Switched to frame: ${target.url()}`);
        return true;
      }

      case 'switchToMainFrame': {
        if (step.extra) step.extra['frame'] = null;
        Logger.info('Switched to main frame');
        return true;
      }

      // ── Conditional execution ────────────────────────────────────────────────

      case 'ifVisible': {
        const condLoc = step.conditionLocator ?? locStr(step);
        if (!condLoc) {
          Logger.warn('ifVisible: conditionLocator required');
          return false;
        }
        const el = resolveLocatorToPlaywright(page, condLoc) ?? page.locator(condLoc);
        const visible = await el
          .first()
          .isVisible()
          .catch(() => false);
        if (visible && step.thenStep) {
          const thenStep = { label: 'then', ...step.thenStep } as Step;
          return handleExtendedAction(page, step.thenAction ?? 'click', thenStep);
        }
        Logger.info(`ifVisible "${condLoc}": ${visible}`);
        return true;
      }

      case 'ifExists': {
        const condLoc = step.conditionLocator ?? locStr(step);
        if (!condLoc) {
          Logger.warn('ifExists: conditionLocator required');
          return false;
        }
        const el = resolveLocatorToPlaywright(page, condLoc) ?? page.locator(condLoc);
        const exists = (await el.count()) > 0;
        if (exists && step.thenStep) {
          const thenStep = { label: 'then', ...step.thenStep } as Step;
          return handleExtendedAction(page, step.thenAction ?? 'click', thenStep);
        }
        Logger.info(`ifExists "${condLoc}": ${exists}`);
        return true;
      }

      case 'repeatUntil': {
        if (!step.untilLocator || !step.repeatStep) {
          Logger.warn('repeatUntil: untilLocator and repeatStep required');
          return false;
        }
        const maxRepeat = step.maxRepeat ?? 10;
        const repeatStep = { label: 'repeat', ...step.repeatStep } as Step;
        for (let i = 0; i < maxRepeat; i++) {
          const el =
            resolveLocatorToPlaywright(page, step.untilLocator) ?? page.locator(step.untilLocator);
          if (
            await el
              .first()
              .isVisible()
              .catch(() => false)
          ) {
            Logger.info(`repeatUntil: done after ${i + 1} iteration(s)`);
            return true;
          }
          await handleExtendedAction(page, step.repeatAction ?? 'click', repeatStep);
          await page.waitForTimeout(500);
        }
        Logger.warn(`repeatUntil: condition not met after ${maxRepeat} iterations`);
        return false;
      }

      // ── Data extraction ──────────────────────────────────────────────────────

      case 'extractText': {
        const loc = step.extractTarget ?? locStr(step);
        if (!loc) {
          Logger.warn('extractText: extractTarget required');
          return false;
        }
        const el = resolveLocatorToPlaywright(page, loc) ?? page.locator(loc);
        const text = (await el.first().textContent()) ?? '';
        const key = step.extractKey ?? 'extractedText';
        if (step.extra) step.extra[key] = text;
        Logger.info(`Extracted "${key}": "${text.slice(0, 80)}"`);
        return true;
      }

      case 'extractAttribute': {
        const loc = step.extractTarget ?? locStr(step);
        const attr = step.extractAttr ?? step.attributeName;
        if (!loc || !attr) {
          Logger.warn('extractAttribute: extractTarget and extractAttr required');
          return false;
        }
        const el = resolveLocatorToPlaywright(page, loc) ?? page.locator(loc);
        const val = await el.first().getAttribute(attr);
        const key = step.extractKey ?? 'extractedAttr';
        if (step.extra) step.extra[key] = val;
        Logger.info(`Extracted [${attr}] "${key}": "${val}"`);
        return true;
      }

      case 'extractAllText': {
        const loc = step.extractTarget ?? locStr(step);
        if (!loc) {
          Logger.warn('extractAllText: extractTarget required');
          return false;
        }
        const texts = await (
          resolveLocatorToPlaywright(page, loc) ?? page.locator(loc)
        ).allTextContents();
        const key = step.extractKey ?? 'extractedTexts';
        if (step.extra) step.extra[key] = texts;
        Logger.info(`Extracted ${texts.length} texts for "${key}"`);
        return true;
      }

      case 'extractTableData': {
        const tbl = step.tableLocator ?? locStr(step);
        if (!tbl) {
          Logger.warn('extractTableData: tableLocator required');
          return false;
        }
        const headers = await page
          .locator(`${tbl} thead th, ${tbl} tr:first-child th`)
          .allTextContents();
        const rows = await page.locator(`${tbl} tbody tr`).all();
        const data: Record<string, string>[] = [];
        for (const row of rows) {
          const cells = await row.locator('td').allTextContents();
          const obj: Record<string, string> = {};
          headers.forEach((h, i) => {
            obj[h.trim()] = (cells[i] ?? '').trim();
          });
          data.push(obj);
        }
        const key = step.extractKey ?? 'tableData';
        if (step.extra) step.extra[key] = data;
        Logger.info(`Extracted table: ${data.length} rows, ${headers.length} cols`);
        return true;
      }

      // ── Additional assertions ────────────────────────────────────────────────

      case 'assertEmpty': {
        const el = getEl(page, step);
        if (!el) return false;
        const text = ((await el.first().textContent()) ?? '').trim();
        const val = await el
          .first()
          .inputValue()
          .catch(() => '');
        const result = text === '' && val === '';
        Logger.info(`Assert empty: ${result}`);
        return result;
      }

      case 'assertNotEmpty': {
        const el = getEl(page, step);
        if (!el) return false;
        const text = ((await el.first().textContent()) ?? '').trim();
        const val = await el
          .first()
          .inputValue()
          .catch(() => '');
        const result = text !== '' || val !== '';
        Logger.info(`Assert not empty: ${result}`);
        return result;
      }

      case 'assertExists': {
        const loc = locStr(step);
        if (!loc) return false;
        const count = await (resolveLocatorToPlaywright(page, loc) ?? page.locator(loc)).count();
        Logger.info(`Assert exists "${loc}": ${count > 0}`);
        return count > 0;
      }

      case 'assertNotExists': {
        const loc = locStr(step);
        if (!loc) return false;
        const count = await (resolveLocatorToPlaywright(page, loc) ?? page.locator(loc)).count();
        Logger.info(`Assert not exists "${loc}": ${count === 0}`);
        return count === 0;
      }

      case 'waitForCount': {
        const loc = step.waitLocator ?? locStr(step);
        if (!loc) {
          Logger.warn('waitForCount: locator required');
          return false;
        }
        const expected = step.waitCount ?? 1;
        const timeout = step.timeout ?? DEFAULT_CONFIG.waitTimeout;
        const start = Date.now();
        while (Date.now() - start < timeout) {
          const count = await (resolveLocatorToPlaywright(page, loc) ?? page.locator(loc)).count();
          if (count === expected) {
            Logger.info(`waitForCount: ${expected} found`);
            return true;
          }
          await page.waitForTimeout(200);
        }
        Logger.warn(`waitForCount: timeout waiting for ${expected}`);
        return false;
      }

      case 'screenshotElement': {
        const el = getEl(page, step);
        if (!el) return false;
        const base = path.resolve(DEFAULT_CONFIG.screenshotDir);
        fs.mkdirSync(base, { recursive: true });
        // Use only timestamp — no user input flows into path
        const filePath = path.join(base, 'element-' + Date.now() + '.png');
        await el.first().screenshot({ path: filePath });
        if (step.extra) step.extra['screenshotPath'] = filePath;
        Logger.info(`Element screenshot: ${filePath}`);
        return true;
      }

      default:
        return null; // not handled here — fall through to plugin registry
    }
  } catch (e) {
    Logger.error(`ExtendedAction "${action}" failed on "${step.label}"`, String(e));
    return false;
  }
}
