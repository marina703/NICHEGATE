const test = require('node:test');
const assert = require('node:assert/strict');
const { db, init } = require('../server/database');
init();
const biService = require('../server/services/bi');

test('calculateNetUnitEconomics: calculates fees, AI token costs, and net margin', () => {
  const prof = db.prepare('INSERT INTO professions (name, slug) VALUES (?, ?)').run(`Bi Prof ${Date.now()}`, `bi-${Date.now()}`);
  const profId = prof.lastInsertRowid;

  const prod1 = db.prepare("INSERT INTO products (profession_id, name, type, price, status, marketplace) VALUES (?, ?, 'spreadsheet', '$20.00', 'listed', 'gumroad')").run(profId, 'Gumroad Item').lastInsertRowid;
  const prod2 = db.prepare("INSERT INTO products (profession_id, name, type, price, status, marketplace) VALUES (?, ?, 'spreadsheet', '$30.00', 'listed', 'etsy')").run(profId, 'Etsy Item').lastInsertRowid;

  // Insert sales
  db.prepare('INSERT INTO metrics (profession_id, product_id, views, sales, revenue) VALUES (?, ?, 10, 2, 40.00)').run(profId, prod1);
  db.prepare('INSERT INTO metrics (profession_id, product_id, views, sales, revenue) VALUES (?, ?, 20, 1, 30.00)').run(profId, prod2);

  // Insert AI usage
  db.prepare('INSERT INTO ai_usage (model, prompt_tokens, completion_tokens, total_tokens, cost_usd, action) VALUES (?, ?, ?, ?, ?, ?)')
    .run('gemini-flash', 1000, 500, 1500, 0.05, 'ideation');

  try {
    const pnl = biService.calculateNetUnitEconomics();
    assert.ok(pnl);
    assert.ok(pnl.grossRevenue >= 70.00);
    assert.ok(pnl.marketplaceFees > 0);
    assert.ok(pnl.aiCost >= 0.05);
    assert.ok(pnl.aiTokens >= 1500);
    assert.ok(pnl.netProfit < pnl.grossRevenue);
    assert.ok(pnl.netMarginPct > 0 && pnl.netMarginPct <= 100);

    // Verify build() exposes pnl
    const bi = biService.build();
    assert.ok(bi.pnl);
    assert.equal(bi.pnl.totalSalesUnits, pnl.totalSalesUnits);
  } finally {
    db.prepare('DELETE FROM metrics WHERE profession_id = ?').run(profId);
    db.prepare('DELETE FROM products WHERE profession_id = ?').run(profId);
    db.prepare('DELETE FROM professions WHERE id = ?').run(profId);
    db.prepare("DELETE FROM ai_usage WHERE action = 'ideation' AND cost_usd = 0.05").run();
  }
});
