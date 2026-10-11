// ═══════════════════════════════════════════════════════════════════════════
// DESIGN STYLES ENGINE — replaces flat color-swap themes with distinct
// visual DNA per niche. Each style defines: layout principles, typography,
// decorative elements, color logic, and background treatments.
//
// Every product gets THREE layers:
//   1. Design Style  (editorial / brutalist / organic / technical / luxe / playful / minimal / heritage)
//   2. Niche Language (unique visual elements per profession category)
//   3. Typography     (matched fonts from the Google Fonts library)
// ═══════════════════════════════════════════════════════════════════════════

// ── GOOGLE FONTS LIBRARY (42 families) ──
// Curated across serif/editorial, sans, display, script and mono. The 8
// deterministic styles use the original subset; art-director briefs may
// propose ANY family here (or one outside the table — its name passes the
// artDirector safety lint and rides googleFontsUrl()).
const FONTS = {
  // Serif / Editorial
  playfair:    "'Playfair Display', 'Georgia', serif",
  dmSerif:     "'DM Serif Display', 'Georgia', serif",
  cormorant:   "'Cormorant Garamond', 'Georgia', serif",
  crimson:     "'Crimson Pro', 'Georgia', serif",
  lora:        "'Lora', 'Georgia', serif",
  merriweather: "'Merriweather', 'Georgia', serif",
  libreBaskerville: "'Libre Baskerville', 'Georgia', serif",
  spectral:    "'Spectral', 'Georgia', serif",
  sourceSerif: "'Source Serif 4', 'Georgia', serif",
  ebGaramond:  "'EB Garamond', 'Georgia', serif",
  fraunces:    "'Fraunces', 'Georgia', serif",
  newsreader:  "'Newsreader', 'Georgia', serif",
  cardo:       "'Cardo', 'Georgia', serif",
  bitter:      "'Bitter', 'Georgia', serif",
  // Sans / Modern
  outfit:      "'Outfit', 'Inter', system-ui, sans-serif",
  jakarta:     "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif",
  inter:       "'Inter', system-ui, sans-serif",
  workSans:    "'Work Sans', 'Inter', system-ui, sans-serif",
  dmSans:      "'DM Sans', 'Inter', system-ui, sans-serif",
  manrope:     "'Manrope', 'Inter', system-ui, sans-serif",
  publicSans:  "'Public Sans', 'Inter', system-ui, sans-serif",
  figtree:     "'Figtree', 'Inter', system-ui, sans-serif",
  sora:        "'Sora', 'Inter', system-ui, sans-serif",
  urbanist:    "'Urbanist', 'Inter', system-ui, sans-serif",
 archivo:     "'Archivo', 'Inter', system-ui, sans-serif",
  barlow:      "'Barlow', 'Inter', system-ui, sans-serif",
  ibmPlexSans: "'IBM Plex Sans', 'Inter', system-ui, sans-serif",
  spaceGrotesk: "'Space Grotesk', 'Inter', system-ui, sans-serif",
  // Display / Impact
  bebas:       "'Bebas Neue', 'Impact', sans-serif",
  anton:       "'Anton', 'Impact', sans-serif",
  oswald:      "'Oswald', 'Impact', sans-serif",
  syne:        "'Syne', 'Impact', sans-serif",
  unbounded:   "'Unbounded', 'Impact', sans-serif",
  italiana:    "'Italiana', 'Georgia', serif",
  // Script / Handwritten
  caveat:      "'Caveat', cursive",
  fredoka:     "'Fredoka', 'Comic Sans MS', cursive",
  satisfy:     "'Satisfy', cursive",
  dancingScript: "'Dancing Script', cursive",
  // Mono / Technical
  jetbrains:   "'JetBrains Mono', 'Consolas', monospace",
  ibmPlexMono: "'IBM Plex Mono', 'Consolas', monospace",
  spaceMono:   "'Space Mono', 'Consolas', monospace"
};

// Curated heading×body pairings for art-director briefs. Briefs may propose
// pairings outside this table (validated by the safety lint).
const FONT_PAIRINGS = [
  { heading: 'Fraunces', body: 'Public Sans', mono: 'Space Mono', mood: 'warm editorial' },
  { heading: 'Playfair Display', body: 'Work Sans', mono: 'IBM Plex Mono', mood: 'classic magazine' },
  { heading: 'Syne', body: 'Manrope', mono: 'Space Mono', mood: 'modern art-catalog' },
  { heading: 'DM Serif Display', body: 'DM Sans', mono: 'JetBrains Mono', mood: 'friendly premium' },
  { heading: 'Anton', body: 'Figtree', mono: 'Space Mono', mood: 'bold poster' },
  { heading: 'Cormorant Garamond', body: 'Inter', mono: 'IBM Plex Mono', mood: 'refined luxury' },
  { heading: 'Archivo', body: 'IBM Plex Sans', mono: 'IBM Plex Mono', mood: 'industrial manual' },
  { heading: 'Newsreader', body: 'Source Serif 4', mono: 'Space Mono', mood: 'broadsheet' },
  { heading: 'Unbounded', body: 'Sora', mono: 'JetBrains Mono', mood: 'tech-forward' },
  { heading: 'Oswald', body: 'Barlow', mono: 'IBM Plex Mono', mood: 'field guide' },
  { heading: 'Bebas Neue', body: 'Urbanist', mono: 'Space Mono', mood: 'creator bold' },
  { heading: 'Libre Baskerville', body: 'Lora', mono: 'IBM Plex Mono', mood: 'bookish' }
];

// Base URL with every deterministic style's fonts (original string kept).
const GOOGLE_FONTS_URL = 'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Caveat:wght@400;600;700&family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=Crimson+Pro:ital,wght@0,400;0,600;0,700;1,400&family=DM+Serif+Display&family=Fredoka:wght@400;500;600;700&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&family=Outfit:wght@400;500;600;700;800&family=Playfair+Display:ital,wght@0,400;0,600;0,700;0,800;1,400&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Space+Grotesk:wght@400;500;600;700&display=swap';

// Dynamic font URL: base library + any brief-proposed families. Family names
// are sanitized (letters/digits/space/hyphen only) before they enter the URL,
// so this can never inject query syntax.
function googleFontsUrl(extraFamilies = []) {
  const extras = (Array.isArray(extraFamilies) ? extraFamilies : [extraFamilies])
    .map(f => String(f || '').trim().replace(/^['"]+|['"]+$/g, ''))
    .filter(f => /^[A-Za-z0-9][A-Za-z0-9 \-]{1,39}$/.test(f))
    .map(f => 'family=' + f.replace(/ /g, '+') + ':wght@400;600;800');
  if (!extras.length) return GOOGLE_FONTS_URL;
  return GOOGLE_FONTS_URL.replace('&display=swap', '') + '&' + extras.join('&') + '&display=swap';
}

// ── DESIGN STYLES ──
// Each style is a complete design language: fonts, colors, layout rules,
// decorative elements, and CSS patterns that make every product unique.
const STYLES = {

  editorial: {
    name: 'Editorial',
    description: 'Large serif headlines, ruled lines, generous whitespace, ink-on-paper feel',
    fonts: { heading: FONTS.playfair, body: FONTS.inter, mono: FONTS.crimson },
    headingWeight: '700',
    headingTransform: 'none',
    headingLetterSpacing: '-0.02em',
    bodyLineHeight: '1.7',
    borderRadius: '2px',
    decorRules: {
      headerBar: false,
      ruledLines: true,
      dropCap: true,
      pullQuotes: true,
      ornamentalDivider: '§',
      cornerDecoration: 'none',
    },
    colorLogic: (palette) => ({
      primary: palette.primary || '#1a1a1a',
      secondary: palette.secondary || '#6b4c3b',
      accent: palette.accent || '#c4956a',
      bg: palette.bg || '#faf8f5',
      surface: '#ffffff',
      border: '#e8e0d8',
      text: '#2c2420',
      textMuted: '#8a7e74',
    }),
    cssPatterns: `
      h1,h2,h3{font-family:PLAYFONT;letter-spacing:-0.02em}
      h1{font-size:2.4rem;line-height:1.15;border-bottom:2px solid BORDER;color:PRIMARY;padding-bottom:12px;margin-bottom:20px}
      h2{font-size:1.4rem;margin-bottom:12px;color:PRIMARY}
      .section{border-left:3px solid ACCENT;padding-left:20px;margin:24px 0}
      .ruled{border-bottom:1px solid BORDER;padding-bottom:8px;margin-bottom:8px}
      .drop-cap::first-letter{font-size:3.2em;float:left;line-height:0.8;margin:4px 10px 0 0;color:ACCENT;font-family:PLAYFONT;font-weight:700}
      .pull-quote{font-family:PLAYFONT;font-style:italic;font-size:1.3rem;color:SECONDARY;border-left:4px solid ACCENT;padding:16px 24px;margin:20px 0;background:transparent}
      table thead th{text-transform:uppercase;letter-spacing:2px;font-size:0.65rem;border-bottom:2px solid PRIMARY}
    `,
  },

  brutalist: {
    name: 'Brutalist',
    description: 'Raw grids, monospace type, exposed structure, high contrast',
    fonts: { heading: FONTS.outfit, body: FONTS.inter, mono: FONTS.jetbrains },
    headingWeight: '800',
    headingTransform: 'uppercase',
    headingLetterSpacing: '0.08em',
    bodyLineHeight: '1.5',
    borderRadius: '0px',
    decorRules: {
      headerBar: true,
      ruledLines: false,
      dropCap: false,
      pullQuotes: false,
      ornamentalDivider: '—',
      cornerDecoration: 'grid',
    },
    colorLogic: (palette) => ({
      primary: palette.primary || '#0a0a0a',
      secondary: palette.secondary || '#ff3333',
      accent: palette.accent || '#00ff88',
      bg: palette.bg || '#ffffff',
      surface: '#f5f5f5',
      border: '#1a1a1a',
      text: '#0a0a0a',
      textMuted: '#666666',
    }),
    cssPatterns: `
      h1,h2,h3{font-family:PLAYFONT;text-transform:uppercase;letter-spacing:0.08em;font-weight:800}
      h1{font-size:2rem;background:PRIMARY;color:#fff;padding:20px 24px;margin:-44px -46px 24px calc(-46px + 44px);clip-path:polygon(0 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%)}
      h2{font-size:1rem;border-bottom:3px solid SECONDARY;padding-bottom:8px;margin-bottom:16px}
      .tag{display:inline-block;background:SECONDARY;color:#fff;font-size:0.65rem;font-weight:800;padding:4px 10px;text-transform:uppercase;letter-spacing:1px}
      table thead th{background:PRIMARY;color:#fff;text-transform:uppercase;letter-spacing:2px;font-size:0.65rem;font-weight:800}
      table{border:2px solid PRIMARY}
      table td{border-bottom:1px solid #ddd}
    `,
  },

  organic: {
    name: 'Organic',
    description: 'Soft rounded shapes, flowing curves, warm gradients, nature-inspired',
    fonts: { heading: FONTS.jakarta, body: FONTS.inter, mono: FONTS.inter },
    headingWeight: '700',
    headingTransform: 'none',
    headingLetterSpacing: '-0.01em',
    bodyLineHeight: '1.65',
    borderRadius: '16px',
    decorRules: {
      headerBar: false,
      ruledLines: false,
      dropCap: false,
      pullQuotes: true,
      ornamentalDivider: '✦',
      cornerDecoration: 'blob',
    },
    colorLogic: (palette) => ({
      primary: palette.primary || '#2d4a3e',
      secondary: palette.secondary || '#7cb69d',
      accent: palette.accent || '#f0c987',
      bg: palette.bg || '#f8f6f0',
      surface: '#ffffff',
      border: '#e2ddd5',
      text: '#2c2c2c',
      textMuted: '#7a7570',
    }),
    cssPatterns: `
      h1,h2,h3{font-family:PLAYFONT;letter-spacing:-0.01em}
      h1{font-size:2rem;color:PRIMARY;margin-bottom:16px}
      h2{font-size:1.25rem;color:SECONDARY;margin-bottom:10px}
      .page{background:linear-gradient(135deg,BG 0%,color-mix(in srgb,BG 90%,ACCENT 10%) 100%)}
      .card{border-radius:16px;border:1px solid BORDER;box-shadow:0 8px 32px -12px rgba(0,0,0,0.12)}
      .pill{border-radius:999px;background:linear-gradient(135deg,SECONDARY,ACCENT);color:#fff;font-weight:600}
      .blob{position:absolute;width:200px;height:200px;border-radius:50%;background:radial-gradient(circle,ACCENT 0%,transparent 70%);opacity:0.15;filter:blur(40px)}
      table thead th{background:linear-gradient(135deg,PRIMARY,SECONDARY);color:#fff;border-radius:12px 12px 0 0}
    `,
  },

  technical: {
    name: 'Technical',
    description: 'Blueprint grid, precise measurements, engineering-line aesthetic',
    fonts: { heading: FONTS.outfit, body: FONTS.inter, mono: FONTS.jetbrains },
    headingWeight: '700',
    headingTransform: 'uppercase',
    headingLetterSpacing: '0.06em',
    bodyLineHeight: '1.5',
    borderRadius: '4px',
    decorRules: {
      headerBar: true,
      ruledLines: false,
      dropCap: false,
      pullQuotes: false,
      ornamentalDivider: '▸',
      cornerDecoration: 'crosshair',
    },
    colorLogic: (palette) => ({
      primary: palette.primary || '#0c2340',
      secondary: palette.secondary || '#00a3e0',
      accent: palette.accent || '#ff6b35',
      bg: palette.bg || '#f0f4f8',
      surface: '#ffffff',
      border: '#c8d6e5',
      text: '#1a2332',
      textMuted: '#6b7c93',
    }),
    cssPatterns: `
      .page{background-image:linear-gradient(rgba(0,163,224,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(0,163,224,0.04) 1px,transparent 1px);background-size:20px 20px}
      h1,h2,h3{font-family:PLAYFONT;text-transform:uppercase;letter-spacing:0.06em;color:PRIMARY}
      h1{font-size:1.6rem;border-bottom:3px solid SECONDARY;padding-bottom:10px;margin-bottom:20px}
      h2{font-size:0.95rem;border-left:4px solid ACCENT;padding-left:14px;margin-bottom:12px}
      .spec{font-family:FONTS.mono;font-size:0.75rem;background:PRIMARY;color:SECONDARY;padding:2px 8px;border-radius:3px;display:inline-block}
      .grid-ref{font-family:FONTS.mono;font-size:0.6rem;color:SECONDARY;opacity:0.5;position:absolute}
      table{border-collapse:collapse;border:2px solid SECONDARY}
      table thead th{background:PRIMARY;color:SECONDARY;text-transform:uppercase;letter-spacing:2px;font-size:0.6rem;font-family:FONTS.mono}
      table td{border-bottom:1px solid #e0e8f0;font-family:FONTS.mono;font-size:0.8rem}
    `,
  },

  luxe: {
    name: 'Luxe',
    description: 'Thin gold lines, subtle gradients, serif+sans pairing, emboss shadows',
    fonts: { heading: FONTS.cormorant, body: FONTS.jakarta, mono: FONTS.inter },
    headingWeight: '600',
    headingTransform: 'none',
    headingLetterSpacing: '0.04em',
    bodyLineHeight: '1.65',
    borderRadius: '8px',
    decorRules: {
      headerBar: false,
      ruledLines: false,
      dropCap: true,
      pullQuotes: true,
      ornamentalDivider: '◆',
      cornerDecoration: 'diamond',
    },
    colorLogic: (palette) => ({
      primary: palette.primary || '#1a1520',
      secondary: palette.secondary || '#b8956a',
      accent: palette.accent || '#d4af37',
      bg: palette.bg || '#faf8f6',
      surface: '#ffffff',
      border: '#e8e0d4',
      text: '#1a1520',
      textMuted: '#8a8078',
    }),
    cssPatterns: `
      h1,h2,h3{font-family:PLAYFONT;letter-spacing:0.04em;color:PRIMARY}
      h1{font-size:2.2rem;text-align:center;margin-bottom:8px}
      .subtitle{text-align:center;font-family:FONTS.jakarta;font-size:0.8rem;letter-spacing:3px;text-transform:uppercase;color:SECONDARY;margin-bottom:30px}
      .divider{text-align:center;margin:24px 0;color:ACCENT;font-size:1.2rem;letter-spacing:12px}
      .divider::before,.divider::after{content:'';display:inline-block;width:60px;height:1px;background:linear-gradient(90deg,transparent,SECONDARY);vertical-align:middle}
      .divider::after{background:linear-gradient(90deg,SECONDARY,transparent)}
      .card{border:1px solid;border-image:linear-gradient(135deg,SECONDARY,ACCENT) 1;box-shadow:0 4px 20px rgba(0,0,0,0.06)}
      table thead th{background:linear-gradient(135deg,PRIMARY,color-mix(in srgb,PRIMARY 80%,SECONDARY 20%));color:ACCENT;letter-spacing:3px;text-transform:uppercase;font-size:0.6rem;font-family:FONTS.jakarta}
      .drop-cap::first-letter{font-size:3.5em;float:left;line-height:0.75;margin:6px 12px 0 0;color:ACCENT;font-family:PLAYFONT;font-weight:600}
    `,
  },

  playful: {
    name: 'Playful',
    description: 'Bold rounded type, confetti patterns, bright overlapping shapes',
    fonts: { heading: FONTS.fredoka, body: FONTS.outfit, mono: FONTS.inter },
    headingWeight: '600',
    headingTransform: 'none',
    headingLetterSpacing: '0',
    bodyLineHeight: '1.6',
    borderRadius: '20px',
    decorRules: {
      headerBar: false,
      ruledLines: false,
      dropCap: false,
      pullQuotes: false,
      ornamentalDivider: '★',
      cornerDecoration: 'confetti',
    },
    colorLogic: (palette) => ({
      primary: palette.primary || '#2d1b69',
      secondary: palette.secondary || '#ff6b6b',
      accent: palette.accent || '#ffd93d',
      bg: palette.bg || '#fff5f5',
      surface: '#ffffff',
      border: '#f0e0e0',
      text: '#2d1b69',
      textMuted: '#8a7ba0',
    }),
    cssPatterns: `
      h1,h2,h3{font-family:PLAYFONT;font-weight:600;color:PRIMARY}
      h1{font-size:2.2rem;color:SECONDARY;margin-bottom:12px}
      h2{font-size:1.3rem;color:PRIMARY}
      .page{background:linear-gradient(160deg,BG 0%,color-mix(in srgb,BG 85%,SECONDARY 15%) 100%)}
      .card{border-radius:20px;border:3px solid ACCENT;box-shadow:8px 8px 0 SECONDARY}
      .pill{border-radius:999px;background:SECONDARY;color:#fff;font-weight:600;box-shadow:3px 3px 0 PRIMARY}
      .emoji-big{font-size:3rem;text-align:center;margin-bottom:12px}
      table thead th{background:SECONDARY;color:#fff;border-radius:14px 14px 0 0;font-family:PLAYFONT;font-weight:600}
      table{border:2px solid ACCENT;border-radius:16px;overflow:hidden}
      .fun-note{background:ACCENT;color:PRIMARY;padding:12px 16px;border-radius:16px;font-weight:600;text-align:center;margin:16px 0}
    `,
  },

  minimal: {
    name: 'Minimal',
    description: 'Extreme whitespace, single accent, hairline rules, almost nothing',
    fonts: { heading: FONTS.jakarta, body: FONTS.inter, mono: FONTS.inter },
    headingWeight: '600',
    headingTransform: 'none',
    headingLetterSpacing: '-0.01em',
    bodyLineHeight: '1.7',
    borderRadius: '0px',
    decorRules: {
      headerBar: false,
      ruledLines: true,
      dropCap: false,
      pullQuotes: false,
      ornamentalDivider: '|',
      cornerDecoration: 'none',
    },
    colorLogic: (palette) => ({
      primary: palette.primary || '#111111',
      secondary: palette.secondary || '#555555',
      accent: palette.accent || '#0066ff',
      bg: palette.bg || '#ffffff',
      surface: '#ffffff',
      border: '#eeeeee',
      text: '#111111',
      textMuted: '#999999',
    }),
    cssPatterns: `
      h1,h2,h3{font-family:PLAYFONT;letter-spacing:-0.01em;color:PRIMARY;font-weight:600}
      h1{font-size:1.8rem;margin-bottom:24px;padding-bottom:12px;border-bottom:1px solid BORDER}
      h2{font-size:1rem;color:SECONDARY;margin-bottom:8px;text-transform:uppercase;letter-spacing:2px;font-weight:600;font-size:0.7rem}
      .page{padding:60px 60px}
      .section{margin-bottom:36px}
      .ruled{border-bottom:1px solid BORDER;padding-bottom:6px;margin-bottom:16px}
      table thead th{border-bottom:2px solid PRIMARY;text-transform:uppercase;letter-spacing:2px;font-size:0.6rem;font-weight:600;color:SECONDARY;background:transparent}
      table td{border-bottom:1px solid BORDER;padding:10px 14px}
      table tbody tr:nth-child(even){background:transparent}
      .accent-line{width:40px;height:3px;background:ACCENT;margin:16px 0}
    `,
  },

  heritage: {
    name: 'Heritage',
    description: 'Vintage textures, sepia tones, ornamental borders, classic type',
    fonts: { heading: FONTS.crimson, body: FONTS.inter, mono: FONTS.crimson },
    headingWeight: '700',
    headingTransform: 'none',
    headingLetterSpacing: '0.02em',
    bodyLineHeight: '1.65',
    borderRadius: '4px',
    decorRules: {
      headerBar: false,
      ruledLines: true,
      dropCap: true,
      pullQuotes: true,
      ornamentalDivider: '❧',
      cornerDecoration: 'ornate',
    },
    colorLogic: (palette) => ({
      primary: palette.primary || '#2c1810',
      secondary: palette.secondary || '#8b4513',
      accent: palette.accent || '#c8956a',
      bg: palette.bg || '#f5f0e8',
      surface: '#faf6ef',
      border: '#d4c5a9',
      text: '#2c1810',
      textMuted: '#8a7a64',
    }),
    cssPatterns: `
      .page{background:BG;background-image:url("data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h60v60H0z' fill='none'/%3E%3Cpath d='M30 0v60M0 30h60' stroke='BORDER' stroke-width='0.3' opacity='0.3'/%3E%3C/svg%3E")}
      h1,h2,h3{font-family:PLAYFONT;color:PRIMARY;letter-spacing:0.02em}
      h1{font-size:2.2rem;text-align:center;margin-bottom:6px}
      .ornament{text-align:center;font-size:1.4rem;color:SECONDARY;letter-spacing:8px;margin:12px 0}
      .ornament::before,.ornament::after{content:'————';letter-spacing:0;color:SECONDARY;opacity:0.4}
      .border-frame{border:2px solid SECONDARY;padding:2px;border-radius:2px}
      .border-frame-inner{border:1px solid ACCENT;padding:24px 30px}
      table thead th{background:PRIMARY;color:ACCENT;letter-spacing:2px;text-transform:uppercase;font-size:0.6rem}
      table{border:2px solid SECONDARY}
      table td{border-bottom:1px solid BORDER}
      .drop-cap::first-letter{font-size:3.5em;float:left;line-height:0.8;margin:4px 10px 0 0;color:SECONDARY;font-family:PLAYFONT;font-weight:700}
      .pull-quote{font-family:PLAYFONT;font-style:italic;font-size:1.2rem;color:SECONDARY;text-align:center;padding:20px 40px;margin:20px 0}
      .pull-quote::before{content:'"';font-size:3rem;line-height:0;vertical-align:-0.4rem;color:ACCENT}
    `,
  },
};

// ── NICHE DESIGN LANGUAGE ──
// Maps profession categories to unique visual elements, background patterns,
// and color adjustments that make products feel "made for this niche."
const NICHE_LANGUAGE = {
  tech: {
    pattern: 'circuit',
    bgOverlay: 'linear-gradient(135deg, rgba(0,20,40,0.03) 0%, transparent 100%)',
    icons: ['⚡', '💻', '🔧', '📡'],
    accentShape: 'rounded-rect',
    colorShift: { accent: (c) => c },  // no shift
  },
  creator: {
    pattern: 'dots',
    bgOverlay: 'radial-gradient(ellipse at 85% 15%, rgba(236,72,153,0.06) 0%, transparent 55%)',
    icons: ['📌', '💰', '📈', '📱'],
    accentShape: 'rounded-rect',
    colorShift: {},
  },
  trades: {
    pattern: 'blueprint',
    bgOverlay: 'repeating-linear-gradient(0deg, transparent, transparent 19px, rgba(0,163,224,0.05) 19px, rgba(0,163,224,0.05) 20px), repeating-linear-gradient(90deg, transparent, transparent 19px, rgba(0,163,224,0.05) 19px, rgba(0,163,224,0.05) 20px)',
    icons: ['🔨', '🏗️', '⚙️', '🔩'],
    accentShape: 'square',
    colorShift: {},
  },
  wellness: {
    pattern: 'wave',
    bgOverlay: 'radial-gradient(ellipse at 20% 80%, rgba(124,182,157,0.08) 0%, transparent 50%)',
    icons: ['🌿', '🧘', '✨', '💫'],
    accentShape: 'organic-blob',
    colorShift: { accent: (c) => c },
  },
  recovery: {
    pattern: 'watercolor',
    bgOverlay: 'radial-gradient(ellipse at 80% 20%, rgba(139,92,246,0.06) 0%, transparent 60%)',
    icons: ['🙏', '🌅', '💧', '🕊️'],
    accentShape: 'soft-circle',
    colorShift: { secondary: (c) => c },
  },
  food: {
    pattern: 'dots',
    bgOverlay: 'radial-gradient(circle, rgba(245,158,11,0.05) 1px, transparent 1px)',
    icons: ['🍳', '☕', '🍰', '🌾'],
    accentShape: 'rounded',
    colorShift: {},
  },
  beauty: {
    pattern: 'diagonal',
    bgOverlay: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(236,72,153,0.03) 10px, rgba(236,72,153,0.03) 20px)',
    icons: ['💄', '✨', '🌸', '💫'],
    accentShape: 'pill',
    colorShift: {},
  },
  fitness: {
    pattern: 'stripe',
    bgOverlay: 'repeating-linear-gradient(135deg, transparent, transparent 14px, rgba(16,185,129,0.04) 14px, rgba(16,185,129,0.04) 28px)',
    icons: ['💪', '🏃', '🏋️', '⚡'],
    accentShape: 'angled',
    colorShift: {},
  },
  outdoor: {
    pattern: 'contour',
    bgOverlay: 'radial-gradient(ellipse at 50% 100%, rgba(14,165,233,0.06) 0%, transparent 50%)',
    icons: ['🎣', '🏕️', '🌲', '🏔️'],
    accentShape: 'mountain',
    colorShift: {},
  },
  finance: {
    pattern: 'ledger',
    bgOverlay: 'repeating-linear-gradient(0deg, transparent, transparent 23px, rgba(0,0,0,0.03) 23px, rgba(0,0,0,0.03) 24px)',
    icons: ['📈', '💰', '📊', '🏦'],
    accentShape: 'bar',
    colorShift: {},
  },
  spiritual: {
    pattern: 'glow',
    bgOverlay: 'radial-gradient(circle at 50% 30%, rgba(212,175,55,0.06) 0%, transparent 50%)',
    icons: ['✝️', '🙏', '📖', '🕊️'],
    accentShape: 'arch',
    colorShift: {},
  },
  craft: {
    pattern: 'crosshatch',
    bgOverlay: 'repeating-linear-gradient(45deg, transparent, transparent 8px, rgba(139,92,246,0.03) 8px, rgba(139,92,246,0.03) 16px), repeating-linear-gradient(-45deg, transparent, transparent 8px, rgba(139,92,246,0.03) 8px, rgba(139,92,246,0.03) 16px)',
    icons: ['🎨', '✂️', '🧵', '🖌️'],
    accentShape: 'scissors',
    colorShift: {},
  },
  pyro: {
    pattern: 'spark',
    bgOverlay: 'radial-gradient(ellipse at 50% 0%, rgba(239,68,68,0.08) 0%, transparent 40%)',
    icons: ['🎆', '🔥', '💥', '🧨'],
    accentShape: 'burst',
    colorShift: { secondary: '#f59e0b', accent: '#ef4444' },
  },
  default: {
    pattern: 'none',
    bgOverlay: 'none',
    icons: ['📋', '📄', '✏️', '📁'],
    accentShape: 'rounded-rect',
    colorShift: {},
  },
};

// ── STYLE ↔ NICHE MAPPING ──
// Which design style works best for each niche category.
// This is the "brain" — matches the right visual language to the right profession.
const STYLE_NICHE_MAP = {
  // Business / trades → brutalist or technical
  trades:    'technical',
  finance:   'minimal',
  // Outdoor / home / food → organic or heritage
  outdoor:   'organic',
  food:      'organic',
  home:      'organic',
  // Wellness / recovery → editorial or luxe
  wellness:  'editorial',
  recovery:  'editorial',
  spiritual: 'luxe',
  // Beauty / fashion → luxe or playful
  beauty:    'luxe',
  // Tech / digital → brutalist
  tech:      'brutalist',
  // Creator / social commerce → brutalist (bold, feed-native)
  creator:   'brutalist',
  // Craft / education → playful or organic
  craft:     'playful',
  // Pyro → heritage (vintage/industrial feel)
  pyro:      'heritage',
  // Default
  default:   'editorial',
};

// ── STYLE FOR PRODUCT TYPE ──
// Some product types look better in specific styles regardless of niche.
const STYLE_PRODUCT_OVERRIDE = {
  'invoice':      'brutalist',    // invoices should feel raw and functional
  'spreadsheet':  'brutalist',
  'booking':      'minimal',
  'journal':      'editorial',    // journals should feel like real paper
  'wall-art':     'luxe',         // wall art should feel premium
  'worksheet':    'playful',      // worksheets should feel approachable
  'party-printable': 'playful',
  'brand':        'luxe',
  'website':      'brutalist',
  'tool':         'technical',
  'bundle':       'luxe',
};

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════

const SENTIMENT_KEYWORDS = {
  // Creator / social-commerce niches must be tested BEFORE tech: their copy
  // contains "digital product"/"online" and would otherwise get circuit boards.
  creator: /pinterest|instagram|tiktok|youtube|social media|content creator|influencer|affiliate|monetiz|make money|side hustle|passive income|online business|newsletter|printable|canva|notion/i,
  tech: /tech(?!nic)|software|ai |app |digital|cyber|code|saas|data|drone|smart home|ev |battery|solar/i,
  wellness: /wellness|yoga|massage|breath|sleep|holistic|meditation|nutrition|somatic|coach/i,
  recovery: /recovery|sober|aa |smart recovery|refuge|faith|secular|therapy|counsel/i,
  beauty: /beauty|makeup|hair|lash|brow|tanning|henna|salon|spa|skincare/i,
  fashion: /fashion|aesthetic|style|wear|clothing|boutique/i,
  fitness: /fitness|gym|train|sport|hyrox|ruck|pilates|crossfit|personal trainer/i,
  outdoor: /outdoor|fish|hunt|camp|hike|overland|vanlife|boat|garden|landscap|bee/i,
  food: /food|chef|bake|brew|cook|kitchen|cater|restaurant|coffee/i,
  home: /home|clean|organize|interior|decor|plant|compost|rainwater/i,
  finance: /finance|notary|tax|bookkeep|account|loan|audit|energy audit/i,
  trades: /trade|plumb|hvac|roof|electric|concrete|fence|locksmith|pest|pressure|junk|pool|epoxy|garage|septic|chimney|snow|drywall/i,
  spiritual: /faith|bible|dharma|prayer|church|gospel|scripture/i,
  craft: /craft|art|diy|maker|handmade|pottery|candle|soap|resin|cricut|sew|knit|woodwork/i,
  pyro: /pyro|firework|pyrotechnic|shell|mortar|fuse|lift|burst|rocket/i,
};

function detectNicheCategory(prof) {
  const blob = [
    prof?.name, prof?.slug, prof?.tier, prof?.why, prof?.category,
    typeof prof?.services === 'string' ? prof.services : ''
  ].filter(Boolean).join(' ');
  for (const [key, re] of Object.entries(SENTIMENT_KEYWORDS)) {
    if (re.test(blob)) return key;
  }
  return 'default';
}

// Get the full design DNA for a (profession, productType) pair.
// Returns { style, niche, colors, fonts, css, nicheLanguage }
function getDesignDNA(prof, productType) {
  const niche = detectNicheCategory(prof);

  // Step 1: Product-type override wins if set
  let styleKey = STYLE_PRODUCT_OVERRIDE[productType] || null;

  // Step 2: If no override, use niche→style mapping
  if (!styleKey) styleKey = STYLE_NICHE_MAP[niche] || 'editorial';

  const style = STYLES[styleKey];
  if (!style) return getDesignDNA(prof, 'checklist'); // fallback

  // Step 3: Parse profession palette
  let palette = {};
  try { palette = JSON.parse(prof?.colors || '{}'); } catch {}
  // Apply niche color shifts
  const nicheLang = NICHE_LANGUAGE[niche] || NICHE_LANGUAGE.default;
  if (nicheLang.colorShift) {
    for (const [k, v] of Object.entries(nicheLang.colorShift)) {
      if (typeof v === 'function') palette[k] = v(palette[k]);
      else palette[k] = v;
    }
  }

  // Step 4: Resolve final colors
  const colors = style.colorLogic(palette);

  // Step 5: Build CSS
  const css = style.cssPatterns
    .replace(/PLAYFONT/g, style.fonts.heading)
    .replace(/FONTS\.mono/g, style.fonts.mono)
    .replace(/PRIMARY/g, colors.primary)
    .replace(/SECONDARY/g, colors.secondary)
    .replace(/ACCENT/g, colors.accent)
    .replace(/BG/g, colors.bg)
    .replace(/BORDER/g, colors.border);

  return {
    styleKey,
    style: style.name,
    description: style.description,
    niche,
    nicheLanguage: nicheLang,
    colors,
    fonts: style.fonts,
    headingWeight: style.headingWeight,
    headingTransform: style.headingTransform,
    headingLetterSpacing: style.headingLetterSpacing,
    bodyLineHeight: style.bodyLineHeight,
    borderRadius: style.borderRadius,
    decorRules: style.decorRules,
    css,
  };
}

// For backward compatibility: get a simple theme object from a design DNA
function toLegacyTheme(dna) {
  return {
    name: dna.styleKey,
    font: dna.fonts.heading,
    primary: dna.colors.primary,
    secondary: dna.colors.secondary,
    accent: dna.colors.accent,
    bg: dna.colors.bg,
    dark: dna.colors.bg < '#888888',
    // New fields for the design DNA system
    dna,
  };
}

// Entry point: given a prof + product type, return a ready-to-use theme
function resolveDesign(prof, productType) {
  const dna = getDesignDNA(prof, productType);
  return toLegacyTheme(dna);
}

function getAllStyles() { return Object.entries(STYLES).map(([k, v]) => ({ key: k, name: v.name, description: v.description })); }
function getNicheCategories() { return Object.keys(NICHE_LANGUAGE); }
function getStyleByName(name) { return STYLES[name] || null; }

module.exports = {
  STYLES, FONTS, FONT_PAIRINGS, NICHE_LANGUAGE, STYLE_NICHE_MAP, STYLE_PRODUCT_OVERRIDE,
  GOOGLE_FONTS_URL, googleFontsUrl,
  getDesignDNA, toLegacyTheme, resolveDesign,
  detectNicheCategory,
  getAllStyles, getNicheCategories, getStyleByName,
};
