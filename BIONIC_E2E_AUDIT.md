# BIONIC E2E AUDIT — 2026-10-12 (post cover-release + marketplace-fix)

**Auditor:** Bionic (independent of both Freebuff author sessions)
**Scope:** repo/hygiene, independent test run, production read-only sweep, live-boot E2E with throwaway DB, cover-pipeline deep-dive.

---

## 1. Static & hygiene — PASS

- Full suite rerun independently (`node --test`, Node 24.20.0): **294 tests / 290 pass / 0 fail / 4 skipped** — matches Freebuff's reported numbers exactly.
- Working tree clean; commits well-structured (`af8514f` feature → `2365987`/`9928ecd`/`6891350`/`697113f` release+audit records → `442bee5` deploy status → `4a054b3` Etsy/eBay fixes).
- Mailbox protocol adopted: `handoff-mail-FROM_FREEBUFF.md` created with substantive handoff content.

## 2. Production read-only sweep — PASS

- `/api/health` 200 · `/login` 200 · `/api/auth/status` 200 · `/api/model/status` **401** (correct — matches the 2026-09-26 hardened anonymous surface; its old public 200 predates lockdown).
- Anonymous lockdown: `/api/products`, `/api/console/overview`, `/api/pins`, `/api/pricing/pnl`, `/api/vetting/weights`, `/api/worker/memory` → **all 401**.
- Storefront stays deleted: `/store`, `/store.html` → **404**; `/api/store/products` → 401.

## 3. Live-boot E2E (throwaway DB, authed) — PASS with one critical finding

Boot: `DB_PATH=tmp/…` + `ADMIN_PASSWORD` set, port 5099, AI ON.
- Health 200 (1s), login 200, console overview 200, **23 professions auto-seeded**.
- `POST /api/products/generate-custom` (AI on): **worked end-to-end** — product created (`id 1`, invoice type, origin manual).
- `POST /api/covers/generate`: **FAILED — `generated:0, failed:1`** with no per-item error detail.

## 4. CRITICAL FINDING — cover generation is quota-starved

Root-caused by direct worker probes:
- Worker `/health`: 200, alive.
- Direct generation POST (legal 1200×1800 payload, correct `x-ng-key`): upstream Cloudflare error passed through:
  **`4006: you have used up your daily free allocation of 10,000 neurons`** — reproduced twice.
- Mechanism: worker's catch-all maps ANY upstream failure to 502 → server logs `[COVERART] failed: Request failed with status code 502` → API returns `failed:1, items:[]` with **no reason surfaced**.
- Consequence: today's live-10 cover regeneration + the verification render consumed the entire free daily neuron allocation. **Free tier supports only a handful of 1200×1800 Lucid Origin covers per day.** This is a hard factory-capacity ceiling, not a bug.
- Fail-closed behavior held: no cover artifact → no review → marketplace upload correctly blocked (per `cover-safety`/`marketplace` suites).

## 5. Findings & required actions

**F1 (owner decision):** Cloudflare Workers AI capacity. Options: (a) upgrade to Workers Paid — daily 10k neurons still included, overage metered (verify current neuron pricing for `lucid-origin` at 1200×1800 before deciding volume economics); (b) stay free and cap covers/day (~5–10) with queueing across days; (c) add a secondary image provider as fallback. Decision needed BEFORE the sprint's cover-regeneration step.

**F2 (code, small):** observability — `covers/generate` must surface per-item error reasons (at minimum classify quota-4006 as 429 with a clear message instead of generic 502); add a `covers_quota` health note so the console shows remaining capacity instead of silently falling back.

**F3 (process):** Freebuff's smoke explicitly excluded review/composite on previews and publishing — this audit covered generation + artifact inspection; a full composite render E2E must be re-run AFTER F1 is resolved (today it cannot run at any budget).

## 6. Verification status of prior claims

| Claim | My verdict |
|---|---|
| Suite green 290/0 | ✅ reproduced independently |
| Prod lockdown posture | ✅ reproduced |
| Worker live, native 1200×1800 | ✅ (Freebuff's render) — but **capacity-exhausted as of ~11:00** |
| Etsy OAuth form-encoding fix | ✅ code + tests verified; production reconnect still owner-side |
| eBay source disabled-by-default | ✅ per code/tests |
| Cover aspect contract (4:5 export from 2:3 master) | ✅ geometry test asserts slot bounds vs safe crop — **not yet exercised live end-to-end** (blocked by F1) |

Residue: `tmp/audit-e2e/` removed per smoke-cleanup convention.
