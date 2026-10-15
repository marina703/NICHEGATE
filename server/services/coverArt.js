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
// (no text — it garbles). Title text is composited separately.
// ═══════════════════════════════════════════════════════════════════════════

const designDNA = require('./designStyles');

const COVER_WIDTH = 1200;
const COVER_HEIGHT = 1800;
// Cover model classes — Workers AI neuron costs vary ~24x between models
// (lucid-origin ≈ 636 neurons per 512x512 tile ≈ 7.6k per 1200x1800 cover vs
// flux-2-klein-4b ≈ 26 per output tile ≈ ~330 per cover), so the class decides
// free-tier capacity (~1 vs ~30 covers/day) AND per-cover cost. See
// COVER_MODEL_FLEXIBILITY.md and BIONIC_E2E_AUDIT.md F1.
const MODEL_ALLOWLIST = [
  '@cf/black-forest-labs/flux-2-klein-4b',
  '@cf/black-forest-labs/flux-1-schnell',
  '@cf/black-forest-labs/flux-2-klein-9b',
  '@cf/leonardo/lucid-origin'
];
function resolveCoverModel(coverClass = 'standard') {
  const envChoice = {
    standard: process.env.COVER_MODEL_STANDARD,
    draft: process.env.COVER_MODEL_DRAFT,
    hero: process.env.COVER_MODEL_HERO
  }[coverClass];
  const fallback = coverClass === 'draft'
    ? '@cf/black-forest-labs/flux-1-schnell'
    : coverClass === 'hero'
      ? '@cf/black-forest-labs/flux-2-klein-9b'
      : '@cf/black-forest-labs/flux-2-klein-4b';
  return MODEL_ALLOWLIST.includes(envChoice) ? envChoice : fallback;
}
function classifyCoverError(err) {
  const msg = String((err && err.message) || err || '');
  if (/4006|free allocation|quota|quota_exhausted|\(HTTP 429\)|\b429\b/i.test(msg)) return 'quota_exhausted';
  if (/401|403|unauthorized/i.test(msg)) return 'auth_error';
  if (/timeout|ETIMEDOUT|ECONNABORTED/i.test(msg)) return 'timeout';
  return 'upstream_error';
}
let lastCoverError = null;
function coverProviderState() { return lastCoverError; }
const COVER_PROMPT_VERSION = 'photo-cover-v3';
// Cover art follows the same style DNA used by the product, then specializes
// to a niche when a style family is shared. The names are art directions, not
// generated model claims.
const COVER_SCENES = {
  'Ink-Trap Engineered': {
    styles: ['technical'], niches: ['trades'],
    scene: 'industrial workbench flat-lay, neatly arranged steel trade tools and measuring tape, cool north-window light, charcoal slate and brushed steel, restrained technical editorial styling',
    // `look` is the lighting + styling only — used verbatim when a profession
    // scene supplies the real subject, so the DNA never injects its own props.
    look: 'cool north-window light, restrained technical editorial styling'
  },
  'Grounded Organic': {
    styles: ['organic'], niches: ['outdoor', 'food', 'home', 'wellness', 'craft'],
    scene: 'warm wooden desk flat-lay, ceramic tea cup, folded kraft paper and one small botanical sprig, tactile oak and linen, late-morning amber daylight, grounded organic styling',
    look: 'warm late-morning daylight, grounded organic styling'
  },
  'Quiet Luxury': {
    styles: ['luxe'], niches: ['beauty', 'fashion', 'spiritual'],
    scene: 'quiet linen-covered worktable flat-lay, one polished brass pen and a small neutral ceramic dish, soft diffuse window light, ivory stone and warm taupe, quiet luxury editorial styling',
    look: 'soft diffuse window light, quiet luxury editorial styling'
  },
  'Flash & Chrome': {
    styles: ['brutalist'], niches: ['creator', 'tech', 'fitness', 'pyro'],
    scene: 'dark leather work surface flat-lay, one chrome tool and restrained red gel-light accent, crisp hard-edged studio flash, black leather and brushed metal, bold contemporary editorial styling',
    look: 'crisp hard-edged studio flash, bold contemporary editorial styling'
  },
  'Editorial Ink': {
    styles: ['editorial', 'heritage'], niches: ['finance', 'recovery'],
    scene: 'mahogany writing desk flat-lay, one fountain pen and a small stack of blank cream paper, directional soft window light, deep walnut and ink tones, classic editorial styling',
    look: 'directional soft window light, classic editorial styling'
  },
  'Bold Minimalism': {
    styles: ['minimal'], niches: ['default'],
    scene: 'clean matte-white surface flat-lay, a single sculptural black pen as the only prop, crisp directional daylight and hard clean shadows, high-contrast bold minimal styling',
    look: 'crisp directional daylight and hard clean shadows, high-contrast bold minimal styling'
  }
};

function sceneFor(prof, product, theme = {}) {
  const brief = (() => {
    try { return typeof product.design_brief === 'string' ? JSON.parse(product.design_brief) : product.design_brief; }
    catch { return null; }
  })();
  const styleValue = (brief && (brief.cover_style || brief.style_lineage)) || (theme.dna && (theme.dna.styleKey || theme.dna.style)) || '';
  const styleKey = String(styleValue).toLowerCase();
  const normalizedStyle = Object.entries(designDNA.STYLES || {}).find(([, style]) => String(style.name || '').toLowerCase() === styleKey)?.[0] || styleKey;
  const nicheKey = designDNA.detectNicheCategory(prof);
  const entry = Object.entries(COVER_SCENES).find(([, spec]) => spec.styles.includes(normalizedStyle) && spec.niches.includes(nicheKey))
    || Object.entries(COVER_SCENES).find(([, spec]) => spec.styles.includes(normalizedStyle))
    || Object.entries(COVER_SCENES).find(([, spec]) => spec.niches.includes(nicheKey))
    || ['Bold Minimalism', COVER_SCENES['Bold Minimalism']];
  return { name: entry[0], ...entry[1], nicheKey, styleKey: normalizedStyle };

}

// Legacy per-niche product-shot prompts are retained only for vector-assets;
// photo covers use the DNA scene library above.
const NICHE_SCENES = {
  creator: {
    mood: 'bright, aspirational, entrepreneurial',
    lighting: 'warm daylight with a soft ring-light glow',
    props: 'smartphone with a photo grid, tablet, coffee cup, notebook with colorful sticky notes, small potted plant, pastel stationery',
    textures: 'light wood desk, matte ceramic, soft paper',
  },
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
    props: 'calculator, leather portfolio, fountain pen, glasses',
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
  invoice: (niche) => `premium service-business workspace, tactile desk materials, ${niche.textures}, ${niche.lighting}`,
  checklist: (niche) => `confident hands preparing professional tools at a job site, ${niche.props}, ${niche.lighting}`,
  spreadsheet: (niche) => `premium desk setting with dimensional materials and niche-specific tools, ${niche.props}, ${niche.lighting}`,
  booking: (niche) => `calm organized workspace with tactile planning accessories and niche-specific props, ${niche.props}, ${niche.lighting}`,
  social: (niche) => `creator workspace with camera-ready styling and niche-specific physical props, ${niche.props}, ${niche.lighting}`,
  brand: (niche) => `elegant brand-material textures and physical color samples, ${niche.props}, ${niche.lighting}`,
  journal: (niche) => `quiet reflective setting with tactile natural materials, ${niche.props}, ${niche.lighting}`,
  bundle: (niche) => `premium curated product collection on a styled surface, ${niche.props}, ${niche.lighting}`,
  leadmagnet: (niche) => `bright welcoming workspace with a curated set of niche tools, ${niche.props}, ${niche.lighting}`,
  website: (niche) => `premium studio workspace with distinctive niche-specific physical props, ${niche.props}, ${niche.lighting}`,
  'wall-art': (niche) => `gallery-like interior with tactile materials and niche-specific decor, ${niche.props}, ${niche.lighting}`,
  worksheet: (niche) => `professional work surface with physical tools and tactile materials, ${niche.props}, ${niche.lighting}`,
  planner: (niche) => `beautifully styled workspace with tactile accessories, ${niche.props}, ${niche.lighting}`,
  'party-printable': (niche) => `celebratory styled setting with physical niche-related decor, ${niche.props}, festive ${niche.lighting}`,
  'pyro-batch': (niche) => `specialized workshop table with professional equipment, ${niche.props}, ${niche.lighting}`,
  'pyro-lift-fuse': (niche) => `close-up of professional safety equipment and tools on a workbench, ${niche.props}, ${niche.lighting}`,
  'pyro-shoot-log': (niche) => `professional fireworks staging area with safety equipment, ${niche.props}, ${niche.lighting}`,
  tool: (niche) => `professional toolkit or equipment display, ${niche.props}, ${niche.lighting}`,
  'decision-matrix': (niche) => `precise professional workspace with tactile niche-specific materials, ${niche.props}, ${niche.lighting}`,
  roi: (niche) => `confident business workspace with polished physical materials, ${niche.props}, ${niche.lighting}`,
  pricing: (niche) => `premium service-business workspace, ${niche.props}, ${niche.lighting}`,
  inventory: (niche) => `well-organized professional workbench with niche-specific equipment, ${niche.props}, ${niche.lighting}`,
};

// ── STYLE TOKEN FACTORY ── strict suffixes appended to EVERY art prompt ──────
// photo-cover output is byte-compatible with the historical prompt string, so
// existing art-cache hashes stay stable; vector-asset prepares flat cutouts for
// future compositing work.
const STYLE_PROFILES = {
  'photo-cover': ['photorealistic', 'photorealistic atmospheric product photography', 'no text', 'no words', 'no letters', 'no watermark', 'no UI elements'],
  'vector-asset': ['flat vector illustration', 'solid colors', 'clean shapes', 'asset cutout', 'transparent background', 'no text', 'no words', 'no watermark']
};

// Scene words that leak across categories — a money/creator niche must never
// get circuit boards or trading floors (the "stock dashboard" defect class).
const BANNED_SCENE_TERMS = {
  creator: /circuit board patterns|holographic elements|stock market|trading floor|candlestick|ticker tape|leather portfolio/gi,
  finance: /circuit board patterns|holographic elements|yoga mat|incense|crystals/gi,
  wellness: /circuit board patterns|holographic elements|blueprints|hard hat/gi,
  default: /stock market|trading floor|ticker tape/gi
};

// ── PROFESSION-ACCURATE SCENES ────────────────────────────────────────────
// The style DNA decides the LOOK (surface, light, editorial treatment); this
// table decides the SUBJECT. A generic "steel trade tools and measuring tape"
// flat-lay is what put calipers on a roofing cover — a roofer never uses them.
// Each entry names a real setting for the trade and the exact tools that trade
// actually carries, plus the instruments that must never appear.
// Match order matters: the first hit wins, so keep specific trades above the
// broad consult/marketing catch-alls.
const PROFESSION_SCENES = [
  { match: /roof|shingle|gutter|siding|chimney/i,
    scene: 'on a residential rooftop deck: an aluminium extension ladder resting against the house, courses of asphalt shingles, ridge cap and a gutter run in frame',
    props: 'a shingle hatchet, a coil of roofing nails and a utility knife',
    avoid: 'no calipers, no drafting instruments, no office stationery, no wrenches' },
  { match: /plumb|pipe|drain|septic|water heater/i,
    scene: 'beside open copper pipework under a sink in a tiled utility room, pipe runs and shut-off valves in frame',
    props: 'a basin wrench, slip-joint pliers and a pipe cutter',
    avoid: 'no calipers, no drafting instruments, no laptops, no tape rolls' },
  { match: /electric|alarm|solar|low voltage|security install/i,
    scene: 'in front of a neat residential electrical panel with rows of breakers on a concrete utility-room floor, conduit runs in frame',
    props: 'a voltage tester, insulated screwdrivers and a wire stripper',
    avoid: 'no calipers, no paint brushes, no drafting instruments, no tape rolls' },
  { match: /hvac|heating|cooling|air duct|furnace|refrigerat/i,
    scene: 'beside a rooftop condenser unit and galvanised ductwork, service valves and copper line set in frame',
    props: 'manifold gauges, a fin comb and a service wrench',
    avoid: 'no calipers, no drafting instruments, no office stationery' },
  { match: /landscap|lawn|garden|irrigation|tree|arbor|hardscape|mulch/i,
    scene: 'on a freshly graded garden bed beside stone edging and a young shrub, tilled soil and a wheelbarrow in frame',
    props: 'bypass pruning shears, a hand trowel and work gloves',
    avoid: 'no calipers, no laptops, no laboratory glassware' },
  { match: /mold|asbestos|inspection|inspector|energy audit|thermograph|radon|mould/i,
    scene: 'in a residential basement corner with exposed joists and plastic sheeting, damp concrete block wall in frame',
    props: 'a pin-type moisture meter, a respirator and a marking crayon',
    avoid: 'no calipers, no laptops, no clean-room glassware, no clipboards, no paper' },
  { match: /drywall|plaster|stucco|painter|paint(ing)?\b|wallpaper/i,
    scene: 'on a sheet of fresh drywall in a half-renovated room, a taping seam, blue painter tape lines and a drop cloth in frame',
    props: 'a taping knife, a mud pan and a sanding block',
    avoid: 'no calipers, no power drills, no office stationery' },
  { match: /concrete|mason|tile|flooring|epoxy|stonemason|hardwood/i,
    scene: 'on a finished tile floor beside a spirit level and a stack of tile offcuts, grout lines and a trowel smear in frame',
    props: 'a notched trowel, tile spacers and a rubber grout float',
    avoid: 'no calipers, no laptops, no paint brushes' },
  { match: /carpent|woodwork|millwork|cabinet|furniture|custom build/i,
    scene: 'on a woodworking bench inside a workshop, oak offcuts, wood shavings and a vice in frame',
    props: 'a handsaw, a carpenter pencil and a folding ruler',
    avoid: 'no calipers, no office stationery, no laptop' },
  { match: /clean|janitorial|maid|housekeep/i,
    scene: 'in a just-cleaned bright room beside a bucket of water and folded dark microfibre cloths, spotless vinyl floor and a window with daylight in frame',
    props: 'a spray bottle, a folded dark microfibre cloth and a scrub brush',
    avoid: 'no calipers, no office stationery, no construction tools, no bright white cloths' },
  { match: /notary|loan signing|escrow|title|paralegal|legal/i,
    scene: 'on a dark wood desk with a closed manila file folder and a stack of sealed envelopes, warm office light in frame',
    props: 'an embossing seal, a stamp pad and a black pen',
    avoid: 'no calipers, no tools, no construction equipment' },
  { match: /tax|account|bookkeep|payroll|finance|financial|consult|advisor|insur|real estate|property/i,
    scene: 'on a dark mahogany desk with a closed leather portfolio, tall-window daylight in frame',
    props: 'a fountain pen, a closed dark notebook and reading glasses',
    avoid: 'no calipers, no tools, no machinery, no loose paper, no open books' },
  { match: /photo|videograph|film|cinemat|camera/i,
    scene: 'in a natural-light studio beside a camera bag, dark grey backdrop stand edge in frame',
    props: 'a camera battery, a lens cloth and a lens cap',
    avoid: 'no calipers, no office stationery, no construction tools, no tape rolls' },
  { match: /salon|barber|beauty|nail|lash|esthetic|makeup|hair/i,
    scene: 'on a clean marble styling station beside folded towels and a spray bottle, round mirror edge in frame',
    props: 'a round brush, a comb and a pair of shears',
    avoid: 'no calipers, no power tools, no laptops' },
  { match: /massage|spa|wellness|yoga|therap|acupunct|meditat/i,
    scene: 'on a calm treatment-room surface beside folded linen towels and a small ceramic dish, soft diffused light in frame',
    props: 'a folded dark towel, a smooth stone and a small bottle of oil',
    avoid: 'no calipers, no tools, no office stationery, no rolled towels' },
  { match: /dog|pet|groom|vet|animal/i,
    scene: 'on a stainless grooming table beside folded towels and a hair-covered rubber mat, tiled floor and daylight in frame',
    props: 'clippers, a slicker brush and a pair of blunt scissors',
    avoid: 'no calipers, no office stationery, no construction tools' },
  { match: /fitness|personal train|gym|crossfit|athlet/i,
    scene: 'on a rubber gym floor beside a squat rack base and a chalk-dusted platform, plate stack edge in frame',
    props: 'a kettlebell, lifting straps and a stopwatch',
    avoid: 'no calipers, no office stationery, no laptops' },
  { match: /fishing|charter|hunt|hunting|outfitt|outdoor|survival|camping/i,
    scene: 'on a boat deck at first light beside an open tackle box, rope coil and misty water in frame',
    props: 'a closed tackle box, a spool of monofilament and a landing net handle',
    avoid: 'no calipers, no office stationery, no laptops' },
  { match: /food|cater|bakery|chef|coffee|restaurant|baker|cake/i,
    scene: 'on a marble kitchen counter beside a floured butcher block and a folded linen towel, warm morning light in frame',
    props: 'a chef knife, a wooden spoon and a small bowl of coarse salt',
    avoid: 'no calipers, no construction tools, no laptops' },
  { match: /mechanic|auto|detailing|car wash|tire|bodyshop/i,
    scene: 'on a polished concrete garage floor beside a rolling tool chest and a folded shop towel, car lift base in frame',
    props: 'a socket wrench, a torque wrench and nitrile gloves',
    avoid: 'no calipers, no office stationery, no laptops' },
  { match: /recovery|sobriety|sobrie|counsel|mental health|addiction/i,
    scene: 'on a quiet table beside a folded blanket and a small potted plant, soft curtain-filtered morning light in frame',
    props: 'a closed dark journal, a steaming mug and a pen',
    avoid: 'no calipers, no tools, no alcohol, no branded packaging, no open books, no loose paper' },
  { match: /pinterest|etsy|creator|marketing|social media|content|influencer|newsletter/i,
    scene: 'on a bright light-wood desk beside a folded fabric swatch and a small potted plant, soft ring-light daylight in frame',
    props: 'a phone, a notebook and a cup of coffee',
    avoid: 'no unrelated electronics, no grid backgrounds' },
  { match: /wedding|event|planner|florist|decorat/i,
    scene: 'on a linen-covered table beside a small floral arrangement and folded ribbon, soft window light in frame',
    props: 'a pair of scissors, folded ribbon and a fabric swatch ring',
    avoid: 'no calipers, no construction tools, no laptops, no ribbon spools' }
];

/** The COVER_SCENES strings read "<subject surface>, <props>, <lighting>, <styling>".
 *  When a profession scene supplies the subject and the real tools, keeping the
 *  style entry's own subject would fight it — this returns only its trailing
 *  lighting + styling clauses so the DNA contributes the *look*, not the objects. */
function styleTextureFromScene(scene) {
  const parts = String(scene || '').split(',').map(s => s.trim()).filter(Boolean);
  return parts.length > 2 ? parts.slice(-2).join(', ') : parts.join(', ');
}

/** Pick the profession-authentic setting + props for this product. Returns null
 *  when no trade keyword matches, so the caller keeps the generic prompt. */
function professionScene(prof = {}) {
  // Match the profession identity only — product titles like "Equipment Guide"
  // would otherwise drag a guide into the fishing scene.
  const blob = `${prof.slug || ''} ${prof.name || ''}`.toLowerCase();
  for (const entry of PROFESSION_SCENES) {
    if (entry.match.test(blob)) return entry;
  }
  return null;
}

function buildArtPrompt(prof, product, profile = 'photo-cover', theme = {}) {
  if (profile !== 'photo-cover') {
    const nicheKey = designDNA.detectNicheCategory(prof);
    const niche = NICHE_SCENES[nicheKey] || NICHE_SCENES.default;
    const tokens = STYLE_PROFILES[profile] || STYLE_PROFILES['vector-asset'];
    return `${niche.props}, ${niche.mood}, ${tokens.join(', ')}`;
  }
  const resolvedTheme = (theme && theme.dna) ? theme : designDNA.resolveDesign(prof || {}, product && product.type);
  const direction = sceneFor(prof, product, resolvedTheme);
  const style = (resolvedTheme.dna && resolvedTheme.dna.style) || (resolvedTheme.brief && resolvedTheme.brief.style_lineage) || direction.name;
  const font = (theme.brief && theme.brief.fonts && theme.brief.fonts.heading) || (product.design_brief && (() => { try { return JSON.parse(product.design_brief).fonts?.heading; } catch { return null; } })());
  const accent = theme.accent || (theme.brief && theme.brief.palette && theme.brief.palette.accent) || (product.design_brief && (() => { try { return JSON.parse(product.design_brief).palette?.accent; } catch { return null; } })());
  // The style DNA above decides the look; this decides the subject. Without it a
  // trades niche gets a generic "steel tools and measuring tape" flat-lay, which
  // is how calipers ended up on a roofing cover.
  // The surface the product preview is composited onto — matched to the
  // product's real end use instead of one generic tablet on every cover:
  // printables sit on paper/clipboards, data tools on a laptop screen, social
  // packs on a phone. The white-rect detector finds whichever blank surface
  // the prompt specifies, so the adaptive composite lands on the right thing.
  const SURFACE_BY_TYPE = {
    checklist: 'blank white clipboard holding one blank sheet of paper, lying completely flat on the work surface',
    'decision-matrix': 'blank white clipboard with a blank sheet of paper, lying completely flat on the desk',
    invoice: 'neat stack of three blank white paper sheets, lying completely flat on the desk',
    journal: 'open blank white notebook with empty pages, lying completely flat on the desk',
    spreadsheet: 'open laptop with a large blank white screen, lying flat on the desk',
    booking: 'open laptop with a large blank white screen, lying flat on the desk',
    roi: 'open laptop with a large blank white screen, lying flat on the desk',
    website: 'open laptop with a large blank white screen, lying flat on the desk',
    social: 'smartphone lying flat with its blank white screen facing up',
    bundle: 'stack of document folders topped with blank white paper sheets, lying flat on the desk',
  };
  const surface = SURFACE_BY_TYPE[String(product && product.type || '').toLowerCase()]
    || 'blank white sheet of paper, lying completely flat on the desk';
  const role = professionScene(prof);
  return [
    'Top-down flat-lay photograph, 2:3 portrait canvas, native 1200x1800 pixels',
    role ? `setting and lighting: ${direction.look || styleTextureFromScene(direction.scene)}` : direction.scene,
    role ? `set ${role.scene}` : null,
    `exactly ONE ${surface}, completely blank with nothing on it`,
    'the blank surface is the single brightest object in the frame — every prop is smaller, darker and matte so nothing competes with it',
    'fixed in the right 46% of frame, vertically centered, approximately 46% of frame width and 42% of frame height, leave the left 54% visually quiet for cover copy',
    role
      ? `the only tools in frame are ${role.props}, small, dark or earth-toned, placed neatly beside the blank surface, never overlapping it or duplicating it`
      : 'two or three small contextual physical props only, dark or earth-toned, neatly spaced, no overlapping the blank surface',
    'photographed directly from above with parallel edges, soft realistic contact shadow, consistent physical light direction',
    `design DNA ${direction.name}${style ? ` / ${style}` : ''}${font ? ` / ${font} typography` : ''}${accent ? ` / restrained ${accent} accent` : ''}`,
    'photorealistic atmospheric product photography, professional product photography, subtle natural grain',
    'real photograph taken on a full-frame DSLR with a 35mm lens in natural light, authentic materials showing real wear, shallow depth of field, documentary realism, not an illustration, not a 3d render, not CGI',
    'no text, no letters, no words, no labels, no writing, no logos, no watermark, no screen content, no interface, no UI elements, no charts, no graphs, no documents, no readable text or documents, no paper with marks, nothing on the blank surface',
    'no tape rolls, no rolls of tape, no gaffer tape, no white or metallic circular objects, no second device, no extra paper beyond the specified surface, no clutter',
    role ? role.avoid : null
  ].filter(Boolean).join(', ');
}

function promptFor(prof, product, theme = {}) {
  return buildArtPrompt(prof, product, 'photo-cover', theme);
}

function workerRequestBody(prompt, seed = undefined, model = undefined) {
  return JSON.stringify({
    prompt, width: COVER_WIDTH, height: COVER_HEIGHT,
    ...(model ? { model } : {}),
    ...(Number.isInteger(seed) ? { seed } : {})
  });
}

function imageDataUri(buffer) {
  const dimensions = getImageDimensions(buffer);
  if (!dimensions) throw new Error('unsupported image format from image provider');
  return `data:${dimensions.mime};base64,${Buffer.from(buffer).toString('base64')}`;
}

function getImageDimensions(buffer) {
  const b = Buffer.from(buffer || []);
  // PNG IHDR
  if (b.length >= 24 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && b.toString('ascii', 12, 16) === 'IHDR') {
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), mime: 'image/png' };
  }
  // JPEG SOF markers (skip variable-size metadata segments safely).
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 < b.length) {
      if (b[offset] !== 0xff) { offset++; continue; }
      const marker = b[offset + 1];
      offset += 2;
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > b.length) break;
      const length = b.readUInt16BE(offset);
      if (length < 2 || offset + length > b.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (length < 7) break;
        return { height: b.readUInt16BE(offset + 3), width: b.readUInt16BE(offset + 5), mime: 'image/jpeg' };
      }
      offset += length;
    }
  }
  return null;
}

function isNativePortraitImage(buffer, opts = {}) {
  const dimensions = getImageDimensions(buffer);
  if (!dimensions) return false;
  // Providers with fixed-size free tiers (pollinations anonymous ≈ 627x940)
  // still render the correct 2:3 aspect. Callers handling background-only
  // images opt into a smaller minimum — the browser upscales behind the text
  // layers, and a slightly soft background beats a missing one.
  const minW = opts.minW || 1024;
  const minH = opts.minH || 1536;
  const ratio = dimensions.width / dimensions.height;
  return dimensions.width >= minW && dimensions.height >= minH &&
    Math.abs(ratio - COVER_WIDTH / COVER_HEIGHT) < 0.02;
}

function writeNativePortrait(outPath, buffer, opts = {}) {
  const image = Buffer.from(buffer || []);
  if (!isNativePortraitImage(image, opts)) {
    const dimensions = getImageDimensions(image);
    const actual = dimensions ? `${dimensions.width}x${dimensions.height}` : 'unknown dimensions';
    throw new Error(`image provider returned ${actual}, expected a 2:3 portrait (min ${opts.minW || 1024}x${opts.minH || 1536}); refusing to crop or cache`);
  }
  fs.writeFileSync(outPath, image);
  return outPath;
}

function cachePath(prof, product, theme = {}) {
  const prompt = promptFor(prof, product, theme);
  const h = crypto.createHash('sha1')
    .update(`${COVER_PROMPT_VERSION}|${provider()}|${prof.slug || prof.name}|${product.id || ''}|${product.type}|${prompt}`)
    .digest('hex').slice(0, 16);
  return path.join(OUT_DIR, `${prof.slug || 'cover'}-${product.type || 'art'}-${h}.img`);
}

async function viaPollinations(prompt, outPath) {
  const base = process.env.POLLINATIONS_BASE_URL || 'https://image.pollinations.ai/prompt';
  const url = `${base}/${encodeURIComponent(prompt)}?width=${COVER_WIDTH}&height=${COVER_HEIGHT}&nologo=true`;
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 120000, maxBodyLength: Infinity });
  if (!res.data || !res.data.length) throw new Error('empty image response');
  // Pollinations' anonymous tier caps resolution (~627x940) — accept the
  // smaller 2:3 render; the browser upscales it behind the text layers.
  return writeNativePortrait(outPath, Buffer.from(res.data), { minW: 600, minH: 900 });
}

// Cloudflare Workers AI text-to-image via the cover worker. The model is
// selected per cover class (see resolveCoverModel); the worker enforces the
// allowlist and native portrait dimensions server-side.
async function viaCloudflare(prompt, outPath, seed = undefined, model = undefined) {
  const url = process.env.COVER_WORKER_URL;
  if (!url) throw new Error('COVER_WORKER_URL missing');
  try {
    const res = await axios.post(url, workerRequestBody(prompt, seed, model), {
      timeout: 180000,
      headers: { 'Content-Type': 'application/json', ...(process.env.COVER_WORKER_KEY ? { 'x-ng-key': process.env.COVER_WORKER_KEY } : {}) }
    });
    return writeNativePortrait(outPath, Buffer.from(res.data.image, 'base64'));
  } catch (e) {
    // Preserve the worker's error body (it carries quota/model taxonomy that
    // axios drops when it throws on non-2xx) so failures classify honestly.
    const body = (e && e.response && e.response.data) || {};
    const status = (e && e.response && e.response.status) || '';
    const enriched = new Error(`${body.error || e.message}${status ? ' (HTTP ' + status + ')' : ''}`);
    throw enriched;
  }
}

async function viaFal(prompt, outPath, seed = undefined) {
  const key = process.env.FAL_API_KEY;
  if (!key) throw new Error('FAL_API_KEY missing');
  const model = process.env.FAL_MODEL || 'fal-ai/flux/schnell';
  const sub = await axios.post(`https://queue.fal.run/${model}`, {
    prompt, image_size: { width: COVER_WIDTH, height: COVER_HEIGHT }, num_images: 1, enable_safety_checker: true,
    ...(Number.isInteger(seed) ? { seed } : {})
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
  return writeNativePortrait(outPath, Buffer.from(bin.data));
}

// Ensure a lifestyle background exists for this product. Returns path or null.
async function ensureCoverArt(product, prof, theme = {}, opts = {}) {
  try {
    lastCoverError = null;
    const coverModel = resolveCoverModel(opts.coverClass);
    const prov = provider();
    // Fixed-size free tiers (pollinations) render smaller 2:3 portraits —
    // accept them for the background-only path so the fallback actually works.
    const dims = prov === 'pollinations' ? { minW: 600, minH: 900 } : {};
    const basePath = cachePath(prof, product, theme);
    const seed = opts.forceNew ? Math.floor(Math.random() * 2147483647) : undefined;
    const out = seed === undefined ? basePath : basePath.replace(/\.img$/, `-r${seed}.img`);
    if (!opts.fresh && fs.existsSync(basePath) && fs.statSync(basePath).size > 20000 && isNativePortraitImage(fs.readFileSync(basePath), dims)) return basePath;
    const prompt = promptFor(prof, product, theme);
    if (prov === 'cloudflare') return await viaCloudflare(prompt, out, seed, coverModel);
    if (prov === 'fal') return await viaFal(prompt, out, seed);
    return await viaPollinations(prompt, out);
  } catch (e) {
    lastCoverError = { at: new Date().toISOString(), reason: classifyCoverError(e), message: String(e.message || '').slice(0, 300) };
    console.error('[COVERART] failed:', e.message);
    return null;
  }
}

// ── WHITE-SCREEN DETECTION (adaptive template placement) ────────────────────
// The AI is asked to draw one big blank matte-white tablet screen. Image models
// only approximately honor spatial instructions, so instead of a hard-coded CSS
// slot we DETECT the largest bright, low-saturation rectangular region in the
// photo and composite the template onto it. Pure function over a grayscale
// luminance map (W*H ints 0-255) so it is hermetically testable; the caller
// builds the map from the art file in a browser canvas.
function detectWhiteRect(map, W, H, opts = {}) {
  if (!map || !W || !H || map.length !== W * H) return null;
  const minFrac = opts.minFrac || 0.06;        // min area fraction of the frame
  const maxFrac = opts.maxFrac || 0.45;        // max area fraction (avoid bright walls/whole-frame glow)
  const step = opts.step || 4;                 // sampling stride

  // Single-threshold scan (geometry unchanged): densest bright band -> longest
  // contiguous horizontal span inside that band.
  const findAt = (bright) => {
    // Exclude the outer 6% frame: window glow and studio backdrops bleed to the
    // edges and would band the scan into false tablets.
    const mx = Math.round(W * 0.06), myTop = Math.round(H * 0.06), myBot = H - Math.round(H * 0.06);
    const rows = [];
    for (let y = myTop; y < myBot; y += step) {
      let count = 0, total = 0;
      for (let x = mx; x < W - mx; x += step) { if (map[y * W + x] >= bright) count++; total++; }
      rows.push({ y, frac: count / total });
    }
    // 2) densest tight vertical band: anchor start/end on bright rows and score
    // by bright rows minus dark rows so outer non-screen rows are never included.
    let best = null;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].y <= myTop + step) continue;
      if (rows[i].frac < 0.22) continue;
      for (let j = i + 3; j < rows.length; j++) {
        if (rows[j].frac < 0.22) continue;
        const band = rows.slice(i, j + 1);
        const good = band.filter(r => r.frac >= 0.22).length;
        if (good / band.length < 0.72) continue;
        const bad = band.length - good;
        const score = good - bad * 3;
        if (!best || score > best.score) best = { i, j, score };
      }
    }
    if (!best) return null;
    // 3) within the band, find the longest contiguous horizontal bright span.
    const colGood = [];
    for (let x = mx; x < W - mx; x += step) {
      let count = 0, total = 0;
      for (let k = best.i; k <= best.j; k++) { const y = rows[k].y; if (map[y * W + x] >= bright) count++; total++; }
      colGood.push({ x, ok: (count / total) >= 0.6 });
    }
    let bestRun = null, curRun = [];
    for (const c of colGood) {
      if (c.ok) {
        curRun.push(c.x);
        if (!bestRun || curRun.length > bestRun.length) bestRun = curRun.slice();
      } else {
        curRun = [];
      }
    }
    const xs = bestRun || colGood.filter(c => c.ok).map(c => c.x);
    if (xs.length < 3) return null;
    const x0 = xs[0], x1 = xs[xs.length - 1], y0 = rows[best.i].y, y1 = rows[best.j].y;
    const rect = { x: x0, y: y0, width: x1 - x0 + step, height: y1 - y0 + step };
    const area = rect.width * rect.height;
    if (area < minFrac * W * H || area > maxFrac * W * H) return null;
    // ── TABLET SHAPE GATE ──────────────────────────────────────────────────
    // A big bright prop (a roll of tape, a paper ledger, an open journal) can
    // out-scan the real screen. The covers that composite correctly all share
    // two physical traits the props lack: STRAIGHT parallel edges (every row
    // of a rounded prop tapers toward its top/bottom) and a DARK bezel rim
    // immediately outside all four edges. Reject candidates missing either.
    const meanAt = (x, y) => map[y * W + x];
    // 1) Edge straightness: sample row runs inside the band; a rectangle keeps
    //    ~the same run length on every row, a roll/journal shrinks at the ends.
    const band = rows.slice(best.i, best.j + 1);
    const rowLens = band.map(({ y }) => {
      let a = x0, b = x1;
      while (a <= x1 && meanAt(a, y) < bright) a++;
      while (b >= x0 && meanAt(b, y) < bright) b--;
      return b >= a ? b - a : 0;
    }).filter((l) => l > 0);
    if (rowLens.length < 3) return null;
    const avgLen = rowLens.reduce((s, l) => s + l, 0) / rowLens.length;
    const straight = rowLens.filter((l) => l >= avgLen * 0.85).length / rowLens.length;
    if (straight < 0.7) return null; // rounded prop — not a tablet
    // 2) Dark bezel: the black-and-silver rim must ring the rect on all sides.
    //    Sample a 1-2px band just OUTSIDE each edge and require it to read
    //    substantially darker than the screen interior.
    const interior = (() => {
      let s = 0, n = 0;
      for (let y = y0 + 2; y < y1; y += 2) for (let x = x0 + 2; x < x1; x += 2) { s += meanAt(x, y); n++; }
      return n ? s / n : 0;
    })();
    // Sample a thin band just OUTSIDE each edge and take the WEAKEST of the
    // four. A bezeled tablet rings dark on all four sides. A prop (tape roll,
    // open journal, paper ledger) rests ON a lit surface, so at least one long
    // side has no rim — averaging the four would let that missing side hide
    // behind the darker ones, so we require EVERY edge to read dark.
    const o = Math.max(2, Math.round(step * 1.5));
    const sideMean = (samples) => {
      const vals = samples.filter(({ x, y }) => x >= 0 && x < W && y >= 0 && y < H).map(({ x, y }) => meanAt(x, y));
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };
    const hSamples = [];
    for (let x = Math.max(0, x0 - o); x < Math.min(W, x1 + o); x += 1) {
      hSamples.push({ x, y: y0 - o }, { x, y: y0 - 1 }, { x, y: y1 + 1 }, { x, y: y1 + o });
    }
    const vSamples = [];
    for (let y = Math.max(0, y0 - o); y < Math.min(H, y1 + o); y += 1) {
      vSamples.push({ x: x0 - o, y }, { x: x0 - 1, y }, { x: x1 + 1, y }, { x: x1 + o, y });
    }
    const sides = [sideMean(hSamples), sideMean(vSamples)];
    // Weakest-edge gap: interior luma minus the DARKEST-reading side band.
    // A drawn black/silver rim reads ~40-90 below a ~200 luma screen on every
    // side; a prop's un-rimmed side sits only ~10-40 below its own bright face.
    const weakest = sides.some((v) => v == null) ? 0 : interior - Math.max(...sides);
    if (weakest < 34) return null;
    return rect;
  };

  // Explicit threshold wins (tests + callers that know the photo).
  if (opts.bright != null) return findAt(opts.bright);

  // Adaptive threshold: the tablet screen is among the BRIGHTEST regions, so a
  // percentile-derived threshold stays honest on dark and high-key photos alike.
  const sample = [];
  for (let p = 0; p < map.length; p += 7) sample.push(map[p]);
  sample.sort((a, b) => a - b);
  const pct = (q) => sample[Math.min(sample.length - 1, Math.floor(q * sample.length))];
  const median = pct(0.5);
  const p97 = pct(0.97);
  // Reject uniform/flat frames that lack a high-contrast bright screen.
  if (pct(0.95) - median < 35) return null;
  const bright = Math.max(175, Math.min(p97 - 6, Math.round(p97 * 0.94)));

  // Image models vary how bright they render a matte screen (observed luma
  // ~180-215), so ONE percentile-derived threshold intermittently rejects the
  // real screen. That failure is silent: the composite falls back to the fixed
  // slot and the product page floats over the photo instead of sitting in the
  // tablet. Sweep strictly downwards and keep the largest tablet-shaped hit.
  const ladder = [bright, bright - 10, bright - 20, 170, 158, 146];
  const hits = [];
  const seen = new Set();
  for (const t of ladder) {
    if (t < 120 || seen.has(t)) continue;
    seen.add(t);
    const r = findAt(t);
    if (r) hits.push({ rect: r, bright: t });
  }
  if (!hits.length) return null;
  // Prefer portrait-shaped candidates (a tablet), largest area first.
  const shaped = hits.filter(({ rect }) => {
    const ar = rect.height / rect.width;
    return ar >= 0.8 && ar <= 2.2;
  });
  const pool = shaped.length ? shaped : hits;
  pool.sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height));
  return pool[0].rect;
}

module.exports = {
  COVER_WIDTH, COVER_HEIGHT, COVER_SCENES, sceneFor, promptFor, buildArtPrompt,
  PROFESSION_SCENES, professionScene,
  STYLE_PROFILES, BANNED_SCENE_TERMS, cachePath, ensureCoverArt, provider, OUT_DIR,
  workerRequestBody, getImageDimensions, imageDataUri, isNativePortraitImage, writeNativePortrait,
  detectWhiteRect, resolveCoverModel, classifyCoverError, coverProviderState, MODEL_ALLOWLIST
};
