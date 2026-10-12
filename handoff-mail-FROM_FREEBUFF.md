# Handoff — cover aspect contract + regression triage

**Branch:** `feature/product-real-covers`
**Baseline:** `d08b632` (main at start of branch work)
**Feature commit:** `af8514f` — `Ship real-product cover composites with crop-safe marketplace exports`
**Audit release:** `6891350` deployed successfully. Final release-note commit `697113f8b0b77de0fabc35a64bbfaa2bc306d621` is pushed to `origin/main`; Railway deployment `ce10b41a-278a-4c99-85ea-ad37536eb75e` is SUCCESS and service Online. Production `/api/health` and `/login` return HTTP 200; `/js/console.js` serves JS; anonymous `/api/products` correctly returns 401.
**Worker deployment:** `nichegate-covers`, version `ba04520e-c7de-44d1-9d0e-eb183cd81d57`, deployed to the matching account `74d42a6784c765ed7c4276ab8d1f1c72`.
**Status:** Server and cover Worker are live; authenticated generation smoke passed and actual JPEG bytes verified at 1200×1800.

## Aspect-ratio contract

The marketplace JPEG export is a 1200×1500 (4:5) crop (`x=0, y=150`) from the 1200×1800 (2:3) cover master. The master is retained alongside the marketplace image. The device slot `{x:660,y:300,width:480,height:600}` is fully inside the crop safe rectangle `{x:0,y:150,width:1200,height:1500}`; the composite places the text block/footer in the safe vertical band. Pinterest still selects the full-frame `.master.jpg` image; marketplaces use the 4:5 export. `cover-v5` invalidates old cached previews.

`test/cover-copy.test.js` verifies the master/crop configuration, exact screenshot clip rectangles, retained master and export, and each of the slot's four bounds against the safe crop. Renderer outputs are mocked in this unit test; it validates geometry and screenshot API contract, not a live decoded JPEG's dimensions.

## Failure triage verdicts

All three reported failures predate this branch. Baseline source and `git blame` establish the origin and cause:

1. **Duplicate integration slug — pre-existing in `d08b632`.** `test/integration-boot.test.js` inserted the constant `boot-test-niche` into its configured shared database (no unique `DB_PATH`), so reruns collided. Updated the fixture to a unique name/slug. Bun's `process.execPath` is Bun, not Node, and cannot serve as the Express subprocess runtime; the test now skips under Bun unless `NODE_BINARY` points to Node. Installed user-local Node.js 24.20.0 and ran the integration with `NODE_BINARY` set: **1 pass, 0 fail**.
2. **Pricing winner expectation — pre-existing in `865c7bb`.** Baseline `pricing-auto.test.js` used globally shared `pricing_tests`; `pricingSummary()` compares the entire test population, so other variants could defeat the fixture's assumed winner. The engine also cached settings for 30 seconds. Test now sets process-specific temp `DB_PATH` before database import, and `startPriceTest()` force-refreshes persisted settings at its state-changing boundary to prevent stale variant allocation.
3. **Worker-memory assertion — pre-existing in `865c7bb`.** The test intended to assert deterministic planner output, but with `MODEL_ENABLED=true` an LLM could paraphrase the intent, making exact-call/content expectations nondeterministic. The test now temporarily forces AI off and restores the original setting. No production memory semantics changed.

## Verification

- Full native Node suite, rerun as part of this E2E audit: Node.js 24.20.0 `node --test` — **288 passed, 4 skipped, 0 failed** (292 tests, 29 suites). Boot integration, anonymous-route lockdown, session-gated console, marketplace review/publish guards and preview parity all passed.
- Earlier full Bun suite: `bun test --timeout=12000` — **285 passed, 7 skipped, 0 failed** (292 tests, 44 files); Bun skips the Node subprocess test by default.
- Live Worker `GET /health` — 200 with `{"ok":true,"worker":"nichegate-covers"}`.
- `git diff --check` and staged diff check — passed; staged scan found no credential-like additions.

## Deployment verification and remaining scope

Cloudflare Wrangler authentication is verified for `marina@letsbloww.com`, and the active account ID matched `account_id` in `cf-worker/wrangler.toml`. `npx wrangler deploy --strict` from `cf-worker` deployed version `ba04520e-c7de-44d1-9d0e-eb183cd81d57`; pre-deploy `--dry-run` succeeded and existing `SHARED_KEY` remained present (secret values were not read or displayed). Post-deploy `/health` returned HTTP 200. An authenticated Lucid Origin request returned HTTP 200 with model `@cf/leonardo/lucid-origin`; decoded bytes were JPEG, exactly 1200×1800, 1,605,201 bytes. Focused cover/worker tests passed 29/29. This verifies the Worker generation endpoint; automated image review/composite rendering on product previews and marketplace publishing are not part of this smoke test.
