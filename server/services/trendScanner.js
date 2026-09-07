const { db } = require('../database');
const { computeVelocityScore, grade, scoreTrends } = require('./velocityEngine');

// ═══════════════════════════════════════════════════════════════════════════
// TREND SCANNER — detection, lifecycle, and scoring
// ═══════════════════════════════════════════════════════════════════════════

const TREND_POOL = [
  {name:"Cowboy Core Aesthetic",emoji:"🤠",phase:"hot",velocity:"+450%/mo",window:14,estRevenue:"$8k-15k",why:"Beyoncé Cowboy Carter + spring fashion cycle"},
  {name:"Mob Wife Aesthetic",emoji:"🕶️",phase:"peaking",velocity:"+200%",window:7,estRevenue:"$5k-10k",why:"TikTok fashion, leopard print + gold everything"},
  {name:"Micro Gardening",emoji:"🌱",phase:"rising",velocity:"+120%",window:30,estRevenue:"$3k-8k",why:"Spring + sustainability, apartment gardening boom"},
  {name:"Ballet Core",emoji:"🩰",phase:"rising",velocity:"+180%",window:21,estRevenue:"$4k-9k",why:"Fashion + fitness crossover, building steam"},
  {name:"Dopamine Decor",emoji:"🌈",phase:"hot",velocity:"+300%",window:18,estRevenue:"$6k-12k",why:"Maximalist colorful decor, anti-neutral backlash"},
  {name:"Tomato Girl Summer",emoji:"🍅",phase:"hot",velocity:"+250%",window:12,estRevenue:"$4k-8k",why:"Mediterranean summer aesthetic, viral on TikTok"},
  {name:"Silent Book Club",emoji:"📖",phase:"rising",velocity:"+90%",window:35,estRevenue:"$2k-5k",why:"Anti-book-club trend, reading alone together"},
  {name:"Cozy Core Winter",emoji:"🕯️",phase:"rising",velocity:"+160%",window:20,estRevenue:"$3k-8k",why:"Fall/winter cozy trend arriving early"},
  {name:"Stanley Cup Accessories",emoji:"🥤",phase:"peaking",velocity:"+180%",window:10,estRevenue:"$5k-12k",why:"Viral tumbler culture, personalization boom"},
  {name:"Bow Stacking",emoji:"🎀",phase:"hot",velocity:"+320%",window:14,estRevenue:"$4k-10k",why:"Coquette aesthetic, hair bows everywhere"},
  {name:"Grwm Everyday",emoji:"💄",phase:"rising",velocity:"+140%",window:25,estRevenue:"$3k-7k",why:"Get Ready With Me content monetization"},
  {name:"Digital Planner",emoji:"📓",phase:"hot",velocity:"+200%",window:28,estRevenue:"$5k-15k",why:"GoodNotes/Notability ecosystem growth"},
  {name:"Reusable Party Supplies",emoji:"🎉",phase:"rising",velocity:"+110%",window:22,estRevenue:"$3k-6k",why:"Anti-disposable party trend"},
  {name:"Clean Girl Aesthetic",emoji:"✨",phase:"hot",velocity:"+280%",window:16,estRevenue:"$4k-9k",why:"Minimalist beauty, slicked back bun era"},
  {name:"Underconsumption Core",emoji:"🧺",phase:"rising",velocity:"+130%",window:30,estRevenue:"$2k-5k",why:"Anti-haul movement, buying less stuff"}
];

// Detect and persist a new trend (skips ones already tracked).
// Tries the LIVE Google Trends radar first; falls back to the curated pool.
async function scanForTrends() {
  // 1. Live radar
  try {
    const radar = require('./trendRadar');
    const live = await radar.scanLiveTrends(3);
    if (live && live.length) {
      db.prepare('INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)')
        .run('trend_scan', `Live radar: ${live.length} new trending search(es)`, 'success');
      return live[0];
    }
  } catch (e) {
    console.error('[TRENDS] Live radar unavailable, using curated pool:', e.message);
  }

  // 2. Curated pool fallback
  const tracked = db.prepare('SELECT name FROM trends').all();
  const trackedNames = new Set(tracked.map(a => a.name));

  const available = TREND_POOL.filter(t => !trackedNames.has(t.name));
  if (available.length === 0) return null;

  const trend = available[Math.floor(Math.random() * available.length)];

  db.prepare(`
    INSERT INTO trends (name, emoji, phase, velocity, window, est_revenue, why, activated, detected_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
  `).run(trend.name, trend.emoji, trend.phase, trend.velocity, trend.window, trend.estRevenue, trend.why, new Date().toISOString());

  return db.prepare('SELECT * FROM trends WHERE name = ? ORDER BY id DESC LIMIT 1').get(trend.name);
}

function getActiveTrends() {
  return db.prepare('SELECT * FROM trends WHERE activated = 1 AND outcome IS NULL ORDER BY detected_at DESC').all();
}

function getTrendHistory() {
  return db.prepare('SELECT * FROM trends WHERE outcome IS NOT NULL ORDER BY detected_at DESC LIMIT 50').all();
}

function getAllTrends() {
  return db.prepare('SELECT * FROM trends ORDER BY detected_at DESC').all();
}

// Activate a trend: mark it live and spin up a temporary trend profession
function activateTrend(id) {
  const trend = db.prepare('SELECT * FROM trends WHERE id = ?').get(id);
  if (!trend) return null;

  db.prepare('UPDATE trends SET activated = 1, activated_at = ? WHERE id = ?')
    .run(new Date().toISOString(), id);

  const slug = trend.name.toLowerCase().replace(/\s+/g, '-');
  const existing = db.prepare('SELECT id FROM professions WHERE slug = ?').get(slug);
  if (existing) return db.prepare('SELECT * FROM professions WHERE id = ?').get(existing.id);

  const profId = 900 + Math.floor(Math.random() * 100);
  const hashtags = `["${trend.name.toLowerCase().replace(/\s/g, '')}","#trending","#viral","#etsyshop","#digitaldownload","#smallbusiness","#etsyfinds","#printable"]`;

  db.prepare(`
    INSERT OR IGNORE INTO professions (id, emoji, name, slug, status, tier, colors, services, hashtags)
    VALUES (?, ?, ?, ?, 'researching', 'trend', ?, ?, ?)
  `).run(
    profId,
    trend.emoji,
    trend.name,
    slug,
    '{"primary":"#1e293b","secondary":"#ec4899","accent":"#f59e0b","bg":"#fafafa"}',
    '[["Digital Template","$15"],["Complete Kit","$29"],["Trend Guide","$12"],["Social Pack","$19"],["Starter Bundle","$25"],["Pro Bundle","$39"]]',
    hashtags
  );

  return db.prepare('SELECT * FROM professions WHERE id = ?').get(profId);
}

function dismissTrend(id) {
  db.prepare("UPDATE trends SET outcome = 'dismissed' WHERE id = ?").run(id);
}

function archiveTrend(id) {
  db.prepare("UPDATE trends SET outcome = 'archived' WHERE id = ?").run(id);
}

// Attach score + grade to any list of trend rows
function withScores(rows) {
  return scoreTrends(rows);
}

module.exports = {
  TREND_POOL,
  scanForTrends,
  getActiveTrends,
  getTrendHistory,
  getAllTrends,
  activateTrend,
  dismissTrend,
  archiveTrend,
  withScores
};
