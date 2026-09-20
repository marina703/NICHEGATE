# MEMORY.md — persistent agent memory for NicheGate

## Project: NicheGate — Templates for the oddly specific
- Stack: Node >=22, Express 5, SQLite, Puppeteer PDFs, SheetJS XLSX, adm-zip
- Run: start-nichegate.bat or npm start → http://localhost:5000
- Root: C:\Users\linde\.skales-data\workspace\nichegate · github.com/marina703/NICHEGATE.git
- Deploy: Railway "NICHEGATE" (production, ams, Dockerfile, volume /app/data)
- AI: OpenRouter (gemini-flash scan, claude-haiku judge, deepseek ideation). MODEL_ENABLED=true.
- Product types: productTypes.js — 33 types (15 innovative).
- Covers: Cloudflare Workers AI FLUX.
- Auth: auth.js (ADMIN_PASSWORD → ng_session httpOnly cookie).

## Design DNA: 8 styles × 13 niches × 12 fonts × 16 builders
- calculatorBuilder.js, emailScriptsBuilder.js, sopBuilder.js = standalone modules.

## Command Center — 10 VIEWS (2026-09-20)
Premium dark redesign: glassmorphism, gradients, glow effects.
1. 🚀 Home — Revenue KPIs, pipeline funnel, quick actions
2. 📦 Catalog — Product grid with DNA badges, double-click preview
3. ✅ Review — Approve/reject + push-to-Etsy/Gumroad
4. 💬 Chat — Custom prompts, passion niches
5. 📱 Social — Generate posts (pinterest/instagram/twitter/facebook), schedule, post now, batch generate
6. 💰 Ads — Budget tracking, commit/cancel spend
7. 📅 Calendar — Monthly view of posts, products, ad activity
8. 📊 Analytics — Revenue by type/niche, conversion funnel
9. 🏪 Marketplace — Etsy cap, connection status
10. 🔭 Trends — Activate, dismiss, generate products from trend

## API Endpoints (28 total)
Revenue: /api/revenue/summary, /api/etsy/cap, /api/niches/passion
Etsy: /api/etsy/push/:id, /api/etsy/push-batch
Social: /api/social/generate, /api/social/schedule, /api/social/post-now, /api/social/calendar, /api/social/cancel, /api/social/batch-generate
Ads: /api/ads/summary, /api/ads/budget, /api/ads/commit, /api/ads/cancel
Calendar: /api/calendar?month=YYYY-MM
Analytics: /api/analytics/sales
Trends: /api/trends/:id/generate
Preview: /api/products/:id/preview-html
Chat: /api/chat (existing)

## Rules
- Always update TASK.md AND MEMORY.md before stopping.
- Etsy daily cap minimum 10/day. No listing without real file.
- AI calls must never throw. Keys only from env.
