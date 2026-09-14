// AUTOMATION CYCLE — modular stateful tasks for the 6-hour full cycle.
const { db } = require('../database');
const discovery = require('./discovery');
const seasonal = require('./seasonalEngine');
const notifier = require('./notifier');
const mp = require('./marketplace');
const { validatePublishResult } = require('./pipelineSchemas');
const { draftProduct } = require('./productDraft');

const TYPE_PRICES = { invoice: '$12', checklist: '$10', spreadsheet: '$17', booking: '$22', social: '$15' };
const VARY_TYPES = ['invoice', 'checklist', 'spreadsheet', 'booking', 'social'];

function getWebhookUrl() {
  const stored = db.prepare('SELECT value FROM settings WHERE key = ?').get('webhook_url');
  return (stored && stored.value) || process.env.DISCORD_WEBHOOK_URL || '';
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
  if (typeof ctx.syncGumroadSales === 'function') {
    try { ctx.sales = await ctx.syncGumroadSales(); }
    catch (e) { console.error('[AUTO] sales sync:', e.message); }
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
  const autoList = db.prepare('SELECT * FROM settings WHERE key = ?').get('auto_list');
  if (!autoList || autoList.value !== 'true') return ctx;

  const approved = db.prepare("SELECT * FROM products WHERE status = 'approved' AND marketplace_id IS NULL").all();
  let listed = 0;

  for (const p of approved) {
    if (typeof mp.getGumroadQuota === 'function') {
      const q = mp.getGumroadQuota();
      if (q && q.remaining <= 0) {
        db.prepare('INSERT INTO automation_log (action, product_id, details, status) VALUES (?, ?, ?, ?)')
          .run('publish_quota', p.id, 'Gumroad daily cap reached (' + q.used + '/' + q.limit + ')', 'warning');
        break;
      }
    }
    try {
      const result = await mp.publishProduct(p);
      const pub = validatePublishResult(result);
      db.prepare('UPDATE products SET status = ?, marketplace = ?, marketplace_id = ? WHERE id = ?')
        .run('listed', pub.platform, pub.listingId, p.id);
      listed++;
    } catch (e) {
      db.prepare('INSERT INTO automation_log (action, product_id, details, status) VALUES (?, ?, ?, ?)')
        .run('publish_error', p.id, e.message, 'error');
      if (/daily|limit|10 per|creation/i.test(e.message || '')) {
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
  safeTask(ctx, 'review-gate', () => taskReviewGate(ctx));
  await safeTask(ctx, 'notify-review-day', () => notifyReviewDay(ctx));
  if (!ctx.reviewDay) {
    safeTask(ctx, 'generate', () => taskGenerate(ctx));
    await safeTask(ctx, 'notify-generated', () => notifyGenerated(ctx));
    safeTask(ctx, 'seasonal', () => taskSeasonal(ctx));
  }
  await safeTask(ctx, 'publish-queue', () => taskPublishQueue(ctx));
  return ctx;
}

module.exports = {
  runFullCycle,
  taskScan,
  taskFreshness,
  taskSalesSync,
  taskReviewGate,
  taskGenerate,
  taskSeasonal,
  taskPublishQueue,
  getWebhookUrl,
  TYPE_PRICES,
  VARY_TYPES
};
