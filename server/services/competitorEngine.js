// ═══════════════════════════════════════════════════════════════════════════
// COMPETITOR ENGINE — automated competitor analysis and counter-product generation
// Takes a competitor listing URL or search query, extracts incumbent price,
// title, tags, and weaknesses, and generates counter-positioned products.
// ═══════════════════════════════════════════════════════════════════════════

const axios = require('axios');
const { db } = require('../database');
const radar = require('./trendRadar');
const seo = require('./seoEngine');
const conceptEngine = require('./conceptEngine');

// Extract listing metadata from Etsy/Gumroad or fallback HTML / query
async function scrapeCompetitor(input) {
  if (!input || typeof input !== 'string') {
    throw new Error('Valid competitor URL or query phrase required');
  }

  const isUrl = /^https?:\/\//i.test(input.trim());
  let title = '';
  let price = 15.00;
  let tags = [];
  let platform = 'unknown';

  if (isUrl) {
    const url = input.trim();
    if (/etsy\.com/i.test(url)) platform = 'etsy';
    else if (/gumroad\.com/i.test(url)) platform = 'gumroad';

    try {
      const resp = await axios.get(url, {
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      const html = String(resp.data || '');

      // Basic title parsing
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      if (titleMatch) {
        title = titleMatch[1].replace(/\|.*$/g, '').replace(/ - Etsy.*$/g, '').trim();
      }

      // Basic price parsing
      const priceMatch = html.match(/["']price["']\s*:\s*["']?([0-9]+(?:\.[0-9]{2})?)["']?/i) ||
                         html.match(/\$([0-9]+(?:\.[0-9]{2})?)/);
      if (priceMatch) {
        price = parseFloat(priceMatch[1]) || 15.00;
      }

      // Tag extraction
      const metaKeywords = html.match(/<meta\s+name=["']keywords["']\s+content=["']([^"']+)["']/i);
      if (metaKeywords) {
        tags = metaKeywords[1].split(',').map(t => t.trim()).filter(Boolean);
      }
    } catch (e) {
      // Fallback if URL scraping blocked: extract from slug / path
      try {
        const parsed = new URL(url);
        const parts = parsed.pathname.split('/').filter(Boolean);
        title = decodeURIComponent(parts[parts.length - 1] || 'Competitor Product').replace(/[-_]/g, ' ');
      } catch {
        title = 'Competitor Product';
      }
    }
  } else {
    // Input is a direct keyword / product query
    title = input.trim();
  }

  // Probe saturation & opportunity
  let opportunity = 50;
  let saturationData = null;
  try {
    const opp = await radar.scoreOpportunity(title);
    if (opp) {
      opportunity = opp.opportunity;
      saturationData = opp;
    }
  } catch {}

  const counterAngle = price >= 25 ? 'undercut_and_bundle' : 'pro_tier_expansion';

  return {
    queryOrUrl: input,
    platform,
    title: title || input,
    incumbentPrice: price,
    tags: tags.slice(0, 13),
    opportunityScore: opportunity,
    saturation: saturationData,
    counterStrategy: {
      angle: counterAngle,
      recommendedPrice: counterAngle === 'undercut_and_bundle' ? +(price * 0.75).toFixed(2) : +(price * 1.5).toFixed(2),
      recommendedType: counterAngle === 'undercut_and_bundle' ? 'bundle' : 'spreadsheet'
    }
  };
}

// Generate competing counter-products based on scraped competitor
async function generateCounterProducts(analysis, count = 2) {
  if (!analysis || !analysis.title) throw new Error('Analysis object with title is required');

  const baseTitle = analysis.title;
  const strat = analysis.counterStrategy;
  const products = [];

  // Find or create niche profession matching the competitor
  let prof = db.prepare('SELECT * FROM professions WHERE name LIKE ? LIMIT 1').get(`%${baseTitle.slice(0, 15)}%`);
  if (!prof) {
    const slug = baseTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const nicheServices = require('./nicheServices');
    const ins = db.prepare('INSERT INTO professions (name, slug, services) VALUES (?, ?, ?)')
      .run(baseTitle.slice(0, 50), slug, nicheServices.servicesForNiche(baseTitle));
    prof = db.prepare('SELECT * FROM professions WHERE id = ?').get(ins.lastInsertRowid);
  }

  for (let i = 0; i < count; i++) {
    const isBundle = i === 0 && strat.recommendedType === 'bundle';
    const type = isBundle ? 'bundle' : 'spreadsheet';
    const price = strat.recommendedPrice || 19.99;
    const counterName = isBundle
      ? `Complete ${baseTitle.slice(0, 40)} Pro Toolkit`
      : `Ultimate ${baseTitle.slice(0, 40)} Profit & Operations Model`;

    const insProd = db.prepare(`
      INSERT INTO products (profession_id, name, type, price, status, origin, brief)
      VALUES (?, ?, ?, ?, 'draft', 'competitor_counter', ?)
    `).run(prof.id, counterName, type, `$${price.toFixed(2)}`, `Outmaneuver incumbent competitor "${baseTitle}" with superior features and value pricing.`);

    const prodId = insProd.lastInsertRowid;

    // AI Concept enrichment
    try {
      await conceptEngine.enrichProduct(prodId, `Differentiated counter-product against incumbent "${baseTitle}"`);
    } catch {}

    const fresh = db.prepare('SELECT * FROM products WHERE id = ?').get(prodId);
    products.push(fresh);
  }

  db.prepare('INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)')
    .run('competitor_counter_created', `Generated ${products.length} counter-product(s) targeting "${baseTitle}"`, 'success');

  return { analysis, generated: products };
}

module.exports = {
  scrapeCompetitor,
  generateCounterProducts
};
