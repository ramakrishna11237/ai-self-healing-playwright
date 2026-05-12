#!/usr/bin/env ts-node
/* eslint-disable no-console */
/**
 * Label Suggestion CLI
 * Run: npm run label:suggest [file or folder]
 *
 * Scans your test files and suggests better labels for steps
 * that have weak, missing, or generic labels.
 *
 * Examples:
 *   npm run label:suggest
 *   npm run label:suggest src/tests/smoke/login.spec.ts
 *   npm run label:suggest src/tests/
 */

import * as fs from 'fs';
import * as path from 'path';
import { LabelSuggester } from './LabelSuggester';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';

// ── Regex patterns to find step objects in TypeScript source ─────────────────
// Matches: { label: "...", action: "...", codegenLocator: "..." }
const STEP_BLOCK_RE = /\{[^{}]*(?:codegenLocator|locator)\s*:[^{}]*\}/gs;
const LABEL_RE = /label\s*:\s*["'`]([^"'`]*)["'`]/;
const ACTION_RE = /action\s*:\s*["'`]([^"'`]*)["'`]/;
const CODEGEN_RE = /codegenLocator\s*:\s*["'`]([^"'`]*)["'`]/;
const LOCATOR_RE = /(?<![a-zA-Z])locator\s*:\s*["'`]([^"'`]*)["'`]/;

interface Suggestion {
  file: string;
  line: number;
  current: string;
  suggested: string;
  locator: string;
  action: string;
}

function scanFile(filePath: string): Suggestion[] {
  const suggestions: Suggestion[] = [];
  let src: string;
  try {
    src = fs.readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }

  let match: RegExpExecArray | null;
  STEP_BLOCK_RE.lastIndex = 0;

  while ((match = STEP_BLOCK_RE.exec(src)) !== null) {
    const block = match[0];

    const labelM = block.match(LABEL_RE);
    const actionM = block.match(ACTION_RE);
    const codegenM = block.match(CODEGEN_RE);
    const locatorM = block.match(LOCATOR_RE);

    const currentLabel = labelM?.[1] ?? '';
    const action = actionM?.[1] ?? 'click';
    const locator = codegenM?.[1] ?? locatorM?.[1] ?? '';

    if (!locator) continue;

    // Calculate line number
    const charPos = match.index;
    const lineNum = src.slice(0, charPos).split('\n').length;

    // Generate suggestion
    const suggested = LabelSuggester.generateLabel(action, locator);
    if (!suggested) continue;

    // Only suggest if current label is missing or weak
    const isWeak =
      !currentLabel ||
      currentLabel.length <= 3 ||
      /^step\s*\d*$/i.test(currentLabel) ||
      currentLabel === action;

    const isDifferent = suggested.toLowerCase() !== currentLabel.toLowerCase();

    if (isWeak || (!currentLabel && isDifferent)) {
      suggestions.push({
        file: filePath,
        line: lineNum,
        current: currentLabel || '(no label)',
        suggested,
        locator,
        action,
      });
    }
  }

  return suggestions;
}

function scanDir(dirPath: string): Suggestion[] {
  const all: Suggestion[] = [];
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory() && !['node_modules', 'test-results', '.git'].includes(entry.name)) {
        all.push(...scanDir(full));
      } else if (
        entry.isFile() &&
        (entry.name.endsWith('.spec.ts') || entry.name.endsWith('.test.ts'))
      ) {
        all.push(...scanFile(full));
      }
    }
  } catch {
    /* skip unreadable dirs */
  }
  return all;
}

function printSuggestions(suggestions: Suggestion[]): void {
  if (suggestions.length === 0) {
    console.log(`\n${GREEN}${BOLD}✅ All step labels look good!${RESET}\n`);
    return;
  }

  console.log(`\n${BOLD}${CYAN}╔══════════════════════════════════════════════════════╗`);
  console.log(`║         Label Suggestions                            ║`);
  console.log(`╚══════════════════════════════════════════════════════╝${RESET}`);
  console.log(`${DIM}  ${suggestions.length} step(s) with weak or missing labels${RESET}\n`);

  // Group by file
  const byFile = new Map<string, Suggestion[]>();
  for (const s of suggestions) {
    const rel = path.relative(process.cwd(), s.file);
    if (!byFile.has(rel)) byFile.set(rel, []);
    byFile.get(rel)!.push(s);
  }

  for (const [file, items] of byFile) {
    console.log(`${BOLD}${YELLOW}  ${file}${RESET}`);
    for (const item of items) {
      console.log(`    ${DIM}Line ${item.line}:${RESET}`);
      console.log(`      Current : ${RED}${item.current}${RESET}`);
      console.log(`      Suggest : ${GREEN}label: "${item.suggested}"${RESET}`);
      console.log(`      Locator : ${DIM}${item.locator.slice(0, 70)}${RESET}`);
      console.log('');
    }
  }

  console.log(
    `${DIM}  Tip: Labels should match the element's visible text for best healing.${RESET}`
  );
  console.log(`${DIM}  Tip: Run 'npm run label:suggest' after adding new tests.${RESET}\n`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
const rawTarget = process.argv[2] ?? 'src/tests';

// Validate target path stays within cwd to prevent path traversal
const cwd = path.resolve(process.cwd());
const targetPath = path.resolve(rawTarget);
if (!targetPath.startsWith(cwd + path.sep) && targetPath !== cwd) {
  console.error(`\nError: target path "${rawTarget}" is outside the project directory.`);
  process.exit(1);
}

console.log(`\n${DIM}Scanning: ${targetPath}${RESET}`);

let suggestions: Suggestion[];
if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
  suggestions = scanFile(targetPath);
} else {
  suggestions = scanDir(targetPath);
}

printSuggestions(suggestions);

// Also show what auto-label would generate for common locators
console.log(
  `${BOLD}${CYAN}  Auto-Label Examples (what framework generates automatically):${RESET}`
);
const examples = [
  ["getByRole('button', { name: 'Save' })", 'click'],
  ["getByRole('textbox', { name: 'Username' })", 'fill'],
  ["getByRole('link', { name: 'Modules' })", 'click'],
  ["getByRole('heading', { name: 'Secure Area' })", 'assertVisible'],
  ["getByLabel('Email address')", 'fill'],
  ["getByText('Record saved.')", 'assertVisible'],
  ["[data-testid='submit-btn']", 'click'],
];

for (const [locator, action] of examples) {
  const label = LabelSuggester.generateLabel(action, locator);
  console.log(`  ${DIM}${locator.slice(0, 45).padEnd(45)}${RESET} → ${GREEN}"${label}"${RESET}`);
}
console.log('');
