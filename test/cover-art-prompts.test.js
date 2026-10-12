// Prompt style-token factory + off-niche scene quality gate.
const test = require('node:test');
const assert = require('node:assert/strict');
const coverArt = require('../server/services/coverArt');
const designStyles = require('../server/services/designStyles');

const creatorProf = { name: 'Make Money From Pinterest', slug: 'make-money-from-pinterest' };
const product = { type: 'spreadsheet' };

test('buildArtPrompt: photo-cover profile appends the strict style tokens', () => {
  const p = coverArt.buildArtPrompt(creatorProf, product, 'photo-cover');
  for (const token of coverArt.STYLE_PROFILES['photo-cover']) {
    assert.ok(p.includes(token), `missing style token: ${token}`);
  }
});

test('buildArtPrompt: creator niches never get circuit-board / trading-floor scenes', () => {
  for (const type of ['spreadsheet', 'roi', 'checklist']) {
    const p = coverArt.buildArtPrompt(creatorProf, { type });
    assert.ok(!/circuit board|holographic|stock market|trading floor|candlestick|ticker tape/i.test(p),
      `off-niche scene leaked for ${type}: ${p}`);
  }
});

test('buildArtPrompt: photo backgrounds leave screen and document content for the real composite', () => {
  for (const type of ['spreadsheet', 'invoice', 'website', 'social', 'roi']) {
    const p = coverArt.buildArtPrompt(creatorProf, { type }).toLowerCase();
    assert.match(p, /no screen content/);
    assert.match(p, /no charts/);
    assert.match(p, /no text/);
    assert.match(p, /no documents/);
    assert.doesNotMatch(p, /showing organized data|showing a clean website design|showing social media content|financial analysis printout with charts/);
  }
  const finance = coverArt.buildArtPrompt({ name: 'Tax Consultant', slug: 'tax-consultant' }, { type: 'roi' }).toLowerCase();
  assert.match(finance, /no charts/);
  assert.match(finance, /no graphs/);
  assert.doesNotMatch(finance, /physical materials, calculator, financial charts|showing (?:data|charts)|financial analysis printout/);
});

test('buildArtPrompt: vector-asset profile targets flat cutout assets', () => {
  const p = coverArt.buildArtPrompt(creatorProf, product, 'vector-asset');
  assert.ok(p.includes('transparent background'));
  assert.ok(p.includes('flat vector illustration'));
  assert.ok(!p.includes('photorealistic'));
});

test('buildArtPrompt: deterministic for the same product DNA', () => {
  const a = coverArt.buildArtPrompt(creatorProf, product);
  assert.equal(a, coverArt.buildArtPrompt(creatorProf, product));
  assert.equal(a, coverArt.promptFor(creatorProf, product), 'promptFor must alias buildArtPrompt');
});

test('cover scene library follows design DNA and gives five niches five distinct flat-lay scenes', () => {
  const samples = [
    [{ name: 'Roofing Contractor' }, 'checklist'],
    [{ name: 'Landscape Designer' }, 'checklist'],
    [{ name: 'Luxury Salon' }, 'checklist'],
    [{ name: 'Pinterest Creator' }, 'checklist'],
    [{ name: 'Tax Consultant' }, 'checklist']
  ];
  const scenes = samples.map(([prof, type]) => {
    const theme = designStyles.resolveDesign(prof, type);
    return coverArt.sceneFor(prof, { type }, theme).name;
  });
  assert.equal(new Set(scenes).size, 5, `expected five distinct art directions: ${scenes.join(', ')}`);
  assert.ok(scenes.includes('Ink-Trap Engineered'));
  assert.ok(scenes.includes('Grounded Organic'));
  assert.ok(scenes.includes('Quiet Luxury'));
  assert.ok(scenes.includes('Flash & Chrome'));
  assert.ok(scenes.includes('Bold Minimalism'));
});

test('buildArtPrompt: photo generation specifies a blank portrait tablet slot and hard negatives', () => {
  const p = coverArt.buildArtPrompt(creatorProf, product, 'photo-cover');
  for (const token of ['1200x1800', 'blank white tablet', 'flat-lay', 'right 45%', 'vertically centered', 'no text', 'no labels', 'no writing', 'no logos', 'no screen content', 'no documents']) {
    assert.ok(p.toLowerCase().includes(token.toLowerCase()), `missing blank-slot instruction: ${token}`);
  }
  assert.doesNotMatch(p, /notebook with colorful sticky notes|screen glow|monitor/i);
});

test('Lucid Origin output dimensions are validated rather than center-cropped', () => {
  const png = (width, height) => {
    const b = Buffer.alloc(24);
    Buffer.from([137,80,78,71,13,10,26,10]).copy(b, 0);
    b.writeUInt32BE(13, 8);
    b.write('IHDR', 12, 'ascii');
    b.writeUInt32BE(width, 16);
    b.writeUInt32BE(height, 20);
    return b;
  };
  assert.deepEqual(coverArt.getImageDimensions(png(1200, 1800)), { width: 1200, height: 1800, mime: 'image/png' });
  assert.equal(coverArt.isNativePortraitImage(png(1200, 1800)), true);
  assert.equal(coverArt.isNativePortraitImage(png(1024, 1024)), false);
  assert.equal(coverArt.isNativePortraitImage(png(1200, 1500)), false);
});

test('Lucid Origin request contract uses native portrait dimensions', () => {
  assert.equal(coverArt.COVER_WIDTH, 1200);
  assert.equal(coverArt.COVER_HEIGHT, 1800);
  assert.match(coverArt.workerRequestBody(coverArt.promptFor(creatorProf, product)), /"width":1200/);
  assert.match(coverArt.workerRequestBody(coverArt.promptFor(creatorProf, product)), /"height":1800/);
});
