import * as fs from 'fs';
import * as path from 'path';
import { Page } from '@playwright/test';
import { Step } from '../../types';
import { Logger } from '../../utils/Logger';
import { DEFAULT_CONFIG } from '../../config';
import { getElement, resolveLocatorStr, resolvePlaywrightLocator } from './locatorUtils';

export async function handleFormAction(page: Page, action: string, step: Step): Promise<boolean | null> {
  switch (action) {
    case 'submit': {
      const loc = resolveLocatorStr(step);
      const btn = loc
        ? (resolvePlaywrightLocator(page, loc) ?? page.locator(loc))
        : page.getByRole('button', { name: /submit|save|send|confirm/i });
      if ((await btn.count()) === 0) { Logger.warn('submit: no button found'); return false; }
      await btn.first().click();
      Logger.info('Form submitted');
      return true;
    }
    case 'dropdown': {
      const el = getElement(page, step);
      if (!el) return false;
      await el.first().selectOption(step.value ?? step.options?.[0] ?? '');
      Logger.info(`Dropdown selected: ${step.value ?? step.options?.[0]}`);
      return true;
    }
    case 'multiSelect': {
      const el = getElement(page, step);
      if (!el) return false;
      const vals = step.values ?? step.options ?? [];
      if (vals.length === 0) { Logger.warn('multiSelect: no values provided'); return false; }
      await el.first().selectOption(vals);
      Logger.info(`Multi-select: [${vals.join(', ')}]`);
      return true;
    }
    case 'check': {
      const el = getElement(page, step);
      if (!el) return false;
      await el.first().check();
      Logger.info(`Checked: ${resolveLocatorStr(step)}`);
      return true;
    }
    case 'uncheck': {
      const el = getElement(page, step);
      if (!el) return false;
      await el.first().uncheck();
      Logger.info(`Unchecked: ${resolveLocatorStr(step)}`);
      return true;
    }
    case 'upload': {
      const loc = resolveLocatorStr(step) || 'input[type="file"]';
      const input = resolvePlaywrightLocator(page, loc) ?? page.locator(loc);
      if ((await input.count()) === 0) { Logger.warn('upload: file input not found'); return false; }
      const filePath = step.filePath ?? step.value ?? '';
      if (!filePath) { Logger.warn('upload: no filePath provided'); return false; }
      const resolvedUpload = path.resolve(filePath);
      if (resolvedUpload.includes('..') || !fs.existsSync(resolvedUpload)) {
        Logger.warn(`upload: invalid or non-existent filePath "${filePath}"`);
        return false;
      }
      await input.setInputFiles(resolvedUpload);
      Logger.info(`File uploaded: ${filePath}`);
      return true;
    }
    case 'multiFileUpload': {
      const loc = resolveLocatorStr(step) || 'input[type="file"]';
      const input = resolvePlaywrightLocator(page, loc) ?? page.locator(loc);
      if ((await input.count()) === 0) { Logger.warn('multiFileUpload: file input not found'); return false; }
      const filePaths = step.filePaths ?? (step.filePath ? [step.filePath] : []);
      if (filePaths.length === 0) { Logger.warn('multiFileUpload: no filePaths provided'); return false; }
      const resolvedPaths: string[] = [];
      for (const fp of filePaths) {
        const resolved = path.resolve(fp);
        if (resolved.includes('..') || !fs.existsSync(resolved)) {
          Logger.warn(`multiFileUpload: invalid or non-existent filePath "${fp}"`);
          return false;
        }
        resolvedPaths.push(resolved);
      }
      await input.setInputFiles(resolvedPaths);
      Logger.info(`Multiple files uploaded: [${resolvedPaths.join(', ')}]`);
      return true;
    }
    case 'fileDownload': {
      const el = getElement(page, step);
      if (!el) return false;
      const [download] = await Promise.all([page.waitForEvent('download'), el.first().click()]);
      const rawSave = step.filePath ?? path.join(DEFAULT_CONFIG.downloadDir, download.suggestedFilename());
      const base = path.resolve(DEFAULT_CONFIG.downloadDir);
      const resolved = path.resolve(rawSave);
      if (!resolved.startsWith(base + path.sep)) {
        Logger.warn(`fileDownload: path traversal blocked for "${rawSave}"`);
        return false;
      }
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      await download.saveAs(resolved);
      Logger.info(`File downloaded: ${resolved}`);
      return true;
    }
    case 'login': {
      const userLoc = resolveLocatorStr(step);
      const userField = userLoc
        ? (resolvePlaywrightLocator(page, userLoc) ?? page.locator(userLoc))
        : page.getByRole('textbox', { name: /username|email|user/i }).first();
      const passField = page.locator('input[type="password"]');
      const loginBtn = page.getByRole('button', { name: /log\s?in|sign\s?in|submit/i });
      if ((await loginBtn.count()) === 0) { Logger.warn('login: no login button found'); return false; }
      if ((await userField.count()) > 0) await userField.fill(step.username ?? '');
      if ((await passField.count()) > 0) await passField.fill(step.password ?? '');
      await loginBtn.first().click();
      Logger.info('Login executed');
      return true;
    }
    case 'logout': {
      const loc = resolveLocatorStr(step);
      const btn = loc
        ? (resolvePlaywrightLocator(page, loc) ?? page.locator(loc))
        : page.getByRole('button', { name: /log\s?out|sign\s?out/i });
      if ((await btn.count()) === 0) { Logger.warn('logout: no logout button found'); return false; }
      await btn.first().click();
      Logger.info('Logout executed');
      return true;
    }
    case 'search': {
      const loc = resolveLocatorStr(step);
      const field = loc
        ? (resolvePlaywrightLocator(page, loc) ?? page.locator(loc))
        : page.getByRole('searchbox').or(page.locator('input[type="search"], input[placeholder*="search" i]')).first();
      if ((await field.count()) === 0) { Logger.warn('search: no search field found'); return false; }
      await field.fill(step.text ?? step.value ?? '');
      await field.press('Enter');
      Logger.info(`Searched: "${step.text ?? step.value}"`);
      return true;
    }
    default: return null;
  }
}
