const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ownsDbPath = !process.env.DB_PATH;
if (ownsDbPath) {
  process.env.DB_PATH = path.join(os.tmpdir(), `nichegate-generation-${process.pid}.db`);
}
const DB_PATH = process.env.DB_PATH;
const previousNodeEnv = process.env.NODE_ENV;
const previousRailway = process.env.RAILWAY_ENVIRONMENT;
process.env.NODE_ENV = 'test';
delete process.env.RAILWAY_ENVIRONMENT;

const { db, init } = require('../server/database');
const automationCycle = require('../server/services/automationCycle');

init();
db.prepare('DELETE FROM products').run();
db.prepare('DELETE FROM professions').run();
const professionId = Number(db.prepare(
  "INSERT INTO professions (name, slug, status) VALUES ('Automation Fixture', 'automation-fixture', 'active')"
).run().lastInsertRowid);

for (const [index, type] of automationCycle.VARY_TYPES.entries()) {
  const status = index % 2 === 0 ? 'approved' : 'listed';
  db.prepare('INSERT INTO products (profession_id, name, type, status, price, origin) VALUES (?, ?, ?, ?, ?, ?)')
    .run(professionId, `Existing ${type}`, type, status, '$12', 'engine');
}

test('taskGenerate does not recreate types with approved or listed products', () => {
  const result = automationCycle.taskGenerate({});
  assert.equal(result.generated, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM products').get().count, automationCycle.VARY_TYPES.length);
});

after(() => {
  db.close();
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousNodeEnv;
  if (previousRailway === undefined) delete process.env.RAILWAY_ENVIRONMENT;
  else process.env.RAILWAY_ENVIRONMENT = previousRailway;
  if (ownsDbPath) {
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.rmSync(DB_PATH + suffix, { force: true }); } catch {}
    }
  }
});
