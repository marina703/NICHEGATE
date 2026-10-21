// ═══════════════════════════════════════════════════════════════════════════
// COVER STUDIO — the generative cover pipeline in one call:
//   brand kit → style DNA → render (HTML→PNG) → invariant QA.
// Also exposes the publish gate. With COVER_GATE_MODE=invariants the gate
// judges QUALITY (legible, contrasted, un-clipped, non-blank) instead of
// sameness — which is what makes "endless design" shippable. Default stays
// 'critic' (the previous behaviour) so nothing changes unless opted in.
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const brandKit = require('./brandKit');
const styleDNA = require('./styleDNA');
const coverRenderer = require('./coverRenderer');
const invariants = require('./designInvariants');

const COVER_STUDIO_VERSION = 'cs-v1';

// Build a few honest selling bullets from the product + niche (no fake claims).
function bulletsFor(product = {}, prof = {}, content = {}) {
  if (Array.isArray(content.bullets) && content.bullets.length) return content.bullets.slice(0, 4);
  const type = String(product.type || 'product');
  const label = type.replace(/-/g, ' ');
  return [
    `Trade-true ${label} for ${prof.name || 'your business'}`,
    'Print-ready PDF · instant download',
    'Fill-in fields & clear structure',
    'Built to save you hours every week',
  ];
}

function coverContent(product = {}, prof = {}, extra = {}) {
  return {
    kicker: `NICHEGATE · ${String(product.type || 'PRODUCT').replace(/-/g, ' ').toUpperCase()}`,
    title: prof.name || product.name || 'NicheGate Product',
    subtitle: extra.subtitle || product.name || `${String(product.type || '').replace(/-/g, ' ')}`,
    brand: 'NicheGate',
    price: product.price || extra.price || '',
    bullets: bulletsFor(product, prof, extra),
    ...extra,
  };
}

// Generate a cover for one product. Returns { dna, pngPath, htmlPath, dom, qa }.
async function generateCover({ product = {}, prof = {}, content = {}, heroDataUri = null, recentHashes = [], outPath = null, size = 1200 } = {}) {
  const kit = brandKit.buildBrandKit(prof);
  const dna = styleDNA.composeDNA(product, prof, { kit, recentHashes });
  const payload = coverContent(product, prof, content);
  const rendered = await coverRenderer.renderCover({ product, prof, dna, content: payload, heroDataUri, outPath, size });
  const qa = await invariants.analyzeFile(rendered.pngPath, { dom: rendered.dom });
  return { dna, kit, ...rendered, qa, content: payload };
}

// The publish gate. Resolves { publishAllowed, status, reason, checks }.
// mode='invariants' → quality invariants (+ AI garbled verdict if available).
// mode='critic' (default) → delegate to designCritic (previous behaviour).
async function evaluateGate(product, opts = {}) {
  const mode = String(opts.mode || process.env.COVER_GATE_MODE || 'critic').toLowerCase();
  if (mode !== 'invariants') {
    const v = await require('./designCritic').critiqueCover(product && product.id, opts.criticOpts || {});
    return v || { publishAllowed: false, status: 'unscored', reason: 'cover critique unavailable' };
  }

  // invariants mode
  const path = product && (product.preview_path || product.cover_path);
  if (!path || !fs.existsSync(path)) {
    return { publishAllowed: false, status: 'fail', reason: 'no cover image to evaluate' };
  }
  // Optional AI garbled-text verdict (folded in only if it returns).
  let zeroGarbledText;
  try {
    const critic = await require('./designCritic').critiqueCover(product.id, opts.criticOpts || {});
    if (critic && typeof critic.zeroGarbledText === 'boolean') zeroGarbledText = critic.zeroGarbledText;
  } catch { /* AI optional in invariants mode */ }

  const qa = await invariants.analyzeFile(path, { zeroGarbledText, dom: readDom(path) });
  return {
    publishAllowed: qa.ok,
    status: qa.ok ? 'pass' : 'fail',
    reason: qa.ok ? null : qa.failures.join('; '),
    checks: qa.checks,
    metrics: qa.metrics,
    mode: 'invariants',
  };
}

// Read the DOM overflow metrics persisted beside a generated cover, if present.
function readDom(pngPath) {
  try {
    const mp = String(pngPath).replace(/\.png$/i, '.meta.json');
    if (fs.existsSync(mp)) return JSON.parse(fs.readFileSync(mp, 'utf8')).dom || null;
  } catch { /* ignore */ }
  return null;
}

module.exports = { COVER_STUDIO_VERSION, generateCover, evaluateGate, coverContent, bulletsFor };
