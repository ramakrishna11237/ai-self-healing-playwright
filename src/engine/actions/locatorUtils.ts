import { Page, Locator } from '@playwright/test';
import { Step } from '../../types';
import { Logger } from '../../utils/Logger';

export function resolveLocatorStr(step: Step): string {
  return step.codegenLocator || step.locator || '';
}

export function resolveLocatorToPlaywright(page: Page, locatorStr: string): Locator | null {
  return resolvePlaywrightLocator(page, locatorStr);
}

export function resolvePlaywrightLocator(page: Page, locatorStr: string): Locator | null {
  if (!locatorStr) return null;
  try {
    const roleMatch = locatorStr.match(
      /^getByRole\(\s*['"]([^'"]+)['"]\s*(?:,\s*(\{[^}]*\}))?\s*\)/
    );
    if (roleMatch) {
      const role = roleMatch[1] as Parameters<Page['getByRole']>[0];
      const opts = parseOptions(roleMatch[2] ?? '{}');
      let locator = page.getByRole(role, opts);
      const chained = extractChainedLocator(locatorStr);
      if (chained) locator = locator.locator(chained);
      return locator;
    }
    const labelMatch = locatorStr.match(/^getByLabel\(\s*['"]([^'"]+)['"]\s*(?:,\s*(\{[^}]*\}))?\s*\)/);
    if (labelMatch) return page.getByLabel(labelMatch[1], parseOptions(labelMatch[2] ?? '{}'));
    const textMatch = locatorStr.match(/^getByText\(\s*['"]([^'"]+)['"]\s*(?:,\s*(\{[^}]*\}))?\s*\)/);
    if (textMatch) return page.getByText(textMatch[1], parseOptions(textMatch[2] ?? '{}'));
    const testIdMatch = locatorStr.match(/^getByTestId\(\s*['"]([^'"]+)['"]\s*\)/);
    if (testIdMatch) return page.getByTestId(testIdMatch[1]);
    const placeholderMatch = locatorStr.match(/^getByPlaceholder\(\s*['"]([^'"]+)['"]\s*(?:,\s*(\{[^}]*\}))?\s*\)/);
    if (placeholderMatch) return page.getByPlaceholder(placeholderMatch[1], parseOptions(placeholderMatch[2] ?? '{}'));
    const altMatch = locatorStr.match(/^getByAltText\(\s*['"]([^'"]+)['"]\s*(?:,\s*(\{[^}]*\}))?\s*\)/);
    if (altMatch) return page.getByAltText(altMatch[1], parseOptions(altMatch[2] ?? '{}'));
    const titleMatch = locatorStr.match(/^getByTitle\(\s*['"]([^'"]+)['"]\s*(?:,\s*(\{[^}]*\}))?\s*\)/);
    if (titleMatch) return page.getByTitle(titleMatch[1], parseOptions(titleMatch[2] ?? '{}'));
    return page.locator(locatorStr);
  } catch (e) {
    Logger.debug(`resolvePlaywrightLocator failed for "${locatorStr}": ${String(e)}`);
    try { return page.locator(locatorStr); } catch { return null; }
  }
}

export function resolvePlaywrightLocatorScoped(container: Locator, locatorStr: string): Locator {
  try {
    const roleMatch = locatorStr.match(/^getByRole\(\s*['"]([^'"]+)['"]\s*(?:,\s*(\{[^}]*\}))?\s*\)/);
    if (roleMatch) {
      const role = roleMatch[1] as Parameters<Locator['getByRole']>[0];
      const opts = parseOptions(roleMatch[2] ?? '{}');
      let loc = container.getByRole(role, opts);
      const chained = extractChainedLocator(locatorStr);
      if (chained) loc = loc.locator(chained);
      return loc;
    }
    const labelMatch = locatorStr.match(/^getByLabel\(\s*['"]([^'"]+)['"]\s*(?:,\s*(\{[^}]*\}))?\s*\)/);
    if (labelMatch) return container.getByLabel(labelMatch[1], parseOptions(labelMatch[2] ?? '{}'));
    const textMatch = locatorStr.match(/^getByText\(\s*['"]([^'"]+)['"]\s*(?:,\s*(\{[^}]*\}))?\s*\)/);
    if (textMatch) return container.getByText(textMatch[1], parseOptions(textMatch[2] ?? '{}'));
    const testIdMatch = locatorStr.match(/^getByTestId\(\s*['"]([^'"]+)['"]\s*\)/);
    if (testIdMatch) return container.getByTestId(testIdMatch[1]);
    const placeholderMatch = locatorStr.match(/^getByPlaceholder\(\s*['"]([^'"]+)['"]\s*(?:,\s*(\{[^}]*\}))?\s*\)/);
    if (placeholderMatch) return container.getByPlaceholder(placeholderMatch[1], parseOptions(placeholderMatch[2] ?? '{}'));
    const altMatch = locatorStr.match(/^getByAltText\(\s*['"]([^'"]+)['"]\s*(?:,\s*(\{[^}]*\}))?\s*\)/);
    if (altMatch) return container.getByAltText(altMatch[1], parseOptions(altMatch[2] ?? '{}'));
    const titleMatch = locatorStr.match(/^getByTitle\(\s*['"]([^'"]+)['"]\s*(?:,\s*(\{[^}]*\}))?\s*\)/);
    if (titleMatch) return container.getByTitle(titleMatch[1], parseOptions(titleMatch[2] ?? '{}'));
    return container.locator(locatorStr);
  } catch {
    return container.locator(locatorStr);
  }
}

export function getElement(page: Page, step: Step): Locator | null {
  const loc = step.codegenLocator || step.locator || '';
  if (!loc) { Logger.debug(`getElement: no locator on step "${step.label}"`); return null; }
  if (step.scope) {
    const container = page.locator(step.scope);
    return resolvePlaywrightLocatorScoped(container, loc);
  }
  return resolvePlaywrightLocator(page, loc);
}

export function parseOptions(optStr: string): Record<string, unknown> {
  if (!optStr || optStr === '{}') return {};
  const result: Record<string, unknown> = {};
  const nameSingle = optStr.match(/name\s*:\s*'((?:[^'\\]|\\.)*)'/);
  const nameDouble = optStr.match(/name\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const nameRegex = optStr.match(/name\s*:\s*\/([^/]+)\/([gimsuy]*)/);
  if (nameSingle) result['name'] = nameSingle[1];
  else if (nameDouble) result['name'] = nameDouble[1];
  else if (nameRegex) result['name'] = new RegExp(nameRegex[1], nameRegex[2]);
  const exact = optStr.match(/exact\s*:\s*(true|false)/);
  const checked = optStr.match(/checked\s*:\s*(true|false)/);
  const disabled = optStr.match(/disabled\s*:\s*(true|false)/);
  const expanded = optStr.match(/expanded\s*:\s*(true|false)/);
  const pressed = optStr.match(/pressed\s*:\s*(true|false)/);
  const selected = optStr.match(/selected\s*:\s*(true|false)/);
  const includeHidden = optStr.match(/includeHidden\s*:\s*(true|false)/);
  const level = optStr.match(/level\s*:\s*(\d+)/);
  if (exact) result['exact'] = exact[1] === 'true';
  if (checked) result['checked'] = checked[1] === 'true';
  if (disabled) result['disabled'] = disabled[1] === 'true';
  if (expanded) result['expanded'] = expanded[1] === 'true';
  if (pressed) result['pressed'] = pressed[1] === 'true';
  if (selected) result['selected'] = selected[1] === 'true';
  if (includeHidden) result['includeHidden'] = includeHidden[1] === 'true';
  if (level) result['level'] = parseInt(level[1], 10);
  return result;
}

function extractChainedLocator(locatorStr: string): string | null {
  const single = locatorStr.match(/\.locator\('([^']+)'\)/);
  if (single) return single[1];
  const double = locatorStr.match(/\.locator\("([^"]+)"\)/);
  if (double) return double[1];
  return null;
}
