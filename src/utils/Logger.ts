import { DEFAULT_CONFIG } from '../config';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: LogLevel[] = ['debug', 'info', 'warn', 'error'];
const LEVEL_MAP: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function ts(): string {
  return new Date().toISOString();
}

function sanitizeLabel(label: string): string {
  return (
    String(label)
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x1f\x7f]/g, '')
      .slice(0, 200)
  );
}

// Redact sensitive patterns from log messages
const SENSITIVE_PATTERN =
  /(?:"(?:password|passwd|token|secret|auth|bearer|api[_-]?key|access_token|refresh_token|x-api-key|x-auth-token|session|cookie)["\\s]*:[\\s"]*|(?:password|passwd|token|secret|auth|bearer|api[_-]?key|access_token|refresh_token|x-session-id)[^\s"'=:]*[\s"'=:]+)([^\s"'&,;\\]{4,})/gi;
function redact(msg: string): string {
  return msg.replace(SENSITIVE_PATTERN, (match, val: string) =>
    match.replace(val, '***REDACTED***')
  );
}

export class Logger {
  private static _levelNum: number = LEVEL_MAP[DEFAULT_CONFIG.logLevel] ?? 1;

  static setLevel(level: LogLevel): void {
    this._levelNum = LEVEL_MAP[level] ?? 1;
  }

  static getLevel(): LogLevel {
    return LEVEL_ORDER[this._levelNum] ?? 'info';
  }

  static debug(msg: string, context?: unknown): void {
    if (this._levelNum !== 0) return;
    const extra = context !== undefined && context !== '' ? ` ${JSON.stringify(context)}` : '';
    console.log(`${ts()} -  [debug] ${redact(sanitizeLabel(msg))}${extra}`);
  }

  static info(msg: string, context?: unknown): void {
    if (this._levelNum > 1) return;
    const extra = context !== undefined && context !== '' ? ` ${JSON.stringify(context)}` : '';
    console.log(`${ts()} -  ${redact(msg)}${extra}`);
  }

  static warn(msg: string, context?: unknown): void {
    if (this._levelNum > 2) return;
    const extra = context !== undefined && context !== '' ? ` ${JSON.stringify(context)}` : '';
    console.warn(`${ts()} -  [warn] ${redact(msg)}${extra}`);
  }

  static error(msg: string, context?: unknown): void {
    const extra = context !== undefined && context !== '' ? ` ${JSON.stringify(context)}` : '';
    console.error(`${ts()} -  [error] ${redact(msg)}${extra}`);
  }

  static success(msg: string, context?: unknown): void {
    if (this._levelNum > 1) return;
    const extra = context !== undefined && context !== '' ? ` ${JSON.stringify(context)}` : '';
    console.log(`${ts()} -  ${redact(msg)}${extra}`);
  }

  static time(label: string): void {
    if (this._levelNum === 0) console.time(`${ts()} -  ${sanitizeLabel(label)}`);
  }

  static timeEnd(label: string): void {
    if (this._levelNum === 0) console.timeEnd(`${ts()} -  ${sanitizeLabel(label)}`);
  }

  static stepStart(label: string, _stepNum: number, _total: number): void {
    if (this._levelNum > 1) return;
    console.log(`${ts()} -  ${sanitizeLabel(label)}: running`);
  }

  static stepPass(label: string, durationMs: number, soft = false): void {
    if (this._levelNum > 1) return;
    const tag = soft ? ' (soft)' : '';
    console.log(`${ts()} -  ${sanitizeLabel(label)}: passed${tag} ${durationMs}ms`);
  }

  static stepFail(label: string, durationMs: number, error: string, soft = false): void {
    if (this._levelNum > 2) return;
    const tag = soft ? ' (soft)' : '';
    const firstLine = error.split('\n').find((l) => l.trim().length > 4) ?? error.slice(0, 120);
    console.log(
      `${ts()} -  ${sanitizeLabel(label)}: failed${tag} ${durationMs}ms — ${firstLine.slice(0, 120)}`
    );
  }

  static stepSkip(label: string): void {
    if (this._levelNum > 1) return;
    console.log(`${ts()} -  ${sanitizeLabel(label)}: skipped`);
  }

  static workflowStart(name: string, suite: string, stepCount: number): void {
    if (this._levelNum > 1) return;
    console.log(`${ts()} -  ${name}: started [${suite.toUpperCase()}] ${stepCount} steps`);
  }

  static workflowEnd(
    name: string,
    passed: number,
    failed: number,
    softFailed: number,
    skipped: number,
    durationMs: number
  ): void {
    if (this._levelNum > 1) return;
    const status = failed > 0 ? 'failed' : softFailed > 0 ? 'warned' : 'passed';
    const parts = [`${passed} passed`];
    if (failed > 0) parts.push(`${failed} failed`);
    if (softFailed > 0) parts.push(`${softFailed} soft`);
    if (skipped > 0) parts.push(`${skipped} skipped`);
    console.log(
      `${ts()} -  ${name}: ${status} — ${parts.join(', ')} (${(durationMs / 1000).toFixed(1)}s)`
    );
  }

  static workflowRetry(name: string, attempt: number, max: number): void {
    if (this._levelNum > 2) return;
    console.warn(`${ts()} -  ${name}: retrying (${attempt}/${max})`);
  }
}
