// ============================================================================
// DISCOVERY ENGINE — autonomous hunt loop.
//   1. Live radar → real-time spikes (normalized + health-tracked)
//   2. Niche Universe sampling → broad coverage
//   3. Seasonal focus → peaking this month
// Candidates are vetted; SKIP grades never enter the activation pipeline.
// ============================================================================

const { db } = require('../database');
const radar = require('./trendRadar');
const { UNIVERSE } = require('./nicheUniverse');
const seasonal = require('./seasonalEngine');
const vetting = require('./vettingEngine');
const { draftProduct } = require('./productDraft');
const trendScanner = require('./trendScanner');

function sampleUniverse(count = 4) {
  const tracked = new Set(db.prepare('SELECT name FROM trends').all().map(t => radar.normalizeNicheKey(t.name)));
  const available = UNIVERSE.filter(u => !tracked.has(radar.normalizeNicheKey(u.name)));
  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [available[i], available[j]] = [available[j], available[i]];
  }
  return available.slice(0, count);
}

function insertUniverseTrend(entry) {
  if (radar.trendNameExists(entry.name)) return null;

  const candidate = {
    name: entry.name,
    emoji: entry.emoji || '🔎',
    phase: entry.phase || 'emerging',
    velocity: entry.velocity || '+80%',
    window: entry.window || 40,
    est_revenue: entry.estRevenue || entry.est_revenue || '$2k-6k',
    why: entry.why || `Discovery · ${entry.category || 'universe'}`
  };

  // Fail early: do not persist SKIP-grade noise
  if (!vetting.isProductizable(candidate)) {
    console.log(`[DISCOVERY] skipped low-vet niche: ${candidate.name}`);
    return null;
  }

  const why = entry.category
    ? `Discovery · ${entry.category} · ${entry.why || ''}`
    : (entry.why || candidate.why);

  db.prepare(`
    INSERT INTO trends (name, emoji, phase, velocity, window, est_revenue, why, activated, detected_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
  `).run(
    candidate.name,
    candidate.emoji,
    candidate.phase,
    candidate.velocity,
    candidate.window,
    candidate.est_revenue,
    why,
    new Date().toISOString()
  );
  return db.prepare('SELECT * FROM trends WHERE name = ? ORDER BY id DESC LIMIT 1').get(candidate.name);
}

async function sweep(maxNew = 8) {
  const inserted = [];

  try {
    const live = await radar.scanLiveTrends(4);
    for (const row of live) {
      if (!vetting.isProductizable(row)) {
        // Radar already inserted — mark outcome so it won't tempt activation
        try {
          db.prepare("UPDATE trends SET outcome = 'skipped-vet' WHERE id = ? AND activated = 0").run(row.id);
        } catch (e) {
          console.error('[DISCOVERY] skip-tag failed:', e.message);
        }
        continue;
      }
      inserted.push(row);
    }
  } catch (e) {
    console.error('[DISCOVERY] live radar:', e.message);
  }

  for (const entry of sampleUniverse(6)) {
    if (inserted.length >= maxNew) break;
    try {
      const row = insertUniverseTrend(entry);
      if (row) inserted.push(row);
    } catch (e) {
      console.error('[DISCOVERY] universe insert:', e.message);
    }
  }

  try {
    for (const prof of seasonal.getFocusProfessions()) {
      if (inserted.length >= maxNew) break;
      const row = insertUniverseTrend({
        name: `${prof.name} (seasonal)`,
        emoji: prof.emoji,
        category: 'seasonal',
        phase: 'rising',
        velocity: '+90%',
        window: 30,
        estRevenue: '$2k-6k',
        why: seasonal.getCurrentFocus().note
      });
      if (row) inserted.push(row);
    }
  } catch (e) {
    console.error('[DISCOVERY] seasonal:', e.message);
  }

  if (inserted.length) {
    db.prepare('INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)')
      .run('discovery_sweep', `Surfaced ${inserted.length} new niche(s)`, 'success');
  }
  return inserted;
}

// Niche → product-type routing lives in typePlan.js (single tested owner).
const { productsForTrend } = require('./typePlan');

/** Resolve profession for a trend name (strips seasonal suffix, tries slug). */
function resolveProfessionForTrend(trend) {
  if (!trend) return null;
  const raw = String(trend.name || '');
  const base = raw.replace(/\s*\(seasonal\)\s*$/i, '').trim();
  let prof = db.prepare('SELECT * FROM professions WHERE name = ?').get(raw);
  if (prof) return prof;
  prof = db.prepare('SELECT * FROM professions WHERE name = ?').get(base);
  if (prof) return prof;
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return db.prepare('SELECT * FROM professions WHERE slug = ?').get(slug) || null;
}

function generateProductsForTrend(profId, trend) {
  // Hard gate: never burn product rows for SKIP niches
  try {
    vetting.assertActivatable(trend, { allowWatch: true });
  } catch (e) {
    console.error('[DISCOVERY] generate blocked by vet:', e.message);
    db.prepare('INSERT INTO automation_log (action, profession_id, details, status) VALUES (?, ?, ?, ?)')
      .run('trend_products_blocked', profId, e.message, 'warning');
    return 0;
  }

  const prof = db.prepare('SELECT * FROM professions WHERE id = ?').get(profId);
  if (!prof) return 0;
  const types = productsForTrend(trend);
  let made = 0;
  for (const type of types) {
    try {
      const id = draftProduct(prof, type);
      if (id) {
        made++;
        // Best-effort AI concept pass — differentiates the product from the
        // generic "{niche} {type}" default. No-op (zero cost) when AI is off.
        setImmediate(() => {
          const { enrichProduct } = require('./conceptEngine');
          enrichProduct(id).catch(() => {});
        });
      }
    } catch (e) {
      console.error('[DISCOVERY] product insert:', e.message);
    }
  }
  db.prepare('INSERT INTO automation_log (action, profession_id, details, status) VALUES (?, ?, ?, ?)')
    .run('trend_products', profId, `Generated ${made} products for activated trend "${trend.name}"`, 'success');
  return made;
}

function freshnessPass() {
  const activeTrends = db.prepare('SELECT * FROM trends WHERE activated = 1 AND outcome IS NULL').all();
  if (!activeTrends.length) return 0;
  const hasType = (profId, tp) => !!db.prepare(
    `SELECT id FROM products WHERE profession_id = ? AND type = ? AND status IN ('draft','pending-review') LIMIT 1`
  ).get(profId, tp);

  const trendPool = activeTrends.filter(t => {
    const prof = resolveProfessionForTrend(t);
    if (!prof) return false;
    if (!vetting.shouldActivate(t) && vetting.vetTrend(t)?.verdict === 'SKIP') return false;
    const types = productsForTrend(t);
    return types.some(tp => !hasType(prof.id, tp));
  });
  if (!trendPool.length) return 0;

  const trend = trendPool[Math.floor(Math.random() * trendPool.length)];
  const prof = resolveProfessionForTrend(trend);
  if (!prof) return 0;
  const types = productsForTrend(trend);
  const missing = types.filter(tp => !hasType(prof.id, tp));
  if (!missing.length) return 0;
  const type = missing[Math.floor(Math.random() * missing.length)];
  try {
    return draftProduct(prof, type) ? 1 : 0;
  } catch (e) {
    console.error('[DISCOVERY] freshness insert:', e.message);
    return 0;
  }
}

// ── CORE (EVERGREEN) NICHES — pinned 24/7/365; never auto-archived by rotation ──
const CORE_SLUGS = new Set([
  'pyrotechnics',
  'aa-recovery', 'smart-recovery', 'refuge-recovery', 'womens-recovery', 'secular-recovery', 'faith-recovery',
  'drywall'
]);

function isCoreProfession(prof) {
  return !!(prof && CORE_SLUGS.has(prof.slug));
}

// Auto-retire cold trend niches whose window has elapsed with zero sales.
// Core (evergreen) niches are never archived here.
function retireColdTrends(now = new Date()) {
  const active = db.prepare('SELECT * FROM trends WHERE activated = 1 AND outcome IS NULL').all();
  let retired = 0;
  for (const t of active) {
    const start = new Date(t.activated_at || t.detected_at || Date.now());
    const window = Math.max(7, Number(t.window) || 14);
    const daysSince = (now.getTime() - start.getTime()) / 86400000;
    if (daysSince <= window) continue;

    const prof = resolveProfessionForTrend(t);
    if (!prof) continue;
    if (isCoreProfession(prof)) continue;

    const row = db.prepare('SELECT COALESCE(SUM(sales), 0) AS s FROM metrics WHERE profession_id = ?').get(prof.id);
    if ((row && row.s) > 0) continue; // it's earning — leave it alone

    db.prepare("UPDATE trends SET outcome = 'cooled' WHERE id = ?").run(t.id);
    db.prepare("UPDATE professions SET status = 'archived' WHERE id = ?").run(prof.id);
    db.prepare('INSERT INTO automation_log (action, profession_id, details, status) VALUES (?, ?, ?, ?)')
      .run('trend_retired', prof.id, `Retired "${t.name}" — ${Math.round(daysSince)}d window, 0 sales`, 'info');
    retired++;
  }
  return retired;
}

// Fads don't wait for a human review gate — auto-activate ACTIVATE-grade,
// shopping-intent-driven, high-velocity trends on sight.
async function autoActivateHotFads(limit = 3) {
  const candidates = db.prepare(
    "SELECT * FROM trends WHERE activated = 0 AND outcome IS NULL ORDER BY detected_at DESC"
  ).all();
  let activated = 0;
  for (const t of candidates) {
    if (activated >= limit) break;
    let vet;
    try { vet = vetting.vetTrend(t); } catch { continue; }
    if (!vet || vet.verdict !== 'ACTIVATE') continue;
    if ((vet.signals.shoppingIntent || 0) < 70) continue; // must be shopping-driven
    const v = parseInt(String(t.velocity || '').match(/(\d+(?:\.\d+)?)/)?.[1] || '0', 10) || 0;
    if (v < 120) continue; // needs real momentum
    try {
      const g = await trendScanner.gateActivateTrend(t.id);
      const prof = g.ok ? g.prof : null;
      if (!prof) continue;
      generateProductsForTrend(prof.id, t);
      db.prepare('INSERT INTO automation_log (action, profession_id, details, status) VALUES (?, ?, ?, ?)')
        .run('fad_activated', prof.id, `Auto-activated hot fad "${t.name}" (intent ${vet.signals.shoppingIntent}, +${v}%)`, 'warning');
      activated++;
    } catch (e) {
      console.error('[DISCOVERY] auto-activate:', e.message);
    }
  }
  return activated;
}

// Winners compound: professions with real sales get missing product types filled
// so a selling niche deepens its catalog (siblings) without re-listing duplicates.
function scaleWinners() {
  const winners = db.prepare(
    'SELECT profession_id, SUM(sales) AS s FROM metrics GROUP BY profession_id HAVING s > 0'
  ).all();
  let created = 0;
  const types = ['invoice', 'checklist', 'spreadsheet', 'booking', 'social', 'brand', 'journal'];
  for (const w of winners) {
    const prof = db.prepare('SELECT * FROM professions WHERE id = ?').get(w.profession_id);
    if (!prof) continue;
    for (const type of types) {
      try {
        if (draftProduct(prof, type)) created++;
      } catch (e) {
        console.error('[DISCOVERY] scale winner:', e.message);
      }
    }
  }
  if (created > 0) {
    db.prepare('INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)')
      .run('scale_winners', `Generated ${created} sibling product(s) for selling niches`, 'success');
  }
  return created;
}

module.exports = {
  sweep,
  productsForTrend,
  generateProductsForTrend,
  freshnessPass,
  sampleUniverse,
  resolveProfessionForTrend,
  insertUniverseTrend,
  retireColdTrends,
  isCoreProfession,
  CORE_SLUGS,
  autoActivateHotFads,
  scaleWinners
};
