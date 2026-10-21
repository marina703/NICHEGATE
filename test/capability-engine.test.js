const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Hermetic DB so this suite never touches production rows.
if (!process.env.DB_PATH) {
  process.env.DB_PATH = path.join(os.tmpdir(), `nichegate-capability-${process.pid}.db`);
}
const DB_PATH = process.env.DB_PATH;
const previousNodeEnv = process.env.NODE_ENV;
const previousRailway = process.env.RAILWAY_ENVIRONMENT;
process.env.NODE_ENV = 'test';
delete process.env.RAILWAY_ENVIRONMENT;

const { db, init } = require('../server/database');
const cap = require('../server/services/capabilityEngine');

init();
function clear() {
  db.prepare('DELETE FROM product_types_dynamic').run();
  db.prepare('DELETE FROM capability_requests').run();
}

test('validateTypeSpec accepts a well-formed spec', () => {
  const v = cap.validateTypeSpec({
    key: 'permit-checklist', label: 'Permit Checklist', format: 'pdf',
    buyer: 'business', price: 12, cats: ['business', 'home']
  });
  assert.equal(v.ok, true);
  assert.equal(v.clean.key, 'permit-checklist');
  assert.equal(v.clean.format, 'pdf');
  assert.deepEqual(v.clean.cats, ['business', 'home']);
});

test('validateTypeSpec rejects unsupported formats (the "no tooling" case)', () => {
  const v = cap.validateTypeSpec({ key: 'video-course', label: 'Video Course', format: 'mp4', price: 20 });
  assert.equal(v.ok, false);
  assert.match(v.error, /not supported/);
});

test('validateTypeSpec rejects bad keys and missing fields', () => {
  assert.equal(cap.validateTypeSpec({ key: 'X', label: 'X', format: 'pdf', price: 5 }).ok, false, 'too short');
  assert.equal(cap.validateTypeSpec({ key: '123bad', label: 'X', format: 'pdf', price: 5 }).ok, false, 'starts with digit');
  assert.equal(cap.validateTypeSpec({ key: '', label: 'X', format: 'pdf', price: 5 }).ok, false, 'empty');
  assert.equal(cap.validateTypeSpec({ key: 'ok-key', label: '', format: 'pdf', price: 5 }).ok, false, 'no label');
  assert.equal(cap.validateTypeSpec({ key: 'ok-key', label: 'X', format: 'pdf', price: 0 }).ok, false, 'bad price');
  assert.equal(cap.validateTypeSpec(null).ok, false, 'null spec');
  // 'has spaces' is normalized to a valid kebab key rather than rejected.
  const norm = cap.validateTypeSpec({ key: 'has spaces', label: 'X', format: 'pdf', price: 5 });
  assert.equal(norm.ok, true);
  assert.equal(norm.clean.key, 'has-spaces');
});

test('registerType stores a dynamic type and getAllTypes merges it', () => {
  clear();
  const before = cap.getAllTypes().length;
  const r = cap.registerType({ key: 'permit-checklist', label: 'Permit Checklist', format: 'pdf', price: 12, buyer: 'business' }, 'test');
  assert.equal(r.ok, true);
  assert.equal(r.alreadyExisted, false);
  const after = cap.getAllTypes();
  assert.equal(after.length, before + 1);
  const dyn = after.find(t => t.key === 'permit-checklist');
  assert.equal(dyn.source, 'dynamic');
  assert.equal(dyn.label, 'Permit Checklist');
  clear();
});

test('registerType is idempotent and updates an existing dynamic type', () => {
  clear();
  cap.registerType({ key: 'repeat-type', label: 'First', format: 'pdf', price: 10, buyer: 'business' }, 'test');
  const second = cap.registerType({ key: 'repeat-type', label: 'Second', format: 'pdf', price: 15, buyer: 'business' }, 'test');
  assert.equal(second.alreadyExisted, true);
  const t = cap.getType('repeat-type');
  assert.equal(t.label, 'Second');
  assert.equal(t.price, 15);
  clear();
});

test('requestCapability records a request and reports delivery', async () => {
  clear();
  const r = await cap.requestCapability({
    kind: 'integration', title: 'Need Etsy API access', detail: 'To auto-list products',
    needed: 'Etsy OAuth token', notify: async () => true
  });
  assert.equal(r.ok, true);
  assert.equal(r.delivered, true);
  const list = cap.listCapabilityRequests({ status: 'open' });
  assert.equal(list.length, 1);
  assert.equal(list[0].title, 'Need Etsy API access');
  assert.equal(list[0].notified, 1);
  clear();
});

test('requestCapability keeps the request even when delivery fails', async () => {
  clear();
  const r = await cap.requestCapability({ kind: 'type', title: 'Need video builder', notify: async () => false });
  assert.equal(r.ok, true);
  assert.equal(r.delivered, false);
  const list = cap.listCapabilityRequests({ status: 'open' });
  assert.equal(list.length, 1, 'request preserved even if the ping failed');
  assert.equal(list[0].notified, 0);
  clear();
});

test('approving a capability request with a type proposal registers that type', async () => {
  clear();
  const r = await cap.requestCapability({
    kind: 'type', title: 'Add a permit checklist type',
    proposal: { type: { key: 'via-request', label: 'Via Request', format: 'pdf', price: 11, buyer: 'business' } },
    notify: async () => true
  });
  assert.equal(r.ok, true);
  const approved = cap.approveCapabilityRequest(r.id, 'test');
  assert.equal(approved.ok, true);
  assert.equal(approved.request.status, 'approved');
  assert.ok(cap.getType('via-request'), 'proposed type registered on approval');
  clear();
});

test('rejecting a capability request marks it rejected and registers nothing', async () => {
  clear();
  const r = await cap.requestCapability({ kind: 'tool', title: 'Need a thing', notify: async () => true });
  const rej = cap.rejectCapabilityRequest(r.id, 'test');
  assert.equal(rej.ok, true);
  assert.equal(rej.request.status, 'rejected');
  assert.equal(cap.getType('need-a-thing'), null);
  clear();
});

test('approve/reject reject an already-resolved request', async () => {
  clear();
  const r = await cap.requestCapability({ kind: 'other', title: 'X', notify: async () => true });
  cap.rejectCapabilityRequest(r.id, 'test');
  const again = cap.approveCapabilityRequest(r.id, 'test');
  assert.equal(again.ok, false);
  assert.match(again.error, /not open/);
  clear();
});

test('cleanup', () => {
  clear();
  db.close();
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
  if (previousRailway === undefined) delete process.env.RAILWAY_ENVIRONMENT; else process.env.RAILWAY_ENVIRONMENT = previousRailway;
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.rmSync(DB_PATH + suffix, { force: true }); } catch {}
  }
  assert.ok(true);
});
