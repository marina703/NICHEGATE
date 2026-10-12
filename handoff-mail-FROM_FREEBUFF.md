# Handoff — cover aspect contract + regression triage

**Branch:** `feature/product-real-covers`
**Baseline:** `d08b632` (main/origin/main at start of branch work)
**Commit:** `af8514f` — `Ship real-product cover composites with crop-safe marketplace exports`
**Status:** committed locally on `feature/product-real-covers`; nothing pushed or deployed. Full release is blocked until Cloudflare Wrangler is authenticated, so the matched Worker/server release can be published together.

## Aspect-ratio contract

The marketplace JPEG export is a 1200×1500 (4:5) crop (`x=0, y=150`) from the 1200×1800 (2:3) cover master. The master is retained alongside the marketplace image. The device slot `{x:660,y:300,width:480,height:600}` is fully inside the crop safe rectangle `{x:0,y:150,width:1200,height:1500}`; the composite places the text block/footer in the safe vertical band. Pinterest still selects the full-frame `.master.jpg` image; marketplaces use the 4:5 export. `cover-v5` invalidates old cached previews.

`test/cover-copy.test.js` verifies the master/crop configuration, exact screenshot clip rectangles, retained master and export, and each of the slot's four bounds against the safe crop. Renderer outputs are mocked in this unit test; it validates geometry and screenshot API contract, not a live decoded JPEG's dimensions.

## Failure triage verdicts

All three reported failures predate this branch. Baseline source and `git blame` establish the origin and cause:

1. **Duplicate integration slug — pre-existing in `d08b632`.** `test/integration-boot.test.js` inserted the constant `boot-test-niche` into its configured shared database (no unique `DB_PATH`), so reruns collided. Updated the fixture to a unique name/slug. Bun's `process.execPath` is Bun, not Node, and cannot serve as the Express subprocess runtime; the test now skips under Bun unless `NODE_BINARY` points to Node. Installed user-local Node.js 24.20.0 and ran the integration with `NODE_BINARY` set: **1 pass, 0 fail**.
2. **Pricing winner expectation — pre-existing in `865c7bb`.** Baseline `pricing-auto.test.js` used globally shared `pricing_tests`; `pricingSummary()` compares the entire test population, so other variants could defeat the fixture's assumed winner. The engine also cached settings for 30 seconds. Test now sets process-specific temp `DB_PATH` before database import, and `startPriceTest()` force-refreshes persisted settings at its state-changing boundary to prevent stale variant allocation.
3. **Worker-memory assertion — pre-existing in `865c7bb`.** The test intended to assert deterministic planner output, but with `MODEL_ENABLED=true` an LLM could paraphrase the intent, making exact-call/content expectations nondeterministic. The test now temporarily forces AI off and restores the original setting. No production memory semantics changed.

## Verification

- Full native Node suite: user-local Node.js 24.20.0 `node --test` — **288 passed, 4 skipped, 0 failed** (292 tests, 29 suites). Integration boot ran and passed.
- Earlier full Bun suite: `bun test --timeout=12000` — **285 passed, 7 skipped, 0 failed** (292 tests, 44 files); Bun skips the Node subprocess test by default.
- Live Worker `GET /health` — 200 with `{"ok":true,"worker":"nichegate-covers"}`.
- `git diff --check` and staged diff check — passed; staged scan found no credential-like additions.

## Remaining limitations / deployment gate

Cloudflare Wrangler 4.149.0 reports unauthenticated and directs `wrangler login`; no Cloudflare credential environment variables are available. I did not initiate the interactive login or push either release target. To avoid deploying only the server while the paired Worker is unavailable (or vice versa), nothing was pushed and neither Railway nor the Worker was deployed. Live photo-backed 1200×1800 generation remains unverified; Worker health is live, but that does not test model generation.
