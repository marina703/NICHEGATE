// ── DEMAND SIGNALS ── real marketplace demand terms, honest degradation ──────
// Mines what shoppers actually search for by frequency-analyzing Etsy listing
// titles via the Serper Google API (SERPER_API_KEY). Established repo pattern:
// no invented signal — when the key is missing or the fetch fails, return []
// with a health note instead of making tags up.
const axios = require('axios');

const cache = new Map(); // niche → { tags, health, at }
const TTL_MS = 12 * 60 * 60 * 1000; // demand moves slowly; 12h is plenty

const STOP = new Set(['the', 'and', 'for', 'with', 'your', 'you', 'all', 'any', 'a', 'an', 'of', 'to', 'in', 'on', 'from', 'that', 'this', 'is', 'are', 'it', 'by', 'or', 'as', 'at', 'com', 'www', 'https', 'http', 'new', 'best', 'top', 'sale', 'shop', 'store', 'buy', 'out', 'now']);

/** Harvest demand tags for a niche from live Etsy listing titles. */
async function etsyDemandTags(niche, { limit = 6, forceRefresh = false } = {}) {
  const key = String(niche || '').trim().toLowerCase();
  if (!key) return { tags: [], health: 'no niche given' };
  const hit = cache.get(key);
  if (hit && !forceRefresh && Date.now() - hit.at < TTL_MS) return hit;

  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return { tags: [], health: 'serper key not configured' };

  try {
    const resp = await axios.post('https://google.serper.dev/search',
      { q: `site:etsy.com "${niche}" printable`, num: 20 },
      { headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' }, timeout: 8000 });
    const organic = (resp.data && resp.data.organic) || [];
    const titles = organic.map((r) => String(r.title || '')).join(' ').toLowerCase();

    // Frequency-mine 2–3 word phrases that fit Etsy's 20-char tag limit.
    const words = titles.split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
    const counts = new Map();
    for (let n = 2; n <= 3; n++) {
      for (let i = 0; i + n <= words.length; i++) {
        const phrase = words.slice(i, i + n).join(' ');
        if (phrase.length <= 20) counts.set(phrase, (counts.get(phrase) || 0) + 1);
      }
    }
    const tags = [...counts.entries()]
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, limit)
      .map(([p]) => p);

    const out = {
      tags,
      health: `serper: ${tags.length} demand tag(s) mined from ${organic.length} listing title(s)`,
      at: Date.now()
    };
    cache.set(key, out);
    return out;
  } catch (e) {
    return { tags: [], health: 'serper fetch failed: ' + (e.response ? e.response.status : e.message) };
  }
}

/**
 * Fit a candidate tag into Etsy's 20-char limit WITHOUT cutting a word: keep the
 * longest prefix that ends on a space or hyphen boundary; a single word that
 * cannot fit is dropped (''), never shipped as a broken fragment such as
 * "sustainablelandscapi".
 */
function fitTag(raw) {
  const s = String(raw == null ? '' : raw).trim().toLowerCase();
  if (s.length <= 20) return s;
  for (let i = 20; i >= 3; i--) {
    if (/[\s-]/.test(s[i])) return s.slice(0, i).replace(/[\s-]+$/, '');
  }
  return '';
}

/** Merge harvested demand tags into an Etsy tag list (≤max, each ≤20 chars). */
function mergeDemandTags(baseTags, demandTags, max = 13) {
  const out = [];
  for (const t of [...(demandTags || []), ...(baseTags || [])]) {
    const clean = fitTag(t);
    if (clean.length >= 3 && !out.includes(clean)) out.push(clean);
    if (out.length >= max) break;
  }
  return out;
}

/** Sync cache read — lets generateSEO pick up harvested demand without an await. */
function getCachedDemandTags(niche) {
  const hit = cache.get(String(niche || '').trim().toLowerCase());
  return hit ? [...hit.tags] : [];
}

// Demand phrase → design-token hint. Real shopper language is the strongest
// signal of what the product should *look* like, so the palette/vibe tokens are
// derived from the harvested tags rather than guessed from the niche name.
const DEMAND_SENTIMENTS = [
  { sentiment: 'finance', accent: '#d97706', re: /invoice|bookkeep|tax|account|payroll|finance|loan|notary|budget|pricing|profit|revenue|money|expense/i },
  { sentiment: 'tech', accent: '#0284c7', re: /spreadsheet|excel|tracker|dashboard|automation|social media|content|analytics|crm/i },
  { sentiment: 'wellness', accent: '#7c3aed', re: /self care|wellness|mindful|journal|gratitude|habit|yoga|meditat|sleep|affirm/i },
  { sentiment: 'beauty', accent: '#ec4899', re: /beauty|salon|spa|makeup|lash|hair|skin|esthetic/i },
  { sentiment: 'trades', accent: '#16a34a', re: /checklist|contractor|job|work order|estimate|quote|inspection|site|safety|maintenance/i },
  { sentiment: 'food', accent: '#ea580c', re: /recipe|menu|meal|bake|cook|kitchen|cater|coffee/i }
];

/** Derive design tokens (sentiment + accent family) from harvested demand tags. */
function designTokens(tags) {
  const blob = (tags || []).join(' ').toLowerCase();
  for (const d of DEMAND_SENTIMENTS) {
    if (d.re.test(blob)) return { sentiment: d.sentiment, accent: d.accent };
  }
  return { sentiment: 'default', accent: '#e11d48' };
}

module.exports = { etsyDemandTags, mergeDemandTags, getCachedDemandTags, designTokens, fitTag };
