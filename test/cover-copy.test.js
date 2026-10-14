// Regression: marketplace cover copy must come from real product data (concept
// → name + brief → library), never the canned per-type headline on its own.
const test = require('node:test');
const assert = require('node:assert/strict');
const ds = require('../server/services/designStudio');
const productCopy = require('../server/services/productCopy');
const fileFactory = require('../server/services/fileFactory');
const pinEngine = require('../server/services/pinEngine');
const pdfGen = require('../server/services/pdfGenerator');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const prof = { name: 'Make Money From Pinterest', slug: 'x', services: '[]' };

test('thumbCoverCopy: concept JSON wins over name and brief', () => {
  const product = {
    name: 'Make Money From Pinterest — Income Tracker',
    type: 'spreadsheet',
    brief: 'Ignored: when a concept exists.',
    concept: JSON.stringify({
      name: 'Make Money From Pinterest — Pin Revenue Dashboard',
      pitch: 'See every Pinterest income stream at a glance',
      benefits: ['Affiliate', 'Sponsors', 'Own products']
    })
  };
  const [title, sub, benefits] = ds.thumbCoverCopy(product, prof);
  assert.equal(title, 'Pin Revenue Dashboard');
  assert.equal(sub, 'See every Pinterest income stream at a glance');
  assert.deepEqual(benefits, ['Affiliate', 'Sponsors', 'Own products']);
});

test('thumbCoverCopy: product name tail + colon brief become title/sub/benefits', () => {
  const product = {
    name: 'Make Money From Pinterest — Income Tracker',
    type: 'spreadsheet',
    brief: 'Track every dollar earned from Pinterest: affiliate links, sponsor pins, idea pins, and traffic-to-sales conversion.'
  };
  const [title, sub, benefits, format] = ds.thumbCoverCopy(product, prof);
  assert.equal(title, 'Income Tracker');
  assert.equal(sub, 'Track every dollar earned from Pinterest');
  assert.equal(benefits.length, 3);
  assert.ok(benefits.includes('Affiliate links'));
  assert.equal(format, 'XLSX · Formulas');
});

test('thumbCoverCopy: uses factual concept copy and never invents type benefits', () => {
  const product = {
    name: 'Pinterest Creator Checklist', type: 'checklist', price: '$49',
    concept: JSON.stringify({ name: 'Pin-to-Profit Audit', benefits: ['Audit board intent', 'Map pin keywords', 'Track outbound clicks'] })
  };
  const [title, , benefits] = ds.thumbCoverCopy(product, prof);
  assert.equal(title, 'Pin-to-Profit Audit');
  assert.deepEqual(benefits, ['Audit board intent', 'Map pin keywords', 'Track outbound clicks']);

  const generic = ds.thumbCoverCopy({ name: 'Pinterest Creator checklist', type: 'checklist' }, prof);
  assert.equal(generic[0], 'Pinterest Creator checklist');
  assert.equal(generic[1], '');
  assert.deepEqual(generic[2], []);
});

test('thumbCoverCopy: colon-less brief falls to first sentence, library benefits', () => {
  const product = {
    name: 'Make Money From Pinterest — Keyword Tracker',
    type: 'roi',
    brief: 'Track keyword rankings for every board over time and watch which pins compound.'
  };
  const [title, sub, benefits] = ds.thumbCoverCopy(product, prof);
  assert.equal(title, 'Keyword Tracker');
  assert.match(sub, /^Track keyword rankings/);
  assert.deepEqual(benefits, []);
});

test('thumbCoverCopy: generic auto-name falls back to the per-type library', () => {
  const product = { name: 'Make Money From Pinterest Checklist', type: 'checklist' };
  const [title, sub] = ds.thumbCoverCopy(product, prof);
  assert.equal(title, 'Service Quality Checklist');
  assert.equal(sub, 'Never miss a step on the job');
});

test('thumbCoverCopy: library covers roi and decision-matrix (no "noun + type" garbage)', () => {
  for (const [type, title] of [['roi', 'ROI Calculator'], ['decision-matrix', 'Decision Matrix']]) {
    const [t, , , format] = ds.thumbCoverCopy({ name: `Make Money From Pinterest ${type}`, type }, prof);
    assert.equal(t, title, type);
    assert.ok(format && format.length > 3, type);
  }
});

test('productCopy: deriveCopy is the single owner of concept → name → brief', () => {
  const product = {
    name: 'Make Money From Pinterest — Income Tracker',
    type: 'spreadsheet',
    brief: 'Track every dollar earned from Pinterest: affiliate links, sponsor pins, idea pins.'
  };
  const copy = productCopy.deriveCopy(product, prof);
  assert.equal(copy.title, 'Income Tracker');
  assert.equal(copy.sub, 'Track every dollar earned from Pinterest');
  assert.deepEqual(copy.benefits, ['Affiliate links', 'Sponsor pins', 'Idea pins']);
  // Generic auto-name contributes no title
  assert.equal(productCopy.deriveTitle({ name: 'Make Money From Pinterest spreadsheet', type: 'spreadsheet' }, prof), null);
});

test('heroSnippetForCover: data types show REAL niche service rows', () => {
  const nicheProf = { ...prof, services: JSON.stringify([['Affiliate Pin Campaigns', '$500'], ['Sponsored Pin Packages', '$350'], ['Digital Product Sales', '$250']]) };
  const product = { name: 'Make Money From Pinterest — Income Tracker', type: 'spreadsheet', brief: 'Track every dollar earned from Pinterest: affiliate links, sponsor pins, idea pins.' };
  const hero = ds.heroSnippetForCover(product, nicheProf, {});
  assert.ok(hero.includes('Affiliate Pin Campaigns'), 'service rows missing');
  assert.ok(hero.includes('$500'), 'service price missing');
  assert.ok(!hero.includes('QUOTE IT IN 60 SECONDS'), 'canned quote table leaked');
});

test('heroSnippetForCover: checklist rows come from the brief, not canned trade steps', () => {
  const product = { name: 'Make Money From Pinterest — Monetization Checklist', type: 'checklist', brief: 'Monetize from zero: profile optimization, keyword-rich boards, pin formats.' };
  const hero = ds.heroSnippetForCover(product, prof, {});
  assert.ok(hero.includes('Profile optimization'));
  assert.ok(!hero.includes('Arrive with tools'), 'canned trade step leaked');
});

test('composite cover uses a raster real-preview slot with DNA styling and no baked price or emoji', () => {
  const product = {
    name: 'Pin-to-Profit Audit', type: 'checklist', price: '$49',
    concept: JSON.stringify({ name: 'Pin-to-Profit Audit', benefits: ['Audit board intent', 'Map pin keywords', 'Track outbound clicks'] })
  };
  const cover = ds.buildThumbStopperCover(product, prof, {
    primary: '#123456', accent: '#ab7832', font: "'Fraunces'", brief: { fonts: { heading: 'Fraunces' } }
  }, 'data:image/jpeg;base64,AAAA', 'data:image/jpeg;base64,REALPRODUCT');
  assert.match(cover, /<img[^>]+src="data:image\/jpeg;base64,REALPRODUCT"/);
  assert.match(cover, /\.product-preview-screen img\{[^}]*transform:scale\(1\.16\);transform-origin:top center/,
    'rasterized product detail should be modestly enlarged inside the clipped screen for thumbnail legibility');
  assert.match(cover, /rotate\(-[0-9.]+deg\)/);
  assert.match(cover, /box-shadow:0 30px 60px -18px rgba\(0,0,0,.55\)/);
  assert.match(cover, /rgba\(255,248,232,.07\)/);
  assert.match(cover, /\.ts-hero\{[^}]*left:660px/);
  assert.match(cover, /ts-device/, 'fallback slot keeps the drawn tablet device frame');
  assert.match(cover, /ts-screen/, 'template must sit inside the drawn tablet screen, not float beside it');
  assert.match(cover, /<div class="ts-hero"[^>]*><div class="ts-device"><\/div><div class="ts-screen">/, 'real preview sits as a sibling of ts-device inside ts-hero so hiding the bezel never hides the screen');
  assert.match(cover, /linear-gradient\(180deg,transparent/);
  assert.doesNotMatch(cover, /\$49|🎨/);
  assert.match(cover, /font-family:'Fraunces'/);
  assert.match(cover, /MAKE MONEY FROM PINTEREST/);
});

test('adaptive slot: detected tablet screen replaces the fixed slot and hides the drawn bezel while keeping the screen visible', () => {
  const product = { name: 'Pin-to-Profit Audit', type: 'checklist', price: '$49' };
  const adaptive = ds.buildThumbStopperCover(product, prof, { primary: '#123456' }, 'data:image/jpeg;base64,AAAA', 'data:image/jpeg;base64,REALPRODUCT', null, { x: 700, y: 520, width: 420, height: 560, adaptive: true });
  assert.match(adaptive, /left:700px/);
  assert.match(adaptive, /top:520px/);
  assert.match(adaptive, /\.ts-device\{display:none/, 'adaptive mode blends onto the photo screen — no drawn bezel');
  assert.match(adaptive, /<div class="ts-device"><\/div><div class="ts-screen">/, 'ts-screen must not be a child of ts-device when ts-device is display:none');
  assert.match(adaptive, /<img[^>]+src="data:image\/jpeg;base64,REALPRODUCT"/, 'real product preview remains rendered inside the screen');
  assert.doesNotMatch(adaptive, /transform:rotate/, 'adaptive template sits flat on the photo tablet');
  // Centered tablet that overlaps the lower copy band compacts the copy block so the screen stays unobstructed.
  const centered = ds.buildThumbStopperCover(product, prof, { primary: '#123456' }, 'data:image/jpeg;base64,AAAA', 'data:image/jpeg;base64,REALPRODUCT', null, { x: 384, y: 540, width: 432, height: 612, adaptive: true });
  assert.match(centered, /\.ts-title\{font-size:54px/);
  // Malformed slots fall back to the fixed safe slot.
  const fallback = ds.buildThumbStopperCover(product, prof, { primary: '#123456' }, 'data:image/jpeg;base64,AAAA', 'data:image/jpeg;base64,REALPRODUCT', null, { x: 10, y: 10, width: 40, height: 40 });
  assert.match(fallback, /\.ts-hero\{[^}]*left:660px/);
  assert.match(fallback, /ts-device\{position:absolute/, 'fallback keeps the drawn device');
});

test('cover heroes embed the actual product HTML in a script-isolated preview', () => {
  const product = { name: 'Pinterest Income Tracker', type: 'spreadsheet', price: '$19' };
  const productHtml = '<!doctype html><html><body><h1>REAL PRODUCT ROW — Affiliate Pin Campaigns</h1></body></html>';
  const covers = [
    ds.buildThumbStopperCover(product, prof, { primary: '#123456' }, 'data:image/jpeg;base64,AAAA', productHtml),
    ds.buildPlainCover(product, prof, { primary: '#123456' }, productHtml)
  ];
  for (const cover of covers) {
    assert.match(cover, /<iframe[^>]+srcdoc=/, 'cover should render product HTML, not a hand-built substitute');
    assert.match(cover, /REAL PRODUCT ROW — Affiliate Pin Campaigns/);
    assert.match(cover, /sandbox=""/, 'product preview scripts and privileges must remain disabled');
    assert.doesNotMatch(cover, /allow-scripts/);
    assert.doesNotMatch(cover, /Booked out\.<br>Every week\./, 'generic social hero must not substitute for product');
  }
});

test('marketplace cover uses a 4:5 safe crop that fully contains the device slot', () => {
  const { COVER_MASTER, MARKETPLACE_SAFE_RECT, DEVICE_SLOT } = ds;
  const { crop, master } = fileFactory.COVER_EXPORT;
  assert.deepEqual(master, COVER_MASTER);
  assert.equal(crop.width, 1200);
  assert.equal(crop.height, 1500);
  assert.equal(crop.width / crop.height, 4 / 5);
  assert.equal(crop.x, MARKETPLACE_SAFE_RECT.x);
  assert.equal(crop.y, MARKETPLACE_SAFE_RECT.y);
  assert.ok(DEVICE_SLOT.x >= MARKETPLACE_SAFE_RECT.x, 'slot begins inside horizontal safe bounds');
  assert.ok(DEVICE_SLOT.y >= MARKETPLACE_SAFE_RECT.y, 'slot begins inside vertical safe bounds');
  assert.ok(DEVICE_SLOT.x + DEVICE_SLOT.width <= MARKETPLACE_SAFE_RECT.x + MARKETPLACE_SAFE_RECT.width, 'slot ends inside horizontal safe bounds');
  assert.ok(DEVICE_SLOT.y + DEVICE_SLOT.height <= MARKETPLACE_SAFE_RECT.y + MARKETPLACE_SAFE_RECT.height, 'slot ends inside vertical safe bounds');
  assert.equal(DEVICE_SLOT.y - MARKETPLACE_SAFE_RECT.y, 150, 'slot has 150px margin above crop');
  assert.equal(MARKETPLACE_SAFE_RECT.y + MARKETPLACE_SAFE_RECT.height - DEVICE_SLOT.y - DEVICE_SLOT.height, 750, 'slot is fully retained below crop');
});

test('cover renderer retains the 2:3 JPEG master and exports an exact 1200x1500 4:5 JPEG', async () => {
  const { COVER_MASTER, MARKETPLACE_SAFE_RECT } = ds;
  assert.deepEqual(fileFactory.COVER_EXPORT.master, COVER_MASTER);
  assert.deepEqual(fileFactory.COVER_EXPORT.crop, MARKETPLACE_SAFE_RECT);
  assert.equal(COVER_MASTER.width / COVER_MASTER.height, 2 / 3);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nichegate-cover-ratio-'));
  const output = path.join(tmp, 'marketplace.jpg');
  const screenshots = [];
  const originalGetBrowser = pdfGen.getBrowser;
  pdfGen.getBrowser = async () => ({
    newPage: async () => ({
      setViewport: async (viewport) => { assert.deepEqual(viewport, { width: 1200, height: 1800, deviceScaleFactor: 1 }); },
      setContent: async () => {},
      screenshot: async (options) => {
        screenshots.push(options);
        fs.writeFileSync(options.path, 'jpeg');
      },
      close: async () => {}
    })
  });
  try {
    assert.equal(await fileFactory.renderCoverImage('<html></html>', output), output);
    assert.equal(screenshots.length, 2);
    assert.deepEqual(screenshots.map(({ clip }) => clip), [
      { x: 0, y: 0, width: 1200, height: 1800 },
      { x: 0, y: 150, width: 1200, height: 1500 }
    ]);
    assert.ok(fs.existsSync(output.replace(/\.jpg$/i, '.master.jpg')));
    assert.ok(fs.existsSync(output));
  } finally {
    pdfGen.getBrowser = originalGetBrowser;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('Pinterest selects the retained 2:3 master while marketplaces use 4:5', () => {
  const db = require('../server/database').db;
  const path = require('node:path');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nichegate-pin-master-'));
  const marketplace = path.join(tmp, 'product-cover-v5-123.jpg');
  const master = marketplace.replace(/\\.jpg$/i, '.master.jpg');
  fs.writeFileSync(marketplace, '4:5');
  fs.writeFileSync(master, '2:3');
  const profId = db.prepare('INSERT INTO professions (name, slug) VALUES (?, ?)').run(`Cover Ratio ${Date.now()}`, `cover-ratio-${Date.now()}`).lastInsertRowid;
  const productId = db.prepare('INSERT INTO products (profession_id, name, type, preview_path) VALUES (?, ?, ?, ?)').run(profId, 'Ratio Test', 'checklist', marketplace).lastInsertRowid;
  try {
    assert.equal(pinEngine.pinImageUrl(productId), master);
    assert.equal(pinEngine.pinImageUrl(productId, { fullFrame: false }), marketplace);
  } finally {
    db.prepare('DELETE FROM products WHERE id = ?').run(productId);
    db.prepare('DELETE FROM professions WHERE id = ?').run(profId);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('fileFactory invalidates prior thumbnail paths after a cover design version changes', () => {
  assert.equal(fileFactory.isCurrentCoverPath('previews/product-42-previous.jpg'), false);
  assert.equal(fileFactory.isCurrentCoverPath('previews/product-42-cover-v4-123.jpg'), false);
  assert.equal(fileFactory.isCurrentCoverPath('previews/product-42-cover-v5-123.jpg'), false);
  assert.equal(fileFactory.isCurrentCoverPath('previews/product-42-cover-v6-123.jpg'), false);
  assert.equal(fileFactory.isCurrentCoverPath('previews/product-42-cover-v8-123.jpg'), false, 'v8 previews predate the enlarged product-screen treatment');
  assert.equal(fileFactory.isCurrentCoverPath('previews/product-42-cover-v9-123.jpg'), true);
  assert.equal(fileFactory.isCurrentCoverPath('previews/product-42-cover-v7-123.jpg'), false, 'v7 covers were drawn from the generic mockup and must regenerate');
  assert.equal(fileFactory.isCurrentCoverPath(null), false);
});

test('cover product previews escape iframe-breaking markup in product HTML', () => {
  const product = { name: 'Safe Preview', type: 'tool' };
  const hostile = '<h1>actual</h1></iframe><script>alert(1)</script>';
  const cover = ds.buildPlainCover(product, prof, {}, hostile);
  assert.match(cover, /&lt;\/iframe&gt;/);
  assert.doesNotMatch(cover, /<\/iframe><script>alert\(1\)<\/script>/);
});
