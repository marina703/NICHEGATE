# 🚪 NicheGate

**A digital-product factory built toward end-to-end autonomy.** NicheGate's intended pipeline discovers and forecasts demand, creates and edits sellable digital products, checks their quality, publishes to external marketplaces, and learns from results. The operator interface is a private command center for visibility and control; NicheGate has no customer-facing storefront.

> Tagline: *Templates for the oddly specific.*

**Local app:** http://localhost:5000 · Command center: `/` · Setup: `/setup` · Login: `/login`

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
| **Trend Radar** | `trendRadar.js` | Live signals: Google Trends RSS, Reddit rising posts (20 subreddits), Serper autocomplete, DataForSEO keyword volume, Etsy saturation. Each source best-effort/fail-safe. |
| **Seasonal Engine** | `seasonalEngine.js` | 12-month demand map — biases generation toward what peaks this month. |
| **Vetting Engine** | `vettingEngine.js` | Multi-signal scoring (demand, competition, margin, seasonality, longevity) with an ACTIVATE/WATCH/SKIP gate. |
| **Velocity Engine** | `velocityEngine.js` | Trend scoring 0–100 with A/B/C/D grades. |
| **SEO Engine** | `seoEngine.js` | Keyword-optimized titles, descriptions, 13 Etsy tags per product. |
| **Design Engine** | `themes.js` · `designStudio.js` · `designStyles.js` | 8+ edgy themes, tier-based selection, per-profession preferences, premium template builders. |
| **Marketplace** | `marketplace.js` | Gumroad (full 4-step S3 upload flow + covers) + Etsy OAuth (PKCE). **No fake-success fallback** — failed publishes throw. |
| **Notifier** | `notifier.js` | Discord webhook alerts: sales, trends, review days, publish errors. |
| **AI layer** | `modelRouter.js` · `modelConfig.js` · `conceptEngine.js` | OpenRouter-backed differentiated product concepts. Never throws — degrades to deterministic templates. |

## Automation schedule

| Schedule | Job |
|---|---|
| every **2 hours** | Discovery sweep (radar + universe + seasonal) + freshness pass — independent of review gate |
| every **6 hours** | Full cycle: discovery → sales sync → review-gate check → generate → seasonal product → auto-list (if enabled) |
| every **2 days** | Review gate pauses generation until you approve pending products |

---

## Command Center — "Flight Deck"

The dashboard at `/` is a single-page console built from plain ES modules — **no bundler, no build step**, so the Docker/Railway deploy is unchanged.

```
client/index.html          shell: rail, status strip, content hosts
client/css/flightdeck.css  design tokens + components
client/js/ui.js            escaping, icons, modals/drawer, charts, review-queue helpers
client/js/api.js           endpoint clients + SSE stream
client/js/views.js         12 view renderers (pure: state → HTML)
client/js/console.js       state, router, ⌘K palette, run stream, delegated actions
```

- **⌘K / Ctrl-K** opens the command palette: every view plus every registered action.
- **Run stream** (topbar dot) shows live execution events with per-step timelines; history comes from `action_runs` / `action_run_steps`.
- **Review triage**: `J`/`K` move, `A` approve, `R` reject, `Enter` open, `Esc` close.
- **Views**: Home · Catalog · Review · Discovery · Trends · Social · Ads · Calendar · Analytics · Automation · Market · System.
- **BI panels** (`/api/console/bi`, real tables only): Shop Health /100 with a transparent point breakdown, 7d-vs-prior KPI deltas, 14-day revenue series, listing health (velocity badges + zero-view + SEO-weakness), and a rule-based Opportunity / Risk / Do-this-next insights triad with one-click actions.

Actions are defined as a **closed allowlist** in `server/services/actionRegistry.js` and mapped onto existing handlers — to add one, register a name, label, description, input schema and handler there; the palette, `/api/console/run` and the run history pick it up automatically. Nothing in the console requires the AI layer: with `MODEL_ENABLED=false` every command still works.

---

## Quick start

```bash
npm install
cp .env.example .env   # then fill in your keys
npm start              # → http://localhost:5000
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
ETSY_SHARED_SECRET=...         # Etsy x-api-key (see Etsy developer console)
GUMROAD_ACCESS_TOKEN=...
DISCORD_WEBHOOK_URL=...        # Discord alerts; required in production for surrogate decisions
ADMIN_PASSWORD=...              # >=16 characters; required in production
NOTIFY_EMAIL=...               # optional
MODEL_ENABLED=false            # true to switch on the AI concept layer
AUTO_START_ENABLED=false       # production only: explicitly start scheduled automation
AUTO_PUBLISH_ENABLED=false     # production only: explicitly permit cycle publishing
OPENROUTER_API_KEY=...
NODE_ENV=development
```

Gumroad token: gumroad.com/settings/advanced → Application Secrets.
Etsy keys: etsy.com/developers/register → set the redirect URI shown at `/setup`.

> **Never commit `.env`.** All secrets live only in the environment (locally in `.env`, in production as host variables).

---

## API overview

| Area | Endpoints |
|---|---|
| Professions | `GET/POST /api/professions`, `PATCH /api/professions/:id/status` |
| Products | `GET/POST /api/products`, `PATCH /api/products/:id/status`, `PATCH /api/products/:id/html`, `DELETE /api/products/:id`, `POST /api/products/generate-custom` (Make-this: idea + details/prompts) |
| Listing optimizer | `GET /api/products/:id/optimization`, `POST /api/products/:id/optimization/apply`, `POST /api/optimize/weak` (bulk). Deploy rule: manual products stay local, engine-generated listed products auto-deploy updated copy |
| Mockups | `POST /api/templates/generate` (5 themed variations per prompt) |
| Visual editor | `POST /api/export/render`, `GET /api/export/product/:id`, `GET /api/export/profession/:id/zip` |
| Discovery | `POST /api/trends/scan`, `POST /api/discovery/sweep`, `GET /api/trends`, `POST /api/trends/:id/activate`, `GET /api/trends/vet/:id`, `GET /api/trends/radar-health`, `GET /api/discovery/opportunity` |
| Bundles | `POST /api/bundles/generate`, `POST /api/bundles/publish` |
| Lead magnet | `POST /api/leadmagnet/deploy` |
| Marketplace | `POST /api/marketplace/publish/:id`, `GET /api/marketplace/test`, `GET /api/setup/status`, `GET/POST /api/caps` (daily publish caps — Gumroad 10, Etsy 20 by default) |
| Sales | `POST /api/metrics/sync-gumroad`, `GET /api/metrics/summary` |
| Automation | `GET /api/automation/status`, `POST /api/automation/run`, scheduler start/stop, `GET /api/automation/log` |
| Console | `GET /api/console/overview`, `GET /api/console/bi` (health/deltas/series/listing-health/insights), `GET /api/console/actions`, `GET /api/console/runs`, `GET /api/console/stream` (SSE), `POST /api/console/run` |
| Health | `GET /api/health/readiness` (redacted launch-readiness report) |

## Data

SQLite (`node:sqlite`, WAL mode) at `data/profession-box.db` locally and `RAILWAY_VOLUME_MOUNT_PATH/profession-box.db` on Railway:
`professions · products · templates · trends · metrics · chat_history · inspiration_photos · automation_log · settings · sales_seen · marketplace_tokens · search_queue · action_runs · action_run_steps`

**Back this file up — it's the business.**

## Recovery content guarantees

Recovery journals (AA, SMART, Refuge, WFS, Secular, Faith-Based) are 30-day guided journals with program-specific prompts. The **Serenity Prayer anchors every 5th day (exactly 20%)**. The Faith-Based edition includes scripture-based prompts.

## Docs

- [`AUDIT_REPORT.md`](AUDIT_REPORT.md) — latest end-to-end audit + resolutions
- [`ROADMAP.md`](ROADMAP.md) — current status + next steps
- [`PUNCH_LIST.md`](PUNCH_LIST.md) — your action checklist
- [`UPGRADES.md`](UPGRADES.md) — ranked revenue backlog (short + long term)
- [`covers/`](covers/) — branded product covers + storefront assets

## Known limits

- Etsy listing waits on Etsy identity verification + OAuth (flow is built and tested up to token exchange)
- Gumroad caps product creation at **10/day** — bulk deploys run across days; re-run 🎁 Deploy Bundles until the queue clears
- Amazon Movers/eBay feeds are bot-gated from residential IPs — they fail gracefully; Google Trends + Reddit + Serper carry the live load
- Trend-activating a `SKIP`-verdict niche is blocked by the vetting gate on purpose
- Social "Post Now" and the Ads budget ledger record intent locally; they do not call platform APIs

---

*Built as a full-stack Express + SQLite app with Puppeteer-rendered PDFs, SheetJS spreadsheets with live formulas, and adm-zip packaging. Windows-first, runs anywhere Node runs.*

## Railway deployment

Production startup is deliberately fail-closed. In any production environment, the server refuses to start unless `ADMIN_PASSWORD` is at least 16 characters and `DISCORD_WEBHOOK_URL` is a valid HTTPS Discord webhook. On Railway it also requires the Railway-provided mount path to exist and be writable. The app uses that path for SQLite, generated deliverables, uploads, previews, and generated cover art, so missing persistent storage cannot silently create ephemeral production data.

Attach a Railway Volume to the application service at **`/app/data`**. The app uses Railway's actual mount path for the database and persistent assets. Then set these as **project variables** in your Railway dashboard (values never belong in the repo):

```
ETSY_SHARED_SECRET=<your Etsy x-api-key / shared secret>
ETSY_CLIENT_ID=<your Etsy keystring>
ETSY_CLIENT_SECRET=<your Etsy client secret>
GUMROAD_ACCESS_TOKEN=<your Gumroad token>
OPENROUTER_API_KEY=<your OpenRouter key>
MODEL_ENABLED=true
ADMIN_PASSWORD=<at least 16 random characters>
DISCORD_WEBHOOK_URL=<your Discord webhook URL>
```

On production, automation does not auto-start and automatic marketplace publishing is blocked by default. Publishing through an automated cycle requires both `AUTO_START_ENABLED=true` and `AUTO_PUBLISH_ENABLED=true`, plus the app's `auto_list` setting; omitting either environment flag keeps cycle publishing safe. Direct/manual publish actions remain available to an authenticated operator. Set the flags only after checking the live database, marketplace credentials, and daily limits.

Before first deployment, back up any existing Railway data and verify the volume is attached at `/app/data`; Railway volumes are configured on the service and cannot be attached by this repository's `railway.json`. Discord delivery failures are reported as failures (and webhook secrets are never logged); a surrogate question is not left silently pending if its notification fails. Missing optional marketplace/model credentials are announced once at boot without exposing secret values. Existing generated files previously stored outside the Railway Volume are not migrated by the code; missing deliverables are regenerated on demand from product records where possible, but pre-existing external marketplace files cannot be reconstructed from an absent local copy.
