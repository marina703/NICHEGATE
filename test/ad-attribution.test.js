const test = require('node:test');
const assert = require('node:assert/strict');
const attribution = require('../server/services/adAttributionEngine');
const { db } = require('../server/database');

test('adAttributionEngine: recordCampaignMetrics creates and updates ledger rows', () => {
  const campId = `test-camp-${Date.now()}`;
  try {
    const res = attribution.recordCampaignMetrics({
      campaignId: campId,
      channel: 'pinterest',
      spendDelta: 10.0,
      clicksDelta: 150,
      impressionsDelta: 5000,
      salesDelta: 1,
      revenueDelta: 29.0
    });

    assert.equal(res.campaign_id, campId);
    assert.equal(res.spend, 10.0);
    assert.equal(res.clicks, 150);
    assert.equal(res.sales_count, 1);
    assert.equal(res.attributed_revenue, 29.0);
    assert.equal(res.status, 'active');
  } finally {
    db.prepare('DELETE FROM ad_attribution_ledger WHERE campaign_id = ?').run(campId);
  }
});

test('adAttributionEngine: Kill Rule 1 trips when spend >= $15 with 0 sales', () => {
  const campId = `burn-trip-${Date.now()}`;
  try {
    const res = attribution.recordCampaignMetrics({
      campaignId: campId,
      channel: 'meta',
      spendDelta: 16.5,
      clicksDelta: 200,
      salesDelta: 0,
      revenueDelta: 0
    });

    assert.equal(res.status, 'killed');
    assert.ok(res.kill_reason.includes('Burn tripwire'));
  } finally {
    db.prepare('DELETE FROM ad_attribution_ledger WHERE campaign_id = ?').run(campId);
  }
});

test('adAttributionEngine: Scale Rule trips when mature campaign ROAS >= 3.0', () => {
  const campId = `winner-scale-${Date.now()}`;
  try {
    const res = attribution.recordCampaignMetrics({
      campaignId: campId,
      channel: 'pinterest',
      spendDelta: 25.0,
      clicksDelta: 300,
      salesDelta: 4,
      revenueDelta: 100.0 // 4x ROAS
    });

    assert.equal(res.status, 'scaled');
    assert.ok(res.kill_reason.includes('Winner qualification'));
    assert.equal(res.roas, 4.0);
  } finally {
    db.prepare('DELETE FROM ad_attribution_ledger WHERE campaign_id = ?').run(campId);
  }
});

test('adAttributionEngine: runAttributionSweep aggregates ledger across campaigns', () => {
  const sweep = attribution.runAttributionSweep();
  assert.ok(typeof sweep.totalCampaigns === 'number');
  assert.ok(typeof sweep.blendedRoas === 'number');
  assert.ok(Array.isArray(sweep.campaigns));
});
