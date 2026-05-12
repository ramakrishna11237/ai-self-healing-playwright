import { Page } from '@playwright/test';
import { Step } from '../../types';
import { Logger } from '../../utils/Logger';
import { DEFAULT_CONFIG } from '../../config';
import { getElement, resolveLocatorStr, resolvePlaywrightLocator } from './locatorUtils';

export async function handleAssertionAction(page: Page, action: string, step: Step): Promise<boolean | null> {
  switch (action) {
    case 'validation': {
      const el = getElement(page, step);
      if (!el) return false;
      const text = await el.first().textContent();
      const result = (text ?? '').includes(step.expectedText ?? '');
      Logger.info(`Validation "${step.expectedText}": ${result}`);
      return result;
    }
    case 'assertUrl': {
      const current = page.url();
      const result = current.includes(step.expectedUrl ?? '');
      Logger.info(`Assert URL "${step.expectedUrl}": ${result} (actual: ${current})`);
      return result;
    }
    case 'assertTitle': {
      const title = await page.title();
      const result = title.includes(step.expectedTitle ?? '');
      Logger.info(`Assert title "${step.expectedTitle}": ${result} (actual: ${title})`);
      return result;
    }
    case 'assertVisible': {
      const el = getElement(page, step);
      if (!el) return false;
      try {
        await el.first().waitFor({ state: 'visible', timeout: step.timeout ?? DEFAULT_CONFIG.waitTimeout });
        Logger.info(`Assert visible "${resolveLocatorStr(step)}": true`);
        return true;
      } catch {
        Logger.info(`Assert visible "${resolveLocatorStr(step)}": false (timeout)`);
        return false;
      }
    }
    case 'assertHidden': {
      const loc = resolveLocatorStr(step);
      if (!loc) return true;
      const el = resolvePlaywrightLocator(page, loc);
      if (!el) return true;
      const count = await el.count();
      if (count === 0) { Logger.info(`Assert hidden "${loc}": true (not in DOM)`); return true; }
      const hidden = !(await el.first().isVisible());
      Logger.info(`Assert hidden "${loc}": ${hidden}`);
      return hidden;
    }
    case 'assertCount': {
      const el = getElement(page, step);
      if (!el) return false;
      const count = await el.count();
      const result = count === (step.expectedCount ?? 0);
      Logger.info(`Assert count ${step.expectedCount}: actual=${count}, match=${result}`);
      return result;
    }
    case 'assertAttribute': {
      const el = getElement(page, step);
      if (!el || !step.attributeName) { Logger.warn('assertAttribute: missing locator or attributeName'); return false; }
      const val = await el.first().getAttribute(step.attributeName);
      const result = (val ?? '').includes(step.expectedAttribute ?? '');
      Logger.info(`Assert [${step.attributeName}] contains "${step.expectedAttribute}": ${result}`);
      return result;
    }
    case 'assertText': {
      const el = getElement(page, step);
      if (!el) return false;
      try {
        await el.first().waitFor({ state: 'visible', timeout: step.timeout ?? DEFAULT_CONFIG.waitTimeout });
        const text = (await el.first().textContent()) ?? '';
        const result = step.expectedText ? text.includes(step.expectedText) : text.length > 0;
        Logger.info(`Assert text contains "${step.expectedText}": ${result} (actual: "${text.slice(0, 80)}")`);
        return result;
      } catch { return false; }
    }
    case 'assertValue': {
      const el = getElement(page, step);
      if (!el) return false;
      try {
        const value = await el.first().inputValue();
        const result = value === (step.expectedText ?? '');
        Logger.info(`Assert value "${step.expectedText}": ${result} (actual: "${value}")`);
        return result;
      } catch { return false; }
    }
    case 'assertChecked': {
      const el = getElement(page, step);
      if (!el) return false;
      try { const checked = await el.first().isChecked(); Logger.info(`Assert checked: ${checked}`); return checked; }
      catch { return false; }
    }
    case 'assertUnchecked': {
      const el = getElement(page, step);
      if (!el) return false;
      try { const checked = await el.first().isChecked(); Logger.info(`Assert unchecked: ${!checked}`); return !checked; }
      catch { return false; }
    }
    case 'assertEnabled': {
      const el = getElement(page, step);
      if (!el) return false;
      try { const enabled = await el.first().isEnabled(); Logger.info(`Assert enabled: ${enabled}`); return enabled; }
      catch { return false; }
    }
    case 'assertDisabled': {
      const el = getElement(page, step);
      if (!el) return false;
      try { const disabled = await el.first().isDisabled(); Logger.info(`Assert disabled: ${disabled}`); return disabled; }
      catch { return false; }
    }
    case 'assertHasClass': {
      const el = getElement(page, step);
      if (!el || !step.expectedAttribute) { Logger.warn('assertHasClass: expectedAttribute (class name) required'); return false; }
      try {
        const cls = (await el.first().getAttribute('class')) ?? '';
        const result = cls.split(/\s+/).includes(step.expectedAttribute);
        Logger.info(`Assert has class "${step.expectedAttribute}": ${result} (actual: "${cls}")`);
        return result;
      } catch { return false; }
    }
    case 'assertInViewport': {
      const el = getElement(page, step);
      if (!el) return false;
      try {
        const box = await el.first().boundingBox();
        if (!box) { Logger.info('assertInViewport: element has no bounding box'); return false; }
        const vp = page.viewportSize();
        if (!vp) { Logger.info('assertInViewport: no viewport'); return false; }
        const inView = box.x >= 0 && box.y >= 0 && box.x + box.width <= vp.width && box.y + box.height <= vp.height;
        Logger.info(`Assert in viewport: ${inView}`);
        return inView;
      } catch { return false; }
    }
    case 'assertEditable': {
      const el = getElement(page, step);
      if (!el) return false;
      try { const editable = await el.first().isEditable(); Logger.info(`Assert editable: ${editable}`); return editable; }
      catch { return false; }
    }
    case 'assertFocused': {
      const el = getElement(page, step);
      if (!el) return false;
      try {
        const focused = await el.first().evaluate((node) => node === document.activeElement);
        Logger.info(`Assert focused: ${focused}`);
        return focused;
      } catch { return false; }
    }
    case 'assertContainsText': {
      const el = getElement(page, step);
      if (!el) return false;
      try {
        await el.first().waitFor({ state: 'visible', timeout: step.timeout ?? DEFAULT_CONFIG.waitTimeout });
        const text = (await el.first().textContent()) ?? '';
        const result = text.includes(step.expectedText ?? '');
        Logger.info(`Assert contains "${step.expectedText}": ${result}`);
        return result;
      } catch { return false; }
    }
    case 'assertNotContainsText': {
      const el = getElement(page, step);
      if (!el) return false;
      try {
        const text = (await el.first().textContent()) ?? '';
        const result = !text.includes(step.notExpectedText ?? '');
        Logger.info(`Assert NOT contains "${step.notExpectedText}": ${result}`);
        return result;
      } catch { return false; }
    }
    case 'assertGreaterThan': {
      const el = getElement(page, step);
      if (!el) return false;
      try {
        const raw = ((await el.first().textContent()) ?? (await el.first().inputValue())).replace(/[^0-9.-]/g, '');
        const actual = parseFloat(raw);
        const result = actual > (step.expectedNumber ?? 0);
        Logger.info(`Assert ${actual} > ${step.expectedNumber}: ${result}`);
        return result;
      } catch { return false; }
    }
    case 'assertLessThan': {
      const el = getElement(page, step);
      if (!el) return false;
      try {
        const raw = ((await el.first().textContent()) ?? (await el.first().inputValue())).replace(/[^0-9.-]/g, '');
        const actual = parseFloat(raw);
        const result = actual < (step.expectedNumber ?? 0);
        Logger.info(`Assert ${actual} < ${step.expectedNumber}: ${result}`);
        return result;
      } catch { return false; }
    }
    case 'assertPattern': {
      const el = getElement(page, step);
      if (!el) { Logger.warn('assertPattern: no locator provided'); return false; }
      if (!step.pattern) { Logger.warn('assertPattern: no pattern provided'); return false; }
      if (step.pattern.length > 500) { Logger.warn('assertPattern: pattern too long — blocked (ReDoS)'); return false; }
      try {
        const regex = new RegExp(step.pattern, step.patternFlags ?? '');
        let actual = '';
        try { actual = (await el.first().textContent()) ?? ''; } catch { actual = ''; }
        if (!actual.trim()) { try { actual = await el.first().inputValue(); } catch { actual = ''; } }
        const result = regex.test(actual);
        Logger.info(`assertPattern /${step.pattern}/${step.patternFlags ?? ''}: ${result} (actual: "${actual.slice(0, 80)}")`);
        return result;
      } catch (e) { Logger.warn(`assertPattern: invalid regex "${step.pattern}": ${String(e)}`); return false; }
    }
    case 'assertPdf': {
      const { PdfVerifier } = await import('../../utils/PdfVerifier');
      const pdf = new PdfVerifier(page);
      const patterns: Record<string, RegExp> = {};
      for (const [label, pat] of Object.entries(step.pdfPatterns ?? {})) {
        try { patterns[label] = new RegExp(pat); } catch { /* skip */ }
      }
      let pdfResult;
      if (step.pdfTriggerLocator) {
        pdfResult = await pdf.downloadAndVerify(step.pdfTriggerLocator, { expectedTexts: step.pdfExpectedTexts, patterns, minPages: step.pdfMinPages, maxPages: step.pdfMaxPages, savePath: step.filePath });
      } else if (step.filePath) {
        pdfResult = await pdf.verifyFile(step.filePath, { expectedTexts: step.pdfExpectedTexts, patterns, minPages: step.pdfMinPages, maxPages: step.pdfMaxPages });
      } else { Logger.warn('assertPdf: provide pdfTriggerLocator or filePath'); return false; }
      if (step.extra) step.extra['pdfResult'] = pdfResult;
      Logger.info(`assertPdf: ${pdfResult.message}`);
      return pdfResult.success;
    }
    case 'tableGetCell': {
      const tbl = step.tableLocator ?? resolveLocatorStr(step);
      if (!tbl) { Logger.warn('tableGetCell: tableLocator required'); return false; }
      try {
        const text = (await page.locator(`${tbl} tr`).nth(step.tableRow ?? 0).locator('td, th').nth(step.tableCol ?? 0).textContent()) ?? '';
        Logger.info(`Table cell [${step.tableRow ?? 0}][${step.tableCol ?? 0}]: "${text}"`);
        if (step.extra) step.extra['cellText'] = text;
        return true;
      } catch { return false; }
    }
    case 'tableAssertRow': {
      const tbl = step.tableLocator ?? resolveLocatorStr(step);
      if (!tbl) { Logger.warn('tableAssertRow: tableLocator required'); return false; }
      const rowText = step.tableRowText ?? step.expectedText ?? '';
      try {
        const count = await page.locator(`${tbl} tr`).filter({ hasText: rowText }).count();
        Logger.info(`Table row "${rowText}" exists: ${count > 0}`);
        return count > 0;
      } catch { return false; }
    }
    case 'tableGetRowCount': {
      const tbl = step.tableLocator ?? resolveLocatorStr(step);
      if (!tbl) { Logger.warn('tableGetRowCount: tableLocator required'); return false; }
      try {
        const count = await page.locator(`${tbl} tr`).count();
        Logger.info(`Table row count: ${count}`);
        if (step.extra) step.extra['rowCount'] = count;
        if (step.expectedCount !== undefined) return count === step.expectedCount;
        return true;
      } catch { return false; }
    }
    default: return null;
  }
}
