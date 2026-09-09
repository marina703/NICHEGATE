# NicheGate — Punch List

**Last updated:** 2026-09-06 (post full audit — see [`AUDIT.md`](AUDIT.md))

## ⏳ YOUR MOVES — in order

### Now (free, one click each)
- [ ] **🎁 Deploy Bundles** (Automation panel) → publishes the 13 queued toolkits (Gumroad allows 10/day; re-run tomorrow if some remain)
- [ ] **🧲 Lead Magnet** (Automation panel) → free Starter Pack goes live with email capture
- [ ] **Rename Gumroad username** → `nichegate` (Settings → Profile) — available, changes your store URL
- [ ] **Discord webhook** → paste into `.env` as `DISCORD_WEBHOOK_URL`, restart server (email alerts are a stub — Discord is the only live channel)
- [ ] **Decide on auto-approve** — approve drafts automatically on non-review days so the backlog lists (I can build this next)

### This week
- [x] **Railway** — ✅ live at https://nichegate-production.up.railway.app (24/7, auto_list OFF so no duplicates)
- [ ] **Finish Pinterest profile** (Build your profile → NicheGate + logo + store URL + 3 boards)
- [ ] **Review Queue** — approve + publish draft batches as they build up (or enable auto-approve)

### When ready
- [ ] **Etsy OAuth** at `/setup` (when identity verification clears)
- [ ] **Amazon KDP** (https://kdp.amazon.com) — printed recovery journals
- [ ] **Creative Market** (https://creativemarket.com/sellers) · **TPT** (https://www.teacherspayteachers.com/Signup) · **Canva Creators** (https://www.canva.com/creators/) · **Lemon Squeezy** (https://www.lemonsqueezy.com)

## ✅ DONE (verified)
- [x] Full-stack app, 23 professions, 895 products, 10 live listings
- [x] File Factory — no listing ever goes live without a real file
- [x] Bundle engine (22 toolkits), sales sync, covers, seasonal + discovery engines, live trend radar
- [x] Trend→product auto-generation + freshness pass
- [x] Storefront with live products/buy links, lead-magnet slot
- [x] All major publish/formula/OAuth bugs fixed
- [x] Drag-and-drop template pack at `generated/ready-to-upload/` (8 files)
- [x] Full audit (2026-09-06): fixed seasonal crash + review-gate deadlock + dead code + stale text

## 📊 Current numbers
| Metric | Value |
|---|---|
| Professions | 23 |
| Products | 895 (10 listed · 14 approved · 871 drafts) |
| Trends tracked | 87 |
| Live Gumroad listings | 10 (9 toolkits + 1 spreadsheet) |
| Real sales | 0 (sync is live — first sale alerts automatically) |
