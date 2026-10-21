// ═══════════════════════════════════════════════════════════════════════════
// SERVICE COPY — "what does $X get you?" one-liners for each service card.
// Service lists ship a title + price; without a description the buyer sees a
// bare number. This asks the model for one concrete sentence per service
// (labour/materials/prep/cleanup) in ONE batched call, with a deterministic
// fallback so it never blocks a render.
// ═══════════════════════════════════════════════════════════════════════════

const router = require('./modelRouter');

function parseArray(raw) {
  if (!raw) return null;
  const s = String(raw).replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const a = s.indexOf('['), b = s.lastIndexOf(']');
  if (a >= 0 && b > a) {
    try { const v = JSON.parse(s.slice(a, b + 1)); if (Array.isArray(v)) return v; } catch { /* truncated below */ }
  }
  // Salvage a truncated array (reasoning models can cut the JSON off): pull the
  // quoted string values out and use those.
  const items = [...s.matchAll(/"((?:[^"\\]|\\.)+)"/g)]
    .map(m => m[1].replace(/\\"/g, '"').replace(/\\n/g, ' ').trim())
    .filter(x => x.length > 8);
  return items.length ? items : null;
}

function fallbackLine(title) {
  const t = String(title || 'this service');
  return `Labour, materials and clean-up for a standard ${t.toLowerCase()} job — final price confirmed after an on-site measure.`;
}

// services: [{title, price}] or [[title, price]]. Returns [ 'includes...' ].
async function includeDescriptions(prof, services = []) {
  const norm = services.map(s => Array.isArray(s) ? { title: s[0], price: s[1] } : { title: s.title || s[0], price: s.price || s[1] });
  if (!norm.length) return [];
  try {
    const list = norm.map((s, i) => `${i + 1}. ${s.title} — ${s.price}`).join('\n');
    const raw = await router.callModel({
      model: process.env.SERVICE_COPY_MODEL || 'anthropic/claude-haiku-5.5',
      messages: [
        {
          role: 'system',
          content: 'You write ultra-concise, client-facing service descriptions for a trades business. '
            + 'For each numbered service + price, output ONE sentence (max 16 words) saying concretely what the price covers — '
            + 'labour, materials, prep, clean-up, warranty as relevant. No fluff, no "we strive". '
            + 'Output ONLY a JSON array of strings, one per service, in the same order.'
        },
        { role: 'user', content: `Business: ${prof && prof.name ? prof.name : 'a local trade'}\n${list}` }
      ],
      temperature: 0.4,
      maxTokens: 2000,
      action: 'service_copy'
    });
    const arr = parseArray(raw);
    if (Array.isArray(arr) && arr.length === norm.length) {
      return arr.map((x, i) => {
        const line = String(x || '').replace(/\s+/g, ' ').trim().slice(0, 180);
        return line || fallbackLine(norm[i].title);
      });
    }
  } catch (e) { /* fall through */ }
  return norm.map(s => fallbackLine(s.title));
}

module.exports = { includeDescriptions, fallbackLine, parseArray };
