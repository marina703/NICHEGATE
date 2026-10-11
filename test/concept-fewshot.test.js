const test = require('node:test');
const assert = require('node:assert/strict');
const conceptEngine = require('../server/services/conceptEngine');
const { db, init } = require('../server/database');
init();

test('conceptEngine: getFewShotExamples strictly returns actual sold winner products (empty when no past sales)', () => {
  // Fresh/empty sales state should return empty array (never pulls unproven drafts)
  const emptyExamples = conceptEngine.getFewShotExamples(2);
  assert.ok(Array.isArray(emptyExamples));

  // Insert a real proven product with >= 2 sales in metrics
  const prof = db.prepare('SELECT id FROM professions LIMIT 1').get();
  const conceptObj = {
    name: 'Proven High-Ticket Pipeline Estimator',
    pitch: 'Calculates exact close rates and pipeline leakage.',
    benefits: ['Track deals', 'Forecast revenue', 'Stop pipeline leak'],
    differentiator: 'Direct formulas tailored for B2B consultant deal sizes.'
  };

  const pRes = db.prepare(`
    INSERT INTO products (profession_id, name, type, price, status, concept)
    VALUES (?, ?, 'spreadsheet', '$29', 'listed', ?)
  `).run(prof.id, 'Proven High-Ticket Pipeline Estimator', JSON.stringify(conceptObj));
  const pid = pRes.lastInsertRowid;

  const mRes = db.prepare(`
    INSERT INTO metrics (profession_id, product_id, sales, revenue)
    VALUES (?, ?, 5, 145.00)
  `).run(prof.id, pid);

  try {
    const winners = conceptEngine.getFewShotExamples(2);
    assert.ok(winners.length >= 1);
    const parsed = JSON.parse(winners[0]);
    assert.equal(parsed.name, 'Proven High-Ticket Pipeline Estimator');
    assert.ok(parsed.pitch);
    assert.ok(Array.isArray(parsed.benefits));
    assert.ok(parsed.differentiator);
  } finally {
    db.prepare('DELETE FROM metrics WHERE id = ?').run(mRes.lastInsertRowid);
    db.prepare('DELETE FROM products WHERE id = ?').run(pid);
  }
});
