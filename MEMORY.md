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

## Command Center — 10 Views (ALL VERIFIED WORKING 2026-09-20)
Dark command-center theme (deep #04060a base, teal→blue→violet gradient,
ambient radial glows, grid texture, depth/glow on panels, cards, KPIs).
The 10 REAL views (nav rail + VIEWS array + render() branches all wired):
home, catalog, review, social, ads, calendar, analytics, automation,
marketplace, trends.
⚠ CORRECTION: item 4 below ("Chat — Custom prompts, passion niches") is WRONG.
There is NO chat view. It was never wired. Passion niches are served by
GET/POST /api/niches/passion and surfaced in Home → Smart Actions.
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

## CRITICAL LESSONS (learned 2026-09-20 — READ BEFORE EDITING server/index.js)

### 1. Never trust "edit reported OK" — always VERIFY
Developer.edit and PowerShell string edits silently failed several times on
these large files while still reporting success. After ANY edit, verify with a
grep/regex count read back from the file — not the tool's return value.

### 2. server/index.js route-nesting bug (FIXED)
The /api/health handler was never closed properly, so ~790 lines containing 22
route registrations were NESTED INSIDE it. They only registered when
/api/health was hit, and a stray "a" fragment threw mid-handler, permanently
killing every route after it. Symptom: 9 endpoints returned 404 forever, yet
node --check still PASSED (braces balanced — the scope was just wrong).
Now: 98 top-level routes, 0 nested. Verify with:
  node -e "const L=require('fs').readFileSync('server/index.js','utf8').split(/\r?\n/);console.log('top:',L.filter(l=>/^app\.(get|post|patch|delete|put)\(/.test(l)).length,'nested:',L.filter(l=>/^[ \t]+app\.(get|post|patch|delete|put)\(/.test(l)).length)"

### 3. Patch-script truncation fragments (FIXED)
Earlier patch scripts left behind: stray "a" lines, "unction" (missing f),
"pp.post(...)" / "pp.get(...)" (missing the "a" of "app"), "async f". All
removed. Scan for more with: ^\s*(pp|p)\.  |  ^\s*unction\b  |  ^\s*[a-z]{1,3}$

### 4. products has NO prof_name column
products columns: id, profession_id, name, type, price, status, theme,
html_content, file_path, marketplace_id, marketplace, created_at, updated_at,
preview_path, concept.
prof_name must come from a JOIN:
  LEFT JOIN professions pr ON p.profession_id = pr.id  →  pr.name AS prof_name
Newer routes queried prof_name straight from products → 500. Fixed in
revenue/summary, calendar, smart-actions, newsletter/generate.

### 5. trends has NO status column
trends columns: id, name, emoji, phase, velocity, window, est_revenue, why,
activated, detected_at, activated_at, outcome.
Use "activated = 1" — NOT status = 'active'.

### 6. conceptEngine exports (generateSocialPost ADDED 2026-09-20)
generateConcept, applyConcept, enrichProduct, noveltyScore, parseConcept,
generateSocialPost. It was being called by /api/social/generate and
/api/social/post-now but never existed → both 500'd. Now implemented; never
throws upstream, degrades to deterministic ready-to-post copy.
modelRouter helpers: callModel, cheapSummarize, scoreOptions, generateIdeas,
fallbackChat, status, redact.

### 7. Verify on a throwaway port, NOT the live one
The local :5000 server is frequently a STALE process started long before your
edits (check Get-Process StartTime vs the file's LastWriteTime). Boot with
PORT=509x and curl that, or you test old code and draw wrong conclusions.

### 8. Known external issue
OpenRouter returns 401 (key expired/invalid). Model calls degrade gracefully by
design so nothing crashes, but AI concept + social copy currently fall back to
deterministic templates. User must refresh OPENROUTER_API_KEY for real AI output.

## Rules
- Always update TASK.md AND MEMORY.md before stopping.
- Etsy daily cap minimum 10/day. No listing without real file.
- AI calls must never throw. Keys only from env.

- PROD AI verified 2026-09-21: MODEL_ENABLED=true + clean OPENROUTER_API_KEY pushed to
  Railway via CLI; /api/model/status enabled:true. Prod URL: nichegate-production.up.railway.app

- SERP discovery pipeline added 2026-09-21 (Chunk 1): search_queue table + Serper autocomplete + ValueSERP shopping in trendRadar.js, discovery endpoints in index.js. Serper key works; VALUE_SERP_API is invalid (returns HTML) — replace before Layer 2 validation activates. Layer 3 = Etsy Open API saturation gate (next).

- Chunk 2 done: Etsy saturation gate fixed (await bug) + ValueSERP swapped for DataForSEO (Keyword Research) + enriched Etsy score + opportunity engine endpoint. Serper kept as primary discovery. DataForSEO needs account verification (app.dataforseo.com) and Etsy shared secret needs a valid active key before Layer 3 goes live; both degrade gracefully.

# ── 2026-09-21 (cont): DataForSEO fix (Chunk 2 addendum) ──
- DataForSEO keyword data is TASK-BASED, not live. Rewrote fetchDataForSEO to
  POST /keywords_data/google/search_volume/task_post (ALL seeds in one task) then
  poll /search_volume/task_get/$id (up to 3 retries, 6s+3s). Verified LIVE:
  digital planner vol 12100/cpc 4.65, invoice template vol 90500/cpc 12.63.
  Source health ok:true.
- Account needed verification at app.dataforseo.com (was 403 "verify your account");
  now active. The earlier /ad_words/recommendations live path was a 404 (no live
  endpoint exists for keyword data) - that is why all probes 404'd post-verification.
- Layer 2 (DataForSEO validation) + Layer 3 (Etsy saturation; ETSY_SHARED_SECRET now
  in Railway) are both wired. Go live on next GitHub push + Railway redeploy.

# ── 2026-09-21 (cont): Etsy Layer 3 key fallback ──
- fetchEtsySaturation now tries ALL Etsy key vars (ETSY_SHARED_SECRET, ETSY_CLIENT_SECRET,
  ETSY_CLIENT_ID) as x-api-key and uses the first that authenticates (Etsy portals label the
  x-api-key value inconsistently as Shared Secret vs Keystring). Removes the guesswork; whatever
  correct key the user has in any var works. Layer 3 (Etsy saturation) + Opportunity Engine now
  fully live once a valid key is present in Railway. Verified DataForSEO Layer 2 live in prod
  (volume 90500 for "planner").
- NEXT (per user's Etsy OAuth guide): implement access-token auto-refresh. Etsy OAuth v3:
  access token ~5min, refresh token 90d single-use rotating. Existing marketplace_tokens table on
  Railway's persistent SQLite volume already survives restarts - no new Postgres/Redis plugin needed.
  Plan: add refreshEtsyToken() invoked before publish + on a schedule; store rotated tokens back.
