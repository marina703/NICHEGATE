const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Hermetic DB — marketplace requires ../database at import time.
if (!process.env.DB_PATH) process.env.DB_PATH = path.join(os.tmpdir(), `ng-catbox-${process.pid}.db`);
const DB_PATH = process.env.DB_PATH;
process.env.NODE_ENV = 'test';
delete process.env.RAILWAY_ENVIRONMENT;

const mp = require('../server/services/marketplace');

function tmpPng() {
  const p = path.join(os.tmpdir(), `ng-catbox-${process.pid}.png`);
  fs.writeFileSync(p, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return p;
}

test('uploadToCatbox sends a User-Agent and returns the URL', async () => {
  const file = tmpPng();
  let seenHeaders = null;
  const fakePost = async (url, body, opts) => { seenHeaders = opts.headers; return { data: 'https://files.catbox.moe/abc.png' }; };
  const url = await mp.uploadToCatbox(file, fakePost);
  assert.equal(url, 'https://files.catbox.moe/abc.png');
  assert.ok(seenHeaders && seenHeaders['User-Agent'], 'must send a User-Agent (Catbox blocks UA-less requests)');
});

test('uploadToCatbox retries once then throws on an empty body', async () => {
  const file = tmpPng();
  let calls = 0;
  const fakePost = async () => { calls++; return { data: '' }; };
  await assert.rejects(() => mp.uploadToCatbox(file, fakePost), /Image host rejected upload/);
  assert.equal(calls, 2, 'retried exactly once');
});

test('cleanup', () => {
  for (const s of ['', '-wal', '-shm']) { try { fs.rmSync(DB_PATH + s, { force: true }); } catch {} }
  assert.ok(true);
});
