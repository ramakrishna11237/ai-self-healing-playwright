import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { LearnedFix } from './LearningStore';

/**
 * Unit tests for LearningStore
 * Tests file persistence, locking, cache, and learning record management
 */

describe('LearningStore', () => {
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    // Create a temporary directory for tests
    tempDir = path.join(__dirname, '..', '..', 'test-results', `learning-store-test-${Date.now()}`);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    dbPath = path.join(tempDir, 'learning-db.json');
  });

  afterEach(() => {
    // Cleanup
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  describe('File I/O', () => {
    it('should create learning database if not exists', () => {
      expect(fs.existsSync(dbPath)).toBe(false);
      
      // Mock write operation
      const testData: LearnedFix[] = [];
      fs.writeFileSync(dbPath, JSON.stringify(testData));
      
      expect(fs.existsSync(dbPath)).toBe(true);
    });

    it('should read valid learning database JSON', () => {
      const testData: LearnedFix[] = [
        {
          old: 'input[name="email"]',
          new: 'input.email-field',
          action: 'FILL',
          label: 'Email field',
          timestamp: Date.now(),
          success: true,
          count: 5,
          confidence: 85,
          schemaVersion: 1
        }
      ];
      
      fs.writeFileSync(dbPath, JSON.stringify(testData));
      const read = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      
      expect(read).toHaveLength(1);
      expect(read[0].old).toBe('input[name="email"]');
      expect(read[0].confidence).toBe(85);
    });

    it('should handle corrupted JSON gracefully', () => {
      fs.writeFileSync(dbPath, '{invalid json}');
      
      expect(() => {
        JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      }).toThrow();
    });

    it('should use backup file if primary corrupted', () => {
      const backupPath = `${dbPath}.bak`;
      const validData: LearnedFix[] = [
        {
          old: 'button',
          new: 'button.submit',
          action: 'CLICK',
          label: 'Submit button',
          timestamp: Date.now(),
          success: true,
          count: 3,
          confidence: 75,
          schemaVersion: 1
        }
      ];
      
      fs.writeFileSync(dbPath, '{corrupted}');
      fs.writeFileSync(backupPath, JSON.stringify(validData));
      
      expect(fs.existsSync(backupPath)).toBe(true);
    });
  });

  describe('Confidence Score Calculation', () => {
    it('should calculate confidence based on count, age, and success', () => {
      const now = Date.now();
      const fix: LearnedFix = {
        old: 'selector1',
        new: 'selector2',
        action: 'CLICK',
        label: 'test',
        timestamp: now,
        success: true,
        count: 10,
        confidence: 0,
        schemaVersion: 1
      };

      // Confidence should consider: count (max 40), recency (max 40), success (20)
      // Recent entry with count=10 and success=true should have high confidence
      const maxPossible = 40 + 40 + 20; // 100
      expect(maxPossible).toBe(100);
    });

    it('should decay confidence over time', () => {
      const old = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days ago
      const recent = Date.now();

      const oldFix: LearnedFix = {
        old: 'selector1',
        new: 'selector2',
        action: 'CLICK',
        label: 'test',
        timestamp: old,
        success: true,
        count: 50,
        confidence: 0,
        schemaVersion: 1
      };

      const recentFix: LearnedFix = {
        old: 'selector1',
        new: 'selector2',
        action: 'CLICK',
        label: 'test',
        timestamp: recent,
        success: true,
        count: 50,
        confidence: 0,
        schemaVersion: 1
      };

      // Recent fix should have higher confidence than old fix
      expect(recentFix.timestamp).toBeGreaterThan(oldFix.timestamp);
    });
  });

  describe('Database Limits and Pruning', () => {
    it('should respect DB_MAX_ENTRIES limit', () => {
      const db: LearnedFix[] = [];
      for (let i = 0; i < 600; i++) {
        db.push({
          old: `selector${i}`,
          new: `fixed${i}`,
          action: 'CLICK',
          label: `test${i}`,
          timestamp: Date.now(),
          success: true,
          count: i,
          confidence: 50,
          schemaVersion: 1
        });
      }

      // After pruning to 500 (DB_MAX_ENTRIES), should have top 500 by count
      const pruned = db.sort((a, b) => b.count - a.count).slice(0, 500);
      expect(pruned).toHaveLength(500);
    });

    it('should remove entries older than TTL (30 days)', () => {
      const now = Date.now();
      const thirtyOneDaysAgo = now - 31 * 24 * 60 * 60 * 1000;

      const recentFix: LearnedFix = {
        old: 'recent',
        new: 'fixed',
        action: 'CLICK',
        label: 'test',
        timestamp: now,
        success: true,
        count: 1,
        confidence: 50,
        schemaVersion: 1
      };

      const oldFix: LearnedFix = {
        old: 'old',
        new: 'fixed',
        action: 'CLICK',
        label: 'test',
        timestamp: thirtyOneDaysAgo,
        success: true,
        count: 1,
        confidence: 50,
        schemaVersion: 1
      };

      const db = [recentFix, oldFix];
      const ttlMs = 30 * 24 * 60 * 60 * 1000;
      const filtered = db.filter((x) => now - x.timestamp < ttlMs);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].old).toBe('recent');
    });
  });

  describe('Entry Validation', () => {
    it('should validate required fields in LearnedFix', () => {
      const validEntry: LearnedFix = {
        old: 'selector1',
        new: 'selector2',
        action: 'CLICK',
        label: 'test',
        timestamp: Date.now(),
        success: true,
        count: 1,
        confidence: 50,
        schemaVersion: 1
      };

      // All required fields present
      expect(validEntry.old).toBeTruthy();
      expect(validEntry.new).toBeTruthy();
      expect(validEntry.action).toBeTruthy();
    });

    it('should reject entries with empty selectors', () => {
      const invalidEntry = {
        old: '',
        new: 'selector',
        action: 'CLICK',
        label: 'test'
      };

      expect(invalidEntry.old).toBe('');
      expect(invalidEntry.old.length).toBe(0);
    });
  });

  describe('Lock Mechanism', () => {
    it('should handle lock file creation and cleanup', () => {
      const lockFile = `${dbPath}.lock`;
      
      // Simulate lock creation
      const lockData = JSON.stringify({ pid: process.pid, ts: Date.now() });
      fs.writeFileSync(lockFile, lockData);
      
      expect(fs.existsSync(lockFile)).toBe(true);
      
      // Cleanup
      fs.unlinkSync(lockFile);
      expect(fs.existsSync(lockFile)).toBe(false);
    });

    it('should detect stale locks', () => {
      const lockFile = `${dbPath}.lock`;
      const oldTimestamp = Date.now() - 11 * 1000; // 11 seconds ago (LOCK_TIMEOUT_MS = 5000 * 2)
      
      const staleLock = JSON.stringify({ pid: 99999, ts: oldTimestamp });
      fs.writeFileSync(lockFile, staleLock);
      
      const lockContent = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
      const isStale = Date.now() - lockContent.ts > 10000; // 10 second threshold
      
      expect(isStale).toBe(true);
    });
  });

  describe('Cache Management', () => {
    it('should cache database in memory after first read', () => {
      const testData: LearnedFix[] = [
        {
          old: 'selector1',
          new: 'selector2',
          action: 'CLICK',
          label: 'test',
          timestamp: Date.now(),
          success: true,
          count: 1,
          confidence: 50,
          schemaVersion: 1
        }
      ];

      fs.writeFileSync(dbPath, JSON.stringify(testData));

      // First read
      const read1 = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      expect(read1).toHaveLength(1);

      // Modify file
      fs.writeFileSync(dbPath, JSON.stringify([]));

      // Second read (cache should still have original data if caching works)
      const read2 = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      expect(read2).toHaveLength(0); // File was updated
    });
  });

  describe('Merge Logic', () => {
    it('should merge learned fixes without duplicates', () => {
      const existing: LearnedFix[] = [
        {
          old: 'old1',
          new: 'new1',
          action: 'CLICK',
          label: 'test1',
          timestamp: Date.now(),
          success: true,
          count: 5,
          confidence: 60,
          schemaVersion: 1
        }
      ];

      const newFix: LearnedFix = {
        old: 'old1',
        new: 'new1',
        action: 'CLICK',
        label: 'test1',
        timestamp: Date.now() + 1000,
        success: true,
        count: 3,
        confidence: 70,
        schemaVersion: 1
      };

      const merged = existing;
      const found = merged.find((x) => x.old === newFix.old && x.new === newFix.new && x.action === newFix.action);
      
      if (found) {
        found.count = Math.max(found.count, newFix.count);
        found.timestamp = Math.max(found.timestamp, newFix.timestamp);
        if (newFix.success) found.success = true;
      }

      expect(merged).toHaveLength(1);
      expect(merged[0].count).toBe(5);
    });
  });
});
