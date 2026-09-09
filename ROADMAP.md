# NicheGate — Roadmap & Status

**Last updated:** 2026-09-06 (post full audit — see [`AUDIT.md`](AUDIT.md))
**Server:** http://localhost:5000 (auto-starts with `start-nichegate.bat`) · **Cloud:** https://nichegate-production.up.railway.app (live, 24/7)
**Storefront:** `/store` · **Setup:** `/setup`
**Catalog:** 23 professions · 895 products · **10 live on Gumroad** · 13 toolkits + 1 lead magnet queued

---

## ✅ SHIPPED & VERIFIED

### Core
- [x] Express + SQLite stack (WAL), 20+ API endpoints — all verified passing
- [x] **File Factory** — every product gets a real file at creation/export/publish; no listing can ever go live without its deliverable
- [x] PDF (Puppeteer, cached browser) · XLSX with **real Excel formulas** · ZIP packaging (unique filenames)
- [x] Full visual editor (live recolor/font-swap, PDF export, save)
- [x] Review Queue + every-other-day review gate
- [x] Dashboard: collapsible sidebar, live stats, trends with vetting grades, metrics, notifications
- [x] Storefront (`/store`) showing **live** Gumroad products with real buy URLs

### Revenue engines
- [x] **Bundle engine** — 22 × $29 Complete Toolkits built; 9 LIVE (files + branded covers attached), 13 queued behind Gumroad's 10-creations/day limit
- [x] **Sales feedback loop** — Gumroad sales → Metrics (Real Sales / Real Revenue) + alerts; runs every cycle
- [x] **Lead magnet** — free Starter Pack built; deploys after the daily limit resets
- [x] **SEO engine** wired into every publish (titles, descriptions, 13 Etsy tags)

### Autonomous discovery
- [x] **Discovery Engine** — sweeps every 2h, independent of the review gate
- [x] **Niche Universe** — 150+ niches across all industries/hobbies/groups
- [x] **Live radar** — Google Trends + Reddit (20 subs) + Amazon/eBay best-effort
- [x] **Trend → product auto-generation** — activating a niche instantly creates its right product mix
- [x] **Freshness pass** — active niches keep getting new variations
- [x] **Seasonal engine** — 12-month demand map drives seasonal products

### Fixed along the way (were revenue-killers)
- Gumroad flow rewritten (old code created listings with **no file** + left them unpublished)
- XLSX: real formulas + numeric prices; sheet-name sanitizing for professions with `/`
- Etsy OAuth: proper PKCE + redirect-URI persistence (was broken)
- Publish dispatcher: **no simulated success** — failures throw and log
- Windows `sendFile/download` bugs fixed everywhere; launcher kills only port 5000

### Fixed in the full audit (2026-09-06)
- Seasonal engine crash (`focus is not defined`) — was silently failing every seasonal push
- **Review-gate deadlock** — `last_review` was never reset, so automation permanently paused after 2 days; added "▶ Resume" + `completeReview()`
- Removed dead Gumroad stub + `listOnGumroad`; corrected stale "simulated" text; honest storefront stats

---

## ⏳ NEXT STEPS (in order)

### 1. Today (free, one click each)
- [ ] Click **🎁 Deploy Bundles** in Automation → publishes the 13 queued toolkits (re-run tomorrow if the 10/day cap blocks some)
- [ ] Click **🧲 Lead Magnet** → free Starter Pack goes live (email capture on)
- [ ] Rename Gumroad username to `nichegate` (settings → Profile) — name is confirmed available
- [ ] Add `DISCORD_WEBHOOK_URL` to `.env` for instant sale/trend alerts (email is still a stub — Discord is the only working channel)
- [ ] **Decide on auto-approve** — the #1 lever: auto-approve drafts on non-review days so the 872-draft backlog actually lists (see UPGRADES.md)

### 2. This week (24/7 + traffic)
- [ ] **Deploy to Railway** (~$5/mo) so discovery sweeps + sales sync run without your PC on
- [ ] Finish **Pinterest Business** profile setup (brand name, logo, store URL, 3 boards) — then I build the auto-pinner
- [ ] Approve + publish singles from the Review Queue as they accumulate (871 drafts and counting)

### 3. Channels (accounts needed from you)
- [ ] **Etsy OAuth** at `/setup` when identity verification clears → 600+ product backlog goes to Etsy
- [ ] **Amazon KDP** account → recovery journals become printed books
- [ ] **Creative Market / Teachers Pay Teachers / Canva Creators** applications → new storefronts for existing content
- [ ] **Lemon Squeezy** as VAT-handling backup checkout

### 4. Scale features (built on request)
- [ ] Pinterest auto-pinner · affiliate program · email launch list (Brevo) · price A/B testing · SEO rotation · auto-retire zero-sale listings after 30 days

---

## 💰 Where the money comes from
1. **Toolkits** ($29) — 22 niches × bundles; 9 live today, all 22 by end of week
2. **Singles** ($10–24) — the 870-draft backlog, approved in batches
3. **Etsy** — bigger search audience once OAuth clears
4. **Trend windows** — Grade-A vetted niches activated before they peak (the "burrito blanket" play)
5. **Lead magnet** — free pack captures emails → zero-cost launch traffic
