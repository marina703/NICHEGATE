// ═══════════════════════════════════════════════════════════════════════════
// MARKETING BOT — autonomous orchestrator for all distribution channels.
//
// This is the "set it, save it, implement it, walk away" marketing pipeline.
// It wires together every distribution layer into a single autonomous cycle:
//
//   1. Pin promotion  → auto-schedule Pinterest pins for new listings
//   2. TikTok ads     → create + auto-optimize ad campaigns for hot products
//   3. Social posts   → value-first Reddit/X posts for listed products
//   4. Email campaign → generate + export launch sequences to ESP
//   5. Newsletter     → weekly newsletter generation from fresh listings
//   6. Metrics        → snapshot cross-channel performance into marketing_metrics
//
// All steps are autonomous and self-healing: if a channel isn't configured
// (no OAuth token), it generates ready-to-import creatives/content instead of
// failing. The bot never throws — one channel's failure never blocks the rest.
// ═══════════════════════════════════════════════════════════════════════════

const { db } = require('../database');
const notifier = require('./notifier');
const runtimeConfig = require('./runtimeConfig');

// ── Cycle step: schedule Pinterest pins for new listings ──────────────────
async function stepPinPromotion(ctx) {
  try {
    const pinEngine = require('./pinEngine');
    // Schedule pins for any listed products that don't have one yet
    const result = await pinEngine.scheduleForProductsAI(6);
    ctx.pinsScheduled = result.created;
    if (result.created > 0) {
      console.log(`[MKT BOT] Scheduled ${result.created} Pinterest pin(s) for new listings`);
    }
  } catch (e) {
    console.error('[MKT BOT] pin promotion:', e.message);
  }
  return ctx;
}

// ── Cycle step: create TikTok ads for winning products ────────────────────
async function stepTikTokAds(ctx) {
  const tiktokAds = require('./tiktokAds');
  try {
    // Find listed products that are winners (sales > 0) or fresh hot products
    // without an active TikTok ad yet
    const hotProducts = db.prepare(`
      SELECT p.*, pr.name AS prof_name,
             COALESCE(m.sales, 0) as sales, COALESCE(m.revenue, 0) as revenue
      FROM products p
      LEFT JOIN professions pr ON p.profession_id = pr.id
      LEFT JOIN (
        SELECT product_id, SUM(sales) as sales, SUM(revenue) as revenue
        FROM metrics GROUP BY product_id
      ) m ON m.product_id = p.id
      WHERE p.status = 'listed'
        AND NOT EXISTS (
          SELECT 1 FROM tiktok_ads ta WHERE ta.product_id = p.id AND ta.is_active = 1 AND ta.status = 'active'
        )
      ORDER BY COALESCE(m.revenue, 0) DESC, p.id DESC
      LIMIT 3
    `).all();

    if (hotProducts.length === 0) {
      ctx.tiktokAdsCreated = 0;
      return ctx;
    }

    const tiktokAds = require('./tiktokAds');
    let created = 0;
    const results = [];

    for (const p of hotProducts) {
      try {
        // Use a conservative budget for new products
        const result = await tiktokAds.createAdForProduct(p.id);
        results.push({ productId: p.id, product: p.name, ...result });
        if (result.ok) created++;
      } catch (e) {
        console.error(`[MKT BOT] TikTok ad failed for product #${p.id}:`, e.message);
        results.push({ productId: p.id, product: p.name, error: e.message });
      }
    }

    ctx.tiktokAdsCreated = created;
    ctx.tiktokAdResults = results;

    if (created > 0) {
      console.log(`[MKT BOT] Created ${created} TikTok ad campaign(s)`);
      // Auto-optimize after creation (in case we picked a bad creative)
      const opt = await tiktokAds.autoOptimize();
      ctx.tiktokAdsOptimized = opt;
    }

    // Always sync performance for existing ads
    const sync = await tiktokAds.syncPerformance();
    ctx.tiktokSyncResult = sync;
  } catch (e) {
    console.error('[MKT BOT] tiktok step failed:', e.message);
  }
  return ctx;
}

// ── Cycle step: generate social posts (Reddit/X) ──────────────────────────
async function stepSocialPosts(ctx) {
  try {
    const socialPoster = require('./socialPoster');
    // Schedule new posts for the 5 most recent listed products
    const result = await socialPoster.scheduleForProducts(3);
    ctx.socialPostsScheduled = result.reddit + result.x;

    // Dispatch due posts (anything scheduled in the past or drafted and ready)
    const dispatched = await socialPoster.dispatchDuePosts(15);
    ctx.socialPostsDispatched = dispatched.posted;

    if (result.reddit + result.x > 0 || dispatched.posted > 0) {
      console.log(`[MKT BOT] Social: ${result.reddit + result.x} drafted, ${dispatched.posted} dispatched`);
    }
  } catch (e) {
    console.error('[MKT BOT] social posts step:', e.message);
  }
  return ctx;
}

// ── Cycle step: generate + export email launch sequences ───────────────────
async function stepEmailCampaign(ctx) {
  try {
    const seqEngine = require('./sequenceEngine');

    // Find listed products whose profession doesn't have a 'launch' sequence yet
    const profs = db.prepare(`
      SELECT DISTINCT p.profession_id, pr.name as prof_name, pr.slug as prof_slug
      FROM products p
      LEFT JOIN professions pr ON p.profession_id = pr.id
      WHERE p.status = 'listed'
        AND p.profession_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM sequences s
          WHERE s.profession_id = p.profession_id AND s.purpose = 'launch'
        )
      ORDER BY p.id DESC
      LIMIT 3
    `).all();

    let sequences = 0;
    let exported = 0;

    for (const prof of profs) {
      try {
        const result = await seqEngine.generateSequence({
          professionId: prof.profession_id,
          purpose: 'launch',
          trendKey: null
        });
        sequences++;
        // Auto-export if ESP webhook is configured
        if (seqEngine.espWebhook()) {
          try {
            await seqEngine.exportSequence(result.id);
            exported++;
          } catch (e) {
            console.error(`[MKT BOT] sequence export failed for #${result.id}:`, e.message);
          }
        }
      } catch (e) {
        console.error(`[MKT BOT] sequence generation failed for prof #${prof.profession_id}:`, e.message);
      }
    }

    ctx.emailSequencesGenerated = sequences;
    ctx.emailSequencesExported = exported;

    if (sequences > 0) {
      console.log(`[MKT BOT] Email: generated ${sequences} sequence(s), exported ${exported}`);
    }
  } catch (e) {
    console.error('[MKT BOT] email campaign step:', e.message);
  }
  return ctx;
}

// ── Cycle step: generate weekly newsletter ─────────────────────────────────
async function stepNewsletter(ctx) {
  try {
    const lastNewsletter = db.prepare("SELECT value FROM settings WHERE key = 'last_newsletter_at'").get();
    const lastSent = lastNewsletter ? new Date(lastNewsletter.value) : new Date(0);
    const daysSince = (Date.now() - lastSent.getTime()) / 86400000;

    // Only generate if it's been 7+ days (weekly cadence) or force flag is set
    if (daysSince < 7 && !ctx.forceNewsletter) {
      ctx.newsletterSkipped = true;
      return ctx;
    }

    // Use the existing newsletter generation route's logic directly
    const products = db.prepare(
      "SELECT p.*, pr.name AS prof_name FROM products p LEFT JOIN professions pr ON p.profession_id = pr.id WHERE p.status = 'listed' ORDER BY p.id DESC LIMIT 5"
    ).all();
    const trends = db.prepare("SELECT * FROM trends WHERE activated = 1 ORDER BY activated_at DESC LIMIT 3").all();
    const stats = db.prepare("SELECT COUNT(*) as c FROM products WHERE status = 'listed'").get();

    if (products.length === 0) {
      ctx.newsletterSkipped = true;
      return ctx;
    }

    // Generate newsletter content using sequenceEngine's AI helper (deterministic fallback)
    let subject, body;
    try {
      const conceptEngine = require('./conceptEngine');
      const productList = products.map((p, i) => `${i + 1}. ${p.name} — ${p.prof_name} · ${p.price}`).join('\\n');
      const trendList = trends.map(t => `• ${t.name || t.keyword || 'Trend'}`).join('\\n');
      const prompt = `Write a brief, friendly newsletter (subject line + body) for NicheGate. ` +
        `New products: ${productList}. Trending niches: ${trendList}. Total live: ${stats.c} products.`;
      const ai = await conceptEngine.generateSocialPost(prompt, 'Small Business');
      if (ai && ai.length > 50) {
        const lines = String(ai).split('\\n');
        subject = lines[0].slice(0, 80);
        body = lines.slice(1).join('\\n').slice(0, 3000);
      }
    } catch { /* fallback below */ }

    if (!subject) {
      const productList = products.map((p, i) => `${i + 1}. ${p.name} — ${p.prof_name || ''} · ${p.price || '0'}`).join('\\n');
      const trendList = trends.map(t => `• ${t.name || t.keyword || 'Trend'}`).join('\\n');
      subject = `New This Week: ${products.length} Fresh ${products[0]?.prof_name || ''} Products`;
      body = `Hey there!\\n\\nHere is what is new at NicheGate this week:\\n\\n📦 NEW PRODUCTS:\\n${productList}\\n\\n📈 TRENDING NICHES:\\n${trendList}\\n\\nWe now have ${stats?.c || 0} products live across all marketplaces.\\n\\nBrowse the full catalog: https://mynichegate.com/store\\n\\nHappy creating!\\nThe NicheGate Team`;
    }

    // Check if ESP webhook is configured — if so, we could send. If not, we
    // just log it for the operator to copy-paste.
    const seqEngine = require('./sequenceEngine');
    const hasEsp = !!seqEngine.espWebhook();

    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_newsletter_at', ?)").run(new Date().toISOString());
    db.prepare('INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)').run(
      'newsletter', `Newsletter generated: ${products.length} products, ${trends.length} trends (${hasEsp ? 'ESP ready' : 'manual copy'})`, 'info'
    );

    ctx.newsletterGenerated = true;
    ctx.newsletterHasEsp = hasEsp;
    console.log(`[MKT BOT] Newsletter generated (${products.length} products)`);
  } catch (e) {
    console.error('[MKT BOT] newsletter step:', e.message);
  }
  return ctx;
}

// ── Cycle step: snapshot cross-channel metrics ────────────────────────────
async function stepMetricsSnapshot(ctx) {
  try {
    const mm = require('./marketingMetrics');
    const dashboard = mm.marketingDashboard();

    // Record key aggregate metrics
    const channels = dashboard.channels;
    const dist = dashboard.distribution;

    mm.recordMetric(null, 'pinterest', 'pins_scheduled', dist.pinterest.scheduled, null);
    mm.recordMetric(null, 'pinterest', 'pins_posted', dist.pinterest.posted, null);
    mm.recordMetric(null, 'tiktok', 'ads_active', dist.tiktok.active, null);
    mm.recordMetric(null, 'tiktok', 'spend_30d', dist.tiktok.spend, 'USD');
    mm.recordMetric(null, 'tiktok', 'conversions', dist.tiktok.conversions, null);
    mm.recordMetric(null, 'tiktok', 'ctr', Number(dist.tiktok.ctr) || 0, null);
    mm.recordMetric(null, 'tiktok', 'roas', Number(dist.tiktok.roas) || 0, null);
    mm.recordMetric(null, 'social', 'posts_drafted', dist.social.drafted, null);
    mm.recordMetric(null, 'social', 'posts_posted', dist.social.posted, null);
    mm.recordMetric(null, 'email', 'sequences_ready', dist.email.ready, null);
    mm.recordMetric(null, 'email', 'subscribers', dist.email.subscribers, null);
    mm.recordMetric(null, 'sales', 'revenue_7d', dashboard.sales['7d'].revenue, 'USD');
    mm.recordMetric(null, 'sales', 'revenue_30d', dashboard.sales['30d'].revenue, 'USD');

    ctx.metricsSnapshot = { ok: true, channels: Object.keys(channels).length };
  } catch (e) {
    console.error('[MKT BOT] metrics snapshot:', e.message);
  }
  return ctx;
}

// ── Run the full marketing cycle ───────────────────────────────────────────
async function runMarketingCycle(opts = {}) {
  const ctx = {
    pinsScheduled: 0,
    tiktokAdsCreated: 0,
    tiktokAdsOptimized: null,
    socialPostsScheduled: 0,
    socialPostsDispatched: 0,
    emailSequencesGenerated: 0,
    emailSequencesExported: 0,
    newsletterGenerated: false,
    newsletterSkipped: false,
    newsletterHasEsp: false,
    metricsSnapshot: null,
    startedAt: new Date().toISOString()
  };

  if (opts.forceNewsletter) ctx.forceNewsletter = true;

  // Safety: don't run marketing if production publishing isn't enabled
  if (runtimeConfig.isProduction()) {
    const autoPublish = String(process.env.AUTO_PUBLISH_ENABLED || '').toLowerCase() === 'true';
    if (!autoPublish) {
      console.log('[MKT BOT] Marketing cycle skipped — AUTO_PUBLISH_ENABLED not set');
      ctx.skipped = true;
      return ctx;
    }
  }

  console.log('[MKT BOT] Running autonomous marketing cycle...');

  // Each step runs independently — one failure doesn't block the rest
  await stepPinPromotion(ctx);
  await stepTikTokAds(ctx);
  await stepSocialPosts(ctx);
  await stepEmailCampaign(ctx);
  await stepNewsletter(ctx);
  await stepMetricsSnapshot(ctx);

  // Summary alert
  const summary = [];
  if (ctx.pinsScheduled > 0) summary.push(`${ctx.pinsScheduled} pins scheduled`);
  if (ctx.tiktokAdsCreated > 0) summary.push(`${ctx.tiktokAdsCreated} TikTok ads created`);
  if (ctx.socialPostsScheduled > 0) summary.push(`${ctx.socialPostsScheduled} social posts drafted`);
  if (ctx.socialPostsDispatched > 0) summary.push(`${ctx.socialPostsDispatched} social posts dispatched`);
  if (ctx.emailSequencesGenerated > 0) summary.push(`${ctx.emailSequencesGenerated} email sequences`);
  if (ctx.newsletterGenerated) summary.push(`newsletter ${ctx.newsletterHasEsp ? ' exported' : 'generated'}`);

  if (summary.length > 0) {
    const webhookUrl = (function() {
      try {
        const row = db.prepare("SELECT value FROM settings WHERE key = 'webhook_url'").get();
        if (row && row.value && require('./runtimeConfig').isDiscordWebhookUrl(row.value)) return row.value;
      } catch { /* no settings */ }
      return '';
    })();

    if (webhookUrl) {
      await notifier.sendAlert(webhookUrl, 'auto_listed', {
        count: summary.length,
        message: 'Marketing cycle complete: ' + summary.join(', ') + '.'
      });
    }
    console.log(`[MKT BOT] Cycle complete: ${summary.join(', ')}`);
  }

  ctx.completedAt = new Date().toISOString();
  return ctx;
}

module.exports = {
  runMarketingCycle,
  stepPinPromotion,
  stepTikTokAds,
  stepSocialPosts,
  stepEmailCampaign,
  stepNewsletter,
  stepMetricsSnapshot
};
