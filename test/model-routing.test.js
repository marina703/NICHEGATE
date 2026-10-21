const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Hermetic DB — modelRouter requires ../database at import time.
if (!process.env.DB_PATH) process.env.DB_PATH = path.join(os.tmpdir(), `ng-routing-${process.pid}.db`);
const DB_PATH = process.env.DB_PATH;
process.env.NODE_ENV = 'test';
delete process.env.RAILWAY_ENVIRONMENT;

process.env.VISION_PROVIDER = 'nous';
process.env.NOUSPORTAL_API_KEY = 'test-key';
process.env.VISION_BASE_URL = 'https://example.invalid/v1';

const router = require('../server/services/modelRouter');

test('defaultTarget routes to Nous when VISION_PROVIDER=nous', () => {
  const t = router.defaultTarget();
  assert.ok(t, 'expected a target');
  assert.equal(t.baseUrl, 'https://example.invalid/v1');
  assert.match(t.headers.Authorization, /^Bearer test-key$/);
});

test('defaultTarget falls back to the production Nous URL when VISION_BASE_URL is unset', () => {
  const saved = process.env.VISION_BASE_URL;
  delete process.env.VISION_BASE_URL;
  const t = router.defaultTarget();
  assert.equal(t.baseUrl, 'https://inference-api.nousresearch.com/v1');
  process.env.VISION_BASE_URL = saved;
});

test('defaultTarget is undefined without a Nous key', () => {
  const saved = process.env.NOUSPORTAL_API_KEY;
  delete process.env.NOUSPORTAL_API_KEY;
  assert.equal(router.defaultTarget(), undefined);
  process.env.NOUSPORTAL_API_KEY = saved;
});

test('defaultTarget is undefined when provider is not nous', () => {
  const saved = process.env.VISION_PROVIDER;
  process.env.VISION_PROVIDER = 'openrouter';
  assert.equal(router.defaultTarget(), undefined);
  process.env.VISION_PROVIDER = saved;
});

test('cleanup', () => {
  for (const s of ['', '-wal', '-shm']) { try { fs.rmSync(DB_PATH + s, { force: true }); } catch {} }
  assert.ok(true);
});
