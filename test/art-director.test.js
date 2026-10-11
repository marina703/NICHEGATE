'use strict';
// Art director (Phase 2): brief parsing/validation, the EDITOR-SAFETY lint
// (security gate), ΔE novelty gate, style blending, theme application and the
// dynamic font URL. Hermetic — no model calls (generateBrief's prompt/route
// seams are exercised through parse/sanitize; the model leg is stubbed).
const test = require('node:test');
const assert = require('node:assert/strict');
const { db, init } = require('../server/database');
init(); // idempotent

const art = require('../server/services/artDirector');
const designStyles = require('../server/services/designStyles');
const router = require('../server/services/modelRouter');

function goodBriefJson(overrides = {}) {
  return JSON.stringify({
    mood: ['calm', 'precise', 'warm'],
    palette: { primary: '#1b3a5c', secondary: '#c46a5a', accent: '#e9c46a', bg: '#fdf6ec', surface: '#ffffff', border: '#e2d9c8' },
    fonts: { heading: 'Fraunces', body: 'Public Sans', mono: 'Space Mono' },
    font_reason: 'Warm serif over a clean grotesque suits an artisan trade.',
    motif: 'topographic contour lines',
    motif_css: 'border-bottom:2px solid #e9c46a',
    layout: 'asymmetric',
    whitespace: 'generous',
    texture: 'paper',
    style_lineage: 'editorial x organic',
    ...overrides
  });
}

// ── parsing + validation ────────────────────────────────────────────────

test('artDirector: parseBrief accepts a valid brief and clamps enums', () => {
  const b = art.parseBrief(goodBriefJson({ layout: 'nonsense', whitespace: 'chaotic' }));
  assert.ok(b);
  assert.equal(b.layout, 'classic', 'unknown layout clamped to classic');
  assert.equal(b.whitespace, 'normal', 'unknown whitespace clamped to normal');
  assert.equal(b.fonts.heading, 'Fraunces');
  assert.equal(b.mood.length, 3);
});

test('artDirector: parseBrief rejects briefs without a usable palette or fonts', () => {
  assert.equal(art.parseBrief(null), null);
  assert.equal(art.parseBrief('no json'), null);
  assert.equal(art.parseBrief(JSON.stringify({ palette: { primary: '#fff' }, fonts: { heading: 'A', body: 'B' } })), null); // 1 color only
  assert.equal(art.parseBrief(JSON.stringify({ palette: { primary: 'red', secondary: '#123456', accent: '#654321' }, fonts: { heading: 'A', body: 'B' } })), null); // non-hex
  assert.equal(art.parseBrief(JSON.stringify({ palette: { primary: '#111111', secondary: '#222222', accent: '#333333' }, fonts: { heading: 'ok' } })), null); // no body font
});

test('artDirector: sanitizeHex normalizes shorthand and rejects junk', () => {
  assert.equal(art.sanitizeHex('#ABC'), '#aabbcc');
  assert.equal(art.sanitizeHex('#a1b2c3'), '#a1b2c3');
  assert.equal(art.sanitizeHex('red'), null);
  assert.equal(art.sanitizeHex('#12345'), null);
  assert.equal(art.sanitizeHex('javascript:alert(1)'), null);
});

// ── EDITOR-SAFETY LINT (security gate) ──────────────────────────────────

test('artDirector: safety lint strips url(), @import, position:fixed and expression()', () => {
  assert.equal(art.sanitizeCssDeclarations('background:url(http://evil.com/x.png)'), '');
  assert.equal(art.sanitizeCssDeclarations('background:URL(//evil.com/x)'), '');
  assert.equal(art.sanitizeCssDeclarations('@import "x.css"'), '');
  assert.equal(art.sanitizeCssDeclarations('position:fixed;top:0'), '');
  assert.equal(art.sanitizeCssDeclarations('position:sticky'), '');
  assert.equal(art.sanitizeCssDeclarations('width:expression(alert(1))'), '');
  assert.equal(art.sanitizeCssDeclarations('color:red;background:url(javascript:alert(1))'), 'color:red');
});

test('artDirector: safety lint keeps cosmetic hex/typographic declarations', () => {
  const out = art.sanitizeCssDeclarations('border-bottom:2px solid #e9c46a;letter-spacing:1px;border-radius:999px');
  assert.equal(out, 'border-bottom:2px solid #e9c46a;letter-spacing:1px;border-radius:999px');
});

test('artDirector: motif_css and texture in a brief pass through the lint', () => {
  const b = art.parseBrief(goodBriefJson({ motif_css: 'background:url(https://evil.example/x.png);color:#111111' }));
  assert.equal(b.motif_css, 'color:#111111', 'url( stripped, safe decl kept');
  const b2 = art.parseBrief(goodBriefJson({ texture: 'background:url(https://evil.example/x.png)' }));
  assert.ok(!String(b2.texture || '').includes('url('), 'texture cannot smuggle a URL');
});

test('artDirector: font names are sanitized (no quote/paren/semicolon injection)', () => {
  assert.equal(art.sanitizeFontName("Fraunces"), 'Fraunces');
  assert.equal(art.sanitizeFontName('");}body{display:none}'), null);
  assert.equal(art.sanitizeFontName('font-family:evil'), null);
  assert.equal(art.sanitizeFontName('a'.repeat(60)), null);
});

test('artDirector: googleFontsUrl never leaks URL syntax from family names', () => {
  const url = art.applyBriefToTheme ? designStyles.googleFontsUrl(['Fraunces', 'Bad&Family=Injected', "x');alert(1)"]) : '';
  assert.ok(url.includes('family=Fraunces'));
  assert.ok(!url.includes('Injected'));
  assert.ok(!url.includes('alert'));
});

// ── novelty gate (ΔE + repeated words) ──────────────────────────────────

test('artDirector: deltaE is 0 for identical colors and large for distant ones', () => {
  assert.ok(art.deltaE('#1b3a5c', '#1b3a5c') < 0.01);
  assert.ok(art.deltaE('#1b3a5c', '#e9c46a') > 40);
});

test('artDirector: novelty gate rejects near-identical palettes and repeated mood words', () => {
  const mine = art.sanitizeBrief(JSON.parse(goodBriefJson()));
  const twin = { ...mine, palette: { ...mine.palette, primary: '#1c3b5d' } }; // ΔE ≈ 0
  const gateTwin = art.briefNoveltyGate(twin, 'trades', { lookback: [mine] });
  assert.equal(gateTwin.pass, false);
  assert.match(gateTwin.reason, /palette within/);

  // Distinct palette (so the palette check passes) but repeated mood/motif words.
  const repeat = art.sanitizeBrief(JSON.parse(goodBriefJson({
    palette: { primary: '#0b7a4b', secondary: '#d1410c', accent: '#123456', bg: '#ffffff', surface: '#f0f0f0', border: '#cccccc' },
    mood: ['calm', 'precise'],
    motif: 'topographic contour lines'
  })));
  const gateRepeat = art.briefNoveltyGate(repeat, 'trades', { lookback: [mine] });
  assert.equal(gateRepeat.pass, false);
  assert.match(gateRepeat.reason, /repeats/);

  const fresh = art.sanitizeBrief(JSON.parse(goodBriefJson({
    palette: { primary: '#7b1e3a', secondary: '#2c5f2d', accent: '#f4d35e', bg: '#fff8f0', surface: '#ffffff', border: '#d9c7b8' },
    mood: ['electric', 'raw', 'bold'],
    motif: 'hazard stripe'
  })));
  const gateFresh = art.briefNoveltyGate(fresh, 'trades', { lookback: [mine] });
  assert.equal(gateFresh.pass, true);
});

// ── mechanical diversity levers ─────────────────────────────────────────

test('artDirector: style blending is deterministic per product and draws 2 styles', () => {
  const a1 = art.blendStyleKeys(42);
  const a2 = art.blendStyleKeys(42);
  assert.deepEqual(a1, a2, 'same seed → same blend');
  assert.ok(a1.length >= 1 && a1.length <= 2);
  const keys = new Set(designStyles.getAllStyles().map(s => s.key));
  a1.forEach(k => assert.ok(keys.has(k)));
});

test('artDirector: every niche category has a visual motif library', () => {
  for (const cat of designStyles.getNicheCategories()) {
    const motifs = art.pickMotifs(cat);
    assert.ok(motifs.length >= 1, `${cat} needs motifs`);
    for (const m of motifs) {
      assert.ok(m.motif && m.css, `${cat} motif shape`);
      assert.equal(art.sanitizeCssDeclarations(m.css), m.css, `${cat} motif css must pass its own safety lint`);
    }
  }
});

// ── brief → theme application ───────────────────────────────────────────

test('artDirector: applyBriefToTheme overrides palette/fonts and injects linted css', () => {
  const theme = {
    name: 'editorial', font: "'Playfair Display', serif",
    primary: '#111111', secondary: '#222222', accent: '#333333', bg: '#eeeeee',
    dna: {
      styleKey: 'editorial', niche: 'trades',
      fonts: { heading: "'Playfair Display'", body: "'Inter'", mono: "'JetBrains Mono'" },
      colors: { primary: '#111111', secondary: '#222222', accent: '#333333', bg: '#eeeeee', surface: '#ffffff', border: '#dddddd' },
      css: '.section{margin:24px 0}'
    }
  };
  const brief = art.sanitizeBrief(JSON.parse(goodBriefJson()));
  const out = art.applyBriefToTheme(theme, brief);
  assert.equal(out.primary, '#1b3a5c');
  assert.equal(out.accent, '#e9c46a');
  assert.ok(out.font.includes('Fraunces'));
  assert.ok(out.dna.css.includes('Fraunces'), 'brief heading font lands in dna css');
  assert.ok(out.dna.css.includes('topographic') || out.dna.css.includes(brief.motif_css), 'motif css injected');
  assert.ok(out.dna.css.includes('.section{margin:24px 0}'), 'original dna css preserved');
  assert.ok(out.dna.fontsUrl && out.dna.fontsUrl.includes('Fraunces'), 'brief fonts ride a dynamic Google Fonts URL');
  assert.equal(out.dna.niche, 'trades', 'dna identity untouched');
});

test('artDirector: applyBriefToTheme is a no-op without a brief (zero breakage)', () => {
  const theme = { name: 'x', primary: '#111111', dna: { css: 'a{}', fonts: { heading: 'h', body: 'b', mono: 'm' }, colors: {} } };
  assert.equal(art.applyBriefToTheme(theme, null), theme);
  assert.equal(art.applyBriefToTheme(theme, {}), theme);
});

test('artDirector: applyBriefToTheme builds the FULL dna layer even on dna-less base themes', () => {
  // Regression: base themes without a dna object used to drop the brief CSS and
  // the Google Fonts link — renders collapsed to palette swaps (scored 2/10 by
  // the live critic as "generic recolored template").
  const bare = { name: 'Midnight Chrome', primary: '#111111', secondary: '#222222', accent: '#333333', bg: '#ffffff' };
  const brief = art.sanitizeBrief(JSON.parse(goodBriefJson()));
  const out = art.applyBriefToTheme(bare, brief);
  assert.ok(out.dna, 'briefed themes must always carry dna');
  assert.ok(out.dna.fontsUrl && out.dna.fontsUrl.includes('Fraunces'), 'real Google Fonts URL');
  assert.ok(out.dna.css.includes(brief.motif_css), 'motif css reaches the render');
  assert.ok(out.dna.css.includes('.page'), 'layout css reaches the render');
  assert.ok(out.dna.fonts.heading.includes('Fraunces'));
  assert.equal(out.dna.colors.primary, '#1b3a5c');
  // dna-laden themes keep their identity (style key, niche, base css).
  const rich = {
    name: 'editorial', primary: '#111111',
    dna: { styleKey: 'editorial', niche: 'trades', css: 'base{}', fonts: { heading: 'h', body: 'b', mono: 'm' }, colors: { primary: '#111111' } }
  };
  const out2 = art.applyBriefToTheme(rich, brief);
  assert.equal(out2.dna.styleKey, 'editorial');
  assert.equal(out2.dna.niche, 'trades');
  assert.ok(out2.dna.css.startsWith('base{}'), 'original dna css preserved');
});

// ── generateBrief wiring (model leg stubbed) ────────────────────────────

test('artDirector: generateBrief returns null with AI off and never throws on model errors', async (t) => {
  const cfg = require('../server/services/modelConfig');
  const prof = { name: 'Test Trade', slug: 'test-trade', services: '[]' };
  const product = { id: 999999, name: '__art_test__', type: 'checklist', price: '$12' };
  if (cfg.enabled) {
    // Stub the ideation leg — still hermetic.
    const original = router.generateIdeas;
    router.generateIdeas = async () => { throw new Error('boom'); };
    try {
      assert.equal(await art.generateBrief(product, prof, { useReferences: false }), null);
    } finally {
      router.generateIdeas = original;
    }
    return;
  }
  assert.equal(await art.generateBrief(product, prof, { useReferences: false }), null);
});

test('artDirector: design reference pool seeds and picks are brief-level DNA only', () => {
  const swipe = require('../server/services/swipeFileEngine');
  swipe.seedDesignReferences();
  const refs = swipe.pickDesignReferences('trades', 2);
  assert.ok(refs.length >= 1 && refs.length <= 2);
  for (const r of refs) {
    assert.ok(r.title && r.palette && r.taste_note, 'reference rows carry extracted DNA');
    assert.ok(!/data:image|<img|base64/i.test(JSON.stringify(r)), 'never pixel data — brief-level transfer only');
  }
});

// ── brief-by-default: every build is born with design DNA ─────────────────

const cfg2 = require('../server/services/modelConfig');

function makeProfession(suffix) {
  return db.prepare(
    "INSERT INTO professions (emoji,name,slug,status,tier,colors,services,hashtags) VALUES ('🎨', ?, ?, 'researching', 'safe', '{}', '[]', '[]')"
  ).run('__artdef_prof_' + suffix, '__artdef-prof-' + suffix + '-' + Math.random().toString(36).slice(2, 8)).lastInsertRowid;
}
function makeProduct(profId) {
  return db.prepare(
    "INSERT INTO products (profession_id,name,type,price,status,theme,origin,created_at) VALUES (?,?,?,?,?,?,?,?)"
  ).run(profId, '__artdef_product__', 'checklist', '$12', 'draft', 'sage', 'engine', '2026-10-11 00:00:00').lastInsertRowid;
}
function cleanupFixtures(pid, profId) {
  db.prepare('DELETE FROM products WHERE id = ?').run(pid);
  db.prepare('DELETE FROM professions WHERE id = ?').run(profId);
}
function stubIdeas(fn) {
  const original = router.generateIdeas;
  router.generateIdeas = fn;
  return () => { router.generateIdeas = original; };
}
function withAiOn() {
  const was = cfg2.enabled;
  cfg2.enabled = true;
  return () => { cfg2.enabled = was; };
}

test('artDirector: synthesizeBrief always yields a lint-safe deterministic brief', () => {
  const product = { id: 3, name: 'x', type: 'checklist', theme: 'sage' };
  const prof = { name: 'Test Trade', services: '[]' };
  const b = art.synthesizeBrief(product, prof);
  assert.ok(b, 'products are never born bare — a brief always exists');
  assert.equal(b._deterministic, true);
  assert.ok(['classic', 'sidebar', 'full-bleed', 'asymmetric', 'zine'].includes(b.layout));
  for (const [k, v] of Object.entries(b.palette)) {
    assert.match(v, /^#[0-9a-f]{6}$/, k + ' must be a clean hex');
  }
  assert.ok(b.fonts.heading && b.fonts.body, 'curated pairing');
  assert.ok(b.motif, 'niche motif applied');
  assert.equal(art.sanitizeCssDeclarations(b.motif_css || ''), b.motif_css || '', 'motif css passes its own lint');
  assert.deepEqual(art.synthesizeBrief(product, prof), b, 'deterministic: same product → same brief');
});

test('artDirector: synthesizeBrief rotates layout + font pairing per product (no shared skin)', () => {
  const prof = { name: 'Test Trade', services: '[]' };
  const a = art.synthesizeBrief({ id: 1, type: 'checklist' }, prof);
  const b = art.synthesizeBrief({ id: 2, type: 'checklist' }, prof);
  assert.notEqual(a.layout, b.layout, 'layout rotates per product id');
  assert.notDeepEqual(a.fonts, b.fonts, 'font pairing rotates too');
});

test('artDirector: ensureDesignBrief lands a deterministic brief when the model yields none', async () => {
  const profId = makeProfession('a');
  const pid = makeProduct(profId);
  const restore = stubIdeas(async () => null); // model leg yields nothing
  try {
    const prof = db.prepare('SELECT * FROM professions WHERE id = ?').get(profId);
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(pid);
    const brief = await art.ensureDesignBrief(product, prof);
    assert.ok(brief, 'brief-by-default: never null for a real product');
    assert.equal(brief._deterministic, true, 'deterministic synthesis takes over');
    const row = db.prepare('SELECT design_brief FROM products WHERE id = ?').get(pid);
    assert.ok(row.design_brief, 'brief persisted at birth');
    // Cost control: the stored brief wins — no regeneration on later builds.
    const again = await art.ensureDesignBrief(product, prof);
    assert.equal(again.motif, brief.motif, 'existing brief is reused, not regenerated');
  } finally {
    restore();
    cleanupFixtures(pid, profId);
  }
});

test('artDirector: ensureDesignBrief prefers the GENERATED brief when the model provides one', async () => {
  const profId = makeProfession('b');
  const pid = makeProduct(profId);
  // Alien tokens + extreme palette: cannot trip the novelty gate lookback.
  const generated = JSON.stringify({
    mood: ['zzqflux', 'vyxwave'],
    palette: { primary: '#e8e400', secondary: '#ff6a00', accent: '#00c2ff', bg: '#ffffff', surface: '#f5f5f5', border: '#cccccc' },
    fonts: { heading: 'Syne', body: 'Manrope', mono: 'Space Mono' },
    font_reason: 'zzqflux pairing',
    motif: 'zzqflux vyxwave',
    motif_css: 'border-bottom:2px solid #ff6a00',
    layout: 'zine', whitespace: 'tight', texture: 'grid',
    style_lineage: 'zzqflux lineage'
  });
  const ai = withAiOn();
  const restore = stubIdeas(async () => generated);
  try {
    const prof = db.prepare('SELECT * FROM professions WHERE id = ?').get(profId);
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(pid);
    const brief = await art.ensureDesignBrief(product, prof);
    assert.ok(brief);
    assert.ok(!brief._deterministic, 'generated briefs are the preferred default');
    assert.equal(brief.motif, 'zzqflux vyxwave');
    const row = db.prepare('SELECT design_brief FROM products WHERE id = ?').get(pid);
    assert.equal(JSON.parse(row.design_brief).motif, 'zzqflux vyxwave', 'the generated brief is what persists');
  } finally {
    restore();
    ai();
    cleanupFixtures(pid, profId);
  }
});

test('fileFactory: ensureBuildBrief gives every build design DNA and never overwrites', async () => {
  const profId = makeProfession('c');
  const pid = makeProduct(profId);
  const restore = stubIdeas(async () => null);
  try {
    const ff = require('../server/services/fileFactory');
    const prof = db.prepare('SELECT * FROM professions WHERE id = ?').get(profId);
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(pid);
    const brief = await ff.ensureBuildBrief(product, prof);
    assert.ok(brief && brief._deterministic, 'AI-off builds still get a deterministic brief');
    assert.ok(db.prepare('SELECT design_brief FROM products WHERE id = ?').get(pid).design_brief);
    // Never overwrites: a stored brief is returned as-is (cost + consistency).
    db.prepare('UPDATE products SET design_brief = ? WHERE id = ?').run(JSON.stringify({ marker: 'kept' }), pid);
    const product2 = db.prepare('SELECT * FROM products WHERE id = ?').get(pid);
    const again = await ff.ensureBuildBrief(product2, prof);
    assert.equal(again.marker, 'kept');
  } finally {
    restore();
    cleanupFixtures(pid, profId);
  }
});
