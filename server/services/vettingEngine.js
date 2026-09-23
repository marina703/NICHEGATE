// ============================================================================
// VETTING ENGINE — multi-signal scoring for niche discovery & vetting.
// Scores a niche 0-100 prioritizing high-margin, low-competition micro-niches.
// Only ACTIVATE-grade niches should burn file-factory / publish resources.
// ============================================================================

const { computeVelocityScore, parseRevenue } = require('./velocityEngine');
const radar = require('./trendRadar');

// PHASE 3: measured signals from the snapshot series replace assumptions
// where data exists. Returns partial overrides; nulls mean "keep the heuristic".
function measuredSignals(trend) {
  const out = {};
  try {
    const key = trend.trend_key || radar.normalizeNicheKey(trend.name);
    if (!key) return out;
    // Longevity: weeks of observed history (capped) beats a window guess.
    const series = radar.seriesFor(key);
    if (series.length >= 2) out.longevity = Math.min(100, series.length * 12);
    // Seasonality: detect a single dominant month across observed peaks —
    // real concentration beats the 28/windowDays heuristic.
    const months = new Set(series.map(r => String(r.week).slice(5, 7)));
    if (series.length >= 6 && months.size <= 2) out.seasonality = 85;
    // Demand: real WoW growth (when measured) is a better demand input than
    // the composite velocity proxy.
    const g = radar.growthFromSnapshots(key);
    if (g && g.wowPct != null) {
      out.demand = Math.max(0, Math.min(100, 50 + g.wowPct / 2));
      out.breakout = radar.breakoutScore(key);
    }
  } catch { /* never throw from vetting — heuristics remain */ }
  return out;
}

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

// PHASE 6 — GAP SCORING. Saturation counts listings; gap scores how BEATABLE
// the incumbents are. A niche with 900 stale, low-favorite, cheap listings is
// a better bet than 200 polished bestsellers. Weak-incumbent quality is a
// POSITIVE competition signal. vetTrend stays synchronous, so gap data is
// cache-fed: fetches warm the cache in the background and the next vet cycle
// uses the measured value — the same eventual-measurement pattern as trends.
const _gapCache = new Map();
const _gapWarming = new Set();

// Pure math: incumbent weakness 0-100 from Etsy listing stats.
// Fewer favorites + older + higher-price-floor listings = weaker competition.
function gapFromSaturation(s) {
  if (!s || !Number.isFinite(s.avgFavorites)) return null; // unknown => keep heuristic
  const avgFav = Math.max(0, Number(s.avgFavorites) || 0);
  const avgPrice = Math.max(0, Number(s.avgPrice) || 0);
  const avgAge = Math.max(0, Number(s.avgAgeDays) || 0);
  const favWeak = avgFav <= 30 ? 100 : avgFav >= 500 ? 0 : Math.round(100 - ((avgFav - 30) / 470) * 100);
  const ageWeak = avgAge >= 365 ? 100 : avgAge <= 30 ? 0 : Math.round(((avgAge - 30) / 335) * 100);
  const priceWeak = avgPrice >= 12 ? 100 : avgPrice <= 3 ? 0 : Math.round(((avgPrice - 3) / 9) * 100);
  const weakness = Math.round(favWeak * 0.5 + ageWeak * 0.3 + priceWeak * 0.2);
  return {
    avgFavorites: avgFav,
    avgPrice: +avgPrice.toFixed(2),
    avgAgeDays: Math.round(avgAge),
    weakness,
    measured: true
  };
}

// Sync read for vetTrend; kicks off a background refresh when stale/missing.
function incumbentQuality(name) {
  const key = String(name || '').trim();
  if (!key) return null;
  const cached = _gapCache.get(key);
  if (cached && (Date.now() - cached.t) < 6 * 3600000) return cached.result;
  if (!_gapWarming.has(key)) {
    _gapWarming.add(key);
    Promise.resolve(radar.fetchEtsySaturation(key))
      .then(s => _gapCache.set(key, { t: Date.now(), result: gapFromSaturation(s) }))
      .catch(() => _gapCache.set(key, { t: Date.now(), result: null }))
      .finally(() => _gapWarming.delete(key));
  }
  return cached ? cached.result : null;
}

// Test/dev seam: pre-seed the cache with known saturation data (the same
// shape the background fetch writes), making vetTrend deterministic.
function seedGap(name, saturationData) {
  const key = String(name || '').trim();
  if (!key) return false;
  _gapCache.set(key, { t: Date.now(), result: gapFromSaturation(saturationData) });
  return true;
}
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

  const demand0 = Math.min(100, velocity * 1.05);

  const phaseComp = { emerging: 12, rising: 28, hot: 52, peaking: 72, cooling: 88, dormant: 95, seasonal: 35, stable: 40 };
  let competition = 100 - (phaseComp[phase] || 50);
  // Micro-niche names imply less saturated template markets
  competition = Math.min(100, competition + scoreSpecificity(trend) * 0.15);

  // PHASE 6: measured incumbent weakness overrides the phase label when the
  // Etsy listing data exists — weak incumbents = low competition (gap to win).
  const gap = incumbentQuality(String(trend.name || ''));
  if (gap) competition = gap.weakness;

  // Margin: reward mid revenue that fits $10-29 digital goods (not fake $15k ceilings alone)
  const mid = revenue.mid || 0;
  const margin = Math.min(100, (mid / 12000) * 100 * 0.7 + (mid >= 2000 ? 30 : mid >= 500 ? 15 : 0));

  const windowDays = Math.max(3, trend.window || 14);
  const seasonalityH = Math.min(100, (28 / windowDays) * 90);
  const longevityH = Math.min(100, windowDays * 2.2);

  const specificity = scoreSpecificity(trend);
  const shoppingIntent = scoreShoppingIntent(trend);

  // Measured overrides win where the snapshot series has data (Phase 3).
  const measured = measuredSignals(trend);
  const demand = measured.demand ?? demand0;
  const longevity = measured.longevity ?? longevityH;
  const seasonality = measured.seasonality ?? seasonalityH;
  const breakout = measured.breakout || null;

  // PHASE 6: learned weights (fitted from real sale outcomes) win when they
  // exist; factory weights are the fallback. Lazy require breaks the
  // vettingLearner → vettingEngine cycle at load time.
  let W = WEIGHTS;
  let learned = false;
  try {
    const lw = require('./vettingLearner').getWeights();
    if (lw && lw.learned) { W = lw; learned = true; }
  } catch { /* factory weights on any issue */ }

  const score =
    (demand * W.demand) +
    (competition * W.competition) +
    (margin * W.margin) +
    (seasonality * W.seasonality) +
    (longevity * W.longevity) +
    (specificity * W.specificity) +
    (shoppingIntent * W.shoppingIntent);

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
    measured: {
      demand: measured.demand != null,
      longevity: measured.longevity != null,
      seasonality: measured.seasonality != null,
      breakoutZ: breakout && breakout.z != null ? breakout.z : null,
      breakout: !!(breakout && breakout.breakout),
      gap: gap ? { weakness: gap.weakness, avgFavorites: gap.avgFavorites, avgAgeDays: gap.avgAgeDays } : null
    },
    verdict,
    weights: { demand: W.demand, competition: W.competition, margin: W.margin, seasonality: W.seasonality, longevity: W.longevity, specificity: W.specificity, shoppingIntent: W.shoppingIntent },
    learnedWeights: learned
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
  measuredSignals,
  incumbentQuality,
  gapFromSaturation,
  seedGap,
  etsySaturationGate,
  WEIGHTS
};
