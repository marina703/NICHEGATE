// ═══════════════════════════════════════════════════════════════════════════
// SWIPE FILE — Foreplay-lite competitor ad intelligence (Phase 5).
// Builds on the public transparency libraries (Meta Ad Library, TikTok
// Creative Center) with the same snapshot pattern as trend tracking:
// first_seen / last_seen / times_seen. LONGEVITY IS THE ONLY PERFORMANCE
// PROXY — an ad in-market 45+ days at real spend almost certainly works.
// AI angle tagging + hook generation are optional (deterministic fallbacks).
// ═══════════════════════════════════════════════════════════════════════════

const { db } = require('../database');

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9'
};

function normalizeKey(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Meta Ad Library public search (ads library API without a token is the
// HTML app; this hits the public JSON edge used by the web app — bot-gates
// from datacenter IPs are expected and degrade to health-marked []).
async function fetchMetaAds(query, limit = 10) {
  try {
    const url = `https://www.facebook.com/ads/library/async/search/text/?q=${encodeURIComponent(query)}&active_status=active&country=US`;
    const axios = require('axios');
    const resp = await axios.get(url, { timeout: 12000, headers: BROWSER_HEADERS, validateStatus: s => s < 500 });
    const payload = typeof resp.data === 'string' ? safeJson(resp.data.replace(/^for\s*\(;;\);/, '')) : resp.data;
    const results = payload?.payload?.results || [];
    const out = [];
    for (const r of results) {
      if (out.length >= limit) break;
      const body = r.ad_creative_bodies?.[0] || r.body || '';
      const advertiser = r.page_name || r.advertiser_name || '';
      if (!body) continue;
      out.push({
        platform: 'meta',
        adId: r.id || String(advertiser) + ':' + String(body).slice(0, 24),
        advertiser,
        body: String(body).slice(0, 600),
        cta: r.cta_type || r.cta_text || null,
        formats: JSON.stringify(r.publisher_platforms || []),
        startedAt: r.ad_delivery_start_time || r.started_running_date || null
      });
    }
    return { ok: true, ads: out, gated: out.length === 0 };
  } catch (e) {
    return { ok: false, ads: [], gated: true, error: e.message };
  }
}

// TikTok Creative Center — public "top ads" edge; auth-gated without a
// logged-in session, so failure is the expected path from servers. Kept so
// the lane opens automatically when run with session-able headers/cookies.
async function fetchTikTokAds(query, limit = 10) {
  try {
    const axios = require('axios');
    const url = `https://ads.tiktok.com/creative_radar/api/v1/top_ads/v2/list?period=30&page=1&limit=${limit}&keyword=${encodeURIComponent(query)}&country_code=US`;
    const resp = await axios.get(url, { timeout: 12000, headers: BROWSER_HEADERS, validateStatus: s => s < 500 });
    const list = resp.data?.data?.ads || resp.data?.data?.list || [];
    const out = [];
    for (const a of Array.isArray(list) ? list : []) {
      if (out.length >= limit) break;
      out.push({
        platform: 'tiktok',
        adId: String(a.ad_id || a.id || a.name || '').slice(0, 80),
        advertiser: a.advertiser_name || a.brand || '',
        body: String(a.video_descriptions?.[0] || a.description || a.name || '').slice(0, 600),
        cta: a.cta_text || null,
        formats: JSON.stringify(['tiktok']),
        startedAt: a.first_shown_date || null
      });
    }
    return { ok: true, ads: out, gated: out.length === 0 };
  } catch (e) {
    return { ok: false, ads: [], gated: true, error: e.message };
  }
}

function safeJson(s) { try { return JSON.parse(s); } catch { return null; } }

// Upsert fetched ads with longevity tracking.
function upsertAds(ads, nicheKey) {
  let upserted = 0;
  const now = new Date().toISOString();
  for (const ad of ads || []) {
    if (!ad.platform || !ad.adId || !ad.body) continue;
    const existing = db.prepare('SELECT * FROM swipe_ads WHERE platform = ? AND ad_id = ?').get(ad.platform, ad.adId);
    if (existing) {
      db.prepare('UPDATE swipe_ads SET last_seen = ?, times_seen = times_seen + 1 WHERE id = ?')
        .run(now, existing.id);
    } else {
      db.prepare(
        `INSERT INTO swipe_ads (platform, advertiser, ad_id, body, cta, formats, first_seen, last_seen, times_seen, angle, niche_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
      ).run(ad.platform, ad.advertiser || null, ad.adId, ad.body, ad.cta || null, ad.formats || null, ad.startedAt || now, now, ad.angle || classifyAngle(ad.body), nicheKey || null);
    }
    upserted++;
  }
  return upserted;
}

// Longevity in days (first_seen → last_seen); the ranking signal.
function longevityDays(row) {
  const first = Date.parse(row.first_seen || row.created_at);
  const last = Date.parse(row.last_seen || row.created_at);
  if (!Number.isFinite(first) || !Number.isFinite(last)) return 0;
  return Math.max(0, Math.round((last - first) / 86400000));
}

// Long-runner list: ads still live ≥ minDays are the hypothesis seeds.
function longRunners({ minDays = 14, nicheKey = null, limit = 25 } = {}) {
  const rows = nicheKey
    ? db.prepare('SELECT * FROM swipe_ads WHERE niche_key = ? ORDER BY times_seen DESC, last_seen DESC LIMIT 200').all(nicheKey)
    : db.prepare('SELECT * FROM swipe_ads ORDER BY times_seen DESC, last_seen DESC LIMIT 200').all();
  return rows
    .map(r => ({ ...r, longevity: longevityDays(r) }))
    .filter(r => r.longevity >= minDays)
    .sort((a, b) => b.longevity - a.longevity)
    .slice(0, limit);
}

// Deterministic angle classification from ad copy (no AI needed).
const ANGLE_RULES = [
  { angle: 'pain-point', re: /\b(tired of|struggle|struggling|hate|overwhelm|no time|wasting)\b/i },
  { angle: 'social-proof', re: /\b(join(ed)? \d|[\d,]+\s+(users|sellers|businesses)|as seen in|trusted by)\b/i },
  { angle: 'speed', re: /\b(in \d+ (minutes|seconds|days)|instant(ly)?|fast|quick|overnight)\b/i },
  { angle: 'objection-price', re: /\b(afford|cheap(er)?|price|cost|free|discount|% off|save)\b/i },
  { angle: 'authority', re: /\b(proven|expert|certified|professional|used by)\b/i },
  { angle: 'fomo', re: /\b(limited|only \d+|today|ends (tonight|soon)|before it.?s gone|last chance)\b/i }
];
function classifyAngle(body) {
  for (const r of ANGLE_RULES) {
    if (r.re.test(String(body || ''))) return r.angle;
  }
  return 'direct-offer';
}

// AI hook variants for a REAL product, seeded by long-runner angles.
async function generateHooks(productId) {
  const product = db.prepare('SELECT p.*, pr.name AS prof_name FROM products p LEFT JOIN professions pr ON p.profession_id = pr.id WHERE p.id = ?').get(productId);
  if (!product) throw new Error('Product not found');

  const seedAds = longRunners({ limit: 8 });
  const angles = [...new Set(seedAds.map(a => a.angle).filter(Boolean))];
  const seeds = seedAds.slice(0, 3).map(a => `"${String(a.body).slice(0, 90)}..." (${a.angle}, ${a.longevity}d live)`).join('; ');

  let hooks;
  try {
    const ce = require('./conceptEngine');
    const concept = safeConcept(product.concept);
    const prompt = 'Write exactly 3 short ad hooks (one line each, numbered) for the product "' +
      (concept ? concept.name : product.name) + '" for ' + (product.prof_name || 'small business owners') +
      '. Copy the ANGLE, not the wording, from these proven competitor ads: ' + (seeds || 'use pain-point, speed and social-proof angles') + '.';
    const raw = await ce.generateSocialPost(prompt, product.prof_name);
    hooks = raw ? String(raw).split(/\n+/).map(l => l.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(l => l.length > 12).slice(0, 3) : null;
  } catch { hooks = null; }

  if (!hooks || !hooks.length) {
    const name = product.name;
    hooks = [
      `${product.prof_name || 'Your business'}: stop rebuilding the same ${product.type} from scratch — ${name} does it in minutes.`,
      `The ${product.type} that pays for itself the first time you use it (${name}).`,
      `Instant download, ready today: ${name} — built for ${product.prof_name || 'real workflows'}.`
    ];
  }
  return { ok: true, productId, hooks, anglesFound: angles, seededFrom: seedAds.length };
}

function safeConcept(raw) {
  try { const c = JSON.parse(raw); return c && c.name ? c : null; } catch { return null; }
}

// Sweep: fetch + upsert + classify for one niche keyword.
async function sweepNiche(query, { limit = 10 } = {}) {
  const [meta, tiktok] = await Promise.allSettled([fetchMetaAds(query, limit), fetchTikTokAds(query, limit)]);
  const collected = [];
  const metaR = meta.status === 'fulfilled' ? meta.value : { ok: false, ads: [], gated: true, error: meta.reason && meta.reason.message };
  const ttR = tiktok.status === 'fulfilled' ? tiktok.value : { ok: false, ads: [], gated: true, error: tiktok.reason && tiktok.reason.message };
  for (const ad of [...(metaR.ads || []), ...(ttR.ads || [])]) {
    ad.angle = classifyAngle(ad.body);
    collected.push(ad);
  }
  const upserted = upsertAds(collected, normalizeKey(query));
  return {
    ok: true, query, upserted,
    sources: {
      meta: { ok: metaR.ok, count: (metaR.ads || []).length, gated: !!metaR.gated, error: metaR.error || null },
      tiktok: { ok: ttR.ok, count: (ttR.ads || []).length, gated: !!ttR.gated, error: ttR.error || null }
    }
  };
}

module.exports = { sweepNiche, fetchMetaAds, fetchTikTokAds, upsertAds, longRunners, classifyAngle, generateHooks, longevityDays, ANGLE_RULES };
