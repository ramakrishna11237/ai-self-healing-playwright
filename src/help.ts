#!/usr/bin/env ts-node
/**
 * AI Automation Framework — Help CLI
 * Run: npm run help
 */
/* eslint-disable no-console */

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';

function h1(t: string) {
  console.log(`\n${BOLD}${CYAN}${t}${RESET}`);
}
function h2(t: string) {
  console.log(`\n${BOLD}${GREEN}  ${t}${RESET}`);
}
function row(k: string, v: string) {
  console.log(`  ${YELLOW}${k.padEnd(28)}${RESET}${DIM}${v}${RESET}`);
}
function code(t: string) {
  console.log(`  ${DIM}${t}${RESET}`);
}
function nl() {
  console.log('');
}

console.log(`\n${BOLD}${CYAN}╔══════════════════════════════════════════════════════╗`);
console.log(`║        AI Automation Framework — Help                ║`);
console.log(`╚══════════════════════════════════════════════════════╝${RESET}`);

// ── Quick Start ───────────────────────────────────────────────────────────────
h1('QUICK START');
code('npm install                    # install dependencies');
code('npm run setup                  # generate .env + install browsers');
code('npm test                       # run all tests');
code('npm run test:smoke             # smoke suite only');
code('npm run test:headed            # visible browser');
code('npm run test:debug             # Playwright inspector');
code('npm run report                 # open HTML report');
code('npm run help                   # this screen');

// ── Test Commands ─────────────────────────────────────────────────────────────
h1('TEST COMMANDS');
row('npm test', 'Run all tests');
row('npm run test:smoke', 'Smoke suite');
row('npm run test:sanity', 'Sanity suite');
row('npm run test:regression', 'Regression suite');
row('npm run test:headed', 'Visible browser (HEADLESS=false)');
row('npm run test:debug', 'Playwright inspector (PWDEBUG=1)');
row('npm run test:mobile', 'Mobile emulation (Pixel 5)');
row('npm run test:demo', 'Framework feature demo');
row('npm run test:demo:headed', 'Demo with visible browser');
row('npm run report', 'Open HTML report');
row('npm run clean', 'Delete test-results + learning-db');

// ── Environment Variables ─────────────────────────────────────────────────────
h1('ENVIRONMENT VARIABLES (.env)');
row('APP_URL', 'Login page URL');
row('APP_USERNAME', 'Test user login');
row('APP_PASSWORD', 'Test user password');
row('BASE_URL', 'App domain (for Playwright baseURL)');
row('HEADLESS', 'true | false (default: true)');
row('FW_TIMEOUT', 'Action timeout ms (default: 5000)');
row('FW_WAIT_TIMEOUT', 'Element wait timeout ms (default: 5000)');
row('FW_STRATEGY_TIMEOUT', 'Per-strategy timeout ms (default: 1000)');
row('FW_MAX_RETRIES', 'Retry attempts (default: 3)');
row('FW_LEARNING', 'Enable self-healing (default: true)');
row('FW_LOG_LEVEL', 'debug | info | warn | error (default: info)');
row('FW_DEBUG', 'true = visual step highlighting in headed mode');
row('FW_DEBUG_DELAY', 'ms to pause per step in debug mode (default: 500)');

// ── All Action Types ──────────────────────────────────────────────────────────
h1('ALL ACTION TYPES');

h2('Navigation');
row('navigate', 'Go to a URL  { expectedUrl }');
row('reload', 'Reload current page');
row('goBack / goForward', 'Browser history navigation');
row('newTab / closeTab', 'Open or close a browser tab');
row('switchTab', 'Switch to tab by index  { tabIndex }');

h2('Mouse');
row('click', 'Click an element');
row('doubleClick', 'Double-click an element');
row('rightClick', 'Right-click (context menu)');
row('hover', 'Hover mouse over element');
row('dragDrop', 'Drag element to target  { dragTo }');
row('tap', 'Mobile touch tap');

h2('Keyboard / Input');
row('fill', 'Type into a field  { value }');
row('clearInput', 'Clear a field');
row('typeSlowly', 'Type with delay  { value, delay }');
row('keyPress', "Press a key  { key: 'Enter' }");
row('focus / blur', 'Focus or unfocus an element');
row('selectAll', 'Select all text in element');

h2('Forms');
row('submit', 'Submit a form');
row('dropdown', 'Select from <select>  { value }');
row('multiSelect', 'Select multiple options  { values }');
row('check / uncheck', 'Checkbox interactions');
row('upload', 'Upload file  { filePath }');
row('fileDownload', 'Download file  { filePath? }');

h2('Assertions');
row('assertVisible', 'Element is visible');
row('assertHidden', 'Element is hidden or absent');
row('assertText', 'Element text contains  { expectedText }');
row('assertValue', 'Input value equals  { expectedText }');
row('assertUrl', 'URL contains  { expectedUrl }');
row('assertTitle', 'Page title contains  { expectedTitle }');
row('assertCount', 'Element count equals  { expectedCount }');
row('assertAttribute', 'Attribute contains  { attributeName, expectedAttribute }');
row('assertChecked', 'Checkbox is checked');
row('assertEnabled / Disabled', 'Element enabled/disabled state');
row('assertPattern', 'Text matches regex  { pattern, patternFlags? }');
row('assertPdf', 'PDF content verification  { pdfTriggerLocator, pdfExpectedTexts, pdfPatterns }');

h2('Waits');
row('wait', 'Wait ms  { waitMs }');
row('waitForUrl', 'Wait for URL  { expectedUrl }');
row('waitForText', 'Wait for text  { expectedText }');
row('waitForNetwork', 'Wait for network idle');
row('waitForFunction', 'Wait for JS expression  { expression }');
row('waitForSelector', 'Wait for selector state  { locator, waitForState }');

h2('Advanced');
row('screenshot', 'Capture screenshot  { screenshotName }');
row('scroll', 'Scroll page  { scrollDirection, scrollAmount }');
row('scrollTo', 'Scroll element into view');
row('iframe', 'Interact inside iframe  { iframeLocator }');
row('alert', 'Handle dialog  { alertAction: accept|dismiss }');
row('evaluate', 'Run JS  { expression }');
row('dispatchEvent', 'Fire DOM event  { eventType, eventInit }');
row('clipboardCopy / Paste', 'Clipboard operations');
row('geolocation', 'Mock location  { latitude, longitude }');
row('emulateMedia', 'Emulate media  { colorScheme, media }');

// ── Workflow Options ──────────────────────────────────────────────────────────
h1('WORKFLOW OPTIONS (runSteps)');
row('name', 'Workflow name for reporting');
row('suite', 'smoke | sanity | regression | general');
row('stopOnFailure', 'Halt on first hard failure (default: false)');
row('screenshotOnFailure', 'Auto screenshot on failure (default: true)');
row('screenshotEachStep', 'Screenshot every step (default: false)');
row('waitForStabilityAfterAction', 'Wait for page stable after clicks (default: false)');
row('workflowRetries', 'Retry entire workflow N times (default: 0)');
row('maxWorkflowMs', 'Hard budget — stops runaway tests');

// ── Step Fields ───────────────────────────────────────────────────────────────
h1('STEP FIELDS');
row('label', 'Required. Human-readable step name');
row('action', 'Action type (see above). Auto-detected from label if omitted');
row('codegenLocator', 'Playwright codegen locator string (preferred)');
row('locator', 'CSS/XPath locator (fallback)');
row('value', 'Input value for fill/dropdown');
row('expectedText', 'Expected text for assertions');
row('expectedUrl', 'Expected URL for navigate/assertUrl');
row('soft', 'true = failure recorded but workflow continues');
row('scope', 'CSS selector to restrict locator to a container');
row('timeout', 'Override timeout for this step only');
row('extra', 'Object to store step output (e.g. PDF results)');

// ── 4-Layer Recovery ──────────────────────────────────────────────────────────
h1('4-LAYER RECOVERY');
code('Layer 1: Direct execution (codegen locator)        ~3ms  ← 95% of steps');
code('Layer 2: Strategy fallback (parallel batch race)   ~50ms ← getByRole, getByLabel, CSS');
code('Layer 3: Learned fix (learning-db.json cache)      ~0ms  ← previously healed locators');
code('Layer 4: DOM capture + self-heal                   ~30ms ← targeted container snapshot');

// ── Debugging ─────────────────────────────────────────────────────────────────
h1('DEBUGGING');
row('FW_LOG_LEVEL=debug', 'Full strategy trace — shows every locator tried');
row('HEADLESS=false', 'Watch the browser execute steps');
row('FW_DEBUG=true', 'Visual element highlighting in headed mode');
row('PWDEBUG=1', 'Playwright inspector — step through actions');
code('');
code('# Capture trace for failed test:');
code('const trace = new TraceManager(context);');
code("await trace.wrap('my-test', async () => { await runSteps(...) });");
code('# Then: npx playwright show-trace test-results/traces/<name>.zip');

// ── Troubleshooting ───────────────────────────────────────────────────────────
h1('TROUBLESHOOTING');

h2("Step fails with 'locator not found'");
code('  1. Run: npx playwright codegen <url>  to get fresh locators');
code('  2. Check if element is inside an iframe — use iframeLocator');
code("  3. Check if element is inside a modal — use scope: '.modal-content'");
code('  4. Set FW_LOG_LEVEL=debug to see all 15 strategies tried');

h2('Self-heal stores wrong locator');
code('  1. Check learning-db.json for conflicting entries');
code('  2. Delete the wrong entry manually from learning-db.json');
code('  3. Assertion steps never self-heal (assertVisible, assertText etc.)');

h2('Tests are slow');
code('  1. Reduce FW_STRATEGY_TIMEOUT from 1000 to 500 in .env');
code('  2. Always provide codegenLocator — Layer 1 is 10x faster than Layer 2');
code('  3. Use scope to restrict locator to a container');

h2('Session expires mid-test');
code('  const guard = new StabilityGuard(page, {');
code("    sessionAliveLocator: \"getByRole('link', { name: 'Modules' })\",");
code('    onSessionExpired: async (p) => { await loginPage.login(); }');
code('  });');
code('  await guard.withSessionRecovery(() => doSomething());');

h2('Network errors in test');
code('  await loginPage.startErrorMonitoring();');
code('  // ... run test ...');
code('  await loginPage.stopErrorMonitoring();');
code('  loginPage.assertNoServerErrors(); // throws if any 5xx found');

// ── Custom Actions ────────────────────────────────────────────────────────────
h1('ADDING CUSTOM ACTIONS');
code("  import { registerAction } from '../src/engine/ActionRouter';");
code("  registerAction('selectSelect2', async (page, step) => {");
code('    await page.locator(step.locator!).click();');
code("    await page.locator('.select2-result-label').filter({ hasText: step.value! }).click();");
code('    return true;');
code('  });');
code('  // Use in steps:');
code(
  "  { label: 'Select option', action: 'selectSelect2', locator: '#mySelect', value: 'Option A' }"
);

// ── Project Structure ─────────────────────────────────────────────────────────
h1('PROJECT STRUCTURE');
code('  src/core/          Runner.ts, WorkflowRunner.ts');
code('  src/engine/        ActionRouter, LocatorEngine, PatternEngine, RetryEngine, SmartWait');
code('  src/healing/       SelfHeal.ts');
code('  src/learning/      LearningStore.ts, FixApplier.ts');
code('  src/dom/           DOMCapture, DOMDiff, VisualDiff');
code('  src/pages/         BasePage, LoginPage, NavigationPage');
code('  src/utils/         Logger, PageHelper, MobileHelper, TraceManager,');
code('                     StabilityGuard, NetworkInterceptor, AccessibilityChecker,');
code('                     VisualRegression, ApiClient, PdfVerifier, DebugMode');
code('  src/tests/         smoke/, sanity/, regression/');
code('  learning-db.json   Auto-updated healing cache — never edit manually');

nl();
console.log(`${BOLD}${GREEN}  Run 'npm run setup' to configure your environment.${RESET}`);
nl();
