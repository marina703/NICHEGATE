// ═══════════════════════════════════════════════════════════════════════════
// TREND RADAR — live trend discovery across multiple sources. Each source is
// best-effort: if one is unreachable/bot-gated it fails gracefully and the
// others still feed the pipeline. Real spikes flow into the trends table where
// the vetting engine scores them before anything is activated.
// ═══════════════════════════════════════════════════════════════════════════

const axios = require('axios');
const cheerio = require('cheerio');
const { db } = require('../database');

const RADAR_URL = 'https://trends.google.com/trending/rss?geo=US';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

// Subreddits whose rising posts surface real hobby/trade/community demand
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
  { sub: 'hotones', niche: 'food' },
  { sub: 'esports', niche: 'tech' },
  { sub: 'notion', niche: 'tech' },
  { sub: 'Notion', niche: 'tech' }
];

// "200K+" → 200000 | "50K+" → 50000 | "10M+" → 10000000
function parseTraffic(str) {
  const m = String(str || '').toUpperCase().match(/([\d.]+)\s*([KM])/);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  return m[2] === 'M' ? n * 1000000 : n * 1000;
}

// Google Trends "Trending Now" RSS (reliable, no auth)
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
    if (title) items.push({ name: title, traffic, source: 'google-trends' });
  });
  return items;
}

// Reddit rising posts across hobby/trade/community subreddits (best-effort)
async function fetchRedditRising() {
  const items = [];
  for (const src of REDDIT_SOURCES) {
    try {
      const resp = await axios.get(`https://www.reddit.com/r/${src.sub}/rising.json?limit=4`, {
        timeout: 8000,
        headers: { 'User-Agent': 'NicheTrendRadar/1.0 (market-research; localhost dev)' }
      });
      for (const child of resp.data?.data?.children || []) {
        const d = child.data || {};
        if (d.title) items.push({ name: d.title.slice(0, 120), traffic: `${d.ups || 0} upvotes`, source: `reddit r/${src.sub}` });
      }
    } catch {}
  }
  return items;
}

// Amazon Movers & Shakers — real product movers (often bot-gated; best-effort)
async function fetchAmazonMovers(limit = 8) {
  try {
    const resp = await axios.get('https://www.amazon.com/gp/movers-and-shakers', {
      timeout: 15000,
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' }
    });
    const $ = cheerio.load(resp.data);
    const out = [];
    $('.p13n-sc-truncate, .a-size-base.a-color-base').each((i, el) => {
      if (out.length >= limit) return false;
      const t = $(el).text().trim();
      if (t && t.length > 4 && t.length < 80) out.push({ name: t, traffic: 'Amazon Movers & Shakers', source: 'amazon-movers' });
    });
    return out;
  } catch (e) {
    console.error('[RADAR] Amazon movers unavailable:', e.message);
    return [];
  }
}

// eBay trending (often JS-rendered/blocked; best-effort)
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
      if (t && t.length > 4 && t.length < 60 && href.includes('/itm/')) out.push({ name: t, traffic: 'eBay Trending', source: 'ebay-trending' });
    });
    return out;
  } catch (e) {
    console.error('[RADAR] eBay trending unavailable:', e.message);
    return [];
  }
}

// Insert a candidate as a trend row if it's not already tracked
function insertLiveTrend(item, rank) {
  const tracked = db.prepare('SELECT id FROM trends WHERE name = ?').get(item.name);
  if (tracked) return null;

  const k = parseTraffic(item.traffic);
  const est = k >= 200000 ? '$4k-9k' : k >= 100000 ? '$2k-6k' : k >= 50000 ? '$1k-4k' : '$500-2k';
  const velocity = `+${Math.max(90, 300 - rank * 20)}%`;

  db.prepare(`
    INSERT INTO trends (name, emoji, phase, velocity, window, est_revenue, why, activated, detected_at)
    VALUES (?, '🛰️', 'emerging', ?, 6, ?, ?, 0, ?)
  `).run(item.name, velocity, est, `${item.source} · ${item.traffic || 'trending now'}`, new Date().toISOString());
  return db.prepare('SELECT * FROM trends WHERE name = ?').get(item.name);
}

// Scan ALL live sources; returns newly inserted trends (up to max)
async function scanLiveTrends(max = 5) {
  const sources = [];
  try { sources.push(...await fetchGoogleTrends(10)); } catch (e) { console.error('[RADAR] Google now:', e.message); }
  try { sources.push(...await fetchRedditRising()); } catch (e) { console.error('[RADAR] Reddit:', e.message); }
  try { sources.push(...await fetchAmazonMovers(8)); } catch {}
  try { sources.push(...await fetchEbayTrending(8)); } catch {}

  const inserted = [];
  const seen = new Set();
  for (let i = 0; i < sources.length && inserted.length < max; i++) {
    const s = sources[i];
    if (!s || !s.name || seen.has(s.name.toLowerCase())) continue;
    seen.add(s.name.toLowerCase());
    try {
      const row = insertLiveTrend(s, i);
      if (row) inserted.push(row);
    } catch {}
  }
  return inserted;
}

module.exports = { fetchGoogleTrends, fetchRedditRising, fetchAmazonMovers, fetchEbayTrending, scanLiveTrends, insertLiveTrend, parseTraffic };
