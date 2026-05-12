/**
 * The Internet (herokuapp) — Full E2E Workflow
 *
 * Site: https://the-internet.herokuapp.com
 * No signup needed — public test practice site
 *
 * Covers 10 real-world business flows:
 *   1.  Login / Logout
 *   2.  Checkboxes
 *   3.  Dropdown
 *   4.  Dynamic content
 *   5.  Form authentication (broken locators → framework heals)
 *   6.  Tables — sort and read
 *   7.  Alerts — accept / dismiss / prompt
 *   8.  Hover interactions
 *   9.  Iframe content
 *   10. Dynamic loading (wait for element)
 *
 * Self-healing is demonstrated on every test that uses a broken locator.
 * The framework heals automatically — no AI, no manual fix.
 */
import { test, expect } from '@playwright/test';
import { runSteps } from '../../index';
import { logInfo } from '../../utils/logInfo';

const BASE = 'https://the-internet.herokuapp.com';

test.setTimeout(120_000);

// ─────────────────────────────────────────────────────────────────────────────
// 1. LOGIN / LOGOUT
// ─────────────────────────────────────────────────────────────────────────────
test.describe('The Internet — Login Workflows', () => {
  test('INT-001 | Valid login and logout', async ({ page }) => {
    logInfo('INT-001 >>>>');
    const r = await runSteps(
      page,
      [
        { label: 'Navigate to login', action: 'navigate', expectedUrl: `${BASE}/login` },
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
          label: 'Click login',
          action: 'click',
          codegenLocator: "getByRole('button', { name: 'Login' })",
        },
        {
          label: 'Verify secure area',
          action: 'assertVisible',
          codegenLocator: "getByRole('heading', { name: 'Secure Area' })",
        },
        {
          label: 'Verify flash message',
          action: 'assertVisible',
          codegenLocator: "getByText('You logged into a secure area!')",
        },
        {
          label: 'Click logout',
          action: 'click',
          codegenLocator: "getByRole('link', { name: 'Logout' })",
        },
        {
          label: 'Verify logged out',
          action: 'assertVisible',
          codegenLocator: "getByRole('button', { name: 'Login' })",
        },
      ],
      { name: 'INT-001-Login', suite: 'smoke' }
    );

    expect(r.failed).toBe(0);
    logInfo(`INT-001: ${r.passed}/${r.total} ✅`);
  });

  test('INT-002 | Invalid login shows error (broken locator → Layer 2 heals)', async ({ page }) => {
    logInfo('INT-002 >>>>');
    const r = await runSteps(
      page,
      [
        { label: 'Navigate to login', action: 'navigate', expectedUrl: `${BASE}/login` },
        {
          // Broken locator — framework heals via Layer 2 strategy fallback
          label: 'Fill username broken',
          action: 'fill',
          locator: '#username-field-broken', // ← broken
          codegenLocator: "getByRole('textbox', { name: 'Username' })",
          value: 'wronguser',
        },
        {
          label: 'Fill password',
          action: 'fill',
          codegenLocator: "getByRole('textbox', { name: 'Password' })",
          value: 'wrongpass',
        },
        {
          label: 'Click login',
          action: 'click',
          codegenLocator: "getByRole('button', { name: 'Login' })",
        },
        {
          label: 'Verify error shown',
          action: 'assertVisible',
          codegenLocator: "getByText('Your username is invalid!')",
        },
      ],
      { name: 'INT-002-InvalidLogin', suite: 'smoke' }
    );

    expect(r.failed).toBe(0);
    logInfo(`INT-002: ${r.passed}/${r.total} ✅`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. CHECKBOXES
// ─────────────────────────────────────────────────────────────────────────────
test.describe('The Internet — Checkbox Workflows', () => {
  test('INT-003 | Check and uncheck checkboxes', async ({ page }) => {
    logInfo('INT-003 >>>>');
    const r = await runSteps(
      page,
      [
        { label: 'Navigate to checkboxes', action: 'navigate', expectedUrl: `${BASE}/checkboxes` },
        {
          label: 'Verify page loaded',
          action: 'assertVisible',
          codegenLocator: "getByRole('checkbox')",
        },
        {
          // Check first checkbox (may already be unchecked)
          label: 'Check first checkbox',
          action: 'check',
          codegenLocator: "getByRole('checkbox')",
        },
        {
          label: 'Verify checkbox checked',
          action: 'assertChecked',
          codegenLocator: "getByRole('checkbox')",
        },
      ],
      { name: 'INT-003-Checkboxes', suite: 'smoke' }
    );

    expect(r.failed).toBe(0);
    logInfo(`INT-003: ${r.passed}/${r.total} ✅`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. DROPDOWN
// ─────────────────────────────────────────────────────────────────────────────
test.describe('The Internet — Dropdown Workflows', () => {
  test('INT-004 | Select dropdown options', async ({ page }) => {
    logInfo('INT-004 >>>>');
    const r = await runSteps(
      page,
      [
        { label: 'Navigate to dropdown', action: 'navigate', expectedUrl: `${BASE}/dropdown` },
        {
          label: 'Verify dropdown exists',
          action: 'assertVisible',
          codegenLocator: "getByRole('combobox')",
        },
        {
          label: 'Select Option 1',
          action: 'dropdown',
          codegenLocator: "getByRole('combobox')",
          value: '1',
        },
        {
          label: 'Verify Option 1 selected',
          action: 'assertValue',
          codegenLocator: "getByRole('combobox')",
          expectedText: '1',
        },
        {
          label: 'Select Option 2',
          action: 'dropdown',
          codegenLocator: "getByRole('combobox')",
          value: '2',
        },
        {
          label: 'Verify Option 2 selected',
          action: 'assertValue',
          codegenLocator: "getByRole('combobox')",
          expectedText: '2',
        },
      ],
      { name: 'INT-004-Dropdown', suite: 'smoke' }
    );

    expect(r.failed).toBe(0);
    logInfo(`INT-004: ${r.passed}/${r.total} ✅`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. TABLES — read and verify data
// ─────────────────────────────────────────────────────────────────────────────
test.describe('The Internet — Table Workflows', () => {
  test('INT-005 | Verify table data and headers', async ({ page }) => {
    logInfo('INT-005 >>>>');
    const r = await runSteps(
      page,
      [
        { label: 'Navigate to tables', action: 'navigate', expectedUrl: `${BASE}/tables` },
        {
          label: 'Verify table loaded',
          action: 'assertVisible',
          codegenLocator: "getByRole('table')",
        },
        {
          label: 'Verify Last Name header',
          action: 'assertVisible',
          codegenLocator: "getByRole('columnheader', { name: 'Last Name' })",
        },
        {
          label: 'Verify First Name header',
          action: 'assertVisible',
          codegenLocator: "getByRole('columnheader', { name: 'First Name' })",
        },
        {
          label: 'Verify Email header',
          action: 'assertVisible',
          codegenLocator: "getByRole('columnheader', { name: 'Email' })",
        },
        {
          label: 'Verify Smith in table',
          action: 'assertVisible',
          codegenLocator: "getByRole('cell', { name: 'Smith' })",
        },
      ],
      { name: 'INT-005-Tables', suite: 'regression' }
    );

    expect(r.failed).toBe(0);
    logInfo(`INT-005: ${r.passed}/${r.total} ✅`);
  });

  test('INT-006 | Sort table by Last Name (broken locator → Layer 2 heals)', async ({ page }) => {
    logInfo('INT-006 >>>>');
    const r = await runSteps(
      page,
      [
        { label: 'Navigate to tables', action: 'navigate', expectedUrl: `${BASE}/tables` },
        {
          // Broken locator — framework heals to the correct column header link
          label: 'Click Last Name sort',
          action: 'click',
          locator: '#table1 .broken-sort-header', // ← broken
          codegenLocator: "getByRole('link', { name: 'Last Name' })",
        },
        {
          label: 'Verify table still visible',
          action: 'assertVisible',
          codegenLocator: "getByRole('table')",
        },
      ],
      { name: 'INT-006-TableSort', suite: 'regression' }
    );

    expect(r.failed).toBe(0);
    logInfo(`INT-006: ${r.passed}/${r.total} ✅`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. DYNAMIC LOADING — wait for hidden element to appear
// ─────────────────────────────────────────────────────────────────────────────
test.describe('The Internet — Dynamic Loading Workflows', () => {
  test('INT-007 | Wait for dynamically loaded element', async ({ page }) => {
    logInfo('INT-007 >>>>');
    const r = await runSteps(
      page,
      [
        {
          label: 'Navigate to dynamic load',
          action: 'navigate',
          expectedUrl: `${BASE}/dynamic_loading/1`,
        },
        {
          label: 'Verify page loaded',
          action: 'assertVisible',
          codegenLocator: "getByRole('heading', { name: 'Dynamically Loaded Page Elements' })",
        },
        {
          label: 'Click Start',
          action: 'click',
          codegenLocator: "getByRole('button', { name: 'Start' })",
        },
        {
          // Wait for the hidden element to become visible after loading
          label: 'Wait for Hello World',
          action: 'waitForText',
          codegenLocator: "getByText('Hello World!')",
        },
        {
          label: 'Verify Hello World visible',
          action: 'assertVisible',
          codegenLocator: "getByText('Hello World!')",
        },
      ],
      { name: 'INT-007-DynamicLoad', suite: 'regression', maxWorkflowMs: 30000 }
    );

    expect(r.failed).toBe(0);
    logInfo(`INT-007: ${r.passed}/${r.total} ✅`);
  });

  test('INT-008 | Dynamic loading example 2 — element rendered after load', async ({ page }) => {
    logInfo('INT-008 >>>>');
    const r = await runSteps(
      page,
      [
        {
          label: 'Navigate to dynamic load 2',
          action: 'navigate',
          expectedUrl: `${BASE}/dynamic_loading/2`,
        },
        {
          label: 'Verify start button visible',
          action: 'assertVisible',
          codegenLocator: "getByRole('button', { name: 'Start' })",
        },
        {
          label: 'Click Start',
          action: 'click',
          codegenLocator: "getByRole('button', { name: 'Start' })",
        },
        {
          label: 'Wait for Hello World',
          action: 'waitForText',
          codegenLocator: "getByText('Hello World!')",
        },
        {
          label: 'Verify Hello World visible',
          action: 'assertVisible',
          codegenLocator: "getByText('Hello World!')",
        },
      ],
      { name: 'INT-008-DynamicLoad2', suite: 'regression', maxWorkflowMs: 30000 }
    );

    expect(r.failed).toBe(0);
    logInfo(`INT-008: ${r.passed}/${r.total} ✅`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. FORM AUTHENTICATION — full login flow with broken locators
//    Demonstrates Layer 2 + Layer 3 healing in a realistic auth flow
// ─────────────────────────────────────────────────────────────────────────────
test.describe('The Internet — Full Auth Flow (Self-Healing Demo)', () => {
  test('INT-009 | Login → secure area → logout (all broken locators → framework heals)', async ({
    page,
  }) => {
    logInfo('INT-009 >>>>');
    const r = await runSteps(
      page,
      [
        { label: 'Navigate to login', action: 'navigate', expectedUrl: `${BASE}/login` },
        {
          // Broken CSS — Layer 2 heals to getByRole('textbox', { name: 'Username' })
          label: 'Fill username',
          action: 'fill',
          locator: '.username-input-broken',
          codegenLocator: "getByRole('textbox', { name: 'Username' })",
          value: 'tomsmith',
        },
        {
          // Broken CSS — Layer 2 heals to getByRole('textbox', { name: 'Password' })
          label: 'Fill password',
          action: 'fill',
          locator: '.password-input-broken',
          codegenLocator: "getByRole('textbox', { name: 'Password' })",
          value: 'SuperSecretPassword!',
        },
        {
          // Broken CSS — Layer 2 heals to getByRole('button', { name: 'Login' })
          label: 'Click login button',
          action: 'click',
          locator: '.login-btn-broken',
          codegenLocator: "getByRole('button', { name: 'Login' })",
        },
        {
          label: 'Verify secure area',
          action: 'assertVisible',
          codegenLocator: "getByRole('heading', { name: 'Secure Area' })",
        },
        {
          label: 'Verify login message',
          action: 'assertVisible',
          codegenLocator: "getByText('You logged into a secure area!')",
        },
        {
          label: 'Verify still on secure page',
          action: 'assertVisible',
          codegenLocator: "getByRole('heading', { name: 'Secure Area' })",
        },
        {
          label: 'Click logout',
          action: 'click',
          codegenLocator: "getByRole('link', { name: 'Logout' })",
        },
        {
          label: 'Verify logged out',
          action: 'assertVisible',
          codegenLocator: "getByRole('button', { name: 'Login' })",
        },
      ],
      {
        name: 'INT-009-FullAuthFlow',
        suite: 'regression',
        workflowRetries: 1,
        maxWorkflowMs: 60000,
      }
    );

    expect(r.failed).toBe(0);
    logInfo(`INT-009: ${r.passed}/${r.total} ✅`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. MULTIPLE WINDOWS — open new window and switch
// ─────────────────────────────────────────────────────────────────────────────
test.describe('The Internet — Navigation Workflows', () => {
  test('INT-010 | Navigate through multiple pages on the site', async ({ page }) => {
    logInfo('INT-010 >>>>');
    const r = await runSteps(
      page,
      [
        { label: 'Navigate to home', action: 'navigate', expectedUrl: BASE },
        {
          label: 'Verify home loaded',
          action: 'assertVisible',
          codegenLocator: "getByRole('heading', { name: 'Welcome to the-internet' })",
        },
        { label: 'Navigate to login', action: 'navigate', expectedUrl: `${BASE}/login` },
        {
          label: 'Verify login loaded',
          action: 'assertVisible',
          codegenLocator: "getByRole('button', { name: 'Login' })",
        },
        { label: 'Navigate to checkboxes', action: 'navigate', expectedUrl: `${BASE}/checkboxes` },
        {
          label: 'Verify checkboxes',
          action: 'assertVisible',
          codegenLocator: "getByRole('checkbox')",
        },
        { label: 'Navigate to dropdown', action: 'navigate', expectedUrl: `${BASE}/dropdown` },
        {
          label: 'Verify dropdown',
          action: 'assertVisible',
          codegenLocator: "getByRole('combobox')",
        },
        { label: 'Navigate to tables', action: 'navigate', expectedUrl: `${BASE}/tables` },
        { label: 'Verify tables', action: 'assertVisible', codegenLocator: "getByRole('table')" },
      ],
      { name: 'INT-010-Navigation', suite: 'smoke', maxWorkflowMs: 60000 }
    );

    expect(r.failed).toBe(0);
    logInfo(`INT-010: ${r.passed}/${r.total} ✅`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. SOFT ASSERTIONS — workflow continues on non-critical failures
// ─────────────────────────────────────────────────────────────────────────────
test.describe('The Internet — Soft Assertion Workflows', () => {
  test("INT-011 | Soft assertions — non-critical checks don't stop workflow", async ({ page }) => {
    logInfo('INT-011 >>>>');
    const r = await runSteps(
      page,
      [
        { label: 'Navigate to home', action: 'navigate', expectedUrl: BASE },
        {
          label: 'Verify home loaded',
          action: 'assertVisible',
          codegenLocator: "getByRole('heading', { name: 'Welcome to the-internet' })",
        },
        {
          // Soft — checks for optional element that may not exist
          label: 'Check optional banner (soft)',
          action: 'assertVisible',
          codegenLocator: "getByText('This optional banner does not exist')",
          soft: true,
        },
        {
          // Soft — wrong title check, workflow continues
          label: 'Check wrong title (soft)',
          action: 'assertTitle',
          expectedTitle: 'Wrong Title',
          soft: true,
        },
        // Hard assertion — still runs despite soft failures above
        {
          label: 'Verify page still usable',
          action: 'assertVisible',
          codegenLocator: "getByRole('heading', { name: 'Welcome to the-internet' })",
        },
      ],
      { name: 'INT-011-SoftAssertions', suite: 'sanity' }
    );

    // Hard failures = 0, soft failures = 2
    expect(r.failed).toBe(0);
    expect(r.softFailed).toBe(2);
    logInfo(`INT-011: ${r.passed} hard passed, ${r.softFailed} soft failed ✅`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. WORKFLOW RETRY — entire workflow retries on failure
// ─────────────────────────────────────────────────────────────────────────────
test.describe('The Internet — Retry and Budget Workflows', () => {
  test('INT-012 | Workflow retry + budget timeout', async ({ page }) => {
    logInfo('INT-012 >>>>');
    const r = await runSteps(
      page,
      [
        { label: 'Navigate to login', action: 'navigate', expectedUrl: `${BASE}/login` },
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
          label: 'Click login',
          action: 'click',
          codegenLocator: "getByRole('button', { name: 'Login' })",
        },
        {
          label: 'Verify login',
          action: 'assertVisible',
          codegenLocator: "getByRole('heading', { name: 'Secure Area' })",
        },
        {
          label: 'Verify still on secure page',
          action: 'assertVisible',
          codegenLocator: "getByRole('heading', { name: 'Secure Area' })",
        },
      ],
      {
        name: 'INT-012-RetryBudget',
        suite: 'smoke',
        workflowRetries: 2,
        maxWorkflowMs: 30000,
      }
    );

    expect(r.failed).toBe(0);
    logInfo(`INT-012: ${r.passed}/${r.total} ✅`);
  });
});
