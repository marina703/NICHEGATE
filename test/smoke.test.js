const assert = require('node:assert/strict');
const test = require('node:test');
const { app } = require('../server/index');
const auth = require('../server/services/auth');

// Hermetic: when auth is enabled (ADMIN_PASSWORD from env or .env) the suite
// logs itself in and sends the session cookie — no env juggling needed. With
// auth disabled the same tests run anonymously.

let server;
let cookie = '';

function get(p) {
  return fetch(`http://127.0.0.1:${server.address().port}${p}`, { headers: { cookie } });
}

test.before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  if (auth.enabled()) {
    const login = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: process.env.ADMIN_PASSWORD })
    });
    assert.equal(login.status, 200, 'suite must be able to log in with ADMIN_PASSWORD');
    cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  }
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

test('serves the dashboard', async () => {
  const response = await get('/');
  assert.equal(response.status, 200);
  assert.match(await response.text(), /NicheGate/i);
});

test('returns seeded professions as JSON', async () => {
  const response = await get('/api/professions');
  assert.equal(response.status, 200);
  const professions = await response.json();
  assert.ok(Array.isArray(professions));
  assert.ok(professions.length > 0);
  assert.equal(typeof professions[0].slug, 'string');
});

test('serves a launch-readiness report', async () => {
  const response = await get('/api/health/readiness');
  assert.equal(response.status, 200);
  const report = await response.json();
  assert.equal(typeof report.ok, 'boolean');
  assert.ok(Array.isArray(report.issues));
  assert.ok(report.summary && typeof report.summary === 'object');
  assert.ok('realSales' in report.summary);
});
