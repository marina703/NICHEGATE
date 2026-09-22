# Goal: NicheGate — Autonomous Digital Product Factory

# Complete (2026-09-15 → 09-20):
- AI idea layer (OpenRouter), covers (Cloudflare FLUX), Design DNA (8 styles × 13 niches).
- 33 product types, 16 builders, security hardening.
- Command Center: 10 views, 32 endpoints, premium dark redesign.
- Social: 6 platforms, batch generation, scheduling.
- Ads: budget tracking, commit/cancel.
- Analytics: revenue by type/niche, conversion funnel.
- Calendar: monthly activity view.
- Smart Actions: context-aware suggestions.
- Newsletter: auto-generated weekly digest.
- Stripe: endpoints ready (needs STRIPE_SECRET_KEY).
- Etsy: daily cap min 10, direct push, passion niches.
- Config: MODEL_ENABLED=true, BIND_HOST=0.0.0.0, Etsy connected, Gumroad connected.

# ── 2026-09-20 PM: darker UI + MAJOR bug sweep ──
Done this session (all verified by curl against a freshly-booted server):
- Dashboard darker restyle: new :root palette (#04060a base), teal to blue to
  violet gradient, ambient radial glows, grid texture, depth/glow on panels,
  cards, KPIs, funnel, modals, toasts. All existing features kept intact.
  Audited: 0 undefined CSS vars (was ~14 undefined before).
- FIXED: 4 views (social/ads/calendar/analytics) were ORPHANED. Their render
  functions existed but there were no nav rail links, no render() branches, no
  crumb labels, and VIEWS only listed 6 entries. Now fully wired (10/10).
- FIXED server/index.js: the /api/health handler was never closed, so ~790
  lines containing 22 route registrations were NESTED inside it. They only
  registered when /api/health was hit, and a stray "a" fragment threw
  mid-handler, permanently killing every route after it. Result: 9 endpoints
  returned 404 forever. De-nested. Now 98 top-level routes, 0 nested.
- FIXED patch-script truncation fragments: stray "a" x2, "pp.post/get" x3
  (missing leading "a" of "app").
- FIXED SQL: prof_name queried directly from products (no such column). Added
  professions JOIN in revenue/summary, calendar, smart-actions, newsletter.
- FIXED SQL: trends.status (no such column) changed to activated = 1.
- FIXED renderCalendar assigning a month STRING to the cal variable.
- FIXED smart action calling nonexistent go('chat') / quickChat().
- FIXED copyNewsletter using wrong showToast() argument order.
- FIXED broken btoa() concatenation in the social preview button (also
  unicode-unsafe; schedulePost now decodes safely and prefers cached content).
- IMPLEMENTED conceptEngine.generateSocialPost - it was called by
  /api/social/generate and /api/social/post-now but never existed, so both
  returned 500. Never throws upstream; degrades to deterministic copy.
- Tests: node --test gives 77 tests, 18 suites, 73 pass, 0 fail, 4 skipped.
- Endpoint sweep: 19/19 GET returned 200, 4/4 POST returned 200.

# CORRECTION to the notes above: there is NO "Chat" view. That earlier claim
# was wrong. The real 10 views are: home, catalog, review, social, ads,
# calendar, analytics, automation, marketplace, trends. Passion niches live at
# /api/niches/passion and Home > Smart Actions, not in a chat view.

# Status: LOCAL IS FIXED AND VERIFIED. NOT COMMITTED, NOT DEPLOYED.
# Git: 3 files modified (client/index.html, server/index.js,
#      server/services/conceptEngine.js) + these MDs. Working tree otherwise
#      clean. Local main == origin/main (0 ahead / 0 behind).
# IMPORTANT: Railway is STILL running the broken build - those 9 endpoints are
#      404 in production right now. Needs commit + push + redeploy to fix.
#      AWAITING OWNER APPROVAL to commit/push/deploy (per handoff rule:
#      "do not push or deploy until the owner audits").

# Next:
# 1. Commit + push + redeploy Railway (this fixes 9 dead endpoints in prod).
# 2. Refresh OPENROUTER_API_KEY - it currently returns 401, so AI copy and
#    concepts fall back to deterministic templates instead of real AI output.
# 3. Confirm the darker theme matches the intended reference image (the image
#    was not viewable during implementation, so the palette was chosen as a
#    darker premium interpretation of the existing design).
# 4. Optional: Stripe key, email automation, Reddit/YouTube social.

# ── 2026-09-21 AM: PRODUCTION AI regression fix ──
- PRODUCTION was silently on template fallback. Root cause (regression): MODEL_ENABLED
  was only set in the LOCAL .env and never pushed to Railway, and the Railway
  OPENROUTER_API_KEY had a stray whitespace char (len 74, wellFormed:false).
  /api/model/status reported enabled:false, modelEnabledEnv:"(not set)".
- FIXED via Railway CLI (variable set ... --stdin, secret never on cmd line):
  pushed OPENROUTER_API_KEY = clean 73-char local key (all-hex, no whitespace) and
  MODEL_ENABLED=true. Auto-redeploy confirmed.
- VERIFIED: https://nichegate-production.up.railway.app/api/model/status now returns
  enabled:true, modelEnabledEnv:"true", keyShape.wellFormed:true, diagnosis "AI layer enabled".
  Direct OpenRouter auth test returned a real completion (no fallback).
- Lesson: local .env changes do NOT propagate to Railway. Push AI-layer vars with the
  railway CLI after any .env edit. Use set_prod_env.cjs (or railway variable set KEY --stdin).

# ── 2026-09-21 AM: SERP discovery pipeline (Chunk 1) ──
- Added durable `search_queue` table (server/database.js init) for throttled/retried SERP calls
  (status / attempts / next_run / result columns; exponential backoff on error).
- Extended trendRadar.js with two new discovery sources that feed the EXISTING scan→vet→activate flow:
  - fetchSerperAutocomplete() — Google autocomplete via Serper API. VERIFIED LIVE (20 real phrases).
  - fetchValueSERPShopping() — Google Shopping competitor-count validation via ValueSERP API.
  - Both rate-limited (~1.1s) and logged to search_queue; drainSearchQueue() retries errored jobs.
- Added endpoints: GET /api/discovery/search-queue, POST /api/discovery/serp-scan,
  POST /api/discovery/search-queue/drain (source-health observable via getSourceHealth).
- Verified locally: table created, Serper returns live autocomplete, queue populates with done rows.
- KNOWN: VALUE_SERP_API key in .env is INVALID (ValueSERP returns an HTML block page, not JSON).
  Code degrades gracefully (marks source unhealthy, inserts nothing) — replace the key to activate Layer 2.
- NEXT CHUNK: Layer 3 Etsy Open API saturation gate (etsySaturationScore) before activateTrend().

# ── 2026-09-21 (cont): Discovery stack swap + Etsy gate fix (Chunk 2) ──
- FIXED Chunk-2 bug: etsySaturationGate was missing `await` on the async
  fetchEtsySaturation call, so `s` was a Promise (truthy) and the gate returned
  pass:false on EVERY call - would have blocked the whole pipeline when the key
  was bad. Now async/await throughout (gateActivateTrend + autoActivateHotFads too).
  Verified: with an invalid key the gate returns {pass:true, unknown:true} (degrades,
  does NOT block).
- SWAPPED ValueSERP -> DataForSEO (Keyword Research API): fetchValueSERPShopping
  replaced by fetchDataForSEO (Basic auth, rate-limited, logged to search_queue).
  Kept Serper autocomplete as the PRIMARY discovery source (reliable from Railway IPs);
  Google Suggest noted as a free secondary to add later.
- ENRICHED Etsy saturation score: fetchEtsySaturation now reads avg favorites,
  avg price, listing age from results and nudges saturation up for established niches.
- ADDED Opportunity Engine: scoreOpportunity() + GET /api/discovery/opportunity.
- KNOWN (user-action): DataForSEO account returns 403 "verify your account" -
  must complete verification at app.dataforseo.com before live volume/intent data.
  Etsy shared secret (ETSY_SHARED_SECRET) still 403s (invalid/inactive) -> blocks
  Layer 3 until replaced with a valid, active key. Both degrade gracefully meanwhile.

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

# ── 2026-09-21 (cont): END-TO-END AUDIT + "FLIGHT DECK" CONSOLE REBUILD ──
Full report: AUDIT_REPORT.md (findings, resolutions, parity contract, verification record).

Audit headline: the core (file gate, graceful AI degradation, WAL SQLite, additive
migrations, redacted readiness) is sound. The real problems were exposure and wiring.
- CRITICAL: live Etsy credentials were committed in README.md (git history too).
  Scrubbed from the docs on the owner's call. NOT rotated -> still compromised.
- HIGH: 30 routes were registered ABOVE the auth/rate-limit middleware, so they
  bypassed both - including real publish (POST /api/etsy/push*) and spend
  (POST /api/ads/commit|budget|cancel). Guards hoisted above every route now
  (0 routes above the guard; /api/auth/* + /api/health* intentionally open).
- HIGH: express.static(client) was mounted BEFORE auth, so / and /setup were
  served unauthenticated. An ADMIN page gate now runs before the static mount.
- HIGH: dead/mis-wired controls - Analytics never loaded (loadAnalytics undefined),
  Auto-List PATCH 404'd, nav highlight broken (rv-auto vs rv-automation), Etsy cap
  widget orphaned, Home activity log never reloaded. All fixed in the rebuild.
- MEDIUM: injection surface (unescaped innerHTML into class attrs/markup), open CORS
  (now same-origin by default + CORS_ORIGINS allowlist), missing trust proxy,
  near-empty .gitignore (node_modules/.env/data/generated were NOT ignored).
- LOW: deleted 3 orphan modules (calculator/emailScripts/sopBuilder, 554 lines, zero
  refs), repaired encoding corruption, fixed '??' seeded profession emojis.

UI: the 1,010-line single-file dashboard was replaced by the "Flight Deck":
client/index.html (29-line shell) + css/flightdeck.css + js/{ui,api,views,console,rebuild}.js.
Native ES modules, NO bundler and NO build step, so Docker/Railway are unchanged.
- STRICT SUPERSET of the old UI: all 10 old views preserved and fixed, + Discovery and
  System (12 total), both old modals (preview -> drawer, HTML editor -> sanitised),
  all 6 Quick Actions and the review toolbar.
- NEW: aggregated GET /api/console/overview, GET /api/console/actions, POST /api/console/run,
  GET /api/console/runs, GET /api/console/stream (SSE), a CLOSED-ALLOWLIST action
  registry (server/services/actionRegistry.js) and durable run history in the additive
  action_runs + action_run_steps tables (no new job queue).
- NEW UI: Cmd/Ctrl-K command palette, live run stream with per-step timelines, review
  triage keys (J/K move, A approve, R reject, Enter open), Catalog "Needs review" filter.
- Hardened the visual editor: sanitised on load AND save (<script>, on* handlers and
  javascript: URLs stripped); colour + font edits round-trip byte-identically otherwise.
- SINGLE SOURCE OF TRUTH for the review queue (ui.js isReviewable/reviewQueue/reviewPage),
  shared by the rail badge, Home KPI/funnel, the Catalog filter and the Review table -
  they used to disagree (badge 0 while the queue held 12 drafts).

Verified: npm test 77 tests / 73 pass / 0 fail / 4 skipped (baseline was 72 pass + 1
environmental fail; test/concept.test.js is now hermetic). Auth gate, endpoint sweep
(zero 5xx), all 12 views in a real browser (0 console errors), SSE, an action run
end-to-end (backup-database) and keyboard triage (DB-verified) all pass.

NEXT (recommended, in order): rotate the Etsy keys; purge them from git history if the
repo is ever shared; enable a CSP now that inline onclick is gone; harden
client/setup.html + client/store.html, which still use inline handlers.

# ── 2026-09-22: PASS 2 hardening + BI panels + revenue roadmap ──
Everything above in NEXT is now DONE (except key rotation, owner's call):
- CSP enabled (script-src 'self'; fonts/gstatic allowlisted; form-action allows
  etsy.com for OAuth POST). setup/store/login scripts extracted to
  client/js/{setup,store,login}.js — zero inline handlers remain anywhere; store
  URLs scheme-validated; favicon added to all four pages.
- /api/health/readiness auth-gated (READYNESS_PUBLIC=true escape hatch); rate
  limiter is session-aware (1200 authed / 200 anon — the console batches 4-6
  calls per view and was 429-ing mid-session); /covers static mounted (store logo
  was 404); 19 placeholder seed emojis fixed at the source; engine status is
  truthful (auto_generate=false now reports "Halted", not "Running").
- AUDIT_REPORT.md gained the Pass 2 section (findings + verification record +
  the HF Spaces competitive scan).
- NEW Phase C: server/services/bi.js + GET /api/console/bi — Shop Health /100
  (transparent breakdown), 7d-vs-prior deltas, 14d revenue series, listing health
  (velocity badges, zero-view, SEO-weakness from seoEngine), and an
  Opportunity/Risk/Action insights triad wired to one-click actions. Home shows
  Health KPI + Insights panel; Analytics shows real-revenue sparkline + health
  tables. Real tables only — empty DB reports zeros truthfully (AGENTS.md rule).
- Phase D: UPGRADES.md rewritten as a 3-wave revenue roadmap (Waves 1-3,
  15 plays, every item mapped to existing machinery).
Verified: npm test 77/73 pass/0 fail, BI endpoint 401 unauth → 200 authed,
browser pass over all 12 views + setup/store/login with 0 console errors and
0 CSP violations, ⌘K action run persisted a backup file.

NEXT: rotate the Etsy keys (only remaining Pass-1 item); drain the publish
queue per UPGRADES.md Wave 1; finish Etsy identity verification + OAuth.
