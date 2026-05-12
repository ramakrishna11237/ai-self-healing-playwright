import { Step, ActionType } from '../types';
import { sanitizeSelector, escapeCSSValue, escapeTextValue } from '../utils/selectors';

export const GENERIC_LOCATORS = new Set([
  'a',
  'button',
  "button[type='submit']",
  'input',
  'div',
  'span',
  'body',
]);

const CLICK_LIKE_ACTIONS: Set<ActionType> = new Set([
  'click',
  'doubleClick',
  'rightClick',
  'hover',
  'submit',
  'login',
  'logout',
]);

// Fix #3: module-level regex constants — compiled once, reused on every call
const RE_ROLE_NAME_SINGLE = /name\s*:\s*'((?:[^'\\]|\\.)*)'/;
const RE_ROLE_NAME_DOUBLE = /name\s*:\s*"((?:[^"\\]|\\.)*)"/;
const RE_LABEL_SINGLE = /^getByLabel\(\s*'((?:[^'\\]|\\.)*)'/;
const RE_LABEL_DOUBLE = /^getByLabel\(\s*"((?:[^"\\]|\\.)*)"/;
const RE_TEXT_SINGLE = /^getByText\(\s*'((?:[^'\\]|\\.)*)'/;
const RE_PLACEHOLDER_SINGLE = /^getByPlaceholder\(\s*'((?:[^'\\]|\\.)*)'/;
const RE_TESTID_SINGLE = /^getByTestId\(\s*'((?:[^'\\]|\\.)*)'/;
const RE_ALT_SINGLE = /^getByAltText\(\s*'((?:[^'\\]|\\.)*)'/;
const RE_TITLE_SINGLE = /^getByTitle\(\s*'((?:[^'\\]|\\.)*)'/;

export function extractElementName(locatorStr: string): string | null {
  if (!locatorStr) return null;
  let m: RegExpMatchArray | null;
  if ((m = locatorStr.match(RE_ROLE_NAME_SINGLE))) return m[1];
  if ((m = locatorStr.match(RE_ROLE_NAME_DOUBLE))) return m[1];
  if ((m = locatorStr.match(RE_LABEL_SINGLE))) return m[1];
  if ((m = locatorStr.match(RE_LABEL_DOUBLE))) return m[1];
  if ((m = locatorStr.match(RE_TEXT_SINGLE))) return m[1];
  if ((m = locatorStr.match(RE_PLACEHOLDER_SINGLE))) return m[1];
  if ((m = locatorStr.match(RE_TESTID_SINGLE))) return m[1];
  if ((m = locatorStr.match(RE_ALT_SINGLE))) return m[1];
  if ((m = locatorStr.match(RE_TITLE_SINGLE))) return m[1];
  return null;
}

// ── LRU cache — evicts least-recently-used entries instead of full clear ──────
const CACHE_MAX = 500;
const strategyCache = new Map<string, string[]>();

function lruSet(key: string, value: string[]): void {
  // Delete first so re-insertion moves it to end (most-recently-used)
  strategyCache.delete(key);
  strategyCache.set(key, value);
  // Evict oldest entry when over limit
  if (strategyCache.size > CACHE_MAX) {
    const oldest = strategyCache.keys().next().value;
    if (oldest !== undefined) strategyCache.delete(oldest);
  }
}

export function getLocatorStrategies(step: Step): string[] {
  const cacheKey = `${step.codegenLocator ?? ''}|${step.locator ?? ''}|${step.label ?? ''}|${step.action ?? ''}`;

  const cached = strategyCache.get(cacheKey);
  if (cached) return cached;

  const strategies: string[] = [];
  const action = step.action ?? 'click';

  if (step.codegenLocator && sanitizeSelector(step.codegenLocator)) {
    strategies.push(step.codegenLocator);
  }
  if (step.locator && sanitizeSelector(step.locator)) {
    strategies.push(step.locator);
  }

  const elementName = step.codegenLocator ? extractElementName(step.codegenLocator) : null;
  const names: string[] = [];
  if (elementName) names.push(elementName);
  if (step.label && step.label !== elementName) names.push(step.label);

  const primaryName = names[0];
  if (primaryName) {
    const label = sanitizeSelector(primaryName);
    const cssVal = escapeCSSValue(label);

    strategies.push(`getByRole('button', { name: '${cssVal}' })`);
    strategies.push(`getByRole('link', { name: '${cssVal}' })`);
    strategies.push(`getByRole('textbox', { name: '${cssVal}' })`);
    strategies.push(`getByRole('combobox', { name: '${cssVal}' })`);
    strategies.push(`getByRole('checkbox', { name: '${cssVal}' })`);
    strategies.push(`getByRole('radio', { name: '${cssVal}' })`);
    strategies.push(`getByRole('tab', { name: '${cssVal}' })`);
    strategies.push(`getByLabel('${cssVal}')`);
    strategies.push(`getByPlaceholder('${cssVal}')`);
    strategies.push(`getByText('${cssVal}')`);
    strategies.push(`getByTitle('${cssVal}')`);
    strategies.push(`getByRole('option', { name: '${cssVal}' })`);

    const textVal = escapeTextValue(label);
    strategies.push(`[data-testid="${cssVal}"]`);
    strategies.push(`[aria-label="${cssVal}"]`);
    // name attribute uses raw value — HTML name attrs don't use CSS escaping
    strategies.push(`[name="${label}"]`);
    strategies.push(`[id="${cssVal}"]`);
    strategies.push(`text=${textVal}`);
  }

  if (step.text) {
    const textVal = escapeTextValue(sanitizeSelector(step.text));
    if (textVal) strategies.push(`text=${textVal}`);
  }

  if (CLICK_LIKE_ACTIONS.has(action)) {
    strategies.push("button[type='submit']");
    strategies.push('button');
    strategies.push('a');
  }

  const seen = new Set<string>();
  const result = strategies.filter((s) => {
    if (!s || seen.has(s)) return false;
    seen.add(s);
    return true;
  });

  // Cap cache size to avoid unbounded growth in long test runs
  lruSet(cacheKey, result);

  return result;
}
