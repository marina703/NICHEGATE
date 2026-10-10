// ═══════════════════════════════════════════════════════════════════════════
// AD ATTRIBUTION ENGINE — Horizon Stretch: Ad Attribution Ledger & Kill Rules.
//
// In automated multi-channel digital distribution (Pinterest pins, Meta ads,
// social promos), unmonitored spend destroys unit economics.
// This engine establishes an explicit Attribution & Spend Ledger with
// automated "Kill Rules" (SpaceX / SRE safety tripwires):
//   1. Tracks campaign spend, impressions, clicks, attributed revenue, and ROAS.
//   2. KILL RULE 1 (Burn Rate): Automatically flags / pauses any ad campaign
//      that has burned >= $15 with 0 conversions / sales.
//   3. KILL RULE 2 (Sub-Par ROAS): Pauses mature campaigns (>= $30 spend) with ROAS < 1.2.
//   4. SCALE RULE (Star Campaign): Recommends budget scale for campaigns with ROAS >= 3.0.
// ═══════════════════════════════════════════════════════════════════════════

const { db } = require('../database');

// Ensure ad_attribution_ledger table exists
function initAttributionTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ad_attribution_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id TEXT UNIQUE,
      channel TEXT NOT NULL,
      product_id INTEGER,
      spend REAL DEFAULT 0.0,
      clicks INTEGER DEFAULT 0,
      impressions INTEGER DEFAULT 0,
      sales_count INTEGER DEFAULT 0,
      attributed_revenue REAL DEFAULT 0.0,
      status TEXT DEFAULT 'active', -- active | paused | killed | scaled
      kill_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

initAttributionTable();

/**
 * Record or update spend and conversion metrics for an ad campaign.
 */
function recordCampaignMetrics(data) {
  const {
    campaignId,
    channel = 'pinterest',
    productId = null,
    spendDelta = 0,
    clicksDelta = 0,
    impressionsDelta = 0,
    salesDelta = 0,
    revenueDelta = 0
  } = data;

  const existing = db.prepare('SELECT * FROM ad_attribution_ledger WHERE campaign_id = ?').get(campaignId);

  if (existing) {
    const newSpend = existing.spend + spendDelta;
    const newClicks = existing.clicks + clicksDelta;
    const newImpressions = existing.impressions + impressionsDelta;
    const newSales = existing.sales_count + salesDelta;
    const newRev = existing.attributed_revenue + revenueDelta;

    db.prepare(`
      UPDATE ad_attribution_ledger
         SET spend = ?, clicks = ?, impressions = ?, sales_count = ?,
             attributed_revenue = ?, updated_at = CURRENT_TIMESTAMP
       WHERE campaign_id = ?
    `).run(newSpend, newClicks, newImpressions, newSales, newRev, campaignId);
  } else {
    db.prepare(`
      INSERT INTO ad_attribution_ledger
        (campaign_id, channel, product_id, spend, clicks, impressions, sales_count, attributed_revenue, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(campaignId, channel, productId, spendDelta, clicksDelta, impressionsDelta, salesDelta, revenueDelta);
  }

  return evaluateKillRules(campaignId);
}

/**
 * Evaluate automated kill / scale rules for a specific campaign.
 */
function evaluateKillRules(campaignId) {
  const row = db.prepare('SELECT * FROM ad_attribution_ledger WHERE campaign_id = ?').get(campaignId);
  if (!row) return null;

  const roas = row.spend > 0 ? (row.attributed_revenue / row.spend) : 0;
  let status = row.status;
  let killReason = null;

  // RULE 1: Burn rate tripwire (spend >= $15 with 0 sales)
  if (row.spend >= 15.0 && row.sales_count === 0) {
    status = 'killed';
    killReason = `Burn tripwire: Spent $${row.spend.toFixed(2)} with 0 conversions`;
  }
  // RULE 2: Underperforming mature campaign (spend >= $30 and ROAS < 1.2)
  else if (row.spend >= 30.0 && roas < 1.2) {
    status = 'paused';
    killReason = `Sub-par ROAS: ${(roas * 100).toFixed(0)}% return is below the 120% margin floor`;
  }
  // RULE 3: Winning campaign qualification (ROAS >= 3.0 and spend >= $20)
  else if (row.spend >= 20.0 && roas >= 3.0) {
    status = 'scaled';
    killReason = `Winner qualification: Exceptional ${(roas * 100).toFixed(0)}% ROAS, eligible for budget expansion`;
  }

  if (status !== row.status) {
    db.prepare(`
      UPDATE ad_attribution_ledger
         SET status = ?, kill_reason = ?, updated_at = CURRENT_TIMESTAMP
       WHERE campaign_id = ?
    `).run(status, killReason, campaignId);
    row.status = status;
    row.kill_reason = killReason;
  }

  return {
    ...row,
    roas: parseFloat(roas.toFixed(2))
  };
}

/**
 * Sweep all active campaigns and enforce safety kill rules across the ledger.
 */
function runAttributionSweep() {
  const campaigns = db.prepare('SELECT campaign_id FROM ad_attribution_ledger').all();
  const results = campaigns.map(c => evaluateKillRules(c.campaign_id));

  const killed = results.filter(r => r.status === 'killed').length;
  const paused = results.filter(r => r.status === 'paused').length;
  const scaled = results.filter(r => r.status === 'scaled').length;
  const active = results.filter(r => r.status === 'active').length;

  const totalSpend = results.reduce((sum, r) => sum + r.spend, 0);
  const totalRev = results.reduce((sum, r) => sum + r.attributed_revenue, 0);
  const blendedRoas = totalSpend > 0 ? parseFloat((totalRev / totalSpend).toFixed(2)) : 0;

  return {
    totalCampaigns: results.length,
    active,
    killed,
    paused,
    scaled,
    totalSpend,
    totalAttributedRevenue: totalRev,
    blendedRoas,
    campaigns: results
  };
}

module.exports = {
  recordCampaignMetrics,
  evaluateKillRules,
  runAttributionSweep,
  initAttributionTable
};
