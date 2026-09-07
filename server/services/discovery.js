// ═══════════════════════════════════════════════════════════════════════════
// DISCOVERY ENGINE — the autonomous "hunt" loop. Each sweep:
//   1. Live radar (Google/Reddit/Amazon/eBay) → real-time spikes
//   2. Niche Universe sampling → broad coverage across industries/hobbies
//   3. Seasonal focus → what's peaking this month
// New candidates are scored by the vetting engine before anything activates.
// Also generates fresh, trend-appropriate products when a niche is activated.
// ═══════════════════════════════════════════════════════════════════════════

const { db } = require('../database');
const radar = require('./trendRadar');
const { UNIVERSE } = require('./nicheUniverse');
const seasonal = require('./seasonalEngine');
const vetting = require('./vettingEngine');

// ── Niche universe sampling ──
function sampleUniverse(count = 4) {
  const tracked = new Set(db.prepare('SELECT name FROM trends').all().map(t => t.name));
  const available = UNIVERSE.filter(u => !tracked.has(u.name));
  // Shuffle for variety
  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [available[i], available[j]] = [available[j], available[i]];
  }
  return available.slice(0, count);
}

function insertUniverseTrend(entry) {
  const tracked = db.prepare('SELECT id FROM trends WHERE name = ?').get(entry.name);
  if (tracked) return null;
  db.prepare(`
    INSERT INTO trends (name, emoji, phase, velocity, window, est_revenue, why, activated, detected_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
  `).run(
    entry.name, entry.emoji || '🔎', entry.phase || 'emerging', entry.velocity || '+80%',
    entry.window || 40, entry.estRevenue || '$2k-6k',
    `Discovery · ${entry.category} · ${entry.why}`, new Date().toISOString()
  );
  return db.prepare('SELECT * FROM trends WHERE name = ?').get(entry.name);
}

// ── Full sweep ──
async function sweep(maxNew = 8) {
  const inserted = [];

  // 1. Live radar
  try {
    const live = await radar.scanLiveTrends(4);
    inserted.push(...live);
  } catch (e) { console.error('[DISCOVERY] live radar:', e.message); }

  // 2. Niche universe sampling (broad, all-industry coverage)
  for (const entry of sampleUniverse(6)) {
    if (inserted.length >= maxNew) break;
    try {
      const row = insertUniverseTrend(entry);
      if (row) inserted.push(row);
    } catch {}
  }

  // 3. Seasonal focus professions → ensure they're represented as trends too
  try {
    for (const prof of seasonal.getFocusProfessions()) {
      if (inserted.length >= maxNew) break;
      const row = insertUniverseTrend({
        name: `${prof.name} (seasonal)`, emoji: prof.emoji, category: 'seasonal',
        phase: 'rising', velocity: '+90%', window: 30, estRevenue: '$2k-6k',
        why: `${seasonal.getCurrentFocus().note}`
      });
      if (row) inserted.push(row);
    }
  } catch {}

  if (inserted.length) {
    db.prepare('INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)')
      .run('discovery_sweep', `Surfaced ${inserted.length} new niche(s)`, 'success');
  }
  return inserted;
}

// ── Trend → product generation (fresh, relevant products for a new niche) ──
const TYPE_PRICES = { invoice: '$12', checklist: '$10', spreadsheet: '$17', booking: '$22', social: '$15', brand: '$19', journal: '$15' };

function productsForTrend(trend) {
  const cat = (trend.why || '').toLowerCase();
  // Category-aware product mix so we offer what the niche actually wants
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
  if (/tech|app|digital|ai|software|template|online/.test(cat)) {
    return ['spreadsheet', 'checklist', 'social', 'brand'];
  }
  // Default service-business mix
  return ['invoice', 'checklist', 'spreadsheet', 'booking'];
}

// Generate a batch of products for a newly-activated trend profession
function generateProductsForTrend(profId, trend) {
  const prof = db.prepare('SELECT * FROM professions WHERE id = ?').get(profId);
  if (!prof) return 0;
  const types = productsForTrend(trend);
  let made = 0;
  for (const type of types) {
    try {
      db.prepare(`
        INSERT INTO products (profession_id, name, type, price, status, theme, html_content)
        VALUES (?, ?, ?, ?, 'draft', 'Onyx Volt', '<!-- auto-generated -->')
      `).run(profId, `${prof.name} ${type.charAt(0).toUpperCase() + type.slice(1)}`, type, TYPE_PRICES[type] || '$12');
      made++;
    } catch {}
  }
  db.prepare('INSERT INTO automation_log (action, profession_id, details, status) VALUES (?, ?, ?, ?)')
    .run('trend_products', profId, `Generated ${made} products for activated trend "${trend.name}"`, 'success');
  return made;
}

// Freshness pass — one new product variation for active trend professions
function freshnessPass() {
  const activeTrends = db.prepare("SELECT * FROM trends WHERE activated = 1 AND outcome IS NULL").all();
  if (!activeTrends.length) return 0;
  const trend = activeTrends[Math.floor(Math.random() * activeTrends.length)];
  const prof = db.prepare("SELECT * FROM professions WHERE name = ?").get(trend.name);
  if (!prof) return 0;
  const types = productsForTrend(trend);
  const type = types[Math.floor(Math.random() * types.length)];
  db.prepare(`
    INSERT INTO products (profession_id, name, type, price, status, theme, html_content)
    VALUES (?, ?, ?, ?, 'draft', 'Onyx Volt', '<!-- auto-generated -->')
  `).run(prof.id, `${prof.name} ${type.charAt(0).toUpperCase() + type.slice(1)}`, type, TYPE_PRICES[type] || '$12');
  return 1;
}

module.exports = { sweep, productsForTrend, generateProductsForTrend, freshnessPass, sampleUniverse };
