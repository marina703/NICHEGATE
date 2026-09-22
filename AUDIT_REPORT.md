# NicheGate — End-to-End Audit Report

**Date:** 2026-09-21
**Stack:** Node ≥ 22 (verified v24.19.0) · Express 5 · SQLite (`node:sqlite`, WAL) · Puppeteer · SheetJS · adm-zip · node-cron
**Scope:** Architecture, security posture, API surface, Command Center UI wiring, test/config health, repo hygiene
**Method:** Static review of the full source tree + a runtime test baseline. Runtime endpoint sweep and parity checklist are recorded in §6.

---

## 1. Executive summary

The **core architecture is sound and should not be rewritten.** The strongest existing decisions:

- **File gate is real.** `fileFactory.ensureProductFile` runs at creation, export, *and* publish — no listing can go live without a deliverable, and there is no fake-success path.
- **AI degrades gracefully.** `conceptEngine` / `modelRouter` return `null` instead of throwing; `MODEL_ENABLED` is a true master switch (zero cost when off).
- **SQLite is configured correctly.** WAL, `busy_timeout=5000`, FKs on, concurrent-seed guard, additive-only migrations.
- **Readiness reporting is redacted** and genuinely useful (`readiness.buildReadinessReport`, boot warnings).

The real problems are **exposure and wiring**, not design:

1. **Live Etsy credentials are committed** (README + git history).
2. **30 API routes bypass authentication and rate limiting** because the guard middleware is registered *after* them.
3. **The dashboard shell is served before auth**, and several Command Center controls are dead or mis-wired.
4. **Injection surface + hygiene gaps** (unescaped `innerHTML`, open CORS, near-empty `.gitignore`).

---

## 2. Policy decisions from this pass

| Decision | Choice |
|---|---|
| Command Center redesign | **Option B/C "Flight Deck"** — Mission Control layout + scoped command spine |
| Scope | Everything, phased; new design is a **strict superset** of the current one |
| Committed Etsy credentials | **Removed from `README.md` only** — no rotation, no history rewrite (owner's call). *Residual risk: the values remain valid to anyone who already has repository history. Rotation is still recommended.* |

---

## 3. Findings

Severity: 🔴 critical · 🟠 high · 🟡 medium · ⚪ low. "Resolution" reflects the work landed in this branch.

### 3.1 🔴 Critical — live Etsy credentials committed

`README.md` hard-coded real values in two duplicated "Railway Environment Variables" sections:

```
ETSY_SHARED_SECRET=<redacted-20-char-value>
ETSY_CLIENT_ID=<redacted — identical to the shared secret>
ETSY_CLIENT_SECRET=<redacted-10-char-value>
```

Introduced in commit `bab88df`, so present in **git history**, not just the working tree. `.env` itself is correctly untracked — this was the only real leak.

**Resolution:** values removed from `README.md`; replaced with a variable-names-only Railway section. `.gitignore` hardened so `.env`/`.env.*` can never be committed. **Keys were not rotated (owner's choice)** — treat as still-compromised.

### 3.2 🟠 High — 30 routes bypass auth and rate limiting

`app.use('/api', apiLimiter)` and the auth guard were registered mid-file, **after** 30 top-level routes. Express applies middleware only to routes registered later, so those routes bypassed both guards:

- `POST /api/etsy/push/:id`, `POST /api/etsy/push-batch` — real publish actions
- `POST /api/ads/commit`, `/api/ads/budget`, `/api/ads/cancel` — spend
- `POST /api/niches/passion`, `/api/social/*`, `GET /api/revenue/summary`
- `GET /api/model/status` — exposed key *shape* (length/hex/whitespace), not the key itself

**Resolution:** guard middleware hoisted above every route, with documented exemptions for `/api/auth/*` and `/api/health*`.

### 3.3 🟠 High — dashboard shell served before auth

`express.static(client)` was mounted before the auth middleware, so `/` resolved to `client/index.html` directly and the gated `app.get('/')` never ran. APIs still returned 401, but the shell and `/setup` HTML were not actually protected.

**Resolution:** static client assets mounted after auth; `/` and `/setup` gated; `/store` intentionally public.

### 3.4 🟠 High — dead / mis-wired Command Center controls

| Symptom | Evidence | Resolution |
|---|---|---|
| Analytics view permanently empty (`loadAnalytics` never defined) | `client/index.html` | `loadAnalytics()` implemented against `/api/analytics/sales` |
| "Auto-List" silently fails — `PATCH /api/settings` vs server `GET`/`POST` → 404 | client vs `server/index.js` | Client now `POST`s; errors surfaced |
| Nav highlight broken for Automation/Marketplace (`rv-auto` vs `rv-automation`) | `client/index.html` | Nav rebuilt with matching ids |
| Etsy cap widget never renders (`#etsy-cap-display` orphan) | `client/index.html` | Wired into the status strip + Marketplace gauge |
| Home activity log stuck on "Loading…" after navigating away | `client/index.html` | Reloads on entering Home |

### 3.5 🟡 Medium — injection surface (CSP disabled)

`helmet({ contentSecurityPolicy: false })` is required because the UI is `innerHTML` + inline `onclick`. Several interpolations were unescaped — `renderSocial` (`content`, `platform`), `renderAds` (`name`), `renderTrends` (`grade` into a class attribute), `loadSmartActions` (`title`/`action` into markup *and* `onclick`). Trend names come from external feeds and social copy from the model, so this was stored-XSS-shaped.

**Resolution:** escaping centralized and applied; inline handlers replaced with `data-*` + delegation where practical.

### 3.6 🟡 Medium — server hardening

| Issue | Resolution |
|---|---|
| `app.use(cors())` wide open on an admin API | Restricted to same-origin/same-host by default |
| Rate limiting behind Railway proxy without `trust proxy` | `app.set('trust proxy', 1)` when production/Railway |
| Readiness flagged `ETSY_CLIENT_ID === ETSY_CLIENT_SECRET` as an error, contradicting the new KEYSTRING guidance | Check reconciled; no false blocker |
| Global `bodyParser.json({ limit: '10mb' })` | Retained (generated-HTML edits need it); noted |

### 3.7 🟡 Medium — repo hygiene

`.gitignore` contained only 6 legacy entries; `node_modules/`, `.env`, `data/`, `generated/`, `uploads/`, `logs/` were **not** ignored. Nothing was committed yet, but a routine `git add -A` would have swept in the SQLite DB ("it's the business") and generated artifacts.

**Resolution:** `.gitignore` hardened with dependency, secret, runtime-data, and generated-output sections.

### 3.8 ⚪ Low — dead code, corruption, doc drift

| Item | Resolution |
|---|---|
| `calculatorBuilder.js`, `emailScriptsBuilder.js`, `sopBuilder.js` — zero references (554 lines) | Removed (redundant with `designStudio` builders) |
| Encoding corruption in `server/index.js` banner/comments | Repaired |
| Seeded profession emojis were literal `"??"` | Corrected so a fresh DB renders properly |
| Cross-doc test-count drift (AGENTS/TASK/README disagree) | Replaced with the verified count |

---

## 4. Test baseline

Before changes, on a clean worktree:

```
tests 77 · suites 18 · pass 72 · fail 1 · skipped 4
```

The single failure was **environmental**: `test/concept.test.js` assumed at least one row in `products` (`SELECT id FROM products LIMIT 1`), which does not exist in a fresh database. The test was made hermetic (it now provisions and cleans up its own fixture) so the suite is deterministic on any machine.

After all changes in this pass:

```
tests 77 · suites 18 · pass 73 · fail 0 · skipped 4   (npm test)
```

---

## 5. Resolutions summary

| # | Finding | Status |
|---|---|---|
| 1 | Committed Etsy credentials | ✅ Removed from README (not rotated) |
| 2 | 30 routes bypass auth/rate-limit | ✅ Fixed |
| 3 | Dashboard shell pre-auth | ✅ Fixed |
| 4 | Dead/mis-wired controls | ✅ Fixed |
| 5 | Injection surface | ✅ Fixed |
| 6 | Server hardening | ✅ Fixed |
| 7 | `.gitignore` gaps | ✅ Fixed |
| 8 | Dead modules / corruption / doc drift | ✅ Fixed |

---

## 6. Flight Deck redesign

The Command Center was rebuilt as **"Flight Deck"** (Option B/C): Mission Control's layout and data density plus a scoped command spine, on a shared design system. §7 is the parity contract proving the new UI is a strict **superset** of the old one.

### 6.1 Architecture — no bundler, no build step

The single 1,010-line `client/index.html` (inline CSS + inline `onclick`) was replaced by native ES modules served as-is:

```
client/index.html          shell only (29 lines): rail, topbar, content hosts
client/css/flightdeck.css  design tokens + components
client/js/ui.js            escaping, icons, toasts, modals/drawer, charts, review-queue helpers
client/js/api.js           typed endpoint clients, SSE stream, export/import helpers
client/js/views.js         12 pure view renderers: (state) → HTML string
client/js/console.js       state, router, command palette, run stream, delegated actions
client/js/rebuild.js       client-side cover-rebuild paging (ported from the old inline code)
```

Because the browser loads modules directly, the Docker/Railway build and the `express.static(client)` mount are unchanged — there is no `dist/`, no toolchain, and no sourcemap step to maintain.

### 6.2 Command spine — deterministic, not LLM-owned

| Endpoint | Purpose |
|---|---|
| `GET /api/console/overview` | One aggregated call: counts, funnel, revenue, Etsy quota, engine state, readiness, activity |
| `GET /api/console/actions` | The action registry (name, label, description, input schema) — drives the palette |
| `POST /api/console/run` | Executes a named action, records the run, streams the result |
| `GET /api/console/runs` | Recent runs with per-step timelines |
| `GET /api/console/stream` | Server-Sent Events: run start/step/finish + engine ticks |

`server/services/actionRegistry.js` maps named actions onto handlers that **already existed** (`approve-all`, `reject-trash`, `sweep`, `full-cycle`, `push-bundles`, `lead-magnet`, `sync-sales`, `dedupe-queue`, `set-auto-list`, `backup-database`, …). Every run is written to `action_runs` + `action_run_steps` (additive migration), so the run stream is durable history, not a transient toast. **No new job queue was introduced** and no action requires the AI layer — with `MODEL_ENABLED=false` every command still works.

Safety properties: unknown action names are rejected (the registry is a closed allowlist, never a passthrough), inputs are validated per action, destructive actions are named explicitly (`reject-trash`) and gated behind a confirm dialog, and `backup-database` writes only inside the ignored `runtime/backups/`.

### 6.3 Interaction model

- **⌘K / Ctrl-K command palette** — every view plus every registry action, fuzzy-filtered, arrow-key driven.
- **Run stream drawer** — live SSE events, expandable per-step timelines, and click-through to the originating view.
- **Review triage mode** — `J`/`K` move, `A` approve, `R` reject, `Enter` open, with the cursor and page clamped as rows leave the queue.
- **Shared review-queue predicate** — the rail badge, the Home "In Review" KPI, the pipeline funnel, the Catalog's *Needs review* filter and the Review table all resolve through one helper (`isReviewable`/`reviewQueue`/`reviewPage`), so they cannot disagree.
- **Hardened visual editor** — the old color/font HTML editor was ported with DOM sanitisation on **load and save** (`<script>`, `on*` handlers and `javascript:` URLs stripped), and it round-trips colour + font edits byte-identically otherwise.

---

## 7. Parity contract (old → new)

Every pre-existing feature is present **and** fixed. "Fixed" means the old control was dead, mis-wired or inconsistent.

| Old feature | New location | Status |
|---|---|---|
| Home / Command Center | `home` | Preserved · funnel, KPIs and activity now refresh |
| Product Catalog | `catalog` | Preserved · added *Needs review* filter |
| Review Queue | `review` | Preserved · **fixed** (was empty after load) + keyboard triage |
| Automation | `automation` | Preserved · **fixed** nav highlight (`rv-auto`) |
| Marketplace | `marketplace` | Preserved · **fixed** nav highlight + Etsy cap widget |
| Trends | `trends` | Preserved · escaping fixed (`grade` into `class`) |
| Social Scheduler | `social` | Preserved · generate/schedule/batch/cancel + escaping fixed |
| Ad Spend ledger | `ads` | Preserved · budget/commit/cancel + escaping fixed |
| Content Calendar | `calendar` | Preserved · month navigation + seasonal panel |
| Sales Analytics | `analytics` | Preserved · **fixed** (`loadAnalytics` was undefined → view was always empty) |
| Product preview modal | product drawer | Preserved · iframe preview + actions + file download |
| Visual HTML editor modal | editor modal | Preserved · **hardened** (sanitised load/save) |
| Six Quick Actions | Home + palette | Preserved · plus the full registry in ⌘K |
| Review toolbar (approve/reject/publish/etc.) | Review rows + drawer | Preserved |
| Auto-List toggle | topbar action + registry | Preserved · **fixed** (`PATCH /api/settings` 404 → `POST`) |

**Surfaced for the first time** (backend existed, no UI): Discovery view (search queue, Etsy saturation, radar health, passion niches), system readiness, model status, payment/branding status, seasonal engine, newsletter digest, SEO panel, export/backup actions.

**Net-new** beyond parity: ⌘K palette, live run stream with steps, run history, review triage mode, *Needs review* filter, aggregated overview call, and the guarded DB backup action.

---

## 8. Verification record

All checks were run against this branch; nothing below is inferred.

| Check | Result |
|---|---|
| `npm test` | **77 tests · 73 pass · 0 fail · 4 skipped** |
| Syntax (`node --check`) on every changed server module | Pass |
| Route guard coverage | **0 routes registered above the guard** (104 routes total) |
| Auth gate, `ADMIN_PASSWORD` set | `/` 302 → login · `/setup` 302 · `/store` 200 · `/api/health` 200 · `/api/products` 401 · `/api/model/status` 401 · `/api/revenue/summary` 401 · `/api/console/overview` 401 |
| Mutations, unauthenticated | `/api/etsy/push/1` 401 · `/api/etsy/push-batch` 401 · `/api/ads/commit` 401 · `/api/console/run` 401 · `/api/niches/passion` 401 |
| Endpoint sweep (isolated port) | **Zero 5xx**; every orphaned endpoint returned 200 |
| Browser sweep, all 12 views | Rendered; **0 console errors**, no `undefined`/`NaN` leakage |
| SSE stream | Connected, live run events received and rendered |
| Action run end-to-end | `backup-database` produced a real backup file; run + steps persisted to `action_runs` / `action_run_steps` |
| Review triage end-to-end | 12-row fixture: `J`/`K` moved the cursor, `A` approved (DB verified), `R` rejected, page fell back correctly when its last row left the queue |
| Editor round-trip | Colour + font persisted via `PATCH /api/products/:id/html`; original document restored byte-identically |
| Secret scan | `sizb32x…` / `nx8yl6…` absent from every tracked file (including this report) |

Every fixture created during the audit was removed afterwards (verified: zero `__e2e*`/`__test*` rows remain, 24 professions, no probe professions). The autonomous engine keeps running in the background, so the product count continues to move on its own — that is expected behaviour, not audit residue.

---

## 9. Residual risks and recommended next steps

1. **Committed Etsy credentials were not rotated.** Removal from `README.md` does not invalidate them — anyone with repository history still has working keys. Rotating at Etsy is the only real remedy; purging history (`git filter-repo`) is the follow-up.
2. **`helmet` CSP remains disabled.** The console no longer uses inline `onclick`, so a CSP is now much closer to feasible, but inline `style` attributes and Google Fonts still require `style-src 'unsafe-inline'` and a `font-src`/`style-src` allowlist. See §3.5.
3. **`/api/health/readiness` is intentionally public** (deploy-gate use; output is redacted). It reveals configuration *posture* — which integrations are set, backlog counts — but no secret values. Gate it if the deployment URL is not private.
4. **`client/setup.html` and `client/store.html` still use inline handlers.** They were out of scope for this pass (the finding concerned the dashboard); they are the natural next hardening target.
5. **`bodyParser.json({ limit: '10mb' })` is unchanged** — required by the editor's full-document saves.

---

*Generated by the NicheGate audit + remediation pass, 2026-09-21.*

---

# PASS 2 — Hardening completion, re-audit & systems check (2026-09-22)

## P2.1 Findings carried in from Pass 1 → resolutions

| Finding | Resolution in this pass |
|---|---|
| `helmet` CSP disabled | **Strict CSP enabled**: `script-src 'self'`, `style-src 'self' 'unsafe-inline' fonts.googleapis.com`, `font-src fonts.gstatic.com data:`, `img-src 'self' data:`, `connect-src 'self'`, `frame-src 'self'`, `form-action 'self' etsy.com` (OAuth POST/redirect), `frame-ancestors 'none'`, `object-src 'none'` |
| Inline handlers/scripts on setup/store/login (blocked CSP) | All three pages hardened: scripts extracted to no-bundler ES modules (`client/js/setup.js`, `store.js`, `login.js`); every inline `onclick` replaced by `data-action` + delegated listeners; dynamic output (`innerHTML`) escaped; store URLs scheme-validated (only http(s)/same-origin may become href/src — defeats `javascript:` injection); store lightbox rebuilt on `data-` attributes |
| `/api/health/readiness` public (config-posture leak) | **Auth-gated by default**; `READYNESS_PUBLIC=true` escape hatch for external monitors; smoke test unaffected (runs with auth off) |
| `/api/automation/status` reports "Running" while `auto_generate=false` | **Truthful engine state**: `running` now means cron *and* generation enabled; `cronScheduled`, `autoGenerate`, `effectivelyRunning` exposed; Automation view shows "Halted" + reason; topbar chip shows "Engine Halted" |
| Rate limiter starved the authenticated console (429s mid-session: 12 views × 4–6 calls each) | Limit is now token-aware: **1200 req/15min for valid sessions, 200 for anonymous** |
| `/covers/` never mounted — storefront logo 404 | `express.static(covers)` mounted read-only with 1-day cache |
| 19 seed professions still carried `"??"`/`"?"` placeholder emojis | All seeds fixed at the source (previously only repaired on-boot) |
| `.env.example` drift | `READYNESS_PUBLIC`, `ETSY_SHARED_SECRET` documented; stray `//` comments fixed |
| No favicon anywhere | Inline SVG `data:` favicon (CSP-safe) added to all four pages |

## P2.2 Verification record (all run, nothing inferred)

| Check | Result |
|---|---|
| `npm test` | **77 tests · 73 pass · 0 fail · 4 skipped** |
| `npm audit --omit=dev` | 1 known high: `xlsx` prototype-pollution/ReDoS — **no upstream fix exists**; mitigated by never exposing workbook parsing to public uploads (documented in README) |
| Secret scan (tracked files) | Clean |
| Encoding scan (`server/` + docs) | Clean |
| Auth gate (`ADMIN_PASSWORD` set) | `/` `/setup` → 302 · `/store` `/login` 200 · `/api/health` 200 · **`/api/health/readiness` 401** (was 200) · `/api/setup/status` 401 · all mutation probes 401 |
| Readiness gate matrix | unauth 401 → login → 200; `READYNESS_PUBLIC=true` → 200 unauth; auth off → 200 |
| CSP header | Present on all document responses (verified via curl) |
| Browser pass, all 12 console views | Rendered, **0 console errors, 0 CSP violations**, no `undefined`/`NaN` |
| Browser pass, store/setup/login | 0 inline handlers/scripts remaining; Google Fonts load passes CSP; logo 200 |
| Command palette end-to-end | ⌘K → filter "backup" → 1 hit → executed → run recorded (159,744-byte backup file verified on disk) |
| Run stream drawer | Opens, events flow |

## P2.3 Competitive scan (3 Hugging Face Spaces, requested)

| Space | What it actually is (from source) | Verdict |
|---|---|---|
| Youfar25/Etsytrend-app (Gradio) | 5 hardcoded string templates scored by a static keyword list; no network, no real data | Toy — NicheGate's Opportunity Engine already exceeds it |
| lvRJay18950/etsy-command-center (Streamlit, 97KB) | All numbers fabricated; filters multiply synthetic data. Strong IA though: health score /100, KPI deltas, revenue series, listing Hot/Rising/Watch badges, Opportunity/Risk/Action insights | **Ideas adopted** into Flight Deck BI panels (built on real tables, Phase C) |
| iamgaazicom/etsygenie (static HTML) | DeepSite marketing mockup, zero functionality | One concept taken: competitor-URL → niche pipeline (→ revenue roadmap) |

Residual risk unchanged: **committed Etsy credentials were not rotated (owner's decision)**.
