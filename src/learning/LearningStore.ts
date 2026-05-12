import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/Logger';
import { DEFAULT_CONFIG } from '../config';
import { GENERIC_LOCATORS } from '../engine/LocatorEngine';

export interface LearnedFix {
  old: string;
  new: string;
  action: string;
  label: string;
  timestamp: number;
  success: boolean;
  count: number;
  confidence: number;
  schemaVersion: number;
}

const DB_MAX_ENTRIES = 500;
const DB_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SCHEMA_VERSION = 1;
const LOCK_TIMEOUT_MS = 5000; // max wait for lock
const LOCK_RETRY_MS = 50; // poll interval

function computeConfidence(fix: Pick<LearnedFix, 'count' | 'timestamp' | 'success'>): number {
  const countScore = Math.min(40, (fix.count / 50) * 40);
  const ageMs = Date.now() - fix.timestamp;
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  // Exponential decay: today=40pts, 7 days=20pts, 30 days=5pts
  const recencyScore = Math.max(0, 40 * Math.exp(-ageDays / 10));
  const successScore = fix.success ? 20 : 0;
  return Math.round(countScore + recencyScore + successScore);
}

let cache: LearnedFix[] | null = null;

function resolveDbPath(): string {
  const configured = DEFAULT_CONFIG.dbPath;
  if (path.isAbsolute(configured)) return configured;
  const projectRoot = path.resolve(__dirname, '..', '..');
  return path.join(projectRoot, configured);
}

// ── Cross-process file lock ───────────────────────────────────────────────────
// Uses a .lock file with PID + timestamp to prevent parallel worker corruption.
// Lock is automatically released if the holding process dies (stale lock detection).

function lockPath(dbPath: string): string {
  return `${dbPath}.lock`;
}

function isLockStale(lockFile: string): boolean {
  try {
    const content = fs.readFileSync(lockFile, 'utf8');
    const { pid, ts } = JSON.parse(content) as { pid: number; ts: number };
    // Stale if: process no longer exists OR lock is older than LOCK_TIMEOUT_MS
    const tooOld = Date.now() - ts > LOCK_TIMEOUT_MS * 2;
    if (tooOld) return true;
    // Check if PID is still alive (cross-platform)
    try {
      process.kill(pid, 0);
      return false;
    } catch {
      return true;
    }
  } catch {
    return true; // can't read lock = treat as stale
  }
}

async function acquireLock(dbPath: string): Promise<boolean> {
  const lock = lockPath(dbPath);
  const deadline = Date.now() + LOCK_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      // wx flag = fail if file exists — atomic on all platforms
      fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, ts: Date.now() }), { flag: 'wx' });
      return true;
    } catch {
      // Lock exists — check if stale
      if (fs.existsSync(lock) && isLockStale(lock)) {
        try {
          fs.unlinkSync(lock);
        } catch {
          /* race — another worker got it */
        }
        continue;
      }
      // Wait and retry
      await new Promise((r) => setTimeout(r, LOCK_RETRY_MS));
    }
  }

  Logger.warn('LearningStore: could not acquire lock — writing without lock (data may merge)');
  return false;
}

function releaseLock(dbPath: string): void {
  try {
    fs.unlinkSync(lockPath(dbPath));
  } catch {
    /* already gone */
  }
}

function isValidEntry(x: unknown): x is LearnedFix {
  if (!x || typeof x !== 'object') return false;
  const e = x as Record<string, unknown>;
  return (
    typeof e['old'] === 'string' &&
    e['old'].length > 0 &&
    typeof e['new'] === 'string' &&
    e['new'].length > 0 &&
    typeof e['action'] === 'string'
  );
}

function readDB(): LearnedFix[] {
  if (cache !== null) return cache;

  const dbPath = resolveDbPath();
  if (!fs.existsSync(dbPath)) {
    cache = [];
    return cache;
  }
  try {
    const raw = fs.readFileSync(dbPath, 'utf8');
    const parsed = JSON.parse(raw);
    cache = Array.isArray(parsed) ? parsed.filter(isValidEntry) : [];
    return cache;
  } catch {
    // Primary file corrupted — try backup
    const backup = `${dbPath}.bak`;
    if (fs.existsSync(backup)) {
      try {
        const raw = fs.readFileSync(backup, 'utf8');
        const parsed = JSON.parse(raw);
        cache = Array.isArray(parsed) ? parsed.filter(isValidEntry) : [];
        Logger.warn(`learning-db corrupted — restored from backup (${cache.length} entries)`);
        return cache;
      } catch {
        /* backup also corrupted */
      }
    }
    Logger.warn(`learning-db corrupted at "${dbPath}", starting fresh`);
    cache = [];
    return cache;
  }
}

function pruneDB(db: LearnedFix[]): LearnedFix[] {
  const now = Date.now();
  const fresh = db.filter((x) => now - x.timestamp < DB_TTL_MS);
  if (fresh.length <= DB_MAX_ENTRIES) return fresh;
  return fresh.sort((a, b) => b.count - a.count).slice(0, DB_MAX_ENTRIES);
}

const MAX_WRITE_RETRIES = 3;

async function writeDBLocked(db: LearnedFix[]): Promise<void> {
  const dbPath = resolveDbPath();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const locked = await acquireLock(dbPath);
  try {
    // Re-read DB after acquiring lock — another worker may have written since we read
    if (locked) {
      const fresh = readDBFromDisk(dbPath);
      // Merge: keep all entries from disk, update counts for entries we have
      for (const entry of db) {
        const existing = fresh.find(
          (x) => x.old === entry.old && x.new === entry.new && x.action === entry.action
        );
        if (existing) {
          existing.count = Math.max(existing.count, entry.count);
          existing.timestamp = Math.max(existing.timestamp, entry.timestamp);
          if (entry.success) existing.success = true;
          existing.confidence = computeConfidence(existing);
        } else {
          fresh.push(entry);
        }
      }
      db = pruneDB(fresh);
    }
    writeDBRaw(dbPath, db);
    cache = db; // update in-memory cache so same-process reads see fresh data
  } finally {
    if (locked) releaseLock(dbPath);
  }
}

function readDBFromDisk(dbPath: string): LearnedFix[] {
  if (!fs.existsSync(dbPath)) return [];
  try {
    const raw = fs.readFileSync(dbPath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isValidEntry) : [];
  } catch {
    const backup = `${dbPath}.bak`;
    if (fs.existsSync(backup)) {
      try {
        const raw = fs.readFileSync(backup, 'utf8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter(isValidEntry) : [];
      } catch {
        /* backup also corrupted */
      }
    }
    return [];
  }
}

function writeDBRaw(dbPath: string, db: LearnedFix[]): void {
  const tmp = `${dbPath}.tmp`;
  const backup = `${dbPath}.bak`;
  const json = JSON.stringify(db, null, 2);

  for (let attempt = 1; attempt <= MAX_WRITE_RETRIES; attempt++) {
    try {
      fs.writeFileSync(tmp, json, 'utf8');
      if (fs.existsSync(dbPath)) {
        try {
          fs.copyFileSync(dbPath, backup);
        } catch {
          /* non-fatal */
        }
      }
      try {
        fs.renameSync(tmp, dbPath);
      } catch {
        fs.copyFileSync(tmp, dbPath);
        try {
          fs.unlinkSync(tmp);
        } catch {
          /* non-fatal */
        }
      }
      return;
    } catch (e) {
      Logger.warn(
        `LearningStore write attempt ${attempt}/${MAX_WRITE_RETRIES} failed: ${String(e)}`
      );
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* non-fatal */
      }
      if (attempt === MAX_WRITE_RETRIES) {
        Logger.error('LearningStore: all write attempts failed — fix will not persist', e);
      }
    }
  }
}

function sanitizeLocator(loc: string): string {
  if (!loc || typeof loc !== 'string') return '';
  // Strip null bytes and control characters, limit length
  return loc.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').slice(0, 500);
}

export function updateFix(
  oldLocator: string,
  newLocator: string,
  success = true,
  action = 'click',
  label = ''
): void {
  const safeOld = sanitizeLocator(oldLocator);
  const safeNew = sanitizeLocator(newLocator);
  const safeAction = String(action)
    .replace(/[^a-zA-Z0-9_]/g, '')
    .slice(0, 50);
  const safeLabel = String(label)
    .replace(/[\x00-\x1f\x7f]/g, '')
    .slice(0, 200);

  if (!safeOld || !safeNew) {
    Logger.warn('updateFix: empty locator', { oldLocator: safeOld, newLocator: safeNew });
    return;
  }
  if (safeOld === safeNew) return;
  if (GENERIC_LOCATORS.has(safeNew)) {
    Logger.debug(`updateFix: skipping generic locator "${safeNew}"`);
    return;
  }

  // Build the updated in-memory DB entry first
  const db = readDB();
  const existing = db.find(
    (x) => x.old === safeOld && x.new === safeNew && x.action === safeAction
  );
  if (existing) {
    existing.count += 1;
    existing.timestamp = Date.now();
    if (success) existing.success = true;
    if (safeLabel && !existing.label) existing.label = safeLabel;
    existing.confidence = computeConfidence(existing);
  } else {
    db.push({
      old: safeOld,
      new: safeNew,
      action: safeAction,
      label: safeLabel,
      timestamp: Date.now(),
      success,
      count: 1,
      confidence: computeConfidence({ count: 1, timestamp: Date.now(), success }),
      schemaVersion: SCHEMA_VERSION,
    });
  }

  // Write with cross-process lock — fire-and-forget (non-blocking)
  writeDBLocked(pruneDB(db))
    .then(() => Logger.info(`📚 Learning stored: [${safeAction}]`))
    .catch((e) => Logger.error('updateFix failed', e));
}

export function getAllFixes(): LearnedFix[] {
  return readDB();
}

export function clearFixes(): void {
  cache = null;
  writeDBLocked([]).catch((e) => Logger.error('clearFixes failed', e));
  Logger.info('Learning DB cleared');
}
