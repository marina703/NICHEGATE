# NicheGate — Recent Session Log & Feature Summary

**Source session:** `1789664485053_q30cm` (pinned) · desktop · `openrouter/free` · 74 checkpoints/commits
**Window:** 2026-09-15 → 2026-09-17
**Repo:** https://github.com/marina703/NICHEGATE.git (`main`)
**Root:** `C:\Users\linde\.skales-data\workspace\nichegate`
**HEAD:** `e12ce80` — `feat(types): pyro manual-method worksheets (batch mixing, lift & fuse, pre-shoot log) + concurrency-safe DB init`

---

## 1. What this session shipped (newest → oldest)

### 🧠 AI idea layer — OpenRouter router + concept engine + novelty gate
- **`modelConfig.js` / `modelRouter.js`** — OpenRouter-first, budget-pinned defaults:
  - scan → `google/gemini-flash-1.5`, judge → `anthropic/claude-3.5-haiku`, ideation → `deepseek/deepseek-chat`.
  - `MODEL_ENABLED` master switch (off → every model call returns `null` instantly at zero cost).
  - Cost guards: `MODEL_MAX_CALLS_PER_SCAN=3`, `MODEL_MAX_CALLS_PER_IDEA_BATCH=4`, `MODEL_TIMEOUT_MS=25000`, `MODEL_MAX_TOKENS=1024`, `maxRetries=2`. Optional direct-provider fallback.
- **`conceptEngine.js`** — gives every product a *differentiated* AI angle (name, pitch, 3 benefits, differentiator) instead of a saturated `{niche} {type}` recolor.
  - `noveltyScore()` rejects generic output ("template/kit/pack/bundle/ultimate…" penalised; specific buyer language rewarded; reject < 55).
  - `parseConcept()` defensive strict-JSON parsing; any malformed output → `null`.
  - `enrichProduct()` best-effort enrich, never throws; stores `name` + `concept` JSON on the product row (new `products.concept` column).
- **`contentLibrary.js`** — niche content library backing the idea layer (added with the router).

### 🎨 Covers — AI lifestyle covers, v2 → v3, Cloudflare Workers
- **`coverArt.js` / `previewBatch.js`** — photo-only AI prompts (no AI text/garbled labels).
- Provider evolution: **Pollinations (free) → fal.ai FLUX → Cloudflare Workers AI (FLUX)**. `COVER_ART_PROVIDER=cloudflare` is now the default.
- **`cf-worker/src/index.js`** — deployed cover worker (`https://nichegate-covers.marina-74d.workers.dev`), FLUX-1-schnell, shared-secret auth via `x-ng-key`.
- **v2 thumb-stopper** (1200×1500 light paper, giant title, hero, benefits) → **v3 composite** (AI lifestyle photo full-bleed + scrim + typography, watermark hidden).
- **Force-rebuild covers endpoint + "Rebuild ALL" button** (batched regeneration); paginated preview rebuilds; trash filter + bulk-reject + gallery UI. `scripts/render-cover.js` utility.

### 🖥️ Dashboard — dark ops-console redesign + optional auth
- **Layout overhaul** — Command Center, Catalog grid, full-width Review, Automation, Marketplace, Trends. Replaced the chat-centered layout. New `client/login.html`.
- **`auth.js`** — optional single-admin login via `ADMIN_PASSWORD`: httpOnly session cookie (`ng_session`), 7-day TTL, `timingSafeEqual` compare, brute-force delay, `auth_sessions` table. **Auth is OFF until `ADMIN_PASSWORD` is set** — zero behavior change for existing deployments. Autonomous engine runs server-side and is never gated.

### 🧩 Product type registry — "extending far and wide"
- **`productTypes.js`** — single source of truth for every product category (discovery/draft/SEO/file-factory all read here).
  - **Chunk 1 (live):** `wall-art`, `worksheet`.
  - **Chunk 2 (live):** `planner`, `party-printable`.
  - **Pyro manual worksheets:** `pyro-batch`, `pyro-lift-fuse`, `pyro-shoot-log` (old-school fill-in-by-hand boards; owner of `ignitix.online`).
  - **Deferred:** `cut-file` (SVG), `budget-tracker` (planned, not built).
- **Bundles** expanded from 5–7 to **8–11 pieces** (added brand, website, planner, wall-art; journal for passion/recovery products).

### 🚀 Concept-aware listings + pipeline UX
- Marketplace listings now carry AI **title + pitch + benefits**; full cover gallery on Gumroad/Etsy.
- Clickable **pipeline funnel** circles; **🔮 "Better Idea"** regeneration per product.

### 🔧 Reliability fixes
- **Reddit radar** falls back to `old.reddit` (Railway `ams` was returning 403 on `www.reddit`).
- **Concurrency-safe DB init** in `database.js`.
- Cover worker **secret now required**; preview rebuilds paginated safely.

---

## 2. Current architecture

```
server/
  index.js                 # Express 5 routes + node-cron (2h discovery, 6h full cycle)
  database.js              # schema + seed + migrations (node:sqlite WAL)
  setup.js
  services/  (33 modules)
    modelConfig.js, modelRouter.js, conceptEngine.js, contentLibrary.js   # AI idea layer
    productTypes.js        # NEW — product type registry (single source of truth)
    productDraft.js, pipelineSchemas.js                                   # draft/pipeline
    discovery.js, trendRadar.js, trendScanner.js, velocityEngine.js,
    vettingEngine.js, nicheUniverse.js, seasonalEngine.js                  # autonomous discovery
    fileFactory.js, pdfGenerator.js, xlsxGenerator.js, zipGenerator.js,
    designStudio.js, themes.js, brandAssets.js                             # file generation
    coverArt.js, previewBatch.js                                          # AI covers
    bundleEngine.js, seoEngine.js, marketplace.js, notifier.js, readiness.js,
    toolStudio.js, auth.js, automationCycle.js
  client/  index.html (dashboard) · login.html · setup.html · store.html
  cf-worker/  src/index.js  (Cloudflare Workers AI FLUX cover provider)
  test/  (12 suites incl. auth, concept, cover-safety, printables, phase5/6/7)
```

---

## 3. Live data snapshot (verified from `data/profession-box.db`)

| Entity | Count |
|---|---|
| Professions | 30 |
| Products | 199 (169 draft · 30 listed) |
| Trends tracked | 335 |
| Templates | 96 |

**Products by type:** spreadsheet 30 · social 29 · checklist 29 · invoice 25 · booking 24 · bundle 23 · journal 9 · brand 8 · tool 6 · wall-art 5 · decision-matrix 5 · roi 3 · website 1 · planner 1 · leadmagnet 1.

**Settings:** `auto_generate=true` · `auto_list=true` · lead-magnet live at `https://marinablow.gumroad.com/l/mkmrhb` · Gumroad daily-create quota counter (`gumroad_creates_day=2026-09-18`, `gumroad_creates_today=0`).

> Note: bundles are stored as `products` rows with `type='bundle'` (there is no separate `bundle` table).

---

## 4. Config state (`.env`, secrets redacted)

| Key | State |
|---|---|
| `MODEL_ENABLED` | **not set → AI concept layer is OFF** (despite `OPENROUTER_API_KEY` being set) |
| `OPENROUTER_API_KEY` | set |
| `COVER_ART_PROVIDER` | `cloudflare` |
| `COVER_WORKER_URL` / `COVER_WORKER_KEY` | set |
| `GUMROAD_ACCESS_TOKEN` | set |
| `ETSY_CLIENT_ID` | set (`8m0927j1…`) |
| `ETSY_CLIENT_SECRET` | ⚠️ readiness check flags if identical to client id — verify |
| `DISCORD_WEBHOOK_URL` | **empty** (no alerts) |
| `FAL_API_KEY` | not set (fal path unused while on Cloudflare) |
| `BIND_HOST` | not set (defaults `127.0.0.1` dev / `0.0.0.0` prod) |
| `NODE_ENV` / `PORT` | `development` / `5000` |

---

## 5. Tests

```
ℹ tests 77 · suites 18 · pass 74 · fail 0 · skipped 3
```

Suites include `auth`, `concept`, `cover-safety`, `printables`, `model`, `engines`, `phase5/6/7`, `smoke`, `marketplace-copy`.

---

## 6. Deployment (Railway)

- Project **NICHEGate** (`marina703`), environment `production`, service region `ams`, 1 replica.
- Builder `DOCKERFILE`, volume `/app/data` (55.8/500 MB, READY), runtime URL `https://nichegate-production.up.railway.app`.
- Latest deploy **SUCCESS** (2026-09-15); prior 3 REMOVED. GitHub source now connected (`railway service source connect`).
- Reddit/eBay radar 403s in production are addressed by the `old.reddit` fallback (deployed).

---

*This document is generated from the pinned session `1789664485053_q30cm` and live DB/git state as of 2026-09-17/18. It supersedes the stale dated figures in README/ROADMAP/PUNCH_LIST.*


