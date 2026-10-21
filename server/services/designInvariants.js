// ═══════════════════════════════════════════════════════════════════════════
// DESIGN INVARIANTS — quality checks that hold for ANY style. This replaces
// "does the cover match one expected layout" (which forbids variety) with
// "is the cover legible, legible-as-a-thumbnail, high-contrast, un-clipped and
// non-empty". Endless design is only possible if the gate judges quality, not
// sameness. Garbled-text detection stays in the AI cover critic; this module is
// the deterministic pixel-level backstop.
// ═══════════════════════════════════════════════════════════════════════════

const INVARIANTS_VERSION = 'inv-v1';

// Env-tunable thresholds. Defaults are conservative but style-agnostic.
const T = {
  minStdDev: Number(process.env.INV_MIN_STDDEV || 7),        // blank detection
  minContrast: Number(process.env.INV_MIN_CONTRAST || 3.0),  // p95 vs p5 luminance ratio
  minEdgeEnergy: Number(process.env.INV_MIN_EDGE || 0.02),   // thumbnail legibility = fraction of strong edges (min 2%)
  minInkCoverage: Number(process.env.INV_MIN_INK || 0.008),  // fraction of "dark" pixels
  maxEdgeTouch: Number(process.env.INV_MAX_EDGE_TOUCH || 0.98), // clipping
};

// ── luminance helpers (operate on a greyscale raw buffer) ───────────────────
function statsFromGray(data) {
  let sum = 0, sumSq = 0, min = 255, max = 0;
  const n = data.length;
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) {
    const v = data[i];
    sum += v; sumSq += v * v;
    if (v < min) min = v;
    if (v > max) max = v;
    hist[v]++;
  }
  const mean = sum / n;
  const variance = Math.max(0, sumSq / n - mean * mean);
  const stdDev = Math.sqrt(variance);
  const pct = (p) => {
    const target = p * n;
    let acc = 0;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= target) return v; }
    return 255;
  };
  return { mean, stdDev, min, max, p5: pct(0.05), p95: pct(0.95), hist };
}

// Fraction of pixels whose local gradient exceeds a strong-edge threshold.
// This distinguishes "flat but has crisp legible text" (real covers ~5%) from
// "totally blank" (0%) — mean gradient unfairly penalises minimal layouts.
function strongEdgeFraction(data, width, height, thr = 24) {
  let strong = 0, count = 0;
  for (let y = 1; y < height; y++) {
    for (let x = 1; x < width; x++) {
      const i = y * width + x;
      const d = Math.max(Math.abs(data[i] - data[i - 1]), Math.abs(data[i] - data[i - width]));
      if (d > thr) strong++;
      count++;
    }
  }
  return count ? strong / count : 0;
}

// Mean absolute difference between neighbouring pixels — kept for metrics/debug.
function edgeEnergy(data, width, height) {
  let sum = 0, count = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 1; x < width; x++) {
      sum += Math.abs(data[y * width + x] - data[y * width + x - 1]);
      count++;
    }
  }
  for (let y = 1; y < height; y++) {
    for (let x = 0; x < width; x++) {
      sum += Math.abs(data[y * width + x] - data[(y - 1) * width + x]);
      count++;
    }
  }
  return count ? sum / count / 255 : 0;
}

function contrastRatio(p5, p95) {
  const L = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const a = L(Math.max(p5, p95));
  const b = L(Math.min(p5, p95));
  return (a + 0.05) / (b + 0.05);
}

// ── MAIN: analyze a rendered cover/design PNG buffer ────────────────────────
// Returns { ok, checks:[{name, ok, detail}], failures:[], metrics }.
async function analyze(buffer, opts = {}) {
  const sharp = opts.sharp || require('sharp');
  const checks = [];
  const push = (name, ok, detail) => checks.push({ name, ok, detail });

  // Full-size greyscale for luminance stats.
  const full = await sharp(buffer).greyscale().raw().toBuffer({ resolveWithObject: true });
  const s = statsFromGray(full.data);

  push('nonBlank', s.stdDev >= T.minStdDev,
    `stdDev=${s.stdDev.toFixed(1)} (min ${T.minStdDev})`);

  const cr = contrastRatio(s.p5, s.p95);
  push('contrast', cr >= T.minContrast,
    `ratio=${cr.toFixed(2)}:1 (min ${T.minContrast})`);

  // Ink coverage: fraction of pixels clearly darker than the page mean. Guards
  // against "a single tiny word floating in a sea of white".
  let ink = 0;
  const inkThreshold = Math.max(20, s.mean - 45);
  for (let i = 0; i < full.data.length; i++) if (full.data[i] <= inkThreshold) ink++;
  const inkCoverage = ink / full.data.length;
  push('inkCoverage', inkCoverage >= T.minInkCoverage,
    `coverage=${(inkCoverage * 100).toFixed(1)}% (min ${(T.minInkCoverage * 100).toFixed(1)}%)`);

  // Thumbnail legibility: shrink to 250px wide, measure strong-edge coverage.
  const thumb = await sharp(buffer).greyscale().resize({ width: 250 }).raw().toBuffer({ resolveWithObject: true });
  const sef = strongEdgeFraction(thumb.data, thumb.info.width, thumb.info.height);
  const ee = edgeEnergy(thumb.data, thumb.info.width, thumb.info.height);
  push('thumbnailLegibility', sef >= T.minEdgeEnergy,
    `strongEdges=${(sef * 100).toFixed(1)}% (min ${(T.minEdgeEnergy * 100).toFixed(1)}%)`);

  // Clipping: if provided rendered DOM metrics, check overflow. Otherwise skip
  // (pixel-only analysis cannot reliably detect intent vs. bleed).
  if (opts.dom) {
    const { scrollWidth, clientWidth, scrollHeight, clientHeight } = opts.dom;
    const overflowX = scrollWidth > clientWidth + 2;
    const overflowY = scrollHeight > clientHeight + 2;
    push('noClipping', !overflowX && !overflowY,
      `scroll ${scrollWidth}x${scrollHeight} vs client ${clientWidth}x${clientHeight}`);
  }

  // Optional AI garbled-text verdict (from coverCritic) folded in when present.
  if (typeof opts.zeroGarbledText === 'boolean') {
    push('zeroGarbledText', opts.zeroGarbledText, 'from AI cover critic');
  }

  const failures = checks.filter(c => !c.ok).map(c => `${c.name}: ${c.detail}`);
  return {
    ok: failures.length === 0,
    checks,
    failures,
    metrics: { stdDev: +s.stdDev.toFixed(2), contrast: +cr.toFixed(2), inkCoverage: +inkCoverage.toFixed(4), strongEdges: +sef.toFixed(4), edgeEnergy: +ee.toFixed(4) },
  };
}

// Convenience: analyze a file path.
async function analyzeFile(p, opts = {}) {
  const fs = require('fs');
  return analyze(fs.readFileSync(p), opts);
}

module.exports = { INVARIANTS_VERSION, T, analyze, analyzeFile, contrastRatio, edgeEnergy, statsFromGray };
