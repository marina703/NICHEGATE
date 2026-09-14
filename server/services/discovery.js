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

const TYPE_PRICES = {
  invoice: '$12', checklist: '$10', spreadsheet: '$17', booking: '$22',
  social: '$15', brand: '$19', journal: '$15'
};

function productsForTrend(trend) {
  const cat = `${trend.why || ''} ${trend.name || ''}`.toLowerCase();
  if (/fashion|beauty|aesthetic|decor|style|wear|clothing/.test(cat)) {
    return ['social', 'brand', 'checklist', 'spreadsheet'];
  }
  if (/craft|art|diy|maker|handmade|pottery|candle|soap|resin/.test(cat)) {
    return ['checklist', 'spreadsheet', 'brand', 'social'];
  }
  if (/food|bake|brew|cook|chef|kitchen/.test(cat)) {
    return ['checklist', 'spreadsheet', 'booking', 'social'];
  }
  if (/fitness|sport|gym|coach|train|yoga|pilates/.test(cat)) {
    return ['booking', 'checklist', 'spreadsheet', 'social'];
  }
  if (/recovery|sober|wellness|mental|therapy|counsel/.test(cat)) {
    return ['journal', 'checklist', 'spreadsheet', 'social'];
  }
  if (/tech|app|digital|ai|software|template|online|planner|notion/.test(cat)) {
    return ['spreadsheet', 'checklist', 'social', 'brand'];
  }
  return ['invoice', 'checklist', 'spreadsheet', 'booking'];
}

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
      if (draftProduct(prof, type)) made++;
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

module.exports = {
  sweep,
  productsForTrend,
  generateProductsForTrend,
  freshnessPass,
  sampleUniverse,
  resolveProfessionForTrend,
  insertUniverseTrend
};
