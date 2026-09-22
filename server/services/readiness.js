// ═══════════════════════════════════════════════════════════════════════════
// LAUNCH READINESS — surfaces the config/state gaps that block revenue.
// All secret values are reduced to booleans/presence; nothing sensitive is
// ever printed. Read-only (never writes DB).
// ═══════════════════════════════════════════════════════════════════════════

const { db } = require('../database');

const BIND_HOST = process.env.BIND_HOST || (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT ? '0.0.0.0' : '127.0.0.1');

function keysMisconfigured(clientId, clientSecret) {
  const a = String(clientId || '');
  const b = String(clientSecret || '');
  return !!(a && b && a === b);
}

function count(sql, ...args) { return db.prepare(sql).get(...args).c; }

function issue(key, severity, message) { return { key, severity, message }; }

function buildReadinessReport() {
  const issues = [];

  // Gumroad publishing
  if (!process.env.GUMROAD_ACCESS_TOKEN) {
    issues.push(issue('gumroad_key', 'error', 'GUMROAD_ACCESS_TOKEN is not set — publishing is disabled.'));
  }

  // Etsy
  const id = process.env.ETSY_CLIENT_ID;
  const secret = process.env.ETSY_CLIENT_SECRET;
  // Etsy's portals label the x-api-key inconsistently; the keystring may legitimately
  // equal ETSY_SHARED_SECRET. Only an id===secret clash WITHOUT a distinct shared
  // secret is a real misconfiguration.
  const shared = process.env.ETSY_SHARED_SECRET;
  const etsyToken = count("SELECT COUNT(*) c FROM marketplace_tokens WHERE platform = 'etsy'") > 0;
  if (!id || !secret) {
    issues.push(issue('etsy_keys', 'error', 'ETSY_CLIENT_ID and/or ETSY_CLIENT_SECRET missing in .env.'));
  } else if (keysMisconfigured(id, secret) && !shared) {
    issues.push(issue('etsy_keys', 'error', 'ETSY_CLIENT_ID equals ETSY_CLIENT_SECRET and no ETSY_SHARED_SECRET is set — a misconfiguration that breaks token exchange/refresh. Set the real keystring and secret (two different values).'));
  } else if (!etsyToken) {
    issues.push(issue('etsy_oauth', 'warning', 'Etsy keys are set but OAuth is not completed (no token stored). Connect at /setup.'));
  }

  // Hosting reachability
  if (BIND_HOST !== '0.0.0.0') {
    issues.push(issue('bind_host', 'warning', `BIND_HOST=${BIND_HOST} — the server only accepts local connections. Hosts need 0.0.0.0.`));
  }

  // Alerts
  const webhook = !!(process.env.DISCORD_WEBHOOK_URL || db.prepare("SELECT value FROM settings WHERE key = 'webhook_url'").get()?.value);
  if (!webhook) issues.push(issue('discord', 'info', 'No Discord webhook — you will not receive sale/trend/error alerts.'));

  // Inventory backlog
  const drafts = count("SELECT COUNT(*) c FROM products WHERE status IN ('draft','pending-review')");
  const approvedUnlisted = count("SELECT COUNT(*) c FROM products WHERE status = 'approved' AND marketplace_id IS NULL");
  const bundlesQueued = count("SELECT COUNT(*) c FROM products WHERE type = 'bundle' AND status != 'listed' AND marketplace_id IS NULL");
  if (drafts > 0) issues.push(issue('backlog_drafts', 'info', `${drafts} draft product(s) not yet approved/listed.`));
  if (approvedUnlisted > 0) issues.push(issue('backlog_approved', 'warning', `${approvedUnlisted} approved product(s) not yet listed.`));
  if (bundlesQueued > 0) issues.push(issue('backlog_bundles', 'warning', `${bundlesQueued} toolkit bundle(s) still queued for publishing.`));

  // Auto-list
  const autoList = db.prepare("SELECT value FROM settings WHERE key = 'auto_list'").get()?.value === 'true';
  if (!autoList) issues.push(issue('auto_list', 'info', 'auto_list is off — approved products are not auto-listed during cycles.'));

  // Branding drift
  const storeUrl = db.prepare("SELECT value FROM settings WHERE key = 'store_url'").get()?.value;
  if (storeUrl && /marinablow/i.test(storeUrl)) {
    issues.push(issue('store_branding', 'info', 'Store URL still points to the old "marinablow" Gumroad username.'));
  }

  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');

  return {
    ok: errors.length === 0,
    ready: errors.length === 0 && warnings.length === 0,
    issues,
    summary: {
      gumroadKey: !!process.env.GUMROAD_ACCESS_TOKEN,
      etsyKeys: !!(id && secret) && !keysMisconfigured(id, secret),
      etsyConnected: etsyToken,
      discord: webhook,
      bindHost: BIND_HOST,
      autoList,
      drafts,
      approvedUnlisted,
      bundlesQueued,
      realSales: db.prepare('SELECT COALESCE(SUM(sales),0) s FROM metrics').get().s
    }
  };
}

// Print a non-secret summary of launch blockers to the console at boot.
function logReadinessIssues() {
  const r = buildReadinessReport();
  for (const i of r.issues) {
    const tag = i.severity === 'error' ? '❌' : i.severity === 'warning' ? '⚠️' : 'ℹ️';
    console.log(`[READY] ${tag} ${i.message}`);
  }
  console.log(`[READY] ${r.ok ? 'Launch blockers: none' : 'Launch blockers present — see above.'} (${r.summary.etsyConnected ? 'Etsy connected' : 'Etsy not connected'}, ${r.summary.realSales} real sale(s))`);
}

module.exports = { buildReadinessReport, keysMisconfigured, logReadinessIssues };