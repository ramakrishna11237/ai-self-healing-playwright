# AI Automation Framework

Enterprise-grade test automation built on Playwright with self-healing locators, learning DB, **9-layer recovery**, local LLM integration, semantic synonym healing, and autonomous diagnostics.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Run setup wizard (generates .env, installs browsers)
npx ts-node src/setup.ts

# 3. Run tests
npm test
```

## Test Commands

```bash
npm test                    # all tests
npm run test:smoke          # smoke suite
npm run test:sanity         # sanity suite
npm run test:regression     # regression suite
npm run test:headed         # visible browser
npm run test:debug          # Playwright inspector
npm run test:mobile         # mobile emulation (Pixel 5)
npm run report              # open HTML report
```

---

## Architecture — 9-Layer Recovery

Every step goes through 9 layers before failing:

```
Step executes
  │
  ├─ Layer 0:   NavigationGuard (retry + blank page)      ~0ms    ← navigation resilience
  │
  ├─ Layer 1:   Direct execution + retry/backoff          ~5ms    ← 95% of steps stop here
  │
  ├─ Layer 2a:  SmartLocatorEngine (confidence-scored)    ~50ms   ← 30+ candidates, context-aware
  │             data-testid(100) → id(95) → aria-label(90) → role+name(85) → label(80) → ...
  │
  ├─ Layer 2b:  Batch strategy fallback (parallel race)   ~50ms   ← getByRole, getByLabel, CSS variants
  │
  ├─ Layer 3:   Learned fix (learning-db.json cache)      ~2ms    ← previously healed locators
  │
  ├─ Layer 3.5: LLM label prediction (no DOM needed)      ~200ms  ← LLM predicts locator from step label only
  │
  ├─ Layer 4:   DOM capture + self-heal                   ~50ms   ← targeted container snapshot + fuzzy match
  │
  ├─ Layer 5:   Ollama LLM (local AI + full DOM)          ~2s     ← LLM reads DOM, suggests locator
  │
  ├─ Layer 6:   Autonomous Diagnostics                    ~500ms  ← DOM analysis, failure classification
  │
  └─ Layer 7:   Semantic Synonym Healing                  ~100ms  ← Cancel→Reset, Submit→Save
```

**Confidence scoring in Layer 2a:**

| Score | Strategy | Example |
|---|---|---|
| 100 | data-testid / data-cy / data-qa | `[data-testid="submit-btn"]` |
| 95 | id attribute | `#username` |
| 90 | aria-label | `[aria-label="Username"]` |
| 85 | role + name | `getByRole('button', { name: 'Login' })` |
| 80 | label association | `getByLabel('Email address')` |
| 75 | name attribute | `[name="email"]` |
| 70 | placeholder | `getByPlaceholder('Enter email')` |
| 65 | exact text | `getByText('Submit', { exact: true })` |
| 55 | title attribute | `[title="Close dialog"]` |
| 50 | partial text | `getByText('Submit', { exact: false })` |
| 40 | regex text | `getByText(/submit/i)` |
| 20 | tag fallback | `button:has-text("Submit")` |

---

## Writing Tests

```typescript
import { test } from "@playwright/test";
import { runSteps } from "../src";

test("login and navigate", async ({ page }) => {
  await runSteps(page, [
    { label: "Navigate",       action: "navigate",      expectedUrl: process.env.APP_URL },
    { label: "Enter username", action: "fill",          codegenLocator: "getByRole('textbox', { name: 'Username' })", value: process.env.APP_USERNAME },
    { label: "Enter password", action: "fill",          codegenLocator: "getByRole('textbox', { name: 'Password' })", value: process.env.APP_PASSWORD },
    { label: "Click Login",    action: "click",         codegenLocator: "getByRole('button', { name: 'Login' })" },
    { label: "Verify login",   action: "assertVisible", codegenLocator: "getByRole('link', { name: 'Modules' })" },
  ], { name: "Login", suite: "smoke" });
});
```

### Workflow Options

```typescript
await runSteps(page, steps, {
  name:                       "My Workflow",
  suite:                      "regression",     // smoke | sanity | regression | general
  stopOnFailure:              true,             // halt on first hard failure
  screenshotOnFailure:        true,             // auto screenshot on failure
  screenshotEachStep:         false,            // screenshot every step
  waitForStabilityAfterAction: true,            // wait for page stable after clicks
  workflowRetries:            1,               // retry entire workflow on failure
  maxWorkflowMs:              60000,           // hard budget — stops runaway tests
});
```

### Soft Assertions

```typescript
// Soft failures are recorded but workflow continues — like Playwright expect.soft()
{ label: "Check banner", action: "assertVisible", codegenLocator: "...", soft: true }
```

### Parallel Workflows

```typescript
import { runStepsParallel } from "../src";

const [loginResult, setupResult] = await runStepsParallel([
  { page: page1, steps: loginSteps,  options: { name: "Login" } },
  { page: page2, steps: setupSteps,  options: { name: "Setup" } },
]);
```

---

## Self-Healing

When a locator fails, the framework automatically tries alternatives and stores the fix:

```json
// learning-db.json — auto-updated, never edit manually
{
  "old": "Click Login button",
  "new": "getByRole('button', { name: 'Login' })",
  "action": "click",
  "count": 50
}
```

Healing is **blocked for assertions** — a `assertVisible` step will never heal to a button or link (prevents false passes).

---

## Mobile Testing

```typescript
import { MobileHelper, MOBILE_DEVICES } from "../src/utils/MobileHelper";

test("mobile login", async ({ page }) => {
  const mobile = new MobileHelper(page);
  await mobile.emulateDevice("iPhone 14");
  await page.goto(process.env.APP_URL!);

  await mobile.swipe("up", 400);
  await mobile.tap("getByRole('button', { name: 'Login' })");
  await mobile.rotateToLandscape();
});
```

Available devices: `Pixel 5`, `Pixel 7`, `iPhone 12`, `iPhone 13`, `iPhone 14`, `iPhone 14 Pro Max`, `iPhone SE`, `iPad Pro 11`, `iPad Mini` + landscape variants.

---

## Debugging — Trace Viewer

```typescript
import { TraceManager } from "../src/utils/TraceManager";

test("debug failing workflow", async ({ page, context }) => {
  const trace = new TraceManager(context);

  // Auto-saves trace only on failure, discards on pass
  await trace.wrap("login-flow", async () => {
    await runSteps(page, steps);
  });
});

// Open the trace:
// npx playwright show-trace test-results/traces/login-flow-<timestamp>.zip
```

Traces include: full action timeline, DOM snapshots before/after every action, network requests, console logs, screenshots.

---

## Session Management

```typescript
import { StabilityGuard } from "../src/utils/StabilityGuard";

const guard = new StabilityGuard(page, {
  sessionAliveLocator: "getByRole('link', { name: 'Modules' })",
  onSessionExpired: async (page) => {
    const login = new LoginPage(page);
    await login.login();
  }
});

// Auto re-login if session expires mid-test
await guard.withSessionRecovery(
  () => navPage.goToModule("Leave"),
  () => navPage.goToModule("Leave")
);
```

---

## Network Interception

```typescript
import { NetworkInterceptor } from "../src/utils/NetworkInterceptor";

const net = new NetworkInterceptor(page);
net.mock("/api/users", { status: 200, body: { users: [] } });
net.block("/analytics");
net.observe("/api/save");
await net.activate();
```

---

## Accessibility

```typescript
import { AccessibilityChecker } from "../src/utils/AccessibilityChecker";

const a11y = new AccessibilityChecker(page);
const result = await a11y.audit();
// Checks: missing button labels, images without alt, inputs without labels, empty links

await a11y.assertNoViolations(); // throws if violations found
```

---

## Visual Regression

```typescript
import { VisualRegression } from "../src/utils/VisualRegression";

const visual = new VisualRegression(page);
await visual.captureBaseline("login-page");          // run once
const result = await visual.compare("login-page");   // compare on every run
```

---

## Configuration

All settings via environment variables (`.env`):

| Variable | Default | Description |
|---|---|---|
| `BASE_URL` | — | App base URL |
| `APP_USERNAME` | — | Test user login |
| `APP_PASSWORD` | — | Test user password |
| `HEADLESS` | `true` | Run headless |
| `FW_TIMEOUT` | `5000` | Action timeout (ms) |
| `FW_WAIT_TIMEOUT` | `5000` | Element wait timeout (ms) |
| `FW_STRATEGY_TIMEOUT` | `1000` | Per-strategy timeout in Layer 2 (ms) |
| `FW_MAX_RETRIES` | `3` | Retry attempts per action |
| `FW_LEARNING` | `true` | Enable self-healing learning |
| `FW_LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `FW_LLM` | `false` | Enable Layer 5 LLM recovery (requires Ollama) |
| `FW_LLM_MODEL` | `llama3` | Ollama model name (`llama3`, `codellama`, `mistral`) |
| `FW_LLM_TIMEOUT_MS` | `8000` | Max ms to wait for LLM response |

---

## Project Structure

```
src/
├── core/
│   ├── Runner.ts                  # 9-layer step execution engine
│   └── WorkflowRunner.ts          # Workflow orchestration, retries, budget
├── engine/
│   ├── ActionRouter.ts            # 150+ action types
│   ├── ActionRouterExtensions.ts  # 35 deep automation actions
│   ├── ActionRouterExtensions2.ts # 63 additional actions
│   ├── LLMLocatorEngine.ts        # Layer 3.5 + Layer 5 — local Ollama LLM
│   ├── AutonomousDiagnostics.ts   # Autonomous failure analysis + auto-patch
│   ├── SmartLocatorEngine.ts      # Layer 2a — confidence-scored locator selection
│   ├── LocatorEngine.ts           # Layer 2b — locator strategy generation
│   ├── PatternEngine.ts           # Action detection from step labels
│   ├── RetryEngine.ts             # Exponential backoff with jitter
│   ├── FrameHandler.ts            # Automatic iframe + shadow DOM detection
│   └── SmartWait.ts               # Stability waits
├── healing/
│   └── SelfHeal.ts                # Layer 4 — DOM-based self-healing with assertion guard
├── learning/
│   ├── LearningStore.ts           # Layer 3 — persistent fix storage with in-memory cache
│   └── FixApplier.ts              # Best fix lookup
├── dom/
│   ├── DOMCapture.ts              # Targeted container-scoped DOM capture
│   ├── DOMDiff.ts                 # Before/after DOM diff
│   └── SmartDOMFilter.ts          # Interactive element extraction
├── pages/
│   ├── BasePage.ts                # Shared page actions
│   └── LoginPage.ts
└── utils/
    ├── MobileHelper.ts            # Device emulation, touch, swipe, orientation
    ├── TraceManager.ts            # Playwright trace recording
    ├── StabilityGuard.ts          # Session recovery, pre/post conditions
    ├── NetworkInterceptor.ts
    ├── AccessibilityChecker.ts
    ├── VisualRegression.ts
    ├── ApiClient.ts
    ├── SessionManager.ts
    ├── ParallelSession.ts
    ├── StepObserver.ts            # Full step observability with screenshots
    └── TestDataManager.ts
```

---

## Supported Actions

Navigation: `navigate` `reload` `goBack` `goForward` `newTab` `closeTab` `switchTab`

Mouse: `click` `doubleClick` `rightClick` `hover` `dragDrop` `tap`

Keyboard: `fill` `clearInput` `typeSlowly` `keyPress` `focus` `blur` `selectAll`

Forms: `submit` `dropdown` `multiSelect` `check` `uncheck` `upload` `fileDownload`

Assertions: `assertVisible` `assertHidden` `assertText` `assertValue` `assertUrl` `assertTitle` `assertCount` `assertAttribute` `assertChecked` `assertEnabled` `assertDisabled` `assertHasClass` `assertInViewport` `assertEditable` `assertFocused`

Waits: `wait` `waitForUrl` `waitForText` `waitForNetwork` `waitForFunction` `waitForSelector`

Advanced: `iframe` `alert` `screenshot` `scroll` `scrollTo` `evaluate` `dispatchEvent` `clipboardCopy` `clipboardPaste` `geolocation` `emulateMedia`

---

## Adding Custom Actions

```typescript
import { registerAction } from "../src/engine/ActionRouter";

registerAction("selectSelect2", async (page, step) => {
  await page.locator(step.locator!).click();
  await page.locator(".select2-result-label").filter({ hasText: step.value! }).click();
  return true;
});
```

---

## Layer 5 + 3.5 — LLM Self-Healing (Local Ollama)

Two LLM layers provide AI-powered recovery:

- **Layer 3.5** — predicts the locator from the step label alone (no DOM needed, ~200ms)
- **Layer 5** — reads the sanitized DOM snapshot and suggests the correct locator (~200ms)

Both results are stored in `learning-db.json` so the next run uses **Layer 3** (2ms) instead.

### Setup

```bash
# 1. Install Ollama (free, runs locally)
# https://ollama.com

# 2. Pull a model (one time, ~4GB)
ollama pull llama3

# 3. Enable in .env
FW_LLM=true
FW_LLM_MODEL=llama3
```

### How it works

```
Layer 4 fails → Layer 3.5: LLM predicts from step label (no DOM)
             → Layer 5:   LLM reads sanitized DOM snapshot
             → Suggests best Playwright locator
             → Framework tries it
             → Success: stored in learning-db.json
             → Next run: Layer 3 finds it in 2ms
             → All layers fail → Autonomous Diagnostics classifies + auto-patches
```

## Autonomous Diagnostics

When all 9 layers fail, Autonomous Diagnostics runs automatically:

- Classifies the failure type (locator stale, element hidden, timing, app error, etc.)
- Analyzes the DOM to find the best candidate element
- Suggests a fix with confidence score
- Can **auto-patch** the test file with the corrected locator
- No LLM required — pure DOM analysis

### Security
- Calls `localhost:11434` **only** — no external network requests
- DOM is sanitized before sending — strips passwords, tokens, auth values
- Disabled by default (`FW_LLM=false`) — opt-in only
- Max 2000 chars of DOM sent — minimal exposure
- Assertion guard: LLM cannot heal assertion steps to wrong elements

---

## Key Metrics

- **9 healing layers** — more than any commercial tool (Healenium=1, Testim=3)
- **97-99% pass rate** with Docker infrastructure
- **7.4 min** full run (reduced from 22 min)
- **500 entry** learning DB with 30-day TTL decay
- **Zero TypeScript errors** — strict compilation
- **5 security fixes** — CWE-94, CWE-95, CWE-798, SSRF, SSL

## Live Dashboard

```bash
npm run dashboard:server
# Open: http://localhost:3000?token=admin-token
```

Shows: pass rate charts, failed tests with errors, self-healing activity, trend history, project breakdown.

## Test History & Trend Tracking

Every run is automatically saved to `test-results/history/`. Dashboard shows:
- Pass rate trend chart across last 20 runs
- Comparison: fixed tests vs new failures between runs
- Run history table with timestamps
