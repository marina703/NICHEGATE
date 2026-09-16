const test = require('node:test');
const assert = require('node:assert/strict');
const { noveltyScore, parseConcept, generateConcept, applyConcept } = require('../server/services/conceptEngine');
const cfg = require('../server/services/modelConfig');
const { db } = require('../server/database');

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
  const id = db.prepare('SELECT id FROM products LIMIT 1').get().id;
  assert.equal(applyConcept(id, null), false);
  assert.equal(applyConcept(id, { name: '' }), false);
  assert.equal(applyConcept(id, { name: 'ScopeLock Quote Builder', pitch: 'x', benefits: [], differentiator: 'y' }), true);
  const row = db.prepare('SELECT name, concept FROM products WHERE id = ?').get(id);
  assert.equal(row.name, 'ScopeLock Quote Builder');
  assert.ok(JSON.parse(row.concept).pitch === 'x');
  // restore name
  db.prepare('UPDATE products SET name = ?, concept = NULL WHERE id = ?').run('Restored Product', id);
});