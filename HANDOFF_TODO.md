# NicheGate — HANDOFF TODO (2026-10-13, cloud session `freebuff/08cf82f8c08302a2e7bf62fe`)

Read this together with `MEMORY.md` → `TASK.md` → `SESSION.md`. Everything below is work that
was **not finished or not verifiable** in this session. Each item lists the evidence, the exact
files, and what "done" means so another model (or the owner on the local machine) can close it.

---

## 0. Session context (what IS done, so it is not redone)

Committed to `main` this session (see `git log`):

- `pdfGenerator.js` — SIGTERM/SIGINT shutdown now closes Chrome **and exits** (`process.exit`),
  so the booted server actually stops (see A1).
- `designStudio.js` — `baseStyle(theme)` renders document pages on a light surface when the
  palette is dark (`theme.dark`), fixing black-on-black deliverable previews (see A2); plus the
  earlier cover-v7 copy/table fixes already logged in `TASK.md`.
- `Dockerfile` — added `fonts-dejavu-core fonts-noto-color-emoji` (see A4, **unverified**).
- Full suite green in this session: `node --test` → **313 tests / 29 suites / 310 pass / 0 fail /
  3 skipped** (28s). Before the shutdown fix the suite **never terminated** (see B1).

Environment limits that produced the open items: this cloud VM has **no `data/` DB content**
(0 products; `data/` and `generated/` are gitignored), **no `.env`** (no Cloudflare worker key,
no Pollinations/Pinterest keys), and **no Docker**, so production-only paths could not be run.

---

## A. Unfinished work — highest value first

### A1. Confirm the container stops cleanly on Railway (SIGTERM)
- **Why:** `pdfGenerator.installShutdownHooks()` used to install SIGINT/SIGTERM handlers that
  called `closeBrowser()` but never ended the process. A SIGTERM'd server kept running until
  Docker's grace period expired (SIGKILL) — and `test/integration-boot.test.js` hung forever
  waiting for the child it spawned.
- **Done so far:** `server/services/pdfGenerator.js` now does `closeBrowser().finally(() =>
  process.exit(130 | 143))` for SIGINT/SIGTERM (`beforeExit` still just closes Chrome).
  Verified locally: `node --test test/integration-boot.test.js` went from 150 s → cancelled
  to **3 s / pass / exit 0**, and the full suite now terminates (313 tests, 0 fail).
- **Remaining:** after the Railway deploy, send `SIGTERM` to the live container (or use a
  Railway "Stop/Redeploy") and confirm the log shows a prompt shutdown, with **no** forced-kill
  and no leftover `chrome` process. Acceptance: container stops in < ~3 s; `/api/health` 200 on
  the next boot; no orphaned chromium.

### A2. Sweep the remaining dark-palette document surfaces for contrast
- **Why:** the recommended theme can be a **dark** palette (e.g. `Onyx Volt` —
  `primary #050505`, `bg #0a0a0a`). `baseStyle()` used `theme.bg` for `body`/`.page`, so those
  products rendered **near-black text on a near-black page** — unreadable in the cover thumbnail
  *and* in the generated PDF. Fixed in `designStudio.baseStyle()` (dark → light `surface` page,
  theme ink + accents kept).
- **Remaining:** builders that set their own page background inline are **not** covered by that
  fix. Grep `${theme.bg}` / `background:' + theme.bg` inside `server/services/designStudio.js`
  and check the pages that carry body text (journal, worksheet, planner, party-printable,
  wall-art, `buildBrandKitHTML`, `buildPyramidHTML`-style tables). Cover-style blocks that are
  intentionally dark (`playbook-cover`, `final-page`, `.card`, `.slide`, `.story`, `.hero`) and
  already set `color:#fff` are fine.
- **Acceptance:** for every product type, render with a dark theme (`Onyx Volt` /
  `Midnight Chrome`) and confirm body text has ≥4.5:1 contrast in the PDF and in the cover
  raster. Files: `server/services/designStudio.js`, plus `test/cover-copy.test.js` /
  `test/design-critic.test.js` if you add an assertion.

### A3. Playbook-type thumbnails crop the product page (title invisible)
- **Evidence:** `tmp/covers-out/playbook-pyrotechnics.jpg` (rendered this session) shows a black
  preview with only the badge chip and the (tofu) emoji; the product page's own `H1` — “The
  Complete Pyrotechnics / Fireworks Business Playbook” — is **not visible**. Measured with
  Puppeteer: the `H1` sits at `y = 460–608` inside the 800×1040 raster
  (`tmp/playbook-raster.jpg` **does** contain it, white on black).
- **Cause:** the raster is portrait **800×1040** but the cover's preview box is roughly
  **1.8:1 wide** and the `<img>` is `width:100%; height:auto` → only the top ~42 % of the raster
  (≈ `y ≤ 435`) is visible, so the playbook cover page's `H1` (44 % down, because
  `.playbook-cover` is `height:1123px` with `justify-content:space-between`) is cut off.
- **Fix options (pick one):** (a) derive the raster viewport from the target screen box aspect
  (`ensureProductThumbnail` already knows the slot via `detectArtScreenSlot`), or (b) use
  `object-fit:cover` + `object-position` per product type, or (c) shorten `.playbook-cover` so
  its headline lands in the top 40 % of the raster.
- **Acceptance:** re-render a `playbook`, a `planner` and a `journal` cover and confirm each
  shows the product's own `H1` inside the tablet screen.

### A4. Emoji render as tofu boxes in generated PDFs/covers on Railway (Docker fonts)
- **Evidence:** in this VM (no emoji font) the profession emoji and the checklist group
  numerals render as empty boxes in the cover rasters — e.g.
  `tmp/covers-out/checklist-aa-recovery.jpg` (the header icon and the teal group boxes).
  The production `Dockerfile` installed **only** `fonts-liberation`, i.e. the live container has
  the same gap, and remote Google-Fonts links are deliberately aborted in
  `renderProductCoverPreview()`, so no fallback font is fetched.
- **Change made this session (NOT verified):** `Dockerfile` apt line is now
  `chromium ca-certificates fonts-liberation fonts-dejavu-core fonts-noto-color-emoji`.
  Package existence confirmed for Debian bookworm (`packages.debian.org/bookworm/fonts-noto-color-emoji`
  → HTTP 200; `sources.debian.org` exact match). No Docker in the cloud VM, so the image was not built.
- **Remaining:** build the image (`docker build .`), then render one cover + one PDF **inside the
  image** and confirm the emoji render. If the build fails on a package name, drop back to
  `fonts-dejavu-core` only and add an `fc-cache` step. Acceptance: no tofu glyphs in a rendered
  cover or PDF.

### A5. Pollinations cover-art fallback is dead (HTTP 402)
- **Evidence:** every non-Cloudflare render this session logged
  `[COVERART] failed: Request failed with status code 402` (Payment Required) from
  `viaPollinations()` (`server/services/coverArt.js`, `https://image.pollinations.ai/prompt/...`
  with `nologo=true`). Anonymous Pollinations no longer serves the configured default model.
- **Impact:** with `COVER_ART_PROVIDER` unset (the code default) or when the Cloudflare worker is
  unavailable, covers silently degrade to `buildPlainCover()` (HTML-only, no lifestyle photo) —
  so any non-Cloudflare environment loses the “thumb-stopper” look.
- **Remaining:** support `POLLINATIONS_TOKEN`/model selection in `viaPollinations()`, or switch the
  documented free fallback to another provider, **or** update `MEMORY.md`/comments to state that
  the fallback requires a token and that production must run `COVER_ART_PROVIDER=cloudflare`.
  Acceptance: a cover generated with the fallback provider actually comes back with art.

### A6. Cover thumbnails for the 5 newest production products were never rendered here
- **Why:** this VM's DB has **0 products** (`data/` is gitignored; only the schema was restored),
  so the “5 most recent covers” could not be produced from real rows. I rendered 5 representative
  covers from fresh fixture rows instead (`tmp/covers-out/*.jpg`, gitignored, disposable):
  `spreadsheet-roofing`, `booking-massage-therapy`, `profit-calculator-drywall`,
  `checklist-aa-recovery`, `playbook-pyrotechnics`.
- **Remaining (local machine):** render the real newest rows —
  `node scripts/render-cover.js <id>` per product, or hit **Regenerate All Covers** in the
  Flight Deck (`POST /api/products/preview-batch?force=1`) so the queue refreshes. `COVER_VERSION`
  is now `cover-v7`, so any `-cover-v6-` file is treated as stale and regenerated on touch.
- **Note:** 4 of the 5 fixture covers used the plain fallback (no art) because of A5 — re-render
  them once `COVER_WORKER_URL`/`COVER_WORKER_KEY` are available to see the real composite.

### A7. Long niche names clip the cover subtitle mid-word
- **Evidence:** `tmp/covers-out/profit-calculator-drywall.jpg` — the sub reads
  “priced for a solo oper…” (the niche name “Drywall Contractor / Finisher” pushes the sub past
  its line clamp).
- **Remaining:** word-safe clamping or a size step-down for long profession names in
  `buildPlainCover` / `thumbCoverCopy` (`server/services/designStudio.js`).
  Acceptance: no subtitle ends with a partial word; sub still ≥ 2 lines max.

### A8. Decide whether “Regenerate All Covers” should include `listed` products
- `server/services/previewBatch.js` `force=1` selects `status IN
  ('draft','pending-review','approved')`. Items already `listed` (24 on Gumroad awaiting Etsy)
  are only refreshed when touched individually, so a batch re-roll after a cover-version bump will
  not refresh them. Add `'listed'` deliberately (and note the extra render/API cost) or document
  why not. Acceptance: an intentional decision recorded in `TASK.md`.

---

## B. Verification gaps (checks that could NOT be run here — run them on the local machine)

1. **`node --test` before the fix never exited** — root cause in A1 (spawned child ignored
   SIGTERM). If another hang appears, check for any other `process.on('SIGTERM')`/`SIGINT`
   handler that does not exit, and for spawned servers in tests.
2. **No Docker build** (A4) — the Railway image was not built in this session.
3. **No production data** — no real rows, no `design_brief`s, no `sales`/`metrics` rows; nothing
   here exercised the real catalog. Cover correctness against the live catalog is **unverified**.
4. **No secrets / no live marketplace calls** — Gumroad/Etsy publish, the Cloudflare cover worker,
   and the Etsy OAuth bridge were not exercised in this session.
5. **Railway deploy itself is unverified from here** — pushing `main` triggers the Railway build;
   confirm the deploy log says the new commit is live and `/api/health` returns 200 with the
   expected `NODE_ENV=production` gates (`ADMIN_PASSWORD` ≥ 8 chars, valid
   `DISCORD_WEBHOOK_URL`, volume mounted at `/app/data`).
