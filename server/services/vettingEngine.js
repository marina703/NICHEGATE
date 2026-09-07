// ═══════════════════════════════════════════════════════════════════════════
// VETTING ENGINE — multi-signal scoring for niche discovery & vetting.
// Scores a niche 0-100 on demand potential, competition, margin, seasonality,
// and longevity. Only high-scoring niches get activated by the autonomous agent.
// ═══════════════════════════════════════════════════════════════════════════

const { computeVelocityScore, parseRevenue } = require('./velocityEngine');

// Weights for the composite vetting score
const WEIGHTS = {
  demand:      0.30,   // how much search/demand exists
  competition: 0.25,   // inverse — lower competition = better
  margin:      0.20,   // price point / revenue potential
  seasonality: 0.15,   // is now the right season?
  longevity:   0.10    // how long the window stays open
};

// Vetting signals for a trend/niche
function vetTrend(trend) {
  if (!trend) return null;

  const velocity = computeVelocityScore(trend);
  const revenue = parseRevenue(trend.est_revenue);
  const phase = trend.phase;

  // Demand: velocity score is a strong proxy
  const demand = Math.min(100, velocity * 1.1);

  // Competition: inverse of phase maturity (emerging = low competition)
  const phaseComp = { emerging: 15, rising: 30, hot: 55, peaking: 75, cooling: 90, dormant: 95 };
  const competition = 100 - (phaseComp[phase] || 50);

  // Margin: revenue midpoint vs. $15k ceiling
  const margin = Math.min(100, (revenue.mid / 15000) * 100);

  // Seasonality: shorter window = more seasonal/urgent (higher score now)
  const seasonality = Math.min(100, (30 / Math.max(3, trend.window || 14)) * 100);

  // Longevity: longer window = more durable (higher score)
  const longevity = Math.min(100, (trend.window || 14) * 3);

  const score =
    (demand * WEIGHTS.demand) +
    (competition * WEIGHTS.competition) +
    (margin * WEIGHTS.margin) +
    (seasonality * WEIGHTS.seasonality) +
    (longevity * WEIGHTS.longevity);

  const rounded = Math.round(score);

  return {
    score: rounded,
    grade: grade(rounded),
    signals: { demand, competition, margin, seasonality, longevity },
    verdict: rounded >= 65 ? 'ACTIVATE' : rounded >= 45 ? 'WATCH' : 'SKIP'
  };
}

function grade(score) {
  if (score >= 75) return 'A';
  if (score >= 55) return 'B';
  if (score >= 35) return 'C';
  return 'D';
}

// Vetting gate: should the agent activate this niche?
function shouldActivate(trend, threshold = 65) {
  const vet = vetTrend(trend);
  return vet && vet.score >= threshold;
}

module.exports = { vetTrend, shouldActivate, WEIGHTS };
