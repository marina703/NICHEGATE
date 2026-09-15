# MEMORY.md — persistent agent memory for NicheGate (OpenClaw + Cline/Kilo share this)

## Project: NicheGate — Templates for the oddly specific
- Stack: Node >=22, Express 5, SQLite (node:sqlite WAL) at data/profession-box.db, Puppeteer PDFs, SheetJS XLSX, adm-zip
- Run: start-nichegate.bat or npm start → http://localhost:5000, store /store, setup /setup
- AI layer: server/services/modelRouter.js + modelConfig.js, OpenRouter primary, MODEL_ENABLED master switch, caps per cycle

## Rules
- Always update TASK.md before stopping. Never redo Done items — git diff first.
- Cheap model does 90%: scan/judge/summarize. Escalate to frontier only for architecture.
- AI calls must never throw upstream — return null and degrade gracefully.
- No listing without a real file (File Factory rule).
- Keys only from env, never log keys.

## Handoff template (paste on model switch)
Works: / Fails: / Files changed: / NOT to redo: / Next step:
