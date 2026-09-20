# MEMORY.md — persistent agent memory for NicheGate

## Project: NicheGate — Templates for the oddly specific
- Stack: Node >=22, Express 5, SQLite (node:sqlite WAL) at data/profession-box.db, Puppeteer PDFs, SheetJS XLSX, adm-zip
- Run: start-nichegate.bat or npm start → http://localhost:5000
- Root: C:\Users\linde\.skales-data\workspace\nichegate · repo github.com/marina703/NICHEGATE.git (main)
- Deploy: Railway "NICHEGATE" (production, region ams, Dockerfile, volume /app/data)
- AI layer: modelRouter.js + modelConfig.js + conceptEngine.js + contentLibrary.js (OpenRouter)
  - MODEL_ENABLED=true, scan=gemini-flash-1.5, judge=claude-3.5-haiku, ideation=deepseek-chat
- Product types: productTypes.js — 33 types (was 18, added 15 innovative)
  - Innovative: playbook/pricing-bible/seasonal-calendar/email-scripts/certification-guide/sop-package/equipment-guide/compliance-checklist/first-year-roadmap/client-onboarding/business-in-a-box/marketing-kit/prompt-library/client-emails/profit-calculator
- Covers: coverArt.js + previewBatch.js + cf-worker/src/index.js (Cloudflare Workers AI FLUX)
- Auth: auth.js (ADMIN_PASSWORD → ng_session httpOnly cookie, Secure flag in production)

## Design DNA System
- designStyles.js = 8 styles (editorial/brutalist/organic/technical/luxe/playful/minimal/heritage) × 13 niches × 12 fonts
- designStudio.js = 16 builders DNA-aware (11 original + playbook + pricing-bible + calculatorBuilder + emailScriptsBuilder + sopBuilder)
- calculatorBuilder.js = XLSX with 4 sheets (profit/pricing/growth/tax) with live Excel formulas
- emailScriptsBuilder.js = 30 email templates across 4 categories (booking/service/followup/retention)
- sopBuilder.js = 11 SOPs (daily/weekly/monthly/seasonal procedures)
- coverArt.js = NICHE_SCENES (13 categories) + TYPE_SCENES (22 types) — niche-specific prompts

## Command Center (2026-09-20)
- Premium dark redesign: glassmorphism panels, gradient accents, glow effects, smooth animations
- New views: home (revenue KPIs), catalog, review, chat, marketplace, trends
- Revenue dashboard: /api/revenue/summary (by type, by niche, totals)
- Etsy daily cap: /api/etsy/cap (min 10/day, auto-reset, configurable)
- Direct Etsy push: /api/etsy/push/:id + /api/etsy/push-batch
- Passion niches: /api/niches/passion (add/remove custom niches)
- Chat panel: custom prompts, niche management, product generation ideas
- Social post generator: /api/social/generate (pinterest/instagram/twitter/facebook)

## Security
- helmet (CSP disabled for inline CSS), express-rate-limit (200 req/15min on /api/*)
- /api/health endpoint, Secure cookie flag, pino logger, migration tracking table

## Rules
- Always update TASK.md AND MEMORY.md before stopping. Never redo Done items.
- Cheap model does 90%. AI calls must never throw upstream — return null.
- No listing without a real file (File Factory rule).
- Keys only from env. Adding a product type = one entry in productTypes.js + builder.
- Design DNA: use designStyles.js getDesignDNA() for all new template work.
- Etsy daily cap minimum is 10/day — never lower below that.

## Handoff template
Works: / Fails: / Files changed: / NOT to redo: / Next step:
