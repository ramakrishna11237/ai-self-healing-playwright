import { Page } from '@playwright/test';
import { sanitizeDOM } from './DOMSanitizer';
import { filterDOM } from './SmartDOMFilter';
import { Logger } from '../utils/Logger';

/**
 * captureDOM — captures only the DOM region relevant to the failing step.
 *
 * 3-level targeted capture (fastest to broadest):
 *
 * 1. Nearest container snapshot — aria snapshot of the closest ancestor
 *    that contains the failing element (form, dialog, section, main, body).
 *    Typically 5-20 elements instead of 500+.
 *
 * 2. Visible viewport snapshot — aria snapshot scoped to elements currently
 *    visible in the viewport only. Cuts noise from off-screen content.
 *
 * 3. Full page aria snapshot — last resort, same as before but only reached
 *    if levels 1 and 2 both fail.
 *
 * @param page        Playwright page
 * @param name        Label for debug logging
 * @param hintLocator The locator that failed — used to find nearest container
 */
export async function captureDOM(page: Page, name: string, hintLocator?: string): Promise<string> {
  if (page.isClosed()) {
    Logger.warn(`captureDOM skipped for "${name}" — page not accessible`);
    return '';
  }

  // Level 1: Nearest container around the failing locator
  if (hintLocator) {
    try {
      const snapshot = await captureNearestContainer(page, hintLocator);
      if (snapshot) {
        Logger.debug(`DOM captured via nearest container: ${name} (${snapshot.length} bytes)`);
        return snapshot;
      }
    } catch {
      Logger.debug(`captureDOM: nearest container failed for "${hintLocator}"`);
    }
  }

  // Level 2: Visible viewport only — scoped aria snapshot
  try {
    const snapshot = await captureVisibleRegion(page);
    if (snapshot) {
      Logger.debug(`DOM captured via visible region: ${name} (${snapshot.length} bytes)`);
      return snapshot;
    }
  } catch {
    Logger.debug(`captureDOM: visible region failed for "${name}"`);
  }

  // Level 3: Full page aria snapshot — last resort
  try {
    const snapshot = await page.ariaSnapshot();
    if (snapshot) {
      Logger.debug(`DOM captured via full aria snapshot: ${name} (${snapshot.length} bytes)`);
      return snapshot;
    }
  } catch {
    Logger.debug(`captureDOM: aria snapshot failed for "${name}", falling back to filtered HTML`);
  }

  // Level 4: Filtered HTML — absolute last resort
  try {
    const html = await page.content();
    if (!html) return '';
    const sanitized = sanitizeDOM(html);
    const filtered = filterDOM(sanitized);
    const result = filtered.length > 0 ? filtered : sanitized.slice(0, 50000);
    Logger.debug(`DOM captured via filtered HTML: ${name} (${result.length} bytes)`);
    return result;
  } catch (e) {
    Logger.warn(`captureDOM failed for "${name}"`, e);
    return '';
  }
}

/**
 * Walk up the DOM from the failing locator to find the nearest meaningful
 * container (dialog > form > section > main > body) and snapshot only that.
 * This gives self-heal the relevant sibling elements without full-page noise.
 */
async function captureNearestContainer(page: Page, hintLocator: string): Promise<string | null> {
  // Container selectors ordered from most specific to least specific
  const CONTAINER_SELECTORS = [
    "[role='dialog']",
    "[role='alertdialog']",
    'form',
    "[role='form']",
    'section',
    'main',
    "[role='main']",
    '#content',
    '.content',
    'body',
  ];

  // Try to find which container the failing element lives in
  for (const container of CONTAINER_SELECTORS) {
    try {
      const containerEl = page.locator(container).first();
      const count = await containerEl.count();
      if (count === 0) continue;

      // Check if the hint locator exists within this container
      const innerCount = await containerEl
        .locator(hintLocator)
        .count()
        .catch(() => 0);

      // For broad containers (body, main) skip the inner check — just use them
      const isBroadContainer =
        container === 'body' || container === 'main' || container === "[role='main']";

      if (innerCount > 0 || isBroadContainer) {
        const snapshot = await containerEl.ariaSnapshot();
        if (snapshot && snapshot.length > 0) {
          return snapshot;
        }
      }
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Capture only elements visible in the current viewport.
 * Uses page.evaluate to get viewport bounds, then snapshots only
 * elements within those bounds — ignores off-screen modals, hidden menus etc.
 */
async function captureVisibleRegion(page: Page): Promise<string | null> {
  try {
    // Find the most specific visible container in the viewport
    const visibleContainer = await page.evaluate(() => {
      const vp = { w: window.innerWidth, h: window.innerHeight };

      // Priority: dialog > form > main > body
      const candidates = [
        ...Array.from(document.querySelectorAll("[role='dialog'], [role='alertdialog']")),
        ...Array.from(document.querySelectorAll('form')),
        document.querySelector('main') ?? document.body,
      ];

      for (const el of candidates) {
        if (!el) continue;
        const box = (el as HTMLElement).getBoundingClientRect();
        // Element must be at least partially visible in viewport
        if (box.width > 0 && box.height > 0 && box.top < vp.h && box.left < vp.w) {
          // Return a unique selector to re-find this element
          if (el.id) return `#${el.id}`;
          if (el.getAttribute('role')) return `[role="${el.getAttribute('role')}"]`;
          return el.tagName.toLowerCase();
        }
      }
      return null;
    });

    if (!visibleContainer) return null;

    const el = page.locator(visibleContainer).first();
    const count = await el.count();
    if (count === 0) return null;

    return await el.ariaSnapshot();
  } catch {
    return null;
  }
}
