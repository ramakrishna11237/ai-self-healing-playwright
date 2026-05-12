/**
 * ActionRouterExtensions2 — 63 deep automation actions (Part 2 of 2)
 *
 * Split into two files purely for maintainability (file size):
 *   ActionRouterExtensions.ts  → Actions 1-35  (rich text, cookies, API, visual, keyboard, scroll, window, conditional, data extraction)
 *   ActionRouterExtensions2.ts → Actions 36-98 (navigation, mouse, keyboard, forms, DOM, mobile, performance, assertions, waits)
 *
 * To add a new action:
 *   - Add the case here if it fits an existing category
 *   - Or create ActionRouterExtensions3.ts for a new category
 *   - Register in ActionRouter.ts chain
 */

import * as fs from 'fs';
import * as path from 'path';
import { Page } from '@playwright/test';
import { Step } from '../types';
import { Logger } from '../utils/Logger';
import { DEFAULT_CONFIG } from '../config';
import { resolveLocatorToPlaywright } from './ActionRouter';
import { SecurityEnforcer } from '../security/SecurityEnforcer';

function getEl(page: Page, step: Step) {
  const loc = step.codegenLocator || step.locator || '';
  if (!loc) return null;
  return resolveLocatorToPlaywright(page, loc);
}

function locStr(step: Step): string {
  return step.codegenLocator || step.locator || '';
}

export async function handleExtendedAction2(
  page: Page,
  action: string,
  step: Step
): Promise<boolean | null> {
  try {
    switch (action) {
      // ── Navigation (5) ──────────────────────────────────────────────────────

      case 'navigateAndWait': {
        if (!step.expectedUrl) {
          Logger.warn('navigateAndWait: expectedUrl required');
          return false;
        }
        if (!/^https?:\/\//i.test(step.expectedUrl)) {
          Logger.warn(`navigateAndWait: blocked non-http URL "${step.expectedUrl}"`);
          return false;
        }
        await page.goto(step.expectedUrl, { timeout: step.timeout ?? 30000 });
        await page.waitForTimeout(step.waitAfterNavigate ?? 500);
        Logger.info(`Navigated and waited: ${step.expectedUrl}`);
        return true;
      }

      case 'openInNewTab': {
        if (!step.newTabUrl) {
          Logger.warn('openInNewTab: newTabUrl required');
          return false;
        }
        if (!/^https?:\/\//i.test(step.newTabUrl)) {
          Logger.warn(`openInNewTab: blocked non-http URL "${step.newTabUrl}"`);
          return false;
        }
        const newPage = await page.context().newPage();
        await newPage.goto(step.newTabUrl, { timeout: step.timeout ?? 30000 });
        Logger.info(`Opened in new tab: ${step.newTabUrl}`);
        return true;
      }

      case 'printPage': {
        await page.evaluate(() => window.print());
        Logger.info('Print dialog triggered');
        return true;
      }

      case 'printToPdf': {
        const baseDir = path.resolve('test-results');
        fs.mkdirSync(baseDir, { recursive: true });
        // CWE-22: strip directory components, traversal sequences, and non-safe chars
        const rawPdfName = step.pdfOutputPath ?? `page-${Date.now()}.pdf`;
        const safePdfName = path.basename(rawPdfName).replace(/\.\./g, '_').replace(/[^a-z0-9._-]/gi, '_');
        const outPath = path.resolve(baseDir, safePdfName);
        if (!outPath.startsWith(baseDir + path.sep)) {
          Logger.warn('printToPdf: path traversal blocked');
          return false;
        }
        await page.pdf({ path: outPath });
        if (step.extra) step.extra['pdfPath'] = outPath;
        Logger.info(`PDF saved: ${outPath}`);
        return true;
      }

      case 'savePageSource': {
        const baseDir = path.resolve('test-results');
        fs.mkdirSync(baseDir, { recursive: true });
        // CWE-22: strip directory components, traversal sequences, and non-safe chars
        const rawSrcName = step.pageSourcePath ?? `source-${Date.now()}.html`;
        const safeSrcName = path.basename(rawSrcName).replace(/\.\./g, '_').replace(/[^a-z0-9._-]/gi, '_');
        const outPath = path.resolve(baseDir, safeSrcName);
        if (!outPath.startsWith(baseDir + path.sep)) {
          Logger.warn('savePageSource: path traversal blocked');
          return false;
        }
        const html = await page.content();
        fs.writeFileSync(outPath, html, 'utf-8');
        if (step.extra) step.extra['pageSourcePath'] = outPath;
        Logger.info(`Page source saved: ${outPath}`);
        return true;
      }

      // ── Mouse (6) ────────────────────────────────────────────────────────────

      case 'clickWithModifier': {
        const el = getEl(page, step);
        if (!el) return false;
        await el.first().click({
          modifiers: [step.modifierKey ?? 'Control'],
          timeout: step.timeout ?? DEFAULT_CONFIG.timeout,
        });
        Logger.info(`Click with ${step.modifierKey ?? 'Control'}: ${locStr(step)}`);
        return true;
      }

      case 'clickOffset': {
        const el = getEl(page, step);
        if (!el) return false;
        await el.first().click({
          position: { x: step.offsetX ?? 0, y: step.offsetY ?? 0 },
          timeout: step.timeout ?? DEFAULT_CONFIG.timeout,
        });
        Logger.info(`Click offset (${step.offsetX ?? 0}, ${step.offsetY ?? 0}): ${locStr(step)}`);
        return true;
      }

      case 'mouseDown': {
        const el = getEl(page, step);
        if (el) {
          const box = await el.first().boundingBox();
          if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        }
        await page.mouse.down();
        Logger.info('Mouse down');
        return true;
      }

      case 'mouseUp': {
        await page.mouse.up();
        Logger.info('Mouse up');
        return true;
      }

      case 'mouseWheel': {
        await page.mouse.wheel(step.wheelDeltaX ?? 0, step.wheelDeltaY ?? 300);
        Logger.info(`Mouse wheel: dx=${step.wheelDeltaX ?? 0}, dy=${step.wheelDeltaY ?? 300}`);
        return true;
      }

      case 'tripleClick': {
        const el = getEl(page, step);
        if (!el) return false;
        await el.first().click({ clickCount: 3, timeout: step.timeout ?? DEFAULT_CONFIG.timeout });
        Logger.info(`Triple clicked: ${locStr(step)}`);
        return true;
      }

      // ── Keyboard (4) ─────────────────────────────────────────────────────────

      case 'keyDown': {
        const key = step.holdKey ?? step.key ?? 'Shift';
        await page.keyboard.down(key);
        Logger.info(`Key down: ${key}`);
        return true;
      }

      case 'keyUp': {
        const key = step.holdKey ?? step.key ?? 'Shift';
        await page.keyboard.up(key);
        Logger.info(`Key up: ${key}`);
        return true;
      }

      case 'clearAndType': {
        const el = getEl(page, step);
        if (!el) return false;
        await el.first().clear();
        await el.first().fill(step.value ?? step.text ?? '');
        Logger.info(`Cleared and typed: ${locStr(step)}`);
        return true;
      }

      case 'typeIntoActiveElement': {
        await page.keyboard.type(step.value ?? step.text ?? '', { delay: step.delay ?? 0 });
        Logger.info(`Typed into active element: "${step.value ?? step.text ?? ''}"`);
        return true;
      }

      // ── Forms (5) ────────────────────────────────────────────────────────────

      case 'selectByIndex': {
        const el = getEl(page, step);
        if (!el) return false;
        await el.first().selectOption({ index: step.selectIndex ?? 0 });
        Logger.info(`Selected by index ${step.selectIndex ?? 0}: ${locStr(step)}`);
        return true;
      }

      case 'selectByValue': {
        const el = getEl(page, step);
        if (!el) return false;
        await el.first().selectOption({ value: step.selectValue ?? step.value ?? '' });
        Logger.info(`Selected by value "${step.selectValue ?? step.value}": ${locStr(step)}`);
        return true;
      }

      case 'toggleCheckbox': {
        const el = getEl(page, step);
        if (!el) return false;
        const checked = await el.first().isChecked();
        if (checked) await el.first().uncheck();
        else await el.first().check();
        Logger.info(`Checkbox toggled to: ${!checked}`);
        return true;
      }

      case 'fillDate': {
        const el = getEl(page, step);
        if (!el) return false;
        await el.first().fill(step.dateValue ?? step.value ?? '');
        Logger.info(`Date filled: ${step.dateValue ?? step.value}`);
        return true;
      }

      case 'fillTime': {
        const el = getEl(page, step);
        if (!el) return false;
        await el.first().fill(step.timeValue ?? step.value ?? '');
        Logger.info(`Time filled: ${step.timeValue ?? step.value}`);
        return true;
      }

      // ── Forms continued + DOM (5) ────────────────────────────────────────────

      case 'fillDateTime': {
        const el = getEl(page, step);
        if (!el) return false;
        await el.first().fill(step.dateTimeValue ?? step.value ?? '');
        Logger.info(`DateTime filled: ${step.dateTimeValue ?? step.value}`);
        return true;
      }

      case 'radioSelect': {
        const loc = locStr(step);
        if (!loc) {
          Logger.warn('radioSelect: locator required');
          return false;
        }
        const radios = resolveLocatorToPlaywright(page, loc) ?? page.locator(loc);
        const val = step.radioValue ?? step.value ?? '';
        const target = radios
          .filter({ hasText: val })
          .or(page.locator(`input[type="radio"][value="${val}"]`));
        await target.first().check();
        Logger.info(`Radio selected: "${val}"`);
        return true;
      }

      case 'rangeSlider': {
        const el = getEl(page, step);
        if (!el) return false;
        await el.first().fill(String(step.sliderValue ?? 50));
        await el.first().dispatchEvent('input');
        await el.first().dispatchEvent('change');
        Logger.info(`Slider set to: ${step.sliderValue ?? 50}`);
        return true;
      }

      case 'pasteText': {
        const el = getEl(page, step);
        if (!el) return false;
        await el.first().focus();
        await page.evaluate(
          (text: string) => navigator.clipboard.writeText(text),
          step.pasteValue ?? step.value ?? ''
        );
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
        Logger.info(`Pasted text: "${step.pasteValue ?? step.value}"`);
        return true;
      }

      case 'executeAsyncScript': {
        // CWE-95: eval() removed entirely — no safe way to execute arbitrary async scripts.
        Logger.warn(
          "executeAsyncScript: disabled — arbitrary script execution blocked (CWE-95). Use 'evaluate' action instead."
        );
        return false;
      }

      // ── DOM/JS + Browser Context (5) ───────────────────────────────────────────

      case 'addScriptTag': {
        // CWE-95: inline scriptContent blocked — only URL-based script tags allowed.
        if (!step.scriptUrl) {
          Logger.warn('addScriptTag: scriptUrl required — inline scriptContent blocked (CWE-95)');
          return false;
        }
        if (!SecurityEnforcer.validateUrl(step.scriptUrl)) {
          Logger.warn(`addScriptTag: invalid or unsafe scriptUrl "${step.scriptUrl}"`);
          return false;
        }
        await page.addScriptTag({ url: step.scriptUrl });
        Logger.info(`Script tag added: ${step.scriptUrl}`);
        return true;
      }

      case 'addStyleTag': {
        // CWE-95: inline styleContent blocked — only URL-based style tags allowed.
        if (!step.styleUrl) {
          Logger.warn('addStyleTag: styleUrl required — inline styleContent blocked (CWE-95)');
          return false;
        }
        if (!SecurityEnforcer.validateUrl(step.styleUrl)) {
          Logger.warn(`addStyleTag: invalid or unsafe styleUrl "${step.styleUrl}"`);
          return false;
        }
        await page.addStyleTag({ url: step.styleUrl });
        Logger.info(`Style tag added: ${step.styleUrl}`);
        return true;
      }

      case 'setPermission':
      case 'grantPermission': {
        if (!step.permission) {
          Logger.warn('grantPermission: permission required');
          return false;
        }
        await page
          .context()
          .grantPermissions([step.permission], { origin: step.permissionOrigin ?? page.url() });
        Logger.info(`Permission granted: ${step.permission}`);
        return true;
      }

      case 'denyPermission': {
        if (!step.permission) {
          Logger.warn('denyPermission: permission required');
          return false;
        }
        await page.context().clearPermissions();
        Logger.info(`Permission denied/cleared: ${step.permission}`);
        return true;
      }

      case 'blockRequest': {
        if (!step.blockPattern) {
          Logger.warn('blockRequest: blockPattern required');
          return false;
        }
        await page.route(step.blockPattern, (route) => route.abort());
        Logger.info(`Request blocked: ${step.blockPattern}`);
        return true;
      }

      // ── Browser Context + Storage (5) ─────────────────────────────────────────

      case 'unblockRequest': {
        if (!step.blockPattern) {
          Logger.warn('unblockRequest: blockPattern required');
          return false;
        }
        await page.unroute(step.blockPattern);
        Logger.info(`Request unblocked: ${step.blockPattern}`);
        return true;
      }

      case 'clearRoutes': {
        await page.unrouteAll();
        Logger.info('All routes cleared');
        return true;
      }

      case 'getLocalStorage': {
        if (!step.storageKey) {
          Logger.warn('getLocalStorage: storageKey required');
          return false;
        }
        const val = await page.evaluate(
          (k: string) => window.localStorage.getItem(k),
          step.storageKey
        );
        if (step.extra) step.extra['storageValue'] = val;
        Logger.info(`localStorage get "${step.storageKey}": ${val}`);
        return true;
      }

      case 'setSessionStorage': {
        if (!step.sessionStorageKey || step.sessionStorageValue === undefined) {
          Logger.warn('setSessionStorage: sessionStorageKey and sessionStorageValue required');
          return false;
        }
        await page.evaluate(
          ({ k, v }: { k: string; v: string }) => window.sessionStorage.setItem(k, v),
          { k: step.sessionStorageKey, v: step.sessionStorageValue }
        );
        Logger.info(`sessionStorage set: ${step.sessionStorageKey}`);
        return true;
      }

      case 'getSessionStorage': {
        if (!step.sessionStorageKey) {
          Logger.warn('getSessionStorage: sessionStorageKey required');
          return false;
        }
        const val = await page.evaluate(
          (k: string) => window.sessionStorage.getItem(k),
          step.sessionStorageKey
        );
        if (step.extra) step.extra['sessionStorageValue'] = val;
        Logger.info(`sessionStorage get "${step.sessionStorageKey}": ${val}`);
        return true;
      }

      // ── Storage + API (5) ─────────────────────────────────────────────────────────

      case 'clearSessionStorage': {
        await page.evaluate(() => window.sessionStorage.clear());
        Logger.info('sessionStorage cleared');
        return true;
      }

      case 'apiGet': {
        if (!step.apiUrl) {
          Logger.warn('apiGet: apiUrl required');
          return false;
        }
        const res = await page.request.get(step.apiUrl, { headers: step.apiHeaders });
        if (step.extra) {
          step.extra['apiStatus'] = res.status();
          step.extra['apiBody'] = await res.json().catch(() => null);
        }
        Logger.info(
          `GET ${step.apiUrl.replace(/([?&](token|key|auth|secret)=)[^&]*/gi, '$1[REDACTED]')} → ${res.status()}`
        );
        return res.ok();
      }

      case 'apiPost': {
        if (!step.apiUrl) {
          Logger.warn('apiPost: apiUrl required');
          return false;
        }
        const res = await page.request.post(step.apiUrl, {
          headers: step.apiHeaders,
          data: step.apiBody,
        });
        if (step.extra) {
          step.extra['apiStatus'] = res.status();
          step.extra['apiBody'] = await res.json().catch(() => null);
        }
        Logger.info(
          `POST ${step.apiUrl.replace(/([?&](token|key|auth|secret)=)[^&]*/gi, '$1[REDACTED]')} → ${res.status()}`
        );
        return res.ok();
      }

      case 'apiPut': {
        if (!step.apiUrl) {
          Logger.warn('apiPut: apiUrl required');
          return false;
        }
        const res = await page.request.put(step.apiUrl, {
          headers: step.apiHeaders,
          data: step.apiBody,
        });
        if (step.extra) {
          step.extra['apiStatus'] = res.status();
          step.extra['apiBody'] = await res.json().catch(() => null);
        }
        Logger.info(
          `PUT ${step.apiUrl.replace(/([?&](token|key|auth|secret)=)[^&]*/gi, '$1[REDACTED]')} → ${res.status()}`
        );
        return res.ok();
      }

      case 'apiDelete': {
        if (!step.apiUrl) {
          Logger.warn('apiDelete: apiUrl required');
          return false;
        }
        const res = await page.request.delete(step.apiUrl, { headers: step.apiHeaders });
        if (step.extra) {
          step.extra['apiStatus'] = res.status();
        }
        Logger.info(
          `DELETE ${step.apiUrl.replace(/([?&](token|key|auth|secret)=)[^&]*/gi, '$1[REDACTED]')} → ${res.status()}`
        );
        return res.ok();
      }

      // ── API + Visual (5) ─────────────────────────────────────────────────────────

      case 'apiAssertResponse': {
        if (!step.apiUrl) {
          Logger.warn('apiAssertResponse: apiUrl required');
          return false;
        }
        const res = await page.request.get(step.apiUrl, { headers: step.apiHeaders });
        const status = res.status();
        if (step.apiExpectedStatus !== undefined && status !== step.apiExpectedStatus) {
          Logger.warn(`apiAssertResponse: expected ${step.apiExpectedStatus}, got ${status}`);
          return false;
        }
        if (step.apiExpectedBody !== undefined) {
          const body = (await res.json().catch(() => null)) as unknown;
          const match = JSON.stringify(body).includes(JSON.stringify(step.apiExpectedBody));
          if (!match) {
            Logger.warn(`apiAssertResponse: body mismatch`);
            return false;
          }
        }
        Logger.info(`apiAssertResponse: ${step.apiUrl} → ${status} OK`);
        return true;
      }

      case 'compareScreenshot': {
        const { VisualRegression } = await import('../utils/VisualRegression');
        const visual = new VisualRegression(page);
        const name = step.baselineScreenshot ?? step.screenshotName ?? `screenshot-${Date.now()}`;
        const result = await visual.compare(name, undefined, step.screenshotThreshold ?? 0.1);
        if (step.extra) step.extra['visualResult'] = result;
        Logger.info(`compareScreenshot "${name}": ${result.match}`);
        return result.match;
      }

      case 'captureFullPage': {
        const dir = DEFAULT_CONFIG.screenshotDir;
        fs.mkdirSync(dir, { recursive: true });
        const base = path.resolve(dir);
        const name = path.basename(step.screenshotName ?? `fullpage-${Date.now()}.png`);
        const filePath = path.join(base, name);
        if (!filePath.startsWith(base + path.sep) && filePath !== base) {
          Logger.warn('captureFullPage: path traversal blocked');
          return false;
        }
        await page.screenshot({ path: filePath, fullPage: true });
        if (step.extra) step.extra['screenshotPath'] = filePath;
        Logger.info(`Full page captured: ${filePath}`);
        return true;
      }

      case 'captureViewport': {
        const dir = DEFAULT_CONFIG.screenshotDir;
        fs.mkdirSync(dir, { recursive: true });
        const base = path.resolve(dir);
        const name = path.basename(step.screenshotName ?? `viewport-${Date.now()}.png`);
        const filePath = path.join(base, name);
        if (!filePath.startsWith(base + path.sep) && filePath !== base) {
          Logger.warn('captureViewport: path traversal blocked');
          return false;
        }
        await page.screenshot({ path: filePath, fullPage: false });
        if (step.extra) step.extra['screenshotPath'] = filePath;
        Logger.info(`Viewport captured: ${filePath}`);
        return true;
      }

      case 'highlightElement': {
        const el = getEl(page, step);
        if (!el) return false;
        // CWE-95: color validated against allowlist; set via style properties not cssText interpolation
        const ALLOWED_COLORS = new Set([
          'red',
          'blue',
          'green',
          'orange',
          'yellow',
          'purple',
          'pink',
          'cyan',
          'magenta',
          'lime',
        ]);
        const rawColor = (step.highlightColor ?? 'red').toLowerCase().trim();
        const safeColor = ALLOWED_COLORS.has(rawColor) ? rawColor : 'red';
        const duration = Math.min(Math.max(step.highlightDuration ?? 2000, 0), 10000);
        await el.first().evaluate((node: Element, c: string) => {
          const h = node as HTMLElement;
          const prev = h.style.outline;
          h.style.outline = `3px solid ${c}`;
          setTimeout(() => {
            h.style.outline = prev;
          }, 2000);
        }, safeColor);
        await page.waitForTimeout(duration);
        Logger.info(`Element highlighted: ${locStr(step)}`);
        return true;
      }

      // ── Performance + Mobile start (5) ───────────────────────────────────────

      case 'measurePerformance': {
        // CWE-95: metric validated via SecurityEnforcer allowlist before passing to evaluate
        const metric = step.performanceMetric ?? 'pageLoad';
        if (!SecurityEnforcer.validatePerformanceMetric(metric)) {
          Logger.warn(`measurePerformance: metric "${metric}" not in allowlist — blocked (CWE-95)`);
          return false;
        }
        const value: number = await page.evaluate((m: string) => {
          const t = performance.timing;
          const nav = performance.getEntriesByType('navigation')[0] as
            | PerformanceNavigationTiming
            | undefined;
          const map: Record<string, number> = {
            pageLoad: t.loadEventEnd - t.navigationStart,
            domLoad: t.domContentLoadedEventEnd - t.navigationStart,
            TTFB: t.responseStart - t.navigationStart,
            FCP: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0,
            LCP:
              performance.getEntriesByType('largest-contentful-paint').slice(-1)[0]?.startTime ?? 0,
            CLS: (
              performance.getEntriesByType('layout-shift') as unknown as { value: number }[]
            ).reduce((s, e) => s + e.value, 0),
            TTI: nav?.domInteractive ?? 0,
          };
          return map[m] ?? 0;
        }, metric);
        if (step.extra) step.extra['performanceValue'] = value;
        const threshold = step.performanceThresholdMs;
        const pass = threshold === undefined || value <= threshold;
        Logger.info(
          `measurePerformance ${metric}: ${value.toFixed(1)}ms${threshold ? ` (threshold: ${threshold}ms, pass: ${pass})` : ''}`
        );
        return pass;
      }

      case 'startTrace': {
        await page
          .context()
          .tracing.start({ screenshots: true, snapshots: true, name: step.traceName });
        Logger.info(`Trace started: ${step.traceName ?? '(default)'}`);
        return true;
      }

      case 'stopTrace': {
        const baseDir = path.resolve('test-results/traces');
        fs.mkdirSync(baseDir, { recursive: true });
        // Sanitize traceName — strip traversal and non-safe chars
        const safeName = path.basename((step.traceName ?? 'trace').replace(/[^a-z0-9_-]/gi, '_'));
        const tracePath = path.join(baseDir, `${safeName}-${Date.now()}.zip`);
        if (!tracePath.startsWith(baseDir + path.sep)) {
          Logger.warn('stopTrace: path traversal blocked');
          return false;
        }
        await page.context().tracing.stop({ path: tracePath });
        if (step.extra) step.extra['tracePath'] = tracePath;
        Logger.info(`Trace saved: ${tracePath}`);
        return true;
      }

      case 'captureHar': {
        // CWE-22: harPath sanitized — filename only, forced into test-results/
        const baseDir = path.resolve('test-results');
        fs.mkdirSync(baseDir, { recursive: true });
        const rawName = step.harPath ? path.basename(step.harPath) : `har-${Date.now()}.har`;
        const safeName = rawName.replace(/[^a-z0-9._-]/gi, '_');
        const harPath = path.join(baseDir, safeName);
        if (!harPath.startsWith(baseDir + path.sep)) {
          Logger.warn('captureHar: path traversal blocked');
          return false;
        }
        await page.context().tracing.start({ screenshots: false, snapshots: false });
        if (step.extra) step.extra['harPath'] = harPath;
        Logger.info(`HAR capture started, path: ${harPath}`);
        return true;
      }

      case 'swipe': {
        const dir = step.swipeDirection ?? 'up';
        const dist = step.swipeDistance ?? 300;
        const vp = page.viewportSize() ?? { width: 390, height: 844 };
        const cx = vp.width / 2,
          cy = vp.height / 2;
        const vectors: Record<string, [number, number, number, number]> = {
          up: [cx, cy + dist / 2, cx, cy - dist / 2],
          down: [cx, cy - dist / 2, cx, cy + dist / 2],
          left: [cx + dist / 2, cy, cx - dist / 2, cy],
          right: [cx - dist / 2, cy, cx + dist / 2, cy],
        };
        const [sx, sy, ex, ey] = vectors[dir] ?? vectors['up'];
        await page.mouse.move(sx, sy);
        await page.mouse.down();
        await page.mouse.move(ex, ey, { steps: step.swipeSpeed ?? 10 });
        await page.mouse.up();
        Logger.info(`Swiped ${dir} ${dist}px`);
        return true;
      }

      // ── Mobile (5) ────────────────────────────────────────────────────────────

      case 'pinchZoom': {
        const scale = step.pinchScale ?? 2;
        const vp = page.viewportSize() ?? { width: 390, height: 844 };
        const cx = vp.width / 2,
          cy = vp.height / 2;
        await page.evaluate(
          ({ cx, cy, scale }: { cx: number; cy: number; scale: number }) => {
            const el = document.elementFromPoint(cx, cy) ?? document.body;
            el.dispatchEvent(
              new TouchEvent('touchstart', {
                bubbles: true,
                touches: [
                  new Touch({ identifier: 1, target: el, clientX: cx - 50, clientY: cy }),
                  new Touch({ identifier: 2, target: el, clientX: cx + 50, clientY: cy }),
                ],
              })
            );
            el.dispatchEvent(
              new TouchEvent('touchend', {
                bubbles: true,
                changedTouches: [
                  new Touch({ identifier: 1, target: el, clientX: cx - 50 * scale, clientY: cy }),
                  new Touch({ identifier: 2, target: el, clientX: cx + 50 * scale, clientY: cy }),
                ],
              })
            );
          },
          { cx, cy, scale }
        );
        Logger.info(`Pinch zoom scale: ${scale}`);
        return true;
      }

      case 'rotate': {
        const orientation = step.orientation ?? 'landscape';
        const vp = page.viewportSize() ?? { width: 390, height: 844 };
        await page.setViewportSize(
          orientation === 'landscape'
            ? { width: Math.max(vp.width, vp.height), height: Math.min(vp.width, vp.height) }
            : { width: Math.min(vp.width, vp.height), height: Math.max(vp.width, vp.height) }
        );
        Logger.info(`Rotated to: ${orientation}`);
        return true;
      }

      case 'shake': {
        await page.evaluate(() => {
          window.dispatchEvent(
            new DeviceMotionEvent('devicemotion', {
              acceleration: { x: 15, y: 15, z: 15 },
              accelerationIncludingGravity: { x: 15, y: 15, z: 15 },
              rotationRate: { alpha: 0, beta: 0, gamma: 0 },
              interval: 16,
            })
          );
        });
        Logger.info('Shake simulated');
        return true;
      }

      case 'setOrientation': {
        const orientation = step.orientation ?? 'portrait';
        const vp = page.viewportSize() ?? { width: 390, height: 844 };
        await page.setViewportSize(
          orientation === 'landscape'
            ? { width: Math.max(vp.width, vp.height), height: Math.min(vp.width, vp.height) }
            : { width: Math.min(vp.width, vp.height), height: Math.max(vp.width, vp.height) }
        );
        Logger.info(`Orientation set: ${orientation}`);
        return true;
      }

      case 'touchStart': {
        const x = step.touchX ?? 0,
          y = step.touchY ?? 0;
        await page.touchscreen.tap(x, y);
        Logger.info(`Touch start at (${x}, ${y})`);
        return true;
      }

      // ── Mobile continued + Data (5) ─────────────────────────────────────────

      case 'touchEnd': {
        const x = step.touchX ?? 0,
          y = step.touchY ?? 0;
        await page.evaluate(
          ({ x, y }: { x: number; y: number }) => {
            const el = document.elementFromPoint(x, y) ?? document.body;
            el.dispatchEvent(
              new TouchEvent('touchend', {
                bubbles: true,
                changedTouches: [new Touch({ identifier: 1, target: el, clientX: x, clientY: y })],
              })
            );
          },
          { x, y }
        );
        Logger.info(`Touch end at (${x}, ${y})`);
        return true;
      }

      case 'touchMove': {
        const x = step.touchX ?? 0,
          y = step.touchY ?? 0;
        await page.evaluate(
          ({ x, y }: { x: number; y: number }) => {
            const el = document.elementFromPoint(x, y) ?? document.body;
            el.dispatchEvent(
              new TouchEvent('touchmove', {
                bubbles: true,
                touches: [new Touch({ identifier: 1, target: el, clientX: x, clientY: y })],
              })
            );
          },
          { x, y }
        );
        Logger.info(`Touch move to (${x}, ${y})`);
        return true;
      }

      case 'getPageSource': {
        const html = await page.content();
        if (step.extra) step.extra['pageSource'] = html;
        Logger.info(`Page source captured (${html.length} chars)`);
        return true;
      }

      case 'getBrowserLogs': {
        const level = step.logLevel ?? 'all';
        const logs: string[] = [];
        const handler = (msg: { type: () => string; text: () => string }) => {
          if (level === 'all' || msg.type() === level) logs.push(`[${msg.type()}] ${msg.text()}`);
        };
        page.on('console', handler);
        await page.waitForTimeout(500);
        page.off('console', handler);
        if (step.extra) step.extra['browserLogs'] = logs;
        Logger.info(`Browser logs captured: ${logs.length} entries`);
        return true;
      }

      case 'clearBrowserLogs': {
        await page.evaluate(() => {
          // eslint-disable-next-line no-console
          console.clear();
        });
        Logger.info('Browser logs cleared');
        return true;
      }

      // ── Assertions (5) ─────────────────────────────────────────────────────────

      case 'assertStyle': {
        const el = getEl(page, step);
        if (!el || !step.cssProperty) {
          Logger.warn('assertStyle: locator and cssProperty required');
          return false;
        }
        if (!SecurityEnforcer.validateCssProperty(step.cssProperty)) {
          Logger.warn(`assertStyle: invalid cssProperty "${step.cssProperty}" — blocked (CWE-95)`);
          return false;
        }
        const safeProp = step.cssProperty;
        const val = await el
          .first()
          .evaluate(
            (node: Element, prop: string) =>
              window.getComputedStyle(node as HTMLElement).getPropertyValue(prop),
            safeProp
          );
        const result = val.trim() === (step.expectedCssValue ?? '').trim();
        Logger.info(
          `assertStyle [${safeProp}]: "${val}" === "${step.expectedCssValue}": ${result}`
        );
        return result;
      }

      case 'assertCssProperty': {
        const el = getEl(page, step);
        if (!el || !step.cssProperty) {
          Logger.warn('assertCssProperty: locator and cssProperty required');
          return false;
        }
        if (!SecurityEnforcer.validateCssProperty(step.cssProperty)) {
          Logger.warn(
            `assertCssProperty: invalid cssProperty "${step.cssProperty}" — blocked (CWE-95)`
          );
          return false;
        }
        const safeProp = step.cssProperty;
        const val = await el
          .first()
          .evaluate(
            (node: Element, prop: string) =>
              window.getComputedStyle(node as HTMLElement).getPropertyValue(prop),
            safeProp
          );
        const result = val.includes(step.expectedCssValue ?? '');
        Logger.info(
          `assertCssProperty [${safeProp}] contains "${step.expectedCssValue}": ${result}`
        );
        return result;
      }

      case 'assertPageSource': {
        const html = await page.content();
        const result = html.includes(step.expectedText ?? '');
        Logger.info(`assertPageSource contains "${step.expectedText}": ${result}`);
        return result;
      }

      case 'assertUrlMatches': {
        if (!step.pattern) {
          Logger.warn('assertUrlMatches: pattern required');
          return false;
        }
        if (step.pattern.length > 500) {
          Logger.warn('assertUrlMatches: pattern too long — blocked (ReDoS)');
          return false;
        }
        const url = page.url();
        const result = new RegExp(step.pattern, step.patternFlags ?? '').test(url);
        Logger.info(`assertUrlMatches /${step.pattern}/: ${result} (actual: ${url})`);
        return result;
      }

      case 'assertTitleMatches': {
        if (!step.pattern) {
          Logger.warn('assertTitleMatches: pattern required');
          return false;
        }
        if (step.pattern.length > 500) {
          Logger.warn('assertTitleMatches: pattern too long — blocked (ReDoS)');
          return false;
        }
        const title = await page.title();
        const result = new RegExp(step.pattern, step.patternFlags ?? '').test(title);
        Logger.info(`assertTitleMatches /${step.pattern}/: ${result} (actual: ${title})`);
        return result;
      }

      // ── Assertions continued (5) ───────────────────────────────────────────────

      case 'assertTextMatches': {
        const el = getEl(page, step);
        if (!el || !step.pattern) {
          Logger.warn('assertTextMatches: locator and pattern required');
          return false;
        }
        if (step.pattern.length > 500) {
          Logger.warn('assertTextMatches: pattern too long — blocked (ReDoS)');
          return false;
        }
        const text = (await el.first().textContent()) ?? '';
        const result = new RegExp(step.pattern, step.patternFlags ?? '').test(text);
        Logger.info(
          `assertTextMatches /${step.pattern}/: ${result} (actual: "${text.slice(0, 80)}")`
        );
        return result;
      }

      case 'assertValueMatches': {
        const el = getEl(page, step);
        if (!el || !step.pattern) {
          Logger.warn('assertValueMatches: locator and pattern required');
          return false;
        }
        if (step.pattern.length > 500) {
          Logger.warn('assertValueMatches: pattern too long — blocked (ReDoS)');
          return false;
        }
        const val = await el.first().inputValue();
        const result = new RegExp(step.pattern, step.patternFlags ?? '').test(val);
        Logger.info(`assertValueMatches /${step.pattern}/: ${result} (actual: "${val}")`);
        return result;
      }

      case 'assertAttributeMatches': {
        const el = getEl(page, step);
        if (!el || !step.attributeName || !step.pattern) {
          Logger.warn('assertAttributeMatches: locator, attributeName and pattern required');
          return false;
        }
        if (step.pattern.length > 500) {
          Logger.warn('assertAttributeMatches: pattern too long — blocked (ReDoS)');
          return false;
        }
        const val = (await el.first().getAttribute(step.attributeName)) ?? '';
        const result = new RegExp(step.pattern, step.patternFlags ?? '').test(val);
        Logger.info(
          `assertAttributeMatches [${step.attributeName}] /${step.pattern}/: ${result} (actual: "${val}")`
        );
        return result;
      }

      case 'assertResponseStatus': {
        if (!step.apiUrl) {
          Logger.warn('assertResponseStatus: apiUrl required');
          return false;
        }
        const res = await page.request.get(step.apiUrl, { headers: step.apiHeaders });
        const status = res.status();
        const expected = step.responseStatusCode ?? step.apiExpectedStatus ?? 200;
        const result = status === expected;
        Logger.info(
          `assertResponseStatus ${step.apiUrl}: expected=${expected}, actual=${status}, pass=${result}`
        );
        return result;
      }

      case 'assertLocalStorage': {
        if (!step.assertStorageKey) {
          Logger.warn('assertLocalStorage: assertStorageKey required');
          return false;
        }
        const val = await page.evaluate(
          (k: string) => window.localStorage.getItem(k),
          step.assertStorageKey
        );
        const result = val === (step.assertStorageValue ?? '');
        Logger.info(
          `assertLocalStorage "${step.assertStorageKey}": expected="${step.assertStorageValue}", actual="${val}", pass=${result}`
        );
        return result;
      }

      // ── Final Assertions + Waits (5) ───────────────────────────────────────────

      case 'assertCookie': {
        if (!step.assertCookieName) {
          Logger.warn('assertCookie: assertCookieName required');
          return false;
        }
        const cookies = await page.context().cookies();
        const cookie = cookies.find((c) => c.name === step.assertCookieName);
        const result =
          step.assertCookieValue !== undefined
            ? cookie?.value === step.assertCookieValue
            : cookie !== undefined;
        Logger.info(
          `assertCookie "${step.assertCookieName}": expected="${step.assertCookieValue ?? '(exists)'}" actual="${cookie?.value ?? '(not found)'}", pass=${result}`
        );
        return result;
      }

      case 'assertConsoleLog': {
        if (!step.assertLogMessage) {
          Logger.warn('assertConsoleLog: assertLogMessage required');
          return false;
        }
        const found: boolean[] = [false];
        const handler = (msg: { text: () => string }) => {
          if (msg.text().includes(step.assertLogMessage!)) found[0] = true;
        };
        page.on('console', handler);
        await page.waitForTimeout(500);
        page.off('console', handler);
        Logger.info(`assertConsoleLog "${step.assertLogMessage}": ${found[0]}`);
        return found[0];
      }

      case 'waitForAnimation': {
        const timeout = step.animationTimeout ?? step.timeout ?? DEFAULT_CONFIG.waitTimeout;
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
            )
        );
        await page.waitForTimeout(Math.min(timeout, 500));
        Logger.info('Waited for animation frame');
        return true;
      }

      case 'waitForLoadState': {
        const state = step.loadState ?? 'load';
        await page.waitForLoadState(state, { timeout: step.timeout ?? DEFAULT_CONFIG.waitTimeout });
        Logger.info(`waitForLoadState: ${state}`);
        return true;
      }

      case 'waitForPageLoad': {
        await page.waitForLoadState('load', { timeout: step.timeout ?? 30000 });
        Logger.info('Page fully loaded');
        return true;
      }

      // ── Final Waits (3) ────────────────────────────────────────────────────────────

      case 'waitForTextChange': {
        const loc = step.waitLocator ?? locStr(step);
        if (!loc) {
          Logger.warn('waitForTextChange: locator required');
          return false;
        }
        const el = resolveLocatorToPlaywright(page, loc) ?? page.locator(loc);
        const prev = step.previousText ?? (await el.first().textContent()) ?? '';
        const timeout = step.timeout ?? DEFAULT_CONFIG.waitTimeout;
        const start = Date.now();
        let consecutiveErrors = 0;
        while (Date.now() - start < timeout) {
          try {
            const current = (await el.first().textContent()) ?? '';
            if (current !== prev) {
              Logger.info(`waitForTextChange: changed from "${prev}" to "${current}"`);
              return true;
            }
            consecutiveErrors = 0;
          } catch {
            if (++consecutiveErrors >= 5) {
              Logger.warn('waitForTextChange: repeated errors — aborting');
              return false;
            }
          }
          await page.waitForTimeout(200);
        }
        Logger.warn(`waitForTextChange: timeout — text still "${prev}"`);
        return false;
      }

      case 'waitForAttributeChange': {
        const loc = step.waitLocator ?? locStr(step);
        if (!loc || !step.attributeName) {
          Logger.warn('waitForAttributeChange: locator and attributeName required');
          return false;
        }
        const el = resolveLocatorToPlaywright(page, loc) ?? page.locator(loc);
        const prev =
          step.previousAttributeValue ?? (await el.first().getAttribute(step.attributeName)) ?? '';
        const timeout = step.timeout ?? DEFAULT_CONFIG.waitTimeout;
        const start = Date.now();
        let consecutiveErrors = 0;
        while (Date.now() - start < timeout) {
          try {
            const current = (await el.first().getAttribute(step.attributeName)) ?? '';
            if (current !== prev) {
              Logger.info(
                `waitForAttributeChange [${step.attributeName}]: "${prev}" → "${current}"`
              );
              return true;
            }
            consecutiveErrors = 0;
          } catch {
            if (++consecutiveErrors >= 5) {
              Logger.warn('waitForAttributeChange: repeated errors — aborting');
              return false;
            }
          }
          await page.waitForTimeout(200);
        }
        Logger.warn(`waitForAttributeChange: timeout — [${step.attributeName}] still "${prev}"`);
        return false;
      }

      case 'waitForValueChange': {
        const loc = step.waitLocator ?? locStr(step);
        if (!loc) {
          Logger.warn('waitForValueChange: locator required');
          return false;
        }
        const el = resolveLocatorToPlaywright(page, loc) ?? page.locator(loc);
        const prev = step.previousValue ?? (await el.first().inputValue()) ?? '';
        const timeout = step.timeout ?? DEFAULT_CONFIG.waitTimeout;
        const start = Date.now();
        let consecutiveErrors = 0;
        while (Date.now() - start < timeout) {
          try {
            const current = await el.first().inputValue();
            if (current !== prev) {
              Logger.info(`waitForValueChange: "${prev}" → "${current}"`);
              return true;
            }
            consecutiveErrors = 0;
          } catch {
            if (++consecutiveErrors >= 5) {
              Logger.warn('waitForValueChange: repeated errors — aborting');
              return false;
            }
          }
          await page.waitForTimeout(200);
        }
        Logger.warn(`waitForValueChange: timeout — value still "${prev}"`);
        return false;
      }

      default:
        return null;
    }
  } catch (e) {
    Logger.error(`ExtendedAction2 "${action}" failed on "${step.label}"`, String(e));
    return false;
  }
}
