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

# ── 2026-09-22: CONSOLIDATED 7-PHASE ROADMAP (audit items + trend engine + distribution + growth) ──
# Sources: top-10 tools deep dive + owner picks (Tailwind / Kit / Foreplay) + end-to-end audit thread (96681957).
# Baseline: main @ 526bca44; worktree fast-forwarded; npm test 83 tests / 80 pass / 0 fail / 3 model-skips. CLEAN.
# Convention: [x] done · [ ] open. Do NOT redo [x] items. Phases are independently shippable; Phase 1 is the keystone.

## PHASE 0 — Audit remediation & safety (outstanding items from the end-to-end audit)
- [ ] OWNER ACTION: rotate BOTH leaked Etsy keys (audit CRITICAL — still valid in git history; rotation happens in the Etsy developer console, not in code)
- [ ] OWNER DECISION: purge leaked keys from git history (git filter-repo rewrites SHAs — needs explicit approval; repo is private but on GitHub)
- [x] One-click ROLLBACK for auto-deployed listing optimizations: restore previous title/tags/description locally AND on the live listing (uses products.listing_json + the new Etsy PATCH / Gumroad update APIs from 526bca4) — DONE 2026-09-22: products.previous_listing_json column, optimizer.rollback() with undo/redo toggle semantics, POST /api/products/:id/optimization/rollback, drawer "Rollback copy" button, 2 regression tests. OWNER ACTION items above remain open by owner's call (key rotation skipped per owner).
- [x] (already landed in 526bca4) BI 500 root cause (professions.type), safeJsonArray hardening, error logging, railway.json healthcheck repoint, caps 10/20, Make-This + origin deploy rule

## PHASE 1 — Real growth data (trend-engine foundation · highest leverage)
- [x] Add trend_snapshots table (trend_key, week, volume, score, source) + snapshot every trend on each discovery sweep — DONE: UNIQUE(trend_key,week) upsert; trends gained trend_key/first_seen_at/measured_velocity/last_volume/last_cpc (additive ALTERs + detected_at backfill)
- [x] Integrate DataForSEO Google Trends Explore (keywords_data/google_trends/explore/live) for real interest-over-time series — DONE: fetchDataForSEOTrendsExplore() batched (5 kw/task), throttled via dfThrottle, health-tracked as 'dataforseo-trends'; carry-forward fallback to last_volume
- [x] Replace synthetic velocity (max(90, 320 - rank*20) in trendRadar.insertLiveTrend) with real week-over-week deltas from snapshots — DONE: refreshTrendMeasurements() runs inside scanLiveTrends; growthFromSnapshots() computes WoW% + acceleration from the trend's own 12-week history
- [x] Derive phase (emerging/rising/hot/peaking/cooling) from curve slope + acceleration — DONE: phaseFromGrowth(); measured values rewrite phase/velocity/est_revenue per sweep
- [x] Tie est_revenue to real data (DataForSEO volume × CPC proxy) instead of fabricated traffic tiers — DONE: estRevenueFromDemand() (log-scaled demand × CPC multiplier, $low-high band compatible with velocityEngine.parseRevenue); insertLiveTrend uses it when validation.volume exists
- [x] Tests — test/trend-growth.test.js (6 hermetic tests: weekKey ISO math, snapshot upsert idempotency, growth/acceleration, phase boundaries, revenue bands, refresh flow incl. carry-forward)

## PHASE 2 — Open-ended discovery
- [x] Recursive autocomplete expansion (Serper + Etsy: seed → suggestions → new seeds), throttled + deduped — DONE: discoverTerms() BFS with breadth/depth caps, isDiscoverableTerm filter (REJECT_RE), Serper+Etsy via expandTerm (stub-able through module.exports for tests); POST /api/discovery/expand + 'Expand Term Discovery' action in the registry
- [x] first_seen_at tracking for discovered terms + weekly re-snapshotting of the whole term pool — DONE: trends.first_seen_at (backfilled from detected_at), every new term gets a first-seen snapshot row (source='discovery:*'), refreshTrendMeasurements() re-snapshots the pool on every sweep (2h); discovered terms are NOT auto-inserted as trends — vetting stays the gate

## PHASE 3 — Intelligence layer
- [x] Z-score breakout detection against each term's own snapshot history — DONE: breakoutScore() (latest week ≥2σ over its own prior 12wk; std=0 → flat-then-jump vs flat-forever), GET /api/trends/:id/intelligence
- [x] 12-week forecast via exponential fit + growth percentile within cohort — DONE: forecastTrend() (least-squares on ln(volume+1), weeklyGrowthPct + 12 projections) + cohortGrowthPercentile() vs every tracked term, same endpoint
- [x] Feed measured signals into vettingEngine (longevity/seasonality/competition become measured, not assumed) — DONE: measuredSignals() overrides demand (from real WoW), longevity (observed weeks), seasonality (single-month concentration); vetTrend result exposes measured{demand,longevity,seasonality,breakoutZ}; heuristics remain the fallback

## PHASE 4 — Sources & tests
- [x] Replace Pinterest/TikTok Google-News-RSS proxies with Pinterest Trends + TikTok Creative Center + YouTube RSS sources — DONE: fetchPinterestTrends (real trends resource endpoint, browser headers), fetchTikTokTrends (Creative Radar keyword edge; auth-gated from datacenter IPs → degrades with honest health note), fetchYouTubeTrends (genuinely public RSS, NEW source); old news-RSS proxies deleted; scanLiveTrends pulls all three; health keys renamed pinterest-trends / tiktok-creative-center / youtube-rss. No invented signal — bot-gated sources return [] with health evidence (established repo pattern). Boot-verified on :5093.
- [x] Tests — test/trend-growth.test.js + test/trend-intelligence.test.js cover snapshot math, WoW deltas, phase boundaries, revenue bands, discovery recursion, breakout/forecast/cohort + measured vetting; full suite 97 tests / 94 pass / 0 fail / 3 model-skips

## PHASE 5 — Distribution layer (owner picks: Tailwind → Pin Engine · Kit → Sequences · Foreplay → Swipe File)
- [x] PIN ENGINE: pins table + durable schedule queue with engagement-weighted optimal time slots — DONE: server/services/pinEngine.js (19-slot weekly UTC grid, load-balanced nextSlot, createPinSync bulk twin); automationCycle gains taskPinDrain (due pins → posted each cycle)
- [x] PIN ENGINE: Ghostwriter-style AI pin descriptions via modelRouter (deterministic fallback) for existing products/covers — DONE: aiPinCopy() through conceptEngine.generateSocialPost; fallbackPinCopy always available (MODEL_ENABLED=false whole)
- [x] PIN ENGINE: Pinterest keyword research (free Trends tool + autocomplete) feeding seoEngine and pin copy — DONE: pinterestKeywords() via guided-search resource edge, stored on each pin; degrades to [] when bot-gated
- [x] PIN ENGINE: pin→sale attribution via UTM-tagged links + existing Gumroad sync — DONE: attributedUrl/utmFor (utm_source=pinterest, campaign=pin-<id>, content=board); honest attributionReport (click-side attribution needs the CF worker — recorded as stretch)
- [x] SEQUENCES: AI-generated per-niche launch sequences (welcome/launch/follow-up) upgraded from the newsletter preview — DONE: server/services/sequenceEngine.js (STRUCTURES + deterministicEmails + aiEmail via conceptEngine; regenerate-or-create per (prof/trend, purpose))
- [x] SEQUENCES: niche-interest tags/segments + ESP integration via Kit V4 or MailerLite API (RULE: never send email from NicheGate directly) — DONE: exportSequence() hands off to esp_webhook_url (settings/env) and returns emails for manual copy when no webhook; NicheGate NEVER sends
- [x] SWIPE FILE: Meta Ad Library + TikTok Creative Center fetchers with first_seen/last_seen longevity tracking — DONE: server/services/swipeFileEngine.js (fetchMetaAds/fetchTikTokAds → upsertAds UNIQUE(platform,ad_id), times_seen++, longevityDays); auth-gates degrade honestly
- [x] SWIPE FILE: AI angle/hook tagging of saved ads + hook-variant generation for real catalog products in the Ads view — DONE: classifyAngle (6 deterministic angle rules), longRunners(minDays) ranking, generateHooks(productId) seeds AI on proven angles with deterministic fallback
- Routes: /api/pins (create · schedule-batch · list · drain) · /api/sequences (generate · list · get · export) · /api/swipe (sweep · long-runners · hooks/:productId)
- Tests: test/distribution.test.js (6 hermetic) — full suite 103 tests / 100 pass / 0 fail / 3 model-skips; endpoints boot-verified on :5094

## PHASE 6 — Growth features (owner-approved top 5, in order) — ✅ COMPLETE (2026-09-22, 116 tests / 113 pass / 0 fail)
- [x] 1. ETSY OAUTH: PKCE flow + token exchange + auto-refresh verified end-to-end. **Real bug fixed:** refreshEtsyToken now persists the ROTATED refresh_token (Etsy rotates on every refresh — the old code silently dropped it, killing OAuth permanently after the second refresh). Test: `refreshEtsyToken persists rotated refresh_token`. Owner-side prerequisite for live listing remains: Etsy identity verification.
- [x] 2. GAP SCORING: `incumbentQuality` in vettingEngine — weakness score 0-100 from avgFavorites (50%), avgAgeDays (30%), avgPrice (20%); weak incumbents OVERRIDE phase-based competition as a positive signal. Sync cache-fed pattern (background fetch warms, next vet cycle measures) + `seedGap` test seam. Route: GET /api/vetting/gap?name=…
- [x] 3. SELF-IMPROVING VETTING: new `vettingLearner.js` — logistic regression on the 5 numeric signals (demand/competition/margin/seasonality/longevity) from real activation→sale outcomes (metrics.product_id from the Gumroad sync); L2 + renormalize to sum 1; specificity/shoppingIntent keep fixed 20% heuristic share; factory weights until ≥20 examples with both classes (422 with reason otherwise). vetTrend uses learned weights when present (`learnedWeights: true` in result). Routes: GET /api/vetting/weights · POST /api/vetting/refit · POST /api/vetting/weights/reset
- [x] 4. PRICING ENGINE: new `pricingEngine.js` — charm pricing ($X.99, floor $3.99), launch rule (first 14 days −30% floored, GET /api/pricing/launch/:id), A/B tiers low/base/high (−15%/base/+25%) with round-robin assignment persisted in settings (POST /api/pricing/tests/start · GET /api/pricing/tests · POST /api/pricing/tests/:id/end), applyPrice deploys via existing updateListingCopy path (POST /api/pricing/apply). Elasticity summary uses REAL sales (units/day, revenue/day); winner declared only with ≥5 sales AND ≥2× units/day lead — honest small-sample behavior.
- [x] 5. VIDEO HOOK SCRIPTS: `generateVideoScripts` in conceptEngine (AI + deterministic fallback per repo rules) — 3× 15-30s TikTok/Reels scripts in template-as-b-roll format (problem-agitation / proof-of-speed / list-value) with hook, b-roll beats, caption, hashtags. Route: POST /api/products/:id/video-scripts
### Phase 6 stretch (recorded so nothing is lost — build after the top 5)
- [ ] Ad attribution ledger + kill rules (needs Pin Engine UTMs first)
- [ ] Programmatic SEO keyword landing pages (after catalog deepens via Phases 1–2)
- [ ] Interactive/hosted web-tool products (biggest lift, biggest differentiation)
- [ ] Sibling-seller emails (blocked on SEQUENCES — trivial once Phase 5 lands)
- [ ] Complaint mining → conceptEngine briefs
- [ ] Catalog diversity guard (per-niche type quotas + forced format rotation)

# Roadmap status: PLAN/DOCS ONLY this session — no code changed. Baseline verified green on 526bca44.
# NEXT: owner go-signal → Phase 0 rollback (small, code-only) and/or Phase 1 (trend_snapshots + DataForSEO Explore + real velocity).

# ── 2026-09-22: PASS 3 — CAPS, MAKE-THIS, LISTING OPTIMIZER ──
Full details: AUDIT_REPORT.md "Pass 3".
- ROOT-CAUSED the prod /api/console/bi 500: bi.js selected a nonexistent
  professions.type column (only fires with listed products — prod has them,
  dev didn't). Fixed + legacy-field JSON hardening + error logging. Regression
  test added (test/optimizer.test.js).
- Caps: Gumroad 10 (settings-backed) / Etsy 20 default; GET/POST /api/caps;
  Automation caps panel.
- Make-This (origin='manual') + shared custom-generate modal with a
  details/prompts field threaded into generation (products.brief → AI prompt).
  Fixed the fully-broken Trends Generate button (nonexistent createDraft).
- Listing optimizer: bulk weak-listing rewrite + origin deploy rule (manual =
  local only, engine+listed = auto-deploy via new Etsy/Gumroad update APIs);
  auto_list now skips manual products.
- Vet modal: JSON dump → gauge + signal bars. Trends view staleness fixed.
- railway.json healthcheck → /api/health (kills the ADMIN_PASSWORD deploy trap).
Verified: 83 tests 79 pass 0 fail; browser pass 0 console errors / 0 CSP
violations; brief visibly steers AI concepts; artifacts cleaned.
NEXT: rotate Etsy keys; UPGRADES.md Wave 1 on live store.

## AUDIT 2026-09-23 — PDF previews end-to-end (user report: not working)
- [x] ROOT CAUSE FIXED: global CSP `frame-ancestors 'none'` blocked the console's own preview iframe (responses were 200 but browsers refuse to render them in-frame; frame-ancestors outranks X-Frame-Options). `/api/products/:id/preview` now rewrites just that directive to `'self'`; all other routes keep `'none'`. Verified with header checks (fixed route vs control route) + full suite (116/113/0/3).
- [x] Pipeline verified end-to-end: local boot → preview 200 application/pdf; production (Railway) → on-demand PDF regen 0.2–0.4s, Chrome thumbnails render, xlsx HTML preview OK, exports distinct per product. No Chrome/puppeteer defect.
- [ ] OWNER DECISION: `generated/` + `previews/` are ephemeral on Railway (outside the `/app/data` volume). Previews self-heal via regen; the gap is files already published to marketplaces whose local source is wiped. Pick: (a) env override relocating OUTPUT_DIR/PREVIEW_DIR under `/app/data`, or (b) volume mounted at `/app`.

## UX REDESIGN 2026-09-23 — light-first theme + command chat (owner-requested)
- [x] LIGHT-FIRST THEME: flightdeck.css fully tokenized — light palette on :root, the original dark cockpit preserved under [data-theme="dark"]. Toggle chip in the topbar; preference persisted (localStorage `ng_theme`); pre-paint script in index.html prevents flash-of-wrong-theme. All views/components read tokens only (verified: no hardcoded colors in views.js/console.js).
- [x] COMMAND CHAT BAR: always-visible docked prompt bar (bottom center) routing plain-language intents to the EXISTING pipeline — `make <thing>` → generate-custom → Review queue; `what's trending?` → live trends; `run a discovery sweep` / `full cycle` / `sync sales` / `approve` / `dedupe` → action registry; `show sales` → BI summary + Analytics view; view navigation; `help`; fallback treats any line as a product idea. Transcript persisted (localStorage `ng_cmdlog`, last 30). No new server code — rides action registry + existing APIs.
- [x] Verified in browser: both themes render correctly; `show sales` returned real 7d revenue + navigated to Analytics. Suite 116/113/0/3. Test residue cleaned (99 auto-generated drafts removed from dev DB).
- Stale-product purge endpoint (2026-09-23): POST /api/products/purge?hours=N deletes draft/rejected products older than N hours (default 48) that have no marketplace_id — live listings and approved work are structurally protected. Removes product files, cleans child rows in any table with a product_id column, logs to automation_log. Verified end-to-end locally (victims deleted, files unlinked, live-listing metrics preserved).

## BRIEFING UX + AI WORKER 2026-09-23 — bug fixes + in-app agent (owner-requested)
- [x] BUG FIXES: command-router unreachable branches (help/nav/fallback sat after a `return`) rewired in the right order; dead vars removed (renderNav `workItem`, home `fillInWork`); no-op ternary in the home trend card fixed; `refreshAfterMutation` now reloads view data so BI/Shop Health are never stale after approve/reject; J/K/A/R triage keys now work on Home's work-now card (shared `triageItems()` cursor with Review).
- [x] SHARED PRIORITY BRAIN: `pickPriority(state)` in views.js orders review queue → trend windows → weak/zero-view listings → growth moves. Home's work cards AND the command bar's "what should I do?" answer come from it. "Still empty" dead-end card is gone — the ladder falls through to weak listings and growth moves instead.
- [x] BRIEFING TRIAD: BI insights (opportunities/risks/actions) finally rendered on Home as "Operator briefing" (what's working / needs attention / highest-leverage move with one-click run).
- [x] SINCE-LAST-VISIT strip: real diffs (new drafts, revenue+sales from bi.series, trend activations) against localStorage `ng_lastseen`; marked seen 30s after landing / on leaving Home.
- [x] TREND WINDOW URGENCY: windows are time-boxed (detected_at + window days) — Home + Trends show "closes in Nd" / "window closed"; cap burn-down ("Etsy quota N left today") in the work card.
- [x] AI WORKER: POST /api/console/agent (server/services/agentWorker.js) — JSON tool-call loop over the same action spine: run_action (registry), snapshot, list_products/list_trends, set_status, generate, generate_for_trend, publish, push_etsy, activate_trend, optimize, optimize_weak, delete_product, nav, say. Destructive tools (delete_product, reject-trash) require a confirm round-trip (client stores needsConfirm, replies "confirm"). Degrades to a deterministic planner with MODEL_ENABLED=false; if the model replies in prose for a deterministic intent, the plan executes anyway. /api/console/assistant kept (no features removed).
- [x] Command bar = worker front-end: tool calls render as monospace "worker" step lines; operational requests route to the agent (nav/help/questions stay local + instant). Suggestion chips + placeholder updated.
- [x] Nav: Briefing pinned above the job groups (landing page no longer sits at the bottom of Work).
- [x] Tests: test/agent.test.js (16 tests: parseToolCall, planDeterministic, danger gate, confirm round-trip, prompt). Suite 132/128 pass/0 fail/4 model-skips. Live smoke on :5000: gated delete refused w/o confirm + honest error; worker ran backup-database (runId recorded) and generated+summarized product #1103 (cleaned up after).
- Note: copied dev .env has `PORT=5000  ` but the shell env forces PORT=0 — boot with `PORT=5000 BIND_HOST=127.0.0.1` explicitly (or fix PORT in the environment).

## SURROGATE WORKER: BATCH, SPARKS, DISCORD, MEMORY (2026-09-23)
- [x] PERSISTENT MEMORY: server/services/workerMemory.js (worker_memory kv store, key 'smoke' cleaned after smoke) + remember/recall/forget tools in the agent + /api/worker/memory CRUD + Memory panel settings view with delete.
- [x] BOSS CHANNEL (Discord): notifier.sendDiscord + server/services/bossInbox.js decision inbox. ask_boss tool + action 'ask-boss' → POST /api/worker/ask (sends Discord "Hey boss…" embed when DISCORD_WEBHOOK_URL set) → Brainstorm tab shows ☐/☑ decision chips that answer into worker history. Status-pulse route pings Discord with shop KPIs.
- [x] PROACTIVE STEWARD (surrogate): server/services/steward.js — think() proposes ideas from real state (zero-view listings, weak SEO, open trend windows, review queue, publish backlog), records 'idea:<n>' memories, and Discord-pings the boss with buttons. Hourly cron + 'steward-pass' run_action + manual Brainstorm button. Also fixes the un-awaited autoActivateHotFads ([object Promise] log).
- [x] MULTI-SELECT EVERY VIEW: products (Home/Catalog/Review), trends (Home/Trends), posts (Social), ads (Ads), niches (Discovery) — shared selBar with Select all / Clear / per-kind batch ops / 💡 Ask AI. Selection is global; batch acts per kind. Catalog's partial bar unified into selBar.
- [x] BATCH COVERS: covers/generate accepts {ids:[...]} (validated, missing skipped) + 'batch-covers' action + "✨ Covers (n)" button on every product surface.
- [x] AI SPARK per row: 💡 button on products/trends/posts/ads/niches sets a ⌘K context chip (ref = product:N | trend:'x' | post:ID | ad:ID | niche:'x'); agent endpoint composes real context for product/trend refs so "this one" resolves instantly (verified: price answered without an ID).
- [x] FIX: selBar counts are per-kind (misc set is shared across post/ad/niche — the bar used to count other kinds' rows) and Clear is kind-scoped. Verified end-to-end in preview: cross-kind counts 0/1 correctly, clear on Social keeps the niche selection.
- [x] Tests: test/worker-store.test.js (18 tests: workerMemory store, bossInbox lifecycle, steward planner). Suite 150/146 pass/0 fail/4 model-skips. Live smoke: remember/recall/delete OK, batch-covers validates ids, ask_boss delivered to real Discord webhook ("discord": true), steward pass logged ideas + pinged.

## PRODUCTION RISK REMEDIATION — four Railway failure modes (2026-09-24)
- [x] REQUIRED ADMIN AUTH: production startup/database initialization reject a missing or <16-character `ADMIN_PASSWORD`; local dev behavior stays optional.
- [x] SURROGATE DELIVERY: production requires a syntactically valid HTTPS Discord webhook. Notifications now return explicit delivery success/failure without logging webhook URLs/tokens. Agent/steward questions are only pending after Discord accepts; missing/failed delivery leaves no silent pending ask. Test-ping reports 502 on failure.
- [x] DURABLE DATA: Railway SQLite resolves into `RAILWAY_VOLUME_MOUNT_PATH`; generated artifacts, previews, uploads, cover-art cache and database backups all resolve under that same volume. Startup rejects a missing/non-writable mount and `DB_PATH` escapes. Previously stored file paths that point to lost ephemeral files regenerate on demand; marketplace-hosted copies remain marketplace-owned.
- [x] PUBLISH SAFETY: production scheduler does not auto-start by default; cycle publishing requires BOTH `AUTO_START_ENABLED=true` and `AUTO_PUBLISH_ENABLED=true`, as well as `auto_list=true`. Direct operator publish remains manual/authenticated (no unattended boot publish).
- [x] Tests: added production config, Discord delivery redaction/failure, and no-silent-surrogate-ask coverage; focused suite 32/32 passes; full suite `npm test`: 164 tests, 160 pass, 0 fail, 4 skipped. JS syntax checks pass.
- [x] RAILWAY TARGET CHECK: linked CLI target is the NICHEGATE production service; Railway reports the `nichegate-volume` mounted at `/app/data` (61 MB used). `DISCORD_WEBHOOK_URL` is present and has valid HTTPS Discord webhook format. No secret values were displayed.
- [ ] OWNER/RAILWAY DASHBOARD: the existing `ADMIN_PASSWORD` is configured but fails the new 16-character minimum. Owner must replace it with a strong password before deployment; back up/inspect the existing persisted DB and assets before rollout. Do not change or reveal credentials from this worktree.
- [ ] DEPLOY STATE: reviewed changes are committed locally; not pushed or deployed because production would fail startup with the currently configured admin password. Deploy after the owner updates the password and the existing data backup is confirmed.
- NOTE: production automation/publishing opt-ins remain disabled; do not enable them until live inventory and limits are reviewed.
