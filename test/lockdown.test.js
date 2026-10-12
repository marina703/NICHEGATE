// LOCKDOWN TRIPWIRE (owner ruling 2026-09-26): this app is a strict command
// center / AI automation engine — NOTHING is public except /login + its shell
// assets, /api/auth/* and /api/health*. There is no customer-facing storefront
// (it was deleted). This test parses every route registered in server/index.js
// and asserts none of them answers an anonymous request with 200 unless it is
// on that allowlist. Any future "open this for customers" change fails here.

process.env.ADMIN_PASSWORD = 'lockdown-test-only-2026';
// The sweep probes every route twice (anon + authed); it must never trip the
// shared anonymous rate-limit bucket and fail for the wrong reason.
process.env.API_RATE_LIMIT_ANON_MAX = '100000';
process.env.API_RATE_LIMIT_AUTHED_MAX = '100000';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('../server/index');

let server;
let base;

test.before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

// Parse route registrations straight out of the server source so NEW routes are
// covered the moment they are added — no list to keep in sync.
function registeredRoutes() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'index.js'), 'utf8');
  const re = /app\.(get|post|put|patch|delete)\(\s*(['"`])([^'"`]+)\2/g;
  const routes = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    const p = m[3].replace(/:[^/]+/g, '1'); // :id -> 1
    routes.push({ method: m[1].toUpperCase(), path: p });
  }
  return routes;
}

function isAllowlisted(p) {
  if (p.startsWith('/api/auth') || p.startsWith('/api/health')) return true;
  // Intentionally public, non-storefront surfaces: the brand logo is fetched
  // cross-origin from third-party app-approval consoles (developer-app
  // submissions REQUIRE a publicly reachable logo/website URL), which is why
  // it is served anonymously with CORS headers. It exposes zero product or
  // customer data — it is a brand asset also visible on public marketplaces.
  if (p === '/nichegate-logo.png') return true;
  return false;
}

async function login() {
  const r = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password: process.env.ADMIN_PASSWORD })
  });
  assert.equal(r.status, 200, 'must be able to log in with ADMIN_PASSWORD');
  return (r.headers.get('set-cookie') || '').split(';')[0];
}

test('every registered route is sealed from anonymous visitors', async () => {
  const routes = registeredRoutes();
  assert.ok(routes.length > 50, `route parser found only ${routes.length} routes — parser broken?`);

  const leaks = [];
  for (const { method, path: p } of routes) {
    if (method !== 'GET' && !p.startsWith('/api/')) continue; // non-API mutations not swept
    const r = await fetch(base + p, { method, redirect: 'manual' });
    if (isAllowlisted(p)) {
      if (r.status >= 500) leaks.push(`${method} ${p} -> ${r.status} (5xx on allowlist)`);
      continue;
    }
    if (p.startsWith('/api/')) {
      if (r.status !== 401) leaks.push(`${method} ${p} -> ${r.status} (expected 401)`);
    } else if (r.status === 200) {
      leaks.push(`${method} ${p} -> 200 (public page!)`);
    }
  }
  assert.deepEqual(leaks, [], `anonymous surface is open:\n${leaks.join('\n')}`);
});

test('page routes redirect anonymous visitors to login', async () => {
  for (const p of ['/']) {
    const r = await fetch(base + p, { redirect: 'manual' });
    assert.equal(r.status, 302, `${p} should redirect to /login`);
    assert.match(r.headers.get('location') || '', /login/);
  }
});

test('the storefront is deleted — not just gated', async () => {
  for (const p of ['/store', '/store.html', '/js/store.js']) {
    const r = await fetch(base + p, { redirect: 'manual' });
    assert.equal(r.status, 404, `${p} should be gone (404), got ${r.status}`);
  }
  const cookie = await login();
  for (const p of ['/api/store/products', '/api/store/showcase']) {
    const r = await fetch(base + p, { headers: { cookie } });
    assert.equal(r.status, 404, `${p} should be gone for authed users too, got ${r.status}`);
  }
});

test('internal asset mounts require the session', async () => {
  for (const p of ['/generated/x', '/uploads/x', '/covers/x']) {
    const r = await fetch(base + p, { redirect: 'manual' });
    assert.equal(r.status, 401, `${p} should be 401 for anonymous, got ${r.status}`);
  }
});

test('the login surface stays open (login + healthcheck + shell)', async () => {
  const loginPage = await fetch(`${base}/login`);
  assert.equal(loginPage.status, 200);
  const health = await fetch(`${base}/api/health`);
  assert.equal(health.status, 200);
  const status = await fetch(`${base}/api/auth/status`);
  assert.ok(status.status < 500);
});

test('the console still works behind the session', async () => {
  const cookie = await login();
  const shell = await fetch(`${base}/`, { headers: { cookie } });
  assert.equal(shell.status, 200);
  const products = await fetch(`${base}/api/products`, { headers: { cookie } });
  assert.equal(products.status, 200);
  const overview = await fetch(`${base}/api/console/overview`, { headers: { cookie } });
  assert.equal(overview.status, 200);
});
