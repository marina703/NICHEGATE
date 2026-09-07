// ═══════════════════════════════════════════════════════════════════════════
// FILE FACTORY — single source of truth for turning a product row into a real
// downloadable file. Used by: product creation, on-demand export, and the
// publish flow (so a listing is NEVER created without a file attached).
// ═══════════════════════════════════════════════════════════════════════════

const pdfGen = require('./pdfGenerator');
const xlsxGen = require('./xlsxGenerator');
const zipGen = require('./zipGenerator');
const { db } = require('../database');

// ── WEBSITE TEMPLATE ──
function buildWebsiteHTML(prof, theme) {
  const services = JSON.parse(prof.services || '[]');
  const hashtags = JSON.parse(prof.hashtags || '[]');
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${prof.name}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:${theme.font}}
body{background:${theme.bg};color:${theme.primary};line-height:1.6}
.hero{background:${theme.primary};color:white;padding:100px 20px;text-align:center}
.hero h1{font-size:2.5rem;margin-bottom:16px}
.hero p{font-size:1.1rem;opacity:0.9;max-width:600px;margin:0 auto}
.cta{display:inline-block;background:${theme.accent};color:${theme.primary};padding:14px 32px;border-radius:50px;text-decoration:none;font-weight:700;margin-top:24px}
.services{padding:60px 20px;max-width:1000px;margin:0 auto}
.services h2{text-align:center;margin-bottom:40px;font-size:1.8rem}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:20px}
.card{background:white;border:1px solid #e2e8f0;border-radius:12px;padding:24px}
.card h3{margin-bottom:8px;color:${theme.secondary}}
.card .price{font-size:1.3rem;font-weight:700;color:${theme.accent};margin-top:12px}
.footer{background:${theme.primary};color:white;text-align:center;padding:40px 20px;margin-top:60px}
.footer a{color:${theme.accent};text-decoration:none}
</style></head><body>
<section class="hero"><h1>${prof.emoji} ${prof.name}</h1><p>Professional services you can trust. Quality work, fair prices, reliable scheduling.</p><a href="#contact" class="cta">Book Now</a></section>
<section class="services"><h2>Our Services</h2><div class="grid">
${services.map(s=>`<div class="card"><h3>${s[0]}</h3><p>Starting at</p><div class="price">${s[1]}</div></div>`).join('')}
</div></section>
<section class="footer" id="contact"><h2>Get In Touch</h2><p>📧 hello@${prof.slug}.com | 📱 (555) 123-4567</p><p style="margin-top:12px;opacity:0.7;font-size:0.85rem">${hashtags.slice(0,5).join(' ')}</p></section>
</body></html>`;
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
  // Try the profession's seeded colors so exports still look on-brand
  const prof = db.prepare('SELECT * FROM professions WHERE id = ?').get(product.profession_id);
  let colors = {};
  try { colors = JSON.parse(prof?.colors || '{}'); } catch {}
  return {
    name: product.theme || 'Auto Theme',
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
  } else if (type === 'website') {
    filePath = await pdfGen.generatePDF(hasRealHtml ? product.html_content : buildWebsiteHTML(prof, theme), `${prof.slug}-website-${stamp}.pdf`);
  } else if (['spreadsheet', 'booking', 'pricing', 'inventory', 'shot-chart'].includes(type)) {
    filePath = xlsxGen.generateXLSX(type === 'pricing' ? 'spreadsheet' : type, prof, `${prof.slug}-${type}-${stamp}.xlsx`);
  } else if (type === 'social') {
    filePath = zipGen.createSocialPack(prof, theme);
  }
  if (filePath) {
    db.prepare('UPDATE products SET file_path = ? WHERE id = ?').run(filePath, product.id);
    product.file_path = filePath;
  }
  return filePath;
}

module.exports = {
  ensureProductFile,
  buildWebsiteHTML,
  getRecoveryPrompts,
  SERENITY_PRAYER_PROMPT
};
