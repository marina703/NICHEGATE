// ═══════════════════════════════════════════════════════════════════════════
// COVER TEMPLATE — composites a hero image with typography into a final
// marketplace cover. Mirrors the n8n Design Studio "Render Cover" step:
// the hero sits in the right portion of the frame, and typography (title,
// tagline, kicker, benefits) is placed in the clean negative space on the
// left 45%.
//
// Editorial layout language (matches the owner's reference examples):
//   - condensed bold display type (Arial Narrow Bold stack)
//   - kicker in small caps + short accent rule
//   - serif italic tagline
//   - two-line title: bold line 1, lighter line 2
//   - price block bottom-left with "INSTANT DOWNLOAD" sub-label
//
// Uses Puppeteer (already a dependency via pdfGen.getBrowser) — no external
// service like Placid.app required.
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pdfGen = require('./pdfGenerator');
const coverArt = require('./coverArt');

const COVER_WIDTH = coverArt.COVER_WIDTH;   // 1200
const COVER_HEIGHT = coverArt.COVER_HEIGHT; // 1800
const OUT_DIR = path.join(require('./runtimeConfig').resolvePersistentDir('covers'), 'templates');
fs.mkdirSync(OUT_DIR, { recursive: true });

// Escape utility — prevents stored-XSS through AI-generated copy.
function esc(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── COLOR HELPERS (module level — used by buildCoverHTML) ──────────────────
function parseHex(hex) {
  const h = String(hex || '').replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function luminance(hex) {
  const rgb = parseHex(hex);
  if (!rgb) return 0.5;
  return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
}
function lighten(hex, factor = 0.55) {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  return '#' + rgb.map((v) => Math.round(v + (255 - v) * factor).toString(16).padStart(2, '0')).join('');
}

/**
 * Build a complete 1200x1800 cover page HTML string.
 * @param {object} params
 * @param {string} params.heroDataUri  — data:image URI of the hero image
 * @param {object} params.concept      — { name, kicker, tagline, benefits, palette, listing_title, ... }
 * @param {string} params.productId    — for cache key
 */
function buildCoverHTML(heroDataUri, concept, opts = {}) {
  const heroMode = opts.heroMode || 'fullbleed';
  const title = concept.listing_title || concept.concept_name || '';
  const kicker = concept.kicker || '';
  const tagline = concept.tagline || '';
  const benefits = Array.isArray(concept.benefits) ? concept.benefits : (concept.benefit_1 ? [concept.benefit_1, concept.benefit_2, concept.benefit_3].filter(Boolean) : []);
  const palette = concept.palette || {};

  // Field: the cover director's chosen tone — a deep tonal behind the white
  // page sheet so the product always pops. Falls back to palette tokens.
  const bg = concept.field || palette.bg || palette.background || palette.surface || '#1d1d1f';
  const bgLum = luminance(bg);
  let accent = concept.accent || palette.accent || '#ff4d2e';
  // Keep the accent legible against the field: lighten dark accents on dark fields.
  if (bgLum < 0.45 && luminance(accent) < 0.4) accent = lighten(accent, 0.55);
  // Light text on dark fields, ink on light ones.
  const textColor = concept.fieldTone === 'light'
    ? (palette.ink || '#1d1d1f')
    : (bgLum > 0.5 ? (palette.ink || '#1d1d1f') : '#f5f2ea');
  const accentColor = accent;

  // Price: stored as "$8" strings in the DB — strip to a number, never NaN.
  const priceNum = parseFloat(String(concept.price == null ? '' : concept.price).replace(/[^0-9.]/g, ''));
  const priceStr = Number.isFinite(priceNum) && priceNum > 0 ? '$' + priceNum : '';

  // Hero image is placed in the right 55% of the frame (x: 660 to 1200)
  // The left 45% (0 to 660) is the "quiet zone" for typography.
  const heroX = 660;
  const heroW = 540;

  // Benefit count influences layout — 3 dots max.
  const maxBenefits = Math.min(benefits.length, 3);

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html,body { width:100%; height:100%; overflow:hidden; }
  body {
    width: ${COVER_WIDTH}px;
    height: ${COVER_HEIGHT}px;
    font-family: 'Arial Narrow', 'Liberation Sans Narrow', 'Helvetica Neue', Arial, sans-serif;
    background: ${bg};
    color: ${textColor};
    position: relative;
    overflow: hidden;
  }
  /* Hero image — right 55% of frame */
  .hero {
    position: absolute;
    top: 0;
    left: ${heroX}px;
    width: ${heroW}px;
    height: ${COVER_HEIGHT}px;
    overflow: hidden;
  }
  .hero-img {
    position: absolute;
    inset: 0;
    background: url('${heroDataUri}') center/cover no-repeat;
  }
  /* Product page floating as a printed sheet on the palette field */
  .page-card {
    position: absolute;
    top: 96px;
    left: 34px;
    right: 34px;
    background: #ffffff;
    border-radius: 10px;
    box-shadow: 0 34px 90px rgba(0,0,0,0.38);
    overflow: hidden;
  }
  .page-card img {
    display: block;
    width: 100%;
    height: auto;
  }
  /* Left typography zone */
  .left {
    position: absolute;
    top: 0;
    left: 0;
    width: ${heroX}px;
    height: ${COVER_HEIGHT}px;
    padding: 96px 64px;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  /* Kicker — small accent label with rule */
  .kicker {
    font-size: 19px;
    font-weight: 700;
    letter-spacing: 3.5px;
    text-transform: uppercase;
    color: ${accentColor};
    margin-bottom: 18px;
  }
  .kicker-rule {
    width: 56px;
    height: 4px;
    background: ${accentColor};
    margin-bottom: 40px;
  }
  /* Tagline — serif italic line under the rule */
  .tagline {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 23px;
    font-style: italic;
    opacity: 0.78;
    letter-spacing: 0.3px;
    margin-bottom: 36px;
    line-height: 1.35;
  }
  /* Main title — condensed editorial display */
  .title {
    font-size: 66px;
    font-weight: 700;
    line-height: 0.98;
    letter-spacing: -0.5px;
    margin-bottom: 40px;
    text-transform: uppercase;
  }
  .title .word { display: block; }
  .title .line2 { font-weight: 400; opacity: 0.85; }
  /* Benefits — 3 short bullet items */
  .benefits {
    list-style: none;
    margin-top: 8px;
  }
  .benefits li {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 14px;
    padding-left: 38px;
    position: relative;
    line-height: 1.4;
    letter-spacing: 0.4px;
  }
  .benefits li::before {
    content: '';
    position: absolute;
    left: 0;
    top: 3px;
    width: 18px;
    height: 18px;
    border: 2.5px solid ${accentColor};
    border-radius: 50%;
  }
  /* Price block — bottom left */
  .price-block {
    position: absolute;
    bottom: 72px;
    left: 64px;
  }
  .price {
    font-size: 46px;
    font-weight: 700;
    color: ${accentColor};
    letter-spacing: -1px;
    line-height: 1;
  }
  .price-sub {
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 2.5px;
    text-transform: uppercase;
    opacity: 0.65;
    margin-top: 10px;
  }
</style>
</head>
<body>
  <div class="hero">${heroMode === 'page'
    ? `<div class="page-card"><img src="${heroDataUri}" alt=""></div>`
    : `<div class="hero-img"></div>`}</div>
  <div class="left">
    ${kicker ? `<div class="kicker">${esc(kicker)}</div><div class="kicker-rule"></div>` : '<div class="kicker-rule"></div>'}
    ${tagline ? `<div class="tagline">${esc(tagline)}</div>` : ''}
    <div class="title">
      ${formatTitle(title)}
    </div>
    ${maxBenefits > 0 ? `<ul class="benefits">` + benefits.slice(0, 3).map(b => `<li>${esc(b)}</li>`).join('') + `</ul>` : ''}
  </div>
  ${priceStr ? `<div class="price-block"><div class="price">${esc(priceStr)}</div><div class="price-sub">Instant download</div></div>` : ''}
</body>
</html>`;

  return html;
}

// Split title into two editorial lines: bold line 1, lighter line 2.
function formatTitle(title) {
  const clean = String(title || '').trim();
  const words = clean.split(' ').filter(Boolean);
  if (words.length === 0) return '';
  if (words.length <= 3) {
    return words.map(w => `<span class="word">${esc(w)}</span>`).join(' ');
  }
  // Two lines: break near the middle.
  const mid = Math.ceil(words.length / 2);
  const line1 = words.slice(0, mid).join(' ');
  const line2 = words.slice(mid).join(' ');
  return `<span class="word">${esc(line1)}</span><span class="word line2">${esc(line2)}</span>`;
}

// ── CONCEPT DERIVATION ─────────────────────────────────────────────────────
// Build the cover copy from product data. Priority: nothing invented about
// the PRODUCT's specifics — kicker is the niche, title is the deduplicated
// name, tagline/benefits are per-type format facts (not fabricated claims).

const TYPE_COPY = {
  'affirmation-labels': { tagline: 'One truth at a time — stick them where you will see them.', benefits: ['Print-ready round labels', 'Cut on the dashed circles', 'Instant download'] },
  'recovery-journal': { tagline: 'One page a day. Honest reflection, steady progress.', benefits: ['Daily guided pages', 'Print or fill digitally', 'Instant download'] },
  'recovery-nutrition': { tagline: 'Real food for a body that is healing.', benefits: ['Gentle cleanse plan', 'Real-food recipes', 'Instant download'] },
  'meeting-flashcards': { tagline: 'Run the meeting. Keep the room.', benefits: ['Print-ready cards', 'Simple formats that work', 'Instant download'] },
  checklist: { tagline: 'Every step covered, nothing missed.', benefits: ['Step-by-step structure', 'Print or digital', 'Ready to use today'] },
  invoice: { tagline: 'Get paid faster, look legit.', benefits: ['Auto-totals built in', 'Editable format', 'Ready to use today'] },
  spreadsheet: { tagline: 'The numbers, handled.', benefits: ['Live formulas', 'Clean structure', 'Ready to use today'] },
  booking: { tagline: 'Your calendar, booked solid.', benefits: ['Client-ready form', 'Works on any device', 'Ready to use today'] },
  social: { tagline: 'Look elite on every post.', benefits: ['Pro templates', 'Fill-in-the-blank copy', 'Ready to use today'] },
  bundle: { tagline: 'The whole system, ready on day one.', benefits: ['Every tool included', 'One download', 'Instant access'] },
  default: { tagline: 'Ready the day you open for business.', benefits: ['Premium quality', 'Easy to customize', 'Instant download'] }
};

/** Deduplicate a doubled profession prefix: "AA / 12-Step Recovery Recovery X" → "X". */
function stripProfPrefix(name, prof) {
  let n = String(name || '').trim();
  const p = String((prof && prof.name) || '').trim();
  if (p && n.toLowerCase().startsWith(p.toLowerCase())) {
    n = n.slice(p.length).trim();
  }
  // collapse a doubled leading word pair ("Recovery Recovery Affirmation")
  n = n.replace(/^(\S+)\s+\1\b/i, '$1');
  return n || String(name || '').trim();
}

function buildConcept(product, prof, theme) {
  let brief = null;
  try { brief = product.design_brief ? JSON.parse(product.design_brief) : null; } catch { /* ignore */ }
  const palette = (brief && brief.palette) || (theme && theme.palette) || {};
  const typeCopy = TYPE_COPY[product.type] || TYPE_COPY.default;
  const kicker = (prof && prof.name) ? String(prof.name) : '';
  const title = stripProfPrefix(product.name, prof);
  const priceNum = parseFloat(String(product.price == null ? '' : product.price).replace(/[^0-9.]/g, ''));
  return {
    listing_title: title,
    kicker,
    tagline: typeCopy.tagline,
    benefits: typeCopy.benefits,
    palette: {
      bg: palette.bg || palette.background || palette.surface || '#1d1d1f',
      ink: palette.ink || null,
      accent: palette.accent || palette.primary || '#ff4d2e'
    },
    price: Number.isFinite(priceNum) ? priceNum : (product.price || 15)
  };
}

// ── CACHE KEY ─────────────────────────────────────────────────────────────────

function coverCacheKey(heroPath, concept) {
  const heroHash = crypto.createHash('sha1').update(fs.readFileSync(heroPath)).digest('hex').slice(0, 16);
  const conceptHash = crypto.createHash('sha1')
    .update(`${concept.listing_title || ''}|${concept.kicker || ''}|${concept.tagline || ''}|${JSON.stringify(concept.palette || {})}|${Number(concept.price || 0)}`)
    .digest('hex').slice(0, 16);
  return path.join(OUT_DIR, `${heroHash}-${conceptHash}.cover.jpg`);
}

// ── RENDER ───────────────────────────────────────────────────────────────────

/**
 * Render the final composited cover as a 1200x1800 JPEG.
 * @returns {string|null} path to the cover JPEG, or null on failure
 */
async function renderCover(heroImagePath, concept, opts = {}) {
  const cachePath = coverCacheKey(heroImagePath, concept);

  // Cache hit
  if (!opts.fresh && fs.existsSync(cachePath) && fs.statSync(cachePath).size > 5000) {
    return cachePath;
  }

  let heroDataUri;
  try {
    heroDataUri = coverArt.imageDataUri(fs.readFileSync(heroImagePath));
  } catch (e) {
    console.error('[COVER_TEMPLATE] failed to load hero image:', e.message);
    return null;
  }

  const html = buildCoverHTML(heroDataUri, concept, opts);
  const outPath = cachePath;

  const browser = await pdfGen.getBrowser();
  if (!browser) {
    console.error('[COVER_TEMPLATE] no browser available');
    return null;
  }

  const page = await browser.newPage();
  try {
    await page.setViewport({ width: COVER_WIDTH, height: COVER_HEIGHT, deviceScaleFactor: 1 });

    // Block any external network — the cover is fully self-contained
    if (typeof page.setRequestInterception === 'function') {
      await page.setRequestInterception(true);
      page.on('request', request => {
        const url = request.url();
        if (url.startsWith('data:') || url === 'about:blank') request.continue();
        else request.abort();
      });
    }

    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 300)); // let fonts paint
    await page.screenshot({ path: outPath, type: 'jpeg', quality: 92, clip: { x: 0, y: 0, width: COVER_WIDTH, height: COVER_HEIGHT } });
    return fs.existsSync(outPath) && fs.statSync(outPath).size > 5000 ? outPath : null;
  } catch (e) {
    console.error('[COVER_TEMPLATE] render error:', e.message);
    return null;
  } finally {
    await page.close().catch(() => {});
  }
}

// ── PRODUCT PAGE RENDER (the real deliverable as the hero) ─────────────────

/**
 * Render a product's real preview page (from fileFactory.buildPreviewHTML)
 * to a PNG. Network stays ON so Google Fonts load. The PNG is embedded as a
 * data URI in the cover, floating as a white sheet on the palette field.
 * @returns {string|null} path to the PNG, or null on failure
 */
async function renderProductPage(pageHtml, outPath, opts = {}) {
  if (!opts.fresh && fs.existsSync(outPath) && fs.statSync(outPath).size > 5000) return outPath;
  const browser = await pdfGen.getBrowser();
  if (!browser) return null;
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 800, height: 1200, deviceScaleFactor: 2 });
    await page.setContent(pageHtml, { waitUntil: 'load', timeout: 30000 });
    // let webfonts settle (bounded — never hang the pipeline)
    await Promise.race([
      page.evaluate(() => document.fonts && document.fonts.ready),
      new Promise((r) => setTimeout(r, 4000))
    ]);
    // Crop depth: how much of the page the cover shows. 'top'/'upper' show the
    // designed header + first section big and readable; 'full' shows the sheet.
    const crop = opts.crop || 'upper';
    let clip = undefined;
    if (crop !== 'full') {
      const h = await page.evaluate(() => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight));
      const frac = crop === 'top' ? 0.3 : 0.5;
      clip = { x: 0, y: 0, width: 800, height: Math.max(600, Math.round(h * frac)) };
    }
    await page.screenshot({ path: outPath, type: 'png', clip });
    return fs.existsSync(outPath) && fs.statSync(outPath).size > 5000 ? outPath : null;
  } catch (e) {
    console.error('[COVER_TEMPLATE] product page render error:', e.message);
    return null;
  } finally {
    await page.close().catch(() => {});
  }
}

// ── EXPORTS ─────────────────────────────────────────────────────────────────

module.exports = {
  COVER_WIDTH,
  COVER_HEIGHT,
  buildCoverHTML,
  buildConcept,
  stripProfPrefix,
  TYPE_COPY,
  esc,
  formatTitle,
  renderCover,
  renderProductPage,
  coverCacheKey,
  OUT_DIR
};
