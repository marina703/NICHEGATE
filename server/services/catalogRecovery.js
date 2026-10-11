/**
 * CATALOG RECOVERY & SAFE WIPE ENGINE
 *
 * Implements safe catalog wipe with an automatic 30-minute undo snapshot:
 * 1. Backs up SQLite database to disk (VACUUM INTO ...).
 * 2. Copies all existing products into a snapshot recovery table with expiration.
 * 3. Wipes the products table cleanly and resets associated queues.
 * 4. Re-seeds clean flagship tools so the shop starts with a fresh baseline.
 * 5. Provides an idempotent restore() function active during the restore window.
 */

const fs = require('fs');
const path = require('path');
const { db } = require('../database');
const runtimeConfig = require('./runtimeConfig');

const DEFAULT_RESTORE_WINDOW_MINUTES = 30;

function ensureRecoveryTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS catalog_recovery_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      item_count INTEGER NOT NULL,
      backup_path TEXT,
      products_payload TEXT NOT NULL,
      restored_at DATETIME
    );
  `);
}

function backupDatabase() {
  const dir = runtimeConfig.resolvePersistentDir('backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(dir, `profession-box-prewipe-${stamp}.db`);
  const safe = dest.replace(/\\/g, '/').replace(/'/g, "''");
  try {
    db.exec(`VACUUM INTO '${safe}'`);
    return { path: dest, bytes: fs.statSync(dest).size };
  } catch (err) {
    // If VACUUM INTO fails (e.g. in-memory or already exists), record warning and continue
    return { path: null, error: err.message };
  }
}

/**
 * Wipe all products cleanly after creating a durable snapshot with a 30-minute restore window.
 */
function wipeCatalog({ restoreWindowMinutes = DEFAULT_RESTORE_WINDOW_MINUTES, reseedFlagship = false } = {}) {
  ensureRecoveryTable();

  // 1. Fetch current products
  const currentProducts = db.prepare('SELECT * FROM products').all();
  const itemCount = currentProducts.length;

  // 2. Perform disk backup
  const backup = backupDatabase();

  // 3. Save snapshot to recovery table with expiration timestamp
  const now = Date.now();
  const expiresAt = new Date(now + restoreWindowMinutes * 60 * 1000).toISOString();
  const insSnapshot = db.prepare(`
    INSERT INTO catalog_recovery_snapshots (expires_at, item_count, backup_path, products_payload)
    VALUES (?, ?, ?, ?)
  `);
  const snapshotResult = insSnapshot.run(
    expiresAt,
    itemCount,
    backup.path || null,
    JSON.stringify(currentProducts)
  );
  const snapshotId = snapshotResult.lastInsertRowid;

  // 4. Wipe products table and reset auto-sequence
  db.exec('DELETE FROM products;');
  try {
    db.prepare("DELETE FROM sqlite_sequence WHERE name = 'products'").run();
  } catch (_) {}

  // 5. Clean up ephemeral review, pins, and publish error logs
  try {
    db.prepare("DELETE FROM automation_log WHERE action IN ('publish_error', 'gumroad_quota', 'review_day', 'catalog_wipe')").run();
  } catch (_) {}
  try {
    db.prepare("DELETE FROM pins WHERE status = 'scheduled'").run();
  } catch (_) {}

  // 6. Reseed only if explicitly requested (defaults to false for pure clean slate)
  let seededCount = 0;
  if (reseedFlagship) {
    try {
      const toolStudio = require('./toolStudio');
      const prof = toolStudio.ensureToolProfession();
      const ids = toolStudio.createToolProducts(prof);
      seededCount = ids.length;
    } catch (e) {
      console.error('[CATALOG_RECOVERY] flagship reseed warning:', e.message);
    }
  }

  // Record audit log
  try {
    db.prepare('INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)')
      .run('catalog_wipe', `Wiped ${itemCount} products with 30-min restore window (snapshot #${snapshotId}); catalog empty and clean`, 'warning');
  } catch (_) {}

  return {
    ok: true,
    wipedCount: itemCount,
    snapshotId: Number(snapshotId),
    expiresAt,
    restoreWindowMinutes,
    backupPath: backup.path || null,
    reseededCount: seededCount
  };
}

/**
 * Check whether a valid restore snapshot is available.
 */
function getActiveSnapshot() {
  ensureRecoveryTable();
  const nowIso = new Date().toISOString();
  const snapshot = db.prepare(`
    SELECT * FROM catalog_recovery_snapshots
    WHERE restored_at IS NULL AND expires_at > ?
    ORDER BY id DESC LIMIT 1
  `).get(nowIso);

  if (!snapshot) return null;
  const remainingMinutes = Math.max(0, Math.round((new Date(snapshot.expires_at).getTime() - Date.now()) / (60 * 1000)));

  return {
    id: snapshot.id,
    itemCount: snapshot.item_count,
    createdAt: snapshot.created_at,
    expiresAt: snapshot.expires_at,
    remainingMinutes,
    backupPath: snapshot.backup_path
  };
}

/**
 * Restore products from the active snapshot.
 */
function restoreCatalog(snapshotId = null) {
  ensureRecoveryTable();
  const nowIso = new Date().toISOString();

  let snapshot;
  if (snapshotId) {
    snapshot = db.prepare(`
      SELECT * FROM catalog_recovery_snapshots
      WHERE id = ? AND expires_at > ?
    `).get(snapshotId, nowIso);
  } else {
    snapshot = db.prepare(`
      SELECT * FROM catalog_recovery_snapshots
      WHERE restored_at IS NULL AND expires_at > ?
      ORDER BY id DESC LIMIT 1
    `).get(nowIso);
  }

  if (!snapshot) {
    return { ok: false, error: 'No active restore snapshot found (or snapshot has expired after 30 minutes).' };
  }

  const products = JSON.parse(snapshot.products_payload || '[]');

  // Clear currently seeded products to restore exact pre-wipe state
  db.exec('DELETE FROM products;');

  // Re-insert every product with its original ID and fields
  const insertStmt = db.prepare(`
    INSERT INTO products (
      id, profession_id, name, type, price, status, theme,
      html_content, file_path, preview_path, marketplace_id, marketplace,
      created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?
    )
  `);

  db.exec('BEGIN IMMEDIATE TRANSACTION;');
  try {
    for (const p of products) {
      insertStmt.run(
        p.id,
        p.profession_id,
        p.name,
        p.type,
        p.price || '$12',
        p.status || 'draft',
        p.theme || null,
        p.html_content || null,
        p.file_path || null,
        p.preview_path || null,
        p.marketplace_id || null,
        p.marketplace || null,
        p.created_at || new Date().toISOString(),
        p.updated_at || new Date().toISOString()
      );
    }
    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  // Mark snapshot restored
  db.prepare('UPDATE catalog_recovery_snapshots SET restored_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(snapshot.id);

  // Record audit log
  try {
    db.prepare('INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)')
      .run('catalog_restore', `Restored ${products.length} products from snapshot #${snapshot.id}`, 'success');
  } catch (_) {}

  return {
    ok: true,
    restoredCount: products.length,
    snapshotId: snapshot.id,
    restoredAt: new Date().toISOString()
  };
}

module.exports = {
  wipeCatalog,
  restoreCatalog,
  getActiveSnapshot,
  ensureRecoveryTable
};
