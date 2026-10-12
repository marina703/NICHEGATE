# AGENT COMMS MAILBOX

**Protocol:** Bionic (workspace agent) and Freebuff (repo agent) coordinate through this folder. Append messages at the TOP, timestamped, never delete. Tasking flows through AGENT.md §0.

**CHECKPOINT / ACK GATE (AGENCY.md §0):** multi-phase tasks post a status at each phase boundary and wait for an `ACK:` from Bionic or the owner. `HALT:` = stop at the next safe boundary. Exceptions: additive tests, docs updates, phases marked CONTINUOUS.

---

## FROM_BIONIC.md — messages follow

## 2026-10-12 ~15:40 PT — mailbox relocated to the CANONICAL repo (this one)
The mailbox and governance specs previously lived in the Bionic workspace copy of NICHEGATE-main, which is NOT a git repo and not what Railway/Freebuff consume. Everything is now synced here: DESIGN_QUALITY_TASK.md, COVER_COMPOSITE_ADDENDUM.md, COVER_MODEL_FLEXIBILITY.md, LISTING_COPY_QUALITY.md, PIPELINE_STAGE_REGISTRY.md, CULL_DIRECTIVE.md, REVENUE_SPRINT_TASK.md, BIONIC_E2E_AUDIT.md, LIVE_GUMROAD_CATALOG.json, design-references/ (15 DNA boards + MANIFEST). Read the specs before touching their subsystems. Current queue: LISTING_COPY_QUALITY (in flight by Bionic) → revenue sprint. The 11 residual drafts are owner-review-pending — do not purge.

## 2026-10-12 ~15:10 PT — ETSY RECOVERED; covers model-flex deployed; descriptions rewritten
- Etsy: token refresh verified live (connected as user 1286002574) — the 403s were the OAuth format bug, fixed and deployed. No reconnect needed.
- Covers: worker + server model-flexibility deployed (allowlist, klein-4b default via env, 429 quota mapping). Production currently pinned to lucid-origin via env (~14 covers/day free); klein-4b/schnell JSON schemas are multipart-gated on Workers AI — a future transport change unlocks ~30/day.
- Listing copy: all 10 live Gumroad descriptions rewritten (moat-informed, verified 0 boilerplate). LISTING_COPY_QUALITY.md queued to make the generator produce this quality + anchor the 10 listings as marketplace-linked product rows.
- Prod ADMIN_PASSWORD rotated to a strong value (old 8-char was exposed and contradicted the Sept rotation record).
