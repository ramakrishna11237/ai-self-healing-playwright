import type {
  Reporter,
  TestCase,
  TestResult,
  TestStep,
  FullConfig,
  Suite,
  FullResult,
} from '@playwright/test/reporter';
import * as fs from 'fs';
import * as path from 'path';
import { printFailureReport, saveFailureReport } from './FailureReport';
import { NotificationService } from './NotificationService';

/**
 * FrameworkReporter — custom Playwright reporter that shows:
 *  - Which layer each step used (pattern / strategy / learned / selfheal)
 *  - Self-heal events with before/after locators
 *  - Learning DB activity (new fixes stored)
 *  - Per-suite pass/fail summary
 *  - Trace file paths for failed tests (one-click debug)
 *
 * Add to playwright.config.ts:
 *   reporter: [["./src/utils/FrameworkReporter.ts"], ["html", ...]]
 */
export default class FrameworkReporter implements Reporter {
  private passed = 0;
  private failed = 0;
  private skipped = 0;
  private startMs = 0;
  private failures: { title: string; error: string; trace?: string }[] = [];

  onBegin(_config: FullConfig, suite: Suite): void {
    this.startMs = Date.now();
    const total = suite.allTests().length;
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  AI Automation Framework — Test Run`);
    console.log(`  Tests: ${total} | Workers: ${_config.workers}`);
    console.log(`${'═'.repeat(60)}\n`);
  }

  onTestBegin(test: TestCase): void {
    console.log(`▶ ${test.titlePath().slice(1).join(' › ')}`);
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const duration = `${result.duration}ms`;
    const status = result.status;

    if (status === 'passed') {
      this.passed++;
      console.log(`  ✅ PASSED (${duration})\n`);
    } else if (status === 'failed' || status === 'timedOut') {
      this.failed++;
      const error = result.error?.message ?? 'Unknown error';

      // Extract structured layer info from our error format
      const layerInfo = this.extractLayerInfo(error);
      console.log(`  ❌ FAILED (${duration})`);
      if (layerInfo) {
        console.log(`  ${layerInfo}`);
      } else {
        console.log(`  Error: ${error.split('\n')[0].slice(0, 120)}`);
      }

      // Show trace path for one-click debugging
      const traceAttachment = result.attachments.find((a) => a.name === 'trace');
      if (traceAttachment?.path) {
        console.log(`  🔍 Trace: npx playwright show-trace "${traceAttachment.path}"`);
      }

      this.failures.push({
        title: test.titlePath().slice(1).join(' › '),
        error: error.slice(0, 500),
        trace: traceAttachment?.path,
      });
      console.log('');
    } else if (status === 'skipped') {
      this.skipped++;
      console.log(`  ⏭ SKIPPED\n`);
    }
  }

  onEnd(result: FullResult): void {
    const elapsed = Date.now() - this.startMs;
    const total = this.passed + this.failed + this.skipped;

    console.log(`${'═'.repeat(60)}`);
    console.log(`  RESULTS`);
    console.log(`${'─'.repeat(60)}`);
    console.log(`  ✅ Passed:  ${this.passed}/${total}`);
    console.log(`  ❌ Failed:  ${this.failed}/${total}`);
    console.log(`  ⏭ Skipped: ${this.skipped}/${total}`);
    console.log(`  ⏱ Duration: ${(elapsed / 1000).toFixed(1)}s`);
    console.log(`  Status: ${result.status.toUpperCase()}`);

    if (this.failures.length > 0) {
      console.log(`\n${'─'.repeat(60)}`);
      console.log(`  FAILURES`);
      console.log(`${'─'.repeat(60)}`);
      this.failures.forEach((f, i) => {
        console.log(`\n  ${i + 1}. ${f.title}`);
        // Show layer breakdown if available
        const lines = f.error.split('\n').filter((l) => l.trim());
        const layerLines = lines.filter(
          (l) =>
            l.includes('Layer') ||
            l.includes('Step') ||
            l.includes('Action') ||
            l.includes('Locator') ||
            l.includes('Debug tip')
        );
        if (layerLines.length > 0) {
          layerLines.slice(0, 8).forEach((l) => console.log(`     ${l.trim()}`));
        } else {
          console.log(`     ${lines[0]?.slice(0, 120) ?? 'No error message'}`);
        }
        if (f.trace) {
          console.log(`     🔍 npx playwright show-trace "${f.trace}"`);
        }
      });
    }

    // Show learning DB summary
    this.printLearningDBSummary();

    // Show failure analysis report (Ollama-powered when FW_LLM=true)
    printFailureReport();

    // Save failure report for CI integration
    saveFailureReport('test-results');

    // Generate health dashboard
    this.generateHealthDashboard();

    // Generate final results dashboard
    this.generateFinalDashboard();

    // Send Slack + Jira notifications
    this.sendNotifications();

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  Report: npm run report`);
    console.log(`${'═'.repeat(60)}\n`);
  }

  private extractLayerInfo(error: string): string | null {
    if (!error.includes('STEP FAILED')) return null;
    const lines = error.split('\n');
    const stepLine = lines.find((l) => l.includes('Step'));
    const actionLine = lines.find((l) => l.includes('Action'));
    const layer1 = lines.find((l) => l.includes('Layer 1'));
    const layer4 = lines.find((l) => l.includes('Layer 4'));
    if (!stepLine) return null;
    return [stepLine, actionLine, layer1, layer4]
      .filter(Boolean)
      .map((l) => l!.trim())
      .join(' | ');
  }

  private sendNotifications(): void {
    try {
      const total = this.passed + this.failed + this.skipped;
      const passRate = total > 0 ? Math.round((this.passed / total) * 100) : 0;
      const elapsed = ((Date.now() - this.startMs) / 1000).toFixed(1);

      NotificationService.notifyAll({
        passed: this.passed,
        failed: this.failed,
        skipped: this.skipped,
        total,
        passRate,
        duration: elapsed,
        failedTests: this.failures.map(f => ({
          title: f.title,
          error: f.error.split('\n')[0].slice(0, 150),
          project: '',
        })),
        runUrl: process.env['DASHBOARD_URL'] ?? 'http://localhost:3000',
      }).catch(() => { /* non-fatal */ });
    } catch {
      // Non-fatal
    }
  }

  private generateFinalDashboard(): void {
    try {
      const reportPath = path.resolve('test-results', 'report.json');
      if (!fs.existsSync(reportPath)) return;

      // Dynamically require to avoid circular deps
      const { execSync } = require('child_process');
      execSync('npx ts-node src/utils/FinalDashboard.ts', {
        cwd: process.cwd(),
        stdio: 'pipe',
      });
      const outFile = path.resolve('test-results', 'final-dashboard.html');
      console.log(`  🎯 Final Dashboard: ${outFile}`);
    } catch {
      // Non-fatal
    }
  }

  private generateHealthDashboard(): void {
    try {
      // Inline the dashboard generation to avoid ts-node dependency
      const dbPath = path.resolve('learning-db.json');
      if (!fs.existsSync(dbPath)) return;
      const db = JSON.parse(fs.readFileSync(dbPath, 'utf8')) as Array<{
        old: string;
        new: string;
        action: string;
        label: string;
        timestamp: number;
        success: boolean;
        count: number;
        confidence: number;
      }>;
      if (!Array.isArray(db) || db.length === 0) return;

      const failureReportPath = path.resolve('test-results', 'failure-report.json');
      const failures = fs.existsSync(failureReportPath)
        ? JSON.parse(fs.readFileSync(failureReportPath, 'utf8'))
        : [];

      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;
      const last24h = db.filter((x) => now - x.timestamp < day);
      const successRate =
        db.length > 0 ? Math.round((db.filter((x) => x.success).length / db.length) * 100) : 100;

      const healCounts = new Map<string, number>();
      db.forEach((x) =>
        healCounts.set(x.label || x.old, (healCounts.get(x.label || x.old) ?? 0) + x.count)
      );
      const topFragile = [...healCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

      const recentHeals = last24h.sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);

      const rows = (arr: typeof db) =>
        arr
          .map((x) => {
            const ageDays = Math.floor((now - x.timestamp) / day);
            const age = ageDays === 0 ? 'Today' : `${ageDays}d ago`;
            return `<tr><td>${(x.label || x.old).slice(0, 45)}</td><td>${x.action}</td><td style="color:#48bb78">${x.new.slice(0, 50)}</td><td>${x.count}</td><td style="color:${x.confidence >= 80 ? '#48bb78' : x.confidence >= 60 ? '#ecc94b' : '#fc8181'}">${x.confidence}%</td><td style="color:#718096">${age}</td></tr>`;
          })
          .join('');

      const failureRows = (failures as any[])
        .map(
          (f: any) =>
            `<tr style="background:#1e1520"><td style="color:#fc8181">${f.stepLabel || ''}</td><td>${f.action || ''}</td><td style="color:#e2e8f0">${f.cause || '—'}</td><td style="color:#48bb78">${f.fix || '—'}</td><td>${f.patched ? '✅ Patched' : '—'}</td></tr>`
        )
        .join('');

      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Health Dashboard</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;background:#0f1117;color:#e2e8f0}
.hdr{background:#1a1f2e;border-bottom:1px solid #2d3748;padding:20px 28px}
.hdr h1{font-size:20px;font-weight:700;color:#fff}.hdr p{color:#718096;font-size:12px;margin-top:3px}
.c{max-width:1200px;margin:0 auto;padding:20px 28px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px}
.card{background:#1a1f2e;border:1px solid #2d3748;border-radius:8px;padding:16px}
.card .lbl{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#718096;margin-bottom:6px}
.card .val{font-size:28px;font-weight:700}.card .sub{font-size:11px;color:#718096;margin-top:3px}
.sec{background:#1a1f2e;border:1px solid #2d3748;border-radius:8px;padding:16px;margin-bottom:16px}
.sec h2{font-size:12px;font-weight:600;color:#a0aec0;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px}
table{width:100%;border-collapse:collapse;font-size:12px}
th{text-align:left;padding:7px 10px;color:#718096;font-weight:500;border-bottom:1px solid #2d3748;font-size:10px;text-transform:uppercase}
td{padding:8px 10px;border-bottom:1px solid #1e2535;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
tr:hover td{background:#1e2535}.g{color:#48bb78}.y{color:#ecc94b}.r{color:#fc8181}.b{color:#63b3ed}
.empty{color:#4a5568;font-size:12px;text-align:center;padding:20px}
</style></head><body>
<div class="hdr"><h1>🤖 AI Automation Framework — Health Dashboard</h1>
<p>Generated: ${new Date().toLocaleString()} &nbsp;|&nbsp; ${db.length} fixes in learning-db</p></div>
<div class="c">
<div class="grid">
<div class="card"><div class="lbl">Total Heals</div><div class="val b">${db.length}</div><div class="sub">All time</div></div>
<div class="card"><div class="lbl">Last 24h</div><div class="val ${last24h.length > 0 ? 'y' : 'g'}">${last24h.length}</div><div class="sub">${db.filter((x) => now - x.timestamp < 7 * day).length} last 7 days</div></div>
<div class="card"><div class="lbl">Success Rate</div><div class="val ${successRate >= 95 ? 'g' : successRate >= 80 ? 'y' : 'r'}">${successRate}%</div><div class="sub">${db.filter((x) => x.success).length}/${db.length} successful</div></div>
<div class="card"><div class="lbl">Failures This Run</div><div class="val ${failures.length === 0 ? 'g' : 'r'}">${failures.length}</div><div class="sub">${(failures as any[]).filter((f: any) => f.cause).length} with analysis</div></div>
</div>
${failures.length > 0 ? `<div class="sec"><h2>❌ Failure Analysis</h2><table><tr><th>Step</th><th>Action</th><th>Cause</th><th>Fix</th><th>Patched</th></tr>${failureRows}</table></div>` : ''}
<div class="sec"><h2>⚠️ Most Healed (Fragile Spots)</h2>${topFragile.length === 0 ? '<div class="empty">No data</div>' : `<table><tr><th>Step</th><th>Heals</th></tr>${topFragile.map(([l, c]) => `<tr><td>${l.slice(0, 60)}</td><td class="${c > 20 ? 'r' : c > 5 ? 'y' : 'g'}">${c}</td></tr>`).join('')}</table>`}</div>
<div class="sec"><h2>📚 Recent Heals (Last 24h)</h2>${recentHeals.length === 0 ? '<div class="empty">✅ No heals — all locators stable</div>' : `<table><tr><th>Label</th><th>Action</th><th>Old</th><th>New</th><th>Uses</th><th>Conf</th></tr>${rows(recentHeals)}</table>`}</div>
<div class="sec"><h2>🗄️ All Fixes (${db.length})</h2><table><tr><th>Label</th><th>Action</th><th>New Locator</th><th>Uses</th><th>Conf</th><th>Age</th></tr>${rows(db.sort((a, b) => b.count - a.count).slice(0, 50))}</table></div>
</div></body></html>`;

      const outFile = path.resolve('test-results', 'health-dashboard.html');
      const outBase = path.resolve('test-results');
      if (!outFile.startsWith(outBase + path.sep)) return;
      fs.mkdirSync(path.dirname(outFile), { recursive: true });
      fs.writeFileSync(outFile, html, 'utf8');
      console.log(`\n  📊 Health Dashboard: ${outFile}`);
    } catch (e) {
      // Non-fatal — dashboard generation failure should not affect test results
    }
  }

  private printLearningDBSummary(): void {
    try {
      const dbPath = path.resolve('learning-db.json');
      if (!fs.existsSync(dbPath)) return;
      const db = JSON.parse(fs.readFileSync(dbPath, 'utf8')) as Array<{
        old: string;
        new: string;
        action: string;
        count: number;
        timestamp: number;
      }>;
      if (!Array.isArray(db) || db.length === 0) return;

      // Show entries updated in the last 10 minutes (this run)
      const cutoff = Date.now() - 10 * 60 * 1000;
      const recent = db.filter((x) => x.timestamp > cutoff);
      if (recent.length === 0) return;

      console.log(`\n${'─'.repeat(60)}`);
      console.log(`  📚 LEARNING DB — ${recent.length} fix(es) updated this run`);
      recent.slice(0, 5).forEach((x) => {
        console.log(
          `     [${x.action}] "${x.old.slice(0, 30)}" → "${x.new.slice(0, 40)}" (×${x.count})`
        );
      });
      if (recent.length > 5) {
        console.log(`     ... and ${recent.length - 5} more`);
      }
    } catch {
      /* non-fatal */
    }
  }
}
