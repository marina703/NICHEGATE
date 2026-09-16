const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { db } = require('../database');
const seo = require('./seoEngine');
const { ensureProductFile } = require('./fileFactory');

const ETSY_API_BASE = 'https://openapi.etsy.com/v3';
const GUMROAD_API_BASE = 'https://api.gumroad.com/v2';

// Etsy v3 requires BOTH the keystring and shared secret in x-api-key on every request.
function etsyApiKey() {
  return `${process.env.ETSY_CLIENT_ID}:${process.env.ETSY_CLIENT_SECRET}`;
}


// ── KEY VALIDATION ──
function checkEtsyKeys() {
  const clientId = process.env.ETSY_CLIENT_ID;
  const clientSecret = process.env.ETSY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { ok: false, message: 'ETSY_CLIENT_ID and/or ETSY_CLIENT_SECRET missing in .env' };
  }
  if (clientId === clientSecret) {
    return { ok: false, misconfiguredKeys: true, message: 'ETSY_CLIENT_ID and ETSY_CLIENT_SECRET are identical — set the real keystring and secret (two different values).' };
  }
  return { ok: true };
}

function checkGumroadKey() {
  const token = process.env.GUMROAD_ACCESS_TOKEN;
  if (!token) {
    return { ok: false, message: 'GUMROAD_ACCESS_TOKEN missing in .env' };
  }
  return { ok: true };
}

// ── ETSY ──
async function getEtsyAuthUrl(redirectUri) {
  const check = checkEtsyKeys();
  if (!check.ok) throw new Error(check.message);
  
  const clientId = process.env.ETSY_CLIENT_ID;
  const state = crypto.randomBytes(16).toString('hex');
  const callback = redirectUri || `http://localhost:${process.env.PORT || 5000}/api/marketplace/etsy/callback`;

  // Proper PKCE: verifier is random; challenge is base64url(SHA256(verifier))
  const codeVerifier = crypto.randomBytes(48).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  
  // Persist for the token exchange (must use the SAME redirect_uri + verifier)
  const put = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  put.run('etsy_oauth_state', state);
  put.run('etsy_code_verifier', codeVerifier);
  put.run('etsy_redirect_uri', callback);
  
  return {
    url: `https://www.etsy.com/oauth/connect?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(callback)}&scope=listings_r%20listings_w%20transactions_r%20shops_r%20shops_w&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`,
    instructions: [
      'Click the link above',
      'Log in to Etsy and authorize the app',
      'You will be redirected back with a code',
      'The server will automatically exchange it for tokens'
    ],
    callbackUrl: callback
  };
}

async function exchangeEtsyToken(code, redirectUri) {
  const check = checkEtsyKeys();
  if (!check.ok) throw new Error(check.message);
  
  const clientId = process.env.ETSY_CLIENT_ID;
  const clientSecret = process.env.ETSY_CLIENT_SECRET;
  // Reuse the exact redirect_uri + PKCE verifier from the auth request
  const stored = k => db.prepare('SELECT value FROM settings WHERE key = ?').get(k)?.value || null;
  const callback = redirectUri || stored('etsy_redirect_uri') || `http://localhost:${process.env.PORT || 5000}/api/marketplace/etsy/callback`;
  const codeVerifier = stored('etsy_code_verifier');
  if (!codeVerifier) throw new Error('OAuth session expired — click Connect Etsy again.');
  
  const resp = await axios.post(`${ETSY_API_BASE}/public/oauth/token`, {
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: callback,
    code_verifier: codeVerifier
  });
  
  db.prepare('INSERT OR REPLACE INTO marketplace_tokens (platform, access_token, refresh_token, expires_at) VALUES (?, ?, ?, ?)')
    .run('etsy', resp.data.access_token, resp.data.refresh_token, new Date(Date.now() + resp.data.expires_in * 1000).toISOString());
  
  // Session used — clean up
  db.prepare("DELETE FROM settings WHERE key IN ('etsy_code_verifier', 'etsy_oauth_state')").run();
  
  return resp.data;
}

async function refreshEtsyToken() {
  const token = db.prepare('SELECT * FROM marketplace_tokens WHERE platform = ?').get('etsy');
  if (!token) throw new Error('No Etsy token found. Connect Etsy first.');
  
  const resp = await axios.post(`${ETSY_API_BASE}/public/oauth/token`, {
    grant_type: 'refresh_token',
    client_id: process.env.ETSY_CLIENT_ID,
    client_secret: process.env.ETSY_CLIENT_SECRET,
    refresh_token: token.refresh_token
  });
  
  db.prepare('UPDATE marketplace_tokens SET access_token = ?, expires_at = ? WHERE platform = ?')
    .run(resp.data.access_token, new Date(Date.now() + resp.data.expires_in * 1000).toISOString(), 'etsy');
  
  return resp.data;
}

async function listOnEtsy(product, shopId) {
  const token = db.prepare('SELECT * FROM marketplace_tokens WHERE platform = ?').get('etsy');
  if (!token) throw new Error('Etsy not connected. Visit /setup to connect.');
  
  // Check if token expired
  if (new Date(token.expires_at) < new Date()) {
    await refreshEtsyToken();
  }
  
  const prof = db.prepare('SELECT * FROM professions WHERE id = ?').get(product.profession_id);
  const seoData = seo.generateSEO(prof, product.type, product.theme);
  const copy = listingCopyFor(product, prof, seoData);

  const listing = {
    quantity: 999,
    title: copy.title.substring(0, 140),
    description: copy.description.substring(0, 4999),
    price: parseFloat(product.price.replace('$', '')) || 12,
    taxonomy_id: 6000, // Digital Downloads category
    who_made: 'i_did',
    when_made: 'made_to_order',
    is_supply: false,
    is_digital: true,
    tags: copy.tags.slice(0, 13),
    materials: ['digital', 'template', 'download', 'printable'],
    image_ids: []
  };
  
  const resp = await axios.post(`${ETSY_API_BASE}/application/shops/${shopId}/listings`, listing, {
    headers: { 
      Authorization: `Bearer ${token.access_token}`, 
      'x-api-key': etsyApiKey() 
    }
  });
  
  return resp.data;
}

// Best-effort gallery upload: composite cover + AI lifestyle shot, in order.
// Runs AFTER listing creation so nothing here can ever block a successful publish.
// Etsy rejects files >10MB / non-JPEG/PNG; we upload JPEG ≤ ~3MB max 8 tries.
async function attachEtsyListingImages(product, listingId, shopId) {
  const token = await ensureEtsyApiToken();
  const paths = [];
  try {
    const { ensureProductThumbnail } = require('./fileFactory');
    const cover = await ensureProductThumbnail(product);
    if (cover && fs.existsSync(cover)) paths.push(cover);
  } catch { /* cover optional */ }
  try {
    const coverArt = require('./coverArt');
    const prof = db.prepare('SELECT * FROM professions WHERE id = ?').get(product.profession_id);
    if (prof) {
      const life = await coverArt.ensureCoverArt(product, prof);
      if (life && fs.existsSync(life)) paths.push(life);
    }
  } catch { /* lifestyle optional */ }
  if (!paths.length) return { ok: false, attached: 0, error: 'no gallery images available' };

  let attached = 0;
  for (let i = 0; i < paths.length && attached < 8; i++) {
    try {
      const fd = new FormData();
      fd.append('image', new Blob([fs.readFileSync(paths[i])], { type: 'image/jpeg' }), `img${i+1}.jpg`);
      fd.append('rank', String(attached));
      const r = await axios.post(
        `${ETSY_API_BASE}/application/shops/${shopId}/listings/${listingId}/images`,
        fd,
        { headers: { ...etsyAuthHeaders(token.access_token), ...(fd.getHeaders ? fd.getHeaders() : {}) }, timeout: 45000 }
      );
      if (r.data && r.data.listing_image_id) attached++;
    } catch (e) {
      console.error(`[ETSYSLOGAUTO] image ${i} attach skipped:`, e.response?.status || e.message);
    }
  }
  return { ok: attached > 0, attached };
}

// ── CONCEPT-AWARE LISTING COPY ──
// If a product has an AI concept, the marketplace title + description must
// reflect it — otherwise buyers see the generic "{niche} {type}" title while
// the internal dashboard shows the differentiated name. SEO tags stay (they
// drive search); only the human-facing title/copy upgrades.
function conceptFor(product) {
  if (!product || !product.concept) return null;
  try {
    const c = JSON.parse(product.concept);
    return (c && c.name) ? c : null;
  } catch { return null; }
}

function listingCopyFor(product, prof, seoData) {
  const c = conceptFor(product);
  const title = (c ? c.name : prof.name + ' ' + (seoData.shortTitle || seoData.title))
    .replace(/\s+/g, ' ').trim().substring(0, 140);
  let description = seoData.description;
  if (c) {
    const pitch = c.pitch || '';
    const benefits = Array.isArray(c.benefits) ? c.benefits.filter(Boolean) : [];
    const diff = c.differentiator ? `\n\nWHY IT'S DIFFERENT:\n${c.differentiator}` : '';
    description = [
      String(pitch || '').trim(),
      diff,
      `\nWHAT'S INCLUDED:`,
      ...benefits.map(b => `• ${b}`),
      `\n${seoData.description}`
    ].filter(Boolean).join('\n').substring(0, 4999);
  }
  return { title, description, tags: seoData.tags.slice(0, 13) };
}

// ── STATUS ──
function getMarketplaceStatus() {
  const etsy = checkEtsyKeys();
  const gumroad = checkGumroadKey();
  const etsyToken = db.prepare('SELECT * FROM marketplace_tokens WHERE platform = ?').get('etsy');
  
  return {
    etsy: {
      configured: etsy.ok,
      connected: !!etsyToken,
      message: etsy.ok ? (etsyToken ? 'Connected' : 'Keys set, not authenticated') : etsy.message
    },
    gumroad: {
      configured: gumroad.ok,
      connected: gumroad.ok,
      message: gumroad.ok ? 'Ready' : gumroad.message
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LIVE CONNECTION TESTS
// ═══════════════════════════════════════════════════════════════════════════

async function testGumroadConnection() {
  const check = checkGumroadKey();
  if (!check.ok) return { ok: false, configured: false, message: check.message };
  try {
    const resp = await axios.get(`${GUMROAD_API_BASE}/products`, {
      params: { access_token: process.env.GUMROAD_ACCESS_TOKEN },
      timeout: 10000
    });
    const count = resp.data?.products?.length ?? 0;
    return { ok: true, configured: true, connected: true, message: `Connected — ${count} existing products` };
  } catch (e) {
    const msg = e.response?.data?.error || e.message;
    return { ok: false, configured: true, connected: false, message: `Auth failed: ${msg}` };
  }
}

async function testEtsyConnection() {
  const check = checkEtsyKeys();
  if (!check.ok) return { ok: false, configured: false, message: check.message };
  const token = db.prepare('SELECT * FROM marketplace_tokens WHERE platform = ?').get('etsy');
  if (!token) return { ok: false, configured: true, connected: false, message: 'Keys set — OAuth not completed yet. Visit /setup.' };
  try {
    const resp = await axios.get(`${ETSY_API_BASE}/application/users/me`, {
      headers: { Authorization: `Bearer ${token.access_token}`, 'x-api-key': etsyApiKey() },
      timeout: 10000
    });
    return { ok: true, configured: true, connected: true, message: `Connected as user ${resp.data.user_id}` };
  } catch (e) {
    const status = e.response?.status;
    if (status === 401) {
      try { await refreshEtsyToken(); return { ok: true, configured: true, connected: true, message: 'Token refreshed — connected' }; }
      catch { return { ok: false, configured: true, connected: false, message: 'Token expired, refresh failed — reconnect via /setup' }; }
    }
    if (status === 403) {
      return { ok: false, configured: true, connected: false, message: 'Etsy rejected the request (403) — your stored token is likely stale. Re-authorize at /setup.' };
    }
    return { ok: false, configured: true, connected: false, message: `API error: ${e.message}` };
  }
}

// Anonymous image host so locally-generated covers can be attached to listings
async function uploadToCatbox(filePath) {
  const buf = fs.readFileSync(filePath);
  const fd = new FormData();
  fd.append('reqtype', 'fileupload');
  fd.append('fileToUpload', new Blob([buf]), path.basename(filePath));
  const resp = await axios.post('https://catbox.moe/user/api.php', fd, { timeout: 45000 });
  const url = String(resp.data || '').trim();
  if (!url.startsWith('http')) throw new Error('Image host rejected upload');
  return url;
}

// Attach a branded cover to a Gumroad product (needs a public URL)
async function attachGumroadCover(productId, coverPath) {
  if (!coverPath || !fs.existsSync(coverPath)) throw new Error('Cover file missing');
  const publicUrl = await uploadToCatbox(coverPath);
  const form = new URLSearchParams({ access_token: process.env.GUMROAD_ACCESS_TOKEN, url: publicUrl });
  await axios.post(`${GUMROAD_API_BASE}/products/${encodeURIComponent(productId)}/covers`, form.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 30000
  });
  return publicUrl;
}

// Free ($0) Gumroad product for the lead magnet — PWYW fallback if $0 is rejected
async function publishFreeGumroad(product) {
  const filePath = await ensureProductFile(product);
  if (!filePath) throw new Error('Could not generate a downloadable file');
  const token = process.env.GUMROAD_ACCESS_TOKEN;

  const fileUrl = await uploadGumroadFile(filePath);

  const description = [
    '100% FREE — grab 3 professional templates and see the quality for yourself.',
    '',
    'WHAT\'S INSIDE:',
    '• Pro service invoice (editable)',
    '• Service quality checklist',
    '• Pricing calculator spreadsheet (real formulas)',
    '',
    'Instant download. Enter $0 at checkout (or leave a tip if you\'re feeling generous).'
  ].join('\n');

  const variants = [
    { price: '0', customizable_price: 'true', suggested_price_cents: '0' },
    { price: '0' },
    { price: '100' }
  ];
  let created = null;
  let lastErr = null;
  for (const v of variants) {
    try {
      const form = new URLSearchParams({ access_token: token, name: 'Free Starter Pack — 3 Pro Business Templates', description, 'files[][url]': fileUrl, ...v });
      const resp = await axios.post(`${GUMROAD_API_BASE}/products`, form.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 30000
      });
      if (resp.data?.success === false) throw Object.assign(new Error(resp.data.message || 'Gumroad rejected the product'), { handled: true });
      created = resp.data?.product;
      break;
    } catch (e) {
      if (e.handled) throw e; // clear message from Gumroad (e.g. daily creation limit)
      lastErr = e;
    }
  }
  if (!created?.id) throw new Error('Free product creation failed: ' + (lastErr?.response?.data ? JSON.stringify(lastErr.response.data).slice(0, 200) : lastErr?.message));

  await axios.put(`${GUMROAD_API_BASE}/products/${encodeURIComponent(created.id)}/enable?access_token=${token}`, null, { timeout: 20000 });
  return { platform: 'gumroad', listingId: created.id, url: created.short_url || null };
}

// Normalize a product name for fuzzy matching across the Gumroad API.
// "Complete Toolkit — Air Duct Cleaning" and "Air Duct Cleaning Complete Toolkit"
// both collapse to "airductcleaning".
function normalizeName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/complete|toolkit|premium|template|edition|pack/g, '')
    .replace(/toolkits?/g, '');
}

// Gumroad product id → public buy URL (for the storefront feed).
// Includes BOTH exact-id and normalized-name lookup so products survive re-
// publishes that mint fresh Gumroad ids.
async function getGumroadProductUrls() {
  const out = { byId: {}, byName: {}, storeUrl: null, list: [] };
  if (!checkGumroadKey().ok) return out;
  try {
    const resp = await axios.get(`${GUMROAD_API_BASE}/products`, {
      params: { access_token: process.env.GUMROAD_ACCESS_TOKEN },
      timeout: 10000
    });
    for (const g of resp.data?.products || []) {
      const url = g.short_url || `https://gumroad.com/l/${g.permalink || ''}`;
      out.byId[g.id] = url;
      out.byName[normalizeName(g.name)] = url;
      out.list.push({ id: g.id, name: g.name, price: g.price_cents != null ? g.price_cents / 100 : null, url, permalink: g.permalink });
      if (!out.storeUrl) { try { out.storeUrl = new URL(url).origin; } catch {} }
    }
    return out;
  } catch (e) {
    console.error('[GUMROAD] URL lookup failed:', e.message);
    return out;
  }
}

// Reconcile the local catalog against what is actually live on Gumroad.
//   • matches by normalized name (id changes across republishes)
//   • fixes marketplace_id + flips genuinely-live rows to 'listed'
//   • returns { matched, storeUrl, urlFor } ready for the storefront feed
async function refreshGumroadCatalog() {
  if (!checkGumroadKey().ok) {
    return { matched: 0, storeUrl: null, urlFor: {} };
  }
  const gum = await getGumroadProductUrls();
  let matched = 0;
  const urlFor = {};

  const local = db.prepare(`
    SELECT id, name, status, marketplace_id, type FROM products
  `).all();
  for (const g of gum.list) {
    const gn = normalizeName(g.name);
    // 1. Direct id hit
    const byId = local.find(r => r.marketplace_id === g.id);
    // 2. Normalized name hit on any product (bundle price/type aware below)
    const byName = local.find(r => normalizeName(r.name) === gn) || local.find(r => gn.includes(normalizeName(r.name)) && normalizeName(r.name).length >= 8);
    const row = byId || byName;
    if (!row) continue;
    if (!byId) {
      // Stale or missing id — adopt the real Gumroad id
      db.prepare(`UPDATE products SET marketplace_id = ?, marketplace = 'gumroad' WHERE id = ?`).run(g.id, row.id);
    }
    if (row.status !== 'listed' && row.type === 'bundle') {
      db.prepare(`UPDATE products SET status = 'listed', marketplace = 'gumroad' WHERE id = ?`).run(row.id);
    }
    urlFor[row.id] = g.url;
    matched++;
  }

  // Armory: explicit store URL setting wins, else the derived Gumroad origin
  let storeUrl = gum.storeUrl;
  const override = db.prepare(`SELECT value FROM settings WHERE key = 'store_url'`).get()?.value;
  if (override) storeUrl = override;

  return { matched, storeUrl, urlFor, list: gum.list };
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLISH DISPATCHER — tries real APIs in priority order, simulated fallback
// ═══════════════════════════════════════════════════════════════════════════

// Upload a local file to Gumroad via the 4-step S3 flow:
// presign → PUT parts → complete → returns canonical file_url
async function uploadGumroadFile(filePath) {
  const token = process.env.GUMROAD_ACCESS_TOKEN;
  if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
  const buf = fs.readFileSync(filePath);
  const filename = path.basename(filePath);

  // 1. Presign
  const presignForm = new URLSearchParams({ access_token: token, filename, file_size: String(buf.length) });
  const presign = await axios.post(`${GUMROAD_API_BASE}/files/presign`, presignForm.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 20000
  });
  const { upload_id, key, parts = [] } = presign.data || {};
  if (!upload_id || !key) throw new Error('Gumroad presign failed: ' + JSON.stringify(presign.data).slice(0, 200));

  // 2. PUT each part (files < 100MB are a single part)
  const uploadedParts = [];
  for (const part of parts) {
    const start = (part.part_number - 1) * 100 * 1024 * 1024;
    const chunk = buf.subarray(start, start + 100 * 1024 * 1024);
    const putResp = await axios.put(part.presigned_url, chunk, {
      headers: { 'Content-Type': 'application/octet-stream' },
      maxBodyLength: Infinity,
      timeout: 120000
    });
    const etag = String(putResp.headers.etag || '').replace(/"/g, '');
    if (!etag) throw new Error(`S3 part ${part.part_number} returned no ETag`);
    uploadedParts.push({ part_number: part.part_number, etag });
  }

  // 3. Complete (single-use — never retry)
  const completeForm = new URLSearchParams({ access_token: token, upload_id, key });
  for (const p of uploadedParts) {
    completeForm.append('parts[][part_number]', String(p.part_number));
    completeForm.append('parts[][etag]', p.etag);
  }
  const complete = await axios.post(`${GUMROAD_API_BASE}/files/complete`, completeForm.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 30000
  });
  const fileUrl = complete.data?.file_url;
  if (!fileUrl) throw new Error('Gumroad file complete failed: ' + JSON.stringify(complete.data).slice(0, 200));
  return fileUrl;
}

// ── GUMROAD DAILY CREATION QUOTA (local counter; Gumroad hard-caps ~10/day) ──
const GUMROAD_DAILY_LIMIT = 10;

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function settingGet(key) {
  return db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value || null;
}

function settingSet(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)')
    .run(key, String(value));
}

function getGumroadQuota() {
  const day = todayKey();
  const storedDay = settingGet('gumroad_creates_day');
  let used = parseInt(settingGet('gumroad_creates_today') || '0', 10) || 0;
  if (storedDay !== day) {
    used = 0;
    settingSet('gumroad_creates_day', day);
    settingSet('gumroad_creates_today', '0');
  }
  const exhausted = settingGet('gumroad_quota_exhausted_day') === day;
  if (exhausted) used = Math.max(used, GUMROAD_DAILY_LIMIT);
  const remaining = Math.max(0, GUMROAD_DAILY_LIMIT - used);
  return { day, used, limit: GUMROAD_DAILY_LIMIT, remaining, exhausted };
}

function incrementGumroadCreates() {
  const q = getGumroadQuota();
  const next = q.used + 1;
  settingSet('gumroad_creates_day', q.day);
  settingSet('gumroad_creates_today', String(next));
  if (next >= GUMROAD_DAILY_LIMIT) settingSet('gumroad_quota_exhausted_day', q.day);
  return getGumroadQuota();
}

function markGumroadQuotaExhausted(reason) {
  const day = todayKey();
  settingSet('gumroad_quota_exhausted_day', day);
  settingSet('gumroad_creates_day', day);
  settingSet('gumroad_creates_today', String(GUMROAD_DAILY_LIMIT));
  db.prepare('INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)')
    .run('gumroad_quota', reason || 'Daily creation cap hit', 'warning');
  return getGumroadQuota();
}

async function publishToGumroadReal(product) {

  // NEVER publish a listing without a deliverable file
  const filePath = await ensureProductFile(product);
  if (!filePath) throw new Error('Could not generate a downloadable file for this product');

  // Soft pre-check against local daily counter (Gumroad hard-caps ~10 creates/day)
  const quota = getGumroadQuota();
  if (quota.remaining <= 0) {
    const err = new Error(`Gumroad daily creation limit reached (${quota.used}/${quota.limit}). Try again tomorrow.`);
    err.code = 'GUMROAD_DAILY_CAP';
    throw err;
  }

  const token = process.env.GUMROAD_ACCESS_TOKEN;
  const priceCents = Math.round((parseFloat(product.price.replace('$', '')) || 12) * 100);
  const prof = db.prepare('SELECT * FROM professions WHERE id = ?').get(product.profession_id);
  const seoData = seo.generateSEO(prof, product.type, product.theme);
  const copy = listingCopyFor(product, prof, seoData);

  // 1. Upload the deliverable → canonical file_url
  const fileUrl = await uploadGumroadFile(filePath);

  // 2. Create the product WITH the file attached, concept-aware copy
  const form = new URLSearchParams({
    access_token: token,
    name: copy.title.substring(0, 200),
    price: String(priceCents),
    description: copy.description.substring(0, 2000),
    'files[][url]': fileUrl
  });
  let createResp;
  try {
    createResp = await axios.post(`${GUMROAD_API_BASE}/products`, form.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 30000
    });
  } catch (e) {
    const msg = e.response?.data?.message || e.message || '';
    if (/daily|limit|too many|10 per/i.test(msg)) markGumroadQuotaExhausted(msg);
    throw e;
  }
  if (createResp.data?.success === false) {
    const msg = createResp.data.message || 'Gumroad rejected the product';
    if (/daily|limit|too many|10 per/i.test(msg)) markGumroadQuotaExhausted(msg);
    throw new Error(msg);
  }
  const gumroadId = createResp.data?.product?.id;
  if (!gumroadId) throw new Error('Gumroad create returned no product id');

  // Count a successful create against the local daily quota
  incrementGumroadCreates();

  // 3. Publish (products are created as unpublished drafts)
  await axios.put(`${GUMROAD_API_BASE}/products/${encodeURIComponent(gumroadId)}/enable?access_token=${token}`, null, { timeout: 20000 });

  // 4. Attach the v3 composite cover (best-effort — never blocks the listing)
  try {
    const { ensureProductThumbnail } = require('./fileFactory');
    const coverPath = await ensureProductThumbnail(product);
    if (coverPath) await attachGumroadCover(gumroadId, coverPath);
  } catch (e) {
    console.error('[PUBLISH] Gumroad cover attach skipped:', e.message);
  }

  return { platform: 'gumroad', listingId: gumroadId, url: createResp.data?.product?.short_url || null };
}


async function getEtsyShopId(accessToken) {
  const resp = await axios.get(`${ETSY_API_BASE}/application/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'x-api-key': etsyApiKey() },
    timeout: 10000
  });
  const userId = resp.data.user_id;
  const shopsResp = await axios.get(`${ETSY_API_BASE}/application/users/${userId}/shops`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'x-api-key': etsyApiKey() },
    timeout: 10000
  });
  const shopId = shopsResp.data?.shops?.[0]?.shop_id;
  if (shopId) process.env.ETSY_SHOP_ID = String(shopId); // cache for session
  return String(shopId);
}

// ── STORE BRANDING (logo + banner from the NicheGate designs folder) ──
function etsyAuthHeaders(token) {
  return { Authorization: `Bearer ${token}`, 'x-api-key': etsyApiKey() };
}

async function ensureEtsyApiToken() {
  const token = db.prepare('SELECT * FROM marketplace_tokens WHERE platform = ?').get('etsy');
  if (!token) throw new Error('Etsy not connected — visit /setup to authorize');
  if (new Date(token.expires_at) < new Date()) await refreshEtsyToken();
  return db.prepare('SELECT * FROM marketplace_tokens WHERE platform = ?').get('etsy');
}

// Shop icon (profile image) — PUT /v3/application/shops/{shop_id}/icon
async function uploadEtsyShopIcon(imagePath) {
  if (!imagePath || !fs.existsSync(imagePath)) throw new Error(`Shop icon file missing: ${imagePath}`);
  const token = await ensureEtsyApiToken();
  const shopId = process.env.ETSY_SHOP_ID || await getEtsyShopId(token.access_token);
  const fd = new FormData();
  fd.append('image', new Blob([fs.readFileSync(imagePath)]), path.basename(imagePath));
  const resp = await axios.put(`${ETSY_API_BASE}/application/shops/${shopId}/icon`, fd, {
    headers: { ...etsyAuthHeaders(token.access_token), ...(fd.getHeaders ? fd.getHeaders() : {}) },
    timeout: 30000
  });
  db.prepare('INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)')
    .run('branding_etsy_icon', `Shop icon set to ${path.basename(imagePath)}`, 'success');
  return { ok: true, platform: 'etsy', asset: path.basename(imagePath), shopId, status: resp.status };
}

// Shop banner — POST /v3/application/shops/{shop_id}/banner (graceful if unsupported)
async function uploadEtsyShopBanner(imagePath) {
  if (!imagePath || !fs.existsSync(imagePath)) throw new Error(`Banner file missing: ${imagePath}`);
  const token = await ensureEtsyApiToken();
  const shopId = process.env.ETSY_SHOP_ID || await getEtsyShopId(token.access_token);
  const fd = new FormData();
  fd.append('image', new Blob([fs.readFileSync(imagePath)]), path.basename(imagePath));
  const resp = await axios.post(`${ETSY_API_BASE}/application/shops/${shopId}/banner`, fd, {
    headers: { ...etsyAuthHeaders(token.access_token), ...(fd.getHeaders ? fd.getHeaders() : {}) },
    timeout: 30000
  });
  db.prepare('INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)')
    .run('branding_etsy_banner', `Shop banner set to ${path.basename(imagePath)}`, 'success');
  return { ok: true, platform: 'etsy', asset: path.basename(imagePath), shopId, status: resp.status };
}

// Gumroad product covers — attach the brand artwork to every listed product
async function attachBrandingToGumroadProducts(coverPath) {
  if (!coverPath || !fs.existsSync(coverPath)) throw new Error(`Cover file missing: ${coverPath}`);
  const rows = db.prepare(`SELECT id, name FROM products WHERE status = 'listed' AND marketplace = 'gumroad' AND marketplace_id IS NOT NULL`).all();
  let attached = 0, failed = 0; const errors = [];
  for (const p of rows) {
    try {
      await attachGumroadCover(p.marketplace_id, coverPath);
      attached++;
    } catch (e) {
      failed++; errors.push(`${p.name}: ${e.message}`);
    }
  }
  db.prepare('INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)')
    .run('branding_gumroad_covers', `Logo attached to ${attached} Gumroad listing(s) (${failed} failed)`, failed ? 'warning' : 'success');
  return { attached, failed, errors };
}

async function publishToEtsyReal(product) {
  await ensureProductFile(product);
  const token = db.prepare('SELECT * FROM marketplace_tokens WHERE platform = ?').get('etsy');
  if (!token) throw new Error('Etsy not connected — visit /setup to authorize');
  if (new Date(token.expires_at) < new Date()) await refreshEtsyToken();

  const shopId = process.env.ETSY_SHOP_ID || await getEtsyShopId(token.access_token);
  const result = await listOnEtsy(product, shopId);
  const listingId = String(result.listing_id || '');
  // Best-effort gallery: never blocks a successful listing creation.
  try {
    if (listingId) await attachEtsyListingImages(product, listingId, shopId);
    else console.error('[ETSYSLOGAUTO] no listing id for gallery');
  } catch (e) {
    console.error('[ETSYSLOGAUTO] gallery skipped:', e.message);
  }
  return { platform: 'etsy', listingId };
}

// Priority: Gumroad (simplest auth) → Etsy. NO simulated fallback — a failed
// publish must THROW so callers never mark a product listed when it isn't.
async function publishProduct(product) {
  const errors = [];
  if (checkGumroadKey().ok) {
    try { return await publishToGumroadReal(product); }
    catch (e) {
      errors.push('Gumroad: ' + e.message);
      console.error('[PUBLISH] Gumroad failed:', e.message);
    }
  }
  if (checkEtsyKeys().ok && db.prepare('SELECT * FROM marketplace_tokens WHERE platform = ?').get('etsy')) {
    try { return await publishToEtsyReal(product); }
    catch (e) {
      errors.push('Etsy: ' + e.message);
      console.error('[PUBLISH] Etsy failed:', e.message);
    }
  }
  throw new Error(errors.length ? errors.join(' | ') : 'No marketplace configured — add API keys in .env');
}

module.exports = {
  getEtsyAuthUrl,
  exchangeEtsyToken,
  refreshEtsyToken,
  listOnEtsy,
  uploadGumroadFile,
  getMarketplaceStatus,
  checkEtsyKeys,
  checkGumroadKey,
  testEtsyConnection,
  testGumroadConnection,
  getGumroadProductUrls,
  refreshGumroadCatalog,
  attachGumroadCover,
  ensureEtsyApiToken,
  uploadEtsyShopIcon,
  uploadEtsyShopBanner,
  attachBrandingToGumroadProducts,
  publishFreeGumroad,
  publishProduct,
  getGumroadQuota,
  incrementGumroadCreates,
  markGumroadQuotaExhausted,
  GUMROAD_DAILY_LIMIT,
  conceptFor,
  listingCopyFor,
  attachEtsyListingImages
};

