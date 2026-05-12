import { Page } from '@playwright/test';
import { Step } from '../../types';
import { Logger } from '../../utils/Logger';
import { DEFAULT_CONFIG } from '../../config';
import { getElement, resolveLocatorStr, resolvePlaywrightLocator } from './locatorUtils';

export async function handleMouseAction(page: Page, action: string, step: Step): Promise<boolean | null> {
  switch (action) {
    case 'evaluateClick': {
      const selector = step.locator ?? step.codegenLocator;
      if (!selector) { Logger.warn('evaluateClick: no locator provided'); return false; }
      await page.waitForSelector(selector, { timeout: step.timeout || DEFAULT_CONFIG.timeout });
      await page.evaluate((sel) => {
        const el = document.querySelector(sel) as HTMLElement;
        if (el) el.click();
      }, selector);
      Logger.info(`JS-clicked (bypass overlay): ${selector}`);
      return true;
    }
    case 'click': {
      const el = getElement(page, step);
      if (!el) return false;
      await el.first().click({ timeout: step.timeout || DEFAULT_CONFIG.timeout });
      Logger.info(`Clicked: ${resolveLocatorStr(step)}`);
      return true;
    }
    case 'doubleClick': {
      const el = getElement(page, step);
      if (!el) return false;
      await el.first().dblclick({ timeout: step.timeout || DEFAULT_CONFIG.timeout });
      Logger.info(`Double-clicked: ${resolveLocatorStr(step)}`);
      return true;
    }
    case 'rightClick': {
      const el = getElement(page, step);
      if (!el) return false;
      await el.first().click({ button: 'right', timeout: step.timeout || DEFAULT_CONFIG.timeout });
      Logger.info(`Right-clicked: ${resolveLocatorStr(step)}`);
      return true;
    }
    case 'hover': {
      const el = getElement(page, step);
      if (!el) return false;
      await el.first().hover({ timeout: step.timeout || DEFAULT_CONFIG.timeout });
      Logger.info(`Hovered: ${resolveLocatorStr(step)}`);
      return true;
    }
    case 'dragDrop': {
      const source = getElement(page, step);
      if (!source || !step.dragTo) { Logger.warn('dragDrop: missing source or dragTo'); return false; }
      const target = resolvePlaywrightLocator(page, step.dragTo);
      if (!target) return false;
      await source.first().dragTo(target.first());
      Logger.info(`Dragged ${resolveLocatorStr(step)} → ${step.dragTo}`);
      return true;
    }
    case 'tap': {
      const el = getElement(page, step);
      if (!el) return false;
      await el.first().tap({ position: step.tapPosition, timeout: step.timeout || DEFAULT_CONFIG.timeout });
      Logger.info(`Tapped: ${resolveLocatorStr(step)}`);
      return true;
    }
    case 'mouseMove': {
      await page.mouse.move(step.mouseX ?? 0, step.mouseY ?? 0);
      Logger.info(`Mouse moved to: (${step.mouseX ?? 0}, ${step.mouseY ?? 0})`);
      return true;
    }
    case 'dragDropCoords': {
      if (step.sourceX === undefined || step.sourceY === undefined || step.targetX === undefined || step.targetY === undefined) {
        Logger.warn('dragDropCoords: sourceX, sourceY, targetX, targetY required');
        return false;
      }
      await page.mouse.move(step.sourceX, step.sourceY);
      await page.mouse.down();
      await page.mouse.move(step.targetX, step.targetY, { steps: 10 });
      await page.mouse.up();
      Logger.info(`Dragged (${step.sourceX},${step.sourceY}) → (${step.targetX},${step.targetY})`);
      return true;
    }
    case 'hoverAndWait': {
      const el = getElement(page, step);
      if (!el) return false;
      await el.first().hover({ timeout: step.timeout || DEFAULT_CONFIG.timeout });
      await page.waitForTimeout(step.hoverWaitMs ?? 500);
      Logger.info(`Hovered and waited ${step.hoverWaitMs ?? 500}ms: ${resolveLocatorStr(step)}`);
      return true;
    }
    case 'pressAndHold': {
      const el = getElement(page, step);
      if (!el) return false;
      const box = await el.first().boundingBox();
      if (!box) { Logger.warn('pressAndHold: element has no bounding box'); return false; }
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(step.holdMs ?? 1000);
      await page.mouse.up();
      Logger.info(`Press and hold ${step.holdMs ?? 1000}ms: ${resolveLocatorStr(step)}`);
      return true;
    }
    case 'scroll': {
      const dir = step.scrollDirection ?? 'down';
      const amount = step.scrollAmount ?? 300;
      const scrollMap: Record<string, [number, number]> = {
        down: [0, amount], up: [0, -amount], right: [amount, 0], left: [-amount, 0],
        top: [0, -99999], bottom: [0, 99999],
      };
      const [x, y] = scrollMap[dir] ?? [0, amount];
      await page.mouse.wheel(x, y);
      Logger.info(`Scrolled ${dir} ${amount}px`);
      return true;
    }
    case 'scrollTo': {
      const el = getElement(page, step);
      if (!el) return false;
      await el.first().scrollIntoViewIfNeeded();
      Logger.info(`Scrolled to: ${resolveLocatorStr(step)}`);
      return true;
    }
    default: return null;
  }
}
