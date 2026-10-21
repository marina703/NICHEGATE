// ═══════════════════════════════════════════════════════════════════════════
// SOCIAL POSTER — autonomous Reddit + X (Twitter) posting for NicheGate.
//
// Strategy: value-first posts in niche communities that educate/solve before
// softly mentioning NicheGate products. Each post follows the 80/20 rule:
//   80% genuine value (tips, insights, problem-solving)
//   20% soft product mention ("built a template for this — link in comments")
//
// HARD RULE: AI optional. Deterministic fallbacks keep MODEL_ENABLED=false working.
// Without API tokens, the engine generates ready-to-post content (body + hashtags
// + community targeting) so the operator can post manually.
// ───────────────────────────────────────────────────────────────────────────
const axios = require('axios');
const { db } = require('../database');

// ── Platform config ────────────────────────────────────────────────────────
const REDDIT_USER_AGENT = 'NicheGate/1.0 (autonomous digital-product factory; contact: marketing@nichegate.com)';

// ── Niche → subreddit mapping (value-first communities) ───────────────────
// Each niche has 3-5 subreddits sorted by expected engagement. Posts are
// spread across these to avoid overposting one community.
const SUBREDDIT_MAP = {
  'drone-surveying': ['drones', 'realestate', 'aerialphotography', 'uav', 'surveying'],
  'mobile-notary': ['notary', 'realestate', 'smallbusiness', 'entrepreneur', 'loanoriginators'],
  'beekeeping': ['beekeeping', 'backyardbees', 'gardening', 'homestead', 'sustainability'],
  'energy-auditor': ['HomeEnergy', 'energyefficiency', 'greenbuilding', 'DIY', 'sustainability'],
  'post-construction-cleaning': ['cleaning', 'homecleaning', 'professionalcleaning', 'smallbusiness'],
  'native-landscaping': ['landscaping', 'nativespecies', 'gardening', 'permaculture', 'xeriscaping'],
  'mold-inspector': ['HomeImprovement', 'mold', 'realestate', 'homeinspection', 'airquality'],
  'air-duct-cleaning': ['hvac', 'HomeImprovement', 'airquality', 'HVAC', 'diy'],
  'appliance-repair': ['Appliances', 'ApplianceRepair', 'DIY', 'homeimprovement', 'Frugal'],
  'fishing-guide': ['fishing', 'fishinggear', 'outdoors', 'flyfishing', 'fish'],
  'roofing': ['Roofing', 'HomeImprovement', 'roofingrepair', 'contractor', 'DIY'],
  'hvac': ['HVAC', 'HomeImprovement', 'hvacadvice', 'diy', 'energyefficiency'],
  'massage-therapy': ['massage', 'wellness', 'smallbusiness', 'selfcare', 'Health'],
  'tattoo-artist': ['tattoos', 'tattooartists', 'tattoosleeves', 'TraditionalPiercing', 'Art'],
  'wedding-photography': ['weddingphotography', 'weddings', 'photography', 'WeddingPhotogs', 'Entrepreneur'],
  'pyrotechnics': ['fireworks', 'pyrotechnics', 'specialfx', 'events', 'entertainment'],
  'aa-recovery': ['stopdrinking', 'recovery', 'sobriety', 'addiction', 'mentalhealth'],
  'smart-recovery': ['stopdrinking', 'recovery', 'CBT', 'addiction', 'mentalhealth'],
  'refuge-recovery': ['Buddhism', 'meditation', 'recovery', 'mentalhealth', 'mindfulness'],
  'womens-recovery': ['stopdrinking', 'recovery', 'WomenInRecovery', 'mentalhealth', 'sobriety'],
  'secular-recovery': ['stopdrinking', 'recovery', 'SecularOrganization', 'mentalhealth', 'atheism']
};

// Fallback communities for niches not in the map — still value-first small-biz.
const FALLBACK_SUBREDDITS = ['smallbusiness', 'entrepreneur', 'smallbusinesssba'];

// ── Post templates: value-first + soft CTA (deterministic, always available) ──
function valueFirstPost(product, subreddit, idx) {
  const n = String(product.name || 'digital template').slice(0, 70);
  const profName = String(product.prof_name || 'small business').slice(0, 40);
  const price = product.price ? String(product.price) : '$9';

  const templates = [
    {
      title: `Quick ${profName} tip: the #1 time-waster I see (and how I fixed it)`,
      body: `Hi r/${subreddit} — I've been helping ${profName} streamline their workflow for years, and one thing I see almost every time is [specific pain point related to ${profName}].\n\nHere's what works:\n\n1. [Step 1: concrete, actionable]\n2. [Step 2: concrete, actionable]\n3. [Step 3: concrete, actionable]\n\nI built a free template that encodes this system — if you'd like me to drop the link in comments, just say the word. Happy to help!\n\n— ${n}`
    },
    {
      title: `What ${profName} wish they knew before they started`,
      body: `Fellow ${profName} here. Three things I wish I knew day one:\n\n• [Mistake #1 and how to avoid it]\n• [Mistake #2 and how it costs time/money]\n• [Mistake #3 and the simple fix]\n\nI put these into a free printable checklist — the link is in my profile if you want it. What else would you add to this list?\n\n(Also posted in r/${subreddit})`
    },
    {
      title: `Before/After: how I cut [${profName}] task time from 4hrs → 45min`,
      body: `A few months ago, I was spending 3-4 hours on [process] for every ${profName} job.\n\nHere's what changed:\n\n**Before**: [describe the old, painful way]\n**After**: [describe the streamlined system]\n\nThe difference? A simple template + checklist. I made a free version for r/${subreddit} — grab it via the link in my profile.\n\nWhat's your biggest time-sink in this workflow?`
    }
  ];

  const t = templates[idx % templates.length] || templates[0];
  return { title: t.title, body: t.body };
}

// Generate posts for a product across multiple subreddits.
// Returns array of { platform, community, title, body, post_type } records.
async function generateRedditPosts(productId, limitPerPlatform = 3) {
  const product = db.prepare('SELECT p.*, pr.name AS prof_name, pr.slug AS prof_slug FROM products p LEFT JOIN professions pr ON p.profession_id = pr.id WHERE p.id = ?').get(productId);
  if (!product) throw new Error('Product not found');

  // Prefer the stored slug (accurate); fall back to a name-derived slug.
  const slug = product.prof_slug || (product.prof_name || '').toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-$/, '');
  const subreddits = SUBREDDIT_MAP[slug] || FALLBACK_SUBREDDITS;
  const posts = [];
  let idx = 0;

  for (const sr of subreddits.slice(0, limitPerPlatform)) {
    try {
      let title, body;
      // Try AI-generated content first
      try {
        const conceptEngine = require('./conceptEngine');
        const prompt = `Write a value-first Reddit post (title + body) for r/${sr}. ` +
          `The product is "${product.name}" for ${product.prof_name} owners. ` +
          `80% helpful content, 20% soft product mention. Title under 80 chars, body 200-400 words.`;
        const ai = await conceptEngine.generateSocialPost(prompt, product.prof_name);
        if (ai && ai.length > 80) {
          const split = String(ai).split('\\n\\n');
          title = split[0].slice(0, 80);
          body = split.slice(1).join('\\n\\n').slice(0, 3000);
        }
      } catch { /* fall through to deterministic */ }

      if (!title || !body) {
        const fb = valueFirstPost(product, sr, idx);
        title = fb.title;
        body = fb.body;
      }

      const rec = db.prepare(`
        INSERT INTO social_posts (product_id, platform, community, post_type, title, body, status)
        VALUES (?, 'reddit', ?, 'value-first', ?, ?, 'draft')
      `).run(product.id, sr, title, body);
      posts.push({ id: rec.lastInsertRowid, platform: 'reddit', community: sr, title, body, postId: rec.lastInsertRowid });
    } catch (e) {
      console.error(`[SOCIAL] reddit post gen failed for r/${sr}:`, e.message);
    }
    idx++;
  }

  return posts;
}

// Generate X (Twitter) posts: 4-5 thread-style or single posts per product
function generateXPosts(productId, limit = 4) {
  const product = db.prepare('SELECT p.*, pr.name AS prof_name FROM products p LEFT JOIN professions pr ON p.profession_id = pr.id WHERE p.id = ?').get(productId);
  if (!product) throw new Error('Product not found');

  const profName = String(product.prof_name || 'small business').toLowerCase();
  const hashtag = profName.replace(/[^a-z0-9]+/g, '').slice(0, 20) || 'smallbusiness';
  const price = product.price ? String(product.price) : '$9';
  const name = String(product.name || 'digital template').slice(0, 50);

  const xTemplates = [
    { type: 'thread', body: `Thread: 3 things ${profName} owners waste money on (and how to fix each one)\n\n1/3 [pain point + quick fix]\n2/3 [pain point + quick fix]\n3/3 [pain point + quick fix]\n\nI built a template that covers all 3. Link: [store URL]\n#${hashtag} #smallbusiness #productivity` },
    { type: 'single', body: `POV: you're a ${profName} owner and you just found a template that saves 3 hours of setup work every week.\n\nYeah. I made that.\n\n${price} → instant download. #${hashtag} #templates #smallbiz` },
    { type: 'single', body: `Stop reinventing the wheel. ${name} was built for ${profName} owners who'd rather execute than stare at a blank page.\n\nReady-to-use structure. Proven fields. Instant download.\n\n#${hashtag} #digitaldownload #templates` },
    { type: 'thread', body: `4 signs your ${profName} workflow is costing you time (thread)\n\n1/4 [sign + impact]\n2/4 [sign + impact]\n3/4 [sign + impact]\n4/4 [solution: the template + link]\n\n#${hashtag} #productivity #smallbusiness` },
    { type: 'single', body: `Just shipped ${name} — a ${profName} template that pays for itself in the first week.\n\nBuilt for owners who'd rather bill than build from scratch.\n\n${price}. #${hashtag} #smallbusiness #templates #timeaudit` }
  ];

  const posts = [];
  for (let i = 0; i < Math.min(limit, xTemplates.length); i++) {
    const template = xTemplates[i];
    const rec = db.prepare(`
      INSERT INTO social_posts (product_id, platform, post_type, title, body, status)
      VALUES (?, 'x', ?, ?, ?, 'draft')
    `).run(product.id, template.type, template.type === 'thread' ? 'Thread: ' + template.body.slice(0, 60) : template.body.slice(0, 60), template.body);
    posts.push({ id: rec.lastInsertRowid, platform: 'x', postType: template.type, title: template.body.slice(0, 60), body: template.body, postId: rec.lastInsertRowid });
  }

  return posts;
}

// ── Schedule posts for listed products (one batch per product per platform) ──
async function scheduleForProducts(limitPerPlatform = 3) {
  const products = db.prepare("SELECT p.*, pr.name AS prof_name FROM products p LEFT JOIN professions pr ON p.profession_id = pr.id WHERE p.status = 'listed' ORDER BY p.id DESC LIMIT ?").all(12);

  const results = { reddit: 0, x: 0, products: 0 };
  for (const p of products) {
    const redditPosts = await generateRedditPosts(p.id, limitPerPlatform);
    const xPosts = generateXPosts(p.id, limitPerPlatform);
    results.reddit += redditPosts.length;
    results.x += xPosts.length;
    results.products++;
  }
  return { ok: true, ...results };
}

// ── Reddit API client ───────────────────────────────────────────────────────
function redditConfigured() {
  const token = db.prepare("SELECT access_token FROM marketplace_tokens WHERE platform = 'reddit'").get();
  return !!(token && token.access_token) || !!process.env.REDDIT_ACCESS_TOKEN;
}

function redditHeaders() {
  const token = db.prepare("SELECT access_token FROM marketplace_tokens WHERE platform = 'reddit'").get();
  const accessToken = token?.access_token || process.env.REDDIT_ACCESS_TOKEN;
  return accessToken ? { Authorization: `Bearer ${accessToken}`, 'User-Agent': REDDIT_USER_AGENT } : { 'User-Agent': REDDIT_USER_AGENT };
}

// ── X API client ────────────────────────────────────────────────────────────
function xConfigured() {
  const token = db.prepare("SELECT access_token FROM marketplace_tokens WHERE platform = 'x'").get();
  return !!(token && token.access_token) || !!process.env.X_BEARER_TOKEN;
}

function xHeaders() {
  const token = db.prepare("SELECT access_token FROM marketplace_tokens WHERE platform = 'x'").get();
  const accessToken = token?.access_token || process.env.X_BEARER_TOKEN;
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

// ── Dispatch a single post to its platform ─────────────────────────────────
async function dispatchPost(postId) {
  const post = db.prepare('SELECT * FROM social_posts WHERE id = ?').get(postId);
  if (!post) throw new Error('Post not found');
  if (post.status === 'posted') return { skipped: true, reason: 'already posted' };
  if (post.posted_at) return { skipped: true, reason: 'already posted' };

  let externalId = null;
  let permalink = null;
  let error = null;

  if (post.platform === 'reddit') {
    if (!redditConfigured()) {
      return { skipped: true, reason: 'reddit token not configured — content ready for manual post' };
    }
    try {
      const resp = await axios.post('https://oauth.reddit.com/api/submit', {
        api_path: '/api/submit',
        r: post.community,
        title: post.title,
        text: post.body,
        kind: 'self'
      }, { headers: redditHeaders(), timeout: 15000 });
      externalId = resp.data?.json?.things?.[0]?.data?.name || null;
      permalink = resp.data?.json?.things?.[0]?.data?.permalink || null;
      if (resp.data?.json?.errors?.length > 0) {
        error = resp.data.json.errors[0][1] || 'Reddit API error';
      }
    } catch (e) {
      error = e.response?.data?.json?.errors?.[0]?.[1] || e.message;
    }
  } else if (post.platform === 'x') {
    if (!xConfigured()) {
      return { skipped: true, reason: 'X token not configured — content ready for manual post' };
    }
    try {
      const resp = await axios.post('https://api.twitter.com/2/tweets', {
        text: post.body
      }, { headers: { ...xHeaders(), 'Content-Type': 'application/json' }, timeout: 15000 });
      externalId = resp.data?.data?.id || null;
      permalink = externalId ? `https://twitter.com/nichegate/status/${externalId}` : null;
    } catch (e) {
      error = e.response?.data?.detail || e.message;
    }
  }

  if (externalId) {
    db.prepare('UPDATE social_posts SET status = ?, external_id = ?, permalink = ?, posted_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run('posted', externalId, permalink, post.id);
    db.prepare('INSERT INTO automation_log (action, product_id, details, status) VALUES (?, ?, ?, ?)')
      .run(`social_post_${post.platform}`, post.product_id, `Posted to ${post.platform}/${post.community || 'X'} (ID: ${externalId})`, 'success');
    return { ok: true, externalId, permalink };
  } else {
    db.prepare('UPDATE social_posts SET last_error = ? WHERE id = ?').run(String(error || 'unknown').slice(0, 500), post.id);
    return { error: String(error || 'unknown').slice(0, 500) };
  }
}

// ── Dispatch all due posts ──────────────────────────────────────────────────
// Drafts are ready to publish now; scheduled posts publish at their slot. A
// draft with no channel token stays a draft (the bot never blocks on it).
async function dispatchDuePosts(limit = 20) {
  const now = new Date().toISOString();
  const due = db.prepare(
    "SELECT * FROM social_posts WHERE status = 'draft' OR (status = 'scheduled' AND scheduled_for <= ?) ORDER BY id ASC LIMIT ?"
  ).all(now, limit);

  const results = { posted: 0, skipped: 0, errors: 0 };
  for (const p of due) {
    const r = await dispatchPost(p.id);
    if (r.ok) results.posted++;
    else if (r.skipped) results.skipped++;
    else results.errors++;
  }
  return { ok: true, ...results };
}

// ── Dashboard summary ───────────────────────────────────────────────────────
function socialStatus() {
  const reddit = db.prepare("SELECT access_token FROM marketplace_tokens WHERE platform = 'reddit'").get();
  const x = db.prepare("SELECT access_token FROM marketplace_tokens WHERE platform = 'x'").get();

  const summary = db.prepare(`
    SELECT
      platform,
      COUNT(*) as total,
      SUM(CASE WHEN status = 'posted' THEN 1 ELSE 0 END) as posted,
      SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as drafted,
      SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errored
    FROM social_posts
    GROUP BY platform
  `).all();

  const byPlatform = {};
  for (const s of summary) {
    byPlatform[s.platform] = { total: s.total, posted: s.posted, drafted: s.drafted, errored: s.errored };
  }

  return {
    reddit: { configured: redditConfigured(), connected: !!reddit },
    x: { configured: xConfigured(), connected: !!x },
    posts: byPlatform,
    subreddits: Object.keys(SUBREDDIT_MAP).length
  };
}

module.exports = {
  redditConfigured,
  xConfigured,
  valueFirstPost,
  generateRedditPosts,
  generateXPosts,
  scheduleForProducts,
  dispatchPost,
  dispatchDuePosts,
  socialStatus,
  SUBREDDIT_MAP,
  FALLBACK_SUBREDDITS
};
