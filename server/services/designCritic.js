// ═══════════════════════════════════════════════════════════════════════════
// DESIGN CRITIC — render → critique → revise loop (Phase 1).
//
// After fileFactory builds a product, we screenshot its pages and hand them to
// a vision-capable model with a scoring rubric (visual hierarchy, whitespace
// rhythm, typography cohesion, colour harmony, uniqueness vs generic template
// feel, scroll-stop). Strict-JSON parsing (same defensive pattern as
// conceptEngine.parseConcept). Below the threshold the critic runs ONE
// revision pass (a critique-driven brief regen through artDirector), re-scores
// and keeps the better of the two variants.
//
// Rules (Phase 1 hard constraints):
//   • Never throws upstream. MODEL_ENABLED=false or no vision → skip, ship
//     as-is, return null. Zero cost when the AI layer is off.
//   • Max 1 critique + 1 revision per product per render (cost control).
//   • All vision spend lands in ai_usage (action='design_critique').
//   • A design score of null ≠ passing: unscored products are tracked
//     separately in analytics, never counted as passed.
//
// Owner scope: automated sweeps / auto-reskin only touch products created on
// or after FOCUS_SINCE (2026-10-10 — "don't use products created prior to
// yesterday"). Manual per-product critique is always allowed.
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const { db } = require('../database');
const router = require('./modelRouter');
const cfg = require('./modelConfig');

// Owner's "recent products only" scope for every automated design path.
const FOCUS_SINCE = process.env.DESIGN_FOCUS_SINCE || '2026-10-10';

const THRESHOLD = Number(process.env.DESIGN_SCORE_THRESHOLD || 6.5);
const REVISION_THRESHOLD = THRESHOLD; // below this → one revision pass
const RESKIN_THRESHOLD = 5;           // sweep auto-reskins below this

const RUBRIC = [
  'visual_hierarchy',
  'whitespace_rhythm',
  'typography_cohesion',
  'color_harmony',
  'uniqueness',
  'scroll_stop'
];

// ── parsing (defensive, mirrors conceptEngine.parseConcept) ─────────────

function clampScore(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(10, n));
}

function parseCritique(text) {
  if (!text) return null;
  const cleaned = String(text)
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  let obj;
  try { obj = JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }

  const scores = {};
  for (const key of RUBRIC) {
    const v = clampScore(obj[key]);
    if (v === null) return null; // every rubric leg must be present and sane
    scores[key] = v;
  }
  const provided = clampScore(obj.overall);
  const mean = RUBRIC.reduce((a, k) => a + scores[k], 0) / RUBRIC.length;
  scores.overall = provided !== null ? provided : Math.round(mean * 10) / 10;

  const critique = String(obj.critique || '').slice(0, 1200).trim();
  return { scores, critique };
}

function overallFrom(scores) {
  if (!scores) return null;
  if (Number.isFinite(scores.overall)) return scores.overall;
  return null;
}

// ── rendering screenshots (Puppeteer, shared Chrome) ────────────────────

async function renderPageShots(html, { limit = 2, width = 1080, height = 1350 } = {}) {
  const shots = [];
  try {
    const pdfGen = require('./pdfGenerator');
    const browser = await pdfGen.getBrowser();
    if (!browser) return shots;
    const page = await browser.newPage();
    try {
      await page.setViewport({ width, height, deviceScaleFactor: 1 });
      await page.setContent(String(html || ''), { waitUntil: 'domcontentloaded' });
      await new Promise(r => setTimeout(r, 350)); // let fonts paint
      for (let i = 0; i < limit; i++) {
        const buf = await page.screenshot({ type: 'jpeg', quality: 72 });
        shots.push('data:image/jpeg;base64,' + Buffer.from(buf).toString('base64'));
        const more = await page.evaluate(() => {
          const step = Math.max(400, window.innerHeight * 0.9);
          const at = window.scrollY + step;
          const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
          window.scrollTo(0, at);
          return at < max;
        }).catch(() => false);
        if (!more) break;
      }
    } finally {
      await page.close().catch(() => {});
    }
  } catch (e) {
    console.error('[CRITIC] screenshot failed:', e.message);
  }
  return shots;
}

// ── one vision scoring pass ─────────────────────────────────────────────

function buildCritiquePrompt(product) {
  return [
    `Score this rendered digital product ("${String(product.name || '').slice(0, 80)}", type: ${product.type || 'document'}) as a harsh design director.`,
    'Score each dimension 0-10:',
    '- visual_hierarchy: can the eye find the headline and the structure instantly?',
    '- whitespace_rhythm: density and breathing room, no crowding or dead zones',
    '- typography_cohesion: type pairing, scale consistency, readable sizes',
    '- color_harmony: palette discipline, contrast, no clash',
    '- uniqueness: does it look designed for THIS product, or like a generic recolored template?',
    '- scroll_stop: would this stop a scroll on Etsy?',
    'Scoring anchors — use the FULL range and judge only what the screenshots show:',
    '- 0-2 broken: unreadable text, clashing colors, no structure, clearly unfinished',
    '- 3-4 below average: functional but generic; muddy palette or weak hierarchy',
    '- 5-6 solid professional work: clean hierarchy, coherent palette, consistent type; limited originality',
    '- 7-8 strong design: distinctive and polished, excellent rhythm and contrast, premium feel',
    '- 9-10 exceptional: memorable, award-candidate design',
    'Note: checklists, spreadsheets and template packs are SUPPOSED to look like structured templates — judge the craft (hierarchy, spacing, type scale, palette discipline, polish), not the genre.',
    'Reply with ONLY valid JSON, no markdown:',
    '{"visual_hierarchy":0,"whitespace_rhythm":0,"typography_cohesion":0,"color_harmony":0,"uniqueness":0,"scroll_stop":0,"overall":0,',
    '"critique":"2-3 sentences of specific, actionable design critique"}'
  ].join('\n');
}

// One scoring call. Returns { scores, critique } or null. Never throws.
async function scoreVariant(product, shots) {
  if (!cfg.enabled) return null;
  if (!shots || !shots.length) return null;
  try {
    const raw = await router.callVision({
      prompt: buildCritiquePrompt(product),
      images: shots,
      system: 'You are a design director for premium digital products. Strict JSON only. Calibrated and blunt: use the full 0-10 range, judge only what the screenshots show, and never punish a product for its genre.',
      temperature: 0.2,
      action: 'design_critique'
    });
    return parseCritique(raw);
  } catch (e) {
    console.error('[CRITIC] scoreVariant failed:', e.message);
    return null;
  }
}

// ── persistence ─────────────────────────────────────────────────────────

function persistScore(productId, scores, critique, { revised = 0, keptVariant = 'original' } = {}) {
  if (!productId || !scores) return null;
  try {
    const info = db.prepare(
      'INSERT INTO design_scores (product_id, scores, critique, revised, kept_variant) VALUES (?, ?, ?, ?, ?)'
    ).run(productId, JSON.stringify(scores), String(critique || '').slice(0, 1200) || null, revised ? 1 : 0, keptVariant);
    return info.lastInsertRowid;
  } catch (e) {
    console.error('[CRITIC] persistScore:', e.message);
    return null;
  }
}

function latestScore(productId) {
  try {
    const row = db.prepare('SELECT * FROM design_scores WHERE product_id = ? ORDER BY id DESC LIMIT 1').get(productId);
    if (!row) return null;
    return { ...row, scores: safeParse(row.scores) };
  } catch {
    return null;
  }
}

function scoreHistory(productId) {
  try {
    return db.prepare('SELECT * FROM design_scores WHERE product_id = ? ORDER BY id ASC').all(productId)
      .map(r => ({ ...r, scores: safeParse(r.scores) }));
  } catch {
    return [];
  }
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

// ── the loop ────────────────────────────────────────────────────────────

// Critique a product: screenshot → score → (below threshold) ONE revision →
// keep the better variant. Returns a summary or null. Never throws.
//
// opts:
//   shots       — pre-rendered data URIs (skip Puppeteer; used by tests)
//   revise      — allow the revision pass (default true)
//   force       — re-score even if already scored
//   allowWinner — feed the winners loop (score >= 8 → design_references)
async function critiqueProduct(productOrId, opts = {}) {
  try {
    const id = Number(productOrId && productOrId.id ? productOrId.id : productOrId);
    if (!Number.isFinite(id)) return null;
    const product = db.prepare('SELECT p.*, pr.name AS prof_name FROM products p LEFT JOIN professions pr ON p.profession_id = pr.id WHERE p.id = ?').get(id);
    if (!product) return null;

    if (!cfg.enabled) return { status: 'skipped', reason: 'ai-off', productId: id, scores: null };
    const existing = latestScore(id);
    if (existing && !opts.force) return { status: 'skipped', reason: 'already-scored', productId: id, scores: existing.scores };

    let shots = opts.shots || null;
    if (!shots) {
      const fileFactory = require('./fileFactory');
      const prof = db.prepare('SELECT * FROM professions WHERE id = ?').get(product.profession_id);
      const html = prof ? fileFactory.buildPreviewHTML(product, prof) : product.html_content;
      shots = await renderPageShots(html);
    }

    const first = await scoreVariant(product, shots);
    if (!first) {
      // Honest degradation: no score. NOT a pass.
      return { status: 'unscored', reason: 'critique-unavailable', productId: id, scores: null };
    }

    let best = { ...first, variant: 'original' };
    let revisedUsed = false;

    if (opts.revise !== false && first.scores.overall < REVISION_THRESHOLD) {
      // ONE revision pass: critique-driven brief regen → re-render → re-score.
      try {
        const artDirector = require('./artDirector');
        const prof = db.prepare('SELECT * FROM professions WHERE id = ?').get(product.profession_id);
        const prevBriefRaw = product.design_brief || null; // restore point
        const brief = prof ? await artDirector.generateBrief(product, prof, { critique: first.critique }) : null;
        if (brief) {
          artDirector.saveBrief(product.id, brief);
          product.design_brief = JSON.stringify(brief);
          const fileFactory = require('./fileFactory');
          const prof2 = prof || db.prepare('SELECT * FROM professions WHERE id = ?').get(product.profession_id);
          const theme = artDirector.applyBriefToTheme(fileFactory.fallbackTheme(product), brief);
          const html = fileFactory.buildPreviewHTML(product, prof2, theme);
          // Re-render seam: opts.renderShots overrides Puppeteer (tests);
          // injected-shots callers may reuse their shots instead of rendering.
          const newShots = opts.renderShots
            ? await opts.renderShots(html)
            : (opts.shots || await renderPageShots(html));
          const second = await scoreVariant(product, newShots.length ? newShots : shots);
          if (second) {
            revisedUsed = true;
            if (second.scores.overall > first.scores.overall) {
              best = { ...second, variant: 'revised' };
              // The revised brief won — keep the skin and re-render artifacts.
              if (opts.regenerate !== false) await regenerateArtifacts(product, brief);
            } else {
              // Original was better: drop the losing brief, restore the old one.
              db.prepare('UPDATE products SET design_brief = ? WHERE id = ?').run(prevBriefRaw, product.id);
              product.design_brief = prevBriefRaw;
            }
          }
        }
      } catch (e) {
        console.error('[CRITIC] revision pass failed:', e.message);
      }
    }

    persistScore(product.id, best.scores, best.critique, {
      revised: revisedUsed ? 1 : 0,
      keptVariant: best.variant
    });

    if (opts.allowWinner !== false && best.scores.overall >= 8) {
      try {
        require('./swipeFileEngine').addDesignReference({
          title: `${product.prof_name || 'Niche'} — ${String(product.name).slice(0, 60)}`,
          source: 'winner',
          niche_key: require('./designStyles').detectNicheCategory({ name: product.prof_name, services: '' }),
          palette: product.design_brief ? JSON.stringify(safeParse(product.design_brief)?.palette || []) : '[]',
          fonts: product.design_brief ? JSON.stringify(safeParse(product.design_brief)?.fonts || {}) : '{}',
          layout: safeParse(product.design_brief)?.layout || null,
          motif: safeParse(product.design_brief)?.motif || null,
          taste_note: String(best.critique || 'High-scoring in-house design.').slice(0, 300),
          product_id: product.id,
          score: best.scores.overall
        });
      } catch { /* winners loop never breaks critique */ }
    }

    return {
      status: revisedUsed ? 'revised' : 'scored',
      productId: product.id,
      scores: best.scores,
      critique: best.critique,
      variant: best.variant,
      improved: revisedUsed ? Math.round((best.scores.overall - first.scores.overall) * 10) / 10 : 0
    };
  } catch (e) {
    console.error('[CRITIC] critiqueProduct failed:', e.message);
    return null;
  }
}

// Re-render a product's artifacts (file + thumbnail) under a new brief —
// content (name/concept/brief/services) is untouched. The "reskin" action.
async function regenerateArtifacts(product, brief) {
  try {
    const artDirector = require('./artDirector');
    const fileFactory = require('./fileFactory');
    if (brief) artDirector.saveBrief(product.id, brief);
    // Force-regenerate the deliverable + preview so the skin actually changes.
    if (product.file_path && fs.existsSync(product.file_path)) {
      try { fs.unlinkSync(product.file_path); } catch { /* keep going */ }
    }
    if (product.preview_path && fs.existsSync(product.preview_path)) {
      try { fs.unlinkSync(product.preview_path); } catch { /* keep going */ }
    }
    db.prepare('UPDATE products SET file_path = NULL, preview_path = NULL WHERE id = ?').run(product.id);
    const fresh = db.prepare('SELECT * FROM products WHERE id = ?').get(product.id);
    await fileFactory.ensureProductFile(fresh);
    await fileFactory.ensureProductThumbnail(fresh);
    return true;
  } catch (e) {
    console.error('[CRITIC] regenerateArtifacts failed:', e.message);
    return false;
  }
}

// Phase 4 reskin: re-render under a NEW generated brief without regenerating
// content. Returns a summary. Never throws.
async function reskinProduct(productOrId, opts = {}) {
  try {
    const id = Number(productOrId && productOrId.id ? productOrId.id : productOrId);
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    if (!product) return { ok: false, error: 'Product not found' };
    const prof = db.prepare('SELECT * FROM professions WHERE id = ?').get(product.profession_id);
    if (!prof) return { ok: false, error: 'Profession not found' };

    let brief = null;
    if (cfg.enabled) {
      const artDirector = require('./artDirector');
      const prev = safeParse(product.design_brief);
      brief = await artDirector.generateBrief(product, prof, {
        avoid: prev ? JSON.stringify({ palette: prev.palette, mood: prev.mood, motif: prev.motif }) : null,
        critique: opts.critique || null,
        layout: opts.layout || null
      });
    }
    if (!brief) {
      // Deterministic variation when the model is off or regeneration failed:
      // the shared brief-by-default synthesis (theme palette + rotated layout +
      // niche motif + curated pairing) — the skin ALWAYS changes at zero AI
      // cost and always passes the editor-safety lint.
      brief = require('./artDirector').synthesizeBrief(product, prof, {
        previous: safeParse(product.design_brief),
        layout: opts.layout
      });
    }
    if (brief) require('./artDirector').saveBrief(product.id, brief);

    const ok = await regenerateArtifacts(product, brief);
    return {
      ok,
      productId: product.id,
      brief: brief ? { layout: brief.layout, palette: brief.palette, motif: brief.motif } : null,
      deterministic: !!brief && !!brief._deterministic
    };
  } catch (e) {
    console.error('[CRITIC] reskinProduct failed:', e.message);
    return { ok: false, error: e.message };
  }
}

// ── Phase 5: catalog sweep (owner scope: FOCUS_SINCE onwards) ───────────

async function sweepCatalog({ since = FOCUS_SINCE, limit = 25, reskinBelow = RESKIN_THRESHOLD, order = 'views', shots = null, renderShots = null, allowWinner = true, reskin = true } = {}) {
  const rows = db.prepare(`
    SELECT p.id, p.name, p.type, p.created_at,
           COALESCE((SELECT SUM(m.views) FROM metrics m WHERE m.product_id = p.id), 0) AS views
    FROM products p
    WHERE p.created_at >= ?
    ORDER BY ${order === 'views' ? 'views DESC, ' : ''}p.id DESC
    LIMIT ?
  `).all(String(since), Math.max(1, Math.min(100, Number(limit) || 25)));

  const results = [];
  const before = [];
  const after = [];
  for (const row of rows) {
    const res = await critiqueProduct(row.id, { force: true, revise: true, shots, renderShots, allowWinner, regenerate: reskin });
    if (res && res.scores) {
      before.push(res.scores.overall);
      if (res.status === 'revised' && res.scores) after.push(res.scores.overall);
      if (reskin && res.scores.overall < reskinBelow) {
        const skinned = await reskinProduct(row.id, { critique: res.critique });
        results.push({ productId: row.id, name: row.name, action: 'reskinned', score: res.scores.overall, ok: skinned.ok });
      } else {
        results.push({ productId: row.id, name: row.name, action: res.status, score: res.scores.overall });
      }
    } else {
      results.push({ productId: row.id, name: row.name, action: (res && res.status) || 'unscored', score: null });
    }
  }
  return {
    ok: true,
    since,
    scanned: rows.length,
    results,
    distributionBefore: distributionOf(before),
    distributionAfter: distributionOf(after.length ? after : before)
  };
}

function distributionOf(values) {
  const buckets = { '0-2': 0, '2-4': 0, '4-6': 0, '6-8': 0, '8-10': 0 };
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    if (v < 2) buckets['0-2']++;
    else if (v < 4) buckets['2-4']++;
    else if (v < 6) buckets['4-6']++;
    else if (v < 8) buckets['6-8']++;
    else buckets['8-10']++;
  }
  return buckets;
}

// Score summary for Analytics. Unscored products report as unscored — they
// are NEVER counted as passed (hard constraint #4).
function scoreSummary({ since = FOCUS_SINCE } = {}) {
  try {
    const total = db.prepare('SELECT COUNT(*) c FROM products WHERE created_at >= ?').get(String(since)).c;
    // One row per SCORED PRODUCT (its latest verdict) — counting score rows
    // overcounts products with several critique runs and collapses `unscored`
    // to 0 (a product with 3 score rows is still ONE product).
    const scoredRows = db.prepare(`
      SELECT ds.scores FROM design_scores ds
      JOIN products p ON p.id = ds.product_id
      WHERE p.created_at >= ?
        AND ds.id = (SELECT MAX(d2.id) FROM design_scores d2 WHERE d2.product_id = ds.product_id)
    `).all(String(since));
    const values = scoredRows.map(r => overallFrom(safeParse(r.scores))).filter(v => Number.isFinite(v));
    const revisedRows = db.prepare(`
      SELECT COUNT(*) c FROM design_scores WHERE revised = 1
    `).get().c;
    const avg = values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null;
    return {
      since,
      total,
      scored: values.length,
      unscored: Math.max(0, total - values.length),
      avg,
      distribution: distributionOf(values),
      belowThreshold: values.filter(v => v < THRESHOLD).length,
      rescoredWithRevision: revisedRows,
      threshold: THRESHOLD
    };
  } catch (e) {
    return { since, total: 0, scored: 0, unscored: 0, avg: null, distribution: {}, belowThreshold: 0, rescoredWithRevision: 0, threshold: THRESHOLD, error: e.message };
  }
}  // Products with real sales but weak design — the auto-reskin rule (Phase 4).
// "One automatic reskin attempt": products already reskinned (automation_log)
// are excluded. Owner scope: FOCUS_SINCE onwards.
function autoReskinCandidates({ since = FOCUS_SINCE, minSales = 2, maxScore = 7, limit = 10 } = {}) {
  try {
    const rows = db.prepare(`
      SELECT p.id, p.name, s.sales,
             (SELECT ds.scores FROM design_scores ds WHERE ds.product_id = p.id ORDER BY ds.id DESC LIMIT 1) AS last_scores
      FROM products p
      JOIN (SELECT product_id, SUM(sales) AS sales FROM metrics GROUP BY product_id) s ON s.product_id = p.id
      WHERE p.created_at >= ? AND s.sales >= ?
      ORDER BY s.sales DESC
      LIMIT ?
    `).all(String(since), Number(minSales) || 2, Math.max(1, Number(limit) || 10));

    return rows.filter(r => {
      const s = safeParse(r.last_scores);
      if (!s || !Number.isFinite(s.overall)) return false; // unscored ≠ weak
      if (s.overall >= maxScore) return false;
      const already = db.prepare("SELECT COUNT(*) c FROM automation_log WHERE action = 'design_reskin' AND product_id = ?").get(r.id).c;
      return already === 0;
    }).map(r => ({ productId: r.id, name: r.name, sales: r.sales, score: safeParse(r.last_scores).overall }));
  } catch {
    return [];
  }
}

function markAutoReskin(productId, result) {
  try {
    db.prepare('INSERT INTO automation_log (action, product_id, details, status) VALUES (?, ?, ?, ?)')
      .run('design_reskin', productId, JSON.stringify(result || {}).slice(0, 500), (result && result.ok) ? 'success' : 'warn');
  } catch { /* log-only */ }
}

module.exports = {
  FOCUS_SINCE,
  THRESHOLD,
  RUBRIC,
  parseCritique,
  clampScore,
  overallFrom,
  renderPageShots,
  scoreVariant,
  critiqueProduct,
  reskinProduct,
  regenerateArtifacts,
  persistScore,
  latestScore,
  scoreHistory,
  sweepCatalog,
  scoreSummary,
  distributionOf,
  autoReskinCandidates,
  markAutoReskin
};
