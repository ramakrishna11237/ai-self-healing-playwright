import * as fs from 'fs';
import * as path from 'path';
import { WorkflowResult } from '../core/WorkflowRunner';
import { Logger } from './Logger';

/** Escape HTML special characters to prevent XSS */
function esc(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

export interface DashboardEntry {
  name: string;
  result: WorkflowResult;
  tags?: string[];
}

export class DashboardReporter {
  private entries: DashboardEntry[] = [];
  private startedAt = new Date();
  private runId = `run-${Date.now()}`;

  record(name: string, result: WorkflowResult, tags?: string[]): void {
    this.entries.push({ name, result, tags });
  }

  generate(outputDir = 'test-results'): string {
    const base = path.resolve('test-results');
    fs.mkdirSync(base, { recursive: true });
    const filePath = path.join(base, 'dashboard.html');
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(base + path.sep) && resolved !== base)
      throw new Error('Path traversal blocked');
    fs.writeFileSync(resolved, this.buildHTML(), 'utf8');
    Logger.info(`Dashboard generated: ${resolved}`);
    return resolved;
  }

  private buildHTML(): string {
    const totalSteps = this.entries.reduce((s, e) => s + e.result.total, 0);
    const totalPassed = this.entries.reduce((s, e) => s + e.result.passed, 0);
    const totalFailed = this.entries.reduce((s, e) => s + e.result.failed, 0);
    const totalSkipped = this.entries.reduce((s, e) => s + e.result.skipped, 0);
    const passRate = totalSteps > 0 ? ((totalPassed / totalSteps) * 100).toFixed(1) : '0';
    const duration = this.entries.reduce((s, e) => s + e.result.durationMs, 0);

    const layerCounts: Record<string, number> = {};
    for (const e of this.entries) {
      for (const s of e.result.steps) {
        const l = s.result.layer;
        layerCounts[l] = (layerCounts[l] || 0) + 1;
      }
    }
    const healCount = (layerCounts['selfheal'] || 0) + (layerCounts['learned'] || 0);

    const totalSoftFailed = this.entries.reduce((s, e) => s + (e.result.softFailed ?? 0), 0);
    const workflowRows = this.entries
      .map((e) => {
        const rate =
          e.result.total > 0 ? ((e.result.passed / e.result.total) * 100).toFixed(0) : '0';
        const statusClass = e.result.failed > 0 ? 'fail' : 'pass';
        const safeName = esc(e.name);
        const tags = (e.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join(' ');
        const safeId = e.name.replace(/[^a-z0-9]/gi, '_');
        // Trace link — one-click debugging via Playwright trace viewer
        const traceLink = e.result.tracePath
          ? `<a class="trace-link" href="#" onclick="copyTrace(this.dataset.trace);return false;" data-trace="${esc(e.result.tracePath)}" title="Copy trace command">🔍 Trace</a>`
          : '';
        // Timeout badge
        const timeoutBadge = e.result.timedOut
          ? `<span class="tag" style="color:#ef4444">⏱ Timeout</span>`
          : '';
        return `
        <tr class="workflow-row" data-name="${safeName}">
          <td><span class="status-dot ${statusClass}"></span> ${safeName} ${tags}${timeoutBadge}</td>
          <td>${e.result.total}</td>
          <td class="pass-text">${e.result.passed}</td>
          <td class="fail-text">${e.result.failed}</td>
          <td class="soft-text">${e.result.softFailed ?? 0}</td>
          <td class="skip-text">${e.result.skipped}</td>
          <td>
            <div class="progress-bar"><div class="progress-fill" style="width:${rate}%"></div></div>
            <span class="rate-label">${rate}%</span>
          </td>
          <td>${e.result.durationMs}ms</td>
          <td>
            <button class="expand-btn" onclick="toggleSteps('${safeId}')">▼ Steps</button>
            ${traceLink}
          </td>
        </tr>
        <tr class="steps-row" id="steps-${safeId}" style="display:none">
          <td colspan="9">
            <table class="steps-table">
              <thead><tr><th>#</th><th>Step</th><th>Type</th><th>Status</th><th>Layer</th><th>Locator</th><th>Duration</th><th>Error</th></tr></thead>
              <tbody>
                ${e.result.steps
                  .map((s, i) => {
                    const isSoft = (s as { soft?: boolean }).soft;
                    const statusIcon = s.result.success
                      ? '✅ Pass'
                      : isSoft
                        ? '⚠️ Soft'
                        : '❌ Fail';
                    const rowClass = s.result.success
                      ? 'step-pass'
                      : isSoft
                        ? 'step-soft'
                        : 'step-fail';
                    return `
                  <tr class="${rowClass}">
                    <td>${i + 1}</td>
                    <td>${esc(s.label)}</td>
                    <td>${isSoft ? "<span class='soft-badge'>soft</span>" : ''}</td>
                    <td>${statusIcon}</td>
                    <td><span class="layer-badge layer-${esc(s.result.layer)}">${esc(s.result.layer)}</span></td>
                    <td><code>${esc(s.result.locatorUsed || '—')}</code></td>
                    <td>${s.result.durationMs ? s.result.durationMs + 'ms' : '—'}</td>
                    <td class="error-cell">${esc(s.result.error || '')}</td>
                  </tr>`;
                  })
                  .join('')}
              </tbody>
            </table>
          </td>
        </tr>`;
      })
      .join('');

    // Layer chart data
    const layerLabels = JSON.stringify(Object.keys(layerCounts));
    const layerData = JSON.stringify(Object.values(layerCounts));
    const layerColors = JSON.stringify([
      '#4CAF50',
      '#2196F3',
      '#FF9800',
      '#9C27B0',
      '#F44336',
      '#00BCD4',
      '#607D8B',
    ]);

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AI Automation Framework — Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
  :root {
    --bg: #0f1117; --surface: #1a1d27; --surface2: #22263a;
    --border: #2e3250; --text: #e2e8f0; --text2: #94a3b8;
    --pass: #22c55e; --fail: #ef4444; --skip: #f59e0b;
    --accent: #6366f1; --accent2: #818cf8;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: 'Segoe UI', system-ui, sans-serif; font-size: 14px; }
  header { background: var(--surface); border-bottom: 1px solid var(--border); padding: 16px 32px; display: flex; align-items: center; gap: 16px; }
  header h1 { font-size: 20px; font-weight: 700; color: var(--accent2); }
  header .run-id { color: var(--text2); font-size: 12px; }
  .main { padding: 24px 32px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; margin-bottom: 28px; }
  .kpi { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 20px; text-align: center; }
  .kpi .value { font-size: 36px; font-weight: 800; line-height: 1; }
  .kpi .label { color: var(--text2); font-size: 12px; margin-top: 6px; text-transform: uppercase; letter-spacing: .05em; }
  .kpi.pass .value { color: var(--pass); }
  .kpi.fail .value { color: var(--fail); }
  .kpi.skip .value { color: var(--skip); }
  .kpi.accent .value { color: var(--accent2); }
  .charts-row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 28px; }
  .chart-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
  .chart-card h3 { font-size: 13px; color: var(--text2); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 16px; }
  canvas { max-height: 220px; }
  .section-title { font-size: 15px; font-weight: 600; color: var(--text2); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 12px; }
  .filter-bar { display: flex; gap: 10px; margin-bottom: 14px; }
  .filter-bar input { background: var(--surface2); border: 1px solid var(--border); color: var(--text); border-radius: 8px; padding: 8px 14px; font-size: 13px; width: 260px; }
  .filter-bar button { background: var(--surface2); border: 1px solid var(--border); color: var(--text); border-radius: 8px; padding: 8px 14px; cursor: pointer; font-size: 13px; }
  .filter-bar button:hover, .filter-bar button.active { background: var(--accent); border-color: var(--accent); color: #fff; }
  table.main-table { width: 100%; border-collapse: collapse; background: var(--surface); border-radius: 12px; overflow: hidden; border: 1px solid var(--border); }
  table.main-table th { background: var(--surface2); color: var(--text2); font-size: 11px; text-transform: uppercase; letter-spacing: .05em; padding: 12px 14px; text-align: left; }
  table.main-table td { padding: 12px 14px; border-top: 1px solid var(--border); vertical-align: middle; }
  .workflow-row:hover td { background: var(--surface2); }
  .status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 8px; }
  .status-dot.pass { background: var(--pass); }
  .status-dot.fail { background: var(--fail); }
  .pass-text { color: var(--pass); font-weight: 600; }
  .fail-text { color: var(--fail); font-weight: 600; }
  .soft-text { color: #f59e0b; font-weight: 600; }
  .soft-badge { background: #3a2a1a; color: #fb923c; padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; }
  .step-soft td { color: #fcd34d; }
  .trace-link { color: var(--accent2); font-size: 11px; margin-left: 8px; text-decoration: none; }
  .trace-link:hover { text-decoration: underline; }
  .progress-bar { display: inline-block; width: 80px; height: 6px; background: var(--surface2); border-radius: 3px; vertical-align: middle; margin-right: 6px; }
  .progress-fill { height: 100%; background: var(--pass); border-radius: 3px; }
  .rate-label { font-size: 12px; color: var(--text2); }
  .expand-btn { background: var(--surface2); border: 1px solid var(--border); color: var(--accent2); border-radius: 6px; padding: 4px 10px; cursor: pointer; font-size: 12px; }
  .expand-btn:hover { background: var(--accent); color: #fff; border-color: var(--accent); }
  .steps-row td { background: var(--bg); padding: 0; }
  table.steps-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  table.steps-table th { background: var(--surface2); color: var(--text2); padding: 8px 12px; text-align: left; }
  table.steps-table td { padding: 8px 12px; border-top: 1px solid var(--border); }
  .step-pass td { color: var(--text); }
  .step-fail td { color: #fca5a5; }
  .layer-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
  .layer-pattern  { background: #1e3a5f; color: #60a5fa; }
  .layer-strategy { background: #1a3a2a; color: #4ade80; }
  .layer-learned  { background: #3a2a1a; color: #fb923c; }
  .layer-selfheal { background: #3a1a3a; color: #c084fc; }
  .layer-direct   { background: #1a2a3a; color: #67e8f9; }
  .layer-none     { background: #3a1a1a; color: #f87171; }
  .layer-codegen  { background: #1a3a3a; color: #34d399; }
  .error-cell { color: #f87171; font-size: 11px; max-width: 300px; word-break: break-word; }
  code { background: var(--surface2); padding: 2px 6px; border-radius: 4px; font-size: 11px; color: var(--accent2); }
  .tag { background: var(--surface2); border: 1px solid var(--border); border-radius: 4px; padding: 1px 6px; font-size: 11px; color: var(--text2); margin-left: 4px; }
  footer { text-align: center; color: var(--text2); font-size: 12px; padding: 24px; border-top: 1px solid var(--border); margin-top: 32px; }
  @media (max-width: 768px) { .charts-row { grid-template-columns: 1fr; } .main { padding: 16px; } }
</style>
</head>
<body>
<header>
  <div>
    <h1>🤖 AI Automation Framework</h1>
    <div class="run-id">Run ID: ${this.runId} &nbsp;|&nbsp; ${new Date().toLocaleString()} &nbsp;|&nbsp; ${process.env['BASE_URL'] || 'local'}</div>
  </div>
</header>

<div class="main">
  <!-- KPI Cards -->
  <div class="kpi-grid">
    <div class="kpi accent"><div class="value">${totalSteps}</div><div class="label">Total Steps</div></div>
    <div class="kpi pass"><div class="value">${totalPassed}</div><div class="label">Passed</div></div>
    <div class="kpi fail"><div class="value">${totalFailed}</div><div class="label">Failed</div></div>
    <div class="kpi skip"><div class="value">${totalSoftFailed}</div><div class="label">Soft Failed</div></div>
    <div class="kpi skip"><div class="value">${totalSkipped}</div><div class="label">Skipped</div></div>
    <div class="kpi accent"><div class="value">${passRate}%</div><div class="label">Pass Rate</div></div>
    <div class="kpi accent"><div class="value">${(duration / 1000).toFixed(1)}s</div><div class="label">Duration</div></div>
    <div class="kpi accent"><div class="value">${healCount}</div><div class="label">Self-Healed</div></div>
    <div class="kpi accent"><div class="value">${this.entries.length}</div><div class="label">Workflows</div></div>
  </div>

  <!-- Charts -->
  <div class="charts-row">
    <div class="chart-card">
      <h3>Pass / Fail / Skip</h3>
      <canvas id="pieChart"></canvas>
    </div>
    <div class="chart-card">
      <h3>Resolution Layer Breakdown</h3>
      <canvas id="layerChart"></canvas>
    </div>
  </div>

  <!-- Workflow Table -->
  <div class="section-title">Workflows</div>
  <div class="filter-bar">
    <input type="text" id="searchInput" placeholder="Search workflows..." oninput="filterTable()">
    <button onclick="filterStatus('all')" class="active" id="btn-all">All</button>
    <button onclick="filterStatus('pass')" id="btn-pass">✅ Pass</button>
    <button onclick="filterStatus('fail')" id="btn-fail">❌ Fail</button>
  </div>
  <table class="main-table" id="mainTable">
    <thead>
      <tr>
        <th>Workflow</th><th>Steps</th><th>Passed</th><th>Failed</th><th>Soft</th><th>Skipped</th><th>Pass Rate</th><th>Duration</th><th></th>
      </tr>
    </thead>
    <tbody id="tableBody">
      ${workflowRows}
    </tbody>
  </table>
</div>

<footer>AI Automation Framework &nbsp;·&nbsp; Generated ${new Date().toISOString()}</footer>

<script>
// Charts
const pieCtx = document.getElementById('pieChart').getContext('2d');
new Chart(pieCtx, {
  type: 'doughnut',
  data: {
    labels: ['Passed', 'Failed', 'Skipped'],
    datasets: [{ data: [${totalPassed}, ${totalFailed}, ${totalSkipped}], backgroundColor: ['#22c55e','#ef4444','#f59e0b'], borderWidth: 0 }]
  },
  options: { plugins: { legend: { labels: { color: '#94a3b8' } } }, cutout: '65%' }
});

const layerCtx = document.getElementById('layerChart').getContext('2d');
new Chart(layerCtx, {
  type: 'bar',
  data: {
    labels: ${layerLabels},
    datasets: [{ data: ${layerData}, backgroundColor: ${layerColors}, borderRadius: 4, borderWidth: 0 }]
  },
  options: {
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: '#94a3b8' }, grid: { color: '#2e3250' } },
      y: { ticks: { color: '#94a3b8' }, grid: { color: '#2e3250' } }
    }
  }
});

// Copy trace command to clipboard
function copyTrace(el) {
  const tracePath = el.getAttribute('data-trace') || '';
  const cmd = 'npx playwright show-trace ' + tracePath;
  navigator.clipboard.writeText(cmd).then(() => {
    alert('Copied to clipboard:\n' + cmd);
  }).catch(() => {
    prompt('Copy this command to view the trace:', cmd);
  });
}

// Toggle step details
function toggleSteps(name) {
  const id = 'steps-' + name.replace(/[^a-z0-9]/gi, '_');
  const row = document.getElementById(id);
  if (row) row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
}

// Filter
let currentStatus = 'all';
function filterStatus(status) {
  currentStatus = status;
  ['all','pass','fail'].forEach(s => document.getElementById('btn-'+s).classList.toggle('active', s === status));
  filterTable();
}

function filterTable() {
  const q = document.getElementById('searchInput').value.toLowerCase();
  document.querySelectorAll('.workflow-row').forEach(row => {
    const name = row.dataset.name.toLowerCase();
    const hasFail = row.querySelector('.status-dot.fail');
    const statusMatch = currentStatus === 'all' || (currentStatus === 'fail' && hasFail) || (currentStatus === 'pass' && !hasFail);
    row.style.display = name.includes(q) && statusMatch ? '' : 'none';
  });
}
</script>
</body>
</html>`;
  }
}
