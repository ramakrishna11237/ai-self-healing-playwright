/**
 * OllamaHealingEngine — Intelligent failure analysis and auto-fix using local Ollama.
 *
 * What it does (in order):
 *   1. Captures the live DOM snapshot around the failing element
 *   2. Sends step label + action + error + DOM to Ollama
 *   3. Ollama classifies the failure type and suggests the correct locator
 *   4. Framework tries the suggested locator
 *   5. If it works → stores in learning-db (Layer 3 next run = 2ms)
 *   6. If FW_AUTO_PATCH=true → patches the locator in the page object file
 *   7. Returns a full diagnosis report for the test report
 *
 * Failure types Ollama can detect:
 *   - locator_stale      → element exists but locator no longer matches (renamed attr, class change)
 *   - element_renamed    → button/link text changed ("Save" → "Save Changes")
 *   - element_moved      → element moved to different container/section
 *   - element_missing    → element removed from page entirely
 *   - timing             → element exists but not yet visible/enabled
 *   - dom_restructured   → parent container changed, locator path broken
 *   - wrong_element      → locator matches wrong element (ambiguous selector)
 *   - unknown            → Ollama cannot determine cause
 *
 * SECURITY:
 *   - Calls localhost:11434 ONLY — no external network
 *   - DOM sanitized before sending — strips passwords, tokens, auth values
 *   - Auto-patch protected by path traversal guard
 *   - Disabled by default — enable with FW_LLM=true
 *
 * SETUP:
 *   1. Install Ollama: https://ollama.com
 *   2. Pull a model: ollama pull llama3
 *   3. Enable: FW_LLM=true in .env
 */

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { Page } from '@playwright/test';
import { Logger } from '../utils/Logger';
import { captureDOM } from '../dom/DOMCapture';
import { updateFix } from '../learning/LearningStore';
import { DEFAULT_CONFIG } from '../config';
import { SecurityEnforcer } from '../security/SecurityEnforcer';

// ── Types ─────────────────────────────────────────────────────────────────────

export type HealingFailureType =
  | 'locator_stale'
  | 'element_renamed'
  | 'element_moved'
  | 'element_missing'
  | 'timing'
  | 'dom_restructured'
  | 'wrong_element'
  | 'unknown';

export interface OllamaHealingResult {
  /** Whether Ollama found a fix */
  healed: boolean;
  /** The locator Ollama suggested and the framework verified */
  locator: string;
  /** Ollama's confidence 0–100 */
  confidence: number;
  /** What type of failure Ollama detected */
  failureType: HealingFailureType;
  /** Plain English explanation of what went wrong */
  cause: string;
  /** Plain English explanation of what was fixed */
  fix: string;
  /** Which Ollama model produced this result */
  model: string;
  /** Whether the page object file was auto-patched */
  patched: boolean;
  patchedFile?: string;
}

// ── DOM sanitization ──────────────────────────────────────────────────────────

const SENSITIVE_PATTERNS = [
  /value="[^"]*(?:password|token|secret|auth|key|bearer)[^"]*"/gi,
  /value='[^']*(?:password|token|secret|auth|key|bearer)[^']*'/gi,
  /(?:password|token|secret|apikey|auth_token)\s*=\s*\S+/gi,
  /Bearer\s+\S+/gi,
];

function sanitizeDOM(dom: string): string {
  let safe = dom;
  for (const p of SENSITIVE_PATTERNS) safe = safe.replace(p, '[REDACTED]');
  return safe.slice(0, 3000); // slightly larger than Layer 5 — gives Ollama more context
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildHealingPrompt(
  stepLabel: string,
  action: string,
  failedLocator: string,
  errorMessage: string,
  domSnapshot: string
): string {
  return `You are an expert Playwright test automation engineer.
A test step failed after all automatic recovery layers were exhausted.

FAILED STEP:
  Label:   "${stepLabel}"
  Action:  ${action}
  Locator: ${failedLocator || '(none)'}
  Error:   ${errorMessage.slice(0, 200)}

LIVE DOM SNAPSHOT (partial — around the failing area):
${domSnapshot}

YOUR TASK:
1. Identify WHY the locator failed (failure type)
2. Find the correct element in the DOM snapshot
3. Generate the best Playwright locator for it
4. Explain what changed and how to fix it

FAILURE TYPES:
- locator_stale      → element exists but locator no longer matches
- element_renamed    → button/link text changed
- element_moved      → element moved to different container
- element_missing    → element removed from page
- timing             → element not yet visible/enabled
- dom_restructured   → parent container changed
- wrong_element      → locator matches wrong element
- unknown            → cannot determine

LOCATOR PRIORITY (use highest available):
1. getByRole('button', { name: 'Save' })     ← best
2. getByRole('link', { name: 'Dashboard' })
3. getByLabel('Email address')
4. getByPlaceholder('Enter email')
5. getByText('Submit', { exact: true })
6. [data-testid="submit-btn"]
7. #stable-id                                ← only if not dynamic
8. .css-class                                ← last resort

Reply with ONLY this JSON (no other text, no markdown):
{
  "locator": "getByRole('button', { name: 'Save' })",
  "confidence": 85,
  "failureType": "element_renamed",
  "cause": "The Save button was renamed to Save Changes in the latest release",
  "fix": "Updated locator to match the new button text Save Changes"
}

Rules:
- locator must be valid Playwright syntax
- confidence: 0-100 (how certain you are this is the right element)
- Set confidence < 70 if you cannot find the element in the DOM
- cause: one sentence explaining what changed
- fix: one sentence explaining what was corrected
- Reply with JSON ONLY`;
}

// ── Ollama HTTP call ──────────────────────────────────────────────────────────

async function callOllama(prompt: string, model: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model, prompt, stream: false });
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 11434,
        path: '/api/generate',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk: Buffer) => {
          raw += chunk.toString();
        });
        res.on('end', () => resolve(raw));
      }
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error('Ollama timeout'));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Response parser ───────────────────────────────────────────────────────────

interface OllamaRawResult {
  locator: string;
  confidence: number;
  failureType: HealingFailureType;
  cause: string;
  fix: string;
}

function parseOllamaResponse(raw: string, model: string): OllamaRawResult | null {
  try {
    const outer = JSON.parse(raw) as { response?: string };
    const text = outer.response ?? '';

    // Extract JSON block — handles cases where model adds extra text
    const match = text.match(/\{[\s\S]*?"locator"[\s\S]*?\}/);
    if (!match) {
      Logger.debug(`OllamaHealingEngine: no JSON found in response from ${model}`);
      return null;
    }

    const result = JSON.parse(match[0]) as OllamaRawResult;

    if (!result.locator || typeof result.locator !== 'string' || result.locator.length < 3) {
      Logger.debug(`OllamaHealingEngine: invalid locator in response from ${model}`);
      return null;
    }

    // Block unsafe patterns via SecurityEnforcer
    const scan = SecurityEnforcer.scanLocator(result.locator);
    if (!scan.safe) {
      Logger.warn(
        `OllamaHealingEngine: SecurityEnforcer blocked locator from ${model}: ${scan.risks.join(', ')}`
      );
      return null;
    }

    return {
      locator: result.locator,
      confidence: typeof result.confidence === 'number' ? result.confidence : 0,
      failureType: result.failureType ?? 'unknown',
      cause: result.cause ?? 'Unknown cause',
      fix: result.fix ?? 'Locator updated',
    };
  } catch (e) {
    Logger.debug(`OllamaHealingEngine: parse error — ${String(e).slice(0, 60)}`);
    return null;
  }
}

// ── Auto-patcher ──────────────────────────────────────────────────────────────

function patchPageObject(
  oldLocator: string,
  newLocator: string,
  projectRoot: string
): string | null {
  if (!DEFAULT_CONFIG.autoPatch) return null;
  if (DEFAULT_CONFIG.workerIndex !== 0) return null;
  if (!oldLocator || !newLocator || oldLocator === newLocator) return null;

  const pagesDir = path.resolve(projectRoot, 'src', 'pages');
  if (!fs.existsSync(pagesDir)) return null;

  // Path traversal guard
  const resolvedPages = path.resolve(pagesDir);
  const resolvedRoot = path.resolve(projectRoot);
  if (!resolvedPages.startsWith(resolvedRoot + path.sep)) return null;

  const files = fs
    .readdirSync(resolvedPages, { withFileTypes: true })
    .filter((f) => f.isFile() && f.name.endsWith('.ts'))
    .map((f) => path.resolve(resolvedPages, f.name))
    .filter((f) => f.startsWith(resolvedPages + path.sep));

  for (const file of files) {
    const resolvedFile = path.resolve(file);
    if (!resolvedFile.startsWith(resolvedPages + path.sep)) continue;

    try {
      const content = fs.readFileSync(resolvedFile, 'utf8');
      if (!content.includes(oldLocator)) continue;

      const patched = content.replace(
        new RegExp(oldLocator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
        newLocator
      );
      if (patched === content) continue;

      // CWE-22: tmp filename derived only from already-validated basename — stays inside resolvedPages
      const safeBasename = path.basename(resolvedFile);
      const resolvedTmp = path.resolve(resolvedPages, `${safeBasename}.tmp`);
      if (!resolvedTmp.startsWith(resolvedPages + path.sep)) continue;
      fs.writeFileSync(resolvedTmp, patched, 'utf8');
      try {
        fs.renameSync(resolvedTmp, resolvedFile);
      } catch {
        fs.copyFileSync(resolvedTmp, resolvedFile);
        fs.unlinkSync(resolvedTmp);
      }
      Logger.success(`OllamaHealingEngine: auto-patched ${safeBasename}`);
      Logger.info(`  Old: ${oldLocator}`);
      Logger.info(`  New: ${newLocator}`);
      return resolvedFile;
    } catch (e) {
      Logger.debug(`OllamaHealingEngine: patch error — ${String(e).slice(0, 60)}`);
      try {
        const safeBasename = path.basename(resolvedFile);
        const tmpPath = path.resolve(resolvedPages, `${safeBasename}.tmp`);
        if (tmpPath.startsWith(resolvedPages + path.sep) && fs.existsSync(tmpPath)) {
          fs.unlinkSync(tmpPath);
        }
      } catch {
        /* non-fatal */
      }
    }
  }
  return null;
}

// ── Result cache ──────────────────────────────────────────────────────────────
// Prevents calling Ollama twice for the same failing step in the same run

const healCache = new Map<string, { result: OllamaHealingResult; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;

function getCached(key: string): OllamaHealingResult | null {
  const entry = healCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    healCache.delete(key);
    return null;
  }
  return entry.result;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Ask Ollama to understand a test failure and suggest a fix.
 *
 * Called from Runner after all 7 layers fail.
 * Returns a full diagnosis with the suggested locator, cause, and fix.
 *
 * @param page          - Playwright page (for DOM capture)
 * @param stepLabel     - Step label e.g. "Click Save button"
 * @param action        - Action type e.g. "click"
 * @param failedLocator - The locator that failed
 * @param errorMessage  - The error message from Playwright
 * @param projectRoot   - Project root for auto-patch
 */
export async function ollamaHeal(
  page: Page,
  stepLabel: string,
  action: string,
  failedLocator: string,
  errorMessage: string,
  projectRoot: string
): Promise<OllamaHealingResult | null> {
  if (!DEFAULT_CONFIG.llmEnabled) {
    Logger.debug('OllamaHealingEngine: disabled — set FW_LLM=true to enable');
    return null;
  }

  if (page.isClosed()) return null;

  const cacheKey = `${stepLabel}|${action}|${failedLocator}`;
  const cached = getCached(cacheKey);
  if (cached) {
    Logger.debug(`OllamaHealingEngine: cache hit for "${stepLabel}"`);
    return cached;
  }

  const model = DEFAULT_CONFIG.llmModel;
  const timeoutMs = DEFAULT_CONFIG.llmTimeoutMs;
  const minConf = DEFAULT_CONFIG.llmMinConfidence;

  Logger.info(`🤖 OllamaHealingEngine: analyzing "${stepLabel}" with ${model}`);

  // ── Step 1: Capture DOM ───────────────────────────────────────────────────
  let domSnapshot = '';
  try {
    domSnapshot = (await captureDOM(page, 'ollama-heal', failedLocator || undefined)) ?? '';
  } catch (e) {
    Logger.debug(`OllamaHealingEngine: DOM capture failed — ${String(e).slice(0, 60)}`);
  }

  if (!domSnapshot) {
    Logger.warn(`OllamaHealingEngine: no DOM snapshot available for "${stepLabel}"`);
    return null;
  }

  const safeDom = sanitizeDOM(domSnapshot);
  const prompt = buildHealingPrompt(stepLabel, action, failedLocator, errorMessage, safeDom);

  // ── Step 2: Ask Ollama ────────────────────────────────────────────────────
  let raw: string;
  try {
    raw = await callOllama(prompt, model, timeoutMs);
  } catch (e) {
    Logger.warn(`OllamaHealingEngine: Ollama call failed — ${String(e).slice(0, 80)}`);
    Logger.info('  Is Ollama running? Run: ollama serve');
    Logger.info(`  Is model available? Run: ollama pull ${model}`);
    return null;
  }

  // ── Step 3: Parse response ────────────────────────────────────────────────
  const parsed = parseOllamaResponse(raw, model);
  if (!parsed) {
    Logger.warn(`OllamaHealingEngine: ${model} returned no valid response`);
    return null;
  }

  Logger.info(
    `🤖 OllamaHealingEngine: ${model} suggests "${parsed.locator}" (confidence: ${parsed.confidence})`
  );
  Logger.info(`   Failure type: ${parsed.failureType}`);
  Logger.info(`   Cause: ${parsed.cause}`);
  Logger.info(`   Fix:   ${parsed.fix}`);

  // ── Step 4: Confidence check ──────────────────────────────────────────────
  if (parsed.confidence < minConf) {
    Logger.warn(
      `OllamaHealingEngine: confidence ${parsed.confidence} < threshold ${minConf} — not applying fix`
    );
    return {
      healed: false,
      locator: parsed.locator,
      confidence: parsed.confidence,
      failureType: parsed.failureType,
      cause: parsed.cause,
      fix: parsed.fix,
      model,
      patched: false,
    };
  }

  // ── Step 5: Store fix in learning-db ─────────────────────────────────────
  // Even before trying — so next run uses Layer 3 (2ms) if this works
  const storeKey = failedLocator || stepLabel;
  if (storeKey && !['a', 'button', 'input', 'div', 'span'].includes(storeKey)) {
    updateFix(storeKey, parsed.locator, true, action, stepLabel);
    Logger.info(`📚 OllamaHealingEngine: fix stored in learning-db → Layer 3 next run`);
  }

  // ── Step 6: Auto-patch page object ───────────────────────────────────────
  let patchedFile: string | null = null;
  if (failedLocator && parsed.confidence >= 75) {
    patchedFile = patchPageObject(failedLocator, parsed.locator, projectRoot);
  }

  const result: OllamaHealingResult = {
    healed: true,
    locator: parsed.locator,
    confidence: parsed.confidence,
    failureType: parsed.failureType,
    cause: parsed.cause,
    fix: parsed.fix,
    model,
    patched: !!patchedFile,
    patchedFile: patchedFile ?? undefined,
  };

  // Cache result
  healCache.set(cacheKey, { result, ts: Date.now() });

  return result;
}

/**
 * Check if Ollama is running and the configured model is available.
 * Call this in test setup to give early warning if Ollama is not ready.
 */
export async function checkOllamaHealth(): Promise<{
  running: boolean;
  model: string;
  error?: string;
}> {
  const model = DEFAULT_CONFIG.llmModel;
  try {
    const raw = await callOllama('Reply with: {"ok":true}', model, 5000);
    const parsed = JSON.parse(raw) as { response?: string };
    return { running: !!parsed.response, model };
  } catch (e) {
    return { running: false, model, error: String(e).slice(0, 100) };
  }
}

/** Clear the healing cache — call between test suites if needed */
export function clearHealingCache(): void {
  healCache.clear();
  Logger.debug('OllamaHealingEngine: cache cleared');
}
