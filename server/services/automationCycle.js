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

// The autonomous cycle should also be able to produce product types the factory
// registered at RUNTIME (capabilityEngine), not just the static set above — that
// is the whole point of being self-expanding. With an empty dynamic table this
// returns exactly VARY_TYPES, so existing behavior/tests are unchanged.
function getVaryTypes() {
  const base = VARY_TYPES.slice();
  try {
    const cap = require('./capabilityEngine');
    for (const t of cap.listDynamicTypes()) {
      if (t.status === 'active' && !base.includes(t.key)) base.push(t.key);
    }
  } catch (e) { /* capability engine unavailable — fall back to static */ }
  return base;
}

function getWebhookUrl() {
  const stored = db.prepare('SELECT value FROM settings WHERE key = ?').get('webhook_url');
  return [stored && stored.value, process.env.DISCORD_WEBHOOK_URL].find(runtimeConfig.isDiscordWebhookUrl) || '';
}

async function taskScan(ctx) {
  const found = await discovery.sweep(6);
  ctx.found = found;

// Optional niche filtering: alert on trends matching preferred professions,
// categories, hobbies, clubs, or beliefs.
// Env vars (comma-separated):
//   ALERT_NICHE_PROFESSIONS  — profession slugs (e.g. beekeeping,woodworking)
//   ALERT_NICHE_CATEGORIES   — category slugs from nicheUniverse (e.g. trades,creative,outdoor)
//   ALERT_NICHE_HOBBIES      — hobby keywords matched against trend name/why (e.g. beekeeping,pottery)
//   ALERT_NICHE_CLUBS        — club/community keywords (e.g. recovery,aa-recovery,na)
//   ALERT_NICHE_BELIEFS      — belief/spiritual keywords (e.g. sober-curious,breathwork)
// If none are set, behavior defaults to original (first trend) for backward compat.
const prefProfessions = (process.env.ALERT_NICHE_PROFESSIONS || '').split(',').map(s => s.trim()).filter(s => s);
const prefCategories = (process.env.ALERT_NICHE_CATEGORIES || '').split(',').map(s => s.trim()).filter(s => s);
const prefHobbies = (process.env.ALERT_NICHE_HOBBIES || '').split(',').map(s => s.trim().toLowerCase()).filter(s => s);
const prefClubs = (process.env.ALERT_NICHE_CLUBS || '').split(',').map(s => s.trim().toLowerCase()).filter(s => s);
const prefBeliefs = (process.env.ALERT_NICHE_BELIEFS || '').split(',').map(s => s.trim().toLowerCase()).filter(s => s);

const hasPrefs = prefProfessions.length || prefCategories.length || prefHobbies.length || prefClubs.length || prefBeliefs.length;

function trendMatchesAlert(trend) {
  if (!hasPrefs) return true; // no prefs = accept all (backward compat handled below)

  const name = String(trend.name || '').toLowerCase();
  const why = String(trend.why || '').toLowerCase();
  const combined = name + ' ' + why;

  // 1. Profession match
  if (prefProfessions.length) {
    const prof = discovery.resolveProfessionForTrend(trend);
    if (prof && prefProfessions.includes(prof.slug)) return true;
  }

  // 2. Category match — check nicheUniverse for the trend's category
  if (prefCategories.length) {
    try {
      const { UNIVERSE } = require('./nicheUniverse');
      const entry = UNIVERSE.find(u => u.name.toLowerCase() === name.replace(/\\s*\\(seasonal\\)\\s*$/i, '').trim().toLowerCase());
      if (entry && prefCategories.includes(entry.category)) return true;
    } catch (e) { /* nicheUniverse unavailable */ }
    // Also check why field for category hints (e.g. "Discovery · beauty · ...")
    for (const cat of prefCategories) {
      if (why.includes(cat.toLowerCase())) return true;
    }
  }

  // 3. Hobby keyword match (trend name or why)
  if (prefHobbies.length) {
    for (const kw of prefHobbies) {
      if (combined.includes(kw)) return true;
    }
  }

  // 4. Club/community keyword match
  if (prefClubs.length) {
    for (const kw of prefClubs) {
      if (combined.includes(kw)) return true;
    }
  }

  // 5. Belief/spiritual keyword match
  if (prefBeliefs.length) {
    for (const kw of prefBeliefs) {
      if (combined.includes(kw)) return true;
    }
  }

  return false;
}

let filtered = hasPrefs
  ? found.filter(trendMatchesAlert)
  : found;

ctx.trend = filtered[0] || found[0] || null;
if (ctx.trend) {
  const prof = discovery.resolveProfessionForTrend(ctx.trend);
  const profTag = prof ? ` (profession: ${prof.name})` : '';
  const categoryTag = (() => {
    try {
      const { UNIVERSE } = require('./nicheUniverse');
      const base = String(ctx.trend.name || '').replace(/\\s*\\(seasonal\\)\\s*$/i, '').trim().toLowerCase();
      const entry = UNIVERSE.find(u => u.name.toLowerCase() === base);
      return entry ? ` [${entry.category}]` : '';
    } catch (e) { return ''; }
  })();
  console.log('[AUTO] Trend detected:' + profTag + categoryTag + ' ' + ctx.trend.name);
  db.prepare('INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)')
    .run('trend_detected', 'Detected: ' + ctx.trend.name + profTag + categoryTag, 'warning');
  await notifier.sendAlert(ctx.webhookUrl, 'trend_detected', ctx.trend);
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
    await notifier.sendAlert(ctx.webhookUrl, 'review_day', { count: ctx.pendingCount || 0 });
    console.log('[AUTO] Review day — skipping generation (publish continues), sent alert');
  }
  return ctx;
}

function taskGenerate(ctx) {
  if (ctx.reviewDay) return ctx;
  const profs = db.prepare("SELECT * FROM professions WHERE status != 'archived'").all();
  let generated = 0;
  for (const prof of profs) {
    const have = new Set(db.prepare("SELECT type FROM products WHERE profession_id = ? AND status IN ('draft','pending-review','approved','listed','published')").all(prof.id).map(r => r.type));
    const missing = getVaryTypes().filter(t => !have.has(t));
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
  await notifier.sendAlert(ctx.webhookUrl, 'product_generated', {
    count: ctx.generated || 0,
    professions: ctx.professionCount || 0
  });
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

  // Deploy policy: manual ("Make-this") products are auto-published when
  // AUTO_PUBLISH_MANUAL=true is set; default remains opt-out for safety.
  const includeManual = String(process.env.AUTO_PUBLISH_MANUAL || '').toLowerCase() === 'true';
  const approved = db.prepare("SELECT * FROM products WHERE status = 'approved' AND marketplace_id IS NULL AND (origin IS NULL OR ? = 1 OR origin != 'manual')").all(includeManual ? 1 : 0);
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
    await notifier.sendAlert(ctx.webhookUrl, 'auto_listed', { count: listed });
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

// ═══ QUALITY GATE (opt-in auto-approval) ═══
// qualityEngine audits every draft/pending-review product on the 5-dimension
// rubric; FLIGHT_READY (>= 85, zero defects, real on-disk file) products are
// auto-approved into the publish queue when QUALITY_AUTO_APPROVE=true.
// Default OFF — the review queue stays human-owned until the operator opts
// in. origin='manual' products carry a human brief and are never auto-
// approved. Never throws; production publishing locks are untouched.
function taskQualityGate(ctx) {
  try {
    const optIn = String(process.env.QUALITY_AUTO_APPROVE || '').toLowerCase() === 'true';
    ctx.qualityAutoApprove = optIn;
    if (!optIn) return ctx;
    const qualityEngine = require('./qualityEngine');
    const rows = db.prepare("SELECT * FROM products WHERE status IN ('draft','pending-review') AND (origin IS NULL OR origin != 'manual') LIMIT 50").all();
    let approved = 0;
    let grounded = 0;
    for (const p of rows) {
      const audit = qualityEngine.auditProductById(p.id);
      if (audit && audit.flightReady) {
        db.prepare('UPDATE products SET status = ? WHERE id = ?').run('approved', p.id);
        db.prepare('INSERT INTO automation_log (action, product_id, details, status) VALUES (?, ?, ?, ?)')
          .run('quality_auto_approve', p.id, `FLIGHT_READY ${audit.score}/100 — auto-approved`, 'success');
        approved++;
      } else if (audit) {
        grounded++;
      }
    }
    ctx.qualityApproved = approved;
    ctx.qualityGrounded = grounded;
    if (approved > 0) console.log(`[AUTO] Quality gate: ${approved} flight-ready product(s) auto-approved, ${grounded} held for review`);
  } catch (e) {
    console.error('[AUTO] quality gate:', e.message);
  }
  return ctx;
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
  safeTask(ctx, 'quality-gate', () => taskQualityGate(ctx));
  await safeTask(ctx, 'cover-studio', () => taskCoverStudio(ctx));
  await safeTask(ctx, 'publish-queue', () => taskPublishQueue(ctx));
  safeTask(ctx, 'pin-schedule', () => taskPinSchedule(ctx));
  await safeTask(ctx, 'pin-drain', () => taskPinDrain(ctx));
  await safeTask(ctx, 'design-reskin', () => taskDesignReskin(ctx));
  await safeTask(ctx, 'marketing-bot', () => taskMarketingBot(ctx));
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

// ENDLESS COVERS: generate Style-DNA covers for a few products each cycle so
// the catalog keeps producing fresh, unique looks (bounded to keep cost sane).
// Runs BEFORE the publish queue so the gate sees the new cover.
async function taskCoverStudio(ctx) {
  ctx.coversGenerated = 0;
  try {
    const fs = require('fs');
    const coverStudio = require('./coverStudio');
    const heroArt = require('./heroArt');
    const fileFactory = require('./fileFactory');
    const limit = Number(ctx.coverStudioLimit || 3);
    const rows = db.prepare(
      `SELECT * FROM products
       WHERE (preview_path IS NULL OR preview_path NOT LIKE '%covdna%')
         AND status IN ('draft','approved','listed')
       ORDER BY id DESC LIMIT ?`
    ).all(limit);
    for (const product of rows) {
      try {
        const prof = db.prepare('SELECT * FROM professions WHERE id = ?').get(product.profession_id);
        if (!prof) continue;
        let heroDataUri = null;
        try {
          const hp = await heroArt.ensureHeroArt(product, prof, fileFactory.fallbackTheme(product));
          if (hp && fs.existsSync(hp)) {
            const b64 = fs.readFileSync(hp).toString('base64');
            heroDataUri = 'data:' + (hp.match(/\.png$/i) ? 'image/png' : 'image/jpeg') + ';base64,' + b64;
          }
        } catch (e) { /* typographic/abstract needs no photo */ }
        const out = await coverStudio.generateCover({ product, prof, heroDataUri });
        if (out.qa && out.qa.ok) {
          db.prepare('UPDATE products SET preview_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(out.pngPath, product.id);
          ctx.coversGenerated++;
        } else {
          console.log('[AUTO] cover-studio #' + product.id + ' failed invariants: ' + ((out.qa && out.qa.failures.join('; ')) || 'unknown'));
        }
      } catch (e) {
        console.error('[AUTO] cover-studio #' + product.id + ':', e.message);
      }
    }
    if (ctx.coversGenerated) console.log('[AUTO] cover-studio generated ' + ctx.coversGenerated + ' DNA cover(s)');
  } catch (e) {
    console.error('[AUTO] cover-studio:', e.message);
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
async function taskPinDrain(ctx) {
  try {
    const pinEngine = require('./pinEngine');
    const due = await pinEngine.duePins(10);
    ctx.pinsPosted = due.length;
    if (due.length > 0) console.log('[AUTO] Marked ' + due.length + ' pin(s) as ready/posted');
  } catch (e) {
    console.error('[AUTO] pin drain:', e.message);
  }
  return ctx;
}

// PHASE 6+ MARKETING BOT — the autonomous growth engine. Runs the full
// distribution cycle (pins → TikTok ads → Reddit/X posts → email sequences →
// newsletter → cross-channel metrics). Self-healing: an unconfigured channel
// produces ready-to-import creatives instead of failing. Never throws; the
// marketing step is opt-in via MARKETING_AUTO_ENABLED (default on in dev).
async function taskMarketingBot(ctx) {
  try {
    // Safety: production requires explicit marketing opt-in, same pattern as
    // the other production gates. Dev defaults to enabled.
    if (runtimeConfig.isProduction()) {
      const enabled = String(process.env.MARKETING_AUTO_ENABLED || '').toLowerCase() === 'true';
      if (!enabled) {
        ctx.marketingSkipped = 'production marketing requires MARKETING_AUTO_ENABLED=true';
        console.log('[AUTO] Marketing bot skipped — production marketing must be explicitly enabled');
        return ctx;
      }
    }

    const bot = require('./marketingBot');
    const result = await bot.runMarketingCycle({});
    ctx.marketing = {
      pinsScheduled: result.pinsScheduled,
      tiktokAdsCreated: result.tiktokAdsCreated,
      socialPostsScheduled: result.socialPostsScheduled,
      socialPostsDispatched: result.socialPostsDispatched,
      emailSequencesGenerated: result.emailSequencesGenerated,
      newsletterGenerated: result.newsletterGenerated
    };
    const parts = [];
    if (result.pinsScheduled) parts.push(`${result.pinsScheduled} pins`);
    if (result.tiktokAdsCreated) parts.push(`${result.tiktokAdsCreated} ads`);
    if (result.socialPostsScheduled) parts.push(`${result.socialPostsScheduled} posts`);
    if (result.emailSequencesGenerated) parts.push(`${result.emailSequencesGenerated} sequences`);
    if (parts.length) console.log('[AUTO] Marketing cycle: ' + parts.join(', '));
  } catch (e) {
    console.error('[AUTO] marketing bot:', e.message);
  }
  return ctx;
}

module.exports = {
  runFullCycle,
  getVaryTypes,
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
  taskMarketingBot,
  taskDesignReskin,
  taskCoverStudio,
  taskQualityGate,
  getWebhookUrl,
  TYPE_PRICES,
  VARY_TYPES
};

