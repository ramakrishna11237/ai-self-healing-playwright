/**
 * PreFlightCheck — Auto-fix & plain English reporting
 *
 * Runs before every test suite to:
 *   1. Detect problems silently
 *   2. Auto-fix what it can
 *   3. Tell the user exactly what happened in plain English
 *
 * End user sees a clean summary like:
 *   ✅ Site is reachable (responded in 312ms)
 *   🔧 Fixed: BASE_URL was missing — set to https://the-internet.herokuapp.com
 *   ⚠️  Credentials not set — tests that need login will be skipped
 *   ✅ Browser is ready
 */

import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';

export interface PreFlightResult {
  passed: boolean;
  fixes: string[];       // things auto-fixed silently
  warnings: string[];    // things the user should know
  errors: string[];      // things that will cause failures
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function envOr(key: string, fallback: string): string {
  if (!process.env[key]) {
    process.env[key] = fallback;
    return fallback;
  }
  return process.env[key]!;
}

function ping(url: string, timeoutMs = 8000): Promise<number> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    let parsed: URL;
    try { parsed = new URL(url); } catch { return reject(new Error(`Invalid URL: ${url}`)); }
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request(
      { hostname: parsed.hostname, port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80), path: parsed.pathname, method: 'HEAD', timeout: timeoutMs },
      (res) => { res.resume(); resolve(Date.now() - start); }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

// ── Main PreFlightCheck class ─────────────────────────────────────────────────

export class PreFlightCheck {
  private fixes: string[] = [];
  private warnings: string[] = [];
  private errors: string[] = [];

  // ── 1. Environment variables ──────────────────────────────────────────────

  private checkEnv(): void {
    // BASE_URL
    if (!process.env['BASE_URL']) {
      const fallback = 'https://the-internet.herokuapp.com';
      envOr('BASE_URL', fallback);
      this.fixes.push(`BASE_URL was not set — defaulted to "${fallback}"`);
    }

    // APP_USERNAME / APP_PASSWORD — warn but don't block
    if (!process.env['APP_USERNAME'] || !process.env['APP_PASSWORD']) {
      this.warnings.push('APP_USERNAME or APP_PASSWORD not set — tests that require login may fail');
    }

    // ORANGEHRM credentials
    if (!process.env['ORANGEHRM_USERNAME']) {
      envOr('ORANGEHRM_USERNAME', 'Admin');
      this.fixes.push('ORANGEHRM_USERNAME was not set — defaulted to "Admin"');
    }
    if (!process.env['ORANGEHRM_PASSWORD']) {
      envOr('ORANGEHRM_PASSWORD', 'admin123');
      this.fixes.push('ORANGEHRM_PASSWORD was not set — defaulted to "admin123" (public demo)');
    }

    // HEADLESS default
    if (!process.env['HEADLESS']) {
      envOr('HEADLESS', 'true');
      this.fixes.push('HEADLESS was not set — defaulted to "true" (run in background)');
    }

    // CI flag
    if (!process.env['CI']) {
      envOr('CI', 'false');
    }
  }

  // ── 2. .env file ─────────────────────────────────────────────────────────

  private checkEnvFile(): void {
    const root = process.cwd();
    const envFile = path.join(root, '.env');
    const envExample = path.join(root, '.env.example');

    if (!fs.existsSync(envFile)) {
      if (fs.existsSync(envExample)) {
        fs.copyFileSync(envExample, envFile);
        this.fixes.push('.env file was missing — created it from .env.example automatically');
      } else {
        this.warnings.push('.env file not found and no .env.example to copy from — using defaults');
      }
    }
  }

  // ── 3. Output directories ─────────────────────────────────────────────────

  private checkDirectories(): void {
    const dirs = [
      'test-results/screenshots',
      'test-results/downloads',
      'test-results/diffs',
      'test-results/logs',
      'test-results/traces',
      'test-results/sessions',
      'test-results/visual-baselines',
      'test-results/artifacts',
      'test-results/html-report',
    ];

    const missing: string[] = [];
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        ensureDir(dir);
        missing.push(dir);
      }
    }

    if (missing.length > 0) {
      this.fixes.push(`Created ${missing.length} missing output folder(s): ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '...' : ''}`);
    }
  }

  // ── 4. Site reachability ──────────────────────────────────────────────────

  private async checkSiteReachability(): Promise<void> {
    const urls: { label: string; url: string }[] = [
      { label: 'Base URL', url: process.env['BASE_URL'] ?? 'https://the-internet.herokuapp.com' },
      { label: 'OrangeHRM', url: 'https://opensource-demo.orangehrmlive.com' },
    ];

    for (const { label, url } of urls) {
      try {
        const ms = await ping(url, 8000);
        if (ms > 5000) {
          this.warnings.push(`${label} (${url}) is slow — responded in ${ms}ms. Tests may be flaky`);
        }
        // fast response — no need to report, it's expected
      } catch {
        this.warnings.push(`${label} (${url}) is unreachable right now — related tests will likely fail. Check your internet connection`);
      }
    }
  }

  // ── 5. Learning DB ────────────────────────────────────────────────────────

  private checkLearningDb(): void {
    const dbPath = process.env['FW_DB_PATH'] ?? 'learning-db.json';
    if (!fs.existsSync(dbPath)) {
      fs.writeFileSync(dbPath, '[]', 'utf8');
      this.fixes.push(`Learning database (${dbPath}) was missing — created empty one. Self-healing will start learning from this run`);
    }
  }

  // ── 6. SSL / HTTPS config ─────────────────────────────────────────────────

  private checkSSLConfig(): void {
    const ignoreSSL = process.env['IGNORE_HTTPS_ERRORS'];
    const isCI = process.env['CI'] === 'true';

    if (ignoreSSL === 'true' && isCI) {
      process.env['IGNORE_HTTPS_ERRORS'] = 'false';
      this.fixes.push('IGNORE_HTTPS_ERRORS was "true" in CI — forced to "false" for security');
    }
  }

  // ── Run all checks ────────────────────────────────────────────────────────

  async run(): Promise<PreFlightResult> {
    this.checkEnvFile();
    this.checkEnv();
    this.checkDirectories();
    this.checkLearningDb();
    this.checkSSLConfig();
    // Note: site reachability is handled by SiteAvailability in globalSetup

    return {
      passed: this.errors.length === 0,
      fixes: this.fixes,
      warnings: this.warnings,
      errors: this.errors,
    };
  }

  // ── Plain English report ──────────────────────────────────────────────────

  static report(result: PreFlightResult): void {
    const lines: string[] = [
      '',
      '╔══════════════════════════════════════════════════════════╗',
      '║           PRE-FLIGHT CHECK — Before Tests Run            ║',
      '╚══════════════════════════════════════════════════════════╝',
    ];

    if (result.fixes.length === 0 && result.warnings.length === 0 && result.errors.length === 0) {
      lines.push('  ✅ Everything looks good — no issues found');
    }

    for (const fix of result.fixes) {
      lines.push(`  🔧 Auto-fixed : ${fix}`);
    }

    for (const warn of result.warnings) {
      lines.push(`  ⚠️  Heads up   : ${warn}`);
    }

    for (const err of result.errors) {
      lines.push(`  ❌ Blocked    : ${err}`);
    }

    lines.push('  ──────────────────────────────────────────────────────────');

    if (result.errors.length > 0) {
      lines.push(`  ❌ Pre-flight FAILED — ${result.errors.length} issue(s) must be fixed before running`);
    } else if (result.warnings.length > 0) {
      lines.push(`  ✅ Pre-flight PASSED with ${result.warnings.length} warning(s) — tests will run`);
    } else {
      lines.push('  ✅ Pre-flight PASSED — all systems go!');
    }

    lines.push('╚══════════════════════════════════════════════════════════╝');
    lines.push('');

    console.log(lines.join('\n'));
  }
}
