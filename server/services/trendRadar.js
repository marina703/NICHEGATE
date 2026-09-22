// ============================================================================
// TREND RADAR — live trend discovery across multiple sources. Each source is
// best-effort with a health registry. Real spikes flow into trends where the
// vetting engine scores them before anything is activated.
// ============================================================================

const axios = require('axios');
const cheerio = require('cheerio');
const { db } = require('../database');

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

const ETSY_SHARED_SECRET = process.env.ETSY_SHARED_SECRET || process.env.ETSY_CLIENT_SECRET;

async function fetchEtsySaturation(phrase) {
  if (!ETSY_SHARED_SECRET) { markHealth('etsy-saturation', false, 'ETSY_SHARED_SECRET not set'); return null; }
  const qid = searchQueueEnqueue('etsy-saturation', phrase);
  try {
    const resp = await axios.get('https://openapi.etsy.com/v3/application/listings/active', {
      params: { keywords: phrase, limit: 100 },
      timeout: 12000,
      headers: { 'x-api-key': ETSY_SHARED_SECRET }
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
    // More active listings => more saturated => lower opportunity
    let saturation = count >= 8000 ? 0.1 : count >= 3000 ? 0.3 : count >= 1000 ? 0.5 : count >= 300 ? 0.7 : 0.9;
    // Established niches (heavy favorites / premium price) are harder to break into
    if (avgFav > 500 || avgPrice > 30) saturation = Math.min(1, saturation + 0.05);
    searchQueueRecord(qid, true, { count, avgFav: Math.round(avgFav), avgPrice: +avgPrice.toFixed(2), avgAge: Math.round(avgAge) });
    markHealth('etsy-saturation', true);
    return { count, saturation, avgFavorites: Math.round(avgFav), avgPrice: +avgPrice.toFixed(2), avgAgeDays: Math.round(avgAge), unsaturated: saturation >= 0.3 };

  } catch (e) {
    const detail = e.response ? (e.response.status + ' ' + JSON.stringify(e.response.data).slice(0, 120)) : e.message;
    searchQueueRecord(qid, false, detail);
    markHealth('etsy-saturation', false, detail);
    return null;
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
  // SERP discovery layers (Serper autocomplete + ValueSERP shopping validation)
  await pull('serper-autocomplete', () => fetchSerperAutocomplete());
  await pull('dataforseo', () => fetchDataForSEO());


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
  getSourceHealth,  fetchSerperAutocomplete,
  fetchDataForSEO,
  scoreOpportunity,
  searchQueueEnqueue,
  searchQueueRecord,
  getSearchQueue,
  drainSearchQueue,
  fetchEtsySaturation,

  markHealth
};
