const assert = require('node:assert/strict');
const test = require('node:test');
const { app } = require('../server/index');

let server;

test.before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

test('serves the dashboard', async () => {
  const response = await fetch(`http://127.0.0.1:${server.address().port}/`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /NicheGate/i);
});

test('returns seeded professions as JSON', async () => {
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/professions`);
  assert.equal(response.status, 200);
  const professions = await response.json();
  assert.ok(Array.isArray(professions));
  assert.ok(professions.length > 0);
  assert.equal(typeof professions[0].slug, 'string');
});

test('serves a launch-readiness report', async () => {
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/health/readiness`);
  assert.equal(response.status, 200);
  const report = await response.json();
  assert.equal(typeof report.ok, 'boolean');
  assert.ok(Array.isArray(report.issues));
  assert.ok(report.summary && typeof report.summary === 'object');
  assert.ok('realSales' in report.summary);
});
