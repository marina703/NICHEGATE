const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const { generatePreviewBatch } = require('../server/services/previewBatch');

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE products (id INTEGER PRIMARY KEY, status TEXT, preview_path TEXT)');
  const insert = db.prepare('INSERT INTO products VALUES (?, ?, ?)');
  for (let id = 1; id <= 33; id++) insert.run(id, 'approved', 'old.jpg');
  insert.run(34, 'listed', 'listed.jpg');
  insert.run(35, 'rejected', 'rejected.jpg');
  return db;
}

test('rebuild cursor visits >2 batches once, including failures, and excludes new rows', async () => {
  const db = fixture();
  try {
    const seen = [];
    const render = async p => {
      seen.push(p.id);
      assert.equal(p.preview_path, null);
      assert.equal(db.prepare('SELECT preview_path FROM products WHERE id=?').get(p.id).preview_path, 'old.jpg');
      if (p.id === 2) throw new Error('render failed');
      if (p.id === 3) return null;
      return 'new.jpg';
    };
    let batch = await generatePreviewBatch(db, render, { force: '1', limit: '15' });
    assert.equal(batch.nextAfterId, 15);
    assert.equal(batch.remaining, 18);
    assert.deepEqual(batch.failedIds, [2, 3]);
    db.prepare('INSERT INTO products VALUES (?, ?, ?)').run(36, 'approved', 'new-product.jpg');
    while (batch.hasMore) {
      batch = await generatePreviewBatch(db, render, {
        force: '1', limit: '15', afterId: String(batch.nextAfterId), maxId: String(batch.maxId)
      });
    }
    assert.deepEqual(seen, Array.from({ length: 33 }, (_, i) => i + 1));
    assert.equal(batch.remaining, 0);
    const empty = await generatePreviewBatch(db, render, { force: '1', afterId: '33', maxId: '33' });
    assert.equal(empty.total, 0);
    assert.equal(empty.hasMore, false);
  } finally { db.close(); }
});

test('preview batch validates input and keeps non-force selection limited to missing drafts', async () => {
  const db = fixture();
  try {
    for (const query of [{ limit: '-1' }, { limit: '0' }, { limit: '201' }, { afterId: '1x' }, { maxId: 'NaN' }]) {
      await assert.rejects(generatePreviewBatch(db, () => assert.fail('must not render'), query), /Invalid batch parameter/);
    }
    db.prepare('INSERT INTO products VALUES (?, ?, ?)').run(40, 'draft', null);
    const seen = [];
    const result = await generatePreviewBatch(db, async p => { seen.push(p.id); return 'ok.jpg'; });
    assert.deepEqual(seen, [40]);
    assert.equal(result.generated, 1);
  } finally { db.close(); }
});

test('Worker fails closed and never invokes AI for missing/incorrect keys', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../cf-worker/src/index.js'), 'utf8');
  const { default: worker } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  let calls = 0;
  const AI = { run: async () => { calls++; return { image: 'test-image' }; } };
  const request = key => new Request('https://worker.test/', {
    method: 'POST', headers: key ? { 'x-ng-key': key } : {}, body: JSON.stringify({ prompt: 'blank desk', width: 1200, height: 1800 })
  });
  assert.equal((await worker.fetch(request(), { AI })).status, 503);
  assert.equal((await worker.fetch(request(), { AI, SHARED_KEY: 'test-secret' })).status, 401);
  assert.equal((await worker.fetch(request('wrong'), { AI, SHARED_KEY: 'test-secret' })).status, 401);
  assert.equal(calls, 0);
  const health = await worker.fetch(new Request('https://worker.test/health'), { AI });
  assert.equal(health.status, 200);
  const success = await worker.fetch(request('test-secret'), { AI, SHARED_KEY: 'test-secret' });
  assert.equal(success.status, 200);
  assert.equal(calls, 1);
});

test('browser rebuild sends cursors, prevents double start, and reports HTTP failure honestly', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../client/js/rebuild.js'), 'utf8');
  const mod = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const urls = [], messages = [];
  let call = 0;
  const rebuild = mod.createCoverRebuild({
    apiBase: '/api',
    confirmFn: () => true,
    notify: (...args) => messages.push(args),
    fetch: async url => {
      urls.push(url);
      call++;
      if (call === 1) return { ok: true, json: async () => ({ generated: 5, failed: 0, remaining: 2, hasMore: true, nextAfterId: 5, maxId: 7 }) };
      return { ok: false, json: async () => ({ error: 'Unavailable' }) };
    }
  });
  await Promise.all([rebuild.regenerateAll(), rebuild.regenerateAll()]);
  assert.equal(urls.length, 2);
  assert.match(urls[1], /afterId=5&maxId=7/);
  assert.ok(messages.some(m => m[1] === 'Rebuild Stopped'));
  assert.ok(!messages.some(m => m[1] === 'Rebuild Complete'));
  assert.equal(rebuild.isRunning(), false);
});

test('Worker model allowlist: klein-4b default, per-request override, env default, rogue rejected', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../cf-worker/src/index.js'), 'utf8');
  const { default: worker } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const runs = [];
  const AI = { run: async (model, args) => { runs.push({ model, args }); return { image: 'img' }; } };
  const post = (body, extraEnv = {}) => worker.fetch(new Request('https://worker.test/', {
    method: 'POST', headers: { 'x-ng-key': 'k' }, body: JSON.stringify(body)
  }), { AI, SHARED_KEY: 'k', ...extraEnv });
  let res = await post({ prompt: 'p', width: 1200, height: 1800 });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).model, '@cf/black-forest-labs/flux-2-klein-4b');
  res = await post({ prompt: 'p', width: 1200, height: 1800, model: '@cf/black-forest-labs/flux-2-klein-9b' });
  assert.equal((await res.json()).model, '@cf/black-forest-labs/flux-2-klein-9b');
  res = await post({ prompt: 'p', width: 1200, height: 1800 }, { COVER_MODEL: '@cf/leonardo/lucid-origin' });
  assert.equal((await res.json()).model, '@cf/leonardo/lucid-origin');
  const before = runs.length;
  res = await post({ prompt: 'p', width: 1200, height: 1800, model: '@cf/some/rogue-model' });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.match(body.error, /model not allowed/);
  assert.equal(body.allowed.length, 4);
  assert.equal(runs.length, before);
  // per-model generation params reach AI.run (schnell is a 4-step model)
  await post({ prompt: 'p', width: 1200, height: 1800, model: '@cf/black-forest-labs/flux-1-schnell' });
  const schnell = runs.find(r => r.model === '@cf/black-forest-labs/flux-1-schnell');
  assert.equal(schnell.args.num_steps, 4);
});

test('Worker maps Cloudflare quota exhaustion to 429 instead of opaque 502', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../cf-worker/src/index.js'), 'utf8');
  const { default: worker } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const env = { AI: { run: async () => { throw new Error('4006: you have used up your daily free allocation of 10,000 neurons, please upgrade'); } }, SHARED_KEY: 'k' };
  const res = await worker.fetch(new Request('https://worker.test/', {
    method: 'POST', headers: { 'x-ng-key': 'k' }, body: JSON.stringify({ prompt: 'p', width: 1200, height: 1800 })
  }), env);
  assert.equal(res.status, 429);
  assert.equal((await res.json()).error, 'quota_exhausted');
  const env2 = { AI: { run: async () => { throw new Error('worker CPU time exceeded'); } }, SHARED_KEY: 'k' };
  const res2 = await worker.fetch(new Request('https://worker.test/', {
    method: 'POST', headers: { 'x-ng-key': 'k' }, body: JSON.stringify({ prompt: 'p', width: 1200, height: 1800 })
  }), env2);
  assert.equal(res2.status, 502);
});

test('coverArt model classes: mapping, env override, allowlist guard, request model field', () => {
  const coverArt = require('../server/services/coverArt');
  for (const k of ['COVER_MODEL_STANDARD', 'COVER_MODEL_DRAFT', 'COVER_MODEL_HERO']) delete process.env[k];
  assert.equal(coverArt.resolveCoverModel('standard'), '@cf/black-forest-labs/flux-2-klein-4b');
  assert.equal(coverArt.resolveCoverModel('draft'), '@cf/black-forest-labs/flux-1-schnell');
  assert.equal(coverArt.resolveCoverModel('hero'), '@cf/black-forest-labs/flux-2-klein-9b');
  assert.equal(coverArt.resolveCoverModel('nonsense-class'), '@cf/black-forest-labs/flux-2-klein-4b');
  process.env.COVER_MODEL_STANDARD = '@cf/leonardo/lucid-origin';
  assert.equal(coverArt.resolveCoverModel('standard'), '@cf/leonardo/lucid-origin');
  process.env.COVER_MODEL_STANDARD = '@cf/rogue/model';
  assert.equal(coverArt.resolveCoverModel('standard'), '@cf/black-forest-labs/flux-2-klein-4b');
  delete process.env.COVER_MODEL_STANDARD;
  const withModel = JSON.parse(coverArt.workerRequestBody('p', undefined, '@cf/black-forest-labs/flux-2-klein-9b'));
  assert.equal(withModel.model, '@cf/black-forest-labs/flux-2-klein-9b');
  assert.equal(withModel.width, 1200);
  assert.equal(withModel.height, 1800);
  assert.ok(!('model' in JSON.parse(coverArt.workerRequestBody('p'))));
});

test('coverArt classifies provider errors for honest per-item reporting', () => {
  const coverArt = require('../server/services/coverArt');
  assert.equal(coverArt.classifyCoverError(new Error('4006: you have used up your daily free allocation of 10,000 neurons')), 'quota_exhausted');
  assert.equal(coverArt.classifyCoverError(new Error('Request failed with status code 403')), 'auth_error');
  assert.equal(coverArt.classifyCoverError(new Error('timeout of 180000ms exceeded')), 'timeout');
  assert.equal(coverArt.classifyCoverError(new Error('model returned no image')), 'upstream_error');
});
