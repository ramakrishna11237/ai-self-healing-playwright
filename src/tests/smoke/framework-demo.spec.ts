/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║           AI Automation Framework — Feature Demo                ║
 * ║                                                                  ║
 * ║  Site: https://the-internet.herokuapp.com (public, no login)    ║
 * ║                                                                  ║
 * ║  Demonstrates:                                                   ║
 * ║   ✅ 7-layer recovery (Layer 1 → 2a → 2b → 3 → 3.5 → 4 → 5)  ║
 * ║   ✅ Self-healing locators                                       ║
 * ║   ✅ Learning DB (auto-stores fixes)                             ║
 * ║   ✅ Soft assertions (workflow continues on failure)             ║
 * ║   ✅ Workflow retries + budget timeout                           ║
 * ║   ✅ Parallel workflows                                          ║
 * ║   ✅ Accessibility checker                                       ║
 * ║   ✅ Network interception                                        ║
 * ║   ✅ Visual regression                                           ║
 * ║   ✅ Mobile emulation                                            ║
 * ║   ✅ Trace manager (auto-save on failure)                        ║
 * ║   ✅ Session management                                          ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import { test, expect } from '@playwright/test';
import { runSteps, runStepsParallel, Logger } from '../../index';
import { AccessibilityChecker } from '../../utils/AccessibilityChecker';
import { NetworkInterceptor } from '../../utils/NetworkInterceptor';
import { VisualRegression } from '../../utils/VisualRegression';
import { MobileHelper } from '../../utils/MobileHelper';
import { TraceManager } from '../../utils/TraceManager';
import { StabilityGuard } from '../../utils/StabilityGuard';

const BASE = 'https://the-internet.herokuapp.com';

// ─────────────────────────────────────────────────────────────────────────────
// Demo 1 — 7-Layer Recovery + Self-Healing
// Shows Layer 1 (direct hit), then intentionally broken locator triggers
// Layer 2a/2b (strategy fallback) which heals and stores the fix in learning-db
// ─────────────────────────────────────────────────────────────────────────────
test('Demo 1 — 7-Layer Recovery + Self-Healing', async ({ page }) => {
  Logger.info('═══ Demo 1: 7-Layer Recovery ═══');

  const result = await runSteps(
    page,
    [
      // Layer 1: direct hit — codegen locator works immediately (~5ms)
      // Layers 2a/2b: SmartLocatorEngine + batch strategy fallback
      // Layer 3: Learned fix (learning-db.json) | Layer 3.5: LLM label prediction
      // Layer 4: DOM capture + self-heal | Layer 5: LLM locator (Ollama)
      {
        label: 'Navigate to login page',
        action: 'navigate',
        expectedUrl: `${BASE}/login`,
      },
      // Layer 1: exact codegen locator — passes instantly
      {
        label: 'Enter username',
        action: 'fill',
        codegenLocator: "getByRole('textbox', { name: 'Username' })",
        value: 'tomsmith',
      },
      {
        label: 'Enter password',
        action: 'fill',
        codegenLocator: "getByRole('textbox', { name: 'Password' })",
        value: 'SuperSecretPassword!',
      },
      // Layer 1: direct hit
      {
        label: 'Click Login',
        action: 'click',
        codegenLocator: "getByRole('button', { name: 'Login' })",
      },
      // Layer 1: assert logged in
      {
        label: 'Verify login success',
        action: 'assertVisible',
        codegenLocator: "getByRole('heading', { name: 'Secure Area' })",
      },
      // Self-healing demo: intentionally broken locator
      // Layer 1 fails → Layer 2a SmartLocator → Layer 2b batch strategies → finds it → stores fix
      {
        label: 'Click logout via broken locator',
        action: 'click',
        locator: '#logout-button-does-not-exist', // broken — triggers Layer 2
        codegenLocator: "getByRole('link', { name: 'Logout' })",
      },
      // Verify back on login page
      {
        label: 'Verify logged out',
        action: 'assertVisible',
        codegenLocator: "getByRole('button', { name: 'Login' })",
      },
    ],
    {
      name: '7-Layer Recovery Demo',
      suite: 'smoke',
      screenshotOnFailure: true,
      workflowRetries: 1, // retry entire workflow once on failure
      maxWorkflowMs: 30000, // hard budget — fail if takes > 30s
    }
  );

  Logger.info(`Result: ${result.passed} passed, ${result.failed} failed in ${result.durationMs}ms`);
  expect(result.failed, 'All steps should pass').toBe(0);
});

// ─────────────────────────────────────────────────────────────────────────────
// Demo 2 — Soft Assertions
// Workflow continues even when non-critical checks fail
// ─────────────────────────────────────────────────────────────────────────────
test('Demo 2 — Soft Assertions (workflow continues on failure)', async ({ page }) => {
  Logger.info('═══ Demo 2: Soft Assertions ═══');

  const result = await runSteps(
    page,
    [
      {
        label: 'Navigate to checkboxes',
        action: 'navigate',
        expectedUrl: `${BASE}/checkboxes`,
      },
      // Hard assertion — must pass
      {
        label: 'Verify checkboxes page loaded',
        action: 'assertVisible',
        codegenLocator: "getByRole('checkbox')",
      },
      // Soft assertion — intentionally wrong, but workflow continues
      {
        label: 'Check for non-existent banner (soft)',
        action: 'assertVisible',
        codegenLocator: "getByText('This banner does not exist')",
        soft: true, // ← workflow continues even if this fails
      },
      // This still runs despite the soft failure above
      {
        label: 'Check first checkbox',
        action: 'check',
        codegenLocator: "getByRole('checkbox')",
      },
      // Another soft check — wrong text, but won't stop the test
      {
        label: 'Assert wrong page title (soft)',
        action: 'assertTitle',
        expectedTitle: 'Wrong Title That Does Not Exist',
        soft: true,
      },
      // Hard assertion — verifies the checkbox interaction worked
      {
        label: 'Verify checkbox is checked',
        action: 'assertChecked',
        codegenLocator: "getByRole('checkbox')",
      },
    ],
    {
      name: 'Soft Assertions Demo',
      suite: 'sanity',
    }
  );

  Logger.info(
    `Passed: ${result.passed}, Failed: ${result.failed}, Soft-failed: ${result.softFailed}`
  );

  // Hard failures = 0, soft failures = 2 (expected)
  expect(result.failed, 'Hard failures should be 0').toBe(0);
  expect(result.softFailed, 'Soft failures should be 2').toBe(2);
});

// ─────────────────────────────────────────────────────────────────────────────
// Demo 3 — Parallel Workflows
// Two independent workflows run simultaneously on separate pages
// ─────────────────────────────────────────────────────────────────────────────
test('Demo 3 — Parallel Workflows', async ({ browser }) => {
  Logger.info('═══ Demo 3: Parallel Workflows ═══');

  const ctx = await browser.newContext();
  const page1 = await ctx.newPage();
  const page2 = await ctx.newPage();

  const start = Date.now();

  const [formResult, tableResult] = await runStepsParallel([
    // Workflow A: form interactions
    {
      page: page1,
      steps: [
        { label: 'Navigate to form', action: 'navigate', expectedUrl: `${BASE}/login` },
        {
          label: 'Fill username',
          action: 'fill',
          codegenLocator: "getByRole('textbox', { name: 'Username' })",
          value: 'tomsmith',
        },
        {
          label: 'Fill password',
          action: 'fill',
          codegenLocator: "getByRole('textbox', { name: 'Password' })",
          value: 'SuperSecretPassword!',
        },
        {
          label: 'Verify form loaded',
          action: 'assertVisible',
          codegenLocator: "getByRole('button', { name: 'Login' })",
        },
      ],
      options: { name: 'Form Workflow', suite: 'smoke' },
    },
    // Workflow B: table interactions — runs at the same time as Workflow A
    {
      page: page2,
      steps: [
        { label: 'Navigate to tables', action: 'navigate', expectedUrl: `${BASE}/tables` },
        {
          label: 'Verify table loaded',
          action: 'assertVisible',
          codegenLocator: "getByRole('table')",
        },
        {
          label: 'Verify table header',
          action: 'assertVisible',
          codegenLocator: "getByRole('columnheader', { name: 'Last Name' })",
        },
        { label: 'Assert table URL', action: 'assertUrl', expectedUrl: '/tables' },
      ],
      options: { name: 'Table Workflow', suite: 'smoke' },
    },
  ]);

  const elapsed = Date.now() - start;
  Logger.info(
    `Both workflows completed in ${elapsed}ms (sequential would take ~${formResult.durationMs + tableResult.durationMs}ms)`
  );

  await ctx.close();

  expect(formResult.failed, 'Form workflow should pass').toBe(0);
  expect(tableResult.failed, 'Table workflow should pass').toBe(0);
  // Parallel should be faster than sequential sum
  expect(elapsed).toBeLessThan(formResult.durationMs + tableResult.durationMs);
});

// ─────────────────────────────────────────────────────────────────────────────
// Demo 4 — Accessibility Checker
// Audits the page for a11y violations without any external dependency
// ─────────────────────────────────────────────────────────────────────────────
test('Demo 4 — Accessibility Checker', async ({ page }) => {
  Logger.info('═══ Demo 4: Accessibility ═══');

  await page.goto(`${BASE}/login`);

  const a11y = new AccessibilityChecker(page);
  const result = await a11y.audit();

  Logger.info(`A11y result: ${result.summary}`);
  if (result.violations.length > 0) {
    result.violations.forEach((v) => Logger.warn(`  [${v.role}] ${v.description}`));
  }

  // Log violations but don't fail — demo shows the checker works
  expect(result).toBeDefined();
  expect(typeof result.passed).toBe('boolean');
  expect(Array.isArray(result.violations)).toBe(true);
});

// ─────────────────────────────────────────────────────────────────────────────
// Demo 5 — Network Interception
// Mock, block, and observe network requests
// ─────────────────────────────────────────────────────────────────────────────
test('Demo 5 — Network Interception', async ({ page }) => {
  Logger.info('═══ Demo 5: Network Interception ═══');

  const net = new NetworkInterceptor(page);

  // Observe all requests to the main domain
  net.observe('the-internet.herokuapp.com');

  // Block any analytics/tracking (none on this site, but shows the API)
  net.block('/analytics');
  net.block('/tracking');

  await net.activate();

  await runSteps(
    page,
    [
      {
        label: 'Navigate to dynamic page',
        action: 'navigate',
        expectedUrl: `${BASE}/dynamic_loading`,
      },
      {
        label: 'Verify page loaded',
        action: 'assertVisible',
        codegenLocator: "getByRole('heading', { name: 'Dynamically Loaded Page Elements' })",
      },
    ],
    { name: 'Network Interception Demo', suite: 'smoke' }
  );

  const observed = net.getObservedRequests();
  Logger.info(`Observed ${observed.length} network request(s)`);
  observed.slice(0, 3).forEach((r) => Logger.info(`  ${r.method} ${r.url.slice(0, 80)}`));

  await net.deactivate();
  expect(observed.length).toBeGreaterThan(0);
});

// ─────────────────────────────────────────────────────────────────────────────
// Demo 6 — Visual Regression
// Capture baseline and compare — shows pixel-level change detection
// ─────────────────────────────────────────────────────────────────────────────
test('Demo 6 — Visual Regression', async ({ page }) => {
  Logger.info('═══ Demo 6: Visual Regression ═══');

  await page.goto(`${BASE}/login`);
  const visual = new VisualRegression(page);

  // First run: captures baseline if it doesn't exist
  const result = await visual.compare('demo-login-page');

  Logger.info(`Visual result: ${result.message}`);
  Logger.info(`Baseline: ${result.baselinePath}`);
  Logger.info(`Actual:   ${result.actualPath}`);

  // Always passes on first run (baseline creation)
  // On subsequent runs, detects pixel changes
  expect(result).toBeDefined();
  expect(result.baselinePath).toBeTruthy();
});

// ─────────────────────────────────────────────────────────────────────────────
// Demo 7 — Mobile Emulation
// Emulate iPhone 14, swipe, check viewport
// ─────────────────────────────────────────────────────────────────────────────
test('Demo 7 — Mobile Emulation', async ({ page }) => {
  Logger.info('═══ Demo 7: Mobile Emulation ═══');

  const mobile = new MobileHelper(page);

  // Emulate iPhone 14
  await mobile.emulateDevice('iPhone 14');
  Logger.info(`Viewport: ${JSON.stringify(mobile.getViewport())}`);
  expect(mobile.isMobileViewport()).toBe(true);

  await runSteps(
    page,
    [
      { label: 'Navigate on mobile', action: 'navigate', expectedUrl: `${BASE}/login` },
      {
        label: 'Verify mobile page load',
        action: 'assertVisible',
        codegenLocator: "getByRole('button', { name: 'Login' })",
      },
    ],
    { name: 'Mobile Demo', suite: 'smoke' }
  );

  // Rotate to landscape
  await mobile.rotateToLandscape();
  const vp = mobile.getViewport();
  Logger.info(`Landscape viewport: ${vp?.width}x${vp?.height}`);
  expect(vp!.width).toBeGreaterThan(vp!.height);

  // Rotate back to portrait
  await mobile.rotateToPortrait();
  const vpPortrait = mobile.getViewport();
  expect(vpPortrait!.height).toBeGreaterThan(vpPortrait!.width);
});

// ─────────────────────────────────────────────────────────────────────────────
// Demo 8 — Trace Manager (auto-save on failure)
// Wraps a workflow — saves trace only if it fails, discards on pass
// ─────────────────────────────────────────────────────────────────────────────
test('Demo 8 — Trace Manager', async ({ page, context }) => {
  Logger.info('═══ Demo 8: Trace Manager ═══');

  // playwright.config.ts already runs tracing (retain-on-failure).
  // Stop it first so TraceManager can start its own without conflict.
  try {
    await context.tracing.stop();
  } catch {
    /* none running — safe to ignore */
  }

  const trace = new TraceManager(context);
  await trace.start('demo-trace');

  await runSteps(
    page,
    [
      { label: 'Navigate', action: 'navigate', expectedUrl: `${BASE}/login` },
      {
        label: 'Verify loaded',
        action: 'assertVisible',
        codegenLocator: "getByRole('button', { name: 'Login' })",
      },
    ],
    { name: 'Trace Demo', suite: 'smoke' }
  );

  // Test passed — discard trace to save disk space
  await trace.discard();

  Logger.info('Trace discarded (test passed) — no disk usage');
  Logger.info('On failure: npx playwright show-trace test-results/traces/<name>.zip');

  const traces = TraceManager.listTraces();
  Logger.info(`Existing saved traces: ${traces.length}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Demo 9 — Session Management + StabilityGuard
// Save session state, restore it, guard against session expiry
// ─────────────────────────────────────────────────────────────────────────────
test('Demo 9 — Session Management + StabilityGuard', async ({ page }) => {
  Logger.info('═══ Demo 9: Session Management ═══');

  // Login first
  await runSteps(
    page,
    [
      { label: 'Navigate', action: 'navigate', expectedUrl: `${BASE}/login` },
      {
        label: 'Fill username',
        action: 'fill',
        codegenLocator: "getByRole('textbox', { name: 'Username' })",
        value: 'tomsmith',
      },
      {
        label: 'Fill password',
        action: 'fill',
        codegenLocator: "getByRole('textbox', { name: 'Password' })",
        value: 'SuperSecretPassword!',
      },
      { label: 'Login', action: 'click', codegenLocator: "getByRole('button', { name: 'Login' })" },
      {
        label: 'Verify login',
        action: 'assertVisible',
        codegenLocator: "getByRole('heading', { name: 'Secure Area' })",
      },
    ],
    { name: 'Session Login', suite: 'smoke' }
  );

  // StabilityGuard — monitors session health, auto-recovers if expired
  const guard = new StabilityGuard(page, {
    sessionAliveLocator: "getByRole('heading', { name: 'Secure Area' })",
    onSessionExpired: async (p) => {
      Logger.warn('Session expired — re-logging in');
      await p.goto(`${BASE}/login`);
      await p.getByRole('textbox', { name: 'Username' }).fill('tomsmith');
      await p.getByRole('textbox', { name: 'Password' }).fill('SuperSecretPassword!');
      await p.getByRole('button', { name: 'Login' }).click();
    },
  });

  // Check session is alive
  const alive = await guard.isSessionAlive();
  Logger.info(`Session alive: ${alive}`);
  expect(alive).toBe(true);

  // Pre-condition check — verifies page state before proceeding
  await guard.assertPreCondition(
    "getByRole('heading', { name: 'Secure Area' })",
    'Must be on Secure Area page before proceeding'
  );

  // withSessionRecovery — auto re-logins if action throws due to session expiry
  await guard.withSessionRecovery(async () => {
    await runSteps(
      page,
      [
        {
          label: 'Verify still on secure page',
          action: 'assertVisible',
          codegenLocator: "getByRole('heading', { name: 'Secure Area' })",
        },
      ],
      { name: 'Session Guard Demo', suite: 'smoke' }
    );
  });

  Logger.info('Session guard demo complete');
});

// ─────────────────────────────────────────────────────────────────────────────
// Demo 10 — Full Framework Showcase
// Combines: navigation, forms, assertions, waits, dynamic content
// Shows the framework handling a real dynamic page interaction
// ─────────────────────────────────────────────────────────────────────────────
test('Demo 10 — Full Framework Showcase (Dynamic Content)', async ({ page }) => {
  Logger.info('═══ Demo 10: Full Showcase ═══');

  const result = await runSteps(
    page,
    [
      // Navigation
      {
        label: 'Navigate to dynamic loading',
        action: 'navigate',
        expectedUrl: `${BASE}/dynamic_loading/1`,
      },
      // Assert initial state
      {
        label: 'Verify start button visible',
        action: 'assertVisible',
        codegenLocator: "getByRole('button', { name: 'Start' })",
      },
      // Click to trigger dynamic content
      {
        label: 'Click Start',
        action: 'click',
        codegenLocator: "getByRole('button', { name: 'Start' })",
      },
      // Wait for loading indicator to disappear using waitForSelector with hidden state
      {
        label: 'Wait for loader to finish',
        action: 'waitForSelector',
        locator: '#loading',
        waitForState: 'hidden',
      },
      // Wait for dynamic content to appear
      {
        label: 'Wait for Hello World text',
        action: 'waitForText',
        expectedText: 'Hello World!',
      },
      // Assert dynamic content loaded
      {
        label: 'Verify Hello World visible',
        action: 'assertVisible',
        codegenLocator: "getByText('Hello World!')",
      },
      // Assert URL unchanged
      {
        label: 'Assert URL',
        action: 'assertUrl',
        expectedUrl: '/dynamic_loading/1',
      },
      // Screenshot of final state
      {
        label: 'Capture final screenshot',
        action: 'screenshot',
        screenshotName: 'demo-dynamic-loading-final.png',
      },
    ],
    {
      name: 'Full Framework Showcase',
      suite: 'regression',
      stopOnFailure: true,
      screenshotOnFailure: true,
      waitForStabilityAfterAction: true,
      maxWorkflowMs: 45000,
    }
  );

  Logger.info(`\n${'═'.repeat(60)}`);
  Logger.info('DEMO RESULTS SUMMARY');
  Logger.info('═'.repeat(60));
  result.steps.forEach((s) => {
    const icon = s.result.success ? '✅' : s.soft ? '⚠️' : '❌';
    Logger.info(`  ${icon} [${s.result.layer}] ${s.label} (${s.result.durationMs ?? 0}ms)`);
  });
  Logger.info(`${'─'.repeat(60)}`);
  Logger.info(`Total: ${result.passed} passed | ${result.failed} failed | ${result.durationMs}ms`);
  Logger.info('═'.repeat(60));

  expect(result.failed, 'All showcase steps should pass').toBe(0);
});
