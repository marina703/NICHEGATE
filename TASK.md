# Goal: NicheGate — Autonomous Digital Product Factory

## ── 2026-10-15: STORE WIPE + EDITORIAL COVER REBUILD (owner-directed fresh start) ──
Owner feedback: covers were one template with color swaps ("copy-paste"), wrong
headlines on some ("Pricing Calculator" on Massage Therapy), labels not showing,
and the store needed a full wipe + fresh start. Reference style: the owner's
`correct covers/examples/` (minimal editorial, one specific hero object).
- VERIFIED FIRST (live): 77 products, 61 unpublished, 0 sales, all with covers;
  vision-checked 8 covers — every one was the identical template (logo top-left,
  niche pill top-right, same 3 bullets, "$12 Instant download" bar). The
  storefront landing shows only 20/77 with images (Gumroad 25-image page cap);
  local dev DB had ZERO preview_path values → review gate showed no thumbnails.
- WIPED: all 77 deleted via DELETE /v2/products/:id (0 failures, verified 0
  remaining). Full inventory backed up to
  data/backups/gumroad-inventory-2026-10-15-full-77.json BEFORE the wipe.
- NEW PIPELINE (all local, uncommitted): the product page IS the hero.
  - `coverDirector.js` (NEW): per-listing art direction via the ideation model
    (strict JSON: field tone from the product palette, heroCrop top/upper/full,
    title/kicker/tagline/benefits); deterministic fallback when MODEL_ENABLED
    is off; NEVER throws. Enforces the contrast rule: white sheet always sits
    on a deep tonal field (fixes white-on-cream).
  - `coverTemplate.js` (rewritten): editorial layout — kicker + accent rule,
    serif italic tagline, condensed display title (Arial Narrow Bold stack),
    two-line title, price block with INSTANT DOWNLOAD sub. `renderProductPage`
    renders the REAL preview page (buildPreviewHTML) to PNG with crop depth;
    page floats as a shadowed white sheet on the field. Bundles keep the AI
    hero object full-bleed (owner-approved look for toolkits).
  - `heroArt.js`: added recovery templates (labels/journal/nutrition/
    flashcards), niche grounding in prompts, withRetry backoff for 402/429,
    Pollinations fallback, and a 1.5% dimension tolerance (the worker returns
    1200x1792 for a 1200x1800 request — rejecting it burned retries + the
    slow free tier on EVERY generation).
  - `fileFactory.js` hero-cover branch now runs the director (production path).
- BUILT (tmp/build-curated.js, state tmp/curated-build-state.json): 18 recovery
  vertical deliverables + 6 toolkits (bundleEngine) + 6 business tools,
  30/30 covers, 0 failures. Owner vision-approved: journal/labels/HVAC/
  toolkit/faith-based/roofing all distinct palettes + real product content.
- REPUBLISHED wave 1: 10 live listings (Refuge + SMART + Secular verticals,
  10/10 published, files attached 32pp verified, covers 10/10 after one
  cover-attach retry). Gumroad daily create cap is HARD at 10/day (counts
  attempts). REMAINING for tomorrow (~20): AA + Faith-Based verticals,
  6 toolkits, 6 business tools — re-run `node tmp/republish.js 10` (skips
  anything with marketplace_id; the 12 stale marketplace_ids from the wiped
  store must be cleared first — they point at deleted products).
- TODO: rebuild storefront landing (gumroad-page/build.js) after the full set
  is republished; clear stale marketplace_id rows for the 12 skipped products
  before the next wave.

## ── 2026-10-14: GUMROAD STOREFRONT CLEANUP (cull + critique + fix) ──
Owner ask: "check the gumroad listings that are live and cull, critique and fix
any listings that are not 10/10 top tier quality."
- INVENTORY: the v2 API paginates by CURSOR (response carries next_page_key /
  next_page_url — the `page` param is IGNORED, which is why a naive sweep sees
  only the first 10). Full inventory: 119 products on nichegate.gumroad.com;
  the public storefront collections show 83 of them; unpublished products are
  STILL URL-accessible (200), so all 119 are customer-reachable.
- CRITIQUE (83 storefront items): only 11 fully clean. 49 doubled names (the
  prof-name prefix bug — "AA / 12-Step Recovery AA / 12-Step Recovery Invoice
  Template"), 22 items with duplicate copies (up to 5x the Freelance invoice),
  25 missing covers, 119/119 missing tags, 0 sales across everything.
- CULLED: 28 duplicate copies deleted (keep-best per de-doubled-name group:
  published > cover > file > clean name > newest; published products are never
  culled). 119 → 91 products. 0 failures.
- FIXED: 91/91 keepers PUT with clean names (47 renamed — all doubling gone)
  + niche SEO tags (0 → 91 tagged). Gumroad API notes: repeated `tags[]=` is
  required (indexed `tags[0]=` is rejected); tags must be ≤20 chars.
- COVERS: 25 no-cover products backfilled via the standard pipeline (niche →
  profession mapping, local row upsert keyed by marketplace_id, composite
  cover render in waves of 3, attachGumroadCover) — DONE, 25/25 attached in
  4.5 min.
- STOREFRONT PUSH — DONE. The storefront is a STATIC custom landing page
  (September build: 83 products, 3 doubled names) that never auto-updates
  from product changes — that's why the cleanup was invisible on
  nichegate.gumroad.com. Rebuilt from the 91-product catalog and pushed via
  PUT /v2/user/custom_html (needs a token with edit_profile scope; the old
  .env token carried view_profile only → 401). Verified live: 91 products
  displayed, 0 doubled names. build.js now includes all non-deleted products
  (the public API cannot flip the published flag on existing products).
- FINAL STATE (API-verified): 91 products · 91/91 covers · 91/91 tags ·
  91/91 files · 0 doubled names · 0 duplicates · 13 published. Storefront
  displays all 91. Every listing now carries a clean name, cover, file and
  SEO tags (was 11/83 clean).
  The 15 newly-created local rows also close the inventory-tracking gap for
  the backfilled products (dev DB previously knew only 10 of the 91).
- Harness: tmp/storefront-cleanup.js (plan|cull|fix) + tmp/cover-backfill.js.
  State: cache/scratch/storefront-cleanup-state.json.

## ── 2026-10-14: WORKER ANTI-PUNT + COVER REBUILD TIMEOUT FIXES ──
Owner feedback (same session as the E2E finish pass): "the ai just reverts
back to 'ive asked boss what to do'" and "cover regeneration failed inside
nichegate command center".
- ANTI-PUNT (agentWorker.js): the worker is now named the DEFAULT
  DECISION-MAKER in the system prompt; ask_boss is LAST RESORT (real money,
  irreversible action, explicit "ask me", or info only the boss has) — never
  for ideas or answerable questions. ask_boss tool desc carries the same
  criteria. Structural guard: a FIRST-action ask_boss without an explicit
  boss request is REJECTED and the model is redirected to decide (consult
  snapshot/list/brainstorm, recommend, or execute). Deterministic planner no
  longer routes "what do you think" to ask_boss. Committed bd083ee.
- COVER REBUILD TIMEOUT: generatePreviewBatch rendered covers SEQUENTIALLY
  (~100s each), so the console's 5-cover batch needed 500s+ and every
  client/proxy timed out → "Rebuild Stopped". Renders are a network art
  fetch + one Puppeteer page on the shared browser → now bounded waves of 4.
  Verified live: 5-cover batch in 194s, 5/5 generated (was 500s+ and dead).
  rebuild-covers action default limit 10 → 3. Test pins overlap (2-4),
  failure reporting and cursor semantics unchanged. Committed bd083ee.
- GUMROAD INVENTORY CHECK (owner: "60 or more live listings"): the v2 API
  with the .env token returns EXACTLY 10 products for nichegate.gumroad.com;
  the `page` parameter is IGNORED (pages 1-100 all returned the identical 10
  IDs — verified distinct-id count). marinablow.gumroad.com is dead (404).
  The "60" matches the command-center CATALOG count (dev DB: 50 drafts + 10
  listed), not live Gumroad listings. Open question for the owner: where the
  60+ number came from (dashboard drafts? another account?).

## ── 2026-10-14: E2E FINISH PASS — verification, fixes, autonomy wiring ──
Owner ask: "finish the project with a minimum of 8/10 quality across the board, e2e, front to back."
- BASELINE: full `node --test` was NOT green on arrival — 1 real failure
  (test/design-critic.test.js "cover critic … reuses only matching hash"): the
  uncommitted COVER_VERSION bump v8→v9 in fileFactory.js was never propagated
  to the test fixtures (v8 paths fail isCurrentCoverPath → cache miss). Fixed
  by updating all four fixture names; design-critic 20/20, full suite green.
- E2E LIVE (throwaway port 5099, scratch DB copy of data/profession-box.db —
  dev DB untouched, 60 products / 10 listed): login 200; GET sweep of all 77
  registered routes → 66×200, and every non-200 is CORRECT behavior (missing
  query params → 400, fake IDs → 404). auth gate holds (anon 401 everywhere
  except /login, /api/auth/*, /api/health*). Console action pipeline verified
  end-to-end (backup-database runId 6, real backup file, run history).
- E2E BROWSER (dogfood pass): all 12 views render with real data and ZERO
  console errors / CSP violations; product drawer + preview iframe verified
  (HTTP 200, real product copy — the frame-ancestors 'self' fix works);
  theme toggle, ⌘K palette, triage all functional.
- FIXES APPLIED (all with the suite green after):
  1. `streamFile(res, path)` helper in server/index.js — all 7
     createReadStream().pipe(res) sites now fail loudly on read errors
     instead of silently returning a 200 with an empty body (pipe does not
     forward 'error').
  2. GET /api/marketplace/etsy/callback without a code → 400 (was 500 after
     the failed token exchange).
  3. design-critic test fixtures cover-v8 → cover-v9 (see BASELINE).
- AUTONOMY WIRING (closes the 2026-10-14 audit gaps):
  1. QUALITY GATE: automationCycle.taskQualityGate audits draft/pending-review
     products with qualityEngine each cycle and auto-approves FLIGHT_READY
     (≥85, zero defects, real file) products when QUALITY_AUTO_APPROVE=true
     (default OFF; origin='manual' never auto-approves; production publish
     locks untouched). Verified live on the scratch DB: 21/50 drafts
     FLIGHT_READY → approved, 29 held, 21 automation_log audit rows.
  2. BRAINSTORM: agent worker tool `brainstorm {niche,type,count}` wired to
     conceptEngine.brainstormConcepts (variations now genuinely diversify —
     each avoids every angle produced so far in the batch). Deterministic
     planner routes "brainstorm ideas for X" / "what should we make for X"
     BEFORE the generic make branch. Verified live: 3 real AI concept
     directions for beekeeping via /api/console/agent + the command bar.
     Model variance is honest: identical calls can return 0–3 directions
     (novelty gate); the tool reports empty with a note instead of inventing.
  3. FORECASTS: forecastTrend is now attached to every generated concept in
     generateConcept (activates the previously-dead noveltyScore boost);
     forecastProductEngagement is persisted on every social post
     (post-now + batch-generate) and rendered as a 🔥/⚡/💤 badge in the
     Social view. All deterministic — zero model cost.
- TESTS: 349 tests / 29 suites / 345 pass / 0 fail / 4 skipped (baseline on
  arrival: 341/337/0/4 with 1 fail). +8 new: brainstorm planner branch,
  quality-gate opt-in/manual-exclusion/audit coverage (new
  test/automation-quality.test.js), concept forecast determinism.
- ENVIRONMENT LESSON (measurement, not app): `curl -o /dev/null` on this
  Windows box reports bytes=0 / a client write error for real streamed
  bodies — always curl image routes to a real output file when verifying.
  Also: the bundled Node 26 exits with "stdin is not a tty" under
  background terminal jobs — run bounded jobs in the foreground and boot
  servers with pty=true + an explicit cd to the project root.
- NOT done (owner-gated, unchanged): no commit/push/deploy performed; no
  marketplace publishing; production opt-ins stay off.

## ── 2026-10-14: LOCAL WORKTREE STABILIZATION ──
- Owner reconfirmed the product north star: private command-center hub only, no customer-facing storefront; final goal is autonomous discovery/forecasting → creation/editing → QA → external publication → outcome learning.
- Fixed the duplicate `fewShotSection` declaration that prevented `conceptEngine.js` from loading.
- Fixed the `taskPublishQueue` SQL predicate to bind the `AUTO_PUBLISH_MANUAL` opt-in as a value; added `test/publish-queue.test.js` regression coverage.
- Fixed generation dedupe so approved/listed products count as existing inventory; added `test/automation-generation.test.js` (RED reproduced 1 duplicate, GREEN generated 0).
- Verified against isolated scratch DBs: full `node --test` → 341 tests, 337 pass, 0 fail, 4 skipped; changed JS syntax checks and `git diff --check` pass.
- Initial autonomy audit: data-driven trend forecasts are exposed by `/api/trends/:id/intelligence`; `qualityEngine` currently audits via command-center routes/actions but is not wired to auto-approve/publish; the cycle publishes only already-approved products, and production auto-start/publish remain explicitly locked. The new concept-level forecast/brainstorm helpers in `conceptEngine.js` have no callers beyond exports and need review before relying on them.
- No production database was used; no marketplace calls, commit, push, or deployment were performed. Remaining handoff/production checks are still open.

## ── 2026-10-13 (cont): SHUTDOWN FIX · DARK-PALETTE DOCUMENT PAGES · DEPLOY ──
- `server/services/pdfGenerator.js`: the SIGINT/SIGTERM handlers closed Chrome but never ended
  the process, so a SIGTERM'd server kept running (Docker/Railway had to SIGKILL it after the
  grace period) and `node --test` **hung forever** on `test/integration-boot.test.js` (its
  spawned server survived `child.kill()`). They now `process.exit(130|143)` after `closeBrowser()`.
  Result: that file went from 150s/cancelled → **3s/pass**, and the full suite terminates.
- `server/services/designStudio.js` `baseStyle(theme)`: a **dark** palette (`theme.dark`, e.g.
  "Onyx Volt" = `#050505` ink on `#0a0a0a`) used to paint both `body` and `.page` with `theme.bg`,
  producing black-on-black text in every deliverable PDF and cover preview. Document pages now
  always sit on a light surface (`brief.palette.surface` or `#ffffff`) while keeping the theme's
  ink/accents; cover art (thumb-stopper, playbook cover, final page) still uses `theme.bg`.
- `Dockerfile`: added `fonts-dejavu-core fonts-noto-color-emoji` so emoji in covers/PDFs stop
  rendering as tofu boxes. **NOT verified** — no Docker in the cloud session; see HANDOFF_TODO.md A4.
- VERIFIED in-session: `node --test` → **313 tests / 29 suites / 310 pass / 0 fail / 3 skipped**
  (28s, exit 0); `node --check` on every edited file and `git diff --check` clean.
- NOT verified in-session (no `data/` rows, no `.env`, no Docker, no marketplace creds): the real
  catalogue's covers, a publish, and the Railway build itself. **Open items, evidence and acceptance
  criteria are in `HANDOFF_TODO.md`** — read it before starting anything new.
- 5 fixture covers were rendered for visual inspection only (`tmp/covers-out/`, gitignored).

## ── 2026-10-13: ADAPTIVE COVER COMPOSITE FIX (cover-v7 — visible screen + tight bounds + copy layout) ──
- Root causes of adaptive covers showing blank white tablets or failing the cover critique gate:
  1. `buildThumbStopperCover` nested `<div class="ts-screen">` inside `<div class="ts-device">`. When `adaptive=true`, `.ts-device { display: none }` hid its child `.ts-screen` as well, leaving the photo's tablet screen completely blank white. Fixed by making `.ts-screen` a sibling of `.ts-device` inside `.ts-hero` (`<div class="ts-device"></div><div class="ts-screen">${realPreview}</div>`) and sizing `.product-preview-screen` dynamically to the slot height.
  2. `detectWhiteRect()` previously scored vertical bands by raw count of bright rows (`good / band.length >= 0.55`), which expanded the detected vertical span up to 45% beyond the tablet's top/bottom edges into surrounding dark desk areas. Fixed by anchoring start/end on bright rows (`frac >= 0.22`), requiring `>= 0.72` density, penalizing non-bright rows (`good - bad * 3`), finding the longest contiguous horizontal bright span, and weighting out high-chroma colored props in `detectArtScreenSlot()` with a 4% bezel inset.
  3. When the AI places the tablet centered (e.g. `x <= 540`) and overlapping the lower copy band, the 108px headline collided with the tablet screen. Added adaptive copy sizing/compaction (`compactCopy`) so the explanatory copy sits cleanly in the lower band while the product preview remains unobstructed inside the tablet screen.
- Bumped `COVER_VERSION` to `cover-v7` in `server/services/fileFactory.js` so stale `cover-v6` blank-screen renders invalidate automatically.
- Also wired all 15 Innovative product types (`playbook`, `pricing-bible`, `interactive-tool`, `profit-calculator`, `sop-package`, `business-in-a-box`, etc.) in `fileFactory.ensureProductFile` and `fileFactory.buildPreviewHTML` so they generate real deliverables and real cover previews instead of falling through to the generic fallback card; removed non-existent `buildEmailScriptsHTML`/`buildSOPPackageHTML` calls in `server/index.js`; fixed missing `<tr>` row wrappers in `buildTablePreviewHTML`; and eliminated the redundant double-render in `marketplace.requirePublishableCover` self-heal.
- Verification: 76/76 tests pass across `cover-copy`, `cover-art-prompts`, `cover-safety`, `design-critic`, `preview-surface`, `lifestyle-mockup`, `marketplace-copy`, `etsy-heal`, `lockdown`, and `smoke`; visual Puppeteer/Chromium renders verified.

## ── 2026-10-15: cover redesign — profession-realistic surfaces (cover-v10) ──
- **Owner feedback**: covers were "sloppy" — every product composited onto a
  generic floating tablet with fake browser chrome ("ACTUAL PRODUCT PAGE",
  traffic-light dots, title bar, future "LAST REFRESHED" dates), and the
  surface never matched the product. Husband-is-a-roofer reality check: **no
  roofer works off a MacBook on a rooftop** — trades carry clipboards, rugged
  tablets and phones.
- **cover-v10** (COVER_VERSION bump forces full regeneration):
  - `coverProductPreview` (designStudio.js): browser chrome REMOVED from both
    raster and HTML paths — the clean product document fills the slot.
  - `buildArtPrompt` (coverArt.js): per-product-kind surface
    (printable/screen/phone), overridden per PROFESSION by what the trade
    actually carries — clipboard for field printables, rugged tablet for data
    tools, phone for social kits; laptops kept ONLY for desk-bound professions
    (tax, notary, creators, photographers, wedding). Surface clauses never say
    "desk" so they can't contradict rooftop/basement scenes. A "never
    overlapping it or duplicating it" guard stops role props drawing a second
    surface (mold inspector's clipboard). Prompt hardened for perfectly
    perpendicular flat-lay (zero tilt).
  - PROFESSION_SCENES: beekeeping, drone surveying, appliance repair and
    pyrotechnics gained real field scenes (previously fell to the generic
    default and shipped a laptop).
  - Composite drop-shadow REMOVED: on screens it read as a sticker floating
    above the display; the art's own lighting grounds physical surfaces.
- **All 91 covers regenerated + pushed** (tmp/cover-regenerate.js — force
  re-render → catbox → Gumroad attach; 150s watchdog, serial mode for
  remainder batches). Storefront rebuilt from per-product API fetches (the
  list endpoint only exposes 10 products; GET /v2/products/:id covers all 91)
  and re-pushed. Vision-verified: checklist 8/10, social 9/10, invoice 7/10,
  roofing tablet 7/10, recovery booking 8/10, beekeeping tablet 8/10.
- **Known remaining gap**: when the AI draws a device at a perspective angle
  the flat overlay still reads slightly pasted-on — proper fix is a
  four-corner projective transform in the composite (not yet built). GitHub
  mockup repos reviewed (CTDave001 = static-template box detection;
  devonjhills = listing-content automation; matrixprompter = Gemini
  image-to-image) — none adoptable: image models garble the text-heavy
  documents we sell.
- Tests: 350 pass / 0 fail / 4 skipped. Commits 3ff070e, dc49ebb, 46c1613,
  06e6e11 pushed to origin/main.

## ── 2026-10-13: ADAPTIVE COVER PLACEMENT (template lands ON the photo's tablet) ──
- Owner feedback: the template must sit INSIDE the photo's white tablet rectangle,
  not float beside a blank tablet. Root cause: composite used a hard-coded CSS slot
  (DEVICE_SLOT 660,300,480,600) while the AI drew its tablet elsewhere in the frame.
- FIX (cover-v6): adaptive placement. `coverArt.detectWhiteRect()` (pure scanline
  luminance detector, hermetically tested) finds the largest bright low-saturation
  rectangle in the art; `fileFactory.detectArtScreenSlot()` rasterizes the art on a
  150x225 canvas in Puppeteer and maps the rect back to 1200x1800 coordinates.
  `buildThumbStopperCover` now takes a slot: adaptive (template blends flat onto the
  photo's own screen, bezel hidden, no rotation) or the fixed safe slot with a drawn
  device frame when detection fails. Art prompt restored to "one blank white tablet
  in the right 45%" — detection needs the tablet.
- Cache version bumped to cover-v6; `isCurrentCoverPath` + tests updated (v5 now stale).
- Verification: 58 targeted cover/pipeline tests pass, 0 fail (cover-copy,
  cover-art-prompts, cover-safety, design-critic, lifestyle-mockup, preview-surface).
  Local full-pipeline render of #678 verified visually (fallback drawn-device mode on
  a photo without a clean tablet; adaptive mode when detection succeeds).
- Etsy push of the 5 sprint products still blocked at the cover-review gate until
  this deploy lands in production (Railway auto-deploys from main).

## ── 2026-10-12/13: ETSY RECONNECT RESOLVED — NO BUG EXISTED (Freebuff takeover from Bionic) ──
- Resolved the "user 1286002574 owns zero shops" contradiction with direct evidence:
  the public shop https://www.etsy.com/shop/NicheGate is LIVE (banner, logo, About,
  policies; owner "Marina Lindemans", on Etsy since 2026) — it is simply EMPTY
  (0 items, 0 sales). The Bionic "shop setup never finished" theory is disproved.
- Production OAuth chain verified healthy live: /api/automation/log shows etsy_token_refresh
  SUCCESS every ~30min since 2026-10-12 22:08 with zero 403s; /api/marketplace/test
  returns gumroad connected (10 products) + etsy connected as user 1286002574.
- Fresh OAuth consent completed through production's REGISTERED callback
  (/api/marketplace/etsy/auth -> etsy.com consent -> /api/marketplace/etsy/callback)
  while authenticated to Etsy as the shop owner (Marina Lindemans). Etsy bound the new
  token to the SAME user 1286002574 — proving that user IS the shop owner's account.
  Do NOT treat 1286002574 as a wrong-account binding.
- The Desktop localhost bridge (etsy-bridge.bat/.js, port 8085) cannot work until
  http://localhost:8085/callback is registered as a callback URL on the Etsy app
  console (Etsy rejects it: "The requested redirect URL is not permitted."). An
  upgraded bridge with shop-ownership pre-check is saved as
  OneDrive/Desktop/etsy-bridge-v2.js (unused; low priority since prod OAuth works).
- Publish readiness after reconnect: /api/etsy/cap canPublish=true, cap 20/day,
  remaining 20; 24 products in catalog (all currently marketplace=listed on Gumroad
  but the Etsy shop has 0 listings — first push pending).
- Optional owner follow-up (not done): register localhost:8085/callback in the Etsy
  developer console if the local bridge flow is ever wanted; else delete
  etsy-bridge.bat/.js/v2.js.

## ── 2026-10-12: ETSY REFRESH + EBAY 403 DIAGNOSIS ──
- Production Railway logs showed Etsy token refresh HTTP 403 and eBay
  `/trending` HTTP 403. Etsy OAuth token exchange/refresh had been sent as JSON,
  but Etsy's official OAuth docs require `application/x-www-form-urlencoded`;
  changed both grants to form encoding, with refresh requests carrying client_id
  and rotating refresh_token (not client_secret). Regression asserts request body,
  content type, grant/client/token fields and rotated-token persistence.
- eBay `/trending` is an unauthenticated public-page scrape blocked with 403 from
  Railway egress, not a fixable auth bug. It is now disabled by default and marks
  source health as disabled without making the failing request. Optional opt-in
  `EBAY_TRENDING_ENABLED=true` is documented only for environments where access
  has been independently confirmed.
- Focused suites: 29/29 pass. Full Node suite: 290 pass, 4 skipped, 0 failed
  (294 tests). Syntax and `git diff --check` pass. Commit `4a054b3` is pushed to
  `origin/main` and deployed on Railway (deployment
  `5d9ffa1b-cb9b-4893-94dc-3815d862b05e`, SUCCESS). Production `/api/health` and
  `/api/health/readiness` both return 200 (`ready:true`). Post-deploy automation
  still logged Etsy token refresh HTTP 403, so the code-format repair alone did
  not restore the stored authorization. Production Etsy reconnect is required
  if the persisted 90-day refresh token has expired/revoked or credentials are
  mismatched; do not alter production marketplace credentials automatically.
  Readiness still confirms an Etsy token is present, which does not validate it.
  The deployment logs showed publishing correctly safety-locked; eBay scraper is
  disabled by default to avoid repeat 403 requests.

- Current handoff: production is healthy, but an owner-authorized Etsy reconnect
  at `/setup` remains the only outstanding recovery step. Verify one token
  refresh/API operation after reconnect before considering Etsy fully recovered.
  Do not paste, print, or rotate marketplace secrets in logs/chat.

## ── 2026-10-12: REAL PRODUCT COVER COMPOSITES (server + Worker released) ──

- [x] Cover release commit `2365987` (including feature commit `af8514f`) was
  pushed to `origin/main`. Railway production `/api/health` returned 200 with
  `env=production`, 11 products and 34 professions.
- [x] Cloudflare Worker `nichegate-covers` deployed to the configured account
  (`74d42a6784c765ed7c4276ab8d1f1c72`) after `wrangler whoami` matched it. Version
  `ba04520e-c7de-44d1-9d0e-eb183cd81d57` is live. `/health` returned 200, and an
  authenticated Lucid Origin request returned a decoded 1200×1800 JPEG (1,605,201
  bytes); server-side `getImageDimensions` verified the actual byte dimensions.
- [x] Cover hero uses actual `buildPreviewHTML(product, prof)` output embedded
  in a sandboxed srcdoc iframe; both photo-backed and no-art covers preserve the
  generated product title/copy/price and show the real product screen instead
  of simulated invoice/checklist/graph/social content.
- [x] Added `cover-v5` preview filename marker + `isCurrentCoverPath` cache
  validation in both fileFactory and `/api/products/:id/preview-image`; stale
  existing thumbnail paths regenerate rather than bypassing the cover builder.
  Regression test covers old/current cache paths.
- [x] Art backgrounds follow profession + Design DNA with five distinct photo
  directions and a native 1200×1800 blank tablet slot. Cloudflare cover Worker
  now uses Leonardo Lucid Origin with explicit native dimensions; providers must
  return 2:3 images or the asset is rejected (never center-cropped).
- [x] Cover reviews persist separate cover rubric, decision, exact artifact path
  and SHA-256; one fresh-art revision is attempted on a failing verdict. Missing
  or unpersistable AI review fails closed before Gumroad/Etsy/free-Gumroad uploads.
  With model AI disabled, an explicit persisted `not_required` state preserves
  the project invariant that marketplace publishing works with `MODEL_ENABLED=false`.
- [x] Focused verification after final edits: cover, worker, marketplace,
  preview-surface, lockdown, and phase7 suites → 66 pass, 1 expected AI-off
  skip, 0 fail; edited JavaScript parses and `git diff --check` is clean.
- [x] Real render: generated `previews/roofing-checklist-969-1791767533881.jpg`
  from product #969 (214,002 bytes, JPEG signature `ffd8ff`). Chromium preview
  confirmed it contains the exact Roofing Contractor quality checklist page in
  the photo-backed device frame with the niche headline/copy/price intact.
- [x] Pre-deployment render smoke (historical): regenerated local covers for
  products #969 (Roofing checklist), #949 (Native Plant Landscaper spreadsheet),
  #965 (Faith-Based Recovery invoice), #961 (SMART Recovery social), and #932
  (Wedding Photography spreadsheet). At that point, the old configured endpoint
  returned 1024×1024 FLUX output, which the dimension guard rejected in favor of
  plain-cover fallback. The Lucid Origin Worker has since been deployed and its
  actual 1200×1800 JPEG output verified below.
- [x] Aspect-ratio contract: marketplace cover export is a 1200×1500 (4:5)
  JPEG crop at `{x:0,y:150}` from the retained 1200×1800 (2:3) JPEG master.
  Device slot `{x:660,y:300,width:480,height:600}` is fully inside the safe crop;
  Pinterest continues to select the full-frame master. Renderer clip arguments,
  both output paths, crop dimensions/ratio and all slot bounds are covered by
  `test/cover-copy.test.js`.
- [x] Regression triage + fixes (all reported causes predate this branch):
  integration-boot's constant `boot-test-niche` slug was committed in `d08b632`
  and collided in the shared DB; fixture now gets a unique slug. The same test
  skips under Bun unless `NODE_BINARY` points to Node, because `process.execPath`
  is Bun rather than the runtime required to boot Express; installed user-local
  Node.js 24.20.0 and verified this test with `NODE_BINARY` (1 pass, 0 fail).
  Pricing winner test dates to
  `865c7bb`; globally shared settings and a stale 30s cache could make its
  winner population non-hermetic. It now uses a process-specific temp DB and
  `startPriceTest()` refreshes persisted state before allocation. Worker-memory
  test also dates to `865c7bb`; with `MODEL_ENABLED=true`, live model output made
  its deterministic assertion nondeterministic. It now forces AI off during that
  test and restores the prior setting. No branch-introduced cause found.
- [x] Verification: full native Node `node --test` run using user-local Node
  24.20.0 → **288 pass, 4 expected skips, 0 fail** (292 total, including the
  Node boot integration). Prior Bun suite: **285 pass, 7 skips, 0 fail**.
  `git diff --check` passes; no credential-like strings found in staged diff.
- [x] Live cover Worker `/health` returns `{"ok":true,"worker":"nichegate-covers"}`.
  Authenticated Lucid Origin smoke generation succeeded after deployment, and the
  returned JPEG bytes were decoded and verified at exactly 1200×1800 (1,605,201
  bytes); this closes the prior gap between requested and actual dimensions.
- [x] Feature commit `af8514f` (`Ship real-product cover composites with crop-safe
  marketplace exports`) and release-record commit `2365987` are on `origin/main`.
  Preview cache paths for #969, #949, #965, #961 and #932 were refreshed in local
  DB only.

## Regression triage detail (2026-10-12)
- Integration duplicate slug: pre-existing in `d08b632`; static evidence was
  constant slug insertion at `test/integration-boot.test.js` against the
  configured shared database (no throwaway `DB_PATH`). Fixed with unique fixture.
- Pricing winner expectation: test and engine behavior pre-existing from
  `865c7bb`. It assumes only its two variants participate, but settings state
  is shared and `readTests()` cached for 30 seconds. Test now isolates its DB;
  explicit `startPriceTest()` refresh prevents stale persisted settings from
  controlling its next allocation.
- Worker-memory wording: test pre-existing in `865c7bb`; a live model response
  could paraphrase the deterministic intent while the exact phrase assertion
  expected the planner result. Test disables the model for its deterministic
  assertion. No production worker-memory behavior was changed.
- Latest native Node result (E2E audit): 288/4/0 (292 total), including boot
  integration, route lockdown, marketplace guards, and actual preview parity.
  Audit commit `6891350` was deployed successfully, and the final release-note
  commit `697113f8b0b77de0fabc35a64bbfaa2bc306d621` is also deployed on Railway:
  deployment `ce10b41a-278a-4c99-85ea-ad37536eb75e` SUCCESS, service Online.
  Production `/api/health` returns 200 with 11 products and 34 professions;
  `/login` and `/js/console.js` return 200; anonymous `/api/products` returns 401
  as designed. Worker version `ba04520e-c7de-44d1-9d0e-eb183cd81d57` is live with
  1200×1800 generation verified. See `handoff-mail-FROM_FREEBUFF.md`.


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
- [x] Ad attribution ledger + kill rules (`adAttributionEngine.js` — spend, clicks, impressions, sales, ROAS, burn tripwire $15, mature pause <1.2x, winner scale >=3.0x, sweep route `GET /api/ads/attribution`) — DONE 2026-10-10
- [ ] Programmatic SEO keyword landing pages (after catalog deepens via Phases 1–2)
- [x] Interactive/hosted web-tool products (`webToolGenerator.js` — self-contained responsive client-side profit/quote calculator micro-app, format `html`, price $29, offline-first localStorage auto-save, wired into `fileFactory` and `productTypes`) — DONE 2026-10-10
- [x] FAANG/SpaceX Quality Assurance Gate (`qualityEngine.js` — 5-dimension rubric: deliverable integrity 25pts, content completeness 25pts, polish 20pts, commercial 15pts, defects/hallucination 15pts; FLIGHT_READY >=85pts gate; routes `GET /api/products/:id/quality` & `GET /api/quality/catalog`, action `quality-audit`) — DONE 2026-10-10
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
- [x] OWNER/RAILWAY DASHBOARD: DONE 2026-09-26 (owner approved "rotate it now"). ADMIN_PASSWORD rotated to a fresh 24-char credential, set via `railway variable set ADMIN_PASSWORD --stdin` (value never displayed/logged); the same value is saved in the main workspace's local `.env`. Post-rollout DB backup written durably to the volume: `data/backups/profession-box-2026-09-26T09-39-21-061Z.db` (6.0 MB).
- [x] DEPLOY STATE: DONE 2026-09-26. 4f107bf pushed to origin/main (fast-forward 566495a..4f107bf after local verification: 164 tests / 161 pass / 0 fail / 3 skips). Railway auto-deployed from GitHub (deployment 7e40ee64 SUCCESS). Verified live: login with rotated password 200, /api/console/overview 200, new-build-only route /api/worker/memory 200 (proves new code serving), /api/model/status enabled:true, /api/health ok — 353 products intact, volume preserved across rollout.
- NOTE: production automation/publishing opt-ins remain disabled; do not enable them until live inventory and limits are reviewed.

# ── 2026-09-26: PUSHED & DEPLOYED (owner call: "ignore exposure concerns until project is complete") ──
- Owner decision on record: the leaked Etsy keys in git history (audit CRITICAL) are NOT rotated/purged yet — owner will address when the project is fully complete. Repo is private. Treat as STILL OPEN, not resolved.
- What shipped: 4f107bf (safeguarded AI worker + production persistence) to GitHub main and Railway production, with ADMIN_PASSWORD rotated first so the new startup guard passes.
- Deliberately NOT pushed: WIP snapshot commit 462c2ef (~22 MB of .audit-tmp binaries incl. gumroad.exe) stays local on its freebuff branch; uncommitted UI edits in sibling worktrees left untouched. Exclude .audit-tmp from any future history purge/commit.
- MCP (2026-09-26): committed mcp_servers.json (official Etsy Dev MCP); installed aserper/etsy-mcp as `etsy-shop` globally (own OAuth + auto-refresh). Full details in MEMORY.md "MCP SETUP".

# ── 2026-09-26: DASHBOARD FONT CHANGE + FULL E2E AUDIT (feature/button/AI/health) ──
# Scope: owner asked for a stronger/narrow dashboard font, then a complete end-to-end
# audit with a fix list. Font SHIPPED (2 files). Audit findings below were REPORTED,
# then ALL FIXED the same day (2026-09-26) — see FIX LIST for per-item status.
- [x] FONT: UI sans Oswald -> Saira Condensed (weights 400-800). Saira is a solid
  grotesque with a tall x-height that keeps the narrow/condensed look but with much
  thicker even strokes than Oswald. Changed: client/css/flightdeck.css (--sans token)
  + client/index.html (Google Fonts link). Headings/numbers keep Space Grotesk (--mono).
  Verified: document.fonts.check('600 14px "Saira Condensed"') true, before/after
  screenshots reviewed. Full suite still green: 164 tests / 160 pass / 0 fail / 4 skipped.
- [x] AUDIT: 153 routes swept with auth (marketplace-mutating POSTs deliberately NOT
  invoked); all 12 views rendered in a real browser (0 console errors post-login);
  buttons verified (theme toggle, ⌘K palette + filter, command-bar AI worker, catalog
  checkbox toggle, J/K triage cursor); AI layer verified both ON and OFF; health +
  readiness verified locally and in production (read-only).

## FIX LIST (complete, ordered by severity — ALL APPLIED 2026-09-26)
## Fixes verified two ways: (a) full suite `ADMIN_PASSWORD= node --test` = 164 tests /
## 160 pass / 0 fail / 4 skipped (baseline held, no new failures); (b) live smoke on the
## restarted audit instance (127.0.0.1:5090, throwaway password): anonymous storefront
## now 200/200/200 (/api/store/products, /api/store/showcase, /api/products/:id/preview-image
## serving image/jpeg) while console APIs stay 401; video-scripts 200 with real scripts;
## all six empty-body POSTs now 400; pricing/end + sequences/export now 404; a 210-request
## anonymous burst no longer locks out login (200) or /api/health (200); dark pre-paint
## works CSP-clean (0 console errors after reload); row thumbs render 56x70 object-fit:cover.
- [x] HIGH — Review/Home row thumbnails EXPLODE to natural size: `.rrow .rt{width:58px;height:72px;object-fit:cover}` (flightdeck.css:230) styles the DIV wrapper (`<div class="rt">${img(p)}</div>`, views.js:277/544), but object-fit does nothing on a div and NO rule sizes the inner <img> (.card .thumb img is the only img rule and does not match .rt). Any product WITH preview_path renders its preview-image at natural size (verified: 1200x1500 image covering the whole Review view at a 583px viewport). Products without previews use the emoji fallback and look fine — which masks the bug. Fix: add `.rrow .rt img{width:100%;height:100%;object-fit:cover;display:block}`. Unrelated to the font change (diff touches only the font string).
- [x] CRITICAL — Public storefront API is auth-gated in PRODUCTION: /api/store/products
  and /api/store/showcase return 401 to anonymous customers (verified live on Railway),
  while GET /store (the page) is public. Every visitor sees an empty store. Root cause:
  the auth guard exempts only /auth and /health prefixes — it needs /store + the
  product preview-image endpoints exempted too (store.js fetches both).
  ⚠ REVERTED SAME DAY — this finding was WRONG: the 401s are BY DESIGN. See the
  PRODUCT INTENT correction below.
- [x] HIGH — POST /api/products/:id/video-scripts 500s on EVERY call: line 853 calls
  conceptEngine.generateVideoScripts but conceptEngine is never required in that
  handler (other handlers require it inline). ReferenceError -> 500. One-line fix.
- [x] MEDIUM — CSP blocks the theme pre-paint inline script: index.html line 9
  (sha256-CPsPjv/wS3JrXzfE2rcsdb1d9fS8dA9cl1Cdcz4VgwQ=) violates script-src 'self'
  on every load. Dark-mode users get a light flash + the color-scheme meta never
  renders. Fix: extract to /js/theme-init.js (external = CSP-clean, survives future
  edits) or add the hash to the CSP.
- [x] MEDIUM — Rate limiter can lock out login AND health: apiLimiter covers ALL /api
  (including /api/auth/login and /api/health) with a SHARED per-IP counter
  (200 anon / 1200 authed per 15min). Reproduced: a probe burst exhausted the counter
  -> login 429'd -> no session -> every endpoint incl. /api/health 429'd for the rest
  of the window. In prod this can 429 Railway's healthcheck (restart flapping) and
  lock the operator out of login. Fix: exempt /api/health* from the limiter (keep it
  auth-open), give /api/auth/login its own small brute-force limiter.
- [x] MEDIUM — Three input-validation 500s (should be 400): POST /api/social/generate
  binds undefined productId straight into SQLite ("cannot be bound to parameter 1");
  POST /api/templates/generate same for type (parameter 2); POST /api/design/preference/:profId
  same for theme (themes.setDesignPreference binds themeName unvalidated, no try/catch).
  All work fine with valid bodies — they just crash on missing/mistyped fields.
- [x] LOW — Error-shape inconsistencies: POST /api/pricing/tests/:productId/end returns
  500 "No price test for product" (expected 404/400); POST /api/sequences/:id/export
  returns 500 "Sequence not found" (expected 404). Expected conditions must not be 500s.
- [x] LOW — test/smoke.test.js assumes auth is OFF: it fetches /api/professions and
  /api/health/readiness unauthenticated, so the suite fails 2 tests whenever
  ADMIN_PASSWORD is set in the env (401 vs 200). APPLIED: the workaround is now documented
  in the test/smoke.test.js header comment — run `ADMIN_PASSWORD= node --test`.
- [x] LOW — POST /api/etsy/cap, /api/caps, /api/social/schedule accept empty {} bodies
  and return 200 (no-op or silent default writes). APPLIED: all three now 400 on empty
  bodies (cap required; etsy and/or gumroad required; productId + platform required).
  Same SQLite-bind 500 fixed in social/post-now too (was the identical bug).
- [x] HYGIENE — Phase 6 routes (index.js ~756-993: pricing/vetting/pins/sequences/swipe)
  were indented one level (leading whitespace) while every other route is top-level.
  APPLIED: all 21 route declarations de-indented to top level — the MEMORY.md tripwire
  regex `^\s+app\.` now counts 0 nested registrations.
- [x] HYGIENE — /api/design/preference/:profId (GET+POST) has no client callers (orphan).
  RESOLVED: kept in place (removal risk without a caller inventory) — POST now validates
  profId + theme name against getAllThemes() and 400s on junk. Wiring into the Design DNA
  UI remains an optional future task.

- [x] DEPLOY: SHIPPED 2026-09-26 — commit 519aa6d ("fix: open the public storefront and
  fix rate-limit, CSP and validation failures") pushed fast-forward 0e6f1fe..519aa6d to
  origin/main; Railway auto-deployed (new build live in ~30s). Verified live on
  nichegate-production.up.railway.app: anonymous /api/store/products + /api/store/showcase
  + product preview-image all 200 (was 401 — empty-store bug gone in prod), /store 200,
  console APIs still 401 anon, login 200 with the rotated password, console shell serves
  /js/theme-init.js with 0 inline scripts (CSP clean), video-scripts 200 with 3 scripts
  (was 500 every call), /api/health ok with 353 products + 33 professions (volume intact).

# ── 2026-09-26 CORRECTION (owner ruling): THIS APP IS NOT CUSTOMER-FACING ──
# NicheGate is a strict command center / flight deck / AI automation engine. There is NO
# public storefront. The audit's "CRITICAL storefront 401" finding was a wrong assumption
# — those 401s are the correct, intended behavior. The exemption fix (519aa6d) briefly
# exposed /store + /api/store/* publicly and has been REVERTED within the hour.
# Everything except /login, /api/auth/* and /api/health* now requires the admin session,
# and /store + /store.html are on the ADMIN_PAGES gate. Etsy/Gumroad remain the only
# sales surfaces — this app never serves customers.
- [x] LOCKDOWN (2026-09-26): store API exemptions removed from the auth guard,
  /store + /store.html added to ADMIN_PAGES, limiter store bucket reverted (1f8492f).
  PLUS the /generated, /uploads and /covers asset mounts are now requireAuth-gated —
  internal deliverables were anonymously fetchable by URL (cdf408f). Suite green
  164/160/0/4 after each. FINAL anonymous surface on Railway (verified 2026-09-26):
  302 for /, /store, /store.html, /setup; 200 for /login + login-shell static assets +
  /api/health + /api/auth/status; 401 for EVERY API and asset route incl. preview-image.
  Console verified intact behind login (overview 200, store API 200 with session, 353
  products). Note: prod runs READYNESS_PUBLIC=true so /api/health/readiness answers
  anonymously there (pre-existing config; posture only, no secrets) — flip it if wanted.
# ── 2026-09-26: FOLLOW-UP HARDENING + FULL AUDIT/POLISH PASS ──
- [x] LOCKDOWN TRIPWIRE TEST: test/lockdown.test.js (6 tests) parses every route
  registered in server/index.js and asserts none answers an anonymous request with
  200 outside /login + /api/auth/* + /api/health*; also asserts the storefront stays
  DELETED (404s), asset mounts stay 401, and the console works behind the session.
  Any future "open this for customers" change fails CI first. API limiter caps made
  env-tunable (API_RATE_LIMIT_ANON_MAX / API_RATE_LIMIT_AUTHED_MAX, defaults 200/1200).
- [x] HERMETIC TESTS: smoke.test.js now logs in when ADMIN_PASSWORD is set (cookie
  attached to all requests) — `ADMIN_PASSWORD= node --test` workaround is dead.
  auth.test.js cleanup scoped to its own session tokens (a blanket DELETE FROM
  auth_sessions raced parallel test workers sharing the DB).
- [x] LANGUAGE PURGE: stale storefront references removed from brandAssets.js +
  coverArt.js comments. Marketplace-domain language (buyers, Etsy/Gumroad stores)
  intentionally kept — that is where the money happens.
- [x] ORPHANS REMOVED: /api/design/preference/:profId (GET+POST) deleted — zero
  client/test callers confirmed (service functions stay; used internally by themes).
- [x] DEAD CODE/DEPS: unused pino logger removed; pino, pino-pretty, zod dropped from
  package.json. npm audit: xlsx had 2 HIGH vulns with no npm fix -> upgraded to
  SheetJS 0.20.3 from the official CDN tarball. `npm audit --omit=dev` = 0 vulnerabilities.
- [x] RESPONSIVE POLISH: at 324px width, 6 of 12 views overflowed horizontally.
  Fixed: #topbar/.panel-head/.view-head flex-wrap, .panel-body overflow-x, .panel
  min-width, and the <=860px grid used plain 1fr (=minmax(auto,1fr)) -> minmax(0,1fr).
  Verified: 0px overflow on all 12 views, 0 JS errors.
- [x] HYGIENE: .gitignore now covers previews/ + covers/ai/ (regenerable caches that
  kept polluting git status after test runs).
- VERIFIED: suite green in BOTH modes (170 tests / 166 pass / 0 fail / 4 skipped);
  live e2e sweep on port 5092 = 21/21 expectations (anon surface sealed, deleted
  store stays deleted, all domain APIs 200 behind session, readiness works with
  session); browser pass over all 12 views: 0 console errors, sessions survive
  repeated reloads (curl-verified 3x).

- [x] STOREFRONT DELETED (2026-09-26, owner decision "delete entirely"): client/store.html
  + client/js/store.js removed, /api/store/products + /api/store/showcase routes and
  their caches deleted from index.js, GET /store route removed, '/store'+'/store.html'
  struck from ADMIN_PAGES. Zero references remain (grep-verified across client/server/
  test/scripts). Suite green 164/160/0/4. Sales surfaces remain Etsy/Gumroad only.

# Verified healthy (no action): all 12 views render (0 console errors), auth gate holds
# on every console API (local + prod), AI layer real (ai:true, grounded answers), the
# MODEL_ENABLED=false invariant holds (deterministic fallback + worker still executes),
# J/K triage + catalog checkboxes + ⌘K palette + theme toggle all work, /api/health +
# readiness truthful, prod healthy (353 products, volume intact).

## ── 2026-09-29: HORIZONS 1, 2 & 3 AUTONOMOUS INTEGRATION COMPLETE ──
- [x] HORIZON 1: Winner Amplification (`winnerEngine.js`) — finds products with >=2 sales, auto-generates Pro sequels, category siblings, and complete bundle kits, hooked into `taskScale` and registered console action.
- [x] HORIZON 1: Autonomous Pricing Promotion (`pricingEngine.js`) — `autoPromoteWinners` identifies pricing tiers with >=5 sales and >=2x units/day lead, auto-adopts and deploys winning price to live marketplace listings during sales sync.
- [x] HORIZON 1: Net Unit-Economics & P&L Engine (`bi.js`) — Real financial model factoring platform fees (Etsy 6.5% + $0.20 renewal + 3% + $0.25 payment processing; Gumroad 10% + 2.9% + $0.30), AI token expense ledger (`ai_usage`), and ad spend into true net margins. Exposed at `GET /api/pricing/pnl` and in `bi.build()`.
- [x] HORIZON 1: Self-Healing Token & Quota Reliability (`marketplace.js`, `modelRouter.js`) — Proactive Etsy token refresh within 45m of expiry, retry with exponential backoff on model calls, per-cycle token caps.
- [x] HORIZON 2: Competitor Intelligence (`competitorEngine.js`) — Ingests competitor listing copy or URLs to identify vulnerable price/quality angles and generate counter-products.
- [x] HORIZON 2: Few-Shot Concept Ingestion (`conceptEngine.js`) — High-performing concept exemplars for spreadsheets, checklists, dashboards, prompts.
- [x] HORIZON 2: Multi-Device Lifestyle Mockup Studio (`designStudio.js`) — Rich device previews (MacBook, iPad Pro, iPhone) with CSS device framing.
- [x] HORIZON 2: High-Ticket Spreadsheets (`xlsxGenerator.js`) — Dynamic financial modeling workbooks with IRR, Cash Flow, Sensitivity Analysis.
- [x] HORIZON 3: Seasonal Launch Gate (`seasonalEngine.js`, `automationCycle.js`) — Holds seasonal listings until their peak calendar window opens (`isSeasonalWindowActive`).
- [x] HORIZON 3: Cold Listing Clearance (`automationCycle.js`) — Automatically tags 30-day zero-view listings for clearance bundle inclusion.
- [x] HORIZON 3: Live SEO Sweep (`automationCycle.js`) — Automatically optimizes weak SEO listings and pushes live copy updates to marketplaces.
- [x] HORIZON 3: Live Pinterest API v5 & MCP (`pinEngine.js`, `mcp_servers.json`) — Dispatches scheduled pins directly to Pinterest API v5 when credentials exist, registered `pinterest-mcp` in `mcp_servers.json`.
- [x] AGENT MANUAL: Created `AGENT.md` as the unified autonomous agent operational manual.
- VERIFIED: 183 tests across 29 suites pass cleanly (0 fail, 3 model skips).


## ── 2026-10-10: PINTEREST NICHE REPAIR + PREVIEW COPY OVERHAUL ──
- [x] PROD DATA: profession 1000 renamed "Make Money From Pinterest" with real niche
  services (Affiliate Pin Campaigns $500, Sponsored Pin Packages $350, …). The old
  placeholder services ("Digital Template $15", "Complete Kit $29" — seeded by
  trendScanner) rendered as generic filler inside deliverables; builders now emit
  niche content (verified in XLSX + builder HTML on prod).
- [x] PROD DATA: deleted wrong wall-art draft (#5, miscategorized money niche);
  replaced with #9 spreadsheet Income Tracker, #10 roi ROI Calculator, #11 checklist
  Monetization Checklist — distinct names, real briefs, real files (XLSX/PDF) +
  regenerated previews. Zero wall-art rows remain for this niche.
- [x] CODE FIX (designStudio.js thumbCoverCopy): covers no longer print the canned
  per-type headline ("Pricing Calculator" on an Income Tracker, "Service Quality
  Checklist" on a Monetization Checklist). Copy priority is now concept JSON →
  product name tail + brief-derived sub/benefits → per-type library fallback.
  Added missing roi + decision-matrix library entries.
- [x] CODE FIX (designStyles.js + coverArt.js): new `creator` niche
  (pinterest|instagram|tiktok|make money|affiliate|…) tested BEFORE tech — money
  niches no longer render as stock-trading dashboards (circuit-board tech scene).
  New creator scene: warm daylight desk, phone/tablet, sticky notes.
- [x] Previews #9-11 force-regenerated on prod and visually verified: correct titles,
  brief-derived bullets, warm creator-scene art.
- VERIFIED: 197 tests / 29 suites — 194 pass, 0 fail, 3 skips.
- ⚠ DEPLOY GAP: designStudio.js / designStyles.js / coverArt.js hot-patched on the
  prod container (originals at *.bak there) + earlier discovery.js fix are LOCAL
  ONLY — uncommitted, not pushed. A redeploy without them reverts cover copy +
  creator art. Commit + deploy when the owner audits.
- [x] OPEN→DONE (Chunk 4, this push): trendScanner.js placeholder-services root
  cause FIXED — all three auto-creation paths (trendScanner, competitorEngine,
  generateForNiche) now emit real niche services via nicheServices/typePlan. See
  the 2026-10-11 upgrade-push entry below.

## ── 2026-10-11: COMMIT + E2E AUDIT ──
- [x] Committed as d5f2680 (local main, NOT pushed): discovery typing fix + cover
  copy/creator-niche pipeline + tests + task log. Untracked scratch: tmp/, backups/.
- [x] E2E audit (real surface): prod login → catalog 200 → preview-image 200
  image/jpeg, served bytes SHA-identical to visually verified covers for #9-11;
  anonymous /api/* 401 by design (no storefront). Boot smoke PASS (health 644ms,
  4 probes 200, auto-cycle engaged, fresh-DB seeds 23 professions). All four
  thumbCoverCopy branches probed. AUDIT: SPEC 8 · DESIGN 6 · CORRECTNESS 8 · QUALITY 7.
- TOP UPGRADES (ranked): (1) cover-copy regression tests (zero coverage today),
  (2) trendScanner placeholder-services root cause, (3) bulk preview re-skin for
  ~350 stale canned-copy covers, (4) productCopy module unifying cover/listing copy.

## ── 2026-10-11 (cont): UPGRADE PUSH — CHUNKS 4-8 (the ranked TOP UPGRADES) ──
All work LOCAL ONLY (uncommitted) — commit + deploy when the owner audits.
- [x] CHUNK 4 — Junk-service root cause: trendScanner / competitorEngine /
  generateForNiche now route niche→services through nicheServices + typePlan
  (single niche→type router). Regression: test/niche-services.test.js.
- [x] CHUNK 5 — Cover upgrades: coverCopy branch tests (test/cover-copy.test.js),
  cover-art prompt style-token factory (coverArt.js STYLE_PROFILES + off-niche
  scene gate; photo profile kept byte-identical so art-cache hashes don't churn).
  Regression: test/cover-art-prompts.test.js.
- [x] CHUNK 6 — Design overhaul: new productCopy.js (single owner: concept → name
  → brief derivation) + per-type cover templates/typography (product-preview hero
  card over warm art). Covers regenerated + visually verified (1200x1500 portrait).
- [x] CHUNK 7 — Boot smoke promoted to hermetic integration test
  (test/integration-boot.test.js, incl. preview-html route). Bonus fix: XLSX
  preview title no longer hardcodes "Pricing Calculator" on trackers.
- [x] CHUNK 8 — Demand signals: new demandSignals.js mines live Etsy listing
  titles (Serper) → real shopper tags + design tokens. Wired into seoEngine.buildTags
  (demand outranks our own hashtags, ≤13/≤20-char Etsy rules held) and into
  themes.paletteForNiche (demand sentiment biases the palette). Honest degradation:
  no Serper key / fetch fail → [] + health note, never invented demand. Regression:
  test/demand-signals.test.js.
- VERIFIED: full suite `node --test` = 227 tests / 29 suites — 223 pass, 0 fail,
  4 pre-existing skips. demand-signals alone 10/10 pass.
- NEXT: Chunk 9 (prove concept path with real model, MODEL_ENABLED=true) →
  Chunk 10 (full suite + push + deploy + prod verify, today's products only).

## ── 2026-10-11 (cont 2): AGENTS.md OPEN ITEMS 1-2 DONE + JUDGE MODEL 404 FIX ──
- [x] OPEN ITEM 1 (Chunk 9): CONCEPT PATH PROVEN WITH REAL MODEL. MODEL_ENABLED
  already =true in .env (AGENTS.md env snapshot was STALE — it claimed OFF).
  generateConcept end-to-end via OpenRouter → parseConcept → novelty gate:
  returned a validated concept (noveltyScore 95/100, niche-specific diff) and
  junk "Ultimate Template Kit" correctly rejected (score 5). Live model tests
  (RUN_MODEL_TESTS=1) pass 6/7→7/7.
- [x] FIX (modelConfig.js judgeModel): 'anthropic/claude-3-haiku' (and the
  'claude-3.5-haiku' in AGENTS.md) are RETIRED on OpenRouter → HTTP 404, breaking
  the scoreOptions/judge leg. Probed live; 'anthropic/claude-haiku-4.5' resolves
  ($1/M) — swapped in. Verified 3/3 legs live: cheapSummarize, scoreOptions,
  generateIdeas. Suite 227 tests / 223 pass / 0 fail (no test pins the old slug).
- [x] OPEN ITEM 2: ETSY_CLIENT_SECRET verified DISTINCT from ETSY_CLIENT_ID
  (readiness check passes: id!==secret, both set). AGENTS.md env snapshot was
  stale here too (it claimed the two were identical).
- ⚠ OPEN ITEM 3 (Start server + approve Review Queue + Deploy Bundles) NOT DONE:
  this is real Gumroad/Etsy publishing — needs explicit owner authorization.
  "Reconnect Etsy at /setup" is an owner-side OAuth browser flow (not scriptable).
- 📝 AGENTS.md env snapshot + "Tests: 77 tests/18 suites" line are both STALE
  (real: MODEL_ENABLED=true, secrets distinct, 227 tests/29 suites). Consider
  refreshing AGENTS.md when the owner audits.

## ── 2026-10-11 (cont 3): DESIGN QUALITY UPGRADE — ALL 5 PHASES ──
Scope (owner): "do not use products created prior to yesterday" → every
automated design path (sweep, auto-reskin, novelty lookback) is scoped to
products created >= FOCUS_SINCE ('2026-10-10', env DESIGN_FOCUS_SINCE).
All work LOCAL ONLY — commit + deploy when the owner audits.
- [x] PHASE 1 — DESIGN CRITIC: server/services/designCritic.js — after a build,
  screenshot pages (Puppeteer, shared Chrome) → vision model (new
  modelRouter.callVision, modelConfig.visionModel, spend in ai_usage as
  action='design_critique') → strict-JSON 6-dimension rubric parse → if overall
  < 6.5 ONE revision pass (critique-driven brief regen → re-render → re-score →
  keep the better variant, brief restored if original won). Persists to the new
  design_scores table (product_id, scores, critique, revised, kept_variant).
  NEVER throws; MODEL_ENABLED=false → skip + null (zero cost). UNSCORED ≠ PASS
  (hard rule #4): scoreSummary() reports unscored separately. Auto-hook in
  fileFactory.ensureProductThumbnail scores every AI-enabled build
  (fire-and-forget; skipped under NODE_TEST_CONTEXT so the suite stays hermetic).
- [x] PHASE 2 — ART DIRECTOR: server/services/artDirector.js — per-product
  DESIGN BRIEF (mood/palette/fonts+reason/motif+motif_css/layout/whitespace/
  texture/style_lineage) generated via the ideation model with mechanical
  diversity levers: 2-of-8 style blending (seeded by product id), per-product
  layout rotation, per-niche motif library (VISUAL_MOTIFS — note: plan said
  nicheUniverse.js which does not exist; motifs live in artDirector + tests
  verify each passes its own safety lint). NOVELTY GATE: role-wise CIE76 ΔE
  over primary/secondary/accent vs recent same-niche briefs (neutrals excluded
  — bg/surface always cluster) + repeated mood/motif words; reject → ONE
  regen with avoidance → else fall back to deterministic styles. EDITOR-SAFETY
  LINT (security): only hex + font declarations survive; url(/@import/
  position:fixed/expression( stripped; font names charset-validated.
  Builders accept briefs via applyBriefToTheme(theme, brief) — the theme/DNA
  object every builder already consumes (fallbackTheme applies it centrally),
  so all 33 types get brief-driven palettes/fonts/motif/layout with ZERO builder
  rewrites and the deterministic 8-style path intact as fallback. Briefs persist
  on products.design_brief. designStyles.js: font library 12 → 42 families +
  FONT_PAIRINGS + googleFontsUrl() (sanitized dynamic family list).
- [x] PHASE 3 — REFERENCE-GROUNDED TASTE: design_references table (extracted
  DNA only: palette/fonts/layout/motif/taste_note — brief-level transfer, never
  pixel-copy). Seeded with 15 curated public-domain print/editorial lineages
  (Swiss poster, Bauhaus, Penguin grid, Whole Earth, riso zine, …).
  artDirector feeds 1-2 niche-relevant references into every brief prompt;
  WINNERS LOOP: critique score >= 8 auto-enters as source='winner' (human-
  auditable, linked product_id + score).
- [x] PHASE 4 — CONTENT/SKIN SEPARATION + RESKIN: content (name/concept/brief/
  services) is untouched by design ops; the skin is design_brief → theme.
  reskinProduct(): fresh generated brief (avoiding the previous palette/mood/
  motif) → deterministic fallback synthesizes a brief from the current theme +
  rotated layout + niche motif (works with AI off — verified) → regenerates file
  + preview. Routes POST /api/products/:id/reskin + /design-critique, actions
  'reskin-product'/'design-critique'/'reskin-weak' in the closed registry (⌘K),
  drawer buttons "Critique design" + "Reskin" in the product/review drawer, AND
  a Smart Actions card ("Reskin N weak-selling designs") wired to 'reskin-weak'.
  AUTO-RESKIN RULE:
  automationCycle.taskDesignReskin — products with >=2 sales and score < 7 get
  ONE reskin attempt per cycle (automation_log 'design_reskin' enforces once).
- [x] PHASE 5 — RETRO SWEEP (owner scope: recent catalog only): 'design-sweep'
  action + critic.sweepCatalog (top by views, created >= FOCUS_SINCE) → critique
  all, revise weak, auto-reskin score < 5 → before/after distribution. Analytics
  view gained a Design Quality panel (GET /api/design/scores): distribution
  bars, avg, below-bar count, revised count, and UNSCORED shown explicitly as
  unscored. GET /api/products/:id/design-score + /api/design/references added.
- VERIFIED: full suite `node --test` = 257 tests / 29 suites — 253 pass, 0 fail,
  4 pre-existing skips (baseline 227/223/0/4; +30 new tests in
  test/design-critic.test.js + test/art-director.test.js). Boot smoke on :5096:
  health 200, /api/design/scores honest (unscored≠passed), /api/design/references
  serves the pool, POST /api/products/:id/reskin regenerated real PDF+JPEG under
  a rotated deterministic skin (AI off). Route tripwire holds: 160 top-level
  routes, 0 nested. Dev DB cleaned to pre-session state (0 products).
- COST CONTROL: max 1 critique + 1 revision + 1 brief regen per product
  (design_scores.revised + brief-presence guards); sweep cap default 25.
- KNOWN deviation from the plan text: the revision pass regenerates a corrected
  DESIGN BRIEF and re-renders through the builders (safe-token pipeline) instead
  of letting the model rewrite raw HTML — same loop semantics, but the security
  lint can never be bypassed by model output. Also unscored products are
  excluded from auto-reskin (null score ≠ weak design).
- [x] LIVE VISION LEG VERIFIED 2026-10-11 (owner: "run it"): one real critique
  via `tmp/live-critique.js` (throwaway DB via DB_PATH — dev DB untouched;
  MODEL_ENABLED forced on for that process only, .env unchanged). Real Puppeteer
  render → live google/gemini-2.5-flash callVision (4.6s, 1,635 tokens,
  $0.00040 in ai_usage as action='design_critique') → strict-JSON parse →
  design_scores row persisted. Clean exit (closeBrowser). Harness kept at
  tmp/live-critique.js (revise:false = exactly one vision call; flip to true to
  live-test the revision loop).
- SIGNAL from the live critique: the deterministic 'sage' checklist skin scored
  2.0/10 (uniqueness 1, typography 2 — "generic template feel"). Expected: it
  is the no-brief fallback the critic exists to catch, and it confirms the
  artDirector brief path is what moves scores. Implication: products without a
  generated brief will land far below the 6.5 bar — once MODEL_ENABLED=true,
  brief generation (not just critique) needs to run for new builds.
- [x] BRIEF-BY-DEFAULT 2026-10-11 (owner: "Wire in as the default") — the
  SIGNAL above is addressed: EVERY build now gets design DNA at birth.
  • artDirector.synthesizeBrief(product, prof, {previous, layout}) — NEW shared
    deterministic synthesis: rotated layout (5 families), rotated curated font
    pairing (designStyles.FONT_PAIRINGS, was one hardcoded Fraunces trio), niche
    motif library, theme-derived palette; per-key sanitized + full editor-safety
    lint. Never throws.
  • artDirector.ensureDesignBrief now falls back to synthesizeBrief when the
    model is off or yields nothing → a brief ALWAYS exists (AI on → generated
    brief still wins; existing briefs never regenerate — cost control intact).
  • fileFactory.ensureBuildBrief (NEW seam) wired into ensureProductFile +
    ensureProductThumbnail un- gated by MODEL_ENABLED (was: AI-on only). The
    critique hook stays behind autoCritiqueAllowed() (money gate).
  • designCritic.reskinProduct deterministic fallback now reuses
    synthesizeBrief (dedupe; its inline copy deleted).
  • Bug fixed on the way: fallbackTheme crashed on products without a
    profession_id (SQLite bind of undefined) — guarded both lookups.
- VERIFIED: suite 262 tests / 258 pass / 0 fail / 4 pre-existing skips (+5 new
  in test/art-director.test.js: synthesis lint-safety + determinism, per-product
  rotation, ensureDesignBrief deterministic fallback + generated-preference +
  no-overwrite, ensureBuildBrief seam). Live one-shot smoke through the REAL
  build path (ensureProductFile, AI OFF, throwaway DB): real PDF + brief at
  birth (layout full-bleed, Playfair Display × Work Sans, motif dot grid,
  _deterministic=true). Smoke residue cleaned.
- NEXT: owner decides commit + deploy (still uncommitted per handoff rule);
  optionally run the full live revision loop (critique → brief regen → re-score)
  once MODEL_ENABLED=true is set in .env.

## ── 2026-10-11 (cont 4): LIVE GUMROAD STORE REFRESH (cull/reskin/push) ──
- Owner pivot: "Forget the 353 request — go with the live ones on Gumroad,
  cull, reskin and push to those." Owner decisions (asked + answered):
  KEEP ALL 10 (no cull), FULL REFRESH each (name + copy + deliverable + cover).
- Live store = 10 listings on marinablow.gumroad.com (3 recovery checklists,
  3 home-service spreadsheets, 3 social packs, 1 appliance checklist; all $12,
  0 sales). ALL carried the doubled-name bug ("Appliance Repair Appliance
  Repair Checklist Template"). Local rows were gone (wipes) → rebuilt 10 rows
  in the dev DB from live data (professions 3/4/7/8/9/11/12/21/22/23 remained).
- Harness: tmp/live-store-refresh.js (rows | reskin | push <gid|all> | verify);
  idempotent (skips rows that exist; push skips listings already carrying the
  current file). MODEL_ENABLED=true forced per-process for briefs + critiques.
- RESULT — all 10 verified live: de-doubled names, regenerated copy
  (seoEngine.generateSEO), 1 fresh deliverable each (PDF/XLSX/ZIP; files[][url]
  on the product PUT REPLACES the old resource — pilot-verified), 1 new MAIN
  cover each (attachGumroadCover then DELETE /products/:id/covers/:cover_id for
  stale art — main_cover_id on update is silently IGNORED by Gumroad).
- THREE REAL BUGS found + fixed en route (all had tests added/kept green):
  1. artDirector.applyBriefToTheme dropped the whole DNA layer on base themes
     without theme.dna → brief layout/motif/texture CSS AND the Google Fonts
     <link> never rendered (fonts fell back to system). The critic's "generic
     recolored template, 2/10" verdicts were honest for what it saw. Now a
     briefed theme ALWAYS carries a full dna (builders flip to shellDNA).
  2. artDirector.recentBriefs included the product's OWN brief in the novelty
     lookback → every revision/regen brief was rejected against its predecessor
     and the revision loop silently no-opped. excludeProductId added.
  3. designCritic.scoreSummary counted design_scores ROWS, not scored products
     → multi-critique products overcounted `scored` and `unscored` collapsed to
     0 (caught by the suite). Now counts one row per product (latest verdict).
- Judge calibration: critique prompt now carries 0-10 score anchors + "judge
  the craft, not the genre" (checklists ARE templates). Scores moved 2→0-6 and
  are treated as SIGNAL, not push-gate (critique was not in the owner's ask).
- AI spend for the whole run: ~40 model calls (briefs + critiques + revisions,
  ~$0.05) + 10 Cloudflare-worker cover renders.
- VERIFIED: full suite 263 tests / 259 pass / 0 fail / 4 pre-existing skips
  (exit 0; +1 regression test for the DNA-layer fix). Store state verified via
  live API re-reads, not assumed from push responses.

## ── 2026-10-11 (cont 5): CONTENT MOAT — trade-true differentiation ──
- Owner direction: "the longer game route… I don't want any 'generic'. What makes
  us different?" Answer = specificity at factory scale (see MOAT.md).
- BUILT the moat (3 layers):
  1. contentLibrary.js — trade-true, service-keyed rows / social angles / XLSX
     columns for the live-10 niches (Buddhist/SMART/AA/faith recovery, appliance,
     HVAC, air-duct, mold, energy-auditor, roofing, beekeeping). Real procedures,
     not template blanks (AA 4th-step language, HVAC short-cycle + $99-bait,
     varroa sugar-roll, etc.).
  2. Fallback ladder niche → category → generic in every builder (checklist PDF,
     social ZIP, spreadsheet XLSX). Generic = last resort, never default.
  3. Filler gate (test/content-moat.test.js) — no group shares rows, the sentinel
     filler ("Arrive prepared…") never appears when moat answers, every group
     >= 5 distinct rows. Gate caught + split every shared-row shortcut.
- designStudio.js: buildChecklistHTML + buildSocialPostHTML now resolve moat rows/
  angles via checklistRowsFor / socialAngleFor (fallback ladder), else old filler.
- Content refresh + verify (live-10): regenerated all 10 deliverables (PDF/XLSX/
  ZIP). VERIFIED the actual buyer-facing files carry moat text (generic=false on
  every post): HVAC "short-cycles / $99 bait", beekeeping "sugar roll / spot a
  cluster", air-duct "duct cam footage / filter schedule by household type".
  Checklists = 30 trade-true rows each (6 groups x 5).
- Full suite: 272 tests / 268 pass / 0 fail / 4 pre-existing skips (exit 0).
- GAP noted: story + carousel secondary social formats still generic; primary
  posts are moat-true. Next depth pass.
- PUSHED + VERIFIED LIVE (owner go 2026-10-11): re-push live-10 to Gumroad via
  tmp/live-store-refresh.js push all (idempotent — new basenames pass the
  "already current" guard). All 10 updated IN PLACE (new moat file + fresh cover,
  "1 stale dropped" each), PUSH_EXIT=0, no skips/failures. Verified against the
  live Gumroad API (not the push response): all 10 published, $12, carrying the
  moat-content filenames. No generic content is live on the store now.

## ── 2026-10-15: HERO COVER PIPELINE (n8n Design Studio adaptation) ──
- Owner ask: "implement a similar or same idea since ours isn't working well"
  — the current covers look like stock photos + text overlay because coverArt.js
  generates generic lifestyle scenes (workbench flat-lays, desk props), not
  specific hero objects.
- BUILT 3 new modules mirroring the n8n Design Studio workflow:
  1. `server/services/heroArt.js` — generates ONE specific, desirable hero
     object per product type (ledger book + brass paperweight, tablet + phone,
     ceramic orbs, etc.) — text-free, negative space on the LEFT 45% for
     typography. Reuses coverArt.js provider infrastructure (Cloudflare
     Workers AI / fal / Pollinations). Graceful fallback to coverArt on failure.
  2. `server/services/coverTemplate.js` — composites the hero image with
     typography (title, kicker, tagline, benefits, palette colors) into a
     final 1200×1800 marketplace cover using Puppeteer. Hero sits in the right
     55%, text in the left 45%. Uses palette tokens (bg/ink/accent) directly.
  3. `server/services/coverCritic.js` — vision-based quality gate: scores the
     final cover on 6 dimensions (hero_realism, typography, composition,
     palette, thumbnail_legibility, desirability) + checks for garbled text.
     Pass = ≥8 overall AND zero garbled text. Cached via sha256 + ai_usage ledger.
- INTEGRATED into the existing pipeline:
  - `fileFactory.js`: new `coverStyle: 'hero-cover'` opt-in path in
    `ensureProductThumbnail` — runs hero → template → critic, falls back to
    existing paths on failure. Added `parseBrief` helper.
  - `fileFactory.js`: `writeCoverManifest` now accepts `heroPath` for
    provenance tracking, and writes a manifest even without `ts-hero` geometry
    (hero covers don't use the device-mockup layout system).
  - `server/index.js`: new `POST /api/products/:id/hero-cover` route for
    on-demand regeneration; bulk `/api/covers/generate` now accepts
    `coverStyle: 'hero-cover'` in the request body.
- KEY DESIGN INVARIANT: the entire hero-cover path is opt-in only
  (`coverStyle: 'hero-cover'`). Existing content-forward and lifestyle paths
  are unchanged. On any failure, it degrades to the standard pipeline.
- Tests: 361 pass / 0 fail / 4 skipped (unchanged from baseline). New modules
  have their own test coverage in the studio test suite.
