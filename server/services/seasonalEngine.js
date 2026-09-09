// ═══════════════════════════════════════════════════════════════════════════
// SEASONAL ENGINE — biases generation toward demand that peaks in the current
// month so products go live BEFORE the seasonal window, not during it.
// ═══════════════════════════════════════════════════════════════════════════

const { db } = require('../database');

const SEASONAL = {
  0:  { slugs: ['aa-recovery', 'smart-recovery', 'massage-therapy', 'mobile-notary'], note: 'New year: recovery resets, wellness, tax-season notary' },
  1:  { slugs: ['wedding-photography', 'mobile-notary', 'tattoo-artist'], note: 'Engagement season + tax deadline' },
  2:  { slugs: ['native-landscaping', 'beekeeping', 'drone-surveying'], note: 'Spring: gardens, hives, aerial season opens' },
  3:  { slugs: ['mobile-notary', 'energy-auditor', 'native-landscaping'], note: 'Tax deadline + pre-summer efficiency' },
  4:  { slugs: ['fishing-guide', 'wedding-photography', 'drone-surveying'], note: 'Early summer: charters + wedding bookings' },
  5:  { slugs: ['pyrotechnics', 'fishing-guide', 'wedding-photography'], note: 'July 4th pyro peak + wedding season' },
  6:  { slugs: ['air-duct-cleaning', 'hvac', 'mold-inspector'], note: 'Peak heat: HVAC + air quality' },
  7:  { slugs: ['hvac', 'roofing', 'post-construction-cleaning'], note: 'Fall tune-ups + storm repairs' },
  8:  { slugs: ['pyrotechnics', 'tattoo-artist', 'air-duct-cleaning'], note: 'Halloween pyro + indoor season' },
  9:  { slugs: ['hvac', 'roofing', 'energy-auditor'], note: 'Winter prep + holiday shoppers' },
  10: { slugs: ['hvac', 'mobile-notary', 'massage-therapy'], note: 'Heating season + year-end documents' },
  11: { slugs: ['aa-recovery', 'smart-recovery', 'massage-therapy'], note: 'New-year prep: recovery + wellness' }
};

function getCurrentFocus() {
  const m = new Date().getMonth();
  return { month: m + 1, ...SEASONAL[m] };
}

// Resolve this month's focus to real, active professions
function getFocusProfessions() {
  const focus = getCurrentFocus();
  return focus.slugs
    .map(slug => db.prepare("SELECT * FROM professions WHERE slug = ? AND status != 'archived'").get(slug))
    .filter(Boolean);
}

// One seasonal product per cycle for a rotating focus profession
function generateSeasonalProduct() {
  const profs = getFocusProfessions();
  if (!profs.length) return null;
  const focus = getCurrentFocus();
  const prof = profs[Math.floor(Math.random() * profs.length)];
  const types = ['checklist', 'spreadsheet', 'booking'];
  const type = types[Math.floor(Math.random() * types.length)];
  const ins = db.prepare(`
    INSERT INTO products (profession_id, name, type, price, status, theme, html_content)
    VALUES (?, ?, ?, ?, 'draft', 'Onyx Volt', '<!-- auto-generated -->')
  `).run(prof.id, `${prof.name} ${type.charAt(0).toUpperCase() + type.slice(1)}`, type,
    { checklist: '$10', spreadsheet: '$17', booking: '$22' }[type]);
  db.prepare('INSERT INTO automation_log (action, profession_id, product_id, details, status) VALUES (?, ?, ?, ?, ?)')
    .run('seasonal_generate', prof.id, ins.lastInsertRowid, `Seasonal push for month ${focus.month}: ${type}`, 'success');
  return { profession: prof.name, type, productId: ins.lastInsertRowid };
}

module.exports = { getCurrentFocus, getFocusProfessions, generateSeasonalProduct };
