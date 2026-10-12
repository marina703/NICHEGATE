const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
process.env.DB_PATH = path.join(os.tmpdir(), `nichegate-pricing-auto-${process.pid}.db`);
const { db, init } = require('../server/database');
init();
const pricingEngine = require('../server/services/pricingEngine');

test('pricingEngine: autoPromoteWinners identifies and adopts winning price variant', async () => {
  // The test file uses a throwaway database so no real pricing tests are touched.
  const prevSettings = db.prepare('SELECT value FROM settings WHERE key = ?').get('pricing_tests');
  db.prepare('DELETE FROM settings WHERE key = ?').run('pricing_tests');

  const pIns = db.prepare('INSERT INTO professions (name, slug) VALUES (?, ?)').run(`Pricing Prof ${Date.now()}`, `slug-${Date.now()}`);
  const profId = pIns.lastInsertRowid;

  const prod1 = db.prepare('INSERT INTO products (profession_id, name, type, price, status) VALUES (?, ?, ?, ?, ?)').run(profId, 'Test Product P1', 'spreadsheet', '$17.00', 'listed').lastInsertRowid;
  const prod2 = db.prepare('INSERT INTO products (profession_id, name, type, price, status) VALUES (?, ?, ?, ?, ?)').run(profId, 'Test Product P2', 'spreadsheet', '$17.00', 'listed').lastInsertRowid;

  // Start pricing test on prod1 and prod2
  pricingEngine.startPriceTest(prod1, '$17.00');
  pricingEngine.startPriceTest(prod2, '$17.00');

  // Insert sales into metrics so prod1 is a clear statistical winner (>=5 sales and >= 2x units/day)
  db.prepare('INSERT INTO metrics (profession_id, product_id, views, sales, revenue) VALUES (?, ?, 200, 6, 120.00)').run(profId, prod1);
  db.prepare('INSERT INTO metrics (profession_id, product_id, views, sales, revenue) VALUES (?, ?, 50, 1, 15.00)').run(profId, prod2);

  const summary = pricingEngine.pricingSummary();
  assert.ok(summary.length >= 2);
  const winnerItem = summary.find(s => s.productId === prod1);
  assert.ok(winnerItem);
  assert.equal(winnerItem.winner, true);

  // Run autoPromoteWinners
  const promoted = await pricingEngine.autoPromoteWinners();
  assert.ok(promoted.length >= 1, 'Should auto-promote at least 1 winner');
  const promotedP1 = promoted.find(p => p.productId === prod1);
  assert.ok(promotedP1);
  assert.equal(promotedP1.productId, prod1);

  // Check product price was updated
  const updatedP1 = db.prepare('SELECT price FROM products WHERE id = ?').get(prod1);
  assert.equal(updatedP1.price, `$${promotedP1.winningPrice.toFixed(2)}`);

  // Clean up
  db.prepare('DELETE FROM metrics WHERE profession_id = ?').run(profId);
  db.prepare('DELETE FROM products WHERE profession_id = ?').run(profId);
  db.prepare('DELETE FROM professions WHERE id = ?').run(profId);
  if (prevSettings && prevSettings.value) {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('pricing_tests', prevSettings.value);
  } else {
    db.prepare('DELETE FROM settings WHERE key = ?').run('pricing_tests');
  }
});
