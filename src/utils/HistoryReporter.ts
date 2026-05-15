import * as fs from 'fs';
import * as path from 'path';
import type { Reporter, TestCase, TestResult, FullResult } from '@playwright/test/reporter';

interface RunSummary {
  runId: string;
  timestamp: string;
  duration: number;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
  total: number;
  passRate: number;
  status: 'PASSED' | 'FAILED';
  tests: Array<{
    title: string;
    project: string;
    status: string;
    duration: number;
    error?: string;
  }>;
}

class HistoryReporter implements Reporter {
  private results: RunSummary['tests'] = [];
  private startTime = Date.now();

  onTestEnd(test: TestCase, result: TestResult): void {
    this.results.push({
      title   : test.titlePath().join(' > '),
      project : test.parent.project()?.name ?? 'default',
      status  : result.status,
      duration: result.duration,
      error   : result.errors?.[0]?.message?.slice(0, 200),
    });
  }

  onEnd(result: FullResult): void {
    try {
      const passed  = this.results.filter(t => t.status === 'passed').length;
      const failed  = this.results.filter(t => t.status === 'failed').length;
      const skipped = this.results.filter(t => t.status === 'skipped').length;
      const flaky   = this.results.filter(t => t.status === 'flaky').length;
      const total   = this.results.length;

      const summary: RunSummary = {
        runId    : new Date().toISOString().replace(/[:.]/g, '-'),
        timestamp: new Date().toISOString(),
        duration : Date.now() - this.startTime,
        passed,
        failed,
        skipped,
        flaky,
        total,
        passRate : total > 0 ? Math.round((passed / total) * 100) : 0,
        status   : failed === 0 ? 'PASSED' : 'FAILED',
        tests    : this.results,
      };

      // Save to history folder
      const historyDir = path.resolve(process.cwd(), 'test-results', 'history');
      if (!fs.existsSync(historyDir)) fs.mkdirSync(historyDir, { recursive: true });

      const file = path.join(historyDir, `run-${summary.runId}.json`);
      fs.writeFileSync(file, JSON.stringify(summary, null, 2), 'utf8');

      // Keep only last 20 runs
      const files = fs.readdirSync(historyDir)
        .filter(f => f.startsWith('run-') && f.endsWith('.json'))
        .sort();
      if (files.length > 20) {
        files.slice(0, files.length - 20).forEach(f => {
          try { fs.unlinkSync(path.join(historyDir, f)); } catch { /* ignore */ }
        });
      }

      console.log(`\n📊 History saved: ${file}`);
      console.log(`   Pass Rate: ${summary.passRate}% (${passed}/${total})`);
    } catch (e) {
      console.warn('HistoryReporter: failed to save history —', String(e).slice(0, 80));
    }
  }
}

export default HistoryReporter;
