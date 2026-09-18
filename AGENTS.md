# AGENTS.md — handoff instructions for OpenCode (and any agent)

**Project:** NicheGate — autonomous digital-product factory.
Discover niches → generate file-backed products (PDF/XLSX/ZIP) → publish to Gumroad + Etsy, 24/7.

---

## START HERE — read in this order

1. `MEMORY.md` — persistent architecture facts + hard rules.
2. `TASK.md` — goal, "done so far", current file states, next 3 steps, "do NOT redo".
3. `SESSION.md` — full narrative of the most recent feature push (2026-09-15 → 09-17).

These three are the single source of truth. Treat them as authoritative over any stale README/ROADMAP/PUNCH_LIST numbers.

---

## Git / deploy state as of handoff (IMPORTANT — do not auto-push)

- **Working tree on `main` is clean.** Local `main` is **1 commit ahead** of `origin/main`:
  - `652cb96` — `docs: session log + refreshed TASK/MEMORY`. **Committed locally, NOT pushed, NOT deployed.**
- **Do not push or deploy until the owner audits.** Wanted state: saved locally, not deployed.

### Un-merged branches (saved on GitHub, NOT yet in `main`) — this is the audit backlog

| Branch | Contents | Status |
|---|---|---|
| `copilot/vscode-mttuxdix-pag6` | 16 files, +919/−72. **New `server/services/decisionEngine.js` (629 lines)**, new `AUDIT.md`, plus edits to dashboard/store/index, bundle/discovery/marketplace/seo/xlsx/setup | ahead=1 behind=1 vs main (diverged) |
| `copilot/current-status-update` | `client/index.html` (+39) + `package-lock.json` (+2019) | small, likely superseded |
| `copilot/autonomous-business-tools-integration` | empty vs main | already merged / nothing to review |

### About the "35 uncommitted changes"

There are **no 35 pending files** in any working tree. The "35" corresponds to:
- ~62 **dangling cline checkpoint snapshots** (2026-09-15 cover-art session, several show `delta-files=35`). They are recoverable history via `git fsck --unreachable`, not active changes.
- Ignored runtime data is **not** "changes": `generated/` = 318 files gitignored.

---

## Canonical project facts (verified)

- **Stack:** Node ≥ 22, Express 5, SQLite (`node:sqlite`, WAL) at `data/profession-box.db`, Puppeteer PDFs, SheetJS XLSX, adm-zip.
- **Run:** `start-nichegate.bat` or `npm start` → http://localhost:5000 (`/store`, `/setup`, `/login` only when `ADMIN_PASSWORD` set). Prod `PORT=5000`, bind `0.0.0.0`.
- **Root:** `C:\Users\linde\.skales-data\workspace\nichegate` · `github.com/marina703/NICHEGATE.git` (`main`).
- **Deploy:** Railway project `NICHEGATE` (production, region `ams`, Dockerfile, volume `/app/data`). Cover worker: Cloudflare Workers AI (FLUX) at `https://nichegate-covers.marina-74d.workers.dev`.
- **AI layer:** `server/services/modelRouter.js` + `modelConfig.js` + `conceptEngine.js` + `contentLibrary.js`. OpenRouter primary (scan=gemini-flash-1.5, judge=claude-3.5-haiku, ideation=deepseek-chat). `MODEL_ENABLED` master switch.
- **Product types:** `server/services/productTypes.js` is the single registry.
- **Covers:** `server/services/coverArt.js` + `previewBatch.js` + `cf-worker/src/index.js`. `COVER_ART_PROVIDER=cloudflare`.
- **Auth:** `server/services/auth.js` (optional; `ADMIN_PASSWORD` → `ng_session` httpOnly cookie).

---

## Hard rules (from MEMORY.md — follow exactly)

- Update `TASK.md` before stopping. Never redo "Done/Do-NOT-redo" items — `git diff` first.
- Cheap models do 90% of work; escalate to frontier only for architecture.
- AI calls must never throw upstream — return `null` and degrade gracefully (`conceptEngine` does).
- **No listing without a real file** — `fileFactory.ensureProductFile` must run before publish.
- Keys/secrets only from `.env`, never committed or logged.
- Adding a product type = one additive entry in `productTypes.js` (+ a `build*HTML` builder if it needs a custom layout). Never change existing type keys/prices.
- Bundles are `products` rows with `type='bundle'` (no separate `bundle` table).
- Auth is a no-op until `ADMIN_PASSWORD` is set — never block the autonomous engine.

---

## Known open items (next 3 steps — see TASK.md for full detail)

1. Set `MODEL_ENABLED=true` in `.env` (key already present) to switch on the concept engine; add `DISCORD_WEBHOOK_URL` for alerts.
2. Verify `ETSY_CLIENT_SECRET` is **distinct** from `ETSY_CLIENT_ID` (readiness checker flags `id === secret`); reconnect Etsy at `/setup`.
3. Start server → approve Review Queue + Deploy Bundles (Gumroad 10/day limit; re-run daily).

## Environment config snapshot (secrets redacted)

- `OPENROUTER_API_KEY` set; `MODEL_ENABLED` **NOT set → AI concept layer OFF**.
- `COVER_ART_PROVIDER=cloudflare`; `COVER_WORKER_URL`/`COVER_WORKER_KEY` set.
- `GUMROAD_ACCESS_TOKEN` set; `ETSY_CLIENT_ID` set.
- `DISCORD_WEBHOOK_URL` **empty**; `FAL_API_KEY` not set (fal unused while on Cloudflare).

## Tests

```
node --test
```
Expected: 77 tests · 18 suites · 74 pass · 0 fail · 3 skipped.
