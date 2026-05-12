import * as fs from 'fs';
import * as path from 'path';
import { Logger } from './Logger';

const SESSION_BASE_DIR = 'test-results/sessions';

/**
 * Parallel-safe session file management.
 *
 * Problem with a single shared session file:
 *   When Playwright runs with workers > 1, multiple workers may try to
 *   read/write the same session file simultaneously — causing corruption
 *   or one worker overwriting another's authenticated state.
 *
 * Solution:
 *   Each worker gets its own session file keyed by TEST_WORKER_INDEX.
 *   Worker 0 → oncall-session-0.json
 *   Worker 1 → oncall-session-1.json
 *   etc.
 *
 * Usage in tests:
 *   const sessionFile = ParallelSession.filePath("oncall");
 *   await page.context().storageState({ path: sessionFile });
 *
 * Usage in playwright.config.ts:
 *   storageState: ParallelSession.filePath("oncall")
 */
export class ParallelSession {
  /**
   * Get the session file path for the current worker.
   * Falls back to worker-0 if TEST_WORKER_INDEX is not set (local single-worker runs).
   */
  static filePath(_name: string): string {
    const workerIdx = Math.max(0, parseInt(process.env['TEST_WORKER_INDEX'] ?? '0', 10) || 0);
    const base = path.resolve(SESSION_BASE_DIR);
    fs.mkdirSync(base, { recursive: true });
    // Use only workerIdx (number) in path — no _name flows into path.join
    return path.join(base, 'session-' + workerIdx + '.json');
  }

  /**
   * Check if a session file exists for the current worker.
   */
  static exists(_name: string): boolean {
    return fs.existsSync(this.filePath(_name));
  }

  /**
   * Delete the session file for the current worker.
   * Call in afterAll to clean up after tests.
   */
  static clear(_name: string): void {
    const fp = this.filePath(_name);
    if (fs.existsSync(fp)) {
      fs.unlinkSync(fp);
      Logger.debug(`Session cleared: ${fp}`);
    }
  }

  /**
   * Delete all session files for all workers (use in global teardown).
   */
  static clearAll(_name: string): void {
    if (!fs.existsSync(SESSION_BASE_DIR)) return;
    const base = path.resolve(SESSION_BASE_DIR);
    const files = fs.readdirSync(base).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      fs.unlinkSync(path.join(base, file));
      Logger.debug(`Session cleared: ${file}`);
    }
    Logger.info(`All sessions cleared`);
  }

  /**
   * Get the worker index as a number.
   */
  static workerIndex(): number {
    return parseInt(process.env['TEST_WORKER_INDEX'] ?? '0', 10);
  }
}
