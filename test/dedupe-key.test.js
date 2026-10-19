const test = require('node:test');
const assert = require('node:assert/strict');
const { db, init } = require('../server/database');
const { draftProduct } = require('../server/services/productDraft');

init();

test('R0.3: an identical live product (same profession + type + brief) is never inserted twice', () => {
  // A throwaway archived profession, so no existing draft row can trip the older
  // draft/pending check before the key check is reached.
  const slug = `dedupe-probe-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const info = db.prepare("INSERT INTO professions (name, slug, status) VALUES (?, ?, 'archived')").run(slug, slug);
  const prof = { id: Number(info.lastInsertRowid), name: slug, slug };
  const brief = `dedupe probe ${Date.now()} ${Math.random()}`;
  const ids = [];
  try {
    const first = draftProduct(prof, 'checklist', { brief });
    assert.ok(first, 'first draft is inserted');
    ids.push(first);

    db.prepare("UPDATE products SET status = 'listed' WHERE id = ?").run(first);
    assert.equal(draftProduct(prof, 'checklist', { brief }), null, 'a second identical draft is blocked while the first is live');
    assert.equal(draftProduct(prof, 'checklist', { brief: `  ${brief.toUpperCase()}  ` }), null, 'the key ignores case and extra whitespace');

    const sibling = draftProduct(prof, 'checklist', { brief: `${brief} sibling angle` });
    assert.ok(sibling, 'a sibling with a different brief is allowed');
    ids.push(sibling);

    // The sibling is still a draft, and the older rule blocks any new draft while
    // one is pending. Move it to listed so only the key rule is under test here.
    db.prepare("UPDATE products SET status = 'listed' WHERE id = ?").run(sibling);
    db.prepare("UPDATE products SET status = 'rejected' WHERE id = ?").run(first);
    const afterReject = draftProduct(prof, 'checklist', { brief });
    assert.ok(afterReject, 'a rejected row does not block a fresh draft');
    ids.push(afterReject);
  } finally {
    for (const id of ids) db.prepare('DELETE FROM products WHERE id = ?').run(id);
    db.prepare('DELETE FROM professions WHERE id = ?').run(prof.id);
  }
});
