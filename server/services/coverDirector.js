// ═══════════════════════════════════════════════════════════════════════════
// COVER DIRECTOR — per-listing art direction, decided per product.
//
// Every listing that passes through the cover pipeline gets its own spec,
// chosen for THAT product (AI via the ideation model when MODEL_ENABLED,
// deterministic rules otherwise — never throws, never blocks):
//
//   {
//     field: '#rrggbb',            // palette field behind the white page sheet
//     fieldTone: 'dark' | 'light', // text treatment for that field
//     heroCrop: 'top' | 'upper' | 'full',  // how much of the page to show
//     title, kicker, tagline, benefits[3], price
//   }
//
// The product page is always light, so the field must be a deep tonal from
// the product's own palette — that is the contrast rule the director enforces.
// ═══════════════════════════════════════════════════════════════════════════

const router = require('./modelRouter');
const modelConfig = require('./modelConfig');
const coverTemplate = require('./coverTemplate');

const SYSTEM = [
  'You are the art director for a premium digital-product marketplace.',
  'You design ONE cover per product: a typographic panel on the left and the',
  'product page itself floating as a white sheet on the right.',
  'The page sheet is always light (white/cream), so the FIELD behind it must',
  'be a deep, saturated tone drawn from the product palette — never near-white.',
  'Write copy in the product voice: kicker = the niche (short), tagline = one',
  'human sentence, benefits = 3 short format facts (no invented claims).',
  'Return STRICT JSON only, no prose:',
  '{"field":"#rrggbb","fieldTone":"dark","heroCrop":"top|upper|full",',
  ' "title":"...","kicker":"...","tagline":"...","benefits":["...","...","..."]}'
].join('\n');

/** Pull the first strict JSON object out of model prose. */
function extractJson(text) {
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

/** Coarse text summary of a preview page for the model prompt. */
function pageSummary(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 700);
}

function parseHex(hex) {
  const h = String(hex || '').replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function toHex(rgb) {
  return '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

/** Multiply a hex toward black (factor < 1) or toward white (factor > 1). */
function shift(hex, factor) {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  if (factor <= 1) return toHex(rgb.map((v) => v * factor));
  return toHex(rgb.map((v) => v + (255 - v) * (factor - 1)));
}

function luminance(hex) {
  const rgb = parseHex(hex);
  if (!rgb) return 0.5;
  return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
}

/** Deterministic per-product spec — the contrast rule, no model needed. */
function deterministicSpec(product, prof) {
  const base = coverTemplate.buildConcept(product, prof, null);
  const p = (base && base.palette) || {};
  // deep tonal field from the accent so the white sheet always pops;
  // fall back to a deep slate when the accent is already near-black.
  const accent = p.accent && p.accent !== '#ff4d2e' ? p.accent : '#33424d';
  const field = luminance(accent) < 0.12 ? shift('#33424d', 0.8) : shift(accent, luminance(accent) > 0.55 ? 0.5 : 0.62);
  return {
    field,
    fieldTone: 'dark',
    heroCrop: 'upper',
    title: base.listing_title,
    kicker: base.kicker,
    tagline: base.tagline,
    benefits: base.benefits,
    price: base.price,
    source: 'deterministic'
  };
}

/**
 * Direct the cover for one product. AI spec when the model layer is on;
 * deterministic spec otherwise or on any failure. Never throws.
 */
async function directCover(product, prof, pageHtml) {
  const fallback = deterministicSpec(product, prof);
  if (!modelConfig.enabled) return fallback;

  let brief = null;
  try { brief = product.design_brief ? JSON.parse(product.design_brief) : null; } catch { /* ignore */ }

  try {
    const prompt = [
      `Product: ${product.name}`,
      `Type: ${product.type} · Price: ${product.price}`,
      `Niche: ${prof && prof.name ? prof.name : ''}`,
      `Palette: ${JSON.stringify((brief && brief.palette) || {})}`,
      `Page content summary: ${pageSummary(pageHtml)}`,
      '',
      'Return the JSON cover spec for THIS product.'
    ].join('\n');

    const raw = await router.generateIdeas(prompt, SYSTEM);
    const spec = extractJson(raw);
    if (!spec || !spec.field) return fallback;

    const accent = (brief && brief.palette && brief.palette.accent) || fallback.field;
    const clean = (s) => String(s || '').replace(/[\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim();
    return {
      field: parseHex(spec.field) ? '#' + spec.field.replace('#', '').toLowerCase() : fallback.field,
      fieldTone: spec.fieldTone === 'light' ? 'light' : 'dark',
      heroCrop: ['top', 'upper', 'full'].includes(spec.heroCrop) ? spec.heroCrop : 'upper',
      title: clean(spec.title || fallback.title).slice(0, 60),
      kicker: clean(spec.kicker || fallback.kicker).slice(0, 40),
      tagline: clean(spec.tagline || fallback.tagline).slice(0, 90),
      benefits: Array.isArray(spec.benefits) && spec.benefits.length
        ? spec.benefits.slice(0, 3).map((b) => clean(b).slice(0, 50))
        : fallback.benefits,
      price: fallback.price,
      accent,
      source: 'ai'
    };
  } catch (e) {
    return fallback;
  }
}

module.exports = { directCover, deterministicSpec, extractJson, pageSummary, shift, luminance };
