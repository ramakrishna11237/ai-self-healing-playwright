/**
 * LLMLocatorEngine — Layer 5 recovery using local Ollama LLM.
 *
 * ENHANCEMENTS:
 *  1. Confidence threshold  — only accept locators with confidence >= FW_LLM_MIN_CONFIDENCE
 *  2. Multiple model fallback — tries FW_LLM_MODEL, then FW_LLM_FALLBACK_MODEL if first fails
 *  3. Prompt caching        — same step label reuses last LLM response (no duplicate calls)
 *
 * SECURITY:
 *  - Calls localhost:11434 ONLY — no external network requests
 *  - DOM is sanitized before sending — strips passwords, tokens, auth values
 *  - Disabled by default — enable with FW_LLM=true in .env
 *  - Max 2000 chars of DOM sent — prevents large data exposure
 *
 * SETUP:
 *  1. Install Ollama: https://ollama.com
 *  2. Pull models: ollama pull llama3 && ollama pull codellama
 *  3. Enable in .env: FW_LLM=true
 */

import * as http from 'http';
import { Logger } from '../utils/Logger';

export interface LLMLocatorResult {
  locator: string;
  confidence: number;
  reasoning: string;
  model: string; // which model produced this result
}

// ── Confidence threshold ──────────────────────────────────────────────────────
// Only accept LLM locators with confidence >= this value
// Prevents low-confidence hallucinations from being stored in learning-db
const DEFAULT_MIN_CONFIDENCE = parseInt(process.env['FW_LLM_MIN_CONFIDENCE'] ?? '70', 10);

// ── Model fallback chain ──────────────────────────────────────────────────────
// Primary model tried first, fallback tried if primary fails or returns low confidence
function getModelChain(): string[] {
  const primary = process.env['FW_LLM_MODEL'] ?? 'llama3';
  const fallback = process.env['FW_LLM_FALLBACK_MODEL'] ?? 'codellama';
  // Deduplicate in case both are set to same model
  return [...new Set([primary, fallback])];
}

// ── Prompt cache ──────────────────────────────────────────────────────────────
// Key: stepLabel|action — Value: { result, timestamp }
// Prevents calling LLM twice for the same failing step in the same run
const promptCache = new Map<string, { result: LLMLocatorResult; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCached(stepLabel: string, action: string): LLMLocatorResult | null {
  const key = `${stepLabel}|${action}`;
  const cached = promptCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.ts > CACHE_TTL_MS) {
    promptCache.delete(key);
    return null;
  }
  Logger.debug(`LLM Layer 5: cache hit for "${stepLabel}"`);
  return cached.result;
}

function setCache(stepLabel: string, action: string, result: LLMLocatorResult): void {
  const key = `${stepLabel}|${action}`;
  promptCache.set(key, { result, ts: Date.now() });
  // Cap cache size
  if (promptCache.size > 200) {
    const oldest = [...promptCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) promptCache.delete(oldest[0]);
  }
}

// ── DOM sanitization ──────────────────────────────────────────────────────────
const SENSITIVE_PATTERNS = [
  /value="[^"]*(?:password|token|secret|auth|key|bearer)[^"]*"/gi,
  /value='[^']*(?:password|token|secret|auth|key|bearer)[^']*'/gi,
  /(?:password|token|secret|apikey|auth_token)\s*=\s*\S+/gi,
  /Bearer\s+\S+/gi,
];

function sanitizeForLLM(dom: string): string {
  let safe = dom;
  for (const pattern of SENSITIVE_PATTERNS) {
    safe = safe.replace(pattern, '[REDACTED]');
  }
  return safe.slice(0, 2000);
}

// ── Prompt builder ────────────────────────────────────────────────────────────
function buildPrompt(stepLabel: string, action: string, domSnapshot: string): string {
  return `You are a Playwright test automation expert. A test step failed to find an element.

Step label: "${stepLabel}"
Action: ${action}
DOM snapshot (partial):
${domSnapshot}

Generate the best Playwright locator for this element. Reply with ONLY a JSON object:
{"locator": "getByRole('button', { name: 'Save' })", "confidence": 85, "reasoning": "Found Save button in form"}

Rules:
- Prefer getByRole > getByLabel > getByText > CSS selector
- locator must be valid Playwright syntax
- confidence: 0-100 (how certain you are this is the right element)
- Set confidence < 70 if you are not sure
- reasoning: one short sentence explaining your choice
- Reply with JSON only, no other text`;
}

// ── Ollama HTTP call ──────────────────────────────────────────────────────────
async function callOllama(prompt: string, model: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model, prompt, stream: false });
    const options = {
      hostname: '127.0.0.1', // localhost only — never external
      port: 11434,
      path: '/api/generate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk: Buffer) => {
        raw += chunk.toString();
      });
      res.on('end', () => resolve(raw));
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error('Ollama timeout'));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Parse and validate LLM response ──────────────────────────────────────────
function parseResponse(raw: string, model: string): LLMLocatorResult | null {
  try {
    const parsed = JSON.parse(raw) as { response?: string };
    const responseText = parsed.response ?? '';

    const jsonMatch = responseText.match(/\{[^{}]*"locator"[^{}]*\}/s);
    if (!jsonMatch) return null;

    const result = JSON.parse(jsonMatch[0]) as LLMLocatorResult;

    if (!result.locator || typeof result.locator !== 'string' || result.locator.length < 3)
      return null;

    // Block unsafe locator patterns
    const blocked = /require\s*\(|process\.|eval\s*\(|Function\s*\(/;
    if (blocked.test(result.locator)) {
      Logger.warn(`LLM Layer 5: blocked unsafe locator from model ${model}`);
      return null;
    }

    return { ...result, model };
  } catch {
    return null;
  }
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function getLLMLocator(
  stepLabel: string,
  action: string,
  domSnapshot: string,
  options: { model?: string; timeoutMs?: number; minConfidence?: number } = {}
): Promise<LLMLocatorResult | null> {
  const timeoutMs = options.timeoutMs ?? parseInt(process.env['FW_LLM_TIMEOUT_MS'] ?? '8000', 10);
  const minConfidence = options.minConfidence ?? DEFAULT_MIN_CONFIDENCE;

  // ── Check prompt cache first ────────────────────────────────────────────────
  const cached = getCached(stepLabel, action);
  if (cached) return cached;

  const safeDom = sanitizeForLLM(domSnapshot);
  const prompt = buildPrompt(stepLabel, action, safeDom);

  // ── Try model chain: primary → fallback ─────────────────────────────────────
  const models = options.model ? [options.model] : getModelChain();

  for (const model of models) {
    try {
      Logger.info(`LLM Layer 5: asking ${model} for "${stepLabel}"`);
      const raw = await callOllama(prompt, model, timeoutMs);
      const result = parseResponse(raw, model);

      if (!result) {
        Logger.warn(`LLM Layer 5: ${model} returned no valid JSON — trying next model`);
        continue;
      }

      // ── Confidence threshold check ────────────────────────────────────────
      if (result.confidence < minConfidence) {
        Logger.warn(
          `LLM Layer 5: ${model} confidence ${result.confidence} < threshold ${minConfidence} — trying next model`
        );
        continue;
      }

      Logger.info(`LLM Layer 5: ${model} → "${result.locator}" (confidence: ${result.confidence})`);
      Logger.debug(`LLM reasoning: ${result.reasoning}`);

      // ── Cache the result ──────────────────────────────────────────────────
      setCache(stepLabel, action, result);
      return result;
    } catch (e) {
      Logger.warn(`LLM Layer 5: ${model} failed — ${String(e).slice(0, 80)}`);
      if (model === models[models.length - 1]) {
        Logger.debug('All models failed. Is Ollama running? Run: ollama serve');
      } else {
        Logger.info(`LLM Layer 5: trying fallback model...`);
      }
    }
  }

  return null;
}

/** Clear the prompt cache — call between test runs if needed */
export function clearLLMCache(): void {
  promptCache.clear();
  Logger.debug('LLM prompt cache cleared');
}

/** Check if Ollama is running */
export async function isOllamaAvailable(model?: string): Promise<boolean> {
  try {
    const result = await callOllama('ping', model ?? 'llama3', 2000);
    return result.length > 0;
  } catch {
    return false;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// LAYER 3.5 — LLM prediction from label only (no DOM needed)
// Called BEFORE DOM capture — saves ~50ms when LLM can predict from label alone
// ════════════════════════════════════════════════════════════════════════════

function buildLabelOnlyPrompt(stepLabel: string, action: string): string {
  return `You are a Playwright test automation expert.
A test step failed. Predict the best Playwright locator from the step label alone.

Step label: "${stepLabel}"
Action: ${action}

Reply with ONLY a JSON object:
{"locator": "getByRole('button', { name: 'Save' })", "confidence": 75, "reasoning": "Label says Save button"}

Rules:
- Prefer getByRole > getByLabel > getByText
- Only set confidence >= 70 if you are very sure from the label alone
- Set confidence < 70 if the label is ambiguous or unclear
- Reply with JSON only, no other text`;
}

/**
 * Layer 3.5 — Predict locator from step label alone, without DOM snapshot.
 * Faster than Layer 5 (no DOM capture needed).
 * Only used when confidence >= threshold — otherwise falls through to Layer 4.
 */
export async function getLLMLocatorFromLabel(
  stepLabel: string,
  action: string,
  options: { model?: string; timeoutMs?: number; minConfidence?: number } = {}
): Promise<LLMLocatorResult | null> {
  const timeoutMs = options.timeoutMs ?? parseInt(process.env['FW_LLM_TIMEOUT_MS'] ?? '8000', 10);
  const minConfidence = options.minConfidence ?? DEFAULT_MIN_CONFIDENCE;

  // Check cache first
  const cacheKey = `label35|${stepLabel}|${action}`;
  const cached = promptCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    Logger.debug(`LLM Layer 3.5: cache hit for "${stepLabel}"`);
    return cached.result;
  }

  const prompt = buildLabelOnlyPrompt(stepLabel, action);
  const models = options.model ? [options.model] : getModelChain();

  for (const model of models) {
    try {
      Logger.info(`LLM Layer 3.5: predicting locator for "${stepLabel}" (no DOM)`);
      const raw = await callOllama(prompt, model, timeoutMs);
      const result = parseResponse(raw, model);

      if (!result) continue;

      if (result.confidence < minConfidence) {
        Logger.debug(
          `LLM Layer 3.5: confidence ${result.confidence} too low — will use DOM in Layer 4/5`
        );
        return null; // Don't try fallback — fall through to DOM capture
      }

      Logger.info(
        `LLM Layer 3.5: predicted "${result.locator}" (confidence: ${result.confidence})`
      );
      promptCache.set(cacheKey, { result, ts: Date.now() });
      return result;
    } catch (e) {
      Logger.debug(`LLM Layer 3.5: ${model} failed — ${String(e).slice(0, 60)}`);
    }
  }

  return null;
}

// ════════════════════════════════════════════════════════════════════════════
// PHASE 2 — LLM Error Analysis
// Called after test failure — explains WHY it failed and HOW to fix it
// ════════════════════════════════════════════════════════════════════════════

export interface LLMErrorAnalysis {
  cause: string; // Why the step failed
  suggestion: string; // How to fix it
  fixedLocator?: string; // Suggested new locator if applicable
  severity: 'locator_changed' | 'element_missing' | 'timing' | 'unknown';
}

function buildErrorAnalysisPrompt(
  stepLabel: string,
  action: string,
  error: string,
  layersTried: string
): string {
  return `You are a Playwright test automation expert analyzing a test failure.

Failed step: "${stepLabel}"
Action: ${action}
Error: ${error.slice(0, 300)}
Layers tried: ${layersTried}

Analyze why this step failed and how to fix it.
Reply with ONLY a JSON object:
{
  "cause": "The Save button was renamed to Submit Changes in the latest release",
  "suggestion": "Update locator to getByRole('button', { name: 'Submit Changes' })",
  "fixedLocator": "getByRole('button', { name: 'Submit Changes' })",
  "severity": "locator_changed"
}

Severity options: locator_changed | element_missing | timing | unknown
Reply with JSON only, no other text`;
}

/**
 * Phase 2 — Analyze a test failure and suggest a fix in plain English.
 * Called from WorkflowRunner after a step fails all recovery layers.
 * Result shown in test report for developer to act on.
 */
export async function analyzeLLMError(
  stepLabel: string,
  action: string,
  error: string,
  layersTried: string,
  options: { model?: string; timeoutMs?: number } = {}
): Promise<LLMErrorAnalysis | null> {
  const timeoutMs = options.timeoutMs ?? parseInt(process.env['FW_LLM_TIMEOUT_MS'] ?? '8000', 10);
  const models = options.model ? [options.model] : getModelChain();

  const prompt = buildErrorAnalysisPrompt(stepLabel, action, error, layersTried);

  for (const model of models) {
    try {
      Logger.info(`LLM Error Analysis: analyzing failure for "${stepLabel}"`);
      const raw = await callOllama(prompt, model, timeoutMs);
      const parsed = JSON.parse(raw) as { response?: string };
      const text = parsed.response ?? '';

      const jsonMatch = text.match(/\{[^{}]*"cause"[^{}]*\}/s);
      if (!jsonMatch) continue;

      const result = JSON.parse(jsonMatch[0]) as LLMErrorAnalysis;
      if (!result.cause || !result.suggestion) continue;

      // Validate fixedLocator if present
      if (result.fixedLocator) {
        const blocked = /require\s*\(|process\.|eval\s*\(|Function\s*\(/;
        if (blocked.test(result.fixedLocator)) result.fixedLocator = undefined;
      }

      Logger.info(`LLM Analysis: ${result.cause}`);
      Logger.info(`LLM Suggestion: ${result.suggestion}`);
      return result;
    } catch (e) {
      Logger.debug(`LLM Error Analysis: ${model} failed — ${String(e).slice(0, 60)}`);
    }
  }

  return null;
}
