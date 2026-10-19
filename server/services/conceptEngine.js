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

const NOVELTY_FLOOR = 60;      // P2.1: raised from 55
const MAX_NOVELTY_RETRIES = 2; // regenerations before the template fallback

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
  // Forecast boost: recent trending concepts get +10 points
  if (c.forecast && c.forecast.trending) s += 10;
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

// Retrieve high-performing existing concepts as dynamic few-shot examples.
// Strictly queries products that have ACTUAL proven sales (>= 2 sales in metrics).
// Never returns generic past catalog drafts or unproven ideas.
function getFewShotExamples(limit = 2) {
  try {
    const winners = db.prepare(`
      SELECT p.name, p.concept
      FROM products p
      JOIN metrics m ON p.id = m.product_id
      WHERE p.concept IS NOT NULL AND m.sales >= 2
      ORDER BY m.sales DESC
      LIMIT ?
    `).all(limit);

    if (winners.length > 0) {
      return winners.map(w => {
        try {
          const parsed = JSON.parse(w.concept);
          return JSON.stringify(parsed);
        } catch {
          return null;
        }
      }).filter(Boolean);
    }
  } catch {}

  // If there are no real proven selling products yet, do not seed with arbitrary products
  return [];
}

// --- Forecast & brainstorming helpers ---

// Predict whether a concept will trend based on niche, type, and pattern matching
function forecastTrend(prof, type, concept) {
  if (!cfg.enabled || !prof || !type || !concept) return { trending: false, score: 0 };
  const niche = prof.name.toLowerCase();
  const productType = type.toLowerCase();
  let score = 0;
  // Seasonal boost: certain types trend around holidays
  const month = new Date().getMonth();
  const seasonalBoost = { december: 15, november: 10, october: 8 };
  for (const [key, val] of Object.entries(seasonalBoost)) {
    if (key === 'december' && month === 11) score += val;
    if (key === 'november' && month === 10) score += val;
    if (key === 'october' && month === 9) score += val;
  }
  // Type-specific trends
  const typeTrends = {
    spreadsheet: { march: 10, september: 10 },
    invoice: { january: 10, august: 10 },
    checklist: { monday: 5 },
  };
  if (typeTrends[productType]) {
    const trends = typeTrends[productType];
    for (const [key, val] of Object.entries(trends)) {
      if (key === 'monday' && new Date().getDay() === 1) score += val;
      if (/January|August/.test(key) && [0, 7].includes(month)) score += val;
    }
  }
  // Concept content signals
  const name = String(concept.name || '').toLowerCase();
  const pitch = String(concept.pitch || '').toLowerCase();
  if (/trend|viral|breakthrough|hot|rising/.test(pitch)) score += 20;
  if (/seasonal|holiday|limited|urgent/.test(name)) score += 15;
  if (/IRS|permit|license|regulation|checklist|compliance/.test(name) || /IRS|permit|license|regulation|checklist|compliance/.test(pitch)) score += 25;
  const trending = score >= 30;
  return { trending, score };
}

// Brainstorm multiple concept directions for the same (prof, type).
// Each variation is asked to avoid every angle already produced in this
// batch (plus the pre-existing one), so the results are genuinely distinct.
async function brainstormConcepts(prof, type, count = 3, brief, existing) {
  if (!cfg.enabled || !prof || !type) return [];
  const p = typeof prof === 'string' ? { name: prof, slug: '' } : prof;
  prof = p;
  const seen = [];
  if (existing && existing.concept) seen.push(String(existing.concept));
  const concepts = [];
  for (let i = 0; i < count; i++) {
    // Pass everything produced so far as the avoid-list for this variation.
    const avoidExisting = seen.length ? { concept: seen.join('; ') } : existing;
    const concept = await generateConcept(prof, type, avoidExisting, brief, {
      fewShots: [],
    });
    if (concept && concept.name) {
      seen.push(concept.name);
      concepts.push({ index: i + 1, concept });
    }
  }
  return concepts;
}

// Generate a social forecast: predict engagement potential
function forecastSocialEngagement(concept, niche) {
  if (!concept) return { score: 0, prediction: 'unknown' };
  const name = String(concept.name || '').toLowerCase();
  const pitch = String(concept.pitch || '').toLowerCase();
  let score = 0;
  // Emotional triggers
  if (/struggle|pain|problem/.test(pitch)) score += 20;
  if (/save|time|effort/.test(pitch)) score += 15;
  if (/money|profit|earn/.test(pitch)) score += 25;
  // Niche relevance
  const nicheLower = String(niche || '').toLowerCase();
  if (nicheLower && name.includes(nicheLower)) score += 10;
  if (/IRS|tax|permit|license/.test(name) || /IRS|tax|permit|license/.test(pitch)) score += 30;
  // Benefits count
  if (concept.benefits && concept.benefits.length >= 3) score += 15;
  // Differentiator strength
  if (concept.differentiator && concept.differentiator.length >= 30) score += 20;
  let prediction = 'low';
  if (score >= 60) prediction = 'high';
  else if (score >= 35) prediction = 'medium';
  return { score, prediction };
}

// Engagement forecast for a product's social angle, built from its stored
// concept (name/pitch/benefits/differentiator). Deterministic; never throws.
function forecastProductEngagement(product, niche) {
  let concept = null;
  try {
    concept = product && product.concept ? JSON.parse(product.concept) : null;
  } catch (_) { concept = null; }
  return forecastSocialEngagement(concept || { name: (product && product.name) || '' }, niche);
}

// Generate a differentiated concept for a (prof, type). Returns concept or null.
// `brief` is optional buyer-supplied detail (from Make-this / trend generation)
// that the concept must honor; `existing` carries the dedupe angle.
async function generateConcept(prof, type, existing, brief, options = {}) {
  if (!cfg.enabled || !prof || !type) return null;
  // Tolerate a bare niche string (older call sites) instead of rendering
  // "Niche: undefined (undefined)" into the prompt.
  const p = typeof prof === 'string' ? { name: prof, slug: '' } : prof;
  prof = p;
  const avoid = existing && existing.concept ? `Avoid repeating this existing angle: "${existing.concept}"` : '';
  const guidance = brief ? `Buyer-supplied details to honor: ${String(brief).slice(0, 600)}` : '';
  const fewShots = (options.fewShots && options.fewShots.length) ? options.fewShots : getFewShotExamples();
  // Forecast & brainstorming: if brief contains forecast/brainstorm keywords, incorporate them
  const forecastInfo = brief && /(trend|forecast|brainstorm|predict|direction)/i.test(String(brief)) ? { enhance: true } : {};
  const fewShotSection = fewShots.length > 0
    ? `Proven winning concept structures to model (real past sellers):\n${fewShots.map((ex, i) => `Example ${i + 1}:\n${ex}`).join('\n\n')}\n`
    : '';
  const forecastNote = forecastInfo.enhance
    ? '\n---\nForecast enhancement: concept will be evaluated for trend potential and brainstormed for multiple directional variations.'
    : '';

  const prompt = [
    `Niche: ${prof.name} (${prof.slug}).`,
    `Product type: ${type}.`,
    `The Etsy/Gumroad market is saturated with generic "${prof.name} ${type}" templates.`,
    'Create ONE differentiated product concept a human competitor would NOT think of.',
    'Rules: specific pain > generic. Niche-specific angle. Unique artifact/format. Real buyer language.',
    'Ground it in the niche\'s real workflows: regulations, seasonal cycles, pricing quirks, jargon buyers actually use. The artifact should encode niche expertise (e.g. built-in IRS mileage rules, breed-safe ingredient checks, permit deadlines) so it could only have been made by an insider.',
    avoid,
    guidance,
    fewShotSection,
    'Reply with ONLY valid JSON, no markdown:',
    '{"name":"Short, specific, sellable product title (max 10 words, no "template/kit/pack")",',
    '"pitch":"2-3 sentence buyer-facing pitch naming the exact pain (max 60 words)",',
    '"benefits":["specific benefit 1","benefit 2","benefit 3"],',
    '"differentiator":"Why this is NOT a generic template. What makes it novel for this niche. (max 45 words)"}'
  ].filter(Boolean).join('\n');
  // P2.1: a concept under the novelty floor is regenerated (up to 2 retries with
  // a sharper-angle nudge) instead of being accepted or dropped to the template.
  for (let attempt = 0; attempt <= MAX_NOVELTY_RETRIES; attempt++) {
    const nudge = attempt === 0 ? '' : '\nThe previous attempt was too generic. Pick a sharper, more niche-specific angle that only an insider would name.';
    const raw = await router.generateIdeas(prompt + nudge, 'You are a ruthless product strategist for Etsy/Gumroad digital goods. You reject generic, saturated concepts. You find the specific, differentiated, sellable one.');
    const concept = parseConcept(raw);
    if (!concept || !concept.name) continue;
    // Attach the deterministic trend forecast so the novelty gate can reward
    // seasonal/keyword-trending concepts (noveltyScore reads concept.forecast).
    // Never throws — a missing forecast simply scores no boost.
    try { concept.forecast = forecastTrend(prof, type, concept); } catch (_) {}
    if (noveltyScore(concept) >= NOVELTY_FLOOR) return concept;
  }
  return null;
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

// ═════════════════════════════════════════════════════════════════════════
// VIDEO HOOK SCRIPTS (Phase 6) — 3× 15-30s TikTok/Reels scripts per product
// in the standard "template-as-b-roll" format. Same rules as the rest of
// this file: AI when enabled, deterministic fallback when not, local quality
// gate on parsed output.
// ═════════════════════════════════════════════════════════════════════════

function parseScripts(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1));
    const arr = Array.isArray(obj.scripts) ? obj.scripts : [];
    const out = arr.slice(0, 3).map(s => ({
      style: String(s.style || 'hook').slice(0, 40),
      hook: String(s.hook || '').slice(0, 120).trim(),
      beats: Array.isArray(s.beats) ? s.beats.slice(0, 5).map(b => String(b).slice(0, 140).trim()).filter(Boolean) : [],
      caption: String(s.caption || '').slice(0, 220).trim(),
      hashtags: Array.isArray(s.hashtags) ? s.hashtags.slice(0, 6).map(h => String(h).replace(/^#/, '').trim()).filter(Boolean) : []
    })).filter(s => s.hook.length >= 12 && s.beats.length >= 2);
    return out.length ? out : null;
  } catch { return null; }
}

// Deterministic scripts — the always-available baseline (template-as-b-roll).
function fallbackVideoScripts(product, niche) {
  const name = String(product && product.name || 'This digital download').slice(0, 60);
  const tag = String(niche || 'smallbusiness').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24) || 'smallbusiness';
  const price = product && product.price ? String(product.price) : '$9';
  return [
    {
      style: 'problem-agitation',
      hook: `Still doing ${niche || 'this'} paperwork by hand?`,
      beats: [
        'B-roll: messy desk / endless scrolling for a template',
        `Cut to: ${name} opened on screen — fields already set up`,
        'Show: filling one row in real time (fast, no voiceover needed)',
        `CTA text: linked below — ${price}`
      ],
      caption: `Built for ${niche || 'busy owners'} who would rather execute than hunt for templates.`,
      hashtags: [tag, 'digitaldownload', 'smallbusinesstools']
    },
    {
      style: 'proof-of-speed',
      hook: `POV: you finished a task in 10 minutes that used to take an hour`,
      beats: [
        'B-roll: timer starting on screen',
        `Screen record: ${name} doing the actual work`,
        'Timer stops — show the finished result',
        'CTA text: get the exact template — link in bio'
      ],
      caption: 'Not faster because I hustle. Faster because the system exists.',
      hashtags: [tag, 'productivity', 'template']
    },
    {
      style: 'list-value',
      hook: `3 things every ${niche || 'solo business'} owner should stop doing manually`,
      beats: [
        'Text overlay: 1 — tracking everything in your head',
        `Show: ${name} replacing that (screen record, 3s per section)`,
        'Text overlay: 3 — rebuilding docs from scratch',
        'CTA text: the whole system is under ' + price
      ],
      caption: 'Save this before the next busy season.',
      hashtags: [tag, 'businesstools', 'worksmarter']
    }
  ];
}

async function generateVideoScripts(product, opts = {}) {
  const niche = String(opts.niche || (product && product.niche) || '').trim();
  if (cfg.enabled && product) {
    try {
      const prompt =
        `Product: "${product.name}" (${product.type || 'digital download'}, ${product.price || '$9'}) for ${niche || 'solo small-business owners'}. ` +
        'Write 3 short-form video scripts (15-30s, TikTok/Reels) in template-as-b-roll format — the product is shown on screen, no talking head. ' +
        'Styles: (1) problem-agitation, (2) proof-of-speed, (3) list-value. ' +
        'Return ONLY JSON: {"scripts":[{"style":"...","hook":"...","beats":["b-roll/overlay direction",...],"caption":"...","hashtags":["..."]}]}. ';
      const raw = await router.generateIdeas(
        prompt,
        'You are a direct-response short-form video scriptwriter for digital products. Output ONLY valid JSON.'
      );
      const parsed = parseScripts(raw);
      if (parsed && parsed.length >= 2) return parsed; // 2+ solid scripts beats fallback
    } catch (e) {
      console.error('[CONCEPT] generateVideoScripts failed:', e.message);
    }
  }
  return fallbackVideoScripts(product, niche);
}

module.exports = { generateConcept, applyConcept,  enrichProduct,
  getFewShotExamples, noveltyScore, parseConcept, generateSocialPost, generateVideoScripts,
  forecastTrend, brainstormConcepts, forecastSocialEngagement, forecastProductEngagement };