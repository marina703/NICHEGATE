# 🚪 NicheGate

**An autonomous digital-product factory.** NicheGate discovers trending niches, generates sellable digital templates (invoices, calculators, checklists, journals, brand kits, social packs, complete toolkits), and publishes them to marketplaces — with human review gates where it matters.

> Tagline: *Templates for the oddly specific.*

**Local app:** http://localhost:5000 · Storefront: `/store` · Setup: `/setup`

---

## What it does

```
┌─────────────────┐   ┌──────────────────┐   ┌─────────────────┐   ┌──────────────┐
│  DISCOVERY      │ → │  CREATION        │ → │  REVIEW GATE    │ → │  PUBLISH     │
│  every 2 hours  │   │  auto-generated  │   │  every 2 days   │   │  Gumroad     │
│  150+ niches +  │   │  templates       │   │  human approves │   │  (+ Etsy     │
│  live signals   │   │  real files      │   │  before listing │   │  when OAuth) │
└─────────────────┘   └──────────────────┘   └─────────────────┘   └──────────────┘
```

- **Hunts** trending niches across industries, hobbies, trades, and groups — continuously
- **Generates** real deliverable files (PDF/XLSX/ZIP) — never a listing without a downloadable product
- **Bundles** products into $29 "Complete Toolkit" packages per niche
- **Publishes** to Gumroad (live) with branded covers; Etsy ready once OAuth clears
- **Learns** — real sales sync back into metrics; winners get scaled, duds get retired

---

## Feature engines (`server/services/`)

| Engine | File | What it does |
|---|---|---|
| **File Factory** | `fileFactory.js` | Single source of truth: turns any product row into a real downloadable file. Used at creation, export, AND publish time — a listing can never go live without its file. |
| **Bundle Engine** | `bundleEngine.js` | Packages 5–7 products per profession into one $29 toolkit ZIP. Idempotent. |
| **Discovery Engine** | `discovery.js` | The autonomous hunt: live radar + niche-universe sampling + seasonal focus → new trend candidates. Generates trend-appropriate products on activation. |
| **Niche Universe** | `nicheUniverse.js` | 150+ curated niches spanning trades, beauty, fitness, pets, food, tech, home, events, education, finance, health, outdoor, recovery, and niche groups. |
| **Trend Radar** | `trendRadar.js` | Live signals: Google Trends RSS, Reddit rising posts (20 subreddits), Amazon Movers & Shakers, eBay trending. Each source best-effort/fail-safe. |
| **Seasonal Engine** | `seasonalEngine.js` | 12-month demand map — biases generation toward what peaks this month. |
| **Vetting Engine** | `vettingEngine.js` | 5-signal scoring (demand, competition, margin, seasonality, longevity) with an ACTIVATE/WATCH/SKIP gate. |
| **Velocity Engine** | `velocityEngine.js` | Trend scoring 0–100 with A/B/C/D grades. |
| **SEO Engine** | `seoEngine.js` | Keyword-optimized titles, descriptions, 13 Etsy tags per product. |
| **Design Engine** | `themes.js` | 8 edgy themes, tier-based selection, per-profession preferences. |
| **Marketplace** | `marketplace.js` | Gumroad (full 4-step S3 upload flow + covers via image host) + Etsy OAuth (proper PKCE). **No fake-success fallback** — failed publishes throw. |
| **Notifier** | `notifier.js` | Discord webhook alerts: sales, trends, review days, publish errors. |

## Automation schedule

| Schedule | Job |
|---|---|
| every **2 hours** | Discovery sweep (radar + universe + seasonal) + freshness pass — independent of review gate |
| every **6 hours** | Full cycle: discovery → sales sync → review-gate check → generate → seasonal product → auto-list (if enabled) |
| every **2 days** | Review gate pauses generation until you approve pending products |

---

## Quick start

```bash
cd nichegate
npm install          # express, puppeteer, xlsx, adm-zip, node-cron, axios, dotenv, multer, cheerio
cp .env.example .env # then fill in your keys
npm start            # → http://localhost:5000
```

**Windows:** double-click `start-nichegate.bat` (kills only whatever owns port 5000 — not all node processes).

Useful maintenance commands:

```bash
npm test               # run the HTTP smoke tests
npm run backup         # create a timestamped SQLite backup under runtime/backups/
npm run audit          # check production dependencies for known vulnerabilities
```

Spreadsheet previews are limited to generated files under `generated/` and 20 MB.
Treat spreadsheet inputs and generated artifacts as untrusted until reviewed; `xlsx`
currently reports advisories with no upstream fix, so do not expose arbitrary workbook
parsing to public uploads.

### `.env` keys

```ini
PORT=5000
BIND_HOST=127.0.0.1            # localhost-only by default; 0.0.0.0 to open up
ETSY_CLIENT_ID=...
ETSY_CLIENT_SECRET=...
GUMROAD_ACCESS_TOKEN=...
DISCORD_WEBHOOK_URL=...        # optional sale/trend/error alerts
NOTIFY_EMAIL=...               # optional
NODE_ENV=development
```

Gumroad token: gumroad.com/settings/advanced → Application Secrets.
Etsy keys: etsy.com/developers/register → set the redirect URI shown at `/setup`.

---

## API overview

| Area | Endpoints |
|---|---|
| Professions | `GET/POST /api/professions`, `PATCH /api/professions/:id/status` |
| Products | `GET/POST /api/products`, `PATCH /api/products/:id/status`, `PATCH /api/products/:id/html`, `DELETE /api/products/:id` |
| Mockups | `POST /api/templates/generate` (5 themed variations per prompt) |
| Visual editor | `POST /api/export/render`, `GET /api/export/product/:id`, `GET /api/export/profession/:id/zip` |
| Discovery | `POST /api/trends/scan`, `POST /api/discovery/sweep`, `GET /api/trends`, `POST /api/trends/:id/activate`, `GET /api/trends/vet/:id` |
| Bundles | `POST /api/bundles/generate`, `POST /api/bundles/publish` |
| Lead magnet | `POST /api/leadmagnet/deploy` |
| Marketplace | `POST /api/marketplace/publish/:id`, `GET /api/marketplace/test`, `GET /api/setup/status` |
| Sales | `POST /api/metrics/sync-gumroad`, `GET /api/metrics/summary` |
| Automation | `GET /api/automation/status`, `POST /api/automation/run`, scheduler start/stop, `GET /api/automation/log` |
| Health | `GET /api/health/readiness` (redacted launch-readiness report) |
| Storefront feed | `GET /api/store/products` (real listings + buy URLs + store URL) |

## Data

SQLite (`node:sqlite`, WAL mode) at `data/profession-box.db`:
`professions · products · templates · trends · metrics · chat_history · inspiration_photos · automation_log · settings · sales_seen · marketplace_tokens`

**Back this file up — it's the business.**

## Recovery content guarantees

Recovery journals (AA, SMART, Refuge, WFS, Secular, Faith-Based) are 30-day guided journals with program-specific prompts. The **Serenity Prayer anchors every 5th day (exactly 20%)**. The Faith-Based edition includes scripture-based prompts.

## Docs

- [`ROADMAP.md`](ROADMAP.md) — current status + next steps
- [`PUNCH_LIST.md`](PUNCH_LIST.md) — your action checklist
- [`UPGRADES.md`](UPGRADES.md) — ranked revenue backlog (short + long term)
- [`covers/`](covers/) — branded product covers + storefront assets

## Known limit?.';s

- Etsy listing waits on Etsy identity verification + OAuth (flow is built and tested up to token exchange)
- Gumroad caps product creation at **10/day** — bulk deploys run across days; re-run 🎁 Deploy Bundles until the queue clears
- Amazon Movers/eBay feeds are bot-gated from residential IPs — they fail gracefully; Google Trends + Reddit carry the live load
- Trend-activating a `SKIP`-verdict niche is blocked by the vetting gate on purpose

---

*Built as a full-stack Express + SQLite app with Puppeteer-rendered PDFs, SheetJS spreadsheets with live formulas, and adm-zip packaging. Windows-first, runs anywhere Node runs.*
  
## ?? Railway Environment Variables  
  
Set these in your Railway project variables at https://railway.app/dashboard  
  
```  
ETSY_SHARED_SECRET=sizb32x01hv4vzok64qt3iah  
ETSY_CLIENT_ID=sizb32x01hv4vzok64qt3iah  
ETSY_CLIENT_SECRET=nx8yl6b7da  
```  
  
## ?? Railway Environment Variables  
  
Set these in your Railway project:  
ETSY_SHARED_SECRET=sizb32x01hv4vzok64qt3iah  
ETSY_CLIENT_ID=sizb32x01hv4vzok64qt3iah  
ETSY_CLIENT_SECRET=nx8yl6b7da 
