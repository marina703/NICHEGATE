// ═══════════════════════════════════════════════════════════════════════════
// VETTING LEARNER — self-improving vetting (Phase 6).
// Static weights are guesses; learned weights come from your own Gumroad
// outcomes. The moat: Exploding Topics never sees your sales — NicheGate
// does. Refit only touches the five numeric signals (demand, competition,
// margin, seasonality, longevity); specificity and shoppingIntent stay
// heuristic because their inputs are name/source text, not numeric features
// the learner can regress on. Logistic regression + L2, weights clamped ≥ 0
// and renormalized to sum to 1 so the composite score stays a 0-100 blend.
// ═══════════════════════════════════════════════════════════════════════════

const { db } = require('../database');
const vetting = require('./vettingEngine');

const SETTING_KEY = 'vetting_weights';
const LEARNABLE = ['demand', 'competition', 'margin', 'seasonality', 'longevity'];

function normalizeFeature(v) {
  const x = (Number(v) || 0) / 100; // signals are 0-100 → 0-1
  return Math.max(0, Math.min(1, x));
}

function getCustomWeights() {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(SETTING_KEY);
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value);
    if (!parsed || !Array.isArray(Object.keys(parsed.weights || {}))) return null;
    return parsed;
  } catch { return null; } // corrupt value = factory weights
}

const _weightsCache = { t: 0, val: null };

function getWeights() {
  if (_weightsCache.val && (Date.now() - _weightsCache.t) < 60000) return _weightsCache.val;
  const custom = getCustomWeights();
  const w = custom && custom.weights;
  let val;
  if (w && LEARNABLE.every(k => Number.isFinite(w[k])) &&
      Number.isFinite(w.specificity) && Number.isFinite(w.shoppingIntent)) {
    val = { ...w, learned: true, fittedAt: custom.fittedAt, n: custom.n };
  } else {
    val = { ...vetting.WEIGHTS, learned: false };
  }
  _weightsCache.t = Date.now(); _weightsCache.val = val;
  return val;
}

function resetWeights() {
  db.prepare('DELETE FROM settings WHERE key = ?').run(SETTING_KEY);
  _weightsCache.t = 0; _weightsCache.val = null;
}

// ── Training set from real outcomes ────────────────────────────────────────
// One example per activated (listed/published) product; outcome = ≥1 sale
// (metrics rows with product_id are written by the Gumroad sales sync).
function trainingSet({ windowDays = 90 } = {}) {
  const cutoff = new Date(Date.now() - windowDays * 86400000).toISOString();
  const rows = db.prepare(
    `SELECT p.id, p.profession_id, p.name AS product_name, p.type, p.price, p.created_at,
            pr.name AS niche_name
       FROM products p LEFT JOIN professions pr ON p.profession_id = pr.id
      WHERE p.status IN ('listed', 'published') AND p.created_at >= ?`
  ).all(cutoff);

  const out = [];
  for (const r of rows) {
    const soldRow = db.prepare('SELECT COUNT(*) AS n FROM metrics WHERE product_id = ? AND sales > 0').get(r.id);
    const vet = vetting.vetTrend({ name: r.niche_name || r.product_name });
    if (!vet) continue;
    out.push({
      productId: r.id,
      niche: r.niche_name,
      sold: soldRow.n > 0 ? 1 : 0,
      signals: vet.signals
    });
  }
  return out;
}

// ── Weight refit: logistic regression on normalized signals ───────────────
function fitWeights({ windowDays = 90, iterations = 300, lr = 0.3, l2 = 0.02 } = {}) {
  if (!Number.isFinite(windowDays) || windowDays <= 0) {
    return { fitted: false, reason: 'bad_window' };
  }
  const examples = trainingSet({ windowDays });
  // Need enough data AND both classes present to fit anything honest.
  if (examples.length < 20 || new Set(examples.map(e => e.sold)).size < 2) {
    return { fitted: false, reason: 'insufficient_data', n: examples.length, needBothClasses: true };
  }

  const feats = [...LEARNABLE];
  const X = examples.map(e => feats.map(f => normalizeFeature(e.signals[f])));
  const y = examples.map(e => e.sold);

  let w = feats.map(f => vetting.WEIGHTS[f]); // start at factory weights
  let b0 = 0;

  for (let it = 0; it < iterations; it++) {
    const grads = feats.map(() => 0);
    let gb0 = 0;
    for (let i = 0; i < X.length; i++) {
      let z = b0;
      for (let j = 0; j < feats.length; j++) z += w[j] * X[i][j];
      const p = 1 / (1 + Math.exp(-z));
      const err = p - y[i];
      for (let j = 0; j < feats.length; j++) grads[j] += err * X[i][j];
      gb0 += err;
    }
    for (let j = 0; j < feats.length; j++) {
      w[j] -= lr * (grads[j] / X.length + l2 * w[j]);
      w[j] = Math.max(0, Math.min(3, w[j]));
    }
    b0 -= lr * (gb0 / X.length);
  }

  // L2 pulls weights toward zero, not toward factory — renormalize so the
  // five learnable weights sum to 1 and the score stays a 0-100 blend.
  const sum = w.reduce((s, x) => s + x, 0);
  if (sum <= 0) return { fitted: false, reason: 'degenerate_fit' };
  const weights = {};
  feats.forEach((f, j) => { weights[f] = w[j] / sum; });

  // Heuristic signals keep their factory proportions within a fixed 20% share.
  const factory = vetting.WEIGHTS;
  const specShare = factory.specificity / (factory.specificity + factory.shoppingIntent);
  weights.specificity = 0.2 * specShare;
  weights.shoppingIntent = 0.2 * (1 - specShare);

  const total = Object.values(weights).reduce((s, x) => s + x, 0);
  if (total <= 0) return { fitted: false, reason: 'degenerate_fit' };
  for (const k of Object.keys(weights)) weights[k] = +(weights[k] / total).toFixed(4);

  const fit = {
    weights,
    fittedAt: new Date().toISOString(),
    n: examples.length,
    salesCount: examples.filter(e => e.sold === 1).length,
    windowDays
  };
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(SETTING_KEY, JSON.stringify(fit));
  _weightsCache.t = Date.now();
  _weightsCache.val = { ...weights, learned: true, fittedAt: fit.fittedAt, n: fit.n };
  return { fitted: true, ...fit };
}

function outcomeSummary({ windowDays = 90 } = {}) {
  const examples = trainingSet({ windowDays });
  return {
    activated: examples.length,
    sold: examples.filter(e => e.sold === 1).length,
    windowDays
  };
}

module.exports = { getWeights, resetWeights, fitWeights, trainingSet, outcomeSummary, LEARNABLE };
