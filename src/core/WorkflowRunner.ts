import { Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { runStepDetailed } from './Runner';
import { Logger } from '../utils/Logger';
import { Step, StepResult, SuiteType } from '../types';
import { DEFAULT_CONFIG } from '../config';
import { waitForPageStable } from '../engine/SmartWait';
import { LabelSuggester } from '../utils/LabelSuggester';
import { analyzeLLMError } from '../engine/LLMLocatorEngine';

const POST_WAIT_ACTIONS = new Set([
  'navigate',
  'reload',
  'goBack',
  'goForward',
  'click',
  'submit',
  'login',
  'logout',
  'search',
]);

export interface WorkflowResult {
  name: string;
  suite: SuiteType;
  passed: number;
  failed: number;
  softFailed: number; // Steps that failed but were marked soft — workflow continued
  skipped: number;
  total: number;
  steps: Array<{
    label: string;
    description: string;
    action: string;
    soft: boolean; // Whether this step was a soft assertion
    result: StepResult;
  }>;
  durationMs: number;
  startedAt: string;
  finishedAt: string;
  environment: string;
  tracePath?: string; // Playwright trace file path — linked in dashboard for debugging
  timedOut: boolean; // True if workflow was stopped by maxWorkflowMs budget
}

export interface WorkflowOptions {
  name?: string;
  suite?: SuiteType;
  stopOnFailure?: boolean;
  screenshotEachStep?: boolean;
  screenshotOnFailure?: boolean;
  waitForStabilityAfterAction?: boolean;
  spinnerLocator?: string;
  workflowRetries?: number;
  /** Hard timeout for the entire workflow in ms — prevents runaway 600s executions */
  maxWorkflowMs?: number;
  /** Path to Playwright trace file — shown in dashboard for one-click debugging */
  tracePath?: string;
}

/** Safely build a screenshot path within the intended directory */
const resolvedScreenshotDir = path.resolve(process.cwd(), 'test-results', 'screenshots');

function safeScreenshotPath(prefix: string): string {
  const worker = (process.env['PLAYWRIGHT_WORKER_INDEX'] ?? '0').replace(/[^0-9]/g, '') || '0';
  const safePrefix = prefix.replace(/[^a-z0-9_-]/gi, '') || 'screenshot';
  // path.basename + explicit traversal check — CWE-22 guard
  const filename = path.basename(`${safePrefix}-w${worker}-${Date.now()}.png`).replace(/\.\./g, '_');
  const resolved = path.resolve(resolvedScreenshotDir, filename);
  if (!resolved.startsWith(resolvedScreenshotDir + path.sep)) {
    return path.join(resolvedScreenshotDir, `screenshot-${Date.now()}.png`);
  }
  return resolved;
}

function describeStep(step: Step): string {
  const action = step.action ?? 'click';
  const target = step.codegenLocator ?? step.locator ?? step.label;

  const descriptions: Record<string, string> = {
    navigate: `Navigate to "${step.expectedUrl}"`,
    reload: 'Reload the current page',
    goBack: 'Navigate back to the previous page',
    goForward: 'Navigate forward to the next page',
    newTab: `Open a new browser tab${step.expectedUrl ? ` at "${step.expectedUrl}"` : ''}`,
    closeTab: 'Close the current browser tab',
    switchTab: `Switch to browser tab #${step.tabIndex ?? 0}`,
    login: 'Log in to the application',
    logout: 'Log out of the application',
    click: `Click on element: ${target}`,
    doubleClick: `Double-click on element: ${target}`,
    rightClick: `Right-click on element: ${target}`,
    hover: `Hover mouse over element: ${target}`,
    dragDrop: `Drag "${target}" and drop onto "${step.dragTo ?? '—'}"`,
    fill: `Type into field: ${target}`,
    clearInput: `Clear the text in field: ${target}`,
    typeSlowly: `Slowly type into: ${target}`,
    keyPress: `Press the "${step.key ?? 'Enter'}" key${target ? ` on ${target}` : ' globally'}`,
    focus: `Move keyboard focus to: ${target}`,
    blur: `Remove focus from: ${target}`,
    selectAll: `Select all text inside: ${target}`,
    submit: `Submit the form${target ? ` via ${target}` : ''}`,
    dropdown: `Select "${step.value ?? step.options?.[0] ?? '—'}" from dropdown: ${target}`,
    multiSelect: `Select multiple options from: ${target}`,
    check: `Check the checkbox: ${target}`,
    uncheck: `Uncheck the checkbox: ${target}`,
    upload: `Upload file to: ${target}`,
    fileDownload: `Download file by clicking: ${target}`,
    search: `Search for "${step.text ?? step.value ?? '—'}"`,
    validation: `Verify element "${target}" contains text "${step.expectedText ?? '—'}"`,
    assertUrl: `Assert page URL contains "${step.expectedUrl ?? '—'}"`,
    assertTitle: `Assert page title contains "${step.expectedTitle ?? '—'}"`,
    assertVisible: `Assert element is visible: ${target}`,
    assertHidden: `Assert element is hidden or absent: ${target}`,
    assertCount: `Assert exactly ${step.expectedCount ?? 0} elements match: ${target}`,
    assertAttribute: `Assert attribute [${step.attributeName ?? '—'}] on: ${target}`,
    wait: `Wait for ${step.waitMs ?? 1000}ms`,
    waitForUrl: `Wait until URL contains "${step.expectedUrl ?? '—'}"`,
    waitForText: `Wait until text "${step.expectedText ?? '—'}" appears on page`,
    waitForNetwork: 'Wait for all network requests to complete',
    screenshot: `Capture screenshot as "${step.screenshotName ?? 'screenshot.png'}"`,
    scroll: `Scroll ${step.scrollDirection ?? 'down'} by ${step.scrollAmount ?? 300}px`,
    scrollTo: `Scroll element into view: ${target}`,
    iframe: `Interact inside iframe with element: ${target}`,
    alert: `Handle browser dialog — action: ${step.alertAction ?? 'accept'}`,
  };

  return step.description ?? descriptions[action] ?? `Perform "${action}" on ${target}`;
}

/**
 * Run multiple independent workflows in parallel across separate pages.
 * Each group of steps runs concurrently — use this for independent test scenarios.
 * All pages must belong to the same browser context.
 *
 * @param pageStepPairs - Array of { page, steps, options } to run concurrently
 * @returns Array of WorkflowResults in the same order as input
 */
export async function runStepsParallel(
  pageStepPairs: Array<{ page: Page; steps: Step[]; options?: WorkflowOptions }>
): Promise<WorkflowResult[]> {
  return Promise.all(
    pageStepPairs.map(({ page, steps, options }) => runSteps(page, steps, options))
  );
}

export async function runSteps(
  page: Page,
  steps: Step[],
  options: WorkflowOptions = {}
): Promise<WorkflowResult> {
  const {
    stopOnFailure = false,
    screenshotEachStep = false,
    screenshotOnFailure = true,
    name = 'Workflow',
    suite = 'general',
    waitForStabilityAfterAction = false,
    spinnerLocator,
    workflowRetries = 0,
    maxWorkflowMs,
    tracePath,
  } = options;

  let lastResult: WorkflowResult | null = null;
  const maxAttempts = workflowRetries + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      Logger.workflowRetry(name, attempt, maxAttempts);
      await page.waitForTimeout(2000);
    }

    lastResult = await executeWorkflow(
      page,
      steps,
      name,
      suite,
      stopOnFailure,
      screenshotEachStep,
      screenshotOnFailure,
      waitForStabilityAfterAction,
      spinnerLocator,
      maxWorkflowMs,
      tracePath
    );

    // Only retry if hard failures exist — soft failures don't trigger retry
    if (lastResult.failed === 0) break;
    if (attempt < maxAttempts) {
      Logger.warn(`Workflow "${name}" failed (${lastResult.failed} steps) — will retry`);
    }
  }

  return lastResult!;
}

async function executeWorkflow(
  page: Page,
  steps: Step[],
  name: string,
  suite: SuiteType,
  stopOnFailure: boolean,
  screenshotEachStep: boolean,
  screenshotOnFailure: boolean,
  waitForStabilityAfterAction: boolean,
  spinnerLocator?: string,
  maxWorkflowMs?: number,
  tracePath?: string
): Promise<WorkflowResult> {
  const startedAt = new Date();
  const budgetEnd = maxWorkflowMs ? startedAt.getTime() + maxWorkflowMs : null;
  const stepResults: WorkflowResult['steps'] = [];
  let skipped = 0;
  let halted = false;
  let timedOut = false;

  Logger.workflowStart(name, suite, steps.length);

  for (const step of steps) {
    // ── Global timeout budget check ─────────────────────────────────────────
    if (budgetEnd && Date.now() > budgetEnd) {
      Logger.warn(`⏱ Workflow "${name}" exceeded maxWorkflowMs budget — stopping`);
      timedOut = true;
      stepResults.push({
        label: step.label,
        description: describeStep(step),
        action: step.action ?? 'click',
        soft: step.soft ?? false,
        result: { success: false, layer: 'none', error: 'Workflow budget exceeded' },
      });
      skipped++;
      continue;
    }

    if (halted) {
      stepResults.push({
        label: step.label,
        description: describeStep(step),
        action: step.action ?? 'click',
        soft: step.soft ?? false,
        result: { success: false, layer: 'none', error: 'Skipped — previous step failed' },
      });
      skipped++;
      continue;
    }

    const stepStart = Date.now();
    let result: StepResult;

    // Auto-fill missing or generic labels from locator
    const resolvedStep = LabelSuggester.autoFill(step);
    if (resolvedStep.label !== step.label) {
      Logger.debug(`Auto-label: "${step.label || '(none)'}" → "${resolvedStep.label}"`);
    }

    const stepNum = stepResults.length;
    Logger.stepStart(resolvedStep.label, stepNum, steps.length);

    try {
      result = await runStepDetailed(page, resolvedStep);
      result.durationMs = Date.now() - stepStart;
    } catch (e) {
      result = {
        success: false,
        layer: 'none',
        error: e instanceof Error ? e.message : String(e),
        durationMs: Date.now() - stepStart,
      };
    }

    // Screenshot on failure
    if (!result.success && screenshotOnFailure) {
      try {
        fs.mkdirSync(resolvedScreenshotDir, { recursive: true });
        const screenshotPath = safeScreenshotPath('fail');
        await page.screenshot({ path: screenshotPath, fullPage: true });
        result.screenshotPath = screenshotPath;
        Logger.debug(`Failure screenshot: ${screenshotPath}`);
      } catch {
        /* non-fatal */
      }
    }

    // Screenshot after every step
    if (screenshotEachStep && result.success) {
      try {
        fs.mkdirSync(resolvedScreenshotDir, { recursive: true });
        const screenshotPath = safeScreenshotPath('step');
        await page.screenshot({ path: screenshotPath });
        result.screenshotPath = screenshotPath;
      } catch {
        /* non-fatal */
      }
    }

    stepResults.push({
      label: resolvedStep.label,
      description: describeStep(resolvedStep),
      action: resolvedStep.action ?? 'click',
      soft: resolvedStep.soft ?? false,
      result,
    });

    if (result.success) {
      Logger.stepPass(resolvedStep.label, result.durationMs ?? 0, resolvedStep.soft);
    } else if (
      result.error === 'Skipped — previous step failed' ||
      result.error === 'Workflow budget exceeded'
    ) {
      Logger.stepSkip(resolvedStep.label);
    } else {
      Logger.stepFail(
        resolvedStep.label,
        result.durationMs ?? 0,
        result.error ?? 'Unknown error',
        resolvedStep.soft
      );
      // LLM Error Analysis -- explain why it failed and suggest fix
      if (DEFAULT_CONFIG.llmEnabled && result.error && !resolvedStep.soft) {
        try {
          const layersTried = 'all layers';
          const analysis = await analyzeLLMError(
            resolvedStep.label,
            resolvedStep.action ?? 'click',
            result.error,
            layersTried,
            { model: DEFAULT_CONFIG.llmModel, timeoutMs: DEFAULT_CONFIG.llmTimeoutMs }
          );
          if (analysis) {
            Logger.warn(`LLM Analysis: ${analysis.cause}`);
            Logger.warn(`LLM Suggestion: ${analysis.suggestion}`);
            if (analysis.fixedLocator) Logger.warn(`LLM Fix: ${analysis.fixedLocator}`);
            result.error =
              result.error +
              `\n  LLM Analysis: ${analysis.cause}\n  Suggestion: ${analysis.suggestion}`;
          }
        } catch {
          /* non-fatal */
        }
      }
    }
    if (
      waitForStabilityAfterAction &&
      result.success &&
      POST_WAIT_ACTIONS.has(resolvedStep.action ?? 'click')
    ) {
      await waitForPageStable(page, spinnerLocator, 5000);
    }

    if (!result.success) {
      if (resolvedStep.soft) {
        Logger.warn(`  ⚠️  Soft assertion failed (continuing): "${resolvedStep.label}"`);
      } else if (stopOnFailure) {
        Logger.warn(`${name} halted at: "${resolvedStep.label}"`);
        halted = true;
      }
    }
  }

  const finishedAt = new Date();
  // Hard failures: non-soft steps that failed
  const passed = stepResults.filter((s) => s.result.success).length;
  const failed = stepResults.filter(
    (s) =>
      !s.result.success &&
      !s.soft &&
      s.result.error !== 'Skipped — previous step failed' &&
      s.result.error !== 'Workflow budget exceeded'
  ).length;
  const softFailed = stepResults.filter((s) => !s.result.success && s.soft).length;
  const durationMs = finishedAt.getTime() - startedAt.getTime();

  Logger.workflowEnd(name, passed, failed, softFailed, skipped, durationMs);

  if (softFailed > 0) {
    stepResults
      .filter((s) => !s.result.success && s.soft)
      .forEach((s) =>
        Logger.warn(`Soft: ${s.label} — ${s.result.error?.split('\n')[0] ?? 'failed'}`)
      );
  }

  return {
    name,
    suite,
    passed,
    failed,
    softFailed,
    skipped,
    total: steps.length,
    steps: stepResults,
    durationMs,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    environment: (process.env['BASE_URL'] || 'local').replace(/:\/\/[^@]*@/, '://***@'),
    tracePath,
    timedOut,
  };
}
