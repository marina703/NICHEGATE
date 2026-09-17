const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const auth = require('../server/services/auth');
const { db, init } = require('../server/database');

init(); // ensure tables (auth_sessions) exist

beforeEach(() => { db.prepare('DELETE FROM auth_sessions').run(); });
afterEach(() => { db.prepare('DELETE FROM auth_sessions').run(); });

test('auth is disabled when ADMIN_PASSWORD is unset (no locking out existing deployments)', () => {
  delete process.env.ADMIN_PASSWORD;
  assert.equal(auth.enabled(), false);
});

test('createSession + isValidToken round-trip', () => {
  process.env.ADMIN_PASSWORD = 'secret123';
  const sess = auth.createSession();
  assert.ok(sess.token.length >= 32);
  assert.equal(auth.isValidToken(sess.token), true);
  assert.equal(auth.isValidToken('nope'), false);
});

test('requireAuth passes through when auth disabled', () => {
  delete process.env.ADMIN_PASSWORD;
  let called = false;
  const req = {}, res = {};
  auth.requireAuth()(req, res, () => { called = true; });
  assert.equal(called, true);
});

test('requireAuth rejects unauthenticated request when auth enabled', () => {
  process.env.ADMIN_PASSWORD = 'secret123';
  let statusCode = null, sent = null;
  const req = { headers: {} };
  const res = { status: (c) => ({ json: (j) => { statusCode = c; sent = j; } }), redirect: () => {} };
  auth.requireAuth({ json: true })(req, res, null);
  assert.equal(statusCode, 401);
});

test('requireAuth accepts a valid session token', () => {
  process.env.ADMIN_PASSWORD = 'secret123';
  const sess = auth.createSession();
  const req = { headers: { cookie: `ng_session=${sess.token}` } };
  let called = false;
  auth.requireAuth({ json: true })(req, {}, () => { called = true; });
  assert.equal(called, true);
});

test('login rejects a wrong password', async () => {
  process.env.ADMIN_PASSWORD = 'secret123';
  const req = { body: { password: 'wrong' } };
  let statusCode = null, body = null;
  await auth.login(req, { status: (c) => ({ json: (j) => { statusCode = c; body = j; } }), setHeader: () => {} });
  assert.equal(statusCode, 401);
});

test('login sets a session cookie on success', async () => {
  process.env.ADMIN_PASSWORD = 'secret123';
  let cookie = null;
  const req = { body: { password: 'secret123' } };
  const res = {
    setHeader: (k, v) => { if (k === 'Set-Cookie') cookie = v; },
    json: (j) => { assert.equal(j.ok, true); }
  };
  await auth.login(req, res);
  assert.ok(cookie && cookie.startsWith('ng_session='));
});

test('logout clears the session', () => {
  process.env.ADMIN_PASSWORD = 'secret123';
  const sess = auth.createSession();
  const req = { headers: { cookie: `ng_session=${sess.token}` } };
  const res = { setHeader: () => {}, json: () => {} };
  auth.logout(req, res);
  assert.equal(auth.isValidToken(sess.token), false);
});