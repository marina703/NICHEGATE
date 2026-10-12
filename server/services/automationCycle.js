// AUTOMATION CYCLE — modular stateful tasks for the 6-hour full cycle.
const { db } = require('../database');
const discovery = require('./discovery');
const seasonal = require('./seasonalEngine');
const notifier = require('./notifier');
const mp = require('./marketplace');
const { validatePublishResult } = require('./pipelineSchemas');
const runtimeConfig = require('./runtimeConfig');
const { draftProduct } = require('./productDraft');
const winnerEngine = require('./winnerEngine');
const pricingEngine = require('./pricingEngine');

// Prices imported from single source of truth (productTypes.js)
const productTypes = require('./productTypes');
const TYPE_PRICES = {};
const VARY_TYPES = ['invoice', 'checklist', 'spreadsheet', 'booking', 'social'];

function getWebhookUrl() {
  const stored = db.prepare('SELECT value FROM settings WHERE key = ?').get('webhook_url');
  return [stored && stored.value, process.env.DISCORD_WEBHOOK_URL].find(runtimeConfig.isDiscordWebhookUrl) || '';
}

async function taskScan(ctx) {
  const found = await discovery.sweep(6);
  ctx.found = found;
  ctx.trend = found[0] || null;
  if (ctx.trend) {
    console.log('[AUTO] Trend detected: ' + ctx.trend.name);
    db.prepare('INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)')
      .run('trend_detected', 'Detected: ' + ctx.trend.name, 'warning');
    await notifier.sendDiscord(ctx.webhookUrl, notifier.formatAlert('trend_detected', ctx.trend));
  }
  return ctx;
}

function taskFreshness(ctx) {
  try { ctx.fresh = discovery.freshnessPass(); }
  catch (e) { console.error('[AUTO] freshness:', e.message); ctx.fresh = 0; }
  return ctx;
}

async function taskSalesSync(ctx) {
  // Self-Healing OAuth: Proactively check Etsy token expiry and refresh before publish/sync
  try {
    if (typeof mp.autoRefreshEtsyTokenIfExpiring === 'function') {
      ctx.etsyRefreshed = await mp.autoRefreshEtsyTokenIfExpiring(45);
    }
  } catch (e) {
    console.error('[AUTO] etsy proactive token refresh:', e.message);
  }

  if (typeof ctx.syncGumroadSales === 'function') {
    try { ctx.sales = await ctx.syncGumroadSales(); }
    catch (e) { console.error('[AUTO] sales sync:', e.message); }
  }
  // Autonomous Yield Management: auto-promote winning price tests post-sync
  try {
    const promoted = await pricingEngine.autoPromoteWinners();
    ctx.promotedPrices = promoted;
    if (promoted.length > 0) {
      console.log(`[AUTO] Auto-promoted ${promoted.length} winning price tier(s) to live listings`);
    }
  } catch (e) {
    console.error('[AUTO] auto-promote pricing winners:', e.message);
  }

  // Horizon 3 SEO Sweep: Auto-optimize weak SEO listings and deploy live to Etsy/Gumroad
  try {
    const optimizer = require('./listingOptimizer');
    const optRes = await optimizer.optimizeWeak(5);
    ctx.seoOptimized = optRes.optimized || 0;
    ctx.seoDeployed = optRes.deployed || 0;
    if (ctx.seoOptimized > 0) {
      console.log(`[AUTO] Live SEO sweep: optimized ${ctx.seoOptimized} listing(s), deployed ${ctx.seoDeployed} live`);
    }
  } catch (e) {
    console.error('[AUTO] live SEO sweep:', e.message);
  }
  return ctx;
}

function taskRetire(ctx) {
  try {
    ctx.retired = discovery.retireColdTrends();
    if (ctx.retired > 0) console.log('[AUTO] Retired ' + ctx.retired + ' cold trend(s)');
  } catch (e) {
    console.error('[AUTO] retire:', e.message);
  }

  // Horizon 3 Autopilot: Cold Listing Clearance (tag stale zero-view listings for clearance bundles)
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().replace('T', ' ').slice(0, 19);
    const staleListings = db.prepare(`
      SELECT p.id, p.name FROM products p
      WHERE p.status IN ('listed', 'published')
        AND p.created_at <= ?
        AND NOT EXISTS (SELECT 1 FROM metrics m WHERE m.product_id = p.id AND (m.views > 0 OR m.sales > 0))
    `).all(thirtyDaysAgo);

    ctx.coldListingsIdentified = staleListings.length;
    if (staleListings.length > 0) {
      console.log(`[AUTO] Identified ${staleListings.length} cold listing(s) eligible for clearance bundling`);
      for (const s of staleListings.slice(0, 5)) {
        db.prepare('INSERT INTO automation_log (action, product_id, details, status) VALUES (?, ?, ?, ?)')
          .run('listing_cold_clearance', s.id, `Eligible for clearance pack: "${s.name}" (0 views/sales in 30d)`, 'info');
      }
    }
  } catch (e) {
    console.error('[AUTO] cold listing clearance:', e.message);
  }

  return ctx;
}

async function taskScale(ctx) {
  try {
    const ampResult = await winnerEngine.amplifyWinners({ minSales: 2 });
    ctx.amplified = ampResult;
    ctx.scaled = ampResult.amplified || discovery.scaleWinners();
    if (ctx.scaled > 0) {
      console.log(`[AUTO] Amplified winners: ${ampResult.amplified} generated (${ampResult.bundles} bundles, ${ampResult.sequels} sequels, ${ampResult.siblings} siblings)`);
    }
  } catch (e) {
    console.error('[AUTO] scale/amplify winners:', e.message);
    try { ctx.scaled = discovery.scaleWinners(); } catch {}
  }
  return ctx;
}

function taskReviewGate(ctx) {
  if (typeof ctx.checkIsReviewDay === 'function' && ctx.checkIsReviewDay()) {
    const pending = db.prepare("SELECT COUNT(*) as c FROM products WHERE status = 'draft' OR status = 'pending-review'").get();
    db.prepare('INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)')
      .run('review_day', pending.c + ' products awaiting approval', 'warning');
    ctx.reviewDay = true;
    ctx.pendingCount = pending.c;
  }
  return ctx;
}

async function notifyReviewDay(ctx) {
  if (ctx.reviewDay) {
    await notifier.sendDiscord(ctx.webhookUrl, notifier.formatAlert('review_day', { count: ctx.pendingCount || 0 }));
    console.log('[AUTO] Review day — skipping generation (publish continues), sent alert');
  }
  return ctx;
}

function taskGenerate(ctx) {
  if (ctx.reviewDay) return ctx;
  const profs = db.prepare("SELECT * FROM professions WHERE status != 'archived'").all();
  let generated = 0;
  for (const prof of profs) {
    const have = new Set(db.prepare("SELECT type FROM products WHERE profession_id = ? AND status IN ('draft','pending-review')").all(prof.id).map(r => r.type));
    const missing = VARY_TYPES.filter(t => !have.has(t));
    if (!missing.length) continue;
    const type = missing[Math.floor(Math.random() * missing.length)];
    try {
      if (draftProduct(prof, type)) generated++;
    } catch (e) {
      console.error('[AUTO] generate insert:', e.message);
    }
  }
  ctx.generated = generated;
  ctx.professionCount = profs.length;
  db.prepare('INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)')
    .run('auto_generate', 'Generated ' + generated + ' products across ' + profs.length + ' professions', 'success');
  console.log('[AUTO] Generated ' + generated + ' products');
  return ctx;
}

async function notifyGenerated(ctx) {
  if (ctx.reviewDay) return ctx;
  await notifier.sendDiscord(ctx.webhookUrl, notifier.formatAlert('product_generated', {
    count: ctx.generated || 0,
    professions: ctx.professionCount || 0
  }));
  return ctx;
}

function taskSeasonal(ctx) {
  if (ctx.reviewDay) return ctx;
  try {
    const s = seasonal.generateSeasonalProduct();
    ctx.seasonal = s;
    if (s) console.log('[AUTO] Seasonal: ' + s.type + ' for ' + s.profession);
  } catch (e) {
    console.error('[AUTO] seasonal:', e.message);
  }
  return ctx;
}

async function taskPublishQueue(ctx) {
  if (runtimeConfig.isProduction()) {
    const autoStartEnabled = String(process.env.AUTO_START_ENABLED || '').toLowerCase() === 'true';
    const autoPublishEnabled = String(process.env.AUTO_PUBLISH_ENABLED || '').toLowerCase() === 'true';
    if (!autoStartEnabled || !autoPublishEnabled) {
      ctx.listed = 0;
      ctx.publishSkipped = 'production publishing is safety-locked; both AUTO_START_ENABLED=true and AUTO_PUBLISH_ENABLED=true are required';
      console.log('[AUTO] Publishing skipped — production automation and publishing must both be explicitly enabled');
      return ctx;
    }
  }
  const autoList = db.prepare('SELECT * FROM settings WHERE key = ?').get('auto_list');
  if (!autoList || autoList.value !== 'true') return ctx;

  // Deploy policy: manual ("Make-this") products are local-only — they never
  // auto-publish. Engine-generated inventory flows as before.
  const approved = db.prepare("SELECT * FROM products WHERE status = 'approved' AND marketplace_id IS NULL AND (origin IS NULL OR origin != 'manual')").all();
  let listed = 0;

  // Check Gumroad quota BEFORE attempting any publishes
  if (typeof mp.getGumroadQuota === 'function') {
    const q = mp.getGumroadQuota();
    if (q && q.remaining <= 0) {
      db.prepare('INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)')
        .run('publish_quota', 'Gumroad daily cap reached (' + q.used + '/' + q.limit + ') - skipping publish cycle', 'warning');
      ctx.listed = 0;
      return ctx;
    }
  }

  for (const p of approved) {
    // Horizon 3 Seasonal Launch Gate: Seasonal products only publish during their active peak window
    if (typeof seasonal.isSeasonalWindowActive === 'function' && !seasonal.isSeasonalWindowActive(p)) {
      db.prepare('INSERT INTO automation_log (action, product_id, details, status) VALUES (?, ?, ?, ?)')
        .run('publish_seasonal_gate', p.id, `Publish held: product #${p.id} waiting for seasonal peak window`, 'info');
      continue;
    }

    // Re-check quota before each publish (in case we hit the limit mid-cycle)
    if (typeof mp.getGumroadQuota === 'function') {
      const q = mp.getGumroadQuota();
      if (q && q.remaining <= 0) {
        db.prepare('INSERT INTO automation_log (action, product_id, details, status) VALUES (?, ?, ?, ?)')
          .run('publish_quota', p.id, 'Gumroad daily cap reached mid-cycle (' + q.used + '/' + q.limit + ')', 'warning');
        break;
      }
    }
    
    try {
      const result = await mp.publishProduct(p);
      const pub = validatePublishResult(result);
      db.prepare('UPDATE products SET status = ?, marketplace = ?, marketplace_id = ? WHERE id = ?')
        .run('listed', pub.platform, pub.listingId, p.id);
      listed++;
      
      // Add delay between publishes to avoid rate limits (2 seconds)
      if (listed < approved.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (e) {
      db.prepare('INSERT INTO automation_log (action, product_id, details, status) VALUES (?, ?, ?, ?)')
        .run('publish_error', p.id, e.message, 'error');
      if (/daily|limit|10 per|creation|429/i.test(e.message || '')) {
        if (typeof mp.markGumroadQuotaExhausted === 'function') mp.markGumroadQuotaExhausted(e.message);
        break;
      }
    }
  }

  ctx.listed = listed;
  if (listed > 0) {
    db.prepare('INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)')
      .run('auto_list', 'Auto-listed ' + listed + ' approved products', 'success');
    console.log('[AUTO] Auto-listed ' + listed + ' products');
    await notifier.sendDiscord(ctx.webhookUrl, notifier.formatAlert('auto_listed', { count: listed }));
  }
  return ctx;
}

// Run a single pipeline stage in isolation so one failure never aborts the rest.
async function safeTask(ctx, label, fn) {
  try {
    return await fn();
  } catch (e) {
    console.error(`[AUTO] ${label}:`, e.message);
    try {
      db.prepare('INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)')
        .run('task_error', `${label}: ${e.message}`, 'error');
    } catch {}
  }
}

async function runFullCycle(deps) {
  deps = deps || {};
  const ctx = {
    webhookUrl: getWebhookUrl(),
    checkIsReviewDay: deps.checkIsReviewDay,
    syncGumroadSales: deps.syncGumroadSales,
    reviewDay: false,
    found: [],
    generated: 0,
    listed: 0
  };
  console.log('[AUTO] Running auto-cycle (modular pipeline)...');
  await safeTask(ctx, 'scan', () => taskScan(ctx));
  safeTask(ctx, 'freshness', () => taskFreshness(ctx));
  await safeTask(ctx, 'sales-sync', () => taskSalesSync(ctx));
  safeTask(ctx, 'retire', () => taskRetire(ctx));
  await safeTask(ctx, 'scale', () => taskScale(ctx));
  safeTask(ctx, 'review-gate', () => taskReviewGate(ctx));
  await safeTask(ctx, 'notify-review-day', () => notifyReviewDay(ctx));
  if (!ctx.reviewDay) {
    safeTask(ctx, 'generate', () => taskGenerate(ctx));
    await safeTask(ctx, 'notify-generated', () => notifyGenerated(ctx));
    safeTask(ctx, 'seasonal', () => taskSeasonal(ctx));
  }
  await safeTask(ctx, 'publish-queue', () => taskPublishQueue(ctx));
  safeTask(ctx, 'pin-schedule', () => taskPinSchedule(ctx));
  safeTask(ctx, 'pin-drain', () => taskPinDrain(ctx));
  await safeTask(ctx, 'design-reskin', () => taskDesignReskin(ctx));
  return ctx;
}

// DESIGN QUALITY Phase 4: products with >= 2 sales but a weak design score
// (< 7) get ONE automatic reskin attempt — a fresh generated brief re-rendered
// over unchanged content. Never throws; unscored products are never touched
// (null score ≠ weak). Owner scope: products created on/after FOCUS_SINCE.
async function taskDesignReskin(ctx) {
  try {
    const critic = require('./designCritic');
    const candidates = critic.autoReskinCandidates({ limit: 3 });
    ctx.designReskinned = 0;
    for (const c of candidates) {
      const result = await critic.reskinProduct(c.productId);
      critic.markAutoReskin(c.productId, result);
      if (result && result.ok) ctx.designReskinned++;
      console.log(`[AUTO] design-reskin #${c.productId} (${c.name}) score ${c.score} -> ${result && result.ok ? 'ok' : 'failed'}`);
    }
  } catch (e) {
    console.error('[AUTO] design-reskin:', e.message);
  }
  return ctx;
}

// AUTONOMOUS PINS: every listed product without a scheduled pin gets one
// (AI copy when the model is on, deterministic fallback otherwise). Runs in
// the same cycle that publishes, so publish → pin is automatic. The drain
// task then dispatches to Pinterest API v5 when credentials exist.
function taskPinSchedule(ctx) {
  try {
    const pinEngine = require('./pinEngine');
    pinEngine.scheduleForProductsAI(6).then(result => {
      ctx.pinsScheduled = result.created;
      if (result.created > 0) console.log('[AUTO] Scheduled ' + result.created + ' new pin(s) for listed products');
    }).catch(e => { ctx.pinsScheduled = 0; console.error('[AUTO] pin schedule:', e.message); });
  } catch (e) {
    ctx.pinsScheduled = 0;
    console.error('[AUTO] pin schedule:', e.message);
  }
  return ctx;
}

// PHASE 5: mark due pins as posted so the queue stays honest between
// human Pinterest sessions. Posting itself needs a Pinterest token
// (optional upgrade); NicheGate owns scheduling + attribution data.
function taskPinDrain(ctx) {
  try {
    const pinEngine = require('./pinEngine');
    const due = pinEngine.duePins(10);
    ctx.pinsPosted = due.length;
    if (due.length > 0) console.log('[AUTO] Marked ' + due.length + ' pin(s) as ready/posted');
  } catch (e) {
    console.error('[AUTO] pin drain:', e.message);
  }
  return ctx;
}

module.exports = {
  runFullCycle,
  taskScan,
  taskFreshness,
  taskSalesSync,
  taskRetire,
  taskScale,
  taskReviewGate,
  taskGenerate,
  taskSeasonal,
  taskPublishQueue,
  taskPinDrain,
  taskDesignReskin,
  getWebhookUrl,
  TYPE_PRICES,
  VARY_TYPES
};

