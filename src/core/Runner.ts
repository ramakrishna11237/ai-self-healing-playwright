import { Page } from '@playwright/test';
import { detectPattern, executePattern } from '../engine/PatternEngine';
import { getLocatorStrategies, GENERIC_LOCATORS } from '../engine/LocatorEngine';
import { SmartLocatorEngine } from '../engine/SmartLocatorEngine';
import { waitForElement } from '../engine/SmartWait';
import { retryAction } from '../engine/RetryEngine';
import { getBestLocatorWithScore } from '../learning/FixApplier';
import { updateFix } from '../learning/LearningStore';
import { captureDOM } from '../dom/DOMCapture';
import { getDOMDiff } from '../dom/DOMDiff';
import { generateVisualDiff } from '../dom/VisualDiff';
import { selfHeal } from '../healing/SelfHeal';
import { getLLMLocatorFromLabel } from '../engine/LLMLocatorEngine';
import { runAutonomousDiagnostics } from '../engine/AutonomousDiagnostics';
import { ollamaHeal } from '../engine/OllamaHealingEngine';
import { HealingCircuitBreaker } from '../engine/HealingCircuitBreaker';
import { ElementExistenceHealer } from '../engine/ElementExistenceHealer';
import { recordFailure } from '../utils/FailureReport';
import { routeAction } from '../engine/ActionRouter';
import { Logger } from '../utils/Logger';
import { Step, ActionType, StepResult } from '../types';
import { DEFAULT_CONFIG } from '../config';

const CLICK_LIKE: Set<ActionType> = new Set(['click', 'submit', 'login', 'doubleClick']);

/** Returns false if step has expectedUrl and the page didn't navigate there after a click. */
function passesUrlCheck(page: Page, step: Step, action: ActionType): boolean {
  if (!step.expectedUrl || !CLICK_LIKE.has(action)) return true;
  const url = page.url();
  const ok = url.includes(step.expectedUrl);
  if (!ok)
    Logger.debug(`Layer 2 URL check failed: expected "${step.expectedUrl}" but got "${url}"`);
  return ok;
}

const ASSERT_ACTIONS = new Set<ActionType>([
  'assertVisible',
  'assertHidden',
  'assertCount',
  'assertAttribute',
  'assertText',
  'assertValue',
  'assertChecked',
  'assertUnchecked',
  'assertEnabled',
  'assertDisabled',
  'assertHasClass',
  'assertInViewport',
  'assertEditable',
  'assertFocused',
  'assertUrl',
  'assertTitle',
  'validation',
  'assertPattern',
  'assertPdf',
]);

const ALWAYS_SELF_CONTAINED: Set<ActionType> = new Set([
  'navigate',
  'reload',
  'goBack',
  'goForward',
  'newTab',
  'closeTab',
  'switchTab',
  'wait',
  'waitForUrl',
  'waitForNetwork',
  'screenshot',
  'scroll',
  'assertUrl',
  'assertTitle',
]);

function isSelfContained(action: ActionType, step: Step): boolean {
  if (ALWAYS_SELF_CONTAINED.has(action)) return true;
  if (action === 'keyPress' && !step.codegenLocator && !step.locator) return true;
  if (action === 'waitForText' && !step.codegenLocator && !step.locator) return true;
  return false;
}

function ok(
  layer: StepResult['layer'],
  locatorUsed?: string,
  retryCount = 0,
  healConfidence?: number,
  healCandidatesTried?: number,
  healVerified?: boolean
): StepResult {
  return {
    success: true,
    layer,
    locatorUsed,
    retryCount,
    healConfidence,
    healCandidatesTried,
    healVerified,
  };
}

function fail(error: string): StepResult {
  return { success: false, layer: 'none', error };
}

/**
 * Structured failure — tells exactly which layer failed and why.
 * Replaces the vague "all recovery strategies exhausted" message.
 */
function sanitizeForError(val: string | undefined | null): string {
  return (val ?? '')
    .replace(
      /[<>&"']/g,
      (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#x27;' })[c] ?? c
    )
    .replace(/[\r\n]/g, ' ')
    .slice(0, 300);
}

function failWithContext(
  step: Step,
  action: ActionType,
  layerResults: { layer: string; reason: string }[]
): never {
  const lines = [
    ``,
    `=== STEP FAILED =========================================`,
    `  Step   : "${sanitizeForError(step.label)}"`,
    `  Action : ${sanitizeForError(action)}`,
    `  Locator: ${sanitizeForError(step.codegenLocator ?? step.locator ?? '(none)')}`,
    ``,
    `  Recovery attempts:`,
    ...layerResults.map((r) => `    ${sanitizeForError(r.layer)}: ${sanitizeForError(r.reason)}`),
    ``,
    `  Debug tips:`,
    `    1. Set FW_LOG_LEVEL=debug in .env for full strategy trace`,
    `    2. Run with HEADLESS=false to watch the browser`,
    `    3. Wrap test with TraceManager.wrap() for Playwright trace`,
    `    4. Run: npx playwright codegen <url> to get fresh locators`,
    `=========================================================`,
    ``,
  ];
  throw new Error(
    lines
      .join('\n')
      .replace(
        /[<>&"']/g,
        (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#x27;' })[c] ?? c
      )
  );
}

function timerLabel(step: Step): string {
  const raw = step.label?.trim() || `step-${Date.now()}`;
  // Replace control characters and newlines with empty string — no HTML output
  return raw
    .replace(/[\r\n\u007f]/g, '')
    .replace(/[\u0000-\u001f]/g, '')
    .slice(0, 200);
}

function originalLocator(step: Step): string {
  return step.codegenLocator ?? step.locator ?? '';
}

function isPageAlive(page: Page): boolean {
  return !page.isClosed();
}

// Throttle updateFix — only write when the locator is non-generic and label differs
// Note: LearningStore has its own in-memory cache so repeated writes are cheap;
// the module-level Map approach doesn't work across Playwright parallel workers.
function throttledUpdateFix(
  oldLocator: string,
  newLocator: string,
  success: boolean,
  action: string,
  label: string
): void {
  updateFix(oldLocator, newLocator, success, action, label);
}

export async function runStep(page: Page, step: Step): Promise<boolean> {
  const result = await runStepDetailed(page, step);
  return result.success;
}

export async function runStepDetailed(page: Page, step: Step): Promise<StepResult> {
  const isDebug = Logger.getLevel() === 'debug';
  const label = isDebug ? timerLabel(step) : '';

  Logger.info(`Step: "${(step.label || '(no label)').replace(/[\r\n]/g, ' ')}"`);
  if (isDebug) Logger.time(label);

  // Collect what each layer tried — shown in error message on failure
  const layerResults: { layer: string; reason: string }[] = [];

  try {
    const action: ActionType = step.action ?? detectPattern(step);
    Logger.debug(`Action: ${action}`);

    // ── Self-contained: no locator fallback needed ──────────────────────────
    if (isSelfContained(action, step)) {
      const succeeded = await executePattern(page, action, step);
      if (isDebug) Logger.timeEnd(label);
      if (succeeded) return ok('pattern');
      return fail(`self-contained action "${action}" returned false`);
    }

    // ── Layer 1: Direct execution (with per-step retry + backoff) ───────────
    let layer1Succeeded = false;
    let layer1RetryCount = 0;
    try {
      await retryAction(async () => {
        const ok1 = await executePattern(page, action, step);
        if (!ok1) throw new Error('action returned false');
      }, DEFAULT_CONFIG.stepRetries);
      layer1Succeeded = true;
    } catch {
      // count retries attempted
      layer1RetryCount = DEFAULT_CONFIG.stepRetries;
    }

    if (layer1Succeeded) {
      Logger.success(`"${step.label}" via pattern`);
      HealingCircuitBreaker.recordSuccess();
      if (isDebug) Logger.timeEnd(label);
      const usedLocator = originalLocator(step);
      if (usedLocator && step.codegenLocator && !GENERIC_LOCATORS.has(usedLocator)) {
        if (step.label && step.label !== usedLocator) {
          throttledUpdateFix(step.label, usedLocator, true, action, step.label);
        }
      }
      return ok('pattern', usedLocator, layer1RetryCount);
    }
    layerResults.push({
      layer: 'Layer 1 (direct)',
      reason: `failed after ${layer1RetryCount} retries: ${originalLocator(step) || '(none)'}`,
    });

    // ── Layer 2: Parallel batch strategy fallback ───────────────────────────
    // Assertions: element not found = correct result, no recovery needed
    if (ASSERT_ACTIONS.has(action)) {
      if (isDebug) Logger.timeEnd(label);
      layerResults.push({
        layer: 'Layer 2-4 (skipped)',
        reason: 'assertion actions never self-heal',
      });
      failWithContext(step, action, layerResults);
    }

    // ── Circuit breaker — prevents infinite healing loops in CI ─────────────────────────────────────────────────────────────────────────────────────
    // After 5 consecutive heal failures, skip healing and fail fast to save CI time
    if (!HealingCircuitBreaker.canAttemptHeal()) {
      layerResults.push({
        layer: 'Circuit Breaker',
        reason: 'too many consecutive failures — healing paused to save time',
      });
      if (isDebug) Logger.timeEnd(label);
      return failWithContext(step, action, layerResults);
    }

    // ── Layer 2a: SmartLocatorEngine (confidence-ordered, context-aware) ────
    const elementName = step.label ?? '';
    const smartResult = await SmartLocatorEngine.findBest(page, elementName, action, {
      scope: step.scope,
      timeout: DEFAULT_CONFIG.strategyTimeout,
      allowPartial: true,
    });

    if (smartResult?.element) {
      try {
        const isCodegen = smartResult.locator.startsWith('getBy');
        const stepSmart: Step = isCodegen
          ? { ...step, codegenLocator: smartResult.locator, locator: undefined }
          : { ...step, locator: smartResult.locator, codegenLocator: undefined };
        const success = await routeAction(page, action, stepSmart);
        if (success && passesUrlCheck(page, step, action)) {
          Logger.success(
            `"${step.label}" via SmartLocator [${smartResult.strategy}, confidence: ${smartResult.confidence}]: ${smartResult.locator}`
          );
          const orig = originalLocator(step);
          if (orig && orig !== smartResult.locator && !GENERIC_LOCATORS.has(smartResult.locator)) {
            updateFix(orig, smartResult.locator, true, action, step.label);
          }
          if (isDebug) Logger.timeEnd(label);
          return ok('strategy', smartResult.locator);
        }
      } catch {
        Logger.debug(`SmartLocator action failed: ${smartResult.locator}`);
      }
    }

    // ── Layer 2b: Batch strategy fallback ────────────────────────────────────
    // Role-typed candidates (link/button/textbox) are tried before generic text
    // candidates — prevents getByText('1') winning over getByRole('link', ...)
    const strategies = getLocatorStrategies(step);
    const roleTyped = strategies.filter((s) =>
      /getByRole\('(link|button|textbox|combobox|checkbox|radio)'/.test(s)
    );
    const remaining = strategies.filter((s) => !roleTyped.includes(s));
    const orderedStrategies = [...roleTyped, ...remaining];
    Logger.debug(
      `Trying ${orderedStrategies.length} locator strategies (${roleTyped.length} role-typed first)`
    );

    const BATCH_SIZE = 3;
    for (let i = 0; i < orderedStrategies.length; i += BATCH_SIZE) {
      const batch = orderedStrategies.slice(i, i + BATCH_SIZE);

      const winner = await Promise.any(
        batch.map(async (locator) => {
          const visible = await waitForElement(
            page,
            locator,
            DEFAULT_CONFIG.strategyTimeout,
            step.scope
          );
          if (!visible) throw new Error(`not visible: ${locator}`);
          return locator;
        })
      ).catch(() => null);

      if (!winner) continue;

      try {
        const isCodegen = winner.startsWith('getBy');
        const stepWithLocator: Step = isCodegen
          ? { ...step, codegenLocator: winner, locator: undefined }
          : { ...step, locator: winner, codegenLocator: undefined };

        const success = await routeAction(page, action, stepWithLocator);
        if (!success || !passesUrlCheck(page, step, action)) continue;

        Logger.success(
          `"${step.label}" via strategy [batch ${Math.floor(i / BATCH_SIZE) + 1}]: ${winner}`
        );
        const orig = originalLocator(step);
        if (orig && orig !== winner && !GENERIC_LOCATORS.has(winner)) {
          updateFix(orig, winner, true, action, step.label);
        }
        if (isDebug) Logger.timeEnd(label);
        return ok('strategy', winner);
      } catch {
        Logger.debug(`Strategy winner action failed: ${winner}`);
      }
    }

    layerResults.push({
      layer: 'Layer 2 (strategy)',
      reason: `SmartLocator + all ${strategies.length} batch strategies tried — none matched`,
    });

    // ── Layer 3: Learned fix ────────────────────────────────────────────────
    const orig = originalLocator(step);
    const learnedFix = getBestLocatorWithScore(orig, action);
    if (learnedFix) {
      const { locator: learned, confidence: learnedConfidence } = learnedFix;
      try {
        Logger.info(`Trying learned locator (confidence: ${learnedConfidence}): ${learned}`);
        const isCodegen = learned.startsWith('getBy');
        const stepWithLearned: Step = isCodegen
          ? { ...step, codegenLocator: learned, locator: undefined }
          : { ...step, locator: learned, codegenLocator: undefined };
        if (
          (await routeAction(page, action, stepWithLearned)) &&
          passesUrlCheck(page, step, action)
        ) {
          Logger.success(
            `"${step.label}" via learned fix (confidence: ${learnedConfidence}): ${learned}`
          );
          updateFix(orig, learned, true, action, step.label);
          if (isDebug) Logger.timeEnd(label);
          return ok('learned', learned, 0, learnedConfidence);
        }
        layerResults.push({
          layer: 'Layer 3 (learned)',
          reason: `learned locator found (confidence: ${learnedConfidence}) but action failed: ${learned}`,
        });
      } catch (e) {
        layerResults.push({
          layer: 'Layer 3 (learned)',
          reason: `learned locator threw: ${String(e).slice(0, 120)}`,
        });
      }
    } else {
      layerResults.push({
        layer: 'Layer 3 (learned)',
        reason: 'no entry in learning-db for this locator',
      });
    }

    // ── Layer 3.5: LLM prediction from label only (no DOM needed) ───────────
    if (DEFAULT_CONFIG.llmEnabled && step.label) {
      try {
        const llm35 = await getLLMLocatorFromLabel(step.label, action, {
          model: DEFAULT_CONFIG.llmModel,
          timeoutMs: DEFAULT_CONFIG.llmTimeoutMs,
          minConfidence: DEFAULT_CONFIG.llmMinConfidence,
        });
        if (llm35) {
          const isCodegen = llm35.locator.startsWith('getBy');
          const stepLLM35: Step = isCodegen
            ? { ...step, codegenLocator: llm35.locator, locator: undefined }
            : { ...step, locator: llm35.locator, codegenLocator: undefined };
          if (await routeAction(page, action, stepLLM35)) {
            const orig = originalLocator(step) || step.label;
            if (orig && !GENERIC_LOCATORS.has(llm35.locator)) {
              updateFix(orig, llm35.locator, true, action, step.label);
              Logger.info(
                `🤖 Layer 3.5 fix stored: "${orig}" → "${llm35.locator}" (confidence: ${llm35.confidence})`
              );
            }
            Logger.success(
              `"${step.label}" via LLM Layer 3.5: ${llm35.locator} (confidence: ${llm35.confidence})`
            );
            if (isDebug) Logger.timeEnd(label);
            return ok('learned', llm35.locator, 0, llm35.confidence);
          }
          layerResults.push({
            layer: 'Layer 3.5 (LLM label)',
            reason: `LLM predicted "${llm35.locator}" but action failed`,
          });
        } else {
          layerResults.push({
            layer: 'Layer 3.5 (LLM label)',
            reason: 'LLM confidence too low — falling through to DOM capture',
          });
        }
      } catch (e) {
        layerResults.push({
          layer: 'Layer 3.5 (LLM label)',
          reason: `LLM error: ${String(e).slice(0, 80)}`,
        });
      }
    }

    // ── Layer 4: DOM capture + self-heal ────────────────────────────────────
    if (!isPageAlive(page)) {
      layerResults.push({
        layer: 'Layer 4 (self-heal)',
        reason: 'page was closed before DOM capture',
      });
      if (isDebug) Logger.timeEnd(label);
      failWithContext(step, action, layerResults);
    }

    Logger.debug(`Capturing DOM for self-heal on "${step.label}"`);
    const failingLocator = originalLocator(step);
    const before = await captureDOM(page, 'before', failingLocator || undefined);
    let after = '';

    if (step.locator) {
      try {
        const stepDirect: Step = { ...step, codegenLocator: undefined };
        if (await routeAction(page, action, stepDirect)) {
          Logger.success(`"${step.label}" via direct locator`);
          if (isDebug) Logger.timeEnd(label);
          return ok('direct', step.locator);
        }
      } catch {
        try {
          if (isPageAlive(page))
            after = await captureDOM(page, 'after', failingLocator || undefined);
        } catch {
          /* non-fatal */
        }
      }
    }

    if (before && after) {
      const changes = getDOMDiff(before, after);
      generateVisualDiff(changes);
    }

    const healedLocator = await selfHeal(page, step, undefined, before);
    if (healedLocator && passesUrlCheck(page, step, action)) {
      const failedLocator = originalLocator(step) || step.label;
      if (failedLocator && !GENERIC_LOCATORS.has(healedLocator.locator)) {
        updateFix(failedLocator, healedLocator.locator, true, action, step.label);
        Logger.info(
          `📚 Healed fix stored: "${failedLocator}" → "${healedLocator.locator}" (confidence: ${healedLocator.confidence})`
        );
      }
      HealingCircuitBreaker.recordSuccess();
      Logger.success(
        `"${step.label}" via self-heal: ${healedLocator.locator} (confidence: ${healedLocator.confidence}, verified: ${healedLocator.verified})`
      );
      if (isDebug) Logger.timeEnd(label);
      return ok(
        'selfheal',
        healedLocator.locator,
        0,
        healedLocator.confidence,
        healedLocator.candidatesTried,
        healedLocator.verified
      );
    }

    layerResults.push({
      layer: 'Layer 4 (self-heal)',
      reason: `exhausted all candidates — DOM snapshot had ${before ? before.split('\n').length + ' lines' : 'no content'}`,
    });

    // ── Layer 5: Ollama — understands the failure and fixes it ──────────────
    // Replaces getLLMLocator — OllamaHealingEngine does everything Layer 5 did
    // (locator suggestion from DOM) PLUS:
    //   • Classifies failure type: locator_stale, element_renamed, element_moved, etc.
    //   • Explains cause and fix in plain English for the test report
    //   • Auto-patches the page object file (opt-in: FW_AUTO_PATCH=true)
    //   • Stores fix in learning-db → Layer 3 (2ms) on next run
    if (DEFAULT_CONFIG.llmEnabled && isPageAlive(page)) {
      try {
        const lastError = layerResults
          .map((r) => r.reason)
          .join(' | ')
          .slice(0, 300);
        const healResult = await ollamaHeal(
          page,
          step.label ?? '',
          action,
          originalLocator(step),
          lastError,
          process.cwd()
        );
        if (healResult?.healed && healResult.locator) {
          const isCodegen = healResult.locator.startsWith('getBy');
          const stepHealed: Step = isCodegen
            ? { ...step, codegenLocator: healResult.locator, locator: undefined }
            : { ...step, locator: healResult.locator, codegenLocator: undefined };
          if ((await routeAction(page, action, stepHealed)) && passesUrlCheck(page, step, action)) {
            const orig = originalLocator(step) || step.label;
            if (orig && !GENERIC_LOCATORS.has(healResult.locator)) {
              updateFix(orig, healResult.locator, true, action, step.label);
              Logger.info(`🧠 Ollama fix stored: "${orig}" → "${healResult.locator}"`);
            }
            Logger.success(
              `"${step.label}" via Ollama Layer 5 [${healResult.failureType}]: ${healResult.locator}`
            );
            Logger.info(`  Cause: ${healResult.cause}`);
            Logger.info(`  Fix:   ${healResult.fix}`);
            if (healResult.patched) Logger.success(`  Auto-patched: ${healResult.patchedFile}`);
            if (isDebug) Logger.timeEnd(label);
            return ok('selfheal', healResult.locator, 0, healResult.confidence);
          }
          layerResults.push({
            layer: 'Layer 5 (Ollama)',
            reason: `suggested "${healResult.locator}" [${healResult.failureType}] but action failed — ${healResult.cause}`,
          });
        } else if (healResult) {
          layerResults.push({
            layer: 'Layer 5 (Ollama)',
            reason: `low confidence (${healResult.confidence}) — ${healResult.cause}`,
          });
        } else {
          layerResults.push({
            layer: 'Layer 5 (Ollama)',
            reason: 'Ollama returned no result — is Ollama running? Run: ollama serve',
          });
        }
      } catch (e) {
        layerResults.push({
          layer: 'Layer 5 (Ollama)',
          reason: `error: ${String(e).slice(0, 80)}`,
        });
      }
    } else if (!DEFAULT_CONFIG.llmEnabled) {
      layerResults.push({
        layer: 'Layer 5 (Ollama)',
        reason: 'disabled — set FW_LLM=true to enable',
      });
    }

    // ── Autonomous Diagnostics — runs when ALL layers fail ──────────────────
    // No LLM, no human — pure DOM analysis + auto-patch
    if (isPageAlive(page)) {
      try {
        const projectRoot = process.cwd();
        const diagnosis = await runAutonomousDiagnostics(
          page,
          step.label ?? '',
          action,
          originalLocator(step),
          projectRoot
        );
        if (diagnosis && diagnosis.suggestedLocator && diagnosis.confidence >= 60) {
          const isCodegen = diagnosis.suggestedLocator.startsWith('getBy');
          const stepDiag: Step = isCodegen
            ? { ...step, codegenLocator: diagnosis.suggestedLocator, locator: undefined }
            : { ...step, locator: diagnosis.suggestedLocator, codegenLocator: undefined };
          if (await routeAction(page, action, stepDiag)) {
            Logger.success(
              `"${step.label}" via AutonomousDiagnostics [${diagnosis.failureType}]: ${diagnosis.suggestedLocator}`
            );
            Logger.info(`  Reasoning: ${diagnosis.reasoning}`);
            if (diagnosis.patched) Logger.success(`  Auto-patched: ${diagnosis.patchedFile}`);
            if (isDebug) Logger.timeEnd(label);
            return ok('selfheal', diagnosis.suggestedLocator, 0, diagnosis.confidence);
          }
          layerResults.push({
            layer: 'Autonomous Diagnostics',
            reason: `suggested "${diagnosis.suggestedLocator}" [${diagnosis.failureType}] but action failed`,
          });
        } else if (diagnosis) {
          layerResults.push({
            layer: 'Autonomous Diagnostics',
            reason: `failure type: ${diagnosis.failureType} — ${diagnosis.reasoning.slice(0, 100)}`,
          });
        }
      } catch (e) {
        Logger.debug(`AutonomousDiagnostics error: ${String(e).slice(0, 80)}`);
      }
    }

    if (isDebug) Logger.timeEnd(label);
    // ── Layer 7: Element Existence Healing ──────────────────────────────────
    // All previous layers failed — element may have been renamed/replaced
    // Try semantic synonyms: Cancel→Reset, Submit→Save, Username→Email, etc.
    if (isPageAlive(page) && step.label) {
      try {
        const layer7 = await ElementExistenceHealer.heal(page, step.label, action);
        if (layer7?.healed && layer7.locator) {
          const isCodegen = layer7.locator.startsWith('getBy');
          const stepL7: Step = isCodegen
            ? { ...step, codegenLocator: layer7.locator, locator: undefined }
            : { ...step, locator: layer7.locator, codegenLocator: undefined };
          if ((await routeAction(page, action, stepL7)) && passesUrlCheck(page, step, action)) {
            const orig = originalLocator(step) || step.label;
            if (orig && !GENERIC_LOCATORS.has(layer7.locator)) {
              updateFix(orig, layer7.locator, true, action, step.label);
              Logger.info(`🔄 Layer 7 fix stored: "${orig}" → "${layer7.locator}"`);
            }
            HealingCircuitBreaker.recordSuccess();
            Logger.success(`"${step.label}" via Layer 7 (semantic): ${layer7.reason}`);
            if (isDebug) Logger.timeEnd(label);
            return ok('selfheal', layer7.locator, 0, layer7.confidence);
          }
          layerResults.push({
            layer: 'Layer 7 (semantic)',
            reason: `found synonym "${layer7.foundLabel}" but action failed`,
          });
        } else {
          layerResults.push({
            layer: 'Layer 7 (semantic)',
            reason: `no semantic synonym found for "${step.label}"`,
          });
        }
      } catch (e) {
        Logger.debug(`Layer 7 error: ${String(e).slice(0, 80)}`);
      }
    }

    // Record failure for FailureReport and CircuitBreaker
    HealingCircuitBreaker.recordFailure('medium');
    recordFailure({
      stepLabel: step.label ?? '',
      action,
      failedLocator: originalLocator(step),
      layersTried: layerResults.map((r) => r.layer),
    });
    return failWithContext(step, action, layerResults);
  } catch (e: unknown) {
    if (isDebug) Logger.timeEnd(label);
    const msg = e instanceof Error ? e.message : String(e);
    // Re-throw structured errors as-is
    if (msg.includes('STEP FAILED')) throw e;
    Logger.error(`runStep failed: "${step.label}"`, msg);
    return failWithContext(step, step.action ?? 'click', [
      ...layerResults,
      { layer: 'Unexpected error', reason: msg.slice(0, 200) },
    ]);
  }
}
