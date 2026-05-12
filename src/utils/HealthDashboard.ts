/**
 * HealthDashboard — Generates an HTML report from learning-db.json
 * showing healing trends, fragile locators, and framework accuracy.
 *
 * Run after any test suite:
 *   npx ts-node src/utils/HealthDashboard.ts
 *   OR: npm run dashboard
 *
 * Output: test-results/health-dashboard.html
 */

import * as fs from 'fs';
import * as path from 'path';

interface LearnedFix {
  old: string;
  new: string;
  action: string;
  label: string;
  timestamp: number;
  success: boolean;
  count: number;
  confidence: number;
}

function loadDB(): LearnedFix[] {
  const dbPath = path.resolve('learning-db.json');
  if (!fs.existsSync(dbPath)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function loadFailureReport(): any[] {
  const file = path.resolve('test-results', 'failure-report.json');
  if (!fs.existsSync(file)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function generateDashboard(): void {
  const db = loadDB();
  const failures = loadFailureReport();
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  // ── Metrics ────────────────────────────────────────────────────────────────
  const totalFixes = db.length;
  const last24h = db.filter((x) => now - x.timestamp < day);
  const last7d = db.filter((x) => now - x.timestamp < 7 * day);
  const successRate =
    totalFixes > 0 ? Math.round((db.filter((x) => x.success).length / totalFixes) * 100) : 100;

  // Most healed locators (fragile spots)
  const healCounts = new Map<string, number>();
  db.forEach((x) =>
    healCounts.set(x.label || x.old, (healCounts.get(x.label || x.old) ?? 0) + x.count)
  );
  const topFragile = [...healCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

  // Action breakdown
  const actionMap = new Map<string, number>();
  db.forEach((x) => actionMap.set(x.action, (actionMap.get(x.action) ?? 0) + 1));
  const actionBreakdown = [...actionMap.entries()].sort((a, b) => b[1] - a[1]);

  // Recent heals (last 24h)
  const recentHeals = last24h.sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);

  // ── HTML ───────────────────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Automation Framework — Health Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #0f1117; color: #e2e8f0; min-height: 100vh; }
    .header { background: linear-gradient(135deg, #1a1f2e 0%, #0f1117 100%);
              border-bottom: 1px solid #2d3748; padding: 24px 32px; }
    .header h1 { font-size: 22px; font-weight: 700; color: #fff; }
    .header p  { color: #718096; font-size: 13px; margin-top: 4px; }
    .container { max-width: 1200px; margin: 0 auto; padding: 24px 32px; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
    .card { background: #1a1f2e; border: 1px solid #2d3748; border-radius: 10px; padding: 20px; }
    .card .label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px;
                   color: #718096; margin-bottom: 8px; }
    .card .value { font-size: 32px; font-weight: 700; }
    .card .sub   { font-size: 12px; color: #718096; margin-top: 4px; }
    .green  { color: #48bb78; }
    .yellow { color: #ecc94b; }
    .red    { color: #fc8181; }
    .blue   { color: #63b3ed; }
    .section { background: #1a1f2e; border: 1px solid #2d3748; border-radius: 10px;
               padding: 20px; margin-bottom: 20px; }
    .section h2 { font-size: 14px; font-weight: 600; color: #a0aec0;
                  text-transform: uppercase; letter-spacing: 1px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; padding: 8px 12px; color: #718096; font-weight: 500;
         border-bottom: 1px solid #2d3748; font-size: 11px; text-transform: uppercase; }
    td { padding: 10px 12px; border-bottom: 1px solid #1e2535; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #1e2535; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px;
             font-size: 11px; font-weight: 600; }
    .badge-green  { background: #1c4532; color: #48bb78; }
    .badge-yellow { background: #3d3000; color: #ecc94b; }
    .badge-red    { background: #3d1515; color: #fc8181; }
    .badge-blue   { background: #1a365d; color: #63b3ed; }
    .bar-container { background: #2d3748; border-radius: 4px; height: 6px; margin-top: 4px; }
    .bar { background: #4299e1; border-radius: 4px; height: 6px; }
    .truncate { max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .empty { color: #4a5568; font-size: 13px; text-align: center; padding: 24px; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .failure-card { background: #1e1520; border: 1px solid #3d1515; border-radius: 8px;
                    padding: 14px; margin-bottom: 10px; }
    .failure-card .step { font-weight: 600; color: #fc8181; margin-bottom: 6px; }
    .failure-card .cause { color: #e2e8f0; font-size: 13px; margin-bottom: 4px; }
    .failure-card .fix   { color: #48bb78; font-size: 12px; }
    .failure-card .meta  { color: #718096; font-size: 11px; margin-top: 6px; }
    .patched { color: #48bb78; font-size: 11px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🤖 AI Automation Framework — Health Dashboard</h1>
    <p>Generated: ${new Date().toLocaleString()} &nbsp;|&nbsp; Learning DB: ${totalFixes} entries</p>
  </div>

  <div class="container">

    <!-- Metrics -->
    <div class="grid">
      <div class="card">
        <div class="label">Total Heals</div>
        <div class="value blue">${totalFixes}</div>
        <div class="sub">All time in learning-db</div>
      </div>
      <div class="card">
        <div class="label">Last 24 Hours</div>
        <div class="value ${last24h.length > 0 ? 'yellow' : 'green'}">${last24h.length}</div>
        <div class="sub">${last7d.length} in last 7 days</div>
      </div>
      <div class="card">
        <div class="label">Healing Success Rate</div>
        <div class="value ${successRate >= 95 ? 'green' : successRate >= 80 ? 'yellow' : 'red'}">${successRate}%</div>
        <div class="sub">${db.filter((x) => x.success).length} successful / ${totalFixes} total</div>
      </div>
      <div class="card">
        <div class="label">Failures This Run</div>
        <div class="value ${failures.length === 0 ? 'green' : 'red'}">${failures.length}</div>
        <div class="sub">${failures.filter((f: any) => f.cause).length} with Ollama analysis</div>
      </div>
    </div>

    <!-- Failure Analysis -->
    ${
      failures.length > 0
        ? `
    <div class="section">
      <h2>❌ Failure Analysis — This Run</h2>
      ${failures
        .map(
          (f: any) => `
        <div class="failure-card">
          <div class="step">❌ ${f.stepLabel || 'Unknown step'}</div>
          ${f.cause ? `<div class="cause">📋 ${f.cause}</div>` : ''}
          ${f.fix ? `<div class="fix">✅ ${f.fix}</div>` : ''}
          ${f.suggestedLocator ? `<div class="meta">Suggested: <code>${f.suggestedLocator.slice(0, 80)}</code></div>` : ''}
          ${f.patched ? `<div class="patched">✅ Auto-patched: ${f.patchedFile ? path.basename(f.patchedFile) : 'page object'}</div>` : ''}
          <div class="meta">
            Action: ${f.action || 'click'}
            ${f.failureType ? ` &nbsp;|&nbsp; Type: ${f.failureType}` : ''}
            ${f.confidence ? ` &nbsp;|&nbsp; Confidence: ${f.confidence}%` : ''}
            ${f.layersTried?.length ? ` &nbsp;|&nbsp; Layers: ${f.layersTried.join(' → ')}` : ''}
          </div>
        </div>
      `
        )
        .join('')}
    </div>
    `
        : `
    <div class="section">
      <h2>❌ Failure Analysis</h2>
      <div class="empty">✅ No failures recorded this run</div>
    </div>
    `
    }

    <div class="two-col">

      <!-- Most Fragile Locators -->
      <div class="section">
        <h2>⚠️ Most Healed Steps (Fragile Spots)</h2>
        ${
          topFragile.length === 0
            ? `<div class="empty">No healing data yet</div>`
            : `<table>
              <tr><th>Step / Locator</th><th>Heals</th></tr>
              ${topFragile
                .map(
                  ([label, count]) => `
                <tr>
                  <td class="truncate" title="${label}">${label.slice(0, 50)}</td>
                  <td>
                    <span class="${count > 20 ? 'red' : count > 5 ? 'yellow' : 'green'}">${count}</span>
                    <div class="bar-container">
                      <div class="bar" style="width:${Math.min(100, (count / (topFragile[0]?.[1] ?? 1)) * 100)}%"></div>
                    </div>
                  </td>
                </tr>
              `
                )
                .join('')}
            </table>`
        }
      </div>

      <!-- Action Breakdown -->
      <div class="section">
        <h2>📊 Heals by Action Type</h2>
        ${
          actionBreakdown.length === 0
            ? `<div class="empty">No data yet</div>`
            : `<table>
              <tr><th>Action</th><th>Count</th><th></th></tr>
              ${actionBreakdown
                .slice(0, 10)
                .map(
                  ([action, count]) => `
                <tr>
                  <td><span class="badge badge-blue">${action}</span></td>
                  <td>${count}</td>
                  <td style="width:120px">
                    <div class="bar-container">
                      <div class="bar" style="width:${Math.min(100, (count / (actionBreakdown[0]?.[1] ?? 1)) * 100)}%"></div>
                    </div>
                  </td>
                </tr>
              `
                )
                .join('')}
            </table>`
        }
      </div>

    </div>

    <!-- Recent Heals -->
    <div class="section">
      <h2>📚 Recent Heals — Last 24 Hours</h2>
      ${
        recentHeals.length === 0
          ? `<div class="empty">No heals in the last 24 hours — all locators stable ✅</div>`
          : `<table>
            <tr><th>Step Label</th><th>Action</th><th>Old Locator</th><th>New Locator</th><th>Uses</th><th>Confidence</th></tr>
            ${recentHeals
              .map(
                (x) => `
              <tr>
                <td class="truncate" title="${x.label}">${(x.label || x.old).slice(0, 40)}</td>
                <td><span class="badge badge-blue">${x.action}</span></td>
                <td class="truncate" title="${x.old}" style="color:#718096">${x.old.slice(0, 40)}</td>
                <td class="truncate" title="${x.new}" style="color:#48bb78">${x.new.slice(0, 40)}</td>
                <td>${x.count}</td>
                <td>
                  <span class="${x.confidence >= 80 ? 'green' : x.confidence >= 60 ? 'yellow' : 'red'}">
                    ${x.confidence}%
                  </span>
                </td>
              </tr>
            `
              )
              .join('')}
          </table>`
      }
    </div>

    <!-- All Fixes -->
    <div class="section">
      <h2>🗄️ All Learned Fixes (${totalFixes})</h2>
      ${
        db.length === 0
          ? `<div class="empty">No fixes learned yet — run some tests first</div>`
          : `<table>
            <tr><th>Label</th><th>Action</th><th>New Locator</th><th>Uses</th><th>Confidence</th><th>Age</th></tr>
            ${db
              .sort((a, b) => b.count - a.count)
              .slice(0, 50)
              .map((x) => {
                const ageDays = Math.floor((now - x.timestamp) / day);
                const ageStr =
                  ageDays === 0 ? 'Today' : ageDays === 1 ? '1 day ago' : `${ageDays} days ago`;
                return `
              <tr>
                <td class="truncate" title="${x.label || x.old}">${(x.label || x.old).slice(0, 45)}</td>
                <td><span class="badge badge-blue">${x.action}</span></td>
                <td class="truncate" title="${x.new}" style="color:#48bb78">${x.new.slice(0, 50)}</td>
                <td>${x.count}</td>
                <td><span class="${x.confidence >= 80 ? 'green' : x.confidence >= 60 ? 'yellow' : 'red'}">${x.confidence}%</span></td>
                <td style="color:#718096">${ageStr}</td>
              </tr>`;
              })
              .join('')}
            ${db.length > 50 ? `<tr><td colspan="6" style="color:#4a5568;text-align:center">... and ${db.length - 50} more entries</td></tr>` : ''}
          </table>`
      }
    </div>

  </div>
</body>
</html>`;

  const outDir = path.resolve('test-results');
  const outFile = path.join(outDir, 'health-dashboard.html');
  const resolvedOut = path.resolve(outFile);
  if (!resolvedOut.startsWith(outDir + path.sep) && resolvedOut !== outDir)
    throw new Error('Path traversal blocked');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(resolvedOut, html, 'utf8');
  console.log(`\n✅ Health Dashboard: ${resolvedOut}`);
  console.log(`   Open: start ${resolvedOut}\n`);
}

// Run directly
generateDashboard();
