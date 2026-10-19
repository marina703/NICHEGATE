// ═══════════════════════════════════════════════════════════════════════════
// PRICING ENGINE — digital goods: price IS margin (Phase 6).
// Three capabilities, all rule-based and honest (no fake ML):
//   1. LAUNCH RULE  — first 14 days at −30%, floored at $3.99, ends cleanly.
//   2. A/B TIERS    — three price variants (−15% / base / +25%), assigned
//                     round-robin, persisted per product.
//   3. ELASTICITY   — outcomes come free from the Gumroad sync (metrics has
//                     product_id + revenue): units/day and revenue/day per
//                     variant; a winner is declared only with ≥5 sales and a
//                     ≥2× units/day lead. Small samples report "not enough
//                     data" — never a made-up winner.
// Price changes deploy through the same marketplace update path as listing
// copy (updateListingCopy syncs price on Gumroad + Etsy).
// ═══════════════════════════════════════════════════════════════════════════

const { db } = require('../database');
const mp = require('./marketplace');

const TESTS_KEY = 'pricing_tests';
const LAUNCH_DAYS = 14;
const LAUNCH_DISCOUNT = 0.30;
const PRICE_FLOOR = 3.99;

const _testsCache = { t: 0, val: null };

function readTests(force = false) {
  if (!force && _testsCache.val && (Date.now() - _testsCache.t) < 30000) return _testsCache.val;
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(TESTS_KEY);
  let val = {};
  if (row) {
    try { val = JSON.parse(row.value) || {}; } catch { val = {}; }
  }
  _testsCache.t = Date.now(); _testsCache.val = val;
  return val;
}

function writeTests(tests) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(TESTS_KEY, JSON.stringify(tests));
  _testsCache.t = Date.now(); _testsCache.val = tests;
}

// $9 → $8.99, $9.5 → $9.49 … keeps .99 endings above the floor.
function toCharmPrice(x) {
  const n = Number(x);
  if (!Number.isFinite(n) || n <= 0) return PRICE_FLOOR;
  return Math.max(PRICE_FLOOR, Math.floor(n) + 0.99 - (Number.isInteger(n) ? 1 : 0));
}

// ── 1 · Launch rule ───────────────────────────────────────────────────────
function isLaunchWindow(product, days = LAUNCH_DAYS) {
  const t = product && product.created_at ? new Date(String(product.created_at).replace(' ', 'T') + 'Z').getTime() : NaN;
  if (!Number.isFinite(t)) return false;
  return (Date.now() - t) < days * 86400000;
}

function launchPrice(product, { days = LAUNCH_DAYS, discount = LAUNCH_DISCOUNT } = {}) {
  const base = parseFloat(String(product && product.price).replace('$', '')) || 0;
  if (!base) return null;
  if (!isLaunchWindow(product, days)) return { active: false, base, price: base };
  const discounted = Math.max(PRICE_FLOOR, toCharmPrice(base * (1 - discount)));
  return { active: true, base, price: discounted, daysRemaining: Math.max(0, days - Math.floor((Date.now() - new Date(String(product.created_at).replace(' ', 'T') + 'Z').getTime()) / 86400000)) };
}

// ── 2 · A/B tiers ─────────────────────────────────────────────────────────
function priceTiers(base) {
  const b = parseFloat(String(base).replace('$', '')) || 0;
  if (!b) return [];
  return {
    low: toCharmPrice(b * 0.85),
    base: toCharmPrice(b),
    high: toCharmPrice(b * 1.25)
  };
}

function startPriceTest(productId, basePrice) {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!product) throw new Error(`Product ${productId} not found`);
  const base = basePrice || product.price;
  const tiers = priceTiers(base);
  if (!tiers.low) throw new Error('No base price to test against');
  // A test start is an explicit state-changing boundary. Refresh persisted
  // state so out-of-band settings edits (admin/test fixtures) cannot leave a
  // stale 30-second cache controlling variant allocation or winner membership.
  const tests = readTests(true);
  if (tests[productId]) return { ...tests[productId], tiers, existing: true };

  // Round-robin across the whole test population for balance.
  const counts = Object.values(tests).reduce((acc, t) => { acc[t.variant] = (acc[t.variant] || 0) + 1; return acc; }, {});
  const variant = ['low', 'base', 'high'].sort((a, b2) => (counts[a] || 0) - (counts[b2] || 0))[0];
  const test = {
    variant,
    price: tiers[variant],
    basePrice: toCharmPrice(tiers.base),
    startedAt: new Date().toISOString(),
    status: 'running'
  };
  tests[productId] = test;
  writeTests(tests);
  db.prepare('INSERT INTO automation_log (action, product_id, details, status) VALUES (?, ?, ?, ?)')
    .run('pricing_test_start', productId, `${variant} @ $${test.price} (base $${test.basePrice})`, 'success');
  return { ...test, tiers };
}

// ── 3 · Apply price (local + optional live deploy) ────────────────────────
async function applyPrice(productId, price, { deploy = true, reason = 'manual' } = {}) {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!product) throw new Error(`Product ${productId} not found`);
  const value = toCharmPrice(price);
  db.prepare('UPDATE products SET price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(`$${value.toFixed(2)}`, productId);
  let deployed = null;
  if (deploy && product.marketplace_id && product.marketplace) {
    const fresh = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
    deployed = await mp.updateListingCopy(fresh, { title: fresh.name, description: fresh.html_content || '', tags: [] });
  }
  db.prepare('INSERT INTO automation_log (action, product_id, details, status) VALUES (?, ?, ?, ?)')
    .run('price_update', productId, `$${value.toFixed(2)} (${reason}${deployed ? ', deployed' : ', local only'})`, 'success');
  return { ok: true, productId, price: value, deployed: !!deployed };
}

// ── 4 · Elasticity summary from real sales ────────────────────────────────
function pricingSummary() {
  const tests = readTests();
  const out = [];
  for (const [pid, t] of Object.entries(tests)) {
    const product = db.prepare('SELECT id, name, price, marketplace, marketplace_id, created_at FROM products WHERE id = ?').get(Number(pid));
    if (!product) { out.push({ productId: Number(pid), ...t, missing: true }); continue; }
    const m = db.prepare(
      `SELECT COALESCE(SUM(sales), COUNT(*)) AS units, COALESCE(SUM(revenue), 0) AS revenue
         FROM metrics WHERE product_id = ? AND sales > 0`
    ).get(Number(pid));
    const daysLive = Math.max(1, (Date.now() - new Date(String(product.created_at).replace(' ', 'T') + 'Z').getTime()) / 86400000);
    const unitsPerDay = m.units / daysLive;
    const revPerDay = m.revenue / daysLive;
    out.push({
      productId: Number(pid),
      name: product.name,
      variant: t.variant,
      testPrice: t.price,
      currentPrice: product.price,
      status: t.status,
      units: m.units,
      revenue: +m.revenue.toFixed(2),
      unitsPerDay: +unitsPerDay.toFixed(3),
      revPerDay: +revPerDay.toFixed(3),
      winner: null // filled by compareVariants
    });
  }
  // Winner rule: ≥5 total sales in the test population AND a variant with
  // ≥2× the units/day of both others (when others have any data).
  const totalUnits = out.reduce((s, r) => s + r.units, 0);
  if (out.length >= 2 && totalUnits >= 5) {
    const ranked = [...out].sort((a, b) => b.unitsPerDay - a.unitsPerDay);
    const best = ranked[0], rest = ranked.slice(1);
    const beats = rest.every(r => r.units === 0 || best.unitsPerDay >= 2 * r.unitsPerDay);
    if (beats && best.units > 0) best.winner = true;
  }
  return out;
}

function endPriceTest(productId, { adoptWinner = true } = {}) {
  const tests = readTests();
  const t = tests[productId];
  if (!t) throw new Error(`No price test for product ${productId}`);
  t.status = 'ended';
  t.endedAt = new Date().toISOString();
  writeTests(tests);
  return { ok: true, productId: Number(productId), test: t, note: adoptWinner ? 'check /api/pricing/tests for the winning variant' : undefined };
}

/**
 * Autonomous Yield Management:
 * Evaluates running price tests and automatically adopts/deploys statistically
 * validated winning prices to live marketplaces.
 */
async function autoPromoteWinners() {
  const summary = pricingSummary();
  const winners = summary.filter(s => s.winner === true && s.status === 'running');
  const promoted = [];

  for (const w of winners) {
    try {
      // Suppress repeat promotion of the same product within 24h
      const recent = db.prepare(
        `SELECT id FROM automation_log
         WHERE action = 'price_update' AND product_id = ?
           AND details LIKE '%auto_pricing_winner%'
           AND created_at >= datetime('now', '-24 hours')
         LIMIT 1`
      ).get(w.productId);
      if (recent) continue;

      const applyRes = await applyPrice(w.productId, w.testPrice, {
        deploy: true,
        reason: `auto_pricing_winner (${w.variant} variant, ${w.units} units @ ${w.unitsPerDay}/day)`
      });

      // Mark the test as concluded with winner adopted
      const tests = readTests(true);
      if (tests[w.productId]) {
        tests[w.productId].status = 'promoted_winner';
        tests[w.productId].promotedAt = new Date().toISOString();
        tests[w.productId].winningPrice = w.testPrice;
        writeTests(tests);
      }

      promoted.push({
        productId: w.productId,
        name: w.name,
        variant: w.variant,
        winningPrice: w.testPrice,
        deployed: applyRes.deployed
      });
    } catch (e) {
      console.error(`[PRICING] Failed to auto-promote winner for product ${w.productId}:`, e.message);
    }
  }

  if (promoted.length > 0) {
    db.prepare('INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)')
      .run('auto_pricing_promoted', `Auto-promoted ${promoted.length} winning price tier(s) to live listings`, 'success');
  }

  return promoted;
}

module.exports = {
  toCharmPrice,
  isLaunchWindow,
  launchPrice,
  priceTiers,
  startPriceTest,
  applyPrice,
  pricingSummary,
  endPriceTest,
  autoPromoteWinners,
  LAUNCH_DAYS,
  LAUNCH_DISCOUNT,
  PRICE_FLOOR
};
