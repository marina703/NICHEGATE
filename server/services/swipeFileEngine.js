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

// ═══════════════════════════════════════════════════════════════════════
// DESIGN REFERENCES (Design Quality Upgrade Phase 3) — reference-grounded
// taste. Rows store EXTRACTED DESIGN DNA ONLY (palette hexes, font names,
// layout grid, motif, taste note) — brief-level transfer, never pixel-copy.
// Seeds are curated from public-domain print/editorial traditions; winning
// in-house designs (critique score >= 8) auto-enter as exemplars.
// ═══════════════════════════════════════════════════════════════════════

const SEED_DESIGN_REFERENCES = [
  { title: 'Swiss International Style poster', niche_key: 'default', palette: '["#e63329","#f5f0e8","#1a1a1a"]', fonts: '{"heading":"Akzidenz-Grotesk","body":"Helvetica"}', layout: 'strict asymmetric grid, flush-left type', motif: 'bold diagonal colour field', taste_note: 'Champion negative space and one screaming accent; never decorate when a grid will do.' },
  { title: 'Bauhaus exhibition program', niche_key: 'craft', palette: '["#1f4e9c","#e8b417","#c73a2c"]', fonts: '{"heading":"Futura","body":"Futura"}', layout: 'geometry-driven, type as structure', motif: 'circle/triangle/square stack', taste_note: 'Let the geometry carry the identity; colour-block hard, align harder.' },
  { title: 'Penguin Books tri-band cover', niche_key: 'default', palette: '["#fc770a","#ffffff","#1a1a1a"]', fonts: '{"heading":"Gill Sans","body":"Gill Sans"}', layout: 'three horizontal bands, centred title', motif: 'horizontal banding', taste_note: 'A strict frame makes any content look curated; the band IS the brand.' },
  { title: 'Whole Earth Catalog spread', niche_key: 'outdoor', palette: '["#f4f1e4","#2f2f2f","#7a8b5c"]', fonts: '{"heading":"Times","body":"Times"}', layout: 'dense annotated columns', motif: 'hand-drawn arrow annotations', taste_note: 'Information density reads as generosity — pack it, but annotate every item.' },
  { title: 'Field Notes kraft cover', niche_key: 'trades', palette: '["#c8a97e","#2b2b2b","#a4243b"]', fonts: '{"heading":"Trade Gothic","body":"Courier"}', layout: 'utilitarian label grid', motif: 'ruled ledger lines', taste_note: 'Working materials honesty: kraft, rules and stamps beat gloss.' },
  { title: 'Mid-century airline timetable', niche_key: 'finance', palette: '["#0e4f6b","#f0c24b","#f7f4ec"]', fonts: '{"heading":"Gotham","body":"Gotham"}', layout: 'tabular grid with oversized numerals', motif: 'flight-path arcs', taste_note: 'Tables can sing — give numerals room and colour-code the columns.' },
  { title: 'Botanical plate (Curtis)', niche_key: 'outdoor', palette: '["#e9e4d4","#3e5c3a","#c25e3b"]', fonts: '{"heading":"Caslon","body":"Caslon"}', layout: 'centred specimen with caption block', motif: 'engraved line foliage', taste_note: 'One beautiful subject on warm paper with an italic caption is timeless.' },
  { title: 'Art-deco theatre program', niche_key: 'beauty', palette: '["#120e14","#d4af37","#f2e8d5"]', fonts: '{"heading":"Broadway","body":"Futura"}', layout: 'symmetrical, framed title stack', motif: 'sunburst fan', taste_note: 'Symmetry plus metallic accent signals occasion — save it for premium tiers.' },
  { title: 'Risograph zine spread', niche_key: 'creator', palette: '["#ff6b9d","#2b6cb0","#fff7e6"]', fonts: '{"heading":"Space Grotesk","body":"Space Mono"}', layout: 'scrapbook collage, rotated blocks', motif: 'misregistered duotone', taste_note: 'Deliberate misregistration and clashing spot colours read as handmade energy.' },
  { title: 'Japanese seigaiha wave pattern', niche_key: 'wellness', palette: '["#1b3a5c","#f5f0e6","#c46a5a"]', fonts: '{"heading":"Shippori Mincho","body":"Noto Sans JP"}', layout: 'quiet margins, low-density centre', motif: 'overlapping wave scales', taste_note: 'Repeat one calm motif at low contrast; the page should breathe.' },
  { title: 'Constructivist agit-poster', niche_key: 'tech', palette: '["#c8102e","#111111","#e8e4d8"]', fonts: '{"heading":"Alternate Gothic","body":"Helvetica"}', layout: 'diagonal bands, oversized numerals', motif: 'diagonal wedge', taste_note: 'A hard diagonal creates urgency — use it once per page, never twice.' },
  { title: 'Memphis Milano pattern', niche_key: 'food', palette: '["#f54e6b","#26c2a3","#f7d54c"]', fonts: '{"heading":"Righteous","body":"Rubik"}', layout: 'playful scatter with grid fallback', motif: 'squiggle + terrazzo dots', taste_note: 'Controlled chaos works only when the underlying grid is strict.' },
  { title: 'Vintage French patisserie box', niche_key: 'food', palette: '["#e9c46a","#7b3f61","#fdf6ec"]', fonts: '{"heading":"Playfair Display","body":"Lora"}', layout: 'centred oval label with border frame', motif: 'scalloped border', taste_note: 'A scalloped frame and script flourish say handmade — keep it small and centred.' },
  { title: 'Modern SaaS dashboard sheet', niche_key: 'tech', palette: '["#0f172a","#38bdf8","#e2e8f0"]', fonts: '{"heading":"Inter","body":"Inter"}', layout: 'card grid, 8px rhythm', motif: 'soft shadowed cards', taste_note: 'Card grid and generous 8px rhythm signal modern software; keep radii consistent.' },
  { title: 'Letterpress broadside', niche_key: 'spiritual', palette: '["#211d1a","#e8dcc4","#8b3a2f"]', fonts: '{"heading":"Clarendon","body":"Caslon"}', layout: 'type-scale hierarchy, ruled separations', motif: 'ornamental divider', taste_note: 'Hierarchy through type scale and rules alone — no colour needed.' }
];

function seedDesignReferences() {
  try {
    const existing = db.prepare('SELECT COUNT(*) c FROM design_references').get().c;
    if (existing > 0) return existing;
    const stmt = db.prepare(`
      INSERT INTO design_references (title, source, niche_key, palette, fonts, layout, motif, taste_note)
      VALUES (?, 'seed', ?, ?, ?, ?, ?, ?)
    `);
    for (const r of SEED_DESIGN_REFERENCES) {
      stmt.run(r.title, r.niche_key, r.palette, r.fonts, r.layout, r.motif, r.taste_note);
    }
    return SEED_DESIGN_REFERENCES.length;
  } catch (e) {
    return 0; // table missing / concurrent init — never throws
  }
}

// Pick 1-2 niche-relevant references as brief-level few-shot context.
// Falls back across niche → default → anything; randomness is uniform.
function pickDesignReferences(nicheKey, limit = 2) {
  try {
    const rows = db.prepare('SELECT * FROM design_references WHERE niche_key = ? ORDER BY RANDOM() LIMIT ?').all(String(nicheKey || 'default'), limit);
    if (rows.length < limit) {
      const more = db.prepare('SELECT * FROM design_references WHERE niche_key != ? ORDER BY RANDOM() LIMIT ?').all(String(nicheKey || 'default'), limit - rows.length);
      rows.push(...more);
    }
    return rows.slice(0, limit).map(r => ({
      title: r.title, palette: r.palette, fonts: r.fonts, layout: r.layout,
      motif: r.motif, taste_note: r.taste_note, source: r.source
    }));
  } catch {
    return [];
  }
}

// Winners loop: a top-scoring design (critique >= 8) enters the pool as an
// exemplar. Human-auditable rows — source='winner', linked to the product.
function addDesignReference(ref) {
  if (!ref || !ref.title) return null;
  try {
    const info = db.prepare(`
      INSERT INTO design_references (title, source, niche_key, palette, fonts, layout, motif, taste_note, product_id, score)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      String(ref.title).slice(0, 120),
      ['winner', 'manual', 'template', 'seed', 'analyzed'].includes(ref.source) ? ref.source : 'manual',
      ref.niche_key || null,
      typeof ref.palette === 'string' ? ref.palette.slice(0, 500) : JSON.stringify(ref.palette || []).slice(0, 500),
      typeof ref.fonts === 'string' ? ref.fonts.slice(0, 300) : JSON.stringify(ref.fonts || {}).slice(0, 300),
      String(ref.layout || '').slice(0, 120) || null,
      String(ref.motif || '').slice(0, 120) || null,
      String(ref.taste_note || '').slice(0, 300) || null,
      ref.product_id || null,
      Number.isFinite(ref.score) ? ref.score : null
    );
    return info.lastInsertRowid;
  } catch (e) {
    return null;
  }
}

function listDesignReferences(limit = 50) {
  try {
    return db.prepare('SELECT * FROM design_references ORDER BY id DESC LIMIT ?').all(limit);
  } catch {
    return [];
  }
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

module.exports = { sweepNiche, fetchMetaAds, fetchTikTokAds, upsertAds, longRunners, classifyAngle, generateHooks, longevityDays, ANGLE_RULES,
  SEED_DESIGN_REFERENCES, seedDesignReferences, pickDesignReferences, addDesignReference, listDesignReferences };
