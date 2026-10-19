// ═══════════════════════════════════════════════════════════════════════════
// NICHE FISSION (N1.1) — expands one broad seed into specific buyer micro-niches.
//   • Text-only and cheap; spend goes through modelRouter's per-batch call cap.
//   • MODEL_ENABLED off, a failed call, or an unusable reply → [] (never throws).
//   • Output is only candidates. discovery.insertUniverseTrend still runs the
//     vetting gate, so nothing reaches the pipeline unless it is productizable.
// ═══════════════════════════════════════════════════════════════════════════

const router = require('./modelRouter');
const cfg = require('./modelConfig');

// Broad domains the sweep rotates through. Deliberately short: each sweep
// spends one model call, so breadth comes from rotation over time.
const SEEDS = [
  'trades', 'beauty', 'fitness', 'parenting', 'neurodivergence', 'grief',
  'relocation', 'sobriety', 'language learning', 'homesteading', 'faith',
  'chronic illness', 'pet care', 'vintage restoration'
];

const GENERIC = /\b(template|guide|kit|toolkit|pack|bundle|general|all-purpose)\b/i;
const MIN_NAME = 6;
const MAX_NAME = 70;

/** Parse the model's JSON array defensively. Any malformed input → []. */
function parseFission(text) {
  if (!text) return [];
  const cleaned = String(text).replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start < 0 || end < start) return [];
  let arr;
  try {
    arr = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];

  const out = [];
  const seen = new Set();
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const name = String(item.name || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
    if (name.length < MIN_NAME || GENERIC.test(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name,
      buyer: String(item.buyer || '').slice(0, 120).trim(),
      intent: String(item.intent || '').slice(0, 120).trim(),
      why_underserved: String(item.why_underserved || '').slice(0, 200).trim()
    });
  }
  return out;
}

/**
 * Expand a seed into up to `count` specific micro-niches. Returns [] when the AI
 * layer is off or the call fails — callers treat empty as "nothing new".
 */
async function fission(seed, count = 10) {
  if (!cfg.enabled) return [];
  const s = String(seed || '').trim();
  if (!s) return [];
  const n = Math.max(1, Math.min(25, Number(count) || 10));

  const prompt = [
    `Seed: "${s}".`,
    `Output ${n} SPECIFIC, non-obvious buyer micro-niches as a JSON array.`,
    'Each item: {"name":"...","buyer":"...","intent":"...","why_underserved":"..."}.',
    'Avoid generic words (template, guide, kit, pack, bundle).',
    'Favor underserved professions, neurodivergent or identity groups, life-stage transitions,',
    'location- or culture-specific buyers, and hobby subcultures.',
    'Reply with ONLY the JSON array.'
  ].join('\n');

  try {
    const raw = await router.generateIdeas(prompt,
      'You are a blue-ocean niche strategist for digital products. You find underserved buyers, never broad categories.');
    return parseFission(raw).slice(0, n);
  } catch (e) {
    console.error('[FISSION] failed:', e.message);
    return [];
  }
}

module.exports = { fission, parseFission, SEEDS };
