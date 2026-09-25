// ═══════════════════════════════════════════════════════════════════════════
// COVER ART — AI lifestyle backgrounds for marketplace thumb-stoppers.
//   Image 1 = v2 HTML title cover (clean text, always local, always free)
//   Image 2 = AI lifestyle photo (stops the scroll — this file)
//   Image 3 = inside-page preview (proof of quality, Puppeteer HTML shot)
// Photorealism wins on Etsy/Gumroad; HTML screenshots never do. AI text
// garbles, so prompts are photo-only (NO TEXT). Title composites in UI.
//   Pollinations.ai: $0, no key, 20-60s. fal.ai FLUX: ~$0.003, 2-5s.
// Never throws — returns null on any failure so callers degrade gracefully.
// ═══════════════════════════════════════════════════════════════════════════

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const runtimeConfig = require('./runtimeConfig');

const OUT_DIR = path.join(runtimeConfig.resolvePersistentDir('covers'), 'ai');
fs.mkdirSync(OUT_DIR, { recursive: true });

function provider() {
  return String(process.env.COVER_ART_PROVIDER || 'pollinations').toLowerCase();
}

// Photo-only scene per niche — styled props, morning light, no text.
// ═══════════════════════════════════════════════════════════════════════════
// NICHE-SPECIFIC COVER ART PROMPTS — each profession category gets unique
// visual scenes, props, and mood. The AI generates photo-only backgrounds
// (no text — it garbles). Title composites happen in the storefront UI.
// ═══════════════════════════════════════════════════════════════════════════

const designDNA = require('./designStyles');

// Per-niche scene descriptions — unique props, mood, lighting per category
const NICHE_SCENES = {
  tech: {
    mood: 'clean, modern, slightly futuristic',
    lighting: 'cool blue-white studio light, subtle screen glow',
    props: 'holographic elements, circuit board patterns, sleek monitors, LED accents',
    textures: 'brushed aluminum, matte black surfaces, glass',
  },
  trades: {
    mood: 'industrial, hardworking, authentic',
    lighting: 'warm workshop light, golden hour through warehouse windows',
    props: 'tool belt, measuring tape, hard hat, blueprints, concrete surfaces',
    textures: 'raw wood, concrete, steel, worn leather',
  },
  wellness: {
    mood: 'serene, calming, natural',
    lighting: 'soft diffused natural light, warm golden tones',
    props: 'plants, crystals, essential oils, yoga mat, incense, smooth stones',
    textures: 'linen, bamboo, smooth wood, soft fabric',
  },
  recovery: {
    mood: 'hopeful, gentle, safe',
    lighting: 'warm sunrise light, soft morning glow through sheer curtains',
    props: 'open journal, steaming tea, candle, fresh flowers, comfortable chair',
    textures: 'soft cotton, warm wood, watercolor washes, paper',
  },
  food: {
    mood: 'appetizing, artisanal, inviting',
    lighting: 'warm kitchen light, morning sun on countertops',
    props: 'fresh ingredients, wooden cutting board, copper pots, recipe cards, herbs',
    textures: 'marble countertop, butcher block, ceramic, linen napkins',
  },
  beauty: {
    mood: 'elegant, luxurious, aspirational',
    lighting: 'soft ring light, vanity mirror glow, rose gold tones',
    props: 'brushes, palettes, flowers, perfume bottles, silk fabric',
    textures: 'marble, velvet, rose gold, frosted glass',
  },
  fitness: {
    mood: 'energetic, motivating, powerful',
    lighting: 'high-contrast dramatic light, gym spotlight',
    props: 'kettlebell, resistance bands, protein shaker, stopwatch, chalk dust',
    textures: 'rubber mat, steel, concrete, sweat-wicking fabric',
  },
  outdoor: {
    mood: 'adventurous, natural, free',
    lighting: 'golden hour, campfire glow, forest dappled light',
    props: 'tent, compass, fishing rod, hiking boots, campfire, binoculars',
    textures: 'weathered wood, canvas, leather, pine needles, river stone',
  },
  finance: {
    mood: 'trustworthy, precise, professional',
    lighting: 'clean office light, daylight through tall windows',
    props: 'calculator, financial charts, leather portfolio, pen, glasses',
    textures: 'mahogany desk, leather, crisp paper, polished brass',
  },
  spiritual: {
    mood: 'reverent, peaceful, sacred',
    lighting: 'candlelight, stained glass glow, soft amber',
    props: 'prayer beads, open scripture, candle, cross, incense, stained glass',
    textures: 'velvet, aged paper, gold leaf, stone, wood',
  },
  craft: {
    mood: 'creative, handmade, personal',
    lighting: 'natural daylight, craft lamp glow, warm studio light',
    props: 'yarn, paintbrushes, pottery wheel, fabric swatches, scissors, thread',
    textures: 'raw clay, woven fabric, unfinished wood, canvas, watercolor paper',
  },
  pyro: {
    mood: 'dramatic, powerful, controlled danger',
    lighting: 'dark background with bright spark accents, ember glow, dramatic contrast',
    props: 'safety goggles, fuse cord, sparklers, mortar tubes, protective gloves',
    textures: 'charred wood, metal, fuse cord texture, smoke wisps',
  },
  default: {
    mood: 'professional, clean, inviting',
    lighting: 'bright natural light, clean shadows',
    props: 'notebook, pen, coffee cup, laptop, desk plant',
    textures: 'wood desk, clean paper, modern office',
  },
};

// Per-product-type scene templates — uses niche props for unique visuals
const TYPE_SCENES = {
  invoice: (niche) => `overhead desk flat-lay with printed documents, ${niche.props}, ${niche.textures} surfaces, ${niche.lighting}`,
  checklist: (niche) => `close-up of hands reviewing a detailed checklist with a pen, ${niche.props}, ${niche.lighting}`,
  spreadsheet: (niche) => `laptop or tablet showing organized data on a clean desk, ${niche.props}, ${niche.lighting}`,
  booking: (niche) => `open planner or calendar with pen on a styled surface, ${niche.props}, ${niche.lighting}`,
  social: (niche) => `smartphone or tablet showing social media content, ${niche.props}, ${niche.lighting}`,
  brand: (niche) => `brand stationery suite flat-lay with business cards and color swatches, ${niche.props}, ${niche.lighting}`,
  journal: (niche) => `open journal with pen on a cozy surface, ${niche.props}, ${niche.lighting}`,
  bundle: (niche) => `stack of printed materials and binders with ${niche.props}, styled collection, ${niche.lighting}`,
  leadmagnet: (niche) => `fanned printables and free samples on a bright surface, ${niche.props}, ${niche.lighting}`,
  website: (niche) => `laptop showing a clean website design, ${niche.props}, ${niche.lighting}`,
  'wall-art': (niche) => `framed print on a wall with ${niche.props}, gallery-style display, ${niche.lighting}`,
  worksheet: (niche) => `printed worksheet with pen on a desk, ${niche.props}, ${niche.lighting}`,
  planner: (niche) => `open planner spread with colored pens, ${niche.props}, ${niche.lighting}`,
  'party-printable': (niche) => `party decorations and printables styled on a surface, ${niche.props}, festive ${niche.lighting}`,
  'pyro-batch': (niche) => `workshop table with batch mixing equipment, ${niche.props}, ${niche.lighting}`,
  'pyro-lift-fuse': (niche) => `close-up of fuse assembly tools, ${niche.props}, ${niche.lighting}`,
  'pyro-shoot-log': (niche) => `clipboard with log sheet near staging area, ${niche.props}, ${niche.lighting}`,
  tool: (niche) => `professional toolkit or equipment display, ${niche.props}, ${niche.lighting}`,
  'decision-matrix': (niche) => `printed decision matrix with annotations, ${niche.props}, ${niche.lighting}`,
  roi: (niche) => `financial analysis printout with charts, ${niche.props}, ${niche.lighting}`,
  pricing: (niche) => `pricing sheet or rate card on a clean desk, ${niche.props}, ${niche.lighting}`,
  inventory: (niche) => `inventory tracking sheet or tablet, ${niche.props}, ${niche.lighting}`,
};

function promptFor(prof, product) {
  const nicheName = prof.name || 'small business';
  const t = String(product.type || '').toLowerCase();

  // Detect niche category from profession
  const nicheKey = designDNA.detectNicheCategory(prof);
  const niche = NICHE_SCENES[nicheKey] || NICHE_SCENES.default;

  // Get the type-specific scene
  const sceneFn = TYPE_SCENES[t] || ((n) => `styled workspace flat-lay with ${n.props}, ${n.lighting}`);
  const scene = sceneFn(niche);

  // Build the final prompt with niche-specific mood + anti-text tags
  return `${scene}, ${niche.mood}, photorealistic, shallow depth of field, professional product photography, no text, no words, no letters, no watermark, no UI elements`;
}
function cachePath(prof, product) {
  const h = crypto.createHash('sha1')
    .update(`${provider()}|${prof.slug || prof.name}|${product.type}|${promptFor(prof, product)}`)
    .digest('hex').slice(0, 16);
  return path.join(OUT_DIR, `${prof.slug || 'cover'}-${product.type || 'art'}-${h}.jpg`);
}

async function viaPollinations(prompt, outPath) {
  const base = process.env.POLLINATIONS_BASE_URL || 'https://image.pollinations.ai/prompt';
  const url = `${base}/${encodeURIComponent(prompt)}?width=1200&height=1500&nologo=true`;
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 120000, maxBodyLength: Infinity });
  if (!res.data || !res.data.length) throw new Error('empty image response');
  fs.writeFileSync(outPath, Buffer.from(res.data));
  return outPath;
}

// Cloudflare Workers AI (FLUX.schnell) via the nichegate-covers worker.
// Free tier: 10k neurons/day. 1024x1024 output — cover-crops into 4:5.
async function viaCloudflare(prompt, outPath) {
  const url = process.env.COVER_WORKER_URL;
  if (!url) throw new Error('COVER_WORKER_URL missing');
  const res = await axios.post(url, { prompt }, {
    timeout: 180000,
    headers: process.env.COVER_WORKER_KEY ? { 'x-ng-key': process.env.COVER_WORKER_KEY } : {}
  });
  const b64 = res.data && res.data.image;
  if (!b64) throw new Error(`worker returned no image: ${JSON.stringify(res.data).slice(0, 200)}`);
  fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
  return outPath;
}

async function viaFal(prompt, outPath) {
  const key = process.env.FAL_API_KEY;
  if (!key) throw new Error('FAL_API_KEY missing');
  const model = process.env.FAL_MODEL || 'fal-ai/flux/schnell';
  const sub = await axios.post(`https://queue.fal.run/${model}`, {
    prompt, image_size: 'portrait_4_3', num_images: 1, enable_safety_checker: true
  }, { headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' }, timeout: 60000 });
  const reqId = sub.data && sub.data.request_id;
  if (!reqId) throw new Error('fal queue rejected');
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const st = await axios.get(`https://queue.fal.run/${model}/requests/${reqId}/status`,
      { headers: { Authorization: `Key ${key}` }, timeout: 30000 });
    if (st.data && st.data.status === 'COMPLETED') break;
    if (st.data && (st.data.status === 'FAILED')) throw new Error('fal render failed');
  }
  const done = await axios.get(`https://queue.fal.run/${model}/requests/${reqId}`,
    { headers: { Authorization: `Key ${key}` }, timeout: 30000 });
  const imgs = done.data && (done.data.images || (done.data.data && done.data.data.images)) || [];
  const imgUrl = imgs[0] && (imgs[0].url || imgs[0]);
  if (!imgUrl) throw new Error('fal returned no image');
  const bin = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 120000, maxBodyLength: Infinity });
  fs.writeFileSync(outPath, Buffer.from(bin.data));
  return outPath;
}

// Ensure a lifestyle background exists for this product. Returns path or null.
async function ensureCoverArt(product, prof) {
  try {
    const out = cachePath(prof, product);
    if (fs.existsSync(out) && fs.statSync(out).size > 20000) return out;
    const prompt = promptFor(prof, product);
    const prov = provider();
    if (prov === 'cloudflare') return await viaCloudflare(prompt, out);
    if (prov === 'fal') return await viaFal(prompt, out);
    return await viaPollinations(prompt, out);
  } catch (e) {
    console.error('[COVERART] failed:', e.message);
    return null;
  }
}

module.exports = { promptFor, cachePath, ensureCoverArt, provider, OUT_DIR };
