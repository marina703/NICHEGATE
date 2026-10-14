const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
process.env.DB_PATH = path.join(os.tmpdir(), `nichegate-competitor-engine-${process.pid}.db`);
const { db, init } = require('../server/database');
init();
const competitorEngine = require('../server/services/competitorEngine');

test('competitorEngine: scrapeCompetitor parses query or URL and determines counter-strategy', async () => {
  const result = await competitorEngine.scrapeCompetitor('Wedding Florist Pricing Calculator');
  assert.ok(result);
  assert.equal(result.title, 'Wedding Florist Pricing Calculator');
  assert.ok(result.incumbentPrice > 0);
  assert.ok(result.counterStrategy);
  assert.ok(result.counterStrategy.recommendedPrice > 0);
});

test('competitorEngine: generateCounterProducts creates targeted counter-listings', async () => {
  const analysis = await competitorEngine.scrapeCompetitor('Dog Grooming Invoice & Tracker');
  const gen = await competitorEngine.generateCounterProducts(analysis, 2);
  assert.ok(gen);
  assert.equal(gen.generated.length, 2);
  assert.equal(gen.generated[0].status, 'draft');
  assert.equal(gen.generated[0].origin, 'competitor_counter');

  // Cleanup
  for (const p of gen.generated) {
    db.prepare('DELETE FROM products WHERE id = ?').run(p.id);
  }
});
