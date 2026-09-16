// Cursor-based preview batches. Inject dependencies so tests use an isolated DB.
function integer(value, fallback, min, max) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(String(value))) throw new Error('Invalid batch parameter');
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error('Invalid batch parameter');
  return n;
}

async function generatePreviewBatch(db, render, query = {}) {
  const limit = integer(query.limit, 25, 1, 200);
  const afterId = integer(query.afterId, 0, 0, Number.MAX_SAFE_INTEGER);
  const force = query.force === '1';
  const eligible = force
    ? "status IN ('draft','pending-review','approved')"
    : "status IN ('draft','pending-review') AND (preview_path IS NULL OR length(preview_path) = 0)";
  const maxId = integer(query.maxId,
    db.prepare(`SELECT COALESCE(MAX(id), 0) AS id FROM products WHERE ${eligible}`).get().id,
    0, Number.MAX_SAFE_INTEGER);
  const rows = db.prepare(`SELECT * FROM products WHERE ${eligible} AND id > ? AND id <= ? ORDER BY id LIMIT ?`)
    .all(afterId, maxId, limit);
  let generated = 0, failed = 0;
  const failedIds = [];
  for (const product of rows) {
    // Clear only the in-memory cache pointer. The stored preview stays available
    // until the renderer successfully writes a replacement.
    const candidate = force ? { ...product, preview_path: null } : product;
    try {
      if (await render(candidate)) generated++;
      else { failed++; failedIds.push(product.id); }
    } catch {
      failed++;
      failedIds.push(product.id);
    }
  }
  // Advance past failures too: they are reported for a later explicit retry.
  const nextAfterId = rows.length ? rows[rows.length - 1].id : afterId;
  const remaining = db.prepare(`SELECT COUNT(*) AS c FROM products WHERE ${eligible} AND id > ? AND id <= ?`)
    .get(nextAfterId, maxId).c;
  return { total: rows.length, generated, failed, failedIds, remaining,
    forced: force, nextAfterId, maxId, hasMore: remaining > 0 };
}

module.exports = { generatePreviewBatch };
