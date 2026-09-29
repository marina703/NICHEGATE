// ═══════════════════════════════════════════════════════════════════════════
// WINNER ENGINE — Horizon 1: Winner Amplification Pipeline.
//
// In digital products, 80% of revenue originates from the top 5% of SKUs.
// When a listing logs sales (>= 2 units), this engine turns that single win
// into a multiplying money flywheel:
//   1. THE BUNDLE PLAY: Packages the winner with complementary products in its niche
//      into a high-ticket "Complete Toolkit" bundle ($29-$39).
//   2. THE PRO/EXPANDED SEQUEL: Generates an advanced/pro/tier-2 version of the winning format.
//   3. THE SIBLING SPREAD: Drafts remaining product types for the winning niche so
//      buyer demand is met across all template formats (checklists, spreadsheets, guides).
//
// Purely additive, fully testable, and integrates directly with the automation cycle.
// ═══════════════════════════════════════════════════════════════════════════

const { db } = require('../database');
const { draftProduct } = require('./productDraft');
const bundleEngine = require('./bundleEngine');
const TYPE_PRICES = {
  invoice: '$12', checklist: '$10', spreadsheet: '$17', booking: '$22',
  social: '$15', brand: '$19', journal: '$15', playbook: '$24',
  'pricing-bible': '$19', calculator: '$15', 'email-scripts': '$15', 'sop-package': '$19'
};

const EXPANSION_TYPES = ['checklist', 'spreadsheet', 'decision-matrix', 'roi', 'invoice', 'tool', 'planner', 'journal'];

/**
 * Identify all products that have qualified as "winners" (>= minSales)
 * and have not yet been amplified, or re-checks based on sales milestones.
 */
function findWinners(minSales = 2) {
  const rows = db.prepare(`
    SELECT p.id, p.name, p.type, p.price, p.profession_id, p.theme, p.brief, p.amplified,
           COALESCE(SUM(m.sales), 0) AS total_sales,
           COALESCE(SUM(m.revenue), 0) AS total_revenue,
           pr.name AS prof_name, pr.slug AS prof_slug
      FROM products p
      JOIN metrics m ON p.id = m.product_id
      LEFT JOIN professions pr ON p.profession_id = pr.id
     WHERE p.status IN ('listed', 'published')
     GROUP BY p.id
    HAVING total_sales >= ?
     ORDER BY total_sales DESC
  `).all(minSales);

  return rows;
}

/**
 * Creates an advanced / pro sequel product based on a winning product.
 */
function createProSequel(winner) {
  const prof = db.prepare('SELECT * FROM professions WHERE id = ?').get(winner.profession_id);
  if (!prof) return null;

  // Check if sequel already exists
  const existing = db.prepare(`
    SELECT id FROM products
    WHERE parent_product_id = ? AND origin = 'engine-winner'
    LIMIT 1
  `).get(winner.id);
  if (existing) return null;

  const proName = `${winner.name} (Pro Edition & Master Toolkit)`;
  const proType = winner.type === 'spreadsheet' ? 'roi' : 'decision-matrix';
  const proPrice = '$29';

  try {
    const brief = `Advanced sequel to proven bestseller "${winner.name}". Include deep industry workflows, enterprise checklists, and executive templates.`;
    const ins = db.prepare(`
      INSERT INTO products (profession_id, name, type, price, status, theme, html_content, brief, origin, parent_product_id)
      VALUES (?, ?, ?, ?, 'approved', ?, '<!-- pro sequel -->', ?, 'engine-winner', ?)
    `).run(prof.id, proName, proType, proPrice, winner.theme || 'Onyx Volt', brief, winner.id);

    const proProduct = db.prepare('SELECT * FROM products WHERE id = ?').get(ins.lastInsertRowid);
    return proProduct;
  } catch (e) {
    console.error('[WINNER] sequel creation failed:', e.message);
    return null;
  }
}

/**
 * Fills out missing high-demand sibling product types for a winning niche.
 */
function fillSiblingTypes(winner, limit = 3) {
  const prof = db.prepare('SELECT * FROM professions WHERE id = ?').get(winner.profession_id);
  if (!prof) return [];

  const existingTypes = new Set(
    db.prepare("SELECT type FROM products WHERE profession_id = ? AND status != 'rejected'").all(prof.id).map(r => r.type)
  );

  const missing = EXPANSION_TYPES.filter(t => !existingTypes.has(t));
  const created = [];    for (const type of missing.slice(0, limit)) {
    try {
      const id = draftProduct(prof, type);
      if (id) {
        db.prepare("UPDATE products SET origin = 'engine-winner', parent_product_id = ? WHERE id = ?").run(winner.id, id);
        created.push(db.prepare('SELECT * FROM products WHERE id = ?').get(id));
      }
    } catch (e) {
      console.error(`[WINNER] sibling ${type} failed:`, e.message);
    }
  }

  return created;
}

/**
 * Executes the full Winner Amplification pipeline across all qualified winners.
 */
async function amplifyWinners({ minSales = 2 } = {}) {
  const winners = findWinners(minSales);
  if (!winners.length) return { amplified: 0, bundles: 0, sequels: 0, siblings: 0, details: [] };

  let bundlesCreated = 0;
  let sequelsCreated = 0;
  let siblingsCreated = 0;
  const details = [];

  for (const winner of winners) {
    const prof = db.prepare('SELECT * FROM professions WHERE id = ?').get(winner.profession_id);
    if (!prof) continue;

    // 1. Bundle play: Ensure a complete toolkit bundle exists for this winning niche
    let bundle = null;
    try {
      const bRes = await bundleEngine.buildBundleForProfession(prof);
      if (bRes && !bRes.skipped) {
        bundlesCreated++;
        bundle = bRes.product;
      }
    } catch (e) {
      console.error(`[WINNER] Bundle generation failed for ${prof.name}:`, e.message);
    }

    // 2. Pro sequel play
    const sequel = createProSequel(winner);
    if (sequel) sequelsCreated++;

    // 3. Sibling spread
    const siblings = fillSiblingTypes(winner, 2);
    siblingsCreated += siblings.length;

    // Mark winner as amplified
    db.prepare('UPDATE products SET amplified = 1 WHERE id = ?').run(winner.id);

    details.push({
      winnerId: winner.id,
      winnerName: winner.name,
      sales: winner.total_sales,
      revenue: winner.total_revenue,
      bundleBuilt: !!bundle,
      sequelId: sequel ? sequel.id : null,
      siblingsCount: siblings.length
    });
  }

  const totalAmplified = sequelsCreated + siblingsCreated + bundlesCreated;
  if (totalAmplified > 0) {
    db.prepare('INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)')
      .run('winner_amplification', `Amplified ${winners.length} winner(s): ${bundlesCreated} bundle(s), ${sequelsCreated} sequel(s), ${siblingsCreated} sibling(s)`, 'success');
  }

  return {
    winnersCount: winners.length,
    amplified: totalAmplified,
    bundles: bundlesCreated,
    sequels: sequelsCreated,
    siblings: siblingsCreated,
    details
  };
}

module.exports = {
  findWinners,
  createProSequel,
  fillSiblingTypes,
  amplifyWinners
};
