# MEMORY.md — persistent agent memory for NicheGate (OpenClaw + Cline/Kilo share this)

## Project: NicheGate — Templates for the oddly specific
- Stack: Node >=22, Express 5, SQLite (node:sqlite WAL) at data/profession-box.db, Puppeteer PDFs, SheetJS XLSX, adm-zip
- Run: start-nichegate.bat or npm start → http://localhost:5000, store /store, setup /setup; auth at /login only when ADMIN_PASSWORD set
- Root: C:\Users\linde\.skales-data\workspace\nichegate · repo github.com/marina703/NICHEGATE.git (main)
- Deploy: Railway "NICHEGATE" (production, region ams, Dockerfile, volume /app/data)
- AI layer: server/services/modelRouter.js + modelConfig.js + conceptEngine.js + contentLibrary.js
  - OpenRouter primary (scan=gemini-flash-1.5, judge=claude-3.5-haiku, ideation=deepseek-chat)
  - MODEL_ENABLED master switch (OFF = zero-cost; every model call returns null)
  - Cost caps: 3 calls/scan, 4 calls/idea-batch
- Product types: server/services/productTypes.js = single registry (invoice/checklist/spreadsheet/booking/social/brand/journal/website/decision-matrix/roi/tool/wall-art/worksheet/planner/party-printable/pyro-batch/pyro-lift-fuse/pyro-shoot-log)
- Covers: server/services/coverArt.js + previewBatch.js + cf-worker/src/index.js (Cloudflare Workers AI FLUX, x-ng-key secret). COVER_ART_PROVIDER=cloudflare.
- Auth: server/services/auth.js (ADMIN_PASSWORD → ng_session httpOnly cookie, 7d TTL)

## Rules
- Always update TASK.md before stopping. Never redo Done items — git diff first.
- Cheap model does 90%: scan/judge/summarize. Escalate to frontier only for architecture.
- AI calls must never throw upstream — return null and degrade gracefully (conceptEngine returns null on any failure).
- No listing without a real file (File Factory rule — fileFactory.ensureProductFile before publish).
- Keys only from env, never log keys. .env secrets stay out of git.
- Adding a product type = one entry in productTypes.js (+ a build*HTML builder in designStudio/pdfGenerator if it needs a custom layout). Backward-compatible: never change existing type keys/prices.
- Bundles are products rows with type='bundle' (no separate bundle table).
- Auth is a no-op until ADMIN_PASSWORD is set — never block the autonomous server-side engine.

## Handoff template (paste on model switch)
Works: / Fails: / Files changed: / NOT to redo: / Next step:

