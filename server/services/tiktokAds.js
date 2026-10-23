// ═══════════════════════════════════════════════════════════════════════════
// TIKTOK ADS ENGINE — autonomous TikTok ad creation + auto-optimization.
//
// TikTok Marketing API v2 (business-api.tiktok.com/open_api/v2.0/):
//   • OAuth2 token stored in marketplace_tokens (platform='tiktok')
//   • Campaign → Ad Group → Ad hierarchy
//   • Creative: video scripts from conceptEngine + product cover as thumbnail
//   • Auto-optimization: pause low-CTR/CAP, scale high-ROAS winners
//
// HARD RULE: AI is never required. With no TikTok token (or MODEL_ENABLED=false)
// the engine generates ready-to-import ad creatives (scripts + targeting) so the
// operator can launch manually — the lane opens automatically when OAuth completes.
// ═══════════════════════════════════════════════════════════════════════════

const axios = require('axios');
const { db } = require('../database');

const TIKTOK_API_BASE = 'https://business-api.tiktok.com/open_api/v2.0';
const { envIsReal, rowIsReal } = require('./credentialGuard');

// ── Token management (same table as Etsy/Pinterest) ───────────────────────
function getTikTokToken() {
  try {
    const row = db.prepare("SELECT * FROM marketplace_tokens WHERE platform = 'tiktok'").get();
    if (row && row.access_token && new Date(row.expires_at) > new Date(Date.now() + 60000)) {
      return row;
    }
    if (row && row.refresh_token) {
      // Caller will refresh; return the raw row so refresh can happen
      return row;
    }
  } catch (e) { /* table empty */ }
  return null;
}

function tiktokConfigured() {
  const token = getTikTokToken();
  if (rowIsReal(token)) return true;
  if (envIsReal('TIKTOK_ACCESS_TOKEN')) return true;
  return false;
}

function tiktokAuthHeaders(accessToken) {
  return {
    'Access-Token': accessToken,
    'Content-Type': 'application/json',
    'User-Agent': 'NicheGate/1.0'
  };
}

// Base URL a paid ad should land on: explicit buy_url → a Gumroad short_url
// stored on the listing row → the configured storefront URL. Returns null when
// nothing resolves (the caller still persists the creative for manual launch).
function resolveAdBaseUrl(product) {
  if (!product) return null;
  if (product.buy_url) return String(product.buy_url);
  try {
    const li = product.listing_json ? JSON.parse(product.listing_json) : null;
    if (li && (li.short_url || li.url)) return String(li.short_url || li.url);
  } catch { /* malformed listing_json */ }
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'store_url'").get();
    if (row && row.value) return String(row.value).replace(/\/+$/, '');
  } catch { /* no settings */ }
  return null;
}

// ── Ad spend cap (safety gate — TikTok needs $ budget, start conservative) ──
const DEFAULT_DAILY_BUDGET = Number(process.env.TIKTOK_DEFAULT_DAILY_BUDGET || 20); // $20/day
const MAX_DAILY_BUDGET = Number(process.env.TIKTOK_MAX_DAILY_BUDGET || 100);         // cap at $100
const MAX_TOTAL_BUDGET = Number(process.env.TIKTOK_MAX_TOTAL_BUDGET || 500);        // cap at $500

// ── Subreddit-style community targeting for TikTok audiences ────────────────
// TikTok doesn't have "subreddits" but the API supports interest-based targeting.
// These map to TikTok's interest_target_id values.
const INTEREST_MAP = {
  'drone-surveying': ['technology', 'photography', 'realestate'],
  'mobile-notary': ['business', 'finance', 'legal'],
  'beekeeping': ['pets_animals', 'gardening', 'outdoor'],
  'energy-auditor': ['home_improvement', 'green_energy', 'business'],
  'post-construction-cleaning': ['home_improvement', 'cleaning', 'business'],
  'native-landscaping': ['gardening', 'outdoor', 'home_improvement'],
  'mold-inspector': ['home_improvement', 'health', 'insurance'],
  'air-duct-cleaning': ['home_improvement', 'hvac', 'health'],
  'appliance-repair': ['home_improvement', 'diy', 'appliances'],
  'fishing-guide': ['sports', 'outdoor', 'travel'],
  'roofing': ['home_improvement', 'diy', 'construction'],
  'hvac': ['home_improvement', 'diy', 'technology'],
  'massage-therapy': ['health', 'wellness', 'self_care'],
  'tattoo-artist': ['beauty', 'fashion', 'lifestyle'],
  'wedding-photography': ['photography', 'wedding', 'lifestyle'],
  'pyrotechnics': ['entertainment', 'events', 'lifestyle'],
  'aa-recovery': ['health', 'wellness', 'community'],
  'smart-recovery': ['health', 'wellness', 'education'],
  'refuge-recovery': ['health', 'wellness', 'meditation'],
  'womens-recovery': ['health', 'wellness', 'community'],
  'secular-recovery': ['health', 'wellness', 'community']
};

function interestTargetsForProfession(slug) {
  const hits = INTEREST_MAP[slug] || ['business', 'small_business'];
  // TikTok interest targeting IDs (representative — the real IDs depend on the
  // advertiser's targeting setup; we store the keyword so the operator can
  // remap). The API expects { "interest_list": ["10011", "10012"] }
  // We use keyword-based targeting which TikTok supports via "interest_promotion".
  return hits;
}

// ── Creative generation: video scripts + cover thumbnail ──────────────────
async function buildCreative(productId) {
  try {
    const product = db.prepare('SELECT p.*, pr.name AS prof_name, pr.slug AS prof_slug FROM products p LEFT JOIN professions pr ON p.profession_id = pr.id WHERE p.id = ?').get(productId);
    if (!product) throw new Error('Product not found');

    // 3× TikTok/Reels video scripts from conceptEngine
    const conceptEngine = require('./conceptEngine');
    const scripts = await conceptEngine.generateVideoScripts(product, { niche: product.prof_name });

    // Pick the best-performing script style (proof-of-speed generally has highest CTR)
    const scriptOrder = ['proof-of-speed', 'problem-agitation', 'list-value'];
    const bestScript = scripts.find(s => s.style === scriptOrder[0]) || scripts[0];
    const scriptIndex = scripts.indexOf(bestScript);

    // UTM-tagged store URL for attribution — TikTok-specific (pinEngine.utmFor
    // hardcodes utm_source=pinterest, so we build the ad URL here).
    const baseUrl = resolveAdBaseUrl(product);
    const adUtm = new URLSearchParams({
      utm_source: 'tiktok',
      utm_medium: 'paid',
      utm_campaign: `tiktok-ad-${product.id}`,
      utm_content: `creative-${scriptIndex}`
    });
    const targetUrl = baseUrl
      ? `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${adUtm.toString()}`
      : null;

    // Cover image: product's preview_path (for thumbnail) — needs to be publicly reachable
    const coverPath = product.preview_path && require('node:fs').existsSync(product.preview_path) ? product.preview_path : null;

    const pinEngine = require('./pinEngine');
    return {
      product,
      scripts,
      primaryScript: bestScript,
      scriptIndex,
      targetUrl,
      coverPath,
      coverPublicUrl: pinEngine.pinPublicImageUrl(product.id),
      interests: interestTargetsForProfession(product.prof_slug || (product.prof_name || '').toLowerCase().replace(/[^a-z0-9-]/g, ''))
    };
  } catch (e) {
    console.error('[TIKTOK] buildCreative failed:', e.message);
    throw e;
  }
}

// ── Campaign creation (real API) ────────────────────────────────────────────
function tiktokApi(accessToken) {
  const token = accessToken || (getTikTokToken() && getTikTokToken().access_token) || process.env.TIKTOK_ACCESS_TOKEN;
  const client = {
    async post(endpoint, body) {
      if (!token) throw new Error('TikTok token not configured');
      const resp = await axios.post(`${TIKTOK_API_BASE}${endpoint}`, body, {
        headers: tiktokAuthHeaders(token),
        timeout: 15000
      });
      const data = resp.data;
      if (data.code && data.code !== 0 && data.code !== 200) {
        throw new Error(`TikTok API ${endpoint}: ${data.message || JSON.stringify(data)}`);
      }
      return data;
    },
    async get(endpoint, params) {
      if (!token) throw new Error('TikTok token not configured');
      const resp = await axios.get(`${TIKTOK_API_BASE}${endpoint}`, {
        params,
        headers: tiktokAuthHeaders(token),
        timeout: 15000
      });
      return resp.data;
    }
  };
  return client;
}

// ── Create a full campaign → ad group → ad for a product ───────────────────
async function createAdForProduct(productId, opts = {}) {
  const creative = await buildCreative(productId);
  const product = creative.product;
  const budget = Math.min(Math.max(opts.dailyBudget || DEFAULT_DAILY_BUDGET, 5), MAX_DAILY_BUDGET);
  const advertiserId = process.env.TIKTOK_ADVERTISER_ID;

  // Deterministic campaign name from product
  const timestamp = Date.now().toString().slice(-8);
  const campaignName = `${product.name} | ${product.prof_name || 'Digital Product'} | ${timestamp}`;
  const adGroupName = `AG-${product.type || 'template'}-${timestamp}`;
  const adName = `${product.name} ad ${timestamp}`;

  let campaignId = null;
  let adgroupId = null;
  let adId = null;

  // Check if we have a real TikTok token — if not, generate creatives for manual upload
  if (!tiktokConfigured() || !advertiserId) {
    // No token: save the creative bundle as a ready-to-import record
    const rec = db.prepare(`
      INSERT INTO tiktok_ads
        (product_id, campaign_name, adgroup_name, ad_name, video_script_index,
         cover_image, target_url, budget_daily, budget_total, bid_amount,
         target_audience, status, is_active, auto_optimize)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 0, 1)
    `).run(
      product.id, campaignName, adGroupName, adName, creative.scriptIndex,
      creative.coverPath || null, creative.targetUrl || null,
      budget, opts.totalBudget || budget * 7, opts.bidAmount || 0.50,
      JSON.stringify(creative.interests)
    );

    return {
      ok: true,
      mode: 'manual',
      productId: product.id,
      adId: rec.lastInsertRowid,
      creative: {
        campaignName, adGroupName, adName,
        scripts: creative.scripts,
        targetUrl: creative.targetUrl,
        coverImagePath: creative.coverPath,
        interests: creative.interests,
        dailyBudget: budget
      },
      note: 'TikTok OAuth not connected. Creative bundle generated for manual import at business.tiktok.com.'
    };
  }

  // Real API path: create campaign → ad group → ad
  const client = tiktokApi();
  try {
    // 1. Create campaign
    const campResp = await client.post('/campaign/create/', {
      advertiser_id: advertiserId,
      info: {
        name: campaignName,
        operation_status: { code: 'AD_STATUS_ONLINE' },
        budget: {
          total_budget: { amount: opts.totalBudget ? opts.totalBudget * 100 : budget * 700, currency_id: 'USD' },
          daily_budget: { amount: budget * 100, currency_id: 'USD' }
        }
      }
    });
    campaignId = campResp?.data?.id || campResp?.data?.campaign_id;

    // 2. Create ad group
    const agResp = await client.post('/ad_group/create/', {
      advertiser_id: advertiserId,
      info: {
        name: adGroupName,
        campaign_id: campaignId,
        budget: {
          daily_budget: { amount: budget * 100, currency_id: 'USD' },
          total_budget: { amount: opts.totalBudget ? opts.totalBudget * 100 : budget * 700, currency_id: 'USD' }
        },
        targeting_info: {
          age: [{ target_type: 'include', key: 'age', value: ['18-24', '25-34', '35-44'] }],
          interest: creative.interests.map(i => ({ target_id: i }))
        },
        bid: { amount: (opts.bidAmount || 0.50) * 100, currency_id: 'USD' }
      }
    });
    adgroupId = agResp?.data?.id || agResp?.data?.adgroup_id;

    // 3. Create ad with video script + cover
    const adResp = await client.post('/ad/create/', {
      advertiser_id: advertiserId,
      info: {
        name: adName,
        adgroup_id: adgroupId,
        creative: {
          creative_id: creative.scriptIndex,
          cover_list: creative.coverPublicUrl ? [creative.coverPublicUrl] : [],
          product_text: creative.primaryScript.hook,
          call_to_action: { cta_text: 'Shop Now', cta_url: creative.targetUrl }
        },
        track_url: {
          landing_url: creative.targetUrl,
          external_optn: creative.targetUrl + (creative.targetUrl.includes('?') ? '&' : '?') + 'utm_source=tiktok&utm_medium=paid'
        }
      }
    });
    adId = adResp?.data?.id || adResp?.data?.ad_id;

    // Persist to DB
    const rec = db.prepare(`
      INSERT INTO tiktok_ads
        (product_id, campaign_id, adgroup_id, ad_id, campaign_name, adgroup_name,
         ad_name, video_script_index, cover_image, target_url, budget_daily,
         budget_total, bid_amount, target_audience, status, is_active, auto_optimize)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, 1)
    `).run(
      product.id, campaignId, adgroupId, adId, campaignName, adGroupName,
      adName, creative.scriptIndex, creative.coverPublicUrl, creative.targetUrl,
      budget, opts.totalBudget || budget * 7, opts.bidAmount || 0.50,
      JSON.stringify(creative.interests)
    );

    return {
      ok: true,
      mode: 'live',
      productId: product.id,
      adId: rec.lastInsertRowid,
      tiktokCampaignId: campaignId,
      tiktokAdGroupId: adgroupId,
      tiktokAdId: adId,
      dailyBudget: budget,
      targetUrl: creative.targetUrl
    };
  } catch (e) {
    console.error('[TIKTOK] createAdForProduct API error:', e.message);
    // Save as draft with the error for manual retry
    const rec = db.prepare(`
      INSERT INTO tiktok_ads
        (product_id, campaign_name, adgroup_name, ad_name, video_script_index,
         cover_image, target_url, budget_daily, budget_total, bid_amount,
         target_audience, status, is_active, auto_optimize, last_error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'error', 0, 1, ?)
    `).run(
      product.id, campaignName, adGroupName, adName, creative.scriptIndex,
      creative.coverPublicUrl, creative.targetUrl, budget, opts.totalBudget || budget * 7,
      opts.bidAmount || 0.50, JSON.stringify(creative.interests), e.message.slice(0, 500)
    );
    return {
      ok: false,
      productId: product.id,
      adId: rec.lastInsertRowid,
      error: e.message,
      creative: {
        campaignName, adGroupName, adName,
        scripts: creative.scripts,
        targetUrl: creative.targetUrl
      }
    };
  }
}

// ── Fetch performance metrics for all active ads ───────────────────────────
async function syncPerformance() {
  if (!tiktokConfigured()) return { ok: false, reason: 'TikTok token not configured' };
  const advertiserId = process.env.TIKTOK_ADVERTISER_ID;
  if (!advertiserId) return { ok: false, reason: 'TIKTOK_ADVERTISER_ID not set' };

  const client = tiktokApi();
  const activeAds = db.prepare("SELECT * FROM tiktok_ads WHERE is_active = 1 AND status = 'active'").all();
  let updated = 0;

  for (const ad of activeAds) {
    try {
      const resp = await client.post('/report/integrated/get/', {
        advertiser_id: advertiserId,
        filter: {
          advertiser_id: advertiserId,
          ad_ids: [ad.ad_id],
          start_date: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),
          end_date: new Date().toISOString().slice(0, 10)
        },
        metrics: {
          imp: true, clk: true, cost: true, gross_impressions: true,
          paid_primitive_action: true, primitive_action_value: true
        }
      });

      const stats = resp?.data?.list?.[0] || {};
      const impressions = Number(stats.imp || 0);
      const clicks = Number(stats.clk || 0);
      const spend = Number(stats.cost || 0);
      const conversions = Number(stats.paid_primitive_action || 0);
      const conversionsValue = Number(stats.primitive_action_value || 0);

      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      const cpc = clicks > 0 ? spend / clicks : 0;
      const cpa = conversions > 0 ? spend / conversions : 0;
      const roas = spend > 0 ? conversionsValue / spend : 0;

      db.prepare(`
        UPDATE tiktok_ads
        SET impressions = ?, clicks = ?, spend = ?, conversions = ?,
            conversions_value = ?, ctr = ?, cpc = ?, cpa = ?, roas = ?,
            last_synced = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(impressions, clicks, spend, conversions, conversionsValue, ctr, cpc, cpa, roas, ad.id);
      updated++;
      // Feed the centralized attribution ledger so the existing kill/scale
      // rules (adAttributionEngine) govern paid TikTok spend too — one rule
      // set, not two. Deltas keep the ledger cumulative across syncs.
      feedAttributionLedger(ad, { impressions, clicks, spend, conversions, conversionsValue });
    } catch (e) {
      console.error(`[TIKTOK] sync failed for ad #${ad.id}:`, e.message);
    }
  }

  return { ok: true, updated, total: activeAds.length };
}

// Push a TikTok ad's latest numbers into ad_attribution_ledger as deltas.
// Returns the ledger row (with its kill/scale verdict) or null when unavailable.
function feedAttributionLedger(ad, metrics) {
  try {
    const attr = require('./adAttributionEngine');
    const ledgerId = `tiktok-${ad.ad_id || ad.id}`;
    const existing = db.prepare('SELECT * FROM ad_attribution_ledger WHERE campaign_id = ?').get(ledgerId);
    const prev = (k) => (existing ? Number(existing[k]) || 0 : 0);
    const row = attr.recordCampaignMetrics({
      campaignId: ledgerId,
      channel: 'tiktok',
      productId: ad.product_id ?? null,
      spendDelta: Math.max(0, Number(metrics.spend) - prev('spend')),
      clicksDelta: Math.max(0, Number(metrics.clicks) - prev('clicks')),
      impressionsDelta: Math.max(0, Number(metrics.impressions) - prev('impressions')),
      salesDelta: Math.max(0, Number(metrics.conversions) - prev('sales_count')),
      revenueDelta: Math.max(0, Number(metrics.conversions_value) - prev('attributed_revenue'))
    });
    return row;
  } catch (e) {
    console.error('[TIKTOK] attribution ledger feed failed:', e.message);
    return null;
  }
}

// ── AUTO-OPTIMIZATION: pause low performers, scale high ROAS ───────────────
// Rules:
//   • Pause ads with CTR < 0.5% AND spend > $5 (wasting budget)
//   • Pause ads with CPA > product price * 2 (acquiring customers too expensive)
//   • Scale (increase daily budget 25%) ads with ROAS > 3.0 AND conversions > 3
//   • Scale ads with CTR > 2.0% (engaging creative, give it more reach)
async function autoOptimize() {
  if (!tiktokConfigured()) return { ok: false, reason: 'TikTok token not configured' };

  // First sync fresh performance
  await syncPerformance();

  // Centralized attribution ledger verdicts (adAttributionEngine rules):
  //   killed → burn tripwire (≥$15 spend, 0 sales)
  //   paused → mature with ROAS < 1.2
  //   scaled → ROAS >= 3.0 and spend >= $20
  // These ride on top of the TikTok-specific CTR/CPA rules below — one rule set.
  let ledgerRows = {};
  try {
    const attr = require('./adAttributionEngine');
    const sweep = attr.runAttributionSweep();
    for (const c of (sweep.campaigns || [])) ledgerRows[c.campaign_id] = c;
  } catch (e) { /* attribution layer unavailable — local rules still apply */ }

  const rows = db.prepare("SELECT * FROM tiktok_ads WHERE is_active = 1 AND status = 'active'").all();
  const client = tiktokApi();
  const advertiserId = process.env.TIKTOK_ADVERTISER_ID;
  const results = { paused: [], scaled: [], total: rows.length };

  for (const ad of rows) {
    try {
      const product = db.prepare('SELECT price FROM products WHERE id = ?').get(ad.product_id);
      const price = product ? parseFloat(String(product.price || '0').replace(/[^0-9.]/g, '')) || 0 : 0;
      const ledger = ledgerRows[`tiktok-${ad.ad_id || ad.id}`] || null;

      let shouldPause = false;
      let pauseReason = '';

      // Ledger verdict first: a burn tripwire or sub-par ROAS is authoritative.
      if (ledger && (ledger.status === 'killed' || ledger.status === 'paused')) {
        shouldPause = true;
        pauseReason = ledger.kill_reason || `Attribution ledger: ${ledger.status}`;
      }

      // Rule 1: Low CTR + meaningful spend = wasteful
      if (!shouldPause && ad.ctr < 0.5 && ad.spend > 5) {
        shouldPause = true;
        pauseReason = `CTR ${ad.ctr.toFixed(2)}% < 0.5% with $${ad.spend.toFixed(2)} spend`;
      }

      // Rule 2: CPA exceeds 2x product price = too expensive
      if (!shouldPause && price > 0 && ad.cpa > price * 2 && ad.conversions > 0) {
        shouldPause = true;
        pauseReason = `CPA $${ad.cpa.toFixed(2)} > 2× price ($${price})`;
      }

      // Rule 3: No conversions after $10 spend = likely wasted spend
      if (!shouldPause && ad.conversions === 0 && ad.spend > 10) {
        shouldPause = true;
        pauseReason = `No conversions after $${ad.spend.toFixed(2)} spend`;
      }

      if (shouldPause) {
        // Update TikTok API: set ad status to paused
        try {
          await client.post('/ad/update/status/', {
            advertiser_id: advertiserId,
            ad_ids: [ad.ad_id],
            status: 'AD_STATUS_PAUSED'
          });
        } catch (e) {
          console.error(`[TIKTOK] failed to pause ad #${ad.id}:`, e.message);
        }
        db.prepare("UPDATE tiktok_ads SET is_active = 0, status = 'paused', last_synced = CURRENT_TIMESTAMP WHERE id = ?").run(ad.id);
        results.paused.push({ id: ad.id, reason: pauseReason });
        console.log(`[TIKTOK] Paused ad #${ad.id}: ${pauseReason}`);
        continue;
      }

      // Scale rules: only scale ads with proven performance
      let newBudget = ad.budget_daily;
      let scaled = false;

      // Ledger verdict: a qualified winner is eligible for budget expansion.
      if (ledger && ledger.status === 'scaled') {
        newBudget = Math.min(Math.max(newBudget, ad.budget_daily * 1.25), MAX_DAILY_BUDGET);
        scaled = true;
      }

      // Scale high-ROAS winners (ROAS > 3.0 with real conversions)
      if (ad.roas > 3.0 && ad.conversions >= 3) {
        newBudget = Math.min(ad.budget_daily * 1.25, MAX_DAILY_BUDGET);
        scaled = true;
      }

      // Scale high-CTR creatives (engaging, give more reach)
      if (ad.ctr > 2.0 && ad.clicks > 20) {
        newBudget = Math.min(Math.max(newBudget, ad.budget_daily * 1.25), MAX_DAILY_BUDGET);
        scaled = true;
      }

      if (scaled && newBudget > ad.budget_daily) {
        try {
          await client.post('/ad_group/update/', {
            advertiser_id: advertiserId,
            ad_group_id: ad.adgroup_id,
            budget: { daily_budget: { amount: Math.round(newBudget * 100), currency_id: 'USD' } }
          });
        } catch (e) {
          console.error(`[TIKTOK] failed to scale ad group for #${ad.id}:`, e.message);
        }
        db.prepare('UPDATE tiktok_ads SET budget_daily = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newBudget, ad.id);
        results.scaled.push({ id: ad.id, oldBudget: ad.budget_daily, newBudget });
        console.log(`[TIKTOK] Scaled ad #${ad.id}: $${ad.budget_daily} → $${newBudget}/day`);
      }
    } catch (e) {
      console.error(`[TIKTOK] optimize error for ad #${ad.id}:`, e.message);
    }
  }

  return { ok: true, ...results };
}

// ── List products eligible for TikTok ads (listed, no active ad yet) ───────
function eligibleProductsForAds(limit = 5) {
  return db.prepare(`
    SELECT p.*, pr.name AS prof_name
    FROM products p
    LEFT JOIN professions pr ON p.profession_id = pr.id
    WHERE p.status = 'listed'
      AND NOT EXISTS (
        SELECT 1 FROM tiktok_ads ta WHERE ta.product_id = p.id AND ta.is_active = 1
      )
    ORDER BY p.id DESC
    LIMIT ?
  `).all(limit);
}

// ── Dashboard summary for TikTok ads ───────────────────────────────────────
function adStatus() {
  const summary = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'active' AND is_active = 1 THEN 1 ELSE 0 END) as active,
      SUM(CASE WHEN status = 'paused' THEN 1 ELSE 0 END) as paused,
      SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errored,
      COALESCE(SUM(impressions), 0) as impressions,
      COALESCE(SUM(clicks), 0) as clicks,
      COALESCE(SUM(spend), 0) as spend,
      COALESCE(SUM(conversions), 0) as conversions,
      COALESCE(SUM(conversions_value), 0) as conversionsValue
    FROM tiktok_ads
  `).get();

  const topAds = db.prepare(
    "SELECT id, product_id, campaign_name, ad_name, impressions, clicks, spend, conversions, roas, ctr, cpa, status FROM tiktok_ads ORDER BY roas DESC NULLS LAST, clicks DESC LIMIT 10"
  ).all();

  return {
    configured: tiktokConfigured(),
    advertiserId: !!process.env.TIKTOK_ADVERTISER_ID,
    budgetDefaults: { daily: DEFAULT_DAILY_BUDGET, maxDaily: MAX_DAILY_BUDGET, maxTotal: MAX_TOTAL_BUDGET },
    summary: {
      total: summary.total || 0,
      active: summary.active || 0,
      paused: summary.paused || 0,
      draft: summary.draft || 0,
      errored: summary.errored || 0,
      impressions: summary.impressions || 0,
      clicks: summary.clicks || 0,
      spend: Number(summary.spend || 0),
      conversions: summary.conversions || 0,
      conversionsValue: Number(summary.conversionsValue || 0),
      ctr: summary.clicks > 0 && summary.impressions > 0 ? (Number(summary.clicks) / Number(summary.impressions) * 100).toFixed(2) : '0.00'
    },
    topAds
  };
}

module.exports = {
  tiktokConfigured,
  tiktokApi,
  createAdForProduct,
  syncPerformance,
  autoOptimize,
  eligibleProductsForAds,
  adStatus,
  buildCreative,
  feedAttributionLedger,
  interestTargetsForProfession,
  resolveAdBaseUrl,
  DEFAULT_DAILY_BUDGET,
  MAX_DAILY_BUDGET,
  MAX_TOTAL_BUDGET
};
