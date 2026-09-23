'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { db, init } = require('../server/database');
const radar = require('../server/services/trendRadar');
const { parseRevenue } = require('../server/services/velocityEngine');
init(); // ensure the Phase 1 tables/columns exist (idempotent)

// The dev DB is persistent: clear any leftovers from earlier runs so every
// test starts from a clean slate for its keys. (normalizeNicheKey strips
// underscores, so the refresh tests use plain-word keys.)
['__snap_test__', '__growth_test__', '__measure_trend__', '__carry_trend__', 'measure trend', 'carry trend']
  .forEach(k => db.prepare('DELETE FROM trend_snapshots WHERE trend_key = ?').run(k));

// Hermetic helpers (throwaway rows, always cleaned).
function makeTrend(name, fields = {}) {
  return db.prepare(
    `INSERT INTO trends (name, emoji, phase, velocity, window, est_revenue, why, activated, detected_at,
      trend_key, first_seen_at, last_volume, last_cpc)
     VALUES (?, '🧪', ?, ?, ?, ?, 'test', 0, ?, ?, ?, ?, ?)`
  ).run(
    name, fields.phase || 'emerging', fields.velocity || '+90%', fields.window || 14,
    fields.est_revenue || '$1k-3k', fields.detected_at || new Date().toISOString(),
    fields.trend_key || radar.normalizeNicheKey(name),
    fields.first_seen_at || fields.detected_at || new Date().toISOString(),
    fields.last_volume ?? null, fields.last_cpc ?? null
  ).lastInsertRowid;
}
function cleanupTrend(id) {
  const row = db.prepare('SELECT trend_key FROM trends WHERE id = ?').get(id);
  if (row && row.trend_key) db.prepare('DELETE FROM trend_snapshots WHERE trend_key = ?').run(row.trend_key);
  db.prepare('DELETE FROM trends WHERE id = ?').run(id);
}

test('weekKey produces stable ISO week keys', () => {
  assert.equal(radar.weekKey(new Date('2026-01-01T00:00:00Z')), '2026-W01'); // Thu — its own week
  assert.equal(radar.weekKey(new Date('2026-01-05T00:00:00Z')), '2026-W02'); // Monday of next week
  assert.equal(radar.weekKey(new Date('2023-01-01T00:00:00Z')), '2022-W52'); // Sun → belongs to prior ISO year
  const now = radar.weekKey();
  assert.match(now, /^\d{4}-W\d{2}$/);
});

test('snapshotTrend upserts one row per trend per week (idempotent)', () => {
  const key = '__snap_test__';
  try {
    assert.equal(radar.snapshotTrend(key, { volume: 100, source: 'test' }), true);
    assert.equal(radar.snapshotTrend(key, { volume: 150, score: 42, source: 'test2' }), true); // same week → update
    const rows = db.prepare('SELECT * FROM trend_snapshots WHERE trend_key = ?').all(key);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].volume, 150);      // updated
    assert.equal(rows[0].score, 42);        // added
    assert.equal(rows[0].source, 'test2');
    assert.equal(radar.snapshotTrend('', { volume: 5 }), false); // blank key rejected
  } finally {
    db.prepare('DELETE FROM trend_snapshots WHERE trend_key = ?').run(key);
  }
});

test('growthFromSnapshots computes WoW % and acceleration; needs ≥2 weeks', () => {
  const key = '__growth_test__';
  try {
    assert.equal(radar.growthFromSnapshots(key), null); // no data
    radar.snapshotTrend(key, { volume: 200 });
    assert.equal(radar.growthFromSnapshots(key), null); // 1 week only

    // Backdate rows into distinct weeks to build a 3-point series.
    const wk = (offset) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - offset);
      return radar.weekKey(d);
    };
    const w0 = wk(21), w1 = wk(14), w2 = wk(7);
    db.prepare('UPDATE trend_snapshots SET week = ? WHERE trend_key = ?').run(w2, key);
    db.prepare('INSERT INTO trend_snapshots (trend_key, week, volume, source) VALUES (?, ?, ?, ?)').run(key, w1, 100, 'test');
    db.prepare('INSERT INTO trend_snapshots (trend_key, week, volume, source) VALUES (?, ?, ?, ?)').run(key, w0, 50, 'test');

    const g = radar.growthFromSnapshots(key);
    // weeks ascending: 50 → 100 → 200 → last WoW = +100%, prior WoW = +100% → accel 0
    assert.equal(g.wowPct, 100);
    assert.equal(g.acceleration, 0);
    assert.equal(g.weeks, 3);
    assert.equal(g.lastVolume, 200);

    // Rising volume with flat acceleration reads as 'hot'.
    assert.equal(radar.phaseFromGrowth(g), 'hot');
    // +100% slope with negative acceleration cools to 'peaking'.
    assert.equal(radar.phaseFromGrowth({ wowPct: 100, acceleration: -40 }), 'peaking');
    assert.equal(radar.phaseFromGrowth({ wowPct: 20, acceleration: null }), 'rising');
    assert.equal(radar.phaseFromGrowth({ wowPct: 0, acceleration: null }), 'emerging');
    assert.equal(radar.phaseFromGrowth({ wowPct: -20, acceleration: null }), 'cooling');
    assert.equal(radar.phaseFromGrowth({ wowPct: -80, acceleration: null }), 'dormant');
    assert.equal(radar.phaseFromGrowth(null), null);
  } finally {
    db.prepare('DELETE FROM trend_snapshots WHERE trend_key = ?').run(key);
  }
});

test('estRevenueFromDemand scales with volume and CPC bands', () => {
  assert.equal(radar.estRevenueFromDemand(0, 1), null);
  const tiny = radar.estRevenueFromDemand(100, 0.5);
  const mid = radar.estRevenueFromDemand(10000, 1.5);
  const big = radar.estRevenueFromDemand(400000, 10);
  assert.ok(parseRevenue(big).mid > parseRevenue(mid).mid);
  assert.ok(parseRevenue(mid).mid > parseRevenue(tiny).mid);
  assert.ok(parseRevenue(big).mid <= 15000, 'high-CPC big-volume stays in a plausible digital band');
  assert.match(radar.estRevenueFromDemand(50000, 5), /^\$[\d.]+k?-[\d.]+k?$/);
});

test('refreshTrendMeasurements derives velocity/phase from snapshots (replaces the synthetic formula)', async () => {
  const id = makeTrend('__measure_trend__', { trend_key: 'measure trend', est_revenue: '$500-2k' });
  try {
    // Series: 100 → 150 → 300 → 600 (WoW +50% → +100% → +100%, accel 0
    // → genuinely accelerating → 'hot'). Pure INSERTs with explicit distinct
    // weeks — deterministic, no upsert interplay, immune to leftovers.
    const wk = (offset) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - offset); return radar.weekKey(d); };
    const ins = db.prepare('INSERT INTO trend_snapshots (trend_key, week, volume, source) VALUES (?, ?, ?, ?)');
    ins.run('measure trend', wk(21), 100, 'test');
    ins.run('measure trend', wk(14), 150, 'test');
    ins.run('measure trend', wk(7), 300, 'test');
    ins.run('measure trend', wk(0), 600, 'test');

    const r = await radar.refreshTrendMeasurements(5);
    assert.ok(r.measured >= 1, 'at least the seeded trend measured');
    const t = db.prepare('SELECT * FROM trends WHERE id = ?').get(id);
    assert.equal(t.measured_velocity, 100); // (600-300)/300, accel 0 → rising volume, non-negative accel
    assert.equal(t.phase, 'hot');
    assert.equal(t.velocity, '+100%');
    assert.ok(/^\$[\d.]+k?-/i.test(t.est_revenue), 'revenue band format preserved');
  } finally {
    cleanupTrend(id);
  }
});

test('discoverTerms expands recursively, records first-seen, and never auto-inserts trends', async () => {
  // Stub the network fetchers (hermetic): seed 'alpha template' → children.
  const original = { serper: radar.fetchSerperAutocomplete, etsy: radar.fetchEtsyAutocomplete };
  radar.fetchSerperAutocomplete = async (seeds) => (seeds || []).map(s => ({
    name: `${s} for beginners`, traffic: 'test', source: 'serper-autocomplete', shoppingIntent: 0.9
  }));
  radar.fetchEtsyAutocomplete = async (seeds) => (seeds || []).map(s => ({
    name: `${s} pdf`, traffic: 'test', source: 'etsy-autocomplete', shoppingIntent: 1.0
  }));
  try {
    const r = await radar.discoverTerms({ seeds: ['alpha template'], depth: 1, maxNew: 10 });
    assert.equal(r.ok, true);
    assert.ok(r.discovered.length >= 2, 'serper + etsy children discovered');
    // Every discovery got a first-seen snapshot row (volume null this week).
    for (const d of r.discovered) {
      const row = db.prepare('SELECT * FROM trend_snapshots WHERE trend_key = ?').get(d.key);
      assert.ok(row, `first-seen snapshot for ${d.key}`);
      assert.equal(row.volume, null);
      assert.match(row.source, /^discovery:/);
      // And NO trends row — discovery does not bypass vetting.
      assert.equal(db.prepare('SELECT id FROM trends WHERE trend_key = ?').get(d.key), undefined);
    }
    // Depth: children of level-1 terms exist when depth=1 (grandchildren found).
    assert.ok(r.discovered.some(d => d.depth === 2), 'recursive expansion reached depth 2');
    // Re-run discovers nothing new (dedup against snapshots + within-run seen).
    const r2 = await radar.discoverTerms({ seeds: ['alpha template'], depth: 1, maxNew: 10 });
    assert.equal(r2.discovered.length, 0);
  } finally {
    radar.fetchSerperAutocomplete = original.serper;
    radar.fetchEtsyAutocomplete = original.etsy;
    db.prepare("DELETE FROM trend_snapshots WHERE source LIKE 'discovery:%'").run();
  }
});

test('isDiscoverableTerm filters junk before network calls', () => {
  assert.equal(radar.isDiscoverableTerm('digital planner'), true);
  assert.equal(radar.isDiscoverableTerm('ab'), false);                       // too short
  assert.equal(radar.isDiscoverableTerm('x'.repeat(70)), false);             // too long
  assert.equal(radar.isDiscoverableTerm('taylor swift tickets'), false);     // REJECT_RE (celebrity noise)
  assert.equal(radar.isDiscoverableTerm('   '), false);
});

test('refreshTrendMeasurements carries forward last_volume when Trends Explore is unavailable', async () => {
  const id = makeTrend('__carry_trend__', { trend_key: 'carry trend', last_volume: 5000, last_cpc: 2.5 });
  try {
    // Series: flat 5000 → 5000 (two distinct weeks → 0% WoW, 'emerging').
    const wk = (offset) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - offset); return radar.weekKey(d); };
    const ins = db.prepare('INSERT INTO trend_snapshots (trend_key, week, volume, cpc, source) VALUES (?, ?, ?, ?, ?)');
    ins.run('carry trend', wk(7), 5000, 2.5, 'dataforseo');
    ins.run('carry trend', wk(0), 5000, 2.5, 'carry-forward');

    const r = await radar.refreshTrendMeasurements(5);
    assert.ok(r.measured >= 1);
    const t = db.prepare('SELECT * FROM trends WHERE id = ?').get(id);
    assert.equal(t.measured_velocity, 0); // flat series → 0%, not null
    assert.equal(t.phase, 'emerging');    // flat curve
  } finally {
    cleanupTrend(id);
  }
});
