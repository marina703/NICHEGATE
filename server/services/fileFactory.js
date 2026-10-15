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
const demandSignals = require('./demandSignals');

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
// The theme is the SKIN layer: when the product carries a generated design
// brief (artDirector), its palette/fonts/motif override theme defaults here —
// every builder consumes this, so briefs flow everywhere without touching any
// builder. No brief → exactly the old deterministic behavior.
function fallbackTheme(product) {
  let theme = null;
  // Prefer explicit product theme from the design engine library
  try {
    const design = require('./themes');
    if (product.theme && product.theme !== 'Auto Theme') {
      const named = design.getTheme(product.theme);
      if (named && named.name === product.theme) theme = named;
    }
    if (!theme) {
      const prof = db.prepare('SELECT * FROM professions WHERE id = ?').get(product.profession_id);
      if (prof) {
        // Real marketplace demand (harvested earlier in the publish path) biases
        // the palette/vibe toward what shoppers in this niche actually buy.
        const demandTags = demandSignals.getCachedDemandTags(prof.name);
        const recommended = design.recommendTheme(prof, demandTags);
        const t = design.getTheme(recommended);
        theme = t || design.paletteForNiche(prof, demandTags);
      }
    }
  } catch (e) { /* fall through to colors */ }

  if (!theme) {
    let prof = null;
    try {
      if (product && product.profession_id != null) {
        prof = db.prepare('SELECT * FROM professions WHERE id = ?').get(product.profession_id);
      }
    } catch { /* fall through to colors */ }
    let colors = {};
    try { colors = JSON.parse(prof?.colors || '{}'); } catch {}
    theme = {
      name: product.theme || 'Onyx Volt',
      font: "'Space Grotesk','Inter',system-ui,sans-serif",
      primary: colors.primary || '#0f172a',
      secondary: colors.secondary || '#2dd4bf',
      accent: colors.accent || '#2dd4bf',
      bg: colors.bg || '#ffffff'
    };
  }

  // Design-brief override layer (Phase 2). Never throws; no brief = no-op.
  try {
    if (product.design_brief) {
      const artDirector = require('./artDirector');
      const brief = typeof product.design_brief === 'string' ? JSON.parse(product.design_brief) : product.design_brief;
      if (brief && brief.palette) theme = artDirector.applyBriefToTheme(theme, brief);
    }
  } catch (e) { /* brief layer is best-effort */ }
  return theme;
}

// True when the design-critic auto-hook may run: AI on and NOT under the test
// runner (the suite stays hermetic/offline — NODE_TEST_CONTEXT is set by
// node --test in every test process).
function autoCritiqueAllowed() {
  try {
    return require('./modelConfig').enabled && !process.env.NODE_TEST_CONTEXT;
  } catch {
    return false;
  }
}

// BRIEF-BY-DEFAULT (Phase 2): every build is born with design DNA — a
// generated brief when the AI layer is on, a deterministic synthesis (rotated
// layout, niche motif, curated font pairing) when off. Zero cost + fully
// offline in the deterministic path; never throws (no brief = old theme
// behavior). Skipped when the product already carries a brief (cost control).
async function ensureBuildBrief(product, prof) {
  if (!product || !prof) return null;
  if (product.design_brief) {
    try { return JSON.parse(product.design_brief); } catch { /* regenerate below */ }
  }
  try {
    return await require('./artDirector').ensureDesignBrief(product, prof);
  } catch {
    return null; // deterministic theme path still renders
  }
}


// ── ENSURE FILE — generates the product's file if missing, returns path or null ──
async function ensureProductFile(product) {
  if (product.file_path && require('fs').existsSync(product.file_path)) return product.file_path;

  const prof = db.prepare('SELECT * FROM professions WHERE id = ?').get(product.profession_id);
  if (!prof) return null;
  // BRIEF-BY-DEFAULT: every build gets a design brief (skin) once — generated
  // when the AI layer is on, synthesized deterministically when off.
  await ensureBuildBrief(product, prof);
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
  } else if (type === 'recovery-journal') {
    filePath = await pdfGen.generatePDF(hasRealHtml ? product.html_content : pdfGen.buildRecoveryJournalHTML(prof, theme, getRecoveryPrompts(prof)), `${prof.slug}-recovery-journal-${stamp}.pdf`);
  } else if (type === 'affirmation-labels') {
    filePath = await pdfGen.generatePDF(hasRealHtml ? product.html_content : pdfGen.buildAffirmationLabelsHTML(prof, theme), `${prof.slug}-affirmation-labels-${stamp}.pdf`);
  } else if (type === 'recovery-nutrition') {
    filePath = await pdfGen.generatePDF(hasRealHtml ? product.html_content : pdfGen.buildRecoveryNutritionHTML(prof, theme), `${prof.slug}-recovery-nutrition-${stamp}.pdf`);
  } else if (type === 'meeting-flashcards') {
    filePath = await pdfGen.generatePDF(hasRealHtml ? product.html_content : pdfGen.buildMeetingFlashcardsHTML(prof, theme), `${prof.slug}-meeting-flashcards-${stamp}.pdf`);
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
  } else if (type === 'playbook') {
    filePath = await pdfGen.generatePDF(hasRealHtml ? product.html_content : ds.buildPlaybookHTML(prof, theme, {}), `${prof.slug}-playbook-${stamp}.pdf`);
  } else if (type === 'pricing-bible') {
    filePath = await pdfGen.generatePDF(hasRealHtml ? product.html_content : ds.buildPricingBibleHTML(prof, theme, {}), `${prof.slug}-pricing-bible-${stamp}.pdf`);
  } else if (type === 'seasonal-calendar') {
    filePath = await pdfGen.generatePDF(hasRealHtml ? product.html_content : pdfGen.buildPlannerHTML(prof, theme), `${prof.slug}-seasonal-calendar-${stamp}.pdf`);
  } else if (['sop-package', 'compliance-checklist', 'equipment-guide', 'certification-guide', 'first-year-roadmap', 'email-scripts', 'client-emails', 'prompt-library'].includes(type)) {
    filePath = await pdfGen.generatePDF(hasRealHtml ? product.html_content : pdfGen.buildChecklistHTML(prof, theme), `${prof.slug}-${type}-${stamp}.pdf`);
  } else if (['client-onboarding', 'business-in-a-box', 'marketing-kit'].includes(type)) {
    filePath = await zipGen.createSocialPack(prof, theme);
  } else if (type === 'interactive-tool') {
    const webToolGen = require('./webToolGenerator');
    filePath = webToolGen.generateWebToolFile(prof, { title: product.name, theme }, `${prof.slug}-interactive-tool-${stamp}.html`);
  } else if (['spreadsheet', 'booking', 'pricing', 'profit-calculator', 'inventory', 'shot-chart'].includes(type)) {
    filePath = xlsxGen.generateXLSX((type === 'pricing' || type === 'profit-calculator') ? 'spreadsheet' : type, prof, `${prof.slug}-${type}-${stamp}.xlsx`);
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
const COVER_VERSION = 'cover-v11';
fs.mkdirSync(PREVIEW_DIR, { recursive: true });

function isCurrentCoverPath(previewPath) {
  return !!previewPath && path.basename(previewPath).includes(`-${COVER_VERSION}-`);
}

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

// Pick the most representative HTML source for this product.
// `theme` is optional — pass a pre-built (e.g. brief-applied) theme to render
// under a candidate skin; omitted → the product's own theme + brief.
function buildPreviewHTML(product, prof, theme) {
  if (!theme) theme = fallbackTheme(product);
  const raw = String(product.html_content || '').trim();
  const hasRealHtml = raw && !['<!-- auto-generated -->', '<!-- bundle -->', '<!-- leadmagnet -->'].includes(raw) && raw.length > 40;
  if (hasRealHtml) return product.html_content;
  const t = product.type;
  if (t === 'invoice') return pdfGen.buildInvoiceHTML(prof, theme);
  if (t === 'checklist') return pdfGen.buildChecklistHTML(prof, theme);
  if (t === 'journal') return pdfGen.buildJournalHTML(prof, theme, getRecoveryPrompts(prof));
  if (t === 'recovery-journal') return pdfGen.buildRecoveryJournalHTML(prof, theme, getRecoveryPrompts(prof));
  if (t === 'affirmation-labels') return pdfGen.buildAffirmationLabelsHTML(prof, theme);
  if (t === 'recovery-nutrition') return pdfGen.buildRecoveryNutritionHTML(prof, theme);
  if (t === 'meeting-flashcards') return pdfGen.buildMeetingFlashcardsHTML(prof, theme);
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
  if (t === 'playbook') return ds.buildPlaybookHTML(prof, theme, {});
  if (t === 'pricing-bible') return ds.buildPricingBibleHTML(prof, theme, {});
  if (t === 'seasonal-calendar') return pdfGen.buildPlannerHTML(prof, theme);
  if (t === 'interactive-tool') {
    return require('./webToolGenerator').buildInteractiveWebToolHTML({
      title: product.name || `${prof.name} Interactive Profit & Pricing Tool`,
      nicheName: prof.name
    }, theme);
  }
  if (['sop-package', 'compliance-checklist', 'equipment-guide', 'certification-guide', 'first-year-roadmap', 'email-scripts', 'client-emails', 'prompt-library'].includes(t)) {
    return pdfGen.buildChecklistHTML(prof, theme);
  }
  if (['bundle', 'leadmagnet', 'client-onboarding', 'business-in-a-box'].includes(t)) {
    return ds.buildCoverHTML(product, prof, theme, t === 'leadmagnet' ? 'leadmagnet' : 'bundle');
  }
  if (t === 'marketing-kit') return zipGen.buildSocialPostHTML(prof, theme);
  if (['spreadsheet', 'pricing', 'profit-calculator'].includes(t)) return ds.buildPricingSheetPreviewHTML(product, prof, theme);
  if (['booking', 'inventory', 'shot-chart'].includes(t)) {
    return ds.buildTablePreviewHTML(product, prof, theme, t === 'booking' ? 'booking' : 'spreadsheet');
  }
  return buildFallbackCardHTML(product, prof);
}

// The cover master is 2:3 (1200×1800); marketplace thumbnails are a centered
// 4:5 crop (1200×1500). Preserve the uncropped master alongside the export so
// Pinterest can use the full-frame image without changing marketplace files.
const COVER_EXPORT = Object.freeze({
  master: Object.freeze({ width: 1200, height: 1800 }),
  crop: Object.freeze({ x: 0, y: 150, width: 1200, height: 1500 })
});

async function renderCoverImage(html, outPath) {
  const browser = await pdfGen.getBrowser();
  if (!browser) return null;
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: COVER_EXPORT.master.width, height: COVER_EXPORT.master.height, deviceScaleFactor: 1 });
    if (typeof page.setRequestInterception === 'function') {
      await page.setRequestInterception(true);
      page.on('request', request => {
        const url = request.url();
        if (url.startsWith('data:') || url === 'about:blank') request.continue();
        else request.abort();
      });
    }
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    // Content-forward covers render the real product pages inside sandboxed
    // srcdoc iframes. Wait for every iframe to fire its load event (bounded),
    // then a short settle buffer, so the fanned stack is fully painted before
    // the screenshot instead of catching blank cards.
    try {
      await page.evaluate(() => new Promise((resolve) => {
        const frames = Array.from(document.querySelectorAll('iframe'));
        if (!frames.length) return resolve();
        let left = frames.length;
        const done = () => { if (--left <= 0) resolve(); };
        const timer = setTimeout(resolve, 6000); // hard cap — never block forever
        frames.forEach((f) => {
          if (f.contentWindow && f.contentWindow.document && f.contentWindow.document.readyState === 'complete') return done();
          f.addEventListener('load', done, { once: true });
          f.addEventListener('error', done, { once: true });
        });
        void timer; // the cap stays armed; firing after resolve is a harmless no-op
      }));
    } catch (e) { /* iframe wait is best-effort */ }
    await new Promise(r => setTimeout(r, 500));
    const masterPath = outPath.replace(/\.jpg$/i, '.master.jpg');
    await page.screenshot({ path: masterPath, type: 'jpeg', quality: 90, clip: { x: 0, y: 0, ...COVER_EXPORT.master } });
    await page.screenshot({ path: outPath, type: 'jpeg', quality: 90, clip: COVER_EXPORT.crop });
    return fs.existsSync(outPath) && fs.existsSync(masterPath) ? outPath : null;
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
    if (typeof page.setRequestInterception === 'function') {
      await page.setRequestInterception(true);
      page.on('request', request => {
        const url = request.url();
        if (url.startsWith('data:') || url === 'about:blank') request.continue();
        else request.abort();
      });
    }
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

async function renderProductCoverPreview(productHtml, title, focusY = 0) {
  const browser = await pdfGen.getBrowser();
  if (!browser) return null;
  const page = await browser.newPage();
  try {
    // Render at 800x1040 (matches the .page max-width of 794px) so the document
    // fills the tablet screen edge-to-edge without side margins.
    await page.setViewport({ width: 800, height: 1040, deviceScaleFactor: 1 });
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = request.url();
      if (url.startsWith('data:') || url === 'about:blank') request.continue();
      else request.abort();
    });
    await page.setContent(String(productHtml || ''), { waitUntil: 'domcontentloaded', timeout: 10000 });
    await new Promise(resolve => setTimeout(resolve, 250));
    const image = await page.screenshot({ type: 'jpeg', quality: 88, clip: { x: 0, y: Math.max(0, focusY), width: 800, height: 1040 } });
    return `data:image/jpeg;base64,${Buffer.from(image).toString('base64')}`;
  } catch (e) {
    console.error(`[THUMB] product preview raster failed (${String(title || '').slice(0, 60)}):`, e.message);
    return null;
  } finally {
    await page.close().catch(() => {});
  }
}

// Adaptive slot detection: rasterize the art image on a canvas, build a
// downsampled luminance map, and find the photo's blank tablet screen. The
// returned rect is in full 1200x1800 art coordinates (or null when detection
// fails — the composite then keeps its fixed safe slot).
async function detectArtScreenSlot(artDataUri, coverArt) {
  if (!artDataUri || !coverArt || typeof coverArt.detectWhiteRect !== 'function') return null;
  const pdfGen = require('./pdfGenerator');
  const browser = await pdfGen.getBrowser();
  if (!browser) return null;
  const page = await browser.newPage();
  try {
    // Scan at 200x300 with step=2 (12px grid on 1200x1800) so the detected slot
    // snaps accurately to the physical white screen edges inside the bezel.
    const SW = 200, SH = 300;
    const map = await page.evaluate(async (src, SW, SH) => {
      const img = new Image();
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = src; });
      const canvas = document.createElement('canvas');
      canvas.width = SW; canvas.height = SH;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, SW, SH);
      const data = ctx.getImageData(0, 0, SW, SH).data;
      const map = new Array(SW * SH);
      for (let i = 0, p = 0; p < map.length; i += 4, p++) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const luma = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        const chroma = Math.max(r, g, b) - Math.min(r, g, b);
        // Penalize colorful props (tape, wood, brass) so only neutral matte-white
        // tablet screens register as high-luminance candidates.
        map[p] = Math.max(0, luma - Math.max(0, chroma - 20) * 2);
      }
      return map;
    }, artDataUri, SW, SH);
    const rect = coverArt.detectWhiteRect(map, SW, SH, { step: 2 });
    if (!rect) return null;
    const sx = 1200 / SW, sy = 1800 / SH;
    const rawX = Math.round(rect.x * sx), rawY = Math.round(rect.y * sy);
    const rawW = Math.round(rect.width * sx), rawH = Math.round(rect.height * sy);
    // Subtle 4px inset so the screen's own thin dark inner border stays visible.
    const padX = 4, padY = 4;
    return {
      x: rawX + padX, y: rawY + padY,
      width: Math.max(140, rawW - padX * 2), height: Math.max(180, rawH - padY * 2),
      adaptive: true
    };
  } catch (e) {
    console.error('[THUMB] screen-slot detection failed:', e.message);
    return null;
  } finally {
    await page.close().catch(() => {});
  }
}

// ── COVER QA MANIFEST ────────────────────────────────────────────────────────
// Structural provenance for one rendered cover, written next to the 2:3 master.
// The cover QA gate reads this instead of re-deriving layout math, so the gate
// and the renderer can never disagree about where the page was placed.
function coverMasterPath(coverPath) {
  return String(coverPath || '').replace(/\.jpg$/i, '.master.jpg');
}

function coverManifestPath(coverPath) {
  return `${coverMasterPath(coverPath)}.qa.json`;
}

/** Pull the geometry the renderer emitted on `.ts-hero`. */
function parseCoverGeometry(html) {
  const tag = String(html || '').match(/<div class="ts-hero"[^>]*>/);
  if (!tag) return null;
  const num = (name) => {
    const m = tag[0].match(new RegExp(`data-${name}="(-?\\d+(?:\\.\\d+)?)"`));
    return m ? Number(m[1]) : null;
  };
  const geometry = {
    adaptive: num('adaptive') === 1,
    slot: { x: num('slot-x'), y: num('slot-y'), width: num('slot-width'), height: num('slot-height') },
    screen: { x: num('screen-x'), y: num('screen-y'), width: num('screen-width'), height: num('screen-height') },
    labelHeight: num('label-height'),
    previewScale: Number.isFinite(num('preview-scale')) ? num('preview-scale') : 1,
    deviceRotate: Number.isFinite(num('device-rotate')) ? num('device-rotate') : 0
  };
  const complete = geometry.slot.width != null && geometry.screen.width != null && geometry.labelHeight != null;
  return complete ? geometry : null;
}

function writeCoverManifest(coverPath, { product, prof, html, hadArt }) {
  if (!coverPath || !fs.existsSync(coverMasterPath(coverPath))) return null;
  const geometry = parseCoverGeometry(html);
  if (!geometry) return null;
  const manifest = {
    productId: product.id,
    professionSlug: (prof && prof.slug) || null,
    type: product.type || null,
    coverVersion: COVER_VERSION,
    renderedAt: new Date().toISOString(),
    hadArt: !!hadArt,
    ...geometry
  };
  try {
    fs.writeFileSync(coverManifestPath(coverPath), JSON.stringify(manifest));
    return manifest;
  } catch (e) {
    console.error('[THUMB] cover manifest write:', e.message);
    return null;
  }
}

function readCoverManifest(coverPath) {
  try {
    const raw = fs.readFileSync(coverManifestPath(coverPath), 'utf8');
    return JSON.parse(raw);
  } catch { return null; }
}

/** Re-derive this product's page raster from its own design/brief. Used by the
 *  QA gate to prove the cover actually shows THIS product's page — independent
 *  of whatever the render happened to composite. */
async function productPageRaster(product) {
  if (!product || product.id == null) return null;
  const prof = db.prepare('SELECT * FROM professions WHERE id = ?').get(product.profession_id);
  if (!prof) return null;
  await ensureBuildBrief(product, prof);
  const theme = fallbackTheme(product);
  const html = buildPreviewHTML(product, prof, theme);
  if (!html) return null;
  const focusY = ['playbook', 'pricing-bible'].includes(String(product.type || '').toLowerCase()) ? 300 : 0;
  const title = ds.thumbCoverCopy(product, prof)[0];
  return renderProductCoverPreview(html, title, focusY);
}

// Ensure a product has a raster preview — cached on disk + in DB; returns path or null
async function ensureProductThumbnail(product, opts = {}) {
  if (!opts.force && product.preview_path && fs.existsSync(product.preview_path) && isCurrentCoverPath(product.preview_path)) return product.preview_path;
  const prof = db.prepare('SELECT * FROM professions WHERE id = ?').get(product.profession_id);
  if (!prof) return null;
  // Brief hook (same rules as ensureProductFile — brief-by-default).
  await ensureBuildBrief(product, prof);
  const theme = fallbackTheme(product);
  let productHtml = buildPreviewHTML(product, prof, theme);
  if (!productHtml) return null;
  // The REAL multi-page product HTML — the content-forward cover fans several
  // of these pages, so it needs the document, not the single-page raster.
  const realProductHtml = productHtml;
  const copy = ds.thumbCoverCopy(product, prof);
  // playbook / pricing-bible open with a 1123px designed cover page whose headline
  // sits in its lower half, but the preview box is ~1.7:1 landscape and shows only
  // the top ~44% of this raster — start 300px lower so the product headline is inside
  // the visible band instead of an apparently empty screen.
  const focusY = ['playbook', 'pricing-bible'].includes(String(product.type || '').toLowerCase()) ? 300 : 0;
  const realPreview = await renderProductCoverPreview(productHtml, copy[0], focusY);
  if (realPreview) productHtml = realPreview;
  let html = productHtml;
  let hadArt = false;
  // CONTENT-FORWARD is the default: the real product pages ARE the hero (a
  // fanned stack on a clean themed background), matching the planner-marketplace
  // / device-mockup reference style. It is deterministic and needs no AI art.
  // The old AI-lifestyle composite (photo scene + tiny thumbnail) is kept only
  // as an explicit opt-in (opts.coverStyle === 'lifestyle') for the rare type
  // where a physical-feel scene genuinely helps.
  const wantLifestyle = String(opts.coverStyle || '').toLowerCase() === 'lifestyle';
  try {
    if (!wantLifestyle && typeof ds.buildContentForwardCover === 'function') {
      // productHtml is now the cover-page raster (data:image) — the same raster
      // the QA gate re-derives, so the hero card correlates on the publish gate.
      html = ds.buildContentForwardCover(product, prof, theme, realProductHtml, copy, productHtml);
    } else {
      // v3: AI lifestyle photo + typography composite (falls back to the plain
      // HTML cover when the free image tier is unavailable — never blocks).
      let artDataUri = null;
      try {
        const coverArt = require('./coverArt');
        const artPath = await coverArt.ensureCoverArt(product, prof, theme, { fresh: opts.freshArt || opts.freshArtRevision === true, forceNew: opts.freshArtRevision === true });
        if (artPath && fs.existsSync(artPath)) {
          artDataUri = coverArt.imageDataUri(fs.readFileSync(artPath));
        }
      } catch (e) {
        console.error('[THUMB] cover art fetch:', e.message);
      }
      hadArt = !!artDataUri;
      if (typeof ds.buildThumbStopperCover === 'function') {
        let slot = null;
        if (artDataUri) {
          try { slot = await detectArtScreenSlot(artDataUri, require('./coverArt')); } catch (e) { console.error('[THUMB] slot detect:', e.message); }
          if (!slot) console.warn('[THUMB] no tablet screen detected in the art — using the fixed slot (page will float over the photo)');
        } else {
          console.warn('[THUMB] no cover art available — compositing the product page on the niche accent background');
        }
        html = ds.buildThumbStopperCover(product, prof, theme, artDataUri, productHtml, copy, slot);
      } else if (typeof ds.buildPlainCover === 'function') {
        html = ds.buildPlainCover(product, prof, theme, productHtml);
      }
    }
  } catch (e) {
    console.error('[THUMB] cover build:', e.message);
  }
  const outPath = path.join(PREVIEW_DIR, `${prof.slug}-${product.type}-${product.id}-${COVER_VERSION}-${Date.now()}.jpg`);
  // Marketplace JPEG is a centered 1200x1500 crop; renderCoverImage also retains its 1200x1800 master.
  const isCover = typeof ds.buildThumbStopperCover === 'function';
  const result = isCover
    ? await renderCoverImage(html, outPath)
    : await renderPreviewImage(html, outPath);
  if (!result) return null;
  if (isCover) writeCoverManifest(result, { product, prof, html, hadArt });
  try {
    db.prepare('UPDATE products SET preview_path = ? WHERE id = ?').run(result, product.id);
    product.preview_path = result;
  } catch (e) {
    console.error('[THUMB] db update:', e.message);
  }
  // Phase 1: every AI-enabled build gets a design critique (fire-and-forget —
  // never blocks or fails the build; skipped in tests and when AI is off).
  if (result && !opts.skipDesignCritique && autoCritiqueAllowed()) {
    try {
      require('./designCritic').critiqueProduct(product.id, { force: false }).catch(() => {});
    } catch { /* critique is best-effort */ }
  }
  return result;
}


module.exports = {
  ensureProductFile,
  ensureProductThumbnail,
  isCurrentCoverPath,
  COVER_EXPORT,
  renderCoverImage,
  renderProductCoverPreview,
  buildWebsiteHTML,
  buildPreviewHTML,
  fallbackTheme,
  ensureBuildBrief,
  autoCritiqueAllowed,
  getRecoveryPrompts,
  SERENITY_PRAYER_PROMPT,
  productPageRaster,
  coverMasterPath,
  coverManifestPath,
  readCoverManifest,
  parseCoverGeometry
};
