'use strict';
// Reference analyzer + learning loop: ingest a template IMAGE into design DNA,
// and prove the operator's rejection reason reaches the next brief.
// Hermetic: the vision leg is stubbed via router.callVision (no network); the
// deterministic fallback runs on real pixels from a generated PNG (no network).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { db, init } = require('../server/database');
init(); // idempotent: agent_lessons / design_references tables

const router = require('../server/services/modelRouter');
const cfg = require('../server/services/modelConfig');
const analyzer = require('../server/services/referenceAnalyzer');
const art = require('../server/services/artDirector');
const swipe = require('../server/services/swipeFileEngine');
const jobEngine = require('../server/services/jobEngine');

const sharp = require('sharp');

// ── helpers ──────────────────────────────────────────────────────────────

const STRIPE = 64; // px per swatch — wide enough that downscaling keeps interiors exact
async function makePng(colors, file) {
  // Horizontal stripes of solid colour, wide enough that a 64px downscale
  // never samples a blended edge (blended edges were shifting the palette).
  const w = colors.length * STRIPE;
  const px = Buffer.alloc(w * STRIPE * 3);
  colors.forEach((hex, ci) => {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    for (let y = 0; y < STRIPE; y++) {
      for (let x = 0; x < STRIPE; x++) {
        const o = (y * w + ci * STRIPE + x) * 3;
        px[o] = r; px[o + 1] = g; px[o + 2] = b;
      }
    }
  });
  await sharp(px, { raw: { width: w, height: STRIPE, channels: 3 } }).png().toFile(file);
  return file;
}

const TMP = path.join(os.tmpdir(), 'ref-analyzer-test-' + process.pid + '.png');
// JPEG re-encode in downscale() is lossy, so compare channels within a tolerance.
function closeEnough(a, b, tol = 32) {
  const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
  return pa.every((v, i) => Math.abs(v - pb[i]) <= tol);
}


function withVisionStub(fn) {
  const original = router.callVision;
  router.callVision = fn;
  return () => { router.callVision = original; };
}
function withAi(enabled) {
  const was = cfg.enabled;
  cfg.enabled = enabled;
  return () => { cfg.enabled = was; };
}

// ── parseReferenceAnalysis ────────────────────────────────────────────────

test('parseReferenceAnalysis: accepts strict-JSON vision output and normalizes hex', () => {
  const raw = 'Here is the DNA:\n```json\n' +
    '{"palette":["1b3a5c","#C46A5A","#e9c46a"],"fonts":{"heading":"Fraunces","body":"Public Sans"},' +
    '"layout":"centred specimen with caption block","motif":"engraved line foliage",' +
    '"taste_note":"One subject on warm paper is timeless."}\n```';
  const dna = analyzer.parseReferenceAnalysis(raw);
  assert.ok(dna, 'parses fenced JSON');
  assert.deepEqual(dna.palette, ['#1b3a5c', '#C46A5A', '#e9c46a']);
  assert.equal(dna.fonts.heading, 'Fraunces');
  assert.equal(dna.layout, 'centred specimen with caption block');
  assert.ok(dna.taste_note);
});

test('parseReferenceAnalysis: rejects junk and empty DNA', () => {
  assert.equal(analyzer.parseReferenceAnalysis(null), null);
  assert.equal(analyzer.parseReferenceAnalysis('not json at all'), null);
  assert.equal(analyzer.parseReferenceAnalysis('{"foo":1}'), null, 'no palette/taste = not DNA');
  assert.equal(analyzer.parseReferenceAnalysis('{"palette":["not-a-color"]}'), null);
});

// ── fallbackPalette (deterministic, AI-free) ──────────────────────────────

test('fallbackPalette: extracts the dominant swatch from a solid image', async () => {
  await makePng(['#1b3a5c', '#1b3a5c', '#1b3a5c'], TMP);
  const dna = await analyzer.fallbackPalette(TMP);
  assert.ok(dna, 'returns DNA without the AI layer');
  assert.ok(Array.isArray(dna.palette) && dna.palette.length >= 1);
  assert.ok(closeEnough(dna.palette[0].toLowerCase(), '#1b3a5c'), `dominant colour is recovered (got ${dna.palette[0]})`);
  assert.equal(dna.fallback, true);
  assert.equal(dna.fonts.heading, null, 'no fonts without vision');
});

// ── analyzeReference ──────────────────────────────────────────────────────

test('analyzeReference: uses vision when the model is on', async () => {
  await makePng(['#1b3a5c', '#c46a5a', '#e9c46a'], TMP);
  const restore = withVisionStub(async () => JSON.stringify({
    palette: ['#1b3a5c', '#c46a5a'], fonts: { heading: 'Fraunces', body: 'Public Sans' },
    layout: 'tabular grid', motif: 'flight-path arcs', taste_note: 'Give numerals room.'
  }));
  const off = withAi(true);
  try {
    const dna = await analyzer.analyzeReference(TMP);
    assert.ok(dna);
    assert.equal(dna.motif, 'flight-path arcs');
    assert.equal(dna.fallback, undefined, 'vision path is not marked fallback');
  } finally { restore(); off(); }
});

test('analyzeReference: falls back to pixels when the model is off', async () => {
  await makePng(['#e9c46a', '#e9c46a', '#7b3f61'], TMP);
  const off = withAi(false);
  try {
    const dna = await analyzer.analyzeReference(TMP);
    assert.ok(dna);
    assert.equal(dna.fallback, true);
    assert.ok(dna.palette.some(c => closeEnough(c.toLowerCase(), '#e9c46a')), `warm swatch recovered (got ${dna.palette.join(',')})`);
  } finally { off(); }
});

test('analyzeReference: returns null on unreadable input, never throws', async () => {
  const dna = await analyzer.analyzeReference('C:/definitely/not/a/real/image.png');
  assert.equal(dna, null);
});

// ── learning loop: rejection reason → lesson → next brief ────────────────

test('rejectJob: a reason becomes an agent_lesson', () => {
  // Arrange: a running job (createJob drives it forward; we only need a row).
  const before = db.prepare('SELECT COUNT(*) c FROM agent_lessons').get().c;
  // Build a minimal job directly to avoid driving the whole engine.
  const id = db.prepare("INSERT INTO jobs (prompt, status, plan, progress, created_at, updated_at) VALUES (?, 'running', ?, '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)")
    .run('__lesson_test__', '[]').lastInsertRowid;
  const job = jobEngine.rejectJob(id, 'too generic — reuse of the sage theme');
  assert.equal(job.status, 'failed');
  const lessons = db.prepare("SELECT * FROM agent_lessons WHERE outcome='rejected' ORDER BY id DESC LIMIT 1").all();
  assert.ok(lessons.length >= 1);
  assert.match(lessons[0].lesson, /too generic/);
  const after = db.prepare('SELECT COUNT(*) c FROM agent_lessons').get().c;
  assert.ok(after >= before);
  db.prepare('DELETE FROM agent_lessons WHERE outcome = ? AND lesson LIKE ?').run('rejected', '%too generic%');
  db.prepare('DELETE FROM jobs WHERE id = ?').run(id);
});

test('buildBriefPrompt: recent lessons are injected as "steer away" signal', () => {
  const product = { name: 'Roofing Checklist', type: 'checklist', price: '$12' };
  const prof = { name: 'Roofing Pros', slug: 'roofing', services: '[]' };
  const withLessons = art.buildBriefPrompt(product, prof, {
    useReferences: false,
    lessons: [{ lesson: 'too generic — reuse of the sage theme' }]
  });
  const without = art.buildBriefPrompt(product, prof, { useReferences: false });
  assert.match(withLessons, /steer AWAY/i);
  assert.match(withLessons, /too generic/);
  assert.doesNotMatch(without, /too generic/);
});

test('buildBriefPrompt: no lessons section when there are none', () => {
  const product = { name: 'X', type: 'checklist' };
  const prof = { name: 'Y', slug: 'y' };
  const prompt = art.buildBriefPrompt(product, prof, { useReferences: false, lessons: [] });
  assert.doesNotMatch(prompt, /steer AWAY/i);
});

// ── reference pool integrity ─────────────────────────────────────────────

test('ingest: analyzed DNA is stored as a design_reference row (no pixels)', async () => {
  await makePng(['#1b3a5c', '#c46a5a'], TMP);
  const off = withAi(false);
  try {
    const dna = await analyzer.analyzeReference(TMP);
    const id = swipe.addDesignReference({
      title: '__analyzer_ingest__', source: 'template', niche_key: 'trades',
      palette: dna.palette, fonts: dna.fonts, layout: dna.layout, motif: dna.motif, taste_note: dna.taste_note
    });
    assert.ok(id);
    const row = db.prepare('SELECT * FROM design_references WHERE id = ?').get(id);
    assert.ok(row);
    assert.equal(row.source, 'template');
    assert.ok(!/data:image|<img|base64/i.test(JSON.stringify(row)), 'no pixel data stored');
    db.prepare('DELETE FROM design_references WHERE id = ?').run(id);
  } finally { off(); }
});

test('swipeFileEngine.addDesignReference preserves template/analyzed sources', () => {
  const id = swipe.addDesignReference({ title: '__src_test__', source: 'analyzed', palette: ['#111111'] });
  const row = db.prepare('SELECT source FROM design_references WHERE id = ?').get(id);
  assert.equal(row.source, 'analyzed');
  db.prepare('DELETE FROM design_references WHERE id = ?').run(id);
});
