const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// serviceCopy → modelRouter → ../database at import; give it a hermetic DB.
const fs = require('node:fs');
const os = require('node:os');
if (!process.env.DB_PATH) process.env.DB_PATH = path.join(os.tmpdir(), `ng-svc-${process.pid}.db`);
const DB_PATH = process.env.DB_PATH;
process.env.NODE_ENV = 'test';
delete process.env.RAILWAY_ENVIRONMENT;

const sc = require('../server/services/serviceCopy');

test('parseArray extracts a JSON array from noisy text', () => {
  assert.deepEqual(sc.parseArray('```json\n["a","b"]\n```'), ['a', 'b']);
  assert.equal(sc.parseArray('no array here'), null);
  assert.equal(sc.parseArray(''), null);
});

test('parseArray salvages a truncated array (reasoning-model cutoff)', () => {
  const truncated = '[ "Hang and finish one sheet with tape and mud", "Tape and mud joints with three coats of compound';
  const out = sc.parseArray(truncated);
  assert.ok(Array.isArray(out) && out.length >= 1);
  assert.match(out[0], /Hang and finish/i);
});

test('fallbackLine names the service', () => {
  const line = sc.fallbackLine('Tape & Mud');
  assert.match(line, /tape & mud/i);
});

test('includeDescriptions returns one line per service for an empty list', async () => {
  assert.deepEqual(await sc.includeDescriptions({ name: 'X' }, []), []);
});

test('cleanup', () => {
  for (const s of ['', '-wal', '-shm']) { try { fs.rmSync(DB_PATH + s, { force: true }); } catch {} }
  assert.ok(true);
});
