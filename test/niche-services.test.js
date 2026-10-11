// Regression: auto-created professions must get REAL niche services, never the
// old placeholder junk ("Digital Template $15") that rendered as generic filler
// inside deliverables. Also pins typePlan as the single niche→type router.
const test = require('node:test');
const assert = require('node:assert/strict');
const { db, init } = require('../server/database');
init();

const { servicesForNiche, SERVICE_PLANS } = require('../server/services/nicheServices');
const { productsForTrend } = require('../server/services/typePlan');
const trendScanner = require('../server/services/trendScanner');

const PLACEHOLDER = /Digital Template|Complete Kit|Trend Guide|Starter Bundle|Pro Bundle/;

test('nicheServices: every plan has real offerings, no placeholder junk, $-prices', () => {
  for (const [cat, plan] of Object.entries(SERVICE_PLANS)) {
    assert.ok(Array.isArray(plan) && plan.length >= 4, `${cat}: plan too small`);
    for (const [name, price] of plan) {
      assert.ok(!PLACEHOLDER.test(name), `${cat}: placeholder junk leaked: ${name}`);
      assert.match(String(price), /^\$\d/, `${cat}: price not $-formatted: ${price}`);
    }
  }
});

test('nicheServices: servicesForNiche picks category-matched plans deterministically', () => {
  for (const name of ['Make Money From Pinterest', 'Resin Art', 'Smart Home Installer', 'Bookkeeping (Remote)']) {
    const a = servicesForNiche(name);
    assert.equal(a, servicesForNiche(name), 'must be deterministic');
    const rows = JSON.parse(a);
    assert.ok(Array.isArray(rows) && rows.length >= 4, name);
    for (const [svc, price] of rows) {
      assert.ok(!PLACEHOLDER.test(svc), `${name}: placeholder junk: ${svc}`);
      assert.match(String(price), /^\$\d/, name);
    }
  }
  // Money niches get money-flavored services, not decor/craft
  const rows = JSON.parse(servicesForNiche('Make Money From Pinterest'));
  assert.ok(rows.some(([s]) => /Strategy|Audit|Growth|Affiliate/i.test(s)), 'creator plan expected');
});

test('trendScanner: activateTrend creates profession with real services', () => {
  const name = '__svc_test_trend__ ' + Date.now();
  const ins = db.prepare(
    "INSERT INTO trends (name, emoji, phase, velocity, window, est_revenue, why, activated, detected_at) VALUES (?, '🧪', 'rising', '+100%', 14, '$1k', 'test', 0, ?)"
  ).run(name, new Date().toISOString());
  const trendId = ins.lastInsertRowid;
  let profId = null;
  try {
    const prof = trendScanner.activateTrend(trendId);
    assert.ok(prof, 'activateTrend returned no profession');
    profId = prof.id;
    const rows = JSON.parse(prof.services || '[]');
    assert.ok(rows.length >= 4, 'services not populated: ' + prof.services);
    for (const [svc] of rows) {
      assert.ok(!PLACEHOLDER.test(svc), 'placeholder junk seeded: ' + svc);
    }
  } finally {
    if (profId) db.prepare('DELETE FROM professions WHERE id = ?').run(profId);
    db.prepare('DELETE FROM trends WHERE id = ?').run(trendId);
  }
});

test('typePlan: niche→type routing (money → money tools, craft → wall-art, school → worksheet)', () => {
  assert.deepEqual(productsForTrend({ name: 'Make Money From Pinterest' }),
    ['spreadsheet', 'roi', 'checklist', 'social']);
  assert.ok(!productsForTrend({ name: 'How To Make Money From Pinterest', why: 'pinterest-rss · Pinterest/DIY buzz · intent=0.80' }).includes('wall-art'),
    'provenance label must not leak into typing');
  assert.deepEqual(productsForTrend({ name: 'Resin Art' }), ['wall-art', 'checklist', 'brand', 'social']);
  assert.deepEqual(productsForTrend({ name: 'Homeschool Worksheets' }), ['worksheet', 'checklist', 'journal', 'wall-art']);
  assert.deepEqual(productsForTrend({ name: 'Uncategorized Thing' }), ['invoice', 'checklist', 'spreadsheet', 'booking']);
});
