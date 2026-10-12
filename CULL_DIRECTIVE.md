# TASK: Catalog Cull — remove the trash from the 353-product backlog

**Priority:** HIGH — run this IMMEDIATELY after the current task completes, before the design-quality task.
**Rationale:** the backlog is mostly low-quality drafts. A bloated catalog drags Shop Health, wastes Etsy listing fees on dead inventory, and pollutes the review queue. Volume was never the asset; conversion rate is.

---

## 0. What we are NOT doing

- NOT deleting the whole DB, NOT touching trends/professions/settings.
- NOT deleting anything while another task or automation cycle is running (race risk). Run this as its own session/cycle.
- NOT deleting blindly: the keep-set below is small and deliberate.

## 1. Preserve learning data FIRST (one-time export)

Before deleting anything, export to `data/backups/cull-archive-<date>.json` (and keep the DB file backup `backup-database` action already provides):

1. All `metrics` rows for products with ANY sales (units > 0).
2. The products rows (name, concept, type, niche, price, status) they belong to.
3. `vettingLearner` weights state + example count (settings/weights store).

Reason: `vettingLearner` trains on real activation→sale outcomes. The purge endpoint deletes child rows including metrics — if we wipe everything, learned weights reset to factory. The export is the insurance.

## 2. The keep-set (protect these)

Keep a product ONLY if any of:
- `marketplace_id` is set (it is LIVE on Gumroad/Etsy) — see §3 for live listings.
- `metrics.sales >= 2` (proven winner or near-winner).
- It is a `winnerEngine`-amplified product (`amplified = 1`) whose parent qualified.
- Status is `approved` AND it was created within the last 7 days (fresh work you may still want to review — owner can shorten this window).

Everything else (drafts, rejected, zero-sale stale backlog) is cull-eligible.

## 3. Live listings that are trash

For keep-set exclusions that are `marketplace_id`-set:
1. Unpublish/retire them via the existing marketplace update APIs (Gumroad unpublish; Etsy inactive/delete listing) — do NOT leave orphaned live listings.
2. Respect marketplace daily caps (Gumroad 10/day, Etsy 20/day). Spread across cycles.
3. Only after unpublish confirms: delete the local row via the normal delete_product path (with confirm gate).

Owner exception: if the owner says a live listing stays even though it's in the cull set, obey the owner.

## 4. The bulk purge

For the remaining cull-eligible products (drafts/rejected, no marketplace_id):

- Use the existing `POST /api/products/purge?hours=0` semantics (or per-row delete via the registry action) — it removes product files and cleans child `product_id` rows, and structurally protects marketplace-linked products.
- Batch in chunks of ~50 with a log line per chunk (products deleted, files unlinked).
- Zero fake success: report exact counts deleted / kept / unpublish-failed.

## 5. Aftermath checks (verify, then record)

- `SELECT COUNT(*) FROM products` before/after — record both.
- `metrics` rows remaining for archived winners match the export.
- Review queue, Home KPIs and BI Shop Health recalculate sanely (no crashes, no negative counts).
- Etsy listing fee exposure drops (fewer active listings) — note the count.
- Log the whole operation in TASK.md session-summary format. Do NOT commit/push (owner audits).

## 6. Out of scope

- Trends, professions, pins, sequences, ads, settings — untouched.
- No schema migrations.
- No new product generation during the cull.
