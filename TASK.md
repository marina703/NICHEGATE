# Goal: NicheGate autonomous digital-product factory — discover niches, generate file-backed products, publish to Gumroad/Etsy.

# Done so far (most recent session, 2026-09-15 → 09-20):
- AI idea layer: modelRouter.js + modelConfig.js + conceptEngine.js + contentLibrary.js (OpenRouter, novelty gate, cost caps, graceful null degradation).
- Covers: Pollinations → fal FLUX → Cloudflare Workers AI FLUX; v2 thumb-stopper → v3 composite (photo full-bleed + scrim + typography); force-rebuild endpoint + Rebuild ALL; trash filter + bulk-reject + gallery.
- Dashboard: dark ops-console redesign (Command Center, Catalog grid, full-width Review/Automation/Marketplace/Trends); optional ADMIN_PASSWORD single-admin auth.
- Types: productTypes.js registry — 18 types including wall-art, worksheet, planner, party-printable, pyro worksheets, bundles.
- Concept-aware listings (AI title + pitch + benefits) + clickable pipeline funnel + 🔮 Better Idea per product.
- Security hardening (2026-09-20): helmet, express-rate-limit (200/15min), /api/health endpoint, Secure cookie flag, pino logger.
- Design DNA system (2026-09-20): COMPLETE — 8 styles × 13 niches × 12 Google Fonts × 11 product type builders.
  - Chunk 1: designStyles.js — design style engine + niche language + typography
  - Chunk 2: designStudio.js — shellDNA(), buildDNAHTML() + Google Fonts injection
  - Chunk 3: Invoice/checklist/journal builders use shellDNA() when theme.dna present
  - Chunk 4: Cover art prompts are now niche-specific (13 niche scenes × 22 product type templates)
  - Chunk 5: Dashboard catalog cards now show DNA style badges + niche labels + color accent strips
  - Chunk 6: ALL 11 builders now use _sh() DNA wrapper (brand, planner, wall-art, worksheet, party, pyro×3)
- Marketplace: Etsy + Gumroad both connected and verified.
- Config: MODEL_ENABLED=true, BIND_HOST=0.0.0.0, both API keys set.

# Current file states:
- server/services/productTypes.js = product type registry (single source of truth).
- server/services/designStyles.js = Design DNA engine (8 styles + niche language + typography).
- server/services/designStudio.js = ALL 11 builders DNA-aware via _sh() wrapper.
- server/services/coverArt.js = NICHE_SCENES (13 categories) + TYPE_SCENES (22 types).
- client/index.html = DNA badges, niche labels, color strips on catalog cards.

# Next 3 steps:
1) Test full pipeline: generate a product → verify DNA style appears in PDF + cover.
2) Commit all changes and update MEMORY.md to reflect design DNA completion.
3) Optional: Add Creative Market as third marketplace or Notion templates channel.

# Do NOT redo (all verified green): File Factory, bundle engine, SEO engine, publish dispatcher, concept/novelty gate, cover pipeline, product type registry, designStyles.js, ALL 11 designStudio.js builders, coverArt.js niche prompts, client/index.html DNA badges — git diff before touching.
