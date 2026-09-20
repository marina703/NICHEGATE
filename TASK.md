# Goal: NicheGate autonomous digital-product factory — discover niches, generate file-backed products, publish to Gumroad/Etsy.

# Done so far (2026-09-15 -> 09-20):
- AI idea layer: modelRouter.js + modelConfig.js + conceptEngine.js + contentLibrary.js.
- Covers: Cloudflare Workers AI FLUX; v3 composite.
- Dashboard: premium dark redesign (glassmorphism, gradients, glow effects).
- Types: productTypes.js — 33 types (15 innovative added).
- Security: helmet, rate-limit, /api/health, Secure cookies, pino, migrations table.
- Design DNA: 8 styles x 13 niches x 12 fonts x 16 builders.
- Innovative builders: playbook ($24), pricing-bible ($19), calculator ($15), email-scripts ($15), sop-package ($19).
- Command Center Phase 1: revenue KPIs, Etsy daily cap (min 10), chat panel, push-to-Etsy, passion niches.
- Social post generator API ready (pinterest/instagram/twitter/facebook).
- Marketplace: Etsy + Gumroad connected.
- Config: MODEL_ENABLED=true, BIND_HOST=0.0.0.0.

# Current file states:
- server/services/productTypes.js = 33 types.
- server/services/designStyles.js = Design DNA engine.
- server/services/designStudio.js = 16 builders.
- server/services/calculatorBuilder.js = XLSX calculator.
- server/services/emailScriptsBuilder.js = 30 email templates.
- server/services/sopBuilder.js = 11 SOPs.
- server/services/coverArt.js = NICHE_SCENES + TYPE_SCENES.
- client/index.html = Premium dashboard with all Phase 1 features.

# Next steps (Phase 2):
1) Social post scheduler (calendar view, scheduled posts).
2) Ad spend dashboard (budget tracking, commit/cancel runs).
3) Product preview in catalog (inline PDF preview).
4) Trend-to-product pipeline (activate trend → auto-generate products).

# Do NOT redo: productTypes.js, designStyles.js, ALL builders, coverArt.js, calculatorBuilder.js, emailScriptsBuilder.js, sopBuilder.js — git diff before touching.
