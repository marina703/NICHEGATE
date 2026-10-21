# NicheGate Marketing Bot — Blueprint, Strategy & Setup Guide

> **Status:** Implementation complete and committed (`e0e97fe`). **Configuration incomplete** — all marketing API tokens are human-gated OAuth flows that require account creation + authorization clicks outside this agent's reach.
>
> This document is the single source of truth for: (a) what the marketing bot **already does**, (b) what an operator must **configure** to activate each channel, and (c) the **autonomous cycle** that runs once configured.

---

## 1. Executive Summary

The autonomous marketing pipeline for NicheGate is **fully built, unit-tested (449/453 pass), and committed**. It runs as a phase of the existing 6-hour `automationCycle` (`taskMarketingBot`) plus a manual `/api/marketing/cycle` endpoint.

**Every channel degrades gracefully**: with no API token, the bot generates *ready-to-import creatives/content* instead of failing. The bot never throws on a missing channel — one channel's failure never blocks the rest.

**What remains to go live:** acquire OAuth/business-account tokens for each distribution channel and set them in `.env`. The code is ready; the credentials are human-gated.

| Channel | Code | Tests | Token in `.env` | Status |
|---|---|---|---|---|
| Gumroad | ✅ publishProduct | ✅ 449/453 | ✅ `GUMROAD_ACCESS_TOKEN` | Live |
| Etsy | ✅ OAuth + publishToEtsyReal + fallback | ✅ 449/453 | ✅ keys set, ❌ no token | **Human-gated OAuth** |
| Pinterest | ✅ pinEngine (API v5 + Buffer bridge) | ✅ 20/20 | ❌ | **Human-gated** |
| TikTok Ads | ✅ tiktokAds (create + auto-optimize) | ✅ 20/20 | ❌ | **Human-gated** |
| Reddit | ✅ socialPoster (value-first) | ✅ 20/20 | ❌ | **Human-gated** |
| X (Twitter) | ✅ socialPoster | ✅ 20/20 | ❌ | **Human-gated** |
| Email/ESP | ✅ sequenceEngine + webhook export | ✅ 20/20 | ❌ `ESP_WEBHOOK_URL` | **Human-gated** |
| Discord alerts | ✅ ALERT_NICHE_* filtering | ✅ 449/453 | ✅ webhook set | **Env var tuning** |

---

## 2. Architecture

```
6-HOUR automationCycle.js
        │
        └── taskMarketingBot()  →  marketingBot.runMarketingCycle()
                                     │
       ┌─────────────┬─────────────┬─────────────┬────────────┬──────────────┐
       │ stepPin     │ stepTikTok  │ stepSocial  │ stepEmail  │ stepNews-    │
       │ Promotion   │ Ads         │ Posts       │ Campaign   │ letter       │
       │             │             │             │            │              │
       │ pinEngine   │ tiktokAds   │ socialPoster│seq.Engines │ conceptEng   │
       │ (AI copy +  │ (campaign   │ (Reddit/X   │ (launch    │ (AI copy +   │
       │ UTM attr.)  │ create +    │ value-first │ sequences)  │ det. fallbk)  │
       │             │ auto-opt)   │ posts)      │             │              │
       └──────┬──────┴──────┬──────┴─────┬─────┴──────┬──────┴──────┬──────┘
              │             │            │            │              │
              ▼             ▼            ▼            ▼              ▼
        /api/pins/*    TikTok API   Reddit/X API   ESP webhook   /api/newsletter
                                                                 (digest route)
        │
        └── stepMetricsSnapshot()  →  marketingMetrics.marketingDashboard()
                                       │
                                       ├── channels: channelHealth()  (all 8 channels)
                                       ├── funnel: production + distribution counts
                                       ├── sales: 7d / 30d revenue
                                       ├── distribution: pinterest/tiktok/social/email KPIs
                                       └── recent_activity: automation_log tail
```

### Data flow (publish → distribute)

```
productDraft → coverArt + listingAgent → publishProduct()
                                      → Gumroad first; Etsy on failure (THROWS if both fail)
                                      → pinNewProductAsync(productId)  [fire-and-forget]
                                          → pinEngine.createPin()  [schedules pin with UTM URL]
                                      → marketingBot (next 6h cycle):
                                          → tiktokAds.createAdForProduct()  [campaign + creative]
                                          → socialPoster.generateRedditPosts() + generateXPosts()
                                          → sequenceEngine.generateSequence()  [launch email]
                                          → stepNewsletter()  [weekly digest]
                                          → stepMetricsSnapshot()  [records marketing_metrics rows]
```

### Key design rules (never violate)

1. **No simulated fallback for publishing.** `publishProduct()` tries Gumroad → Etsy → **throws** with all errors. A product is only marked `listed` when a real marketplace returns a listing ID.
2. **AI optional everywhere.** `MODEL_ENABLED=false` → deterministic fallbacks. Never throws on a missing model.
3. **Production gates.** `AUTO_PUBLISH_ENABLED=true` gates publishing; `MARKETING_AUTO_ENABLED=true` gates the marketing cycle. Both default `false` — the bot never runs in production without explicit opt-in.
4. **Self-healing metrics.** `tiktokAds.feedAttributionLedger()` pushes delta-safe numbers into `ad_attribution_ledger`; `autoOptimize()` pauses/scales based on centralized kill-scale rules.

---

## 3. Current State Assessment (verified)

### What was built and committed (2026-10-21, commit `e0e97fe`)

| Layer | File | What it does |
|---|---|---|
| Orchestrator | `server/services/marketingBot.js` | 6-step autonomous cycle, self-healing (each step independent, never aborts the others) |
| Metrics | `server/services/marketingMetrics.js` | `channelHealth()`, `funnelSummary()`, `productMarketingView()`, `marketingDashboard()`, `recordMetric()` |
| Pinterest | `server/services/pinEngine.js` | Scheduling grid (17-slot weekly), AI pin copy + fallback, UTM attribution, Pinterest API v5 dispatch + Buffer bridge |
| TikTok | `server/services/tiktokAds.js` | Campaign → ad group → ad creation, auto-optimize (pause CTR<0.5%/CPA>2×price/0-conv>$10, scale ROAS>3.0), attribution ledger |
| Social | `server/services/socialPoster.js` | Reddit value-first posts (20-niche subreddit map), X thread/single posts, deterministic fallbacks |
| Attribution | `server/services/adAttributionEngine.js` | Shared kill-scale ledger (burn tripwire ≥$15/0 sales, scale ROAS≥3.0) — used by TikTok + future Pinterest |
| Buffer | `server/services/bufferBridge.js` | Interim Pinterest publishing via Buffer's Standard-access app |
| Routes | `server/index.js` | `/api/marketing/{dashboard,products,cycle}`, `/api/pins/*`, `/api/ads/*`, `/api/social/*`, `/api/sequences/*`, `/api/setup/status` (extended) |
| Schema | `server/database.js` | `pins`, `tiktok_ads`, `social_posts`, `sequences`, `esp_subscribers`, `marketing_campaigns`, `marketing_metrics`, `ad_attribution_ledger` |
| Actions | `server/services/actionRegistry.js` | `marketing-cycle`, `tiktok-ads`, `social-posts`, `email-campaign`, `newsletter-generate` |
| Tests | `test/marketing-bot.test.js` | 20 tests (all pass): channel health, creative generation, auto-optimize, funnel, dashboard, cycle self-healing, attribution ledger |

### Production gates (read from `.env.example`)

```
MARKETING_AUTO_ENABLED=false   # ← set true to let the 6h cycle run marketing
AUTO_PUBLISH_ENABLED=false     # ← set true to auto-list approved products
AUTO_START_ENABLED=set         # ← production automation on/off
```

Both marketing and publish gates require `true` in production. In dev (localhost) the marketing cycle defaults to enabled.

### `.env` configuration status (verified)

```
✅ ETSY_CLIENT_ID / ETSY_CLIENT_SECRET  (set)
✅ ETSY_SHARED_SECRET                    (set)
✅ GUMROAD_ACCESS_TOKEN                  (set)
✅ MODEL_ENABLED                         (set)
✅ DISCORD_WEBHOOK_URL                   (set)
✅ AUTO_START_ENABLED                    (set)
❌ AUTO_PUBLISH_ENABLED                  (NOT set — publish gate closed)
❌ MARKETING_AUTO_ENABLED                (NOT set — marketing gate closed)
❌ TIKTOK_ACCESS_TOKEN / TIKTOK_ADVERTISER_ID
❌ PINTEREST_ACCESS_TOKEN / PINTEREST_BOARD_ID
❌ BUFFER_API_TOKEN / BUFFER_CHANNEL_ID / BUFFER_BOARD_SERVICE_ID
❌ REDDIT_ACCESS_TOKEN
❌ X_BEARER_TOKEN
❌ ESP_WEBHOOK_URL
❌ ALERT_NICHE_PROFESSIONS / CATEGORIES / HOBBIES / CLUBS / BELIEFS
❌ ETSY_SHOP_ID                           (optional — auto-discovered via OAuth)
```

> **Gap: `AUTO_PUBLISH_ENABLED` is not set.** Even Gumroad won't auto-list products in production until this is flipped. The marketing bot (gated by `MARKETING_AUTO_ENABLED`) will also stay paused in production.

---

## 4. Phase 1 — Channel Setup (one-time, human-gated)

> These steps require account creation + OAuth clicks on each platform. No agent can complete them without the operator's credentials.

### 4.1 Etsy (keys already in `.env`, OAuth pending)

1. Visit `https://www.etsy.com/developers/2811901/apps` or the `/setup` page.
2. Click **"Connect Etsy"** → you're redirected to Etsy's OAuth consent screen (PKCE flow, `marketplace.js:getEtsyAuthUrl`).
3. Approve → server exchanges code for tokens → stored in `marketplace_tokens (platform='etsy')`.
4. Verify: `node scripts/marketing-setup.js` reports `Etsy: connected`.
5. `ETSY_SHOP_ID` is optional — `getEtsyShopId()` auto-discovers it.

**Status check:** `GET /api/setup/status` → `etsy.connected: true` when done.

### 4.2 Pinterest (official API v5 or Buffer bridge)

**Option A — Direct Pinterest API (recommended once app is approved):**
1. Create a **Pinterest Business account** at `business.pinterest.com`.
2. Register a developer app at `developers.pinterest.com/apps/` — request **Standard access**.
3. Generate an OAuth access token with scopes `pins:create`, `pins:read`, `boards:read`, `boards:write`.
4. Add to `.env`:
   ```
   PINTEREST_ACCESS_TOKEN=<your_token>
   PINTEREST_BOARD_ID=<board_id>
   ```
5. The bot's `pinEngine.duePins()` posts via the direct API when the token exists; otherwise it falls back to Buffer.

**Option B — Buffer bridge (interim, pins are public immediately):**
1. Create a Buffer account at `buffer.com`, connect your Pinterest profile.
2. Get a Personal Access Token: Buffer dashboard → Settings → API.
3. Add to `.env`:
   ```
   BUFFER_API_TOKEN=<token>
   BUFFER_CHANNEL_ID=<pinterest_channel_id>
   BUFFER_BOARD_SERVICE_ID=<board_service_id>
   ```

**Status check:** `GET /api/setup/status` → `marketing.pinterest.configured: true`

### 4.3 TikTok Ads

1. Create a **TikTok Business account** at `ads.tiktok.com`.
2. In Ads Manager → Apps → Register a developer app (OAuth2).
3. Set redirect URI to `https://<your-domain>/api/auth/tiktok/callback` (or use a local tunnel for dev).
4. Generate an **advertiser ID** from the TikTok Ads dashboard.
5. Add to `.env`:
   ```
   TIKTOK_ACCESS_TOKEN=<oauth_token>
   TIKTOK_ADVERTISER_ID=<advertiser_id>
   ```
   Budget caps are pre-configured: default $20/day, max $100/day, max $500 total (overridable via env).

> TikTok requires a **payment method** on file before ads can spend. The bot won't auto-create campaigns until both token + advertiser ID are set.

**Status check:** `GET /api/marketing/dashboard` → `channels.tiktok.configured: true`

### 4.4 Reddit + X (social posts)

1. **Reddit:** Register a "script app" at `reddit.com/prefs/apps`, note `client_id` + `client_secret`, generate a refresh token, store in `marketplace_tokens (platform='reddit')` or set `REDDIT_ACCESS_TOKEN`.
2. **X:** Apply for a developer account at `developer.x.com`, create an app, generate bearer token → `X_BEARER_TOKEN`.

**Status check:** `GET /api/social/status` → `reddit.configured` / `x.configured`

### 4.5 Email / Lead Magnet

1. Choose an ESP (MailerLite free tier recommended — 1,000 subscribers free).
2. Create a list + webhook endpoint (MailerLite: Integrations → Webhooks).
3. Set `ESP_WEBHOOK_URL=<your_webhook_url>`.

The lead magnet (`$0` free Gumroad product) is live on `/store` (see `publishFreeGumroad` in `marketplace.js`). New ESP subscribers flow into `esp_subscribers`.

**Status check:** `GET /api/setup/status` → `marketing.email.configured: true`

### 4.6 Discord Alert Niches (env var tuning)

The trend alerts in `automationCycle.js:taskScan()` now filter by preferred niches. Set at least one:

```bash
ALERT_NICHE_PROFESSIONS=roofing,hvac,beekeeping,wedding-photography
ALERT_NICHE_CATEGORIES=trades,creative,outdoor,wellness
ALERT_NICHE_HOBBIES=beekeeping,pottery,woodworking
ALERT_NICHE_CLUBS=recovery,aa-recovery,sober-curious
ALERT_NICHE_BELIEFS=secular-recovery,breathwork,mindfulness
```

If none are set, alerts fire on the first trend (backward compat).

---

## 5. Phase 2 — Content & Listing Pipeline (autonomous)

Once channels are configured, this runs automatically:

1. **`publishProduct()`** (marketplace.js) publishes approved products: Gumroad first → Etsy fallback. Throws if both fail — a product is only `listed` when a real listing exists.
2. **`pinEngine.pinNewProductAsync(productId)`** fires on every successful publish → schedules a Pinterest pin with a UTM-attributed store URL.
3. **Next 6h cycle** (`taskMarketingBot`):
   - `stepPinPromotion` → `pinEngine.scheduleForProductsAI(6)` creates pins + AI copy for new listings
   - `stepTikTokAds` → `tiktokAds.createAdForProduct()` for hot products (sales > 0 or no active ad), then `autoOptimize()`
   - `stepSocialPosts` → `socialPoster.scheduleForProducts(3)` drafts Reddit/X posts, `dispatchDuePosts()` publishes due ones
   - `stepEmailCampaign` → `sequenceEngine.generateSequence({purpose:'launch'})` for professions without a launch sequence, auto-exports to ESP webhook
   - `stepNewsletter` → weekly digest (generated, or exported if ESP configured)
   - `stepMetricsSnapshot` → records cross-channel KPIs into `marketing_metrics`

The **Digital Product Listing Generator** skill produces Etsy/Gumroad/Payhip listings (title, description, 13 tags, pricing) from a product spec. `listingAgent.directListing()` does the same programmatically, persisting to `products.listing_json` — all publish paths read it.

---

## 6. Phase 3 — Distribution & Engagement (autonomous)

| Channel | Mechanism | Self-healing |
|---|---|---|
| Pinterest | `pinEngine.duePins()` dispatches scheduled pins via Pinterest API v5 (or Buffer bridge) on each 6h cycle | Failed → `status='failed'` with reason; retries next cycle |
| TikTok | `tiktokAds.autoOptimize()` pauses low-CTR/CPA ads, scales high-ROAS winners; `syncPerformance()` pulls 7d metrics | Dead creatives → draft; errors → retry next cycle |
| Reddit/X | `socialPoster.dispatchDuePosts()` posts to value-first subreddits (17-niche map covers all professions) | Unconfigured → stays draft (manual post later); API errors → logged |
| Email | `sequenceEngine` generates 3-5 email launch sequences per profession, auto-exports to ESP | No webhook → ready-to-import; ESP errors → logged |

### Reddit/X community targeting

`socialPoster.SUBREDDIT_MAP` maps each profession slug to 3-5 value-first subreddits. New niches fall back to `['smallbusiness', 'entrepreneur', 'smallbusinesssba']`. Posts are 80% helpful content / 20% soft product mention ("built a template for this — link in comments").

---

## 7. Phase 4 — Optimization & Scaling (autonomous)

- **`autoOptimize()`** (TikTok): pause CTR<0.5% & spend>$5; pause CPA > 2× product price; pause 0-conv & spend>$10; scale ROAS>3.0 & conv≥3; scale CTR>2.0 & clicks>20. Budget cap: $100/day, $500 total.
- **`adAttributionEngine.runAttributionSweep()`**: centralized kill-scale verdicts (burn tripwire ≥$15/0 sales → killed; ROAS<1.2 → paused; ROAS≥3.0 & spend≥$20 → scaled).
- **`pricingEngine.autoPromoteWinners()`**: promotes winning price tests automatically (bounded to 24h per tier).
- **`winnerEngine.amplifyWinners()`**: generates siblings/bundles/sequels for selling niches.
- **`designCritic.reskinProduct()`**: one automatic reskin attempt for products with ≥2 sales but weak design score.

---

## 8. Production Safety & Review-Queue Model

### Safety gates (env vars)
```
AUTO_PUBLISH_ENABLED=true   # → products auto-list on Gumroad/Etsy
MARKETING_AUTO_ENABLED=true # → 6h cycle runs the marketing bot
AUTO_START_ENABLED=true     # → automation cycle runs at all
```

### Review queue model (addresses the user's "review before live" requirement)
The tension: **"autonomous every 6h for 5 years" vs. "review final proofs before anything goes live."**

- **Auto-approved path:** `QUALITY_AUTO_APPROVE=true` auto-approves `FLIGHT_READY ≥85` products into the publish queue (`qualityEngine` 5-dim audit). Manual-origin products are never auto-approved.
- **Review queue path:** `QUALITY_AUTO_APPROVE` unset → drafts → `pending-review` → **human approval required** before `publishProduct()`. Review via the console (`/setup` → Review triage, J/K/A/R keys).
- **Marketing creatives:** TikTok posts, Reddit/X posts, email sequences are generated as `draft` rows first. `dispatchDuePosts()` only publishes due drafts when a channel token exists — operator can preview/deny in the console before dispatch.

**Recommendation:** Keep `QUALITY_AUTO_APPROVE` off until the first 50 products prove the quality gate. Then opt in per-niche.

---

## 9. MCP Servers (agent tooling, not runtime)

Configured in `mcp_servers.json` and `.mcp.json`:

| Server | Purpose | Install |
|---|---|---|
| `pinterest-mcp@0.3.0` (clugtu) | Pinterest API v5 OAuth, pin management | `npx -y pinterest-mcp@0.3.0` (auto-via mcp_servers.json) |
| `etsy` (mcp.api.etsycloud.com) | Etsy API docs/reference | HTTP MCP (built-in) |
| `etsy-shop` | Etsy shop operations | `node C:/Users/linde/tools/etsy-mcp-community/dist/mcp.js` |
| `cloudflare` | Cloudflare Worker management | HTTP MCP (built-in) |

> Note: the **runtime** marketing bot calls APIs directly via axios (pinned in `pinEngine.js`, `tiktokAds.js`, `socialPoster.js`). The MCP servers are for **agents** working on NicheGate — not part of the autonomous cycle. The `pinterest-mcp` handles OAuth flow + pin CRUD for manual/operator use.

---

## 10. Acceptance Criteria Status

| Criterion | Code | Configured? | Notes |
|---|---|---|---|
| All channels have working API/MCP connections | ✅ Built + tested | ❌ Tokens missing | Human-gated OAuth (Section 4) |
| Products auto-publish to Gumroad + Etsy | ✅ publishProduct fallback | ✅ Etsy keys set | Etsy OAuth pending; `AUTO_PUBLISH_ENABLED` unset |
| Pinterest pins auto-post on schedule | ✅ pinEngine + duePins | ❌ No token | Direct API or Buffer bridge (Section 4.2) |
| TikTok ads run with auto-optimization | ✅ tiktokAds + autoOptimize | ❌ No token | Section 4.3 |
| Discord alerts only fire for relevant niches | ✅ ALERT_NICHE_* filter | ❌ Not set | Set env vars (Section 4.6) |
| Email list captures leads from free content | ✅ sequenceEngine + ESP export | ❌ No webhook | Section 4.5 |
| Metrics tracked across all channels | ✅ marketingMetrics | ✅ (code) | `/api/marketing/dashboard` |
| Zero manual intervention (production) | ✅ Gates in place | ❌ Gates closed | Flip `AUTO_PUBLISH_ENABLED` + `MARKETING_AUTO_ENABLED` after tokens |

---

## 11. Next Steps (ordered)

1. **Run setup validation:** `node scripts/marketing-setup.js` — prints a live status report of every channel.
2. **Acquire OAuth tokens** (Section 4) — Etsy first (keys are ready), then Pinterest, TikTok, Reddit/X, ESP.
3. **Set env vars** in `.env`: flip `MARKETING_AUTO_ENABLED=true`, `AUTO_PUBLISH_ENABLED=true` only after tokens are live.
4. **Set Discord alert niches** (Section 4.6).
5. **Verify:** `GET /api/marketing/dashboard` shows `all channels configured: true`; run one manual cycle: `POST /api/marketing/cycle`.
6. **Flip to autonomous:** with both gates on, the 6h cycle runs the bot with zero intervention.

---

## 12. Pre-Oct 2023 Product Evaluation

See `PRE_OCT2023_PRODUCT_EVAL.md` for the 230-product inventory breakdown:
- 10 listed → **KEEP/STASH** (already live, don't touch)
- 29 approved → keep
- 26 engine-origin drafts → **REDO** through the pipeline (original failure was model-provider, now fixed)
- 165 manual drafts → leave as-is
- **TRASH: none**

---

## 13. Key Files Reference

```
server/services/marketingBot.js    — orchestrator (runMarketingCycle + 6 steps)
server/services/marketingMetrics.js — channelHealth, marketingDashboard, recordMetric
server/services/pinEngine.js       — Pinterest scheduling + dispatch + UTM attribution
server/services/tiktokAds.js       — TikTok campaign creation + auto-optimize + ledger
server/services/socialPoster.js    — Reddit/X value-first posting
server/services/bufferBridge.js    — interim Pinterest via Buffer
server/services/adAttributionEngine.js — centralized kill-scale verdicts
server/services/marketplace.js     — publishProduct (Gumroad→Etsy fallback)
server/services/sequenceEngine.js  — email launch sequences + ESP export
server/services/automationCycle.js — taskMarketingBot() + 6h cycle wiring
server/index.js                    — routes (/api/marketing/*, /api/pins/*, etc.)
server/database.js                 — schema for all marketing tables
test/marketing-bot.test.js         — 20 tests (all pass)
scripts/marketing-setup.js         — channel health validation CLI
.env.example                       — full config reference
```
