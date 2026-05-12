/* eslint-disable no-console */
/**
 * visual:approve — promote latest actuals to baselines.
 *
 * Usage:
 *   npm run visual:approve           # approve all pending actuals
 *   npm run visual:approve:dry       # dry-run — show what would be approved
 *   npm run visual:approve -- login  # approve only tests matching "login"
 *
 * How it works:
 *   1. Reads _index.json to get name → id mapping
 *   2. For each name, finds the newest actual (highest timestamp in filename)
 *   3. Copies actual → baseline (overwrites)
 *   4. Prints a summary table
 */

import * as fs from 'fs';
import * as path from 'path';

const BASELINE_DIR = path.resolve('test-results', 'visual-baselines');
const ACTUAL_DIR = path.resolve('test-results', 'visual-actuals');
const INDEX_FILE = path.join(BASELINE_DIR, '_index.json');

const isDry = process.argv.includes('--dry') || process.argv.includes('visual:approve:dry');
const filter = process.argv.find(
  (a) =>
    !a.startsWith('-') &&
    !a.includes('VisualApprove') &&
    !a.includes('ts-node') &&
    !a.includes('node')
);

function loadIndex(): Record<string, number> {
  if (!fs.existsSync(INDEX_FILE)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8')) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return {};
    const result: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const num = Number(value);
      if (!Number.isNaN(num)) {
        result[key] = num;
      }
    }
    return result;
  } catch {
    return {};
  }
}

/** Find the newest actual PNG for a given numeric id */
function findLatestActual(id: number): string | null {
  if (!fs.existsSync(ACTUAL_DIR)) return null;
  const prefix = `${id}-`;
  const files = fs
    .readdirSync(ACTUAL_DIR)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.png'))
    .map((f) => ({ file: f, ts: parseInt(f.replace(prefix, '').replace('.png', ''), 10) || 0 }))
    .sort((a, b) => b.ts - a.ts);
  return files[0] ? path.join(ACTUAL_DIR, files[0].file) : null;
}

function run(): void {
  const index = loadIndex();
  const names = Object.keys(index);

  if (names.length === 0) {
    console.log('No visual baselines registered. Run tests with visual assertions first.');
    process.exit(0);
  }

  const filtered = filter
    ? names.filter((n) => n.toLowerCase().includes(filter.toLowerCase()))
    : names;

  if (filtered.length === 0) {
    console.log(`No baselines match filter "${filter}".`);
    process.exit(0);
  }

  console.log(`\n  Visual Approve ${isDry ? '(DRY RUN — no files written)' : ''}`);
  console.log(`  ${'─'.repeat(60)}`);

  let approved = 0;
  const skipped = 0;
  let missing = 0;

  for (const name of filtered) {
    const id = index[name];
    if (typeof id !== 'number') {
      continue;
    }
    const baselinePath = path.join(BASELINE_DIR, `${id}.png`);
    const actualPath = findLatestActual(id);

    if (!actualPath) {
      console.log(`  ⏭  ${name}  — no actual found (run tests first)`);
      missing++;
      continue;
    }

    if (isDry) {
      console.log(`  ✅  ${name}  — would approve: ${path.basename(actualPath)}`);
      approved++;
      continue;
    }

    fs.mkdirSync(BASELINE_DIR, { recursive: true });
    fs.copyFileSync(actualPath, baselinePath);
    console.log(`  ✅  ${name}  — approved (${path.basename(actualPath)} → baseline)`);
    approved++;
  }

  console.log(`  ${'─'.repeat(60)}`);
  console.log(`  ${approved} approved  ${skipped} skipped  ${missing} missing actuals`);
  if (isDry) console.log(`  Dry run — re-run without --dry to apply changes.`);
  console.log();

  process.exit(missing > 0 && approved === 0 ? 1 : 0);
}

run();
