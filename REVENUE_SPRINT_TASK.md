# TASK: REVENUE SPRINT — first dollars from existing inventory

**Priority:** CRITICAL — run IMMEDIATELY after the cull task. This is the shortest path to revenue; everything else is capacity.
**Principle:** money = listing × traffic. Both exist partially already — finish them before building anything new.

---

## 1. Pick the money products (before publishing anything new)

From the post-cull catalog, select the top **10–15 products** by this order:
1. Any with real sales (proven demand beats guesses)
2. Any already live on Gumroad (they have listings; they just need traffic)
3. Highest-confidence niches from the vetting scores (post-Phase-3 data)

These are the sprint catalog. Everything else waits.

## 2. Make the sprint catalog maximally sellable (1–2 days)

For each sprint product:
- Run the listing optimizer (title/tags/description) — it exists; use bulk weak-listing rewrite
- Verify the deliverable file + preview render (physical gate)
- Confirm price passes the `pricingEngine` launch rule (first 14 days −30%)
- Assign each product its best-fit design DNA from `design-references/MANIFEST.md` for cover refresh ONLY if the current cover is weak — don't stall the sprint on re-designs

### 2b. Fold in the design-task follow-ups (do here, NOT as standalone tasks)
The design-quality task left two verifications pending. Run them HERE, only on sprint products, where they pay for themselves:
1. **Live critique of each sprint product** (designCritic on the brief-by-default builds) — this is the measured lift, but scoped to products that are about to be sold. Score ≥ 6.5 → ship. Score < 6.5 → one revision pass (this closes the stub-only revision-loop surface on exactly the products that matter).
2. **Reskin-by-DNA for any sprint product whose current cover is weak** — `reskinProduct` now exists and is verified; use the MANIFEST best-fit DNA per niche (persona boards where the tribe fits).
Do NOT run critiques/revision loops across the whole catalog — that is Phase 5's retro sweep, later, and only AFTER the sprint produces sales data.

## 3. Point traffic at product pages, not the store homepage

The pin-launch kit (`pin-launch-kit/`, outside this repo) has 30 pins with store-homepage UTMs.
- For each sprint product, get its Gumroad permalink and update the matching pins' destination.
- Import the pins via `POST /api/pins/schedule-batch` (they map 1:1 to the pins table shape; origin=manual-kit).
- Let the pin engine's 19-slot weekly grid take over scheduling.
- Target: **all 30 pins live within 7 days**, 3–5/day.

## 4. Etsy = second money rail (owner-gated, start now in parallel)

- Owner: complete Etsy identity verification (the only blocker).
- When verified: publish the top 5 sprint products to Etsy with the 20/day cap.
- Etsy buyers search differently — run the listing optimizer with Etsy-flavored titles before pushing.

## 5. Conversion instrumentation (small, high value)

- Verify UTM attribution flows into Gumroad traffic stats (click-side).
- Add a daily KPI pulse to Discord: pins posted, store visits (if available), units, revenue.
- If any sprint product gets 100+ pin impressions with 0 clicks → swap its pin design DNA (the critic loop's job later; manual swap now).

## 6. Explicitly OUT of scope for this sprint

- No new product generation (the sprint sells; the design task improves for the NEXT wave)
- No owned storefront, no memberships, no affiliates — these need traction data first
- No automation/publishing opt-in changes beyond what the sprint needs

## Definition of done

- [ ] Sprint catalog (10–15) live, optimized, priced with launch rule
- [ ] 30 pins imported and scheduled; first 15 posted manually by owner in week 1
- [ ] At least one Etsy listing live if verification cleared
- [ ] Daily KPI pulse running
- [ ] First sale recorded in metrics (the real finish line)
- [ ] TASK.md updated; nothing committed/pushed without owner audit

**Why this and not anything fancier:** every learning system (vettingLearner, pricing A/B, winnerEngine) is starved without real sales. The sprint's true output is not the dollars — it's the outcome data that makes every later play smarter.
