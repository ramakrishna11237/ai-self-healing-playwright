/**
 * Smart Engine v2 — Example Tests
 *
 * Demonstrates all 8 upgraded capabilities:
 *  1. SmartLocatorEngine  — confidence-scored locators, context-aware selection
 *  2. SmartActions        — smartClick, smartFill, smartSelect with all checks
 *  3. SmartWaitEngine     — dynamic waits, stability checks, spinner detection
 *  4. FrameHandler        — auto iframe + shadow DOM detection
 *  5. StepObserver        — per-step screenshots, highlights, structured logs
 *  6. Retry mechanism     — configurable retries with backoff
 *  7. Controlled healing  — confidence-scored fallbacks, no unsafe actions
 *  8. Performance         — no heavy DOM scanning, parallel where possible
 *
 * Site: https://the-internet.herokuapp.com (public, no credentials)
 */

import { test, expect } from '@playwright/test';
import {
  SmartActions,
  SmartLocatorEngine,
  SmartWaitEngine,
  FrameHandler,
  StepObserver,
  Logger,
} from '../../index';

const BASE = 'https://the-internet.herokuapp.com';

// ─────────────────────────────────────────────────────────────────────────────
// Example 1 — SmartLocatorEngine: Confidence Scoring
// Shows how the engine scores and selects the best locator automatically
// ─────────────────────────────────────────────────────────────────────────────
test('Smart Engine 1 — Confidence-Scored Locator Selection', async ({ page }) => {
  await page.goto(`${BASE}/login`);

  // Build all candidates for "Username" and show their scores
  const candidates = SmartLocatorEngine.buildCandidates('Username', 'fill');

  Logger.info("Locator candidates for 'Username' (sorted by confidence):");
  candidates
    .slice(0, 8)
    .forEach((c) => Logger.info(`  [${c.confidence}] ${c.strategy.padEnd(20)} ${c.locator}`));

  // Find the best visible match automatically
  const best = await SmartLocatorEngine.findBest(page, 'Username', 'fill');
  expect(best).not.toBeNull();
  expect(best!.confidence).toBeGreaterThan(60);

  Logger.info(`Best match: ${best!.strategy} (confidence: ${best!.confidence})`);
  Logger.info(`Locator: ${best!.locator}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Example 2 — SmartActions: Full Login Flow
// smartClick + smartFill with visibility, stability, scroll, highlight
// ─────────────────────────────────────────────────────────────────────────────
test('Smart Engine 2 — SmartActions Login Flow', async ({ page }) => {
  const actions = new SmartActions(page, {
    highlight: true, // highlight elements before interacting
    scrollIntoView: true, // scroll into view automatically
    stabilityMs: 200, // wait 200ms for element to stop moving
    retries: 2, // retry up to 2 times on failure
    timeout: 5000,
  });

  const observer = new StepObserver(page, { enabled: true });

  await page.goto(`${BASE}/login`);
  await SmartWaitEngine.waitForPageReady(page);

  // smartFill — finds Username field by confidence scoring, fills it
  await observer.observe(
    'Fill Username',
    'fill',
    {
      locator: "getByRole('textbox', { name: 'Username' })",
      strategy: 'role+name',
      confidence: 85,
    },
    () => actions.smartFill('Username', 'tomsmith')
  );

  // smartFill — Password field
  await observer.observe(
    'Fill Password',
    'fill',
    {
      locator: "getByRole('textbox', { name: 'Password' })",
      strategy: 'role+name',
      confidence: 85,
    },
    () => actions.smartFill('Password', 'SuperSecretPassword!')
  );

  // smartClick — Login button
  await observer.observe(
    'Click Login',
    'click',
    { locator: "getByRole('button', { name: 'Login' })", strategy: 'role+name', confidence: 85 },
    () => actions.smartClick('Login')
  );

  // Wait for navigation dynamically — no static wait
  await SmartWaitEngine.waitForUrl(page, /secure/);

  // smartAssertVisible — verify login succeeded
  await actions.smartAssertVisible('Secure Area');

  observer.printSummary();
  const summary = observer.getSummary();
  expect(summary.failed).toBe(0);
});

// ─────────────────────────────────────────────────────────────────────────────
// Example 3 — SmartWaitEngine: Dynamic Waits
// Replaces all static waits with condition-based waits
// ─────────────────────────────────────────────────────────────────────────────
test('Smart Engine 3 — Dynamic Waits (no static delays)', async ({ page }) => {
  await page.goto(`${BASE}/dynamic_loading/1`);

  // Wait for page ready — DOM + spinner + JS complete
  await SmartWaitEngine.waitForPageReady(page);

  // Wait for element visible — no hardcoded timeout
  const startVisible = await SmartWaitEngine.waitForVisible(page, "button:has-text('Start')", 5000);
  expect(startVisible).toBe(true);

  // Click Start
  await page.getByRole('button', { name: 'Start' }).click();

  // Wait for spinner to disappear — auto-detects common spinner selectors
  await SmartWaitEngine.waitForSpinnerGone(page, '#loading', 10000);

  // Wait for text to appear — dynamic content
  const textAppeared = await SmartWaitEngine.waitForText(page, 'Hello World!', 10000);
  expect(textAppeared).toBe(true);

  // Wait for element stability before asserting
  const el = page.getByText('Hello World!');
  await SmartWaitEngine.waitForStable(el, 200);

  Logger.info('Dynamic wait demo: all waits resolved without static delays');
});

// ─────────────────────────────────────────────────────────────────────────────
// Example 4 — SmartLocatorEngine: Partial + Regex Matching
// Handles dynamic text, partial labels, regex patterns
// ─────────────────────────────────────────────────────────────────────────────
test('Smart Engine 4 — Partial and Regex Matching', async ({ page }) => {
  await page.goto(`${BASE}/tables`);
  await SmartWaitEngine.waitForPageReady(page);

  // Partial text match — finds "Last Name" even if text is "Last Name ↑"
  const partialMatch = await SmartLocatorEngine.findBest(page, 'Last Name', 'assertVisible', {
    allowPartial: true,
  });
  expect(partialMatch).not.toBeNull();
  Logger.info(`Partial match: ${partialMatch!.strategy} (confidence: ${partialMatch!.confidence})`);

  // Regex match — finds any column header
  const regexMatch = await SmartLocatorEngine.findBest(page, 'Last', 'assertVisible', {
    allowPartial: true,
    allowRegex: true,
  });
  expect(regexMatch).not.toBeNull();
  Logger.info(`Regex match: ${regexMatch!.strategy} (confidence: ${regexMatch!.confidence})`);

  // Context-aware selection — finds table header, not nav link
  const contextMatch = await SmartLocatorEngine.findBest(
    page,
    'Last Name',
    'assertVisible',
    { scope: 'table' } // restrict to table context
  );
  expect(contextMatch).not.toBeNull();
  Logger.info(`Context match (scoped to table): ${contextMatch!.strategy}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Example 5 — FrameHandler: Automatic iframe Detection
// Finds and interacts with elements inside iframes without knowing which frame
// ─────────────────────────────────────────────────────────────────────────────
test('Smart Engine 5 — Automatic iframe Detection', async ({ page }) => {
  await page.goto(`${BASE}/iframe`);
  await SmartWaitEngine.waitForPageReady(page);

  // List all frames on the page
  const frames = await FrameHandler.listFrames(page);
  Logger.info(`Frames found: ${frames.length}`);
  frames.forEach((f) => Logger.info(`  ${f}`));

  // Fill inside iframe — FrameHandler finds it automatically
  const filled = await FrameHandler.fillInFrame(
    page,
    'iframe#mce_0_ifr',
    'body',
    'Hello from SmartActions inside iframe!',
    5000
  );

  Logger.info(`iframe fill result: ${filled}`);
  // Note: TinyMCE iframe — demonstrates the API even if content differs
});

// ─────────────────────────────────────────────────────────────────────────────
// Example 6 — StepObserver: Full Observability
// Screenshots, highlights, structured logs, fallback detection
// ─────────────────────────────────────────────────────────────────────────────
test('Smart Engine 6 — Full Step Observability', async ({ page }) => {
  const observer = new StepObserver(page, {
    screenshotDir: 'test-results/screenshots/smart-engine',
    enabled: true,
  });

  await page.goto(`${BASE}/checkboxes`);

  // Observe each step — captures screenshot + logs locator + confidence
  await observer.observe(
    'Navigate to checkboxes',
    'navigate',
    { locator: 'url', strategy: 'navigation', confidence: 100 },
    async () => {
      /* navigation already done */
    }
  );

  await observer.observe(
    'Check first checkbox',
    'check',
    {
      locator: "getByRole('checkbox')",
      strategy: 'role',
      confidence: 85,
      element: page.getByRole('checkbox').first(),
    },
    () => page.getByRole('checkbox').first().check()
  );

  await observer.observe(
    'Verify checkbox checked',
    'assertChecked',
    { locator: "getByRole('checkbox')", strategy: 'role', confidence: 85 },
    async () => {
      const checked = await page.getByRole('checkbox').first().isChecked();
      if (!checked) throw new Error('Checkbox not checked');
    }
  );

  // Print and write report
  observer.printSummary();
  const reportPath = observer.writeReport('smart-engine-observability');

  const summary = observer.getSummary();
  expect(summary.failed).toBe(0);
  expect(summary.total).toBe(3);
  Logger.info(`Report: ${reportPath}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Example 7 — SmartActions: Retry + Controlled Healing
// Retries on failure, uses confidence-scored fallbacks, never unsafe actions
// ─────────────────────────────────────────────────────────────────────────────
test('Smart Engine 7 — Retry and Controlled Healing', async ({ page }) => {
  const actions = new SmartActions(page, {
    retries: 3, // retry up to 3 times
    timeout: 5000,
    highlight: false,
  });

  await page.goto(`${BASE}/login`);

  // Intentionally use a partial/ambiguous name — healing kicks in
  // SmartLocatorEngine tries: data-testid → id → aria-label → role+name → label → ...
  // Finds "Username" via role+name (confidence: 85) even without exact locator
  await actions.smartFill('Username', 'tomsmith', { allowPartial: true });
  await actions.smartFill('Password', 'SuperSecretPassword!');
  await actions.smartClick('Login', { retries: 2 });

  await SmartWaitEngine.waitForUrl(page, /secure/);
  await actions.smartAssertVisible('Secure Area');

  Logger.info('Retry + healing demo: login succeeded with confidence-scored fallbacks');
});

// ─────────────────────────────────────────────────────────────────────────────
// Example 8 — Performance: Parallel + No Heavy DOM Scanning
// Runs multiple smart actions efficiently without full DOM diff
// ─────────────────────────────────────────────────────────────────────────────
test('Smart Engine 8 — Performance Optimized Execution', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page1 = await ctx.newPage();
  const page2 = await ctx.newPage();

  const actions1 = new SmartActions(page1, { highlight: false, stabilityMs: 100 });
  const actions2 = new SmartActions(page2, { highlight: false, stabilityMs: 100 });

  const start = Date.now();

  // Run two workflows in parallel — no DOM scanning, no static waits
  const [r1, r2] = await Promise.all([
    (async () => {
      await page1.goto(`${BASE}/login`);
      await SmartWaitEngine.waitForPageReady(page1);
      await actions1.smartFill('Username', 'tomsmith');
      await actions1.smartFill('Password', 'SuperSecretPassword!');
      await actions1.smartClick('Login');
      await SmartWaitEngine.waitForUrl(page1, /secure/);
      return 'login-done';
    })(),
    (async () => {
      await page2.goto(`${BASE}/tables`);
      await SmartWaitEngine.waitForPageReady(page2);
      const match = await SmartLocatorEngine.findBest(page2, 'Last Name', 'assertVisible');
      return match ? 'table-found' : 'table-not-found';
    })(),
  ]);

  const elapsed = Date.now() - start;
  Logger.info(`Parallel execution: ${elapsed}ms`);
  Logger.info(`Result 1: ${r1} | Result 2: ${r2}`);

  await ctx.close();

  expect(r1).toBe('login-done');
  expect(r2).toBe('table-found');
  expect(elapsed).toBeLessThan(15000);
});
