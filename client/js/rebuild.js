// ═══════════════════════════════════════════════════════════════════════
// COVER REBUILD — cursor-paged, single-flight, honest about failures.
//
// Kept as pure logic with injected dependencies so it can be unit-tested
// without a browser. Guarantees that the test suite pins down:
//   • a second call while one is running is a no-op (single-flight)
//   • batches always advance via `afterId`, and a batch that fails to move
//     forward aborts instead of looping and re-processing duplicates
//   • a failed HTTP batch surfaces as an honest "Rebuild Stopped", never a
//     false "Rebuild Complete"
//   • the running flag is always cleared, even on throw
// ═══════════════════════════════════════════════════════════════════════

export function createCoverRebuild(deps = {}) {
  const apiBase = deps.apiBase || '/api';
  const doFetch = deps.fetch || (typeof fetch === 'function' ? fetch : null);
  const notify = deps.notify || (() => {});
  const confirmFn = deps.confirmFn || (typeof confirm === 'function' ? confirm : () => true);
  const onFinish = deps.onFinish || (() => {});
  const batchSize = deps.batchSize || 5;

  let coverRebuildRunning = false;

  async function regenerateAll() {
    if (coverRebuildRunning) return;
    if (!doFetch) { notify('error', 'Rebuild Stopped', 'Networking is unavailable.'); return; }
    if (!confirmFn('Rebuild covers in background batches? Keep this tab open. Existing previews are kept if a rebuild fails.')) return;

    coverRebuildRunning = true;
    let done = 0, failed = 0, afterId = 0, maxId;
    try {
      while (true) {
        const q = new URLSearchParams({ limit: String(batchSize), force: '1', afterId: String(afterId) });
        if (maxId !== undefined) q.set('maxId', String(maxId));
        const res = await doFetch(`${apiBase}/previews/generate?${q}`, { method: 'POST' });
        const d = await res.json();
        if (!res.ok) throw new Error((d && d.error) || 'Preview request failed');
        done += d.generated;
        failed += d.failed;
        notify('info', 'Rebuilding…', `${done} rebuilt · ${failed} failed · ${d.remaining} remaining`);
        if (!d.hasMore) break;
        if (!Number.isSafeInteger(d.nextAfterId) || d.nextAfterId <= afterId) {
          throw new Error('Batch did not advance; stopped to avoid duplicates');
        }
        afterId = d.nextAfterId;
        maxId = d.maxId;
      }
      notify(failed ? 'error' : 'success',
        failed ? 'Rebuild Finished with Failures' : 'Rebuild Complete',
        `${done} covers rebuilt; ${failed} failed.`);
    } catch (e) {
      notify('error', 'Rebuild Stopped', `${done} rebuilt; ${failed} failed. ${e.message}`);
    } finally {
      coverRebuildRunning = false;
      try { onFinish(done, failed); } catch { /* never mask the run result */ }
    }
  }

  return { regenerateAll, isRunning: () => coverRebuildRunning };
}
