const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { db } = require('../database');
const seo = require('./seoEngine');
const { ensureProductFile } = require('./fileFactory');

const ETSY_API_BASE = 'https://openapi.etsy.com/v3';
const GUMROAD_API_BASE = 'https://api.gumroad.com/v2';

// ── KEY VALIDATION ──
function checkEtsyKeys() {
  const clientId = process.env.ETSY_CLIENT_ID;
  const clientSecret = process.env.ETSY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { ok: false, message: 'ETSY_CLIENT_ID and/or ETSY_CLIENT_SECRET missing in .env' };
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
    url: `https://www.etsy.com/oauth/connect?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(callback)}&scope=listings_r%20listings_w%20transactions_r%20shops_r&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`,
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

  const listing = {
    quantity: 999,
    title: seoData.title.substring(0, 140),
    description: seoData.description.substring(0, 4999),
    price: parseFloat(product.price.replace('$', '')) || 12,
    taxonomy_id: 1,
    who_made: 'i_did',
    when_made: 'made_to_order',
    is_supply: false,
    type: 'download',
    shipping_template_id: 0,
    tags: seoData.tags.slice(0, 13),
    materials: ['digital', 'template'],
    image_ids: []
  };
  
  const resp = await axios.post(`${ETSY_API_BASE}/application/shops/${shopId}/listings`, listing, {
    headers: { 
      Authorization: `Bearer ${token.access_token}`, 
      'x-api-key': process.env.ETSY_CLIENT_ID 
    }
  });
  
  return resp.data;
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
      headers: { Authorization: `Bearer ${token.access_token}`, 'x-api-key': process.env.ETSY_CLIENT_ID },
      timeout: 10000
    });
    return { ok: true, configured: true, connected: true, message: `Connected as user ${resp.data.user_id}` };
  } catch (e) {
    const status = e.response?.status;
    if (status === 401) {
      try { await refreshEtsyToken(); return { ok: true, configured: true, connected: true, message: 'Token refreshed — connected' }; }
      catch { return { ok: false, configured: true, connected: false, message: 'Token expired, refresh failed — reconnect via /setup' }; }
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

// Gumroad product id → public buy URL (for the storefront feed)
async function getGumroadProductUrls() {
  if (!checkGumroadKey().ok) return {};
  try {
    const resp = await axios.get(`${GUMROAD_API_BASE}/products`, {
      params: { access_token: process.env.GUMROAD_ACCESS_TOKEN },
      timeout: 10000
    });
    const map = {};
    for (const g of resp.data?.products || []) {
      map[g.id] = g.short_url || `https://gumroad.com/l/${g.permalink || ''}`;
    }
    return map;
  } catch (e) {
    console.error('[GUMROAD] URL lookup failed:', e.message);
    return {};
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLISH DISPATCHER — tries real APIs in priority order. NO simulated fallback.
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

async function publishToGumroadReal(product) {
  // NEVER publish a listing without a deliverable file
  const filePath = await ensureProductFile(product);
  if (!filePath) throw new Error('Could not generate a downloadable file for this product');

  const token = process.env.GUMROAD_ACCESS_TOKEN;
  const priceCents = Math.round((parseFloat(product.price.replace('$', '')) || 12) * 100);
  const prof = db.prepare('SELECT * FROM professions WHERE id = ?').get(product.profession_id);
  const seoData = seo.generateSEO(prof, product.type, product.theme);

  // 1. Upload the deliverable → canonical file_url
  const fileUrl = await uploadGumroadFile(filePath);

  // 2. Create the product WITH the file attached, SEO-optimized copy
  const form = new URLSearchParams({
    access_token: token,
    name: seoData.shortTitle.substring(0, 200),
    price: String(priceCents),
    description: seoData.description.substring(0, 2000),
    'files[][url]': fileUrl
  });
  const createResp = await axios.post(`${GUMROAD_API_BASE}/products`, form.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 30000
  });
  if (createResp.data?.success === false) {
    throw new Error(createResp.data.message || 'Gumroad rejected the product');
  }
  const gumroadId = createResp.data?.product?.id;
  if (!gumroadId) throw new Error('Gumroad create returned no product id');

  // 3. Publish (products are created as unpublished drafts)
  await axios.put(`${GUMROAD_API_BASE}/products/${encodeURIComponent(gumroadId)}/enable?access_token=${token}`, null, { timeout: 20000 });

  return { platform: 'gumroad', listingId: gumroadId, url: createResp.data?.product?.short_url || null };
}

async function getEtsyShopId(accessToken) {
  const resp = await axios.get(`${ETSY_API_BASE}/application/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'x-api-key': process.env.ETSY_CLIENT_ID },
    timeout: 10000
  });
  const userId = resp.data.user_id;
  const shopsResp = await axios.get(`${ETSY_API_BASE}/application/users/${userId}/shops`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'x-api-key': process.env.ETSY_CLIENT_ID },
    timeout: 10000
  });
  const shopId = shopsResp.data?.shops?.[0]?.shop_id;
  if (shopId) process.env.ETSY_SHOP_ID = String(shopId); // cache for session
  return String(shopId);
}

async function publishToEtsyReal(product) {
  await ensureProductFile(product);
  const token = db.prepare('SELECT * FROM marketplace_tokens WHERE platform = ?').get('etsy');
  if (!token) throw new Error('Etsy not connected — visit /setup to authorize');
  if (new Date(token.expires_at) < new Date()) await refreshEtsyToken();

  const shopId = process.env.ETSY_SHOP_ID || await getEtsyShopId(token.access_token);
  const result = await listOnEtsy(product, shopId);
  return { platform: 'etsy', listingId: String(result.listing_id || '') };
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
  attachGumroadCover,
  publishFreeGumroad,
  publishProduct
};
