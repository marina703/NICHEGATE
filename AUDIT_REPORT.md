# NicheGate — Architecture & Code Audit

**Date:** 2026-09-13
**Stack:** Express 5 · SQLite (`node:sqlite`, WAL) · Puppeteer · SheetJS · adm-zip · node-cron
**Scope:** Comprehensive audit + targeted upgrades (trend detection, file design, pipeline reliability)

---

## 1. System snapshot

| Area | Status |
|---|---|
| Entry point | `server/index.js` (Express app + node-cron scheduler) |
| DB | `server/database.js` → `data/profession-box.db` (WAL, `busy_timeout=5000`, FKs ON) |
| Services | 20 modules in `server/services/` |
| Tests | `test/*.test.js` (node:test) — **34 passing** |
| File gate | `fileFactory.ensureProductFile` required before publish — no fake-success path |
| Schema guard | All upgrades are additive/no-op at the SQL level; schema unchanged |

## 2. Source tree

```
server/
  index.js                 # API routes + cron (6h full cycle, 2h discovery sweep)
  database.js              # schema + seed + migration
  setup.js                 # DB bootstrap CLI
  services/
    automationCycle.js     # modular 6h full-cycle task pipeline
    productDraft.js        # NEW — single source of truth for drafting product rows
    readiness.js           # NEW — launch-readiness checker (redacted + boot warnings)
    discovery.js           # autonomous hunt loop (radar + universe + seasonal)
    trendRadar.js          # live signals (Google Trends RSS, Reddit, Etsy, Amazon, eBay, TikTok/Pinterest RSS)
    trendScanner.js        # detection/lifecycle/activation + curated pool
    velocityEngine.js      # 0–100 trend scoring
    vettingEngine.js       # 7-signal ACTIVATE/WATCH/SKIP gate
    nicheUniverse.js       # 150+ curated niches
    seasonalEngine.js      # 12-month demand map
    pipelineSchemas.js     # cross-stage payload validators
    fileFactory.js         # product row → real downloadable file (single source of truth)
    pdfGenerator.js        # Puppeteer PDF + cached Chrome + local-Chrome fallback
    xlsxGenerator.js       # multi-tab live-formula spreadsheets
    zipGenerator.js        # social pack + ZIP packaging
    designStudio.js        # premium shared template builders
    themes.js              # 8+ theme library + sentiment palettes
    brandAssets.js         # NicheGate visual identity sync
    bundleEngine.js        # $29 Complete Toolkits + lead magnet
    seoEngine.js           # Etsy/Gumroad titles, descriptions, tags
    marketplace.js         # Gumroad (4-step S3 flow) + Etsy (PKCE)
    notifier.js            # Discord webhook alerts
test/
  smoke.test.js            # HTTP boot + /api/professions
  engines.test.js          # velocity/vetting/radar/discovery
  phase34.test.js          # schemas/themes/xlsx/design/quota
  phase5.test.js           # NEW — trend accuracy, draft helper, social fallback
  phase6.test.js           # NEW — readiness + Etsy key validation
```

---

## 3. Focus area findings (before → after)

### 3.1 Trend detection accuracy

**Before**
- `trendRadar.insertLiveTrend` fabricated `velocity` purely from rank and hardcoded `phase: 'emerging'` — no momentum/phase inference.
- `shoppingIntent` was a static per-source scalar; `vettingEngine.scoreShoppingIntent` regex-matched `source`/`why`, scoring universe entries ("Discovery · trades · …") as a flat `55`.
- Dedup matched exact `name` only → near-duplicate trend rows across sweeps possible.
- `velocityEngine.parseRevenue` would treat stray digits inside words as revenue.
- `trendScanner` curated-pool fallback picked a **random** entry and returned only the first live result.

**After**
- Added `normalizeNicheKey()` (casefold, de-accent, stopword-strip, `(seasonal)`-strip) and `trendNameExists()` — used by radar, discovery, and scanner for cross-sweep dedup.
- Added `phaseForVelocity()` (≥240% → hot, ≥120% → rising, else emerging) so live trends get a real phase.
- Added `fuseShoppingIntent()` that fuses the source baseline with name-level productizability signals (template/planner words boost; celebrity/news dampen), stored as `intent=0.xx` in the trend `why`.
- `vettingEngine.scoreShoppingIntent` now parses the stored `intent=` tag first (data-driven), falling back to the source regex.
- `parseRevenue` only counts `$`-prefixed or `k`-suffixed numbers.
- Curated-pool fallback now ranks candidates by `vetTrend()` score instead of `Math.random()`.

### 3.2 File design capabilities

**Before**
- `designStudio.js` contained literal mojibake in rendered output (`Â·`, `â€”`, `Ã—`, broken `⚖️`/box-drawing/emoji) — degrading every generated PDF/preview.
- Social pack shipped editable HTML only (buyers had to screenshot manually).
- `marketplace.js` had a dead `listOnGumroad` stub (no file upload) and a duplicate `uploadGumroadFile` stub shadowed by the real 4-step S3 flow.
- `fileFactory.js` duplicated a dead private `buildTablePreviewHTML`.

**After**
- Repaired all encoding corruption in `designStudio.js` (em-dash, middle-dot, multiply, emoji, box-drawing); verified clean and module-loadable.
- `zipGenerator.createSocialPack` is now async and renders PNG assets (2× retina via the shared Puppeteer browser) with editable HTML + hashtags always included as a fallback.
- Removed the dead Gumroad stubs.
- Removed the dead duplicate `buildTablePreviewHTML`.

### 3.3 Multi-agent pipeline reliability

**Before**
- Five separate draft-insertion sites with divergent theme/type/price rules; `POST /api/automation/run` used an invalid theme `'Black Teal'`.
- `runFullCycle` tasks were not isolated — one throw aborted the whole cycle.
- `validateProductDraft` did not whitelist `type` or validate `price`.

**After**
- Added `productDraft.draftProduct(prof, type)` — one helper for validated, theme-resolved, deduped drafts. Routed through auto-cycle, discovery, freshness pass, seasonal engine, and the manual endpoint.
- Fixed `POST /api/automation/run` to reuse `draftProduct` + `automationCycle.VARY_TYPES` (drops `'Black Teal'`).
- Added `safeTask()` so each cycle stage is isolated (error → `task_error` log, continue).
- `validateProductDraft` now enforces a `PRODUCT_TYPES` whitelist and a `$` price format via `validatePrice`.

### 3.4 Launch readiness & config validation

- Added `readiness.js` — a redacted, read-only report (`GET /api/health/readiness`) that surfaces launch blockers (missing keys, Etsy `id === secret` misconfig, `BIND_HOST` loopback, missing Discord webhook, backlog counts, `auto_list` off, `marinablow` branding drift).
- `marketplace.checkEtsyKeys()` now flags `ETSY_CLIENT_ID === ETSY_CLIENT_SECRET` as a misconfiguration (backward-compatible; still returns `{ ok, message }`).
- `BIND_HOST` defaults to `0.0.0.0` when `NODE_ENV=production` or `RAILWAY_ENVIRONMENT` is set, so deployed hosts are reachable without manual config.
- Boot-time `readiness.logReadinessIssues()` prints non-secret warnings to the console.

---

## 4. Backward compatibility

- **No SQL schema changes** — new logic reuses existing columns (`trends.why` stores the fused intent tag; `products.theme` stores the resolved theme name).
- **No route removals/changes** — endpoints are untouched; `GET /api/trends/radar-health`, `GET /api/automation/status`, `POST /api/trends/:id/activate?force=1` remain.
- `createSocialPack` signature is unchanged (now returns a `Promise`; its sole caller in `fileFactory` now `await`s it).
- All exports are a superset of the previous surface (new helpers added; only dead stubs removed).

## 5. Test status

```
tests 34 · suites 13 · pass 34 · fail 0
```

`npm test` covers HTTP smoke, engines, schemas, themes, xlsx, design mockups, quota, and the new phase-5 suite.

*Generated by the NicheGate audit pass 2026-09-13.*

