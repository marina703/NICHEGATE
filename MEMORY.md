# MEMORY.md — persistent agent memory for NicheGate

## Project: NicheGate — Templates for the oddly specific
- Stack: Node >=22, Express 5, SQLite (node:sqlite WAL) at data/profession-box.db, Puppeteer PDFs, SheetJS XLSX, adm-zip
- Run: start-nichegate.bat or npm start → http://localhost:5000
- Root: C:\Users\linde\.skales-data\workspace\nichegate · repo github.com/marina703/NICHEGATE.git (main)
- Deploy: Railway "NICHEGATE" (production, region ams, Dockerfile, volume /app/data)
- AI layer: modelRouter.js + modelConfig.js + conceptEngine.js + contentLibrary.js (OpenRouter)
  - MODEL_ENABLED=true, scan=gemini-flash-1.5, judge=claude-3.5-haiku, ideation=deepseek-chat
- Product types: productTypes.js — 33 types (was 18, added 15 innovative)
- Covers: coverArt.js + previewBatch.js + cf-worker/src/index.js (Cloudflare Workers AI FLUX)
- Auth: auth.js (ADMIN_PASSWORD → ng_session httpOnly cookie, Secure flag in production)

## Design DNA System
- designStyles.js = 8 styles × 13 niches × 12 fonts
- designStudio.js = 16 builders (11 original + playbook + pricing-bible + email-scripts + sop-package + others)
- calculatorBuilder.js, emailScriptsBuilder.js, sopBuilder.js = standalone modules

## Command Center — COMPLETE (2026-09-20)
- Premium dark redesign: glassmorphism, gradients, glow effects
- 8 views: Home (revenue KPIs), Catalog, Review, Chat, Social, Ads, Marketplace, Trends
- Revenue dashboard: /api/revenue/summary
- Etsy daily cap: /api/etsy/cap (min 10/day, configurable)
- Direct Etsy push: /api/etsy/push/:id + /api/etsy/push-batch
- Passion niches: /api/niches/passion (add/remove)
- Chat panel: custom prompts, niche management
- Social scheduler: /api/social/generate + schedule + post-now + calendar
- Ad spend dashboard: /api/ads/summary + budget + commit + cancel
- Product preview: /api/products/:id/preview-html (inline PDF preview)
- Trend→Product pipeline: /api/trends/:id/generate (auto-generate 3 products)

## API Endpoints Summary
- /api/revenue/summary, /api/etsy/cap, /api/niches/passion
- /api/etsy/push/:id, /api/etsy/push-batch
- /api/social/generate, /api/social/schedule, /api/social/post-now, /api/social/calendar, /api/social/cancel
- /api/ads/summary, /api/ads/budget, /api/ads/commit, /api/ads/cancel
- /api/trends/:id/generate, /api/products/:id/preview-html
- /api/chat (existing)

## Rules
- Always update TASK.md AND MEMORY.md before stopping.
- Etsy daily cap minimum is 10/day.
- No listing without a real file. AI calls must never throw.
- Keys only from env. Adding a product type = one entry + builder.
