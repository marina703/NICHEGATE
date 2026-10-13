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

test('detectWhiteRect: finds a large blank bright rectangle with tight vertical bounds and rejects noise/small/oversized regions', () => {
  const W = 150, H = 225;
  // Photo: mid-gray everywhere, with a bright rect on the right third.
  const mk = () => new Array(W * H).fill(90);
  const buenos = mk();
  for (let y = 30; y < 180; y++) for (let x = 75; x < 140; x++) buenos[y * W + x] = 235;
  const r = coverArt.detectWhiteRect(buenos, W, H);
  assert.ok(r, 'should detect the drawn tablet screen');
  assert.ok(r.width >= 50 && r.height >= 100, `rect plausible: ${JSON.stringify(r)}`);
  assert.ok(r.y >= 26 && r.y <= 36, `vertical start must tightly hug the tablet top (got y=${r.y})`);
  assert.ok(r.y + r.height >= 174 && r.y + r.height <= 186, `vertical end must tightly hug the tablet bottom (got bottom=${r.y + r.height})`);
  // Centered tablet (like the roofing cover): must also detect cleanly with tight bounds.
  const centered = mk();
  for (let y = 62; y < 158; y++) for (let x = 46; x < 105; x++) centered[y * W + x] = 240;
  const rc = coverArt.detectWhiteRect(centered, W, H);
  assert.ok(rc, 'should detect centered tablet screen');
  assert.ok(rc.x >= 42 && rc.x <= 52, `centered x bounds (got x=${rc.x})`);
  assert.ok(rc.y >= 58 && rc.y <= 68, `centered y bounds (got y=${rc.y})`);
  assert.ok(rc.height >= 88 && rc.height <= 104, `centered height tight (got height=${rc.height})`);
  // All-dark photo → no detection.
  assert.equal(coverArt.detectWhiteRect(mk(), W, H), null);
  // Wrong map size → guarded null.
  assert.equal(coverArt.detectWhiteRect([1, 2, 3], W, H), null);
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
