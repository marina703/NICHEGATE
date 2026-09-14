// ============================================================================
// TREND RADAR — live trend discovery across multiple sources. Each source is
// best-effort with a health registry. Real spikes flow into trends where the
// vetting engine scores them before anything is activated.
// ============================================================================

const axios = require('axios');
const cheerio = require('cheerio');
const { db } = require('../database');

const RADAR_URL = 'https://trends.google.com/trending/rss?geo=US';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

const REDDIT_SOURCES = [
  { sub: 'beekeeping', niche: 'beekeeping' },
  { sub: 'Entrepreneur', niche: 'business' },
  { sub: 'smallbusiness', niche: 'business' },
  { sub: 'Flipping', niche: 'resale' },
  { sub: 'ThriftStoreHauls', niche: 'resale' },
  { sub: 'gardening', niche: 'home' },
  { sub: 'homestead', niche: 'home' },
  { sub: 'woodworking', niche: 'craft' },
  { sub: 'pottery', niche: 'craft' },
  { sub: 'soapmaking', niche: 'craft' },
  { sub: 'candlemaking', niche: 'craft' },
  { sub: 'aquariums', niche: 'pets' },
  { sub: 'Pickleball', niche: 'fitness' },
  { sub: 'overlanding', niche: 'outdoor' },
  { sub: 'VanLife', niche: 'outdoor' },
  { sub: 'mushroom_hunting', niche: 'food' },
  { sub: 'Sourdough', niche: 'food' },
  { sub: 'esports', niche: 'tech' },
  { sub: 'notion', niche: 'tech' },
  { sub: 'Etsy', niche: 'marketplace' },
  { sub: 'digitalnomad', niche: 'business' }
];

const sourceHealth = {};
function markHealth(source, ok, detail) {
  sourceHealth[source] = {
    ok: !!ok,
    lastSuccess: ok ? new Date().toISOString() : (sourceHealth[source]?.lastSuccess || null),
    lastError: ok ? null : (detail || 'unknown'),
    updatedAt: new Date().toISOString()
  };
}
function getSourceHealth() { return { ...sourceHealth }; }

// Reject celebrity/news/meme noise that cannot become a digital template niche
const REJECT_RE = /\b(?:vs\.?|score|election|congress|senate|president|trump|biden|obama|nfl|nba|mlb|nhl|ufc|world cup|playoffs?|touchdown|died|dies|death|killed|shooting|war|bomb|onlyfans|porn|xxx|crypto crash|bitcoin price|stock market today)\b/i;

const STOP_WORDS = new Set(['the','a','an','and','or','of','for','to','in','on','with','my','your','our','is','are','this','that','from','how','what','why','when']);

function parseTraffic(str) {
  const m = String(str || '').toUpperCase().match(/([\d.]+)\s*([KM])/);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  return m[2] === 'M' ? n * 1000000 : n * 1000;
}

function normalizeNicheName(raw) {
  let name = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!name) return null;
  name = name.replace(/^(eli5|tifa|dae|psa|wibta|aita)[:\s-]+/i, '');
  name = name.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"');
  if (name.length > 80) name = name.split(/[|–—:]/)[0].trim();
  name = name.replace(/[?!]+$/g, '').trim();
  if (name.length < 4 || name.length > 72) return null;
  if (REJECT_RE.test(name)) return null;
  const words = name.split(/\s+/);
  const content = words.filter(w => !STOP_WORDS.has(w.toLowerCase()));
  if (content.length < 1) return null;
  return name;
}

// Canonical dedup key — casefolded, stopword-stripped, "(seasonal)" suffix removed.
function normalizeNicheKey(raw) {
  let s = String(raw || '')
    .toLowerCase()
    .replace(/\s*\(seasonal\)\s*/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return s.split(/\s+/).filter(w => w && !STOP_WORDS.has(w)).join(' ');
}

function trendNameExists(name) {
  const key = normalizeNicheKey(name);
  if (!key) return false;
  return db.prepare('SELECT name FROM trends').all()
    .some(r => normalizeNicheKey(r.name) === key);
}

function phaseForVelocity(pct) {
  if (pct >= 240) return 'hot';
  if (pct >= 120) return 'rising';
  return 'emerging';
}

const PRODUCT_NOUN_RE = /\b(blanket|cup|mug|tumbler|bottle|boots?|shoes|tote|bag|pillow|rug|lamp|candle|case|hoodie|sock|sweater|throw|wrap|torch|pen|journal|planner|kit|bundle|pack|sticker|print|keychain|bracelet|necklace|hat|beanie|scarf|mat|tent|chair|desk|organizer|fixture|shelf|hanger)\b/i;
const FAD_QUERY_RE = /\b(how to|diy|tutorial|guide|template|planner|service|near me|vs|review|best|cost|price|checklist|for|near|install|repair|clean)\b/i;

// "Burrito blanket", "cowboy boots", "stanley cup" — short, concrete, shopping-driven
// product fads (not how-to guides or long-tail service queries). Returns 0-100.
function detectFad(item) {
  const name = String((item && item.name) || '').trim();
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 3) return 0;
  if (FAD_QUERY_RE.test(name)) return 0;
  const intent = Number(item && item.shoppingIntent) || 0;
  let score = 0;
  if (intent >= 0.7) score += 45;
  if (PRODUCT_NOUN_RE.test(name)) score += 35;
  if (words.length === 2) score += 20;
  return Math.min(100, score);
}

// Fuse a source's baseline shopping intent with productizability signals in the name.
function fuseShoppingIntent(item) {
  const base = Number(item && item.shoppingIntent) || 0.5;
  const name = String((item && item.name) || '').toLowerCase();
  let adj = 0;
  if (/template|planner|checklist|invoice|tracker|journal|printable|calculator|spreadsheet|sheet|kit|bundle/.test(name)) adj += 0.15;
  if (/how to|diy|tutorial|recipe|tips?|guide|step|idea/.test(name)) adj += 0.05;
  if (/celebrity|news|score|election|court|charged|arrest|rumor|gossip|final|championship|award/.test(name)) adj -= 0.3;
  if (detectFad(item) >= 55) adj += 0.15; // likely a "burrito blanket"-style product fad
  return Math.max(0, Math.min(1, base + adj));
}

function isProductizableCandidate(item) {
  const name = normalizeNicheName(item?.name);
  if (!name) return false;
  item.name = name;
  return true;
}

async function fetchGoogleTrends(limit = 10) {
  const resp = await axios.get(RADAR_URL, { timeout: 10000, headers: { 'User-Agent': UA } });
  const $ = cheerio.load(resp.data, { xmlMode: true });
  const items = [];
  $('item').each((i, el) => {
    if (i >= limit) return false;
    const title = $(el).children('title').first().text().trim();
    let traffic = '';
    for (const child of el.children || []) {
      if (child.type === 'tag' && String(child.tagName || '').toLowerCase().includes('traffic')) {
        traffic = $(child).text().trim();
        break;
      }
    }
    if (title) items.push({ name: title, traffic, source: 'google-trends', shoppingIntent: 0.3 });
  });
  markHealth('google-trends', true);
  return items;
}

async function fetchRedditRising() {
  const items = [];
  let ok = 0, fail = 0;
  for (const src of REDDIT_SOURCES) {
    try {
      const resp = await axios.get(`https://www.reddit.com/r/${src.sub}/rising.json?limit=4`, {
        timeout: 8000,
        headers: { 'User-Agent': 'NicheTrendRadar/1.1 (market-research; localhost dev)' }
      });
      for (const child of resp.data?.data?.children || []) {
        const d = child.data || {};
        if (d.title) {
          items.push({
            name: d.title.slice(0, 120),
            traffic: `${d.ups || 0} upvotes`,
            source: `reddit r/${src.sub}`,
            nicheHint: src.niche,
            shoppingIntent: 0.4
          });
        }
      }
      ok++;
    } catch (e) {
      fail++;
      console.error(`[RADAR] reddit r/${src.sub}:`, e.message);
    }
  }
  markHealth('reddit', ok > 0, fail ? `${fail} subs failed` : null);
  return items;
}

async function fetchAmazonMovers(limit = 8) {
  try {
    const resp = await axios.get('https://www.amazon.com/gp/movers-and-shakers', {
      timeout: 15000,
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' }
    });
    const $ = cheerio.load(resp.data);
    const out = [];
    $('.p13n-sc-truncate, .a-size-base.a-color-base, .p13n-sc-css-line-clamp-1').each((i, el) => {
      if (out.length >= limit) return false;
      const t = $(el).text().trim();
      if (t && t.length > 4 && t.length < 80) {
        out.push({ name: t, traffic: 'Amazon Movers & Shakers', source: 'amazon-movers', shoppingIntent: 0.9 });
      }
    });
    markHealth('amazon-movers', out.length > 0, out.length ? null : 'empty parse (bot-gate?)');
    return out;
  } catch (e) {
    markHealth('amazon-movers', false, e.message);
    console.error('[RADAR] Amazon movers unavailable:', e.message);
    return [];
  }
}

async function fetchEbayTrending(limit = 8) {
  try {
    const resp = await axios.get('https://www.ebay.com/trending', {
      timeout: 15000,
      headers: { 'User-Agent': UA }
    });
    const $ = cheerio.load(resp.data);
    const out = [];
    $('a').each((i, el) => {
      if (out.length >= limit) return false;
      const href = $(el).attr('href') || '';
      const t = $(el).text().trim();
      if (t && t.length > 4 && t.length < 60 && href.includes('/itm/')) {
        out.push({ name: t, traffic: 'eBay Trending', source: 'ebay-trending', shoppingIntent: 0.85 });
      }
    });
    markHealth('ebay-trending', out.length > 0, out.length ? null : 'empty parse');
    return out;
  } catch (e) {
    markHealth('ebay-trending', false, e.message);
    console.error('[RADAR] eBay trending unavailable:', e.message);
    return [];
  }
}

// Etsy search suggestions — shopping-intent keyword expansion (best-effort, no auth)
async function fetchEtsyAutocomplete(seeds = ['digital planner', 'invoice template', 'checklist printable', 'business toolkit'], limit = 12) {
  const out = [];
  try {
    for (const seed of seeds) {
      if (out.length >= limit) break;
      const url = `https://www.etsy.com/suggestions/?q=${encodeURIComponent(seed)}&limit=8`;
      try {
        const resp = await axios.get(url, {
          timeout: 8000,
          headers: { 'User-Agent': UA, Accept: 'application/json, text/plain, */*' },
          validateStatus: s => s < 500
        });
        const data = resp.data;
        const results = Array.isArray(data) ? data
          : Array.isArray(data?.results) ? data.results
          : Array.isArray(data?.suggestions) ? data.suggestions
          : [];
        for (const row of results) {
          const name = typeof row === 'string' ? row : (row?.query || row?.text || row?.suggestion || '');
          if (name && name.length > 3) {
            out.push({
              name: String(name).slice(0, 80),
              traffic: 'Etsy autocomplete',
              source: 'etsy-autocomplete',
              shoppingIntent: 1.0
            });
          }
          if (out.length >= limit) break;
        }
      } catch (e) {
        console.error('[RADAR] etsy seed', seed, e.message);
      }
    }
    markHealth('etsy-autocomplete', out.length > 0, out.length ? null : 'no suggestions');
  } catch (e) {
    markHealth('etsy-autocomplete', false, e.message);
  }
  return out;
}

// Pinterest ideas RSS (public, fail-safe)
async function fetchPinterestTrends(limit = 8) {
  try {
    const url = 'https://www.pinterest.com/resource/BaseSearchResource/get/?source_url=/search/pins/?q=digital%20download%20template&data={}&_=1';
    // Prefer Google News RSS filtered to Pinterest-style DIY demand as a stable public feed
    const rss = 'https://news.google.com/rss/search?q=Pinterest+trend+DIY+printable+template&hl=en-US&gl=US&ceid=US:en';
    const resp = await axios.get(rss, { timeout: 10000, headers: { 'User-Agent': UA } });
    const $ = cheerio.load(resp.data, { xmlMode: true });
    const out = [];
    $('item').each((i, el) => {
      if (out.length >= limit) return false;
      const title = $(el).children('title').first().text().trim();
      if (title) out.push({ name: title, traffic: 'Pinterest/DIY buzz', source: 'pinterest-rss', shoppingIntent: 0.75 });
    });
    markHealth('pinterest-rss', out.length > 0);
    return out;
  } catch (e) {
    markHealth('pinterest-rss', false, e.message);
    console.error('[RADAR] Pinterest RSS unavailable:', e.message);
    return [];
  }
}

// TikTok-adjacent public signal via Google News RSS (no unofficial TikTok scrape)
async function fetchTikTokTrends(limit = 6) {
  try {
    const rss = 'https://news.google.com/rss/search?q=TikTok+trend+small+business+OR+printable+OR+template&hl=en-US&gl=US&ceid=US:en';
    const resp = await axios.get(rss, { timeout: 10000, headers: { 'User-Agent': UA } });
    const $ = cheerio.load(resp.data, { xmlMode: true });
    const out = [];
    $('item').each((i, el) => {
      if (out.length >= limit) return false;
      const title = $(el).children('title').first().text().trim();
      if (title) out.push({ name: title, traffic: 'TikTok buzz', source: 'tiktok-rss', shoppingIntent: 0.55 });
    });
    markHealth('tiktok-rss', out.length > 0);
    return out;
  } catch (e) {
    markHealth('tiktok-rss', false, e.message);
    console.error('[RADAR] TikTok RSS unavailable:', e.message);
    return [];
  }
}

function insertLiveTrend(item, rank) {
  if (!isProductizableCandidate(item)) return null;
  item.shoppingIntent = fuseShoppingIntent(item);
  if (trendNameExists(item.name)) return null;

  const k = parseTraffic(item.traffic);
  const velocityPct = Math.max(90, 320 - rank * 20);
  const shopBoost = item.shoppingIntent >= 0.8;
  const est = shopBoost
    ? (k >= 100000 ? '$3k-8k' : '$1.5k-5k')
    : (k >= 200000 ? '$4k-9k' : k >= 100000 ? '$2k-6k' : k >= 50000 ? '$1k-4k' : '$500-2k');
  const velocity = `+${velocityPct}%`;
  const phase = phaseForVelocity(velocityPct);
  const intentTag = ` · intent=${item.shoppingIntent.toFixed(2)}`;

  db.prepare(`
    INSERT INTO trends (name, emoji, phase, velocity, window, est_revenue, why, activated, detected_at)
    VALUES (?, '🛰️', ?, ?, ?, ?, ?, 0, ?)
  `).run(
    item.name,
    phase,
    velocity,
    shopBoost ? 21 : 10,
    est,
    `${item.source} · ${item.traffic || 'trending now'}${intentTag}`,
    new Date().toISOString()
  );
  return db.prepare('SELECT * FROM trends WHERE name = ? ORDER BY id DESC LIMIT 1').get(item.name);
}

async function scanLiveTrends(max = 5) {
  const sources = [];
  const pull = async (label, fn) => {
    try {
      const rows = await fn();
      sources.push(...(rows || []));
    } catch (e) {
      console.error(`[RADAR] ${label}:`, e.message);
      markHealth(label, false, e.message);
    }
  };

  await pull('google-trends', () => fetchGoogleTrends(10));
  await pull('reddit', () => fetchRedditRising());
  await pull('etsy-autocomplete', () => fetchEtsyAutocomplete());
  await pull('pinterest-rss', () => fetchPinterestTrends(6));
  await pull('tiktok-rss', () => fetchTikTokTrends(5));
  await pull('amazon-movers', () => fetchAmazonMovers(8));
  await pull('ebay-trending', () => fetchEbayTrending(8));

  // Prefer shopping-intent sources when ranking
  sources.sort((a, b) => (b.shoppingIntent || 0) - (a.shoppingIntent || 0));

  const inserted = [];
  const seen = new Set();
  for (let i = 0; i < sources.length && inserted.length < max; i++) {
    const s = sources[i];
    if (!s || !s.name) continue;
    const key = s.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      const row = insertLiveTrend(s, i);
      if (row) inserted.push(row);
    } catch (e) {
      console.error('[RADAR] insert failed:', e.message);
    }
  }
  return inserted;
}

module.exports = {
  fetchGoogleTrends,
  fetchRedditRising,
  fetchAmazonMovers,
  fetchEbayTrending,
  fetchEtsyAutocomplete,
  fetchPinterestTrends,
  fetchTikTokTrends,
  scanLiveTrends,
  insertLiveTrend,
  parseTraffic,
  normalizeNicheName,
  normalizeNicheKey,
  trendNameExists,
  phaseForVelocity,
  fuseShoppingIntent,
  detectFad,
  isProductizableCandidate,
  getSourceHealth,
  markHealth
};
