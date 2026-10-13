require('dotenv').config({ quiet: true }); // quiet: dotenv@17 prints rotating promo "tips" to stdout
const runtimeConfig = require('./services/runtimeConfig');
// Enforce fail-closed production configuration before opening SQLite or starting HTTP.
if (require.main === module) runtimeConfig.assertProductionConfig();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const { v4: uuid } = require('uuid');
const XLSX = require('xlsx');
const AdmZip = require('adm-zip');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { db, init } = require('./database');
const pdfGen = require('./services/pdfGenerator');
const xlsxGen = require('./services/xlsxGenerator');
const zipGen = require('./services/zipGenerator');
const mp = require('./services/marketplace');
const trends = require('./services/trendScanner');
const notifier = require('./services/notifier');
const vetting = require('./services/vettingEngine');
const vettingLearner = require('./services/vettingLearner');
const pricingEngine = require('./services/pricingEngine');
const design = require('./services/themes');
const seo = require('./services/seoEngine');
const fileFactory = require('./services/fileFactory');
const { buildWebsiteHTML, getRecoveryPrompts } = fileFactory;
const ds = require('./services/designStudio');
const brand = require('./services/brandAssets');
const bundles = require('./services/bundleEngine');
const seasonal = require('./services/seasonalEngine');
const discovery = require('./services/discovery');
const automationCycle = require('./services/automationCycle');
const { draftProduct } = require('./services/productDraft');
const readiness = require('./services/readiness');
const axios = require('axios');


const app = express();
const PORT = process.env.PORT || 5000;
const GENERATED_DIR = runtimeConfig.resolvePersistentDir('generated');
const UPLOAD_DIR = runtimeConfig.resolvePersistentDir('uploads');
fs.mkdirSync(GENERATED_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const MAX_SPREADSHEET_PREVIEW_BYTES = 20 * 1024 * 1024;

// -- MIDDLEWARE --
// -- SECURITY HEADERS --
// CSP: script-src 'self' only — possible because no page ships inline
// handlers or inline scripts (all client logic is external ES modules).
// style-src keeps 'unsafe-inline' for the design tokens / generated layouts;
// img-src data: covers inline SVG favicons; frame-src 'self' covers product
// preview iframes; frame-ancestors 'none' blocks clickjacking — the preview
// route relaxes it to 'self' below (same-origin console embedding only).
// Etsy OAuth needs form POST + redirect, so form-action allows etsy.com.
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  // Brand logo is consumed cross-origin (fetch + File in third-party app
  // consoles); default CORP 'same-origin' breaks that cross-origin read.
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'"],
      "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
      "img-src": ["'self'", "data:"],
      "connect-src": ["'self'"],
      "frame-src": ["'self'"],
      "form-action": ["'self'", "https://www.etsy.com"],
      "frame-ancestors": ["'none'"],
      "upgrade-insecure-requests": []
    }
  }
}));

// -- RATE LIMITING --
// The authenticated console batches many API calls per view (12 views × 4-6
// endpoints), so the limit must sit above a full session sweep, not just a
// page load. Anonymous public traffic is still capped hard.
// Caps are env-tunable for load tests / large sessions (defaults unchanged).
const API_LIMIT_AUTHED = Number(process.env.API_RATE_LIMIT_AUTHED_MAX || 1200);
const API_LIMIT_ANON = Number(process.env.API_RATE_LIMIT_ANON_MAX || 200);
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // /api/health* and /api/auth/* never share this counter: a burst of anonymous
  // traffic must not 429 Railway's healthcheck or the login that recovers a
  // session (that was a full-lockout path).
  max: (req) => (auth.enabled() && auth.isValidToken(auth.tokenFrom(req)) ? API_LIMIT_AUTHED : API_LIMIT_ANON),
  skip: (req) => req.path.startsWith('/health') || req.path.startsWith('/auth'),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});

// Brute-force guard for the login endpoint alone: small window caps password
// guessing without ever locking the rest of the API. Successful logins don't
// count against the budget.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later.' }
});

if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) app.set('trust proxy', 1);

// -- CORS: same-origin by default; add extra origins via CORS_ORIGINS --
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true
}));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
// -- AUTH (optional single-admin dashboard protection) --
// Enabled only when ADMIN_PASSWORD is set. API is gated JSON; health + auth
// routes stay open so Railway's healthcheck and login keep working. Autonomous
// jobs run server-side (DB/services), so they are never blocked by login.
const auth = require('./services/auth');

// -- RATE LIMITING + AUTH GUARD --
// Registered BEFORE every route so no endpoint can bypass them. /api/auth/* and
// /api/health* stay open so login + Railway's healthcheck keep working.
app.use('/api', apiLimiter);
app.use('/api', (req, res, next) => {
  // /api/auth/* and /api/health* stay open (login + Railway healthcheck).
  // EVERYTHING else requires the admin session. This is a strict command
  // center / automation engine, NOT a customer-facing site: there is no public
  // storefront at all — sales happen on the marketplaces (Etsy/Gumroad).
  if (req.path.startsWith('/auth') || req.path.startsWith('/health')) return next();
  return auth.requireAuth({ json: true })(req, res, next);
});

// -- ADMIN PAGE GATE -- runs BEFORE static, so no console page can ever be
// fetched directly. Only /login (and /setup for first-run bootstrapping) stay
// open. There is NO public storefront (the store pages were removed entirely):
// this deployment is a strict command center; sales happen on the marketplaces
// (Etsy/Gumroad).
const ADMIN_PAGES = new Set(['/', '/index.html', '/setup', '/setup.html']);
app.use((req, res, next) => {
  if (!auth.enabled() || !ADMIN_PAGES.has(req.path)) return next();
  return auth.requireAuth()(req, res, next);
});

// The NicheGate brand logo is fetched from third-party app-approval consoles
// (e.g. Pinterest's Connect App form) as a file upload, so it must be
// anonymously readable WITH CORS headers — it must NOT fall through to the
// same-origin-only client/ static mount below.
app.get('/nichegate-logo.png', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  // helmet sets CORP: same-origin by default, which makes cross-origin <img>
  // and fetch() consumers fail even with ACAO '*'.
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  res.set('Cache-Control', 'public, max-age=86400');
  res.type('image/png');
  res.sendFile(path.join(__dirname, '..', 'client', 'nichegate-logo.png'));
});

// Asset mounts are console-only: deliverables, uploads and cover art are
// internal files, not a public CDN. requireAuth passes through when auth is
// disabled (dev/tests); console browsers send the session cookie with these.
app.use('/generated', auth.requireAuth({ json: true }), express.static(GENERATED_DIR));
app.use('/uploads', auth.requireAuth({ json: true }), express.static(UPLOAD_DIR));
// covers/ holds brand + product cover art; read-only and cache-friendly.
app.use('/covers', auth.requireAuth({ json: true }), express.static(path.join(__dirname, '..', 'covers'), { maxAge: '1d' }));
app.use(express.static(path.join(__dirname, '..', 'client'), { extensions: ['html'] }));

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  try { await auth.login(req, res); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/auth/logout', (req, res) => auth.logout(req, res));

// -- MODEL / AI LAYER STATUS (diagnostic; never exposes the key) --
app.get('/api/model/status', (req, res) => {
  try {
    const router = require('./services/modelRouter');
    const cfg = require('./services/modelConfig');
    const key = String(process.env.OPENROUTER_API_KEY || '');
    const trimmed = key.trim();
    const afterPrefix = trimmed.replace(/^sk-or-v1-/, '');
    res.json({
      ok: true,
      enabled: !!cfg.enabled,
      modelEnabledEnv: String(process.env.MODEL_ENABLED || '(not set)'),
      hasKey: !!key,
      keyShape: {
        length: trimmed.length,
        startsCorrectly: trimmed.startsWith('sk-or-v1-'),
        expectedLength: 73,
        hexAfterPrefix: afterPrefix.length,
        expectedHexAfterPrefix: 64,
        allHex: /^[0-9a-f]+$/i.test(afterPrefix),
        hasWhitespace: /\s/.test(key),
        hasLabelPrefix: !trimmed.startsWith('sk-or-v1-') && trimmed.includes('sk-or-v1-'),
        wellFormed: trimmed.startsWith('sk-or-v1-') && afterPrefix.length === 64 && /^[0-9a-f]+$/i.test(afterPrefix) && !/\s/.test(key)
      },
      models: {
        scan: cfg.openrouter && cfg.openrouter.defaultModel,
        judge: cfg.openrouter && cfg.openrouter.judgeModel,
        ideation: cfg.openrouter && cfg.openrouter.ideationModel
      },
      callsThisCycle: typeof router.callsUsed === 'function' ? router.callsUsed() : null,
      diagnosis: (!cfg.enabled && !key) ? 'MISSING KEY - set OPENROUTER_API_KEY'
        : (!cfg.enabled && key) ? 'MODEL_ENABLED is not "true" - set MODEL_ENABLED=true'
        : (cfg.enabled && !key) ? 'MODEL_ENABLED=true but no key present'
        : 'AI layer enabled'
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/auth/status', (req, res) => {
  res.json({ enabled: auth.enabled(), authed: auth.isValidToken(auth.tokenFrom(req)) });
});
// -- HEALTH ENDPOINT (Railway healthcheck + monitoring) --
app.get('/api/health', (req, res) => {
  const dbOk = db.prepare('SELECT 1').get();
  res.json({
    ok: !!dbOk,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
    products: db.prepare('SELECT COUNT(*) as c FROM products').get().c,
    professions: db.prepare('SELECT COUNT(*) as c FROM professions').get().c
  });
});

  // ═══════════════════════════════════════════════════════════════════════════
  // REVENUE DASHBOARD — aggregated sales data
  // ═══════════════════════════════════════════════════════════════════════════
app.get('/api/revenue/summary', (req, res) => {
    try {
      const products = db.prepare('SELECT p.type, p.price, p.status, pr.name AS prof_name FROM products p LEFT JOIN professions pr ON p.profession_id = pr.id').all();
      const total = products.length;
      const listed = products.filter(p => p.status === 'listed').length;
      const draft = products.filter(p => p.status === 'draft').length;
      const review = products.filter(p => p.status === 'pending-review' || p.status === 'reviewing').length;
      const approved = products.filter(p => p.status === 'approved').length;
      
      // Revenue by type
      const byType = {};
      products.forEach(p => {
        const t = p.type || 'unknown';
        if (!byType[t]) byType[t] = { count: 0, listed: 0, revenue: 0 };
        byType[t].count++;
        if (p.status === 'listed') {
          byType[t].listed++;
          byType[t].revenue += parseFloat(String(p.price || '0').replace(/[^0-9.]/g, '')) || 0;
        }
      });
      
      // Revenue by niche (top 10)
      const byNiche = {};
      products.forEach(p => {
        const n = p.prof_name || 'Unknown';
        if (!byNiche[n]) byNiche[n] = { count: 0, listed: 0, revenue: 0 };
        byNiche[n].count++;
        if (p.status === 'listed') {
          byNiche[n].listed++;
          byNiche[n].revenue += parseFloat(String(p.price || '0').replace(/[^0-9.]/g, '')) || 0;
        }
      });
      const topNiches = Object.entries(byNiche)
        .sort((a, b) => b[1].listed - a[1].listed)
        .slice(0, 10)
        .map(([name, data]) => ({ name, ...data }));
      
      // Revenue by type (top 10)
      const topTypes = Object.entries(byType)
        .sort((a, b) => b[1].listed - a[1].listed)
        .slice(0, 10)
        .map(([type, data]) => ({ type, ...data }));
      
      // Product type distribution for catalog
      const types = [...new Set(products.map(p => p.type))];
      
      res.json({
        total, listed, draft, review, approved,
        estimatedRevenue: products.filter(p => p.status === 'listed')
          .reduce((sum, p) => sum + (parseFloat(String(p.price || '0').replace(/[^0-9.]/g, '')) || 0), 0),
        topNiches,
        topTypes,
        types,
        productTypes: byType
      });
    } catch (e) {
      console.error('[REVENUE]', e.message);
      res.json({ total: 0, listed: 0, draft: 0, review: 0, approved: 0, estimatedRevenue: 0, topNiches: [], topTypes: [], types: [], productTypes: {} });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ETSY DAILY CAP — prevent account suspension
  // ═══════════════════════════════════════════════════════════════════════════
app.get('/api/etsy/cap', (req, res) => {
    try {
      const cap = db.prepare("SELECT value FROM settings WHERE key = 'etsy_daily_cap'").get();
      const published = db.prepare("SELECT value FROM settings WHERE key = 'etsy_published_today'").get();
      const lastReset = db.prepare("SELECT value FROM settings WHERE key = 'etsy_cap_last_reset'").get();
      const capNum = cap ? parseInt(cap.value) || 20 : 20; // default 20/day
      const pubNum = published ? parseInt(published.value) || 0 : 0;
      
      // Auto-reset if new day
      const today = new Date().toISOString().slice(0, 10);
      if (!lastReset || lastReset.value !== today) {
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('etsy_published_today', '0')").run();
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('etsy_cap_last_reset', ?)").run(today);
      }
      
      res.json({
        cap: capNum,
        published: pubNum,
        remaining: Math.max(0, capNum - pubNum),
        lastReset: today,
        canPublish: pubNum < capNum
      });
    } catch (e) {
      res.json({ cap: 20, published: 0, remaining: 20, canPublish: true });
    }
  });

app.post('/api/etsy/cap', (req, res) => {
    try {
      // Explicit cap required — an empty body is a 400, not a silent default.
      const capIn = parseInt(req.body && req.body.cap);
      if (!Number.isFinite(capIn)) return res.status(400).json({ error: 'cap (1-50) required' });
      const cap = Math.min(50, Math.max(1, capIn)); // clamp 1-50
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('etsy_daily_cap', ?)").run(String(cap));
      res.json({ ok: true, cap });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

// Combined daily publish caps — Gumroad 10/day (their hard creation limit) and
// Etsy 20/day (account safety), both editable. Copy edits from the optimizer
// are updates, not creates, so they never consume these caps.
app.get('/api/caps', (req, res) => {
    try {
      const cap = db.prepare("SELECT value FROM settings WHERE key = 'etsy_daily_cap'").get();
      const published = db.prepare("SELECT value FROM settings WHERE key = 'etsy_published_today'").get();
      const capNum = cap ? parseInt(cap.value) || 20 : 20;
      const pubNum = published ? parseInt(published.value) || 0 : 0;
      res.json({
        etsy: { cap: capNum, published: pubNum, remaining: Math.max(0, capNum - pubNum) },
        gumroad: mp.getGumroadQuota()
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

app.post('/api/caps', (req, res) => {
    try {
      const etsyIn = parseInt(req.body && req.body.etsy);
      const gumroadIn = parseInt(req.body && req.body.gumroad);
      if (!Number.isFinite(etsyIn) && !Number.isFinite(gumroadIn)) {
        return res.status(400).json({ error: 'etsy and/or gumroad cap required' });
      }
      const etsy = Math.min(50, Math.max(1, Number.isFinite(etsyIn) ? etsyIn : 20));
      const gumroad = Math.min(50, Math.max(1, Number.isFinite(gumroadIn) ? gumroadIn : 10));
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('etsy_daily_cap', ?)").run(String(etsy));
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('gumroad_daily_cap', ?)").run(String(gumroad));
      // Clear a stale "exhausted" latch so a raised cap applies immediately.
      db.prepare("DELETE FROM settings WHERE key = 'gumroad_quota_exhausted_day'").run();
      res.json({ ok: true, etsy, gumroad });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PASSION NICHES — custom niche management
  // ═══════════════════════════════════════════════════════════════════════════
app.get('/api/niches/passion', (req, res) => {
    try {
      const niches = db.prepare("SELECT value FROM settings WHERE key = 'passion_niches'").get();
      const list = niches ? JSON.parse(niches.value || '[]') : [];
      res.json({ niches: list });
    } catch (e) {
      res.json({ niches: [] });
    }
  });

app.post('/api/niches/passion', (req, res) => {
    try {
      const { action, niche } = req.body;
      const current = db.prepare("SELECT value FROM settings WHERE key = 'passion_niches'").get();
      let list = current ? JSON.parse(current.value || '[]') : [];
      
      if (action === 'add' && niche && !list.includes(niche)) {
        list.push(niche);
      } else if (action === 'remove') {
        list = list.filter(n => n !== niche);
      } else if (action === 'set') {
        list = req.body.niches || [];
      }
      
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('passion_niches', ?)").run(JSON.stringify(list));
      res.json({ ok: true, niches: list });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // DIRECT ETSY PUSH — publish a single product directly to Etsy
  // ═══════════════════════════════════════════════════════════════════════════
app.post('/api/etsy/push/:id', async (req, res) => {
    try {
      // Check daily cap
      const cap = db.prepare("SELECT value FROM settings WHERE key = 'etsy_daily_cap'").get();
      const published = db.prepare("SELECT value FROM settings WHERE key = 'etsy_published_today'").get();
      const capNum = cap ? parseInt(cap.value) || 20 : 20; // default 20/day
      const pubNum = published ? parseInt(published.value) || 0 : 0;
      
      if (pubNum >= capNum) {
        return res.status(429).json({ error: 'Daily Etsy limit reached (' + pubNum + '/' + capNum + '). Resets tomorrow.' });
      }
      
      // Get the product
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
      if (!product) return res.status(404).json({ error: 'Product not found' });
      
      // Publish to Etsy
      const marketplace = require('./services/marketplace');
      const result = await marketplace.publishToEtsy(product);
      
      if (result && result.listing_id) {
        db.prepare("UPDATE products SET status = 'listed' WHERE id = ?").run(product.id);
        db.prepare("UPDATE settings SET value = ? WHERE key = 'etsy_published_today'").run(String(pubNum + 1));
      require('./services/pinEngine').pinNewProductAsync(product.id);
        res.json({ ok: true, listing_id: result.listing_id, remaining: capNum - pubNum - 1 });
      } else {
        res.status(500).json({ error: 'Failed to publish to Etsy', details: result });
      }
    } catch (e) {
      console.error('[ETSY PUSH]', e.message);
      res.status(500).json({ error: e.message });
    }
  });

app.post('/api/etsy/push-batch', async (req, res) => {
    try {
      const { ids } = req.body; // array of product IDs
      if (!ids || !ids.length) return res.status(400).json({ error: 'No product IDs provided' });
      
      const cap = db.prepare("SELECT value FROM settings WHERE key = 'etsy_daily_cap'").get();
      const published = db.prepare("SELECT value FROM settings WHERE key = 'etsy_published_today'").get();
      const capNum = cap ? parseInt(cap.value) || 20 : 20; // default 20/day
      let pubNum = published ? parseInt(published.value) || 0 : 0;
      
      const marketplace = require('./services/marketplace');
      const results = [];
      
      for (const id of ids) {
        if (pubNum >= capNum) {
          results.push({ id, status: 'skipped', reason: 'Daily cap reached' });
          continue;
        }
        
        const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
        if (!product) {
          results.push({ id, status: 'error', reason: 'Not found' });
          continue;
        }
        
        try {
          const result = await marketplace.publishToEtsy(product);
          if (result && result.listing_id) {
            db.prepare("UPDATE products SET status = 'listed' WHERE id = ?").run(id);
            pubNum++;
            results.push({ id, status: 'published', listing_id: result.listing_id });
          } else {
            results.push({ id, status: 'error', reason: 'Publish failed' });
          }
        } catch (e) {
          results.push({ id, status: 'error', reason: e.message });
        }
      }
      
      // Update cap counter
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('etsy_published_today', ?)").run(String(pubNum));
      
      res.json({
        ok: true,
        published: results.filter(r => r.status === 'published').length,
        errors: results.filter(r => r.status === 'error').length,
        remaining: Math.max(0, capNum - pubNum),
        results
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SOCIAL POST GENERATOR — one-click social content
  // ═══════════════════════════════════════════════════════════════════════════


  // ═══════════════════════════════════════════════════════════════════════════
  // SOCIAL SCHEDULER — schedule posts for specific times
  // ═══════════════════════════════════════════════════════════════════════════
app.get('/api/social/calendar', (req, res) => {
    try {
      const scheduled = db.prepare("SELECT value FROM settings WHERE key = 'social_scheduled'").get();
      const posts = scheduled ? JSON.parse(scheduled.value || '[]') : [];
      // Filter to upcoming posts only
      const now = Date.now();
      const upcoming = posts.filter(p => p.scheduledAt && new Date(p.scheduledAt).getTime() > now);
      res.json({ posts: upcoming, total: posts.length });
    } catch (e) {
      res.json({ posts: [], total: 0 });
    }
  });

app.post('/api/social/schedule', (req, res) => {
    try {
      const { productId, platform, content, scheduledAt } = req.body || {};
      if (!productId || !platform) return res.status(400).json({ error: 'productId and platform are required' });
      const scheduled = db.prepare("SELECT value FROM settings WHERE key = 'social_scheduled'").get();
      const posts = scheduled ? JSON.parse(scheduled.value || '[]') : [];
      
      posts.push({
        id: Date.now(),
        productId,
        platform,
        content,
        scheduledAt: scheduledAt || new Date().toISOString(),
        status: 'scheduled',
        createdAt: new Date().toISOString()
      });
      
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('social_scheduled', ?)").run(JSON.stringify(posts));
      res.json({ ok: true, id: posts[posts.length - 1].id });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

app.post('/api/social/cancel', (req, res) => {
    try {
      const { id } = req.body;
      const scheduled = db.prepare("SELECT value FROM settings WHERE key = 'social_scheduled'").get();
      let posts = scheduled ? JSON.parse(scheduled.value || '[]') : [];
      posts = posts.filter(p => p.id !== id);
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('social_scheduled', ?)").run(JSON.stringify(posts));
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

app.post('/api/social/post-now', async (req, res) => {
    try {
      // node:sqlite cannot bind undefined — reject malformed bodies with 400
      // instead of a 500 "Provided value cannot be bound" crash.
      const productId = parseInt(req.body && req.body.productId);
      const platform = req.body && req.body.platform;
      if (!productId) return res.status(400).json({ error: 'productId required' });
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
      if (!product) return res.status(404).json({ error: 'Product not found' });
      
      // Generate content
      const conceptEngine = require('./services/conceptEngine');
      const niche = product.prof_name || 'Small Business';
      const prompt = 'Generate a ' + platform + ' post for "' + (product.name || 'Product') + '" in the ' + niche + ' niche.';
      const content = await conceptEngine.generateSocialPost(prompt, niche);
      
      // Log it as posted
      const scheduled = db.prepare("SELECT value FROM settings WHERE key = 'social_scheduled'").get();
      const posts = scheduled ? JSON.parse(scheduled.value || '[]') : [];
      posts.push({
        id: Date.now(),
        productId,
        platform,
        content,
        scheduledAt: new Date().toISOString(),
        status: 'posted',
        postedAt: new Date().toISOString()
      });
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('social_scheduled', ?)").run(JSON.stringify(posts));
      
      res.json({ ok: true, content, platform });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // AD SPEND DASHBOARD — budget tracking
  // ═══════════════════════════════════════════════════════════════════════════
app.get('/api/ads/summary', (req, res) => {
    try {
      const budget = db.prepare("SELECT value FROM settings WHERE key = 'ad_monthly_budget'").get();
      const spend = db.prepare("SELECT value FROM settings WHERE key = 'ad_spend_this_month'").get();
      const runs = db.prepare("SELECT value FROM settings WHERE key = 'ad_runs'").get();
      
      const now = new Date();
      const monthKey = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
      
      // Auto-reset monthly spend
      const lastReset = db.prepare("SELECT value FROM settings WHERE key = 'ad_spend_month_key'").get();
      let spendNum = spend ? parseFloat(spend.value) || 0 : 0;
      if (!lastReset || lastReset.value !== monthKey) {
        spendNum = 0;
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('ad_spend_this_month', '0')").run();
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('ad_spend_month_key', ?)").run(monthKey);
      }
      
      const budgetNum = budget ? parseFloat(budget.value) || 0 : 0;
      const runsList = runs ? JSON.parse(runs.value || '[]') : [];
      const activeRuns = runsList.filter(r => r.status === 'active');
      
      res.json({
        budget: budgetNum,
        spent: spendNum,
        remaining: Math.max(0, budgetNum - spendNum),
        percentUsed: budgetNum > 0 ? Math.round((spendNum / budgetNum) * 100) : 0,
        activeRuns: activeRuns.length,
        recentRuns: runsList.slice(-10).reverse()
      });
    } catch (e) {
      res.json({ budget: 0, spent: 0, remaining: 0, percentUsed: 0, activeRuns: 0, recentRuns: [] });
    }
  });

app.get('/api/ads/attribution', (req, res) => {
    try {
      const adAttribution = require('./services/adAttributionEngine');
      res.json(adAttribution.runAttributionSweep());
    } catch (e) {
      console.error('[ERROR] GET /api/ads/attribution -> 500:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

app.post('/api/ads/attribution/record', (req, res) => {
    try {
      const adAttribution = require('./services/adAttributionEngine');
      const { campaignId, channel, productId, spendDelta, clicksDelta, impressionsDelta, salesDelta, revenueDelta } = req.body || {};
      if (!campaignId) return res.status(400).json({ error: 'campaignId is required' });
      const record = adAttribution.recordCampaignMetrics({
        campaignId,
        channel,
        productId,
        spendDelta: parseFloat(spendDelta) || 0,
        clicksDelta: parseInt(clicksDelta) || 0,
        impressionsDelta: parseInt(impressionsDelta) || 0,
        salesDelta: parseInt(salesDelta) || 0,
        revenueDelta: parseFloat(revenueDelta) || 0
      });
      res.json(record);
    } catch (e) {
      console.error('[ERROR] POST /api/ads/attribution/record -> 500:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

app.post('/api/ads/budget', (req, res) => {
    try {
      const { budget } = req.body;
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('ad_monthly_budget', ?)").run(String(budget || 0));
      res.json({ ok: true, budget: budget || 0 });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

app.post('/api/ads/commit', (req, res) => {
    try {
      const { platform, amount, name } = req.body;
      const spend = db.prepare("SELECT value FROM settings WHERE key = 'ad_spend_this_month'").get();
      const spendNum = spend ? parseFloat(spend.value) || 0 : 0;
      const budget = db.prepare("SELECT value FROM settings WHERE key = 'ad_monthly_budget'").get();
      const budgetNum = budget ? parseFloat(budget.value) || 0 : 0;
      
      if (spendNum + (amount || 0) > budgetNum) {
        return res.status(429).json({ error: 'This would exceed your monthly budget. Current: $' + spendNum + ' of $' + budgetNum });
      }
      
      const runs = db.prepare("SELECT value FROM settings WHERE key = 'ad_runs'").get();
      const runsList = runs ? JSON.parse(runs.value || '[]') : [];
      
      const run = {
        id: Date.now(),
        platform: platform || 'unknown',
        name: name || 'Untitled Campaign',
        amount: amount || 0,
        status: 'active',
        committedAt: new Date().toISOString()
      };
      
      runsList.push(run);
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('ad_runs', ?)").run(JSON.stringify(runsList));
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('ad_spend_this_month', ?)").run(String(spendNum + (amount || 0)));
      
      res.json({ ok: true, run, remaining: budgetNum - spendNum - (amount || 0) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

app.post('/api/ads/cancel', (req, res) => {
    try {
      const { id } = req.body;
      const runs = db.prepare("SELECT value FROM settings WHERE key = 'ad_runs'").get();
      let runsList = runs ? JSON.parse(runs.value || '[]') : [];
      const run = runsList.find(r => r.id === id);
      if (run && run.status === 'active') {
        run.status = 'cancelled';
        run.cancelledAt = new Date().toISOString();
        // Refund the spend
        const spend = db.prepare("SELECT value FROM settings WHERE key = 'ad_spend_this_month'").get();
        const spendNum = spend ? parseFloat(spend.value) || 0 : 0;
        db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('ad_spend_this_month', ?)").run(String(Math.max(0, spendNum - run.amount)));
      }
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('ad_runs', ?)").run(JSON.stringify(runsList));
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TREND → PRODUCT PIPELINE
  // ═══════════════════════════════════════════════════════════════════════════
app.post('/api/trends/:id/generate', async (req, res) => {
    try {
      const trend = db.prepare('SELECT * FROM trends WHERE id = ?').get(req.params.id);
      if (!trend) return res.status(404).json({ error: 'Trend not found' });
      
      // Optional details/prompts from the Generate dialog: stored on each
      // draft (products.brief) and honored by the concept engine when the
      // model layer is on.
      const brief = String((req.body && req.body.brief) || '').trim().slice(0, 2000);
      const count = Math.min(6, Math.max(1, parseInt(req.body && req.body.count) || 3));
      const niche = trend.niche || trend.name;
      
      // Drafts land in the review queue like every other generated product.
      const result = await generateForNiche(niche, count, () => {}, { brief, origin: 'engine' });
      const generated = result.created || [];
      

      
      res.json({ ok: true, generated: generated.length, products: generated, brief: brief || null });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MAKE THIS — manual custom generation. Products land in the review queue
  // tagged origin='manual': the deploy policy keeps them local-only and the
  // auto-list cycle never publishes them — you push them live yourself.
  // ═══════════════════════════════════════════════════════════════════════════
app.post('/api/products/generate-custom', async (req, res) => {
    try {
      const idea = String(req.body.idea || '').trim().slice(0, 120);
      if (!idea) return res.status(400).json({ error: 'idea is required — describe what to make' });
      const brief = String(req.body.brief || '').trim().slice(0, 2000);
      const count = Math.min(6, Math.max(1, parseInt(req.body.count) || 1));
      const price = req.body.price ? '$' + (parseFloat(req.body.price) || 12) : undefined;
      const type = req.body.type ? String(req.body.type).toLowerCase().slice(0, 40) : undefined;
      if (type && !require('./services/pipelineSchemas').PRODUCT_TYPES.has(type)) {
        return res.status(400).json({ error: 'unsupported type: ' + type });
      }

      const result = await generateForNiche(idea, count, () => {}, {
        brief, origin: 'manual', price, type, name: idea
      });
      res.json({ ok: true, ...result, origin: 'manual' });
    } catch (e) {
      console.error('[ERROR] POST /api/products/generate-custom -> 500:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // LISTING OPTIMIZER — rewrite title/tags/description for weak listings.
  // Deploy rule: engine-generated + already listed → auto-deploy to the live
  // listing (edits don't consume creation caps); manual products stay local.
  // ═══════════════════════════════════════════════════════════════════════════
app.get('/api/products/:id/optimization', (req, res) => {
    try {
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
      if (!product) return res.status(404).json({ error: 'Product not found' });
      res.json(optimizer.preview(product));
    } catch (e) {
      console.error('[ERROR] GET /api/products/:id/optimization -> 500:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

app.get('/api/products/:id/quality', (req, res) => {
    try {
      const qe = require('./services/qualityEngine');
      const audit = qe.auditProductById(req.params.id);
      if (!audit) return res.status(404).json({ error: 'Product not found' });
      res.json(audit);
    } catch (e) {
      console.error('[ERROR] GET /api/products/:id/quality -> 500:', e.message);
      res.status(500).json({ error: e.message });
    }
  });app.get('/api/quality/catalog', (req, res) => {
  try {
    const qe = require('./services/qualityEngine');
    const status = req.query.status || 'draft';
    const limit = parseInt(req.query.limit) || 50;
    res.json(qe.auditCatalog(status, limit));
  } catch (e) {
    console.error('[ERROR] GET /api/quality/catalog -> 500:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── DESIGN QUALITY (render→critique→revise · art direction · reskin) ──────
app.get('/api/products/:id/design-score', (req, res) => {
  try {
    const critic = require('./services/designCritic');
    res.json({
      productId: Number(req.params.id),
      latest: critic.latestScore(req.params.id),
      history: critic.scoreHistory(req.params.id)
    });
  } catch (e) {
    console.error('[ERROR] GET /api/products/:id/design-score -> 500:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/products/:id/design-critique', async (req, res) => {
  try {
    const critic = require('./services/designCritic');
    const result = await critic.critiqueProduct(req.params.id, {
      force: !!(req.body && req.body.force),
      revise: !(req.body && req.body.revise === false)
    });
    if (!result) return res.status(500).json({ error: 'Critique failed (see server log)' });
    res.json(result);
  } catch (e) {
    console.error('[ERROR] POST /api/products/:id/design-critique -> 500:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/products/:id/reskin', async (req, res) => {
  try {
    const critic = require('./services/designCritic');
    const result = await critic.reskinProduct(req.params.id, {
      critique: req.body && req.body.critique ? String(req.body.critique).slice(0, 500) : null,
      layout: req.body && req.body.layout ? String(req.body.layout).slice(0, 20) : null
    });
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (e) {
    console.error('[ERROR] POST /api/products/:id/reskin -> 500:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/design/scores', (req, res) => {
  try {
    const critic = require('./services/designCritic');
    res.json(critic.scoreSummary({ since: req.query.since || critic.FOCUS_SINCE }));
  } catch (e) {
    console.error('[ERROR] GET /api/design/scores -> 500:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/design/references', (req, res) => {
  try {
    const swipe = require('./services/swipeFileEngine');
    res.json({ references: swipe.listDesignReferences(parseInt(req.query.limit) || 50) });
  } catch (e) {
    console.error('[ERROR] GET /api/design/references -> 500:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/catalog/recovery-status', (req, res) => {
    try {
      const recovery = require('./services/catalogRecovery');
      const snapshot = recovery.getActiveSnapshot();
      res.json({ active: !!snapshot, snapshot });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

app.post('/api/catalog/wipe', async (req, res) => {
    try {
      const recovery = require('./services/catalogRecovery');
      const windowMin = parseInt(req.body && req.body.restoreWindowMinutes) || 30;
      const result = recovery.wipeCatalog({ restoreWindowMinutes: windowMin });
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

app.post('/api/catalog/restore', async (req, res) => {
    try {
      const recovery = require('./services/catalogRecovery');
      const snapshotId = req.body && req.body.snapshotId ? parseInt(req.body.snapshotId) : null;
      const result = recovery.restoreCatalog(snapshotId);
      if (!result.ok) return res.status(400).json(result);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

app.post('/api/products/:id/optimization/apply', async (req, res) => {
    try {
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
      if (!product) return res.status(404).json({ error: 'Product not found' });
      res.json(await optimizer.apply(product, { deploy: !(req.body && req.body.deploy === false) }));
    } catch (e) {
      console.error('[ERROR] POST /api/products/:id/optimization/apply -> 500:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

app.post('/api/products/:id/optimization/rollback', async (req, res) => {
    try {
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
      if (!product) return res.status(404).json({ error: 'Product not found' });
      res.json(await optimizer.rollback(product, { deploy: !(req.body && req.body.deploy === false) }));
    } catch (e) {
      console.error('[ERROR] POST /api/products/:id/optimization/rollback -> 500:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

app.post('/api/optimize/weak', async (req, res) => {
    try {
      const limit = Math.min(50, Math.max(1, parseInt(req.body && req.body.limit) || 20));
      res.json(await optimizer.optimizeWeak(limit));
    } catch (e) {
      console.error('[ERROR] POST /api/optimize/weak -> 500:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ═════════════════════════════════════════════════════════════════════════
  // PHASE 6 — PRICING ENGINE (launch rule · A/B tiers · elasticity)
  // ═════════════════════════════════════════════════════════════════════════
app.get('/api/pricing/tests', (req, res) => {
    try { res.json(pricingEngine.pricingSummary()); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

app.post('/api/pricing/tests/start', async (req, res) => {
    try {
      const productId = parseInt(req.body && req.body.productId);
      if (!productId) return res.status(400).json({ error: 'productId required' });
      res.json(pricingEngine.startPriceTest(productId, req.body.basePrice));
    } catch (e) {
      console.error('[ERROR] POST /api/pricing/tests/start -> 500:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

app.post('/api/pricing/tests/:productId/end', (req, res) => {
    try {
      res.json(pricingEngine.endPriceTest(parseInt(req.params.productId)));
    } catch (e) {
      // "No price test for product N" is a client error, not a 500.
      res.status(/No price test/.test(e.message) ? 404 : 500).json({ error: e.message });
    }
  });

app.post('/api/pricing/apply', async (req, res) => {
    try {
      const productId = parseInt(req.body && req.body.productId);
      const price = parseFloat(req.body && req.body.price);
      if (!productId || !Number.isFinite(price) || price < 1 || price > 999) {
        return res.status(400).json({ error: 'productId and price (1-999) required' });
      }
      const deploy = !req.body || req.body.deploy !== false;
      res.json(await pricingEngine.applyPrice(productId, price, { deploy, reason: req.body.reason || 'manual' }));
    } catch (e) {
      console.error('[ERROR] POST /api/pricing/apply -> 500:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

app.get('/api/pricing/launch/:productId', (req, res) => {
    try {
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(parseInt(req.params.productId));
      if (!product) return res.status(404).json({ error: 'Product not found' });
      res.json(pricingEngine.launchPrice(product));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Net Unit-Economics & P&L Analysis (Gross revenue, Etsy/Gumroad fees, AI token costs, Net Profit & Margin)
app.get('/api/pricing/pnl', (req, res) => {
    try {
      res.json({ ok: true, pnl: biService.calculateNetUnitEconomics() });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ═════════════════════════════════════════════════════════════════════════
  // PHASE 6 — SELF-IMPROVING VETTING (learned weights from real outcomes)
  // ═════════════════════════════════════════════════════════════════════════
app.get('/api/vetting/weights', (req, res) => {
    try {
      res.json({
        weights: vettingLearner.getWeights(),
        outcomes: vettingLearner.outcomeSummary({ windowDays: parseInt(req.query.windowDays) || 90 })
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

app.post('/api/vetting/refit', (req, res) => {
    try {
      const windowDays = Math.min(365, Math.max(14, parseInt(req.body && req.body.windowDays) || 90));
      const result = vettingLearner.fitWeights({ windowDays });
      if (!result.fitted) return res.status(422).json(result);
      res.json(result);
    } catch (e) {
      console.error('[ERROR] POST /api/vetting/refit -> 500:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

app.post('/api/vetting/weights/reset', (req, res) => {
    try {
      vettingLearner.resetWeights();
      res.json({ ok: true, weights: vettingLearner.getWeights() });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Gap scoring visibility: incumbent weakness for a niche name.
app.get('/api/vetting/gap', (req, res) => {
    try {
      const name = String(req.query.name || '').trim();
      if (!name) return res.status(400).json({ error: 'name query param required' });
      res.json({ name, gap: vetting.incumbentQuality(name) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ═════════════════════════════════════════════════════════════════════════
  // PHASE 6 — VIDEO HOOK SCRIPTS (3× 15-30s TikTok/Reels per product)
  // ═════════════════════════════════════════════════════════════════════════
app.post('/api/products/:id/video-scripts', async (req, res) => {
    try {
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(parseInt(req.params.id));
      if (!product) return res.status(404).json({ error: 'Product not found' });
      const prof = db.prepare('SELECT name FROM professions WHERE id = ?').get(product.profession_id);
      const conceptEngine = require('./services/conceptEngine');
      const scripts = await conceptEngine.generateVideoScripts(product, { niche: (req.body && req.body.niche) || (prof && prof.name) });
      res.json({ productId: product.id, niche: (prof && prof.name) || null, scripts });
    } catch (e) {
      console.error('[ERROR] POST /api/products/:id/video-scripts -> 500:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════════
  // PHASE 5 — DISTRIBUTION LAYER (Pin Engine · Sequences · Swipe File)
  // ═══════════════════════════════════════════════════════════════
  // PIN ENGINE — Tailwind-lite queue + attribution.
app.post('/api/pins/create', async (req, res) => {
    try {
      const pinEngine = require('./services/pinEngine');
      res.json(await pinEngine.createPin({
        productId: req.body.productId || null,
        boardHint: req.body.boardHint || 'general',
        when: req.body.when || null
      }));
    } catch (e) {
      console.error('[ERROR] POST /api/pins/create -> 500:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

app.post('/api/pins/schedule-batch', (req, res) => {
    try {
      const pinEngine = require('./services/pinEngine');
      const limit = Math.min(50, Math.max(1, parseInt(req.body && req.body.limit) || 20));
      res.json(pinEngine.scheduleForProducts(limit));
    } catch (e) {
      console.error('[ERROR] POST /api/pins/schedule-batch -> 500:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

app.get('/api/pins', (req, res) => {
    try {
      const pinEngine = require('./services/pinEngine');
      const rows = db.prepare('SELECT * FROM pins ORDER BY scheduled_for ASC LIMIT 100').all();
      res.json({ ok: true, pins: rows, report: pinEngine.attributionReport() });
    } catch (e) {
      console.error('[ERROR] GET /api/pins -> 500:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

app.post('/api/pins/drain', (req, res) => {
    try {
      const pinEngine = require('./services/pinEngine');
      res.json({ ok: true, due: pinEngine.duePins(10) });
    } catch (e) {
      console.error('[ERROR] POST /api/pins/drain -> 500:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // SEQUENCES — Kit-lite generation + ESP handoff (never sends itself).
app.post('/api/sequences/generate', async (req, res) => {
    try {
      const seqEngine = require('./services/sequenceEngine');
      res.json(await seqEngine.generateSequence({
        professionId: req.body.professionId ? parseInt(req.body.professionId) : null,
        trendKey: req.body.trendKey ? String(req.body.trendKey).slice(0, 80) : null,
        purpose: ['welcome', 'launch', 'followup'].includes(req.body.purpose) ? req.body.purpose : 'launch'
      }));
    } catch (e) {
      console.error('[ERROR] POST /api/sequences/generate -> 500:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

app.get('/api/sequences', (req, res) => {
    try {
      const seqEngine = require('./services/sequenceEngine');
      res.json({ ok: true, sequences: seqEngine.listSequences(50) });
    } catch (e) {
      console.error('[ERROR] GET /api/sequences -> 500:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

app.get('/api/sequences/:id', (req, res) => {
    try {
      const seqEngine = require('./services/sequenceEngine');
      const seq = seqEngine.getSequence(req.params.id);
      if (!seq) return res.status(404).json({ error: 'Sequence not found' });
      res.json({ ok: true, sequence: seq });
    } catch (e) {
      console.error('[ERROR] GET /api/sequences/:id -> 500:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

app.post('/api/sequences/:id/export', async (req, res) => {
    try {
      const seqEngine = require('./services/sequenceEngine');
      res.json(await seqEngine.exportSequence(req.params.id));
    } catch (e) {
      // "Sequence not found" is a 404, not a 500.
      const code = /Sequence not found/.test(e.message) ? 404 : 500;
      console.error('[ERROR] POST /api/sequences/:id/export -> ' + code + ':', e.message);
      res.status(code).json({ error: e.message });
    }
  });

  // SWIPE FILE — Foreplay-lite ad intelligence.
app.post('/api/swipe/sweep', async (req, res) => {
    try {
      const swipe = require('./services/swipeFileEngine');
      const q = String(req.body.query || '').trim().slice(0, 60);
      if (!q) return res.status(400).json({ error: 'query required' });
      const limit = Math.min(20, Math.max(1, parseInt(req.body.limit) || 10));
      res.json(await swipe.sweepNiche(q, { limit }));
    } catch (e) {
      console.error('[ERROR] POST /api/swipe/sweep -> 500:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

app.get('/api/swipe/long-runners', (req, res) => {
    try {
      const swipe = require('./services/swipeFileEngine');
      const minDays = Math.min(90, Math.max(0, parseInt(req.query.minDays) || 14));
      const nicheKey = req.query.q ? String(req.query.q) : null;
      res.json({ ok: true, longRunners: swipe.longRunners({ minDays, nicheKey, limit: 25 }) });
    } catch (e) {
      console.error('[ERROR] GET /api/swipe/long-runners -> 500:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

app.post('/api/swipe/hooks/:productId', async (req, res) => {
    try {
      const swipe = require('./services/swipeFileEngine');
      res.json(await swipe.generateHooks(parseInt(req.params.productId)));
    } catch (e) {
      console.error('[ERROR] POST /api/swipe/hooks/:productId -> 500:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

  // PRODUCT PREVIEW — serve PDF for inline preview
  // ═══════════════════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTENT CALENDAR — monthly view of all activity
  // ═══════════════════════════════════════════════════════════════════════════
app.get('/api/calendar', (req, res) => {
    try {
      const month = req.query.month || new Date().toISOString().slice(0, 7); // YYYY-MM
      const scheduled = db.prepare("SELECT value FROM settings WHERE key = 'social_scheduled'").get();
      const posts = scheduled ? JSON.parse(scheduled.value || '[]') : [];
      
      // Filter posts to this month
      const monthPosts = posts.filter(p => p.scheduledAt && p.scheduledAt.startsWith(month));
      
      // Get products listed this month
      const products = db.prepare("SELECT p.id, p.name, p.type, pr.name AS prof_name, p.status, p.created_at FROM products p LEFT JOIN professions pr ON p.profession_id = pr.id WHERE p.status = 'listed'").all();
      const monthProducts = products.filter(p => p.created_at && p.created_at.startsWith(month));
      
      // Get ad runs this month
      const runs = db.prepare("SELECT value FROM settings WHERE key = 'ad_runs'").get();
      const adRuns = runs ? JSON.parse(runs.value || '[]').filter(r => r.committedAt && r.committedAt.startsWith(month)) : [];
      
      // Build daily activity map
      const days = {};
      const daysInMonth = new Date(parseInt(month.slice(0,4)), parseInt(month.slice(5,7)), 0).getDate();
      for (let d = 1; d <= daysInMonth; d++) {
        const dayStr = month + '-' + String(d).padStart(2, '0');
        days[dayStr] = { posts: 0, products: 0, ads: 0 };
      }
      
      monthPosts.forEach(p => {
        const day = p.scheduledAt ? p.scheduledAt.slice(0, 10) : '';
        if (days[day]) days[day].posts++;
      });
      
      monthProducts.forEach(p => {
        const day = p.created_at ? p.created_at.slice(0, 10) : '';
        if (days[day]) days[day].products++;
      });
      
      adRuns.forEach(r => {
        const day = r.committedAt ? r.committedAt.slice(0, 10) : '';
        if (days[day]) days[day].ads++;
      });
      
      res.json({ month, days, posts: monthPosts.length, products: monthProducts.length, ads: adRuns.length });
    } catch (e) {
      res.json({ month: '', days: {}, posts: 0, products: 0, ads: 0 });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SALES ANALYTICS — revenue by niche, by type, conversion rates
  // ═══════════════════════════════════════════════════════════════════════════
app.get('/api/analytics/sales', (req, res) => {
    try {
      const products = db.prepare('SELECT * FROM products').all();
      const trends = db.prepare('SELECT * FROM trends').all();
      
      // Revenue by type
      const byType = {};
      products.forEach(p => {
        const t = p.type || 'unknown';
        if (!byType[t]) byType[t] = { total: 0, listed: 0, draft: 0, revenue: 0, avgPrice: 0 };
        byType[t].total++;
        if (p.status === 'listed') {
          byType[t].listed++;
          byType[t].revenue += parseFloat(String(p.price || '0').replace(/[^0-9.]/g, '')) || 0;
        } else if (p.status === 'draft') {
          byType[t].draft++;
        }
      });
      Object.keys(byType).forEach(k => {
        byType[k].avgPrice = byType[k].listed > 0 ? Math.round(byType[k].revenue / byType[k].listed) : 0;
      });
      
      // Revenue by niche (top 15)
      const byNiche = {};
      products.forEach(p => {
        const n = p.prof_name || 'Unknown';
        if (!byNiche[n]) byNiche[n] = { total: 0, listed: 0, revenue: 0 };
        byNiche[n].total++;
        if (p.status === 'listed') {
          byNiche[n].listed++;
          byNiche[n].revenue += parseFloat(String(p.price || '0').replace(/[^0-9.]/g, '')) || 0;
        }
      });
      const topNiches = Object.entries(byNiche)
        .sort((a, b) => b[1].listed - a[1].listed)
        .slice(0, 15)
        .map(([name, data]) => ({ name, ...data }));
      
      // Conversion funnel
      const statusCounts = {
        draft: products.filter(p => p.status === 'draft').length,
        review: products.filter(p => p.status === 'pending-review' || p.status === 'reviewing').length,
        approved: products.filter(p => p.status === 'approved').length,
        listed: products.filter(p => p.status === 'listed').length,
        rejected: products.filter(p => p.status === 'rejected').length,
        archived: products.filter(p => p.status === 'archived').length
      };
      
      // Trend performance
      const trendPerf = {
        total: trends.length,
        active: trends.filter(t => t.status === 'active' || t.status === 'approved').length,
        dismissed: trends.filter(t => t.status === 'dismissed').length
      };
      
      // Total metrics
      const totalRevenue = products.filter(p => p.status === 'listed')
        .reduce((sum, p) => sum + (parseFloat(String(p.price || '0').replace(/[^0-9.]/g, '')) || 0), 0);
      
      res.json({
        totalProducts: products.length,
        totalRevenue,
        byType,
        topNiches,
        conversion: statusCounts,
        trendPerformance: trendPerf,
        avgPrice: statusCounts.listed > 0 ? Math.round(totalRevenue / statusCounts.listed) : 0
      });
    } catch (e) {
      res.json({ totalProducts: 0, totalRevenue: 0, byType: {}, topNiches: [], conversion: {}, trendPerformance: {}, avgPrice: 0 });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BATCH SOCIAL — generate posts for all listed products
  // ═══════════════════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════════════════
  // EMAIL NEWSLETTER — auto-generate weekly digest
  // ═══════════════════════════════════════════════════════════════════════════
app.get('/api/newsletter/generate', async (req, res) => {
    try {
      const products = db.prepare("SELECT p.*, pr.name AS prof_name FROM products p LEFT JOIN professions pr ON p.profession_id = pr.id WHERE p.status = 'listed' ORDER BY p.id DESC LIMIT 5").all();
      const trends = db.prepare("SELECT * FROM trends WHERE activated = 1 ORDER BY activated_at DESC LIMIT 3").all();
      const stats = db.prepare("SELECT COUNT(*) as c FROM products WHERE status = 'listed'").get();
      
      const productList = products.map(function(p, i) {
        return (i + 1) + '. ' + (p.name || 'Product') + ' — ' + (p.prof_name || '') + ' · $' + (p.price || '0');
      }).join('\n');
      
      const trendList = trends.map(function(t) {
        return '• ' + (t.name || t.keyword || 'Trend');
      }).join('\n');
      
      const subject = 'New This Week: ' + products.length + ' Fresh ' + (products[0] ? products[0].prof_name : '') + ' Products';
      const body = 'Hey there!\n\nHere is what is new at NicheGate this week:\n\n📦 NEW PRODUCTS:\n' + productList
        + '\n\n📈 TRENDING NICHES:\n' + trendList
        + '\n\nWe now have ' + (stats ? stats.c : 0) + ' products live across all marketplaces.\n\nBrowse the full catalog: ' + (req.protocol || 'https') + '://' + (req.get('host') || 'localhost:5000') + '/store\n\nHappy creating!\nThe NicheGate Team';
      
      res.json({ ok: true, subject, body, productCount: products.length, trendCount: trends.length });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SMART QUICK ACTIONS — context-aware based on current state
  // ═══════════════════════════════════════════════════════════════════════════
app.get('/api/smart-actions', (req, res) => {
    try {
      const actions = [];
      const products = db.prepare('SELECT p.status, pr.name AS prof_name, p.type, p.price FROM products p LEFT JOIN professions pr ON p.profession_id = pr.id').all();
      const trends = db.prepare('SELECT activated, phase FROM trends').all();
      const settings = db.prepare("SELECT value FROM settings WHERE key = 'passion_niches'").get();
      const niches = settings ? JSON.parse(settings.value || '[]') : [];
      
      const review = products.filter(p => p.status === 'pending-review' || p.status === 'reviewing').length;
      const draft = products.filter(p => p.status === 'draft').length;
      const listed = products.filter(p => p.status === 'listed').length;
      const activeTrends = trends.filter(t => t.status === 'active').length;
      
      if (review > 0) actions.push({ icon: '✅', title: 'Approve ' + review + ' products', action: 'approve-all', color: 'var(--green)' });
      if (draft > 0) actions.push({ icon: '📦', title: 'Generate ' + draft + ' drafts', action: 'generate-drafts', color: 'var(--blue)' });
      if (listed > 0 && listed < 20) actions.push({ icon: '🚀', title: 'Publish ' + listed + ' to marketplaces', action: 'auto-list', color: 'var(--teal)' });
      if (activeTrends === 0) actions.push({ icon: '🔭', title: 'Run trend discovery', action: 'run-sweep', color: 'var(--amber)' });
      if (niches.length > 0) actions.push({ icon: '🎯', title: 'Generate for passion niches (' + niches.length + ')', action: 'passion-generate', color: 'var(--purple)' });
      if (listed > 5) actions.push({ icon: '📱', title: 'Batch social posts for ' + listed + ' products', action: 'batch-social', color: 'var(--pink)' });
      if (products.length > 0) actions.push({ icon: '✨', title: 'Rebuild all covers', action: 'rebuild-all', color: 'var(--blue)' });
      try {
        // Design Quality (Phase 4): sellers with weak design scores deserve a reskin.
        const weakSellers = require('./services/designCritic').autoReskinCandidates({ limit: 9 });
        if (weakSellers.length > 0) actions.push({ icon: '🎨', title: 'Reskin ' + weakSellers.length + ' weak-selling design' + (weakSellers.length > 1 ? 's' : ''), action: 'design-reskin', color: 'var(--purple)' });
      } catch { /* design layer is best-effort */ }
      
      res.json({ actions: actions.slice(0, 6) });
    } catch (e) {
      res.json({ actions: [] });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // STRIPE PREP — webhook + status (ready for Stripe key)
  // ═══════════════════════════════════════════════════════════════════════════
app.get('/api/payments/status', (req, res) => {
    try {
      const stripeKey = process.env.STRIPE_SECRET_KEY || '';
      const stripeWebhook = process.env.STRIPE_WEBHOOK_SECRET || '';
      res.json({
        configured: !!(stripeKey && stripeWebhook),
        stripeKey: stripeKey ? 'sk_...' + stripeKey.slice(-4) : 'not set',
        note: 'Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in .env to enable direct payments'
      });
    } catch (e) {
      res.json({ configured: false, note: 'Stripe not configured' });
    }
  });

app.post('/api/payments/checkout', async (req, res) => {
    try {
      const { productId } = req.body;
      const stripeKey = process.env.STRIPE_SECRET_KEY || '';
      if (!stripeKey) return res.status(400).json({ error: 'Stripe not configured. Add STRIPE_SECRET_KEY to .env' });
      
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
      if (!product) return res.status(404).json({ error: 'Product not found' });
      
      // Stripe checkout session creation (placeholder — requires stripe npm package)
      res.json({ 
        note: 'Stripe checkout requires the stripe npm package. Run: npm install stripe',
        product: product.name,
        price: product.price,
        status: 'ready_to_configure'
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
app.post('/api/social/batch-generate', async (req, res) => {
    try {
      const { platform, limit } = req.body;
      const products = db.prepare("SELECT * FROM products WHERE status = 'listed'").all();
      const toProcess = products.slice(0, limit || 10);
      
      const conceptEngine = require('./services/conceptEngine');
      const results = [];
      
      for (const product of toProcess) {
        try {
          const niche = product.prof_name || 'Small Business';
          const prompt = 'Generate a ' + (platform || 'instagram') + ' post for "' + (product.name || 'Product') + '" in the ' + niche + ' niche.';
          const content = await conceptEngine.generateSocialPost(prompt, niche);
          
          // Auto-schedule for staggered times
          const scheduledAt = new Date(Date.now() + results.length * 3600000 + 3600000).toISOString();
          
          const scheduled = db.prepare("SELECT value FROM settings WHERE key = 'social_scheduled'").get();
          const posts = scheduled ? JSON.parse(scheduled.value || '[]') : [];
          posts.push({
            id: Date.now() + results.length,
            productId: product.id,
            platform: platform || 'instagram',
            content,
            scheduledAt,
            status: 'scheduled',
            createdAt: new Date().toISOString()
          });
          db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('social_scheduled', ?)").run(JSON.stringify(posts));
          
          results.push({ productId: product.id, name: product.name, status: 'scheduled' });
        } catch (e) {
          results.push({ productId: product.id, name: product.name, status: 'error', error: e.message });
        }
      }
      
      res.json({
        ok: true,
        generated: results.filter(r => r.status === 'scheduled').length,
        errors: results.filter(r => r.status === 'error').length,
        results
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
app.get('/api/products/:id/preview-html', (req, res) => {
    try {
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
      if (!product) return res.status(404).json({ error: 'Product not found' });
      // Profession data lives in the professions table — products never carried
      // prof_name/services columns (the old inline object rendered "undefined").
      const prof = db.prepare('SELECT * FROM professions WHERE id = ?').get(product.profession_id);
      if (!prof) return res.status(404).json({ error: 'Profession not found' });

      const designStudio = require('./services/designStudio');
      const designStyles = require('./services/designStyles');
      const fileFactory = require('./services/fileFactory');
      const theme = designStyles.resolveDesign(prof, product.type);

      // Legacy newsletter types keep their own builders; every catalog type
      // delegates to buildPreviewHTML — the same source of truth the deliverable
      // files and thumbnails are rendered from (covers spreadsheet/roi/etc.).
      let html = '';
      if (product.type === 'playbook') html = designStudio.buildPlaybookHTML(prof, theme, {});
      else if (product.type === 'pricing-bible') html = designStudio.buildPricingBibleHTML(prof, theme, {});
      else if (product.type === 'email-scripts') html = designStudio.buildEmailScriptsHTML(prof, theme, {});
      else if (product.type === 'sop-package') html = designStudio.buildSOPPackageHTML(prof, theme, {});
      else html = fileFactory.buildPreviewHTML(product, prof);

      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
app.post('/api/social/generate', async (req, res) => {
    try {
      // node:sqlite cannot bind undefined — reject malformed bodies with 400
      // instead of a 500 "Provided value cannot be bound" crash.
      const productId = parseInt(req.body && req.body.productId);
      const platform = req.body && req.body.platform;
      if (!productId) return res.status(400).json({ error: 'productId required' });
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
      if (!product) return res.status(404).json({ error: 'Product not found' });
      
      const conceptEngine = require('./services/conceptEngine');
      const niche = product.prof_name || 'Small Business';
      const type = product.type || 'product';
      
      const prompts = {
        pinterest: 'Generate a Pinterest pin title (max 100 chars) and description (max 500 chars) for a ' + type + ' product called "' + (product.name || 'Product') + '" in the ' + niche + ' niche. Include 5 relevant hashtags.',
        instagram: 'Generate an Instagram caption (max 2200 chars) for a ' + type + ' product called "' + (product.name || 'Product') + '" in the ' + niche + ' niche. Include a hook, value proposition, and CTA. Include 10 relevant hashtags.',
        twitter: 'Generate 3 tweet variations (max 280 chars each) promoting a ' + type + ' product called "' + (product.name || 'Product') + '" in the ' + niche + ' niche. Each should have a different angle.',
        facebook: 'Generate a Facebook post (max 63206 chars) promoting a ' + type + ' product called "' + (product.name || 'Product') + '" in the ' + niche + ' niche. Include storytelling, benefits, and a CTA.'
      };
      
      const prompt = prompts[platform] || prompts.instagram;
      const content = await conceptEngine.generateSocialPost(prompt, niche);
      
      res.json({ ok: true, content, platform, productId });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });



// (API rate limiting + auth are registered above, before any route is defined.)

// -- INIT DB --
init();
initDefaultSettings();
brand.syncDesignsToCovers(); // keep covers/ in sync with the nichegate designs folder

// -- MULTER --
const upload = multer({ dest: UPLOAD_DIR });

// ------------------------------------------------------------------------
// API: PROFESSIONS
// ------------------------------------------------------------------------
app.get('/api/professions', (req, res) => {
  const rows = db.prepare('SELECT * FROM professions ORDER BY tier, id').all();
  res.json(rows.map(r => ({
    ...r,
    colors: JSON.parse(r.colors || '{}'),
    services: JSON.parse(r.services || '[]'),
    hashtags: JSON.parse(r.hashtags || '[]')
  })));
});

app.get('/api/professions/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM professions WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json({
    ...row,
    colors: JSON.parse(row.colors || '{}'),
    services: JSON.parse(row.services || '[]'),
    hashtags: JSON.parse(row.hashtags || '[]')
  });
});

app.patch('/api/professions/:id/status', (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE professions SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ success: true });
});

// ------------------------------------------------------------------------
// API: PRODUCTS
// ------------------------------------------------------------------------
app.get('/api/products', (req, res) => {
  const rows = db.prepare('SELECT p.*, pr.emoji as prof_emoji, pr.name as prof_name FROM products p JOIN professions pr ON p.profession_id = pr.id ORDER BY p.created_at DESC').all();
  res.json(rows);
});

app.get('/api/products/profession/:id', (req, res) => {
  const rows = db.prepare('SELECT * FROM products WHERE profession_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json(rows);
});

app.get('/api/products/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});

app.post('/api/products', async (req, res) => {
  const { profession_id, name, type, price, theme, html_content } = req.body || {};
  if (!profession_id || !name || !type) {
    return res.status(400).json({ error: 'profession_id, name and type are required' });
  }
  // node:sqlite cannot bind undefined — omit empty optionals as NULL.
  const result = db.prepare(`
    INSERT INTO products (profession_id, name, type, price, status, theme, html_content)
    VALUES (?, ?, ?, ?, 'draft', ?, ?)
  `).run(profession_id, name, type, price ?? null, theme ?? null, html_content ?? null);
  
  // Generate the real deliverable file — never create a product that can't be delivered
  const newProduct = db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid);
  try {
    await fileFactory.ensureProductFile(newProduct);
  } catch (e) {
    console.error('File generation error:', e.message);
  }
  
  // Log automation
  db.prepare('INSERT INTO automation_log (action, profession_id, product_id, details, status) VALUES (?, ?, ?, ?, ?)')
    .run('product_generated', profession_id, result.lastInsertRowid, `Generated ${type}`, 'success');
  
  res.json({ id: result.lastInsertRowid, file_path: newProduct.file_path });
});

app.patch('/api/products/:id/status', (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE products SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ success: true });
});

app.patch('/api/products/:id/html', (req, res) => {
  const { html_content } = req.body;
  db.prepare('UPDATE products SET html_content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(html_content, req.params.id);
  res.json({ success: true });
});

app.delete('/api/products/:id', (req, res) => {
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Generate/refresh the AI-differentiated concept for a product.
// No-op (returns {concept: null}) when the model layer is disabled.
app.post('/api/products/:id/regenerate-idea', async (req, res) => {
  try {
    const { enrichProduct } = require('./services/conceptEngine');
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const concept = await enrichProduct(product.id);
    if (!concept) {
      return res.json({ regenerated: false, concept: null,
        message: 'AI layer off or concept below novelty bar — keeping current product' });
    }
    res.json({ regenerated: true, concept,
      name: db.prepare('SELECT name FROM products WHERE id = ?').get(product.id).name });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ------------------------------------------------------------------------
// API: TEMPLATES (Mockup generation) — Returns 5 theme variations
// ------------------------------------------------------------------------
app.post('/api/templates/generate', async (req, res) => {
  try {      // node:sqlite cannot bind undefined — reject malformed bodies with 400.
      const profession_id = parseInt(req.body && req.body.profession_id);
      const type = req.body && req.body.type ? String(req.body.type).toLowerCase().slice(0, 40) : '';
      if (!profession_id || !type) return res.status(400).json({ error: 'profession_id and type are required' });
      const prof = db.prepare('SELECT * FROM professions WHERE id = ?').get(profession_id);
    if (!prof) return res.status(404).json({ error: 'Profession not found' });
    
    // Design engine: pick the 5 best themes for this profession's tier
    const themes = design.themesForTier(prof.tier);
    const mockups = [];
    
    for (const theme of themes) {
      // Type ? builder. Every type renders a REAL preview so the editor and
      // thumbnail pipeline show exactly what the buyer gets.
      const stub = { id: 0, type, price: '$29', name: `${prof.name} ${type}`, emoji: prof.emoji, profession_id: prof.id };
      let html = '';
      if (type === 'invoice') html = pdfGen.buildInvoiceHTML(prof, theme);
      else if (type === 'checklist') html = pdfGen.buildChecklistHTML(prof, theme);
      else if (type === 'journal') html = pdfGen.buildJournalHTML(prof, theme, getRecoveryPrompts(prof));
      else if (type === 'brand') html = pdfGen.buildBrandKitHTML(prof, theme);
      else if (type === 'website') html = buildWebsiteHTML(prof, theme);
      else if (type === 'social') html = zipGen.buildSocialPostHTML(prof, theme);
      else if (type === 'decision-matrix') html = ds.buildDecisionMatrixHTML(stub, prof, theme);
      else if (type === 'roi') html = ds.buildROIHTML(stub, prof, theme);
      else if (type === 'bundle' || type === 'leadmagnet') html = ds.buildCoverHTML(stub, prof, theme, type);
      else if (['spreadsheet', 'booking', 'pricing', 'inventory', 'shot-chart'].includes(type)) {
        html = ds.buildTablePreviewHTML(stub, prof, theme, type === 'booking' ? 'booking' : 'spreadsheet');
      }
      else html = pdfGen.buildInvoiceHTML(prof, theme);

      const stmt = db.prepare('INSERT INTO templates (profession_id, type, theme, html_content) VALUES (?, ?, ?, ?)');
      stmt.run(profession_id, type, theme.name, html);

      mockups.push({ themeName: theme.name, html, colors: theme, type });
    }
    
    res.json({ mockups, profession: prof, type });
  } catch (e) {
    console.error('[TEMPLATE ERROR]', e.message, e.stack);
    res.status(500).json({ error: e.message, stack: e.stack });
  }
});

// SEO preview for a product (title/description/tags)
app.get('/api/seo/:productId', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.productId);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  const prof = db.prepare('SELECT * FROM professions WHERE id = ?').get(product.profession_id);
  res.json(seo.generateSEO(prof, product.type, product.theme));
});

app.get('/api/templates/:profession_id', (req, res) => {
  const rows = db.prepare('SELECT * FROM templates WHERE profession_id = ? ORDER BY created_at DESC').all(req.params.profession_id);
  res.json(rows);
});

// ------------------------------------------------------------------------
// API: TRENDS
// ------------------------------------------------------------------------
app.get('/api/trends', (req, res) => {
  const attachVet = rows => rows.map(t => ({ ...t, vet: vetting.vetTrend(t) }));
  res.json({
    active: attachVet(trends.withScores(trends.getActiveTrends())),
    history: trends.getTrendHistory(),
    all: attachVet(trends.withScores(trends.getAllTrends()))
  });
});

app.post('/api/trends/scan', async (req, res) => {
  const found = await discovery.sweep(8);
  if (!found.length) return res.json({ message: 'No new niches found this sweep', trend: null });
  const trend = found[0];
  // Attach vetting score so the agent can decide whether to commit
  const vet = vetting.vetTrend(trend);
  res.json({ trend, vet, count: found.length, names: found.map(t => t.name) });
});

// Broad autonomous discovery sweep (on-demand)
app.post('/api/discovery/sweep', async (req, res) => {
  try {
    const found = await discovery.sweep(8);
    discovery.freshnessPass();
    res.json({ count: found.length, names: found.map(t => t.name) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Vetting detail for a specific trend (multi-signal breakdown)
app.get('/api/trends/vet/:id', (req, res) => {
  const all = trends.getAllTrends();
  const trend = all.find(t => t.id == req.params.id);
  if (!trend) return res.status(404).json({ error: 'Trend not found' });
  res.json(vetting.vetTrend(trend));
});

// Live radar source health (ok/fail/lastSuccess) — additive observability
app.get('/api/trends/radar-health', (req, res) => {
  try {
    const radar = require('./services/trendRadar');
    res.json({ sources: radar.getSourceHealth() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


app.post('/api/trends/:id/activate', (req, res) => {
  // Vetting gate: ACTIVATE only (WATCH/SKIP blocked unless force=1)
  const all = trends.getAllTrends();
  const trend = all.find(t => t.id == req.params.id);
  if (!trend) return res.status(404).json({ success: false, error: 'Trend not found' });
  const force = req.query.force === '1' || req.body?.force === true || req.body?.force === 1;
  try {
    const vet = vetting.assertActivatable(trend, { force });
    const prof = trends.activateTrend(req.params.id);
    let products = 0;
    if (prof) products = discovery.generateProductsForTrend(prof.id, trend);
    res.json({ success: true, profession: prof, productsGenerated: products, vet });
  } catch (e) {
    return res.status(400).json({ success: false, error: e.message, vet: e.vet || null, code: e.code || null });
  }
});


app.post('/api/trends/:id/dismiss', (req, res) => {
  trends.dismissTrend(req.params.id);
  res.json({ success: true });
});

app.post('/api/trends/:id/archive', (req, res) => {
  trends.archiveTrend(req.params.id);
  res.json({ success: true });
});

// ------------------------------------------------------------------------
// API: METRICS
// ------------------------------------------------------------------------
app.get('/api/metrics', (req, res) => {
  const rows = db.prepare(`
    SELECT m.*, p.name as prof_name, pr.name as product_name 
    FROM metrics m 
    LEFT JOIN professions p ON m.profession_id = p.id 
    LEFT JOIN products pr ON m.product_id = pr.id 
    ORDER BY m.recorded_at DESC LIMIT 200
  `).all();
  res.json(rows);
});


// ── SERP discovery queue (observability + manual retry) ──
app.get('/api/discovery/search-queue', (req, res) => {
  try {
    const radar = require('./services/trendRadar');
    res.json({ ok: true, queue: radar.getSearchQueue(50), sources: radar.getSourceHealth() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/discovery/serp-scan', async (req, res) => {
  try {
    const radar = require('./services/trendRadar');
    const inserted = await radar.scanLiveTrends(4);
    res.json({ ok: true, inserted: inserted.length, items: inserted.map(t => ({ id: t.id, name: t.name, why: t.why })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/discovery/expand', async (req, res) => {
    try {
      const radar = require('./services/trendRadar');
      const seeds = Array.isArray(req.body && req.body.seeds) && req.body.seeds.length
        ? req.body.seeds.map(s => String(s).slice(0, 60)).slice(0, 12)
        : undefined;
      const depth = Math.min(2, Math.max(0, parseInt(req.body && req.body.depth) || 1));
      const maxNew = Math.min(60, Math.max(1, parseInt(req.body && req.body.maxNew) || 30));
      const r = await radar.discoverTerms({ seeds, depth, maxNew });
      res.json(r);
    } catch (e) {
      console.error('[ERROR] POST /api/discovery/expand -> 500:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

app.get('/api/trends/:id/intelligence', (req, res) => {
    try {
      const radar = require('./services/trendRadar');
      const t = db.prepare('SELECT * FROM trends WHERE id = ?').get(req.params.id);
      if (!t) return res.status(404).json({ error: 'Trend not found' });
      const key = t.trend_key || radar.normalizeNicheKey(t.name);
      res.json({
        ok: true,
        trend: { id: t.id, name: t.name, phase: t.phase, velocity: t.velocity, est_revenue: t.est_revenue },
        breakout: radar.breakoutScore(key),
        forecast: radar.forecastTrend(key),
        cohort: radar.cohortGrowthPercentile(key)
      });
    } catch (e) {
      console.error('[ERROR] GET /api/trends/:id/intelligence -> 500:', e.message);
      res.status(500).json({ error: e.message });
    }
  });

app.post('/api/discovery/search-queue/drain', async (req, res) => {
  try {
    const radar = require('./services/trendRadar');
    const n = await radar.drainSearchQueue(10);
    res.json({ ok: true, reprocessed: n });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// ── Etsy saturation probe (manual check + observability) ──
app.get('/api/discovery/etsy-saturation', async (req, res) => {
  try {
    const radar = require('./services/trendRadar');
    const q = String(req.query.q || '');
    if (!q) return res.status(400).json({ error: 'q required' });
    const s = await radar.fetchEtsySaturation(q);
    res.json({ ok: true, query: q, saturation: s, sourceHealth: radar.getSourceHealth()['etsy-saturation'] || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// ── Opportunity Engine probe (DataForSEO demand + Etsy saturation) ──
app.get('/api/discovery/opportunity', async (req, res) => {
  try {
    const radar = require('./services/trendRadar');
    const q = String(req.query.q || '');
    if (!q) return res.status(400).json({ error: 'q required' });
    const score = await radar.scoreOpportunity(q);
    res.json({ ok: true, score });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/metrics/summary', (req, res) => {
  // Compute live metrics from the products table (source of truth)
  const byProfession = db.prepare(`
    SELECT pr.profession_id, p.name as prof_name, p.emoji as prof_emoji,
      COUNT(*) as products,
      SUM(CASE WHEN pr.status='listed' THEN 1 ELSE 0 END) as listed,
      SUM(CASE WHEN pr.status='approved' THEN 1 ELSE 0 END) as approved,
      SUM(CASE WHEN pr.status='draft' OR pr.status='pending-review' THEN 1 ELSE 0 END) as pending
    FROM products pr JOIN professions p ON pr.profession_id = p.id
    GROUP BY pr.profession_id
  `).all();

  const overall = db.prepare(`
    SELECT COUNT(*) as products,
      SUM(CASE WHEN status='listed' THEN 1 ELSE 0 END) as listed,
      SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) as approved,
      SUM(CASE WHEN status='draft' OR status='pending-review' THEN 1 ELSE 0 END) as pending
    FROM products
  `).get();

  // Estimated revenue: listed products at their price (conservative estimate)
  const estRevenue = db.prepare(`
    SELECT SUM(CAST(REPLACE(REPLACE(price,'$',''),',','') AS REAL)) as revenue
    FROM products WHERE status='listed'
  `).get();

  // REAL sales from synced marketplace data
  const realSales = db.prepare('SELECT COALESCE(SUM(sales),0) as c, COALESCE(SUM(revenue),0) as r FROM metrics').get();

  res.json({
    byProfession,
    overall: {
      products: overall.products || 0,
      listed: overall.listed || 0,
      approved: overall.approved || 0,
      pending: overall.pending || 0,
      revenue: estRevenue.revenue || 0,
      realSales: realSales.c || 0,
      realRevenue: realSales.r || 0
    }
  });
});

// ----------------------------------------------------------------------
// API: SALES SYNC (Gumroad ? metrics + Discord alerts)
// ----------------------------------------------------------------------
async function syncGumroadSales() {
  if (!mp.checkGumroadKey().ok) throw new Error('Gumroad not configured');
  const resp = await axios.get('https://api.gumroad.com/v2/sales', {
    params: { access_token: process.env.GUMROAD_ACCESS_TOKEN },
    timeout: 15000
  });
  const localByGid = {};
  for (const p of db.prepare('SELECT id, profession_id, marketplace_id FROM products WHERE marketplace_id IS NOT NULL').all()) {
    localByGid[p.marketplace_id] = p;
  }
  let newSales = 0, revenue = 0;
  for (const s of resp.data?.sales || []) {
    const ins = db.prepare('INSERT OR IGNORE INTO sales_seen (sale_id) VALUES (?)').run(s.id);
    if (ins.changes === 0) continue;
    const lp = localByGid[s.product_id];
    db.prepare('INSERT INTO metrics (profession_id, product_id, views, sales, revenue, favorites) VALUES (?, ?, 0, 1, ?, 0)')
      .run(lp?.profession_id ?? null, lp?.id ?? null, (s.price || 0) / 100);
    newSales++;
    revenue += (s.price || 0) / 100;
  }
  if (newSales > 0) {
    await notifier.sendDiscord(getWebhookUrl(), `💰 **Sale!** ${newSales} new sale${newSales > 1 ? 's' : ''} — +$${revenue.toFixed(2)}. Total so far: see Metrics.`);
    db.prepare('INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)')
      .run('sales_sync', `${newSales} new sale(s), $${revenue.toFixed(2)}`, 'success');
  }
  return { newSales, revenue };
}

app.post('/api/metrics/sync-gumroad', async (req, res) => {
  try {
    res.json(await syncGumroadSales());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ----------------------------------------------------------------------
// API: BUNDLES ($29 Complete Toolkits) + LEAD MAGNET + SEASONAL
// ----------------------------------------------------------------------
app.post('/api/bundles/generate', async (req, res) => {
  try {
    res.json(await bundles.generateAllBundles());
  } catch (e) {
    console.error('[BUNDLES] generate error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/bundles/publish', async (req, res) => {
  try { res.json(await publishQueuedBundles()); }
  catch (e) { console.error('[BUNDLES] publish error:', e.message); res.status(500).json({ error: e.message }); }
});

app.post('/api/leadmagnet/deploy', async (req, res) => {
  try { res.json(await deployLeadMagnet()); }
  catch (e) { console.error('[LEADMAGNET] error:', e.message); res.status(500).json({ error: e.message }); }
});

app.get('/api/seasonal', (req, res) => {
  const focus = seasonal.getCurrentFocus();
  const profs = seasonal.getFocusProfessions().map(p => ({ name: p.name, emoji: p.emoji }));
  res.json({ ...focus, professions: profs });
});

app.post('/api/metrics', (req, res) => {
  const { profession_id, product_id, views, sales, revenue, favorites } = req.body || {};
  if (!profession_id) return res.status(400).json({ error: 'profession_id is required' });
  db.prepare(`
    INSERT INTO metrics (profession_id, product_id, views, sales, revenue, favorites)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(profession_id, product_id ?? null, views || 0, sales || 0, revenue || 0, favorites || 0);
  res.json({ success: true });
});

// ------------------------------------------------------------------------
// API: CONSOLE ASSISTANT — AI chat with the operator's real ops data in
// context. Falls back to an honest deterministic summary when the model
// layer is off/failing, so the endpoint always answers with real numbers.
// ------------------------------------------------------------------------
app.post('/api/console/assistant', async (req, res) => {
  const q = String((req.body && req.body.question) || '').slice(0, 1000).trim();
  if (!q) return res.status(400).json({ error: 'question is required' });
  const router = require('./services/modelRouter');
  const cfg = require('./services/modelConfig');
  try {
    const productCount = db.prepare('SELECT COUNT(*) c FROM products').get().c;
    const pending = db.prepare("SELECT COUNT(*) c FROM products WHERE status IN ('pending-review','needs-review')").get().c;
    const listed = db.prepare("SELECT COUNT(*) c FROM products WHERE status = 'listed'").get().c;
    const rev = db.prepare("SELECT COALESCE(SUM(revenue),0) r, COALESCE(SUM(sales),0) s FROM metrics WHERE recorded_at >= datetime('now','-7 days')").get();
    const trends = db.prepare('SELECT name, phase, velocity FROM trends ORDER BY detected_at DESC LIMIT 5').all();
    const topProducts = db.prepare(`
      SELECT p.name, SUM(m.sales) s FROM metrics m JOIN products p ON p.id = m.product_id
      GROUP BY m.product_id ORDER BY s DESC LIMIT 5`).all();
    const ctx = `Current NicheGate ops snapshot:
- Catalog: ${productCount} products (${listed} listed live, ${pending} awaiting review)
- Last 7d: ${rev.s} sales, $${Number(rev.r).toFixed(2)} revenue
- Top sellers: ${topProducts.map(t => `${t.name} (${t.s} sales)`).join('; ') || 'none yet'}
- Recent trends: ${trends.map(t => `${t.name} [${t.phase || 'rising'}${t.velocity ? ', ' + t.velocity : ''}]`).join('; ') || 'none cached'}`;
    const system = 'You are the NicheGate console assistant: a blunt, operator-focused copilot for a digital-product seller (Etsy/Gumroad). Answer using the ops snapshot when relevant; be specific, quantitative and short (max 120 words). No preamble, no restating the question.';
    let answer = null;
    if (cfg.enabled) {
      answer = await router.callModel({
        model: cfg.openrouter.ideationModel,
        messages: [
          { role: 'system', content: system + '\n\n' + ctx },
          { role: 'user', content: q }
        ],
        temperature: 0.4,
        maxTokens: 400
      });
    }
    if (!answer) {
      answer = `AI layer is off or unavailable — here is the live snapshot:\n${ctx}`;
    }
    res.json({ answer, ai: Boolean(answer && cfg.enabled) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ------------------------------------------------------------------------
// API: CHAT HISTORY
// ------------------------------------------------------------------------
app.get('/api/chat/:profession_id', (req, res) => {
  const rows = db.prepare('SELECT * FROM chat_history WHERE profession_id = ? ORDER BY created_at ASC').all(req.params.profession_id);
  res.json(rows);
});

app.post('/api/chat', (req, res) => {
  const { profession_id, role, text, mockups } = req.body || {};
  if (!profession_id || !role || !text) {
    return res.status(400).json({ error: 'profession_id, role and text are required' });
  }
  const result = db.prepare(`
    INSERT INTO chat_history (profession_id, role, text, mockups)
    VALUES (?, ?, ?, ?)
  `).run(profession_id, role, text, mockups ? JSON.stringify(mockups) : null);
  res.json({ id: result.lastInsertRowid });
});

// ------------------------------------------------------------------------
// API: INSPIRATION PHOTOS
// ------------------------------------------------------------------------
app.post('/api/inspiration/:profession_id', upload.single('photo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  db.prepare('INSERT INTO inspiration_photos (profession_id, file_path) VALUES (?, ?)')
    .run(req.params.profession_id, req.file.path);
  res.json({ success: true, path: req.file.path });
});

app.get('/api/inspiration/:profession_id', (req, res) => {
  const rows = db.prepare('SELECT * FROM inspiration_photos WHERE profession_id = ?').all(req.params.profession_id);
  res.json(rows);
});

// ------------------------------------------------------------------------
// API: AUTOMATION
// ------------------------------------------------------------------------
app.get('/api/automation/log', (req, res) => {
  const rows = db.prepare('SELECT * FROM automation_log ORDER BY created_at DESC LIMIT 100').all();
  res.json(rows);
});

// BUFFER BRIDGE — interim Pinterest publishing while our own app is
// trial-only. Status is surfaced (no secrets) and settings live in the
// settings table (buffer_api_token / buffer_channel_id /
// buffer_board_service_id / public_base_url) or env.
app.get('/api/buffer/status', (req, res) => {
  res.json(require('./services/bufferBridge').bufferStatus());
});

// PUBLIC pin image feed for the Buffer bridge (Buffer's servers fetch the
// image URL server-side, so it cannot be login-gated). Access is via an
// unguessable per-product secret stored once in the settings table; rotating
// that secret revokes all previously served links. Images are read-only
// product cover previews — no customer data. Sits AFTER the auth/api guards,
// which pass it through as a non-/api page route. Streams manually —
// res.sendFile has a Windows path bug (see /api/export/product).
app.get('/pin-image/:productId/:token', (req, res) => {
  const { productId, token } = req.params;
  const bridge = require('./services/bufferBridge');
  const id = Number(productId) || 0;
  let expected, file;
  try {
    expected = `${bridge.shareTokenFor(0).split('-')[0]}-${productId}`;
    file = bridge.pinImagePublicUrl(id);
  } catch (e) {
    console.error('[PIN-IMAGE] lookup failed:', e.message);
    return res.status(404).send('not found');
  }
  if (token !== expected || !file) return res.status(404).send('not found');
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) return res.status(404).send('not found');
  res.set('Cache-Control', 'public, max-age=86400');
  res.type('image/jpeg');
  return fs.createReadStream(abs).pipe(res);
});

app.post('/api/automation/run', async (req, res) => {
  const profs = db.prepare("SELECT * FROM professions WHERE status != 'archived'").all();
  const results = [];

  for (const prof of profs) {
    const types = automationCycle.VARY_TYPES;
    const have = new Set(db.prepare(`SELECT type FROM products WHERE profession_id = ? AND status IN ('draft','pending-review')`).all(prof.id).map(r => r.type));
    const missing = types.filter(t => !have.has(t));
    if (!missing.length) continue;
    const type = missing[Math.floor(Math.random() * missing.length)];

    try {
      const productId = draftProduct(prof, type);
      if (!productId) continue;
      db.prepare('INSERT INTO automation_log (action, profession_id, product_id, details, status) VALUES (?, ?, ?, ?, ?)')
        .run('auto_generate', prof.id, productId, `Auto-generated ${type} for ${prof.name}`, 'success');
      results.push({ profession: prof.name, type, productId });
    } catch (e) {
      db.prepare('INSERT INTO automation_log (action, profession_id, details, status) VALUES (?, ?, ?, ?)')
        .run('auto_generate', prof.id, `Failed: ${e.message}`, 'error');
    }
  }

  res.json({ generated: results.length, items: results });
});

app.post('/api/automation/approve-all', (req, res) => {
  res.json(approveAllPending());
});

// Deduplicate the review queue — collapse identical draft clones (same
// profession + type + name) down to ONE keeper each. Never touches approved,
// listed, published, or sold products. Prefer keeping the row with a real
// generated file; otherwise the newest one.
app.post('/api/automation/dedupe', (req, res) => {
  res.json(dedupeQueue());
});

// Purge stale non-live products: deletes draft/rejected products older than
// the cutoff (default 48h) plus their files and dependent rows (any table
// with a product_id column). Marketplace-listed products are structurally
// excluded — the live catalog and its sales/attribution data are never touched.
app.post('/api/products/purge', async (req, res) => {
  try {
    const hours = Math.max(0, parseFloat(req.query.hours) || 48);
    const cutoff = new Date(Date.now() - hours * 3600 * 1000)
      .toISOString().replace('T', ' ').slice(0, 19);
    const victims = db.prepare(`
      SELECT id, file_path, preview_path FROM products
      WHERE status IN ('draft', 'rejected')
        AND created_at <= ?
        AND (marketplace_id IS NULL OR marketplace_id = '')
    `).all(cutoff);
    // Every table that hangs off products (metrics, pins, future tables).
    const childTables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()
      .map(r => r.name)
      .filter(t => t !== 'products')
      .filter(t => db.prepare(`PRAGMA table_info("${t}")`).all().some(c => c.name === 'product_id'));
    let filesRemoved = 0, childRows = 0;
    for (const v of victims) {
      for (const p of [v.file_path, v.preview_path]) {
        if (!p) continue;
        try {
          await fs.promises.unlink(path.isAbsolute(p) ? p : path.resolve(path.join(__dirname, '..', p)));
          filesRemoved++;
        } catch { /* already gone — fine */ }
      }
      for (const t of childTables) {
        childRows += db.prepare(`DELETE FROM "${t}" WHERE product_id = ?`).run(v.id).changes;
      }
      db.prepare('DELETE FROM products WHERE id = ?').run(v.id);
    }
    const remaining = db.prepare('SELECT COUNT(*) c FROM products').get().c;
    db.prepare('INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)')
      .run('purge-stale', `Removed ${victims.length} stale products (${hours}h cutoff) — ${filesRemoved} files, ${childRows} dependent rows; ${remaining} products remain`, 'success');
    res.json({ success: true, removed: victims.length, filesRemoved, childRows, remaining, hours });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ------------------------------------------------------------------------
// API: MARKETPLACE
// ------------------------------------------------------------------------
// Test which marketplace connections are live
app.get('/api/marketplace/test', async (req, res) => {
  const results = {};
  results.gumroad = await mp.testGumroadConnection().catch(e => ({ ok: false, message: e.message }));
  results.etsy = await mp.testEtsyConnection().catch(e => ({ ok: false, message: e.message }));
  res.json(results);
});

// Import an Etsy OAuth token obtained out-of-band (e.g., by the local OAuth
// bridge running on the owner's machine). Overwrites the stored etsy token.
// Accepts the full token payload; never logs the secrets.
app.post('/api/marketplace/etsy/import-token', async (req, res) => {
  try {
    const { access_token, refresh_token, expires_in } = req.body || {};
    if (!access_token || !refresh_token) return res.status(400).json({ error: 'access_token and refresh_token are required' });
    const expiresAt = new Date(Date.now() + (Number(expires_in) || 3600) * 1000).toISOString();
    db.prepare(`INSERT INTO marketplace_tokens (platform, access_token, refresh_token, expires_at)
      VALUES ('etsy', ?, ?, ?)
      ON CONFLICT(platform) DO UPDATE SET access_token = excluded.access_token, refresh_token = excluded.refresh_token, expires_at = excluded.expires_at`) 
      .run(access_token, refresh_token, expiresAt);
    const check = db.prepare('SELECT platform FROM marketplace_tokens WHERE platform = \'etsy\'').get();
    res.json({ ok: !!check, expiresAt });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Wipe the Etsy OAuth binding: deletes the stored token + OAuth flow state.
// Used when the token is bound to the wrong account (e.g., an Etsy login that
// owns no shop) — the reconnect then binds fresh to the correct account.
app.post('/api/marketplace/etsy/disconnect', async (req, res) => {
  try {
    const gone = db.prepare("DELETE FROM marketplace_tokens WHERE platform = 'etsy'").run();
    const settings = db.prepare("DELETE FROM settings WHERE key IN ('etsy_oauth_state', 'etsy_code_verifier', 'etsy_redirect_uri')").run();
    console.log('[ETSY] disconnected: tokens removed ' + gone.changes + ', oauth state cleared ' + settings.changes);
    res.json({ ok: true, tokensRemoved: gone.changes, stateCleared: settings.changes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Anchor a live Gumroad listing as a marketplace-linked products row so the
// command center (optimizer, BI, reskin, pins) can see and manage it.
// Idempotent by marketplace_id: existing rows are updated, never duplicated.
app.post('/api/marketplace/anchor/:gid', async (req, res) => {
  try {
    const axios = require('axios');
    const resp = await axios.get(`https://api.gumroad.com/v2/products/${encodeURIComponent(req.params.gid)}?access_token=${encodeURIComponent(process.env.GUMROAD_ACCESS_TOKEN)}`, { timeout: 20000 });
    const body = req.body || {};
    const gp = resp.data && resp.data.product;
    if (!gp) return res.status(404).json({ error: 'Gumroad product not found' });
    const a = mp.mapGumroadAnchor(gp);
    if (!a.marketplace_id) return res.status(400).json({ error: 'Gumroad payload missing id' });
    const existing = db.prepare('SELECT id FROM products WHERE marketplace_id = ?').get(a.marketplace_id);
    let id, action;
    if (existing) {
      db.prepare('UPDATE products SET name = ?, type = ?, price = ?, status = \'listed\', marketplace = ?, profession_id = COALESCE(profession_id, ?), brief = COALESCE(brief, ?) WHERE id = ?')
        .run(a.name, a.type, a.price, a.marketplace, a.profession_id, body.brief || null, existing.id);
      id = existing.id; action = 'updated';
    } else {
      const r = db.prepare(`INSERT INTO products (profession_id, name, type, price, status, origin, marketplace, marketplace_id, brief)
        VALUES (?, ?, ?, ?, 'listed', 'engine', ?, ?, ?)`)
        .run(a.profession_id, a.name, a.type, a.price, a.marketplace, a.marketplace_id, body.brief || null);
      id = Number(r.lastInsertRowid); action = 'created';
    }
    // Stash the Gumroad-hosted public cover URL — Pinterest dispatch needs a
    // publicly fetchable image, and our own preview endpoints are session-gated.
    const coverUrl = gp.preview_url || (Array.isArray(gp.covers) && gp.covers[0] && gp.covers[0].url) || null;
    if (coverUrl) {
      db.prepare('UPDATE products SET listing_json = COALESCE(listing_json, ?) WHERE id = ?')
        .run(JSON.stringify({ gumroadCoverUrl: coverUrl }), id);
    }
    // Physical deliverable gate: anchored rows self-heal their file on the
    // production volume (builders are moat-aware; no image quota needed).
    let fileGenerated = false;
    try {
      const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
      await require('./services/fileFactory').ensureProductFile(row);
      fileGenerated = !!(db.prepare('SELECT file_path FROM products WHERE id = ?').get(id).file_path);
    } catch (e) {
      console.error('[ANCHOR] file regen failed:', e.message);
    }
    require('./services/pinEngine').pinNewProductAsync(id);
    res.json({ ok: true, id, action, name: a.name, type: a.type, profession_id: a.profession_id, fileGenerated });
  } catch (e) {
    console.error('[ANCHOR] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Publish a single approved product to configured marketplaces
app.post('/api/marketplace/publish/:productId', async (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.productId);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  if (product.status !== 'approved') return res.status(400).json({ error: 'Product must be approved first' });

  try {
    const result = await mp.publishProduct(product);
    db.prepare('UPDATE products SET status = ?, marketplace = ?, marketplace_id = ? WHERE id = ?')
      .run('listed', result.platform, result.listingId || null, product.id);
    require('./services/pinEngine').pinNewProductAsync(product.id);
    db.prepare('INSERT INTO automation_log (action, product_id, details, status) VALUES (?, ?, ?, ?)')
      .run('published', product.id, `Listed on ${result.platform}`, 'success');
    res.json({ success: true, ...result });
  } catch (e) {
    await alertPublishError(product.id, e.message);
    res.status(500).json({ error: e.message });
  }
});

// ------------------------------------------------------------------------
// STORE BRANDING — deploy the nichegate-designs logo/banner to marketplaces
// ------------------------------------------------------------------------
app.get('/api/branding/status', (req, res) => {
  try {
    res.json({
      assets: brand.status(),
      etsy: (() => {
        const t = db.prepare(`SELECT * FROM marketplace_tokens WHERE platform='etsy'`).get();
        return { tokenPresent: !!t, expired: t ? new Date(t.expires_at) < new Date() : null, shopId: t?.shop_id || null };
      })(),
      etsyKeyOk: !!process.env.ETSY_CLIENT_ID && !!process.env.ETSY_CLIENT_SECRET && process.env.ETSY_CLIENT_ID !== process.env.ETSY_CLIENT_SECRET,
      gumroadListed: db.prepare(`SELECT COUNT(*) c FROM products WHERE status='listed' AND marketplace='gumroad'`).get().c
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/branding/apply-etsy', async (req, res) => {
  const results = { steps: [] };
  try {
    brand.syncDesignsToCovers();
    results.steps.push({ step: 'assets', ok: true, files: brand.status().assets });
    const icon = brand.assetPath.profileIcon() || brand.assetPath.badge() || brand.assetPath.logo();
    const banner = brand.assetPath.etsyBanner();
    if (!icon) throw new Error('No shop-icon asset found in covers/');
    try {
      results.steps.push({ step: 'shop-icon', ok: true, ...(await mp.uploadEtsyShopIcon(icon)) });
    } catch (e) {
      const status = e.response?.status;
      results.steps.push({ step: 'shop-icon', ok: false, status: status || null, message: e.response?.data?.error || e.message });
    }
    if (banner) {
      try {
        results.steps.push({ step: 'shop-banner', ok: true, ...(await mp.uploadEtsyShopBanner(banner)) });
      } catch (e) {
        const status = e.response?.status;
        results.steps.push({ step: 'shop-banner', ok: false, status: status || null, message: e.response?.data?.error || e.message });
      }
    }
    const ok = results.steps.filter(s => s.ok).length;
    res.json({ success: ok > 0, ...results });
  } catch (e) {
    results.steps.push({ step: 'setup', ok: false, message: e.message });
    res.status(500).json({ success: false, ...results });
  }
});

app.post('/api/branding/apply-gumroad', async (req, res) => {
  try {
    brand.syncDesignsToCovers();
    // Use the branded "logo on black" cover for every live listing, so the
    // Gumroad catalogue visibly carries the NicheGate logo.
    const cover = brand.assetPath.logo() || brand.assetPath.watermark();
    if (!cover) return res.status(400).json({ error: 'No branded cover asset found' });
    const result = await mp.attachBrandingToGumroadProducts(cover);
    res.json({ success: result.failed === 0, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/marketplace/etsy/auth', async (req, res) => {
  try {
    // The callback must be the PUBLIC production URL (Etsy validates it against
    // the app's registered callback list) — never a localhost default.
    const publicOrigin = `https://${process.env.RAILWAY_PUBLIC_DOMAIN || 'nichegate-production.up.railway.app'}`;
    const result = await mp.getEtsyAuthUrl(req.query.redirectUri || `${publicOrigin}/api/marketplace/etsy/callback`);
    res.json({ authUrl: result.url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/marketplace/etsy/callback', async (req, res) => {
  try {
    if (req.query.error) throw new Error(`Etsy denied authorization: ${req.query.error}`);
    const tokens = await mp.exchangeEtsyToken(req.query.code);
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Inter,sans-serif;background:#0a0a0a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:12px}h1{color:#22c55e}a{color:#2dd4bf}</style></head><body><h1>? Etsy connected</h1><p>NicheGate can now list products on Etsy.</p><a href="/setup">Return to Setup ?</a></body></html>`);
  } catch (e) {
    console.error('[ETSY OAUTH] exchange failed:', e.response?.data || e.message);
    res.status(500).send(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Inter,sans-serif;background:#0a0a0a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:12px}a{color:#2dd4bf}</style></head><body><h1 style="color:#ef4444">? Etsy connection failed</h1><p>${String(e.message).replace(/[<>]/g,'')}</p><a href="/setup">Back to Setup ?</a></body></html>`);
  }
});

// Publish errors alert the user immediately
async function alertPublishError(productId, message) {
  db.prepare('INSERT INTO automation_log (action, product_id, details, status) VALUES (?, ?, ?, ?)')
    .run('publish_error', productId, message, 'error');
  await notifier.sendDiscord(getWebhookUrl(), notifier.formatAlert('error', { message: `Publish failed for product #${productId}: ${message}` }));
}

// ------------------------------------------------------------------------
// API: SETTINGS
// ------------------------------------------------------------------------
app.get('/api/settings', (req, res) => {
  const rows = db.prepare('SELECT * FROM settings').all();
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  res.json(settings);
});

app.post('/api/settings', (req, res) => {
  const { key, value } = req.body || {};
  if (!key) return res.status(400).json({ error: 'key is required (use POST /api/settings/batch to save many)' });
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value ?? null);
  res.json({ success: true });
});

app.post('/api/settings/batch', (req, res) => {
  const settings = req.body;
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(settings)) {
    stmt.run(k, String(v));
  }
  res.json({ success: true });
});

// Initialize default settings if empty
function initDefaultSettings() {
  const defaults = {
    auto_generate: 'true',
    auto_list: runtimeConfig.isProduction() ? 'false' : 'true',
    review_interval: '2',
    last_review: new Date().toISOString(),
    notify_email: '',
    webhook_url: ''
  };
  const stmt = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(defaults)) {
    stmt.run(k, v);
  }
}

// ------------------------------------------------------------------------
// API: EXPORT
// ------------------------------------------------------------------------
// Export a product — generates the file on demand from its saved HTML if none exists
app.get('/api/export/product/:id', async (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  // If a file already exists, serve it (stream manually — Windows sendFile bug)
  if (product.file_path && fs.existsSync(product.file_path)) {
    const abs = path.resolve(product.file_path);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(abs)}"`);
    return fs.createReadStream(abs).pipe(res);
  }

  // Otherwise generate it now, using the correct builder for this product type
  try {
    const filePath = await fileFactory.ensureProductFile(product);
    if (!filePath) return res.status(400).json({ error: 'Unsupported product type for export' });
    const abs = path.resolve(filePath);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(abs)}"`);
    return fs.createReadStream(abs).pipe(res);
  } catch (e) {
    console.error('[EXPORT] error:', e.message);
    return res.status(500).json({ error: e.message });
  }
});

// ------------------------------------------------------------------------
// PRODUCT PREVIEW — actually SEE the deliverable before approving:
// PDFs render inline, spreadsheets become readable HTML tables, and ZIP
// archives get a contents list with inline previews of text/HTML files.
// ------------------------------------------------------------------------
const PLACEHOLDER_HTML = new Set(['<!-- auto-generated -->', '<!-- bundle -->', '<!-- leadmagnet -->']);

function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function previewShell(title, body) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',system-ui,sans-serif;background:#f8fafc;color:#1e293b;padding:24px}
.header{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;margin-bottom:18px;flex-wrap:wrap;background:#0f172a;color:white;border-radius:12px;padding:18px 20px}
.header h1{font-size:1.05rem;font-weight:800}
.header .meta{font-size:0.76rem;color:#94a3b8;margin-top:5px;max-width:72ch}
.btn{display:inline-block;background:#2dd4bf;color:white;font-weight:800;font-size:0.78rem;text-decoration:none;padding:9px 16px;border-radius:8px;white-space:nowrap}
.btn:hover{background:#14b8a6;color:white}
.card{background:white;border:1px solid #e2e8f0;border-radius:12px;padding:18px;margin-bottom:16px;overflow:auto}
.card h3{font-size:0.85rem;font-weight:700;margin-bottom:12px;color:#334155}
th,td{padding:7px 10px;border:1px solid #e2e8f0;text-align:left;white-space:nowrap;font-size:0.78rem}
th{background:#0f172a;color:white;font-weight:600}
tr:nth-child(even){background:#f8fafc}
.entry{display:flex;justify-content:space-between;gap:14px;padding:7px 0;border-bottom:1px solid #f1f5f9;font-size:0.8rem}
pre{background:#0f172a;color:#e2e8f0;padding:14px;border-radius:8px;font-size:0.73rem;overflow:auto;max-height:340px;white-space:pre-wrap}
.note{background:#fef3c7;border:1px solid #f59e0b;color:#92400e;font-size:0.78rem;padding:11px 14px;border-radius:8px;margin-bottom:16px}
.preview-img{max-width:100%;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:16px;display:block;box-shadow:0 4px 16px rgba(0,0,0,0.08)}
</style></head><body>${body}</body></html>`;
}

function previewHeader(product, prof, fileInfo) {
  return `<div class="header"><div><h1>${escHtml(product.name)}</h1><div class="meta">${prof ? prof.emoji + ' ' : ''}${escHtml(prof ? prof.name : '')} — ${escHtml(product.type)} · ${escHtml(product.price || '')}${fileInfo ? ' · ' + fileInfo : ''}</div></div><a class="btn" href="/api/export/product/${product.id}" download>⬇ Download file</a></div>`;
}

app.get('/api/products/:id/preview', async (req, res) => {
  try {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    // FIX (previews not working): this response is deliberately embedded in
    // the console's preview iframe (client/js/console.js). The global helmet
    // CSP ships frame-ancestors 'none' (anti-clickjacking), which makes every
    // browser silently refuse to render these 200 responses inside the frame.
    // Rewrite ONLY that directive to 'self' — same-origin-only embedding stays
    // clickjacking-safe, all other CSP directives are preserved verbatim.
    const csp = res.getHeader('Content-Security-Policy');
    if (typeof csp === 'string' && /frame-ancestors/i.test(csp)) {
      res.setHeader('Content-Security-Policy', csp.replace(/frame-ancestors[^;]*/i, "frame-ancestors 'self'"));
    } else {
      res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
    }
    const prof = db.prepare('SELECT * FROM professions WHERE id = ?').get(product.profession_id);

    let filePath = (product.file_path && fs.existsSync(product.file_path)) ? product.file_path : null;
    let ensureError = null;
    if (!filePath) {
      try { filePath = await fileFactory.ensureProductFile(product); }
      catch (e) { ensureError = e.message; console.error('[PREVIEW] ensure file:', e.message); }
    }
    product.file_path = filePath;
    const ext = filePath ? path.extname(filePath).toLowerCase() : '';

    // PDF ? inline so the browser renders the actual document
    if (ext === '.pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${path.basename(filePath)}"`);
      return fs.createReadStream(filePath).pipe(res);
    }

    const sizeKB = filePath ? (fs.statSync(filePath).size / 1024).toFixed(1) : null;

    // Spreadsheet ? readable HTML table (live formulas included)
    if (filePath && (ext === '.xlsx' || ext === '.xls')) {
      const resolvedFilePath = path.resolve(filePath);
      const fileSize = fs.statSync(resolvedFilePath).size;
      if (!resolvedFilePath.startsWith(`${GENERATED_DIR}${path.sep}`)) {
        return res.status(400).json({ error: 'Spreadsheet preview is limited to generated files' });
      }
      if (fileSize > MAX_SPREADSHEET_PREVIEW_BYTES) {
        return res.status(413).json({ error: 'Spreadsheet preview exceeds the 20 MB limit' });
      }
      const wb = XLSX.readFile(resolvedFilePath, { cellNF: false, cellStyles: false });
      const tables = (wb.SheetNames || []).slice(0, 5).map(name => {
        const ws = wb.Sheets[name];
        let html = XLSX.utils.sheet_to_html(ws).replace(/^<table[^>]*>/, '<table>');
        html = html.replace(/<td[^>]*>/g, '<td>').replace(/<th[^>]*>/g, '<th>');
        return `<div class="card"><h3>?? ${escHtml(name)}</h3>${html}</div>`;
      }).join('');
      const body = previewHeader(product, prof, `Excel · ${sizeKB} KB`) + `<img class="preview-img" src="/api/products/${product.id}/preview-image">` + tables;
      return res.type('html').send(previewShell(escHtml(product.name) + ' · Preview', body));
    }

    // ZIP archive ? contents list + inline previews of text/HTML entries
    if (filePath && ext === '.zip') {
      const zip = new AdmZip(filePath);
      const entries = zip.getEntries();
      let html = previewHeader(product, prof, `ZIP archive · ${sizeKB} KB · ${entries.length} files`);
      html += `<img class="preview-img" src="/api/products/${product.id}/preview-image">`;
      html += `<div class="card"><h3>?? Archive contents</h3>` + entries.map(e =>
        `<div class="entry"><span>${escHtml(e.entryName)}</span><span>${(e.header.size / 1024).toFixed(1)} KB</span></div>`).join('') + '</div>';
      html += entries.filter(e => /\.(html?|txt|css|json|csv|xml)$/i.test(e.entryName)).map(e =>
        `<div class="card"><h3>?? ${escHtml(e.entryName)} (preview)</h3><pre>${escHtml(e.getData().toString('utf8').slice(0, 5000))}</pre></div>`).join('');
      return res.type('html').send(previewShell(escHtml(product.name) + ' · Preview', html));
    }

    // No file (or only HTML saved) ? HTML preview + product metadata
    const realHtml = product.html_content && !PLACEHOLDER_HTML.has(String(product.html_content).trim()) && String(product.html_content).trim().length > 10;
    let body = previewHeader(product, prof, filePath ? `${sizeKB} KB file` : null);
    body += `<img class="preview-img" src="/api/products/${product.id}/preview-image">`;
    if (ensureError) body += `<div class="note">? ${escHtml(ensureError)}</div>`;
    else if (!filePath) body += '<div class="note">⚠ No generated file yet — use "Download file" to build it on demand.</div>';
    if (!filePath) {
      body += `<div class="card"><h3>Details</h3>
        <div class="entry"><span>Status</span><span>${escHtml(product.status)}</span></div>
        <div class="entry"><span>Type</span><span>${escHtml(product.type)}</span></div>
        <div class="entry"><span>Price</span><span>${escHtml(product.price || '—')}</span></div>
        <div class="entry"><span>Theme</span><span>${escHtml(product.theme || '—')}</span></div>
        <div class="entry"><span>Profession</span><span>${escHtml(prof ? prof.name : '—')}</span></div>
        <div class="entry"><span>File path</span><span>${escHtml(product.file_path || 'none')}</span></div></div>`;
    }
    if (realHtml) {
      body += `<div class="card" style="padding:0"><h3 style="padding:14px 18px;border-bottom:1px solid #e2e8f0;">?? Saved HTML</h3><iframe sandbox="allow-same-origin" srcdoc="${escHtml(product.html_content).replace(/"/g, '&quot;')}" style="width:100%;height:460px;border:none;background:white;"></iframe></div>`;
    }
    return res.type('html').send(previewShell(escHtml(product.name) + ' · Preview', body));
  } catch (e) {
    console.error('[PREVIEW] error:', e.message);
    return res.status(500).send(previewShell('Preview Error', `<div class="note">? Could not preview this product: ${escHtml(e.message)}</div>`));
  }
});

// Raster preview image (JPEG mockup) — generated on demand, cached in DB
app.get('/api/products/:id/preview-image', async (req, res) => {
  try {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    let previewPath = (fileFactory.isCurrentCoverPath(product.preview_path) && fs.existsSync(product.preview_path)) ? product.preview_path : null;
    if (!previewPath) previewPath = await fileFactory.ensureProductThumbnail(product);
    if (!previewPath || !fs.existsSync(previewPath)) return res.status(404).json({ error: 'Preview image unavailable for this product' });
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(previewPath)}"`);
    return fs.createReadStream(previewPath).pipe(res);
  } catch (e) {
    console.error('[PREVIEW-IMAGE] error:', e.message);
    return res.status(500).json({ error: e.message });
  }
});

// Lifestyle background (AI photo, images 2-3 in the gallery) — free tier.
app.get('/api/products/:id/lifestyle-image', async (req, res) => {
  try {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const prof = db.prepare('SELECT * FROM professions WHERE id = ?').get(product.profession_id);
    if (!prof) return res.status(404).json({ error: 'Profession not found' });
    const coverArt = require('./services/coverArt');
    const artPath = await coverArt.ensureCoverArt(product, prof);
    if (!artPath || !fs.existsSync(artPath)) return res.status(404).json({ error: 'Lifestyle image unavailable — try again later' });
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(artPath)}"`);
    return fs.createReadStream(artPath).pipe(res);
  } catch (e) {
    console.error('[LIFESTYLE-IMAGE] error:', e.message);
    return res.status(500).json({ error: e.message });
  }
});

// Batch-generate AI lifestyle backgrounds (slow on free tier — background job)
app.post('/api/covers/generate', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '10', 10) || 10, 100);
  const status = String(req.query.status || 'approved');
  const body = req.body || {};
  const ids = (Array.isArray(body.ids) ? body.ids : (body.productId ? [body.productId] : [])).map(Number).filter(Boolean);
  const rows = ids.length
    ? db.prepare(`SELECT * FROM products WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids)
    : db.prepare(`SELECT * FROM products WHERE status = ? ORDER BY id LIMIT ?`).all(status, limit);
  const coverArt = require('./services/coverArt');
  let generated = 0, failed = 0;
  const items = [];
  for (const p of rows) {
    try {
      const prof = db.prepare('SELECT * FROM professions WHERE id = ?').get(p.profession_id);
      if (!prof) { failed++; items.push({ id: p.id, ok: false, reason: 'missing_profession' }); continue; }
      const art = await coverArt.ensureCoverArt(p, prof, {}, { coverClass: String(body.coverClass || 'standard') });
      if (art) { generated++; items.push({ id: p.id, ok: true, art: `/api/products/${p.id}/lifestyle-image` }); }
      else {
        const state = coverArt.coverProviderState() || {};
        failed++;
        items.push({ id: p.id, ok: false, reason: state.reason || 'unknown_error', error: String(state.message || '').slice(0, 200) });
      }
    } catch (e) {
      failed++;
      console.error('[COVERS] #' + p.id + ':', e.message);
      items.push({ id: p.id, ok: false, reason: coverArt.classifyCoverError(e), error: String(e.message || '').slice(0, 200) });
    }
  }
  res.json({ total: rows.length, generated, failed, items });
});

// Bulk-reject trash drafts (keeps approved/listed/sold). Pass ?q= to filter by name.
app.post('/api/review/reject-trash', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const rows = q
      ? db.prepare(`SELECT id, name FROM products WHERE (status = 'draft' OR status = 'pending-review') AND lower(name) LIKE ?`).all(`%${q.toLowerCase()}%`)
      : db.prepare(`SELECT id, name FROM products WHERE status = 'draft' OR status = 'pending-review'`).all();
    let rejected = 0;
    for (const r of rows) {
      db.prepare(`UPDATE products SET status = 'rejected' WHERE id = ?`).run(r.id);
      rejected++;
    }
    db.prepare('INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)')
      .run('bulk_reject', `Rejected ${rejected} trash draft(s)${q ? ` matching "${q}"` : ''}`, 'warning');
    res.json({ rejected });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Cursor-based batches; force rebuilds preserve old previews until replacement.
app.post('/api/previews/generate', async (req, res) => {
  try {
    const { generatePreviewBatch } = require('./services/previewBatch');
    res.json(await generatePreviewBatch(db, p => fileFactory.ensureProductThumbnail(p), req.query));
  } catch (e) {
    res.status(e.message === 'Invalid batch parameter' ? 400 : 500)
      .json({ error: e.message === 'Invalid batch parameter' ? e.message : 'Preview batch failed' });
  }
});

// Render arbitrary edited HTML to a downloadable file (used by the visual editor)
app.post('/api/export/render', async (req, res) => {
  const { html, type, filename } = req.body;
  if (!html) return res.status(400).json({ error: 'No HTML provided' });

  const safeName = (filename || `design-${Date.now()}`).replace(/[^a-z0-9-_]/gi, '');
  try {
    let filePath;
    if (type === 'spreadsheet') {
      return res.status(400).json({ error: 'Spreadsheets export via product page' });
    }
    filePath = await pdfGen.generatePDF(html, `${safeName}.pdf`);
    const abs = path.resolve(filePath);
    if (!fs.existsSync(abs)) return res.status(404).json({ error: 'File not generated' });
    // Stream manually — res.sendFile/res.download have a Windows path bug
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.pdf"`);
    return fs.createReadStream(abs).pipe(res);
  } catch (e) {
    console.error('[RENDER] error:', e.message);
    return res.status(500).json({ error: e.message });
  }
});

app.get('/api/export/profession/:id/zip', (req, res) => {
  const products = db.prepare('SELECT * FROM products WHERE profession_id = ? AND file_path IS NOT NULL').all(req.params.id);
  if (products.length === 0) return res.status(404).json({ error: 'No files to export' });
  
  const files = products.map(p => ({ path: p.file_path, name: path.basename(p.file_path) }));
  const zipPath = zipGen.createZip(files, `profession-${req.params.id}-export.zip`);
  const abs = path.resolve(zipPath);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${path.basename(abs)}"`);
  fs.createReadStream(abs).pipe(res);
});

// ------------------------------------------------------------------------
// CRON: Scheduled Automation
// ------------------------------------------------------------------------
let cronJob = null;
let discoveryCron = null;
let stewardCron = null;
let cycleLock = false;
let discoveryLock = false;

function startCron() {
  if (cronJob) return;
  // Every 6 hours: full automation cycle
  cronJob = cron.schedule('0 */6 * * *', async () => {
    console.log('[CRON] Running automation scan...');
    runAutoCycle();
  }, { scheduled: false });
  
  // Every 2 hours: autonomous discovery sweep (independent of the review gate,
  // so trend-hunting never pauses) + freshness pass for active niches
  discoveryCron = cron.schedule('17 */2 * * *', async () => {
    if (discoveryLock || cycleLock) {
      console.log('[CRON] Discovery sweep skipped — lock held');
      return;
    }
    discoveryLock = true;
    console.log('[CRON] Discovery sweep...');
    try {
      const found = await discovery.sweep(6);
      const fresh = discovery.freshnessPass();
      const fads = await discovery.autoActivateHotFads();
      if (found.length || fresh || fads) {
        db.prepare('INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)')
          .run('discovery_auto', `Sweep: ${found.length} new niche(s), ${fresh} fresh product(s), ${fads} auto-activated fad(s)`, 'success');
      }
    } catch (e) {
      console.error('[CRON] discovery error:', e.message);
    } finally {
      discoveryLock = false;
    }
  }, { scheduled: false });
  
  cronJob.start();
  discoveryCron.start();
  if (!stewardCron) {
    // The surrogate pass: pings the boss (Discord + inbox) at most every 6h.
    stewardCron = cron.schedule('23 */3 * * *', () => { if (stewardEnabled()) runStewardPass().catch(() => {}); });
    stewardCron.start();
  }
  console.log('[CRON] Automation scheduler started (every 6h) + discovery sweep (every 2h) + steward pings (every 3h, cooldown 6h)');
}

app.post('/api/automation/scheduler/start', (req, res) => {
  startCron();
  db.prepare('INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)')
    .run('scheduler_start', 'Cron scheduler activated', 'success');
  res.json({ success: true, message: 'Scheduler started' });
});

app.post('/api/automation/scheduler/stop', (req, res) => {
  if (cronJob) { cronJob.stop(); cronJob = null; }
  if (discoveryCron) { discoveryCron.stop(); discoveryCron = null; }
  if (stewardCron) { stewardCron.stop(); stewardCron = null; }
  db.prepare('INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)')
    .run('scheduler_stop', 'Cron scheduler stopped', 'info');
  res.json({ success: true, message: 'Scheduler stopped' });
});

app.get('/api/automation/status', (req, res) => {
  const pending = db.prepare("SELECT COUNT(*) as c FROM products WHERE status = 'draft' OR status = 'pending-review'").get();
  const isReviewDay = checkIsReviewDay();
  const lastRun = db.prepare('SELECT * FROM automation_log WHERE action = ? ORDER BY created_at DESC LIMIT 1').get('auto_generate') || {};
  const settings = {};
  db.prepare('SELECT * FROM settings').all().forEach(s => settings[s.key] = s.value);
  
  res.json({
    running: !!cronJob,
    // Truthful engine state: when auto_generate is off the scheduler may still
    // exist (started by hand) but nothing will ever be generated — the UI must
    // say "Stopped", not "Running".
    autoGenerate: settings.auto_generate !== 'false',
    effectivelyRunning: !!cronJob && settings.auto_generate !== 'false',
    cycleBusy: !!cycleLock,
    discoveryBusy: !!discoveryLock,
    isReviewDay,
    pendingCount: pending.c,
    lastRun: lastRun.created_at || null,
    autoList: settings.auto_list === 'true',
    reviewInterval: parseInt(settings.review_interval) || 2,
    gumroadQuota: (typeof mp.getGumroadQuota === 'function' ? mp.getGumroadQuota() : null)
  });
});



function checkIsReviewDay() {
  const settings = db.prepare('SELECT * FROM settings WHERE key = ?').get('last_review');
  const lastReview = settings ? new Date(settings.value) : new Date(0);
  const daysSince = (Date.now() - lastReview.getTime()) / (1000 * 60 * 60 * 24);
  const reviewInterval = parseInt(db.prepare('SELECT value FROM settings WHERE key = ?').get('review_interval')?.value || '2');
  return daysSince >= reviewInterval;
}

// ------------------------------------------------------------------------
// AUTO-START: On server boot
// ------------------------------------------------------------------------
function autoStart() {
  if (runtimeConfig.isProduction() && String(process.env.AUTO_START_ENABLED || '').toLowerCase() !== 'true') {
    console.log('[AUTO] Production auto-start is safety-locked; set AUTO_START_ENABLED=true after reviewing production settings.');
    return;
  }
  // Check if auto-start is disabled
  const autoGen = db.prepare('SELECT * FROM settings WHERE key = ?').get('auto_generate');
  if (autoGen && autoGen.value === 'false') {
    console.log('[AUTO] Auto-generation disabled in settings');
    return;
  }
  
  // Default: auto-start the scheduler
  startCron();
  db.prepare('INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)')
    .run('scheduler_auto_start', 'Automation engine auto-started on server boot', 'success');
  console.log('[AUTO] Automation engine auto-started on server boot');
  
  // Run immediate first cycle (trend scan + review gate + publish of approved).
  // runFullCycle still honors the review gate — it skips NEW generation on a
  // review day while continuing to publish already-approved products.
  setTimeout(() => {
    runAutoCycle();
  }, 2000);
}

function getWebhookUrl() {
  const stored = db.prepare('SELECT value FROM settings WHERE key = ?').get('webhook_url')?.value || '';
  return [stored, process.env.DISCORD_WEBHOOK_URL].find(runtimeConfig.isDiscordWebhookUrl) || '';
}

async function runAutoCycle() {
  if (cycleLock) {
    console.log('[AUTO] Cycle already running — skipped');
    return { skipped: true, reason: 'lock' };
  }
  cycleLock = true;
  try {
    return await automationCycle.runFullCycle({
      checkIsReviewDay,
      syncGumroadSales
    });
  } catch (e) {
    console.error('[AUTO] cycle error:', e.message);
    db.prepare('INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)')
      .run('auto_cycle_error', e.message, 'error');
    return { error: e.message };
  } finally {
    cycleLock = false;
  }
}

// (Website template + recovery prompts now live in services/fileFactory.js)

// ------------------------------------------------------------------------
// API: SETUP / ONBOARDING STATUS
// ------------------------------------------------------------------------
// Gumroad + Etsy live-test caches (60s) so /setup shows the REAL connection state
let gumroadTestCache = { at: 0, result: null };
let etsyTestCache = { at: 0, result: null };
app.get('/api/setup/status', async (req, res) => {
  const mpStatus = mp.getMarketplaceStatus();

  if (mpStatus.gumroad.configured) {
    if (Date.now() - gumroadTestCache.at > 60000) {
      gumroadTestCache.result = await mp.testGumroadConnection().catch(e => ({ ok: false, message: e.message }));
      gumroadTestCache.at = Date.now();
    }
    mpStatus.gumroad = {
      ...mpStatus.gumroad,
      connected: !!gumroadTestCache.result?.ok,
      message: gumroadTestCache.result?.message || mpStatus.gumroad.message
    };
  }

  if (mpStatus.etsy.configured) {
    if (Date.now() - etsyTestCache.at > 60000) {
      etsyTestCache.result = await mp.testEtsyConnection().catch(e => ({ ok: false, message: e.message }));
      etsyTestCache.at = Date.now();
    }
    mpStatus.etsy = {
      ...mpStatus.etsy,
      connected: !!etsyTestCache.result?.ok,
      message: etsyTestCache.result?.message || mpStatus.etsy.message
    };
  }

  const settings = db.prepare('SELECT * FROM settings WHERE key IN (?, ?)').all('webhook_url', 'notify_email');
  const webhook = settings.find(s => s.key === 'webhook_url')?.value || process.env.DISCORD_WEBHOOK_URL || '';
  const email = settings.find(s => s.key === 'notify_email')?.value || '';

  res.json({
    etsy: mpStatus.etsy,
    gumroad: mpStatus.gumroad,
    discord: { configured: !!webhook, url: webhook ? '***' : null },
    email: { configured: !!email, address: email ? '***' : null },
    allReady: mpStatus.etsy.connected && mpStatus.gumroad.connected,
    // Buffer bridge (interim Pinterest channel): config surface, no secrets.
    buffer: require('./services/bufferBridge').bufferStatus()
  });
});

// Set/rotate the Buffer bridge credentials from the console (values from the
// Buffer dashboard: Settings → API). Values go into the settings table.
app.post('/api/setup/buffer', (req, res) => {
  try {
    const { token, channelId, boardServiceId, publicBaseUrl } = req.body || {};
    if (!token || typeof token !== 'string') return res.status(400).json({ error: 'token required' });
    const put = (k, v) => {
      if (v === null || typeof v !== 'string' || !v.trim()) { db.prepare('DELETE FROM settings WHERE key = ?').run(k); return; }
      db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(k, v.trim());
    };
    put('buffer_api_token', token);
    put('buffer_channel_id', channelId || null);
    put('buffer_board_service_id', boardServiceId || null);
    if (publicBaseUrl !== undefined) put('public_base_url', publicBaseUrl || null);
    res.json({ ok: true, status: require('./services/bufferBridge').bufferStatus() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ------------------------------------------------------------------------
// API: LAUNCH READINESS
// Gate: readiness reveals configuration POSTURE (which keys are set, backlog
// counts, OAuth state) but no secret values. It is auth-gated by default; set
// READYNESS_PUBLIC=true only if an external monitor must poll it.
// ------------------------------------------------------------------------
app.get('/api/health/readiness', (req, res) => {
  if (!auth.enabled() || String(process.env.READYNESS_PUBLIC).toLowerCase() === 'true') {
    return res.json(readiness.buildReadinessReport());
  }
  if (!auth.isValidToken(auth.tokenFrom(req))) {
    return res.status(401).json({ error: 'Unauthorized — set READYNESS_PUBLIC=true to expose readiness to monitors.' });
  }
  res.json(readiness.buildReadinessReport());
});

// ════════════════════════════════════════════════════════════════════════
// FLIGHT DECK CONSOLE — overview, action registry, run stream
// ════════════════════════════════════════════════════════════════════════
const { EventEmitter } = require('node:events');
const actionRegistry = require('./services/actionRegistry');
const biService = require('./services/bi');
const optimizer = require('./services/listingOptimizer');
const consoleBus = new EventEmitter();
consoleBus.setMaxListeners(100);
function consoleEmit(evt) { try { consoleBus.emit('event', evt); } catch (e) { /* never break a run */ } }

// ── Shared action helpers used by BOTH the console and the REST routes ──
async function publishQueuedBundles() {
  const pending = db.prepare("SELECT * FROM products WHERE type = 'bundle' AND status = 'approved' AND marketplace_id IS NULL").all();
  let published = 0, failed = 0;
  const errors = [];
  for (const p of pending) {
    try {
      const result = await mp.publishProduct(p);
      db.prepare('UPDATE products SET status = ?, marketplace = ?, marketplace_id = ? WHERE id = ?')
        .run('listed', result.platform, result.listingId || null, p.id);
      try { await mp.attachGumroadCover(result.listingId, bundles.coverForType('bundle')); }
      catch (e) { console.error('[BUNDLES] cover skipped:', e.message); }
      db.prepare('INSERT INTO automation_log (action, product_id, details, status) VALUES (?, ?, ?, ?)')
        .run('published', p.id, `Bundle live on ${result.platform}`, 'success');
      published++;
    } catch (e) {
      failed++;
      errors.push(`${p.name}: ${e.message}`);
      db.prepare('INSERT INTO automation_log (action, product_id, details, status) VALUES (?, ?, ?, ?)')
        .run('publish_error', p.id, e.message, 'error');
    }
  }
  return { published, failed, errors };
}

async function deployLeadMagnet() {
  const existing = db.prepare("SELECT value FROM settings WHERE key = 'leadmagnet_url'").get();
  if (existing && existing.value) return { alreadyLive: true, url: existing.value };
  const product = await bundles.buildLeadMagnet();
  const result = await mp.publishFreeGumroad(product);
  db.prepare('UPDATE products SET status = ?, marketplace = ?, marketplace_id = ? WHERE id = ?')
    .run('listed', result.platform, result.listingId, product.id);
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('leadmagnet_url', ?)").run(result.url || '');
  try { await mp.attachGumroadCover(result.listingId, bundles.coverForType('leadmagnet')); } catch (e) { /* best effort */ }
  db.prepare('INSERT INTO automation_log (action, product_id, details, status) VALUES (?, ?, ?, ?)')
    .run('published', product.id, 'Lead magnet live (free email capture)', 'success');
  return { success: true, url: result.url };
}

function approveAllPending() {
  const result = db.prepare("UPDATE products SET status = 'approved' WHERE status = 'draft' OR status = 'pending-review'").run();
  db.prepare('INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)')
    .run('batch_approve', `Approved ${result.changes} products`, 'success');
  return { approved: result.changes };
}

function dedupeQueue() {
  const groups = db.prepare(`
    SELECT profession_id, type, name, COUNT(*) c
    FROM products
    WHERE status IN ('draft','pending-review')
    GROUP BY profession_id, type, name
    HAVING c > 1
  `).all();
  const removed = [];
  const keep = [];
  for (const g of groups) {
    const rows = db.prepare(`
      SELECT id, file_path, preview_path, html_content FROM products
      WHERE status IN ('draft','pending-review') AND profession_id = ? AND type = ? AND name = ?
      ORDER BY id DESC
    `).all(g.profession_id, g.type, g.name);
    const keeper = rows.find(r => r.file_path) || rows[0];
    keep.push(keeper.id);
    for (const r of rows) {
      if (r.id !== keeper.id) {
        db.prepare('DELETE FROM products WHERE id = ?').run(r.id);
        removed.push(r.id);
      }
    }
  }
  const remaining = db.prepare("SELECT COUNT(*) c FROM products WHERE status IN ('draft','pending-review')").get().c;
  db.prepare('INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)')
    .run('dedupe', `Removed ${removed.length} duplicate drafts — kept ${keep.length} (${remaining} pending now)`, 'success');
  return { groups: groups.length, removed: removed.length, kept: keep.length, remaining };
}

function rejectTrashDrafts(q) {
  const filter = String(q || '').trim();
  const rows = filter
    ? db.prepare("SELECT id FROM products WHERE (status = 'draft' OR status = 'pending-review') AND lower(name) LIKE ?").all(`%${filter.toLowerCase()}%`)
    : db.prepare("SELECT id FROM products WHERE status = 'draft' OR status = 'pending-review'").all();
  let rejected = 0;
  for (const r of rows) {
    db.prepare("UPDATE products SET status = 'rejected' WHERE id = ?").run(r.id);
    rejected++;
  }
  db.prepare('INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)')
    .run('bulk_reject', `Rejected ${rejected} trash draft(s)${filter ? ` matching "${filter}"` : ''}`, 'warning');
  return { rejected };
}

function backupDatabase() {
  const dir = runtimeConfig.resolvePersistentDir('backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(dir, `profession-box-${stamp}.db`);
  const safe = dest.replace(/\\/g, '/').replace(/'/g, "''");
  db.exec(`VACUUM INTO '${safe}'`);
  return { path: path.relative(path.join(__dirname, '..'), dest), bytes: fs.statSync(dest).size };
}

function slugifyNiche(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
}

async function generateForNiche(niche, count, step = () => {}, opts = {}) {
  let prof = db.prepare('SELECT * FROM professions WHERE lower(name) = lower(?)').get(niche)
    || db.prepare('SELECT * FROM professions WHERE lower(name) LIKE lower(?)').get(`%${niche}%`);
  if (!prof) {
    const slug = slugifyNiche(niche) || `niche-${Date.now()}`;
    // Real category-matched service plan — empty services rendered as generic
    // filler inside every deliverable (the "Standard Service Package" bug).
    const nicheServices = require('./services/nicheServices');
    const id = db.prepare('INSERT INTO professions (emoji, name, slug, status, tier, colors, services, hashtags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run('🎯', niche, slug, 'researching', 'passion',
        JSON.stringify({ primary: '#0f172a', secondary: '#2dd4bf', accent: '#8b5cf6', bg: '#f8fafc' }), nicheServices.servicesForNiche(niche), '[]').lastInsertRowid;
    prof = db.prepare('SELECT * FROM professions WHERE id = ?').get(id);
    step(`created niche "${niche}"`);
  } else {
    step(`matched existing niche "${prof.name}"`);
  }
  const types = opts.type ? [String(opts.type)] : automationCycle.VARY_TYPES;
  const created = [];
  for (let i = 0; i < count; i++) {
    const have = new Set(db.prepare('SELECT type FROM products WHERE profession_id = ?').all(prof.id).map(r => r.type));
    const missing = types.filter(t => !have.has(t));
    const pool = missing.length ? missing : types;
    const type = pool[i % pool.length];
    try {
      const pid = draftProduct(prof, type, {
        origin: opts.origin || 'engine',
        brief: opts.brief || undefined,
        price: opts.price || undefined,
        theme: opts.theme || undefined,
        name: opts.name ? (count > 1 ? `${opts.name} — ${type}` : opts.name) : undefined
      });
      if (pid) {
        created.push({ id: pid, type });
        step(`drafted ${type}`, 'success');
        // Fire-and-forget concept enrichment: honors the buyer's brief when the
        // model layer is on, returns null (template stays) when it's off.
        if (opts.brief) require('./services/conceptEngine').enrichProduct(pid, opts.brief).catch(() => {});
      } else {
        step(`skipped ${type} — draft already queued`);
      }
    } catch (e) {
      step(`failed ${type}`, 'error', e.message);
    }
  }
  return { niche: prof.name, professionId: prof.id, created };
}

// ── Named action handlers (deterministic; no AI required) ──
const consoleHandlers = {
  'sweep': async (input, step) => {
    step('scanning live sources');
    const found = await discovery.sweep(8);
    step(`found ${found.length} candidate(s)`, 'success');
    discovery.freshnessPass();
    return { count: found.length, names: found.map(t => t.name) };
  },
  'full-cycle': async (input, step) => {
    step('running full automation cycle');
    return await runAutoCycle();
  },
  'generate-for-niche': async (input, step) => generateForNiche(input.niche, input.count || 3, step, { brief: input.brief }),
  'approve-all': async (input, step) => { const r = approveAllPending(); step(`approved ${r.approved}`, 'success'); return r; },
  'reject-trash': async (input, step) => { const r = rejectTrashDrafts(input.q); step(`rejected ${r.rejected}`, 'success'); return r; },
  'dedupe-queue': async (input, step) => { const r = dedupeQueue(); step(`removed ${r.removed} clone(s)`, 'success'); return r; },
  'push-bundles': async (input, step) => {
    step('building toolkits');
    await bundles.generateAllBundles();
    step('publishing queued bundles');
    return await publishQueuedBundles();
  },
  'lead-magnet': async (input, step) => { step('building starter pack'); return await deployLeadMagnet(); },
  'sync-sales': async (input, step) => { step('syncing Gumroad sales'); return await syncGumroadSales(); },
  'amplify-winners': async (input, step) => {
    step('amplifying proven bestsellers');
    const winnerEngine = require('./services/winnerEngine');
    const res = await winnerEngine.amplifyWinners({ minSales: input.minSales || 2 });
    step(`amplified ${res.amplified} products across ${res.winnersCount} winner(s)`, 'success');
    return res;
  },
  'promote-pricing-winners': async (input, step) => {
    step('evaluating price test elasticity');
    const res = await pricingEngine.autoPromoteWinners();
    step(`auto-promoted ${res.length} winning price tier(s)`, 'success');
    return { count: res.length, promoted: res };
  },
  'scrape-competitor': async (input, step) => {
    step(`scraping competitor target: ${input.target}`);
    const competitorEngine = require('./services/competitorEngine');
    const analysis = await competitorEngine.scrapeCompetitor(input.target);
    step(`analyzed "${analysis.title}" - generating counter products`);
    const gen = await competitorEngine.generateCounterProducts(analysis, input.count || 2);
    step(`generated ${gen.generated.length} counter-positioned product(s)`, 'success');
    return gen;
  },
  'rebuild-covers': async (input, step) => {
    const { generatePreviewBatch } = require('./services/previewBatch');
    step(`rebuilding covers (limit ${input.limit})`);
    return await generatePreviewBatch(db, p => fileFactory.ensureProductThumbnail(p), { limit: input.limit, force: input.force ? '1' : '0' });
  },
  'set-auto-list': async (input, step) => {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('auto_list', ?)").run(String(!!input.value));
    db.prepare('INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)').run('auto_list', `auto_list = ${!!input.value}`, 'info');
    step(`auto_list = ${!!input.value}`, 'success');
    return { autoList: !!input.value };
  },
  'serp-scan': async (input, step) => {
    const radar = require('./services/trendRadar');
    const inserted = await radar.scanLiveTrends(4);
    step(`inserted ${inserted.length}`, 'success');
    return { inserted: inserted.length };
  },
  'expand-discovery': async (input, step) => {
    const radar = require('./services/trendRadar');
    const r = await radar.discoverTerms({ depth: 1, maxNew: 30 });
    step(`discovered ${r.discovered.length} new term(s) from ${r.scanned} scanned`, 'success');
    return { discovered: r.discovered.length, scanned: r.scanned };
  },
  'drain-search-queue': async (input, step) => {
    const radar = require('./services/trendRadar');
    const n = await radar.drainSearchQueue(10);
    step(`reprocessed ${n}`, 'success');
    return { reprocessed: n };
  },
  'backup-database': async (input, step) => {
    step('writing backup');
    const r = backupDatabase();
    step('backup written', 'success');
    return r;
  },
  'quality-audit': async (input, step) => {
    const qe = require('./services/qualityEngine');
    step(`auditing catalog (status: ${input.status || 'draft'}, limit: ${input.limit || 50})`);
    const res = qe.auditCatalog(input.status || 'draft', input.limit || 50);
    step(`audited ${res.totalAudited} items: ${res.flightReadyCount} FLIGHT_READY, ${res.groundedCount} GROUNDED (avg ${res.avgScore} pts)`, 'success');
    return res;
  },
  'optimize-weak': async (input, step) => {
    const optimizer = require('./services/listingOptimizer');
    step(`optimizing weakest listings (limit: ${input.limit || 20})`);
    const res = await optimizer.optimizeWeak(input.limit || 20);
    step(`optimized ${res.optimized} of ${res.scanned} listings (${res.deployed} deployed)`, 'success');
    return res;
  },
  'wipe-catalog': async (input, step) => {
    const recovery = require('./services/catalogRecovery');
    step('taking database backup and snapshotting products for 30-min restore window');
    const res = recovery.wipeCatalog({ restoreWindowMinutes: input.restoreWindowMinutes || 30 });
    step(`wiped ${res.wipedCount} products (snapshot #${res.snapshotId}, expires in ${res.restoreWindowMinutes}m); re-seeded ${res.reseededCount} flagship tools`, 'success');
    return res;
  },
  'restore-catalog': async (input, step) => {
    const recovery = require('./services/catalogRecovery');
    step('restoring products from active snapshot');
    const res = recovery.restoreCatalog();
    if (!res.ok) throw new Error(res.error);
    step(`restored ${res.restoredCount} products from snapshot #${res.snapshotId}`, 'success');
    return res;
  },
  'design-sweep': async (input, step) => {
    const critic = require('./services/designCritic');
    step(`sweeping recent products (limit ${input.limit || 25})`);
    const res = await critic.sweepCatalog({ limit: input.limit || 25 });
    const scored = res.results.filter(r => Number.isFinite(r.score)).length;
    step(`swept ${res.scanned}: ${scored} scored, ${res.results.filter(r => r.action === 'reskinned').length} reskinned`, 'success');
    return res;
  },
  'design-critique': async (input, step) => {
    const critic = require('./services/designCritic');
    step(`critiquing product #${input.productId}`);
    const res = await critic.critiqueProduct(input.productId, { force: true, revise: true });
    if (!res) throw new Error('Critique failed (see server log)');
    if (res.scores) step(`scored ${res.scores.overall}/10 (${res.status})`, 'success');
    else step(`no score — ${res.reason || 'critique unavailable'} (unscored ≠ passed)`, 'warn');
    return res;
  },
  'reskin-product': async (input, step) => {
    const critic = require('./services/designCritic');
    step(`reskinning product #${input.productId} (content stays untouched)`);
    const res = await critic.reskinProduct(input.productId);
    if (!res.ok) throw new Error(res.error || 'Reskin failed');
    step('re-rendered under a fresh design brief', 'success');
    return res;
  },
  'reskin-weak': async (input, step) => {
    const critic = require('./services/designCritic');
    const cycle = require('./services/automationCycle');
    const candidates = critic.autoReskinCandidates({ limit: 5 });
    step(`${candidates.length} weak-selling design(s) eligible for a reskin`);
    let reskinned = 0;
    for (const c of candidates) {
      const result = await critic.reskinProduct(c.productId);
      critic.markAutoReskin(c.productId, result);
      if (result && result.ok) reskinned++;
      step(`#${c.productId} ${String(c.name).slice(0, 40)} (score ${c.score}) → ${result && result.ok ? 'reskinned' : 'failed'}`, result && result.ok ? 'success' : 'warn');
    }
    return { candidates: candidates.length, reskinned };
  }
};

function buildOverview() {
  const products = db.prepare('SELECT status, type, price FROM products').all();
  const countStatus = s => products.filter(p => p.status === s).length;
  const listed = products.filter(p => p.status === 'listed' || p.status === 'published');
  const priceOf = p => parseFloat(String(p.price || '0').replace(/[^0-9.]/g, '')) || 0;
  const estimatedRevenue = listed.reduce((sum, p) => sum + priceOf(p), 0);
  const draft = countStatus('draft');
  const review = products.filter(p => p.status === 'pending-review' || p.status === 'reviewing').length;
  const approved = countStatus('approved');
  const professions = db.prepare('SELECT COUNT(*) c FROM professions').get().c;
  const trends = db.prepare('SELECT COUNT(*) c FROM trends').get().c;
  const activeTrends = db.prepare('SELECT COUNT(*) c FROM trends WHERE activated = 1').get().c;
  const realSales = db.prepare('SELECT COUNT(*) c FROM metrics WHERE sales > 0').get().c;
  const realRevenue = db.prepare('SELECT COALESCE(SUM(revenue), 0) r FROM metrics').get().r;

  const capRow = db.prepare("SELECT value FROM settings WHERE key = 'etsy_daily_cap'").get();
  const pubRow = db.prepare("SELECT value FROM settings WHERE key = 'etsy_published_today'").get();
  const cap = capRow ? parseInt(capRow.value) || 20 : 20; // default 20/day
  const publishedToday = pubRow ? parseInt(pubRow.value) || 0 : 0;
  const autoList = (db.prepare("SELECT value FROM settings WHERE key = 'auto_list'").get() || {}).value === 'true';
  const autoGenerate = (db.prepare("SELECT value FROM settings WHERE key = 'auto_generate'").get() || {}).value !== 'false';

  const byType = {};
  for (const p of products) {
    const t = p.type || 'unknown';
    if (!byType[t]) byType[t] = { total: 0, listed: 0, revenue: 0 };
    byType[t].total++;
    if (p.status === 'listed') { byType[t].listed++; byType[t].revenue += priceOf(p); }
  }
  const topTypes = Object.entries(byType)
    .sort((a, b) => b[1].listed - a[1].listed)
    .slice(0, 8)
    .map(([type, d]) => ({ type, ...d }));

  const topNiches = db.prepare(`
    SELECT COALESCE(pr.name, 'Unknown') AS name, COUNT(*) AS total,
           SUM(CASE WHEN p.status = 'listed' THEN 1 ELSE 0 END) AS listed
    FROM products p LEFT JOIN professions pr ON p.profession_id = pr.id
    GROUP BY pr.name ORDER BY listed DESC, total DESC LIMIT 8
  `).all();

  let ready = { ok: false, ready: false, issues: [], summary: {} };
  try { ready = readiness.buildReadinessReport(); } catch (e) { /* keep default */ }

  const cfg = require('./services/modelConfig');
  const activity = db.prepare('SELECT action, details, status, created_at FROM automation_log ORDER BY id DESC LIMIT 12').all();

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    engine: {
      // Truthful: a scheduled cron with auto_generate off will never generate,
      // so the engine is NOT effectively running.
      running: !!cronJob && autoGenerate,
      cronScheduled: !!cronJob,
      autoGenerate,
      cycleBusy: !!cycleLock,
      discoveryBusy: !!discoveryLock,
      isReviewDay: checkIsReviewDay(),
      autoList
    },
    counts: {
      products: products.length, professions, trends, activeTrends,
      draft, review, approved, listed: listed.length,
      rejected: countStatus('rejected'), archived: countStatus('archived')
    },
    funnel: { discover: professions, generate: draft, review, approve: approved, publish: listed.length },
    revenue: { estimated: estimatedRevenue, realSales, realRevenue },
    etsy: { cap, published: publishedToday, remaining: Math.max(0, cap - publishedToday) },
    marketplace: mp.getMarketplaceStatus(),
    model: { enabled: !!cfg.enabled, diagnosis: cfg.enabled ? 'AI layer enabled' : 'AI layer off' },
    readiness: { ok: ready.ok, ready: ready.ready, issues: ready.issues, summary: ready.summary },
    topTypes,
    topNiches,
    activity
  };
}

app.get('/api/console/actions', (req, res) => {
  res.json({ actions: actionRegistry.list() });
});

app.get('/api/console/overview', (req, res) => {
  try { res.json(buildOverview()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// BI aggregates: shop health /100, 7d-vs-prior deltas, 14d revenue series,
// listing health (zero-sale + SEO weakness + velocity badges) and the
// rule-based Opportunity/Risk/Action insights. All real tables, no synthetics.
app.get('/api/console/bi', (req, res) => {
  try { res.json(biService.build()); }
  catch (e) {
    console.error('[ERROR] GET /api/console/bi -> 500:', e.message); // never swallow silently
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/console/runs', (req, res) => {
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  try { res.json({ runs: actionRegistry.recentRuns(limit) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Server-Sent Events: live run stream for the Flight Deck.
app.get('/api/console/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
  const send = (event, data) => {
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch (e) { /* client gone */ }
  };
  send('hello', { at: new Date().toISOString() });
  const onEvent = evt => send('run', evt);
  consoleBus.on('event', onEvent);
  const heartbeat = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) { /* ignore */ } }, 15000);
  req.on('close', () => { clearInterval(heartbeat); consoleBus.off('event', onEvent); });
});

app.post('/api/console/run', async (req, res) => {
  const { action, input } = req.body || {};
  try {
    const result = await actionRegistry.execute(action, consoleHandlers, input, consoleEmit);
    res.json({ ok: result.status === 'success', ...result });
  } catch (e) {
    const status = e.code === 'VALIDATION' || e.code === 'UNKNOWN_ACTION' ? 400
      : e.code === 'ALREADY_RUNNING' ? 409 : 500;
    res.status(status).json({ ok: false, error: e.message, code: e.code || null, runId: e.runId || null });
  }
});

// ------------------------------------------------------------------------
// ── WORKER MEMORY + BOSS CHANNEL (persistent surrogate state) ────────────
const workerStore = require('./services/workerMemory').createWorkerStore(db);
const bossChannel = require('./services/bossChannel');
const steward = require('./services/steward');

// "Hey boss" Discord ping — one-way webhook; the boss answers in the console.
async function pingBoss(ask) {
  const url = getWebhookUrl();
  if (!url || !ask) return false;
  return notifier.sendDiscord(url, steward.formatAskMessage(ask));
}

function stewardEnabled() {
  const s = db.prepare('SELECT value FROM settings WHERE key = ?').get('steward_enabled');
  return s ? s.value !== 'false' : true; // on by default — the surrogate should speak up
}

function buildStewardBrief() {
  const brief = {
    queue: db.prepare(`SELECT COUNT(*) c FROM products WHERE status IN ('draft', 'pending-review')`).get().c,
    approved: db.prepare(`SELECT COUNT(*) c FROM products WHERE status = 'approved'`).get().c,
    products: db.prepare(`SELECT COUNT(*) c FROM products`).get().c,
    weak: 0, revenue7d: null, sales7d: null,
    pendingAsks: workerStore.pendingCount(),
    lastAskAtMs: workerStore.lastAskAtMs(),
    trends: db.prepare('SELECT * FROM trends ORDER BY velocity_pct DESC LIMIT 8').all()
  };
  try {
    const bi = biService.build();
    brief.weak = (bi.listing.weakestSeo.length || 0) + (bi.listing.zeroSale.length || 0);
    brief.revenue7d = bi.deltas.revenue.value;
    brief.sales7d = bi.deltas.sales.value;
  } catch (e) { /* brief stays partial */ }
  return brief;
}

// The surrogate pass: look at real state, and if something is worth the
// boss's eyes, ask — with a Discord ping and a Boss-inbox card.
async function runStewardPass({ force = false } = {}) {
  try {
    if (!getWebhookUrl()) return { error: 'No valid Discord webhook configured; no pending decision was created.' };
    const proposal = steward.planAsk(buildStewardBrief(), Date.now(), { force });
    if (!proposal) return { skipped: 'nothing worth pinging about' };
    const result = await bossChannel.createNotifiedAsk({
      store: workerStore,
      input: { question: proposal.question, detail: proposal.detail, options: proposal.options, source: 'steward' },
      notify: pingBoss
    });
    if (result.error) return result;
    db.prepare('INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)').run('steward_ask', result.ask.question, 'info');
    return result;
  } catch (e) {
    console.error('[STEWARD]', e.message);
    return { error: e.message };
  }
}

app.get('/api/worker/status', (req, res) => {
  res.json({
    discordConfigured: !!getWebhookUrl(),
    stewardEnabled: stewardEnabled(),
    pendingAsks: workerStore.pendingCount(),
    memories: workerStore.listMemories(200).length
  });
});

app.get('/api/worker/memory', (req, res) => res.json({ memories: workerStore.listMemories(req.query.limit) }));
app.post('/api/worker/memory', (req, res) => {
  const b = req.body || {};
  const m = workerStore.remember({ kind: b.kind, content: b.content, pinned: !!b.pinned });
  if (!m) return res.status(400).json({ error: 'content is required' });
  res.json({ memory: m });
});
app.post('/api/worker/memory/:id/pin', (req, res) => {
  const m = workerStore.pinMemory(req.params.id, !!(req.body || {}).pinned);
  if (!m) return res.status(404).json({ error: 'not found' });
  res.json({ memory: m });
});
app.delete('/api/worker/memory/:id', (req, res) => {
  res.json({ ok: workerStore.forgetMemory(req.params.id) });
});

app.get('/api/worker/asks', (req, res) => {
  res.json({ asks: workerStore.listAsks(req.query.status || null, parseInt(req.query.limit, 10) || 20) });
});
// The boss's answer. If the chosen option carries an action, it is returned
// and replayed by the client through the confirmed-tool path (same spine).
app.post('/api/worker/asks/:id/answer', (req, res) => {
  const b = req.body || {};
  const r = workerStore.answerAsk(req.params.id, { answer: b.answer || '', optionIndex: b.optionIndex != null ? Number(b.optionIndex) : null });
  if (!r) return res.status(404).json({ error: 'ask not found' });
  res.json(r);
});
app.post('/api/worker/asks/:id/dismiss', (req, res) => {
  const a = workerStore.dismissAsk(req.params.id);
  if (!a) return res.status(404).json({ error: 'ask not found' });
  res.json({ ask: a });
});
app.post('/api/worker/notify-test', async (req, res) => {
  const url = getWebhookUrl();
  if (!url) return res.status(400).json({ error: 'No Discord webhook configured (System → Boss channel).' });
  const ok = await notifier.sendDiscord(url, '🤖 **Hey boss** — test ping from your NicheGate surrogate. The channel works.');
  res.status(ok ? 200 : 502).json({ sent: ok, error: ok ? null : 'Discord delivery failed; check the webhook configuration and service logs.' });
});
app.post('/api/worker/steward/run', async (req, res) => {
  if (!stewardEnabled()) return res.json({ skipped: 'steward disabled' });
  res.json(await runStewardPass({ force: true }));
});

// API: CONSOLE AGENT — the in-app AI worker.
//
// Executes the same tasks as the console: registered actions (via the
// actionRegistry spine), product status/publish/Etsy push, trend ops and the
// listing optimizer — each tool mirrors the logic of the corresponding REST
// route above. Destructive tools (delete_product, reject-trash) are gated
// behind an operator confirm round-trip (agentWorker.needsConfirm).
//
// Nothing here requires the AI layer: with MODEL_ENABLED=false the worker's
// deterministic planner still executes real tasks. AI calls never throw.
// ------------------------------------------------------------------------
app.post('/api/console/agent', async (req, res) => {
  try {
    const body = req.body || {};
    const message = String(body.message || '').slice(0, 1000);
    const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
    const confirmCall = body.confirmCall && typeof body.confirmCall === 'object' ? body.confirmCall : null;
    const productRef = body.productRef && typeof body.productRef === 'object' ? body.productRef : null;
    const selection = Array.isArray(body.selection) ? body.selection.map(Number).filter(Boolean).slice(0, 50) : [];
    if (!message.trim() && !confirmCall) return res.status(400).json({ error: 'message is required' });

    const agentWorker = require('./services/agentWorker');

    const tools = {
      run_action: async (a) => {
        const name = String(a.name || '');
        if (!actionRegistry.get(name)) return { error: `unknown action: ${name}` };
        const r = await actionRegistry.execute(name, consoleHandlers, a.input || {}, consoleEmit);
        return { runId: r.runId, action: r.action, status: r.status, result: r.result, error: r.error || null };
      },
      snapshot: async () => {
        const o = buildOverview();
        let bi = null;
        try { bi = biService.build(); } catch (e) { /* degrade: counts still answer */ }
        return {
          counts: o.counts, revenue: o.revenue, etsy: o.etsy, engine: o.engine,
          health: bi ? bi.health : null,
          insights: bi ? bi.insights : null,
          deltas: bi ? bi.deltas : null,
          trends: trends.getAllTrends().slice(0, 5).map(t => ({
            id: t.id, name: t.name, grade: t.grade || t.verdict || null,
            phase: t.phase, velocity: t.velocity, activated: !!t.activated
          }))
        };
      },
      list_products: async (a) => {
        const limit = Math.min(50, Math.max(1, parseInt(a.limit) || 10));
        let rows = db.prepare(`
          SELECT p.id, p.name, p.type, p.price, p.status, p.marketplace, p.created_at, pr.name AS prof_name
          FROM products p LEFT JOIN professions pr ON p.profession_id = pr.id
          ORDER BY p.created_at DESC LIMIT 300`).all();
        if (a.status && agentWorker.STATUSES.has(String(a.status))) rows = rows.filter(r => r.status === a.status);
        if (a.q) {
          const q = String(a.q).toLowerCase();
          rows = rows.filter(r => String(r.name || '').toLowerCase().includes(q));
        }
        return { total: rows.length, products: rows.slice(0, limit) };
      },
      list_trends: async () => ({
        trends: trends.getAllTrends().slice(0, 30).map(t => ({
          id: t.id, name: t.name, emoji: t.emoji, grade: t.grade || t.verdict || null,
          phase: t.phase, velocity: t.velocity, window: t.window, est_revenue: t.est_revenue,
          activated: !!t.activated, detected_at: t.detected_at
        }))
      }),
      set_status: async (a) => {
        const id = parseInt(a.id);
        const status = String(a.status || '');
        if (!id || !agentWorker.STATUSES.has(status)) return { error: 'id and a valid status are required' };
        const p = db.prepare('SELECT id, name, status FROM products WHERE id = ?').get(id);
        if (!p) return { error: `product ${id} not found` };
        db.prepare('UPDATE products SET status = ? WHERE id = ?').run(status, id);
        db.prepare('INSERT INTO automation_log (action, product_id, details, status) VALUES (?, ?, ?, ?)')
          .run('status_change', id, `${p.status} → ${status}`, 'info');
        return { id, name: p.name, from: p.status, to: status };
      },
      generate: async (a) => {
        const idea = String(a.idea || '').trim().slice(0, 120);
        if (!idea) return { error: 'idea is required' };
        const count = Math.min(6, Math.max(1, parseInt(a.count) || 1));
        const r = await generateForNiche(idea, count, () => {}, { origin: 'manual', name: idea });
        return { niche: r.niche, created: r.created };
      },
      generate_for_trend: async (a) => {
        const id = parseInt(a.trendId);
        const trend = trends.getAllTrends().find(t => t.id == id);
        if (!trend) return { error: `trend ${a.trendId} not found` };
        const count = Math.min(6, Math.max(1, parseInt(a.count) || 3));
        const r = await generateForNiche(trend.niche || trend.name, count, () => {}, { origin: 'engine' });
        return { niche: r.niche, created: r.created };
      },
      publish: async (a) => {
        const id = parseInt(a.id);
        const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
        if (!product) return { error: `product ${a.id} not found` };
        if (product.status !== 'approved') return { error: `product ${id} must be approved first (now: ${product.status})` };
        try {
          const result = await mp.publishProduct(product);
          db.prepare('UPDATE products SET status = ?, marketplace = ?, marketplace_id = ? WHERE id = ?')
            .run('listed', result.platform, result.listingId || null, product.id);
          db.prepare('INSERT INTO automation_log (action, product_id, details, status) VALUES (?, ?, ?, ?)')
            .run('published', product.id, `Listed on ${result.platform}`, 'success');
          return { id, name: product.name, platform: result.platform, listingId: result.listingId || null };
        } catch (e) {
          await alertPublishError(product.id, e.message);
          return { error: e.message };
        }
      },
      push_etsy: async (a) => {
        const id = parseInt(a.id);
        const capRow = db.prepare("SELECT value FROM settings WHERE key = 'etsy_daily_cap'").get();
        const pubRow = db.prepare("SELECT value FROM settings WHERE key = 'etsy_published_today'").get();
        const capNum = capRow ? parseInt(capRow.value) || 20 : 20;
        const pubNum = pubRow ? parseInt(pubRow.value) || 0 : 0;
        if (pubNum >= capNum) return { error: `Daily Etsy limit reached (${pubNum}/${capNum}). Resets tomorrow.` };
        const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
        if (!product) return { error: `product ${a.id} not found` };
        const result = await mp.publishToEtsy(product);
        if (result && result.listing_id) {
          db.prepare("UPDATE products SET status = 'listed' WHERE id = ?").run(product.id);
          db.prepare("UPDATE settings SET value = ? WHERE key = 'etsy_published_today'").run(String(pubNum + 1));
          return { id, listing_id: result.listing_id, remaining: capNum - pubNum - 1 };
        }
        return { error: 'Failed to publish to Etsy', details: result || null };
      },
      activate_trend: async (a) => {
        const id = parseInt(a.trendId);
        const trend = trends.getAllTrends().find(t => t.id == id);
        if (!trend) return { error: `trend ${a.trendId} not found` };
        try { vetting.assertActivatable(trend, { force: false }); }
        catch (e) { return { error: e.message, vet: e.vet || null }; }
        const prof = trends.activateTrend(String(id));
        let generated = 0;
        if (prof) generated = await discovery.generateProductsForTrend(prof.id, trend);
        return { activated: true, name: trend.name, productsGenerated: generated };
      },
      optimize: async (a) => {
        const product = db.prepare('SELECT * FROM products WHERE id = ?').get(parseInt(a.id));
        if (!product) return { error: `product ${a.id} not found` };
        return await optimizer.apply(product, { deploy: true });
      },
      optimize_weak: async (a) => {
        const limit = Math.min(50, Math.max(1, parseInt(a.limit) || 20));
        return await optimizer.optimizeWeak(limit);
      },
      delete_product: async (a) => {
        const id = parseInt(a.id);
        const p = db.prepare('SELECT id, name FROM products WHERE id = ?').get(id);
        if (!p) return { error: `product ${a.id} not found` };
        db.prepare('DELETE FROM products WHERE id = ?').run(id);
        return { deleted: id, name: p.name };
      },
      remember: async (a) => {
        const m = workerStore.remember({ kind: a.kind, content: a.content, pinned: !!a.pinned });
        return m ? { saved: m } : { error: 'content is required' };
      },
      recall: async (a) => ({ memories: workerStore.recall(String(a.query || ''), 8) }),
      ask_boss: async (a) => {
        const result = await bossChannel.createNotifiedAsk({
          store: workerStore,
          input: {
            question: String(a.question || ''),
            detail: String(a.detail || ''),
            options: Array.isArray(a.options) ? a.options : null,
            source: 'worker'
          },
          notify: getWebhookUrl() ? pingBoss : null
        });
        return result.error ? result : { askId: result.ask.id, asked: true, discord: true };
      },
      nav: async (a) => {
        const view = String(a.view || '');
        return agentWorker.NAV_VIEWS.has(view) ? { view } : { error: `unknown view: ${view}` };
      }
    };

    // Condensed real-state context so the model never invents numbers.
    let context = '';
    try {
      const o = buildOverview();
      let bi = null;
      try { bi = biService.build(); } catch (e) { /* optional */ }
      context = [
        `Catalog: ${o.counts.products} products — ${o.counts.listed} listed, ${o.counts.approved} approved, ${o.counts.draft} draft.`,
        `Etsy quota: ${o.etsy.published}/${o.etsy.cap} published today (${o.etsy.remaining} left).`,
        `Engine: ${o.engine.running ? 'live' : 'idle'}; auto-generate ${o.engine.autoGenerate ? 'on' : 'OFF'}; auto-list ${o.engine.autoList ? 'on' : 'off'}.`,
        bi ? `Shop health ${bi.health.score}/100 (${bi.health.grade}); 7d revenue $${Number(bi.deltas.revenue.value || 0).toFixed(2)}, ${bi.deltas.sales.value || 0} sales.` : ''
      ].filter(Boolean).join('\n');
    } catch (e) { /* context stays empty */ }

    // What the operator is pointing at (💡 spark) or has selected — so the
    // worker knows "this product" without being told twice.
    try {
      const refKind = productRef && productRef.kind ? String(productRef.kind) : 'product';
      const refId = productRef && productRef.id != null ? Number(productRef.id) || 0 : 0;
      const refLabel = productRef && (productRef.label || productRef.name) ? String(productRef.label || productRef.name).slice(0, 120) : '';
      if (refId && refKind === 'trend') {
        const t = db.prepare('SELECT * FROM trends WHERE id = ?').get(refId);
        if (t) context += `\n\nOPERATOR IS ASKING ABOUT trend #${t.id} "${t.name}" (grade ${t.grade || t.verdict || 'n/a'}, velocity ${t.velocity_pct != null ? '+' + Math.round(t.velocity_pct) + '% WoW' : 'n/a'}, ${t.activated ? 'already activated' : 'not activated'}).`;
      } else if (refId && refKind === 'product') {
        const p = db.prepare('SELECT * FROM products WHERE id = ?').get(refId);
        if (p) {
          const concept = p.concept_json ? JSON.parse(p.concept_json) : null;
          context += `\n\nOPERATOR IS ASKING ABOUT product #${p.id} "${p.name}" (type ${p.product_type}, status ${p.status}, price ${p.price}${concept && concept.angle ? `, angle: ${concept.angle}` : ''}).`;
        }
      } else if (refLabel || (productRef && productRef.id)) {
        // Non-catalog refs (social post, ad campaign, passion niche): the
        // client hands the label — there is nothing to resolve server-side.
        const noun = refKind === 'post' ? 'social post' : refKind === 'ad' ? 'ad campaign' : refKind === 'niche' ? 'passion niche' : refKind;
        context += `\n\nOPERATOR IS ASKING ABOUT ${noun} "${refLabel || productRef.id}"${refId ? ` (#${refId})` : ''}.`;
      }
      if (selection.length) {
        context += `\n\nOPERATOR HAS ${selection.length} PRODUCT(S) SELECTED: #${selection.slice(0, 20).join(', #')}.`;
      }
    } catch (e) { /* optional */ }

    const out = await agentWorker.runAgentTurn(
      { message, history, confirmCall, context, memory: workerStore.buildMemoryContext() },
      (tool, args) => {
        const fn = tools[tool];
        if (!fn) return { error: `unknown tool: ${tool}` };
        return fn(args || {});
      }
    );
    try { if (out && out.answer) workerStore.logTurn({ message: message || '(confirmed call)', answer: out.answer }); } catch (e) { /* non-fatal */ }
    res.json({ ok: true, ...out });
  } catch (e) {
    console.error('[ERROR] POST /api/console/agent -> 500:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ------------------------------------------------------------------------
// SERVE CLIENT
// ------------------------------------------------------------------------
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

app.get('/setup', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'setup.html'));
});

// ------------------------------------------------------------------------
// ERROR HANDLING — must be last so it catches every route above it
// ------------------------------------------------------------------------
// API clients always get JSON. Without this, an uncaught async route error
// falls through to Express's default handler and returns an HTML page, which
// every JSON caller then fails to parse.
app.use('/api', (req, res) => {
  res.status(404).json({ error: `Unknown API endpoint: ${req.method} ${req.path}`, code: 'NOT_FOUND' });
});

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = Number(err.status || err.statusCode) || 500;
  const isApi = req.path === '/api' || req.path.startsWith('/api/');
  console.error(`[ERROR] ${req.method} ${req.originalUrl} -> ${status}: ${err.message}`);
  if (res.headersSent) return;
  // Never echo an internal error message back to a client.
  const message = status >= 500 ? 'Internal server error' : err.message;
  if (isApi) return res.status(status).json({ error: message });
  res.status(status).type('text/plain').send(message);
});

// ------------------------------------------------------------------------
// START
// ------------------------------------------------------------------------
const BIND_HOST = process.env.BIND_HOST || (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT ? '0.0.0.0' : '127.0.0.1');
function startServer() {
  runtimeConfig.assertProductionConfig();
  const server = app.listen(PORT, BIND_HOST, () => {
  console.log(`+------------------------------------------------------------+`);
  console.log(`  NicheGate  |  Full Stack Server`);
  console.log(`  Port: ${PORT}  Host: ${BIND_HOST}`);
  console.log(`  DB: SQLite (WAL mode)`);
  console.log(`  Professions: ${db.prepare('SELECT COUNT(*) as c FROM professions').get().c} seeded`);
  console.log(`+------------------------------------------------------------+`);
  console.log(`\nOpen: http://localhost:${PORT}/`);
  console.log(`API docs available at endpoints under /api/*\n`);
  
  // Surface launch-readiness issues in the console on boot
  runtimeConfig.logIntegrationWarnings();
  readiness.logReadinessIssues();

  // Auto-start automation on boot
  autoStart();
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n[ERROR] Port ${PORT} is already in use.`);
      console.error(`Fix: close the other app using port ${PORT}, or run with a different PORT.`);
      process.exitCode = 1;
      return;
    }
    console.error('[SERVER ERROR]', err);
    process.exitCode = 1;
  });

  return server;
}

if (require.main === module) startServer();

module.exports = { app, startServer };



