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

test('buildArtPrompt: profession scenes name the trade real setting and tools', () => {
  const roof = coverArt.buildArtPrompt({ name: 'Roofing Contractor', slug: 'roofing' }, { type: 'spreadsheet' });
  assert.match(roof, /rooftop deck/i);
  assert.match(roof, /ladder/i);
  assert.match(roof, /shingle/i);
  assert.match(roof, /the only tools in frame are a shingle hatchet/i);
  assert.match(roof, /no calipers/i, 'unrelated instruments must be explicitly excluded');
  // The style DNA must contribute look only — never its own generic subject.
  assert.doesNotMatch(roof, /one chrome tool/i);
  assert.doesNotMatch(roof, /dark leather work surface/i);
  assert.match(roof, /not an illustration/i);

  // A different trade must get its own scene, not the roofing one.
  const plumb = coverArt.buildArtPrompt({ name: 'Plumber', slug: 'plumber' }, { type: 'invoice' });
  assert.match(plumb, /basin wrench/i);
  assert.doesNotMatch(plumb, /rooftop deck/i);

  // Unknown professions keep the generic prop line rather than a wrong scene.
  const unknown = coverArt.buildArtPrompt({ name: 'Life Coach', slug: 'life-coach' }, { type: 'checklist' });
  assert.match(unknown, /two or three small contextual physical props/);
  assert.match(unknown, /dark or earth-toned/, 'generic props must stay dark so they never out-scan the screen');
  assert.equal(coverArt.professionScene({ name: 'Life Coach', slug: 'life-coach' }), null);
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

test('detectWhiteRect: rejects bright round props (tape rolls) that lack a dark bezel rim', () => {
  const W = 150, H = 225;
  // A tape roll: a bright DISC, bright in the middle, tapering at top/bottom,
  // no dark bezel ring around it. This is the exact defect — the scan used to
  // pick it and glue the product page onto the prop.
  const roll = new Array(W * H).fill(150);
  const cx = 105, cy = 112, R = 46;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot(x - cx, (y - cy) * 0.72);
    if (d < R) roll[y * W + x] = 235;
  }
  assert.equal(coverArt.detectWhiteRect(roll, W, H), null,
    'a round bright prop must not be treated as the tablet screen');

  // Control: the SAME bright rect but with a dark bezel ring just outside all
  // four edges — the black-and-silver tablet outline — must still detect.
  const tab = new Array(W * H).fill(150);
  const x0 = 78, x1 = 128, y0 = 48, y1 = 176;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) tab[y * W + x] = 235;
  for (let y = y0 - 4; y < y1 + 4; y++) for (let x = x0 - 4; x < x1 + 4; x++) {
    if (y >= 0 && y < H && x >= 0 && x < W && (y < y0 || y >= y1 || x < x0 || x >= x1)) tab[y * W + x] = 30;
  }
  const r = coverArt.detectWhiteRect(tab, W, H);
  assert.ok(r, 'a bezeled tablet screen must still be detected');
  assert.ok(Math.abs(r.x - x0) <= 6 && Math.abs(r.y - y0) <= 6,
    `detected rect should hug the bezeled screen, got ${JSON.stringify(r)}`);
});

test('buildArtPrompt: photo generation specifies a blank portrait tablet slot and hard negatives', () => {
  const p = coverArt.buildArtPrompt(creatorProf, product, 'photo-cover');
  for (const token of ['1200x1800', 'blank white tablet', 'flat-lay', 'right 46%', 'vertically centered', 'approximately 46% of frame width and 42% of frame height', 'leave the left 54% visually quiet', 'no text', 'no labels', 'no writing', 'no logos', 'no screen content', 'no documents']) {
    assert.ok(p.toLowerCase().includes(token.toLowerCase()), `missing blank-slot instruction: ${token}`);
  }
  assert.doesNotMatch(p, /notebook with colorful sticky notes|screen glow|monitor/i);
});

test('buildArtPrompt: no scene invites bright screen-decoy props (tape rolls, clipboards, open paper)', () => {
  // Every photo-cover prompt must exclude the props that fool the screen
  // detector into gluing the product page onto a prop instead of the tablet.
  const p = coverArt.buildArtPrompt(creatorProf, product, 'photo-cover').toLowerCase();
  assert.match(p, /no tape rolls/);
  assert.match(p, /no clipboards/);
  assert.match(p, /no open journals|no open books/);
  assert.match(p, /no loose paper sheets/);
  assert.match(p, /exactly one blank white tablet/);
  assert.match(p, /dark inner rim clearly outlines all four sides/,
    'the working covers are the bezeled ones — the prompt must demand the rim');

  // Spot-check the trade scenes that USED to ship a decoy prop. The prompt
  // now bans them by name ("no tape rolls"), so match POSITIVE prop phrasing
  // only — a bare /gaffer tape/ would trip over its own ban line.
  const scenes = [
    [{ name: 'Photographer', slug: 'photographer' }, /are a camera battery[^,]*, a lens cloth and a roll of|props?:[^,]*gaffer/],
    [{ name: 'Electrician', slug: 'electrician' }, /props?:[^,]*roll of electrical tape/],
    [{ name: 'Plumber', slug: 'plumber' }, /props?:[^,]*teflon tape/],
    [{ name: 'Mold Inspector', slug: 'mold-inspector' }, /props?:[^,]*clipboard/],
    [{ name: 'Tax Consultant', slug: 'tax-consultant' }, /props?:[^,]*paper ledger|and a short stack of blank cream paper/],
    [{ name: 'Recovery Coach', slug: 'recovery-coach' }, /props?:[^,]*open journal/]
  ];
  for (const [prof, decoy] of scenes) {
    const sp = coverArt.buildArtPrompt(prof, { type: 'checklist' }, 'photo-cover').toLowerCase();
    assert.doesNotMatch(sp, decoy, `${prof.name} still ships a screen-decoy prop`);
  }
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
