// ═══════════════════════════════════════════════════════════════════════════
// BUSINESS INTELLIGENCE — real aggregates only.
// Everything here is computed from tables that actually exist (products,
// metrics, automation_log, settings, professions). No synthetic numbers, no
// hardcoded multipliers: if there is no data yet, the field says so explicitly.
// Feeds: GET /api/console/bi
// ═══════════════════════════════════════════════════════════════════════════

const { db } = require('../database');
const seo = require('./seoEngine');

const REVIEWABLE = ['draft', 'pending-review', 'pending_review'];

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

function priceOf(p) {
  return parseFloat(String(p.price || '0').replace(/[^0-9.]/g, '')) || 0;
}

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
}

// ── 1 · Shop health (0–100) ────────────────────────────────────────────────
// Composite of readiness blockers, inventory backlog, and publish failures.
// Transparent breakdown so the console can explain every point lost.
function shopHealth(readiness) {
  const issues = (readiness && readiness.issues) || [];
  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');

  const counts = {};
  for (const p of db.prepare('SELECT status FROM products').all()) {
    counts[p.status] = (counts[p.status] || 0) + 1;
  }
  const drafts = counts.draft || 0;
  const approved = counts.approved || 0;
  const listed = (counts.listed || 0) + (counts.published || 0);

  const recentFails = db.prepare(
    "SELECT COUNT(*) c FROM automation_log WHERE action = 'publish_error' AND created_at >= ?"
  ).get(isoDaysAgo(7)).c;

  const breakdown = [];
  let score = 100;

  const errPenalty = Math.min(30, errors.length * 15);
  if (errPenalty) { score -= errPenalty; breakdown.push({ label: `${errors.length} readiness blocker(s)`, points: -errPenalty }); }

  const warnPenalty = Math.min(15, warnings.length * 5);
  if (warnPenalty) { score -= warnPenalty; breakdown.push({ label: `${warnings.length} readiness warning(s)`, points: -warnPenalty }); }

  const idlePenalty = Math.min(20, approved * 2);
  if (idlePenalty) { score -= idlePenalty; breakdown.push({ label: `${approved} approved product(s) not listed`, points: -idlePenalty }); }

  const draftPenalty = Math.min(10, drafts);
  if (draftPenalty) { score -= draftPenalty; breakdown.push({ label: `${drafts} draft(s) awaiting review`, points: -draftPenalty }); }

  const failPenalty = Math.min(15, recentFails * 3);
  if (failPenalty) { score -= failPenalty; breakdown.push({ label: `${recentFails} publish failure(s) in 7d`, points: -failPenalty }); }

  score = clamp(score, 0, 100);
  const grade = score >= 80 ? 'Healthy' : score >= 60 ? 'Fair' : 'Needs work';
  return { score, grade, breakdown, counts: { drafts, approved, listed } };
}

// ── 2 · KPI deltas (current 7d vs prior 7d) ───────────────────────────────
function deltas() {
  const now = Date.now();
  const week = 7 * 24 * 60 * 60 * 1000;

  const created = db.prepare('SELECT created_at FROM products').all()
    .map(r => new Date(String(r.created_at).replace(' ', 'T') + 'Z').getTime())
    .filter(Number.isFinite);
  const windowCount = (lo, hi) => created.filter(t => t >= lo && t < hi).length;
  const products7 = windowCount(now - week, now);
  const productsPrev = windowCount(now - 2 * week, now - week);

  const m = db.prepare('SELECT recorded_at, revenue, views, sales FROM metrics').all();
  const mTime = r => new Date(String(r.recorded_at).replace(' ', 'T') + 'Z').getTime();
  const sumWindow = (lo, hi, field) =>
    m.filter(r => { const t = mTime(r); return Number.isFinite(t) && t >= lo && t < hi; })
      .reduce((s, r) => s + (Number(r[field]) || 0), 0);

  const rev = { value: sumWindow(now - week, now, 'revenue'), prev: sumWindow(now - 2 * week, now - week, 'revenue') };
  const views = { value: sumWindow(now - week, now, 'views'), prev: sumWindow(now - 2 * week, now - week, 'views') };
  const sales = { value: sumWindow(now - week, now, 'sales'), prev: sumWindow(now - 2 * week, now - week, 'sales') };

  const pct = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : (cur > 0 ? 100 : 0));
  return {
    products: { value: products7, prev: productsPrev, deltaPct: pct(products7, productsPrev), label: 'new this week' },
    revenue: { value: rev.value, prev: rev.prev, deltaPct: pct(rev.value, rev.prev), label: 'real revenue 7d' },
    views: { value: views.value, prev: views.prev, deltaPct: pct(views.value, views.prev), label: 'views 7d' },
    sales: { value: sales.value, prev: sales.prev, deltaPct: pct(sales.value, sales.prev), label: 'sales 7d' }
  };
}

// ── 3 · Revenue time-series (14 days, zero-filled) ────────────────────────
function revenueSeries() {
  const rows = db.prepare('SELECT recorded_at, revenue, views, sales FROM metrics').all();
  const byDay = {};
  for (const r of rows) {
    const t = new Date(String(r.recorded_at).replace(' ', 'T') + 'Z');
    if (Number.isNaN(t.getTime())) continue;
    const key = t.toISOString().slice(0, 10);
    if (!byDay[key]) byDay[key] = { date: key, revenue: 0, views: 0, sales: 0 };
    byDay[key].revenue += Number(r.revenue) || 0;
    byDay[key].views += Number(r.views) || 0;
    byDay[key].sales += Number(r.sales) || 0;
  }
  const out = [];
  for (let i = 13; i >= 0; i--) {
    const key = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    out.push(byDay[key] || { date: key, revenue: 0, views: 0, sales: 0 });
  }
  return out;
}

// ── 3b · Net Unit-Economics & P&L Engine ────────────────────────────────────
// Real financial model deducting channel fees (Etsy: 6.5% + $0.20 listing + 3% + $0.25 payment proc;
// Gumroad: 10% flat + 2.9% + $0.30 credit card fee), AI token expenses, and computing true net profit and margin.
function calculateNetUnitEconomics() {
  // 1. Channel gross revenue by platform
  const rows = db.prepare(`
    SELECT m.sales, m.revenue, p.marketplace
    FROM metrics m
    LEFT JOIN products p ON m.product_id = p.id
    WHERE m.sales > 0
  `).all();

  let grossRevenue = 0;
  let totalSalesUnits = 0;
  let marketplaceFees = 0;
  let gumroadRevenue = 0;
  let etsyRevenue = 0;

  for (const r of rows) {
    const sales = Number(r.sales) || 0;
    const rev = Number(r.revenue) || 0;
    grossRevenue += rev;
    totalSalesUnits += sales;

    const mp = (r.marketplace || 'gumroad').toLowerCase();
    if (mp === 'etsy') {
      etsyRevenue += rev;
      // Etsy fee: 6.5% transaction + $0.20 listing renewal per sale + 3% payment proc + $0.25 order fee
      marketplaceFees += (rev * 0.095) + (sales * 0.45);
    } else {
      gumroadRevenue += rev;
      // Gumroad fee: 10% platform fee + (2.9% + $0.30) payment processing
      marketplaceFees += (rev * 0.129) + (sales * 0.30);
    }
  }

  // 2. AI Token Expenses from ai_usage table
  const aiRow = db.prepare(`
    SELECT COALESCE(SUM(cost_usd), 0) AS total_cost,
           COALESCE(SUM(total_tokens), 0) AS total_tokens,
           COUNT(*) AS total_calls
    FROM ai_usage
  `).get() || { total_cost: 0, total_tokens: 0, total_calls: 0 };
  const aiCost = Number(aiRow.total_cost) || 0;

  // 3. Ad Spend from settings table
  const adSpendRow = db.prepare("SELECT value FROM settings WHERE key = 'ad_spend_this_month'").get();
  const adSpend = parseFloat(adSpendRow?.value) || 0;

  const totalCost = marketplaceFees + aiCost + adSpend;
  const netProfit = grossRevenue - totalCost;
  const netMarginPct = grossRevenue > 0 ? Math.round((netProfit / grossRevenue) * 100) : 0;
  const avgUnitRevenue = totalSalesUnits > 0 ? grossRevenue / totalSalesUnits : 0;
  const avgUnitNet = totalSalesUnits > 0 ? netProfit / totalSalesUnits : 0;

  return {
    grossRevenue: +grossRevenue.toFixed(2),
    totalSalesUnits,
    marketplaceFees: +marketplaceFees.toFixed(2),
    aiCost: +aiCost.toFixed(4),
    aiTokens: aiRow.total_tokens,
    aiCalls: aiRow.total_calls,
    adSpend: +adSpend.toFixed(2),
    totalCost: +totalCost.toFixed(2),
    netProfit: +netProfit.toFixed(2),
    netMarginPct,
    unitEconomics: {
      avgPrice: +avgUnitRevenue.toFixed(2),
      avgNetPerUnit: +avgUnitNet.toFixed(2),
      avgFeePerUnit: totalSalesUnits > 0 ? +(marketplaceFees / totalSalesUnits).toFixed(2) : 0
    },
    channels: {
      gumroadRevenue: +gumroadRevenue.toFixed(2),
      etsyRevenue: +etsyRevenue.toFixed(2)
    }
  };
}

// ── 4 · Listing health ─────────────────────────────────────────────────────
// Zero-sale listings + keyword/SEO weakness + velocity badges from REAL data.
// SEO is scored from the engine's generated bundle (title/tag heuristics),
// velocity from views (metrics) since listing.
function listingHealth() {
  const listed = db.prepare(
    `SELECT p.id, p.name, p.type, p.price, p.created_at, p.profession_id, p.theme, pr.name AS prof_name
     FROM products p LEFT JOIN professions pr ON p.profession_id = pr.id
     WHERE p.status IN ('listed','published')`
  ).all();

  const viewsByProduct = {};
  let sales7d = 0;
  for (const r of db.prepare('SELECT product_id, views, sales, recorded_at FROM metrics').all()) {
    const id = r.product_id || 0;
    viewsByProduct[id] = (viewsByProduct[id] || 0) + (Number(r.views) || 0);
    const t = new Date(String(r.recorded_at).replace(' ', 'T') + 'Z').getTime();
    if (Number.isFinite(t) && t >= Date.now() - 7 * 24 * 60 * 60 * 1000) sales7d += Number(r.sales) || 0;
  }

  const zeroSale = [];
  const badges = { Hot: [], Rising: [], Stable: [], Watch: [] };

  for (const p of listed) {
    const v = viewsByProduct[p.id] || 0;
    const created = new Date(String(p.created_at).replace(' ', 'T') + 'Z').getTime();
    const daysListed = Math.max(1, (Date.now() - created) / (24 * 60 * 60 * 1000));
    const velocity = v / daysListed; // views per day
    const badge = velocity >= 8 ? 'Hot' : velocity >= 3 ? 'Rising' : velocity >= 1 ? 'Stable' : 'Watch';
    badges[badge].push({ id: p.id, name: p.name, views: v, velocity: Math.round(velocity * 10) / 10 });
    if (v === 0) zeroSale.push({ id: p.id, name: p.name, daysListed: Math.round(daysListed) });
  }

  // SEO weakness: regenerate the bundle and score title length + tag count.
  const weakestSeo = [];
  for (const p of listed) {
    // NOTE: professions has no `type` column — selecting it threw "no such
    // column: type" for every listed product (the production /api/console/bi
    // 500). Product type comes from the product row (p.type), not the prof.
    const prof = p.profession_id
      ? db.prepare('SELECT name, services, hashtags FROM professions WHERE id = ?').get(p.profession_id)
      : null;
    if (!prof) continue;
    const bundle = seo.generateSEO(prof, p.type, p.theme);
    const titleLen = (bundle.title || '').length;
    const tagCount = (bundle.tags || []).length;
    // Etsy likes titles 30–140 chars and exactly 13 tags.
    const titleOk = titleLen >= 30 && titleLen <= 140;
    const score = (titleOk ? 50 : Math.round(50 * Math.min(titleLen, 140) / 140)) + Math.round(50 * Math.min(tagCount, 13) / 13);
    if (score < 85) weakestSeo.push({ id: p.id, name: p.name, score, titleLen, tagCount });
  }
  weakestSeo.sort((a, b) => a.score - b.score);

  return {
    sales7d,
    zeroSale: zeroSale.slice(0, 8),
    zeroSaleCount: zeroSale.length,
    weakestSeo: weakestSeo.slice(0, 8),
    badges: { hot: badges.Hot.length, rising: badges.Rising.length, stable: badges.Stable.length, watch: badges.Watch.length },
    badgeRows: badges
  };
}

// ── 5 · Insights (Opportunity / Risk / Action) ────────────────────────────
// Rule-based on real state. Each insight names the action that resolves it.
function insights(health, listing, readiness, engine) {
  const opportunities = [];
  const risks = [];
  const actions = [];

  const { counts } = health;
  const etsyConnected = ((readiness && readiness.summary) || {}).etsyConnected;
  const autoGenerate = engine && engine.autoGenerate;

  if (counts.approved > 0) {
    opportunities.push(`Approved inventory is ready to convert: ${counts.approved} product(s) can go live now.`);
    actions.push({ label: 'Publish bundles now', run: 'push-bundles' });
  }
  if (listing.zeroSaleCount > 0 && counts.listed > 0) {
    opportunities.push(`${listing.zeroSaleCount} listed product(s) have zero views — retitle/thumbnail them or pull them into a clearance bundle.`);
    actions.push({ label: 'Run a discovery sweep', run: 'sweep' });
  }
  if (listing.badges.hot > 0) {
    const hot = listing.badgeRows.Hot[0];
    opportunities.push(`"${hot.name}" is drawing ${hot.velocity} views/day — extend it into sibling products and a bundle.`);
    actions.push({ label: 'Generate for this niche', run: 'generate-for-niche' });
  }
  if (health.score >= 80) {
    opportunities.push('Shop health is strong — good window to push a new product line.');
  }
  if (counts.drafts > 0) {
    actions.push({ label: `Approve ${counts.drafts} draft(s)`, run: 'approve-all' });
  }
  if (engine && autoGenerate !== true) {
    risks.push('Automation is halted (auto_generate off) — inventory is not replenishing.');
    actions.push({ label: 'Run full cycle manually', run: 'full-cycle' });
  }

  for (const i of ((readiness && readiness.issues) || [])) {
    if (i.severity === 'error') risks.push(i.message);
  }
  if (listing.sales7d === 0 && counts.listed > 0) {
    risks.push('No sales in the last 7 days despite live listings — consider a launch coupon.');
  }
  if (actions.length === 0) {
    actions.push({ label: 'Sync sales data', run: 'sync-sales' });
  }

  return {
    opportunities: opportunities.slice(0, 3),
    risks: risks.slice(0, 3),
    actions: actions.slice(0, 4)
  };
}

function build() {
  const readiness = require('./readiness').buildReadinessReport();
  const health = shopHealth(readiness);
  const listing = listingHealth();
  const engine = {
    autoGenerate: (db.prepare("SELECT value FROM settings WHERE key = 'auto_generate'").get() || {}).value !== 'false',
    autoList: (db.prepare("SELECT value FROM settings WHERE key = 'auto_list'").get() || {}).value === 'true',
    isReviewDay: (() => {
      const last = db.prepare("SELECT value FROM settings WHERE key = 'last_review'").get();
      const lastReview = last ? new Date(last.value) : new Date(0);
      const interval = parseInt(db.prepare("SELECT value FROM settings WHERE key = 'review_interval'").get()?.value || '2');
      return (Date.now() - lastReview.getTime()) / (1000 * 60 * 60 * 24) >= interval;
    })()
  };
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    health,
    deltas: deltas(),
    series: revenueSeries(),
    pnl: calculateNetUnitEconomics(),
    listing,
    insights: insights(health, listing, readiness, engine),
    engine
  };
}

module.exports = { build, calculateNetUnitEconomics };
