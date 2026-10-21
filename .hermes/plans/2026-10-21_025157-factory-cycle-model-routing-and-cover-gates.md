# Plan — Route all AI to Nous, fix cover gates, then run a full cycle to completion

**Saved:** 2026-10-21 02:51 (America/Los_Angeles)
**Slug:** factory-cycle-model-routing-and-cover-gates
**Mode:** plan only (no implementation in this turn)

---

## Goal

Deliver a NicheGate build where a full factory cycle runs end-to-end and its products
actually *pass* the publish gates — by first fixing model routing (B), then instrumenting
and fixing the cover quality gates (C), then running the cycle to completion (A) as proof.

## Direct answer to the question

**Yes — B and C must be done regardless of order.** A full cycle (A) cannot "succeed"
while every publish is rejected by cover-QA and while some AI calls 402. So A is the
*acceptance test*, not an alternative to B and C.

**Proposal if we "go with A" first:** make A a *repeatable, instrumented, non-destructive
cycle harness* that records each product's per-stage gate verdict into a table
(`cycle_gate_events`). Running it produces the exact failure ledger that C needs, and it
proves the pipeline advances (generate → design → QA → publish-gate) without publishing
anything. Then fix B (small, ~30 min) so AI-dependent gates work, use the ledger to fix C,
and re-run A for real. Order: **B (small prerequisite) → A-instrumented (produce data) →
C (fix covers) → A-final (prove it).**

---

## Current context / assumptions (verified read-only)

- Repo: `C:/Users/linde/OneDrive/Desktop/NICHEGATE-main`, branch `main`, HEAD `c67e78e`.
- Tests: `npm test` → `tests 396, pass 392, fail 0, skipped 4`.
- `server/services/modelRouter.js`: `callModel()` builds `const endpoint = target || { baseUrl:
  cfg.openrouter.baseUrl, headers: headers() }`. Any caller that omits `target` hits
  **OpenRouter**, which returns **402** (no credits). Verified 402 sites:
  - `server/index.js:2192` (console assistant)
  - `server/services/agentWorker.js:283` (agent tool loop)
  - `server/services/jobEngine.js:54` (job planner)
  These pass `model: cfg.openrouter.ideationModel` = `google/gemini-2.5-flash` (verified HTTP 200 on Nous).
- `server/services/modelConfig.js`: `ENABLED = MODEL_ENABLED==='true' && !!process.env.OPENROUTER_API_KEY`.
  This blocks a Nous-only setup if `OPENROUTER_API_KEY` is empty.
- `server/services/modelRouter.js` `callVision()` **already** routes to Nous when
  `VISION_PROVIDER=nous` + `NOUSPORTAL_API_KEY`; model = `VISION_MODEL || 'anthropic/claude-haiku-5.5'`.
  During the last cycle the cover critique returned null ("returned no reply").
- Cover gate = two layers:
  - Deterministic `server/services/coverQA.js`: `MIN_CORRELATION = 0.90` (line 53),
    `MAD_STRONG = 6.5` (line 263); message *"composited page does not match this product's design"* (line 268).
  - AI vision `server/services/designCritic.js`: `COVER_THRESHOLD = 6.5` (line 47);
    `coverDecision()` (lines 123–129) fails on `!zeroGarbledText` → *"garbled or unreadable text
    detected"*, or `overall < 6.5` → *"cover score below 6.5"*.
  - `server/services/marketplace.js:726` throws `Marketplace cover rejected (...)`.
- Environment quirk: bundled Node here only runs under a **PTY** (otherwise exits
  `stdin is not a tty` / `stdout is not a tty`). Cycle scripts must run via
  `terminal(background=true, pty=true)` with **no pipe**, then be polled with
  `process_manage(action="poll", session_id=...)`.
- Last cycle (`proc_3a7a7f5de9b8`) generated 7 products, blocked every publish on cover-QA,
  and was killed at ~965 s mid `design-reskin`.

Assumptions: Nous key (`NOUSPORTAL_API_KEY`) is present and funded; `VISION_PROVIDER=nous`
is set in `.env`; publishing to Gumroad stays gated by cover-QA (we will not weaken the gate
to force publishes — we fix covers instead).

---

## Architecture / approach

Centralize provider selection in `modelRouter.defaultTarget()` so no call site can hit the
dead OpenRouter endpoint; make `cfg.enabled` accept either provider key. Then add a small
append-only `cycle_gate_events` table and have the cover gate + publish path write one row per
(product, stage, gate) with the verdict and reason; a PTY-safe `scripts/run-cycle.js` runs the
full cycle and prints a summary. Finally, use that ledger to fix the cover pipeline (vision
critique actually returning, hero images free of pseudo-text, and calibrated deterministic
thresholds) and re-run the cycle to a clean, self-terminating completion.

---

## Phase B — Route every AI call to Nous (prerequisite, ~30 min)

### Task B1 — Failing test for `defaultTarget()`
Create `test/model-routing.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Hermetic DB like other suites; modelRouter requires ../database at import time.
if (!process.env.DB_PATH) process.env.DB_PATH = path.join(os.tmpdir(), `ng-routing-${process.pid}.db`);
const DB_PATH = process.env.DB_PATH;
process.env.NODE_ENV = 'test';
delete process.env.RAILWAY_ENVIRONMENT;

process.env.VISION_PROVIDER = 'nous';
process.env.NOUSPORTAL_API_KEY = 'test-key';
process.env.VISION_BASE_URL = 'https://example.invalid/v1';

const router = require('../server/services/modelRouter');

test('defaultTarget routes to Nous when VISION_PROVIDER=nous', () => {
  const t = router.defaultTarget();
  assert.ok(t, 'expected a target');
  assert.equal(t.baseUrl, 'https://example.invalid/v1');
  assert.match(t.headers.Authorization, /^Bearer test-key$/);
});

test('defaultTarget is undefined without a Nous key', () => {
  const saved = process.env.NOUSPORTAL_API_KEY;
  delete process.env.NOUSPORTAL_API_KEY;
  assert.equal(router.defaultTarget(), undefined);
  process.env.NOUSPORTAL_API_KEY = saved;
});
```

Run (expect FAIL — `router.defaultTarget is not a function`):
```bash
cd C:/Users/linde/OneDrive/Desktop/NICHEGATE-main && node --test test/model-routing.test.js
```
Expected: `fail 2` (or 1), with `TypeError: router.defaultTarget is not a function`.

### Task B2 — Implement `defaultTarget()` and use it in `callModel`
Edit `server/services/modelRouter.js`. After the `headers()` helper add:

```js
// Single source of truth for provider routing. When VISION_PROVIDER=nous and a
// Nous key is present, EVERY call goes to Nous Portal (OpenAI-compatible)
// instead of OpenRouter — whose endpoint 402s with no credits. Keeping this in
// one place means no call site can accidentally hit the dead endpoint.
function defaultTarget() {
  const useNous = String(process.env.VISION_PROVIDER || '').toLowerCase() === 'nous'
    && !!process.env.NOUSPORTAL_API_KEY;
  if (!useNous) return undefined;
  return {
    baseUrl: process.env.VISION_BASE_URL || 'https://inference-api.nousresearch.com/v1',
    headers: {
      Authorization: `Bearer ${process.env.NOUSPORTAL_API_KEY}`,
      'Content-Type': 'application/json'
    }
  };
}
```

Change the endpoint line inside `callModel` from:
```js
const endpoint = target || { baseUrl: cfg.openrouter.baseUrl, headers: headers() };
```
to:
```js
const endpoint = target || defaultTarget() || { baseUrl: cfg.openrouter.baseUrl, headers: headers() };
```

Add `defaultTarget` to the module export block:
```js
module.exports = { /* …existing… */ defaultTarget };
```

Run (expect PASS):
```bash
cd C:/Users/linde/OneDrive/Desktop/NICHEGATE-main && node --test test/model-routing.test.js
```
Expected: `pass 2, fail 0`.

### Task B3 — Let `cfg.enabled` accept a Nous key
Edit `server/services/modelConfig.js` line ~9:
```js
const ENABLED = String(process.env.MODEL_ENABLED || 'false').toLowerCase() === 'true'
  && !!(process.env.OPENROUTER_API_KEY || process.env.NOUSPORTAL_API_KEY);
```
Verify the model layer turns on with only a Nous key:
```bash
cd C:/Users/linde/OneDrive/Desktop/NICHEGATE-main && node -e "require('dotenv').config(); const c=require('./server/services/modelConfig'); console.log('enabled:', c.enabled)"
```
Expected: `enabled: true`.

### Task B4 — Prove no una-tgeted call 402s (live probe)
```bash
cd C:/Users/linde/OneDrive/Desktop/NICHEGATE-main && node -e "require('dotenv').config(); const r=require('./server/services/modelRouter'); (async()=>{const t=await r.callModel({model:'anthropic/claude-haiku-5.5',messages:[{role:'user',content:'Reply with the single word OK'}],maxTokens:5}); console.log('RESULT:', JSON.stringify(t)); process.exit(0)})()"
```
Expected: `RESULT: "OK"` and **no** `[MODEL] call failed: ... 402` line.
Then repeat for the three formerly-dead call paths by exercising them (or trust B2's centralization + grep):
```bash
cd C:/Users/linde/OneDrive/Desktop/NICHEGATE-main && grep -rn "callModel(" server/ --include=*.js | grep -v "function callModel"
```
Expected: every remaining un-targeted site now resolves through `defaultTarget()` (no code change needed at those sites).

### Task B5 — Full suite + commit
```bash
cd C:/Users/linde/OneDrive/Desktop/NICHEGATE-main && npm test 2>&1 | grep -E "^ℹ (tests|pass|fail|skipped)"
```
Expected: `pass 394 (or more), fail 0`.
```bash
cd C:/Users/linde/OneDrive/Desktop/NICHEGATE-main && git add -A && git commit -m "fix(model): route all AI calls to Nous via modelRouter.defaultTarget()"
```

---

## Phase A — Instrumented, PTY-safe cycle harness (the "go with A" deliverable)

### Task A1 — Failing test for the gate ledger
Create `test/cycle-gate-events.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
if (!process.env.DB_PATH) process.env.DB_PATH = path.join(os.tmpdir(), `ng-gate-${process.pid}.db`);
const DB_PATH = process.env.DB_PATH;
process.env.NODE_ENV = 'test';
delete process.env.RAILWAY_ENVIRONMENT;
const { db, init } = require('../server/database');
init();
const gates = require('../server/services/gateLedger');

test('recordGate appends a row and summarize groups verdicts', () => {
  db.prepare('DELETE FROM cycle_gate_events').run();
  gates.recordGate({ productId: 1, stage: 'publish', gate: 'coverQA', verdict: 'fail', reason: 'corr 0.5' });
  gates.recordGate({ productId: 2, stage: 'publish', gate: 'coverQA', verdict: 'pass', reason: null });
  const rows = db.prepare('SELECT * FROM cycle_gate_events').all();
  assert.equal(rows.length, 2);
  const summary = gates.summarize();
  assert.equal(summary.find(r => r.verdict === 'fail').n, 1);
  assert.equal(summary.find(r => r.verdict === 'pass').n, 1);
});

test('cleanup', () => {
  db.close();
  for (const s of ['', '-wal', '-shm']) { try { fs.rmSync(DB_PATH + s, { force: true }); } catch {} }
  assert.ok(true);
});
```

Run (expect FAIL — cannot find module `gateLedger`):
```bash
cd C:/Users/linde/OneDrive/Desktop/NICHEGATE-main && node --test test/cycle-gate-events.test.js
```

### Task A2 — Add the table + `gateLedger` service
In `server/database.js`, inside `init()` next to the capability tables, add:
```js
db.exec(`
  CREATE TABLE IF NOT EXISTS cycle_gate_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER,
    stage TEXT,
    gate TEXT,
    verdict TEXT,
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_gate_verdict ON cycle_gate_events (verdict, gate);
`);
```
Create `server/services/gateLedger.js`:
```js
const { db } = require('../database');

function recordGate({ productId = null, stage = 'unknown', gate = 'unknown', verdict = 'unknown', reason = null }) {
  db.prepare(
    'INSERT INTO cycle_gate_events (product_id, stage, gate, verdict, reason) VALUES (?, ?, ?, ?, ?)'
  ).run(productId, stage, String(gate), String(verdict), reason ? String(reason).slice(0, 500) : null);
}

function summarize() {
  return db.prepare(
    'SELECT gate, verdict, COUNT(*) AS n FROM cycle_gate_events GROUP BY gate, verdict ORDER BY n DESC'
  ).all();
}

module.exports = { recordGate, summarize };
```
Run (expect PASS):
```bash
cd C:/Users/linde/OneDrive/Desktop/NICHEGATE-main && node --test test/cycle-gate-events.test.js
```
Expected: `pass 2, fail 0`.

### Task A3 — Instrument the cover gate + publish
In `server/services/designCritic.js` `coverDecision()`, before each `return`, record the verdict
(the file already has `const gates = require('./gateLedger')` at top — add it if missing):
```js
function coverDecision(verdict) {
  const gates = require('./gateLedger');
  if (!verdict || !verdict.scores || !Number.isFinite(verdict.scores.overall)) {
    gates.recordGate({ stage: 'publish', gate: 'coverCritic', verdict: 'unscored', reason: 'critique unavailable' });
    return { status: 'unscored', publishAllowed: false, reason: 'cover critique unavailable' };
  }
  if (!verdict.zeroGarbledText || verdict.scores.overall < COVER_THRESHOLD) {
    const reason = verdict.zeroGarbledText ? `cover score below ${COVER_THRESHOLD}` : 'garbled or unreadable text detected';
    gates.recordGate({ stage: 'publish', gate: 'coverCritic', verdict: 'fail', reason });
    return { status: 'fail', publishAllowed: false, reason };
  }
  gates.recordGate({ stage: 'publish', gate: 'coverCritic', verdict: 'pass', reason: null });
  return { status: 'pass', publishAllowed: true, reason: null };
}
```
(Pass `productId` when available: change callers to `coverDecision(verdict, product.id)` and accept a second arg — see callers at designCritic line ~272 and inside `critique`.)

In `server/services/coverQA.js`, at each `failures.push(...)` also call
`require('./gateLedger').recordGate({ productId: product.id, stage:'render', gate:'coverQA', verdict:'fail', reason:<message> })`,
and on success record `verdict:'pass'`.

### Task A4 — PTY-safe cycle runner
Create `scripts/run-cycle.js`:
```js
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(ROOT, '.env') });
const { db, init } = require(path.join(ROOT, 'server', 'database'));
init();
const automationCycle = require(path.join(ROOT, 'server', 'services', 'automationCycle'));
const gates = require(path.join(ROOT, 'server', 'services', 'gateLedger'));

(async () => {
  const before = db.prepare('SELECT COUNT(*) c FROM products').get().c;
  const t0 = Date.now();
  const ctx = await automationCycle.runFullCycle();
  console.log('CYCLE_DONE elapsed=' + ((Date.now() - t0) / 1000).toFixed(1) + 's generated=' + ctx.generated + ' listed=' + ctx.listed);
  console.log('PRODUCTS ' + before + ' -> ' + db.prepare('SELECT COUNT(*) c FROM products').get().c);
  console.log('GATE_SUMMARY', JSON.stringify(gates.summarize()));
  // Let the shared Chrome close cleanly so the process exits on its own.
  try { await require(path.join(ROOT, 'server', 'services', 'pdfGenerator')).closeBrowser(); } catch {}
})();
```
Do **not** call `process.exit()`; let the loop drain (pdfGenerator closes Chrome on `beforeExit`).

### Task A5 — Run it, PTY, poll to completion
```
terminal(background=true, pty=true, notify=true,
  command="cd C:/Users/linde/OneDrive/Desktop/NICHEGATE-main && node scripts/run-cycle.js")
```
Then poll every ~3 min:
```
process_manage(action="poll", session_id="<id>")
```
Expected terminal lines: `CYCLE_DONE ...`, `PRODUCTS 228 -> N`, `GATE_SUMMARY [...]`.
Query the ledger after:
```bash
cd C:/Users/linde/OneDrive/Desktop/NICHEGATE-main && node -e "require('dotenv').config(); const {db,init}=require('./server/database'); init(); console.table(db.prepare('SELECT gate,verdict,COUNT(*) n FROM cycle_gate_events GROUP BY gate,verdict ORDER BY n DESC').all())"
```
Expected: a table showing exactly how many covers passed/failed and why — this is the input for Phase C.

Commit A:
```bash
cd C:/Users/linde/OneDrive/Desktop/NICHEGATE-main && git add -A && git commit -m "feat(cycle): instrumented gate ledger + PTY-safe full-cycle runner"
```

---

## Phase C — Fix the cover gates (driven by the A ledger)

### Task C1 — Prove the vision critique actually returns on Nous
Probe a known product's cover:
```bash
cd C:/Users/linde/OneDrive/Desktop/NICHEGATE-main && node -e "require('dotenv').config(); process.env.NODE_ENV='test'; const {db,init}=require('./server/database'); init(); const dc=require('./server/services/designCritic'); const p=db.prepare(\"SELECT * FROM products WHERE preview_path IS NOT NULL ORDER BY id DESC LIMIT 1\").get(); (async()=>{const r=await dc.critique(p); console.log('CRITIQUE:', JSON.stringify(r).slice(0,300)); process.exit(0)})()"
```
- If `CRITIQUE` is non-null with scores → vision works; go to C2.
- If null with `[CRITIC] ... returned no reply` → the Nous vision model can't see images.
  Fix: set `VISION_MODEL=google/gemini-2.5-flash` (verified 200 on Nous) in `.env`, re-run probe,
  expect non-null scores.

### Task C2 — Remove pseudo-text from AI hero images
If the ledger's dominant failure is `garbled or unreadable text detected`, the AI hero
photos contain fake signage/labels. In `server/services/heroArt.js`, tighten the image prompt
to require **no text, no signage, no labels, no logos** (object/scene only). Add a regression
test in `test/cover-copy.test.js` (or a new `test/hero-prompt.test.js`) asserting the prompt
builder contains `no text` / `no signage`:
```bash
cd C:/Users/linde/OneDrive/Desktop/NICHEGATE-main && node --test test/hero-prompt.test.js
```
Expected: `pass`.

### Task C3 — Calibrate the deterministic thresholds
If `composited page does not match this product's design` dominates, the correlation gate is
too strict for sparse covers (`MIN_CORRELATION=0.90`, `MAD_STRONG=6.5` in `coverQA.js`). Add
env overrides so it is tunable without code edits:
```js
const MIN_CORRELATION = Number(process.env.COVER_MIN_CORRELATION || 0.90);
const MAD_STRONG = Number(process.env.COVER_MAD_STRONG || 6.5);
```
Then, using the ledger, set the loosest values that still reject a deliberately mismatched
cover (keep a test `test/cover-qa-threshold.test.js` that asserts a real cover passes and a
shuffled cover fails). Run:
```bash
cd C:/Users/linde/OneDrive/Desktop/NICHEGATE-main && node --test test/cover-qa-threshold.test.js
```

### Task C4 — Full suite + commit
```bash
cd C:/Users/linde/OneDrive/Desktop/NICHEGATE-main && npm test 2>&1 | grep -E "^ℹ (tests|pass|fail|skipped)"
```
Expected: `fail 0`.
```bash
cd C:/Users/linde/OneDrive/Desktop/NICHEGATE-main && git add -A && git commit -m "fix(covers): vision critique on Nous + text-free hero prompts + tunable QA thresholds"
```

---

## Phase A-final — Clean full cycle, publishing passes

### Task AF1 — Re-run and confirm passes
Repeat Task A5. Expected `GATE_SUMMARY` shows `coverCritic pass` and `coverQA pass` > 0, and
`listed` increases (or `publish_seasonal_gate` no longer the only outcome).

### Task AF2 — Verify claims against the live store/D B, not the console log
```bash
cd C:/Users/linde/OneDrive/Desktop/NICHEGATE-main && node -e "require('dotenv').config(); const {db,init}=require('./server/database'); init(); console.log('listed:', db.prepare(\"SELECT COUNT(*) c FROM products WHERE status='listed'\").get().c); console.table(db.prepare('SELECT gate,verdict,COUNT(*) n FROM cycle_gate_events GROUP BY gate,verdict').all())"
```
Report only what these queries return (honest scope: DB-verified vs storefront-visible).

### Task AF3 — Push
```bash
cd C:/Users/linde/OneDrive/Desktop/NICHEGATE-main && git push origin main
```

---

## Tests / validation (TDD cadence, per task)

- Every code task: write the failing test → run it → see the expected failure text → make the
  minimal change → run again → see it pass → commit.
- Suite gate before every commit: `npm test` must show `fail 0`.
- End-to-end truth is the **DB query** (`cycle_gate_events`, product statuses), never a log line.

---

## Risks, tradeoffs, open questions

- **Risk: Nous vision model can't see images.** `anthropic/claude-haiku-5.5` may reject
  `image_url` parts. Mitigation in C1: fall back to `google/gemini-2.5-flash` (verified 200 on
  Nous) and confirm with the probe.
- **Risk: "garbled text" is intrinsic to AI-generated hero photos.** If the model keeps adding
  fake signage, consider disabling AI hero images for cover purposes and using the editorial
  masthead (already shipped in `designStudio.buildChecklistHTML`). Tradeoff: less photographic
  flair, but deterministic and gate-passing.
- **Risk: loosening thresholds hides real defects.** Keep the negative test (mismatched cover
  must still fail) so calibration can't be gamed.
- **Rate/latency risk:** a full cycle runs `design-reskin` over ~190 drafts (~10–20 min+). Run
  it PTY + polled; never pipe (breaks `stdout`).
- **Open question 1:** Do we want publishes to ever auto-list, or should every cycle stop at
  `awaiting-approval` for the operator? (Current code gates on cover-QA; confirm desired end state.)
- **Open question 2:** Is the Nous key budget-capped per session? The `cycleCalls` caps in
  `modelRouter` (`maxCallsPerScan` etc.) may silently zero out cover critiques mid-cycle —
  decide whether to raise them for a full run.
- **YAGNI:** do not add a new "cover v12" redesign in this pass — fix the existing gate path only.
