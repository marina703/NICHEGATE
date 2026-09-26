# MEMORY.md — persistent agent memory for NicheGate

## Project: NicheGate — Autonomous Digital Product Factory
- Stack: Node >=22, Express 5, SQLite (WAL), Puppeteer PDFs, SheetJS XLSX, adm-zip
- Run: start-nichegate.bat → http://localhost:5000
- Repo: github.com/marina703/NICHEGATE.git (main)
- Deploy: Railway (ams, Dockerfile, volume /app/data)
- AI: OpenRouter (gemini-flash scan, claude-haiku judge, deepseek ideation). MODEL_ENABLED=true.

## Product System
- 33 types (15 innovative): playbook $24, pricing-bible $19, calculator $15, email-scripts $15, sop-package $19, + 28 originals
- Design DNA: 8 styles × 13 niches × 12 fonts × 16 builders
- Covers: Cloudflare Workers AI FLUX, niche-specific prompts

## Command Center — 10 Views (ALL VERIFIED WORKING 2026-09-20)
Dark command-center theme (deep #04060a base, teal→blue→violet gradient,
ambient radial glows, grid texture, depth/glow on panels, cards, KPIs).
The 10 REAL views (nav rail + VIEWS array + render() branches all wired):
home, catalog, review, social, ads, calendar, analytics, automation,
marketplace, trends.
⚠ CORRECTION: item 4 below ("Chat — Custom prompts, passion niches") is WRONG.
There is NO chat view. It was never wired. Passion niches are served by
GET/POST /api/niches/passion and surfaced in Home → Smart Actions.
1. 🚀 Home — Revenue KPIs, pipeline, smart actions
2. 📦 Catalog — Grid with DNA badges, double-click preview
3. ✅ Review — Approve/reject + push-to-Etsy/Gumroad
4. 💬 Chat — Custom prompts, passion niches
5. 📱 Social — 6 platforms (pinterest/instagram/twitter/facebook/tiktok/linkedin), batch generate
6. 💰 Ads — Budget tracking, commit/cancel
7. 📅 Calendar — Monthly activity view
8. 📊 Analytics — Revenue by type/niche, conversion funnel
9. 🏪 Marketplace — Etsy cap, newsletter preview, connections
10. 🔭 Trends — Activate, generate products from trend

## CRITICAL LESSONS (learned 2026-09-20 — READ BEFORE EDITING server/index.js)

### 1. Never trust "edit reported OK" — always VERIFY
Developer.edit and PowerShell string edits silently failed several times on
these large files while still reporting success. After ANY edit, verify with a
grep/regex count read back from the file — not the tool's return value.

### 2. server/index.js route-nesting bug (FIXED)
The /api/health handler was never closed properly, so ~790 lines containing 22
route registrations were NESTED INSIDE it. They only registered when
/api/health was hit, and a stray "a" fragment threw mid-handler, permanently
killing every route after it. Symptom: 9 endpoints returned 404 forever, yet
node --check still PASSED (braces balanced — the scope was just wrong).
Now: 98 top-level routes, 0 nested. Verify with:
  node -e "const L=require('fs').readFileSync('server/index.js','utf8').split(/\r?\n/);console.log('top:',L.filter(l=>/^app\.(get|post|patch|delete|put)\(/.test(l)).length,'nested:',L.filter(l=>/^[ \t]+app\.(get|post|patch|delete|put)\(/.test(l)).length)"

### 3. Patch-script truncation fragments (FIXED)
Earlier patch scripts left behind: stray "a" lines, "unction" (missing f),
"pp.post(...)" / "pp.get(...)" (missing the "a" of "app"), "async f". All
removed. Scan for more with: ^\s*(pp|p)\.  |  ^\s*unction\b  |  ^\s*[a-z]{1,3}$

### 4. products has NO prof_name column
products columns: id, profession_id, name, type, price, status, theme,
html_content, file_path, marketplace_id, marketplace, created_at, updated_at,
preview_path, concept.
prof_name must come from a JOIN:
  LEFT JOIN professions pr ON p.profession_id = pr.id  →  pr.name AS prof_name
Newer routes queried prof_name straight from products → 500. Fixed in
revenue/summary, calendar, smart-actions, newsletter/generate.

### 5. trends has NO status column
trends columns: id, name, emoji, phase, velocity, window, est_revenue, why,
activated, detected_at, activated_at, outcome.
Use "activated = 1" — NOT status = 'active'.

### 6. conceptEngine exports (generateSocialPost ADDED 2026-09-20)
generateConcept, applyConcept, enrichProduct, noveltyScore, parseConcept,
generateSocialPost. It was being called by /api/social/generate and
/api/social/post-now but never existed → both 500'd. Now implemented; never
throws upstream, degrades to deterministic ready-to-post copy.
modelRouter helpers: callModel, cheapSummarize, scoreOptions, generateIdeas,
fallbackChat, status, redact.

### 7. Verify on a throwaway port, NOT the live one
The local :5000 server is frequently a STALE process started long before your
edits (check Get-Process StartTime vs the file's LastWriteTime). Boot with
PORT=509x and curl that, or you test old code and draw wrong conclusions.

### 8. Known external issue
OpenRouter returns 401 (key expired/invalid). Model calls degrade gracefully by
design so nothing crashes, but AI concept + social copy currently fall back to
deterministic templates. User must refresh OPENROUTER_API_KEY for real AI output.

## Rules
- Always update TASK.md AND MEMORY.md before stopping.
- Etsy daily cap minimum 10/day. No listing without real file.
- AI calls must never throw. Keys only from env.

- PROD AI verified 2026-09-21: MODEL_ENABLED=true + clean OPENROUTER_API_KEY pushed to
  Railway via CLI; /api/model/status enabled:true. Prod URL: nichegate-production.up.railway.app

- SERP discovery pipeline added 2026-09-21 (Chunk 1): search_queue table + Serper autocomplete + ValueSERP shopping in trendRadar.js, discovery endpoints in index.js. Serper key works; VALUE_SERP_API is invalid (returns HTML) — replace before Layer 2 validation activates. Layer 3 = Etsy Open API saturation gate (next).

- Chunk 2 done: Etsy saturation gate fixed (await bug) + ValueSERP swapped for DataForSEO (Keyword Research) + enriched Etsy score + opportunity engine endpoint. Serper kept as primary discovery. DataForSEO needs account verification (app.dataforseo.com) and Etsy shared secret needs a valid active key before Layer 3 goes live; both degrade gracefully.

# ── 2026-09-21 (cont): DataForSEO fix (Chunk 2 addendum) ──
- DataForSEO keyword data is TASK-BASED, not live. Rewrote fetchDataForSEO to
  POST /keywords_data/google/search_volume/task_post (ALL seeds in one task) then
  poll /search_volume/task_get/$id (up to 3 retries, 6s+3s). Verified LIVE:
  digital planner vol 12100/cpc 4.65, invoice template vol 90500/cpc 12.63.
  Source health ok:true.
- Account needed verification at app.dataforseo.com (was 403 "verify your account");
  now active. The earlier /ad_words/recommendations live path was a 404 (no live
  endpoint exists for keyword data) - that is why all probes 404'd post-verification.
- Layer 2 (DataForSEO validation) + Layer 3 (Etsy saturation; ETSY_SHARED_SECRET now
  in Railway) are both wired. Go live on next GitHub push + Railway redeploy.

# ── 2026-09-22: CONSOLIDATED 7-PHASE ROADMAP (authoritative backlog = TASK.md) ──
Origin: top-10 tools deep dive (Exploding Topics/Glimpse/eRank/EverBee/Tailwind/Kit/Foreplay analysis) + owner's top-5 feature picks + audit thread 96681957 remediation items.
Full itemized backlog lives in TASK.md § "CONSOLIDATED 7-PHASE ROADMAP" — that is the single source of truth; this note is the map + invariants.

- P0 audit remediation: Etsy key ROTATION + git-history purge are OWNER actions (never done from code sessions); code-only item = optimizer one-click rollback (products.listing_json + Etsy PATCH / Gumroad update APIs added in 526bca4).
- P1 real growth data (KEYSTONE): trend_snapshots table; DataForSEO google_trends/explore/live (NOT search_volume — that's the task-based volume API already wired); replace insertLiveTrend's synthetic velocityPct = max(90, 320 - rank*20) with week-over-week deltas; phases derive from slope/acceleration.
- P2 open-ended discovery: recursive Serper/Etsy autocomplete expansion + first_seen_at. P3: z-score breakouts, 12-week exponential-fit forecast, measured vetting signals. P4: real Pinterest/TikTok/YouTube sources (kill the Google-News-RSS proxies) + tests.
- P5 distribution: PIN ENGINE (Tailwind-lite: schedule queue, AI pin copy via modelRouter, Pinterest keyword research, UTM pin→sale attribution via existing Gumroad sync), SEQUENCES (Kit-lite: per-niche launch sequences + ESP integration — HARD RULE: never send email from NicheGate itself, deliverability is not our product), SWIPE FILE (Foreplay-lite: Meta Ad Library + TikTok Creative Center, first_seen/last_seen longevity tracking — longevity is the only reliable ad performance proxy).
- P6 growth (owner-approved order): 1 Etsy OAuth completion + refreshEtsyToken (OAuth v3: access ~5min, refresh 90d single-use ROTATING — persist rotated tokens to marketplace_tokens) · 2 gap scoring (incumbent quality from fetchEtsySaturation data it ALREADY fetches) · 3 self-improving vetting (refit 7 WEIGHTS from activation outcomes — the moat) · 4 pricing engine (Gumroad offer codes, launch rules, learned elasticity) · 5 video hook scripts via conceptEngine. Stretch recorded in TASK.md (ad ledger, pSEO, interactive products, sibling emails, complaint mining, diversity guard).
- Dependency rules: P1 keystone (P3 depends on snapshots; Swipe File reuses snapshot pattern; P6.3 strengthens after P1). Pin Engine is the only fully independent fast win. Origin rule from 526bca4 applies to ALL new auto-deploy features: origin='manual' products are NEVER auto-published or auto-optimized-to-live.
- Session discipline for this roadmap: update TASK.md+MEMORY.md per phase, run npm test + node --check + browser smoke after each phase, verify on a throwaway port (509x), THEN continue to next phase. Baseline at plan time: 526bca44, 83 tests / 80 pass / 0 fail / 3 model-skips.

# ── 2026-09-21 (cont): Etsy Layer 3 key fallback ──
- fetchEtsySaturation now tries ALL Etsy key vars (ETSY_SHARED_SECRET, ETSY_CLIENT_SECRET,
  ETSY_CLIENT_ID) as x-api-key and uses the first that authenticates (Etsy portals label the
  x-api-key value inconsistently as Shared Secret vs Keystring). Removes the guesswork; whatever
  correct key the user has in any var works. Layer 3 (Etsy saturation) + Opportunity Engine now
  fully live once a valid key is present in Railway. Verified DataForSEO Layer 2 live in prod
  (volume 90500 for "planner").
- NEXT (per user's Etsy OAuth guide): implement access-token auto-refresh. Etsy OAuth v3:
  access token ~5min, refresh token 90d single-use rotating. Existing marketplace_tokens table on
  Railway's persistent SQLite volume already survives restarts - no new Postgres/Redis plugin needed.
  Plan: add refreshEtsyToken() invoked before publish + on a schedule; store rotated tokens back.

# ── 2026-09-22: Roadmap executed — Phases 0–6 complete ──
- ALL phases implemented, suite green: 116 tests / 113 pass / 0 fail / 3 model-skips (baseline at plan time was 83/80/0/3). Task discipline followed: npm test + node --check + throwaway-port boot (5093-5097) after each phase; TASK.md checked off per phase. NOTE: Phase 6 feature tests live in test/growth-features.test.js (test/phase6.test.js already existed at HEAD for readiness/Etsy-key tests — caught and restored after an initial overwrite).
- P0: optimizer ONE-CLICK ROLLBACK (POST /api/products/:id/optimization/rollback — restores products.listing_json copy locally + live, shares the origin='manual' deploy rule with apply).
- P1 (keystone): trend_snapshots table (unique trend_key+ISO-week, snapshotTrend upsert); DataForSEO google_trends/explore/live series; growthFromSnapshots → REAL week-over-week velocity (synthetic max(90, 320-rank*20) GONE); phaseFromGrowth derives phase from slope+acceleration; est_revenue bands from measured volume×CPC.
- P2: discoverTerms() recursive Serper+Etsy autocomplete expansion (throttled, search_queue-deduped), first_seen_at on trends, POST /api/discovery/expand, automation action 'expand-terms'.
- P3: breakoutScore (z-score vs each term's own history), forecast12w (exponential fit + cohort growth percentile); measuredSignals() in vetTrend overrides longevity/seasonality/demand + breakout flag; GET /api/discovery/breakouts + /forecast.
- P4: real YouTube RSS source added; Pinterest/TikTok attempted at real endpoints with graceful degradation (bot-gated JSON) — Google-News-RSS proxies removed. Honest-source pattern preserved (markHealth registry).
- P5: pinEngine.js (pins table, schedule queue drained by automationCycle, UTM pin→sale attribution via existing Gumroad sync), sequenceEngine.js (per-niche AI launch sequences — HARD RULE holds: email is NEVER sent from NicheGate), swipeFileEngine.js (swipe_ads table, upsertAds includes angle classification, first_seen/last_seen longevity). Tests: test/distribution.test.js.
- P6: (1) REFRESH-TOKEN ROTATION FIX — refreshEtsyToken now persists the rotated refresh_token (Etsy rotates single-use refresh tokens; old code dropped it → OAuth died permanently after the 2nd refresh). (2) Gap scoring: incumbentQuality — weakness 0-100 = 50% low-favorites + 30% stale-age + 20% price-floor, overrides phase competition when measured; seedGap test seam; GET /api/vetting/gap. (3) vettingLearner.js — logistic regression on the 5 numeric signals from real activation→sale outcomes (metrics.product_id); needs ≥20 examples AND both classes else honest 422; learned weights flow into vetTrend (learnedWeights:true). (4) pricingEngine.js — charm $X.99 floor $3.99, launch rule 14d −30%, A/B low/base/high round-robin persisted in settings, applyPrice deploys via updateListingCopy, elasticity winner ONLY with ≥5 sales + ≥2× units/day lead. (5) generateVideoScripts in conceptEngine — 3× 15-30s template-as-b-roll TikTok/Reels scripts, AI + deterministic fallback.
- New routes: /api/pricing/tests(+start,:id/end) · /api/pricing/apply · /api/pricing/launch/:id · /api/vetting/weights|refit|weights/reset|gap · /api/products/:id/video-scripts · /api/pins/* · /api/sequences/* · /api/swipe/* · /api/discovery/expand|breakouts|forecast.
- New tests: trend-growth.test.js, trend-intelligence.test.js, distribution.test.js, growth-features.test.js (+rollback tests in optimizer.test.js).
- Still OWNER-side (skipped per owner): Etsy key rotation + git-history purge; Etsy identity verification before live Etsy listing. Stretch ideas remain recorded in TASK.md (ad ledger + kill rules, programmatic SEO, interactive products, sibling emails, complaint mining, diversity guard).

# ── 2026-09-23: PDF-preview end-to-end audit (user symptom: "previews not working") ──
- ROOT CAUSE (the only real defect): the Flight-Deck hardening set helmet CSP frame-ancestors 'none' GLOBALLY, including /api/products/:id/preview — which client/js/console.js:403 deliberately embeds in an iframe. frame-ancestors overrides X-Frame-Options, so browsers silently refused to render the (200 OK) responses inside the console. Lesson: 'frame-src' governs the parent creating frames; 'frame-ancestors' governs the EMBEDDED response — they are not interchangeable.
- FIX: preview route rewrites ONLY that directive to 'self' (same-origin embedding stays clickjacking-safe); every other route keeps 'none'. Verified: preview CSP now frame-ancestors 'self', /api/products control keeps 'none'; 116 tests / 113 pass / 0 fail.
- Pipeline itself audited healthy — locally AND in production (logged in via password from `railway variables`, exercised real endpoints): on-demand PDF regen returns 200 application/pdf in 0.2-0.4s; Chrome renders thumbnails (~2.8s); spreadsheet HTML preview OK; per-product exports hash-distinct. Dockerfile (chromium + PUPPETEER_EXECUTABLE_PATH) is correct.
- PROD RISK (owner decision recorded in TASK.md): /app/generated + /app/previews sit OUTSIDE the /app/data volume → wiped on every redeploy. DB (on volume) keeps stale file_path/preview_path; previews self-heal via regen, but files published to Gumroad/Etsy whose local source vanished are the gap. Options: move OUTPUT_DIR/PREVIEW_DIR under /app/data (env override, small change) or mount the volume at /app.
- Audit hygiene: production admin password read via railway variables into a shell var only (never printed); login session + artifacts deleted after use.

# ── 2026-09-23: UX redesign — light-first theme + command chat ──
- flightdeck.css is now fully token-driven: light palette on :root, original dark cockpit under [data-theme="dark"]. NEVER hardcode a color in views — use var(--*) tokens or both themes break. Theme preference: localStorage `ng_theme`; toggle via topbar chip (data-action="theme-toggle"); index.html pre-paints before first render (no FOUC).
- Command chat bar (#cmdbar, client/js/console.js): docked prompt bar, intent router `routeCommand()` maps plain language to EXISTING actions (generate-custom, action registry 'sweep'/'full-cycle'/'sync-sales'/'approve-all'/'dedupe-queue', BI summary, view navigation). Fallback = treat input as a product idea. Transcript in localStorage `ng_cmdlog`. Pattern to extend: add an intent branch in routeCommand — no new server surface required.
- Local dev DB discipline: booting the server auto-runs the automation cycle which generates ~24 drafts per boot — clean with `DELETE FROM products WHERE id > 106 AND status IN ('draft','pending-review')` before committing anything DB-dependent (106 = last pre-existing product id in dev).
- Theme refinement (same day, owner feedback): light `--bg` darkened to #e9edf3 (page), rail uses the previous page gray (#f4f6fa→#eef1f6) so it reads as a distinct column, body text near-black #0a0e14 at font-weight 600, and the UI font is now Barlow Semi Condensed (bold-but-narrow look) with Inter fallback. Keep these relationships if retuning: page < rail < panel brightness.
- Font swap (2026-09-23): UI sans changed Barlow Semi Condensed → Oswald (weights 400–700 added to Google Fonts link; Barlow kept as fallback). Reason: hard to read at console sizes; Oswald keeps the narrow/condensed look with better small-size clarity. Verify with document.fonts.check('600 14px Oswald').

# ── 2026-09-23: Gumroad profile landing page ─────────────────────────────
- Published custom profile page via gumroad-cli (pages push profile) → live at marinablow.gumroad.com (served as /landing/embed inside the profile shell).
- Source: gumroad-page/build.js generates landing.html from `gumroad products list --all` JSON (dedupes doubled names, classifies 83 products into 6 collections, keeps real permalinks).
- Design: brand assets from Desktop/nichegate designs2 — refined logo on black plate, banner artwork as hero background under scrim, palette sampled from logo (teal #409da4/#0f8b8d, pink #c75073/#c2426d), deco rule/diamonds, Georgia serif. Light+dark via prefers-color-scheme + data-theme toggle; mobile-verified.
- Constraints discovered: Gumroad reviewer caps pages at 25 images → top-20 covers curated by real sales_count, rest are deco text cards; sanitizer strips head meta (title/viewport) but keeps <script>, CDN images, data-gumroad-follow.
- Images must be Gumroad-hosted (public-files.gumroad.com via `media upload`): logo.jpg ✅ banner.jpg ✅ (320px icon.jpg auto-rejected as "promo spam" — small images trip the filter).
- Follow form: <form data-gumroad-follow> + data-gumroad-follow-message included; wired by Gumroad after account compliance review, until then subscribe-page fallback.
- CLI: .audit-tmp/gcli/gumroad.exe (v2026.09.09), authed via GUMROAD_ACCESS_TOKEN from Railway env (never printed). Re-push: cd gumroad-page && node build.js && gumroad pages preview ./landing.html && gumroad pages push profile ./landing.html.

# ── 2026-09-23: Console UX fixes + AI quality pass ────────────────────────
- Catalog checkboxes fixed: corner .ck is now a real toggle-select control (was decorative → clicks bubbled to card and opened the side panel); added Select all/Deselect all over the filtered list; batch approve/list/reject buttons already existed.
- Model bake-off (real production prompt, 2 niches × 4 models): gemini-2.5-flash wins — 2.2s vs deepseek-chat 11.5s, more original concepts ("Snap-Sign Profit Predictor"). IDEATION_MODEL default → google/gemini-2.5-flash. anthropic/claude-3.5-haiku is dead on OpenRouter (404, no endpoints); claude-3-haiku + gemini-flash-lite still alive.
- Concept prompt upgraded: added insider-workflow grounding rule + few-shot quality bar (the bake-off's best output as the example).
- New endpoint POST /api/console/assistant: blunt ops copilot with live snapshot in context (catalog, 7d revenue/sales, top sellers, recent trends); honest deterministic fallback when MODEL_ENABLED off. Verified live: ai:true, grounded answer.
- Command bar: conversational input now routes to the AI assistant instead of silently becoming a product draft; keyword intents unchanged; 2 new suggestion chips.
- metrics table has recorded_at (not created_at) — assistant SQL uses recorded_at.
- Command-center UX pass (2026-09-23): chat log got a ✕ close button; Home header got an "Update listings" button (runs optimize-weak); KPI cards on Home are now clickable buttons navigating to their view (catalog/review/analytics/system, with status preset for Approved/Draft); rail nav text bumped .55rem→.72rem with brighter color, and the rail is expandable — click the NG mark to expand to 168px (full labels, badges inline), persisted in localStorage ng_rail. All verified live in browser DOM at 1440px.

# ── 2026-09-23: Briefing UX + in-app AI worker ──────────────────────────
- Home is now a real "Operator briefing": BI insights triad (what's working /
  needs attention / highest-leverage move) + since-last-visit diff strip +
  work-now ladder from ONE shared brain `pickPriority(state)` in views.js
  (review queue → trend windows → weak listings → growth moves). Command bar
  "what should I do?" uses the same brain. Never show "nothing to do".
- Trend windows are time-boxed (trends.detected_at + window days):
  trendWindow(t) in views.js → "closes in Nd" chips on Home + Trends.
- AI WORKER: server/services/agentWorker.js + POST /api/console/agent. JSON
  tool protocol {"tool","args"} or {"say"}; parseToolCall extracts the first
  object from prose/fences (handles the bare {"say": "..."} form — a test
  caught that gap). Tools wrap actionRegistry.execute + the same service calls
  as the REST routes. DANGER GATE: delete_product + run_action:reject-trash
  return needsConfirm; client round-trips them via {confirmCall} after the
  operator replies "confirm" (state.pendingAgentConfirm in console.js).
  MODEL_ENABLED=false → planDeterministic still EXECUTES; model prose on a
  deterministic intent executes the plan anyway. /api/console/assistant kept.
- Command bar routes: quick intents (nav/help/what-should-i-do/needs-review/
  trends/sales questions) are local + instant; everything else → the worker,
  and its tool calls render as monospace "worker" step lines (cmdLog role
  'step'). Sales answers now read state.bi.deltas (old code read
  state.overview.bi which does not exist).
- Keyboard triage (J/K/A/R/Enter) works on Home's work-now card too — shared
  triageItems() in console.js; rows carry data-review-id so only triage rows
  get the cursor highlight. refreshAfterMutation reloads loadViewData(view)
  so BI never goes stale mid-page.
- Nav: Briefing pinned as its own 'top' group above work/research/ops.
- BOOT QUIRK (this dev box): shell env exports PORT=0 and dotenv never
  overrides existing env → `node server/index.js` binds a RANDOM port and logs
  "Port: 0". Always boot with `PORT=5000 BIND_HOST=127.0.0.1` prefixed.
  `kill <pid>` from Git Bash did NOT kill a Windows node process — use
  `taskkill //PID <pid> //F`.
- Tests: test/agent.test.js (16 hermetic tests, no db/network). Suite:
  132 tests / 128 pass / 0 fail / 4 model-skips.
- SURROGATE STACK (2026-09-23): server/services/{workerMemory,bossInbox,steward}.js
  feed the agent (remember/recall/forget, ask_boss) + Brainstorm decision inbox +
  hourly steward cron. Discord via notifier.sendDiscord(DISCORD_WEBHOOK_URL).
- selBar multi-select is GLOBAL across kinds but batch ops act per-kind; the misc
  Set keys are `kind:id` — always filter by kind prefix when counting/clearing.
- Row select/spark controls are <button data-action="misc-toggle-select"
  data-key="ENCODED"> (not <input>); probing the DOM needs re-query after click
  because render() replaces nodes (stale refs read old ☐ state).
- Tests: test/worker-store.test.js (18 hermetic). Suite 150/146/0 fail/4 skips.

## Production guardrails added 2026-09-24 (local-only, not deployed)
- server/services/runtimeConfig.js enforces a 16+ char ADMIN_PASSWORD and syntactically valid HTTPS Discord webhook in production; on Railway it requires a writable Railway mount and disallows DB_PATH escapes. `server/database.js` checks config before opening SQLite, so maintenance entry points can't silently initialize an ephemeral production DB.
- Railway SQLite + generated/uploads/previews/AI cover cache/backups resolve inside `RAILWAY_VOLUME_MOUNT_PATH`. Old generated paths whose files vanished can rebuild from stored product records; guard does not claim to restore absent old artifacts.
- Discord notifier returns boolean status, redacts error details so tokens cannot leak, and the surrogate creates pending boss asks only after successful Discord delivery; failures are surfaced and dismissed.
- AUTO_START_ENABLED controls production scheduler boot; production cycle publishing also requires AUTO_PUBLISH_ENABLED and DB auto_list. Manual operator-driven marketplace actions remain intentionally distinct from unattended cycle publishing.
- Railway Volume attachment and host variables are dashboard-only. Never say production is fixed until owner configures/validates Railway and deploys the reviewed code.
- New focused tests cover runtime config, traversal guard, delivery redaction, and pending asks; last verification: focused 32/32; full suite 164 tests / 160 pass / 0 fail / 4 skips; edited JS syntax checks passed.

# ── 2026-09-26: SHIPPED TO PRODUCTION (push + deploy, owner-approved) ──
- 4f107bf (AI worker + runtime guardrails) is LIVE on Railway (deploy 7e40ee64, auto-deploy on push to main). New build confirmed via /api/worker/memory 200; DB survived rollout on nichegate-volume (/app/data, 353 products).
- ADMIN_PASSWORD rotated (owner approved "rotate it now"): fresh 24-char value set via `railway variable set ADMIN_PASSWORD --stdin`; same value in the main workspace's local .env (never printed/logged/committed). Login verified 200 in prod.
- First durable DB backup on the volume: data/backups/profession-box-2026-09-26T09-39-21-061Z.db (6.0 MB) — the old build's backup action wrote to ephemeral runtime/backups only.
- AUTO_START_ENABLED / AUTO_PUBLISH_ENABLED intentionally left unset (scheduler + unattended publishing stay off until the owner reviews live inventory/limits).
- DEFERRED BY OWNER (still open): Etsy key rotation + git-history purge of the leaked keys; owner will fix once the project is fully complete.

# ── 2026-09-26: MCP SETUP (Etsy) ──
- mcp_servers.json (repo root, committed f7142d8) registers the official Etsy Dev MCP (https://mcp.api.etsycloud.com/mcp — docs-only, 8 tools, no auth). mcp-cli/Freebuff reads ./mcp_servers.json then ~/.config/mcp/mcp_servers.json.
- Global ~/.config/mcp/mcp_servers.json adds `etsy-shop` = aserper/etsy-mcp (41 tools, real Etsy API calls, own PKCE auth + auto token refresh). Built at ~/.config/mcp/servers/etsy-mcp (tsc). Secrets enter via ~/.config/mcp/servers/etsy-mcp-env.js wrapper which loads the project .env (ETSY_CLIENT_ID→ETSY_API_KEY) and SPAWNS dist/index.js — its entry has an isDirectRun guard, so import()-ing it silently never starts the server (lesson).
- Deliberately NOT installed: georgejeffers/avlihachev etsy servers (strict subsets of aserper: duplicate tools + extra token exposure).
- Etsy token health (2026-09-26): prod chain healthy (token present, not expired, connected as user 1286002574). Official rules (via Dev MCP guide): access token 1h, refresh token 90d SINGLE-USE rotating — refreshEtsyToken rotation-persist fix is live in prod (4f107bf), which was the historical "can't refresh" root cause.

# ── 2026-09-26: Dashboard font swap + full e2e audit ──
- Font swap (2026-09-26): UI sans Oswald -> Saira Condensed (400-800). Owner found
  Oswald "not solid/strong enough to read" while wanting to KEEP the narrow/tall look.
  Saira Condensed = solid grotesque, tall x-height, genuinely condensed. Tokens only:
  --sans in flightdeck.css + the Google Fonts link in index.html. --mono (Space Grotesk
  headings/numbers) unchanged. Verify with document.fonts.check('600 14px "Saira Condensed"').
  Font history: Barlow Semi Condensed -> Oswald (2026-09-23) -> Saira Condensed (2026-09-26).
- AUDIT ROOT CAUSES (fix list in TASK.md, owner has it): (1) auth guard exempts only
  /auth+/health prefixes -> /api/store/* is 401 for anonymous customers = EMPTY PUBLIC
  STORE in prod (store.js fetches /api/store/products + /api/products/:id/preview-image).
  (2) /api/products/:id/video-scripts calls conceptEngine WITHOUT requiring it -> 500
  every call. (3) index.html theme pre-paint inline script is blocked by CSP
  script-src 'self' (hash sha256-CPsPjv...) -> dark-mode FOUC + missing color-scheme.
  (4) apiLimiter covers /api/auth/login + /api/health with a shared per-IP counter ->
  a burst 429s login AND health (Railway healthcheck flapping risk; lockout loop).
  (5b) review/Home row thumbs: .rrow .rt object-fit is on the DIV wrapper, inner <img> unsized
  -> preview-image renders at natural size and covers the whole view. Add
  .rrow .rt img{width:100%;height:100%;object-fit:cover;display:block}. (5) SQLite bind crashes on missing fields -> 500s in social/generate, templates/generate,
  design/preference (validate before binding; expected conditions must be 4xx not 500).
- Test-suite quirk: smoke.test.js assumes auth is OFF (unauthenticated fetches) —
  `ADMIN_PASSWORD= node --test` for a clean 164/160/0/4 run when .env sets a password.
- Phase 6 routes in index.js (~756-993) are indented one level; they register fine but
  the MEMORY.md nesting-tripwire regex counts them as "nested". Normalize indentation
  before trusting that check again. [DONE 2026-09-26 — see next section]

# ── 2026-09-26: AUDIT FIX LIST APPLIED (all 11 findings fixed + verified) ──
- All audit findings fixed in one pass, verified (a) by full suite `ADMIN_PASSWORD=
  node --test` = 164/160 pass/0 fail/4 skipped (baseline held) and (b) live smoke on a
  restarted audit instance: anon storefront 200 (feed/showcase/preview-image) with
  console APIs still 401, video-scripts 200 with real scripts, empty-body POSTs -> 400,
  pricing-end + sequences-export -> 404, 210-req anon burst no longer locks out login
  or /api/health, dark pre-paint CSP-clean (0 console errors), row thumbs 56x70 cover.
- What changed: (1) auth guard exempts /store + /products/:id/preview-image (regex, so
  only the preview-image route is public). (2) .rrow .rt img{100%/cover} in
  flightdeck.css. (3) video-scripts handler now requires conceptEngine inline.
  (4) theme pre-paint moved to external /js/theme-init.js (no inline script, no hash;
  color-scheme meta injected via DOM instead of document.write).
  (5) apiLimiter: skip /health+/auth paths, store+preview-image get a 600/15min anon
  bucket (they're public customer traffic now), and /api/auth/login has its own
  20/15min brute-force limiter with skipSuccessfulRequests — the burst->429->login
  lockout->everything-429 loop is closed. (6) social/generate + social/post-now +
  templates/generate + design/preference + etsy/cap + caps + social/schedule validate
  before SQLite binds (400 not 500). (7) "not found" errors mapped to 404 in pricing
  end + sequences export. (8) all 21 indented Phase 5/6 app.* declarations de-indented
  — tripwire `^\s+app\.` now counts 0.
- GOTCHA: getTheme(name) in themes.js falls back to THEMES[0] for unknown names (never
  falsy) — validate theme names with getAllThemes().some(t => t.name === x), not truthiness.
- REMINDER (re-confirmed this session): every edit needs a grep/read-back verification —
  and note /api/health/readiness 401s by DESIGN when auth is on (READYNESS_PUBLIC=true
  to expose); don't "fix" that one.
