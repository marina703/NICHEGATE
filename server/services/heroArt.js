// ═══════════════════════════════════════════════════════════════════════════
// HERO ART — specific, desirable hero objects for marketplace covers.
//
// This module generates the HERO image that goes into the right 55% of a
// marketplace cover. Unlike coverArt.js, which produces generic lifestyle
// scenes (workbench flat-lays, desk props), this module produces ONE specific,
// desirable object per product — the visual identity of the product itself.
//
// The hero prompt follows the n8n Design Studio pattern:
//   - ONE photoreal or high-end 3D render
//   - NO text, letters, numbers, logos, or UI copy anywhere
//   - Clean negative space on the LEFT 45% of the frame for typography
//
// Reuses the exact same provider infrastructure as coverArt.js
// (Cloudflare Workers AI / Pollinations / fal).
// ═══════════════════════════════════════════════════════════════════════════

const coverArt = require('./coverArt');
const designStyles = require('./designStyles');
const runtimeConfig = require('./runtimeConfig');

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const HERO_WIDTH = coverArt.COVER_WIDTH;
const HERO_HEIGHT = coverArt.COVER_HEIGHT;
const OUT_DIR = path.join(runtimeConfig.resolvePersistentDir('covers'), 'heroes');
fs.mkdirSync(OUT_DIR, { recursive: true });

const HERO_PROMPT_VERSION = 'hero-v1';

// ── HERO PROMPT TEMPLATES ─────────────────────────────────────────────────
// Each entry describes ONE specific, desirable object related to the product.
// The object sits in the right portion of the frame; the left stays clean.
// These are art-direction hints, not AI model claims.
// Format: { subject: string, lighting: string, material: string, style: string }

const HERO_OBJECT_TEMPLATES = {
  // ── Digital products ──
  template_pack: {
    subject: 'a sleek tablet and smartphone displaying matching pastel-gradient interface layouts, side by side on a soft linen surface',
    lighting: 'bright, even, soft window light from the left',
    material: 'matte concrete and natural linen textures',
    style: 'clean, modern, editorial product photography, shallow depth of field'
  },
  render_pack_3d: {
    subject: 'a tight cluster of three glossy ceramic orbs in matte black, ivory, and dusty sage, floating on a plush charcoal surface',
    lighting: 'dramatic single light from the upper left casting soft shadows',
    material: 'smooth glazed ceramic, plush velvet fabric',
    style: 'high-end product photography with premium material rendering, 4K detail'
  },
  // ── Business / service tools ──
  invoice: {
    subject: 'a bound premium invoice ledger book with thick cream paper and a brass paperweight, lying open on a warm wood surface',
    lighting: 'warm directional afternoon light from the upper right',
    material: 'textured leather cover, thick paper, polished brass',
    style: 'warm, professional, shallow depth of field'
  },
  spreadsheet: {
    subject: 'a tablet displaying a clean financial dashboard with bar charts and metrics, resting on a walnut desk with a brass mechanical pencil',
    lighting: 'soft desk lamp glow with ambient cool daylight from a window',
    material: 'polished walnut wood, anodized aluminum tablet frame',
    style: 'professional workspace photography, documentary realism'
  },
  checklist: {
    subject: 'a thick hardbound checklist notebook with a leather cover, open to a completed page, beside a dark charcoal pen',
    lighting: 'soft even light from above-left, gentle shadows',
    material: 'premium leather, smooth paper, matte metal clip',
    style: 'minimal, focused, high detail on the paper texture'
  },
  booking: {
    subject: 'an open appointment book with a week-view spread, a mechanical pencil and a small succulent, on a light oak surface',
    lighting: 'morning light from the left, soft directional',
    material: 'light oak wood, paper pages, terracotta pot',
    style: 'bright, airy, professional — clean composition'
  },
  brand: {
    subject: 'a letterpress-printed brand style guide booklet, open to a color palette page with swatches, beside a fine fountain pen',
    lighting: 'even editorial lighting, soft shadows',
    material: 'cotton paper, brass pen, cloth-bound cover',
    style: 'quiet luxury, minimal, sophisticated'
  },
  journal: {
    subject: 'a leather-bound journal with gilt edges, open to a handwritten page, beside a dried floral sprig and a soft graphite pencil',
    lighting: 'warm, diffused, golden hour light from the right',
    material: 'aged leather, smooth paper, dried botanicals',
    style: 'cozy, contemplative, shallow depth of field'
  },
  wall_art: {
    subject: 'three minimalist framed art prints with abstract geometric shapes in muted tones, arranged in a vertical stack on a warm white wall',
    lighting: 'even ambient gallery lighting, no harsh shadows',
    material: 'matte paper prints, thin black wood frames',
    style: 'gallery/museum lighting, clean minimal lines'
  },
  worksheet: {
    subject: 'a printed worksheet page lying flat, with a pencil and eraser, on a clean white desk surface',
    lighting: 'bright, even, overhead fluorescent-style light',
    material: 'smooth paper, plastic pencil, rubber eraser',
    style: 'clean, academic, sharp focus'
  },
  planner: {
    subject: 'a premium hardcover planner lying open to a weekly spread, with a fine-tip marker and a small notebook, on a marble surface',
    lighting: 'even natural light from a large window',
    material: 'hardcover binding, smooth paper, cool marble',
    style: 'bright, organized, lifestyle product photography'
  },
  leadmagnet: {
    subject: 'an open booklet with a bold cover headline, resting on a clean white surface with a single fountain pen',
    lighting: 'soft, even, diffused light from above',
    material: 'matte paper cover, smooth paper interior, steel pen',
    style: 'professional, crisp, high contrast'
  },
  website: {
    subject: 'a MacBook Pro displaying a clean website dashboard with soft gradient backgrounds and abstract shapes, on a light wood desk',
    lighting: 'soft window light from the left, gentle screen glow',
    material: 'anodized aluminum, light oak wood, glass',
    style: 'modern workspace, shallow depth of field'
  },
  social: {
    subject: 'a smartphone displaying a stylized social media grid layout with pastel gradient posts, lying on a soft fabric surface',
    lighting: 'soft ring light from above, even illumination',
    material: 'glass phone screen, soft fabric backdrop',
    style: 'creator workspace, clean product photography'
  },
  bundle: {
    subject: 'three premium digital product packages in matching matte black boxes with subtle gold foil logos, arranged in a staggered stack on felt',
    lighting: 'dramatic overhead light with soft shadows',
    material: 'matte box material, soft felt surface, gold foil accents',
    style: 'premium, high contrast, product hero shot'
  },
  tool: {
    subject: 'a precision measuring tool (digital caliper) in a matte black finish, open and resting on a clean steel surface with a technical drawing behind',
    lighting: 'even, cool, technical drafting light',
    material: 'anodized aluminum, steel, technical paper',
    style: 'technical, precise, clean — professional tool photography'
  },
  'party-printable': {
    subject: 'a set of three party bunting banners in coordinating colors hanging against a neutral backdrop, with scattered confetti',
    lighting: 'bright, festive, evenly lit',
    material: 'glossy paper, matte string, paper confetti',
    style: 'celebration, crisp detail, clean background'
  },
  'decision-matrix': {
    subject: 'an open decision matrix worksheet with a pen making a selection, on a clean desk surface with a small succulent',
    lighting: 'soft even daylight from a window',
    material: 'smooth paper, steel pen, terracotta pot',
    style: 'professional, clean, focused'
  },
  roi: {
    subject: 'a tablet displaying a clean ROI calculator interface with a line graph showing upward growth, resting on a light wood surface',
    lighting: 'bright, even, professional office lighting',
    material: 'glass tablet screen, light oak wood',
    style: 'business professional, sharp display'
  },
  pricing: {
    subject: 'a premium pricing guide booklet with a matte cover, open to a rate card page with elegant typography, beside a brass ruler',
    lighting: 'soft directional light from the upper left',
    material: 'matte cover, smooth paper, polished brass',
    style: 'professional, clean, editorial'
  },
  inventory: {
    subject: 'an open inventory checklist with a pen and a small stack of labeled product boxes, on a workshop bench',
    lighting: 'bright, functional workshop lighting',
    material: 'paper checklist, cardboard boxes, steel pen',
    style: 'organized, practical, clear'
  },
  // ── Pyrotechnics ──
  'pyro-batch': {
    subject: 'a curated arrangement of three professional aerial shells in black powder cans, sitting on a non-flammable ceramic surface with a safety fuse coil',
    lighting: 'even, neutral, studio lighting — no open flames',
    material: 'matte cardboard mortar tubes, ceramic surface, paper fuse spool',
    style: 'professional, serious, technical product photography — safety-first, no combustion'
  },
  'pyro-lift-fuse': {
    subject: 'a precision-cut black powder lift fuse with a green safety strip, coiled on a non-sparking aluminum spool, resting on ceramic tile',
    lighting: 'bright, even, technical lighting',
    material: 'textured paper fuse, anodized aluminum spool, matte ceramic',
    style: 'precise, professional, clean — no flames or sparks'
  },
  'pyro-shoot-log': {
    subject: 'a bound field notebook with a weathered cover, open to a shoot log table, with a pencil tucked in the spiral binding',
    lighting: 'warm, natural daylight from a window',
    material: 'textured cover, smooth paper pages, steel spiral',
    style: 'authentic, used, documentary style — no fire or explosives'
  },
  // ── Recovery vertical ──
  'affirmation-labels': {
    subject: 'a fanned stack of round die-cut affirmation label sheets with dashed cut circles, each circle holding a short word, lying on a calm linen surface beside a closed journal and a wooden pen',
    lighting: 'soft, diffused morning light from the left, gentle shadows',
    material: 'matte sticker paper, natural linen, light wood',
    style: 'calm, premium stationery product photography, shallow depth of field'
  },
  'recovery-journal': {
    subject: 'an open daily journal with a handwritten page, a fine black pen resting across the spine, a warm ceramic mug of tea beside it',
    lighting: 'warm golden-hour daylight from the right, soft shadows',
    material: 'linen-bound cover, cream paper, ceramic mug',
    style: 'cozy, contemplative, premium journal photography'
  },
  'recovery-nutrition': {
    subject: 'a gentle nutrition guide booklet lying open to a real-food recipe page, with fresh produce — leafy greens, berries, a halved avocado — arranged neatly beside it',
    lighting: 'bright, clean, even daylight from above',
    material: 'matte paper booklet, fresh whole foods, light ceramic plate',
    style: 'fresh, wholesome, editorial food photography'
  },
  'meeting-flashcards': {
    subject: 'a neat fanned stack of printed meeting flashcards with rounded corners, the top card showing a simple checklist layout, on a warm wood surface with a pen',
    lighting: 'soft even light from the left',
    material: 'thick matte cardstock, light wood',
    style: 'clean, organized, premium stationery photography'
  },
  // ── Default ──
  default: {
    subject: 'a premium notebook with a matte cover, open to a clean page, beside a fine pen and a small plant, on a warm wood surface',
    lighting: 'soft natural daylight from the left',
    material: 'textured cover, smooth paper, natural wood, living plant',
    style: 'warm, professional, lifestyle product photography, shallow depth of field'
  }
};

// ── HERO PROMPT GENERATION ──────────────────────────────────────────────────

/**
 * Build a hero prompt for a specific product.
 * Follows the n8n pattern: ONE photoreal object, text-free, negative space on left.
 */
function buildHeroPrompt(prof, product, theme) {
  const productType = product.type || 'default';
  const template = HERO_OBJECT_TEMPLATES[productType] || HERO_OBJECT_TEMPLATES.default;

  // Build the scene: specific object + lighting + materials + style
  const parts = [
    'NO TEXT OR WRITING ANYWHERE — the subject must be blank/plain: no letters, numbers, handwriting, scribbles, doodles, labels or signage',
    `ultra-photorealistic product photography of ${template.subject}`,
    `lighting: ${template.lighting}`,
    `materials: ${template.material}`,
    `style: ${template.style}`,
    // Niche grounding — the scene must belong to this product's world
    prof && prof.name ? `the scene belongs to the ${prof.name} niche` : '',
    // Any paper/page/screen in-frame is BLANK — this is what kills the
    // "wingdings" pseudo-handwriting that image models love to add.
    'any paper, page, notebook or screen in the scene is BLANK — blank paper, no handwriting, no scribbles, no doodles, no printed text',
    // Negative space instruction — left 45% stays clean for typography
    'leave the LEFT 45% of the frame as clean, uncluttered negative space — no props, no shadows, no texture on the left third',
    // Hard text ban — matches n8n rules
    'NO TEXT, NO LETTERS, NO NUMBERS, NO LOGOS, NO WRITING, NO HANDWRITING, NO SCRIBBLES, NO DOODLES, NO WATERMARKS, NO SCREEN CONTENT, NO UI ELEMENTS, NO CHARTS, NO GRAPHS, NO DOCUMENTS, NOTHING READABLE',
    'photorealistic, professional product photography, 8K detail, full-frame DSLR, 35mm lens',
    'not an illustration, not a 3D render, not CGI, not clipart'
  ];

  return parts.filter(Boolean).join(', ');
}

// Retry helper for rate-limited providers (402/429 = quota window, transient).
async function withRetry(fn, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      const status = e.response && e.response.status;
      const retryable = status === 402 || status === 429 || status === 503 || /timeout|ECONNRESET|ETIMEDOUT/i.test(e.message);
      if (!retryable || i === attempts - 1) throw e;
      const wait = [20000, 45000, 90000][i] || 90000;
      console.error(`[HEROART] ${status || e.message.slice(0, 40)} — retry ${i + 1}/${attempts - 1} in ${wait / 1000}s`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

// ── HERO IMAGE CACHE ────────────────────────────────────────────────────────

function heroCachePath(prof, product, theme) {
  const prompt = buildHeroPrompt(prof, product, theme);
  const h = crypto.createHash('sha1')
    .update(`${HERO_PROMPT_VERSION}|heroArt|${prof.slug || prof.name}|${product.id || ''}|${product.type}|${prompt}`)
    .digest('hex').slice(0, 16);
  return path.join(OUT_DIR, `${prof.slug || 'hero'}-${product.type || 'art'}-${h}.jpg`);
}

// ── PROVIDER ROUTERS ────────────────────────────────────────────────────────

/**
 * Generate a hero image via Cloudflare Workers AI (the cover worker).
 */
async function generateHeroViaWorker(prompt, outPath, opts = {}) {
  const axios = require('axios');
  const url = process.env.COVER_WORKER_URL;
  if (!url) throw new Error('COVER_WORKER_URL missing');

  const seed = opts.forceNew ? Math.floor(Math.random() * 2147483647) : undefined;
  const body = coverArt.workerRequestBody(prompt, seed);
  const res = await axios.post(url, JSON.parse(body), {
    timeout: 180000,
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.COVER_WORKER_KEY ? { 'x-ng-key': process.env.COVER_WORKER_KEY } : {})
    },
    responseType: 'json'
  });

  if (res.data && res.data.image) {
    const buffer = Buffer.from(res.data.image, 'base64');
    // The worker (Leonardo) returns ~1200x1792 for a 1200x1800 request — a
    // sub-1% deviation that is imperceptible once cover-cropped into the
    // hero slot. Accept within tolerance instead of burning retries + falling
    // back to the slower free tier on every single generation.
    const tol = { minW: Math.round(HERO_WIDTH * 0.99), minH: Math.round(HERO_HEIGHT * 0.985) };
    coverArt.writeNativePortrait(outPath, buffer, tol);
    return outPath;
  }
  throw new Error('worker returned no image');
}

/**
 * Generate a hero via fal.ai (same provider as coverArt, hero prompt).
 */
async function generateHeroViaFal(prompt, outPath, opts = {}) {
  const axios = require('axios');
  const key = process.env.FAL_API_KEY;
  if (!key) throw new Error('FAL_API_KEY missing');
  const model = process.env.FAL_MODEL || 'fal-ai/flux/schnell';

  const sub = await axios.post(`https://queue.fal.run/${model}`, {
    prompt, image_size: { width: HERO_WIDTH, height: HERO_HEIGHT }, num_images: 1, enable_safety_checker: true,
    ...(opts.forceNew ? { seed: Math.floor(Math.random() * 2147483647) } : {})
  }, { headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, timeout: 60000 });

  const reqId = sub.data && sub.data.request_id;
  if (!reqId) throw new Error('fal queue rejected');

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const st = await axios.get(`https://queue.fal.run/${model}/requests/${reqId}/status`,
      { headers: { Authorization: `Bearer ${key}` }, timeout: 30000 });
    if (st.data && st.data.status === 'COMPLETED') break;
    if (st.data && st.data.status === 'FAILED') throw new Error('fal render failed');
  }

  const done = await axios.get(`https://queue.fal.run/${model}/requests/${reqId}`,
    { headers: { Authorization: `Bearer ${key}` }, timeout: 30000 });
  const imgs = done.data && (done.data.images || (done.data.data && done.data.data.images)) || [];
  const imgUrl = imgs[0] && (imgs[0].url || imgs[0]);
  if (!imgUrl) throw new Error('fal returned no image');

  const bin = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 120000, maxBodyLength: Infinity });
  coverArt.writeNativePortrait(outPath, Buffer.from(bin.data));
  return outPath;
}

/**
 * Generate a hero via Pollinations (free, no key required).
 */
async function generateHeroViaPollinations(prompt, outPath) {
  const axios = require('axios');
  const base = process.env.POLLINATIONS_BASE_URL || 'https://image.pollinations.ai/prompt';
  const url = `${base}/${encodeURIComponent(prompt)}?width=${HERO_WIDTH}&height=${HERO_HEIGHT}&nologo=true`;
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 120000, maxBodyLength: Infinity });
  if (!res.data || !res.data.length) throw new Error('empty image response');
  coverArt.writeNativePortrait(outPath, Buffer.from(res.data), { minW: 600, minH: 900 });
  return outPath;
}

// ── MAIN ENTRY ──────────────────────────────────────────────────────────────

/**
 * Ensure a hero image exists for this product.
 * Returns the file path, or null on failure.
 *
 * Reuses coverArt.js provider infrastructure — same Cloudflare/Pollinations/fal
 * providers, same error classification, same quota handling.
 *
 * On any failure, gracefully degrades to coverArt.ensureCoverArt (the standard
 * photo scene). Never throws.
 */
async function ensureHeroArt(product, prof, theme = {}, opts = {}) {
  const cfg = require('./modelConfig');
  if (!cfg.enabled) {
    return coverArt.ensureCoverArt(product, prof, theme, opts);
  }

  try {
    const basePath = heroCachePath(prof, product, theme);
    const seed = opts.forceNew ? Math.floor(Math.random() * 2147483647) : undefined;
    const out = seed === undefined ? basePath : basePath.replace(/\.jpg$/, `-r${seed}.jpg`);

    // Cache hit
    if (!opts.fresh && !opts.forceNew && fs.existsSync(basePath) && fs.statSync(basePath).size > 5000) {
      return basePath;
    }

    const prompt = buildHeroPrompt(prof, product, theme);
    const prov = coverArt.provider();

    let result;
    if (prov === 'cloudflare') {
      try {
        result = await withRetry(() => generateHeroViaWorker(prompt, out, { forceNew: !!opts.forceNew }));
      } catch (e) {
        // Worker quota exhausted after retries — fall through to the free tier.
        console.error('[HEROART] worker exhausted after retries:', e.message, '— trying pollinations');
        result = await generateHeroViaPollinations(prompt, out);
      }
    } else if (prov === 'fal') {
      result = await generateHeroViaFal(prompt, out, opts);
    } else {
      result = await generateHeroViaPollinations(prompt, out);
    }

    if (result && fs.existsSync(result)) return result;
    return null;
  } catch (e) {
    console.error('[HEROART] failed:', e.message);
    return await coverArt.ensureCoverArt(product, prof, theme, opts);
  }
}

// ── PUBLIC API ──────────────────────────────────────────────────────────────

module.exports = {
  HERO_WIDTH,
  HERO_HEIGHT,
  HERO_PROMPT_VERSION,
  HERO_OBJECT_TEMPLATES,
  buildHeroPrompt,
  ensureHeroArt,
  heroCachePath,
  generateHeroViaWorker,
  generateHeroViaFal,
  generateHeroViaPollinations
};
