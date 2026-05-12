import { Page, Locator, FrameLocator } from '@playwright/test';
import { Logger } from '../utils/Logger';

/**
 * FrameHandler — automatic iframe and shadow DOM detection.
 *
 * Searches all iframes and shadow roots on the page for a target element
 * without requiring the test author to know which frame it's in.
 */
export class FrameHandler {
  /**
   * Search all iframes on the page for an element.
   * Returns the Locator if found, null otherwise.
   */
  static async findInFrames(
    page: Page,
    elementName: string,
    action = 'click',
    timeout = 1000
  ): Promise<Locator | null> {
    try {
      // Get all iframe elements on the page
      const iframeCount = await page.locator('iframe').count();
      if (iframeCount === 0) return null;

      Logger.debug(`FrameHandler: searching ${iframeCount} iframe(s) for "${elementName}"`);

      for (let i = 0; i < iframeCount; i++) {
        try {
          const frameLocator = page.frameLocator(`iframe >> nth=${i}`);
          const el = await this.findInFrame(frameLocator, elementName, action, timeout);
          if (el) {
            Logger.debug(`FrameHandler: found "${elementName}" in iframe ${i + 1}`);
            return el;
          }
        } catch {
          continue;
        }
      }

      // Also try named/id iframes
      const namedFrames = await page.locator('iframe[name], iframe[id]').all();
      for (const iframe of namedFrames) {
        try {
          const name =
            (await iframe.getAttribute('name')) ?? (await iframe.getAttribute('id')) ?? '';
          if (!name) continue;
          const frameLocator = page.frameLocator(`iframe[name="${name}"], iframe[id="${name}"]`);
          const el = await this.findInFrame(frameLocator, elementName, action, timeout);
          if (el) {
            Logger.debug(`FrameHandler: found "${elementName}" in iframe "${name}"`);
            return el;
          }
        } catch {
          continue;
        }
      }
    } catch (e) {
      Logger.debug(`FrameHandler: iframe search failed: ${String(e)}`);
    }

    return null;
  }

  /**
   * Search inside a specific frame for an element.
   */
  private static async findInFrame(
    frame: FrameLocator,
    elementName: string,
    action: string,
    timeout: number
  ): Promise<Locator | null> {
    const strategies = this.buildFrameStrategies(elementName, action);

    for (const strategy of strategies) {
      try {
        let el: Locator;

        if (strategy.startsWith('role:')) {
          const [, role, name] = strategy.split(':');
          el = frame.getByRole(role as Parameters<FrameLocator['getByRole']>[0], { name });
        } else if (strategy.startsWith('label:')) {
          el = frame.getByLabel(strategy.slice(6));
        } else if (strategy.startsWith('text:')) {
          el = frame.getByText(strategy.slice(5), { exact: true });
        } else if (strategy.startsWith('placeholder:')) {
          el = frame.getByPlaceholder(strategy.slice(12));
        } else {
          el = frame.locator(strategy);
        }

        const count = await el.count();
        if (count > 0) {
          await el.first().waitFor({ state: 'visible', timeout });
          return el.first();
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  private static buildFrameStrategies(name: string, action: string): string[] {
    const esc = name.replace(/"/g, '\\"');
    return [
      `[data-testid="${esc}"]`,
      `[aria-label="${esc}"]`,
      `role:button:${name}`,
      `role:link:${name}`,
      `role:textbox:${name}`,
      `label:${name}`,
      `text:${name}`,
      `placeholder:${name}`,
      `[name="${esc}"]`,
      `[id="${esc}"]`,
      ...(['click', 'submit'].includes(action)
        ? [`button:has-text("${esc}")`, `a:has-text("${esc}")`]
        : []),
    ];
  }

  /**
   * Search shadow DOM for an element using pierce/ selector.
   * pierce/ traverses all shadow roots automatically.
   */
  static async findInShadow(
    page: Page,
    elementName: string,
    timeout = 1000
  ): Promise<Locator | null> {
    const esc = elementName.replace(/"/g, '\\"');
    const pierceStrategies = [
      `pierce/[data-testid="${esc}"]`,
      `pierce/[aria-label="${esc}"]`,
      `pierce/[name="${esc}"]`,
      `pierce/[placeholder="${esc}"]`,
      `pierce/[id="${esc}"]`,
      `pierce/button`,
      `pierce/input`,
    ];

    for (const strategy of pierceStrategies) {
      try {
        const el = page.locator(strategy);
        const count = await el.count();
        if (count > 0) {
          await el.first().waitFor({ state: 'visible', timeout });
          Logger.debug(`FrameHandler: found "${elementName}" via shadow DOM: ${strategy}`);
          return el.first();
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  /**
   * Execute an action inside a specific iframe by locator.
   */
  static async clickInFrame(
    page: Page,
    iframeLocator: string,
    elementName: string,
    timeout = 5000
  ): Promise<boolean> {
    try {
      const frame = page.frameLocator(iframeLocator);
      const el = await this.findInFrame(frame, elementName, 'click', timeout);
      if (!el) return false;
      await el.click({ timeout });
      Logger.info(`FrameHandler: clicked "${elementName}" in frame "${iframeLocator}"`);
      return true;
    } catch (e) {
      Logger.warn(`FrameHandler: click failed in frame "${iframeLocator}": ${String(e)}`);
      return false;
    }
  }

  /**
   * Fill a field inside a specific iframe.
   */
  static async fillInFrame(
    page: Page,
    iframeLocator: string,
    elementName: string,
    value: string,
    timeout = 5000
  ): Promise<boolean> {
    try {
      const frame = page.frameLocator(iframeLocator);
      const el = await this.findInFrame(frame, elementName, 'fill', timeout);
      if (!el) return false;

      // Handle contenteditable (rich text editors like TinyMCE)
      // CWE-95: use Playwright native isEditable() instead of evaluate(isContentEditable)
      const isEditable = await el.isEditable().catch(() => false);
      if (isEditable) {
        await el.click();
        await el.pressSequentially(value);
      } else {
        await el.fill(value, { timeout });
      }

      Logger.info(`FrameHandler: filled "${elementName}" in frame "${iframeLocator}"`);
      return true;
    } catch (e) {
      Logger.warn(`FrameHandler: fill failed in frame "${iframeLocator}": ${String(e)}`);
      return false;
    }
  }

  /**
   * Get all iframe src URLs on the page — useful for debugging.
   */
  static listFrames(page: Page): string[] {
    const frames = page.frames();
    return frames.map((f) => f.url()).filter((url) => url && url !== 'about:blank');
  }
}
