# NicheGate — Punch List

**Last updated:** 2026-09-12

## ⏳ YOUR MOVES — in order

### Now (free, one click each)
- [ ] **Start the server** — double-click `start-nichegate.bat` (running: `http://localhost:5000`, store at `/store`)
- [ ] **Review Queue** — all 133 products already have premium previews + real files; approve & publish the ones you like
- [ ] **🎁 Deploy Bundles** (Automation panel) → publishes queued toolkits to the live store (Gumroad allows 10/day; re-run tomorrow if some remain)
- [ ] **✏️ Rename Gumroad username** → `nichegate` (Settings → Profile) — your store URL is currently `https://marinablow.gumroad.com`

### This week
- [ ] **Railway** (https://railway.app) — 24/7 hosting so sweeps + publishing run while your PC is off
- [ ] **Finish Pinterest profile** (Build your profile → NicheGate + logo + store URL + 3 boards)
- [ ] **Review Queue** — approve + publish the 133 real products

### When ready
- [ ] **Etsy OAuth** at `/setup` (when identity verification clears)
- [ ] **Amazon KDP** (https://kdp.amazon.com) — printed recovery journals
- [ ] **Creative Market** (https://creativemarket.com/sellers) · **TPT** (https://www.teacherspayteachers.com/Signup) · **Canva Creators** (https://www.canva.com/creators/) · **Lemon Squeezy** (https://www.lemonsqueezy.com)

## ✅ DONE (verified)
- [x] Full-stack app, 23 professions, 157 products · 15 listed · 9 approved · 133 drafts (all file-backed)
- [x] **Store is LIVE and set up** — real Gumroad store URL (`https://marinablow.gumroad.com`) wired to every CTA; feed reconciles stale marketplace IDs with the live Gumroad catalog (was showing zero buy links)
- [x] **Store branding applied — Gumroad** — all 10 brand assets synced from the `nichegate designs` folder → `covers/`; the NicheGate logo cover is attached to all 15 live Gumroad listings (verified in the Gumroad API payload)
- [x] **Store branding wired — Etsy** — icon + banner upload pipeline built (`PUT /v3/application/shops/{shop_id}/icon`, banner upload), OAuth scope upgraded to include `shops_w`, and one-click buttons on `/setup`. **Action needed:** `.env` has `ETSY_CLIENT_ID` and `ETSY_CLIENT_SECRET` set to the *same value* — replace with the real Etsy keystring + secret, reconnect Etsy, then hit "Logo + banner → Etsy"
- [x] **Brand assets in UI** — the `/store` storefront and dashboard now show the actual NicheGate logo image instead of a text mark; bundle & lead-magnet covers use `nichegate_logo_on_black.png`
- [x] **Free lead magnet deployed** — Starter Pack live at `https://marinablow.gumroad.com/l/mkmrhb`; banner active on `/store`
- [x] **Storefront showcases the designs** — every product card shows its real preview cover, plus a filterable "Design Studio" gallery (25 curated designs × 9 types + live toolkits) with full-size lightbox preview
- [x] **Review queue cleaned** — 770 identical clone drafts removed (133 unique, file-backed products remain; previews regenerated)
- [x] **Duplicate-proof generation** — auto-cycle fills only the missing type per profession; seasonal + discovery engines skip professions that are already covered (simulated 30 cycles: 0 clones created)
- [x] **Premium Design Studio** — every product type gets a rich, on-brand template (invoice, checklist, journal cover, brand kit, spreadsheet/booking dashboards, decision matrix, ROI, social pack ×4, bundle/lead-magnet covers, website)
- [x] **Broken listings fixed** — decision-matrix + ROI products can now export/publish (were HTTP 400); seasonal engine crash fixed (`focus is not defined`); template mockups now show the right design per type (was showing invoices for spreadsheets)
- [x] **Chrome auto-discovery** — PDF/preview generation no longer hard-fails when puppeteer's pinned Chrome revision is missing
- [x] File Factory — no listing ever goes live without a real file (every pending product now has its file on disk)
- [x] Bundle engine (22 toolkits), sales sync, covers, seasonal + discovery engines, live trend radar
- [x] Trend→product auto-generation + freshness pass
- [x] Storefront with live products/buy links, lead-magnet slot
- [x] All major publish/formula/OAuth bugs fixed
- [x] Drag-and-drop template pack at `generated/ready-to-upload/` (8 files)

## 📊 Current numbers
| Metric | Value |
|---|---|
| Professions | 23 |
| Products | 157 (15 listed · 9 approved · 133 drafts — all with files + previews) |
| Trends tracked | 87 |
| Store URL | https://marinablow.gumroad.com |
| Live Gumroad listings | 10 products + free Starter Pack lead magnet (11 with buy links in feed) |
| Real sales | 0 (sync is live — first sale alerts automatically) |

