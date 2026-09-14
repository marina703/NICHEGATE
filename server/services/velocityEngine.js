// ═══════════════════════════════════════════════════════════════════════════
// VELOCITY SCORING ENGINE
// Scores trends 0-100 based on phase, growth velocity, revenue potential,
// and time-window urgency. Used to rank what's worth activating.
// ═══════════════════════════════════════════════════════════════════════════

const PHASE_SCORES = {
  emerging: 0.90,
  rising:   1.00,
  hot:      0.85,
  peaking:  0.60,
  cooling:  0.30,
  dormant:  0.10
};

// "+450%/mo" → 450 | "3x" → 300 | "+180%" → 180
function parseVelocity(velocityStr) {
  if (!velocityStr) return 0;
  const match = String(velocityStr).match(/(\d+(?:\.\d+)?)/);
  if (!match) return 0;
  let val = parseFloat(match[1]);
  if (/x\s*$/i.test(String(velocityStr).trim()) && val <= 10) val = val * 100;
  return val;
}

// "$5k-12k" → { low: 5000, high: 12000, mid: 8500 } | "$500" → { low: 500, high: 750, mid: 625 }
// A number only counts as revenue when it is USD-prefixed ($) or 'k'-suffixed,
// so stray digits inside words/URLs no longer produce false revenue figures.
function parseRevenue(estRevenue) {
  const source = String(estRevenue || '');
  const nums = [];
  const re = /(\$)?(\d+(?:\.\d+)?)(k)?/gi;
  let m;
  while ((m = re.exec(source)) !== null) {
    const hasDollar = !!m[1];
    const isK = !!m[3];
    if (!hasDollar && !isK) continue;
    let n = parseFloat(m[2]);
    if (isK) n *= 1000;
    if (!Number.isFinite(n) || n <= 0) continue;
    nums.push(n);
  }

  if (nums.length === 0) return { low: 0, high: 0, mid: 0 };
  if (nums.length === 1) {
    const high = nums[0] * 1.5;
    return { low: nums[0], high, mid: (nums[0] + high) / 2 };
  }
  const low = Math.min(...nums);
  const high = Math.max(...nums);
  return { low, high, mid: (low + high) / 2 };
}

// Weighted composite: phase 35% | velocity 30% | revenue 25% | urgency 10%
function computeVelocityScore(trend) {
  if (!trend) return 0;

  const velocity  = parseVelocity(trend.velocity);
  const revenue   = parseRevenue(trend.est_revenue);
  const phase     = PHASE_SCORES[trend.phase] ?? 0.5;
  const windowDays = trend.window || 14;

  // Shorter window = more urgent (act now), capped at 1.5x
  const urgency = Math.min(1.5, 30 / Math.max(3, windowDays));

  const score =
    (phase * 0.35) +
    (Math.min(velocity, 500) / 500) * 0.30 +
    (Math.min(revenue.mid, 15000) / 15000) * 0.25 +
    (urgency / 1.5) * 0.10;

  return Math.round(score * 100);
}

function grade(score) {
  if (score >= 75) return 'A';
  if (score >= 55) return 'B';
  if (score >= 35) return 'C';
  return 'D';
}

function scoreTrends(rows) {
  return (rows || []).map(r => {
    const score = computeVelocityScore(r);
    return { ...r, score, grade: grade(score) };
  });
}

module.exports = { PHASE_SCORES, parseVelocity, parseRevenue, computeVelocityScore, grade, scoreTrends };
