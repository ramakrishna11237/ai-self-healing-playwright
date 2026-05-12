import * as fs from 'fs';
import * as path from 'path';
import { Page } from '@playwright/test';
import { Logger } from './Logger';
import { DEFAULT_CONFIG } from '../config';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse') as (
  buf: Buffer
) => Promise<{ text: string; numpages: number }>;

export interface PdfVerifyResult {
  success: boolean;
  filePath: string;
  text: string; // full extracted text
  pageCount: number;
  matches: string[]; // which expectedTexts were found
  missing: string[]; // which expectedTexts were NOT found
  patternMatches: Record<string, string | null>; // pattern label → matched value
  message: string;
}

/**
 * PdfVerifier — download a PDF from the browser and verify its content.
 *
 * Supports:
 *  - Text presence checks (contains)
 *  - Regex pattern extraction (e.g. invoice number format)
 *  - Page count assertion
 *  - Full text extraction for custom assertions
 *
 * @example
 *   const pdf = new PdfVerifier(page);
 *
 *   // Click a download link and verify the PDF
 *   const result = await pdf.downloadAndVerify(
 *     "getByRole('link', { name: 'Print Report' })",
 *     {
 *       expectedTexts: ["Invoice", "John Smith"],
 *       patterns: {
 *         invoiceNumber: /ACC-\d{4}-\d{6}/,
 *         date:           /\d{2}\/\d{2}\/\d{4}/
 *       },
 *       minPages: 1
 *     }
 *   );
 *
 *   console.log(result.patternMatches.invoiceNumber); // "INV-2024-001234"
 */
export class PdfVerifier {
  constructor(private page: Page) {}

  // ── Shared path guard ────────────────────────────────────────────────────────
  private static safePath(filePath: string): string | null {
    // Reject any path containing traversal sequences before resolving
    if (/\.\.[\\/]/.test(filePath) || filePath.includes('\0')) return null;
    const resolved = path.resolve(filePath);
    const allowedBases = [path.resolve(DEFAULT_CONFIG.downloadDir), path.resolve('test-results')];
    const allowed = allowedBases.some((base) => resolved.startsWith(base + path.sep));
    return allowed ? resolved : null;
  }

  /**
   * Click a download trigger, capture the downloaded PDF, and verify its content.
   *
   * @param triggerLocator  Codegen or CSS locator for the download button/link
   * @param options         Verification options
   */
  async downloadAndVerify(
    triggerLocator: string,
    options: {
      expectedTexts?: string[];
      patterns?: Record<string, RegExp>;
      minPages?: number;
      maxPages?: number;
      savePath?: string;
    } = {}
  ): Promise<PdfVerifyResult> {
    // Trigger download and capture the file
    Logger.info(`PdfVerifier: triggering download via "${triggerLocator}"`);

    let filePath: string;
    try {
      const [download] = await Promise.all([
        this.page.waitForEvent('download', { timeout: 30000 }),
        this.page.locator(triggerLocator).first().click(),
      ]);

      const rawName = download.suggestedFilename() || `report-${Date.now()}.pdf`;
      const safeName = path.basename(rawName.replace(/[^a-z0-9._-]/gi, '_'));
      const base = path.resolve(DEFAULT_CONFIG.downloadDir);
      fs.mkdirSync(base, { recursive: true });
      // Validate savePath through guard first; fall back to safe default
      let candidate: string;
      if (options.savePath) {
        const guarded = PdfVerifier.safePath(options.savePath);
        candidate = guarded ?? path.resolve(base, safeName);
      } else {
        candidate = path.resolve(base, safeName);
      }
      // Final guard on the resolved candidate
      const guardedCandidate = PdfVerifier.safePath(candidate);
      filePath = guardedCandidate ?? path.resolve(base, safeName);
      await download.saveAs(filePath);
      Logger.info(`PdfVerifier: saved to ${filePath}`);
    } catch (e) {
      return this.failResult('', `Download failed: ${String(e)}`);
    }

    return this.verifyFile(filePath, options);
  }

  /**
   * Verify an already-downloaded PDF file directly.
   *
   * @param filePath  Absolute path to the PDF file
   * @param options   Verification options
   */
  async verifyFile(
    filePath: string,
    options: {
      expectedTexts?: string[];
      patterns?: Record<string, RegExp>;
      minPages?: number;
      maxPages?: number;
    } = {}
  ): Promise<PdfVerifyResult> {
    const safe = PdfVerifier.safePath(filePath);
    if (!safe) return this.failResult(filePath, `Path traversal blocked: "${filePath}"`);
    if (!fs.existsSync(safe)) return this.failResult(filePath, `File not found: ${filePath}`);

    let parsed: { text: string; numpages: number };
    try {
      const buffer = fs.readFileSync(safe);
      parsed = await pdfParse(buffer);
    } catch (e) {
      return this.failResult(filePath, `PDF parse failed: ${String(e)}`);
    }

    const text = parsed.text ?? '';
    const pageCount = parsed.numpages ?? 0;
    const matches: string[] = [];
    const missing: string[] = [];
    const patternMatches: Record<string, string | null> = {};

    // Text presence checks
    for (const expected of options.expectedTexts ?? []) {
      if (text.includes(expected)) {
        matches.push(expected);
        Logger.info(`PdfVerifier: ✅ found "${expected}"`);
      } else {
        missing.push(expected);
        Logger.warn(`PdfVerifier: ❌ missing "${expected}"`);
      }
    }

    // Regex pattern extraction
    for (const [label, pattern] of Object.entries(options.patterns ?? {})) {
      const match = text.match(pattern);
      patternMatches[label] = match ? match[0] : null;
      if (match) {
        Logger.info(`PdfVerifier: ✅ pattern "${label}" matched: "${match[0]}"`);
      } else {
        Logger.warn(`PdfVerifier: ❌ pattern "${label}" (${pattern}) not found`);
      }
    }

    // Page count checks
    if (options.minPages !== undefined && pageCount < options.minPages) {
      return {
        success: false,
        filePath,
        text,
        pageCount,
        matches,
        missing,
        patternMatches,
        message: `Page count ${pageCount} is less than minimum ${options.minPages}`,
      };
    }
    if (options.maxPages !== undefined && pageCount > options.maxPages) {
      return {
        success: false,
        filePath,
        text,
        pageCount,
        matches,
        missing,
        patternMatches,
        message: `Page count ${pageCount} exceeds maximum ${options.maxPages}`,
      };
    }

    const patternFailed =
      Object.values(patternMatches).some((v) => v === null) &&
      Object.keys(options.patterns ?? {}).length > 0;
    const success = missing.length === 0 && !patternFailed;

    const message = success
      ? `PDF verified: ${pageCount} page(s), all checks passed`
      : `PDF verification failed: missing=[${missing.join(', ')}], patterns=${JSON.stringify(patternMatches)}`;

    Logger.info(`PdfVerifier: ${message}`);
    return { success, filePath, text, pageCount, matches, missing, patternMatches, message };
  }

  /**
   * Assert PDF contains all expected texts — throws if any are missing.
   */
  async assertContains(filePath: string, ...expectedTexts: string[]): Promise<void> {
    const result = await this.verifyFile(filePath, { expectedTexts });
    if (!result.success) {
      throw new Error(`PDF assertion failed:\n${result.message}\nFile: ${filePath}`);
    }
  }

  /**
   * Extract a value from a PDF using a regex pattern.
   * Returns the first match or null.
   *
   * @example
   *   const accNum = await pdf.extractPattern(filePath, /ACC-\d{4}-\d{6}/);
   *   // "ACC-2024-001234"
   */
  async extractPattern(filePath: string, pattern: RegExp): Promise<string | null> {
    const safe = PdfVerifier.safePath(filePath);
    if (!safe || !fs.existsSync(safe)) return null;
    try {
      const buffer = fs.readFileSync(safe);
      const parsed = await pdfParse(buffer);
      const match = parsed.text.match(pattern);
      return match ? match[0] : null;
    } catch {
      return null;
    }
  }

  /**
   * Get the full text content of a PDF.
   */
  async extractText(filePath: string): Promise<string> {
    const safe = PdfVerifier.safePath(filePath);
    if (!safe || !fs.existsSync(safe)) return '';
    try {
      const buffer = fs.readFileSync(safe);
      const parsed = await pdfParse(buffer);
      return parsed.text ?? '';
    } catch {
      return '';
    }
  }

  private failResult(filePath: string, message: string): PdfVerifyResult {
    Logger.warn(`PdfVerifier: ${message}`);
    return {
      success: false,
      filePath,
      text: '',
      pageCount: 0,
      matches: [],
      missing: [],
      patternMatches: {},
      message,
    };
  }
}
