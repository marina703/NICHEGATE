// Hermetic quality-gate coverage: QUALITY_AUTO_APPROVE opt-in behavior,
// FLIGHT_READY auto-approval, manual-product exclusion, and log auditing.
// Follows the same throwaway-DB pattern as automation-generation.test.js.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ownsDbPath = !process.env.DB_PATH;
if (ownsDbPath) {
  process.env.DB_PATH = path.join(os.tmpdir(), `nichegate-quality-${process.pid}.db`);
}
const DB_PATH = process.env.DB_PATH;
const previousNodeEnv = process.env.NODE_ENV;
const previousRailway = process.env.RAILWAY_ENVIRONMENT;
const previousOptIn = process.env.QUALITY_AUTO_APPROVE;
process.env.NODE_ENV = 'test';
delete process.env.RAILWAY_ENVIRONMENT;

const { db, init } = require('../server/database');
const automationCycle = require('../server/services/automationCycle');

init();
db.prepare('DELETE FROM products').run();
db.prepare('DELETE FROM professions').run();
db.prepare('DELETE FROM automation_log').run();
const professionId = Number(db.prepare(
  "INSERT INTO professions (name, slug, status) VALUES ('Quality Fixture', 'quality-fixture', 'active')"
).run().lastInsertRowid);

// A FLIGHT_READY product: real on-disk file, structured HTML content, valid
// title length, price above floor, no placeholder tokens. qualityEngine
// requires a file > 500 bytes with a valid extension and the content checks
// need markup + length. Build one from a real temp file.
const deliverable = path.join(os.tmpdir(), `nichegate-quality-${process.pid}.pdf`);
fs.writeFileSync(deliverable, Buffer.alloc(2048, 0x25)); // 2KB of '%' — non-empty PDF-ish payload
const readyName = 'HVAC Short-Cycle Diagnostic Checklist for Split Systems';
const html = '<h1>' + readyName + '</h1><table><tr><td>Verify refrigerant charge against the manufacturer subcooling chart before condemning the compressor.</td></tr></table>' + '<p>Trade-true content.'.repeat(40) + '</p>';

const readyId = Number(db.prepare(
  'INSERT INTO products (profession_id, name, type, price, status, file_path, html_content) VALUES (?, ?, ?, ?, ?, ?, ?)'
).run(professionId, readyName, 'checklist', '$14', 'draft', deliverable, html).lastInsertRowid);

// A GROUNDED product: no file, placeholder tokens → far below the 85 bar.
const groundedId = Number(db.prepare(
  'INSERT INTO products (profession_id, name, type, price, status, html_content) VALUES (?, ?, ?, ?, ?, ?)'
).run(professionId, 'Short', 'checklist', '$0', 'draft', '<div>lorem ipsum [Insert Name]</div>').lastInsertRowid);

// A manual product that is otherwise flight-ready — must NEVER auto-approve.
const manualId = Number(db.prepare(
  'INSERT INTO products (profession_id, name, type, price, status, file_path, html_content, origin) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
).run(professionId, readyName + ' Manual', 'checklist', '$14', 'draft', deliverable, html, 'manual').lastInsertRowid);

test('quality gate is a no-op without the opt-in', () => {
  delete process.env.QUALITY_AUTO_APPROVE;
  const ctx = automationCycle.taskQualityGate({});
  assert.equal(ctx.qualityAutoApprove, false);
  assert.equal(db.prepare('SELECT status FROM products WHERE id = ?').get(readyId).status, 'draft');
  assert.equal(db.prepare('SELECT status FROM products WHERE id = ?').get(manualId).status, 'draft');
});

test('quality gate auto-approves flight-ready drafts and holds grounded ones', () => {
  process.env.QUALITY_AUTO_APPROVE = 'true';
  const ctx = automationCycle.taskQualityGate({});
  assert.equal(ctx.qualityAutoApprove, true);
  assert.equal(ctx.qualityApproved, 1);
  assert.equal(ctx.qualityGrounded >= 1, true);
  assert.equal(db.prepare('SELECT status FROM products WHERE id = ?').get(readyId).status, 'approved');
  assert.equal(db.prepare('SELECT status FROM products WHERE id = ?').get(groundedId).status, 'draft');
  // Manual products are never auto-approved even when flight-ready.
  assert.equal(db.prepare('SELECT status FROM products WHERE id = ?').get(manualId).status, 'draft');
  // The approval is auditable.
  const log = db.prepare("SELECT details FROM automation_log WHERE action = 'quality_auto_approve' AND product_id = ?").get(readyId);
  assert.match(log.details, /FLIGHT_READY \d+\/100/);
});

test('quality gate only audits drafts once approved products are out of scope', () => {
  process.env.QUALITY_AUTO_APPROVE = 'true';
  const ctx = automationCycle.taskQualityGate({});
  // readyId is now approved — a second pass finds nothing new to approve.
  assert.equal(ctx.qualityApproved, 0);
  assert.equal(db.prepare('SELECT status FROM products WHERE id = ?').get(readyId).status, 'approved');
});

after(() => {
  try { fs.rmSync(deliverable, { force: true }); } catch {}
  if (previousOptIn === undefined) delete process.env.QUALITY_AUTO_APPROVE;
  else process.env.QUALITY_AUTO_APPROVE = previousOptIn;
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousNodeEnv;
  if (previousRailway === undefined) delete process.env.RAILWAY_ENVIRONMENT;
  else process.env.RAILWAY_ENVIRONMENT = previousRailway;
  db.close();
  if (ownsDbPath) {
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.rmSync(DB_PATH + suffix, { force: true }); } catch {}
    }
  }
});
