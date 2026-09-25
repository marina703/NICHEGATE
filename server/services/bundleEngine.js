// ═══════════════════════════════════════════════════════════════════════════
// BUNDLE ENGINE — packages each profession's products into one high-value
// "Complete Toolkit" ZIP ($29 vs. $10-12 singles). Idempotent: one bundle
// per profession; re-runs skip existing bundles.
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { db } = require('../database');
const { ensureProductFile } = require('./fileFactory');
const runtimeConfig = require('./runtimeConfig');

const OUTPUT_DIR = runtimeConfig.resolvePersistentDir('generated');

const MEMBER_TYPES = ['invoice', 'checklist', 'spreadsheet', 'booking', 'social', 'brand', 'website', 'tool', 'planner', 'wall-art'];
const RECOVERY_SLUGS = ['aa-recovery', 'smart-recovery', 'refuge-recovery', 'womens-recovery', 'secular-recovery', 'faith-recovery'];
const TYPE_PRICES = { invoice: '$12', checklist: '$10', spreadsheet: '$17', booking: '$22', social: '$15', journal: '$15', brand: '$19', website: '$24', tool: '$15', planner: '$12', 'wall-art': '$9', worksheet: '$8', 'party-printable': '$10' };

async function getOrCreateMemberFile(prof, type) {
  let row = db.prepare(`
    SELECT * FROM products
    WHERE profession_id = ? AND type = ? AND status != 'rejected'
    ORDER BY id DESC LIMIT 1
  `).get(prof.id, type);

  if (!row) {
    const ins = db.prepare(`
      INSERT INTO products (profession_id, name, type, price, status, theme, html_content)
      VALUES (?, ?, ?, ?, 'draft', 'Onyx Volt', '<!-- auto-generated -->')
    `).run(prof.id, `${prof.name} ${type.charAt(0).toUpperCase() + type.slice(1)}`, type, TYPE_PRICES[type] || '$12');
    row = db.prepare('SELECT * FROM products WHERE id = ?').get(ins.lastInsertRowid);
  }

  const fp = await ensureProductFile(row);
  return fp && fs.existsSync(fp) ? fp : null;
}

async function buildBundleForProfession(prof) {
  const existing = db.prepare(`
    SELECT * FROM products WHERE profession_id = ? AND type = 'bundle' LIMIT 1
  `).get(prof.id);
  if (existing) return { skipped: true, product: existing };

  const memberTypes = (prof.tier === 'passion' || RECOVERY_SLUGS.includes(prof.slug))
    ? [...MEMBER_TYPES, 'journal']
    : MEMBER_TYPES;

  const members = [];
  for (const type of memberTypes) {
    const fp = await getOrCreateMemberFile(prof, type);
    if (fp) members.push(fp);
  }
  if (members.length < 3) return { skipped: true, reason: 'not enough deliverables' };

  const zip = new AdmZip();
  for (const fp of members) zip.addLocalFile(fp, '', path.basename(fp));
  const zipPath = path.join(OUTPUT_DIR, `${prof.slug}-complete-toolkit-${Date.now()}.zip`);
  zip.writeZip(zipPath);

  const ins = db.prepare(`
    INSERT INTO products (profession_id, name, type, price, status, theme, html_content, file_path)
    VALUES (?, ?, 'bundle', '$29', 'approved', 'Onyx Volt', '<!-- bundle -->', ?)
  `).run(prof.id, `${prof.name} Complete Toolkit`, zipPath);

  return { skipped: false, product: db.prepare('SELECT * FROM products WHERE id = ?').get(ins.lastInsertRowid) };
}

async function generateAllBundles() {
  const profs = db.prepare(`
    SELECT * FROM professions WHERE status != 'archived' AND (tier IS NULL OR tier != 'trend') ORDER BY id
  `).all();
  const created = [];
  let skipped = 0;
  for (const prof of profs) {
    try {
      const res = await buildBundleForProfession(prof);
      if (res.skipped) skipped++;
      else created.push(res.product);
    } catch (e) {
      console.error(`[BUNDLE] ${prof.name} failed:`, e.message);
      skipped++;
    }
  }
  db.prepare('INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)')
    .run('bundles_generated', `Built ${created.length} toolkits (${skipped} already existed)`, 'success');
  return { created: created.length, skipped, products: created };
}

// Free lead magnet: 3-sample pack (email capture on Gumroad's free checkout)
async function buildLeadMagnet() {
  let row = db.prepare("SELECT * FROM products WHERE type = 'leadmagnet' LIMIT 1").get();
  if (row && row.file_path && fs.existsSync(row.file_path)) return row;

  const prof = db.prepare('SELECT * FROM professions WHERE id = 1').get();
  const members = [];
  for (const type of ['invoice', 'checklist', 'spreadsheet']) {
    const fp = await getOrCreateMemberFile(prof, type);
    if (fp) members.push(fp);
  }
  const zip = new AdmZip();
  for (const fp of members) zip.addLocalFile(fp, '', path.basename(fp));
  const zipPath = path.join(OUTPUT_DIR, `free-starter-pack-${Date.now()}.zip`);
  zip.writeZip(zipPath);

  if (row) {
    db.prepare('UPDATE products SET file_path = ? WHERE id = ?').run(zipPath, row.id);
  } else {
    db.prepare(`
      INSERT INTO products (profession_id, name, type, price, status, theme, html_content, file_path)
      VALUES (1, 'Free Starter Pack — 3 Pro Business Templates', 'leadmagnet', '$0', 'approved', 'Onyx Volt', '<!-- leadmagnet -->', ?)
    `).run(zipPath);
  }
  return db.prepare("SELECT * FROM products WHERE type = 'leadmagnet' LIMIT 1").get();
}

// Which branded cover to use per product type — bundles & the lead magnet use
// the actual NicheGate logo (from the nichegate designs folder), singles use
// their category icon.
const COVER_BY_TYPE = {
  invoice: 'invoice.png', checklist: 'checklist.png', spreadsheet: 'calculator.png',
  booking: 'booking.png', social: 'social.png', journal: 'journal.png',
  brand: 'brand.png', website: 'website.png', tool: 'tool.png',
  planner: 'journal.png', 'wall-art': 'website.png', worksheet: 'checklist.png', 'party-printable': 'social.png',
  bundle: 'nichegate_logo_on_black.png', leadmagnet: 'nichegate_logo_on_black.png'
};
function coverForType(type) {
  const file = COVER_BY_TYPE[type] || 'brand.png';
  const p = path.join(__dirname, '..', '..', 'covers', file);
  return fs.existsSync(p) ? p : null;
}

module.exports = { buildBundleForProfession, generateAllBundles, buildLeadMagnet, coverForType };
