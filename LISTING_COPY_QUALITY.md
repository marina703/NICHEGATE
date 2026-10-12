# TASK: LISTING COPY QUALITY — moat-informed copy as the default (the "elite boilerplate" fix)

**Priority:** HIGH — small task, direct conversion impact (Pinterest pins now drive traffic to these listings; the copy is the last generic layer).
**Origin:** owner observation 2026-10-12. The 10 live Gumroad listings carry the deliverable-level moat content (trade-true rows, real procedures) but the LISTING COPY still uses the generic template: "designed to make your business look elite… clean, modern layout… customize colors, text, and fonts" — plus grammar bugs ("a Professional instagram templates"). The one-time manual fix is applied (10/10 rewritten via Gumroad API, 2026-10-12); this task makes the *generator* produce that quality automatically.

---

## 1. Why the copy is generic (root cause)

`listingOptimizer`/`seoEngine` generate copy from product name + type + niche metadata only. The moat specifics live in the deliverable build data (checklist groups/rows, social angle titles, spreadsheet tab structures) and the concept JSON — neither reaches the listing-copy prompt. So every listing gets the same 4 bullets regardless of what's actually inside the file.

## 2. Scope — 3 Phases

### PHASE 1 — Moat context in the listing-copy prompt
1. `listingOptimizer` gains a **content-map input**: for each product, pull the deliverable's actual content identity from `contentLibrary`/the build record — checklist group names + sample row language, social pack angle titles, spreadsheet tab names/structure.
2. Rewrite the copy prompt to a buyer-first structure: hook line (specific to the trade) → WHAT'S INSIDE (4–5 bullets, each naming a real piece of the artifact) → WHO IT'S FOR → format + instant-download close. Forbid: "look elite", "clean, modern layout", "customize colors, text, and fonts", "Auto Theme", and any internal jargon leaks.
3. Few-shot: the 10 manually rewritten descriptions (applied 2026-10-12, visible in this repo's history / Gumroad API) become the canonical examples.

### PHASE 2 — Boilerplate gate (novelty-style, for copy)
1. A `listingCopyGate`: rejects descriptions that (a) match the old template signature (regex on the banned boilerplate set), (b) contain fewer than **2 deliverable-specific tokens** drawn from the content map, or (c) trip basic grammar patterns ("a Professional instagram templates"-class agreement bugs — simple lint).
2. Gate runs wherever listing copy is produced: optimizer, publish path, and the live-store refresh harness. Failing copy is regenerated once; second failure falls back to the manual-quality template (the 10 rewrites as structure templates with slot-filling), never the old boilerplate.
3. Persist gate verdicts alongside listing history (pattern: `cover_reviews`).

### PHASE 3 — Anchor the orphan listings
1. The 10 live Gumroad listings are currently managed by the refresh harness and are NOT rows in the production `products` table — the command center (optimizer, BI, reskin, pins) cannot see them.
2. Backfill: create/refresh product rows linked via `marketplace_id` (source of truth = Gumroad API pull, idempotent — skip rows already present). Names/descriptions sync FROM Gumroad so the harness and the DB agree.
3. After anchoring: BI, review queue, and the pin engine operate on the real store.

## 3. Constraints

1. Never print/rotate marketplace secrets in logs; Gumroad access stays via the existing token.
2. The gate never blocks publishing on AI-off (deterministic fallback = the manual-quality template).
3. Copy claims must stay true to the artifact — no invented features beyond the content map.
4. Tests for the gate + the moat-context assembly; full suite green; nothing pushed/deployed without owner audit.

## 4. Definition of Done

- [ ] Next AI-generated listing description contains ≥2 deliverable-specific details and zero banned-boilerplate matches
- [ ] Gate rejects the old template verbatim (regression test with the literal old copy)
- [ ] The 10 live listings exist as product rows in prod DB, marketplace-linked, visible in Catalog/BI
- [ ] TASK.md session summary in the existing format
