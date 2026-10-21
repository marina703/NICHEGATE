// ═══════════════════════════════════════════════════════════════════════════
// PIN ENGINE — Tailwind-lite Pinterest distribution (Phase 5).
// Schedule queue + AI pin copy + Pinterest keyword research + pin→sale
// attribution via UTM-tagged store URLs (Gumroad sync records the sales).
// AI is optional: deterministic fallbacks keep MODEL_ENABLED=false whole.
// ═══════════════════════════════════════════════════════════════════════════

const { db } = require('../database');

// ── Optimal time slots ────────────────────────────────────────────────────
// Tailwind's "smart schedule" is engagement-weighted posting windows. This is
// the same idea: a fixed weekly grid of high-engagement Pinterest slots (UTC
// hours chosen for US-evening traffic), round-robin assigned so a large queue
// spreads evenly across the week instead of dumping all at once.
const SLOT_GRID = [
  { day: 1, hour: 1 }, { day: 1, hour: 15 }, { day: 1, hour: 20 },
  { day: 2, hour: 1 }, { day: 2, hour: 15 }, { day: 2, hour: 20 },
  { day: 3, hour: 1 }, { day: 3, hour: 15 }, { day: 3, hour: 20 },
  { day: 4, hour: 1 }, { day: 4, hour: 15 }, { day: 4, hour: 20 },
  { day: 5, hour: 1 }, { day: 5, hour: 15 }, { day: 5, hour: 20 },
  { day: 6, hour: 3 }, { day: 6, hour: 21 },
  { day: 0, hour: 3 }, { day: 0, hour: 21 }
];

// Next slot at/after `from`, round-robin by how many pins are already queued
// per slot so the schedule stays balanced.
function nextSlot(from = new Date(), offset = 0) {
  const counts = {};
  try {
    for (const r of db.prepare("SELECT scheduled_for FROM pins WHERE status = 'scheduled'").all()) {
      const d = new Date(r.scheduled_for);
      if (isNaN(d)) continue;
      const k = `${d.getUTCDay()}:${d.getUTCHours()}`;
      counts[k] = (counts[k] || 0) + 1;
    }
  } catch { /* fresh table */ }
  const candidates = [];
  for (let i = 0; i < SLOT_GRID.length; i++) {
    const s = SLOT_GRID[i];
    const d = new Date(Date.UTC(
      from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), s.hour, 0, 0
    ));
    let add = (s.day - from.getUTCDay() + 7) % 7;
    if (add === 0 && d <= from) add = 7;
    d.setUTCDate(d.getUTCDate() + add);
    candidates.push({ at: d, load: counts[`${s.day}:${s.hour}`] || 0 });
  }
  candidates.sort((a, b) => (a.load - b.load) || (a.at - b.at));
  const pick = candidates[offset % Math.max(1, candidates.length)] || candidates[0];
  return pick ? pick.at : new Date(from.getTime() + 86400000);
}

// ── UTM-tagged store URL (pin→sale attribution) ───────────────────────────
function storeUrl() {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'store_url'").get();
    if (row && row.value) return String(row.value).replace(/\/+$/, '');
  } catch { /* no settings yet */ }
  return 'https://store.example.com'; // placeholder until store_url is set
}

function utmFor(product, boardHint) {
  const p = new URLSearchParams({
    utm_source: 'pinterest',
    utm_medium: 'organic-pin',
    utm_campaign: `pin-${product && product.id ? product.id : 'generic'}`,
    utm_content: String(boardHint || 'general').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)
  });
  return p.toString();
}

function attributedUrl(product, boardHint) {
  if (!product) return null;
  let target = null;
  // 1. An explicit buy_url always wins.
  if (product.buy_url) target = String(product.buy_url);
  // 2. A Gumroad short_url/url stored on the listing row (pinned products carry it).
  if (!target) {
    try {
      const li = product.listing_json ? JSON.parse(product.listing_json) : null;
      if (li && (li.short_url || li.url)) target = String(li.short_url || li.url);
    } catch { /* ignore malformed listing_json */ }
  }
  // 3. The storefront URL is always a valid landing page.
  if (!target) target = storeUrl();
  if (!target) return null;
  return `${target}${target.includes('?') ? '&' : '?'}${utmFor(product, boardHint)}`;
}

// ── AI pin copy with deterministic fallback ────────────────────────────────
function fallbackPinCopy(product, profName, keywords) {
  const kw = (keywords && keywords.length) ? keywords : [];
  const kwTail = kw.slice(0, 3).map(k => `#${String(k).replace(/[^a-z0-9]/gi, '')}`).join(' ');
  return {
    title: `${product && product.name ? product.name : profName || 'Digital template'} | Instant download`,
    description: `${profName || 'This niche'} ${product && product.type ? product.type : 'template'} — printable, editable, and ready to use today. Download once, use forever.${kw.length ? ` Includes: ${kw.slice(0, 5).join(', ')}.` : ''} ${kwTail}`.trim()
  };
}

async function aiPinCopy(product, profName, keywords) {
  const fallback = fallbackPinCopy(product, profName, keywords);
  try {
    const ce = require('./conceptEngine');
    const concept = product && product.concept ? safeConcept(product.concept) : null;
    const prompt = concept
      ? `Write a Pinterest pin for "${concept.name}" (${concept.pitch || ''}) for ${profName || 'small business owners'}.`
      : `Write a Pinterest pin for a ${product && product.type || 'digital template'} for ${profName || 'small business owners'}.`;
    const copy = await ce.generateSocialPost(prompt, profName);
    if (copy && copy.length > 15) {
      return { title: fallback.title, description: `${String(copy).slice(0, 480)} ${fallback.description.split('#').slice(1).map(h => '#' + h.trim()).join(' ')}`.trim(), ai: true };
    }
  } catch { /* never throw */ }
  return { ...fallback, ai: false };
}

function safeConcept(raw) {
  try { const c = JSON.parse(raw); return c && c.name ? c : null; } catch { return null; }
}

// ── Pinterest keyword research (free autocomplete, same pattern as Etsy) ──
async function pinterestKeywords(seed, limit = 8) {
  try {
    const axios = require('axios');
    const resp = await axios.get(
      `https://www.pinterest.com/resource/BaseSearchResource/get/?source_url=%2Fsearch%2F&q=${encodeURIComponent(seed)}&data=%7B%22options%22%3A%7B%22query%22%3A%22${encodeURIComponent(seed)}%22%7D%7D`,
      { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36', Accept: 'application/json' }, validateStatus: s => s < 500 }
    );
    const out = [];
    const guides = resp.data?.resource_response?.data?.guided_search || [];
    for (const g of Array.isArray(guides) ? guides : []) {
      const t = g.display || g.query || g.term || '';
      if (t && t.length > 2 && out.length < limit) out.push(String(t));
    }
    return out;
  } catch { return []; } // bot-gated → deterministic tag use still works
}

// ── Create a scheduled pin ────────────────────────────────────────────────
async function createPin({ productId, boardHint, when }) {
  let product = null;
  if (productId) product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  const profName = product
    ? ((db.prepare('SELECT name FROM professions WHERE id = ?').get(product.profession_id) || {}).name)
    : null;

  const keywords = await pinterestKeywords(profName || (product && product.name) || 'digital planner', 6);
  const copy = await aiPinCopy(product, profName, keywords);
  const url = attributedUrl(product, boardHint);
  const at = when ? new Date(when) : nextSlot();

  const info = db.prepare(
    `INSERT INTO pins (product_id, title, description, board_hint, target_url, utm, keywords, status, scheduled_for)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', ?)`
  ).run(
    productId || null, copy.title, copy.description, boardHint || 'general',
    url, url ? url.split('?')[1] || null : null,
    JSON.stringify(keywords), at.toISOString()
  );
  return { ok: true, id: info.lastInsertRowid, scheduled_for: at.toISOString(), ai: copy.ai, url };
}

// Listed products that don't have a scheduled/posted pin yet.
function unpinnedListedProducts(limit = 20) {
  return db.prepare(
    `SELECT p.*, pr.name AS prof_name FROM products p LEFT JOIN professions pr ON p.profession_id = pr.id
     WHERE p.status = 'listed'
       AND NOT EXISTS (SELECT 1 FROM pins WHERE pins.product_id = p.id AND pins.status IN ('scheduled','posted'))
     ORDER BY p.id DESC LIMIT ?`
  ).all(limit);
}

// Bulk: one pin per listed product (skips ones already pinned recently).
function scheduleForProducts(limit = 20) {
  const rows = unpinnedListedProducts(limit);
  let created = 0;
  const results = [];
  for (const p of rows) {
    try {
      const r = createPinSync(p);
      created++;
      results.push({ id: p.id, pinId: r.id, at: r.scheduled_for });
    } catch (e) {
      results.push({ id: p.id, error: e.message });
    }
  }
  return { ok: true, created, results };
}

// Autonomous variant: same selection, but AI keyword research + pin copy per
// pin (deterministic fallback inside aiPinCopy when MODEL_ENABLED=false).
async function scheduleForProductsAI(limit = 6) {
  const rows = unpinnedListedProducts(limit);
  let created = 0;
  const results = [];
  for (const p of rows) {
    try {
      const r = await createPin(p.id);
      created++;
      results.push({ id: p.id, pinId: r.id, ai: r.ai, at: r.scheduled_for });
    } catch (e) {
      results.push({ id: p.id, error: e.message });
    }
  }
  return { ok: true, created, results };
}

// Fire-and-forget hook for publish-success paths: schedule the pin NOW (AI
// copy when available) without blocking the publish response. Never throws.
function pinNewProductAsync(productId) {
  try {
    createPin(productId)
      .then(r => console.log('[PINS] auto-scheduled pin #' + r.id + ' for product #' + productId + ' (slot ' + r.scheduled_for + ')'))
      .catch(e => console.error('[PINS] auto-schedule failed for product #' + productId + ':', e.message));
  } catch (e) {
    console.error('[PINS] auto-schedule error:', e.message);
  }
}

// Synchronous twin of createPin for bulk loops (no AI/network per pin).
function createPinSync(product) {
  const copy = fallbackPinCopy(product, product.prof_name, []);
  const url = attributedUrl(product, 'general');
  const at = nextSlot();
  const info = db.prepare(
    `INSERT INTO pins (product_id, title, description, board_hint, target_url, utm, keywords, status, scheduled_for)
     VALUES (?, ?, ?, ?, ?, ?, '[]', 'scheduled', ?)`
  ).run(product.id, copy.title, copy.description, 'general', url, url ? url.split('?')[1] || null : null, at.toISOString());
  return { id: info.lastInsertRowid, scheduled_for: at.toISOString() };
}

// Due pins: dispatches each due pin in channel-priority order:
//   1. Direct Pinterest API v5 when the NicheGate app token exists
//      (marketplace_tokens or PINTEREST_ACCESS_TOKEN) — the permanent path.
//   2. Buffer bridge while that app is trial-only: Buffer posts through
//      Buffer's own Standard-access app so pins are PUBLIC immediately.
// A pin is marked 'posted' ONLY when a channel returns a publish id. With no
// channel configured nothing is touched (pins stay scheduled until one exists).
// A pin whose dispatch fails is marked 'failed' with the reason in note, so it
// is visible instead of being silently reported as published.
async function duePins(limit = 10) {
  const tokenRow = db.prepare("SELECT access_token FROM marketplace_tokens WHERE platform = 'pinterest'").get();
  const token = tokenRow?.access_token || process.env.PINTEREST_ACCESS_TOKEN;

  // Buffer is only the interim path: once the direct token exists it wins.
  const buffer = require('./bufferBridge');
  const useBuffer = !token && buffer.bufferReady({ product_id: 0 });
  if (!token && !useBuffer) return [];

  const now = new Date().toISOString();
  const rows = db.prepare(
    "SELECT * FROM pins WHERE status = 'scheduled' AND scheduled_for <= ? ORDER BY scheduled_for ASC LIMIT ?"
  ).all(now, limit);

  for (const r of rows) {
    let externalPinId = null;
    let channel = 'pinterest';
    let failure = null;
    if (token) {
      try {
        const published = await publishToPinterestApi(r, token);
        if (published && published.id) externalPinId = published.id;
      } catch (e) {
        failure = e.message;
        console.error(`[PINTEREST] API dispatch failed for pin #${r.id}:`, e.message);
      }
    }
    if (!externalPinId && useBuffer) {
      try {
        const published = await buffer.publishToBuffer(r);
        if (published && published.external_post_id) {
          externalPinId = published.external_post_id;
          channel = 'buffer';
        } else if (published && published.reason) {
          failure = published.reason;
        }
      } catch (e) {
        failure = e.message;
        console.error(`[BUFFER] dispatch failed for pin #${r.id}:`, e.message);
      }
    }

    if (externalPinId) {
      db.prepare("UPDATE pins SET status = 'posted', posted_at = ? WHERE id = ?").run(now, r.id);
      db.prepare('INSERT INTO automation_log (action, product_id, details, status) VALUES (?, ?, ?, ?)')
        .run(channel === 'buffer' ? 'buffer_publish' : 'pinterest_publish', r.product_id,
          channel === 'buffer'
            ? `Published via Buffer bridge (Buffer post ID: ${externalPinId})`
            : `Published to Pinterest API (Pin ID: ${externalPinId})`, 'success');
    } else {
      const reason = String(failure || 'no channel accepted the pin').slice(0, 500);
      db.prepare("UPDATE pins SET status = 'failed', note = ? WHERE id = ?").run(reason, r.id);
      db.prepare('INSERT INTO automation_log (action, product_id, details, status) VALUES (?, ?, ?, ?)')
        .run('pin_publish_error', r.product_id, `Pin #${r.id} not published: ${reason}`, 'error');
    }
  }
  return rows;
}

// Image URL for a pin: the product's raster preview (the composited cover is
// rendered into preview_path — products have no separate cover_path column).
function pinImageUrl(productId, { fullFrame = true } = {}) {
  if (!productId) return null;
  const prod = db.prepare('SELECT preview_path FROM products WHERE id = ?').get(productId);
  if (!prod || !prod.preview_path) return null;
  // New cover renders retain the uncropped 2:3 master next to the 4:5 marketplace
  // image. Pinterest consumes that master; older preview paths remain supported.
  const previewPath = String(prod.preview_path);
  if (fullFrame && /-cover-v5-\d+\.jpg$/i.test(previewPath)) {
    const masterPath = previewPath.replace(/\.jpg$/i, '.master.jpg');
    try { if (require('node:fs').existsSync(masterPath)) return masterPath; } catch {}
  }
  return previewPath;
}

// PUBLIC image URL for dispatch: Pinterest fetches the image server-side, so
// session-gated local app paths never work — use the Gumroad-hosted cover
// stashed on the anchored row instead.
function pinPublicImageUrl(productId) {
  if (!productId) return null;
  try {
    const row = db.prepare('SELECT listing_json FROM products WHERE id = ?').get(productId);
    if (!row || !row.listing_json) return null;
    const li = JSON.parse(row.listing_json);
    return (li && li.gumroadCoverUrl && /^https:\/\//.test(li.gumroadCoverUrl)) ? li.gumroadCoverUrl : null;
  } catch { return null; }
}

// Live Pinterest API v5 client
async function publishToPinterestApi(pin, accessToken) {
  const axios = require('axios');
  // Attach image source ONLY when publicly fetchable (Gumroad-hosted cover);
  // local preview paths are session-gated and would 403 Pinterest.
  const imageUrl = pinPublicImageUrl(pin.product_id);

  // Find board or use default
  const boardId = process.env.PINTEREST_BOARD_ID || 'general';

  const body = {
    title: pin.title?.slice(0, 100),
    description: pin.description?.slice(0, 500),
    link: pin.target_url || undefined,
    board_id: boardId
  };

  if (imageUrl && imageUrl.startsWith('http')) {
    body.media_source = {
      source_type: 'image_url',
      url: imageUrl
    };
  }

  const res = await axios.post('https://api.pinterest.com/v5/pins', body, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    timeout: 10000
  });

  return res.data;
}

// Attribution: Gumroad's sales API does not expose referring UTMs, so exact
// pin→sale matching is not possible from sales alone. This report stays
// honest: queue health + how many listed products carry an attributed link.
// (True click-side attribution would come from the CF worker logging pin
// URL hits — recorded as a Phase-5 stretch in TASK.md.)
function attributionReport() {
  const pins = db.prepare('SELECT COUNT(*) AS c FROM pins').get().c;
  const posted = db.prepare("SELECT COUNT(*) AS c FROM pins WHERE status = 'posted'").get().c;
  const scheduled = db.prepare("SELECT COUNT(*) AS c FROM pins WHERE status = 'scheduled'").get().c;
  const withUrl = db.prepare('SELECT COUNT(*) AS c FROM pins WHERE target_url IS NOT NULL').get().c;
  return { pins, posted, scheduled, withAttributedUrl: withUrl, note: 'click-side attribution needs the CF worker (stretch)' };
}

module.exports = { createPin, createPinSync, scheduleForProducts, scheduleForProductsAI, pinNewProductAsync, unpinnedListedProducts, pinPublicImageUrl, duePins, nextSlot, attributionReport, pinterestKeywords, utmFor, attributedUrl, publishToPinterestApi, pinImageUrl, SLOT_GRID };
