const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const recovery = require('../server/services/catalogRecovery');

test('catalogRecovery: wipeCatalog snapshots items and re-seeds clean baseline', () => {
  const db = require('../server/database').db;
  recovery.ensureRecoveryTable();

  // Insert two test dummy products
  db.prepare(`
    INSERT INTO products (profession_id, name, type, price, status)
    VALUES (28, 'Pre-wipe Test Item 1', 'tool', '$19', 'approved'),
           (28, 'Pre-wipe Test Item 2', 'tool', '$15', 'approved')
  `).run();

  const countBefore = db.prepare('SELECT COUNT(*) as c FROM products').get().c;
  assert.ok(countBefore >= 2);

  // Run wipeCatalog with 30-minute window
  const wipeResult = recovery.wipeCatalog({ restoreWindowMinutes: 30, reseedFlagship: true });
  assert.ok(wipeResult.ok);
  assert.equal(wipeResult.wipedCount, countBefore);
  assert.ok(wipeResult.snapshotId > 0);
  assert.equal(wipeResult.restoreWindowMinutes, 30);

  // Check active snapshot is available
  const activeSnap = recovery.getActiveSnapshot();
  assert.ok(activeSnap);
  assert.equal(activeSnap.id, wipeResult.snapshotId);
  assert.equal(activeSnap.itemCount, countBefore);
  assert.ok(activeSnap.remainingMinutes <= 30 && activeSnap.remainingMinutes >= 28);

  // Products table now contains only the fresh flagship seeds (5 tools)
  const countAfterWipe = db.prepare('SELECT COUNT(*) as c FROM products').get().c;
  assert.equal(countAfterWipe, wipeResult.reseededCount);

  // Run restoreCatalog
  const restoreResult = recovery.restoreCatalog(wipeResult.snapshotId);
  assert.ok(restoreResult.ok);
  assert.equal(restoreResult.restoredCount, countBefore);

  // Products table restored back to original count
  const countRestored = db.prepare('SELECT COUNT(*) as c FROM products').get().c;
  assert.equal(countRestored, countBefore);

  // Active snapshot should now be marked restored (none pending)
  const activeAfterRestore = recovery.getActiveSnapshot();
  assert.equal(activeAfterRestore, null);

  // Cleanup the test items
  db.prepare("DELETE FROM products WHERE name LIKE 'Pre-wipe Test Item%'").run();
});

test('catalogRecovery: restoreCatalog rejects expired snapshots', () => {
  const db = require('../server/database').db;
  recovery.ensureRecoveryTable();

  // Create an expired snapshot manually
  const expiredPastIso = new Date(Date.now() - 35 * 60 * 1000).toISOString();
  const info = db.prepare(`
    INSERT INTO catalog_recovery_snapshots (expires_at, item_count, products_payload)
    VALUES (?, ?, ?)
  `).run(expiredPastIso, 1, JSON.stringify([{ id: 9999, name: 'Expired', type: 'tool', profession_id: 28 }]));

  const res = recovery.restoreCatalog(info.lastInsertRowid);
  assert.equal(res.ok, false);
  assert.match(res.error, /expired/i);

  // Clean test record
  db.prepare('DELETE FROM catalog_recovery_snapshots WHERE id = ?').run(info.lastInsertRowid);
});
