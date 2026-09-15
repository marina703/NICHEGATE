require('dotenv').config();
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
const GENERATED_DIR = path.resolve(path.join(__dirname, '..', 'generated'));
const MAX_SPREADSHEET_PREVIEW_BYTES = 20 * 1024 * 1024;

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
brand.syncDesignsToCovers(); // keep covers/ in sync with the nichegate designs folder

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

app.get('/api/products/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
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
      // Type → builder. Every type renders a REAL preview so the editor and
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
  const result = db.prepare("UPDATE products SET status = 'approved' WHERE status = 'draft' OR status = 'pending-review'").run();
  db.prepare('INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)')
    .run('batch_approve', `Approved ${result.changes} products`, 'success');
  res.json({ approved: result.changes });
});

// Deduplicate the review queue — collapse identical draft clones (same
// profession + type + name) down to ONE keeper each. Never touches approved,
// listed, published, or sold products. Prefer keeping the row with a real
// generated file; otherwise the newest one.
app.post('/api/automation/dedupe', (req, res) => {
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
  const remaining = db.prepare(`SELECT COUNT(*) c FROM products WHERE status IN ('draft','pending-review')`).get().c;
  db.prepare('INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)')
    .run('dedupe', `Removed ${removed.length} duplicate drafts · kept ${keep.length} (${remaining} pending now)`, 'success');
  res.json({ groups: groups.length, removed: removed.length, kept: keep.length, remaining });
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
    // Reconcile stale marketplace ids against the live Gumroad catalog
    const cat = await mp.refreshGumroadCatalog();

    const rows = db.prepare(`
      SELECT p.id, p.name, p.type, p.price, p.theme, p.marketplace, p.marketplace_id, p.preview_path,
             pr.name as prof_name, pr.emoji as prof_emoji
      FROM products p JOIN professions pr ON p.profession_id = pr.id
      WHERE p.status = 'listed' ORDER BY p.created_at DESC
    `).all();

    const products = rows.map(p => ({
      id: p.id,
      name: p.name,
      type: p.type,
      price: p.price,
      theme: p.theme,
      category: p.prof_name,
      emoji: p.prof_emoji,
      marketplace: p.marketplace,
      buyUrl: cat.urlFor[p.id] || null,
      previewUrl: `/api/products/${p.id}/preview-image`
    }));

    // Explicit store link (settings) > Gumroad origin derived from live URLs
    const leadmagnetUrl = db.prepare("SELECT value FROM settings WHERE key = 'leadmagnet_url'").get()?.value || null;

    // Warm previews in the background (never blocks the feed)
    for (const p of rows) {
      if (!p.preview_path) { fileFactory.ensureProductThumbnail(p).catch(() => {}); }
    }

    storeFeedCache = { at: Date.now(), data: { products, storeUrl: cat.storeUrl, leadmagnetUrl, reconciled: cat.matched } };
    res.json(storeFeedCache.data);
  } catch (e) {
    console.error('[STORE] feed error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Design showcase — the premium template designs currently in the catalog
// (pending drafts that haven't shipped yet) plus the live bundles. Used by the
// storefront to show what buyers get before they buy.
let showcaseCache = { at: 0, data: null };
app.get('/api/store/showcase', async (req, res) => {
  if (showcaseCache.data && Date.now() - showcaseCache.at < 600000) {
    return res.json(showcaseCache.data);
  }
  try {
    const groups = db.prepare(`
      SELECT type, COUNT(*) AS n,
             SUM(CASE WHEN preview_path IS NOT NULL AND length(preview_path) > 0 THEN 1 ELSE 0 END) AS previews
      FROM products WHERE status IN ('draft','pending-review')
      GROUP BY type ORDER BY n DESC
    `).all();

    const best = [];
    for (const g of groups) {
      const items = db.prepare(`
        SELECT p.id, p.name, p.type, p.price, p.theme, p.preview_path,
               pr.name AS prof_name, pr.emoji AS prof_emoji
        FROM products p JOIN professions pr ON p.profession_id = pr.id
        WHERE p.status IN ('draft','pending-review') AND p.type = ?
        ORDER BY length(p.preview_path) DESC LIMIT 3
      `).all(g.type);
      for (const it of items) {
        best.push({
          id: it.id, name: it.name, type: it.type, price: it.price, theme: it.theme,
          prof: it.prof_name, emoji: it.prof_emoji,
          previewUrl: `/api/products/${it.id}/preview-image`
        });
      }
    }

    // Pull in 2 live bundles so the showcase also proves the paid products
    const bundles = db.prepare(`
      SELECT p.id, p.name, p.type, p.price, p.theme, pr.name AS prof_name, pr.emoji AS prof_emoji
      FROM products p JOIN professions pr ON p.profession_id = pr.id
      WHERE p.status = 'listed' AND p.type = 'bundle' LIMIT 2
    `).all();

    showcaseCache = { at: Date.now(), data: { groups, designs: best, bundles } };
    res.json(showcaseCache.data);
  } catch (e) {
    console.error('[STORE] showcase error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════
// STORE BRANDING — deploy the nichegate-designs logo/banner to marketplaces
// ════════════════════════════════════════════════════════════════════════
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
    auto_list: 'true',
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

// ════════════════════════════════════════════════════════════════════════
// PRODUCT PREVIEW — actually SEE the deliverable before approving:
// PDFs render inline, spreadsheets become readable HTML tables, and ZIP
// archives get a contents list with inline previews of text/HTML files.
// ════════════════════════════════════════════════════════════════════════
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
  return `<div class="header"><div><h1>${escHtml(product.name)}</h1><div class="meta">${prof ? prof.emoji + ' ' : ''}${escHtml(prof ? prof.name : '')} · ${escHtml(product.type)} · ${escHtml(product.price || '')}${fileInfo ? ' · ' + fileInfo : ''}</div></div><a class="btn" href="/api/export/product/${product.id}" download>⬇ Download file</a></div>`;
}

app.get('/api/products/:id/preview', async (req, res) => {
  try {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const prof = db.prepare('SELECT * FROM professions WHERE id = ?').get(product.profession_id);

    let filePath = (product.file_path && fs.existsSync(product.file_path)) ? product.file_path : null;
    let ensureError = null;
    if (!filePath) {
      try { filePath = await fileFactory.ensureProductFile(product); }
      catch (e) { ensureError = e.message; console.error('[PREVIEW] ensure file:', e.message); }
    }
    product.file_path = filePath;
    const ext = filePath ? path.extname(filePath).toLowerCase() : '';

    // PDF → inline so the browser renders the actual document
    if (ext === '.pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${path.basename(filePath)}"`);
      return fs.createReadStream(filePath).pipe(res);
    }

    const sizeKB = filePath ? (fs.statSync(filePath).size / 1024).toFixed(1) : null;

    // Spreadsheet → readable HTML table (live formulas included)
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
        return `<div class="card"><h3>📄 ${escHtml(name)}</h3>${html}</div>`;
      }).join('');
      const body = previewHeader(product, prof, `Excel · ${sizeKB} KB`) + `<img class="preview-img" src="/api/products/${product.id}/preview-image">` + tables;
      return res.type('html').send(previewShell(escHtml(product.name) + ' — Preview', body));
    }

    // ZIP archive → contents list + inline previews of text/HTML entries
    if (filePath && ext === '.zip') {
      const zip = new AdmZip(filePath);
      const entries = zip.getEntries();
      let html = previewHeader(product, prof, `ZIP archive · ${sizeKB} KB · ${entries.length} files`);
      html += `<img class="preview-img" src="/api/products/${product.id}/preview-image">`;
      html += `<div class="card"><h3>📦 Archive contents</h3>` + entries.map(e =>
        `<div class="entry"><span>${escHtml(e.entryName)}</span><span>${(e.header.size / 1024).toFixed(1)} KB</span></div>`).join('') + '</div>';
      html += entries.filter(e => /\.(html?|txt|css|json|csv|xml)$/i.test(e.entryName)).map(e =>
        `<div class="card"><h3>🔍 ${escHtml(e.entryName)} (preview)</h3><pre>${escHtml(e.getData().toString('utf8').slice(0, 5000))}</pre></div>`).join('');
      return res.type('html').send(previewShell(escHtml(product.name) + ' — Preview', html));
    }

    // No file (or only HTML saved) → HTML preview + product metadata
    const realHtml = product.html_content && !PLACEHOLDER_HTML.has(String(product.html_content).trim()) && String(product.html_content).trim().length > 10;
    let body = previewHeader(product, prof, filePath ? `${sizeKB} KB file` : null);
    body += `<img class="preview-img" src="/api/products/${product.id}/preview-image">`;
    if (ensureError) body += `<div class="note">⚠ ${escHtml(ensureError)}</div>`;
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
      body += `<div class="card" style="padding:0"><h3 style="padding:14px 18px;border-bottom:1px solid #e2e8f0;">🖼 Saved HTML</h3><iframe sandbox="allow-same-origin" srcdoc="${escHtml(product.html_content).replace(/"/g, '&quot;')}" style="width:100%;height:460px;border:none;background:white;"></iframe></div>`;
    }
    return res.type('html').send(previewShell(escHtml(product.name) + ' — Preview', body));
  } catch (e) {
    console.error('[PREVIEW] error:', e.message);
    return res.status(500).send(previewShell('Preview Error', `<div class="note">⚠ Could not preview this product: ${escHtml(e.message)}</div>`));
  }
});

// Raster preview image (JPEG mockup) — generated on demand, cached in DB
app.get('/api/products/:id/preview-image', async (req, res) => {
  try {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    let previewPath = (product.preview_path && fs.existsSync(product.preview_path)) ? product.preview_path : null;
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

// Batch-generate raster previews for pending products (warm the cache)
app.post('/api/previews/generate', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '25', 10) || 25, 200);
  const rows = db.prepare(`SELECT * FROM products WHERE status IN ('draft','pending-review') AND (preview_path IS NULL OR length(preview_path) = 0) ORDER BY id LIMIT ?`).all(limit);
  let generated = 0, failed = 0;
  for (const p of rows) {
    try {
      if (await fileFactory.ensureProductThumbnail(p)) generated++; else failed++;
    } catch (e) { failed++; console.error('[THUMBS] #' + p.id + ':', e.message); }
  }
  const remaining = db.prepare(`SELECT COUNT(*) c FROM products WHERE status IN ('draft','pending-review') AND (preview_path IS NULL OR length(preview_path) = 0)`).get().c;
  res.json({ total: rows.length, generated, failed, remaining });
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
      const fads = discovery.autoActivateHotFads();
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
    cycleBusy: !!cycleLock,
    discoveryBusy: !!discoveryLock,
    isReviewDay,
    pendingCount: pending.c,
    lastRun: lastRun.created_at || null,
    autoList: settings.auto_list === 'true',
    autoGenerate: settings.auto_generate !== 'false',
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
  
  // Run immediate first cycle (trend scan + review gate + publish of approved).
  // runFullCycle still honors the review gate — it skips NEW generation on a
  // review day while continuing to publish already-approved products.
  setTimeout(() => {
    runAutoCycle();
  }, 2000);
}

function getWebhookUrl() {
  const stored = db.prepare('SELECT value FROM settings WHERE key = ?').get('webhook_url')?.value || '';
  return stored || process.env.DISCORD_WEBHOOK_URL || '';
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

// ════════════════════════════════════════════════════════════════════════
// API: SETUP / ONBOARDING STATUS
// ════════════════════════════════════════════════════════════════════════
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
    allReady: mpStatus.etsy.connected && mpStatus.gumroad.connected
  });
});

// ════════════════════════════════════════════════════════════════════════
// API: LAUNCH READINESS
// ════════════════════════════════════════════════════════════════════════
app.get('/api/health/readiness', (req, res) => {
  res.json(readiness.buildReadinessReport());
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
const BIND_HOST = process.env.BIND_HOST || (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT ? '0.0.0.0' : '127.0.0.1');
function startServer() {
  const server = app.listen(PORT, BIND_HOST, () => {
  console.log(`╔════════════════════════════════════════════════════════════╗`);
  console.log(`║  NicheGate  |  Full Stack Server                  ║`);
  console.log(`║  Port: ${PORT}  Host: ${BIND_HOST}                              ║`);
  console.log(`║  DB: SQLite (WAL mode)                                      ║`);
  console.log(`║  Professions: ${db.prepare('SELECT COUNT(*) as c FROM professions').get().c} seeded                                ║`);
  console.log(`╚════════════════════════════════════════════════════════════╝`);
  console.log(`\nOpen: http://localhost:${PORT}/`);
  console.log(`API docs available at endpoints under /api/*\n`);
  
  // Surface launch-readiness issues in the console on boot
  readiness.logReadinessIssues();

  // Seed the flagship "outcome tool" products (idempotent)
  try {
    const toolStudio = require('./services/toolStudio');
    toolStudio.createToolProducts(toolStudio.ensureToolProfession());
  } catch (e) { console.error('[BOOT] tool seed:', e.message); }

  // Auto-migrate: assign cover images to tool products missing preview_path
  try {
    const fs = require('fs');
    const path = require('path');
    const coversDir = path.join(__dirname, '..', 'covers');
    const coverFiles = fs.readdirSync(coversDir)
      .filter(f => f.startsWith('tool-') && f.endsWith('.png'))
      .sort();
    
    if (coverFiles.length > 0) {
      const tools = db.prepare("SELECT id FROM products WHERE type = 'tool' AND profession_id = 28 AND (preview_path IS NULL OR preview_path = '') ORDER BY id").all();
      for (let i = 0; i < tools.length; i++) {
        const coverFile = coverFiles[i % coverFiles.length];
        db.prepare('UPDATE products SET preview_path = ? WHERE id = ?')
          .run('covers/' + coverFile, tools[i].id);
        console.log(`[BOOT] Assigned cover ${coverFile} to tool product ${tools[i].id}`);
      }
    }
  } catch (e) { console.error('[BOOT] cover migration:', e.message); }

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
