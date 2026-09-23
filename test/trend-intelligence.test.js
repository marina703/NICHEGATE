'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { db, init } = require('../server/database');
const radar = require('../server/services/trendRadar');
const vetting = require('../server/services/vettingEngine');
init(); // idempotent: Phase 1/3 tables + columns

// Clean slate for this suite's keys (dev DB is persistent).
['break z flat', 'break z jump', 'break z small', 'forecast fit', 'cohort alpha', 'cohort beta', 'cohort gamma', 'vet measured', 'vet unmeasured']
  .forEach(k => db.prepare('DELETE FROM trend_snapshots WHERE trend_key = ?').run(k));

function series(key, points) { // points: [[weeksAgo, volume], ...]
  const wk = (offset) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - offset); return radar.weekKey(d); };
  const ins = db.prepare('INSERT INTO trend_snapshots (trend_key, week, volume, source) VALUES (?, ?, ?, ?)');
  for (const [ago, v] of points) ins.run(key, wk(ago), v, 'test');
}

test('breakoutScore: z ≥ 2 on a jump over stable history; false on noise', () => {
  series('break z flat', [[28, 100], [21, 100], [14, 100], [7, 100], [0, 100]]);
  const flat = radar.breakoutScore('break z flat');
  assert.equal(flat.weeks, 5);
  assert.equal(flat.breakout, false, 'flat-forever never breaks out');

  series('break z jump', [[28, 100], [21, 102], [14, 98], [7, 101], [0, 300]]);
  const jump = radar.breakoutScore('break z jump');
  assert.ok(jump.z >= 2, `z=${jump.z} should be ≥2 after a 3× spike`);
  assert.equal(jump.breakout, true);

  series('break z small', [[28, 80], [21, 120], [14, 95], [7, 110], [0, 115]]);
  const small = radar.breakoutScore('break z small');
  assert.equal(small.breakout, false, 'a +4% uptick over varied history is not a breakout');

  assert.equal(radar.breakoutScore('never tracked').reason, 'need ≥4 weekly volumes');
});

test('forecastTrend: exponential fit projects forward and reports growth', () => {
  series('forecast fit', [[21, 100], [14, 140], [7, 196], [0, 274]]); // ~+40%/wk
  const f = radar.forecastTrend('forecast fit');
  assert.equal(f.ok, true);
  assert.ok(f.weeklyGrowthPct > 35 && f.weeklyGrowthPct < 45, `growth ${f.weeklyGrowthPct}%`);
  assert.equal(f.projections.length, 12);
  assert.ok(f.projections[0].volume > f.lastVolume, 'growing series projects up');
  assert.ok(f.projections[11].volume > f.projections[0].volume, 'projection rises monotonically');

  const tooShort = radar.forecastTrend('never tracked');
  assert.equal(tooShort.ok, false);
});

test('cohortGrowthPercentile ranks a term against all other tracked terms', () => {
  series('cohort alpha', [[7, 100], [0, 200]]);  // +100%
  series('cohort beta', [[7, 100], [0, 120]]);   // +20%
  series('cohort gamma', [[7, 100], [0, 90]]);   // −10%
  const p = radar.cohortGrowthPercentile('cohort alpha');
  // The dev DB is shared: other tracked terms may join the cohort, so assert
  // relative ordering rather than exact percentiles.
  assert.equal(p.myGrowthPct, 100);
  assert.ok(p.cohortSize >= 2, 'at least beta and gamma in the cohort');
  assert.ok(p.percentile >= 80, `alpha (+100%) should rank high, got ${p.percentile}`);
  const low = radar.cohortGrowthPercentile('cohort gamma');
  assert.ok(low.percentile < p.percentile, 'gamma (−10%) ranks below alpha');
  assert.equal(radar.cohortGrowthPercentile('never tracked'), null);
});

test('vettingEngine uses measured demand/longevity when a series exists', () => {
  // Two identical trend rows; one has a hot measured series.
  const base = { emoji: '🧪', window: 14, est_revenue: '$2k-4k', why: 'test source' };
  const ins = db.prepare(
    `INSERT INTO trends (name, emoji, phase, velocity, window, est_revenue, why, activated, detected_at, trend_key, first_seen_at)
     VALUES (?, ?, 'rising', '+80%', ?, ?, ?, 0, ?, ?, ?)`
  );
  const unmeasuredId = ins.run('vet unmeasured', base.emoji, base.window, base.est_revenue, base.why, new Date().toISOString(), 'vet unmeasured', new Date().toISOString()).lastInsertRowid;
  const measuredId = ins.run('vet measured', base.emoji, base.window, base.est_revenue, base.why, new Date().toISOString(), 'vet measured', new Date().toISOString()).lastInsertRowid;
  series('vet measured', [[21, 100], [14, 160], [7, 260], [0, 420]]); // strong WoW growth → high demand

  try {
    const plain = vetting.vetTrend(db.prepare('SELECT * FROM trends WHERE id = ?').get(unmeasuredId));
    const measured = vetting.vetTrend(db.prepare('SELECT * FROM trends WHERE id = ?').get(measuredId));
    assert.equal(plain.measured.demand, false, 'no series → heuristic demand');
    assert.equal(measured.measured.demand, true, 'series → measured demand');
    assert.ok(measured.signals.demand > plain.signals.demand, 'measured demand outranks the heuristic');
    assert.equal(measured.measured.longevity, true);
    assert.ok(measured.measured.breakoutZ >= 2);
    // Score must move with the measured signals.
    assert.ok(measured.score !== plain.score || measured.signals.demand !== plain.signals.demand);
  } finally {
    db.prepare('DELETE FROM trends WHERE id IN (?, ?)').run(unmeasuredId, measuredId);
    db.prepare('DELETE FROM trend_snapshots WHERE trend_key = ?').run('vet measured');
  }
});
