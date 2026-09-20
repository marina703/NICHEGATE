# MEMORY.md — persistent agent memory for NicheGate

## Project: NicheGate
- Stack: Node >=22, Express 5, SQLite, Puppeteer, SheetJS, adm-zip
- Run: start-nichegate.bat → http://localhost:5000
- Root: github.com/marina703/NICHEGATE.git
- Deploy: Railway (ams, Dockerfile, volume /app/data)
- AI: OpenRouter (gemini-flash, claude-haiku, deepseek). MODEL_ENABLED=true.

## Product System
- 33 product types (15 innovative): playbook, pricing-bible, calculator, email-scripts, sop-package, etc.
- Design DNA: 8 styles × 13 niches × 12 fonts × 16 builders
- Covers: Cloudflare Workers AI FLUX

## Command Center — 10 Views, 32 API Endpoints
1. 🚀 Home — Revenue KPIs, pipeline, smart actions
2. 📦 Catalog — Grid with DNA badges, double-click preview
3. ✅ Review — Approve/reject + push-to-Etsy/Gumroad
4. 💬 Chat — Custom prompts, passion niches
5. 📱 Social — Generate/schedule/post (pinterest/instagram/twitter/facebook/tiktok/linkedin), batch generate
6. 💰 Ads — Budget tracking, commit/cancel
7. 📅 Calendar — Monthly activity view
8. 📊 Analytics — Revenue by type/niche, conversion funnel
9. 🏪 Marketplace — Etsy cap, newsletter preview, connections
10. 🔭 Trends — Activate, generate products

## Smart Features
- Smart Actions: context-aware suggestions based on current state
- Newsletter: auto-generated weekly digest from listed products
- Social: 6 platforms (pinterest/instagram/twitter/facebook/tiktok/linkedin)
- Etsy daily cap: min 10/day, configurable
- Stripe prep: endpoints ready, needs STRIPE_SECRET_KEY

## Rules
- Always update TASK.md AND MEMORY.md before stopping.
- Etsy cap minimum 10/day. No listing without real file.
- AI calls must never throw. Keys only from env.
