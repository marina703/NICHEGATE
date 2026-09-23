// ═══════════════════════════════════════════════════════════════════════════
// PHASE 6 TESTS — gap scoring, self-improving vetting, pricing engine,
// video scripts, Etsy token refresh persistence.
// Hermetic: DB writes run inside a transaction (rolled back), vettingLearner
// is stubbed via require.cache so the learned path is deterministic, axios
// is stubbed for the OAuth refresh test. No network anywhere.
// ═══════════════════════════════════════════════════════════════════════════
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

process.env.ETSY_CLIENT_ID = 'testcid';
process.env.ETSY_CLIENT_SECRET = 'testsecret';
delete process.env.ETSY_SHARED_SECRET;

// Stub vettingLearner BEFORE vettingEngine first lazy-requires it.
const learnerPath = require.resolve('../server/services/vettingLearner');
require.cache[learnerPath] = {
  id: learnerPath,
  filename: learnerPath,
  loaded: true,
  exports: {
    getWeights: () => ({
      demand: 0.30, competition: 0.10, margin: 0.25, seasonality: 0.05,
      longevity: 0.10, specificity: 0.10, shoppingIntent: 0.10,
      learned: true, fittedAt: new Date().toISOString(), n: 42
    }),
    fitWeights: () => ({ fitted: true, n: 42, weights: {} }),
    resetWeights: () => ({}),
    outcomeSummary: () => ({ activated: 42, sold: 7, windowDays: 90 }),
    LEARNABLE: ['demand', 'competition', 'margin', 'seasonality', 'longevity']
  }
};

const { db } = require('../server/database');
const vetting = require('../server/services/vettingEngine');
const pricing = require('../server/services/pricingEngine');
const conceptEngine = require('../server/services/conceptEngine');
const mp = require('../server/services/marketplace');

let txDepth = 0;
function inTx(fn) {
  if (txDepth === 0) db.exec('BEGIN');
  txDepth++;
  try { return fn(); }
  finally { txDepth--; if (txDepth === 0) db.exec('ROLLBACK'); }
}

function insertProduct(name, price) {
  return db.prepare(
    "INSERT INTO products (profession_id, name, type, price) VALUES (1, ?, 'template', ?)"
  ).run(name, price).lastInsertRowid;
}

// ── Gap scoring ─────────────────────────────────────────────────────────────
test('gapFromSaturation: weak incumbents score high weakness', () => {
  const g = vetting.gapFromSaturation({ avgFavorites: 10, avgPrice: 15, avgAgeDays: 400 });
  assert.strictEqual(g.weakness, 100);
  assert.strictEqual(g.measured, true);
});

test('gapFromSaturation: strong incumbents score low weakness', () => {
  const g = vetting.gapFromSaturation({ avgFavorites: 800, avgPrice: 2, avgAgeDays: 10 });
  assert.ok(g.weakness <= 15, `expected <=15 got ${g.weakness}`);
  assert.strictEqual(g.avgPrice, 2);
});

test('gapFromSaturation: null for unknown saturation', () => {
  assert.strictEqual(vetting.gapFromSaturation(null), null);
  assert.strictEqual(vetting.gapFromSaturation({ avgFavorites: NaN }), null);
});

test('seedGap + vetTrend: measured gap overrides phase competition', () => {
  inTx(() => {
    vetting.seedGap('Gap Seeded Niche', { avgFavorites: 10, avgPrice: 15, avgAgeDays: 400 });
    const vet = vetting.vetTrend({ name: 'Gap Seeded Niche' });
    assert.strictEqual(vet.measured.gap.weakness, 100);
    assert.strictEqual(vet.signals.competition, 100);
    assert.strictEqual(vet.learnedWeights, true); // stubbed learner active
  });
});

test('vetTrend without gap data: heuristic competition (measured.gap null)', () => {
  const vet = vetting.vetTrend({ name: 'zz Unseeded Niche No Gap zz' });
  assert.strictEqual(vet.measured.gap, null);
  assert.ok(vet.signals.competition >= 0 && vet.signals.competition <= 100);
});

// ── Pricing engine ──────────────────────────────────────────────────────────
test('toCharmPrice: floor + .99 endings', () => {
  assert.strictEqual(pricing.toCharmPrice(9), 8.99);  // integer input drops to the .99 below
  assert.strictEqual(pricing.toCharmPrice(9.5), 9.99); // fractional input rounds up to the .99 above
  assert.strictEqual(pricing.toCharmPrice(2), 3.99);   // floor
  assert.strictEqual(pricing.toCharmPrice(0), 3.99);   // garbage → floor
  assert.strictEqual(pricing.toCharmPrice('abc'), 3.99);
});

test('launchPrice: 30% off within window, base after', () => {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const inWindow = pricing.launchPrice({ price: '$12', created_at: now });
  assert.strictEqual(inWindow.active, true);
  assert.strictEqual(inWindow.price, 8.99); // 12 × 0.7 = 8.4 → charm → 8.99
  assert.strictEqual(inWindow.daysRemaining, 14);
  const old = { price: '$12', created_at: '2020-01-01 00:00:00' };
  assert.strictEqual(pricing.launchPrice(old).active, false);
  const noprice = { price: '', created_at: '2020-01-01 00:00:00' };
  assert.strictEqual(pricing.launchPrice(noprice), null);
});

test('priceTiers: low/base/high with charm endings', () => {
  const t = pricing.priceTiers(12);
  assert.strictEqual(t.low, 10.99);  // 12 × 0.85 = 10.2 → 10.99
  assert.strictEqual(t.base, 11.99);
  assert.strictEqual(t.high, 14.99); // 12 × 1.25 = 15 → 14.99
});

test('startPriceTest: variant assigned + persisted + idempotent re-start', () => {
  inTx(() => {
    const pid = insertProduct('PT One', '$12');
    const r1 = pricing.startPriceTest(pid, '$12');
    assert.ok(['low', 'base', 'high'].includes(r1.variant));
    assert.ok(r1.price >= pricing.PRICE_FLOOR);
    const r2 = pricing.startPriceTest(pid, '$12');
    assert.strictEqual(r2.existing, true);
  });
});

test('applyPrice: updates products.price + logs (no deploy w/o marketplace_id)', async () => {
  const pid = insertProduct('PT Two', '$12');
  try {
    const r = await pricing.applyPrice(pid, 15, { deploy: true, reason: 'test' });
    assert.strictEqual(r.ok, true);
    const p = db.prepare('SELECT price FROM products WHERE id = ?').get(pid);
    assert.strictEqual(p.price, '$14.99');
    assert.strictEqual(r.deployed, false); // no marketplace_id → local only
  } finally {
    db.prepare('DELETE FROM products WHERE id = ?').run(pid);
    db.prepare("DELETE FROM automation_log WHERE action = 'price_update' AND product_id = ?").run(pid);
  }
});

test('pricingSummary: runs clean with no tests', () => {
  inTx(() => {
    const rows = pricing.pricingSummary();
    assert.ok(Array.isArray(rows));
  });
});

// ── Video scripts ───────────────────────────────────────────────────────────
test('generateVideoScripts fallback: 3 scripts, beats, CTA, product name', async () => {
  const scripts = await conceptEngine.generateVideoScripts(
    { name: 'Client Tracker', type: 'spreadsheet', price: '$9' },
    { niche: 'bookkeeping' }
  );
  assert.strictEqual(scripts.length, 3);
  for (const s of scripts) {
    assert.ok(s.hook.length >= 12, 'hook too short');
    assert.ok(s.beats.length >= 3, 'not enough beats');
    assert.ok(s.caption.length > 10, 'caption too short');
    assert.ok(s.hashtags.length >= 2, 'not enough hashtags');
  }
  const flat = JSON.stringify(scripts);
  assert.ok(flat.includes('Client Tracker'), 'product name missing');
  assert.ok(flat.includes('$9'), 'price CTA missing');
  assert.ok(scripts.some(s => s.style === 'problem-agitation'), 'expected problem-agitation style');
});

// ── Etsy refresh persistence ────────────────────────────────────────────────
test('refreshEtsyToken persists rotated refresh_token', async () => {
  // Preserve any real stored token — restore it no matter what.
  const existing = db.prepare("SELECT * FROM marketplace_tokens WHERE platform = 'etsy'").get();
  db.prepare(
    "INSERT OR REPLACE INTO marketplace_tokens (platform, access_token, refresh_token, expires_at) VALUES ('etsy', 'a1', 'r_OLD', '2000-01-01T00:00:00.000Z')"
  ).run();
  const axios = require('axios');
  const orig = axios.post;
  axios.post = async function stub(url) {
    if (String(url).includes('/public/oauth/token')) {
      return { data: { access_token: 'a2', refresh_token: 'r_NEW', expires_in: 3600 } };
    }
    return orig.apply(axios, arguments);
  };
  try {
    const result = await mp.refreshEtsyToken();
    assert.strictEqual(result.access_token, 'a2');
    const row = db.prepare("SELECT refresh_token, access_token FROM marketplace_tokens WHERE platform = 'etsy'").get();
    assert.strictEqual(row.refresh_token, 'r_NEW');
    assert.strictEqual(row.access_token, 'a2');
  } finally {
    axios.post = orig;
    if (existing) {
      db.prepare(
        "UPDATE marketplace_tokens SET access_token = ?, refresh_token = ?, expires_at = ? WHERE platform = 'etsy'"
      ).run(existing.access_token, existing.refresh_token, existing.expires_at);
    } else {
      db.prepare("DELETE FROM marketplace_tokens WHERE platform = 'etsy'").run();
    }
  }
});
