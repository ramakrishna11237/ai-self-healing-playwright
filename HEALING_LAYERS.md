# 🧠 Self-Healing Layers — Fallback Logic Documentation

## Overview

When a test step fails, the framework cascades through 8 layers automatically.
Each layer is tried in order. The first layer that succeeds stops the cascade.

```
Step fails
    ↓
Layer 0 → Layer 1 → Layer 2 → Layer 3 → Layer 3.5 → Layer 4 → Layer 5 → Layer 6
    ↓
First success → stores fix in learning-db → returns result
    ↓
All fail → structured error with per-layer reason
```

---

## Layer Reference

### Layer 0 — Navigation Guard
**File:** `src/utils/NavigationGuard.ts`
**Triggers:** Before any navigation (`page.goto`)
**What it does:**
- Retries navigation up to 3 times with exponential backoff
- Detects blank pages → auto-reloads
- Detects login redirect → auto re-authenticates
- Detects network errors → waits and retries

**Debug:** If Layer 0 fails, check `ALLOW_INTERNAL_HOSTS` and site availability

---

### Layer 1 — Direct Execution
**File:** `src/core/Runner.ts` → `executePattern()`
**Triggers:** Every step
**What it does:**
- Executes the exact locator provided (`codegenLocator` or `locator`)
- Retries `FW_STEP_RETRIES` times (default: 2)
- Uses Playwright's built-in retry + backoff

**Debug:** Set `FW_LOG_LEVEL=debug` to see exact locator being tried

---

### Layer 2a — SmartLocator Engine
**File:** `src/engine/SmartLocatorEngine.ts`
**Triggers:** Layer 1 fails
**What it does:**
- Generates confidence-scored locator candidates from step label
- Tries: aria-label, data-testid, role+name, placeholder, text content
- Returns highest-confidence match

**Debug:** Look for `"via SmartLocator [strategy, confidence: X]"` in logs

---

### Layer 2b — Batch Strategy Fallback
**File:** `src/engine/LocatorEngine.ts`
**Triggers:** Layer 2a fails
**What it does:**
- Generates 30+ alternative locators in parallel batches of 3
- Role-typed candidates tried first (button, link, textbox)
- Uses `Promise.any()` — fastest winner wins

**Debug:** Look for `"via strategy [batch N]"` in logs

---

### Layer 3 — Learning DB Recall
**File:** `src/learning/FixApplier.ts`
**Triggers:** Layer 2 fails
**What it does:**
- Looks up previously healed locators in `learning-db.json`
- Returns fix in ~2ms — no DOM scan needed
- Confidence-weighted: higher confidence fixes tried first

**Debug:** Check `learning-db.json` for existing entries. Look for `"via learned fix"` in logs

---

### Layer 3.5 — LLM Label Prediction
**File:** `src/engine/LLMLocatorEngine.ts`
**Triggers:** Layer 3 fails AND `FW_LLM=true`
**What it does:**
- Sends step label to local Ollama LLM
- LLM predicts locator from label alone (no DOM needed)
- Only fires if confidence >= `FW_LLM_MIN_CONFIDENCE` (default: 70)

**Debug:** Requires `ollama serve` running. Set `FW_LLM=true` in `.env`

---

### Layer 4 — DOM Capture + Self-Heal
**File:** `src/healing/SelfHeal.ts`
**Triggers:** Layer 3 fails
**What it does:**
- Captures full DOM snapshot
- Extracts all interactive elements
- Fuzzy-matches against step label
- Runs 9 safety checks on each candidate:
  - SafetyCheckEngine (7 rules)
  - QuantumConfidenceSystem (composite score)
  - Dangerous word pair blocklist
  - Container scoping
  - Post-action page state verification

**Debug:** Look for `"via self-heal"` in logs. DOM snapshot size shown in error

---

### Layer 5 — Ollama LLM DOM-Aware Recovery
**File:** `src/engine/OllamaHealingEngine.ts`
**Triggers:** Layer 4 fails AND `FW_LLM=true`
**What it does:**
- Sends DOM + step label + error to Ollama
- Classifies failure type: `locator_stale`, `element_renamed`, `element_moved`
- Explains cause and fix in plain English
- Auto-patches page object file (if `FW_AUTO_PATCH=true`)

**Debug:** Requires `ollama serve`. Look for `"via Ollama Layer 5"` in logs

---

### Layer 6 — Autonomous Diagnostics
**File:** `src/engine/AutonomousDiagnostics.ts`
**Triggers:** Layer 5 fails
**What it does:**
- Pure DOM analysis — no LLM needed
- Classifies failure type from DOM structure
- Suggests fix based on element patterns
- Auto-patches if confidence >= 60

**Debug:** Look for `"via AutonomousDiagnostics"` in logs

---

### Layer 7 — Semantic Synonym Healing
**File:** `src/engine/ElementExistenceHealer.ts`
**Triggers:** All previous layers fail
**What it does:**
- Tries semantic synonyms of the step label
- Examples: Cancel→Reset, Submit→Save, Username→Email
- Covers 16 synonym groups
- Last resort before final failure

**Debug:** Look for `"via Layer 7 (semantic)"` in logs

---

## Debugging Failed Steps

### Step 1 — Enable debug logging
```bash
FW_LOG_LEVEL=debug npm test
```

### Step 2 — Run headed to watch the browser
```bash
HEADLESS=false npm test
```

### Step 3 — Check which layer failed
Every failure shows a structured error:
```
=== STEP FAILED =========================================
  Step   : "Click Submit button"
  Action : click
  Locator: getByRole('button', { name: 'Submit' })

  Recovery attempts:
    Layer 1 (direct): failed after 2 retries
    Layer 2 (strategy): 17 strategies tried — none matched
    Layer 3 (learned): no entry in learning-db
    Layer 4 (self-heal): DOM snapshot had 3 lines  ← page didn't load!
    Layer 7 (semantic): no synonym found for "Submit"
=========================================================
```

### Step 4 — Common fixes by layer

| Layer that failed | Likely cause | Fix |
|---|---|---|
| Layer 0 | Site unreachable | Check internet / Docker |
| Layer 1 | Locator changed | Run `npx playwright codegen <url>` |
| Layer 2 | Element renamed | Update step label to match visible text |
| Layer 3 | First time failure | Will learn after first heal |
| Layer 4 | DOM too small (1-3 lines) | Page didn't load — check Layer 0 |
| Layer 5 | Ollama not running | Run `ollama serve` |
| Layer 7 | No synonym match | Add synonym to `ElementExistenceHealer.ts` |

---

## Circuit Breaker

After 5 consecutive heal failures, the circuit breaker activates:
```
Circuit Breaker: too many consecutive failures — healing paused to save time
```

**Reset:** Passing tests automatically reset the circuit breaker counter.

**File:** `src/engine/HealingCircuitBreaker.ts`

---

## Learning DB

All successful heals are stored in `learning-db.json`:
```json
[
  {
    "old": "getByRole('button', { name: 'Submit' })",
    "new": "getByRole('button', { name: 'Save' })",
    "action": "click",
    "label": "Submit button",
    "confidence": 85,
    "count": 3,
    "success": true,
    "timestamp": 1234567890
  }
]
```

Layer 3 recalls these in ~2ms on subsequent runs.
