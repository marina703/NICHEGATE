// ═══════════════════════════════════════════════════════════════════════════
// LISTING AGENT — the E2E executor for one listing.
//
// WHERE IT SITS: the engine decides WHAT to build (concept → builders →
// deliverable). This agent decides HOW IT SELLS, per product, with judgment:
//
//   1. READ   — the actual product content (real preview page text, type,
//               niche, price) — not a template guess.
//   2. WRITE  — title + description + 13 tags via the ideation model,
//               strict JSON, grounded in what the product really contains.
//   3. LINT   — hard guards against the failure modes of the deterministic
//               engine: doubled words, FOREIGN product terms (invoice copy on
//               a labels product — the exact bug this replaces), tag limits,
//               banned boilerplate. Fail → one revision pass with the
//               problems fed back.
//   4. PERSIST— approved spec → products.listing_json, which every publish
//               path (Gumroad + Etsy) prefers over the template copy.
//
// MODEL OFF / failure → the (now type-aware) deterministic engine writes the
// listing. Never throws. Never blocks a publish.
// ═══════════════════════════════════════════════════════════════════════════

const router = require('./modelRouter');
const modelConfig = require('./modelConfig');
const seoEngine = require('./seoEngine');
const coverDirector = require('./coverDirector');

const SYSTEM = [
  'You are the listing agent for a premium digital-product store.',
  'You are given the REAL content of one product (its actual preview pages).',
  'Write the marketplace listing for THIS product only:',
  '- title: ≤140 chars, no doubled words, niche + product type, no ALL CAPS spam',
  '- description: buyer-facing; what it really is, what is inside (from the',
  '  content given), how to use it, instant download. No invented claims.',
  '- tags: 10 to 13, each ≤20 chars, real shopper search language',
  'Return STRICT JSON only:',
  '{"title":"...","description":"...","tags":["..."]}'
].join('\n');

// Foreign terms per product type — if the copy mentions one of these while
// selling a different type, the listing is describing the wrong product.
const FOREIGN_TERMS = {
  'affirmation-labels': ['invoice', 'calculator', 'pricing tool', 'booking form', 'p&l', 'spreadsheet template', 'social media kit'],
  'recovery-journal': ['invoice', 'calculator', 'booking form', 'social media kit'],
  'recovery-nutrition': ['invoice', 'calculator', 'booking form', 'social media kit'],
  'meeting-flashcards': ['invoice', 'calculator', 'booking form'],
  journal: ['invoice', 'calculator', 'booking form', 'social media kit'],
  invoice: ['affirmation labels', 'sticker sheet', 'meal plan'],
  checklist: ['affirmation labels', 'sticker sheet'],
  spreadsheet: ['affirmation labels', 'sticker sheet'],
  social: ['affirmation labels', 'sticker sheet'],
  booking: ['affirmation labels', 'sticker sheet'],
  bundle: ['affirmation labels', 'sticker sheet']
};

/** Hard lint — every problem must be empty before a listing ships. */
function lintListing(spec, product) {
  const problems = [];
  const title = String(spec.title || '');
  const desc = String(spec.description || '');
  const tags = Array.isArray(spec.tags) ? spec.tags : [];
  const all = `${title} ${desc}`.toLowerCase();

  if (!title || title.length > 140) problems.push('title missing or >140 chars');
  if (!desc || desc.length < 80) problems.push('description too thin');
  if (/\b(\w+) \1\b/i.test(title)) problems.push('doubled word in title');
  if (tags.length < 10 || tags.length > 13) problems.push(`${tags.length} tags (need 10–13)`);
  if (tags.some((t) => String(t).length > 20)) problems.push('tag over 20 chars');

  // Claims we cannot back — a buyer complaint in waiting.
  const BANNED_CLAIMS = ['lifetime updates', 'lifetime access', 'money back', 'money-back', 'guaranteed', 'risk free', 'risk-free', 'best seller', '#1'];
  for (const claim of BANNED_CLAIMS) {
    if (all.includes(claim)) problems.push(`unverifiable claim: "${claim}"`);
  }

  const foreign = FOREIGN_TERMS[product.type] || [];
  for (const term of foreign) {
    if (all.includes(term)) problems.push(`foreign term "${term}" — wrong product copy`);
  }
  // The listing must actually name its own product type words.
  const ownWords = {
    'affirmation-labels': ['label'],
    'recovery-journal': ['journal'],
    'recovery-nutrition': ['nutrition', 'meal', 'food', 'cleanse'],
    'meeting-flashcards': ['card', 'meeting']
  }[product.type];
  if (ownWords && !ownWords.some((w) => all.includes(w))) problems.push(`copy never names the product (${product.type})`);

  return problems;
}

/** Deterministic spec — the (type-aware) seo engine. */
function deterministicListing(product, prof) {
  const seoData = seoEngine.generateSEO(prof, product.type, product.theme, []);
  return {
    title: dedupeTitle(seoData.shortTitle || product.name, prof),
    description: seoData.description,
    tags: (seoData.tags || []).slice(0, 13),
    source: 'deterministic'
  };
}

/** Collapse the "{prof} {prof-tail}" doubling, e.g. "...Recovery Recovery Journal". */
function dedupeTitle(name, prof) {
  let t = String(name || '').replace(/\s+/g, ' ').trim();
  const p = String((prof && prof.name) || '').trim();
  if (p && t.toLowerCase().startsWith(p.toLowerCase())) {
    const rest = t.slice(p.length).trim().split(' ');
    const profLast = (p.split(/\s+/).pop() || '').toLowerCase();
    if (rest.length > 1 && rest[0].toLowerCase() === profLast) t = `${p} ${rest.slice(1).join(' ')}`.trim();
  }
  return t.replace(/\b(\w+) \1\b/i, '$1');
}

/**
 * Direct one listing E2E. Returns { title, description, tags, source, problems }.
 * Never throws.
 */
async function directListing(product, prof, opts = {}) {
  const fallback = deterministicListing(product, prof);
  if (!modelConfig.enabled) return fallback;

  let previewHtml = '';
  try {
    const fileFactory = require('./fileFactory');
    previewHtml = fileFactory.buildPreviewHTML(product, prof, fileFactory.fallbackTheme(product));
  } catch { /* fall back to engine copy */ }
  if (!previewHtml) return fallback;

  const base = [
    `Product: ${product.name}`,
    `Type: ${product.type} · Price: ${product.price}`,
    `Niche: ${prof && prof.name ? prof.name : ''}`,
    ``,
    `THE PRODUCT'S ACTUAL CONTENT (from its real pages):`,
    coverDirector.pageSummary(previewHtml)
  ].join('\n');

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const feedback = attempt === 0 ? '' : `\n\nThe previous attempt had these problems — fix them: ${(opts.lastProblems || []).join('; ')}`;
      const raw = await router.generateIdeas(base + feedback, SYSTEM);
      const spec = extractJson(raw);
      if (!spec || !spec.title || !spec.description) continue;
      // Agent copy + engine tags merged: the model is great at prose but
      // unreliable at hitting a tag quota — top up rather than fall back.
      const engineTags = (seoEngine.generateSEO(prof, product.type, product.theme, []).tags || []).slice(0, 13);
      const agentTags = (Array.isArray(spec.tags) ? spec.tags : []).map((t) => String(t).slice(0, 20));
      const tags = [...agentTags];
      for (const t of engineTags) { if (tags.length >= 13) break; if (!tags.some((x) => x.toLowerCase() === t.toLowerCase())) tags.push(t); }
      const cleaned = {
        title: String(spec.title).slice(0, 140),
        description: plainText(String(spec.description).slice(0, 4000)),
        tags,
        source: 'agent'
      };
      const problems = lintListing(cleaned, product);
      if (!problems.length) return cleaned;
      opts.lastProblems = problems;
    } catch { /* next attempt, then deterministic */ }
  }
  return fallback;
}

/** Strip markdown markers — Etsy's description field is plain text. */
function plainText(s) {
  return String(s || '')
    .replace(/\*\*/g, '')
    .replace(/^\s*[*-]\s+/gm, '• ')
    .replace(/#{1,6}\s*/g, '')
    .replace(/_{2,}/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractJson(text) {
  if (!text) return null;
  // The model often wraps JSON in ```json fences — strip them first.
  const stripped = String(text).replace(/```(?:json)?/gi, '');
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(stripped.slice(start, end + 1)); } catch { return null; }
}

module.exports = { directListing, lintListing, deterministicListing };
