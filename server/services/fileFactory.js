// ═══════════════════════════════════════════════════════════════════════════
// FILE FACTORY — single source of truth for turning a product row into a real
// downloadable file. Used by: product creation, on-demand export, and the
// publish flow (so a listing is NEVER created without a file attached).
// ═══════════════════════════════════════════════════════════════════════════

const pdfGen = require('./pdfGenerator');
const xlsxGen = require('./xlsxGenerator');
const zipGen = require('./zipGenerator');
const ds = require('./designStudio');
const fs = require('fs');
const path = require('path');
const { db } = require('../database');
const runtimeConfig = require('./runtimeConfig');

// ── WEBSITE TEMPLATE (premium, via Design Studio) ──
function buildWebsiteHTML(prof, theme) {
  return ds.buildWebsiteHTML(prof, theme);
}

// ── RECOVERY PROMPTS (30-day journals; Serenity Prayer every 5th day = 20%) ──
const SERENITY_PRAYER_PROMPT =
  'The Serenity Prayer — "God, grant me the serenity to accept the things I cannot change, courage to change the things I can, and wisdom to know the difference." ' +
  'What can I not change today? Where do I need courage? What wisdom am I asking for?';

function getRecoveryPrompts(prof) {
  const prompts = {
    'aa-recovery': [
      ['What am I grateful for today?', 'What happened today that I need to make amends for?', 'How did I practice acceptance?', 'One thing I learned about myself', 'My intention for tomorrow'],
      ['What fear did I face today?', 'How was I useful to someone?', 'What character defect showed up?', 'What spiritual principle did I practice?', 'What do I need to let go of?']
    ],
    'smart-recovery': [
      ['A - Activating Event (What happened?)', 'B - Beliefs (What am I telling myself?)', 'C - Consequences (How do I feel?)', 'D - Dispute (Is this thought accurate?)', 'E - Effective New Belief (What\'s a healthier thought?)'],
      ['What urges did I experience?', 'How did I cope using SMART tools?', 'What was my cost-benefit today?', 'What values did I honor?', 'What is my change plan goal for tomorrow?']
    ],
    'refuge-recovery': [
      ['What suffering did I notice today?', 'How did I practice meditation?', 'What dharma teaching resonated?', 'How was I mindful in a difficult moment?', 'What refuge did I take?'],
      ['What did I investigate?', 'What was my breath like in a calm moment?', 'How did I cultivate generosity?', 'What is my daily practice commitment?', 'What am I letting go of?']
    ],
    'womens-recovery': [
      ['Which of the 13 Statements did I practice?', 'What affirmation do I need today?', 'How did I practice emotional growth?', 'What built my self-esteem?', 'How did I celebrate a milestone?'],
      ['What did I love about myself today?', 'How did I handle a problem positively?', 'What new behavior did I try?', 'How did I care for my body?', 'What is my personal affirmation?']
    ],
    'secular-recovery': [
      ['What is my priority today?', 'How did I practice sobriety?', 'What sober activity did I enjoy?', 'How did I connect with community?', 'What is my weekly check-in focus?'],
      ['What empowers me?', 'How did I use my personal recovery plan?', 'What was I present for?', 'What goal did I set?', 'How did I stay accountable?']
    ],
    'faith-recovery': [
      ['Read 1 Corinthians 10:13 — What temptation am I facing, and what escape has God provided?', 'Read Philippians 4:13 — What does strength in Christ look like for me today?', 'Read Psalm 34:18 — Where has God been close to me in my brokenness?', 'Read 2 Corinthians 12:9 — How is God\'s grace sufficient in my weakness today?', 'What scripture will I carry into tomorrow, and why?'],
      ['Read Isaiah 41:10 — What fear do I need to release? God says He will strengthen me.', 'Read Matthew 11:28 — What burden am I ready to surrender today?', 'Read Lamentations 3:22-23 — What new mercy did I wake up to this morning?', 'Read Romans 8:28 — How is God working in my recovery right now, even in the hard parts?', 'Write my favorite verse from today and what it means to my recovery.']
    ]
  };

  const base = prompts[prof.slug] || [
    ['What am I grateful for today?', 'What challenged me?', 'How did I grow?', 'What do I hope for tomorrow?', 'One word to describe today'],
    ['What did I learn?', 'Who did I connect with?', 'What am I proud of?', 'What needs attention?', 'My commitment to myself']
  ];

  const days = [];
  for (let i = 0; i < 30; i++) {
    const day = [...base[i % base.length]];
    if (i % 5 === 4) day[0] = SERENITY_PRAYER_PROMPT;
    days.push(day);
  }
  return days;
}

// ── THEME FALLBACK ──
function fallbackTheme(product) {
  // Prefer explicit product theme from the design engine library
  try {
    const design = require('./themes');
    if (product.theme && product.theme !== 'Auto Theme') {
      const named = design.getTheme(product.theme);
      if (named && named.name === product.theme) return named;
    }
    const prof = db.prepare('SELECT * FROM professions WHERE id = ?').get(product.profession_id);
    if (prof) {
      const recommended = design.recommendTheme(prof);
      const t = design.getTheme(recommended);
      if (t) return t;
      return design.paletteForNiche(prof);
    }
  } catch (e) { /* fall through to colors */ }

  const prof = db.prepare('SELECT * FROM professions WHERE id = ?').get(product.profession_id);
  let colors = {};
  try { colors = JSON.parse(prof?.colors || '{}'); } catch {}
  return {
    name: product.theme || 'Onyx Volt',
    font: "'Space Grotesk','Inter',system-ui,sans-serif",
    primary: colors.primary || '#0f172a',
    secondary: colors.secondary || '#2dd4bf',
    accent: colors.accent || '#2dd4bf',
    bg: colors.bg || '#ffffff'
  };
}


// ── ENSURE FILE — generates the product's file if missing, returns path or null ──
async function ensureProductFile(product) {
  if (product.file_path && require('fs').existsSync(product.file_path)) return product.file_path;

  const prof = db.prepare('SELECT * FROM professions WHERE id = ?').get(product.profession_id);
  if (!prof) return null;
  const theme = fallbackTheme(product);
  const type = product.type;
  const stamp = Date.now();
  const hasRealHtml = product.html_content && product.html_content !== '<!-- auto-generated -->';

  let filePath = null;
  if (type === 'invoice') {
    filePath = await pdfGen.generatePDF(hasRealHtml ? product.html_content : pdfGen.buildInvoiceHTML(prof, theme), `${prof.slug}-invoice-${stamp}.pdf`);
  } else if (type === 'checklist') {
    filePath = await pdfGen.generatePDF(hasRealHtml ? product.html_content : pdfGen.buildChecklistHTML(prof, theme), `${prof.slug}-checklist-${stamp}.pdf`);
  } else if (type === 'journal') {
    filePath = await pdfGen.generatePDF(hasRealHtml ? product.html_content : pdfGen.buildJournalHTML(prof, theme, getRecoveryPrompts(prof)), `${prof.slug}-journal-${stamp}.pdf`);
  } else if (type === 'brand') {
    filePath = await pdfGen.generatePDF(hasRealHtml ? product.html_content : pdfGen.buildBrandKitHTML(prof, theme), `${prof.slug}-brand-kit-${stamp}.pdf`);
  } else if (type === 'decision-matrix') {
    filePath = await pdfGen.generatePDF(hasRealHtml ? product.html_content : ds.buildDecisionMatrixHTML(product, prof, theme), `${prof.slug}-decision-matrix-${stamp}.pdf`);
  } else if (type === 'roi') {
    filePath = await pdfGen.generatePDF(hasRealHtml ? product.html_content : ds.buildROIHTML(product, prof, theme), `${prof.slug}-roi-${stamp}.pdf`);
  } else if (type === 'website') {
    filePath = await pdfGen.generatePDF(hasRealHtml ? product.html_content : buildWebsiteHTML(prof, theme), `${prof.slug}-website-${stamp}.pdf`);
  } else if (type === 'tool') {
    filePath = await pdfGen.generatePDF(hasRealHtml ? product.html_content : buildFallbackCardHTML(product, prof), `${prof.slug}-tool-${stamp}.pdf`);
  } else if (type === 'planner') {
    filePath = await pdfGen.generatePDF(hasRealHtml ? product.html_content : pdfGen.buildPlannerHTML(prof, theme), `${prof.slug}-planner-${stamp}.pdf`);
  } else if (type === 'wall-art') {
    filePath = await pdfGen.generatePDF(hasRealHtml ? product.html_content : pdfGen.buildWallArtHTML(prof, theme), `${prof.slug}-wall-art-${stamp}.pdf`);
  } else if (type === 'worksheet') {
    filePath = await pdfGen.generatePDF(hasRealHtml ? product.html_content : pdfGen.buildWorksheetHTML(prof, theme), `${prof.slug}-worksheet-${stamp}.pdf`);
  } else if (type === 'party-printable') {
    filePath = await pdfGen.generatePDF(hasRealHtml ? product.html_content : pdfGen.buildPartyPrintableHTML(prof, theme), `${prof.slug}-party-printable-${stamp}.pdf`);
  } else if (type === 'pyro-batch') {
    filePath = await pdfGen.generatePDF(pdfGen.buildPyroBatchHTML(prof, theme), `${prof.slug}-pyro-batch-${stamp}.pdf`);
  } else if (type === 'pyro-lift-fuse') {
    filePath = await pdfGen.generatePDF(pdfGen.buildPyroLiftFuseHTML(prof, theme), `${prof.slug}-pyro-lift-fuse-${stamp}.pdf`);
  } else if (type === 'pyro-shoot-log') {
    filePath = await pdfGen.generatePDF(pdfGen.buildPyroShootLogHTML(prof, theme), `${prof.slug}-pyro-shoot-log-${stamp}.pdf`);
  } else if (['spreadsheet', 'booking', 'pricing', 'inventory', 'shot-chart'].includes(type)) {
    filePath = xlsxGen.generateXLSX(type === 'pricing' ? 'spreadsheet' : type, prof, `${prof.slug}-${type}-${stamp}.xlsx`);
  } else if (type === 'social') {
    filePath = await zipGen.createSocialPack(prof, theme);
  }
  if (filePath) {
    db.prepare('UPDATE products SET file_path = ? WHERE id = ?').run(filePath, product.id);
    product.file_path = filePath;
  }
  return filePath;
}

// ═══════════════════════════════════════════════════════════════════════════
// THUMBNAIL FACTORY — renders any product as a crisp raster preview (JPEG)
// so review queues and preview pages show real visual mockups, not just names.
// Reuses the same cached Chrome instance as the PDF generator.
// ═══════════════════════════════════════════════════════════════════════════
const PREVIEW_DIR = runtimeConfig.resolvePersistentDir('previews');
fs.mkdirSync(PREVIEW_DIR, { recursive: true });

function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function buildFallbackCardHTML(product, prof) {
  const theme = fallbackTheme(product);
  return `<!DOCTYPE html><html><head><style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:${theme.font || "'Space Grotesk','Inter',system-ui,sans-serif"};display:flex;align-items:center;justify-content:center;min-height:100vh;background:${theme.bg || '#0f172a'};}
    .card{width:900px;background:${theme.primary || '#0f172a'};border-radius:24px;padding:60px;color:white;text-align:center}
    .emoji{font-size:5rem;margin-bottom:16px}
    h1{font-size:2rem;margin-bottom:10px}
    .type{display:inline-block;background:${theme.accent || '#2dd4bf'};color:${theme.primary || '#0f172a'};padding:8px 18px;border-radius:50px;font-weight:800;text-transform:uppercase;font-size:0.8rem;letter-spacing:1px}
    .price{font-size:1.4rem;margin-top:24px;font-weight:800}
  </style></head><body>
    <div class="card"><div class="emoji">${escHtml(prof.emoji)}</div><h1>${escHtml(product.name)}</h1><div class="type">${escHtml(product.type)}</div><div class="price">${escHtml(product.price || '')}</div></div>
  </body></html>`;
}

// Pick the most representative HTML source for this product
function buildPreviewHTML(product, prof) {
  const theme = fallbackTheme(product);
  const raw = String(product.html_content || '').trim();
  const hasRealHtml = raw && !['<!-- auto-generated -->', '<!-- bundle -->', '<!-- leadmagnet -->'].includes(raw) && raw.length > 40;
  if (hasRealHtml) return product.html_content;
  const t = product.type;
  if (t === 'invoice') return pdfGen.buildInvoiceHTML(prof, theme);
  if (t === 'checklist') return pdfGen.buildChecklistHTML(prof, theme);
  if (t === 'journal') return pdfGen.buildJournalHTML(prof, theme, getRecoveryPrompts(prof));
  if (t === 'brand') return pdfGen.buildBrandKitHTML(prof, theme);
  if (t === 'website') return buildWebsiteHTML(prof, theme);
  if (t === 'social') return zipGen.buildSocialPostHTML(prof, theme);
  if (t === 'decision-matrix') return ds.buildDecisionMatrixHTML(product, prof, theme);
  if (t === 'roi') return ds.buildROIHTML(product, prof, theme);
  if (t === 'bundle' || t === 'leadmagnet') return ds.buildCoverHTML(product, prof, theme, t === 'leadmagnet' ? 'leadmagnet' : 'bundle');
  if (t === 'planner') return pdfGen.buildPlannerHTML(prof, theme);
  if (t === 'wall-art') return pdfGen.buildWallArtHTML(prof, theme);
  if (t === 'worksheet') return pdfGen.buildWorksheetHTML(prof, theme);
  if (t === 'party-printable') return pdfGen.buildPartyPrintableHTML(prof, theme);
  if (t === 'pyro-batch') return pdfGen.buildPyroBatchHTML(prof, theme);
  if (t === 'pyro-lift-fuse') return pdfGen.buildPyroLiftFuseHTML(prof, theme);
  if (t === 'pyro-shoot-log') return pdfGen.buildPyroShootLogHTML(prof, theme);
  if (['spreadsheet', 'pricing', 'booking', 'inventory', 'shot-chart'].includes(t)) {
    return ds.buildTablePreviewHTML(product, prof, theme, t === 'booking' ? 'booking' : 'spreadsheet');
  }
  return buildFallbackCardHTML(product, prof);
}

// Screenshot a 1200x1500 thumb-stopper cover → JPEG
async function renderCoverImage(html, outPath) {
  const browser = await pdfGen.getBrowser();
  if (!browser) return null;
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1200, height: 1500, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 400));
    await page.screenshot({ path: outPath, type: 'jpeg', quality: 90, clip: { x: 0, y: 0, width: 1200, height: 1500 } });
    return fs.existsSync(outPath) ? outPath : null;
  } catch (e) {
    console.error('[THUMB] cover render error:', e.message);
    return null;
  } finally {
    await page.close().catch(() => {});
  }
}

// Screenshot the HTML → JPEG thumbnail
async function renderPreviewImage(html, outPath) {
  const browser = await pdfGen.getBrowser();
  if (!browser) return null;
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1080, height: 1440, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 350)); // let fonts paint
    const h = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0));
    if (h <= 1500) {
      await page.screenshot({ path: outPath, type: 'jpeg', quality: 88, fullPage: true });
    } else {
      // Very long documents (30-day journals) — capture the top as the mockup
      await page.screenshot({ path: outPath, type: 'jpeg', quality: 88, clip: { x: 0, y: 0, width: 1080, height: 1400 } });
    }
    return fs.existsSync(outPath) ? outPath : null;
  } catch (e) {
    console.error('[THUMB] render error:', e.message);
    return null;
  } finally {
    await page.close().catch(() => {});
  }
}

// Ensure a product has a raster preview — cached on disk + in DB; returns path or null
async function ensureProductThumbnail(product) {
  if (product.preview_path && fs.existsSync(product.preview_path)) return product.preview_path;
  const prof = db.prepare('SELECT * FROM professions WHERE id = ?').get(product.profession_id);
  if (!prof) return null;
  let html = buildPreviewHTML(product, prof);
  if (!html) return null;
  // v3: AI lifestyle photo + typography composite (falls back to the plain
  // HTML cover when the free image tier is unavailable — never blocks).
  try {
    let artDataUri = null;
    try {
      const coverArt = require('./coverArt');
      const artPath = await coverArt.ensureCoverArt(product, prof);
      if (artPath && fs.existsSync(artPath)) {
        const b64 = fs.readFileSync(artPath).toString('base64');
        artDataUri = `data:image/jpeg;base64,${b64}`;
      }
    } catch (e) {
      console.error('[THUMB] cover art fetch:', e.message);
    }
    if (artDataUri && typeof ds.buildThumbStopperCover === 'function') {
      html = ds.buildThumbStopperCover(product, prof, fallbackTheme(product), artDataUri);
    } else if (typeof ds.buildPlainCover === 'function') {
      html = ds.buildPlainCover(product, prof, fallbackTheme(product));
    }
  } catch (e) {
    console.error('[THUMB] cover build:', e.message);
  }
  const outPath = path.join(PREVIEW_DIR, `${prof.slug}-${product.type}-${product.id}-${Date.now()}.jpg`);
  // Thumb-stopper cover (v2) renders at 1200x1500 — screenshot exact size, no wrap.
  const isCover = typeof ds.buildThumbStopperCover === 'function';
  const result = isCover
    ? await renderCoverImage(html, outPath)
    : await renderPreviewImage(html, outPath);
  if (!result) return null;
  try {
    db.prepare('UPDATE products SET preview_path = ? WHERE id = ?').run(result, product.id);
    product.preview_path = result;
  } catch (e) {
    console.error('[THUMB] db update:', e.message);
  }
  return result;
}


module.exports = {
  ensureProductFile,
  ensureProductThumbnail,
  buildWebsiteHTML,
  buildPreviewHTML,
  getRecoveryPrompts,
  SERENITY_PRAYER_PROMPT
};
