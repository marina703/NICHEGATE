// ═══════════════════════════════════════════════════════════════════════════
// CONCEPT ENGINE — gives every product a differentiated AI angle.
//   Without this, products are "{niche} {type}" + a color recolor → saturated.
//   With it (MODEL_ENABLED=true + OPENROUTER_API_KEY), each draft gets a
//   specific concept: name, pitch, 3 benefits, and WHY it's not a generic
//   template. A local novelty guard rejects weak output. On any failure we
//   return null — callers fall back to the standard template (zero cost).
// ═══════════════════════════════════════════════════════════════════════════

const { db } = require('../database');
const router = require('./modelRouter');
const cfg = require('./modelConfig');

const GENERIC_WORDS = /\b(template|kit|pack|guide|toolkit|generic|all-purpose|simple|basic|ultimate|bundle|set|collection)\b/i;

// Strict novelty gate: rejects concepts that read as "yet another template".
function noveltyScore(c) {
  if (!c || !c.name) return 0;
  const name = String(c.name).toLowerCase();
  const pitch = String(c.pitch || '').toLowerCase();
  let s = 40;
  if (c.differentiator && String(c.differentiator).length >= 30) s += 25;
  if (c.benefits && c.benefits.length >= 3) s += 15;
  const specific = /client|quote|price|deposit|scope|follow.?up|invoice|booking|lead|revenue|margin|retain|churn|referral|win.?back|before|after|pain|objection|close|contract|estimate|schedule|inventory/i;
  if (specific.test(pitch)) s += 15;
  if (GENERIC_WORDS.test(name)) s -= 20;   // "Ultimate Template Kit" is exactly what we don't want
  if (pitch.length < 40) s -= 15;
  if (name.length < 8 || name.length > 80) s -= 10;
  return Math.max(0, Math.min(100, s));
}

// Parse the model's strict-JSON reply. Defensive: any malformed/partial output → null.
function parseConcept(text) {
  if (!text) return null;
  const cleaned = String(text)
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1));
    return {
      name: String(obj.name || '').slice(0, 70).trim(),
      pitch: String(obj.pitch || '').slice(0, 280).trim(),
      benefits: Array.isArray(obj.benefits) ? obj.benefits.slice(0, 3).map(b => String(b).slice(0, 90)) : [],
      differentiator: String(obj.differentiator || '').slice(0, 220).trim()
    };
  } catch { return null; }
}

// Generate a differentiated concept for a (prof, type). Returns concept or null.
// `brief` is optional buyer-supplied detail (from Make-this / trend generation)
// that the concept must honor; `existing` carries the dedupe angle.
async function generateConcept(prof, type, existing, brief) {
  if (!cfg.enabled || !prof || !type) return null;
  // Tolerate a bare niche string (older call sites) instead of rendering
  // "Niche: undefined (undefined)" into the prompt.
  const p = typeof prof === 'string' ? { name: prof, slug: '' } : prof;
  prof = p;
  const avoid = existing && existing.concept ? `Avoid repeating this existing angle: "${existing.concept}"` : '';
  const guidance = brief ? `Buyer-supplied details to honor: ${String(brief).slice(0, 600)}` : '';
  const prompt = [
    `Niche: ${prof.name} (${prof.slug}).`,
    `Product type: ${type}.`,
    `The Etsy/Gumroad market is saturated with generic "${prof.name} ${type}" templates.`,
    'Create ONE differentiated product concept a human competitor would NOT think of.',
    'Rules: specific pain > generic. Niche-specific angle. Unique artifact/format. Real buyer language.',
    avoid,
    guidance,
    'Reply with ONLY valid JSON, no markdown:',
    '{"name":"Short, specific, sellable product title (max 10 words, no "template/kit/pack")",',
    '"pitch":"2-3 sentence buyer-facing pitch naming the exact pain (max 60 words)",',
    '"benefits":["specific benefit 1","benefit 2","benefit 3"],',
    '"differentiator":"Why this is NOT a generic template. What makes it novel for this niche. (max 45 words)"}'
  ].join('\n');
  const raw = await router.generateIdeas(prompt, 'You are a ruthless product strategist for Etsy/Gumroad digital goods. You reject generic, saturated concepts. You find the specific, differentiated, sellable one.');
  const concept = parseConcept(raw);
  if (!concept || !concept.name || noveltyScore(concept) < 55) return null;
  return concept;
}

// Apply a concept to an existing product row: sets name + concept, returns true.
function applyConcept(productId, concept) {
  if (!productId || !concept || !concept.name) return false;
  db.prepare('UPDATE products SET name = ?, concept = ? WHERE id = ?')
    .run(concept.name.slice(0, 70), JSON.stringify(concept).slice(0, 2000), productId);
  return true;
}

// Best-effort enrich: generate + apply. Never throws. Sync callers can fire-and-forget.
async function enrichProduct(productId, brief) {
  try {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
    if (!product) return null;
    const prof = db.prepare('SELECT * FROM professions WHERE id = ?').get(product.profession_id);
    if (!prof) return null;
    const concept = await generateConcept(prof, product.type, product, brief);
    if (concept) applyConcept(product.id, concept);
    return concept;
  } catch (e) {
    console.error('[CONCEPT] enrich failed:', e.message);
    return null;
  }
}


// ---------------------------------------------------------------------
// Social copy generator.
// Never throws: if the model layer is off or the call fails we return
// deterministic, ready-to-post copy so the feature always works.
// ---------------------------------------------------------------------
function fallbackSocialPost(prompt, niche) {
  const name = (() => {
    const m = /called "([^"]+)"/.exec(String(prompt || ''));
    return (m && m[1]) ? m[1] : 'This digital download';
  })();
  const tag = String(niche || 'small business').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24) || 'smallbusiness';
  return [
    'Stop reinventing the wheel every single time.',
    '',
    name + ' was built for ' + niche + ' owners who would rather execute than stare at a blank page.',
    '',
    'What you get:',
    '  - A ready-to-use structure (no blank-page paralysis)',
    '  - Proven fields, already filled with worked examples',
    '  - Instant download - usable in the next 10 minutes',
    '',
    'One purchase. Use it forever.',
    '',
    '#smallbusiness #digitaldownload #etsyseller #' + tag,
  ].join('\n');
}

async function generateSocialPost(prompt, niche) {
  const label = niche || 'Small Business';
  try {
    if (cfg.enabled && prompt) {
      const raw = await router.generateIdeas(
        prompt,
        'You are a direct-response social copywriter for digital products. ' +
        'Output ONLY the post copy itself - no preamble, no quotation marks, no explanations.'
      );
      const text = String(raw || '').trim().replace(/^["'`]+|["'`]+$/g, '');
      if (text && text.length > 15) return text.slice(0, 4000);
    }
  } catch (e) {
    console.error('[CONCEPT] generateSocialPost failed:', e.message);
  }
  return fallbackSocialPost(prompt, label);
}

module.exports = { generateConcept, applyConcept, enrichProduct, noveltyScore, parseConcept, generateSocialPost };