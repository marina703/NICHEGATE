const test = require('node:test');
const assert = require('node:assert/strict');
const { noveltyScore, parseConcept, generateConcept, applyConcept, forecastTrend, forecastProductEngagement } = require('../server/services/conceptEngine');
const cfg = require('../server/services/modelConfig');
const { db } = require('../server/database');

test('forecastTrend is a deterministic no-op when the model layer is disabled', () => {
  if (cfg.enabled) return; // live-key environments exercise the scored path below
  const f = forecastTrend({ name: 'House Cleaning', slug: 'house-cleaning' }, 'checklist', { name: 'x', pitch: 'y' });
  assert.deepEqual(f, { trending: false, score: 0 });
});

test('forecastTrend scores seasonal and compliance keywords consistently with its threshold', () => {
  if (!cfg.enabled) return; // gated on cfg.enabled — scored path needs the layer on
  const f = forecastTrend({ name: 'HVAC', slug: 'hvac' }, 'checklist', {
    name: 'IRS Season Compliance Checklist',
    pitch: 'limited holiday offer'
  });
  assert.equal(typeof f.score, 'number');
  assert.equal(f.trending, f.score >= 30);
});

test('forecastProductEngagement reads the stored concept and is deterministic', () => {
  const product = {
    name: 'Gumroad Profit Tracker Spreadsheet',
    concept: JSON.stringify({
      name: 'Gumroad Profit Tracker Spreadsheet',
      pitch: 'Track every dollar you earn and save hours each month.',
      benefits: ['Revenue by niche', 'Fee math', 'Weekly snapshot'],
      differentiator: 'Built for creators who sell digital downloads and need real net margins.'
    })
  };
  const a = forecastProductEngagement(product, 'gumroad creators');
  const b = forecastProductEngagement(product, 'gumroad creators');
  assert.deepEqual(a, b, 'same inputs must produce the same forecast');
  assert.ok(a.score > 0);
  assert.ok(['low', 'medium', 'high'].includes(a.prediction));
});

test('forecastProductEngagement tolerates a missing/broken concept JSON', () => {
  const withJunk = forecastProductEngagement({ name: 'Plain Checklist', concept: 'not json' }, 'cleaning');
  const withNone = forecastProductEngagement({ name: 'Plain Checklist', concept: null }, 'cleaning');
  assert.deepEqual(withJunk, withNone);
  assert.equal(typeof withNone.score, 'number');
});

test('novelty gate rewards specific angles and rejects generic templates', () => {
  const generic = { name: 'Ultimate Invoice Template Kit', pitch: 'A simple basic template for everyone.', benefits: ['a', 'b', 'c'], differentiator: 'x' };
  const specific = { name: 'ScopeLock Quote Builder', pitch: 'Locks your quote to scope before deposit so cleaning clients cannot nickel-and-dime changes.', benefits: ['Deposit trigger on scope accept', 'Change-order pricing lines', 'Referral capture on invoice'], differentiator: 'Turn the quote into a binding scope checklist clients sign before deposit.' };
  assert.ok(noveltyScore(generic) < 55);
  assert.ok(noveltyScore(specific) >= 55);
});

test('parseConcept tolerates markdown-wrapped JSON and rejects garbage', () => {
  const good = parseConcept('```json\n{"name":"X","pitch":"P","benefits":["a","b","c"],"differentiator":"D"}\n```');
  assert.equal(good.name, 'X');
  assert.equal(good.benefits.length, 3);
  assert.equal(parseConcept('not json'), null);
  assert.equal(parseConcept(''), null);
});

test('concept creation returns null when the model layer is disabled (zero cost)', { skip: cfg.enabled }, async () => {
  const concept = await generateConcept({ name: 'House Cleaning', slug: 'house-cleaning' }, 'invoice');
  assert.equal(concept, null);
});

test('applyConcept persists name + concept and validates input', () => {
  // Hermetic: never depend on production data. If the DB has no products yet
  // (fresh install / CI), provision a throwaway row and clean it up afterwards.
  let existing = db.prepare('SELECT id FROM products LIMIT 1').get();
  let tempProductId = null;
  let tempProfessionId = null;
  if (!existing) {
    const prof = db.prepare('SELECT id FROM professions LIMIT 1').get();
    let professionId;
    if (prof) {
      professionId = prof.id;
    } else {
      professionId = db.prepare("INSERT INTO professions (emoji,name,slug,status,tier,colors,services,hashtags) VALUES ('🧪','__test_prof__','__test-prof__','researching','safe','{}','[]','[]')").run().lastInsertRowid;
      tempProfessionId = professionId;
    }
    tempProductId = db.prepare("INSERT INTO products (profession_id,name,type,price,status) VALUES (?,?,?,?,?)")
      .run(professionId, '__test_product__', 'checklist', '$10', 'draft').lastInsertRowid;
    existing = { id: tempProductId };
  }
  const id = existing.id;

  assert.equal(applyConcept(id, null), false);
  assert.equal(applyConcept(id, { name: '' }), false);
  assert.equal(applyConcept(id, { name: 'ScopeLock Quote Builder', pitch: 'x', benefits: [], differentiator: 'y' }), true);
  const updated = db.prepare('SELECT name, concept FROM products WHERE id = ?').get(id);
  assert.equal(updated.name, 'ScopeLock Quote Builder');
  assert.ok(JSON.parse(updated.concept).pitch === 'x');

  if (tempProductId) {
    db.prepare('DELETE FROM products WHERE id = ?').run(tempProductId);
    if (tempProfessionId) db.prepare('DELETE FROM professions WHERE id = ?').run(tempProfessionId);
  } else {
    db.prepare('UPDATE products SET name = ?, concept = NULL WHERE id = ?').run('Restored Product', id);
  }
});