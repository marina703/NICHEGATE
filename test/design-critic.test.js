'use strict';
// Design critic (Phase 1): parse, threshold logic, revision cap, fallback
// behavior, persistence, sweep cutoff, unscored≠passing. Hermetic: the model
// layer is stubbed via router.callVision — no network, no Puppeteer (shots are
// injected through opts.shots).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { db, init } = require('../server/database');
init(); // idempotent: design_scores / design_references tables

const router = require('../server/services/modelRouter');
const critic = require('../server/services/designCritic');
const cfg = require('../server/services/modelConfig');

// The loop tests force the AI-enabled branch on with the model layer stubbed
// (still fully hermetic — no network). Restore after each test.
function withAiOn() {
  const was = cfg.enabled;
  cfg.enabled = true;
  return () => { cfg.enabled = was; };
}

const SHOT = 'data:image/jpeg;base64,/9j/2Q==';
const VALID_TEST_JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x07, 0x08, 0x04, 0xb0, 0x00, 0x03,
  0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00, 0xff, 0xd9
]);

// ── hermetic fixtures (throwaway rows, always cleaned) ──────────────────
function makeProfession(suffix) {
  return db.prepare(
    "INSERT INTO professions (emoji,name,slug,status,tier,colors,services,hashtags) VALUES ('🎨', ?, ?, 'researching', 'safe', '{}', '[]', '[]')"
  ).run('__critic_prof_' + suffix, '__critic-prof-' + suffix + '-' + Math.random().toString(36).slice(2, 8)).lastInsertRowid;
}
function makeProduct(profId, fields = {}) {
  return db.prepare(
    "INSERT INTO products (profession_id,name,type,price,status,theme,origin,created_at) VALUES (?,?,?,?,?,?,?,?)"
  ).run(profId, fields.name || '__critic_product__', fields.type || 'checklist', '$12',
    fields.status || 'draft', 'sage', 'engine', fields.created_at || '2026-10-11 00:00:00').lastInsertRowid;
}
function cleanup(productId, profId) {
  db.prepare('DELETE FROM cover_reviews WHERE product_id = ?').run(productId);
  db.prepare('DELETE FROM design_scores WHERE product_id = ?').run(productId);
  db.prepare('DELETE FROM design_references WHERE product_id = ?').run(productId);
  db.prepare('DELETE FROM products WHERE id = ?').run(productId);
  db.prepare('DELETE FROM professions WHERE id = ?').run(profId);
}

function goodScores(overall = 8.5) {
  return JSON.stringify({
    visual_hierarchy: overall, whitespace_rhythm: overall, typography_cohesion: overall,
    color_harmony: overall, uniqueness: overall, scroll_stop: overall, overall,
    critique: 'Solid hierarchy and a distinctive palette.'
  });
}
function weakScores() {
  return JSON.stringify({
    visual_hierarchy: 4, whitespace_rhythm: 4, typography_cohesion: 4,
    color_harmony: 4, uniqueness: 3, scroll_stop: 4, overall: 3.8,
    critique: 'Generic template feel; crowded sections; palette lacks contrast.'
  });
}

// Stub the vision leg per-test (restore afterwards).
function stubVision(fn) {
  const original = router.callVision;
  router.callVision = fn;
  return () => { router.callVision = original; };
}

// The structural cover-QA gate is a separate collaborator (it inspects the
// rendered artifact and needs a browser). These tests target the AI critique, so
// they stub the gate — the gate's own behaviour is covered in cover-qa.test.js.
function stubCoverQa(verdict = { ok: true, publishAllowed: true, status: 'pass' }) {
  const coverQA = require('../server/services/coverQA');
  const original = coverQA.verifyCover;
  coverQA.verifyCover = async () => ({ checks: {}, ...verdict });
  return () => { coverQA.verifyCover = original; };
}

function goodCoverScores(overall = 8.5, textViolation = false) {
  return JSON.stringify({
    preview_composite_realism: overall,
    focal_hierarchy: overall,
    thumbnail_legibility: overall,
    dna_consistency: overall,
    zero_garbled_text: !textViolation,
    text_violation: textViolation,
    critique: 'The screen is well seated and copy reads at thumbnail size.'
  });
}

// ── parseCritique ───────────────────────────────────────────────────────

test('cover critic parses the cover-specific rubric and hard text fail', () => {
  const pass = critic.parseCoverCritique(goodCoverScores(8));
  assert.equal(pass.scores.overall, 8);
  assert.equal(pass.zeroGarbledText, true);
  assert.equal(pass.passed, true);
  const fail = critic.parseCoverCritique(goodCoverScores(9, true));
  assert.equal(fail.zeroGarbledText, false);
  assert.equal(fail.passed, false);
  assert.equal(critic.parseCoverCritique('{"preview_composite_realism":10}'), null);
});

test('critic: parseCritique accepts strict JSON and clamps scores', () => {
  const parsed = critic.parseCritique('```json\n' + goodScores(9) + '\n```');
  assert.ok(parsed);
  assert.equal(parsed.scores.overall, 9);
  assert.equal(parsed.scores.visual_hierarchy, 9);

  const clamped = critic.parseCritique(JSON.stringify({
    visual_hierarchy: 42, whitespace_rhythm: -3, typography_cohesion: 7,
    color_harmony: 7, uniqueness: 7, scroll_stop: 7, overall: 7
  }));
  assert.equal(clamped.scores.visual_hierarchy, 10);
  assert.equal(clamped.scores.whitespace_rhythm, 0);
});

test('critic: parseCritique rejects malformed, partial or missing rubric legs', () => {
  assert.equal(critic.parseCritique(null), null);
  assert.equal(critic.parseCritique('not json at all'), null);
  assert.equal(critic.parseCritique('{"visual_hierarchy": 8}'), null); // partial
  assert.equal(critic.parseCritique('{"visual_hierarchy":"x","whitespace_rhythm":1,"typography_cohesion":1,"color_harmony":1,"uniqueness":1,"scroll_stop":1}'), null);
});

test('critic: overall falls back to the rubric mean when absent', () => {
  const parsed = critic.parseCritique(JSON.stringify({
    visual_hierarchy: 6, whitespace_rhythm: 6, typography_cohesion: 6,
    color_harmony: 6, uniqueness: 6, scroll_stop: 6
  }));
  assert.equal(parsed.scores.overall, 6);
});

test('cover critic requires 6.5 across its dimensions and gates unscored separately', () => {
  assert.equal(critic.coverDecision({ scores: { overall: 6.5 }, zeroGarbledText: true }).status, 'pass');
  assert.equal(critic.coverDecision({ scores: { overall: 6.4 }, zeroGarbledText: true }).status, 'fail');
  assert.equal(critic.coverDecision({ scores: { overall: 10 }, zeroGarbledText: false }).status, 'fail');
  assert.equal(critic.coverDecision(null).status, 'unscored');
  assert.equal(critic.coverDecision(null).publishAllowed, false, 'missing review cannot authorize publishing');
});

test('cover critic persists verdict against the exact current JPEG and reuses only matching hash', async () => {
  const profId = makeProfession('cover-persist');
  const pid = makeProduct(profId);
  const ai = withAiOn();
  const coverPath = path.join(os.tmpdir(), `nichegate-${pid}-cover-v11-01.jpg`);
  fs.writeFileSync(coverPath, VALID_TEST_JPEG);
  const fileFactory = require('../server/services/fileFactory');
  const originalThumbnail = fileFactory.ensureProductThumbnail;
  let calls = 0;
  const restore = stubVision(async () => { calls++; return goodCoverScores(8.25); });
  const restoreQa = stubCoverQa();
  fileFactory.ensureProductThumbnail = async (product) => {
    if (!product.preview_path) {
      product.preview_path = coverPath;
      db.prepare('UPDATE products SET preview_path = ? WHERE id = ?').run(coverPath, pid);
    }
    return product.preview_path;
  };
  try {
    db.prepare('UPDATE products SET preview_path = ? WHERE id = ?').run(coverPath, pid);
    const first = await critic.critiqueCover(pid);
    assert.equal(first.status, 'pass');
    assert.equal(first.publishAllowed, true);
    assert.equal(first.reviewId > 0, true);
    const row = critic.latestCoverScore(pid);
    assert.equal(row.artifact_path, coverPath);
    assert.equal(row.artifact_sha256, require('crypto').createHash('sha256').update(fs.readFileSync(coverPath)).digest('hex'));
    assert.equal(row.status, 'pass');
    assert.equal(calls, 1);

    const cached = await critic.critiqueCover(pid);
    assert.equal(cached.cached, true);
    assert.equal(cached.status, 'pass');
    assert.equal(calls, 1, 'same path and unchanged exact-image hash should reuse review');
  } finally {
    fileFactory.ensureProductThumbnail = originalThumbnail;
    restore();
    restoreQa();
    ai();
    try { fs.unlinkSync(coverPath); } catch {}
    cleanup(pid, profId);
  }
});

test('cover critic stores one revised variant when the first cover fails', async () => {
  const profId = makeProfession('cover-revise');
  const pid = makeProduct(profId);
  const ai = withAiOn();
  const coverPaths = [
    path.join(os.tmpdir(), `nichegate-${pid}-cover-v11.jpg`),
    path.join(os.tmpdir(), `nichegate-${pid}-cover-v4-r1.jpg`)
  ];
  coverPaths.forEach((file, i) => fs.writeFileSync(file, Buffer.concat([VALID_TEST_JPEG, Buffer.from([i])])));
  const fileFactory = require('../server/services/fileFactory');
  const originalThumbnail = fileFactory.ensureProductThumbnail;
  let renderCount = 0;
  let visionCount = 0;
  const restore = stubVision(async () => { visionCount++; return goodCoverScores(visionCount === 1 ? 4 : 8); });
  const restoreQa = stubCoverQa();
  fileFactory.ensureProductThumbnail = async (product, opts = {}) => {
    const coverPath = opts.freshArtRevision ? coverPaths[1] : coverPaths[0];
    product.preview_path = coverPath;
    db.prepare('UPDATE products SET preview_path = ? WHERE id = ?').run(coverPath, pid);
    renderCount++;
    return coverPath;
  };
  try {
    const result = await critic.critiqueCover(pid, { force: true });
    assert.equal(result.status, 'pass');
    assert.equal(result.revised, true);
    assert.equal(result.coverPath, coverPaths[1]);
    assert.equal(renderCount, 2);
    assert.equal(visionCount, 2);
    const latest = critic.latestCoverScore(pid);
    assert.equal(latest.status, 'pass');
    assert.equal(latest.revised, 1);
    assert.equal(latest.artifact_path, coverPaths[1]);
  } finally {
    fileFactory.ensureProductThumbnail = originalThumbnail;
    restore();
    restoreQa();
    ai();
    coverPaths.forEach(file => { try { fs.unlinkSync(file); } catch {} });
    cleanup(pid, profId);
  }
});

test('cover critic fails closed when enabled review is unavailable and records unscored artifact', async () => {
  const profId = makeProfession('cover-unscored');
  const pid = makeProduct(profId);
  const ai = withAiOn();
  const coverPath = path.join(os.tmpdir(), `nichegate-${pid}-cover-v11.jpg`);
  fs.writeFileSync(coverPath, VALID_TEST_JPEG);
  const fileFactory = require('../server/services/fileFactory');
  const originalThumbnail = fileFactory.ensureProductThumbnail;
  const restore = stubVision(async () => { throw new Error('vision unavailable'); });
  const restoreQa = stubCoverQa();
  fileFactory.ensureProductThumbnail = async (product) => {
    product.preview_path = coverPath;
    db.prepare('UPDATE products SET preview_path = ? WHERE id = ?').run(coverPath, pid);
    return coverPath;
  };
  try {
    const result = await critic.critiqueCover(pid, { force: true });
    assert.equal(result.status, 'unscored');
    assert.equal(result.publishAllowed, false);
    assert.equal(critic.latestCoverScore(pid).status, 'unscored');
  } finally {
    fileFactory.ensureProductThumbnail = originalThumbnail;
    restore();
    restoreQa();
    ai();
    try { fs.unlinkSync(coverPath); } catch {}
    cleanup(pid, profId);
  }
});

// ── the loop: score, revision cap, persistence, degradation ─────────────

test('critic: scores a product, persists the row and stays on the original when it wins', async () => {
  const profId = makeProfession('a');
  const pid = makeProduct(profId);
  const ai = withAiOn();
  const restore = stubVision(async () => goodScores(8.5));
  try {
    const res = await critic.critiqueProduct(pid, { shots: [SHOT], allowWinner: false });
    assert.equal(res.status, 'scored');
    assert.equal(res.variant, 'original');
    assert.equal(res.scores.overall, 8.5);

    const row = db.prepare('SELECT * FROM design_scores WHERE product_id = ?').get(pid);
    assert.ok(row, 'score must persist in design_scores');
    assert.equal(JSON.parse(row.scores).overall, 8.5);
    assert.equal(row.revised, 0);
    assert.equal(row.kept_variant, 'original');
  } finally {
    restore();
    ai();
    cleanup(pid, profId);
  }
});

test('critic: below threshold runs ONE revision pass and keeps the better variant', async () => {
  const profId = makeProfession('b');
  const pid = makeProduct(profId);
  const ai = withAiOn();
  const seen = [];
  const restore = stubVision(async () => {
    // First call: weak. Subsequent: strong (the "revision" improved it).
    const weak = seen.length === 0;
    seen.push(1);
    return weak ? weakScores() : goodScores(7.5);
  });
  // The revision regenerates a brief through the ideation leg — stub it with a
  // valid brief so the loop runs without network (regenerate:false keeps
  // Puppeteer out of the unit test).
  const briefJson = JSON.stringify({
    mood: ['electric', 'raw'],
    palette: { primary: '#204060', secondary: '#b05040', accent: '#f0c050', bg: '#fffaf0', surface: '#ffffff', border: '#d0c0a0' },
    fonts: { heading: 'Fraunces', body: 'Public Sans' },
    motif: 'ledger rules', motif_css: 'border-bottom:2px solid #f0c050',
    layout: 'sidebar', whitespace: 'normal', texture: 'grid', style_lineage: 'editorial'
  });
  const origIdeas = router.generateIdeas;
  router.generateIdeas = async () => briefJson;
  try {
    const res = await critic.critiqueProduct(pid, { shots: [SHOT], allowWinner: false, regenerate: false });
    assert.equal(res.status, 'revised');
    assert.equal(res.variant, 'revised');
    assert.equal(res.scores.overall, 7.5);
    assert.ok(res.improved > 0);
    // Cost control: exactly 2 vision calls (critique + 1 revision), never more.
    assert.equal(seen.length, 2);

    const rows = db.prepare('SELECT * FROM design_scores WHERE product_id = ? ORDER BY id').all(pid);
    assert.equal(rows.length, 1, 'one persisted verdict per critique run');
    assert.equal(rows[0].revised, 1);
    assert.equal(rows[0].kept_variant, 'revised');
  } finally {
    router.generateIdeas = origIdeas;
    restore();
    ai();
    cleanup(pid, profId);
  }
});

test('critic: revision is skipped when the original already scores well', async () => {
  const profId = makeProfession('c');
  const pid = makeProduct(profId);
  const ai = withAiOn();
  let calls = 0;
  const restore = stubVision(async () => { calls++; return goodScores(9); });
  try {
    const res = await critic.critiqueProduct(pid, { shots: [SHOT], allowWinner: false });
    assert.equal(res.status, 'scored');
    assert.equal(calls, 1, 'no revision pass above the threshold');
  } finally {
    restore();
    ai();
    cleanup(pid, profId);
  }
});

test('critic: unparseable model output → unscored (never a pass), no throw', async () => {
  const profId = makeProfession('d');
  const pid = makeProduct(profId);
  const ai = withAiOn();
  const restore = stubVision(async () => 'sorry, here are my thoughts — not JSON');
  try {
    const res = await critic.critiqueProduct(pid, { shots: [SHOT] });
    assert.equal(res.status, 'unscored');
    assert.equal(res.scores, null);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM design_scores WHERE product_id = ?').get(pid).c, 0);
  } finally {
    restore();
    ai();
    cleanup(pid, profId);
  }
});

test('critic: never throws when the model call itself explodes', async () => {
  const profId = makeProfession('e');
  const pid = makeProduct(profId);
  const ai = withAiOn();
  const restore = stubVision(async () => { throw new Error('boom'); });
  try {
    const res = await critic.critiqueProduct(pid, { shots: [SHOT] });
    assert.ok(res === null || res.status === 'unscored', 'graceful degradation, callers keep shipping');
  } finally {
    restore();
    ai();
    cleanup(pid, profId);
  }
});

test('critic: already-scored products are skipped (cost control) unless forced', async () => {
  const profId = makeProfession('f');
  const pid = makeProduct(profId);
  const ai = withAiOn();
  let calls = 0;
  const restore = stubVision(async () => { calls++; return goodScores(8); });
  try {
    await critic.critiqueProduct(pid, { shots: [SHOT], allowWinner: false });
    await critic.critiqueProduct(pid, { shots: [SHOT], allowWinner: false });
    assert.equal(calls, 1, 'second call must not spend vision tokens');

    await critic.critiqueProduct(pid, { shots: [SHOT], force: true, allowWinner: false });
    assert.equal(calls, 2, 'force re-scores');
  } finally {
    restore();
    ai();
    cleanup(pid, profId);
  }
});

// ── hard constraint #4: unscored ≠ passing ──────────────────────────────

test('critic: scoreSummary reports unscored separately and never as passed', () => {
  const profId = makeProfession('g');
  const pidScored = makeProduct(profId, { created_at: '2026-10-11 01:00:00' });
  const pidUnscored = makeProduct(profId, { created_at: '2026-10-11 02:00:00' });
  try {
    critic.persistScore(pidScored, { visual_hierarchy: 5, whitespace_rhythm: 5, typography_cohesion: 5, color_harmony: 5, uniqueness: 5, scroll_stop: 5, overall: 5 }, 'meh');
    const sum = critic.scoreSummary();
    assert.ok(sum.scored >= 1);
    assert.ok(sum.unscored >= 1, 'the unscored product must appear as unscored');
    assert.equal(sum.total, sum.scored + sum.unscored);
    assert.ok(sum.belowThreshold >= 1);
  } finally {
    cleanup(pidScored, profId);
    db.prepare('DELETE FROM products WHERE id = ?').run(pidUnscored);
    db.prepare('DELETE FROM design_scores WHERE product_id = ?').run(pidUnscored);
  }
});

// ── owner scope: FOCUS_SINCE cutoff ─────────────────────────────────────

test('critic: sweep only touches products on/after FOCUS_SINCE (older catalog is out of scope)', async () => {
  const profId = makeProfession('h');
  const oldPid = makeProduct(profId, { created_at: '2026-10-01 00:00:00' }); // before the cutoff
  const newPid = makeProduct(profId, { created_at: '2026-10-11 03:00:00' });
  const ai = withAiOn();
  const seen = [];
  const restore = stubVision(async (args) => { seen.push(args); return goodScores(8); });
  const maxScoreId = db.prepare('SELECT COALESCE(MAX(id), 0) m FROM design_scores').get().m;
  try {
    const sweep = await critic.sweepCatalog({ limit: 50, shots: [SHOT], allowWinner: false, reskin: false });
    const touched = sweep.results.map(r => r.productId);
    assert.ok(!touched.includes(oldPid), 'pre-cutoff products must NOT be swept');
    assert.ok(touched.includes(newPid), 'in-scope products must be swept');
    assert.equal(critic.FOCUS_SINCE, '2026-10-10', 'owner scope cutoff');
  } finally {
    restore();
    ai();
    cleanup(oldPid, profId);
    db.prepare('DELETE FROM design_scores WHERE product_id = ?').run(newPid);
    db.prepare('DELETE FROM products WHERE id = ?').run(newPid);
    // Sweep hygiene: drop score rows this test created for any stray shared-DB
    // rows (fixtures above cover our own products).
    if (Number.isFinite(maxScoreId)) db.prepare('DELETE FROM design_scores WHERE id > ?').run(maxScoreId);
  }
});

// ── Phase 3 winners loop ────────────────────────────────────────────────

test('critic: score >= 8 enters the design reference pool as a winner', async () => {
  const profId = makeProfession('i');
  const pid = makeProduct(profId);
  const ai = withAiOn();
  const restore = stubVision(async () => goodScores(9));
  try {
    await critic.critiqueProduct(pid, { shots: [SHOT], force: true });
    const row = db.prepare("SELECT * FROM design_references WHERE product_id = ? AND source = 'winner'").get(pid);
    assert.ok(row, 'high-scoring design must auto-enter design_references');
    assert.equal(row.score, 9);
  } finally {
    restore();
    ai();
    cleanup(pid, profId);
  }
});

// ── Phase 4 auto-reskin candidates (sales >= 2, score < 7, once) ─────────

test('critic: autoReskinCandidates honors sales, score and one-shot rules + cutoff', () => {
  const profId = makeProfession('j');
  const weakPid = makeProduct(profId, { created_at: '2026-10-11 04:00:00' });
  const oldPid = makeProduct(profId, { created_at: '2026-09-01 00:00:00' });
  const insertMetric = (pid, sales) =>
    db.prepare('INSERT INTO metrics (profession_id, product_id, views, sales, revenue) VALUES (?, ?, 100, ?, 10)').run(profId, pid, sales);
  try {
    insertMetric(weakPid, 3);
    insertMetric(oldPid, 5);
    critic.persistScore(weakPid, { visual_hierarchy: 5, whitespace_rhythm: 5, typography_cohesion: 5, color_harmony: 5, uniqueness: 5, scroll_stop: 5, overall: 5 }, 'weak');
    critic.persistScore(oldPid, { visual_hierarchy: 4, whitespace_rhythm: 4, typography_cohesion: 4, color_harmony: 4, uniqueness: 4, scroll_stop: 4, overall: 4 }, 'weak');

    let candidates = critic.autoReskinCandidates({ limit: 10000 });
    assert.ok(candidates.some(c => c.productId === weakPid), 'selling + weak + recent → candidate');
    assert.ok(!candidates.some(c => c.productId === oldPid), 'pre-cutoff product never auto-reskinned');

    critic.markAutoReskin(weakPid, { ok: true });
    candidates = critic.autoReskinCandidates({ limit: 10000 });
    assert.ok(!candidates.some(c => c.productId === weakPid), 'only ONE auto-reskin attempt per product');
  } finally {
    db.prepare('DELETE FROM metrics WHERE product_id IN (?, ?)').run(weakPid, oldPid);
    db.prepare("DELETE FROM automation_log WHERE action = 'design_reskin' AND product_id = ?").run(weakPid);
    cleanup(weakPid, profId);
    db.prepare('DELETE FROM design_scores WHERE product_id = ?').run(oldPid);
    db.prepare('DELETE FROM products WHERE id = ?').run(oldPid);
  }
});

// ── zero-cost when the AI layer is off ──────────────────────────────────

test('critic: MODEL_ENABLED=false → skipped with null scores and zero model calls', async (t) => {
  if (cfg.enabled) {
    t.skip('AI layer enabled in this environment; the off-path is covered by the disabled-config invariant');
    return;
  }
  const profId = makeProfession('k');
  const pid = makeProduct(profId);
  let calls = 0;
  const restore = stubVision(async () => { calls++; return goodScores(9); });
  try {
    const res = await critic.critiqueProduct(pid, { shots: [SHOT] });
    assert.equal(res.status, 'skipped');
    assert.equal(res.scores, null);
    assert.equal(calls, 0, 'zero cost when AI is off');
  } finally {
    restore();
    cleanup(pid, profId);
  }
});

test('cover QA failure blocks publishing even when the AI review passes', async () => {
  const profId = makeProfession('cover-qa-block');
  const pid = makeProduct(profId);
  const ai = withAiOn();
  const coverPath = path.join(os.tmpdir(), `nichegate-${pid}-cover-v11-qa.jpg`);
  fs.writeFileSync(coverPath, VALID_TEST_JPEG);
  const fileFactory = require('../server/services/fileFactory');
  const originalThumbnail = fileFactory.ensureProductThumbnail;
  const restore = stubVision(async () => goodCoverScores(8.5));
  const restoreQa = stubCoverQa({
    ok: false,
    publishAllowed: false,
    status: 'fail',
    reason: 'no tablet screen detected in the background photo — the page floats instead of sitting in the device'
  });
  fileFactory.ensureProductThumbnail = async (product) => {
    product.preview_path = coverPath;
    db.prepare('UPDATE products SET preview_path = ? WHERE id = ?').run(coverPath, pid);
    return coverPath;
  };
  try {
    const result = await critic.critiqueCover(pid, { force: true });
    assert.equal(result.publishAllowed, false, 'a structural QA failure must block publishing');
    assert.equal(result.status, 'fail');
    assert.match(result.reason, /cover QA/);
    assert.equal(result.coverQa.publishAllowed, false);
    assert.equal(critic.latestCoverScore(pid).status, 'fail', 'the stored review must not claim a pass');
  } finally {
    fileFactory.ensureProductThumbnail = originalThumbnail;
    restore(); restoreQa(); ai();
    try { fs.unlinkSync(coverPath); } catch {}
    cleanup(pid, profId);
  }
});
