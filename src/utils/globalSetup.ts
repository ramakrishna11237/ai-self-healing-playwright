/**
 * globalSetup — Runs once before all tests
 *
 * Playwright officially supports this via the `globalSetup` config option.
 * This is the correct place to run pre-flight checks, not playwright.config.ts.
 */

import { PreFlightCheck } from './PreFlightCheck';
import { SiteAvailability } from './SiteAvailability';

export default async function globalSetup(): Promise<void> {
  // ── 1. Site availability checks (parallel) ───────────────────────────────
  await SiteAvailability.checkAll([
    'https://the-internet.herokuapp.com',
    'https://opensource-demo.orangehrmlive.com',
    'https://parabank.parasoft.com',
    'https://www.saucedemo.com',
  ]);

  // ── 2. Pre-flight: env, dirs, config ───────────────────────────────────
  const check = new PreFlightCheck();
  const result = await check.run();

  // Inject site availability summary into pre-flight report
  result.warnings.push(...SiteAvailability.summary()
    .filter(l => l.includes('DOWN') || l.includes('SLOW'))
    .map(l => l.trim())
  );

  PreFlightCheck.report(result);

  if (!result.passed) {
    throw new Error(
      `Pre-flight check failed — fix the above errors before running tests.\n${result.errors.join('\n')}`
    );
  }
}
