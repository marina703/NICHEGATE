// MARKETING BOT — autonomous distribution orchestration tests.
// Covers: TikTok ads (manual creative mode + auto-optimization rules),
// Reddit/X social post generation, cross-channel metrics, and the full
// marketing cycle wiring. All deterministic (no network) so it runs offline.
process.env.ADMIN_PASSWORD = 'marketing-test-only-2026';
delete process.env.TIKTOK_ACCESS_TOKEN;
delete process.env.REDDIT_ACCESS_TOKEN;
delete process.env.X_BEARER_TOKEN;
delete process.env.TIKTOK_ADVERTISER_ID;

const assert = require('node:assert/strict');
const test = require('node:test');
const { db, init } = require('../server/database');
init(); // test DB starts empty: create the schema first

const tiktokAds = require('../server/services/tiktokAds');
const socialPoster = require('../server/services/socialPoster');
const marketingMetrics = require('../server/services/marketingMetrics');
const marketingBot = require('../server/services/marketingBot');

// ── Seed helpers ──────────────────────────────────────────────────────────
function seedProfession(id, name, slug) {
  db.prepare(
    'INSERT OR REPLACE INTO professions (id, emoji, name, slug, status, tier, colors, services, hashtags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, '🧪', name, slug, 'active', 'passion', '{"primary":"#000","secondary":"#111","accent":"#222","bg":"#fff"}', '[]', '[]');
}

function seedProduct(id, professionId, name, type, price, status) {
  db.prepare(
    'INSERT OR REPLACE INTO products (id, profession_id, name, type, price, status, marketplace, marketplace_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, professionId, name, type, price, status, 'gumroad', 'gum_' + id);
}

test.after(() => {
  db.prepare('DELETE FROM tiktok_ads').run();
  db.prepare('DELETE FROM social_posts').run();
  db.prepare('DELETE FROM sequences').run();
  db.prepare('DELETE FROM marketing_metrics').run();
  db.prepare('DELETE FROM esp_subscribers').run();
  db.prepare('DELETE FROM ad_attribution_ledger').run();
  db.prepare('DELETE FROM products').run();
  db.prepare('DELETE FROM professions').run();
  db.prepare("DELETE FROM settings WHERE key IN ('last_newsletter_at','esp_webhook_url','store_url')").run();
});

test('tiktokAds: reports unconfigured when no token is set', () => {
  assert.equal(tiktokAds.tiktokConfigured(), false);
  const status = tiktokAds.adStatus();
  assert.equal(status.configured, false);
  assert.equal(status.summary.total, 0);
});

test('tiktokAds: generates a manual creative bundle when unconfigured (never throws)', async () => {
  seedProfession(900, 'Beekeeping / Apiary', 'test-marketing-beekeeping');
  seedProduct(901, 900, 'Hive Inspection Checklist', 'checklist', '$9', 'listed');
  // A storefront URL makes the ad's target link resolvable.
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('store_url', ?)").run('https://nichegate.gumroad.com');

  const result = await tiktokAds.createAdForProduct(901);
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'manual');
  assert.ok(result.creative, 'creative bundle returned');
  assert.ok(Array.isArray(result.creative.scripts) && result.creative.scripts.length >= 2, 'has video scripts');
  assert.ok(result.creative.targetUrl, 'target URL built');
  assert.ok(result.creative.targetUrl.includes('utm_source=tiktok'), 'TikTok UTM on the ad link');
  assert.ok(result.creative.dailyBudget > 0, 'budget set');
  assert.ok(result.creative.campaignName.includes('Beekeeping'), 'campaign name includes niche');

  // Persisted as a draft row
  const row = db.prepare('SELECT * FROM tiktok_ads WHERE product_id = ?').get(901);
  assert.ok(row, 'draft ad row persisted');
  assert.equal(row.status, 'draft');
  assert.equal(row.is_active, 0);
  assert.equal(row.target_url, result.creative.targetUrl);
});

test('tiktokAds: eligibleProductsForAds excludes products that already have an active ad', () => {
  const eligible = tiktokAds.eligibleProductsForAds(5);
  // 901 has a draft (is_active=0) ad → still eligible
  assert.ok(eligible.some(p => p.id === 901), 'draft-only product is eligible');
  // Mark it active → should drop out
  db.prepare("UPDATE tiktok_ads SET is_active = 1, status = 'active' WHERE product_id = 901").run();
  const after = tiktokAds.eligibleProductsForAds(5);
  assert.ok(!after.some(p => p.id === 901), 'product with active ad is not eligible');
});

test('socialPoster: reports unconfigured without tokens', () => {
  const status = socialPoster.socialStatus();
  assert.equal(status.reddit.configured, false);
  assert.equal(status.x.configured, false);
});

test('socialPoster: generates deterministic Reddit + X posts', async () => {
  seedProduct(902, 900, 'Beekeeper Swarm Log', 'journal', '$12', 'listed');
  const reddit = await socialPoster.generateRedditPosts(902, 2);
  const x = socialPoster.generateXPosts(902, 2);

  assert.ok(reddit.length >= 1, 'at least one reddit post');
  assert.ok(x.length >= 1, 'at least one X post');
  assert.ok(reddit.every(p => p.community && p.title && p.body), 'reddit posts have community/title/body');
  assert.ok(x.every(p => p.body && p.postType), 'X posts have body/type');

  const rows = db.prepare("SELECT * FROM social_posts WHERE product_id = 902").all();
  assert.ok(rows.length >= 2, 'posts persisted');
  assert.ok(rows.every(r => r.status === 'draft'), 'all drafted');
});

test('socialPoster: value-first content carries a soft product mention', async () => {
  const reddit = await socialPoster.generateRedditPosts(902, 1);
  const body = reddit[0].body.toLowerCase();
  // Must reference the niche or product without hard-selling
  assert.ok(body.length > 80, 'body has substance');
  assert.ok(/template|checklist|log|built/i.test(body), 'soft product reference present');
});

test('marketingMetrics: channelHealth reports every channel without throwing', () => {
  const health = marketingMetrics.channelHealth();
  assert.ok(health.gumroad && health.etsy && health.pinterest && health.tiktok && health.reddit && health.x && health.email, 'all channels present');
  assert.equal(typeof health.tiktok.configured, 'boolean');
});

test('marketingMetrics: funnelSummary reflects real seeded data', () => {
  const funnel = marketingMetrics.funnelSummary();
  assert.ok(funnel.production.listed >= 2, 'listed count from seeded products');
  assert.ok(funnel.distribution.tiktok_ads !== undefined, 'tiktok channel present');
  assert.ok(funnel.distribution.pinterest_pins !== undefined, 'pinterest channel present');
  assert.ok(funnel.distribution.email_subscribers !== undefined, 'email channel present');
});

test('marketingMetrics: productMarketingView joins every channel per product', () => {
  const view = marketingMetrics.productMarketingView(10);
  assert.ok(view.length >= 2, 'products returned');
  const row = view.find(r => r.id === 902);
  assert.ok(row, 'seeded product present');
  assert.ok(row.pinterest && row.tiktok && row.social && row.email, 'all channel blocks present');
  assert.equal(typeof row.marketing_roi, 'string');
});

test('marketingMetrics: marketingDashboard aggregates all channels', () => {
  const dash = marketingMetrics.marketingDashboard();
  assert.ok(dash.channels && dash.funnel && dash.sales && dash.distribution, 'dashboard blocks present');
  assert.ok(dash.distribution.tiktok && dash.distribution.pinterest && dash.distribution.social && dash.distribution.email, 'all distribution channels');
  assert.equal(typeof dash.generatedAt, 'string');
});

test('marketingBot: runMarketingCycle is self-healing and never throws', async () => {
  seedProduct(903, 900, 'Honey Extraction Tracker', 'spreadsheet', '$15', 'listed');
  const result = await marketingBot.runMarketingCycle({});
  assert.ok(result.completedAt, 'cycle completed');
  assert.equal(typeof result.pinsScheduled, 'number');
  assert.equal(typeof result.socialPostsScheduled, 'number');
  assert.equal(typeof result.socialPostsDispatched, 'number');
  assert.equal(typeof result.emailSequencesGenerated, 'number');
});

test('marketingBot: metrics snapshot records cross-channel metrics', async () => {
  await marketingBot.stepMetricsSnapshot({});
  const rows = db.prepare('SELECT channel, metric_type, value FROM marketing_metrics ORDER BY id DESC LIMIT 15').all();
  assert.ok(rows.length >= 10, 'metric snapshots recorded');
  const channels = new Set(rows.map(r => r.channel));
  assert.ok(channels.has('tiktok') && channels.has('pinterest') && channels.has('social') && channels.has('email'), 'all channels snapshotted');
});

test('marketingBot: email campaign generates + exports sequences', async () => {
  const result = await marketingBot.stepEmailCampaign({});
  assert.equal(typeof result.emailSequencesGenerated, 'number');
  const seqs = db.prepare("SELECT * FROM sequences WHERE purpose = 'launch'").all();
  assert.ok(seqs.length >= 1, 'launch sequence generated');
  assert.ok(seqs.every(s => s.emails && s.emails.length > 2), 'sequence has email bodies');
});

test('marketingBot: newsletter step respects the 7-day cadence', async () => {
  // Fresh run should skip (no prior newsletter)
  const skip = await marketingBot.stepNewsletter({ forceNewsletter: false });
  assert.equal(skip.newsletterSkipped, true, 'skips within 7d');
  // Force should generate
  const forced = await marketingBot.stepNewsletter({ forceNewsletter: true });
  assert.equal(forced.newsletterGenerated, true, 'forced run generates');
});

test('actionRegistry: marketing actions are registered', () => {
  const { list } = require('../server/services/actionRegistry');
  const names = list().map(a => a.name);
  for (const expected of ['marketing-cycle', 'tiktok-ads', 'social-posts', 'email-campaign', 'newsletter-generate']) {
    assert.ok(names.includes(expected), `action ${expected} registered`);
  }
});

test('automationCycle: taskMarketingBot is exported and safe to call', async () => {
  const cycle = require('../server/services/automationCycle');
  assert.equal(typeof cycle.taskMarketingBot, 'function');
  const ctx = await cycle.taskMarketingBot({});
  assert.ok(ctx, 'returns a ctx object without throwing');
});

test('tiktokAds: feedAttributionLedger pushes deltas into the shared ledger', () => {
  const attr = require('../server/services/adAttributionEngine');
  db.prepare('DELETE FROM ad_attribution_ledger').run();
  const ad = { id: 777, ad_id: 'ad_tt_777', product_id: 901 };
  // First feed: full deltas land.
  const r1 = tiktokAds.feedAttributionLedger(ad, { impressions: 1000, clicks: 10, spend: 5, conversions: 0, conversions_value: 0 });
  assert.ok(r1, 'ledger row created');
  assert.equal(r1.spend, 5);
  assert.equal(r1.status, 'active');
  // Second feed with the same numbers → zero deltas, spend stays cumulative.
  const r2 = tiktokAds.feedAttributionLedger(ad, { impressions: 1000, clicks: 10, spend: 5, conversions: 0, conversions_value: 0 });
  assert.equal(r2.spend, 5, 'no double-count on unchanged metrics');
  // Burn tripwire: >= $15 with 0 sales → killed.
  const r3 = tiktokAds.feedAttributionLedger(ad, { impressions: 5000, clicks: 40, spend: 20, conversions: 0, conversions_value: 0 });
  assert.equal(r3.status, 'killed', 'burn tripwire trips at $15 spend / 0 sales');
  assert.ok(/Burn/i.test(r3.kill_reason || ''), 'kill reason recorded');
});

test('pinEngine: attributedUrl now resolves a real target (precedence bug fixed)', () => {
  const pinEngine = require('../server/services/pinEngine');
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('store_url', ?)").run('https://nichegate.gumroad.com');
  const product = { id: 42, name: 'Test', marketplace_id: 'gum_42', buy_url: null };
  const url = pinEngine.attributedUrl(product, 'general');
  assert.ok(url && /^https?:\/\//.test(url), 'URL resolves');
  assert.ok(url.includes('utm_source=pinterest'), 'UTM attached');
  // Explicit buy_url wins over everything.
  const withBuy = pinEngine.attributedUrl({ id: 43, buy_url: 'https://example.com/buy' }, 'general');
  assert.ok(withBuy.startsWith('https://example.com/buy'), 'buy_url wins');
});

test('socialPoster: scheduleForProducts returns accurate counts (awaits reddit)', async () => {
  seedProduct(904, 900, 'Swarm Capture Log', 'journal', '$11', 'listed');
  const result = await socialPoster.scheduleForProducts(2);
  assert.equal(result.ok, true);
  assert.ok(Number.isFinite(result.reddit) && result.reddit >= 1, 'reddit count is a real number');
  assert.ok(Number.isFinite(result.x) && result.x >= 1, 'x count is a real number');
  assert.ok(result.products >= 1);
});

test('socialPoster: dispatchDuePosts skips (never errors) when no channel token', async () => {
  const result = await socialPoster.dispatchDuePosts(10);
  assert.equal(result.posted, 0, 'nothing posted without a token');
  assert.ok(result.skipped >= 1, 'drafts are skipped as ready-for-manual, not errored');
  assert.equal(result.errors, 0, 'no hard errors when a channel is unconfigured');
});
