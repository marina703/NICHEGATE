const test = require('node:test');
const assert = require('node:assert/strict');
const { db } = require('../server/database');
const seo = require('../server/services/seoEngine');
const optimizer = require('../server/services/listingOptimizer');
const mp = require('../server/services/marketplace');

// Hermetic helpers: throwaway rows, always cleaned up. Never touch real data.
function makeProfession(fields) {
  const id = db.prepare(
    "INSERT INTO professions (emoji,name,slug,status,tier,colors,services,hashtags) VALUES ('🧪',?,?,?,?,'{}',?,?)"
  ).run('__opt_prof__', '__opt-prof-' + Math.random().toString(36).slice(2, 8), 'researching', 'safe',
    fields.services, fields.hashtags).lastInsertRowid;
  return id;
}

function makeProduct(professionId, fields = {}) {
  return db.prepare(
    'INSERT INTO products (profession_id,name,type,price,status,theme,concept,origin,marketplace,marketplace_id,brief) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
  ).run(professionId, fields.name || '__opt_product__', fields.type || 'invoice', fields.price || '$12',
    fields.status || 'draft', fields.theme || 'sage', fields.concept || null,
    fields.origin || 'engine', fields.marketplace || null, fields.marketplace_id || null,
    fields.brief || null).lastInsertRowid;
}

test('generateSEO survives legacy plain-text profession fields', () => {
  const prof = { name: 'House Cleaning', tier: 'safe', services: 'Cleaning, Lawn care', hashtags: '#cleaning #maid small business' };
  const out = seo.generateSEO(prof, 'invoice', 'sage');
  assert.ok(out.title.length > 0 && out.title.length <= 140);
  assert.ok(Array.isArray(out.tags) && out.tags.length <= 13 && out.tags.length > 0);
  assert.ok(out.description.includes('House Cleaning'));
  // Plain-text services render as names, not first characters.
  assert.ok(out.description.includes('Cleaning'));
  assert.ok(!out.description.includes('C, L'));
});

test('generateSEO survives garbage JSON fields and a missing prof', () => {
  const out = seo.generateSEO({ name: 'X', tier: 'safe', services: '{not json', hashtags: '[1,2' }, 'checklist', 'theme');
  assert.ok(out.title.length > 0);
  assert.ok(out.tags.length <= 13);
  const fallback = seo.generateSEO(null, 'invoice', 't');
  assert.ok(fallback.title.length > 0 && fallback.tags.length <= 13);
});

test('bi.build() survives legacy profession rows (production /api/console/bi 500)', () => {
  const profId = makeProfession({ services: 'not-json', hashtags: 'plain text hashtags' });
  const pid = makeProduct(profId, { status: 'listed', type: 'checklist' });
  try {
    const bi = require('../server/services/bi').build();
    assert.equal(bi.ok, true);
    assert.ok(Array.isArray(bi.listing.weakestSeo));
  } finally {
    db.prepare('DELETE FROM products WHERE id = ?').run(pid);
    db.prepare('DELETE FROM professions WHERE id = ?').run(profId);
  }
});

test('optimizer improves SEO score and honors the origin deploy rule', async () => {
  const concept = JSON.stringify({
    name: 'ScopeLock Quote Builder',
    pitch: 'Locks your quote to scope before deposit so clients cannot nickel-and-dime changes.',
    benefits: ['a', 'b', 'c'],
    differentiator: 'Turns the quote into a binding scope checklist.'
  });
  const profId = makeProfession({ services: JSON.stringify([['Cleaning', 50]]), hashtags: JSON.stringify(['#cleaning']) });
  const pid = makeProduct(profId, {
    status: 'listed', concept, origin: 'engine', marketplace: 'gumroad', marketplace_id: '__no_such_id__',
    brief: 'for solo cleaners who hate scope creep'
  });
  try {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(pid);
    const preview = optimizer.preview(product);
    assert.ok(preview.scoreAfter >= preview.scoreBefore, `score ${preview.scoreBefore} -> ${preview.scoreAfter}`);
    assert.ok(preview.optimized.title.length <= 140);
    assert.ok(preview.optimized.title.includes('ScopeLock Quote Builder'));
    assert.ok(preview.optimized.tags.length <= 13);
    // Engine-generated + listed → allowed to auto-deploy…
    assert.equal(preview.policy.autoDeploy, true);

    // …but apply with deploy:false must only persist locally (no network).
    const r = await optimizer.apply(product, { deploy: false });
    assert.equal(r.deploy.attempted, false);
    const stored = db.prepare('SELECT listing_json FROM products WHERE id = ?').get(pid);
    assert.ok(stored.listing_json && JSON.parse(stored.listing_json).title);

    // Manual products NEVER auto-deploy; unlisted engine products wait for publish.
    assert.equal(optimizer.deployPolicy({ origin: 'manual', marketplace: 'etsy', marketplace_id: '1' }).autoDeploy, false);
    assert.equal(optimizer.deployPolicy({ origin: 'engine', marketplace: 'etsy', marketplace_id: null }).autoDeploy, false);
    assert.equal(optimizer.deployPolicy({ origin: 'engine', marketplace: 'etsy', marketplace_id: '1' }).autoDeploy, true);
  } finally {
    db.prepare('DELETE FROM products WHERE id = ?').run(pid);
    db.prepare('DELETE FROM professions WHERE id = ?').run(profId);
    db.prepare("DELETE FROM automation_log WHERE product_id = ?").run(pid);
  }
});

test('gumroad daily cap honors gumroad_daily_cap (default 10)', () => {
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('gumroad_daily_cap', '7')").run();
  assert.equal(mp.getGumroadQuota().limit, 7);
  db.prepare("DELETE FROM settings WHERE key = 'gumroad_daily_cap'").run();
  assert.equal(mp.getGumroadQuota().limit, 10);
});

test('conceptEngine.generateConcept accepts a brief and bare niche strings without throwing', async () => {
  const cfg = require('../server/services/modelConfig');
  const ce = require('../server/services/conceptEngine');
  // The string-prof path must not throw. Off → null (zero cost); on → a
  // validated concept or null when the novelty gate rejects it.
  const r = await ce.generateConcept('Pet Bakeries', 'checklist', null, 'birthday themes');
  assert.ok(r === null || (typeof r === 'object' && typeof r.name === 'string'));
  if (!cfg.enabled) assert.equal(r, null);
});
