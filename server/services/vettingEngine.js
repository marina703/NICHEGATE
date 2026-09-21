// ============================================================================
// VETTING ENGINE — multi-signal scoring for niche discovery & vetting.
// Scores a niche 0-100 prioritizing high-margin, low-competition micro-niches.
// Only ACTIVATE-grade niches should burn file-factory / publish resources.
// ============================================================================

const { computeVelocityScore, parseRevenue } = require('./velocityEngine');
const radar = require('./trendRadar');

// Weights biased toward margin + low competition + specificity (micro-niches)
const WEIGHTS = {
  demand: 0.18,
  competition: 0.22,
  margin: 0.22,
  seasonality: 0.10,
  longevity: 0.08,
  specificity: 0.12,
  shoppingIntent: 0.08
};

const GENERIC_TERMS = /\b(template|business|service|digital|online|app|tool|guide|kit|pack|free|best|top|new|hot|viral|trending)\b/gi;
const SHOPPING_SOURCES = /etsy|amazon|ebay|pinterest|shopping|marketplace|gumroad/i;
const SERVICE_SOURCES = /reddit|universe|discovery|seasonal|trade|profession/i;

function scoreSpecificity(trend) {
  const name = String(trend.name || '').trim();
  const words = name.split(/\s+/).filter(Boolean);
  let score = 40;
  if (words.length >= 2) score += 15;
  if (words.length >= 3) score += 15;
  if (words.length >= 4) score += 10;
  if (name.length >= 18 && name.length <= 48) score += 10;
  const genericHits = (name.match(GENERIC_TERMS) || []).length;
  score -= genericHits * 12;
  if (/\b(for|for the|for a)\b/i.test(name)) score += 8;
  if (/core|aesthetic|girl|boy|vibes?$/i.test(name) && words.length <= 3) score -= 15;
  return Math.max(0, Math.min(100, score));
}

function scoreShoppingIntent(trend) {
  const why = String(trend.why || '');
  const src = why + ' ' + String(trend.source || '');
  // A stored intent tag (radar writes "intent=0.85") is the strongest signal
  const m = src.match(/intent=(\d+(?:\.\d+)?)/i);
  if (m) {
    const v = parseFloat(m[1]);
    if (Number.isFinite(v)) return Math.round(Math.max(0, Math.min(100, v * 100)));
  }
  if (SHOPPING_SOURCES.test(src)) return 85;
  if (SERVICE_SOURCES.test(src)) return 55;
  if (/google-trends|news/i.test(src)) return 35;
  return 45;
}

function grade(score) {
  if (score >= 75) return 'A';
  if (score >= 55) return 'B';
  if (score >= 35) return 'C';
  return 'D';
}

function vetTrend(trend) {
  if (!trend) return null;

  const velocity = computeVelocityScore(trend);
  const revenue = parseRevenue(trend.est_revenue);
  const phase = trend.phase;

  const demand = Math.min(100, velocity * 1.05);

  const phaseComp = { emerging: 12, rising: 28, hot: 52, peaking: 72, cooling: 88, dormant: 95, seasonal: 35, stable: 40 };
  let competition = 100 - (phaseComp[phase] || 50);
  // Micro-niche names imply less saturated template markets
  competition = Math.min(100, competition + scoreSpecificity(trend) * 0.15);

  // Margin: reward mid revenue that fits $10-29 digital goods (not fake $15k ceilings alone)
  const mid = revenue.mid || 0;
  const margin = Math.min(100, (mid / 12000) * 100 * 0.7 + (mid >= 2000 ? 30 : mid >= 500 ? 15 : 0));

  const windowDays = Math.max(3, trend.window || 14);
  const seasonality = Math.min(100, (28 / windowDays) * 90);
  const longevity = Math.min(100, windowDays * 2.2);

  const specificity = scoreSpecificity(trend);
  const shoppingIntent = scoreShoppingIntent(trend);

  const score =
    (demand * WEIGHTS.demand) +
    (competition * WEIGHTS.competition) +
    (margin * WEIGHTS.margin) +
    (seasonality * WEIGHTS.seasonality) +
    (longevity * WEIGHTS.longevity) +
    (specificity * WEIGHTS.specificity) +
    (shoppingIntent * WEIGHTS.shoppingIntent);

  const rounded = Math.round(score);
  const verdict = rounded >= 65 ? 'ACTIVATE' : rounded >= 45 ? 'WATCH' : 'SKIP';

  return {
    score: rounded,
    grade: grade(rounded),
    signals: {
      demand: Math.round(demand),
      competition: Math.round(competition),
      margin: Math.round(margin),
      seasonality: Math.round(seasonality),
      longevity: Math.round(longevity),
      specificity: Math.round(specificity),
      shoppingIntent: Math.round(shoppingIntent)
    },
    verdict,
    weights: { ...WEIGHTS }
  };
}

function shouldActivate(trend, threshold = 65) {
  const vet = vetTrend(trend);
  return !!(vet && vet.score >= threshold && vet.verdict === 'ACTIVATE');
}

/** Strict gate before fileFactory / product generation. Throws on SKIP. */
function assertActivatable(trend, opts = {}) {
  const force = !!(opts && opts.force);
  const vet = vetTrend(trend);
  if (!vet) {
    const err = new Error('Trend missing — cannot activate');
    err.vet = null;
    throw err;
  }
  if (force) return vet;
  if (vet.verdict === 'SKIP') {
    const err = new Error('Niche vetting score too low to activate');
    err.vet = vet;
    err.code = 'VET_SKIP';
    throw err;
  }
  if (vet.verdict === 'WATCH' && !opts.allowWatch) {
    const err = new Error('Niche is WATCH-grade — pass force=1 to override');
    err.vet = vet;
    err.code = 'VET_WATCH';
    throw err;
  }
  return vet;
}

function isProductizable(trend) {
  const vet = vetTrend(trend);
  return !!(vet && vet.verdict !== 'SKIP');
}


// Layer 3 gate: query Etsy active-listing count for a niche name. Passes when
// the niche is NOT oversaturated (count < ~3000). Unknown/errored => pass (so a
// broken key never silently blocks the whole pipeline).
const _satCache = new Map();
async function etsySaturationGate(name, opts) {
  const maxAge = (opts && opts.maxAgeMs) || 3600000;
  const cached = _satCache.get(name);
  if (cached && (Date.now() - cached.t) < maxAge) return cached.result;
  let result;
  try {
    const s = await radar.fetchEtsySaturation(name);
    if (!s) result = { pass: true, unknown: true, reason: 'etsy api unavailable' };
    else result = { pass: s.saturation >= 0.3, count: s.count, saturation: s.saturation, unknown: false };
  } catch (e) {
    result = { pass: true, unknown: true, reason: e.message };
  }
  _satCache.set(name, { t: Date.now(), result });
  return result;
}

module.exports = {
  vetTrend,
  shouldActivate,
  assertActivatable,
  isProductizable,
  scoreSpecificity,
  scoreShoppingIntent,
  etsySaturationGate,
  WEIGHTS
};
