import { Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_CONFIG } from '../config';

/**
 * PageHelperExtras — heavy helpers only imported when needed.
 * Import PageHelper for everyday use. Import this only for:
 *   - Table operations
 *   - iframe interactions
 *   - Alert/dialog handling
 *   - Drag & drop
 *   - Element discovery
 *
 * @example
 *   import { PageHelperExtras } from "../utils/PageHelperExtras";
 *   const extras = new PageHelperExtras(page);
 *   await extras.clickTableRowLink("table", "John Smith");
 */
export class PageHelperExtras {
  constructor(private page: Page) {}

  // ── Drag & Drop ────────────────────────────────────────────────────────────

  async dragDrop(sourceLocator: string, targetLocator: string): Promise<boolean> {
    try {
      await this.page
        .locator(sourceLocator)
        .first()
        .dragTo(this.page.locator(targetLocator).first());
      return true;
    } catch {
      return false;
    }
  }

  // ── Hover ──────────────────────────────────────────────────────────────────

  async hoverAndClick(hoverLocator: string, clickLocator: string): Promise<boolean> {
    try {
      await this.page.locator(hoverLocator).first().hover();
      await this.page.locator(clickLocator).first().click();
      return true;
    } catch {
      return false;
    }
  }

  // ── Advanced input ─────────────────────────────────────────────────────────

  async typeSlowly(locator: string, text: string, delayMs?: number): Promise<boolean> {
    try {
      await this.page
        .locator(locator)
        .first()
        .pressSequentially(text, {
          delay: delayMs ?? DEFAULT_CONFIG.slowTypeDelay,
        });
      return true;
    } catch {
      return false;
    }
  }

  async multiSelect(locator: string, values: string[]): Promise<boolean> {
    try {
      await this.page.locator(locator).first().selectOption(values);
      return true;
    } catch {
      return false;
    }
  }

  async uploadFile(locator: string, filePath: string): Promise<boolean> {
    try {
      await this.page.locator(locator).setInputFiles(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async downloadFile(locator: string, _savePath?: string): Promise<string | false> {
    try {
      const [download] = await Promise.all([
        this.page.waitForEvent('download'),
        this.page.locator(locator).first().click(),
      ]);
      const base = path.resolve(DEFAULT_CONFIG.downloadDir);
      fs.mkdirSync(base, { recursive: true });
      // CWE-22: timestamp-only filename, explicit guard
      const dest = path.resolve(base, `${Date.now()}.download`);
      if (!dest.startsWith(base + path.sep)) return false;
      await download.saveAs(dest);
      return dest;
    } catch {
      return false;
    }
  }

  // ── iframe ─────────────────────────────────────────────────────────────────

  async clickInIframe(iframeLocator: string, elementLocator: string): Promise<boolean> {
    try {
      await this.page.frameLocator(iframeLocator).locator(elementLocator).first().click();
      return true;
    } catch {
      return false;
    }
  }

  async fillInIframe(
    iframeLocator: string,
    elementLocator: string,
    value: string
  ): Promise<boolean> {
    try {
      const el = this.page.frameLocator(iframeLocator).locator(elementLocator).first();
      const isContentEditable = await el
        .evaluate((node) => (node as HTMLElement).isContentEditable)
        .catch(() => false);
      if (isContentEditable) {
        await el.click();
        await el.pressSequentially(value);
      } else {
        await el.fill(value);
      }
      return true;
    } catch {
      return false;
    }
  }

  async getTextInIframe(iframeLocator: string, elementLocator: string): Promise<string> {
    try {
      return (
        (await this.page
          .frameLocator(iframeLocator)
          .locator(elementLocator)
          .first()
          .textContent()) ?? ''
      );
    } catch {
      return '';
    }
  }

  // ── Alert / Dialog ─────────────────────────────────────────────────────────

  async acceptAlert(triggerLocator?: string): Promise<boolean> {
    try {
      this.page.once('dialog', (d) => d.accept());
      if (triggerLocator) await this.page.locator(triggerLocator).first().click();
      return true;
    } catch {
      return false;
    }
  }

  async dismissAlert(triggerLocator?: string): Promise<boolean> {
    try {
      this.page.once('dialog', (d) => d.dismiss());
      if (triggerLocator) await this.page.locator(triggerLocator).first().click();
      return true;
    } catch {
      return false;
    }
  }

  async getAlertText(triggerLocator?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('getAlertText: dialog did not appear within 5000ms')),
        5000
      );
      this.page.once('dialog', async (d) => {
        clearTimeout(timer);
        const msg = d.message();
        await d.dismiss().catch(() => {});
        resolve(msg);
      });
      if (triggerLocator) {
        this.page
          .locator(triggerLocator)
          .first()
          .click()
          .catch((e) => {
            clearTimeout(timer);
            reject(e);
          });
      }
    });
  }

  // ── Table ──────────────────────────────────────────────────────────────────

  async getTableRowCount(tableLocator: string): Promise<number> {
    try {
      return await this.page.locator(`${tableLocator} tr`).count();
    } catch {
      return 0;
    }
  }

  async getTableCellText(tableLocator: string, row: number, col: number): Promise<string> {
    try {
      return (
        (await this.page
          .locator(`${tableLocator} tr`)
          .nth(row)
          .locator('td, th')
          .nth(col)
          .textContent()) ?? ''
      );
    } catch {
      return '';
    }
  }

  async clickTableRowLink(
    tableLocator: string,
    rowText: string,
    linkText?: string
  ): Promise<boolean> {
    try {
      const row = this.page.locator(`${tableLocator} tr`).filter({ hasText: rowText });
      const link = linkText ? row.getByRole('link', { name: linkText }) : row.getByRole('link');
      await link.first().click();
      return true;
    } catch {
      return false;
    }
  }

  // ── Screenshot of element ──────────────────────────────────────────────────

  async screenshotElement(locator: string, _name?: string): Promise<string | false> {
    try {
      const base = path.resolve(DEFAULT_CONFIG.screenshotDir);
      fs.mkdirSync(base, { recursive: true });
      // CWE-22: timestamp-only filename, explicit guard
      const filePath = path.resolve(base, `${Date.now()}.png`);
      if (!filePath.startsWith(base + path.sep)) return false;
      await this.page.locator(locator).first().screenshot({ path: filePath });
      return filePath;
    } catch {
      return false;
    }
  }

  // ── Discovery ──────────────────────────────────────────────────────────────

  async discoverElements(role: string): Promise<string[]> {
    try {
      const elements = await this.page.locator(`[role="${role}"]`).all();
      const names: string[] = [];
      for (const el of elements) {
        const name = (await el.getAttribute('aria-label')) ?? (await el.textContent());
        if (name?.trim()) names.push(name.trim());
      }
      return names;
    } catch {
      return [];
    }
  }

  async getAllText(locator: string): Promise<string[]> {
    try {
      return await this.page.locator(locator).allTextContents();
    } catch {
      return [];
    }
  }
}
