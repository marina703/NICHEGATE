// ═══════════════════════════════════════════════════════════════════════════
// LISTING OPTIMIZER — rewrites marketplace copy (title / tags / description)
// for weak listings and deploys it under the origin rule:
//   · engine-generated + already listed → updated copy pushes to the LIVE listing
//   · manual ("Make this") products     → local only, manual publish required
// Deterministic heuristics first (real data only — no invented numbers);
// optional AI polish when the model layer is enabled, never required.
// Feeds: GET/POST /api/products/:id/optimization*, POST /api/optimize/weak
// ═══════════════════════════════════════════════════════════════════════════

const { db } = require('../database');
const seo = require('./seoEngine');
const mp = require('./marketplace');

// Etsy-style rubric: title 30–140 chars (50 pts) + 13 tags (50 pts).
// Shared with the BI listing-health scorer so numbers agree across the console.
function scoreSeo(bundle) {
  const titleLen = String((bundle && bundle.title) || '').length;
  const tagCount = ((bundle && bundle.tags) || []).length;
  const titleOk = titleLen >= 30 && titleLen <= 140;
  const title = titleOk ? 50 : Math.round(50 * Math.min(titleLen, 140) / 140);
  const tags = Math.round(50 * Math.min(tagCount, 13) / 13);
  return title + tags;
}

function conceptOf(product) {
  try { return mp.conceptFor(product); } catch { return null; }
}

// Words worth turning into tags: theme, brief and concept pitch.
function wordsFrom(parts) {
  const out = [];
  for (const part of parts) {
    for (const w of String(part || '').toLowerCase().split(/[^a-z0-9]+/)) {
      if (w.length >= 3 && w.length <= 20 && !out.includes(w)) out.push(w);
    }
  }
  return out;
}

// Deterministic copy upgrade on top of what publish would use today.
function optimizeCopy(product, prof) {
  const base = seo.generateSEO(prof, product.type, product.theme);
  // ignoreAgentCopy: the "current" snapshot is the ORIGINAL (pre-agent,
  // pre-optimizer) copy — rollback must restore it verbatim.
  const current = mp.listingCopyFor(product, prof, base, { ignoreAgentCopy: true });
  const concept = conceptOf(product);

  // Title: a bare concept name sells but doesn't get searched — combine the
  // sellable name with the search keywords, front-loaded, ≤140 for Etsy.
  let title;
  if (concept && concept.name) {
    title = `${concept.name} | ${base.shortTitle || base.title}`.replace(/\s+/g, ' ').trim();
  } else {
    title = base.title;
  }
  title = title.slice(0, 140);

  // Tags: keep the existing 13-slot set, then fill from concept/brief/theme
  // words and their bigrams (Etsy tags are ≤20-char phrases).
  const tags = [...(current.tags || [])];
  const words = wordsFrom([product.theme, product.brief, concept && concept.name, concept && concept.pitch]);
  const phrases = [];
  if (concept && concept.name) phrases.push(String(concept.name).toLowerCase().slice(0, 20));
  for (let i = 0; i + 1 < words.length && phrases.length < 8; i++) {
    const t = `${words[i]} ${words[i + 1]}`.slice(0, 20);
    if (!phrases.includes(t)) phrases.push(t);
  }
  for (const t of [...phrases, ...words]) {
    if (tags.length >= 13) break;
    const clean = String(t).slice(0, 20);
    if (clean.length >= 3 && !tags.includes(clean)) tags.push(clean);
  }

  // Description: keep the concept-aware structure publish uses, and lead with
  // the optimized title so search phrases sit at the top of the listing.
  const description = `${title}\n\n${current.description}`.slice(0, 4999);

  const optimized = { title, description, tags: tags.slice(0, 13) };
  return { current, optimized, scoreBefore: scoreSeo(current), scoreAfter: scoreSeo(optimized) };
}

// The deploy rule the owner asked for.
function deployPolicy(product) {
  if (!product) return { autoDeploy: false, reason: 'no product' };
  if ((product.origin || 'engine') === 'manual') {
    return { autoDeploy: false, reason: 'manual product — local only, you publish it yourself' };
  }
  if (!product.marketplace_id) {
    return { autoDeploy: false, reason: 'not listed yet — new copy applies at next publish' };
  }
  if (!product.marketplace) return { autoDeploy: false, reason: 'unknown marketplace' };
  return { autoDeploy: true, platform: product.marketplace };
}

function profFor(product) {
  return product.profession_id
    ? db.prepare('SELECT * FROM professions WHERE id = ?').get(product.profession_id)
    : null;
}

function preview(product) {
  const built = optimizeCopy(product, profFor(product));
  return {
    ok: true,
    productId: product.id,
    name: product.name,
    origin: product.origin || 'engine',
    ...built,
    rollback: { available: !!product.listing_json, target: product.previous_listing_json ? 'previous' : 'original' },
    policy: deployPolicy(product)
  };
}

async function apply(product, opts = {}) {
  const built = optimizeCopy(product, profFor(product));
  // Save the pre-apply copy as the rollback restore point (null on first
  // optimization — rollback then recomputes the original listing copy).
  const previous = product.listing_json || null;
  db.prepare('UPDATE products SET listing_json = ?, previous_listing_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(JSON.stringify(built.optimized).slice(0, 20000), previous, product.id);

  const policy = deployPolicy(product);
  let deploy;
  if (opts.deploy !== false && policy.autoDeploy) {
    try {
      await mp.updateListingCopy(product, built.optimized);
      deploy = { attempted: true, ok: true, platform: policy.platform };
      db.prepare('INSERT INTO automation_log (action, product_id, details, status) VALUES (?, ?, ?, ?)')
        .run('optimize_deploy', product.id, `Updated live ${policy.platform} listing copy`, 'success');
    } catch (e) {
      deploy = { attempted: true, ok: false, error: e.message };
      db.prepare('INSERT INTO automation_log (action, product_id, details, status) VALUES (?, ?, ?, ?)')
        .run('optimize_deploy', product.id, e.message, 'warning');
    }
  } else {
    deploy = { attempted: false, reason: policy.reason };
  }

  return {
    ok: true,
    productId: product.id,
    name: product.name,
    scoreBefore: built.scoreBefore,
    scoreAfter: built.scoreAfter,
    optimized: built.optimized,
    deploy,
    policy
  };
}

// One-click rollback (audit follow-up): restore the copy that was in effect
// before the last optimization — the saved previous_listing_json, or the
// original computed copy when the first optimization is reverted. Same deploy
// rule as apply(): engine + listed pushes the restored copy live; manual
// products stay local. Toggle semantics: the replaced copy becomes the new
// restore point, so rollback is undo/redo.
async function rollback(product, opts = {}) {
  if (!product || !product.listing_json) {
    return { ok: false, reason: 'No optimization applied to this product yet — nothing to roll back' };
  }
  const prof = profFor(product);
  let target = null;
  let targetKind = 'original';
  if (product.previous_listing_json) {
    try {
      const parsed = JSON.parse(product.previous_listing_json);
      if (parsed && parsed.title) { target = parsed; targetKind = 'previous'; }
    } catch { /* corrupted snapshot — fall through to the original copy */ }
  }
  if (!target) target = optimizeCopy(product, prof).current;

  const policy = deployPolicy(product);
  let deploy;
  if (opts.deploy !== false && policy.autoDeploy) {
    try {
      await mp.updateListingCopy(product, target);
      deploy = { attempted: true, ok: true, platform: policy.platform };
    } catch (e) {
      deploy = { attempted: true, ok: false, error: e.message };
    }
  } else {
    deploy = { attempted: false, reason: policy.reason };
  }

  const replaced = product.listing_json;
  db.prepare('UPDATE products SET listing_json = ?, previous_listing_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(JSON.stringify(target).slice(0, 20000), replaced, product.id);
  const deployNote = deploy.attempted ? (deploy.ok ? ` and pushed to live ${policy.platform}` : ` (live push failed: ${deploy.error})`) : '';
  db.prepare('INSERT INTO automation_log (action, product_id, details, status) VALUES (?, ?, ?, ?)')
    .run('optimize_rollback', product.id, `Restored ${targetKind} listing copy${deployNote}`,
      deploy.attempted && !deploy.ok ? 'warning' : 'success');

  return {
    ok: true,
    productId: product.id,
    name: product.name,
    targetKind,
    restored: target,
    score: scoreSeo(target),
    deploy,
    policy
  };
}

// Bulk pass over the weak-listing set the BI service already computes.
// Never throws as a whole: one bad listing is recorded, the run continues.
async function optimizeWeak(limit = 20) {
  const bi = require('./bi');
  const weak = (bi.build().listing.weakestSeo || []).slice(0, limit);
  const results = [];
  let optimized = 0, deployed = 0;
  for (const w of weak) {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(w.id);
    if (!product) continue;
    try {
      const r = await apply(product, {});
      optimized++;
      if (r.deploy && r.deploy.ok) deployed++;
      results.push({ id: w.id, name: w.name, scoreBefore: r.scoreBefore, scoreAfter: r.scoreAfter, deploy: r.deploy });
    } catch (e) {
      results.push({ id: w.id, name: w.name, error: e.message });
    }
  }
  return { ok: true, scanned: weak.length, optimized, deployed, results };
}

module.exports = { preview, apply, rollback, optimizeWeak, deployPolicy, scoreSeo, optimizeCopy };
