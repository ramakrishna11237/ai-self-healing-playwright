import * as fs from 'fs';
import * as path from 'path';
import { BrowserContext } from '@playwright/test';
import { Logger } from './Logger';

const TRACE_DIR = 'test-results/traces';

/**
 * TraceManager — wraps Playwright's built-in tracing API.
 *
 * Playwright traces give you:
 *  - Full action timeline with before/after DOM snapshots
 *  - Network requests and responses
 *  - Console logs
 *  - Screenshots at every step
 *  - One-click debugging: npx playwright show-trace <path>
 *
 * Usage:
 *   const trace = new TraceManager(context);
 *   await trace.start("login-workflow");
 *   // ... run steps ...
 *   const tracePath = await trace.stop();  // returns path to .zip
 *   // Open: npx playwright show-trace test-results/traces/login-workflow.zip
 */
export class TraceManager {
  private active = false;
  private traceName = '';

  constructor(private context: BrowserContext) {}

  /**
   * Start recording a trace for a workflow.
   * @param name  Workflow name — used as the trace filename
   */
  async start(name: string): Promise<void> {
    if (this.active) {
      Logger.warn(`TraceManager: already recording "${this.traceName}" — stop it first`);
      return;
    }

    const traceDir = path.resolve(TRACE_DIR);
    fs.mkdirSync(traceDir, { recursive: true });
    this.traceName = path.basename(
      name
        .replace(/[^a-z0-9-_]/gi, '_')
        .replace(/\.\./g, '_')
        .slice(0, 80)
    );

    await this.context.tracing.start({
      screenshots: true, // screenshot at every action
      snapshots: true, // DOM snapshot before/after every action
      sources: true, // include source files for stack traces
    });

    this.active = true;
    Logger.info(`Trace started: "${this.traceName}"`);
  }

  /**
   * Stop recording and save the trace file.
   * @returns Absolute path to the .zip trace file, or null if not recording
   */
  async stop(): Promise<string | null> {
    if (!this.active) {
      Logger.debug('TraceManager: not recording — nothing to stop');
      return null;
    }

    const tracePath = path.resolve(path.join(TRACE_DIR, `${this.traceName}-${Date.now()}.zip`));
    const traceDir = path.resolve(TRACE_DIR);
    if (!tracePath.startsWith(traceDir + path.sep)) {
      Logger.error('TraceManager: path traversal blocked');
      this.active = false;
      return null;
    }

    try {
      await this.context.tracing.stop({ path: tracePath });
      this.active = false;
      Logger.info(`Trace saved: ${tracePath}`);
      Logger.info(`View trace: npx playwright show-trace "${tracePath}"`);
      return tracePath;
    } catch (e) {
      Logger.error('TraceManager: failed to stop trace', e);
      this.active = false;
      return null;
    }
  }

  /**
   * Stop and discard the trace — use when test passed and trace not needed.
   */
  async discard(): Promise<void> {
    if (!this.active) return;
    try {
      await this.context.tracing.stop();
    } catch {
      /* non-fatal */
    }
    this.active = false;
    Logger.debug(`Trace discarded: "${this.traceName}"`);
  }

  /**
   * Wrap a workflow with automatic trace start/stop.
   * Saves trace on failure, discards on success (saves disk space).
   *
   * @example
   *   const tracePath = await trace.wrap("login", async () => {
   *     await runSteps(page, loginSteps);
   *   });
   */
  async wrap(name: string, fn: () => Promise<void>): Promise<string | null> {
    await this.start(name);
    try {
      await fn();
      await this.discard(); // passed — no trace needed
      return null;
    } catch (e) {
      const tracePath = await this.stop(); // failed — save trace
      Logger.warn(`Trace captured for failed workflow "${name}": ${tracePath}`);
      throw e; // re-throw so test still fails
    }
  }

  /**
   * List all saved trace files.
   */
  static listTraces(): string[] {
    if (!fs.existsSync(TRACE_DIR)) return [];
    return fs
      .readdirSync(TRACE_DIR)
      .filter((f) => f.endsWith('.zip'))
      .map((f) => path.join(TRACE_DIR, f));
  }

  /**
   * Print the command to open a trace in Playwright's trace viewer.
   */
  static viewCommand(tracePath: string): string {
    return `npx playwright show-trace "${tracePath}"`;
  }

  /**
   * Delete all saved traces — call in global teardown to clean up.
   */
  static clearAll(): void {
    if (!fs.existsSync(TRACE_DIR)) return;
    const files = fs.readdirSync(TRACE_DIR).filter((f) => f.endsWith('.zip'));
    files.forEach((f) => fs.unlinkSync(path.join(TRACE_DIR, f)));
    Logger.info(`TraceManager: cleared ${files.length} trace(s)`);
  }

  isActive(): boolean {
    return this.active;
  }
}
