# MEMORY.md — persistent agent memory for NicheGate

## Project: NicheGate — Autonomous Digital Product Factory
- Stack: Node >=22, Express 5, SQLite (WAL), Puppeteer PDFs, SheetJS XLSX, adm-zip
- Run: start-nichegate.bat → http://localhost:5000
- Repo: github.com/marina703/NICHEGATE.git (main)
- Deploy: Railway (ams, Dockerfile, volume /app/data)
- AI: OpenRouter (gemini-flash scan, claude-haiku judge, deepseek ideation). MODEL_ENABLED=true.

## Product System
- 33 types (15 innovative): playbook $24, pricing-bible $19, calculator $15, email-scripts $15, sop-package $19, + 28 originals
- Design DNA: 8 styles × 13 niches × 12 fonts × 16 builders
- Covers: Cloudflare Workers AI FLUX, niche-specific prompts

## Command Center — 10 Views, 32 API Endpoints
Premium dark redesign (glassmorphism, gradients, glow).
1. 🚀 Home — Revenue KPIs, pipeline, smart actions
2. 📦 Catalog — Grid with DNA badges, double-click preview
3. ✅ Review — Approve/reject + push-to-Etsy/Gumroad
4. 💬 Chat — Custom prompts, passion niches
5. 📱 Social — 6 platforms (pinterest/instagram/twitter/facebook/tiktok/linkedin), batch generate
6. 💰 Ads — Budget tracking, commit/cancel
7. 📅 Calendar — Monthly activity view
8. 📊 Analytics — Revenue by type/niche, conversion funnel
9. 🏪 Marketplace — Etsy cap, newsletter preview, connections
10. 🔭 Trends — Activate, generate products from trend

## Rules
- Always update TASK.md AND MEMORY.md before stopping.
- Etsy daily cap minimum 10/day. No listing without real file.
- AI calls must never throw. Keys only from env.
