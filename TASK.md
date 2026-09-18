# Goal: NicheGate autonomous digital-product factory — discover niches, generate file-backed products, publish to Gumroad/Etsy.

# Done so far (most recent session, 2026-09-15 → 09-17):
- AI idea layer: modelRouter.js + modelConfig.js + conceptEngine.js + contentLibrary.js (OpenRouter, novelty gate, cost caps, graceful null degradation).
- Covers: Pollinations → fal FLUX → Cloudflare Workers AI FLUX; v2 thumb-stopper → v3 composite (photo full-bleed + scrim + typography); force-rebuild endpoint + Rebuild ALL; trash filter + bulk-reject + gallery.
- Dashboard: dark ops-console redesign (Command Center, Catalog grid, full-width Review/Automation/Marketplace/Trends); optional ADMIN_PASSWORD single-admin auth (auth.js, session cookie, auth_sessions table — OFF until set).
- Types: productTypes.js registry — wall-art, worksheet, planner, party-printable; pyro manual worksheets (batch / lift-fuse / shoot-log); bundles expanded to 8-11 pieces.
- Concept-aware listings (AI title + pitch + benefits) + clickable pipeline funnel + 🔮 Better Idea per product.
- Fixes: reddit radar → old.reddit fallback (Railway 403s); concurrency-safe DB init.
- Live DB: 30 professions · 199 products (169 draft / 30 listed) · 335 trends · 96 templates · 74/77 tests passing.

# Current file states:
- server/services/productTypes.js = product type registry (single source of truth).
- server/services/conceptEngine.js = novelty-gated concept generation.
- server/services/auth.js = optional admin login.
- server/services/coverArt.js + previewBatch.js + cf-worker/src/index.js = cover pipeline.
- products.concept column exists; auth_sessions table exists. No separate bundle table (bundles are type='bundle' product rows).
- .env: OPENROUTER_API_KEY + COVER_WORKER_* set; MODEL_ENABLED NOT set (AI layer OFF); DISCORD_WEBHOOK_URL empty.

# Next 3 steps:
1) Set MODEL_ENABLED=true in .env to switch on the concept engine (key already present) and add DISCORD_WEBHOOK_URL for alerts.
2) Verify ETSY_CLIENT_SECRET is a distinct value from ETSY_CLIENT_ID (readiness checker flags id===secret) and reconnect Etsy at /setup.
3) Start server (npm start / start-nichegate.bat) → approve Review Queue + Deploy Bundles (Gumroad 10/day limit; re-run daily).

# Do NOT redo (all verified green): File Factory, bundle engine, SEO engine, publish dispatcher, concept/novelty gate, cover pipeline, product type registry — git diff before touching.

