# MEMORY.md — persistent agent memory for NicheGate (OpenClaw + Cline/Kilo share this)

## Project: NicheGate — Templates for the oddly specific
- Stack: Node >=22, Express 5, SQLite (node:sqlite WAL) at data/profession-box.db, Puppeteer PDFs, SheetJS XLSX, adm-zip
- Run: start-nichegate.bat or npm start → http://localhost:5000, store /store, setup /setup; auth at /login only when ADMIN_PASSWORD set
- Root: C:\Users\linde\.skales-data\workspace\nichegate · repo github.com/marina703/NICHEGATE.git (main)
- Deploy: Railway "NICHEGATE" (production, region ams, Dockerfile, volume /app/data)
- AI layer: server/services/modelRouter.js + modelConfig.js + conceptEngine.js + contentLibrary.js
  - OpenRouter primary (scan=gemini-flash-1.5, judge=claude-3.5-haiku, ideation=deepseek-chat)
  - MODEL_ENABLED=true (as of 2026-09-20)
  - Cost caps: 3 calls/scan, 4 calls/idea-batch
- Product types: server/services/productTypes.js = single registry (invoice/checklist/spreadsheet/booking/social/brand/journal/website/decision-matrix/roi/tool/wall-art/worksheet/planner/party-printable/pyro-batch/pyro-lift-fuse/pyro-shoot-log)
- Covers: server/services/coverArt.js + previewBatch.js + cf-worker/src/index.js (Cloudflare Workers AI FLUX, x-ng-key secret). COVER_ART_PROVIDER=cloudflare.
- Auth: server/services/auth.js (ADMIN_PASSWORD → ng_session httpOnly cookie, 7d TTL, Secure flag in production)

## Design DNA System (2026-09-20)
- server/services/designStyles.js = 8 design styles (editorial/brutalist/organic/technical/luxe/playful/minimal/heritage) + 13 niche categories + Google Fonts library (12 fonts)
- Styles auto-resolve per (profession, productType) via getDesignDNA(). Product-type overrides (invoice→brutalist, journal→editorial, etc.) + niche→style mapping + sentiment detection
- Niche design language: unique background patterns, icons, color shifts per category (trades→blueprint, wellness→wave, pyro→spark, etc.)
- Resolves to legacy theme object via toLegacyTheme() for backward compatibility with existing template system
- Fonts: Playfair Display, DM Serif Display, Cormorant Garamond, Crimson Pro, Outfit, Plus Jakarta Sans, Inter, Bebas Neue, Caveat, Fredoka, JetBrains Mono, Space Grotesk
- Google Fonts URL: see GOOGLE_FONTS_URL constant in designStyles.js
- Sentiment detection: pyro-specific patterns checked BEFORE broad tech pattern to avoid false matches
- TODO: Wire designStyles.js into designStudio.js + pdfGenerator.js (Chunks 2-5)

## Security Hardening (2026-09-20)
- helmet (CSP disabled for inline CSS), express-rate-limit (200 req/15min on /api/*)
- /api/health endpoint (DB status, uptime, product/profession counts)
- Secure cookie flag in production (NODE_ENV=production)
- pino structured logger installed (not yet wired into all services)
- Migration tracking table in database.js

## Rules
- Always update TASK.md before stopping. Never redo Done items — git diff first.
- Cheap model does 90%: scan/judge/summarize. Escalate to frontier only for architecture.
- AI calls must never throw upstream — return null and degrade gracefully (conceptEngine returns null on any failure).
- No listing without a real file (File Factory rule — fileFactory.ensureProductFile before publish).
- Keys only from env, never log keys. .env secrets stay out of git.
- Adding a product type = one entry in productTypes.js (+ a build*HTML builder in designStudio/pdfGenerator if it needs a custom layout). Backward-compatible: never change existing type keys/prices.
- Bundles are products rows with type='bundle' (no separate bundle table).
- Auth is a no-op until ADMIN_PASSWORD is set — never block the autonomous server-side engine.
- Design DNA: use designStyles.js getDesignDNA() for all new template work. Legacy themes.js still works via toLegacyTheme().

## Handoff template (paste on model switch)
Works: / Fails: / Files changed: / NOT to redo: / Next step:
