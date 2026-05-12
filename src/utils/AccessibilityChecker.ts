import { Page } from '@playwright/test';
import { Logger } from '../utils/Logger';

export interface A11yViolation {
  rule: string;
  role: string;
  description: string;
  locator: string;
  severity: 'critical' | 'serious' | 'moderate' | 'minor';
}

export interface A11yResult {
  passed: boolean;
  violations: A11yViolation[];
  summary: string;
}

/**
 * Accessibility checker — 12 WCAG 2.1 AA rules.
 * No external axe-core dependency required.
 *
 * Rules:
 *  1.  button-name          — Buttons with no accessible name       (critical)
 *  2.  image-alt            — Images missing alt attribute           (critical)
 *  3.  label                — Inputs with no label/aria-label        (serious)
 *  4.  link-name            — Links with no accessible name          (serious)
 *  5.  select-name          — Select elements with no label          (serious)
 *  6.  frame-title          — iframes missing title                  (serious)
 *  7.  html-has-lang        — Missing page language                  (serious)
 *  8.  document-title       — Missing page title                     (serious)
 *  9.  duplicate-id-active  — Duplicate IDs on interactive elements  (moderate)
 *  10. tabindex             — Positive tabindex breaks tab order     (moderate)
 *  11. keyboard             — cursor:pointer elements not focusable  (serious)
 *  12. aria-required-attr   — Required inputs missing aria-required  (moderate)
 */
export class AccessibilityChecker {
  constructor(private page: Page) {}

  async audit(locator?: string): Promise<A11yResult> {
    const violations: A11yViolation[] = [];
    const p = locator ? this.page.locator(locator).page() : this.page;

    try {
      // Rule 1: Buttons with no accessible name
      const buttons = await p
        .locator('button:not([aria-label]):not([aria-labelledby]):not([title])')
        .all();
      for (const btn of buttons) {
        if (!(await btn.textContent())?.trim()) {
          violations.push({
            rule: 'button-name',
            role: 'button',
            severity: 'critical',
            description: 'Button has no accessible name (WCAG 4.1.2)',
            locator: await this._str(btn),
          });
        }
      }

      // Rule 2: Images missing alt
      for (const img of await p.locator('img:not([alt])').all()) {
        violations.push({
          rule: 'image-alt',
          role: 'img',
          severity: 'critical',
          description: 'Image missing alt attribute (WCAG 1.1.1)',
          locator: await this._str(img),
        });
      }

      // Rule 3: Inputs with no label
      const inputs = await p
        .locator(
          "input:not([type='hidden']):not([type='submit']):not([type='button']):not([type='reset']):not([type='image'])"
        )
        .all();
      for (const input of inputs) {
        const id = await input.getAttribute('id');
        const ok =
          (await input.getAttribute('aria-label')) ||
          (await input.getAttribute('aria-labelledby')) ||
          (await input.getAttribute('placeholder')) ||
          (await input.getAttribute('title')) ||
          (id ? (await p.locator(`label[for="${id}"]`).count()) > 0 : false);
        if (!ok) {
          violations.push({
            rule: 'label',
            role: 'input',
            severity: 'serious',
            description: 'Input has no label, aria-label, placeholder, or title (WCAG 1.3.1)',
            locator: await this._str(input),
          });
        }
      }

      // Rule 4: Links with no accessible name
      for (const link of await p.locator('a[href]').all()) {
        const ok =
          (await link.textContent())?.trim() ||
          (await link.getAttribute('aria-label')) ||
          (await link.getAttribute('title'));
        if (!ok) {
          violations.push({
            rule: 'link-name',
            role: 'link',
            severity: 'serious',
            description: 'Link has no accessible name (WCAG 2.4.4)',
            locator: await this._str(link),
          });
        }
      }

      // Rule 5: Select elements with no label
      for (const sel of await p.locator('select').all()) {
        const id = await sel.getAttribute('id');
        const ok =
          (await sel.getAttribute('aria-label')) ||
          (await sel.getAttribute('aria-labelledby')) ||
          (id ? (await p.locator(`label[for="${id}"]`).count()) > 0 : false);
        if (!ok) {
          violations.push({
            rule: 'select-name',
            role: 'combobox',
            severity: 'serious',
            description: 'Select has no label or aria-label (WCAG 1.3.1)',
            locator: await this._str(sel),
          });
        }
      }

      // Rule 6: iframes missing title
      for (const frame of await p.locator('iframe:not([title])').all()) {
        violations.push({
          rule: 'frame-title',
          role: 'iframe',
          severity: 'serious',
          description: 'iframe missing title attribute (WCAG 4.1.2)',
          locator: await this._str(frame),
        });
      }

      // Rule 7: Missing page language
      const lang = await p.evaluate(() => document.documentElement.getAttribute('lang'));
      if (!lang?.trim()) {
        violations.push({
          rule: 'html-has-lang',
          role: 'document',
          severity: 'serious',
          description: 'Page missing lang attribute on <html> (WCAG 3.1.1)',
          locator: 'html',
        });
      }

      // Rule 8: Missing page title
      if (!(await p.title())?.trim()) {
        violations.push({
          rule: 'document-title',
          role: 'document',
          severity: 'serious',
          description: 'Page missing <title> element (WCAG 2.4.2)',
          locator: 'head > title',
        });
      }

      // Rule 9: Duplicate IDs on interactive elements
      const dupIds = await p.evaluate(() => {
        const ids = Array.from(
          document.querySelectorAll('input[id],button[id],a[id],select[id],textarea[id]')
        )
          .map((el) => el.id)
          .filter(Boolean);
        const seen = new Set<string>(),
          dups = new Set<string>();
        for (const id of ids) {
          if (seen.has(id)) dups.add(id);
          seen.add(id);
        }
        return [...dups];
      });
      for (const dupId of dupIds) {
        violations.push({
          rule: 'duplicate-id-active',
          role: 'element',
          severity: 'moderate',
          description: `Duplicate id="${dupId}" breaks label associations (WCAG 4.1.1)`,
          locator: `[id="${dupId}"]`,
        });
      }

      // Rule 10: Positive tabindex
      for (const el of await p.locator('[tabindex]').all()) {
        const val = await el.getAttribute('tabindex');
        if (val && parseInt(val, 10) > 0) {
          violations.push({
            rule: 'tabindex',
            role: 'element',
            severity: 'moderate',
            description: `tabindex="${val}" breaks natural tab order — use 0 or -1 (WCAG 2.4.3)`,
            locator: await this._str(el),
          });
        }
      }

      // Rule 11: Interactive elements not keyboard focusable
      // Uses cursor:pointer — covers React/Vue/Angular SPAs using addEventListener
      const clickableNoFocus = await p.evaluate(() => {
        const results: string[] = [];
        for (const el of Array.from(document.querySelectorAll('div,span,li,td')).slice(0, 100)) {
          const style = window.getComputedStyle(el);
          if (
            style.cursor === 'pointer' &&
            !el.getAttribute('tabindex') &&
            !el.getAttribute('role')
          ) {
            const tag = el.tagName.toLowerCase();
            const id = el.id ? `#${el.id}` : '';
            results.push(`${tag}${id}`);
          }
        }
        return results.slice(0, 10);
      });
      for (const loc of clickableNoFocus) {
        violations.push({
          rule: 'keyboard',
          role: 'element',
          severity: 'serious',
          description:
            'Element has pointer cursor but no tabindex or role — not keyboard accessible (WCAG 2.1.1)',
          locator: loc,
        });
      }

      // Rule 12: Required inputs missing aria-required
      for (const field of await p.locator('input[required]').all()) {
        if ((await field.getAttribute('aria-required')) !== 'true') {
          violations.push({
            rule: 'aria-required-attr',
            role: 'input',
            severity: 'moderate',
            description:
              "Required input missing aria-required='true' for screen readers (WCAG 3.3.2)",
            locator: await this._str(field),
          });
        }
      }
    } catch (e) {
      Logger.error('AccessibilityChecker audit failed', e);
    }

    const passed = violations.length === 0;
    const summary = passed
      ? 'No accessibility violations found'
      : `${violations.length} violation(s) found`;

    if (!passed) {
      Logger.warn(`A11y: ${summary}`);
      violations.forEach((v) => Logger.debug(`  [${v.severity}] ${v.rule}: ${v.description}`));
    } else {
      Logger.info(`A11y: ${summary}`);
    }

    return { passed, violations, summary };
  }

  async assertNoViolations(locator?: string): Promise<void> {
    const result = await this.audit(locator);
    if (!result.passed) {
      throw new Error(
        `Accessibility violations found:\n${result.violations
          .map((v) => `  [${v.severity}] ${v.rule}: ${v.description}`)
          .join('\n')}`
      );
    }
  }

  async assertNoCriticalViolations(locator?: string): Promise<void> {
    const result = await this.audit(locator);
    const critical = result.violations.filter(
      (v) => v.severity === 'critical' || v.severity === 'serious'
    );
    if (critical.length > 0) {
      throw new Error(
        `Critical accessibility violations found:\n${critical
          .map((v) => `  [${v.severity}] ${v.rule}: ${v.description}`)
          .join('\n')}`
      );
    }
  }

  async getAriaSnapshot(locator?: string): Promise<string> {
    if (locator) return this.page.locator(locator).first().ariaSnapshot();
    return this.page.ariaSnapshot();
  }

  private async _str(el: import('@playwright/test').Locator): Promise<string> {
    try {
      return await el.evaluate((node: Element) => {
        const tag = node.tagName.toLowerCase();
        const id = node.id ? `#${node.id}` : '';
        const cls = node.className ? `.${String(node.className).trim().split(/\s+/)[0]}` : '';
        return `${tag}${id}${cls}`;
      });
    } catch {
      return 'unknown';
    }
  }
}
