require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const { v4: uuid } = require('uuid');

const { db, init } = require('./database');
const pdfGen = require('./services/pdfGenerator');
const xlsxGen = require('./services/xlsxGenerator');
const zipGen = require('./services/zipGenerator');
const mp = require('./services/marketplace');
const trends = require('./services/trendScanner');
const notifier = require('./services/notifier');
const vetting = require('./services/vettingEngine');
const design = require('./services/themes');
const seo = require('./services/seoEngine');
const fileFactory = require('./services/fileFactory');
const { buildWebsiteHTML, getRecoveryPrompts } = fileFactory;
const bundles = require('./services/bundleEngine');
const seasonal = require('./services/seasonalEngine');
const discovery = require('./services/discovery');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 5000;

// ── MIDDLEWARE ──
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/generated', express.static(path.join(__dirname, '..', 'generated')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use(express.static(path.join(__dirname, '..', 'client'), { extensions: ['html'] }));

// ── INIT DB ──
init();
initDefaultSettings();

// ── MULTER ──
const upload = multer({ dest: path.join(__dirname, '..', 'uploads') });

// ════════════════════════════════════════════════════════════════════════
// API: PROFESSIONS
// ════════════════════════════════════════════════════════════════════════
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

// ════════════════════════════════════════════════════════════════════════
// API: PRODUCTS
// ════════════════════════════════════════════════════════════════════════
app.get('/api/products', (req, res) => {
  const rows = db.prepare('SELECT p.*, pr.emoji as prof_emoji, pr.name as prof_name FROM products p JOIN professions pr ON p.profession_id = pr.id ORDER BY p.created_at DESC').all();
  res.json(rows);
});

app.get('/api/products/profession/:id', (req, res) => {
  const rows = db.prepare('SELECT * FROM products WHERE profession_id = ? ORDER BY created_at DESC').all(req.params.id);
  res.json(rows);
});

app.post('/api/products', async (req, res) => {
  const { profession_id, name, type, price, theme, html_content } = req.body;
  const result = db.prepare(`
    INSERT INTO products (profession_id, name, type, price, status, theme, html_content)
    VALUES (?, ?, ?, ?, 'draft', ?, ?)
  `).run(profession_id, name, type, price, theme, html_content);
  
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

// ════════════════════════════════════════════════════════════════════════
// API: TEMPLATES (Mockup generation) — Returns 5 theme variations
// ════════════════════════════════════════════════════════════════════════
app.post('/api/templates/generate', async (req, res) => {
  try {
    const { profession_id, type } = req.body;
    const prof = db.prepare('SELECT * FROM professions WHERE id = ?').get(profession_id);
    if (!prof) return res.status(404).json({ error: 'Profession not found' });
    
    // Design engine: pick the 5 best themes for this profession's tier
    const themes = design.themesForTier(prof.tier);
    const mockups = [];
    
    for (const theme of themes) {
      let html = '';
      if (type === 'invoice') html = pdfGen.buildInvoiceHTML(prof, theme);
      else if (type === 'checklist') html = pdfGen.buildChecklistHTML(prof, theme);
      else if (type === 'journal') html = pdfGen.buildJournalHTML(prof, theme, getRecoveryPrompts(prof));
      else if (type === 'brand') html = pdfGen.buildBrandKitHTML(prof, theme);
      else if (type === 'social') html = '<!-- Social pack is ZIP, not single HTML -->';
      else if (type === 'website') html = buildWebsiteHTML(prof, theme);
      else html = pdfGen.buildInvoiceHTML(prof, theme);
      
      const stmt = db.prepare('INSERT INTO templates (profession_id, type, theme, html_content) VALUES (?, ?, ?, ?)');
      stmt.run(profession_id, type, theme.name, html);
      
      mockups.push({ themeName: theme.name, html, colors: theme });
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

// Design preference for a profession
app.get('/api/design/preference/:profId', (req, res) => {
  res.json({ theme: design.getDesignPreference(req.params.profId) });
});
app.post('/api/design/preference/:profId', (req, res) => {
  design.setDesignPreference(req.params.profId, req.body.theme);
  res.json({ success: true });
});

app.get('/api/templates/:profession_id', (req, res) => {
  const rows = db.prepare('SELECT * FROM templates WHERE profession_id = ? ORDER BY created_at DESC').all(req.params.profession_id);
  res.json(rows);
});

// ════════════════════════════════════════════════════════════════════════
// API: TRENDS
// ════════════════════════════════════════════════════════════════════════
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

app.post('/api/trends/:id/activate', (req, res) => {
  // Vetting gate: only activate if the niche scores well (auto-vetting)
  const all = trends.getAllTrends();
  const trend = all.find(t => t.id == req.params.id);
  if (trend) {
    const vet = vetting.vetTrend(trend);
    if (vet.verdict === 'SKIP') {
      return res.status(400).json({ success: false, error: 'Niche vetting score too low to activate', vet });
    }
  }
  const prof = trends.activateTrend(req.params.id);
  // Immediately generate fresh, trend-appropriate products for the new niche
  let products = 0;
  if (prof) products = discovery.generateProductsForTrend(prof.id, trend);
  res.json({ success: true, profession: prof, productsGenerated: products });
});

app.post('/api/trends/:id/dismiss', (req, res) => {
  trends.dismissTrend(req.params.id);
  res.json({ success: true });
});

app.post('/api/trends/:id/archive', (req, res) => {
  trends.archiveTrend(req.params.id);
  res.json({ success: true });
});

// ════════════════════════════════════════════════════════════════════════
// API: METRICS
// ════════════════════════════════════════════════════════════════════════
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

// ══════════════════════════════════════════════════════════════════════
// API: SALES SYNC (Gumroad → metrics + Discord alerts)
// ══════════════════════════════════════════════════════════════════════
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

// ══════════════════════════════════════════════════════════════════════
// API: BUNDLES ($29 Complete Toolkits) + LEAD MAGNET + SEASONAL
// ══════════════════════════════════════════════════════════════════════
app.post('/api/bundles/generate', async (req, res) => {
  try {
    res.json(await bundles.generateAllBundles());
  } catch (e) {
    console.error('[BUNDLES] generate error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/bundles/publish', async (req, res) => {
  const pending = db.prepare("SELECT * FROM products WHERE type = 'bundle' AND status = 'approved' AND marketplace_id IS NULL").all();
  let published = 0, failed = 0;
  const errors = [];
  for (const p of pending) {
    try {
      const result = await mp.publishProduct(p);
      db.prepare('UPDATE products SET status = ?, marketplace = ?, marketplace_id = ? WHERE id = ?')
        .run('listed', result.platform, result.listingId || null, p.id);
      // Branded cover — best effort, never blocks the listing
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
  res.json({ published, failed, errors });
});

app.post('/api/leadmagnet/deploy', async (req, res) => {
  try {
    const existing = db.prepare("SELECT value FROM settings WHERE key = 'leadmagnet_url'").get();
    if (existing?.value) return res.json({ alreadyLive: true, url: existing.value });

    const product = await bundles.buildLeadMagnet();
    const result = await mp.publishFreeGumroad(product);
    db.prepare('UPDATE products SET status = ?, marketplace = ?, marketplace_id = ? WHERE id = ?')
      .run('listed', result.platform, result.listingId, product.id);
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('leadmagnet_url', ?)").run(result.url || '');
    try { await mp.attachGumroadCover(result.listingId, bundles.coverForType('leadmagnet')); } catch {}
    db.prepare('INSERT INTO automation_log (action, product_id, details, status) VALUES (?, ?, ?, ?)')
      .run('published', product.id, 'Lead magnet live (free email capture)', 'success');
    res.json({ success: true, url: result.url });
  } catch (e) {
    console.error('[LEADMAGNET] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/seasonal', (req, res) => {
  const focus = seasonal.getCurrentFocus();
  const profs = seasonal.getFocusProfessions().map(p => ({ name: p.name, emoji: p.emoji }));
  res.json({ ...focus, professions: profs });
});

app.post('/api/metrics', (req, res) => {
  const { profession_id, product_id, views, sales, revenue, favorites } = req.body;
  db.prepare(`
    INSERT INTO metrics (profession_id, product_id, views, sales, revenue, favorites)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(profession_id, product_id, views || 0, sales || 0, revenue || 0, favorites || 0);
  res.json({ success: true });
});

// ════════════════════════════════════════════════════════════════════════
// API: CHAT HISTORY
// ════════════════════════════════════════════════════════════════════════
app.get('/api/chat/:profession_id', (req, res) => {
  const rows = db.prepare('SELECT * FROM chat_history WHERE profession_id = ? ORDER BY created_at ASC').all(req.params.profession_id);
  res.json(rows);
});

app.post('/api/chat', (req, res) => {
  const { profession_id, role, text, mockups } = req.body;
  const result = db.prepare(`
    INSERT INTO chat_history (profession_id, role, text, mockups)
    VALUES (?, ?, ?, ?)
  `).run(profession_id, role, text, mockups ? JSON.stringify(mockups) : null);
  res.json({ id: result.lastInsertRowid });
});

// ════════════════════════════════════════════════════════════════════════
// API: INSPIRATION PHOTOS
// ════════════════════════════════════════════════════════════════════════
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

// ════════════════════════════════════════════════════════════════════════
// API: AUTOMATION
// ════════════════════════════════════════════════════════════════════════
app.get('/api/automation/log', (req, res) => {
  const rows = db.prepare('SELECT * FROM automation_log ORDER BY created_at DESC LIMIT 100').all();
  res.json(rows);
});

app.post('/api/automation/run', async (req, res) => {
  const profs = db.prepare('SELECT * FROM professions WHERE status != ?').all('archived');
  const results = [];
  
  for (const prof of profs) {
    const types = ['invoice', 'social', 'checklist', 'spreadsheet'];
    const type = types[Math.floor(Math.random() * types.length)];
    const theme = 'Black Teal';
    
    try {
      const result = db.prepare(`
        INSERT INTO products (profession_id, name, type, price, status, theme, html_content)
        VALUES (?, ?, ?, ?, 'draft', ?, ?)
      `).run(prof.id, `${prof.name} ${type.charAt(0).toUpperCase() + type.slice(1)}`, type, '$12', theme, '<!-- auto-generated -->');
      
      db.prepare('INSERT INTO automation_log (action, profession_id, product_id, details, status) VALUES (?, ?, ?, ?, ?)')
        .run('auto_generate', prof.id, result.lastInsertRowid, `Auto-generated ${type} for ${prof.name}`, 'success');
      
      results.push({ profession: prof.name, type, productId: result.lastInsertRowid });
    } catch (e) {
      db.prepare('INSERT INTO automation_log (action, profession_id, details, status) VALUES (?, ?, ?, ?)')
        .run('auto_generate', prof.id, `Failed: ${e.message}`, 'error');
    }
  }
  
  res.json({ generated: results.length, items: results });
});

app.post('/api/automation/approve-all', (req, res) => {
  const result = db.prepare("UPDATE products SET status = 'approved' WHERE status = 'draft' OR status = 'pending-review'").run();
  db.prepare('INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)')
    .run('batch_approve', `Approved ${result.changes} products`, 'success');
  res.json({ approved: result.changes });
});

// ════════════════════════════════════════════════════════════════════════
// API: MARKETPLACE
// ════════════════════════════════════════════════════════════════════════
// Test which marketplace connections are live
app.get('/api/marketplace/test', async (req, res) => {
  const results = {};
  results.gumroad = await mp.testGumroadConnection().catch(e => ({ ok: false, message: e.message }));
  results.etsy = await mp.testEtsyConnection().catch(e => ({ ok: false, message: e.message }));
  res.json(results);
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
    db.prepare('INSERT INTO automation_log (action, product_id, details, status) VALUES (?, ?, ?, ?)')
      .run('published', product.id, `Listed on ${result.platform}`, 'success');
    res.json({ success: true, ...result });
  } catch (e) {
    await alertPublishError(product.id, e.message);
    res.status(500).json({ error: e.message });
  }
});

// Storefront feed — live products with real Gumroad buy links (cached 5 min)
let storeFeedCache = { at: 0, data: null };
app.get('/api/store/products', async (req, res) => {
  if (storeFeedCache.data && Date.now() - storeFeedCache.at < 300000) {
    return res.json(storeFeedCache.data);
  }
  try {
    const rows = db.prepare(`
      SELECT p.id, p.name, p.type, p.price, p.theme, p.marketplace, p.marketplace_id, pr.name as prof_name, pr.emoji as prof_emoji
      FROM products p JOIN professions pr ON p.profession_id = pr.id
      WHERE p.status = 'listed' ORDER BY p.created_at DESC
    `).all();

    // Resolve real Gumroad URLs (product id → public buy URL)
    const gumroadUrls = await mp.getGumroadProductUrls();

    const products = rows.map(p => ({
      id: p.id,
      name: p.name,
      type: p.type,
      price: p.price,
      theme: p.theme,
      category: p.prof_name,
      emoji: p.prof_emoji,
      marketplace: p.marketplace,
      buyUrl: p.marketplace === 'gumroad' && gumroadUrls[p.marketplace_id] ? gumroadUrls[p.marketplace_id] : null
    }));

    // Seller's own Gumroad store URL (from any resolved product link) + lead magnet
    let storeUrl = null;
    for (const p of products) { if (p.buyUrl) { try { storeUrl = new URL(p.buyUrl).origin; break; } catch {} } }
    const leadmagnetUrl = db.prepare("SELECT value FROM settings WHERE key = 'leadmagnet_url'").get()?.value || null;

    storeFeedCache = { at: Date.now(), data: { products, storeUrl, leadmagnetUrl } };
    res.json({ products, storeUrl, leadmagnetUrl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/marketplace/etsy/auth', async (req, res) => {
  try {
    const result = await mp.getEtsyAuthUrl(req.query.redirectUri || `http://localhost:${PORT}/api/marketplace/etsy/callback`);
    res.json({ authUrl: result.url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/marketplace/etsy/callback', async (req, res) => {
  try {
    if (req.query.error) throw new Error(`Etsy denied authorization: ${req.query.error}`);
    const tokens = await mp.exchangeEtsyToken(req.query.code);
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Inter,sans-serif;background:#0a0a0a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:12px}h1{color:#22c55e}a{color:#2dd4bf}</style></head><body><h1>✅ Etsy connected</h1><p>NicheGate can now list products on Etsy.</p><a href="/setup">Return to Setup →</a></body></html>`);
  } catch (e) {
    console.error('[ETSY OAUTH] exchange failed:', e.response?.data || e.message);
    res.status(500).send(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Inter,sans-serif;background:#0a0a0a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:12px}a{color:#2dd4bf}</style></head><body><h1 style="color:#ef4444">❌ Etsy connection failed</h1><p>${String(e.message).replace(/[<>]/g,'')}</p><a href="/setup">Back to Setup →</a></body></html>`);
  }
});

// Publish errors alert the user immediately
async function alertPublishError(productId, message) {
  db.prepare('INSERT INTO automation_log (action, product_id, details, status) VALUES (?, ?, ?, ?)')
    .run('publish_error', productId, message, 'error');
  await notifier.sendDiscord(getWebhookUrl(), notifier.formatAlert('error', { message: `Publish failed for product #${productId}: ${message}` }));
}

// ════════════════════════════════════════════════════════════════════════
// API: SETTINGS
// ════════════════════════════════════════════════════════════════════════
app.get('/api/settings', (req, res) => {
  const rows = db.prepare('SELECT * FROM settings').all();
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  res.json(settings);
});

app.post('/api/settings', (req, res) => {
  const { key, value } = req.body;
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
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
    auto_list: 'false',
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

// ════════════════════════════════════════════════════════════════════════
// API: EXPORT
// ════════════════════════════════════════════════════════════════════════
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

// ════════════════════════════════════════════════════════════════════════
// CRON: Scheduled Automation
// ════════════════════════════════════════════════════════════════════════
let cronJob = null;

let discoveryCron = null;

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
    console.log('[CRON] Discovery sweep...');
    try {
      const found = await discovery.sweep(6);
      const fresh = discovery.freshnessPass();
      if (found.length || fresh) {
        db.prepare('INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)')
          .run('discovery_auto', `Sweep: ${found.length} new niche(s), ${fresh} fresh product(s)`, 'success');
      }
    } catch (e) {
      console.error('[CRON] discovery error:', e.message);
    }
  }, { scheduled: false });
  
  cronJob.start();
  discoveryCron.start();
  console.log('[CRON] Automation scheduler started (every 6h) + discovery sweep (every 2h)');
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
    isReviewDay,
    pendingCount: pending.c,
    lastRun: lastRun.created_at || null,
    autoList: settings.auto_list === 'true',
    autoGenerate: settings.auto_generate !== 'false',
    reviewInterval: parseInt(settings.review_interval) || 2
  });
});

function checkIsReviewDay() {
  const settings = db.prepare('SELECT * FROM settings WHERE key = ?').get('last_review');
  const lastReview = settings ? new Date(settings.value) : new Date(0);
  const daysSince = (Date.now() - lastReview.getTime()) / (1000 * 60 * 60 * 24);
  const reviewInterval = parseInt(db.prepare('SELECT value FROM settings WHERE key = ?').get('review_interval')?.value || '2');
  return daysSince >= reviewInterval;
}

// ════════════════════════════════════════════════════════════════════════
// AUTO-START: On server boot
// ════════════════════════════════════════════════════════════════════════
function autoStart() {
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
  
  // Run immediate first cycle (trend scan + product generation)
  setTimeout(() => {
    if (checkIsReviewDay()) {
      console.log('[AUTO] Review day detected — skipping auto-generation, waiting for approval');
      db.prepare('INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)')
        .run('review_day_pause', 'Automation paused: review day pending', 'warning');
    } else {
      runAutoCycle();
    }
  }, 2000);
}

function getWebhookUrl() {
  const stored = db.prepare('SELECT value FROM settings WHERE key = ?').get('webhook_url')?.value || '';
  return stored || process.env.DISCORD_WEBHOOK_URL || '';
}

async function runAutoCycle() {
  console.log('[AUTO] Running auto-cycle...');
  const webhookUrl = getWebhookUrl();
  
  // 1. Scan for trends (live radar + niche universe + seasonal)
  const found = await discovery.sweep(6);
  const trend = found[0] || null;
  if (trend) {
    console.log(`[AUTO] Trend detected: ${trend.name}`);
    db.prepare('INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)')
      .run('trend_detected', `Detected: ${trend.name}`, 'warning');
    await notifier.sendDiscord(webhookUrl, notifier.formatAlert('trend_detected', trend));
  }
  try { discovery.freshnessPass(); } catch (e) { console.error('[AUTO] freshness:', e.message); }

  // 1b. Sync real sales (alerts on new sales)
  try { await syncGumroadSales(); } catch (e) { console.error('[AUTO] sales sync:', e.message); }
  
  // 2. Review day check FIRST
  if (checkIsReviewDay()) {
    const pending = db.prepare("SELECT COUNT(*) as c FROM products WHERE status = 'draft' OR status = 'pending-review'").get();
    db.prepare('INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)')
      .run('review_day', `${pending.c} products awaiting approval`, 'warning');
    await notifier.sendDiscord(webhookUrl, notifier.formatAlert('review_day', { count: pending.c }));
    console.log('[AUTO] Review day — skipping generation, sent alert');
    return;
  }
  
  // 3. Generate products for active professions
  const profs = db.prepare("SELECT * FROM professions WHERE status != 'archived'").all();
  let generated = 0;
  for (const prof of profs) {
    const types = ['invoice', 'social', 'checklist', 'spreadsheet', 'booking'];
    const type = types[Math.floor(Math.random() * types.length)];
    try {
      db.prepare(`INSERT INTO products (profession_id, name, type, price, status, theme, html_content) VALUES (?, ?, ?, ?, 'draft', ?, ?)`)
        .run(prof.id, `${prof.name} ${type.charAt(0).toUpperCase()+type.slice(1)}`, type, '$12', 'Auto Theme', '<!-- auto-generated -->');
      generated++;
    } catch (e) {}
  }
  db.prepare('INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)')
    .run('auto_generate', `Generated ${generated} products across ${profs.length} professions`, 'success');
  console.log(`[AUTO] Generated ${generated} products`);
  await notifier.sendDiscord(webhookUrl, notifier.formatAlert('product_generated', { count: generated, professions: profs.length }));

  // 3b. Seasonal push — one extra product for a profession peaking this month
  try {
    const s = seasonal.generateSeasonalProduct();
    if (s) console.log(`[AUTO] Seasonal: ${s.type} for ${s.profession}`);
  } catch (e) { console.error('[AUTO] seasonal:', e.message); }
  
  // 4. Auto-list approved products (if enabled) — real APIs first, simulated fallback
  const autoList = db.prepare('SELECT * FROM settings WHERE key = ?').get('auto_list');
  if (autoList && autoList.value === 'true') {
    const approved = db.prepare("SELECT * FROM products WHERE status = 'approved' AND marketplace_id IS NULL").all();
    let listed = 0;
    for (const p of approved) {
      try {
        const result = await mp.publishProduct(p);
        db.prepare('UPDATE products SET status = ?, marketplace = ?, marketplace_id = ? WHERE id = ?')
          .run('listed', result.platform, result.listingId || null, p.id);
        listed++;
      } catch (e) {
        db.prepare('INSERT INTO automation_log (action, product_id, details, status) VALUES (?, ?, ?, ?)')
          .run('publish_error', p.id, e.message, 'error');
      }
    }
    if (listed > 0) {
      db.prepare('INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)')
        .run('auto_list', `Auto-listed ${listed} approved products`, 'success');
      console.log(`[AUTO] Auto-listed ${listed} products`);
      await notifier.sendDiscord(webhookUrl, notifier.formatAlert('auto_listed', { count: listed }));
    }
  }
}

// (Website template + recovery prompts now live in services/fileFactory.js)

// ════════════════════════════════════════════════════════════════════════
// API: SETUP / ONBOARDING STATUS
// ════════════════════════════════════════════════════════════════════════
// Gumroad live-test cache (60s) so /setup shows the REAL connection state
let gumroadTestCache = { at: 0, result: null };
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

  const settings = db.prepare('SELECT * FROM settings WHERE key IN (?, ?)').all('webhook_url', 'notify_email');
  const webhook = settings.find(s => s.key === 'webhook_url')?.value || process.env.DISCORD_WEBHOOK_URL || '';
  const email = settings.find(s => s.key === 'notify_email')?.value || '';

  res.json({
    etsy: mpStatus.etsy,
    gumroad: mpStatus.gumroad,
    discord: { configured: !!webhook, url: webhook ? '***' : null },
    email: { configured: !!email, address: email ? '***' : null },
    allReady: mpStatus.etsy.configured && mpStatus.gumroad.configured
  });
});

// ════════════════════════════════════════════════════════════════════════
// SERVE CLIENT
// ════════════════════════════════════════════════════════════════════════
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

app.get('/setup', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'setup.html'));
});

app.get('/store', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'store.html'));
});

// ════════════════════════════════════════════════════════════════════════
// START
// ════════════════════════════════════════════════════════════════════════
const BIND_HOST = process.env.BIND_HOST || '127.0.0.1';
const server = app.listen(PORT, BIND_HOST, () => {
  console.log(`╔════════════════════════════════════════════════════════════╗`);
  console.log(`║  NicheGate  |  Full Stack Server                  ║`);
  console.log(`║  Port: ${PORT}  Host: ${BIND_HOST}                              ║`);
  console.log(`║  DB: SQLite (WAL mode)                                      ║`);
  console.log(`║  Professions: ${db.prepare('SELECT COUNT(*) as c FROM professions').get().c} seeded                                ║`);
  console.log(`╚════════════════════════════════════════════════════════════╝`);
  console.log(`\nOpen: http://localhost:${PORT}/`);
  console.log(`API docs available at endpoints under /api/*\n`);
  
  // Auto-start automation on boot
  autoStart();
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[ERROR] Port ${PORT} is already in use.`);
    console.error(`Fix: close the other app using port ${PORT}, or run:`);
    console.error(`  powershell -Command "Get-NetTCPConnection -LocalPort ${PORT} -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }"`);
    process.exit(1);
  }
  console.error('[SERVER ERROR]', err);
  process.exit(1);
});

module.exports = app;
