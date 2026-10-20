// ═══════════════════════════════════════════════════════════════════════════
// DESIGN AGENT — LLM-as-designer for NicheGate factory documents
// ═══════════════════════════════════════════════════════════════════════════
// Input:  { content: <structured JSON>, brand: <theme spec>, type: <docType> }
// Output: Self-contained HTML string (print-ready, A4, fonts loaded)
// Rule:   NEVER rewrite content. Inject as data attributes / textContent only.
// ═══════════════════════════════════════════════════════════════════════════

const runtimeConfig = require('./runtimeConfig');
const modelRouter = require('./modelRouter');

const DESIGN_AGENT_VERSION = 'da-v1';
// Use Nous Portal for design agent (stronger model for HTML generation)
const DESIGN_AGENT_MODEL = process.env.DESIGN_AGENT_MODEL || 'anthropic/claude-haiku-5.5';
const USE_NOUSS = String(process.env.VISION_PROVIDER || '').toLowerCase() === 'nous' && process.env.NOUSPORTAL_API_KEY;
const DESIGN_AGENT_TARGET = USE_NOUSS ? {
  baseUrl: process.env.VISION_BASE_URL || 'https://inference-api.nousresearch.com/v1',
  headers: { Authorization: `Bearer ${process.env.NOUSPORTAL_API_KEY}`, 'Content-Type': 'application/json' }
} : undefined;

// ── BRAND SPEC (machine-readable, per-niche) ────────────────────────────────
function buildBrandSpec(theme, prof) {
  const p = theme.primary || '#0f172a';
  const a = theme.accent || '#2dd4bf';
  const navy = p;
  const cream = '#fdfbf7';
  const gold = a.replace(/[^,]+\)$/, '0.95)');
  const sage = '#8fb8b0';
  const slate = '#334155';
  const ink = '#1e293b';
  const muted = '#94a3b8';

  return {
    palette: { navy, cream, gold, sage, slate, ink, muted },
    fonts: {
      display: "'Playfair Display','Iowan Old Style','Palatino Linotype',Georgia,serif",
      body: "'Inter','Space Grotesk',system-ui,sans-serif",
      mono: "'JetBrains Mono','Fira Code',monospace"
    },
    spacing: { base: '8px', scale: [0, 4, 8, 12, 16, 24, 32, 48] },
    radius: { sm: '6px', md: '10px', lg: '14px', xl: '18px', full: '999px' },
    shadow: {
      card: '0 10px 24px -20px rgba(15,23,42,0.5)',
      hero: '0 30px 60px -34px rgba(15,23,42,0.5)',
      total: '0 14px 28px -16px rgba(0,0,0,0.3)'
    },
    border: { thin: '1px solid rgba(51,65,85,0.08)', accent: `2px solid ${gold}` },
    prof: { name: prof.name, slug: prof.slug, emoji: prof.emoji || '📋' }
  };
}

// ── CONTENT SCHEMAS (per document type) ─────────────────────────────────────
const CONTENT_SCHEMAS = {
  checklist: {
    // { services: [{ title, price, steps: string[] }] }
    required: ['services'],
    example: {
      services: [
        { title: 'Air Quality Test', price: '$200', steps: ['Collect outdoor control samples', 'Run indoor HVAC samples', 'Maintain chain of custody', 'Photograph all locations', 'Report spore counts'] },
        { title: 'Surface Sampling', price: '$150', steps: ['Tape-lift suspect surface', 'Swab visible growth', 'Take bulk samples', 'Label all containers', 'Compare species'] }
      ]
    }
  },
  invoice: {
    // { lines: [{ service, rate }], total: number, dueDate: string }
    required: ['lines', 'total', 'dueDate'],
    example: {
      lines: [{ service: 'Professional Consultation', rate: 150 }, { service: 'Site Inspection', rate: 300 }],
      total: 450,
      dueDate: 'Net 30'
    }
  },
  workbook: {
    // { sections: [{ title, prompts: string[] }] }
    required: ['sections'],
    example: {
      sections: [
        { title: 'Week 1: Foundations', prompts: ['What is your core offer?', 'Who is your ideal client?', 'What problem do you solve?'] },
        { title: 'Week 2: Systems', prompts: ['Map your client journey', 'Define your delivery process', 'Set up tracking'] }
      ]
    }
  },
  // Add more types as needed — the agent handles unknown types via fallback
};

// ── DESIGN AGENT PROMPT ─────────────────────────────────────────────────────
const DESIGN_AGENT_SYSTEM_PROMPT = `You are a senior editorial designer for NicheGate, a premium digital-product factory.
Your job: emit a COMPLETE, SELF-CONTAINED HTML document (print-ready A4) for a given content payload and brand spec.

════════════════════════════════════════════════════════════════════════════
HARD CONSTRAINTS (violation = invalid output)
════════════════════════════════════════════════════════════════════════════
1. CONTENT IMMUTABILITY: You are given structured content (JSON). You MUST inject
   it into the HTML EXACTLY AS PROVIDED — via data-attributes, textContent, or
   value attributes. NEVER paraphrase, summarize, reword, or invent content.
   The validator will diff input vs rendered text; ANY mismatch = hard fail.

2. SELF-CONTAINED HTML: One string, valid HTML5. Includes:
   - <!DOCTYPE html>, <html lang="en">, <head>, <body>
   - @import for Google Fonts (Playfair Display, Inter, Space Grotesk, JetBrains Mono)
   - ALL CSS in a single <style> block (no external deps except fonts)
   - Print CSS: @page { size: A4; margin: 12mm } + @media print rules
   - No <script> tags, no event handlers, no external resources except fonts

3. EDITORIAL DESIGN SYSTEM (apply brand.spec exactly via CSS custom properties):
   - Palette: navy, cream, gold, sage, slate, ink, muted
   - Typography: display font for h1/h2, body font for text, mono for numbers
   - Spacing: 8px base scale
   - Radius: sm/md/lg/xl/full tokens
   - Shadows: card/hero/total tokens
   - Borders: thin/accent tokens
   - Frame: double-rule border (--accent) + 4 corner L-brackets
   - Watermark: rotated doc-type label (opacity 0.025) bottom-right
   - Page number: bottom-center "Page 1 of 1 · NicheGate [System] Systems"

4. DOCUMENT-TYPE PATTERNS (MANDATORY — do not improvise):
   checklist  → hero (300px) + "How to use" (4 steps) + 6 service cards
                CARDS: alternating bg (--surface, --cream), line-art icon left, title, price chip right,
                5 checklist items with checkmark, NO missing steps.
                LAYOUT: SINGLE-COLUMN STACK. Use .grp:nth-child(odd){background:var(--surface)} .grp:nth-child(even){background:var(--cream)}
   invoice    → hero (220px) + meta grid (Bill To/Date/Due) + striped table (Qty/Rate/Amount)
                + total card (--gold bg) + pay chips + signature line
   workbook   → hero (250px) + progress chips + section cards with lined prompts

   EVERY document MUST include:
   - Double-rule frame (2px var(--accent)) + 4 corner L-brackets (top-L, top-R, bottom-L, bottom-R)
   - Page number footer: "Page 1 of 1 · NicheGate [Type] Systems"
   - Watermark: rotated doc-type label (opacity 0.025, bottom-right, var(--display))
   - Palette: --navy/--cream/--gold/--sage/--slate/--ink/--muted — NO bright teal/cyan
   - Fonts: var(--display) for h1/h2, var(--body) for body, var(--mono) for numbers

5. HERO IMAGE (CRITICAL): If PLACEHOLDER specified, you MUST render:
   .hero { height: 300px; background-image: var(--hero-bg); background-size: cover; background-position: center right; }
   with .hero-scrim (left 88% opaque var(--navy) → right transparent) and .hero-content.
   The factory WILL inject the actual image by replacing var(--hero-bg).
   If NONE, render solid var(--navy) .masthead (no .hero).

6. "HOW TO USE" SECTION (checklist): Must contain 4 numbered steps with REAL instructional text.
   NEVER leave empty. Use: "Print one copy per job site", "Complete every step in order",
   "Tick the box when done; note issues in margin", "Sign off at the bottom".

7. WATERMARK: Always include <div class="watermark">TYPE</div> with:
   position: absolute; bottom: 50px; right: 28px; font-family: var(--display);
   font-size: 6rem; font-weight: 900; color: var(--gold); opacity: 0.025;
   transform: rotate(-12deg); pointer-events: none; z-index: 1;

8. CORNER BRACKETS: Frame must have 4 L-brackets using var(--accent):
   .frame::before { top: 14px; left: 14px; border-top: 2px solid var(--accent); border-left: 2px solid var(--accent); }
   .frame::after { bottom: 14px; right: 14px; border-bottom: 2px solid var(--accent); border-right: 2px solid var(--accent); }
   Plus inner frame::before/after for top-right and bottom-left.

9. COLOR USAGE (MANDATORY — use CSS variables, NEVER hardcode):
   - Accent borders/lines: var(--accent) [=gold]
   - Gold fills: var(--gold) [=gold]
   - Sage accents: var(--sage)
   - Cream backgrounds: var(--cream)
   - Navy text: var(--navy)
   - Ink body text: var(--ink)
   - Alternating cards: .grp:nth-child(odd){background:var(--surface)} .grp:nth-child(even){background:var(--cream)}
   - NEVER hardcode #2dd4bf, teal, cyan, or bright blue

9. NO PLACEHOLDERS: No "Lorem ipsum", no "[Client Name]", no "[Date]". The
   content payload contains REAL data — use it. Empty strings render as empty.

10. ACCESSIBILITY: Semantic HTML (header, main, section, table, ol, ul, footer).
    Color contrast ≥ 4.5:1. Focus-visible styles (even if print-only).

════════════════════════════════════════════════════════════════════════════
OUTPUT FORMAT
════════════════════════════════════════════════════════════════════════════
Return ONLY the HTML string. No markdown, no explanation, no JSON wrapper.
The HTML must be valid and render correctly in headless Chrome (Puppeteer).`;

// ── USER PROMPT BUILDER ─────────────────────────────────────────────────────
function buildUserPrompt(content, brandSpec, type, heroDataUri) {
  const schema = CONTENT_SCHEMAS[type] || { required: [], example: {} };
  let prompt = `DOCUMENT TYPE: ${type.toUpperCase()}
BRAND SPEC:
${JSON.stringify(brandSpec, null, 2)}

CONTENT PAYLOAD (immutable — inject exactly):
${JSON.stringify(content, null, 2)}

CONTENT SCHEMA (for reference):
${JSON.stringify(schema, null, 2)}`;

  if (heroDataUri) {
    prompt += `

HERO IMAGE: PLACEHOLDER — the .hero section will have its background-image injected post-generation.
Render the .hero section structure (300px height, .hero-scrim, .hero-content with title/tagline/rule)
but use background-image: var(--hero-bg) so the factory can inject the actual image.`;
  } else {
    prompt += `

HERO IMAGE: NONE — render solid navy masthead with gold accent rule (no .hero section).`;
  }

  prompt += `

Generate the complete HTML document now.`;
  return prompt;
}

// ── LLM CALL (uses modelRouter with Nous Portal support) ─────────────────────
async function callDesignAgent(systemPrompt, userPrompt) {
  const modelRouter = require('./modelRouter');
  if (!modelRouter.callModel) throw new Error('modelRouter.callModel not available');
  const res = await modelRouter.callModel({
      target: DESIGN_AGENT_TARGET,
      model: DESIGN_AGENT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.1,
      maxTokens: 12000, // increased for full HTML with all features
      timeoutMs: 120000,
      action: 'design_agent'
    });
  if (!res) throw new Error('Design agent returned null (disabled or failed)');
  return res;
}

// ── CONTENT LOCK VALIDATOR ──────────────────────────────────────────────────
const cheerio = require('cheerio');

function extractTextContent(html) {
  const $ = cheerio.load(html);
  // Remove non-content elements
  $('style, script, .page-num, .watermark, .brand-chip, .edition, .mh-rule, .chip, .grp-num, .grp-tag, .chk-ico, .pay-chip, .total-card .lbl, .total-card .due, .foot, .field h3').remove();
  return $('body').text().replace(/\s+/g, ' ').trim();
}

function validateContentLock(originalContent, renderedHtml, type) {
  const originalText = JSON.stringify(originalContent).replace(/[{}",:[\]]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const renderedText = extractTextContent(renderedHtml).toLowerCase();

  // Check that all original content tokens appear in rendered output
  const tokens = originalContentJSON(originalContent);
  const missing = tokens.filter(t => !renderedText.includes(t.toLowerCase()));
  if (missing.length > 0) {
    return { ok: false, missing, renderedPreview: renderedText.substring(0, 500) };
  }
  return { ok: true };
}

function originalContentJSON(obj, prefix = '', acc = []) {
  if (typeof obj === 'string') {
    const trimmed = obj.trim();
    if (trimmed.length > 2) acc.push(trimmed);
  } else if (Array.isArray(obj)) {
    obj.forEach(v => originalContentJSON(v, prefix, acc));
  } else if (obj && typeof obj === 'object') {
    Object.values(obj).forEach(v => originalContentJSON(v, prefix, acc));
  }
  return [...new Set(acc)]; // dedupe
}

// ── MAIN ENTRY ──────────────────────────────────────────────────────────────
async function generateDesignedHtml({ content, theme, prof, type, heroDataUri }) {
  const brandSpec = buildBrandSpec(theme, prof);
  let userPrompt = buildUserPrompt(content, brandSpec, type, heroDataUri);

  let html;
  let attempts = 0;
  const maxAttempts = 2;

  while (attempts < maxAttempts) {
    attempts++;
    try {
      html = await callDesignAgent(DESIGN_AGENT_SYSTEM_PROMPT, userPrompt);
      const validation = validateContentLock(content, html, type);
      if (validation.ok) {
        return { html, brandSpec, attempts, validation: 'passed' };
      }
      // Validation failed — append error context for retry
      userPrompt += `\n\nVALIDATION FAILED (attempt ${attempts}): Missing content tokens: ${validation.missing.join(', ')}. Fix and regenerate.`;
    } catch (e) {
      if (attempts >= maxAttempts) throw e;
      userPrompt += `\n\nERROR (attempt ${attempts}): ${e.message}. Retry.`;
    }
  }
  throw new Error(`Design agent failed after ${maxAttempts} attempts`);
}

// ── FALLBACK (current V4 templates) ─────────────────────────────────────────
const ds = require('./designStudio');
function fallbackHtml({ content, theme, prof, type, heroDataUri }) {
  switch (type) {
    case 'checklist': return ds.buildChecklistHTML(prof, theme, heroDataUri);
    case 'invoice': return ds.buildInvoiceHTML(prof, theme, {}, heroDataUri);
    // Add other types as they get V4 treatment
    default: return ds.buildChecklistHTML(prof, theme, heroDataUri); // safe default
  }
}

async function generateHtmlWithFallback(params) {
  try {
    return await generateDesignedHtml(params);
  } catch (e) {
    console.error('[DESIGN AGENT] Failed, falling back to V4 template:', e.message);
    return { html: fallbackHtml(params), brandSpec: buildBrandSpec(params.theme, params.prof), attempts: 0, validation: 'fallback', error: e.message };
  }
}

// Inject actual hero image into generated HTML (post-process)
function injectHeroImage(html, heroDataUri) {
  if (!heroDataUri) return html;
  return html.replace(/var\(--hero-bg\)/g, heroDataUri)
             .replace(/background-image:\s*var\(--hero-bg\)/, `background-image: url('${heroDataUri}')`);
}

module.exports = {
  DESIGN_AGENT_VERSION,
  generateDesignedHtml,
  generateHtmlWithFallback,
  validateContentLock,
  buildBrandSpec,
  CONTENT_SCHEMAS,
  injectHeroImage
};