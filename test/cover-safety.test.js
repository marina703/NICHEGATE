const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
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
    method: 'POST', headers: key ? { 'x-ng-key': key } : {}, body: JSON.stringify({ prompt: 'blank desk' })
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
  const html = fs.readFileSync(path.join(__dirname, '../client/index.html'), 'utf8');
  const code = html.slice(html.indexOf('let coverRebuildRunning'), html.indexOf('async function approveProduct'));
  const urls = [], messages = [];
  let call = 0;
  const context = vm.createContext({ URLSearchParams, confirm: () => true,
    state: { currentPanel: '' }, refreshStats() {}, openPanel() {},
    showToast: (...args) => messages.push(args),
    API: '/api', fetch: async url => {
      urls.push(url);
      call++;
      if (call === 1) return { ok: true, json: async () => ({ generated: 5, failed: 0, remaining: 2, hasMore: true, nextAfterId: 5, maxId: 7 }) };
      return { ok: false, json: async () => ({ error: 'Unavailable' }) };
    }
  });
  vm.runInContext(code, context);
  await vm.runInContext('Promise.all([regenerateAll(), regenerateAll()])', context);
  assert.equal(urls.length, 2);
  assert.match(urls[1], /afterId=5&maxId=7/);
  assert.ok(messages.some(m => m[1] === 'Rebuild Stopped'));
  assert.ok(!messages.some(m => m[1] === 'Rebuild Complete'));
  assert.equal(vm.runInContext('coverRebuildRunning', context), false);
});
