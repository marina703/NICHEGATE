# TASK: Design Quality Upgrade — From Template Mail-Merge to Generative Art Direction

**Priority:** HIGH — product quality is the #1 growth bottleneck. Catalog volume is fine; the designs look like recolored clones of 8 hardcoded layouts.

**Owner:** Freebuff (on completion of current task)
**Workspace:** NICHEGATE-main/

---

## 1. Problem Statement

The current design pipeline never asks the AI to *design*. Concretely:

- `server/services/designStudio.js` contains hand-written HTML/CSS builders. The AI fills slots in them; it does not create layouts, palettes, or type systems.
- `server/services/designStyles.js` defines exactly **8 fixed design styles**. Every product is one of 8 skeletons recolored with a theme palette. Result: same-y, generic, "template shop" output across the entire catalog.
- There is **no visual feedback loop**. Designs are generated blind — nothing ever looks at the rendered page and judges whether it is good.
- The `swipeFileEngine` exists but is not feeding the design pipeline.

The goal is NOT more products. It is *visually distinct, genuinely well-designed* products, produced autonomously.

---

## 2. Scope of Work — 5 Phases (build in this order)

### PHASE 1 — Render→Critique→Revise Loop (build FIRST; improves everything retroactively)

New service: `server/services/designCritic.js`.

1. After `fileFactory` builds a product's HTML/PDF, screenshot its pages (Puppeteer — already available; `coverArt.js` uses it).
2. Send screenshots to a vision-capable model via `modelRouter` with a scoring rubric:
   - visual hierarchy (0–10)
   - whitespace rhythm / density (0–10)
   - typography cohesion (0–10)
   - color harmony (0–10)
   - uniqueness vs. generic template feel (0–10)
   - overall "would this stop a scroll on Etsy?" (0–10)
3. Parse scores + specific written critiques (strict JSON, defensive parsing — same pattern as `conceptEngine.parseConcept`).
4. If overall score < threshold (start at 6.5/10): return critiques + original HTML to the model for ONE revision pass. Max 1 revision (cost control). Re-render, re-score, keep the better of the two.
5. Persist scores in a new `design_scores` table (product_id, scores JSON, critique, revised flag, created_at). These become training signal for Phases 2–4.
6. **Never throw upstream.** If MODEL_ENABLED=false or vision model unavailable → skip critique, ship as-is, return null. Zero cost when AI is off (Prime Directive #3).
7. Ledger all vision-model spend in `ai_usage`.

Add unit test: `test/design-critic.test.js` (mock model; verify parse, threshold logic, fallback behavior, no-throw).

### PHASE 2 — Generative Art Direction (replace style *picking* with style *inventing*)

New service: `server/services/artDirector.js`.

1. For each new product, the model produces a **Design Brief** as strict JSON:
   ```
   { mood: [3-5 words], palette: {primary, secondary, accent, bg, surface, border} (hex),
     fonts: {heading, body, mono} (Google Fonts names), font_reason: string,
     motif: string (one signature decorative element), motif_css: string (safe CSS snippet),
     layout: "classic" | "sidebar" | "full-bleed" | "asymmetric" | "zine",
     whitespace: "tight" | "normal" | "generous",
     texture: string (background treatment), style_lineage: string (see Phase 3) }
   ```
2. Builders in `designStudio.js` accept an optional brief; when present, brief values override theme/style defaults. When absent → existing deterministic path (graceful degradation, zero breakage of the 33 existing types).
3. **Brief novelty gate** (mirror `conceptEngine.noveltyScore`): reject briefs whose palette is within small ΔE of a recent same-niche product's palette, or whose motif/mood words repeat. On reject → regenerate once → else fall back to deterministic styles.
4. **Editor-safety lint** (reuse existing rule): only hex color tokens and font-family declarations may be injected. Sanitize/reject any CSS containing `url(`, `@import`, `position:fixed`, `expression(`, etc. — this is a security gate, not a style gate.
5. **Mechanical diversity levers** (cheap, do all):
   - Style *blending*: sample 2 of the 8 existing styles, instruct model to fuse them ("editorial × organic").
   - Layout variance: even same-style products rotate grid treatment per product.
   - Motif library per niche category: derive visual motifs from the niche itself (topographic lines for surveying, grain/flour textures for baking, blueprint grids for contractors). Extend `nicheUniverse.js` with a `visual_motifs` field.
   - Expand the font library in `designStyles.js` from ~10 to 40+ Google Fonts with curated pairing table; briefs may propose pairings outside the table (validated by lint).

### PHASE 3 — Reference-Grounded Taste (activate swipeFileEngine for design)

**SEED REFERENCES ARE ALREADY PREPARED** in `design-references/` (15 original SVG boards + MANIFEST.md, ready to commit):
   - refs 01–10: trend-curated 2026 styles (Neo-Noir Luxe → Quiet Luxury) — maximize diversity
   - refs 11–15: persona-coded edgy styles (Cyber-Industrial → Flash & Chrome) — maximize tribal recognition
   - MANIFEST.md contains each board's DNA, persona, best-fit niches, and MANDATORY usage rules (read it before assigning references)

1. Extend `swipeFileEngine` with a `design_references` table seeded from these 15 boards. Each stores extracted DNA: palette hexes, font names, layout grid, motif description. Parse the SVGs directly (hexes/fonts are in markup) AND render them to a vision model for structural read.
2. `artDirector` includes 1–2 niche-relevant references as few-shot context: "design in the lineage of reference X, adapted for {niche}". NEVER pixel-copy; brief-level transfer only.
3. **Persona gating (from MANIFEST usage rules):** refs 11–15 are opt-in per niche only (match the niche to the board's Best-for list); when they fit, full volume for that niche; never blend two personas; score persona-styled products on tribal recognition and craft, NOT mass-market polish — do not let the Phase 1 critique loop sand the edge off.
4. **Winners loop:** the top-scoring designs from Phase 1 (score ≥ 8) automatically enter `design_references` as exemplars. Self-improving taste, human-auditable.

### PHASE 4 — Separation of Content and Skin

1. Refactor builders to accept content as JSON (sections, copy, data) distinct from the design layer.
2. Add a `reskin` action: any product can be re-rendered in a new generated brief without regenerating content. Wire into Smart Actions and the review view.
3. Auto-reskin rule: any product with ≥2 sales but design score < 7 gets one automatic reskin attempt in the next automation cycle.

### PHASE 5 — Catalog Retro-Quality Sweep

1. Batch job: run Phase 1 critique over the top ~100 existing products (by views).
2. Auto-reskin the worst scorers (score < 5) using Phases 2–3.
3. Report in Analytics view: design score distribution before/after.

---

## 3. Hard Constraints (Non-Negotiable)

1. **Zero breakage:** all 33 existing product types must still generate identically when AI is off. Every new path degrades to current behavior on any failure.
2. **Security:** injected CSS passes the editor-safety lint. Deliverables remain session-gated. No new public routes.
3. **Cost control:** max 1 critique pass + max 1 revision + max 1 brief regeneration per product. All spend in `ai_usage`.
4. **No fake success:** a design score of null ≠ passing. Unscored products are tracked separately in analytics, never counted as "passed critique."
5. Tests for every new service; full suite (`node --test`) must pass before handoff.
6. Do NOT commit/push/deploy — owner audits first (standing handoff rule).

## 4. Definition of Done

- [ ] `designCritic.js` scores every AI-enabled product build; scores persist and appear in Analytics.
- [ ] `artDirector.js` generates per-product briefs with novelty gating + safety lint.
- [ ] Builders accept briefs; ≥80% of new products (AI on) use generated briefs.
- [ ] `swipeFileEngine` feeds references into briefs; winners auto-enter the reference pool.
- [ ] Reskin action works end-to-end from the review view.
- [ ] Visible outcome: side-by-side of 10 consecutive new products shows clearly distinct palettes, type pairings, motifs, and layouts (no two same-style-with-different-color in a row).
- [ ] All tests pass; TASK.md updated with session summary in the existing format.

## 5. Out of Scope (do NOT touch)

- Pricing, marketplace publishing, Etsy/Gumroad integrations, billing — unchanged.
- Do not delete the 8 existing styles or any existing builder — they are the deterministic fallback layer.
