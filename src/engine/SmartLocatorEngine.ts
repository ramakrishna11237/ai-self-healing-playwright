import { Page, Locator } from '@playwright/test';
import { Logger } from '../utils/Logger';

export interface LocatorCandidate {
  locator: string;
  confidence: number; // 0–100
  strategy: string;
  element?: Locator;
}

export interface SmartLocatorOptions {
  scope?: string; // CSS selector to restrict search to a container
  timeout?: number;
  allowPartial?: boolean; // allow partial text match
  allowRegex?: boolean; // allow regex text match
}

/**
 * SmartLocatorEngine — generates confidence-scored locator candidates
 * and selects the best visible match automatically.
 *
 * Confidence scoring:
 *   100 — data-testid (most stable, explicit test hook)
 *    95 — id (stable if not dynamic)
 *    90 — aria-label (semantic, accessibility-driven)
 *    85 — getByRole + name (Playwright semantic)
 *    80 — getByLabel (form label association)
 *    75 — name attribute (form field name)
 *    70 — placeholder (input hint)
 *    65 — getByText exact (visible text)
 *    55 — title attribute
 *    50 — partial text match
 *    40 — regex text match
 *    20 — generic tag fallback
 */
export class SmartLocatorEngine {
  // ── Confidence table ────────────────────────────────────────────────────────
  private static readonly SCORES: Record<string, number> = {
    'data-testid': 100,
    id: 95,
    'aria-label': 90,
    'role+name': 85,
    label: 80,
    name: 75,
    placeholder: 70,
    'text-exact': 65,
    title: 55,
    'text-partial': 50,
    'text-regex': 40,
    'tag-fallback': 20,
  };

  /**
   * Build all candidate locators for a given element description,
   * sorted by confidence score descending.
   */
  static buildCandidates(
    elementName: string,
    action = 'click',
    options: SmartLocatorOptions = {}
  ): LocatorCandidate[] {
    const candidates: LocatorCandidate[] = [];
    const n = elementName.trim();
    if (!n) return candidates;

    const esc = n.replace(/"/g, '\\"');

    // data-testid — highest confidence
    candidates.push({
      locator: `[data-testid="${esc}"]`,
      confidence: 100,
      strategy: 'data-testid',
    });
    candidates.push({
      locator: `[data-testid*="${esc}"]`,
      confidence: 90,
      strategy: 'data-testid-partial',
    });
    candidates.push({ locator: `[data-cy="${esc}"]`, confidence: 100, strategy: 'data-cy' });
    candidates.push({ locator: `[data-qa="${esc}"]`, confidence: 100, strategy: 'data-qa' });

    // ID
    candidates.push({ locator: `#${n.replace(/\s+/g, '-')}`, confidence: 95, strategy: 'id' });
    candidates.push({ locator: `[id="${esc}"]`, confidence: 95, strategy: 'id-attr' });
    candidates.push({ locator: `[id*="${esc}"]`, confidence: 60, strategy: 'id-partial' });

    // ARIA
    candidates.push({ locator: `[aria-label="${esc}"]`, confidence: 90, strategy: 'aria-label' });
    candidates.push({
      locator: `[aria-label*="${esc}"]`,
      confidence: 55,
      strategy: 'aria-label-partial',
    });

    // Playwright semantic getBy*
    candidates.push({
      locator: `getByRole('button', { name: '${n}' })`,
      confidence: 85,
      strategy: 'role+name',
    });
    candidates.push({
      locator: `getByRole('link', { name: '${n}' })`,
      confidence: 85,
      strategy: 'role+name',
    });
    candidates.push({
      locator: `getByRole('textbox', { name: '${n}' })`,
      confidence: 85,
      strategy: 'role+name',
    });
    candidates.push({
      locator: `getByRole('combobox', { name: '${n}' })`,
      confidence: 85,
      strategy: 'role+name',
    });
    candidates.push({
      locator: `getByRole('checkbox', { name: '${n}' })`,
      confidence: 85,
      strategy: 'role+name',
    });
    candidates.push({
      locator: `getByRole('radio', { name: '${n}' })`,
      confidence: 85,
      strategy: 'role+name',
    });
    candidates.push({
      locator: `getByRole('option', { name: '${n}' })`,
      confidence: 85,
      strategy: 'role+name',
    });
    candidates.push({
      locator: `getByRole('tab', { name: '${n}' })`,
      confidence: 85,
      strategy: 'role+name',
    });
    candidates.push({
      locator: `getByRole('heading', { name: '${n}' })`,
      confidence: 85,
      strategy: 'role+name',
    });

    // Label
    candidates.push({ locator: `getByLabel('${n}')`, confidence: 80, strategy: 'label' });
    candidates.push({
      locator: `getByLabel('${n}', { exact: false })`,
      confidence: 55,
      strategy: 'label-partial',
    });

    // Name attribute — exact first, lowercase only if name differs from original
    // Lazy lowercase: only add if it differs — avoids doubling candidates unnecessarily
    candidates.push({ locator: `[name="${esc}"]`, confidence: 75, strategy: 'name' });
    if (n !== n.toLowerCase()) {
      candidates.push({
        locator: `[name="${n.toLowerCase()}"]`,
        confidence: 74,
        strategy: 'name-lower',
      });
    }
    candidates.push({
      locator: `[name*="${n.toLowerCase()}"]`,
      confidence: 45,
      strategy: 'name-partial',
    });

    // Legacy submit buttons — input[type=submit] with value (JSP/old HTML)
    candidates.push({
      locator: `input[type="submit"][value="${esc}"]`,
      confidence: 72,
      strategy: 'submit-value',
    });
    candidates.push({ locator: `input[value="${esc}"]`, confidence: 68, strategy: 'input-value' });
    candidates.push({ locator: `[value="${esc}"]`, confidence: 65, strategy: 'value-attr' });

    // Placeholder
    candidates.push({
      locator: `getByPlaceholder('${n}')`,
      confidence: 70,
      strategy: 'placeholder',
    });
    candidates.push({
      locator: `[placeholder="${esc}"]`,
      confidence: 70,
      strategy: 'placeholder-attr',
    });
    candidates.push({
      locator: `[placeholder*="${esc}"]`,
      confidence: 45,
      strategy: 'placeholder-partial',
    });

    // Exact text
    candidates.push({
      locator: `getByText('${n}', { exact: true })`,
      confidence: 65,
      strategy: 'text-exact',
    });
    candidates.push({ locator: `text=${n}`, confidence: 60, strategy: 'text-exact' });

    // Title
    candidates.push({ locator: `[title="${esc}"]`, confidence: 55, strategy: 'title' });
    candidates.push({ locator: `getByTitle('${n}')`, confidence: 55, strategy: 'title' });

    // Partial text (opt-in)
    if (options.allowPartial) {
      candidates.push({
        locator: `getByText('${n}', { exact: false })`,
        confidence: 50,
        strategy: 'text-partial',
      });
      candidates.push({ locator: `text*=${n}`, confidence: 45, strategy: 'text-partial' });
      candidates.push({
        locator: `button:has-text("${esc}")`,
        confidence: 45,
        strategy: 'text-partial',
      });
      candidates.push({
        locator: `a:has-text("${esc}")`,
        confidence: 45,
        strategy: 'text-partial',
      });
    }

    // Regex text (opt-in)
    if (options.allowRegex) {
      const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      candidates.push({
        locator: `getByText(/${escaped}/i)`,
        confidence: 40,
        strategy: 'text-regex',
      });
    }

    // Action-specific tag fallbacks (lowest confidence)
    if (['click', 'submit'].includes(action)) {
      candidates.push({
        locator: `button:has-text("${esc}")`,
        confidence: 25,
        strategy: 'tag-fallback',
      });
      candidates.push({
        locator: `input[type="submit"]`,
        confidence: 20,
        strategy: 'tag-fallback',
      });
    }

    // Deduplicate and sort by confidence descending
    const seen = new Set<string>();
    return candidates
      .filter((c) => {
        if (seen.has(c.locator)) return false;
        seen.add(c.locator);
        return true;
      })
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Find the best visible locator for an element on the page.
   * Tries candidates in confidence order, returns the first visible match.
   */
  static async findBest(
    page: Page,
    elementName: string,
    action = 'click',
    options: SmartLocatorOptions = {}
  ): Promise<LocatorCandidate | null> {
    const candidates = this.buildCandidates(elementName, action, options);
    const timeout = options.timeout ?? 1000;
    const container = options.scope ? page.locator(options.scope) : null;

    Logger.debug(`SmartLocator: trying ${candidates.length} candidates for "${elementName}"`);

    // Process in confidence-ordered batches using Promise.any() — same pattern
    // as Runner Layer 2b. Avoids sequential await on 30+ candidates.
    const BATCH_SIZE = 5;
    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      const batch = candidates.slice(i, i + BATCH_SIZE);

      const winner = await Promise.any(
        batch.map(async (candidate) => {
          const el = this.resolveLocator(page, candidate.locator, container);
          if (!el) throw new Error('no locator');
          const count = await el.count();
          if (count === 0) throw new Error('no match');
          const best = count > 1 ? await this.selectBestMatch(el, count, options) : el.first();
          await best.waitFor({ state: 'visible', timeout });
          return { candidate, element: best };
        })
      ).catch(() => null);

      if (winner) {
        Logger.debug(
          `SmartLocator: found "${elementName}" via ${winner.candidate.strategy} (confidence: ${winner.candidate.confidence})`
        );
        return { ...winner.candidate, element: winner.element };
      }
    }

    Logger.warn(`SmartLocator: no visible element found for "${elementName}"`);
    return null;
  }

  /**
   * Context-aware selection when multiple elements match.
   * Prefers elements inside: modal > form > main > body
   * Avoids elements inside: nav, header, footer (unless that's the scope)
   */
  private static async selectBestMatch(
    locator: Locator,
    count: number,
    options: SmartLocatorOptions
  ): Promise<Locator> {
    if (options.scope) return locator.first();
    // Find the element that lives INSIDE a priority container
    const PRIORITY = ["[role='dialog']", 'form', 'main', "[role='main']"];
    for (const container of PRIORITY) {
      try {
        // Correct scoping: find locator instances that are children of container
        const scoped = locator.page().locator(container).locator(locator);
        if ((await scoped.count()) > 0) return scoped.first();
      } catch {
        continue;
      }
    }
    return locator.first();
  }

  /**
   * Resolve a locator string (getBy* or CSS) against page or container.
   */
  private static resolveLocator(
    page: Page,
    locatorStr: string,
    container: Locator | null
  ): Locator | null {
    try {
      const root = container ?? page;

      if (locatorStr.startsWith('getByRole(')) {
        const m = locatorStr.match(/getByRole\(\s*'([^']+)'\s*(?:,\s*(\{[^}]*\}))?\s*\)/);
        if (!m) return null;
        const role = m[1] as Parameters<Page['getByRole']>[0];
        const opts = m[2] ? this.parseOpts(m[2]) : {};
        return root.getByRole(role, opts);
      }
      if (locatorStr.startsWith('getByLabel(')) {
        const m = locatorStr.match(/getByLabel\(\s*'([^']+)'\s*(?:,\s*(\{[^}]*\}))?\s*\)/);
        if (!m) return null;
        const opts = m[2] ? this.parseOpts(m[2]) : {};
        return root.getByLabel(m[1], opts);
      }
      if (locatorStr.startsWith('getByText(')) {
        const m = locatorStr.match(/getByText\(\s*'([^']+)'\s*(?:,\s*(\{[^}]*\}))?\s*\)/);
        if (!m) return null;
        const opts = m[2] ? this.parseOpts(m[2]) : {};
        return root.getByText(m[1], opts);
      }
      if (locatorStr.startsWith('getByPlaceholder(')) {
        const m = locatorStr.match(/getByPlaceholder\(\s*'([^']+)'\s*\)/);
        if (!m) return null;
        return root.getByPlaceholder(m[1]);
      }
      if (locatorStr.startsWith('getByTitle(')) {
        const m = locatorStr.match(/getByTitle\(\s*'([^']+)'\s*\)/);
        if (!m) return null;
        return root.getByTitle(m[1]);
      }
      if (locatorStr.startsWith('getByText(/')) {
        const m = locatorStr.match(/getByText\(\/(.*?)\/([gimsuy]*)\)/);
        if (!m) return null;
        return root.getByText(new RegExp(m[1], m[2]));
      }

      return root.locator(locatorStr);
    } catch {
      return null;
    }
  }

  private static parseOpts(optStr: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const name = optStr.match(/name\s*:\s*'([^']+)'/);
    const exact = optStr.match(/exact\s*:\s*(true|false)/);
    if (name) result['name'] = name[1];
    if (exact) result['exact'] = exact[1] === 'true';
    return result;
  }
}
