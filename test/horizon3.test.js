const test = require('node:test');
const assert = require('node:assert/strict');
const { db, init } = require('../server/database');
init();

const seasonal = require('../server/services/seasonalEngine');
const ac = require('../server/services/automationCycle');
const pinEngine = require('../server/services/pinEngine');

test('Horizon 3: seasonal.isSeasonalWindowActive correctly identifies active peak window', () => {
  const currentFocus = seasonal.getCurrentFocus();
  assert.ok(currentFocus);
  assert.ok(Array.isArray(currentFocus.slugs));

  // Find a profession in this month's focus
  const activeSlug = currentFocus.slugs[0];
  const activeProf = db.prepare('SELECT id FROM professions WHERE slug = ?').get(activeSlug);

  if (activeProf) {
    const activeProduct = { id: 99991, profession_id: activeProf.id };
    assert.equal(seasonal.isSeasonalWindowActive(activeProduct), true);
  }

  // Evergreen profession not in SEASONAL mapping should be active
  const evergreenProf = db.prepare("SELECT id FROM professions WHERE slug NOT IN ('aa-recovery','wedding-photography','pyrotechnics','hvac')").get();
  if (evergreenProf) {
    const evProduct = { id: 99992, profession_id: evergreenProf.id };
    assert.equal(seasonal.isSeasonalWindowActive(evProduct), true);
  }
});

test('Horizon 3: pinEngine duePins handles live token and marks pins posted', async () => {
  const prof = db.prepare('INSERT INTO professions (name, slug) VALUES (?, ?)').run(`Pin Prof ${Date.now()}`, `pin-prof-${Date.now()}`);
  const profId = prof.lastInsertRowid;
  const prod = db.prepare("INSERT INTO products (profession_id, name, type, price, status) VALUES (?, ?, 'spreadsheet', '$19.00', 'listed')")
    .run(profId, 'Pinterest Test Item').lastInsertRowid;

  const pastDate = new Date(Date.now() - 3600000).toISOString();
  db.prepare(`INSERT INTO pins (product_id, title, description, board_hint, target_url, status, scheduled_for)
              VALUES (?, ?, ?, ?, ?, 'scheduled', ?)`)
    .run(prod, 'Sample Pin Title', 'Sample Pin Description', 'general', 'https://example.com/item', pastDate);

  try {
    const due = await pinEngine.duePins(10);
    assert.ok(Array.isArray(due));
    assert.ok(due.length >= 1);
    const updated = db.prepare("SELECT status FROM pins WHERE product_id = ?").get(prod);
    assert.equal(updated.status, 'posted');
  } finally {
    db.prepare('DELETE FROM pins WHERE product_id = ?').run(prod);
    db.prepare('DELETE FROM products WHERE id = ?').run(prod);
    db.prepare('DELETE FROM professions WHERE id = ?').run(profId);
  }
});

test('Horizon 3: taskRetire identifies cold listings without throwing', () => {
  const ctx = {};
  const res = ac.taskRetire(ctx);
  assert.ok(res);
  assert.equal(typeof res.coldListingsIdentified, 'number');
});
