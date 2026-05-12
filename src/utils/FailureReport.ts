/**
 * FailureReport — Collects failure analysis across the entire test run
 * and prints a structured report showing exactly what changed and how to fix it.
 *
 * Integrates with OllamaHealingEngine to show:
 *   - Which steps failed and why (plain English)
 *   - What the framework tried (all layers)
 *   - Suggested fix with locator
 *   - Whether auto-patch was applied
 *
 * Usage: automatically populated by Runner, printed by FrameworkReporter.onEnd()
 */

import * as fs from 'fs';
import * as path from 'path';
import { Logger } from './Logger';

export interface FailureEntry {
  stepLabel: string;
  action: string;
  failedLocator: string;
  layersTried: string[];
  // Ollama analysis (populated when FW_LLM=true)
  cause?: string;
  fix?: string;
  suggestedLocator?: string;
  failureType?: string;
  confidence?: number;
  patched?: boolean;
  patchedFile?: string;
  // Metadata
  testTitle?: string;
  timestamp: number;
}

// In-memory store — shared across the process (single worker)
const entries: FailureEntry[] = [];

/** Record a step failure — called from Runner when all layers fail */
export function recordFailure(entry: Omit<FailureEntry, 'timestamp'>): void {
  entries.push({ ...entry, timestamp: Date.now() });
}

/** Get all failures recorded this run */
export function getFailures(): FailureEntry[] {
  return [...entries];
}

/** Clear failures — call between test suites if needed */
export function clearFailures(): void {
  entries.length = 0;
}

/** Print the failure report to console — called from FrameworkReporter.onEnd() */
export function printFailureReport(): void {
  if (entries.length === 0) return;

  const withAnalysis = entries.filter((e) => e.cause);
  const withoutAnalysis = entries.filter((e) => !e.cause);

  console.log(`\n${'═'.repeat(62)}`);
  console.log(`  🔍 FAILURE ANALYSIS REPORT — ${entries.length} step(s) failed`);
  console.log(`${'═'.repeat(62)}`);

  // Entries with Ollama analysis
  withAnalysis.forEach((e, i) => {
    console.log(`\n  ${i + 1}. ❌ "${e.stepLabel}"`);
    if (e.failureType) console.log(`     Type:       ${e.failureType}`);
    if (e.cause) console.log(`     Cause:      ${e.cause}`);
    if (e.fix) console.log(`     Fix:        ${e.fix}`);
    if (e.suggestedLocator) {
      console.log(`     Locator:    ${e.suggestedLocator}`);
    }
    if (e.confidence !== undefined) {
      console.log(`     Confidence: ${e.confidence}%`);
    }
    if (e.patched && e.patchedFile) {
      console.log(`     ✅ Auto-patched: ${path.basename(e.patchedFile)}`);
    }
    if (e.layersTried.length > 0) {
      console.log(`     Layers tried: ${e.layersTried.join(' → ')}`);
    }
  });

  // Entries without Ollama analysis (FW_LLM=false or Ollama not running)
  if (withoutAnalysis.length > 0) {
    if (withAnalysis.length > 0) console.log(`\n  ${'─'.repeat(58)}`);
    withoutAnalysis.forEach((e, i) => {
      const idx = withAnalysis.length + i + 1;
      console.log(`\n  ${idx}. ❌ "${e.stepLabel}"`);
      console.log(`     Action:  ${e.action}`);
      if (e.failedLocator) console.log(`     Locator: ${e.failedLocator.slice(0, 80)}`);
      if (e.layersTried.length > 0) {
        console.log(`     Layers tried: ${e.layersTried.join(' → ')}`);
      }
    });

    if (withoutAnalysis.length > 0 && !process.env['FW_LLM']) {
      console.log(`\n  💡 Enable Ollama for root cause analysis:`);
      console.log(`     FW_LLM=true in .env + ollama serve`);
    }
  }

  console.log(`\n${'═'.repeat(62)}`);
}

/** Save failure report to JSON file for CI integration */
/** Safely write a file — validates path stays within allowed base dir */
function safeWrite(filePath: string, data: string, baseDir: string): void {
  const resolved = path.resolve(filePath);
  const base = path.resolve(baseDir);
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    throw new Error(`Path traversal blocked: "${filePath}"`);
  }
  fs.writeFileSync(resolved, data, 'utf8');
}

export function saveFailureReport(_outputDir = 'test-results'): void {
  if (entries.length === 0) return;
  try {
    const base = path.resolve('test-results');
    fs.mkdirSync(base, { recursive: true });
    const file = path.join(base, 'failure-report.json');
    safeWrite(file, JSON.stringify(entries, null, 2), 'test-results');
    Logger.info(`Failure report saved: ${file}`);
  } catch (e) {
    Logger.debug(`FailureReport: could not save — ${String(e).slice(0, 60)}`);
  }
}
