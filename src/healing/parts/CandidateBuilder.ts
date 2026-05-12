import { Step } from '../../types';
import { Logger } from '../../utils/Logger';
import { escapeCSSValue, escapeTextValue } from '../../utils/selectors';
import { extractElementName as extractNameFromCodegen } from '../../engine/LocatorEngine';

// ── Fuzzy matching ────────────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

const DANGEROUS_PAIRS = new Set([
  'login|logout', 'logout|login', 'save|delete', 'delete|save',
  'submit|cancel', 'cancel|submit', 'confirm|cancel', 'cancel|confirm',
  'add|remove', 'remove|add', 'enable|disable', 'disable|enable',
  'open|close', 'close|open', 'yes|no', 'no|yes', 'approve|reject', 'reject|approve',
]);

export function isFuzzyMatch(target: string, candidate: string, maxDistance = 3, cache?: Map<string, boolean>): boolean {
  const t = target.toLowerCase().trim();
  const c = candidate.toLowerCase().trim();
  const key = `${t}|${c}`;
  if (cache?.has(key)) return cache.get(key)!;
  if (DANGEROUS_PAIRS.has(key)) { cache?.set(key, false); return false; }
  let result = false;
  if (t === c) result = true;
  else if (c.includes(t) || t.includes(c)) result = true;
  else if (t.length <= 50 && c.length <= 50) result = levenshtein(t, c) <= maxDistance;
  cache?.set(key, result);
  return result;
}

// ── Snapshot parsing ──────────────────────────────────────────────────────────

export function extractRoleNamesFromSnapshot(snapshot: string): Array<{ role: string; name: string }> {
  const results: Array<{ role: string; name: string }> = [];
  const pattern = /^\s*-\s+(\w+)\s+"([^"]+)"/gm;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(snapshot)) !== null) {
    const role = match[1].toLowerCase().trim();
    const name = match[2].trim();
    if (name && name.length > 1 && name.length < 100) results.push({ role, name });
  }
  const seen = new Set<string>();
  return results.filter((x) => { const k = `${x.role}|${x.name}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

// ── Confidence scoring ────────────────────────────────────────────────────────

const HEAL_CONFIDENCE: Record<string, number> = {
  'data-testid': 100, 'aria-label': 90, getByRole: 85, getByLabel: 80,
  name: 75, placeholder: 70, text: 65, title: 55, pierce: 50, default: 40,
};

export function inferExpectedRole(step: Step): string | null {
  const loc = step.codegenLocator ?? '';
  if (/getByRole\('link'/.test(loc)) return 'link';
  if (/getByRole\('button'/.test(loc)) return 'button';
  if (/getByRole\('textbox'/.test(loc)) return 'textbox';
  if (/getByRole\('combobox'/.test(loc)) return 'combobox';
  if (/getByRole\('checkbox'/.test(loc)) return 'checkbox';
  return null;
}

export function scoreHealCandidate(locator: string, expectedRole?: string | null): number {
  if (expectedRole && locator.includes(`getByRole('${expectedRole}'`)) return 95;
  if (expectedRole && (locator.startsWith('text=') || locator.startsWith('getByText(')) && !locator.includes('getByRole')) return 30;
  if (locator.includes('data-testid')) return HEAL_CONFIDENCE['data-testid']!;
  if (locator.includes('aria-label')) return HEAL_CONFIDENCE['aria-label']!;
  if (locator.startsWith('getByRole')) return HEAL_CONFIDENCE['getByRole']!;
  if (locator.startsWith('getByLabel')) return HEAL_CONFIDENCE['getByLabel']!;
  if (locator.includes('[name=')) return HEAL_CONFIDENCE['name']!;
  if (locator.includes('type="submit"')) return HEAL_CONFIDENCE['name']!;
  if (locator.includes('input[value=')) return 68;
  if (locator.includes('placeholder')) return HEAL_CONFIDENCE['placeholder']!;
  if (locator.startsWith('text=')) return HEAL_CONFIDENCE['text']!;
  if (locator.includes('[title=')) return HEAL_CONFIDENCE['title']!;
  if (locator.startsWith('pierce/')) return HEAL_CONFIDENCE['pierce']!;
  return HEAL_CONFIDENCE['default']!;
}

// ── Candidate builder ─────────────────────────────────────────────────────────

export function buildHealCandidates(step: Step, hint?: string, domSnapshot?: string): string[] {
  const candidates: string[] = [];

  if (step.healHint) { candidates.push(step.healHint); Logger.debug(`Self-heal: using healHint: "${step.healHint}"`); }
  if (hint) candidates.push(hint);
  if (step.codegenLocator) candidates.push(step.codegenLocator);

  const codegenName = step.codegenLocator ? extractNameFromCodegen(step.codegenLocator) : null;
  const names = [...new Set([codegenName, step.label?.trim()].filter(Boolean))] as string[];

  for (const name of names) {
    const css = escapeCSSValue(name);
    const cssLower = escapeCSSValue(name.toLowerCase());
    const txt = escapeTextValue(name);
    candidates.push(
      `text=${txt}`, `[aria-label="${css}"]`, `[title="${css}"]`,
      `[placeholder="${css}"]`, `[placeholder="${cssLower}"]`,
      `[name="${css}"]`, `[name="${cssLower}"]`, `[name*="${cssLower}"]`,
      `[value="${css}"]`, `input[type="submit"][value="${css}"]`, `input[value="${css}"]`,
      `button:has-text("${css}")`, `a:has-text("${css}")`, `[data-testid="${css}"]`,
      `input[type="text"][id*="${cssLower}"]`, `input[id*="${cssLower}"]`,
      `pierce/[aria-label="${css}"]`, `pierce/[name="${css}"]`,
      `pierce/[placeholder="${css}"]`, `pierce/[data-testid="${css}"]`
    );
  }

  if (step.text?.trim()) candidates.push(`text=${escapeTextValue(step.text.trim())}`);

  if (domSnapshot) {
    const roleNames = extractRoleNamesFromSnapshot(domSnapshot);
    const targetName = (codegenName ?? step.label ?? '').toLowerCase().trim();
    const fuzzyCache = new Map<string, boolean>();

    for (const { role, name: pageName } of roleNames) {
      if (!targetName || !isFuzzyMatch(targetName, pageName, 4, fuzzyCache)) continue;
      const isExact = pageName.toLowerCase().trim() === targetName;
      const css = escapeCSSValue(pageName);
      const txt = escapeTextValue(pageName);

      const playwrightRole = ['textbox', 'button', 'link', 'combobox', 'checkbox', 'radio', 'tab', 'menuitem', 'option'].includes(role) ? role : null;
      if (playwrightRole) candidates.push(`getByRole('${playwrightRole}', { name: '${pageName}' })`);

      candidates.push(
        `getByRole('button', { name: '${pageName}' })`, `getByRole('link', { name: '${pageName}' })`,
        `getByRole('textbox', { name: '${pageName}' })`, `getByRole('combobox', { name: '${pageName}' })`,
        `getByRole('checkbox', { name: '${pageName}' })`, `getByRole('radio', { name: '${pageName}' })`,
        `getByRole('tab', { name: '${pageName}' })`, `getByRole('menuitem', { name: '${pageName}' })`,
        `getByRole('option', { name: '${pageName}' })`, `getByLabel('${pageName}')`,
        `text=${txt}`, `[aria-label="${css}"]`
      );

      if (!isExact) Logger.debug(`Self-heal: fuzzy DOM match: "${targetName}" ~ "${pageName}" (role: ${role})`);
      else Logger.debug(`Self-heal: exact DOM match: "${pageName}" (role: ${role})`);
    }
  }

  return [...new Set(candidates.filter(Boolean))];
}
