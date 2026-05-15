import { Page } from '@playwright/test';
import { Logger } from '../utils/Logger';
import { Step, ActionType } from '../types';
import { resolveLocatorToPlaywright } from '../engine/ActionRouter';
import { SafetyCheckEngine } from '../engine/SafetyCheckEngine';
import { QuantumConfidenceSystem } from '../engine/QuantumConfidenceSystem';
import { buildHealCandidates, inferExpectedRole, scoreHealCandidate } from './parts/CandidateBuilder';

export interface HealResult {
  locator: string;
  confidence: number;
  candidatesTried: number;
  verified: boolean;
}

// Actions that assert/verify state — must never heal to interactive elements
const ASSERT_ACTIONS = new Set<ActionType>([
  'assertVisible', 'assertHidden', 'assertCount', 'assertAttribute',
  'assertText', 'assertValue', 'assertChecked', 'assertUnchecked',
  'assertEnabled', 'assertDisabled', 'assertHasClass', 'assertInViewport',
  'assertEditable', 'assertFocused', 'assertUrl', 'assertTitle', 'validation',
]);

const ACTION_ELEMENT_PATTERNS = [
  /^getByRole\('button'/, /^getByRole\('link'/, /^getByRole\('menuitem'/,
  /^getByRole\('tab'/, /^button/, /^a\[/, /button:has-text/, /^a:has-text/,
];

function isValidHealCandidate(locator: string, action: ActionType): boolean {
  if (!ASSERT_ACTIONS.has(action)) return true;
  const blocked = ACTION_ELEMENT_PATTERNS.some((p) => p.test(locator));
  if (blocked) Logger.debug(`Self-heal guard: blocked "${locator}" for assertion "${action}"`);
  return !blocked;
}

async function scopeToMainContent(
  locator: ReturnType<Page['locator']>,
  page: Page
): Promise<ReturnType<Page['locator']> | null> {
  const CONTAINERS = ["[role='dialog']", "[role='alertdialog']", 'form', 'main', "[role='main']", 'article', 'section'];
  for (const container of CONTAINERS) {
    try {
      const scoped = locator.filter({ has: page.locator(container) });
      if ((await scoped.count()) > 0) return scoped.first();
    } catch { continue; }
  }
  return null;
}

function inferElementType(locator: string): string {
  if (!locator) return 'unknown';
  if (/getByRole\('button'|button/i.test(locator)) return 'button';
  if (/getByRole\('link'|^a\[|a:has-text/i.test(locator)) return 'link';
  if (/getByRole\('textbox'|input|textarea/i.test(locator)) return 'input';
  if (/getByRole\('checkbox'|checkbox/i.test(locator)) return 'checkbox';
  if (/getByRole\('combobox'|select/i.test(locator)) return 'select';
  return 'unknown';
}

export async function selfHeal(
  page: Page,
  step: Step,
  hint?: string,
  domSnapshot?: string
): Promise<HealResult | false> {
  if (page.isClosed()) {
    Logger.warn(`Self-heal skipped — page not accessible for "${step.label}"`);
    return false;
  }

  const action = step.action ?? 'click';
  const expectedRole = inferExpectedRole(step);
  const rawCandidates = buildHealCandidates(step, hint, domSnapshot);

  const candidates = rawCandidates
    .map((loc) => ({ loc, score: scoreHealCandidate(loc, expectedRole) }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.loc);

  Logger.debug(`Self-heal: ${candidates.length} candidates for "${step.label}" [${action}]${expectedRole ? ` (expected role: ${expectedRole})` : ''}`);

  const MIN_HEAL_CONFIDENCE = 55;
  let candidatesTried = 0;

  for (const locator of candidates) {
    if (!isValidHealCandidate(locator, action)) continue;

    const isHealHint = locator === step.healHint;
    const candidateConfidence = isHealHint ? MIN_HEAL_CONFIDENCE : scoreHealCandidate(locator, expectedRole);

    if (!isHealHint && candidateConfidence < MIN_HEAL_CONFIDENCE) {
      Logger.debug(`Self-heal skipping low-confidence candidate (${candidateConfidence}): ${locator}`);
      continue;
    }

    const safetyResult = SafetyCheckEngine.shouldRejectHeal({
      locator, action,
      originalContext: { action, elementType: inferElementType(step.codegenLocator ?? step.locator ?? '') },
      newContext: { action, elementType: inferElementType(locator) },
    });
    if (safetyResult.reject) {
      Logger.warn(`Self-heal: SafetyCheckEngine blocked "${locator}" — ${safetyResult.reasons.join(', ')}`);
      continue;
    }

    if (!isHealHint) {
      const qcs = QuantumConfidenceSystem.calculateCompositeConfidence(
        { locator, strategy: 'selfheal', confidence: candidateConfidence, action },
        { originalStep: step, action, layer: 'layer4' }
      );
      if (!QuantumConfidenceSystem.isAcceptable(qcs.overall, 'layer4')) {
        Logger.debug(`Self-heal: QuantumConfidence too low (${qcs.overall.toFixed(1)}) for "${locator}"`);
        continue;
      }
    }

    candidatesTried++;

    try {
      Logger.debug(`Self-heal trying [${action}] confidence=${candidateConfidence}: ${locator}`);
      const el = resolveLocatorToPlaywright(page, locator);
      if (!el) continue;

      const count = await el.count();
      if (count === 0) continue;

      if (count > 1) {
        const scoped = await scopeToMainContent(el, page);
        if (!scoped) {
          Logger.debug(`Self-heal: ${count} matches for "${locator}" — skipping ambiguous candidate`);
          continue;
        }
        Logger.debug(`Self-heal: scoped to main content (${count} matches → 1)`);
      }

      const { routeAction } = await import('../engine/ActionRouter');
      const isCodegen = locator.startsWith('getBy');
      const stepWithLocator: Step = isCodegen
        ? { ...step, codegenLocator: locator, locator: undefined }
        : { ...step, locator, codegenLocator: undefined };

      const success = await routeAction(page, action, stepWithLocator);
      if (success) {
        const confidence = scoreHealCandidate(locator);
        Logger.success(`Self-heal succeeded: ${locator} (confidence: ${confidence}, tried: ${candidatesTried})`);
        return { locator, confidence, candidatesTried, verified: true };
      }
    } catch {
      Logger.debug(`Self-heal failed: ${locator}`);
    }
  }

  Logger.warn(`Self-heal exhausted all ${candidates.length} candidates for "${step.label}"`);
  return false;
}
