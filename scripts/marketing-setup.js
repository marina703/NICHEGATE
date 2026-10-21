#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// MARKETING SETUP — channel health validation CLI.
// Run:  node scripts/marketing-setup.js
//
// Reports the real configuration state of every marketing distribution channel
// (env vars + DB tokens) so the operator knows exactly which OAuth flow is
// still pending. Generates OAuth URLs where the keys are ready. Exits with a
// non-zero code equal to the number of unconfigured channels (0 = all live).
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

const path = require('path');
const root = path.join(__dirname, '..');
// Load .env the same way the server does (server/index.js: require('dotenv').config)
try { require('dotenv').config({ path: path.join(root, '.env'), quiet: true }); } catch { /* dotenv always present */ }
const { init, db } = require(path.join(root, 'server', 'database'));
init();

const marketplace = require(path.join(__dirname, '..', 'server', 'services', 'marketplace'));
const pinEngine = require(path.join(__dirname, '..', 'server', 'services', 'pinEngine'));
const tiktokAds = require(path.join(__dirname, '..', 'server', 'services', 'tiktokAds'));
const socialPoster = require(path.join(__dirname, '..', 'server', 'services', 'socialPoster'));
const seqEngine = require(path.join(__dirname, '..', 'server', 'services', 'sequenceEngine'));
const buffer = require(path.join(__dirname, '..', 'server', 'services', 'bufferBridge'));

// ── Helpers ──────────────────────────────────────────────────────────────────
const env = (k) => process.env[k];
const envSet = (k) => !!(env(k) && env(k).trim() && !env(k).startsWith('your_'));
const tokenRow = (platform) => {
  try { return db.prepare('SELECT * FROM marketplace_tokens WHERE platform = ?').get(platform); }
  catch { return null; }
};

// ── Per-channel checks ───────────────────────────────────────────────────────
const channels = [];

function check(label, ok, detail) {
  channels.push({ label, ok, detail });
  return ok;
}

// 1. Marketplace publishing
const gumOk = check(
  'Gumroad (publishing)',
  envSet('GUMROAD_ACCESS_TOKEN'),
  envSet('GUMROAD_ACCESS_TOKEN') ? 'token present' : 'set GUMROAD_ACCESS_TOKEN in .env'
);

const etsyKeysOk = marketplace.checkEtsyKeys().ok;
const etsyToken = tokenRow('etsy');
const etsyOk = check(
  'Etsy (publishing)',
  etsyKeysOk && !!etsyToken && !!etsyToken.access_token,
  etsyKeysOk
    ? (etsyToken ? 'keys set + token stored (OAuth complete)' : 'keys set — complete OAuth at /setup or via this script')
    : 'ETSY_CLIENT_ID/SECRET missing in .env'
);

// 2. Pinterest
const pinToken = tokenRow('pinterest');
const pinOk = check(
  'Pinterest (pins)',
  !!(envSet('PINTEREST_ACCESS_TOKEN') || (pinToken && pinToken.access_token) || buffer.bufferStatus().configured),
  envSet('PINTEREST_ACCESS_TOKEN')
    ? 'PINTEREST_ACCESS_TOKEN set'
    : (pinToken ? 'token in marketplace_tokens' : (buffer.bufferStatus().configured ? 'Buffer bridge configured' : 'no token — direct API or Buffer bridge (Section 4.2)'))
);

// 3. TikTok
const ttOk = check(
  'TikTok Ads',
  envSet('TIKTOK_ACCESS_TOKEN') && envSet('TIKTOK_ADVERTISER_ID'),
  envSet('TIKTOK_ACCESS_TOKEN') && envSet('TIKTOK_ADVERTISER_ID')
    ? 'token + advertiser ID set'
    : 'set TIKTOK_ACCESS_TOKEN + TIKTOK_ADVERTISER_ID (Section 4.3)'
);

// 4. Reddit / X
const redditOk = check(
  'Reddit (social)',
  !!(envSet('REDDIT_ACCESS_TOKEN') || (tokenRow('reddit') && tokenRow('reddit').access_token)),
  (envSet('REDDIT_ACCESS_TOKEN') || (tokenRow('reddit') && tokenRow('reddit').access_token))
    ? 'token present'
    : 'set REDDIT_ACCESS_TOKEN (Section 4.4)'
);
const xOk = check(
  'X / Twitter (social)',
  envSet('X_BEARER_TOKEN'),
  envSet('X_BEARER_TOKEN') ? 'bearer token set' : 'set X_BEARER_TOKEN (Section 4.4)'
);

// 5. Email / ESP
const espOk = check(
  'Email / ESP (sequences)',
  envSet('ESP_WEBHOOK_URL'),
  envSet('ESP_WEBHOOK_URL') ? 'webhook URL set' : 'set ESP_WEBHOOK_URL (Section 4.5)'
);

// 6. Production gates
const publishGate = check(
  'Production publish gate',
  String(env('AUTO_PUBLISH_ENABLED') || '').toLowerCase() === 'true',
  String(env('AUTO_PUBLISH_ENABLED') || '').toLowerCase() === 'true'
    ? 'AUTO_PUBLISH_ENABLED=true'
    : 'set AUTO_PUBLISH_ENABLED=true to auto-list products'
);
const marketGate = check(
  'Marketing auto gate',
  String(env('MARKETING_AUTO_ENABLED') || '').toLowerCase() === 'true',
  String(env('MARKETING_AUTO_ENABLED') || '').toLowerCase() === 'true'
    ? 'MARKETING_AUTO_ENABLED=true'
    : 'set MARKETING_AUTO_ENABLED=true to auto-run the 6h marketing cycle'
);

// 7. Discord alert filters
const niches = {
  professions: (env('ALERT_NICHE_PROFESSIONS') || '').split(',').map(s=>s.trim()).filter(Boolean),
  categories: (env('ALERT_NICHE_CATEGORIES') || '').split(',').map(s=>s.trim()).filter(Boolean),
  hobbies: (env('ALERT_NICHE_HOBBIES') || '').split(',').map(s=>s.trim()).filter(Boolean),
  clubs: (env('ALERT_NICHE_CLUBS') || '').split(',').map(s=>s.trim()).filter(Boolean),
  beliefs: (env('ALERT_NICHE_BELIEFS') || '').split(',').map(s=>s.trim()).filter(Boolean),
};
const nicheCount = Object.values(niches).reduce((n, v) => n + v.length, 0);
const nicheOk = check(
  'Discord alert niche filters',
  nicheCount > 0,
  nicheCount > 0
    ? `${nicheCount} filter(s) active`
    : 'set ALERT_NICHE_* env vars (Section 4.6) — otherwise alerts fire on ALL trends'
);

// ── OAuth URL generation + Report (async: Etsy auth URL needs await) ─────────
(async () => {
let oauthUrls = [];
if (etsyKeysOk && !etsyToken) {
  try {
    const urls = await marketplace.getEtsyAuthUrl();
    oauthUrls.push({
      channel: 'Etsy',
      url: urls.url,
      instructions: urls.instructions,
      note: 'Visit the URL, authorize, and the server auto-exchanges the code for tokens.'
    });
  } catch (e) {
    oauthUrls.push({ channel: 'Etsy', error: e.message });
  }
}

// ── Report ───────────────────────────────────────────────────────────────────
console.log('\n' + '═══'.repeat(20));
console.log('  NicheGate Marketing Bot — Channel Health Report');
console.log('═══'.repeat(20) + '\n');

let configured = 0;
for (const c of channels) {
  const mark = c.ok ? '✅' : '❌';
  console.log(`  ${mark} ${c.label}`);
  console.log(`      ${c.detail}`);
  if (c.ok) configured++;
}

if (oauthUrls.length) {
  console.log('\n  --- OAuth URLs (keys ready, authorization pending) ---');
  for (const u of oauthUrls) {
    if (u.url) {
      console.log(`\n  ${u.channel}: ${u.url}`);
      console.log(`  ${u.note}`);
    } else if (u.error) {
      console.log(`  ${u.channel}: ERROR — ${u.error}`);
    }
  }
}

const unconfigured = channels.filter(c => !c.ok).length;
console.log('\n' + '═══'.repeat(20));
console.log(`  ${configured}/${channels.length} checks pass — ${unconfigured} need attention`);
console.log('═══'.repeat(20) + '\n');

if (unconfigured > 0) {
  console.log('  Run the full cycle once configured:');
  console.log('    curl -X POST http://localhost:5000/api/marketing/cycle\n');
  console.log('  Dashboard (live channel health):');
  console.log('    GET http://localhost:5000/api/marketing/dashboard\n');
  console.log('  Setup status:');
  console.log('    GET http://localhost:5000/api/setup/status\n');
  process.exit(unconfigured);
}

console.log('  All channels configured. The marketing bot is live.\n');
process.exit(0);
})();
