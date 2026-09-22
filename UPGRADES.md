# NicheGate — Revenue Upgrade Roadmap (v2, 2026-09-22)

**Goal: maximum revenue.** Sequenced for cash velocity first, compounding systems second. Grounded entirely in machinery that already ships — every item names the existing code it rides on. ✅ = free · 💵 = small budget · 🔨 = build required.

**Current revenue state (verified from the live system):** Gumroad publishing works end-to-end (4-step S3 flow + covers, 10 creations/day cap). Etsy OAuth is built and tested through token exchange, waiting on identity verification. Sales sync (Gumroad → `metrics` + Discord alerts) is live. Lead magnet is live on `/store` with capture slot. The console now reports a truthful Shop Health picture (Pass 2 hardening), and the BI panels expose where money is stuck.

---

## WAVE 1 — Cash this week (zero new code, mostly clicks)

| # | Play | Why it prints | Rides on |
|---|---|---|---|
| 1 | **Drain the publish queue daily.** Every approved product + $29 toolkit bundle not yet `listed` is inventory sitting in a warehouse. Run `push-bundles` (and approve the review queue) every day until Gumroad's 10/day cap stops blocking. | Every queued bundle is a $29 listing that can start selling tonight. The system was built for exactly this loop. | `push-bundles` action, `bundleEngine`, Gumroad flow, console Publish Day panel |
| 2 | **Approve the review backlog aggressively.** Drafts generate nothing. The vetting gate already did the risk analysis — trust it, batch-approve, let Wave-3 rules prune losers later. | Nothing earns until it's listed. Review latency is the #1 silent revenue killer in this architecture. | `approve-all` action, Review triage (J/K/A/R), vettingEngine |
| 3 | **Verify Etsy identity, then connect OAuth.** Etsy is where template buyers actually *search*. The flow is complete — this is a paperwork step, not a build step. | Second full marketplace for the entire catalog at once, plus Etsy's buyer-intent traffic. Biggest single unlock available. | `marketplace.js` OAuth (PKCE), `/setup` wizard, Etsy push paths |
| 4 | **Raise prices on the $10 tier → $14.** Digital templates at $10 anchor "cheap". Test $14 on 2–3 checklist-type products for a week; revert only if conversion falls >20%. | +40% price on the bottom tier with negligible unit loss typically nets 25–35% revenue on that tier. Zero code. | Nothing — manual in Gumroad |

**Wave 1 target:** every generated product listed on at least one marketplace, both marketplaces connected, price test running.

---

## WAVE 2 — New revenue surfaces (1–2 weeks, small builds)

| # | Play | Why it prints | Rides on |
|---|---|---|---|
| 5 | **Order bump at Gumroad checkout** 💵🔨: a $9 "print-ready HD pack" add-on on every product page. | Order bumps typically add 10–20% to AOV with one checkbox. Gumroad supports them natively; content is a page-count export that `fileFactory` can emit. | `fileFactory`, product page config |
| 6 | **"We brand it for you" $49 tier** 🔨: the visual editor already injects name/colors/fonts — expose it as an order form + manual fulfillment (30 min/job, start manual). | 3–5× the price of the underlying template for work the tool mostly does already. Highest margin product in the catalog. | `console.js` editor, `PATCH /api/products/:id/html`, designStudio |
| 7 | **Good / Better / Best bundle ladder** 🔨: per niche, price the single ($14), 3-pack ($24), Complete Toolkit ($29 → **$39** with the bump in #5). | Anchoring lifts the bundle; the ladder captures buyers at every depth instead of one flat offer. | `bundleEngine` (5–7 products per profession), pricing in `productTypes.js` |
| 8 | **Launch coupon ladder** ✅: NEW niches launch at 30% off for 72h ("founding price"), announced via the Discord webhook. | Urgency + the Discord alert channel already exists; scarcity framing converts browsers the day inventory lands. | `notifier.js` webhook, Gumroad codes |
| 9 | **Newsletter as a selling channel** ✅🔨: the weekly digest engine already composes the email — add the top-3 new listings with buy links and actually send it (Gumroad audience export or a free Mailerlite tier). | Free repeat traffic to the storefront; the hardest part (content generation) is already automated. | `/api/newsletter` digest, `seoEngine` output |

**Wave 2 target:** AOV lifted via ladder + bump, a second price tier live, repeat traffic loop started.

---

## WAVE 3 — Compounding systems (this quarter, bigger builds)

| # | Play | Why it prints | Rides on |
|---|---|---|---|
| 10 | **Kill/scale autopilot** 🔨: weekly job — listings with 0 views in 30 days get retired or bundled into a clearance pack; listings with sales get 3 auto-generated siblings (other themes/types) and a +20% price test. | The catalog self-curates: capital (generation time, quota) flows to proven demand. This is the single highest-leverage automation left. | `metrics` tables, `automationCycle`, `productDraft`, console run stream |
| 11 | **SEO push to listings** ✅🔨: `seoEngine` already writes optimized titles/descriptions/13 Etsy tags per product — schedule a pass that *updates live Etsy/Gumroad listings* with regenerated metadata. | Existing listings get re-indexed with better keywords without new generation. Free ranking lift on the whole catalog. | `seoEngine`, marketplace update paths |
| 12 | **Seasonal launch timing** ✅: the 12-month demand map biases generation — enforce that seasonal products *only publish* in their peak window (Oct for Christmas, Jan for planners…). | Launching into peak demand roughly doubles early velocity vs. evergreen timing. | `seasonalEngine`, publish gate |
| 13 | **Template Vault membership $9/mo** 🔨: all-access to the catalog via Gumroad memberships. | Recurring revenue compounds; one-off sales don't. Only viable once the catalog is deep (Wave 1 drains the queue first). | storefront, Gumroad memberships |
| 14 | **Competitor intelligence pipeline** 🔨: paste a competitor listing URL → scrape title/tags/price/saturation → the Opportunity Engine scores the niche → one-click generate 3 competing products. (The one good idea in the EtsyGenie mockup — built on real data instead of none.) | Turns manual competitive research into a 10-second loop feeding the existing generation engine. | `discovery.js`, `scoreOpportunity`, `vettingEngine`, Etsy saturation |
| 15 | **Etsy Ads autopilot** 💵: only after 10+ live Etsy listings and real conversion data — $1–3/day on proven sellers, auto-pause when ROAS < 1. **Do not spend before organic data exists.** | Paid amplification of proven winners only. | `metrics`, ads ledger |

**Wave 3 target:** the machine reallocates its own effort toward what sells; research-to-product loop closes.

---

## Suggested execution order

**1 → 2 → 3 → 4** (pure clicks, start tonight) → **8** (free) → **5 → 7 → 6** (small builds) → **10 → 11** (the compounding core) → **9 → 12** → **13 → 14 → 15** once organic data justifies them.

**The one metric to watch:** days-from-generation-to-listed. Everything in Waves 1–3 compresses it, and it is the strongest predictor of revenue in this architecture.

---

*v2 replaces the 2026-09-21 backlog: items 1, 3, 4, 5 (covers), seasonal map, and lead magnet from v1 are shipped and folded into the assumption base rather than re-listed as backlog.*
