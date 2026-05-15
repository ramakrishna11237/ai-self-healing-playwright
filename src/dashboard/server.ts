/**
 * Dashboard Server — Live Web Dashboard
 *
 * Serves a real-time web dashboard showing:
 *   - Test results (pass/fail/skipped)
 *   - Self-healing activity
 *   - Project breakdown
 *   - Historical trends
 *   - Framework vs competition
 *
 * Run: npm run dashboard:server
 * Open: http://localhost:3000
 */

import express, { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';

const app = express();
const PORT = process.env.DASHBOARD_PORT ? parseInt(process.env.DASHBOARD_PORT) : 3000;
const ROOT = process.cwd();

// ── Simple rate limiter ────────────────────────────────────────────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30;        // max requests per window
const RATE_WINDOW_MS = 60000; // 1 minute window

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT;
}

app.use((req: Request, res: Response, next) => {
  const ip = req.ip ?? 'unknown';
  if (isRateLimited(ip)) {
    res.status(429).json({ error: 'Too many requests — please wait 1 minute' });
    return;
  }
  next();
});

// ── Role-Based Access Control ─────────────────────────────────────────────────
//
// Roles:
//   admin    → sees everything (code details, locators, healing internals)
//   qa       → sees test results, failures, healing summary
//   manager  → sees pass rate, project summary, one number
//
// Set in .env:
//   DASHBOARD_ADMIN_TOKEN=secret123
//   DASHBOARD_QA_TOKEN=qatoken456
//   DASHBOARD_MANAGER_TOKEN=mgr789
//
// Access:
//   http://localhost:3000?token=secret123   → Admin view
//   http://localhost:3000?token=qatoken456  → QA view
//   http://localhost:3000?token=mgr789      → Manager view
//   http://localhost:3000                   → Public (pass rate only)

type Role = 'admin' | 'qa' | 'manager' | 'public';

type AnyObject = Record<string, unknown>;

interface ReportError {
  message?: string;
}

interface TestResult {
  title: string;
  status: string;
  duration: number;
  retry?: number;
  projectName?: string;
  errors?: ReportError[];
}

interface SpecEntry {
  title?: string;
  tests?: TestResult[];
}

interface SuiteEntry {
  title?: string;
  specs?: SpecEntry[];
  suites?: SuiteEntry[];
}

interface ReportStats {
  duration?: number;
  startTime?: string;
}

interface TestReport {
  suites?: SuiteEntry[];
  stats?: ReportStats;
}

interface HealingEntry {
  old?: string;
  new?: string;
  action?: string;
  label?: string;
  confidence?: number;
  count?: number;
  success?: boolean;
  timestamp?: number;
}

interface ProjectSummary {
  passed: number;
  failed: number;
  skipped: number;
  total: number;
}

interface FailureDetail {
  title: string;
  project?: string;
  duration?: string;
  error?: string | null;
}

interface HealSummary {
  healCount: number;
  recentHeals: number;
  successRate: number;
  topFragile: Array<{ label: string; count: number }>;
  recentHealList: Array<{
    label: string;
    action?: string;
    newLocator?: string;
    confidence?: number;
    count?: number;
  }>;
}

interface SummaryData {
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
  total: number;
  passRate: number;
  duration: string;
  startTime: string;
  status: 'PASSED' | 'FAILED';
}

interface DashboardResponse {
  summary: SummaryData;
  byProject: Record<string, ProjectSummary>;
  healing: HealSummary;
  failedTests: FailureDetail[];
  failedTotal: number;
  page: number;
  pageSize: number;
  slowest: Array<{ title: string; project?: string; duration: string }>;
  failures: AnyObject[];
  lastUpdated: string;
  role: Role;
}

const TOKENS: Record<string, Role> = {
  [process.env['DASHBOARD_ADMIN_TOKEN']   ?? 'admin-token']:   'admin',
  [process.env['DASHBOARD_QA_TOKEN']      ?? 'qa-token']:      'qa',
  [process.env['DASHBOARD_MANAGER_TOKEN'] ?? 'manager-token']: 'manager',
};

function getRole(req: Request): Role {
  const token = typeof req.query.token === 'string'
    ? req.query.token
    : typeof req.headers['x-dashboard-token'] === 'string'
      ? req.headers['x-dashboard-token']
      : undefined;
  if (!token) return 'public';
  return TOKENS[token] ?? 'public';
}

function filterByRole(data: DashboardResponse, role: Role): DashboardResponse | AnyObject {
  if (role === 'admin') return data;

  if (role === 'manager') {
    return {
      summary: data.summary,
      byProject: data.byProject,
      lastUpdated: data.lastUpdated,
      role: 'manager',
    };
  }

  if (role === 'qa') {
    return {
      summary: data.summary,
      byProject: data.byProject,
      failedTests: data.failedTests.map((t) => ({
        ...t,
        error: t.error?.slice(0, 80) ?? null,
      })),
      slowest: data.slowest,
      healing: {
        healCount: data.healing.healCount,
        recentHeals: data.healing.recentHeals,
        successRate: data.healing.successRate,
        recentHealList: data.healing.recentHealList.map((h) => ({
          label: h.label,
          action: h.action,
          confidence: h.confidence,
          count: h.count,
          newLocator: '***hidden***',
        })),
        topFragile: data.healing.topFragile,
      },
      lastUpdated: data.lastUpdated,
      role: 'qa',
    };
  }

  return {
    summary: {
      passed: data.summary.passed,
      failed: data.summary.failed,
      total: data.summary.total,
      passRate: data.summary.passRate,
      status: data.summary.status,
      duration: data.summary.duration,
      startTime: data.summary.startTime,
    },
    lastUpdated: data.lastUpdated,
    role: 'public',
  };
}

// ── Data loaders ──────────────────────────────────────────────────────────────

function loadReport(): TestReport | null {
  const file = path.join(ROOT, 'test-results', 'report.json');
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as TestReport;
  } catch {
    return null;
  }
}

function loadLearningDB(): HealingEntry[] {
  const file = path.join(ROOT, 'learning-db.json');
  if (!fs.existsSync(file)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(raw) ? raw as HealingEntry[] : [];
  } catch {
    return [];
  }
}

function loadFailureReport(): AnyObject[] {
  const file = path.join(ROOT, 'test-results', 'failure-report.json');
  if (!fs.existsSync(file)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(raw) ? raw as AnyObject[] : [];
  } catch {
    return [];
  }
}

function flattenTests(suites: SuiteEntry[], titlePath: string[] = []): TestResult[] {
  const results: TestResult[] = [];
  for (const suite of suites) {
    const current = [...titlePath, suite.title].filter(Boolean) as string[];
    if (suite.specs) {
      for (const spec of suite.specs) {
        if (!spec.tests) continue;
        for (const test of spec.tests) {
          // status is in results[0].status not test.status
          const status = (test as any).results?.[0]?.status ?? test.status ?? 'skipped';
          const duration = (test as any).results?.[0]?.duration ?? test.duration ?? 0;
          const errors = (test as any).results?.[0]?.errors ?? test.errors ?? [];
          results.push({
            title: [...current, spec.title].join(' › '),
            status,
            duration,
            retry: test.retry,
            projectName: test.projectName,
            errors,
          });
        }
      }
    }
    if (suite.suites) results.push(...flattenTests(suite.suites, current));
  }
  return results;
}

// ── API endpoints ─────────────────────────────────────────────────────────────

app.get('/api/stats', (req: Request, res: Response) => {
  const role = getRole(req);
  const page = Number.parseInt(req.query.page as string ?? '1', 10);
  const pageSize = Number.parseInt(req.query.pageSize as string ?? '50', 10);
  const report = loadReport();
  const db = loadLearningDB();
  const failures = loadFailureReport();

  if (!report) {
    return res.json({ error: 'No test results found. Run: npm test' });
  }

  const tests = flattenTests(report.suites ?? []);
  const passed = tests.filter((t) => t.status === 'passed').length;
  const failed = tests.filter((t) => t.status === 'failed').length;
  const skipped = tests.filter((t) => t.status === 'skipped').length;
  const flaky = tests.filter((t) => t.status === 'flaky').length;
  const total = passed + failed + skipped + flaky;
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;

  const byProject: Record<string, ProjectSummary> = {};
  for (const t of tests) {
    const project = t.projectName ?? 'default';
    if (!byProject[project]) byProject[project] = { passed: 0, failed: 0, skipped: 0, total: 0 };
    byProject[project].total++;
    if (t.status === 'passed') byProject[project].passed++;
    else if (t.status === 'failed') byProject[project].failed++;
    else byProject[project].skipped++;
  }

  const now = Date.now();
  const day = 86_400_000;
  const healCount = db.length;
  const recentHeals = db.filter((x) => typeof x.timestamp === 'number' && now - x.timestamp < day).length;
  const successRate = healCount > 0
    ? Math.round((db.filter((x) => x.success).length / healCount) * 100)
    : 100;

  const healMap: Record<string, number> = {};
  db.forEach((x) => {
    const key = x.label || x.old || 'unknown';
    healMap[key] = (healMap[key] ?? 0) + (x.count ?? 0);
  });
  const topFragile = Object.entries(healMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, count]) => ({ label: label.slice(0, 50), count }));

  const recentHealList = db
    .filter((x) => typeof x.timestamp === 'number' && now - x.timestamp < day)
    .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
    .slice(0, 10)
    .map((x) => ({
      label: (x.label || x.old || 'unknown').slice(0, 40),
      action: x.action,
      newLocator: x.new?.slice(0, 50),
      confidence: x.confidence,
      count: x.count,
    }));

  const allFailed = tests.filter((t) => t.status === 'failed');
  const failedTests = allFailed
    .slice((page - 1) * pageSize, page * pageSize)
    .map((t) => ({
      title: t.title,
      project: t.projectName,
      duration: (t.duration / 1000).toFixed(1),
      error: t.errors?.[0]?.message?.split('\n').slice(0, 5).join(' | ')?.slice(0, 500) ?? null,
    }));

  const slowest = tests
    .filter((t) => t.status === 'passed')
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 5)
    .map((t) => ({
      title: t.title.slice(-50),
      project: t.projectName,
      duration: (t.duration / 1000).toFixed(1),
    }));

  const fullData: DashboardResponse = {
    summary: {
      passed,
      failed,
      skipped,
      flaky,
      total,
      passRate,
      duration: ((report.stats?.duration ?? 0) / 1000).toFixed(1),
      startTime: report.stats?.startTime ?? new Date().toISOString(),
      status: failed === 0 ? 'PASSED' : 'FAILED',
    },
    byProject,
    healing: { healCount, recentHeals, successRate, topFragile, recentHealList },
    failedTests,
    failedTotal: allFailed.length,
    page,
    pageSize,
    slowest,
    failures,
    lastUpdated: new Date().toISOString(),
    role,
  };

  return res.json(filterByRole(fullData, role));
});

// ── Serve dashboard HTML ──────────────────────────────────────────────────────

app.get('/', (_req, res) => {
  const htmlFile = path.join(__dirname, 'index.html');
  if (fs.existsSync(htmlFile)) {
    res.sendFile(htmlFile);
  } else {
    res.send(getDashboardHTML());
  }
});

app.get('/health', (_req, res) => res.json({ status: 'ok', port: PORT }));

// ── History API ─────────────────────────────────────────────────────
app.get('/api/history', (req: Request, res: Response) => {
  const role = getRole(req);
  if (role === 'public') return res.status(403).json({ error: 'Access denied' });

  const historyDir = path.join(ROOT, 'test-results', 'history');
  if (!fs.existsSync(historyDir)) return res.json({ runs: [] });

  try {
    const files = fs.readdirSync(historyDir)
      .filter(f => f.startsWith('run-') && f.endsWith('.json'))
      .sort()
      .slice(-20); // last 20 runs

    const runs = files.map(f => {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(historyDir, f), 'utf8'));
        return {
          runId    : raw.runId,
          timestamp: raw.timestamp,
          passed   : raw.passed,
          failed   : raw.failed,
          skipped  : raw.skipped,
          total    : raw.total,
          passRate : raw.passRate,
          status   : raw.status,
          duration : raw.duration,
        };
      } catch { return null; }
    }).filter(Boolean);

    // Compare last 2 runs
    let comparison = null;
    if (runs.length >= 2) {
      const curr = JSON.parse(fs.readFileSync(path.join(historyDir, files[files.length - 1]), 'utf8'));
      const prev = JSON.parse(fs.readFileSync(path.join(historyDir, files[files.length - 2]), 'utf8'));

      const currTitles = new Set(curr.tests.filter((t: any) => t.status === 'passed').map((t: any) => t.title));
      const prevTitles = new Set(prev.tests.filter((t: any) => t.status === 'passed').map((t: any) => t.title));
      const currFailed = new Set(curr.tests.filter((t: any) => t.status === 'failed').map((t: any) => t.title));
      const prevFailed = new Set(prev.tests.filter((t: any) => t.status === 'failed').map((t: any) => t.title));

      comparison = {
        fixed      : [...currTitles].filter(t => prevFailed.has(t)).slice(0, 10),
        newFailures: [...currFailed].filter(t => prevTitles.has(t)).slice(0, 10),
        passRateDiff: curr.passRate - prev.passRate,
      };
    }

    return res.json({ runs, comparison });
  } catch (e) {
    return res.json({ runs: [], error: String(e).slice(0, 100) });
  }
});

// ── Inline dashboard HTML ─────────────────────────────────────────────────────

// Also expose all tests via API for passed/failed lists
app.get('/api/tests', (req: Request, res: Response) => {
  const role = getRole(req);
  if (role === 'public' || role === 'manager') {
    return res.status(403).json({ error: 'Access denied' });
  }
  const report = loadReport();
  if (!report) return res.json({ passed: [], failed: [], skipped: [] });
  const tests = flattenTests(report.suites ?? []);
  return res.json({
    passed : tests.filter(t => t.status === 'passed').map(t => ({ title: t.title, project: t.projectName, duration: (t.duration/1000).toFixed(1) })),
    failed : tests.filter(t => t.status === 'failed').map(t => ({ title: t.title, project: t.projectName, duration: (t.duration/1000).toFixed(1), error: (t.errors as any)?.[0]?.message?.slice(0,300) ?? null })),
    skipped: tests.filter(t => t.status === 'skipped').map(t => ({ title: t.title, project: t.projectName })),
  });
});

function getDashboardHTML(): string {
  return `<!DOCTYPE html><!-- v2 -->
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🤖 Automation Framework — Live Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"><\/script>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f1117;color:#e2e8f0;min-height:100vh}
    .header{background:linear-gradient(135deg,#1a1f2e,#0f1117);border-bottom:1px solid #2d3748;padding:20px 28px;display:flex;justify-content:space-between;align-items:center}
    .header h1{font-size:20px;font-weight:700;color:#fff}
    .header p{color:#718096;font-size:12px;margin-top:3px}
    .header-right{display:flex;align-items:center;gap:12px}
    .role-badge{padding:4px 10px;border-radius:12px;font-size:10px;font-weight:700;text-transform:uppercase}
    .role-admin{background:#2d1b69;color:#b794f4}
    .role-qa{background:#1a365d;color:#63b3ed}
    .role-manager{background:#1c4532;color:#48bb78}
    .role-public{background:#2d3748;color:#718096}
    .status-badge{padding:6px 14px;border-radius:20px;font-weight:700;font-size:13px}
    .pass{background:#1c4532;color:#48bb78}
    .fail{background:#3d1515;color:#fc8181}
    .live-dot{width:8px;height:8px;border-radius:50%;background:#48bb78;animation:pulse 2s infinite}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
    .live-text{font-size:11px;color:#48bb78}
    .container{max-width:1400px;margin:0 auto;padding:20px 28px}
    .grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px}
    .grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px}
    .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-bottom:16px}
    .card{background:#1a1f2e;border:1px solid #2d3748;border-radius:10px;padding:18px}
    .card .lbl{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#718096;margin-bottom:6px}
    .card .val{font-size:32px;font-weight:700}
    .card .sub{font-size:11px;color:#718096;margin-top:3px}
    .section{background:#1a1f2e;border:1px solid #2d3748;border-radius:10px;padding:18px;margin-bottom:16px}
    .section h2{font-size:12px;font-weight:600;color:#a0aec0;text-transform:uppercase;letter-spacing:1px;margin-bottom:14px;display:flex;align-items:center;gap:8px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th{text-align:left;padding:7px 10px;color:#718096;font-weight:500;border-bottom:1px solid #2d3748;font-size:10px;text-transform:uppercase}
    td{padding:8px 10px;border-bottom:1px solid #1e2535;vertical-align:top}
    tr:last-child td{border-bottom:none}
    tr:hover td{background:#1e2535}
    .g{color:#48bb78}.y{color:#ecc94b}.r{color:#fc8181}.b{color:#63b3ed}
    .badge{display:inline-block;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:600}
    .badge-b{background:#1a365d;color:#63b3ed}
    .badge-g{background:#1c4532;color:#48bb78}
    .badge-r{background:#3d1515;color:#fc8181}
    .badge-y{background:#3d3000;color:#ecc94b}
    .bar-bg{background:#2d3748;border-radius:3px;height:6px;margin-top:4px}
    .bar{border-radius:3px;height:6px;transition:width 0.5s}
    .chart-wrap{position:relative;height:220px;margin-bottom:10px}
    .chart-wrap-sm{position:relative;height:180px}
    .empty{color:#4a5568;font-size:12px;text-align:center;padding:20px}
    .comp{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}
    .comp-card{background:#0f1117;border:1px solid #2d3748;border-radius:8px;padding:12px;text-align:center}
    .comp-card.hl{border-color:#4299e1;background:#1a2744}
    .comp-card .name{font-size:10px;color:#718096;margin-bottom:6px}
    .comp-card .layers{font-size:26px;font-weight:700}
    .comp-card .price{font-size:10px;margin-top:3px}
    .refresh-btn{background:#2d3748;border:1px solid #4a5568;color:#e2e8f0;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px}
    .refresh-btn:hover{background:#4a5568}
    .error-box{background:#1e1520;border:1px solid #3d1515;border-radius:8px;padding:16px;text-align:center;color:#fc8181}
    .loading{text-align:center;padding:40px;color:#718096}
    .error-msg{color:#fc8181;font-size:10px;word-break:break-word;max-width:350px;line-height:1.4}
    .test-title{font-size:11px;word-break:break-word;max-width:280px;line-height:1.4}
    .passed-list{max-height:300px;overflow-y:auto}
    .passed-list::-webkit-scrollbar{width:4px}
    .passed-list::-webkit-scrollbar-track{background:#1a1f2e}
    .passed-list::-webkit-scrollbar-thumb{background:#4a5568;border-radius:2px}
  </style>
</head>
<body>

<div class="header">
  <div>
    <h1>🤖 AI Automation Framework — Live Dashboard</h1>
    <p id="last-updated">Loading...</p>
  </div>
  <div class="header-right">
    <div class="live-dot"></div>
    <span class="live-text">LIVE</span>
    <span id="role-badge" class="role-badge">...</span>
    <button class="refresh-btn" onclick="loadData()">🔄 Refresh</button>
    <div id="status-badge" class="status-badge">...</div>
  </div>
</div>

<div class="container" id="content">
  <div class="loading">⏳ Loading test results...</div>
</div>

<script>
async function loadData() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();

    if (data.error) {
      document.getElementById('content').innerHTML =
        '<div class="error-box">⚠️ ' + data.error + '</div>';
      return;
    }

    const s = data.summary;
    const role = data.role ?? 'public';
    const passColor = s.passRate === 100 ? '#48bb78' : s.passRate >= 90 ? '#ecc94b' : '#fc8181';

    // Show role badge
    const roleBadge = document.getElementById('role-badge');
    const roleLabels = { admin: '👑 Admin', qa: '🔬 QA Engineer', manager: '📈 Manager', public: '👁 Public' };
    roleBadge.textContent = roleLabels[role] || '👁 Public';
    roleBadge.className = 'role-badge role-' + role;

    document.getElementById('last-updated').textContent =
      'Last run: ' + new Date(s.startTime).toLocaleString() +
      '  |  Duration: ' + s.duration + 's  |  Updated: ' + new Date(data.lastUpdated).toLocaleTimeString();

    const badge = document.getElementById('status-badge');
    badge.textContent = s.status === 'PASSED' ? '✅ ALL PASSED' : '❌ ' + s.failed + ' FAILED';
    badge.className = 'status-badge ' + (s.status === 'PASSED' ? 'pass' : 'fail');

    // Manager view — simple summary only
    if (role === 'manager') {
      const projRows = Object.entries(data.byProject || {}).map(([name, p]) => {
        const rate = Math.round((p.passed / p.total) * 100);
        const c = rate === 100 ? '#48bb78' : rate >= 80 ? '#ecc94b' : '#fc8181';
        return '<tr><td><span class="badge badge-b">' + name + '</span></td><td>' + p.total + '</td>' +
          '<td><span style="color:' + c + ';font-weight:700;font-size:18px">' + rate + '%</span></td></tr>';
      }).join('');
      document.getElementById('content').innerHTML = \`
        <div class="grid4">
          <div class="card"><div class="lbl">Pass Rate</div><div class="val" style="color:\${passColor}">\${s.passRate}%</div><div class="sub">\${s.passed} of \${s.total} tests</div></div>
          <div class="card"><div class="lbl">Passed</div><div class="val g">\${s.passed}</div><div class="sub">tests successful</div></div>
          <div class="card"><div class="lbl">Failed</div><div class="val \${s.failed===0?'g':'r'}">\${s.failed}</div><div class="sub">needs attention</div></div>
          <div class="card"><div class="lbl">Duration</div><div class="val b">\${s.duration}s</div><div class="sub">total run time</div></div>
        </div>
        <div class="section"><h2>🗂️ Results by Project</h2>
          <table><tr><th>Project</th><th>Tests</th><th>Pass Rate</th></tr>\${projRows}</table>
        </div>
        <div class="section" style="text-align:center;padding:30px">
          <div style="font-size:60px;margin-bottom:10px">\${s.passRate === 100 ? '🎉' : s.passRate >= 90 ? '⚠️' : '🚨'}</div>
          <div style="font-size:24px;font-weight:700;color:\${passColor}">\${s.status}</div>
          <div style="color:#718096;margin-top:8px">\${s.passed}/\${s.total} tests passing</div>
        </div>\`;
      return;
    }

    // Public view — minimal
    if (role === 'public') {
      document.getElementById('content').innerHTML = \`
        <div style="text-align:center;padding:60px">
          <div style="font-size:80px;margin-bottom:16px">\${s.passRate === 100 ? '✅' : '❌'}</div>
          <div style="font-size:48px;font-weight:700;color:\${passColor}">\${s.passRate}%</div>
          <div style="color:#718096;margin-top:8px;font-size:16px">\${s.passed}/\${s.total} tests passing</div>
          <div style="color:#4a5568;margin-top:4px;font-size:12px">Login for detailed view</div>
        </div>\`;
      return;
    }

    // Project rows
    const projRows = Object.entries(data.byProject).map(([name, p]) => {
      const rate = Math.round((p.passed / p.total) * 100);
      const c = rate === 100 ? '#48bb78' : rate >= 80 ? '#ecc94b' : '#fc8181';
      return '<tr><td><span class="badge badge-b">' + name + '</span></td>' +
        '<td class="g">' + p.passed + '</td>' +
        '<td class="' + (p.failed > 0 ? 'r' : 'g') + '">' + p.failed + '</td>' +
        '<td class="y">' + p.skipped + '</td>' +
        '<td>' + p.total + '</td>' +
        '<td><span style="color:' + c + ';font-weight:700">' + rate + '%</span>' +
        '<div class="bar-bg"><div class="bar" style="width:' + rate + '%;background:' + c + '"></div></div></td></tr>';
    }).join('');

    // Failed rows
    const failRows = data.failedTests.length === 0
      ? '<tr><td colspan="4" class="empty">✅ No failures!</td></tr>'
      : data.failedTests.map(t =>
          '<tr>' +
          '<td class="r" style="font-size:11px;word-break:break-word;max-width:300px">' + t.title + '</td>' +
          '<td><span class="badge badge-b">' + (t.project || '—') + '</span></td>' +
          '<td class="y">' + t.duration + 's</td>' +
          '<td style="color:#fc8181;font-size:10px;word-break:break-word;max-width:400px">' + (t.error || '—') + '</td>' +
          '</tr>'
        ).join('');

    // Slowest rows
    const slowRows = data.slowest.map(t =>
      '<tr><td style="font-size:11px">' + t.title + '</td>' +
      '<td><span class="badge badge-b">' + t.project + '</span></td>' +
      '<td class="' + (parseFloat(t.duration) > 30 ? 'r' : parseFloat(t.duration) > 15 ? 'y' : 'g') + '">' + t.duration + 's</td></tr>'
    ).join('');

    // Heal rows
    const healRows = data.healing.recentHealList.length === 0
      ? '<tr><td colspan="4" class="empty">✅ No heals today — all locators stable</td></tr>'
      : data.healing.recentHealList.map(h =>
          '<tr><td style="font-size:11px">' + h.label + '</td>' +
          '<td><span class="badge badge-b">' + h.action + '</span></td>' +
          '<td class="g" style="font-size:11px">' + h.newLocator + '</td>' +
          '<td class="' + (h.confidence >= 80 ? 'g' : h.confidence >= 60 ? 'y' : 'r') + '">' + h.confidence + '%</td></tr>'
        ).join('');

    document.getElementById('content').innerHTML = \`
      <div class="grid4">
        <div class="card">
          <div class="lbl">Pass Rate</div>
          <div class="val" style="color:\${passColor}">\${s.passRate}%</div>
          <div class="sub">\${s.passed} of \${s.total} tests</div>
        </div>
        <div class="card">
          <div class="lbl">Passed</div>
          <div class="val g">\${s.passed}</div>
          <div class="sub">tests successful</div>
        </div>
        <div class="card">
          <div class="lbl">Failed</div>
          <div class="val \${s.failed === 0 ? 'g' : 'r'}">\${s.failed}</div>
          <div class="sub">\${s.skipped} skipped · \${s.flaky} flaky</div>
        </div>
        <div class="card">
          <div class="lbl">Self-Heals</div>
          <div class="val b">\${data.healing.healCount}</div>
          <div class="sub">\${data.healing.recentHeals} today · \${data.healing.successRate}% success</div>
        </div>
      </div>

      <div class="grid2">
        <div class="section">
          <h2>📊 Pass Rate</h2>
          <div class="donut">
            <svg width="110" height="110" viewBox="0 0 110 110">
              <circle cx="55" cy="55" r="45" fill="none" stroke="#2d3748" stroke-width="14"/>
              <circle cx="55" cy="55" r="45" fill="none"
                stroke="\${passColor}" stroke-width="14"
                stroke-dasharray="\${(s.passRate/100)*283} 283"
                stroke-linecap="round"/>
            </svg>
            <div class="donut-c">
              <div class="pct" style="color:\${passColor}">\${s.passRate}%</div>
              <div class="lbl">pass rate</div>
            </div>
          </div>
          <div class="legend">
            <div class="legend-item"><div class="legend-dot" style="background:#48bb78"></div>\${s.passed} Passed</div>
            <div class="legend-item"><div class="legend-dot" style="background:#fc8181"></div>\${s.failed} Failed</div>
            <div class="legend-item"><div class="legend-dot" style="background:#718096"></div>\${s.skipped} Skipped</div>
            \${s.flaky > 0 ? '<div class="legend-item"><div class="legend-dot" style="background:#ecc94b"></div>' + s.flaky + ' Flaky</div>' : ''}
          </div>
        </div>

        <div class="section">
          <h2>🗂️ By Project</h2>
          <table>
            <tr><th>Project</th><th>✅</th><th>❌</th><th>⏭</th><th>Total</th><th>Rate</th></tr>
            \${projRows}
          </table>
        </div>
      </div>

      <div class="section">
        <h2>❌ Failed Tests (\${s.failed})</h2>
        <table>
          <tr><th>Test</th><th>Project</th><th>Duration</th><th>Error</th></tr>
          \${failRows}
        </table>
      </div>

      <div class="grid2">
        <div class="section">
          <h2>🧠 Self-Healing Activity (Today)</h2>
          <table>
            <tr><th>Step</th><th>Action</th><th>Healed To</th><th>Confidence</th></tr>
            \${healRows}
          </table>
        </div>

        <div class="section">
          <h2>🐢 Slowest Tests</h2>
          <table>
            <tr><th>Test</th><th>Project</th><th>Duration</th></tr>
            \${slowRows}
          </table>
        </div>
      </div>

      <div class="section">
        <h2>🏆 Framework Comparison — Healing Layers</h2>
        <div class="comp">
          <div class="comp-card hl">
            <div class="name">Your Framework</div>
            <div class="layers g">9</div>
            <div class="price g">Free</div>
          </div>
          <div class="comp-card">
            <div class="name">Healenium</div>
            <div class="layers y">1</div>
            <div class="price g">Free</div>
          </div>
          <div class="comp-card">
            <div class="name">Testim</div>
            <div class="layers y">3</div>
            <div class="price r">$$$$</div>
          </div>
          <div class="comp-card">
            <div class="name">Mabl</div>
            <div class="layers y">3</div>
            <div class="price r">$$$$</div>
          </div>
          <div class="comp-card">
            <div class="name">Playwright</div>
            <div class="layers r">0</div>
            <div class="price g">Free</div>
          </div>
        </div>
      </div>
    \`;
  } catch(e) {
    document.getElementById('content').innerHTML =
      '<div class="error-box">❌ Failed to load data: ' + e.message + '</div>';
  }
}

// Load on start + auto-refresh every 30 seconds
loadData();
setInterval(loadData, 30000);
</script>
</body>
</html>`;
}

// ── Start server ──────────────────────────────────────────────────────────────

const server = http.createServer(app);

server.listen(PORT, () => {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║   🤖  Automation Framework — Live Dashboard            ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`\n  ✅ Dashboard running at: http://localhost:${PORT}`);
  console.log(`  🔄 Auto-refreshes every 30 seconds`);
  console.log(`  📊 Run tests to update: npm test`);
  console.log('\n  Press Ctrl+C to stop\n');
});

export default app;
