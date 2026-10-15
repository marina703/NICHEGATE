// ═══════════════════════════════════════════════════════════════════════════
// VOLUME JANITOR — bounded retention for the Railway persistent volume.
//
// On Railway the app resolves previews/, generated/ and covers/{ai,templates,
// heroes}/ under RAILWAY_VOLUME_MOUNT_PATH (/app/data). Under 24/7 autonomous
// operation these grow without bound (every cover rebuild writes a new raster,
// every product file a new timestamped PDF/XLSX) and eventually fill the
// volume — a runtime failure distinct from the build-context "out of space".
//
// Strategy (conservative — never break an active listing):
//   • CACHE dirs (previews/, covers/ai/, covers/templates/, covers/heroes/) are
//     regenerated on demand (ensureProductThumbnail / ensureCoverArt rebuild
//     when the file is missing), so prune strictly by AGE.
//   • generated/ holds real deliverables referenced by products.file_path — the
//     "no listing without a real file" rule. Prune ONLY orphans: files older
//     than the retention window that no product references.
//   • After pruning previews/, clear any products.preview_path that now points
//     at a missing file so the app regenerates it on next access.
//
// Everything is bounded (max files scanned per pass) and defaults to dryRun so
// the first invocation can be reviewed before anything is deleted.
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const { db } = require('../database');
const runtimeConfig = require('./runtimeConfig');

// Directories that are pure caches and safe to prune by age alone.
const CACHE_DIRS = ['previews', 'covers/ai', 'covers/templates', 'covers/heroes'];

const DEFAULTS = {
  retentionDays: Number(process.env.VOLUME_RETENTION_DAYS) || 30,
  dryRun: true,
  maxScan: 20000, // hard cap on files examined per pass so a full volume can't stall the cron
};

function resolveDir(name) {
  try { return runtimeConfig.resolvePersistentDir(name); } catch { return null; }
}

function ageDays(filePath, now) {
  try { return (now - fs.statSync(filePath).mtimeMs) / 86400000; } catch { return 0; }
}

/** Collect every file_path the products table still references (the do-not-delete set). */
function referencedDeliverables() {
  const set = new Set();
  try {
    const rows = db.prepare('SELECT file_path FROM products WHERE file_path IS NOT NULL AND file_path != ?').all('');
    for (const r of rows) set.add(path.resolve(r.file_path));
  } catch { /* table/column edge cases — treat nothing as referenced */ }
  return set;
}

/** Prune files in one dir older than `olderThanDays`. Returns { scanned, deleted, freedBytes }. */
function pruneDir(dir, olderThanDays, now, opts) {
  const stat = { scanned: 0, deleted: 0, freedBytes: 0 };
  if (!dir || !fs.existsSync(dir)) return stat;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return stat; }
  for (const ent of entries) {
    if (stat.scanned >= opts.maxScan) break;
    const full = path.join(dir, ent.name);
    let isFile = ent.isFile();
    if (ent.isDirectory()) continue; // top-level only; caches are flat files
    if (!isFile) continue;
    stat.scanned++;
    if (ageDays(full, now) < olderThanDays) continue;
    let size = 0;
    try { size = fs.statSync(full).size; } catch { /* ignore */ }
    if (opts.dryRun) { stat.deleted++; stat.freedBytes += size; continue; }
    try { fs.unlinkSync(full); stat.deleted++; stat.freedBytes += size; } catch { /* keep going */ }
  }
  return stat;
}

/** Delete generated/ orphans: older than the window AND not referenced by any product. */
function pruneGenerated(olderThanDays, now, opts, referenced) {
  const dir = resolveDir('generated');
  const stat = { scanned: 0, deleted: 0, freedBytes: 0, skippedReferenced: 0 };
  if (!dir || !fs.existsSync(dir)) return stat;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return stat; }
  for (const ent of entries) {
    if (stat.scanned >= opts.maxScan) break;
    if (!ent.isFile()) continue;
    const full = path.join(dir, ent.name);
    stat.scanned++;
    if (referenced.has(path.resolve(full))) { stat.skippedReferenced++; continue; }
    if (ageDays(full, now) < olderThanDays) continue;
    let size = 0;
    try { size = fs.statSync(full).size; } catch { /* ignore */ }
    if (opts.dryRun) { stat.deleted++; stat.freedBytes += size; continue; }
    try { fs.unlinkSync(full); stat.deleted++; stat.freedBytes += size; } catch { /* keep going */ }
  }
  return stat;
}

/** Clear preview_path for products whose cover file no longer exists on disk. */
function clearStalePreviewPaths(opts) {
  let cleared = 0;
  try {
    const rows = db.prepare('SELECT id, preview_path FROM products WHERE preview_path IS NOT NULL AND preview_path != ?').all('');
    const upd = db.prepare('UPDATE products SET preview_path = NULL WHERE id = ?');
    for (const r of rows) {
      if (!fs.existsSync(r.preview_path)) {
        if (!opts.dryRun) upd.run(r.id);
        cleared++;
      }
    }
  } catch { /* best-effort */ }
  return cleared;
}

/**
 * Run one bounded retention pass.
 * @param {object} [o] { retentionDays, dryRun, maxScan }
 * @returns {object} per-dir stats + totals + what would be/was freed (MB).
 */
function prune(o = {}) {
  const opts = { ...DEFAULTS, ...o };
  const now = Date.now();
  const referenced = referencedDeliverables();
  const result = { dryRun: opts.dryRun, retentionDays: opts.retentionDays, dirs: {}, generated: null, stalePreviewPathsCleared: 0 };

  for (const name of CACHE_DIRS) {
    const dir = resolveDir(name);
    result.dirs[name] = pruneDir(dir, opts.retentionDays, now, opts);
  }
  result.generated = pruneGenerated(opts.retentionDays, now, opts, referenced);
  result.stalePreviewPathsCleared = clearStalePreviewPaths(opts);

  let deleted = 0, freedBytes = 0;
  for (const k of Object.keys(result.dirs)) { deleted += result.dirs[k].deleted; freedBytes += result.dirs[k].freedBytes; }
  deleted += result.generated.deleted; freedBytes += result.generated.freedBytes;
  result.totals = { deleted, freedMB: Number((freedBytes / 1048576).toFixed(1)) };
  return result;
}

module.exports = { prune, CACHE_DIRS, DEFAULTS };
