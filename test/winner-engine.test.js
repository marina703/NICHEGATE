const test = require('node:test');
const assert = require('node:assert/strict');
const { db, init } = require('../server/database');
init(); // ensure migrations applied
const winnerEngine = require('../server/services/winnerEngine');

test('winnerEngine: finds winners and creates sequels + siblings', async () => {
  // Create test profession
  const slug = `winner-test-${Date.now()}`;
  const pIns = db.prepare('INSERT INTO professions (name, slug) VALUES (?, ?)').run(`Winner Prof ${Date.now()}`, slug);
  const profId = pIns.lastInsertRowid;

  // Create test product
  const prodIns = db.prepare(`
    INSERT INTO products (profession_id, name, type, price, status, origin)
    VALUES (?, 'Test Best-Selling Spreadsheet', 'spreadsheet', '$17', 'listed', 'engine')
  `).run(profId);
  const prodId = prodIns.lastInsertRowid;

  // Record sales in metrics to meet winner threshold (3 sales)
  db.prepare(`
    INSERT INTO metrics (profession_id, product_id, views, sales, revenue)
    VALUES (?, ?, 100, 3, 51.00)
  `).run(profId, prodId);

  const winners = winnerEngine.findWinners(2);
  assert.ok(winners.length >= 1, 'Should find at least 1 winner');
  const targetWinner = winners.find(w => w.id === prodId);
  assert.ok(targetWinner, 'Created product should be in winners');
  assert.equal(targetWinner.total_sales, 3);

  // Run sequel generation
  const sequel = winnerEngine.createProSequel(targetWinner);
  assert.ok(sequel, 'Pro sequel should be created');
  assert.match(sequel.name, /Pro Edition & Master Toolkit/);
  assert.equal(sequel.price, '$29');
  assert.equal(sequel.parent_product_id, prodId);

  // Run sibling fill
  const siblings = winnerEngine.fillSiblingTypes(targetWinner, 2);
  assert.ok(siblings.length >= 1, 'Siblings should be drafted');
  assert.equal(siblings[0].parent_product_id, prodId);

  // Clean up
  db.prepare('DELETE FROM metrics WHERE profession_id = ?').run(profId);
  db.prepare('DELETE FROM products WHERE profession_id = ?').run(profId);
  db.prepare('DELETE FROM professions WHERE id = ?').run(profId);
});
