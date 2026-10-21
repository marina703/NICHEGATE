const { test } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');

const brandKit = require('../server/services/brandKit');
const styleDNA = require('../server/services/styleDNA');
const inv = require('../server/services/designInvariants');
const coverRenderer = require('../server/services/coverRenderer');

const HVAC = { name: 'HVAC Technician', slug: 'hvac-technician', category: 'trades' };

test('brandKit: deterministic, monogram, valid hex palette', () => {
  const a = brandKit.buildBrandKit(HVAC);
  const b = brandKit.buildBrandKit(HVAC);
  assert.equal(a.tone, b.tone, 'deterministic tone');
  assert.equal(a.monogram, 'HT');
  assert.match(a.palette.base, /^#[0-9a-f]{6}$/);
  assert.match(a.palette.accent, /^#[0-9a-f]{6}$/);
  assert.ok(a.displayFonts.length > 0 && a.bodyFonts.length > 0);
  assert.ok(a.motifs.length > 0 && a.heroBias.length > 0);
});

test('brandKit: tone detection maps niches sensibly', () => {
  assert.equal(brandKit.detectTone({ name: 'Massage Therapy' }), 'warm');
  assert.equal(brandKit.detectTone({ name: 'Roofing Contractor' }), 'technical');
  assert.equal(brandKit.detectTone({ name: 'Beekeeping / Apiary' }), 'organic');
});

test('styleDNA: deterministic and unique across products', () => {
  const one = styleDNA.composeDNA({ id: 1 }, HVAC);
  const oneAgain = styleDNA.composeDNA({ id: 1 }, HVAC);
  assert.equal(one.hash, oneAgain.hash, 'deterministic');
  const seen = new Set();
  for (let i = 0; i < 12; i++) seen.add(styleDNA.composeDNA({ id: i }, HVAC).hash);
  assert.equal(seen.size, 12, '12 products -> 12 distinct looks');
});

test('styleDNA: stays inside the brand kit bounds', () => {
  const kit = brandKit.buildBrandKit(HVAC);
  const dna = styleDNA.composeDNA({ id: 7 }, HVAC, { kit });
  assert.ok(kit.palette.accentFamilies.includes(dna.palette.accentName), 'accent within kit families');
  assert.ok(kit.displayFonts.includes(dna.fonts.display), 'display font from kit');
  assert.ok(kit.bodyFonts.includes(dna.fonts.body), 'body font from kit');
  assert.ok(styleDNA.HERO_MODALITIES.includes(dna.heroModality));
  assert.ok(styleDNA.LAYOUTS.includes(dna.layout));
});

test('styleDNA: recentHashes push novelty', () => {
  const recent = [];
  for (let i = 0; i < 5; i++) recent.push(styleDNA.composeDNA({ id: i }, HVAC).hash);
  const dna = styleDNA.composeDNA({ id: 9 }, HVAC, { recentHashes: recent });
  assert.ok(!recent.includes(dna.hash), 'avoids a recent look');
});

test('designInvariants: blank image fails, real layout passes', async () => {
  const blank = await sharp({ create: { width: 1200, height: 1200, channels: 3, background: '#ffffff' } }).png().toBuffer();
  const rb = await inv.analyze(blank);
  assert.equal(rb.ok, false);
  assert.ok(rb.failures.some(f => f.startsWith('nonBlank')));

  const svg = `<svg width='1200' height='1200' xmlns='http://www.w3.org/2000/svg'>
    <rect width='1200' height='1200' fill='#fdfcf8'/>
    <rect width='1200' height='620' fill='#18223a'/>
    <text x='70' y='360' font-size='150' fill='#ffffff' font-family='Arial'>HVAC</text>
    <text x='70' y='470' font-size='56' fill='#d9b25a' font-family='Arial'>Technician Checklist</text>
    ${Array.from({ length: 24 }).map((_, i) => `<rect x='70' y='${680 + i * 18}' width='${420 + (i % 5) * 60}' height='7' fill='#25324d'/>`).join('')}
  </svg>`;
  const layout = await sharp(Buffer.from(svg)).png().toBuffer();
  const rl = await inv.analyze(layout);
  assert.equal(rl.ok, true, JSON.stringify(rl.failures));
  assert.ok(rl.metrics.strongEdges > 0.02);
});

test('coverRenderer: buildCoverHTML injects DNA palette, fonts and content', () => {
  const kit = brandKit.buildBrandKit(HVAC);
  const dna = styleDNA.composeDNA({ id: 3 }, HVAC, { kit });
  const html = coverRenderer.buildCoverHTML(dna, {
    title: 'HVAC Technician', subtitle: 'Sub', brand: 'NicheGate', price: '$19',
    bullets: ['a', 'b', 'c', 'd'],
  }, null, { size: 1200 });
  assert.match(html, new RegExp(dna.palette.base.replace('#', '#')));
  assert.ok(html.includes(dna.fonts.display));
  assert.ok(html.includes('HVAC Technician'));
  assert.ok(html.includes('$19'));
  assert.ok(html.includes('layout-' + dna.layout));
});
