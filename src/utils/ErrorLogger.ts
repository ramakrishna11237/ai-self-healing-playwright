import { Page, Request, Response } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from './Logger';

// Fixed output dirs — string literals only, no path.join/resolve with variables
const SCREENSHOT_DIR = 'test-results/screenshots';

export interface NetworkError {
  timestamp: string;
  testName: string;
  url: string;
  method: string;
  status: number;
  statusText: string;
  category: 'client_error' | 'server_error';
  requestHeaders: Record<string, string>;
  requestBody: string;
  responseBody: string;
  screenshotPath: string;
  pageUrl: string;
  durationMs: number;
}

export interface ErrorLogSession {
  sessionId: string;
  startedAt: string;
  testName: string;
  errors: NetworkError[];
  totalRequests: number;
  clientErrors: number;
  serverErrors: number;
}

// Pre-create dirs at module load — no fs ops inside tainted scopes
try {
  fs.mkdirSync('test-results/screenshots', { recursive: true });
} catch {
  /* ignore */
}
try {
  fs.mkdirSync('test-results/logs', { recursive: true });
} catch {
  /* ignore */
}

function makeScreenshotPath(): string {
  return 'test-results/screenshots/error-' + Date.now() + '.png';
}

function persistLog(data: string): void {
  const base = path.resolve('test-results', 'logs');
  const logPath = path.join(
    base,
    Date.now() + '-' + Math.random().toString(36).slice(2, 7) + '.json'
  );
  const resolved = path.resolve(logPath);
  if (!resolved.startsWith(base + path.sep)) {
    Logger.warn('ErrorLogger: path traversal blocked');
    return;
  }
  fs.writeFileSync(resolved, data, 'utf8');
  Logger.info('Error log saved: ' + resolved);
}

function writeSessionLog(session: ErrorLogSession): void {
  try {
    persistLog(JSON.stringify(session, null, 2));
  } catch (e) {
    Logger.warn('ErrorLogger: failed to write log file', e);
  }
}

export class ErrorLogger {
  private session: ErrorLogSession;
  private requestStartTimes = new Map<string, number>();
  private active = false;
  private requestHandler!: (req: Request) => void;
  private responseHandler!: (res: Response) => void;
  private captureQueue: Promise<void> = Promise.resolve();

  constructor(
    private page: Page,
    private testName: string
  ) {
    this.session = {
      sessionId: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      startedAt: new Date().toISOString(),
      testName,
      errors: [],
      totalRequests: 0,
      clientErrors: 0,
      serverErrors: 0,
    };
  }

  async start(): Promise<void> {
    if (this.active) return;
    this.active = true;

    this.requestHandler = (req: Request) => {
      this.requestStartTimes.set(req.url(), Date.now());
      this.session.totalRequests++;
    };

    this.responseHandler = (res: Response) => {
      const status = res.status();
      if (status < 400) return;
      this.captureQueue = this.captureQueue
        .then(() => this.captureError(res))
        .catch(() => {
          /* non-fatal */
        });
    };

    this.page.on('request', this.requestHandler);
    this.page.on('response', this.responseHandler);
    Logger.debug(`ErrorLogger started for: ${this.testName}`);
  }

  private async captureError(res: Response): Promise<void> {
    const status = res.status();
    const url = res.url();
    const startTime = this.requestStartTimes.get(url) ?? Date.now();
    const durationMs = Date.now() - startTime;
    const category: NetworkError['category'] = status < 500 ? 'client_error' : 'server_error';

    let responseBody = '';
    try {
      responseBody = await res.text();
      if (responseBody.length > 2000)
        responseBody = responseBody.slice(0, 2000) + '... [truncated]';
    } catch {
      responseBody = '[could not read response body]';
    }

    let requestBody = '';
    try {
      requestBody = res.request().postData() ?? '';
      // Redact sensitive fields before writing to disk
      requestBody = requestBody.replace(
        /"(password|token|secret|auth|authorization|api_key|apikey|access_token|refresh_token)"\s*:\s*"[^"]*"/gi,
        '"$1":"[REDACTED]"'
      );
      if (requestBody.length > 2000) requestBody = requestBody.slice(0, 2000) + '... [truncated]';
    } catch {
      requestBody = '';
    }

    let screenshotPath = '';
    try {
      screenshotPath = makeScreenshotPath();
      await this.page.screenshot({ path: screenshotPath, fullPage: true });
    } catch {
      screenshotPath = '[screenshot failed]';
    }

    const safeHeaders = Object.fromEntries(
      Object.entries(res.request().headers()).filter(
        ([k]) => !/(authorization|cookie|x-api-key|token)/i.test(k)
      )
    );

    const error: NetworkError = {
      timestamp: new Date().toISOString(),
      testName: this.testName,
      url,
      method: res.request().method(),
      status,
      statusText: res.statusText(),
      category,
      requestHeaders: safeHeaders,
      requestBody,
      responseBody,
      screenshotPath,
      pageUrl: this.page.url(),
      durationMs,
    };

    this.session.errors.push(error);
    if (category === 'client_error') this.session.clientErrors++;
    else this.session.serverErrors++;

    const icon = category === 'client_error' ? '🟡' : '🔴';
    Logger.error(`${icon} HTTP ${status} ${res.request().method()} ${url}`, {
      body: responseBody.slice(0, 200),
      page: this.page.url(),
    });
  }

  async stop(): Promise<void> {
    if (!this.active) return;
    this.active = false;
    this.page.off('request', this.requestHandler);
    this.page.off('response', this.responseHandler);
    await this.captureQueue;
    if (this.session.errors.length > 0) writeSessionLog(this.session);
    this.printSummary();
  }

  private printSummary(): void {
    const { totalRequests, clientErrors, serverErrors, errors } = this.session;
    if (errors.length === 0) {
      Logger.info(`✅ ErrorLogger: No HTTP errors in ${totalRequests} requests`);
      return;
    }
    Logger.warn(`\n${'─'.repeat(60)}`);
    Logger.warn(`⚠️  HTTP Errors for: ${this.testName}`);
    Logger.warn(`   Requests: ${totalRequests} | 4xx: ${clientErrors} | 5xx: ${serverErrors}`);
    Logger.warn('─'.repeat(60));
    for (const err of errors) {
      Logger.warn(`  ${err.status} ${err.method} ${err.url}`);
      Logger.warn(`     Page: ${err.pageUrl} | Time: ${err.timestamp} (${err.durationMs}ms)`);
      if (err.responseBody) Logger.warn(`     Body: ${err.responseBody.slice(0, 150)}`);
      Logger.warn(`     Screenshot: ${err.screenshotPath}`);
    }
    Logger.warn('─'.repeat(60));
  }

  getErrors(): NetworkError[] {
    return [...this.session.errors];
  }
  getClientErrors(): NetworkError[] {
    return this.session.errors.filter((e) => e.category === 'client_error');
  }
  getServerErrors(): NetworkError[] {
    return this.session.errors.filter((e) => e.category === 'server_error');
  }
  hasErrors(): boolean {
    return this.session.errors.length > 0;
  }
  getSession(): ErrorLogSession {
    return { ...this.session };
  }

  assertNoErrors(): void {
    if (!this.hasErrors()) return;
    const details = this.session.errors.map((e) => `  ${e.status} ${e.method} ${e.url}`).join('\n');
    throw new Error(
      `HTTP errors in "${this.testName}":\n  4xx: ${this.session.clientErrors} | 5xx: ${this.session.serverErrors}\n${details}`
    );
  }

  assertNoServerErrors(): void {
    const errs = this.getServerErrors();
    if (errs.length === 0) return;
    throw new Error(
      `Server errors (5xx) in "${this.testName}":\n${errs.map((e) => `  ${e.status} ${e.method} ${e.url}`).join('\n')}`
    );
  }
}
