// ═══════════════════════════════════════════════════════════════════════════
// REFERENCE ANALYZER — turn a template/cover IMAGE into design DNA.
//
// The design_references pool already stores (palette, fonts, layout, motif,
// taste_note) and artDirector injects them into the brief as text. But there
// was no way to GET a reference in: the pool was programmatic-only, seeded
// with 12 hand-written exemplars and winners.
//
// This closes the ingest gap. Given an image (a "CanYa" the owner admires),
// a vision call extracts the same five attributes, and the row is stored via
// swipeFileEngine.addDesignReference — so it immediately joins the lineage
// pool that every subsequent brief draws from.
//
// Rules (mirrors designCritic):
//   • Never throws upstream. MODEL_ENABLED=false or vision failure → null
//     (the caller can fall back to a deterministic palette extraction).
//   • Vision spend lands in ai_usage (action='reference_analysis').
//   • Pixel data is never stored in the DB — only extracted attributes.
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const router = require('./modelRouter');
const cfg = require('./modelConfig');

const MAX_BYTES = 25 * 1024 * 1024; // refuse anything larger than 25MB

const SYSTEM = [
  'You are a design archaeologist. You extract the reusable design DNA from a',
  'cover/listing image so a different designer can create something NEW in the',
  'same lineage. You never describe the literal subject matter as a motif —',
  'motifs are compositional (e.g. "diagonal wedge", "tabular grid", "sunburst").',
  'You reply with ONLY valid JSON, no markdown.'
].join(' ');

function buildAnalysisPrompt() {
  return [
    'Read this design and extract its reusable DNA. Reply with ONLY this JSON:',
    '{"palette":["#rrggbb","#rrggbb","#rrggbb"],',
    '"fonts":{"heading":"Google Font Name","body":"Google Font Name"},',
    '"layout":"one short phrase (e.g. centred specimen with caption block)",',
    '"motif":"one short compositional motif (e.g. flight-path arcs)",',
    '"taste_note":"one sentence: what makes this design feel premium"}'
  ].join('\n');
}

// Defensive strict-JSON parse (mirrors designCritic.parseCritique).
function parseReferenceAnalysis(text) {
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
  if (!obj || typeof obj !== 'object') return null;

  const palette = Array.isArray(obj.palette)
    ? obj.palette.map(String).map(s => s.trim()).filter(s => /^#?[0-9a-fA-F]{3,8}$/.test(s)).slice(0, 5)
        .map(s => (s.startsWith('#') ? s : '#' + s))
    : [];
  const fonts = obj.fonts && typeof obj.fonts === 'object'
    ? { heading: String(obj.fonts.heading || '').slice(0, 60) || null,
        body: String(obj.fonts.body || '').slice(0, 60) || null }
    : { heading: null, body: null };
  const layout = String(obj.layout || '').slice(0, 120).trim() || null;
  const motif = String(obj.motif || '').slice(0, 120).trim() || null;
  const taste_note = String(obj.taste_note || '').slice(0, 300).trim() || null;

  // Require at least a palette or a taste_note — otherwise it is not DNA.
  if (!palette.length && !taste_note) return null;
  return { palette, fonts, layout, motif, taste_note };
}

// Resolve an input to a vision-ready data URI. Accepts:
//   • a data: URI (returned as-is, validated + downscaled if local bytes given)
//   • a filesystem path (relative to project root or absolute)
//   • a data: URI that is huge → downscale
async function toDataUri(input) {
  if (!input) return null;
  const str = String(input).trim();

  // Data URI: split header from payload.
  const m = str.match(/^data:([^;,]+);base64,(.+)$/is);
  if (m) {
    const mime = m[1];
    const raw = Buffer.from(m[2], 'base64');
    if (!raw.length || raw.length > MAX_BYTES) return null;
    return downscale(raw, mime);
  }

  // Bare hex/base64 string (no header) — try as a file path first.
  try {
    const p = path.isAbsolute(str) ? str : path.resolve(process.cwd(), str);
    if (fs.existsSync(p)) {
      const raw = await fs.promises.readFile(p);
      if (!raw.length || raw.length > MAX_BYTES) return null;
      const mime = mimeFromPath(p);
      return downscale(raw, mime);
    }
  } catch { /* fall through */ }

  return null;
}

function mimeFromPath(p) {
  const ext = path.extname(p).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

// Downscale to ~768px JPEG so vision endpoints never reject a huge payload.
async function downscale(raw, mime) {
  try {
    const sharp = require('sharp');
    const small = await sharp(raw)
      .resize({ width: 768, height: 768, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    return 'data:image/jpeg;base64,' + small.toString('base64');
  } catch {
    // Not a format sharp knows — hand back the original as a data URI.
    return `data:${mime};base64,${raw.toString('base64')}`;
  }
}

// Deterministic AI-free fallback: extract the dominant palette from pixels.
// Used when MODEL_ENABLED=false so ingest still yields usable DNA (a palette
// is enough to steer; fonts/layout/motif are left null).
async function fallbackPalette(input) {
  try {
    const uri = await toDataUri(input);
    if (!uri) return null;
    const sharp = require('sharp');
    const raw = Buffer.from(uri.split(',')[1], 'base64');
    const stats = await sharp(raw).resize(64, 64, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
    const { data, info } = stats;
    // Coarse 4x4x4 RGB quantisation, then rank by frequency.
    const buckets = new Map();
    for (let i = 0; i < data.length; i += info.channels) {
      const r = data[i] >> 4, g = data[i + 1] >> 4, b = data[i + 2] >> 4;
      const key = (r << 8) | (g << 4) | b;
      const cur = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
      cur.n++; cur.r += data[i]; cur.g += data[i + 1]; cur.b += data[i + 2];
      buckets.set(key, cur);
    }
    const top = [...buckets.values()].sort((a, b) => b.n - a.n).slice(0, 4);
    if (!top.length) return null;
    const hex = c => c.toString(16).padStart(2, '0');
    const palette = top.map(c => '#' + hex(Math.round(c.r / c.n)) + hex(Math.round(c.g / c.n)) + hex(Math.round(c.b / c.n)));
    return { palette, fonts: { heading: null, body: null }, layout: null, motif: null, taste_note: null, fallback: true };
  } catch {
    return null;
  }
}

// Analyze an image into design DNA. Never throws.
// Returns { palette, fonts, layout, motif, taste_note } or null.
async function analyzeReference(input, { allowFallback = true } = {}) {
  try {
    const uri = await toDataUri(input);
    if (!uri) return null;

    if (cfg.enabled) {
      const raw = await router.callVision({
        prompt: buildAnalysisPrompt(),
        images: [uri],
        system: SYSTEM,
        action: 'reference_analysis'
      });
      const parsed = parseReferenceAnalysis(raw);
      if (parsed) return parsed;
      // Vision returned junk → fall back to deterministic palette.
    }

    if (allowFallback) return await fallbackPalette(uri);
    return null;
  } catch (e) {
    return null;
  }
}

module.exports = {
  analyzeReference,
  fallbackPalette,
  parseReferenceAnalysis,
  buildAnalysisPrompt,
  toDataUri,
  MAX_BYTES
};
