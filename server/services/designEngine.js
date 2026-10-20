// ═══════════════════════════════════════════════════════════════════════════
// GENERATIVE DESIGN ENGINE — style variations, palettes, layouts per document
// ═══════════════════════════════════════════════════════════════════════════
// Generates design specs (not HTML) that the Design Agent renders.
// Supports: style families, color palettes, layout patterns, typography scales.
// ═══════════════════════════════════════════════════════════════════════════

const modelRouter = require('./modelRouter');

const DESIGN_ENGINE_VERSION = 'gde-v1';
const DESIGN_MODEL = process.env.DESIGN_MODEL || 'anthropic/claude-haiku-5.5';
const USE_NOUSS = String(process.env.VISION_PROVIDER || '').toLowerCase() === 'nous' && process.env.NOUSPORTAL_API_KEY;
const DESIGN_TARGET = USE_NOUSS ? {
  baseUrl: process.env.VISION_BASE_URL || 'https://inference-api.nousresearch.com/v1',
  headers: { Authorization: `Bearer ${process.env.NOUSPORTAL_API_KEY}`, 'Content-Type': 'application/json' }
} : undefined;

// ── STYLE FAMILIES (canonical, reusable) ────────────────────────────────────
const STYLE_FAMILIES = {
  editorial: {
    name: 'Editorial',
    description: 'Magazine-quality, high-contrast serif headlines, generous whitespace, refined',
    palette: { primary: '#0f172a', accent: '#d4a843', secondary: '#64748b', background: '#fdfbf7', surface: '#ffffff', muted: '#94a3b8' },
    fonts: { display: "'Playfair Display','Iowan Old Style',Georgia,serif", body: "'Inter','Space Grotesk',system-ui,sans-serif", mono: "'JetBrains Mono',monospace" },
    layout: 'asymmetric-grid',
    radius: 'soft',
    shadow: 'elevated'
  },
  technical: {
    name: 'Technical',
    description: 'Clean, monospace-heavy, data-dense, high information hierarchy',
    palette: { primary: '#050505', accent: '#22d3ee', secondary: '#3f3f46', background: '#fafafa', surface: '#ffffff', muted: '#71717a' },
    fonts: { display: "'Space Grotesk','Inter',system-ui,sans-serif", body: "'JetBrains Mono','Fira Code',monospace", mono: "'JetBrains Mono',monospace" },
    layout: 'modular-grid',
    radius: 'sharp',
    shadow: 'subtle'
  },
  warm: {
    name: 'Warm Trade',
    description: 'Approachable, earth tones, handcrafted feel, trust-building',
    palette: { primary: '#1c1917', accent: '#f97316', secondary: '#78716c', background: '#fefaf5', surface: '#fdf8f3', muted: '#a8a29e' },
    fonts: { display: "'Fraunces','Georgia',serif", body: "'DM Sans','Inter',system-ui,sans-serif", mono: "'JetBrains Mono',monospace" },
    layout: 'card-stack',
    radius: 'rounded',
    shadow: 'soft'
  },
  modern: {
    name: 'Modern Pro',
    description: 'Bold, high-contrast, geometric, digital-native',
    palette: { primary: '#0a0a0a', accent: '#eab308', secondary: '#52525b', background: '#ffffff', surface: '#fafafa', muted: '#a1a1aa' },
    fonts: { display: "'Syne','Space Grotesk',system-ui,sans-serif", body: "'Inter','system-ui',sans-serif", mono: "'JetBrains Mono',monospace" },
    layout: 'hero-split',
    radius: 'pill',
    shadow: 'hard'
  },
  minimal: {
    name: 'Minimal',
    description: 'Maximum content, minimum chrome, typography-led',
    palette: { primary: '#171717', accent: '#000000', secondary: '#737373', background: '#ffffff', surface: '#ffffff', muted: '#a3a3a3' },
    fonts: { display: "'Helvetica Neue','Inter',system-ui,sans-serif", body: "'Inter','system-ui',sans-serif", mono: "'JetBrains Mono',monospace" },
    layout: 'single-column',
    radius: 'none',
    shadow: 'none'
  },
  vibrant: {
    name: 'Vibrant',
    description: 'Energetic, saturated accents, creative trades, social-forward',
    palette: { primary: '#0c0a09', accent: '#f43f5e', secondary: '#e879f9', background: '#fafafa', surface: '#ffffff', muted: '#9f9f9f' },
    fonts: { display: "'Plus Jakarta Sans','Inter',system-ui,sans-serif", body: "'Inter','system-ui',sans-serif", mono: "'JetBrains Mono',monospace" },
    layout: 'magazine',
    radius: 'full',
    shadow: 'colorful'
  }
};

// Build editorial palette from any primary color — derives gold/sage/cream
// Always returns the canonical editorial color roles regardless of input primary
function buildEditorialPalette(primary) {
  const p = primary || '#0f172a';
  const gold = '#d4a843';
  const sage = '#8fb8b0';
  const cream = '#fdfbf7';
  const slate = '#334155';
  const ink = '#1e293b';
  const muted = '#94a3b8';
  const secondary = '#64748b';
  return { primary: p, accent: gold, secondary, background: cream, surface: '#ffffff', muted, sage, slate, ink };
}

// ── LAYOUT PATTERNS (per document type) ─────────────────────────────────────
const LAYOUT_PATTERNS = {
  checklist: ['card-stack', 'two-column', 'accordion', 'timeline'],
  invoice: ['table-classic', 'table-modern', 'split-panel', 'card-ledger'],
  workbook: ['section-tabs', 'progressive', 'side-nav', 'card-grid'],
  spreadsheet: ['tab-sheets', 'dashboard', 'wizard', 'kanban'],
  social: ['calendar-grid', 'feed-preview', 'story-board', 'carousel'],
  bundle: ['toolkit-grid', 'stacked', 'tabs', 'accordion'],
  booking: ['wizard', 'calendar-view', 'kanban', 'list'],
  website: ['single-page', 'multi-page', 'landing-funnel', 'portfolio'],
  'wall-art': ['gallery-grid', 'masonry', 'series', 'featured'],
  tool: ['calculator', 'wizard', 'dashboard', 'comparison'],
  planner: ['daily', 'weekly', 'monthly', 'quarterly', 'habit-tracker'],
  'recovery-journal': ['daily-pages', 'phase-gates', 'reflection', 'metrics'],
  'recovery-nutrition': ['weekly-plan', 'shopping-list', 'meal-cards', 'macro-tracker'],
  'meeting-flashcards': ['deck', 'categorized', 'scenario', 'quick-ref'],
  'affirmation-labels': ['sheet-grid', 'roll', 'card-set', 'sticker-pack'],
  brand: ['guideline', 'showcase', 'spec-sheet', 'asset-library']
};

// ── DESIGN SPEC GENERATION ──────────────────────────────────────────────────
const DESIGN_SYSTEM_PROMPT = `You are a senior brand designer creating DESIGN SPECIFICATIONS (not HTML) for NicheGate trade documents.

INPUT: { profession, type, styleFamily, layoutPattern, brandColors, contentSummary }
OUTPUT: Complete design spec JSON that a renderer (Design Agent) will turn into HTML/CSS.

════════════════════════════════════════════════════════════════════════════
SPEC SCHEMA (return exactly this structure)
════════════════════════════════════════════════════════════════════════════
{
  "meta": { "version": "gde-v1", "type": "checklist", "styleFamily": "editorial", "layoutPattern": "card-stack" },
  "palette": {
    "primary": "#0f172a", "accent": "#d4a843", "secondary": "#64748b",
    "background": "#fdfbf7", "surface": "#ffffff", "muted": "#94a3b8",
    "success": "#22c55e", "warning": "#f59e0b", "error": "#ef4444"
  },
  "fonts": {
    "display": {"family": "'Playfair Display',Georgia,serif", "weights": [600,700,800,900]},
    "body": {"family": "'Inter','Space Grotesk',system-ui,sans-serif", "weights": [400,500,600,700]},
    "mono": {"family": "'JetBrains Mono',monospace", "weights": [400,500,600]}
  },
  "spacing": { "base": 8, "scale": [0,4,8,12,16,24,32,48,64] },
  "radius": { "none": 0, "sm": 4, "md": 8, "lg": 12, "xl": 16, "full": 9999 },
  "shadows": {
    "none": "none", "subtle": "0 1px 2px rgba(0,0,0,0.05)",
    "soft": "0 4px 12px rgba(0,0,0,0.08)", "card": "0 10px 24px rgba(0,0,0,0.1)",
    "elevated": "0 20px 40px rgba(0,0,0,0.12)", "colorful": "0 10px 30px rgba(244,62,94,0.3)"
  },
  "layout": {
    "pattern": "card-stack",
    "page": { "size": "A4", "margin": 12, "frame": { "border": "2px solid var(--accent)", "corners": true } },
    "hero": { "height": 300, "scrim": "linear-gradient(90deg, rgba(15,23,42,0.9) 0%, rgba(15,23,42,0.1) 70%, transparent 100%)" },
    "grid": { "columns": 12, "gap": 24 },
    "components": {
      "card": { "bg": "var(--surface)", "border": "1px solid rgba(15,23,42,0.08)", "radius": "var(--r-lg)", "shadow": "var(--shadow-card)" },
      "chip": { "bg": "linear-gradient(135deg, var(--accent), var(--secondary))", "color": "var(--primary)", "radius": "var(--r-full)" },
      "badge": { "bg": "var(--primary)", "color": "#fff", "radius": "var(--r-md)" },
      "rule": { "width": 60, "height": 3, "color": "var(--accent)", "radius": "var(--r-full)" }
    }
  },
  "components": {
    "hero": { "enabled": true, "height": 300, "content": ["brand-chip", "edition", "title", "tagline", "rule"] },
    "howto": { "enabled": true, "steps": 4, "style": "numbered-grid" },
    "services": { "layout": "card-stack", "alternateBg": true, "iconSet": "line-art", "priceChip": true },
    "footer": { "pageNum": true, "watermark": { "text": "CHECKLIST", "opacity": 0.025, "rotation": -12, "font": "display" } }
  },
  "assets": {
    "hero": { "required": true, "prompt": "..." },
    "icons": { "set": "line-art", "count": 6, "style": "stroke-2" },
    "mockups": { "required": false, "types": ["tablet", "notebook", "clipboard"] }
  }
}

════════════════════════════════════════════════════════════════════════════
RULES
════════════════════════════════════════════════════════════════════════════
1. Derive palette from brandColors + styleFamily. Never use bright cyan/teal unless in vibrant family.
2. Gold/amber accents for editorial/warm. Cyan/blue for technical/modern. Orange for warm. Red/pink for vibrant.
3. Layout pattern MUST be from LAYOUT_PATTERNS[type].
4. Components enabled based on document type (checklist=howto+services, invoice=table+totals, etc).
5. Hero always enabled if hero image available.
6. Watermark text = type.toUpperCase().
7. All colors as CSS custom properties (--primary, --accent, etc).
8. Fonts must use Google Fonts available families.`
;

// ── USER PROMPT BUILDER ─────────────────────────────────────────────────────
function buildDesignPrompt({ prof, type, styleFamily, layoutPattern, brandColors, contentSummary, heroAvailable }) {
  const family = STYLE_FAMILIES[styleFamily] || STYLE_FAMILIES.editorial;
  const patterns = LAYOUT_PATTERNS[type] || LAYOUT_PATTERNS.checklist;

  return `PROFESSION: ${prof.name}
TYPE: ${type.toUpperCase()}
STYLE FAMILY: ${family.name} (${family.description})
LAYOUT PATTERN: ${layoutPattern} (must be one of: ${patterns.join(', ')})
BRAND COLORS: ${JSON.stringify(brandColors)}
HERO IMAGE: ${heroAvailable ? 'AVAILABLE — design hero section' : 'NONE — use masthead'}
CONTENT SUMMARY: ${contentSummary}

Generate the complete DESIGN SPEC JSON now.`;
}

async function callDesignModel(systemPrompt, userPrompt) {
  const res = await modelRouter.callModel({
    target: DESIGN_TARGET,
    model: DESIGN_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.4,
    maxTokens: 8000,
    timeoutMs: 90000,
    action: 'design_spec'
  });
  if (!res) throw new Error('Design model returned null');
  return res;
}

function parseDesignJson(text) {
  const cleaned = String(text).replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{'), end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('No JSON object found');
  return JSON.parse(cleaned.slice(start, end + 1));
}

// ── MAIN ENTRY ──────────────────────────────────────────────────────────────
async function generateDesignSpec({ prof, type, brandColors, contentSummary, heroAvailable, preferences = {} }) {
  // Select style family (can be overridden by preferences)
  const styleFamily = preferences.styleFamily || selectStyleFamily(type, brandColors);
  const layoutPattern = preferences.layoutPattern || selectLayoutPattern(type);

  // Build editorial palette from theme primary — derives gold/sage from primary
  // This overrides whatever accent the DB has with proper editorial colors
  const primary = brandColors?.primary || '#0f172a';
  const editorialPalette = buildEditorialPalette(primary);
  const enrichedBrandColors = { ...brandColors, ...editorialPalette, primary }; // primary stays as navy

  const userPrompt = buildDesignPrompt({
    prof, type, styleFamily, layoutPattern, brandColors: enrichedBrandColors, contentSummary, heroAvailable
  });

  let attempts = 0;
  const maxAttempts = 2;

  while (attempts < maxAttempts) {
    attempts++;
    try {
      const raw = await callDesignModel(DESIGN_SYSTEM_PROMPT, userPrompt);
      const spec = parseDesignJson(raw);
      // Validate required fields
      if (!spec.palette || !spec.fonts || !spec.layout) throw new Error('Incomplete spec');
      return { spec, styleFamily, layoutPattern, attempts, validation: 'passed' };
    } catch (e) {
      if (attempts >= maxAttempts) throw e;
      userPrompt += `\n\nERROR (attempt ${attempts}): ${e.message}. Return valid JSON only.`;
    }
  }
  throw new Error(`Design spec generation failed after ${maxAttempts} attempts`);
}

function selectStyleFamily(type, brandColors) {
  // Heuristic: map trade category to style family
  const warmTrades = ['massage-therapy', 'wellness', 'recovery', 'nutrition', 'therapy'];
  const technicalTrades = ['inspection', 'engineering', 'surveying', 'drone', 'pyro'];
  const creativeTrades = ['design', 'art', 'photography', 'creative', 'brand'];
  const modernTrades = ['tech', 'software', 'digital', 'saas', 'app'];

  const slug = (brandColors?.slug || '').toLowerCase();
  if (warmTrades.some(t => slug.includes(t))) return 'warm';
  if (technicalTrades.some(t => slug.includes(t))) return 'technical';
  if (creativeTrades.some(t => slug.includes(t))) return 'vibrant';
  if (modernTrades.some(t => slug.includes(t))) return 'modern';
  // Default to editorial for professional services
  return 'editorial';
}

function selectLayoutPattern(type) {
  const patterns = LAYOUT_PATTERNS[type] || LAYOUT_PATTERNS.checklist;
  return patterns[0]; // Default to first pattern
}

// ── FALLBACK SPEC (deterministic from theme) ────────────────────────────────
function fallbackSpec({ prof, type, theme }) {
  const family = STYLE_FAMILIES.editorial;
  const p = theme.primary || '#0f172a';
  const a = theme.accent || '#d4a843';
  return {
    meta: { version: DESIGN_ENGINE_VERSION, type, styleFamily: 'editorial', layoutPattern: LAYOUT_PATTERNS[type]?.[0] || 'card-stack' },
    palette: { primary: p, accent: a, secondary: theme.secondary || '#64748b', background: '#fdfbf7', surface: '#ffffff', muted: '#94a3b8' },
    fonts: { display: { family: "'Playfair Display',Georgia,serif" }, body: { family: "'Inter',system-ui,sans-serif" }, mono: { family: "'JetBrains Mono',monospace" } },
    spacing: { base: 8, scale: [0,4,8,12,16,24,32,48] },
    radius: { none: 0, sm: 4, md: 8, lg: 12, xl: 16, full: 9999 },
    shadows: { none: 'none', subtle: '0 1px 2px rgba(0,0,0,0.05)', soft: '0 4px 12px rgba(0,0,0,0.08)', card: '0 10px 24px rgba(0,0,0,0.1)', elevated: '0 20px 40px rgba(0,0,0,0.12)' },
    layout: { pattern: LAYOUT_PATTERNS[type]?.[0] || 'card-stack', page: { size: 'A4', margin: 12, frame: { border: '2px solid var(--accent)', corners: true } }, hero: { height: 300 }, grid: { columns: 12, gap: 24 } },
    components: { hero: { enabled: true }, howto: { enabled: type === 'checklist' }, services: { layout: 'card-stack' }, footer: { pageNum: true, watermark: { text: type.toUpperCase(), opacity: 0.025 } } },
    assets: { hero: { required: true }, icons: { set: 'line-art' } }
  };
}

async function generateDesignSpecWithFallback(params) {
  try {
    return await generateDesignSpec(params);
  } catch (e) {
    console.error('[DESIGN ENGINE] Failed, using fallback:', e.message);
    return { spec: fallbackSpec(params), attempts: 0, validation: 'fallback', error: e.message };
  }
}

module.exports = {
  DESIGN_ENGINE_VERSION,
  STYLE_FAMILIES,
  LAYOUT_PATTERNS,
  generateDesignSpec,
  generateDesignSpecWithFallback,
  fallbackSpec
};