/**
 * AutonomousDiagnostics — Self-diagnosis and auto-patch engine.
 *
 * When all 5 recovery layers fail, this engine:
 *   1. Scans the live DOM to find the element by semantic proximity
 *   2. Identifies the best locator from actual HTML attributes
 *   3. Detects the failure type (legacy HTML, strict mode, missing attr, etc.)
 *   4. Generates the correct locator — no external AI, no human needed
 *   5. Falls back to local Ollama (already available) when confidence is low
 *   6. Patches the page object source file automatically (with path traversal guard)
 *   7. Stores the fix in LearningStore for instant Layer 3 recovery next run
 *
 * SECURITY:
 *   - All DOM attribute values sanitized before use in locator strings
 *   - Path traversal protection on auto-patch (resolvedPath.startsWith(pagesDir))
 *   - No external network calls — Ollama runs on localhost:11434 only
 *   - Text content capped at 100 chars — prevents memory issues on large pages
 *   - Static imports only — no dynamic require()
 */

import * as fs from 'fs';
import * as path from 'path';
import { Page } from '@playwright/test';
import { Logger } from '../utils/Logger';
import { updateFix } from '../learning/LearningStore';
import { getLLMLocator } from './LLMLocatorEngine';
import { captureDOM } from '../dom/DOMCapture';
import { DEFAULT_CONFIG } from '../config';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DiagnosisResult {
  failureType: FailureType;
  suggestedLocator: string;
  confidence: number;
  reasoning: string;
  patched: boolean;
  patchedFile?: string;
}

export type FailureType =
  | 'legacy_name_attr'
  | 'legacy_submit_button'
  | 'strict_mode_violation'
  | 'element_renamed'
  | 'element_missing'
  | 'wrong_container'
  | 'dynamic_id'
  | 'unknown';

interface ElementInfo {
  tag: string;
  id: string;
  name: string;
  type: string;
  value: string;
  placeholder: string;
  ariaLabel: string;
  text: string;
  classes: string;
  dataTestId: string;
  title: string;
  container: string;
  matchScore: number;
}

// ── Security: sanitize DOM attribute values ───────────────────────────────────
// Strips characters that could break locator strings or cause injection
function sanitizeAttr(value: string): string {
  if (!value || typeof value !== 'string') return '';
  return (
    value
      .replace(/['"\\`]/g, '') // strip quotes and backticks
      .replace(/[<>]/g, '') // strip HTML angle brackets
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, '') // strip control characters
      .trim()
      .slice(0, 200)
  ); // cap length
}

// ── DOM Scanner ───────────────────────────────────────────────────────────────

async function scanDOMForElement(
  page: Page,
  targetLabel: string,
  action: string
): Promise<ElementInfo[]> {
  if (page.isClosed()) return [];

  // Sanitize the target label before sending to browser context
  const safeLabel = sanitizeAttr(targetLabel).toLowerCase();
  if (!safeLabel) return [];

  try {
    const raw = await page.evaluate(
      ({ label, act }: { label: string; act: string }) => {
        const isInput = ['fill', 'clearInput', 'typeSlowly'].includes(act);
        const isClick = ['click', 'submit', 'login', 'logout'].includes(act);
        const isSelect = ['dropdown', 'multiSelect'].includes(act);

        let selector =
          "input, button, a, select, textarea, [role='button'], [role='link'], [role='textbox'], [role='combobox']";
        if (isInput)
          selector =
            "input:not([type='hidden']):not([type='submit']):not([type='button']), textarea";
        if (isClick)
          selector =
            "button, a, input[type='submit'], input[type='button'], [role='button'], [role='link']";
        if (isSelect) selector = "select, [role='combobox'], [role='listbox']";

        const elements = Array.from(document.querySelectorAll<HTMLElement>(selector));

        function getContainer(el: HTMLElement): string {
          const containers = ["[role='dialog']", 'form', 'main', 'section', '#content', '.content'];
          for (const sel of containers) {
            if (el.closest(sel)) return sel;
          }
          return 'body';
        }

        function scoreMatch(el: HTMLElement): number {
          let score = 0;
          const attrs = [
            el.getAttribute('name') ?? '',
            el.getAttribute('placeholder') ?? '',
            el.getAttribute('aria-label') ?? '',
            el.getAttribute('value') ?? '',
            el.getAttribute('title') ?? '',
            el.getAttribute('id') ?? '',
            // Cap textContent to 100 chars — prevents memory issues on large nodes
            (el.textContent ?? '').trim().slice(0, 100),
          ].map((v) => v.toLowerCase().trim());

          for (const attr of attrs) {
            if (!attr) continue;
            if (attr === label) score += 100;
            else if (attr.includes(label)) score += 60;
            else if (label.includes(attr) && attr.length > 2) score += 40;
          }
          return score;
        }

        return elements
          .map((el) => ({
            tag: el.tagName.toLowerCase(),
            id: el.id ?? '',
            name: el.getAttribute('name') ?? '',
            type: el.getAttribute('type') ?? '',
            value: el.getAttribute('value') ?? '',
            placeholder: el.getAttribute('placeholder') ?? '',
            ariaLabel: el.getAttribute('aria-label') ?? '',
            // Cap text at 100 chars
            text: (el.textContent ?? '').trim().slice(0, 100),
            classes: el.className ?? '',
            dataTestId: el.getAttribute('data-testid') ?? '',
            title: el.getAttribute('title') ?? '',
            container: getContainer(el),
            matchScore: scoreMatch(el),
          }))
          .filter((e) => e.matchScore > 0)
          .sort((a, b) => b.matchScore - a.matchScore)
          .slice(0, 10);
      },
      { label: safeLabel, act: action }
    );

    // Sanitize all returned attribute values before using in locators
    return raw.map((el) => ({
      ...el,
      id: sanitizeAttr(el.id),
      name: sanitizeAttr(el.name),
      value: sanitizeAttr(el.value),
      placeholder: sanitizeAttr(el.placeholder),
      ariaLabel: sanitizeAttr(el.ariaLabel),
      text: sanitizeAttr(el.text),
      dataTestId: sanitizeAttr(el.dataTestId),
      title: sanitizeAttr(el.title),
    }));
  } catch (e) {
    Logger.debug(`AutonomousDiagnostics: DOM scan failed — ${String(e).slice(0, 80)}`);
    return [];
  }
}

// ── Locator Generator ─────────────────────────────────────────────────────────

function generateLocator(
  el: ElementInfo,
  action: string
): { locator: string; confidence: number; type: FailureType } {
  // All values already sanitized by scanDOMForElement

  if (el.dataTestId) {
    return { locator: `getByTestId('${el.dataTestId}')`, confidence: 100, type: 'unknown' };
  }

  if (el.ariaLabel) {
    const role = inferRole(el, action);
    if (role)
      return {
        locator: `getByRole('${role}', { name: '${el.ariaLabel}' })`,
        confidence: 90,
        type: 'unknown',
      };
    return { locator: `[aria-label="${el.ariaLabel}"]`, confidence: 88, type: 'unknown' };
  }

  if (el.placeholder) {
    return { locator: `getByPlaceholder('${el.placeholder}')`, confidence: 80, type: 'unknown' };
  }

  // name attribute — covers legacy JSP/HTML sites (ParaBank, old enterprise apps)
  if (el.name) {
    if (el.tag === 'input' && el.type === 'submit') {
      return {
        locator: `input[type="submit"][name="${el.name}"]`,
        confidence: 78,
        type: 'legacy_submit_button',
      };
    }
    return { locator: `[name="${el.name}"]`, confidence: 75, type: 'legacy_name_attr' };
  }

  // legacy submit button — input[type=submit][value=x]
  if (el.tag === 'input' && el.type === 'submit' && el.value) {
    return {
      locator: `input[type="submit"][value="${el.value}"]`,
      confidence: 75,
      type: 'legacy_submit_button',
    };
  }

  // id — only if not dynamic
  if (el.id && !isDynamicId(el.id)) {
    return { locator: `#${el.id}`, confidence: 72, type: 'unknown' };
  }

  // text content
  if (el.text && el.text.length > 0 && el.text.length < 50) {
    const role = inferRole(el, action);
    if (role)
      return {
        locator: `getByRole('${role}', { name: '${el.text}' })`,
        confidence: 65,
        type: 'element_renamed',
      };
    return {
      locator: `getByText('${el.text}', { exact: true })`,
      confidence: 60,
      type: 'element_renamed',
    };
  }

  if (el.title) {
    return { locator: `[title="${el.title}"]`, confidence: 55, type: 'unknown' };
  }

  return { locator: el.tag, confidence: 20, type: 'unknown' };
}

function inferRole(el: ElementInfo, _action: string): string | null {
  if (el.tag === 'button' || el.type === 'button' || el.type === 'submit') return 'button';
  if (el.tag === 'a') return 'link';
  if (el.tag === 'input' && ['text', 'email', 'tel', 'search', 'url', ''].includes(el.type))
    return 'textbox';
  if (el.tag === 'select') return 'combobox';
  if (el.tag === 'textarea') return 'textbox';
  if (el.tag === 'input' && el.type === 'checkbox') return 'checkbox';
  if (el.tag === 'input' && el.type === 'radio') return 'radio';
  return null;
}

function isDynamicId(id: string): boolean {
  return /\d{8,}/.test(id) || /[0-9a-f]{8}-[0-9a-f]{4}/.test(id) || /[-_][0-9a-f]{6,}$/.test(id);
}

// ── Strict Mode Resolver ──────────────────────────────────────────────────────

async function resolveStrictModeViolation(page: Page, locator: string): Promise<string | null> {
  try {
    const count = await page.locator(locator).count();
    if (count <= 1) return null;

    Logger.info(`AutonomousDiagnostics: strict mode — ${count} elements match "${locator}"`);

    const PRIORITY_CONTAINERS = [
      "[role='dialog']",
      "[role='alertdialog']",
      'form',
      'main',
      "[role='main']",
      '#content',
      '.content',
      'article',
      'section',
    ];

    for (const container of PRIORITY_CONTAINERS) {
      try {
        const scoped = page.locator(container).locator(locator);
        const scopedCount = await scoped.count();
        if (scopedCount === 1) {
          Logger.info(`AutonomousDiagnostics: scoped to "${container}" — unique match`);
          return `${container} >> ${locator}`;
        }
      } catch {
        continue;
      }
    }

    return `${locator} >> nth=0`;
  } catch {
    return null;
  }
}

// ── Auto-Patcher (opt-in, single-worker only, path traversal protected) ─────

function autoPatchPageObject(
  oldLocator: string,
  newLocator: string,
  projectRoot: string
): string | null {
  // Guard 1: opt-in only — FW_AUTO_PATCH=true required
  if (!DEFAULT_CONFIG.autoPatch) {
    Logger.debug('AutonomousDiagnostics: auto-patch disabled (set FW_AUTO_PATCH=true to enable)');
    return null;
  }

  // Guard 2: only run on worker 0 — prevents parallel file corruption in CI
  if (DEFAULT_CONFIG.workerIndex !== 0) {
    Logger.debug(
      `AutonomousDiagnostics: auto-patch skipped on worker ${DEFAULT_CONFIG.workerIndex} (only runs on worker 0)`
    );
    return null;
  }

  // Security: resolve and validate pagesDir is within projectRoot
  const pagesDir = path.resolve(projectRoot, 'src', 'pages');
  const resolvedPagesDir = path.resolve(pagesDir);
  const resolvedProjectRoot = path.resolve(projectRoot);

  // Ensure pagesDir is inside projectRoot — prevents path traversal
  if (!resolvedPagesDir.startsWith(resolvedProjectRoot + path.sep)) {
    Logger.warn('AutonomousDiagnostics: auto-patch blocked — pagesDir outside projectRoot');
    return null;
  }

  if (!fs.existsSync(resolvedPagesDir)) return null;

  const tsFiles = fs
    .readdirSync(resolvedPagesDir)
    .filter((f) => f.endsWith('.ts') && !f.includes('..'))
    .map((f) => path.join(resolvedPagesDir, f))
    .filter((f) => {
      // Security: verify each file is inside pagesDir before adding to list
      const resolvedFile = path.resolve(f);
      return resolvedFile.startsWith(resolvedPagesDir + path.sep);
    });

  for (const file of tsFiles) {
    try {
      const resolvedFile = path.resolve(file);
      if (!resolvedFile.startsWith(resolvedPagesDir + path.sep)) continue;
      const content = fs.readFileSync(resolvedFile, 'utf8');
      if (!content.includes(oldLocator)) continue;

      const patched = content.replace(new RegExp(escapeRegex(oldLocator), 'g'), newLocator);
      if (patched === content) continue;

      // Atomic write — tmp filename derived only from the already-validated resolvedFile
      const safeBasename = path.basename(resolvedFile);
      const resolvedTmp = path.resolve(resolvedPagesDir, `${safeBasename}.tmp`);
      if (!resolvedTmp.startsWith(resolvedPagesDir + path.sep)) continue;
      fs.writeFileSync(resolvedTmp, patched, 'utf8');

      try {
        fs.renameSync(resolvedTmp, resolvedFile);
      } catch {
        fs.copyFileSync(resolvedTmp, resolvedFile);
        fs.unlinkSync(resolvedTmp);
      }
      Logger.success(`AutonomousDiagnostics: auto-patched "${safeBasename}"`);
      Logger.info(`  Old: ${oldLocator}`);
      Logger.info(`  New: ${newLocator}`);
      return resolvedFile;
    } catch (e) {
      Logger.debug(`AutonomousDiagnostics: patch failed — ${String(e).slice(0, 60)}`);
      // Clean up tmp if it exists — use only safe basename
      try {
        const safeBasename = path.basename(file);
        const tmpPath = path.resolve(resolvedPagesDir, `${safeBasename}.tmp`);
        if (tmpPath.startsWith(resolvedPagesDir + path.sep) && fs.existsSync(tmpPath)) {
          fs.unlinkSync(tmpPath);
        }
      } catch {
        /* non-fatal */
      }
    }
  }

  return null;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Main Entry Point ──────────────────────────────────────────────────────────

export async function runAutonomousDiagnostics(
  page: Page,
  stepLabel: string,
  action: string,
  failedLocator: string,
  projectRoot: string
): Promise<DiagnosisResult | null> {
  if (page.isClosed()) return null;

  Logger.info(`🔬 AutonomousDiagnostics: analyzing "${stepLabel}"`);

  // ── Step 1: Strict mode violation check ─────────────────────────────────
  if (failedLocator && !failedLocator.startsWith('getBy')) {
    try {
      const count = await page.locator(failedLocator).count();
      if (count > 1) {
        const scoped = await resolveStrictModeViolation(page, failedLocator);
        if (scoped) {
          const patched = autoPatchPageObject(failedLocator, scoped, projectRoot);
          updateFix(failedLocator, scoped, true, action, stepLabel);
          return {
            failureType: 'strict_mode_violation',
            suggestedLocator: scoped,
            confidence: 85,
            reasoning: `"${failedLocator}" matched ${count} elements — scoped to unique container`,
            patched: !!patched,
            patchedFile: patched ?? undefined,
          };
        }
      }
    } catch {
      /* not strict mode */
    }
  }

  // ── Step 2: DOM scan ─────────────────────────────────────────────────────
  const elements = await scanDOMForElement(page, stepLabel, action);

  if (elements.length === 0) {
    Logger.warn(`AutonomousDiagnostics: no DOM match for "${stepLabel}"`);

    // ── Step 2a: Fall back to Ollama when DOM scan finds nothing ────────────
    // Ollama is already available (localhost:11434) — use it for hard cases
    if (DEFAULT_CONFIG.llmEnabled) {
      Logger.info(`AutonomousDiagnostics: handing off to Ollama for "${stepLabel}"`);
      try {
        const domSnapshot = await captureDOM(page, 'diag', failedLocator || undefined);
        if (domSnapshot) {
          const llmResult = await getLLMLocator(stepLabel, action, domSnapshot, {
            model: DEFAULT_CONFIG.llmModel,
            timeoutMs: DEFAULT_CONFIG.llmTimeoutMs,
            minConfidence: DEFAULT_CONFIG.llmMinConfidence,
          });
          if (llmResult) {
            if (failedLocator) updateFix(failedLocator, llmResult.locator, true, action, stepLabel);
            return {
              failureType: 'element_missing',
              suggestedLocator: llmResult.locator,
              confidence: llmResult.confidence,
              reasoning: `Ollama (${llmResult.model}): ${llmResult.reasoning}`,
              patched: false,
            };
          }
        }
      } catch (e) {
        Logger.debug(`AutonomousDiagnostics: Ollama fallback failed — ${String(e).slice(0, 60)}`);
      }
    }

    return {
      failureType: 'element_missing',
      suggestedLocator: '',
      confidence: 0,
      reasoning: 'No elements found in DOM matching the step label',
      patched: false,
    };
  }

  // ── Step 3: Generate locator from best DOM match ─────────────────────────
  const best = elements[0];
  Logger.info(
    `AutonomousDiagnostics: best match <${best.tag}> score=${best.matchScore} in ${best.container}`
  );

  const { locator, confidence, type } = generateLocator(best, action);
  Logger.info(
    `AutonomousDiagnostics: generated "${locator}" (confidence: ${confidence}, type: ${type})`
  );

  // ── Step 3a: Low confidence — ask Ollama to confirm or improve ───────────
  // DOM scan found something but isn't sure — Ollama validates with full context
  if (confidence < 70 && DEFAULT_CONFIG.llmEnabled) {
    Logger.info(`AutonomousDiagnostics: confidence ${confidence} < 70 — asking Ollama to confirm`);
    try {
      const domSnapshot = await captureDOM(page, 'diag-confirm', failedLocator || undefined);
      if (domSnapshot) {
        const llmResult = await getLLMLocator(stepLabel, action, domSnapshot, {
          model: DEFAULT_CONFIG.llmModel,
          timeoutMs: DEFAULT_CONFIG.llmTimeoutMs,
          minConfidence: DEFAULT_CONFIG.llmMinConfidence,
        });
        if (llmResult && llmResult.confidence >= 70) {
          Logger.info(
            `AutonomousDiagnostics: Ollama confirmed "${llmResult.locator}" (confidence: ${llmResult.confidence})`
          );
          if (failedLocator) updateFix(failedLocator, llmResult.locator, true, action, stepLabel);
          const patched = autoPatchPageObject(failedLocator, llmResult.locator, projectRoot);
          return {
            failureType: type,
            suggestedLocator: llmResult.locator,
            confidence: llmResult.confidence,
            reasoning: `DOM scan (${type}) + Ollama confirmed: ${llmResult.reasoning}`,
            patched: !!patched,
            patchedFile: patched ?? undefined,
          };
        }
      }
    } catch (e) {
      Logger.debug(`AutonomousDiagnostics: Ollama confirm failed — ${String(e).slice(0, 60)}`);
    }
  }

  // ── Step 4: Store fix in LearningStore ───────────────────────────────────
  if (failedLocator && locator && confidence >= 60) {
    updateFix(failedLocator, locator, true, action, stepLabel);
    Logger.info(`AutonomousDiagnostics: fix stored → Layer 3 (2ms) next run`);
  }

  // ── Step 5: Auto-patch page object file ──────────────────────────────────
  let patchedFile: string | null = null;
  if (failedLocator && locator && confidence >= 70) {
    patchedFile = autoPatchPageObject(failedLocator, locator, projectRoot);
  }

  Logger.success(
    `🔬 AutonomousDiagnostics complete — type: ${type}, confidence: ${confidence}, patched: ${!!patchedFile}`
  );

  return {
    failureType: type,
    suggestedLocator: locator,
    confidence,
    reasoning: buildReasoning(type, best, failedLocator, locator),
    patched: !!patchedFile,
    patchedFile: patchedFile ?? undefined,
  };
}

function buildReasoning(
  type: FailureType,
  el: ElementInfo,
  oldLocator: string,
  newLocator: string
): string {
  switch (type) {
    case 'legacy_name_attr':
      return `Legacy HTML — element uses name="${el.name}" (no aria-label/placeholder). Fixed: "${oldLocator}" → "${newLocator}"`;
    case 'legacy_submit_button':
      return `Legacy submit button — input[type=submit][value="${el.value}"]. Fixed: "${oldLocator}" → "${newLocator}"`;
    case 'strict_mode_violation':
      return `Multiple elements matched "${oldLocator}" — scoped to unique container: "${newLocator}"`;
    case 'element_renamed':
      return `Element text changed to "${el.text || el.ariaLabel}". Updated: "${oldLocator}" → "${newLocator}"`;
    default:
      return `DOM scan matched <${el.tag}> (score: ${el.matchScore}). Generated: "${newLocator}"`;
  }
}
