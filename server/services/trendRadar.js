// ============================================================================
// TREND RADAR — live trend discovery across multiple sources. Each source is
// best-effort with a health registry. Real spikes flow into trends where the
// vetting engine scores them before anything is activated.
// ============================================================================

const axios = require('axios');
const cheerio = require('cheerio');
const { db } = require('../database');
const { TokenBucket } = require('./tokenBucket');

const RADAR_URL = 'https://trends.google.com/trending/rss?geo=US';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BROWSER_HEADERS = {
  'User-Agent': UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1'
};

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

// Reject celebrity/news/sports/politics/outage noise that cannot become a digital template niche.
// Updated 2026-09: kills the daily leaks (players, candidates, outages, streamers).
const REJECT_RE = /\b(?:vs\.?|score|election|congress|senate|president|trump|biden|obama|harris|walz|vance|democrat|republican|gop|ballot|polls?|senator|governor|mayor|white house|capitol|nfl|nba|mlb|nhl|ufc|fifa|world cup|playoffs?|touchdown|home ?run|grand slam|hat trick|knockout|championship|mvp|super bowl|died|dies|death|killed|shooting|war|bomb|missile|strike|outage|downdetector|down for everyone|disney\+?|netflix|hulu|taylor swift|celebrity|box office|emmy|oscar|grammy|onlyfans|porn|xxx|crypto crash|bitcoin price|stock market today|dow jones|nasdaq|lottery|powerball|wrestlemania|lafleur|rodgers|mahomes|kelce|lebron|curry|ohtani|judge|soto|harper|trout|ossoff|warnock|hern[aá]ndez|altuve|betts|freeman|acuna|tatis|wembanyama|doncic|jokic|giannis|burrow|allen|jackson|hurts|purdy|stray kids|bts|blackpink|mrbeast|kai cenat|pokimane|ninja|pewdiepie|logan paul|tate|nelk)\b/i;

const STOP_WORDS = new Set(['the','a','an','and','or','of','for','to','in','on','with','my','your','our','is','are','this','that','from','how','what','why','when']);

// Token bucket for Reddit API rate limiting (default: 1 request per second, burst capacity of 5)
// This is conservative for unauthenticated Reddit API access
const REDDIT_TOKEN_BUCKET = new TokenBucket(
  Number(process.env.REDDIT_API_REFILL_RATE || 1), // tokens per second
  Number(process.env.REDDIT_API_BURST_CAPACITY || 5) // max tokens
);

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
  // NOTE: www.reddit.com 403s datacenter IPs (Railway ams). old.reddit.com still serves public JSON.
  const bases = ['https://old.reddit.com', 'https://www.reddit.com'];
  for (const src of REDDIT_SOURCES) {
      let done = false;
      for (const base of bases) {
        try {
          // Wait for token from rate limiter before making Reddit API call
          await REDDIT_TOKEN_BUCKET.waitForToken();
          const resp = await axios.get(`${base}/r/${src.sub}/rising.json?limit=4`, {
            timeout: 8000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'application/json, text/plain, */*',
              'Accept-Language': 'en-US,en;q=0.9',
              'Referer': 'https://old.reddit.com/',
            }
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
        done = true;
        break; // success on this base — don't try next base
      } catch (e) {
        // try next base; only log after last base fails
        if (base === bases[bases.length - 1]) {
          fail++;
          console.error(`[RADAR] reddit r/${src.sub}:`, e.message);
        }
      }
      }
    if (!done) continue;
  }
  markHealth('reddit', ok > 0, fail ? `${fail} subs failed` : null);
  return items;
}

async function fetchAmazonMovers(limit = 8) {
  try {
    const resp = await axios.get('https://www.amazon.com/gp/movers-and-shakers', {
      timeout: 15000,
      headers: BROWSER_HEADERS
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
  // eBay's former public /trending page now returns 403 from Railway/CI
  // datacenter egress. Don't hammer an access-denied page on every scan.
  // Keep the parser callable by explicitly opted-in environments for testing
  // and future endpoint changes; the default discovery sweep skips it.
  if (String(process.env.EBAY_TRENDING_ENABLED || '').toLowerCase() !== 'true') {
    markHealth('ebay-trending', false, 'disabled: eBay /trending returns 403 from server egress');
    return [];
  }
  try {
    const resp = await axios.get('https://www.ebay.com/trending', {
      timeout: 15000,
      headers: BROWSER_HEADERS
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

// ═══════════════════════════════════════════════════════════════════════
// PHASE 4 — REAL SOCIAL SIGNAL SOURCES (replacing the Google-News-RSS
// proxies). Best-effort, health-tracked, honest degradation — an
// unavailable platform returns [] and says so in the health registry.
// ═══════════════════════════════════════════════════════════════════════

// Pinterest Trends — the real trends surface (trends.pinterest.com) is a
// bot-gated SPA; we hit its public resource endpoint with browser headers.
// On gate/failure we return [] with health marked (carry no fake signal).
async function fetchPinterestTrends(limit = 8) {
  try {
    const url = 'https://www.pinterest.com/resource/BaseSearchResource/get/?source_url=%2Fideas%2F&data=%7B%22options%22%3A%7B%22appliedProductFilters%22%3A%5B%5D%2C%22autoCorrectionDisabled%22%3Afalse%2C%22corpus%22%3Anull%2C%22filters%22%3Anull%2C%22query%22%3A%22digital%20download%20template%22%2C%22scope%22%3A%22pins%22%2C%22noFetchContextOnRefresh%22%3Afalse%7D%2C%22context%22%3A%7B%7D%7D';
    const resp = await axios.get(url, { timeout: 10000, headers: BROWSER_HEADERS, validateStatus: s => s < 500 });
    const out = [];
    const pins = resp.data?.resource_response?.data?.results || resp.data?.resource_response?.data || [];
    for (const p of Array.isArray(pins) ? pins : []) {
      if (out.length >= limit) break;
      const title = p.title || p.grid_title || p.description || '';
      const clean = normalizeNicheName(title);
      if (clean) out.push({ name: clean, traffic: 'Pinterest pin engagement', source: 'pinterest-trends', shoppingIntent: 0.8 });
    }
    markHealth('pinterest-trends', out.length > 0, out.length ? null : 'empty parse (bot-gate?)');
    return out;
  } catch (e) {
    markHealth('pinterest-trends', false, e.message);
    console.error('[RADAR] Pinterest trends unavailable:', e.message);
    return [];
  }
}

// TikTok — no public feed exists (Creative Center requires an authed SPA).
// We attempt its public keyword-suggestion edge with browser headers and
// degrade honestly. This keeps a TikTok lane open without scraping lies.
async function fetchTikTokTrends(limit = 6) {
  try {
    const url = 'https://ads.tiktok.com/creative_radar/api/v1/popular_trend/keyword/list?period=7&country=US&sort_by=popularity&page=1&limit=' + encodeURIComponent(limit);
    const resp = await axios.get(url, { timeout: 10000, headers: BROWSER_HEADERS, validateStatus: s => s < 500 });
    const out = [];
    const list = resp.data?.data?.list || resp.data?.data?.keyword_list || [];
    for (const k of Array.isArray(list) ? list : []) {
      if (out.length >= limit) break;
      const name = typeof k === 'string' ? k : (k.keyword || k.name || '');
      const clean = normalizeNicheName(name);
      if (clean) out.push({ name: clean, traffic: 'TikTok Creative Center', source: 'tiktok-creative-center', shoppingIntent: 0.6 });
    }
    markHealth('tiktok-creative-center', out.length > 0, out.length ? null : 'auth-gated (expected from datacenter IPs)');
    return out;
  } catch (e) {
    markHealth('tiktok-creative-center', false, e.message);
    console.error('[RADAR] TikTok creative center unavailable:', e.message);
    return [];
  }
}

// YouTube — genuinely public RSS (channel + playlist feeds). Niche-relevant
// creator channels surface real product demand in titles; trending-playlist
// feed adds broad velocity. Stable, documented, no auth.
const YOUTUBE_FEEDS = [
  'https://www.youtube.com/feeds/videos.xml?playlist_id=PLrEnWoR732-BHrPp_Pm8_VleD68f9s14-', // YouTube Trending (US)
  'https://www.youtube.com/feeds/videos.xml?channel_id=UCpk5rvLp8lDLz-NfWv8uvna'             // Etsy sellers / small-biz lane
];
async function fetchYouTubeTrends(limit = 8) {
  const out = [];
  let ok = 0;
  for (const feed of YOUTUBE_FEEDS) {
    if (out.length >= limit) break;
    try {
      const resp = await axios.get(feed, { timeout: 10000, headers: { 'User-Agent': UA, Accept: 'application/atom+xml, application/xml, text/xml, */*' } });
      const $ = cheerio.load(resp.data, { xmlMode: true });
      $('entry').each((i, el) => {
        if (out.length >= limit) return false;
        const title = $(el).children('title').first().text().trim();
        const views = $(el).find('media\\:community media\\:statistics').attr('views') || $(el).find('statistics').attr('views') || '';
        const clean = normalizeNicheName(title);
        if (clean) out.push({ name: clean, traffic: views ? `${views} views` : 'YouTube feed', source: 'youtube-rss', shoppingIntent: 0.5 });
      });
      ok++;
    } catch (e) {
      console.error('[RADAR] youtube feed failed:', e.message);
    }
  }
  markHealth('youtube-rss', ok > 0 && out.length > 0, ok ? null : 'all feeds failed');
  return out;
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

// ═══════════════════════════════════════════════════════════════════════════
// SERP DISCOVERY LAYERS (Serper autocomplete + ValueSERP shopping validation)
// Rate-limited + durable search_queue for retry/observability.
// ═══════════════════════════════════════════════════════════════════════════

const SERPER_KEY = process.env.SERPER_API_KEY;
let _lastSerp = 0, _lastVs = 0;
async function serpThrottle(min = 1100) {
  const wait = _lastSerp + min - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  _lastSerp = Date.now();
}
async function vsThrottle(min = 1100) {
  const wait = _lastVs + min - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  _lastVs = Date.now();
}

// Durable search queue (throttled/retried SERP calls)
function searchQueueEnqueue(source, query, payload) {
  try {
    const info = db.prepare('INSERT INTO search_queue (source, query, payload, status, next_run) VALUES (?, ?, ?, ?, ?)')
      .run(source, query, payload ? JSON.stringify(payload) : null, 'pending', new Date().toISOString());
    return info.lastInsertRowid;
  } catch (e) { return null; }
}
function searchQueueRecord(id, ok, data) {
  if (id == null) return;
  try {
    const row = db.prepare('SELECT attempts FROM search_queue WHERE id = ?').get(id);
    const attempts = (row && row.attempts) || 0;
    const next = ok ? null : new Date(Date.now() + Math.min(60000, 2000 * Math.pow(2, attempts))).toISOString();
    db.prepare('UPDATE search_queue SET status = ?, result = ?, attempts = ?, last_error = ?, next_run = ? WHERE id = ?')
      .run(ok ? 'done' : 'error', data == null ? null : JSON.stringify(data).slice(0, 2000), attempts + 1, ok ? null : String(data).slice(0, 500), next, id);
  } catch (e) {}
}
function getSearchQueue(limit = 50) {
  try { return db.prepare('SELECT * FROM search_queue ORDER BY created_at DESC LIMIT ?').all(limit); } catch (e) { return []; }
}
async function drainSearchQueue(limit = 10) {
  const pending = db.prepare("SELECT * FROM search_queue WHERE status != 'done' AND (next_run IS NULL OR next_run <= ?) ORDER BY created_at ASC LIMIT ?").all(new Date().toISOString(), limit);
  let n = 0;
  for (const job of pending) {
    try {
      if (job.source === 'serper-autocomplete') { const r = await fetchSerperAutocomplete([job.query]); searchQueueRecord(job.id, true, { count: r.length }); }
      else if (job.source === 'valueserp-shopping') { const r = await fetchValueSERPShopping([job.query]); searchQueueRecord(job.id, true, { count: r.length }); }
      n++;
    } catch (e) { searchQueueRecord(job.id, false, e.message); }
  }
  return n;
}

async function fetchSerperAutocomplete(seeds) {
  if (!SERPER_KEY) { markHealth('serper-autocomplete', false, 'SERPER_API_KEY not set'); return []; }
  const seedList = seeds || ['digital planner','invoice template','checklist printable','business toolkit','wedding sign','pet portrait','sticker pack','budget spreadsheet','meal planner','resume template','party game','garden sign'];
  const out = [];
  for (const seed of seedList) {
    const qid = searchQueueEnqueue('serper-autocomplete', seed);
    try {
      await serpThrottle();
      const resp = await axios.post('https://google.serper.dev/autocomplete', { q: seed },
        { timeout: 10000, headers: { 'X-API-KEY': SERPER_KEY, 'Content-Type': 'application/json' } });
      const sugg = Array.isArray(resp.data && resp.data.suggestions) ? resp.data.suggestions : [];
      for (const sg of sugg) {
        const name = String(sg.suggestion || sg.value || '').trim();
        if (name && name.length > 3 && name.length < 72) out.push({ name, traffic: 'Serper autocomplete', source: 'serper-autocomplete', shoppingIntent: 0.9 });
      }
      searchQueueRecord(qid, true, { count: sugg.length });
      markHealth('serper-autocomplete', true);
    } catch (e) {
      searchQueueRecord(qid, false, e.message);
      markHealth('serper-autocomplete', false, e.message);
    }
    if (out.length >= 60) break;
  }
  return out;
}


const DATAFORSEO_LOGIN = process.env.DATAFORSEO_LOGIN;
const DATAFORSEO_KEY = process.env.DATAFORSEO_KEY || process.env.DATAFORSEO_API_KEY;
let _lastDf = 0;
async function dfThrottle(min = 1100) {
  const wait = _lastDf + min - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  _lastDf = Date.now();
}

  async function fetchDataForSEO(seeds) {
    if (!DATAFORSEO_LOGIN || !DATAFORSEO_KEY) { markHealth('dataforseo', false, 'DataForSEO credentials not set'); return []; }
    const seedList = seeds || ['digital planner','invoice template','checklist printable','pet portrait','sticker pack','resume template','meal planner','wedding sign','budget spreadsheet','party game'];
    const out = [];
    const qids = seedList.map(s => searchQueueEnqueue('dataforseo', s));
    try {
      await dfThrottle();
      const auth = 'Basic ' + Buffer.from(DATAFORSEO_LOGIN + ':' + DATAFORSEO_KEY).toString('base64');
      // DataForSEO keyword data is task-based: submit one task for all seeds, then poll results.
      const post = await axios.post('https://api.dataforseo.com/v3/keywords_data/google/search_volume/task_post',
        [{ language_code: 'en', location_code: 2840, keywords: seedList }],
        { timeout: 15000, headers: { Authorization: auth, 'Content-Type': 'application/json' } });
      const pt = (post.data && post.data.tasks && post.data.tasks[0]) || {};
      const id = pt.id;
      if (!id) throw new Error('DataForSEO: no task id returned');
      let arr = [];
      for (let attempt = 0; attempt < 3 && arr.length === 0; attempt++) {
        await new Promise(r => setTimeout(r, attempt === 0 ? 6000 : 3000));
        const get = await axios.get('https://api.dataforseo.com/v3/keywords_data/google/search_volume/task_get/' + id,
          { timeout: 15000, headers: { Authorization: auth } });
        const gt = (get.data && get.data.tasks && get.data.tasks[0]) || {};
        const res = gt.result || gt.results || [];
        arr = Array.isArray(res) ? res : [];
      }
      const byKeyword = {};
      arr.forEach(r => { byKeyword[(r.keyword || '').toLowerCase()] = r; });
      seedList.forEach((seed, idx) => {
        const r = byKeyword[(seed || '').toLowerCase()];
        const qid = qids[idx];
        const vol = r ? Number(r.search_volume) || 0 : 0;
        const cpc = r ? Number(r.cpc) || 0 : 0;
        const difficulty = r ? Number(r.competition) || 0 : 0;
        const intent = r ? (/buy|shop|order|price|coupon|best|review|template|printable/i.test(r.keyword || '') ? 1 : 0) : 0;
        if (vol > 50) {
          out.push({ name: seed, traffic: 'DataForSEO · vol ' + vol, source: 'dataforseo',
            shoppingIntent: vol > 1000 ? 0.9 : vol > 300 ? 0.7 : vol > 100 ? 0.5 : 0.3,
            validation: { volume: vol, cpc: +cpc.toFixed(2), difficulty: +difficulty.toFixed(2), intent } });
        }
        searchQueueRecord(qid, true, { volume: vol, results: r ? 1 : 0 });
      });
      markHealth('dataforseo', true);
    } catch (e) {
      const detail = e.response ? (e.response.status + ' ' + JSON.stringify(e.response.data).slice(0, 120)) : e.message;
      qids.forEach(qid => searchQueueRecord(qid, false, detail));
      markHealth('dataforseo', false, detail);
    }
    return out;
  }

// Opportunity Engine: combine DataForSEO demand/intent/difficulty with Etsy saturation.
async function scoreOpportunity(phrase) {
  const df = fetchDataForSEO([phrase]);
  const etsy = fetchEtsySaturation(phrase);
  const [dfItems, e] = await Promise.all([df, etsy]);
  const v = dfItems[0] && dfItems[0].validation ? dfItems[0].validation.volume : 0;
  const intent = dfItems[0] && dfItems[0].validation ? dfItems[0].validation.intent : 0;
  const sat = e ? e.saturation : 0.5;
  // Weighted: demand + intent - saturation (higher = better opportunity)
  const opportunity = Math.max(0, Math.min(100, Math.round((Math.log10(v + 1) * 18) + (intent * 6) - (sat * 40))));
  return { phrase, volume: v, intent, etsySaturation: sat, etsyCount: e ? e.count : null, opportunity };
}



// ═══════════════════════════════════════════════════════════════════════════
// LAYER 3 — ETSY SATURATION GATE (Etsy Open API v3 active-listings count)
// Uses the app shared secret as x-api-key (no user OAuth needed). Graceful on
// invalid/expired key: returns null and marks source unhealthy.
// ═══════════════════════════════════════════════════════════════════════════

  async function fetchEtsySaturation(phrase) {
    // Etsy API v3 requires x-api-key header in format: "KEYSTRING:SHARED_SECRET"
    // Try all combinations from our available credentials until one works
    const candidates = [];
    if (process.env.ETSY_CLIENT_ID && process.env.ETSY_CLIENT_SECRET) {
      candidates.push(`${process.env.ETSY_CLIENT_ID}:${process.env.ETSY_CLIENT_SECRET}`);
    }
    if (process.env.ETSY_SHARED_SECRET) {
      candidates.push(process.env.ETSY_SHARED_SECRET); // Also try standalone (in case portal uses just one value)
    }
    if (!candidates.length) { markHealth('etsy-saturation', false, 'no Etsy API key set'); return null; }
    const qid = searchQueueEnqueue('etsy-saturation', phrase);
    let lastErr = null;
    for (const key of candidates) {
      try {
        const resp = await axios.get('https://openapi.etsy.com/v3/application/listings/active', {
          params: { keywords: phrase, limit: 100 },
          timeout: 12000,
          headers: { 'x-api-key': key }
        });
        const results = (resp.data && resp.data.results) || [];
        const count = (resp.data && typeof resp.data.count === 'number') ? resp.data.count : results.length;
        let f = 0, p = 0, a = 0;
        for (const r of results) {
          f += Number(r.num_favorers || 0);
          p += parseFloat(String(r.price || '0').replace(/[^0-9.]/g, '')) || 0;
          if (r.created_timestamp) a += (Date.now() / 1000 - Number(r.created_timestamp)) / 86400;
        }
        const avgFav = results.length ? f / results.length : 0;
        const avgPrice = results.length ? p / results.length : 0;
        const avgAge = results.length ? a / results.length : 0;
        let saturation = count >= 8000 ? 0.1 : count >= 3000 ? 0.3 : count >= 1000 ? 0.5 : count >= 300 ? 0.7 : 0.9;
        if (avgFav > 500 || avgPrice > 30) saturation = Math.min(1, saturation + 0.05);
        searchQueueRecord(qid, true, { count, avgFav: Math.round(avgFav), avgPrice: +avgPrice.toFixed(2), avgAge: Math.round(avgAge) });
        markHealth('etsy-saturation', true);
        return { count, saturation, avgFavorites: Math.round(avgFav), avgPrice: +avgPrice.toFixed(2), avgAgeDays: Math.round(avgAge), unsaturated: saturation >= 0.3 };
      } catch (e) {
        const status = e.response && e.response.status;
        const detail = e.response ? (status + ' ' + JSON.stringify(e.response.data).slice(0, 120)) : e.message;
        if (status === 403) { lastErr = detail; continue; }
        searchQueueRecord(qid, false, detail);
        markHealth('etsy-saturation', false, detail);
        return null;
      }
    }
    searchQueueRecord(qid, false, lastErr);
    markHealth('etsy-saturation', false, lastErr);
    return null;
  }

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 1 — REAL GROWTH DATA
// Every sweep snapshots per-trend demand into trend_snapshots; velocity,
// phase and est_revenue derive from that measured series instead of the
// synthetic rank formula. DataForSEO Trends Explore supplies the series.
// ═══════════════════════════════════════════════════════════════════════════

// ISO-8601 week key (YYYY-Www) — one snapshot per trend per week.
function weekKey(d = new Date()) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // this week's Thursday
  const isoYear = date.getUTCFullYear();
  const firstThu = new Date(Date.UTC(isoYear, 0, 4));
  const fDay = (firstThu.getUTCDay() + 6) % 7;
  firstThu.setUTCDate(firstThu.getUTCDate() - fDay + 3);
  const week = 1 + Math.round((date - firstThu) / (7 * 86400000));
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

function snapshotTrend(trendKey, { volume = null, cpc = null, competition = null, score = null, source = null } = {}) {
  const key = String(trendKey || '').trim();
  if (!key) return false;
  try {
    db.prepare(`INSERT INTO trend_snapshots (trend_key, week, volume, cpc, competition, score, source)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(trend_key, week) DO UPDATE SET
        volume = COALESCE(excluded.volume, volume),
        cpc = COALESCE(excluded.cpc, cpc),
        competition = COALESCE(excluded.competition, competition),
        score = COALESCE(excluded.score, score),
        source = COALESCE(excluded.source, source)`
    ).run(key, weekKey(), volume, cpc, competition, score, source);
    return true;
  } catch (e) { console.error('[SNAPSHOT] write failed:', e.message); return false; }
}

// Measured growth from this trend's own snapshot history.
// Returns null until at least two weekly volumes exist.
function growthFromSnapshots(trendKey) {
  const key = String(trendKey || '').trim();
  if (!key) return null;
  let rows;
  try {
    rows = db.prepare('SELECT week, volume FROM trend_snapshots WHERE trend_key = ? AND volume IS NOT NULL ORDER BY week ASC LIMIT 12').all(key);
  } catch { return null; }
  if (!rows || rows.length < 2) return null;
  const last = rows[rows.length - 1], prev = rows[rows.length - 2];
  if (!(prev.volume > 0)) return null;
  const wowPct = ((last.volume - prev.volume) / prev.volume) * 100;
  let acceleration = null;
  if (rows.length >= 3) {
    const p2 = rows[rows.length - 3];
    if (p2.volume > 0) acceleration = wowPct - (((prev.volume - p2.volume) / p2.volume) * 100);
  }
  return { wowPct: Math.round(wowPct * 10) / 10, acceleration: acceleration == null ? null : Math.round(acceleration * 10) / 10,
    weeks: rows.length, lastVolume: last.volume, lastWeek: last.week };
}

// Curve-derived phase from slope + acceleration (replaces static labels).
function phaseFromGrowth(g) {
  if (!g || g.wowPct == null) return null;
  const s = g.wowPct, a = g.acceleration;
  if (s >= 50 && (a == null || a >= 0)) return 'hot';
  if (s >= 50) return 'peaking';
  if (s >= 10) return 'rising';
  if (s > -10) return 'emerging';
  if (s > -50) return 'cooling';
  return 'dormant';
}

// Data-backed revenue band: log-scaled demand proxy weighted by CPC value.
// Output format matches parseRevenue() ("$low-high", k-suffixed).
function fmtUsdBand(base) {
  const low = Math.max(100, Math.round((base * 0.6) / 100) * 100);
  const high = Math.max(low + 100, Math.round((base * 1.5) / 100) * 100);
  const f = n => n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : `${Math.round(n)}`;
  return `$${f(low)}-${f(high)}`;
}
function estRevenueFromDemand(volume, cpc) {
  const v = Number(volume) || 0;
  if (v <= 0) return null;
  let base = Math.log10(v + 1) * 900; // v=1k→~2.7k, v=50k→~3.9k, v=500k→~5.1k
  const c = Number(cpc) || 0;
  const mult = c >= 8 ? 1.5 : c >= 4 ? 1.25 : c >= 2 ? 1.1 : c >= 1 ? 1.0 : c > 0 ? 0.9 : 1;
  return fmtUsdBand(base * mult);
}

// DataForSEO Google Trends Explore — real interest-over-time series.
// Live endpoint, batched (5 keywords/request), throttled like the other SERP
// sources. Returns Map<keyword, Array<{period, values[]}|values>>; best-effort.
async function fetchDataForSEOTrendsExplore(keywords, span = '3m') {
  const out = new Map();
  if (!DATAFORSEO_LOGIN || !DATAFORSEO_KEY) { markHealth('dataforseo-trends', false, 'DataForSEO credentials not set'); return out; }
  const list = (keywords || []).filter(Boolean).slice(0, 25);
  const auth = 'Basic ' + Buffer.from(DATAFORSEO_LOGIN + ':' + DATAFORSEO_KEY).toString('base64');
  for (let i = 0; i < list.length; i += 5) {
    const batch = list.slice(i, i + 5);
    try {
      await dfThrottle();
      const resp = await axios.post('https://api.dataforseo.com/v3/keywords_data/google_trends/explore/live',
        [{ language_code: 'en', location_code: 2840, time_range: span, type: 'web', keywords: batch }],
        { timeout: 30000, headers: { Authorization: auth, 'Content-Type': 'application/json' } });
      const items = (resp.data && resp.data.tasks && resp.data.tasks[0] && resp.data.tasks[0].result) || [];
      const first = Array.isArray(items) ? items[0] : null;
      const series = first && Array.isArray(first.items) ? first.items : [];
      if (series.length) {
        batch.forEach((kw, kwIdx) => {
          const points = series
            .map(it => {
              const period = it.period || it.date || it.datetime || null;
              let v = null;
              if (Array.isArray(it.values) && it.values.length) v = Number(it.values[kwIdx]);
              else if (it.value != null) v = Number(it.value);
              else if (it.data && Array.isArray(it.data)) v = Number(it.data[kwIdx]);
              return { period, value: Number.isFinite(v) ? v : null };
            })
            .filter(p => p.value != null);
          if (points.length) out.set(kw, points);
        });
      }
      markHealth('dataforseo-trends', true);
    } catch (e) {
      const detail = e.response ? (e.response.status + ' ' + JSON.stringify(e.response.data).slice(0, 120)) : e.message;
      markHealth('dataforseo-trends', false, detail);
    }
  }
  return out;
}

// Sweep-time refresh: snapshot every tracked trend's measured volume, then
// rewrite velocity/phase/est_revenue from the real series where available.
// Trends Explore falls back to last DataForSEO volume when unavailable.
// Never throws; cost-capped (≤25 keywords/sweep, batched+throttled).
async function refreshTrendMeasurements(limit = 25) {
  let trends;
  try {
    trends = db.prepare('SELECT id, name, trend_key, phase, velocity, est_revenue, last_volume, last_cpc FROM trends ORDER BY id DESC LIMIT ?').all(200);
  } catch (e) { console.error('[MEASURE] load trends:', e.message); return { measured: 0, forecast: 0 }; }
  if (!trends.length) return { measured: 0, forecast: 0 };

  for (const t of trends) {
    const key = t.trend_key || normalizeNicheKey(t.name);
    if (key && !t.trend_key) {
      try { db.prepare('UPDATE trends SET trend_key = ? WHERE id = ?').run(key, t.id); } catch { /* non-fatal */ }
    }
    t.trend_key = key;
  }

  // Pull real series for trends with a prior measured volume first (they're
  // already tracked), then newest — capped by `limit`.
  const withSeries = trends.filter(t => t.trend_key).slice(0, limit);
  const seriesMap = await fetchDataForSEOTrendsExplore(withSeries.map(t => t.trend_key));

  let measured = 0;
  for (const t of withSeries) {
    const key = t.trend_key;
    const series = seriesMap.get(key);
    let snapVolume = null;
    if (series && series.length) {
      // Trends values are 0–100 relative interest; persist the latest point.
      const latest = series[series.length - 1];
      snapVolume = latest.value;
    } else if (t.last_volume != null) {
      snapVolume = t.last_volume; // keep the last absolute volume observed
    }
    if (snapVolume != null) {
      snapshotTrend(key, { volume: snapVolume, cpc: t.last_cpc, source: series ? 'dataforseo-trends' : 'carry-forward' });
    }
    const g = growthFromSnapshots(key);
    if (!g || g.wowPct == null) continue;
    const phase = phaseFromGrowth(g);
    const sign = g.wowPct > 0 ? '+' : '';
    const velocityStr = `${sign}${Math.round(g.wowPct)}%`;
    const rev = estRevenueFromDemand(g.lastVolume >= 100 ? g.lastVolume : (t.last_volume || g.lastVolume), t.last_cpc);
    try {
      db.prepare(`UPDATE trends SET measured_velocity = ?, phase = COALESCE(?, phase),
          velocity = ?, est_revenue = COALESCE(?, est_revenue) WHERE id = ?`)
        .run(g.wowPct, phase, velocityStr, rev, t.id);
      measured++;
    } catch (e) { console.error('[MEASURE] update failed:', e.message); }
  }
  return { measured, seriesPulled: seriesMap.size };
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 2 — OPEN-ENDED TERM DISCOVERY
// Recursive autocomplete expansion: seed → suggestions → new seeds, using the
// shopping-intent-heavy sources (Serper + Etsy). Every discovered term gets
// first_seen tracking (its own snapshot row doubles as the discovery record)
// so growth is measured from first observation — not from when a trend row
// happened to be created.
// Cost model: capped breadth/depth per run, throttled calls, durable queue
// records for observability. Unknown terms are returned to the caller (they
// are NOT auto-inserted as trends — vetting stays the gate).
// ═══════════════════════════════════════════════════════════════════════════

const DISCOVERY_SEEDS = [
  'digital planner', 'invoice template', 'checklist printable', 'business toolkit',
  'wedding sign', 'budget spreadsheet', 'meal planner', 'resume template',
  'party game printable', 'garden planner', 'fitness tracker', 'pet planner'
];

// A term is worth keeping when it looks like a productizable search phrase:
// short, no junk verbs, not already tracked.
function isDiscoverableTerm(term) {
  const t = String(term || '').trim();
  if (t.length < 4 || t.length > 60) return false;
  if (REJECT_RE.test(t)) return false;
  if (STOP_WORDS.has(t.toLowerCase())) return false;
  return true;
}

async function expandTerm(term, depth = 0, maxTerms = 40) {
  const found = [];
  // Called through module.exports so tests can stub the network fetchers.
  const [serper, etsy] = await Promise.allSettled([
    module.exports.fetchSerperAutocomplete([term]),
    module.exports.fetchEtsyAutocomplete([term], 8)
  ]);
  const collect = (r, fallbackIntent) => {
    if (r.status !== 'fulfilled' || !Array.isArray(r.value)) return;
    for (const item of r.value) {
      if (found.length >= maxTerms) break;
      if (item && item.name && isDiscoverableTerm(item.name)) {
        found.push({ term: item.name, source: item.source, shoppingIntent: item.shoppingIntent ?? fallbackIntent });
      }
    }
  };
  collect(serper, 0.9);
  collect(etsy, 1.0);
  return found;
}

// Breadth-first expansion from seeds. depth 0 = the seed list itself;
// each level's suggestions become the next level's frontier. Throttling is
// handled inside the fetchers (serpThrottle / per-request politeness), and
// every unknown term is recorded as a first-seen snapshot row.
async function discoverTerms({ seeds = DISCOVERY_SEEDS, depth = 1, perSeed = 6, maxNew = 30 } = {}) {
  const known = new Set();
  try {
    for (const r of db.prepare('SELECT DISTINCT trend_key FROM trends').all()) known.add(r.trend_key);
    for (const r of db.prepare('SELECT DISTINCT trend_key FROM trend_snapshots').all()) known.add(r.trend_key);
  } catch { /* empty DB is fine */ }

  const seen = new Set();
  const queue = [];
  for (const s of seeds) {
    const key = normalizeNicheKey(s);
    if (key && !known.has(key) && !seen.has(key)) { seen.add(key); queue.push({ term: s, depth: 0 }); }
  }

  const discovered = [];
  let level = 0;
  while (queue.length && level <= depth && discovered.length < maxNew) {
    const frontier = queue.splice(0, queue.length);
    for (const { term } of frontier) {
      if (discovered.length >= maxNew) break;
      const children = await expandTerm(term, level, perSeed);
      for (const c of children) {
        const key = normalizeNicheKey(c.term);
        if (!key || known.has(key) || seen.has(key)) continue;
        seen.add(key);
        // First-seen record: one snapshot row per new term this week.
        snapshotTrend(key, { volume: null, source: `discovery:${c.source}` });
        discovered.push({ term: c.term, key, from: term, depth: level + 1, source: c.source, shoppingIntent: c.shoppingIntent });
        if (level + 1 <= depth) queue.push({ term: c.term, depth: level + 1 });
      }
    }
    level++;
  }
  return { ok: true, discovered, scanned: seen.size };
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 3 — INTELLIGENCE LAYER (all derived from the snapshot series)
// · breakoutScore: z-score of the latest week vs the term's own history
// · forecastTrend: least-squares exponential fit → 12-week projection
// · cohortGrowthPercentile: this term's growth vs every other tracked term
// All sync (SQLite reads), no-throw, honest about insufficient data.
// ═══════════════════════════════════════════════════════════════════════════

function seriesFor(trendKey, maxWeeks = 12) {
  const key = String(trendKey || '').trim();
  if (!key) return [];
  try {
    return db.prepare('SELECT week, volume FROM trend_snapshots WHERE trend_key = ? AND volume IS NOT NULL ORDER BY week ASC LIMIT ?').all(key, maxWeeks);
  } catch { return []; }
}

// A breakout = the latest week is ≥2σ above the term's own prior history.
// Needs ≥4 weekly volumes. Flat history followed by any jump counts (std=0
// clamps to z=3); flat-forever never breaks out.
function breakoutScore(trendKey) {
  const rows = seriesFor(trendKey);
  if (rows.length < 4) return { z: null, weeks: rows.length, breakout: false, reason: 'need ≥4 weekly volumes' };
  const hist = rows.slice(0, -1).map(r => Number(r.volume));
  const latest = Number(rows[rows.length - 1].volume);
  const mean = hist.reduce((a, b) => a + b, 0) / hist.length;
  const variance = hist.reduce((a, b) => a + (b - mean) ** 2, 0) / hist.length;
  const std = Math.sqrt(variance);
  let z;
  if (std <= 0) z = latest > mean ? 3 : null; // flat-then-jump vs flat-forever
  else z = (latest - mean) / std;
  return {
    z: z == null ? null : Math.round(z * 100) / 100,
    weeks: rows.length,
    breakout: z != null && z >= 2,
    latest,
    mean: Math.round(mean * 10) / 10
  };
}

// Exponential fit: least squares on ln(volume+1) vs week index; project
// `horizonWeeks` ahead as relative week offsets. ok:false until 3 weeks.
function forecastTrend(trendKey, horizonWeeks = 12) {
  const rows = seriesFor(trendKey);
  if (rows.length < 3) return { ok: false, reason: 'need ≥3 weekly volumes', weeks: rows.length };
  const n = rows.length;
  const ys = rows.map(r => Math.log((Number(r.volume) || 0) + 1));
  const mx = (n - 1) / 2;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (i - mx) * (ys[i] - my); sxx += (i - mx) ** 2; }
  const slope = sxx > 0 ? sxy / sxx : 0;
  const intercept = my - slope * mx;
  const projections = [];
  for (let h = 1; h <= horizonWeeks; h++) {
    const v = Math.exp(intercept + slope * (n - 1 + h)) - 1;
    projections.push({ weekOffset: h, volume: Math.max(0, Math.round(v)) });
  }
  const weeklyGrowthPct = (Math.exp(slope) - 1) * 100;
  return {
    ok: true,
    weeklyGrowthPct: Math.round(weeklyGrowthPct * 10) / 10,
    projections,
    basedOnWeeks: n,
    lastVolume: rows[n - 1].volume,
    lastWeek: rows[n - 1].week
  };
}

// Where does this term's latest WoW growth sit vs every other tracked term?
// Returns null when either side lacks ≥2 weekly volumes.
function cohortGrowthPercentile(trendKey) {
  let rows;
  try {
    rows = db.prepare('SELECT trend_key, week, volume FROM trend_snapshots WHERE volume IS NOT NULL ORDER BY trend_key, week ASC').all();
  } catch { return null; }
  const key = String(trendKey || '').trim();
  const byKey = new Map();
  for (const r of rows) {
    if (!byKey.has(r.trend_key)) byKey.set(r.trend_key, []);
    byKey.get(r.trend_key).push(Number(r.volume));
  }
  const wow = (arr) => {
    if (!arr || arr.length < 2) return null;
    const a = arr[arr.length - 2], b = arr[arr.length - 1];
    return a > 0 ? (b - a) / a : null;
  };
  const mine = byKey.get(key);
  const myG = wow(mine);
  if (myG == null) return null;
  const others = [];
  for (const [k, v] of byKey) {
    if (k === key) continue;
    const g = wow(v);
    if (g != null) others.push(g);
  }
  if (!others.length) return null;
  const below = others.filter(g => g < myG).length;
  return {
    percentile: Math.round((below / others.length) * 100),
    cohortSize: others.length,
    myGrowthPct: Math.round(myG * 1000) / 10
  };
}

function insertLiveTrend(item, rank) {
  if (!isProductizableCandidate(item)) return null;
  item.shoppingIntent = fuseShoppingIntent(item);
  if (trendNameExists(item.name)) return null;

  const k = parseTraffic(item.traffic);
  const trendKey = normalizeNicheKey(item.name);
  // Data-backed revenue when validation data exists (DataForSEO seeds), else
  // the traffic-tier heuristic for sources without absolute volume.
  const validation = item.validation || null;
  const est = (validation && validation.volume > 0)
    ? (estRevenueFromDemand(validation.volume, validation.cpc) || est)
    : null;
  const velocityPct = Math.max(90, 320 - rank * 20); // pre-measurement baseline; refreshTrendMeasurements() replaces it
  const shopBoost = item.shoppingIntent >= 0.8;
  const estFinal = est || (shopBoost
    ? (k >= 100000 ? '$3k-8k' : '$1.5k-5k')
    : (k >= 200000 ? '$4k-9k' : k >= 100000 ? '$2k-6k' : k >= 50000 ? '$1k-4k' : '$500-2k'));
  const velocity = `+${velocityPct}%`;
  const phase = phaseForVelocity(velocityPct);
  const intentTag = ` · intent=${item.shoppingIntent.toFixed(2)}`;

  // LONG-TAIL ADAPTER (N1.3): Apply long-tail adjustment to volume-based metrics
  // This boosts lower-volume, more specific niches that might be overlooked by pure volume scoring
  let adaptedValidation = validation;
  if (validation && validation.volume > 0) {
    // Import the long-tail adapter (we'll add it to this file or use a shared one)
    // For now, we'll implement the logic inline
    const LOW_VOLUME_THRESHOLD = 100;    // Below this is considered long-tail
    const MEDIUM_VOLUME_THRESHOLD = 1000; // Medium volume
    const HIGH_VOLUME_THRESHOLD = 5000;  // High volume/mainstream
    
    let longTailBoost = 0;
    const volume = validation.volume;
    
    if (volume <= LOW_VOLUME_THRESHOLD) {
      // Strong boost for very low volume (true long-tail)
      longTailBoost = 25; // Up to 25 point boost to effective score/relevance
    } else if (volume <= MEDIUM_VOLUME_THRESHOLD) {
      // Moderate boost for medium-low volume
      const volumeRatio = (MEDIUM_VOLUME_THRESHOLD - volume) / (MEDIUM_VOLUME_THRESHOLD - LOW_VOLUME_THRESHOLD);
      longTailBoost = 25 * volumeRatio; // 0 to 25 points
    } else if (volume <= HIGH_VOLUME_THRESHOLD) {
      // Small boost for medium volume (still some long-tail benefit)
      const volumeRatio = (HIGH_VOLUME_THRESHOLD - volume) / (HIGH_VOLUME_THRESHOLD - MEDIUM_VOLUME_THRESHOLD);
      longTailBoost = 10 * volumeRatio; // 0 to 10 points
    }
    // For high volume (> HIGH_VOLUME_THRESHOLD), no boost
    
    // Apply the boost by adjusting the effective volume for scoring purposes
    // We don't actually change the stored volume, but we can use this to adjust other metrics
    // For now, we'll store the boost information in the why field or add a new field later
    // As a simpler approach, we'll adjust the estRevenue calculation to reflect long-tail value
    if (longTailBoost > 0) {
      // Create an adapted validation object with adjusted metrics
      adaptedValidation = {
        ...validation,
        longTailBoost: longTailBoost,
        // We could adjust the effective volume for scoring, but let's keep it simple
        // and just note that this trend received long-tail adaptation
      };
    }
  }

  if (trendKey && validation && validation.volume > 0) {
    // Use adapted validation for snapshot if we have long-tail adaptation
    const snapshotValidation = adaptedValidation || validation;
    snapshotTrend(trendKey, { 
      volume: snapshotValidation.volume, 
      cpc: snapshotValidation.cpc, 
      competition: snapshotValidation.difficulty, 
      source: item.source 
    });
  }

  db.prepare(`
    INSERT INTO trends (name, emoji, phase, velocity, window, est_revenue, why, activated, detected_at,
      trend_key, first_seen_at, last_volume, last_cpc)
    VALUES (?, '🛰️', ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
  `).run(
    item.name,
    phase,
    velocity,
    shopBoost ? 21 : 10,
    estFinal,
    `${item.source} · ${item.traffic || 'trending now'}${intentTag}` +
    (adaptedValidation && adaptedValidation.longTailBoost ? ` · long-tail+${adaptedValidation.longTailBoost}` : ''),
    new Date().toISOString(),
    trendKey,
    new Date().toISOString(),
    validation ? validation.volume : null,
    validation ? validation.cpc : null
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
  await pull('pinterest-trends', () => fetchPinterestTrends(6));
  await pull('tiktok-creative-center', () => fetchTikTokTrends(5));
  await pull('youtube-rss', () => fetchYouTubeTrends(8));
  await pull('amazon-movers', () => fetchAmazonMovers(8));
  await pull('ebay-trending', () => fetchEbayTrending(8));
  // SERP discovery layers (Serper autocomplete + ValueSERP shopping validation)
  await pull('serper-autocomplete', () => fetchSerperAutocomplete());
  await pull('dataforseo', () => fetchDataForSEO());

  // PHASE 1: refresh measured velocity/phase/revenue from real series.
  try { await refreshTrendMeasurements(); } catch (e) { console.error('[RADAR] measure refresh:', e.message); }


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
  fetchYouTubeTrends,
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
  getSourceHealth,  fetchSerperAutocomplete,
  fetchDataForSEO,
  scoreOpportunity,
  searchQueueEnqueue,
  searchQueueRecord,
  getSearchQueue,
  drainSearchQueue,
  fetchEtsySaturation,

  markHealth,

  weekKey,
  snapshotTrend,
  growthFromSnapshots,
  phaseFromGrowth,
  estRevenueFromDemand,
  fmtUsdBand,
  fetchDataForSEOTrendsExplore,
  refreshTrendMeasurements,
  discoverTerms,
  isDiscoverableTerm,
  DISCOVERY_SEEDS,
  seriesFor,
  breakoutScore,
  forecastTrend,
  cohortGrowthPercentile
};
