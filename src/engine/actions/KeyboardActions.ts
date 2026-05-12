import { Page } from '@playwright/test';
import { Step } from '../../types';
import { Logger } from '../../utils/Logger';
import { DEFAULT_CONFIG } from '../../config';
import { getElement, resolveLocatorStr } from './locatorUtils';

export async function handleKeyboardAction(page: Page, action: string, step: Step): Promise<boolean | null> {
  switch (action) {
    case 'fill': {
      const el = getElement(page, step);
      if (!el) return false;
      await el.first().fill(step.value ?? step.text ?? '');
      Logger.info(`Filled: ${resolveLocatorStr(step)}`);
      return true;
    }
    case 'clearInput': {
      const el = getElement(page, step);
      if (!el) return false;
      await el.first().clear();
      Logger.info(`Cleared: ${resolveLocatorStr(step)}`);
      return true;
    }
    case 'typeSlowly': {
      const el = getElement(page, step);
      if (!el) return false;
      await el.first().pressSequentially(step.value ?? step.text ?? '', { delay: step.delay ?? DEFAULT_CONFIG.slowTypeDelay });
      Logger.info(`Typed slowly into: ${resolveLocatorStr(step)}`);
      return true;
    }
    case 'keyPress':
    case 'pressKey': {
      const key = step.key || 'Enter';
      const el = getElement(page, step);
      if (el) await el.first().press(key);
      else await page.keyboard.press(key);
      Logger.info(`Key pressed: ${key}`);
      return true;
    }
    case 'focus': {
      const el = getElement(page, step);
      if (!el) return false;
      await el.first().focus();
      Logger.info(`Focused: ${resolveLocatorStr(step)}`);
      return true;
    }
    case 'blur': {
      const el = getElement(page, step);
      if (!el) return false;
      await el.first().blur();
      Logger.info(`Blurred: ${resolveLocatorStr(step)}`);
      return true;
    }
    case 'selectAll': {
      const el = getElement(page, step);
      if (!el) return false;
      await el.first().selectText();
      Logger.info(`Selected all text in: ${resolveLocatorStr(step)}`);
      return true;
    }
    case 'selectText': {
      const el = getElement(page, step);
      if (!el) return false;
      await el.first().focus();
      if (step.selectionStart !== undefined && step.selectionEnd !== undefined) {
        await el.first().evaluate(
          (node, { start, end }) => (node as HTMLInputElement).setSelectionRange(start, end),
          { start: step.selectionStart, end: step.selectionEnd }
        );
        Logger.info(`Selected text [${step.selectionStart}-${step.selectionEnd}]: ${resolveLocatorStr(step)}`);
      } else {
        await el.first().selectText();
        Logger.info(`Selected all text: ${resolveLocatorStr(step)}`);
      }
      return true;
    }
    case 'clipboardCopy': {
      const el = getElement(page, step);
      if (!el) return false;
      await el.first().focus();
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+C' : 'Control+C');
      Logger.info(`Clipboard copy on: ${resolveLocatorStr(step)}`);
      return true;
    }
    case 'clipboardPaste': {
      const el = getElement(page, step);
      if (!el) return false;
      await el.first().focus();
      if (step.clipboardText) {
        await page.evaluate((text: string) => navigator.clipboard.writeText(text), step.clipboardText);
      }
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
      Logger.info(`Clipboard paste on: ${resolveLocatorStr(step)}`);
      return true;
    }
    default: return null;
  }
}
