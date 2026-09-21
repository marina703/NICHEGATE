# Goal: NicheGate — Autonomous Digital Product Factory

# Complete (2026-09-15 → 09-20):
- AI idea layer (OpenRouter), covers (Cloudflare FLUX), Design DNA (8 styles × 13 niches).
- 33 product types, 16 builders, security hardening.
- Command Center: 10 views, 32 endpoints, premium dark redesign.
- Social: 6 platforms, batch generation, scheduling.
- Ads: budget tracking, commit/cancel.
- Analytics: revenue by type/niche, conversion funnel.
- Calendar: monthly activity view.
- Smart Actions: context-aware suggestions.
- Newsletter: auto-generated weekly digest.
- Stripe: endpoints ready (needs STRIPE_SECRET_KEY).
- Etsy: daily cap min 10, direct push, passion niches.
- Config: MODEL_ENABLED=true, BIND_HOST=0.0.0.0, Etsy connected, Gumroad connected.

# ── 2026-09-20 PM: darker UI + MAJOR bug sweep ──
Done this session (all verified by curl against a freshly-booted server):
- Dashboard darker restyle: new :root palette (#04060a base), teal to blue to
  violet gradient, ambient radial glows, grid texture, depth/glow on panels,
  cards, KPIs, funnel, modals, toasts. All existing features kept intact.
  Audited: 0 undefined CSS vars (was ~14 undefined before).
- FIXED: 4 views (social/ads/calendar/analytics) were ORPHANED. Their render
  functions existed but there were no nav rail links, no render() branches, no
  crumb labels, and VIEWS only listed 6 entries. Now fully wired (10/10).
- FIXED server/index.js: the /api/health handler was never closed, so ~790
  lines containing 22 route registrations were NESTED inside it. They only
  registered when /api/health was hit, and a stray "a" fragment threw
  mid-handler, permanently killing every route after it. Result: 9 endpoints
  returned 404 forever. De-nested. Now 98 top-level routes, 0 nested.
- FIXED patch-script truncation fragments: stray "a" x2, "pp.post/get" x3
  (missing leading "a" of "app").
- FIXED SQL: prof_name queried directly from products (no such column). Added
  professions JOIN in revenue/summary, calendar, smart-actions, newsletter.
- FIXED SQL: trends.status (no such column) changed to activated = 1.
- FIXED renderCalendar assigning a month STRING to the cal variable.
- FIXED smart action calling nonexistent go('chat') / quickChat().
- FIXED copyNewsletter using wrong showToast() argument order.
- FIXED broken btoa() concatenation in the social preview button (also
  unicode-unsafe; schedulePost now decodes safely and prefers cached content).
- IMPLEMENTED conceptEngine.generateSocialPost - it was called by
  /api/social/generate and /api/social/post-now but never existed, so both
  returned 500. Never throws upstream; degrades to deterministic copy.
- Tests: node --test gives 77 tests, 18 suites, 73 pass, 0 fail, 4 skipped.
- Endpoint sweep: 19/19 GET returned 200, 4/4 POST returned 200.

# CORRECTION to the notes above: there is NO "Chat" view. That earlier claim
# was wrong. The real 10 views are: home, catalog, review, social, ads,
# calendar, analytics, automation, marketplace, trends. Passion niches live at
# /api/niches/passion and Home > Smart Actions, not in a chat view.

# Status: LOCAL IS FIXED AND VERIFIED. NOT COMMITTED, NOT DEPLOYED.
# Git: 3 files modified (client/index.html, server/index.js,
#      server/services/conceptEngine.js) + these MDs. Working tree otherwise
#      clean. Local main == origin/main (0 ahead / 0 behind).
# IMPORTANT: Railway is STILL running the broken build - those 9 endpoints are
#      404 in production right now. Needs commit + push + redeploy to fix.
#      AWAITING OWNER APPROVAL to commit/push/deploy (per handoff rule:
#      "do not push or deploy until the owner audits").

# Next:
# 1. Commit + push + redeploy Railway (this fixes 9 dead endpoints in prod).
# 2. Refresh OPENROUTER_API_KEY - it currently returns 401, so AI copy and
#    concepts fall back to deterministic templates instead of real AI output.
# 3. Confirm the darker theme matches the intended reference image (the image
#    was not viewable during implementation, so the palette was chosen as a
#    darker premium interpretation of the existing design).
# 4. Optional: Stripe key, email automation, Reddit/YouTube social.
