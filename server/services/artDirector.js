// ═══════════════════════════════════════════════════════════════════════════
// ART DIRECTOR — replaces style *picking* with style *inventing* (Phase 2).
//
// For each product the model writes a DESIGN BRIEF (strict JSON): mood, a full
// palette, a font pairing, one signature motif + safe motif CSS, layout,
// whitespace and texture. Builders keep working exactly as before — the brief
// is applied as an override layer on the theme/DNA object they already accept
// (applyBriefToTheme), so the deterministic 8-style path is the fallback and
// nothing regenerates content.
//
// Two hard gates sit in front of every brief:
//   1. NOVELTY GATE — reject a brief whose palette is within a small ΔE of a
//      recent same-niche product, or whose mood/motif words repeat (then one
//      regeneration attempt, else fall back to deterministic styles).
//   2. EDITOR-SAFETY LINT — a SECURITY gate: only hex colour tokens and
//      font-family names may be injected. Anything containing url(, @import,
//      expression(, position:fixed, etc. is rejected.
//
// Never throws upstream: any failure returns null and the caller keeps the
// deterministic path (MODEL_ENABLED=false → zero calls, zero cost).
// ═══════════════════════════════════════════════════════════════════════════

const { db } = require('../database');
const router = require('./modelRouter');
const cfg = require('./modelConfig');
const designStyles = require('./designStyles');

// ── visual motif library (per niche category) ────────────────────────────
// Signature decorative elements derived from the niche itself — topographic
// lines for surveying, grain/flour textures for baking, blueprint grids for
// contractors. Pure CSS/data, no assets.
const VISUAL_MOTIFS = {
  creator: [
    { motif: 'polaroid stack', css: 'border-radius:2px;box-shadow:0 6px 18px rgba(0,0,0,0.12)' },
    { motif: 'notification pill row', css: 'border-radius:999px' },
    { motif: 'torn paper edge', css: 'clip-path:polygon(0 2%,100% 0,100% 98%,0 100%)' }
  ],
  tech: [
    { motif: 'circuit grid', css: 'background-image:linear-gradient(rgba(255,255,255,0.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.06) 1px,transparent 1px);background-size:16px 16px' },
    { motif: 'terminal caret', css: 'border-left:3px solid currentColor' },
    { motif: 'data chip', css: 'border-radius:4px;font-family:monospace' }
  ],
  trades: [
    { motif: 'blueprint grid', css: 'background-image:linear-gradient(rgba(20,80,140,0.10) 1px,transparent 1px),linear-gradient(90deg,rgba(20,80,140,0.10) 1px,transparent 1px);background-size:20px 20px' },
    { motif: 'measured rule ticks', css: 'border-bottom:2px solid currentColor' },
    { motif: 'hazard stripe', css: 'background-image:repeating-linear-gradient(45deg,currentColor 0 8px,transparent 8px 16px)' }
  ],
  finance: [
    { motif: 'ledger rules', css: 'border-bottom:1px solid currentColor' },
    { motif: 'percent stamp', css: 'border:2px solid currentColor;border-radius:999px' },
    { motif: 'rising step chart', css: 'clip-path:polygon(0 100%,30% 70%,55% 80%,80% 40%,100% 20%,100% 100%)' }
  ],
  outdoor: [
    { motif: 'topographic contour lines', css: 'background-image:repeating-radial-gradient(circle at 30% 40%,transparent 0 12px,currentColor 12px 13px);opacity:0.12' },
    { motif: 'compass rose mark', css: 'border:1px solid currentColor;border-radius:50%' },
    { motif: 'trail dashed line', css: 'border-bottom:2px dashed currentColor' }
  ],
  food: [
    { motif: 'flour grain texture', css: 'background-image:radial-gradient(currentColor 0.5px,transparent 0.5px);background-size:6px 6px;opacity:0.10' },
    { motif: 'gingham check', css: 'background-image:linear-gradient(45deg,currentColor 25%,transparent 25% 75%,currentColor 75%),linear-gradient(45deg,currentColor 25%,transparent 25% 75%,currentColor 75%);background-size:12px 12px;opacity:0.08' },
    { motif: 'recipe card notch', css: 'border-radius:8px 8px 2px 2px' }
  ],
  home: [
    { motif: 'linen weave', css: 'background-image:repeating-linear-gradient(0deg,currentColor 0 1px,transparent 1px 4px),repeating-linear-gradient(90deg,currentColor 0 1px,transparent 1px 4px);opacity:0.06' },
    { motif: 'arch doorway', css: 'border-radius:999px 999px 0 0' },
    { motif: 'tile grid', css: 'background-image:linear-gradient(currentColor 1px,transparent 1px),linear-gradient(90deg,currentColor 1px,transparent 1px);background-size:24px 24px;opacity:0.07' }
  ],
  wellness: [
    { motif: 'breath circle', css: 'border-radius:50%;border:2px solid currentColor' },
    { motif: 'soft wave', css: 'border-radius:999px 999px 0 0' },
    { motif: 'lotus dot row', css: 'border-radius:50%' }
  ],
  recovery: [
    { motif: 'milestone path', css: 'border-left:2px solid currentColor' },
    { motif: 'serenity ripple', css: 'border-radius:50%;border:1px solid currentColor' },
    { motif: 'daily page stitch', css: 'border-left:4px double currentColor' }
  ],
  beauty: [
    { motif: 'silk sheen', css: 'background-image:linear-gradient(120deg,transparent 20%,currentColor 45%,transparent 70%);opacity:0.08' },
    { motif: 'mirror arch', css: 'border-radius:999px 999px 0 0' },
    { motif: 'petal scatter', css: 'border-radius:60% 40% 55% 45%' }
  ],
  fitness: [
    { motif: 'reps counter block', css: 'border-radius:6px;font-weight:800' },
    { motif: 'track lanes', css: 'background-image:repeating-linear-gradient(90deg,currentColor 0 2px,transparent 2px 18px);opacity:0.10' },
    { motif: 'bold chevron', css: 'clip-path:polygon(0 0,80% 0,100% 50%,80% 100%,0 100%,20% 50%)' }
  ],
  spiritual: [
    { motif: 'stained glass panel', css: 'border:2px solid currentColor;border-radius:999px 999px 0 0' },
    { motif: 'illuminated rule', css: 'border-bottom:3px double currentColor' },
    { motif: 'manuscript margin', css: 'border-left:2px solid currentColor' }
  ],
  craft: [
    { motif: 'stitch dashes', css: 'border-bottom:2px dashed currentColor' },
    { motif: 'handmade stamp', css: 'border:2px solid currentColor;border-radius:4px' },
    { motif: 'swatch squares', css: 'background-image:linear-gradient(90deg,currentColor 25%,transparent 25% 50%,currentColor 50% 75%,transparent 75%);background-size:16px 16px;opacity:0.10' }
  ],
  pyro: [
    { motif: 'fuse spiral', css: 'border-radius:50%;border:2px dashed currentColor' },
    { motif: 'shell burst rays', css: 'background-image:repeating-conic-gradient(currentColor 0 6deg,transparent 6deg 24deg);opacity:0.10' },
    { motif: 'rack rails', css: 'border-top:3px solid currentColor' }
  ],
  fashion: [
    { motif: 'runway stripe', css: 'background-image:linear-gradient(90deg,currentColor 0 4px,transparent 4px 12px);opacity:0.10' },
    { motif: 'lookbook frame', css: 'border:1px solid currentColor' }
  ],
  default: [
    { motif: 'editorial rule', css: 'border-bottom:2px solid currentColor' },
    { motif: 'corner tick', css: 'border-top:2px solid currentColor;border-left:2px solid currentColor' },
    { motif: 'dot grid', css: 'background-image:radial-gradient(currentColor 0.5px,transparent 0.5px);background-size:8px 8px;opacity:0.08' }
  ]
};

function pickMotifs(nicheKey) {
  return VISUAL_MOTIFS[nicheKey] || VISUAL_MOTIFS.default;
}

// ── security lint (editor-safety) ───────────────────────────────────────
// This is a SECURITY gate, not a style gate. Only hex colour tokens and
// font-family names may survive. Anything URL-loading, scripty or
// position-escaping is rejected.

const FORBIDDEN_CSS = /url\s*\(|@import|@font-face|@media|expression\s*\(|behavior\s*:|javascript:|data:|<|>|\\|\/\*|\*\*|position\s*:\s*(fixed|sticky)|!\s*important|--[a-z]/i;

// Properties that may appear in injected decorative CSS (cosmetic only).
const SAFE_CSS_PROPS = new Set([
  'color', 'background', 'background-color', 'background-image', 'background-size', 'background-position',
  'border', 'border-color', 'border-top', 'border-bottom', 'border-left', 'border-right',
  'border-radius', 'border-style', 'border-width', 'box-shadow', 'text-shadow',
  'opacity', 'letter-spacing', 'word-spacing', 'line-height', 'font-size', 'font-weight',
  'font-style', 'font-family', 'text-transform', 'text-align', 'text-decoration',
  'padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
  'margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
  'clip-path', 'transform', 'max-width', 'min-height', 'width', 'height'
]);

// Value charset: hex colours, units, percentages, commas/parens for simple
// gradients — nothing that can escape or load a resource.
const SAFE_CSS_VALUE = /^[#a-z0-9%,.\s()\/\-]*$/i;

function sanitizeCssDeclarations(css) {
  const out = [];
  for (const decl of String(css || '').split(';')) {
    const d = decl.trim();
    if (!d) continue;
    if (FORBIDDEN_CSS.test(d)) continue;
    const m = /^([-a-z]+)\s*:\s*(.+)$/i.exec(d);
    if (!m) continue;
    const prop = m[1].toLowerCase().trim();
    const value = m[2].trim();
    if (!SAFE_CSS_PROPS.has(prop)) continue;
    if (!SAFE_CSS_VALUE.test(value)) continue;
    if (value.length > 160) continue;
    out.push(`${prop}:${value}`);
  }
  return out.join(';');
}

function sanitizeFontName(name) {
  const n = String(name || '').trim().replace(/^['"]+|['"]+$/g, '');
  if (!/^[A-Za-z0-9][A-Za-z0-9 \-]{1,39}$/.test(n)) return null;
  return n;
}

function sanitizeHex(value) {
  const v = String(value || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    return ('#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3]).toLowerCase();
  }
  return null;
}

const LAYOUTS = new Set(['classic', 'sidebar', 'full-bleed', 'asymmetric', 'zine']);
const WHITESPACE = new Set(['tight', 'normal', 'generous']);

// Parse the model's strict-JSON reply into a validated brief, or null.
// Defensive parsing mirrors conceptEngine.parseConcept.
function parseBrief(text) {
  if (!text) return null;
  const cleaned = String(text)
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  let obj;
  try { obj = JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
  return sanitizeBrief(obj);
}

// Validate + sanitize a raw brief object. Returns a clean brief or null.
function sanitizeBrief(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const palette = {};
  const raw = obj.palette && typeof obj.palette === 'object' ? obj.palette : {};
  for (const key of ['primary', 'secondary', 'accent', 'bg', 'surface', 'border']) {
    const hex = sanitizeHex(raw[key]);
    if (hex) palette[key] = hex;
  }
  if (Object.keys(palette).length < 3) return null; // a palette is the core of the brief

  const fonts = {};
  const rawFonts = obj.fonts && typeof obj.fonts === 'object' ? obj.fonts : {};
  for (const key of ['heading', 'body', 'mono']) {
    const f = sanitizeFontName(rawFonts[key]);
    if (f) fonts[key] = f;
  }
  if (!fonts.heading || !fonts.body) return null;

  const mood = Array.isArray(obj.mood)
    ? obj.mood.map(w => String(w || '').toLowerCase().replace(/[^a-z0-9 \-]/g, '').trim().slice(0, 24)).filter(Boolean).slice(0, 5)
    : [];

  const motif = String(obj.motif || '').replace(/[^a-z0-9 \-]/gi, '').trim().slice(0, 60);
  const motifCss = sanitizeCssDeclarations(obj.motif_css);
  const textureRaw = obj.texture;
  let texture = null;
  if (typeof textureRaw === 'string' && textureRaw.trim()) {
    const kw = textureRaw.trim().toLowerCase();
    if (['none', 'paper', 'grid', 'grain', 'linen', 'blueprint', 'silk'].includes(kw)) {
      texture = kw;
    } else {
      const decl = sanitizeCssDeclarations('background:' + textureRaw);
      if (decl) texture = decl;
    }
  }

  return {
    mood,
    palette,
    fonts,
    font_reason: String(obj.font_reason || '').slice(0, 200).trim() || null,
    motif: motif || null,
    motif_css: motifCss || null,
    layout: LAYOUTS.has(String(obj.layout)) ? String(obj.layout) : 'classic',
    whitespace: WHITESPACE.has(String(obj.whitespace)) ? String(obj.whitespace) : 'normal',
    texture,
    style_lineage: String(obj.style_lineage || '').replace(/[^a-z0-9 \-,]/gi, '').trim().slice(0, 120) || null
  };
}

// Full lint pass over a sanitized brief: returns { ok, brief, issues }.
// (sanitizeBrief already enforces the security rules; this reports them.)
function lintBrief(brief) {
  const issues = [];
  const b = brief && typeof brief === 'object' && brief.palette ? brief : sanitizeBrief(brief);
  if (!b) return { ok: false, brief: null, issues: ['brief failed validation: palette/fonts missing or unsafe'] };
  if (b.motif_css === null && brief && brief.motif_css) issues.push('motif_css rejected by safety lint');
  if (b.texture === null && brief && brief.texture) issues.push('texture rejected by safety lint');
  return { ok: true, brief: b, issues };
}

// ── novelty gate (ΔE palette distance + repeated motif/mood words) ───────

function hexToRgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
function srgbToLab(hex) {
  let [r, g, b] = hexToRgb(hex).map(v => v / 255);
  [r, g, b] = [r, g, b].map(v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const X = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const Y = (r * 0.2126 + g * 0.7152 + b * 0.0722);
  const Z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = t => t > 0.008856 ? Math.cbrt(t) : (7.787 * t) + 16 / 116;
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [(116 * fy) - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
// CIE76 ΔE — small and predictable is fine for a proximity gate.
function deltaE(hexA, hexB) {
  const a = srgbToLab(hexA), b = srgbToLab(hexB);
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

// Recent briefs in the same niche category (owner scope: only products from
// the focus window count as "recent competitors" for design diversity).
function recentBriefs(nicheKey, { limit = 20, excludeProductId = null } = {}) {
  try {
    // excludeProductId: a product's OWN briefs are never "recent competitors"
    // for itself — without this, every revision/regen brief is rejected against
    // its own predecessor and the revision loop silently no-ops.
    const rows = db.prepare(`
      SELECT p.design_brief, p.created_at, pr.colors AS prof_colors
      FROM products p LEFT JOIN professions pr ON p.profession_id = pr.id
      WHERE p.design_brief IS NOT NULL AND p.created_at >= ? AND p.id != ?
      ORDER BY p.id DESC LIMIT 80
    `).all(require('./designCritic').FOCUS_SINCE, Number(excludeProductId) || -1);
    const out = [];
    for (const r of rows) {
      try {
        const b = JSON.parse(r.design_brief);
        if (b && b.palette) out.push(b);
      } catch { /* skip malformed */ }
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}

// Returns { pass, reason } — reject when the palette is too close to a recent
// same-niche brief, or mood/motif words repeat. Palette proximity is measured
// ROLE-WISE (primary/secondary/accent vs the same roles): bg/surface/border
// are neutrals that always cluster near white and would false-positive.
function briefNoveltyGate(brief, nicheKey, { minDeltaE = 10, lookback = [], excludeProductId = null } = {}) {
  if (!brief || !brief.palette) return { pass: false, reason: 'no brief' };
  const others = lookback.length ? lookback : recentBriefs(nicheKey, { excludeProductId });
  const ROLES = ['primary', 'secondary', 'accent'];
  for (const other of others) {
    const dists = [];
    for (const role of ROLES) {
      const a = brief.palette[role], b = other.palette && other.palette[role];
      if (/^#[0-9a-f]{6}$/.test(a || '') && /^#[0-9a-f]{6}$/.test(b || '')) dists.push(deltaE(a, b));
    }
    if (dists.length) {
      const mean = dists.reduce((x, y) => x + y, 0) / dists.length;
      if (mean < minDeltaE) return { pass: false, reason: `palette within ΔE ${mean.toFixed(1)} of a recent same-niche brief` };
    }
    const otherWords = new Set([
      ...(other.mood || []).map(w => w.toLowerCase()),
      String(other.motif || '').toLowerCase().split(/\s+/).filter(Boolean)
    ]);
    const myWords = [
      ...(brief.mood || []).map(w => w.toLowerCase()),
      String(brief.motif || '').toLowerCase().split(/\s+/).filter(Boolean)
    ];
    const repeats = myWords.filter(w => w.length > 3 && otherWords.has(w));
    if (repeats.length >= 2) return { pass: false, reason: `mood/motif repeats: ${repeats.slice(0, 3).join(', ')}` };
  }
  return { pass: true, reason: null };
}

// ── mechanical diversity levers ─────────────────────────────────────────

// Style blending: deterministically sample 2 of the 8 styles to fuse
// ("editorial × organic"). Seeded by product id so re-renders are stable.
function blendStyleKeys(seed) {
  const keys = designStyles.getAllStyles().map(s => s.key);
  if (!keys.length) return [];
  let h = Number(seed) || 0;
  const i = h % keys.length;
  h = Math.floor(h / keys.length) + 7;
  const j = h % keys.length;
  return [...new Set([keys[i], keys[j]])];
}

// Layout variance: rotate grid treatment per product so even same-style
// products don't share a skeleton.
function layoutFor(product) {
  const L = ['classic', 'sidebar', 'full-bleed', 'asymmetric', 'zine'];
  return L[(Number(product && product.id) || 0) % L.length];
}

// ── brief generation ────────────────────────────────────────────────────

function buildBriefPrompt(product, prof, opts = {}) {
  const nicheKey = designStyles.detectNicheCategory(prof);
  const motifs = pickMotifs(nicheKey);
  const blend = opts.blend || blendStyleKeys(product.id);
  const styles = designStyles.getAllStyles();
  const blendDesc = blend.map(k => styles.find(s => s.key === k)).filter(Boolean)
    .map(s => `${s.name} (${s.description})`).join(' × ');
  const refs = opts.references || [];
  const refSection = refs.length
    ? 'Design in the lineage of these references (brief-level transfer only — NEVER copy pixels):\n' +
      refs.map((r, i) => `Reference ${i + 1}: "${r.title}" — palette ${r.palette}, fonts ${r.fonts}, layout ${r.layout}, motif ${r.motif}. Taste: ${r.taste_note}`).join('\n') + '\n'
    : '';
  const critiqueSection = opts.critique
    ? `A previous render of this product scored poorly on: ${String(opts.critique).slice(0, 500)}. The new brief MUST fix these.\n`
    : '';
  const avoidSection = opts.avoid
    ? `Do NOT reuse this palette or mood: ${String(opts.avoid).slice(0, 300)}.\n`
    : '';

  return [
    `Product: "${product.name}" (${product.type}, ${product.price || 'n/a'}) for ${prof.name}.`,
    `Niche category: ${nicheKey}.`,
    `Style lineage to fuse: ${blendDesc || 'editorial'}.`,
    `Target layout family: ${opts.layout || layoutFor(product)}.`,
    refSection + critiqueSection + avoidSection,
    `Niche motifs to draw from (adapt, don't just pick #1): ${motifs.map(m => m.motif).join(' | ')}.`,
    'Invent ONE coherent design direction for this exact product. Distinct beats pretty.',
    'Reply with ONLY valid JSON, no markdown:',
    '{"mood":["3-5","single","words"],',
    '"palette":{"primary":"#rrggbb","secondary":"#rrggbb","accent":"#rrggbb","bg":"#rrggbb","surface":"#rrggbb","border":"#rrggbb"},',
    '"fonts":{"heading":"Google Font Name","body":"Google Font Name","mono":"Google Font Name"},',
    '"font_reason":"one sentence on the pairing",',
    '"motif":"short motif name","motif_css":"safe CSS declarations only (no url(), no @import, no position)",',
    '"layout":"classic|sidebar|full-bleed|asymmetric|zine","whitespace":"tight|normal|generous",',
    '"texture":"one of none|paper|grid|grain|linen|blueprint|silk",',
    '"style_lineage":"short lineage note"}'
  ].filter(Boolean).join('\n');
}

// Generate a validated, linted, novel design brief for a product.
// Returns brief or null. Never throws. Cost control: at most 2 model calls
// (initial + one novelty regeneration), then fall back to deterministic.
async function generateBrief(product, prof, opts = {}) {
  if (!cfg.enabled || !product || !prof) return null;
  try {
    const nicheKey = designStyles.detectNicheCategory(prof);
    const references = opts.references ||
      (opts.useReferences === false ? [] : require('./swipeFileEngine').pickDesignReferences(nicheKey, 2));
    const prompt = buildBriefPrompt(product, prof, { ...opts, references });
    const system = 'You are an art director for premium digital products. You design in strict JSON only. Your CSS is always editor-safe: hex colours and font declarations, never urls or imports.';

    let raw = await router.generateIdeas(prompt, system);
    let brief = parseBrief(raw);
    if (!brief) return null;

    const gate = briefNoveltyGate(brief, nicheKey, { excludeProductId: product && product.id });
    if (!gate.pass) {
      // Exactly ONE regeneration attempt with explicit avoidance.
      raw = await router.generateIdeas(
        prompt + `\nYour previous direction was rejected (${gate.reason}). Push the palette and motif further away.`,
        system
      );
      brief = parseBrief(raw);
      if (!brief) return null;
      const gate2 = briefNoveltyGate(brief, nicheKey, { excludeProductId: product && product.id });
      if (!gate2.pass) return null; // deterministic styles take over
    }
    return lintBrief(brief).brief;
  } catch (e) {
    console.error('[ART] generateBrief failed:', e.message);
    return null;
  }
}

// Persist a brief on the product row (the "skin"; content stays untouched).
function saveBrief(productId, brief) {
  if (!productId || !brief) return false;
  try {
    db.prepare('UPDATE products SET design_brief = ? WHERE id = ?')
      .run(JSON.stringify(brief).slice(0, 4000), productId);
    return true;
  } catch (e) {
    console.error('[ART] saveBrief:', e.message);
    return false;
  }
}

// Synthesize a deterministic brief: rotated layout, niche motif, curated font
// pairing, theme-derived palette. Zero cost, zero model calls, fully offline.
// This is the BRIEF-BY-DEFAULT fallback (and the reskin variation path): every
// product is born with deliberate design DNA even when the AI layer is off.
// `opts.previous` (a prior brief) keeps its palette/motif/type choices where
// they are still valid; `opts.layout` pins the layout. Output always passes
// the same editor-safety lint as model briefs. Never throws → null.
function synthesizeBrief(product, prof, opts = {}) {
  try {
    const prev = (opts.previous && typeof opts.previous === 'object') ? opts.previous : null;
    const prevPalette = (prev && prev.palette && typeof prev.palette === 'object') ? prev.palette : {};
    const prevFonts = (prev && prev.fonts && typeof prev.fonts === 'object') ? prev.fonts : {};
    const id = Number(product && product.id) || 0;
    const nicheKey = designStyles.detectNicheCategory(prof || { name: '', services: '' });
    const motifs = pickMotifs(nicheKey);
    const motif = motifs[(id + 1) % motifs.length] || motifs[0] || { motif: 'ledger rules', css: 'border-bottom:2px solid #d0c0a0' };
    const pairings = (designStyles.FONT_PAIRINGS && designStyles.FONT_PAIRINGS.length)
      ? designStyles.FONT_PAIRINGS
      : [{ heading: 'Fraunces', body: 'Public Sans', mono: 'Space Mono' }];
    const pair = pairings[id % pairings.length];
    let theme = {};
    try { theme = require('./fileFactory').fallbackTheme(product || {}) || {}; } catch { /* defaults below */ }
    const clean = sanitizeBrief({
      mood: Array.isArray(prev && prev.mood) ? prev.mood : [],
      palette: {
        primary: sanitizeHex(prevPalette.primary) || sanitizeHex(theme.primary) || '#0f172a',
        secondary: sanitizeHex(prevPalette.secondary) || sanitizeHex(theme.secondary) || '#64748b',
        accent: sanitizeHex(prevPalette.accent) || sanitizeHex(theme.accent) || '#2dd4bf',
        bg: sanitizeHex(prevPalette.bg) || sanitizeHex(theme.bg) || '#ffffff',
        surface: sanitizeHex(prevPalette.surface) || '#ffffff',
        border: sanitizeHex(prevPalette.border) || '#e5e0d8'
      },
      fonts: {
        heading: sanitizeFontName(prevFonts.heading) || pair.heading,
        body: sanitizeFontName(prevFonts.body) || pair.body,
        mono: sanitizeFontName(prevFonts.mono) || pair.mono
      },
      motif: (prev && prev.motif) || motif.motif,
      motif_css: (prev && prev.motif_css) || motif.css,
      layout: opts.layout || layoutFor({ id: id + 1 }),
      whitespace: (prev && prev.whitespace) || 'normal',
      texture: (prev && prev.texture) || 'paper',
      style_lineage: 'deterministic rotation'
    });
    if (!clean) return null;
    clean._deterministic = true;
    return clean;
  } catch (e) {
    console.error('[ART] synthesizeBrief failed:', e.message);
    return null;
  }
}

// Ensure a product has a design brief — the BRIEF-BY-DEFAULT rule: a generated
// brief when the AI layer is on, otherwise a deterministic synthesis, so every
// build carries deliberate design DNA. Returns the brief or null. Never throws.
// Skips when one exists (cost control: max 1 generation + 1 regen per product).
async function ensureDesignBrief(product, prof) {
  if (!product || !prof) return null;
  if (product.design_brief) {
    try { return JSON.parse(product.design_brief); } catch { /* regenerate below */ }
  }
  let brief = null;
  try { brief = await generateBrief(product, prof); } catch { brief = null; }
  if (!brief) brief = synthesizeBrief(product, prof);
  if (brief) {
    saveBrief(product.id, brief);
    product.design_brief = JSON.stringify(brief);
  }
  return brief;
}

// ── brief → theme application (the skin layer) ──────────────────────────

const LAYOUT_CSS = {
  'classic': '',
  'sidebar': '.page{border-left:6px solid ACCENT}.section{margin-left:8px}',
  'full-bleed': '.cover{margin:-40px -46px 24px;padding:80px 60px}',
  'asymmetric': 'h1{margin-left:24px}.section{margin-right:40px}',
  'zine': 'h1{transform:rotate(-1deg)}.section{border-top:4px solid ACCENT;border-bottom:4px solid ACCENT}'
};
const WHITESPACE_CSS = {
  'tight': 'body{line-height:1.35}.section{margin:14px 0}',
  'normal': '',
  'generous': 'body{line-height:1.8}.section{margin:38px 0}p{margin-bottom:14px}'
};
const TEXTURE_CSS = {
  'paper': 'background-image:radial-gradient(#000 0.4px,transparent 0.4px);background-size:5px 5px;opacity:1',
  'grid': 'background-image:linear-gradient(rgba(0,0,0,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,0.05) 1px,transparent 1px);background-size:18px 18px',
  'grain': 'background-image:radial-gradient(#000 0.5px,transparent 0.5px);background-size:4px 4px',
  'linen': 'background-image:repeating-linear-gradient(0deg,rgba(0,0,0,0.04) 0 1px,transparent 1px 3px)',
  'blueprint': 'background-image:linear-gradient(rgba(20,80,140,0.12) 1px,transparent 1px),linear-gradient(90deg,rgba(20,80,140,0.12) 1px,transparent 1px);background-size:22px 22px',
  'silk': 'background-image:linear-gradient(120deg,transparent 20%,rgba(0,0,0,0.05) 45%,transparent 70%)',
  'none': ''
};

function briefCss(brief) {
  const parts = [];
  const heading = sanitizeFontName(brief.fonts && brief.fonts.heading);
  const body = sanitizeFontName(brief.fonts && brief.fonts.body);
  if (heading) parts.push(`h1,h2,h3{font-family:'${heading}',serif}`);
  if (body) parts.push(`body,td,p,li,div{font-family:'${body}',system-ui,sans-serif}`);
  parts.push(WHITESPACE_CSS[brief.whitespace] || '');
  parts.push((LAYOUT_CSS[brief.layout] || '').replace(/ACCENT/g, brief.palette.accent || '#888'));
  if (brief.texture && TEXTURE_CSS[brief.texture]) {
    parts.push(`.page::after{content:"";position:absolute;inset:0;pointer-events:none;${TEXTURE_CSS[brief.texture]}}`);
  } else if (brief.texture) {
    parts.push(`.page::after{content:"";position:absolute;inset:0;pointer-events:none;${brief.texture}}`);
  }
  if (brief.motif_css) parts.push(`.section{${brief.motif_css}}`);
  return parts.filter(Boolean).join('\n');
}

// Apply a brief to the theme/DNA object builders already consume. With no
// brief this is a no-op — the deterministic path is intact. With a brief, the
// theme gains the complete DNA layer (fonts URL, motif/layout/texture CSS) even
// when the base theme never had one.
function applyBriefToTheme(theme, brief) {
  if (!theme || !brief || !brief.palette) return theme;
  const palette = brief.palette;
  const out = {
    ...theme,
    primary: palette.primary || theme.primary,
    secondary: palette.secondary || theme.secondary,
    accent: palette.accent || theme.accent,
    bg: palette.bg || theme.bg,
    brief
  };
  const heading = sanitizeFontName(brief.fonts && brief.fonts.heading);
  const body = sanitizeFontName(brief.fonts && brief.fonts.body);
  const mono = sanitizeFontName(brief.fonts && brief.fonts.mono);
  if (heading && body) out.font = `'${heading}','${body}',system-ui,sans-serif`;
  // Always attach the FULL DNA layer for a briefed theme. Base themes without
  // a dna object used to silently drop the brief's layout/motif/texture CSS and
  // the Google Fonts link — the render fell back to system fonts and the skin
  // collapsed to a palette swap (exactly what the critic scores as a "generic
  // recolored template"). Builders switch to the shellDNA path when theme.dna
  // exists, so this one seam lights the brief up for EVERY builder.
  const base = theme.dna || {};
  const extra = [...new Set([heading, body, mono].filter(Boolean))];
  out.dna = {
    ...base,
    styleKey: base.styleKey || 'brief',
    niche: base.niche || 'general',
    fonts: {
      heading: heading ? `'${heading}'` : (base.fonts && base.fonts.heading) || "'Inter'",
      body: body ? `'${body}'` : (base.fonts && base.fonts.body) || "'Inter'",
      mono: mono ? `'${mono}'` : (base.fonts && base.fonts.mono) || "'JetBrains Mono'"
    },
    colors: { ...(base.colors || {}), ...palette },
    css: (base.css || '') + '\n' + briefCss(brief),
    fontsUrl: extra.length ? designStyles.googleFontsUrl(extra) : (base.fontsUrl || designStyles.GOOGLE_FONTS_URL)
  };
  return out;
}

module.exports = {
  VISUAL_MOTIFS,
  pickMotifs,
  sanitizeCssDeclarations,
  sanitizeFontName,
  sanitizeHex,
  parseBrief,
  sanitizeBrief,
  lintBrief,
  deltaE,
  briefNoveltyGate,
  recentBriefs,
  blendStyleKeys,
  layoutFor,
  buildBriefPrompt,
  generateBrief,
  synthesizeBrief,
  saveBrief,
  ensureDesignBrief,
  applyBriefToTheme,
  briefCss
};
