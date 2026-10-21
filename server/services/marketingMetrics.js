// ═══════════════════════════════════════════════════════════════════════════
// MARKETING METRICS — cross-channel performance aggregation (Phase 6).
//
// Rolls up metrics from every distribution channel into a unified view:
//   • Gumroad/Etsy sales (from metrics table + marketplace sync)
//   • Pinterest pins (from pins table: scheduled/posted/failed)
//   • TikTok ads (from tiktok_ads table: spend, impressions, conversions, ROAS)
//   • Reddit/X social posts (from social_posts table: drafted/posted/errored)
//   • Email sequences (from sequences table: ready/exported)
//   • ESP subscribers (from esp_subscribers table: list growth)
//
// All metrics are derived from REAL database rows — no synthetic data.
// ═══════════════════════════════════════════════════════════════════════════

const { db } = require('../database');

// ── Channel health: which channels are configured vs connected ────────────
function channelHealth() {
  const mp = require('./marketplace');
  const mpStatus = mp.getMarketplaceStatus();

  const pinEngine = require('./pinEngine');
  const socialPoster = require('./socialPoster');
  const tiktokAds = require('./tiktokAds');
  const seqEngine = require('./sequenceEngine');
  const buffer = require('./bufferBridge');

  return {
    gumroad: { configured: mpStatus.gumroad.configured, connected: mpStatus.gumroad.connected, message: mpStatus.gumroad.message },
    etsy: { configured: mpStatus.etsy.configured, connected: mpStatus.etsy.connected, message: mpStatus.etsy.message },
    pinterest: { configured: pinEngine.pinterestConfigured(), connected: pinEngine.pinterestConfigured(), message: pinEngine.pinterestConfigured() ? 'Connected' : 'Pinterest token not connected (PINTEREST_ACCESS_TOKEN or marketplace_tokens)' },
    buffer: { configured: buffer.bufferStatus().configured, connected: buffer.bufferStatus().configured, ...buffer.bufferStatus() },
    tiktok: { configured: tiktokAds.tiktokConfigured(), connected: tiktokAds.tiktokConfigured() && !!process.env.TIKTOK_ADVERTISER_ID, message: tiktokAds.tiktokConfigured() ? 'Ready' : 'TikTok OAuth not connected' },
    reddit: { configured: socialPoster.redditConfigured(), connected: socialPoster.redditConfigured(), message: socialPoster.redditConfigured() ? 'Connected' : 'Reddit OAuth not connected' },
    x: { configured: socialPoster.xConfigured(), connected: socialPoster.xConfigured(), message: socialPoster.xConfigured() ? 'Connected' : 'X OAuth not connected' },
    email: { configured: !!seqEngine.espWebhook(), connected: !!seqEngine.espWebhook(), message: seqEngine.espWebhook() ? 'Webhook configured' : 'Set esp_webhook_url in settings' }
  };
}

// ── Marketing funnel summary: discover → generate → publish → distribute ────
function funnelSummary() {
  const products = db.prepare('SELECT status FROM products').all();
  const countStatus = s => products.filter(p => p.status === s).length;

  const listed = countStatus('listed') + countStatus('published');
  const activeAds = db.prepare("SELECT COUNT(*) as c FROM tiktok_ads WHERE is_active = 1 AND status = 'active'").get().c;
  const activePins = db.prepare("SELECT COUNT(*) as c FROM pins WHERE status = 'scheduled'").get().c;
  const activePosts = db.prepare("SELECT COUNT(*) as c FROM social_posts WHERE status = 'scheduled'").get().c;
  const exportedSequences = db.prepare("SELECT COUNT(*) as c FROM sequences WHERE status = 'exported'").get().c;
  const subscribers = db.prepare("SELECT COUNT(*) as c FROM esp_subscribers WHERE status = 'active'").get().c;

  return {
    production: {
      total: products.length,
      draft: countStatus('draft'),
      pending: countStatus('pending-review') + countStatus('reviewing'),
      approved: countStatus('approved'),
      listed
    },
    distribution: {
      tiktok_ads: activeAds,
      pinterest_pins: activePins,
      social_posts: activePosts,
      email_sequences: exportedSequences,
      email_subscribers: subscribers
    }
  };
}

// ── Cross-channel performance matrix (per-product marketing view) ──────────
// For each listed product, show what marketing channels are active and their KPIs.
function productMarketingView(limit = 50) {
  const rows = db.prepare(`
    SELECT
      p.id, p.name, p.price, p.marketplace, p.marketplace_id, p.profession_id,
      pr.name AS prof_name, pr.emoji,
      -- Gumroad/Etsy sales
      COALESCE(m.sales, 0) as sales,
      COALESCE(m.revenue, 0) as revenue,
      COALESCE(m.views, 0) as views,
      -- Pinterest pin
      (SELECT COUNT(*) FROM pins WHERE pins.product_id = p.id AND pins.status = 'posted') as pins_posted,
      (SELECT COUNT(*) FROM pins WHERE pins.product_id = p.id AND pins.status = 'scheduled') as pins_scheduled,
      -- TikTok ad
      (SELECT COUNT(*) FROM tiktok_ads WHERE tiktok_ads.product_id = p.id AND tiktok_ads.is_active = 1) as tiktok_ads_active,
      (SELECT SUM(spend) FROM tiktok_ads WHERE tiktok_ads.product_id = p.id) as tiktok_spend,
      (SELECT SUM(conversions) FROM tiktok_ads WHERE tiktok_ads.product_id = p.id) as tiktok_conversions,
      (SELECT SUM(roas) FROM tiktok_ads WHERE tiktok_ads.product_id = p.id) as tiktok_roas,
      -- Social posts
      (SELECT COUNT(*) FROM social_posts WHERE social_posts.product_id = p.id AND social_posts.status = 'posted') as posts_posted,
      (SELECT COUNT(*) FROM social_posts WHERE social_posts.product_id = p.id AND social_posts.status = 'draft') as posts_drafted,
      -- Email sequence
      (SELECT COUNT(*) FROM sequences WHERE sequences.profession_id = p.profession_id) as sequences_count
    FROM products p
    LEFT JOIN professions pr ON p.profession_id = pr.id
    LEFT JOIN (
      SELECT product_id, SUM(sales) as sales, SUM(revenue) as revenue, SUM(views) as views
      FROM metrics GROUP BY product_id
    ) m ON m.product_id = p.id
    WHERE p.status IN ('listed', 'published')
    ORDER BY p.id DESC
    LIMIT ?
  `).all(limit);

  return rows.map(r => ({
    id: r.id,
    name: r.name,
    price: r.price,
    marketplace: r.marketplace,
    profession: r.prof_name,
    emoji: r.emoji,
    sales: Number(r.sales || 0),
    revenue: Number(r.revenue || 0),
    views: Number(r.views || 0),
    pinterest: { posted: Number(r.pins_posted || 0), scheduled: Number(r.pins_scheduled || 0) },
    tiktok: { active: Number(r.tiktok_ads_active || 0), spend: Number(r.tiktok_spend || 0), conversions: Number(r.tiktok_conversions || 0), roas: Number(r.tiktok_roas || 0) },
    social: { posted: Number(r.posts_posted || 0), drafted: Number(r.posts_drafted || 0) },
    email: { sequences: Number(r.sequences_count || 0) },
    marketing_roi: Number(r.revenue || 0) > 0 && Number(r.tiktok_spend || 0) > 0
      ? (Number(r.revenue) / Number(r.tiktok_spend)).toFixed(2)
      : '0.00'
  }));
}

// ── Unified dashboard snapshot for the marketing bot ──────────────────────
function marketingDashboard() {
  // Gumroad/Etsy sales (last 7 days)
  const sales7d = db.prepare(`
    SELECT COALESCE(SUM(sales),0) as sales, COALESCE(SUM(revenue),0) as revenue
    FROM metrics WHERE recorded_at >= datetime('now','-7 days')
  `).get();

  // Gumroad/Etsy sales (last 30 days)
  const sales30d = db.prepare(`
    SELECT COALESCE(SUM(sales),0) as sales, COALESCE(SUM(revenue),0) as revenue
    FROM metrics WHERE recorded_at >= datetime('now','-30 days')
  `).get();

  // Pinterest performance
  const pinStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      COALESCE(SUM(CASE WHEN status = 'posted' THEN 1 ELSE 0 END),0) as posted,
      COALESCE(SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END),0) as scheduled,
      COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END),0) as failed
    FROM pins
  `).get();

  // TikTok ad performance
  const tiktokStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      COALESCE(SUM(CASE WHEN status = 'active' AND is_active = 1 THEN 1 ELSE 0 END),0) as active,
      COALESCE(SUM(CASE WHEN status = 'paused' THEN 1 ELSE 0 END),0) as paused,
      COALESCE(SUM(spend),0) as spend,
      COALESCE(SUM(impressions),0) as impressions,
      COALESCE(SUM(clicks),0) as clicks,
      COALESCE(SUM(conversions),0) as conversions,
      COALESCE(SUM(conversions_value),0) as conversions_value
    FROM tiktok_ads
  `).get();

  // Social post performance
  const socialStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      COALESCE(SUM(CASE WHEN status = 'posted' THEN 1 ELSE 0 END),0) as posted,
      COALESCE(SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END),0) as drafted
    FROM social_posts
  `).get();

  // Email sequence status
  const emailStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      COALESCE(SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END),0) as ready,
      COALESCE(SUM(CASE WHEN status = 'exported' THEN 1 ELSE 0 END),0) as exported
    FROM sequences
  `).get();

  const subscribers = db.prepare('SELECT COUNT(*) as c FROM esp_subscribers').get().c;
  const automationLog = db.prepare(`
    SELECT action, details, status, created_at FROM automation_log
    WHERE action LIKE 'social_%' OR action LIKE 'tiktok%' OR action LIKE 'pinterest%' OR action LIKE 'sequence%' OR action LIKE 'newsletter%'
    ORDER BY id DESC LIMIT 30
  `).all();

  return {
    channels: channelHealth(),
    funnel: funnelSummary(),
    sales: {
      '7d': { sales: Number(sales7d.sales || 0), revenue: Number(sales7d.revenue || 0) },
      '30d': { sales: Number(sales30d.sales || 0), revenue: Number(sales30d.revenue || 0) }
    },
    distribution: {
      pinterest: { total: pinStats.total, posted: pinStats.posted, scheduled: pinStats.scheduled, failed: pinStats.failed },
      tiktok: {
        total: tiktokStats.total, active: tiktokStats.active, paused: tiktokStats.paused,
        spend: Number(tiktokStats.spend || 0),
        impressions: Number(tiktokStats.impressions || 0),
        clicks: Number(tiktokStats.clicks || 0),
        conversions: Number(tiktokStats.conversions || 0),
        conversionsValue: Number(tiktokStats.conversions_value || 0),
        ctr: tiktokStats.clicks > 0 && tiktokStats.impressions > 0 ? (Number(tiktokStats.clicks) / Number(tiktokStats.impressions) * 100).toFixed(2) : '0.00',
        cpc: tiktokStats.clicks > 0 ? (Number(tiktokStats.spend || 0) / Number(tiktokStats.clicks)).toFixed(2) : '0.00',
        roas: tiktokStats.spend > 0 ? (Number(tiktokStats.conversions_value || 0) / Number(tiktokStats.spend)).toFixed(2) : '0.00'
      },
      social: { total: socialStats.total, posted: socialStats.posted, drafted: socialStats.drafted },
      email: { total: emailStats.total, ready: emailStats.ready, exported: emailStats.exported, subscribers }
    },
    recent_activity: automationLog,
    generatedAt: new Date().toISOString()
  };
}

// ── Record a marketing metric snapshot (call after each cycle) ────────────
function recordMetric(productId, channel, metricType, value, currency = null) {
  // SUM() over zero rows yields NULL; a metric snapshot must always be numeric.
  const v = (value === null || value === undefined || !Number.isFinite(Number(value))) ? 0 : Number(value);
  db.prepare(
    'INSERT INTO marketing_metrics (product_id, channel, metric_type, value, currency) VALUES (?, ?, ?, ?, ?)'
  ).run(productId, channel, metricType, v, currency);
}

module.exports = {
  channelHealth,
  funnelSummary,
  productMarketingView,
  marketingDashboard,
  recordMetric
};
