import * as fs from 'fs';
import * as path from 'path';
import { Logger } from './Logger';
import { DEFAULT_CONFIG } from '../config';

export interface TestDataRecord {
  key: string;
  value: string;
  createdAt: string;
  runId: string; // which run created this — prevents stale data reuse
  testName: string;
  cleanedUp: boolean;
}

export interface TestDataStore {
  records: TestDataRecord[];
}

// Records older than this are automatically pruned on load (24 hours)
const RECORD_TTL_MS = 24 * 60 * 60 * 1000;

export class TestDataManager {
  private store: TestDataStore;
  private storePath: string;
  private runId: string;
  private testName: string;

  constructor(testName = 'unknown') {
    this.testName = testName;
    this.runId = process.env['FW_RUN_ID'] ?? `run-${Date.now()}`;
    const dir = path.join(DEFAULT_CONFIG.logDir, 'test-data');
    const base = path.resolve(dir);
    fs.mkdirSync(base, { recursive: true });
    // Use runId as filename — no testName flows into path.join
    this.storePath = path.join(base, `${this.runId}.json`);
    this.store = this.loadStore();
  }

  private loadStore(): TestDataStore {
    const empty: TestDataStore = { records: [] };
    try {
      if (!fs.existsSync(this.storePath)) return empty;
      const raw = fs.readFileSync(this.storePath, 'utf8');
      const parsed = JSON.parse(raw) as TestDataStore;
      if (!Array.isArray(parsed.records)) return empty;
      const now = Date.now();
      const runId = this.runId;
      parsed.records = parsed.records.filter(
        (r) =>
          r.runId === runId && !r.cleanedUp && now - new Date(r.createdAt).getTime() < RECORD_TTL_MS
      );
      return parsed;
    } catch {
      return empty;
    }
  }

  private saveStore(): void {
    try {
      const data = JSON.stringify(this.store, null, 2);
      const target = this.storePath;
      const tmp = target + '.tmp';
      fs.writeFileSync(tmp, data, 'utf8');
      try {
        fs.renameSync(tmp, target);
      } catch {
        fs.copyFileSync(tmp, target);
        fs.unlinkSync(tmp);
      }
    } catch (e) {
      Logger.warn('TestDataManager: failed to save store', e);
    }
  }

  /**
   * Get a test data value.
   *
   * Priority order:
   * 1. Environment variable (highest — CI injects specific values)
   * 2. Already generated in this run (reuse within same run)
   * 3. Generate a new value using the generator function
   *
   * Records from previous runs are NEVER reused — each run gets fresh data.
   *
   * @param key         Unique identifier for this data point
   * @param envVar      Environment variable to check first (e.g. "TEST_OFFICER_ROW")
   * @param generator   Function that generates a value if env var not set
   * @param testName    Test name for tracking
   *
   * @example
   *   const officer = data.get(
   *     "officerRow",
   *     "TEST_OFFICER_ROW",
   *     () => "Select 10242424 SANJEEV LADE",
   *     "Create Employee Record"
   *   );
   */
  get(key: string, envVar: string, generator: () => string, testName?: string): string {
    const resolvedTestName = testName ?? this.testName;
    // 1. Environment variable — highest priority, used in CI
    const envValue = process.env[envVar];
    if (envValue) {
      Logger.debug(`TestData [env]: ${envVar}="${envValue}"`);
      return envValue;
    }

    // 2. Already generated in THIS run — reuse for consistency within a test run
    const existing = this.store.records.find(
      (r) => r.key === key && r.runId === this.runId && !r.cleanedUp
    );
    if (existing) {
      Logger.debug(`TestData [reuse]: "${key}"="${existing.value}"`);
      return existing.value;
    }

    // 3. Generate fresh value
    const value = generator();
    this.store.records.push({
      key,
      value,
      createdAt: new Date().toISOString(),
      runId: this.runId,
      testName: resolvedTestName,
      cleanedUp: false,
    });
    this.saveStore();
    Logger.debug(`TestData [new]: "${key}"="${value}"`);
    return value;
  }

  /** Mark a data record as cleaned up so it is not reused */
  markCleanedUp(key: string): void {
    const record = this.store.records.find((r) => r.key === key && r.runId === this.runId);
    if (record) {
      record.cleanedUp = true;
      this.saveStore();
      Logger.debug(`TestData [cleaned]: "${key}"`);
    }
  }

  /** Get all records created in this run */
  getAll(): TestDataRecord[] {
    return this.store.records.filter((r) => r.runId === this.runId);
  }

  /** Clear all records for this run */
  clearRun(): void {
    this.store.records = this.store.records.filter((r) => r.runId !== this.runId);
    this.saveStore();
    Logger.debug(`TestData: cleared all records for run ${this.runId}`);
  }

  // ── Static generators ───────────────────────────────────────────────────────

  /** Generate a unique timestamp-based identifier */
  static uniqueId(prefix = 'TEST'): string {
    return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
  }

  /** Generate today's date in the specified format */
  static today(format: 'MM/DD/YYYY' | 'YYYY-MM-DD' | 'DD/MM/YYYY' = 'MM/DD/YYYY'): string {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    if (format === 'YYYY-MM-DD') return `${yyyy}-${mm}-${dd}`;
    if (format === 'DD/MM/YYYY') return `${dd}/${mm}/${yyyy}`;
    return `${mm}/${dd}/${yyyy}`;
  }

  /** Generate a date N days from today */
  static daysFromNow(days: number, format: 'MM/DD/YYYY' | 'YYYY-MM-DD' = 'MM/DD/YYYY'): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    if (format === 'YYYY-MM-DD') return `${yyyy}-${mm}-${dd}`;
    return `${mm}/${dd}/${yyyy}`;
  }

  /** Get today's day number as string — for calendar date pickers */
  static todayDay(): string {
    return String(new Date().getDate());
  }

  /** Generate a unique test email */
  static uniqueEmail(domain = 'test.example.com'): string {
    return `test-${Date.now().toString(36)}@${domain}`;
  }

  /** Generate a unique test record name with timestamp */
  static uniqueName(prefix = 'Test Record'): string {
    return `${prefix} ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`;
  }
}
