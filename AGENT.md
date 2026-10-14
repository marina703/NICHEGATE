# AGENT.md — Autonomous Agent Operating Manual for NicheGate

**Project:** NicheGate — an autonomous digital-product factory operated through a private command center; there is no customer-facing NicheGate storefront.
**Mission:** End state is an AI-run full loop: discover and forecast demand → create and edit file-backed digital deliverables (PDF, XLSX, ZIP) → quality-check → publish to external marketplaces → measure real outcomes → improve and scale winners. The command center is for visibility, configuration, and operator control. Keep current production safety opt-ins until the owner authorizes the operating mode.

---

## 0. Active Task Queue

**AGENT COMMS:** mailbox at repo root — `handoff-mail-FROM_BIONIC.md` (Bionic → Freebuff) and `handoff-mail-FROM_FREEBUFF.md` (replies). Read both at session start and after each task. **CHECKPOINT/ACK GATE:** multi-phase tasks post status at each phase boundary and wait for an `ACK:` (or owner go-signal) before proceeding; `HALT:` = stop at the next safe boundary. Exceptions: additive tests, docs updates, phases marked CONTINUOUS. The governance specs live in this repo root now (DESIGN_QUALITY_TASK, COVER_COMPOSITE_ADDENDUM, COVER_MODEL_FLEXIBILITY, LISTING_COPY_QUALITY, PIPELINE_STAGE_REGISTRY, CULL_DIRECTIVE, REVENUE_SPRINT_TASK, BIONIC_E2E_AUDIT) — read the spec before touching its subsystem.

- ~~DESIGN_QUALITY_UPGRADE~~ — DONE (brief-by-default + critic + art director live; see TASK.md).
- ~~CATALOG CULL~~ — RESOLVED: production already trimmed to 11 products (10 live Gumroad + an old draft set). The 11 drafts are owner-review-pending — do NOT purge.
- **IN FLIGHT — LISTING COPY QUALITY (HIGH, small):** spec in `LISTING_COPY_QUALITY.md`. Moat-context into seoEngine copy + boilerplate gate + anchor the 10 harness-managed listings as marketplace-linked rows. Being implemented by Bionic on this branch.
- **NEXT — REVENUE SPRINT (CRITICAL):** `REVENUE_SPRINT_TASK.md`. Launch pricing on the 10, pin import (origin=manual-kit), Etsy top-5 push (Etsy recovered — token refresh verified live). First recorded sale is the finish line.
- **PARKED (post-first-sale) — PIPELINE_STAGE_REGISTRY:** `PIPELINE_STAGE_REGISTRY.md`. Phase 1 must ship with zero behavior change.
- **OWNER ACTIONS:** post pins manually (3–5/day) · review the 11 drafts in the command center · Gumroad username rename (marinablow → nichegate) · Workers Paid only if cover volume exceeds ~14/day free.

---

## 1. Prime Architecture Directives (Non-Negotiable)

1. **Strict Command Center Architecture:**
   - There is **NO public customer-facing storefront**.
   - All client routes except `/login`, `/api/auth/*`, and `/api/health*` require an authenticated operator session.
   - Deliverables (`/generated`, `/uploads`, `/covers`) are strictly session-gated.
   - Sales surfaces are **Gumroad and Etsy only**.

2. **Physical Deliverable Gate:**
   - `fileFactory.ensureProductFile(product)` is an absolute physical gate.
   - No product may ever be approved, listed, or published without an on-disk deliverable file verified. Zero fake-success paths.

3. **Deterministic First & Graceful AI Degradation:**
   - Every operational action in the engine works with `MODEL_ENABLED=false`.
   - AI generation (`conceptEngine`, `modelRouter`) must never throw unhandled exceptions upstream; failures return `null` and fall back to deterministic templates.
   - AI token expenses are ledgered in `ai_usage` and factored into Net Unit-Economics.

4. **Persistence & Production Safety:**
   - SQLite (`node:sqlite`, WAL mode) persists under `RAILWAY_VOLUME_MOUNT_PATH` (`/app/data`).
   - Production requires `ADMIN_PASSWORD` (min 16 chars) and a valid `DISCORD_WEBHOOK_URL`.
   - Production automated publishing requires `AUTO_START_ENABLED=true` and `AUTO_PUBLISH_ENABLED=true`.

---

## 2. Core Engines & Pipeline Anatomy

| Component | File Path | Core Role |
|---|---|---|
| **Trend Discovery** | `server/services/trendRadar.js`, `discovery.js` | Scans Google Trends (DataForSEO), autocomplete (Serper), Pinterest Trends, YouTube RSS; detects breakouts (Z-score ≥ 2). |
| **Vetting Engine** | `server/services/vettingEngine.js`, `vettingLearner.js` | Evaluates demand, competition, margin, longevity, seasonality; logistic regression on real sales. |
| **Product Factory** | `server/services/fileFactory.js`, `xlsxGenerator.js`, `pdfGenerator.js` | Builds physical deliverables: multi-tab spreadsheets (IRR, Cash Flow), printable PDFs, ZIP toolkits. |
| **Listing Optimizer** | `server/services/listingOptimizer.js` | Etsy/Gumroad SEO optimization (title ≤140 chars, 13 tags); auto-deploys for listed products, holds manual ones local. |
| **Marketplace Hub** | `server/services/marketplace.js` | Gumroad API (S3 upload + product creation); Etsy API v3 OAuth with proactive token rotation. |
| **Winner Amplification** | `server/services/winnerEngine.js` | Horizon 1: Auto-creates Pro sequels, category siblings, and complete bundle kits for products with ≥2 sales. |
| **Autonomous Pricing** | `server/services/pricingEngine.js` | Horizon 1: Launch rule (-30% first 14d), A/B tiers (-15%/base/+25%), auto-promotes winning price tiers (≥5 sales, ≥2x velocity). |
| **Net Unit-Economics** | `server/services/bi.js` | Horizon 1: Real P&L subtracting Etsy (6.5% + $0.20 + 3% + $0.25), Gumroad (10% + 2.9% + $0.30), AI tokens, and ad spend. |
| **Competitor Intelligence**| `server/services/competitorEngine.js` | Horizon 2: Ingests competitor listing copy/URLs to identify vulnerable angles and generate counter-listings. |
| **Few-Shot Concepting** | `server/services/conceptEngine.js` | Horizon 2: Domain-specific few-shot exemplars (spreadsheets, checklists, dashboards) eliminating generic outputs. |
| **Mockup Studio** | `server/services/designStudio.js` | Horizon 2: Multi-device lifestyle mockups (MacBook, iPad Pro, iPhone) with CSS device framing. |
| **Seasonal Gate & Clearance**| `server/services/seasonalEngine.js`, `automationCycle.js` | Horizon 3: Enforces active seasonal peak windows for seasonal inventory, and tags 30-day zero-view products for clearance bundles. |
| **Distribution & Pinterest**| `server/services/pinEngine.js`, `sequenceEngine.js` | Horizon 3: Optimal time-slot scheduler, live Pinterest API v5 publishing, UTM attribution, Kit/MailerLite sequences. |
| **Flight Deck UI** | `client/index.html`, `client/js/*.js` | Zero-bundler ES module command console: 12 views, ⌘K command palette, SSE run stream, keyboard review triage (J/K/A/R). |
| **AI Autonomous Worker**| `server/services/agentWorker.js`, `steward.js` | Flight Deck command-bar agent, Discord boss channel pings, persistent memory store (`worker_memory`). |

---

## 3. Autonomous Automation Cycle (6-Hour Loop)

`server/services/automationCycle.js` executes modular, fault-tolerant tasks:
1. `taskScan`: Sweeps discovery sources for trending niches and fads.
2. `taskFreshness`: Refreshes trend measurements and snapshot histories.
3. `taskSalesSync`:
   - Proactively rotates Etsy OAuth token if expiring within 45m.
   - Syncs Gumroad sales into `metrics`.
   - Autonomous Pricing: auto-promotes statistical winner tiers to live listings (`autoPromoteWinners`).
   - Horizon 3 SEO Sweep: optimizes weak listings and pushes live copy updates.
4. `taskRetire`: Archives cooled trend niches and identifies 30-day cold listings for clearance packaging.
5. `taskScale`: Amplifies winners into Pro sequels, bundles, and siblings (`winnerEngine.amplifyWinners`).
6. `taskReviewGate`: On review days, pauses generation while keeping the publish queue active.
7. `taskGenerate`: Replenishes missing product types across active professions.
8. `taskSeasonal`: Generates seasonal products focused on the current month's peak window.
9. `taskPublishQueue`:
   - Enforces the **Seasonal Publish Gate**: holds off-season seasonal items until their peak window opens.
   - Honors daily marketplace caps (Gumroad default 10, Etsy default 20).
   - Only publishes approved engine-generated products (manual items remain local).
10. `taskPinDrain`:
    - Dispatches due scheduled pins to the live **Pinterest API v5** when credentials are configured.
    - Updates pin statuses to `posted`.

---

## 4. MCP Servers & External Integrations

Configured in `mcp_servers.json`:
- **Etsy Dev MCP**: `https://mcp.api.etsycloud.com/mcp`
- **Pinterest MCP**: `pinterest-mcp@0.3.0` (Pinterest API v5 for boards, pins, analytics, and automated publishing)

---

## 5. Standard Verification & Deployment Commands

```bash
# Run unit & hermetic test suite (180+ tests across 29 suites)
npm test

# Verify specific engines
node --test test/winner-engine.test.js
node --test test/pricing-auto.test.js
node --test test/bi-pnl.test.js
node --test test/horizon3.test.js
node --test test/lockdown.test.js

# Check git status
git status

# Push to GitHub
git push origin HEAD:main

# Deploy to Railway production
railway up --detach
# Check deployment status
railway deployment list
railway status
```

---

*Authored for all Codebuff and AI Agents maintaining NicheGate. Keep these tenets intact.*
