// ═══════════════════════════════════════════════════════════════════════════
// PRE-BOOT SPACE RECLAIM — runs BEFORE the database opens.
//
// On Railway the persistent volume (/app/data) holds the SQLite DB plus every
// runtime cache the app writes (previews/, generated/, covers/{ai,templates,
// heroes}/). Under 24/7 operation these grow unbounded; when the volume fills,
// SQLite fails to open with "database or disk is full" (SQLITE_FULL) and the
// app crashes on startup — before the daily volume-janitor cron ever runs.
//
// This module breaks that death spiral: it is called at the very top of the DB
// open path, measures free space on the volume, and if it is critically low it
// reclaims room by deleting the REGENERABLE caches (never the DB, never a
// deliverable a product references). Those caches rebuild on demand, so
// deleting them is safe and lets the DB open so the app can boot and heal.
//
// Safety:
//   • Only ever deletes files under the resolved previews/covers cache dirs.
//   • Never touches the DB, the volume root, or generated/ deliverables.
//   • Conservative thresholds: only acts when free space is truly critical, and
//     deletes oldest-first, stopping as soon as the target headroom is reached.
//   • Fully wrapped — a reclaim failure logs and continues; it never blocks boot.
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const runtimeConfig = require('./runtimeConfig');

// Reclaimable cache dirs, safest first. Each regenerates on demand:
//   covers/ai      — AI cover backgrounds (ensureCoverArt rebuilds if missing)
//   covers/heroes  — hero images (ensureHeroArt rebuilds)
//   covers/templates — cover composites (renderCover rebuilds)
//   previews       — cover thumbnails (ensureProductThumbnail rebuilds)
// generated/ is intentionally EXCLUDED — those are real deliverables referenced
// by products.file_path; the "no listing without a real file" rule protects them.
const CACHE_DIRS = ['covers/ai', 'covers/heroes', 'covers/templates', 'previews'];

// Act only when free space is below this many bytes (default 256MB). The DB,
// WAL, and a single new cover need far less than this, so 256MB of headroom is
// a safe floor that still avoids unnecessary deletion on healthy volumes.
const CRITICAL_FREE_BYTES = (Number(process.env.VOLUME_CRITICAL_FREE_MB) || 256) * 1048576;
// Stop deleting once free space rises above this (default 1GB) so we don't
// over-purge when a little reclaim is enough.
const TARGET_FREE_BYTES = (Number(process.env.VOLUME_TARGET_FREE_MB) || 1024) * 1048576;

function freeBytesOn(mountPath) {
  try {
    const stat = fs.statfsSync(mountPath);
    return stat.bavail * stat.bsize;
  } catch {
    return null;
  }
}

/** Oldest-first file list for one dir, capped so a huge cache can't stall boot. */
function oldestFiles(dir, cap = 4000) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  const files = [];
  for (const ent of entries) {
    if (!ent.isFile()) continue;
    const full = path.join(dir, ent.name);
    let mtime = 0;
    try { mtime = fs.statSync(full).mtimeMs; } catch { continue; }
    files.push({ full, mtime });
    if (files.length >= cap) break;
  }
  files.sort((a, b) => a.mtime - b.mtime);
  return files;
}

/**
 * Ensure enough free space for SQLite to open. Call immediately before opening
 * the DB. Returns { acted, freedMB, freeMB, reason } — never throws.
 */
function ensureBootHeadroom() {
  const out = { acted: false, freedMB: 0, freeMB: null, reason: null };
  let mount;
  try { mount = runtimeConfig.resolvePersistentDir(''); } catch { return out; }
  const before = freeBytesOn(mount);
  if (before == null) return out; // can't measure — don't guess
  out.freeMB = Number((before / 1048576).toFixed(0));
  if (before >= CRITICAL_FREE_BYTES) return out; // healthy — nothing to do

  out.reason = `free ${out.freeMB}MB < critical ${(CRITICAL_FREE_BYTES / 1048576) | 0}MB — reclaiming caches`;
  console.warn('[BOOT]', out.reason);

  let freed = 0;
  for (const name of CACHE_DIRS) {
    let dir;
    try { dir = runtimeConfig.resolvePersistentDir(name); } catch { continue; }
    if (!dir || !fs.existsSync(dir)) continue;
    for (const { full } of oldestFiles(dir)) {
      // Stop as soon as we've cleared the target headroom.
      if (before + freed >= TARGET_FREE_BYTES) break;
      let size = 0;
      try { size = fs.statSync(full).size; } catch { continue; }
      try { fs.unlinkSync(full); freed += size; } catch { /* keep going */ }
    }
    if (before + freed >= TARGET_FREE_BYTES) break;
  }

  out.acted = freed > 0;
  out.freedMB = Number((freed / 1048576).toFixed(1));
  const after = freeBytesOn(mount);
  out.freeMB = after == null ? out.freeMB : Number((after / 1048576).toFixed(0));
  if (out.acted) {
    console.warn(`[BOOT] reclaimed ${out.freedMB}MB from regenerable caches — free space now ${out.freeMB}MB`);
  }
  return out;
}

module.exports = { ensureBootHeadroom, CRITICAL_FREE_BYTES, TARGET_FREE_BYTES, CACHE_DIRS };
