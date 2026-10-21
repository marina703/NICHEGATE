// ═══════════════════════════════════════════════════════════════════════════
// STYLE-DNA DIRECTOR — composes a UNIQUE visual identity per product inside the
// niche's brand kit. This is the "endless design" engine: palette x typography x
// layout x motif x hero-modality x density x corner x rule = a combinatorial
// space large enough that no two products need look alike, yet every result is
// bounded by the brand kit so it stays coherent (Canva-brand-kit style).
// ═══════════════════════════════════════════════════════════════════════════

const brandKit = require('./brandKit');
const { hslToHex, rng, hashString, FAMILIES } = require('./brandKit');

const STYLE_DNA_VERSION = 'dna-v1';

// Layout grammars the cover renderer knows how to draw.
const LAYOUTS = ['stacked', 'split', 'sidebar', 'poster', 'banded', 'magazine', 'framed'];
// Hero modalities — 'typographic'/'abstract'/'vector' need NO photo, which is
// how we get variety without AI-photo garbled text.
const HERO_MODALITIES = ['photo', 'illustration', 'abstract', 'vector', 'typographic'];
const CORNERS = ['sharp', 'soft', 'pill'];
const RULES = ['hairline', 'thick', 'double', 'none'];
const DENSITIES = ['airy', 'balanced', 'dense'];

function jitter(base, r, spread = 0.08) {
  const d = (r() * 2 - 1) * spread;
  return {
    h: base.h + (r() * 2 - 1) * 6,
    s: Math.max(0, Math.min(100, base.s + d * 100)),
    l: Math.max(4, Math.min(96, base.l + d * 100)),
  };
}

function pick(arr, r) { return arr[Math.floor(r() * arr.length) % arr.length]; }

// Pick near a preferred value: with 70% chance take the kit's bias, else random.
function pickBiased(arr, preferred, r, p = 0.7) {
  if (preferred && arr.includes(preferred) && r() < p) return preferred;
  return pick(arr, r);
}

function derivePalette(kit, r) {
  const baseFam = FAMILIES[kit.palette.baseFamily] || FAMILIES.navy;
  const accentFamName = pick(kit.palette.accentFamilies, r);
  const accentFam = FAMILIES[accentFamName] || FAMILIES.gold;

  const baseHsl = jitter(baseFam, r, 0.05);
  const accentHsl = jitter(accentFam, r, 0.07);

  // A dark base gets a light surface; a light base gets a deep ink surface.
  const baseIsDark = baseFam.l < 50;
  const surface = baseIsDark ? '#fdfcf8' : hslToHex({ h: baseHsl.h, s: 20, l: 96 });
  const ink = baseIsDark ? '#1b2030' : hslToHex({ h: baseHsl.h, s: Math.min(60, baseHsl.s), l: 12 });

  // Always provide a STRONG DARK hero anchor so every cover clears contrast
  // regardless of how light the niche's base family is (light-on-light covers
  // failed the invariant). Dark niches keep their base; light niches get a deep
  // derivative of the same hue.
  const heroBg = baseIsDark ? hslToHex(baseHsl) : hslToHex({ h: baseHsl.h, s: Math.min(55, baseHsl.s + 8), l: 16 });
  const heroDeep = baseIsDark
    ? hslToHex({ h: baseHsl.h, s: baseHsl.s, l: Math.max(6, baseHsl.l - 8) })
    : hslToHex({ h: baseHsl.h, s: Math.min(55, baseHsl.s + 8), l: 10 });
  const onHero = '#f7f5ef';

  const accent = hslToHex(accentHsl);
  // accentInk: readable text on top of the accent block.
  const accentDark = accentHsl.l < 55;
  const accentInk = accentDark ? '#ffffff' : '#141821';

  return {
    base: hslToHex(baseHsl),
    baseDeep: hslToHex({ h: baseHsl.h, s: baseHsl.s, l: Math.max(6, baseHsl.l - 8) }),
    surface,
    ink,
    muted: hslToHex({ h: baseHsl.h, s: Math.max(6, baseHsl.s * 0.5), l: baseIsDark ? 40 : 46 }),
    accent,
    accentInk,
    heroBg,
    heroDeep,
    onHero,
    accentName: accentFamName,
    baseName: kit.palette.baseFamily,
    onBase: baseIsDark ? '#f7f5ef' : '#1b2030',
  };
}

// Compose a full style DNA for one product. Deterministic on product id + niche.
// `opts.recentHashes` (array) lets the caller avoid repeating a recent look.
function composeDNA(product = {}, prof = {}, opts = {}) {
  const kit = opts.kit || brandKit.buildBrandKit(prof);
  const baseSeed = hashString(`${prof.slug || prof.name || ''}|${product.id != null ? product.id : product.name || ''}|${opts.salt || ''}`);
  const recent = Array.isArray(opts.recentHashes) ? opts.recentHashes : [];

  // Try a few seeds until the resulting hash is not in recentHashes (endless
  // but non-repeating). Falls back after 6 tries.
  let dna = null;
  const heroPool = Array.isArray(opts.heroPool) && opts.heroPool.length ? opts.heroPool : HERO_MODALITIES;
  const heroPreferred = (kit.heroBias || []).find(x => heroPool.includes(x));
  for (let attempt = 0; attempt < 6; attempt++) {
    const r = rng((baseSeed + attempt * 2654435761) >>> 0);
    const palette = derivePalette(kit, r);
    dna = {
      version: STYLE_DNA_VERSION,
      id: product.id != null ? product.id : null,
      niche: prof.slug || prof.name || '',
      tone: kit.tone,
      monogram: kit.monogram,
      palette,
      fonts: {
        display: pick(kit.displayFonts, r),
        body: pick(kit.bodyFonts, r),
      },
      layout: pick(LAYOUTS, r),
      density: pickBiased(DENSITIES, kit.densityBias, r),
      motif: pick(kit.motifs, r),
      heroModality: pickBiased(heroPool, heroPreferred, r, 0.55),
      corner: pick(CORNERS, r),
      rule: pick(RULES, r),
      seed: (baseSeed + attempt * 2654435761) >>> 0,
    };
    dna.hash = dnaHash(dna);
    if (!recent.includes(dna.hash)) break;
  }
  return dna;
}

// Stable hash of the *design choices* (not id/seed) — used for novelty de-dup.
function dnaHash(dna) {
  const key = [
    dna.palette && dna.palette.base,
    dna.palette && dna.palette.accent,
    dna.fonts && dna.fonts.display,
    dna.fonts && dna.fonts.body,
    dna.layout, dna.motif, dna.heroModality, dna.density, dna.corner, dna.rule,
  ].join('|');
  return hashString(key).toString(16);
}

function describe(dna) {
  if (!dna) return 'no DNA';
  return `${dna.tone}/${dna.layout}/${dna.heroModality}/${dna.motif} · ${dna.fonts.display}+${dna.fonts.body} · ${dna.palette.baseName}×${dna.palette.accentName}`;
}

module.exports = {
  STYLE_DNA_VERSION,
  LAYOUTS, HERO_MODALITIES, CORNERS, RULES, DENSITIES,
  composeDNA, dnaHash, describe,
};
