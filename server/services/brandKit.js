// ═══════════════════════════════════════════════════════════════════════════
// BRAND KIT — the guardrails that make "endless design" coherent instead of
// random. Every niche gets a bounded brand kit (tone, palette families, font
// shortlist, motif set, monogram). The Style-DNA director composes a unique
// look per product INSIDE these bounds — like a Canva brand kit, but generative.
// ═══════════════════════════════════════════════════════════════════════════

const BRAND_KIT_VERSION = 'bk-v1';

// ── TONE PRESETS ────────────────────────────────────────────────────────────
// Each tone is a bounded design space. Fonts are real Google families already
// loaded by designStyles.js; motif/layout sets drive the cover renderer.
const TONES = {
  professional: {
    displayFonts: ['Playfair Display', 'DM Serif Display', 'Cormorant Garamond', 'Crimson Pro'],
    bodyFonts: ['Inter', 'Plus Jakarta Sans', 'Outfit', 'Space Grotesk'],
    baseFamilies: ['navy', 'slate', 'charcoal'],
    accentFamilies: ['gold', 'brass', 'sage', 'steel'],
    motifs: ['corner-brackets', 'rule', 'thin-grid', 'band'],
    densityBias: 'balanced',
    heroBias: ['photo', 'typographic', 'abstract'],
  },
  warm: {
    displayFonts: ['DM Serif Display', 'Playfair Display', 'Cormorant Garamond', 'Fredoka'],
    bodyFonts: ['Outfit', 'Plus Jakarta Sans', 'Inter'],
    baseFamilies: ['terracotta', 'walnut', 'cream'],
    accentFamilies: ['amber', 'clay', 'olive', 'gold'],
    motifs: ['arc', 'ribbon', 'dots', 'band'],
    densityBias: 'airy',
    heroBias: ['photo', 'illustration', 'abstract'],
  },
  bold: {
    displayFonts: ['Bebas Neue', 'Space Grotesk', 'Outfit', 'Plus Jakarta Sans'],
    bodyFonts: ['Inter', 'Space Grotesk', 'Outfit'],
    baseFamilies: ['ink', 'navy', 'charcoal'],
    accentFamilies: ['electric', 'coral', 'lime', 'gold'],
    motifs: ['diagonal', 'band', 'thick-rule', 'grid'],
    densityBias: 'dense',
    heroBias: ['typographic', 'vector', 'photo'],
  },
  luxe: {
    displayFonts: ['Cormorant Garamond', 'Playfair Display', 'DM Serif Display', 'Crimson Pro'],
    bodyFonts: ['Outfit', 'Inter', 'Plus Jakarta Sans'],
    baseFamilies: ['ink', 'navy', 'charcoal'],
    accentFamilies: ['gold', 'champagne', 'plum', 'brass'],
    motifs: ['corner-brackets', 'thin-rule', 'arc', 'monogram'],
    densityBias: 'airy',
    heroBias: ['abstract', 'typographic', 'photo'],
  },
  playful: {
    displayFonts: ['Fredoka', 'Outfit', 'Space Grotesk', 'Caveat'],
    bodyFonts: ['Outfit', 'Plus Jakarta Sans', 'Inter'],
    baseFamilies: ['cream', 'sky', 'mint'],
    accentFamilies: ['coral', 'tangerine', 'lime', 'plum'],
    motifs: ['dots', 'wave', 'blob', 'confetti'],
    densityBias: 'balanced',
    heroBias: ['illustration', 'vector', 'typographic'],
  },
  technical: {
    displayFonts: ['Space Grotesk', 'JetBrains Mono', 'Inter', 'Outfit'],
    bodyFonts: ['Inter', 'JetBrains Mono', 'Space Grotesk'],
    baseFamilies: ['slate', 'navy', 'charcoal'],
    accentFamilies: ['steel', 'electric', 'sage', 'amber'],
    motifs: ['thin-grid', 'blueprint', 'rule', 'brackets'],
    densityBias: 'dense',
    heroBias: ['abstract', 'vector', 'typographic'],
  },
  organic: {
    displayFonts: ['Cormorant Garamond', 'DM Serif Display', 'Playfair Display', 'Caveat'],
    bodyFonts: ['Inter', 'Outfit', 'Plus Jakarta Sans'],
    baseFamilies: ['forest', 'moss', 'clay', 'cream'],
    accentFamilies: ['olive', 'terracotta', 'honey', 'sage'],
    motifs: ['wave', 'leaf-arc', 'dots', 'band'],
    densityBias: 'airy',
    heroBias: ['photo', 'illustration', 'abstract'],
  },
  heritage: {
    displayFonts: ['Playfair Display', 'Crimson Pro', 'Cormorant Garamond', 'DM Serif Display'],
    bodyFonts: ['Inter', 'Crimson Pro', 'Outfit'],
    baseFamilies: ['walnut', 'navy', 'cream'],
    accentFamilies: ['gold', 'brass', 'oxblood', 'forest'],
    motifs: ['corner-brackets', 'rule', 'monogram', 'band'],
    densityBias: 'balanced',
    heroBias: ['photo', 'typographic', 'abstract'],
  },
};

// ── COLOR FAMILIES (HSL anchors) ────────────────────────────────────────────
// hue, sat, light — the director jitters within the family for endless-but-
// coherent palettes.
const FAMILIES = {
  navy:        { h: 222, s: 42, l: 16 },
  slate:       { h: 215, s: 22, l: 30 },
  charcoal:    { h: 210, s: 12, l: 18 },
  ink:         { h: 230, s: 30, l: 10 },
  cream:       { h: 40,  s: 42, l: 94 },
  walnut:      { h: 28,  s: 34, l: 26 },
  terracotta:  { h: 16,  s: 52, l: 42 },
  clay:        { h: 20,  s: 38, l: 52 },
  forest:      { h: 140, s: 32, l: 24 },
  moss:        { h: 90,  s: 26, l: 34 },
  mint:        { h: 158, s: 34, l: 88 },
  sky:         { h: 200, s: 62, l: 88 },
  gold:        { h: 42,  s: 68, l: 48 },
  brass:       { h: 38,  s: 48, l: 40 },
  champagne:   { h: 44,  s: 52, l: 74 },
  amber:       { h: 36,  s: 88, l: 52 },
  honey:       { h: 42,  s: 72, l: 58 },
  sage:        { h: 152, s: 22, l: 52 },
  steel:       { h: 210, s: 26, l: 52 },
  electric:    { h: 262, s: 78, l: 56 },
  coral:       { h: 8,   s: 82, l: 58 },
  tangerine:   { h: 24,  s: 90, l: 55 },
  lime:        { h: 88,  s: 68, l: 48 },
  plum:        { h: 300, s: 42, l: 38 },
  olive:       { h: 72,  s: 34, l: 40 },
  oxblood:     { h: 350, s: 56, l: 30 },
};

function hslToHex({ h, s, l }) {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// ── DETERMINISTIC PRNG (mulberry32) ─────────────────────────────────────────
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296);
  };
}

function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < String(s).length; i++) {
    h ^= String(s).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick(arr, r) { return arr[Math.floor(r() * arr.length) % arr.length]; }

// ── TONE DETECTION ──────────────────────────────────────────────────────────
// Map a niche to its tone from category/name keywords. Deterministic.
const TONE_KEYWORDS = [
  [/recovery|therapy|wellness|massage|yoga|meditat|counsel/i, 'warm'],
  [/roof|hvac|plumb|electric|contractor|construction|mechanic|duct|energy|audit|inspect/i, 'technical'],
  [/tattoo|photo|drone|artist|creative|design|video/i, 'bold'],
  [/wedding|notary|law|finance|consult|account|insurance|real estate/i, 'professional'],
  [/bakery|bak|food|cater|florist|coffee|chef|restaurant/i, 'warm'],
  [/beekeep|apiar|garden|landscap|native plant|farm|organic/i, 'organic'],
  [/pyro|firework|hobby|craft/i, 'playful'],
  [/brand|luxe|premium|jewel|spa|boutique/i, 'luxe'],
];

function detectTone(prof = {}) {
  const hay = `${prof.name || ''} ${prof.category || ''} ${prof.slug || ''}`;
  for (const [re, tone] of TONE_KEYWORDS) if (re.test(hay)) return tone;
  // Hash fallback so every niche still lands somewhere — never undefined.
  const keys = Object.keys(TONES);
  return keys[hashString(prof.slug || prof.name || 'niche') % keys.length];
}

// ── MONOGRAM ────────────────────────────────────────────────────────────────
function monogram(name) {
  const parts = String(name || 'NG').replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/);
  const letters = parts.slice(0, 2).map(p => p[0]).join('').toUpperCase();
  return letters || 'NG';
}

// ── BUILD BRAND KIT ─────────────────────────────────────────────────────────
function buildBrandKit(prof = {}) {
  const tone = detectTone(prof);
  const preset = TONES[tone];
  const seed = hashString(`${prof.slug || prof.name || ''}|kit`);
  const r = rng(seed);
  const baseFamily = pick(preset.baseFamilies, r);
  const accentFamilies = preset.accentFamilies.slice();
  return {
    version: BRAND_KIT_VERSION,
    slug: prof.slug || '',
    name: prof.name || '',
    tone,
    monogram: monogram(prof.name),
    palette: {
      baseFamily,
      base: hslToHex(FAMILIES[baseFamily]),
      accentFamilies,
      accent: hslToHex(FAMILIES[accentFamilies[0]]),
    },
    displayFonts: preset.displayFonts.slice(),
    bodyFonts: preset.bodyFonts.slice(),
    motifs: preset.motifs.slice(),
    densityBias: preset.densityBias,
    heroBias: preset.heroBias.slice(),
    seed,
  };
}

module.exports = {
  BRAND_KIT_VERSION,
  TONES,
  FAMILIES,
  buildBrandKit,
  detectTone,
  monogram,
  hslToHex,
  rng,
  hashString,
};
