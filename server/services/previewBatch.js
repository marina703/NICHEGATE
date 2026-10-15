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

  // Bounded concurrency: a cover render is a network art fetch plus ONE
  // Puppeteer page on the shared browser, so a small wave finishes in roughly
  // the time of a single sequential render instead of N. Without this, a
  // batch of 5 covers needed ~100s each (sequential) and every synchronous
  // HTTP batch blew past client/proxy timeouts — the console's "Rebuild
  // Stopped" failure. Waves of 4 keep a batch of 5 well inside the budget.
  const CONCURRENCY = 4;
  const results = new Array(rows.length).fill(false);
  let cursor = 0;
  async function worker() {
    while (cursor < rows.length) {
      const idx = cursor++;
      const product = rows[idx];
      // Clear only the in-memory cache pointer. The stored preview stays
      // available until the renderer successfully writes a replacement.
      const candidate = force ? { ...product, preview_path: null } : product;
      try {
        results[idx] = !!(await render(candidate));
      } catch {
        results[idx] = false;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, Math.max(rows.length, 1)) }, worker));

  let generated = 0, failed = 0;
  const failedIds = [];
  results.forEach((ok, i) => {
    if (ok) generated++;
    // Advance past failures too: they are reported for a later explicit retry.
    else { failed++; failedIds.push(rows[i].id); }
  });
  const nextAfterId = rows.length ? rows[rows.length - 1].id : afterId;
  const remaining = db.prepare(`SELECT COUNT(*) AS c FROM products WHERE ${eligible} AND id > ? AND id <= ?`)
    .get(nextAfterId, maxId).c;
  return { total: rows.length, generated, failed, failedIds, remaining,
    forced: force, nextAfterId, maxId, hasMore: remaining > 0 };
}

module.exports = { generatePreviewBatch };
