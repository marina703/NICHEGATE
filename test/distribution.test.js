'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { db, init } = require('../server/database');
init(); // idempotent: Phase 5 tables

const pinEngine = require('../server/services/pinEngine');
const seqEngine = require('../server/services/sequenceEngine');
const swipe = require('../server/services/swipeFileEngine');

// Hermetic fixtures (throwaway rows, always cleaned).
function makeProfession() {
  return db.prepare(
    "INSERT INTO professions (emoji,name,slug,status,tier,colors,services,hashtags) VALUES ('🧪', ?, ?, 'researching', 'safe', '{}', '[]', '[]')"
  ).run('__pin_prof__', '__pin-prof-' + Math.random().toString(36).slice(2, 8)).lastInsertRowid;
}
function makeProduct(profId, fields = {}) {
  return db.prepare(
    "INSERT INTO products (profession_id,name,type,price,status,theme,origin,marketplace,marketplace_id) VALUES (?,?,?,?,?,?,?,?,?)"
  ).run(profId, fields.name || '__pin_product__', fields.type || 'checklist', fields.price || '$12',
    fields.status || 'listed', 'sage', fields.origin || 'engine', fields.marketplace || null, fields.marketplace_id || null).lastInsertRowid;
}
function cleanupProduct(id, profId) {
  db.prepare('DELETE FROM pins WHERE product_id = ?').run(id);
  db.prepare('DELETE FROM products WHERE id = ?').run(id);
  db.prepare('DELETE FROM professions WHERE id = ?').run(profId);
}

test('pinEngine: UTM attribution builds tagged store URLs', () => {
  const profId = makeProfession();
  const pid = makeProduct(profId, { name: 'Quote Builder Checklist' });
  try {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(pid);
    const url = pinEngine.attributedUrl(product, 'organizing');
    assert.ok(url, 'URL built');
    assert.ok(url.includes('utm_source=pinterest'), 'source tag');
    assert.ok(url.includes('utm_campaign=pin-'), 'campaign carries the product id');
    assert.ok(url.includes('utm_content=organizing'), 'board hint lands in content');
  } finally {
    cleanupProduct(pid, profId);
  }
});

test('pinEngine: schedule batch spreads listed products across distinct slots', () => {
  const profId = makeProfession();
  const ids = [];
  try {
    for (let i = 0; i < 5; i++) ids.push(makeProduct(profId, { name: `Pin batch ${i} ${Math.random().toString(36).slice(2, 6)}` }));
    const r = pinEngine.scheduleForProducts(50);
    assert.equal(r.ok, true);
    assert.ok(r.created >= 5, `created ${r.created} pins`);
    const mine = db.prepare(
      `SELECT p.* FROM pins p WHERE p.product_id IN (${ids.map(() => '?').join(',')})`
    ).all(...ids);
    assert.equal(mine.length, 5);
    const slots = new Set(mine.map(m => m.scheduled_for));
    assert.ok(slots.size >= 2, 'slots spread across the grid, not all identical');
    // Idempotent: re-run does not double-schedule.
    const again = pinEngine.scheduleForProducts(50);
    const afterAgain = db.prepare(
      `SELECT COUNT(*) AS c FROM pins WHERE product_id IN (${ids.map(() => '?').join(',')})`
    ).get(...ids).c;
    assert.equal(afterAgain, 5);
    void again;
  } finally {
    for (const id of ids) cleanupProduct(id, profId);
    db.prepare("DELETE FROM pins WHERE product_id IS NULL AND title LIKE 'Pin batch%'").run();
  }
});

test('pinEngine: duePins flips scheduled → posted', async () => {
  const profId = makeProfession();
  const pid = makeProduct(profId);
  try {
    db.prepare(
      "INSERT INTO pins (product_id, title, description, board_hint, target_url, utm, keywords, status, scheduled_for) VALUES (?, 'due test', 'd', 'general', NULL, NULL, '[]', 'scheduled', ?)"
    ).run(pid, new Date(Date.now() - 3600000).toISOString());
    const due = await pinEngine.duePins(50);
    assert.ok(due.some(d => d.product_id === pid), 'due pin returned');
    const row = db.prepare('SELECT status FROM pins WHERE product_id = ?').get(pid);
    assert.equal(row.status, 'posted');
  } finally {
    cleanupProduct(pid, profId);
  }
});

test('sequenceEngine: deterministic generation + regenerate replaces', async () => {
  const profId = makeProfession();
  try {
    const r1 = await seqEngine.generateSequence({ professionId: profId, purpose: 'launch' });
    assert.equal(r1.ok, true);
    assert.ok(r1.emails.length >= 3 && r1.emails.length <= 6);
    assert.ok(r1.emails.every(e => e.subject && e.body && typeof e.day === 'number'));

    const r2 = await seqEngine.generateSequence({ professionId: profId, purpose: 'launch' });
    assert.equal(r2.regenerated, true, 'second run replaces, not duplicates');
    assert.equal(r2.id, r1.id);
    const count = db.prepare('SELECT COUNT(*) AS c FROM sequences WHERE profession_id = ?').get(profId).c;
    assert.equal(count, 1);
  } finally {
    db.prepare('DELETE FROM sequences WHERE profession_id = ?').run(profId);
    db.prepare('DELETE FROM professions WHERE id = ?').run(profId);
  }
});

test('sequenceEngine: export without an ESP webhook degrades with emails attached', async () => {
  const profId = makeProfession();
  try {
    const gen = await seqEngine.generateSequence({ professionId: profId, purpose: 'welcome' });
    const r = await seqEngine.exportSequence(gen.id);
    assert.equal(r.ok, false); // no webhook in the test env
    assert.ok(Array.isArray(r.emails) && r.emails.length > 0, 'emails handed back for manual copy');
  } finally {
    db.prepare('DELETE FROM sequences WHERE profession_id = ?').run(profId);
    db.prepare('DELETE FROM professions WHERE id = ?').run(profId);
  }
});

test('swipeFile: upsert + longevity + angle classification + long-runners', async () => {
  // Persistent dev DB: clear any leftovers from earlier runs first.
  db.prepare("DELETE FROM swipe_ads WHERE ad_id LIKE 'swipe-test-%'").run();
  const base = {
    platform: 'meta', advertiser: 'TestCo',
    body: 'Tired of losing track of your jobs? Join 4,000 contractors who fixed it in minutes.',
    cta: 'LEARN_MORE', formats: '["facebook"]'
  };
  const ads = [
    { ...base, adId: 'swipe-test-1', startedAt: new Date(Date.now() - 50 * 86400000).toISOString() },
    { ...base, adId: 'swipe-test-2', body: 'New printable checklist pack, instant download.', startedAt: new Date().toISOString() }
  ];
  const up = swipe.upsertAds(ads.map(a => ({ ...a, angle: swipe.classifyAngle(a.body) })), 'test niche');
  assert.equal(up, 2);
  // Re-see the same ad: upsert updates last_seen/times_seen, no duplicate row.
  swipe.upsertAds([{ ...ads[0] }], 'test niche');
  const rows = db.prepare("SELECT * FROM swipe_ads WHERE ad_id LIKE 'swipe-test-%'").all();
  assert.equal(rows.length, 2);
  const seen = rows.find(r => r.ad_id === 'swipe-test-1');
  assert.equal(seen.times_seen, 2);
  assert.equal(swipe.longevityDays(seen) >= 49, true, 'longevity derived from first_seen');
  // Angle classification is deterministic.
  assert.equal(rows.find(r => r.ad_id === 'swipe-test-1').angle, 'pain-point', 'pain-point detected (first matching rule)');
  const longs = swipe.longRunners({ minDays: 14 });
  assert.ok(longs.some(l => l.ad_id === 'swipe-test-1'), '50-day ad is a long-runner');
  assert.ok(!longs.some(l => l.ad_id === 'swipe-test-2'), 'same-day ad is not');
  // Hook generation works without AI (deterministic fallback) for a real product.
  const profId = makeProfession();
  const pid = makeProduct(profId, { name: 'Hook Test Toolkit' });
  try {
    const hooks = await swipe.generateHooks(pid);
    assert.equal(hooks.ok, true);
    assert.equal(hooks.hooks.length, 3);
  } finally {
    cleanupProduct(pid, profId);
    db.prepare("DELETE FROM swipe_ads WHERE ad_id LIKE 'swipe-test-%'").run();
  }
});
