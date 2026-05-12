import * as fs from 'fs';
import * as path from 'path';
import { Logger } from './Logger';
import { WorkflowResult } from '../core/WorkflowRunner';

export interface TestRunReport {
  runId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  environment: string;
  totalWorkflows: number;
  totalSteps: number;
  passed: number;
  failed: number;
  skipped: number;
  passRate: string;
  workflows: Array<{
    name: string;
    result: WorkflowResult;
  }>;
}

/** Escape HTML special characters to prevent XSS */
function esc(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Resolve and validate outputDir stays within cwd.
 * Throws if the resolved path escapes the working directory (CWE-22/23).
 */
function safeOutputDir(outputDir: string): string {
  const resolved = path.resolve(outputDir);
  const cwd = path.resolve(process.cwd());
  if (!resolved.startsWith(cwd + path.sep) && resolved !== cwd) {
    throw new Error(`Path traversal detected in outputDir: "${outputDir}"`);
  }
  return resolved;
}

export class TestReporter {
  private workflows: Array<{ name: string; result: WorkflowResult }> = [];
  private startedAt = new Date();
  private runId = `run-${Date.now()}`;

  record(name: string, result: WorkflowResult): void {
    this.workflows.push({ name, result });
  }

  buildReport(): TestRunReport {
    const finishedAt = new Date();
    const totalSteps = this.workflows.reduce((s, w) => s + w.result.total, 0);
    const passed = this.workflows.reduce((s, w) => s + w.result.passed, 0);
    const failed = this.workflows.reduce((s, w) => s + w.result.failed, 0);
    const skipped = this.workflows.reduce((s, w) => s + w.result.skipped, 0);

    return {
      runId: this.runId,
      startedAt: this.startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - this.startedAt.getTime(),
      environment: process.env['BASE_URL'] || 'unknown',
      totalWorkflows: this.workflows.length,
      totalSteps,
      passed,
      failed,
      skipped,
      passRate: totalSteps > 0 ? `${((passed / totalSteps) * 100).toFixed(1)}%` : 'N/A',
      workflows: this.workflows,
    };
  }

  saveJSON(_outputDir = 'test-results'): string {
    const base = path.resolve('test-results');
    fs.mkdirSync(base, { recursive: true });
    const report = this.buildReport();
    const filePath = path.join(base, Date.now() + '.json');
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(base + path.sep)) throw new Error('Path traversal blocked');
    fs.writeFileSync(resolved, JSON.stringify(report, null, 2), 'utf8');
    Logger.info(`Test report saved: ${resolved}`);
    return resolved;
  }

  saveHTML(_outputDir = 'test-results'): string {
    const base = path.resolve('test-results');
    fs.mkdirSync(base, { recursive: true });
    const report = this.buildReport();
    const filePath = path.join(base, Date.now() + '.html');
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(base + path.sep)) throw new Error('Path traversal blocked');
    const rows = report.workflows
      .flatMap((w) =>
        w.result.steps.map((s) => {
          const icon = s.result.success ? '✅' : '❌';
          const layer = s.result.locatorUsed ? ` <code>${esc(s.result.locatorUsed)}</code>` : '';
          const err = s.result.error
            ? `<br><small style="color:red">${esc(s.result.error)}</small>`
            : '';
          return `<tr><td>${esc(w.name)}</td><td>${icon} ${esc(s.label)}${layer}${err}</td><td>${esc(s.result.layer)}</td></tr>`;
        })
      )
      .join('\n');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Test Report — ${esc(report.runId)}</title>
<style>
  body { font-family: sans-serif; padding: 20px; }
  h1 { color: #333; }
  .summary { display: flex; gap: 20px; margin: 16px 0; }
  .badge { padding: 8px 16px; border-radius: 6px; font-weight: bold; }
  .pass { background: #d4edda; color: #155724; }
  .fail { background: #f8d7da; color: #721c24; }
  .skip { background: #fff3cd; color: #856404; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th { background: #f0f0f0; text-align: left; padding: 8px; }
  td { padding: 8px; border-bottom: 1px solid #eee; }
  code { background: #f4f4f4; padding: 2px 4px; border-radius: 3px; font-size: 12px; }
</style></head><body>
<h1>Test Report</h1>
<p>Run: <code>${esc(report.runId)}</code> | Env: ${esc(report.environment)} | Duration: ${report.durationMs}ms</p>
<div class="summary">
  <span class="badge pass">✅ ${report.passed} Passed</span>
  <span class="badge fail">❌ ${report.failed} Failed</span>
  <span class="badge skip">⏭ ${report.skipped} Skipped</span>
  <span class="badge">Pass rate: ${esc(report.passRate)}</span>
</div>
<table>
  <thead><tr><th>Workflow</th><th>Step</th><th>Layer</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
</body></html>`;

    fs.writeFileSync(resolved, html, 'utf8');
    Logger.info(`HTML report saved: ${resolved}`);
    return resolved;
  }

  printSummary(): void {
    const r = this.buildReport();
    Logger.info(`\n${'─'.repeat(50)}`);
    Logger.info(`Test Run: ${r.runId}`);
    Logger.info(`Workflows: ${r.totalWorkflows} | Steps: ${r.totalSteps}`);
    Logger.info(`✅ ${r.passed} passed | ❌ ${r.failed} failed | ⏭ ${r.skipped} skipped`);
    Logger.info(`Pass rate: ${r.passRate} | Duration: ${r.durationMs}ms`);
    Logger.info('─'.repeat(50));
  }
}
