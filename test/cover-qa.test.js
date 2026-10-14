'use strict';
// Cover QA — structural verification of a rendered cover.
// Hermetic: the browser-bound signature extraction is injected, so this suite
// exercises the decision logic, the manifest contract and the caching without
// launching Puppeteer or touching the network.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const qa = require('../server/services/coverQA');
const fileFactory = require('../server/services/fileFactory');

const GRID = qa.SIGNATURE_GRID;

/** A signature with real structure (0..255 ramp with a repeating pattern). */
function richSeries(seed = 0) {
  return Array.from({ length: GRID * GRID }, (_, i) => 30 + ((i * 7 + seed) % 200));
}
function flatSeries(value = 240) {
  return new Array(GRID * GRID).fill(value);
}

function goodManifest(overrides = {}) {
  return {
    productId: 4242,
    hadArt: true,
    adaptive: true,
    slot: { x: 372, y: 576, width: 480, height: 708 },
    screen: { x: 372, y: 576, width: 480, height: 708 },
    labelHeight: 44,
    ...overrides
  };
}

test('correlation: identity, affine shift, and no-signal cases', () => {
  const a = richSeries();
  assert.ok(Math.abs(qa.correlation(a, a) - 1) < 1e-9, 'identical series correlate 1');
  const shifted = a.map(v => v * 0.8 + 25);
  assert.ok(qa.correlation(a, shifted) > 0.99, 'a uniform tint/brightness shift must not break the match (Pearson is affine-invariant)');
  const inverted = a.map(v => 255 - v);
  assert.ok(qa.correlation(a, inverted) < -0.99, 'an inverted page must not read as a match');
  assert.equal(qa.correlation(flatSeries(255), a), 0, 'a blank/constant image carries no matchable signal');
  assert.equal(qa.correlation(a, a.slice(1)), 0, 'mismatched lengths are not comparable');
});

test('variance: a blank screen has none', () => {
  assert.equal(qa.variance(flatSeries(255)), 0);
  assert.ok(qa.variance(richSeries()) > qa.MIN_REGION_VARIANCE);
});

test('pageRegion: stays inside the master and inside the tablet screen', () => {
  const manifest = goodManifest();
  const region = qa.pageRegion(manifest, { width: 1200, height: 1800 });
  assert.ok(region.x >= manifest.screen.x, 'region starts at or after the screen');
  assert.ok(region.y >= manifest.screen.y, 'region starts below the screen top');
  assert.ok(region.x + region.w <= manifest.screen.x + manifest.screen.width + 1, 'region stays within the screen width');
  assert.ok(region.w >= 8 && region.h >= 8);
  // A slot against the right edge must not run off the canvas.
  const edge = qa.pageRegion(goodManifest({ screen: { x: 1000, y: 1500, width: 400, height: 700 } }), { width: 1200, height: 1800 });
  assert.ok(edge.x + edge.w <= 1200, 'clamped to the master width');
  assert.ok(edge.y + edge.h <= 1800, 'clamped to the master height');
});

test('judge: a correctly composited cover passes every check', () => {
  const v = qa.judge({
    manifest: goodManifest(),
    product: { id: 4242 },
    signatures: { region: richSeries(), raster: richSeries() }
  });
  assert.equal(v.ok, true);
  assert.equal(v.checks.manifest, true);
  assert.equal(v.checks.screenDetected, true);
  assert.equal(v.checks.pageComposited, true);
  assert.equal(v.checks.pageBelongsToProduct, true);
  assert.ok(v.metrics.correlation > 0.99);
});

test('judge: a manifest for another product is rejected', () => {
  const v = qa.judge({
    manifest: goodManifest({ productId: 99 }),
    product: { id: 4242 },
    signatures: { region: richSeries(), raster: richSeries() }
  });
  assert.equal(v.ok, false);
  assert.equal(v.checks.manifest, false);
  assert.match(v.failures.join(' '), /belongs to product 99/);
});

test('judge: a photo with no detected tablet screen fails (the floating-page defect)', () => {
  const v = qa.judge({
    manifest: goodManifest({ adaptive: false, hadArt: true }),
    product: { id: 4242 },
    signatures: { region: richSeries(), raster: richSeries() }
  });
  assert.equal(v.ok, false);
  assert.equal(v.checks.screenDetected, false);
  assert.match(v.failures.join(' '), /floats instead of sitting in the device/);
});

test('judge: a blank screen region fails the composited check', () => {
  const v = qa.judge({
    manifest: goodManifest(),
    product: { id: 4242 },
    signatures: { region: flatSeries(255), raster: richSeries() }
  });
  assert.equal(v.ok, false);
  assert.equal(v.checks.pageComposited, false);
  assert.match(v.failures.join(' '), /looks blank/);
});

test('judge: a page from a different product fails the ownership check', () => {
  const v = qa.judge({
    manifest: goodManifest(),
    product: { id: 4242 },
    signatures: { region: richSeries(11), raster: richSeries(97) }
  });
  assert.equal(v.ok, false);
  assert.equal(v.checks.pageBelongsToProduct, false);
  assert.match(v.failures.join(' '), /does not match this product/);
});

test('judge: an implausible slot is rejected', () => {
  const small = qa.judge({
    manifest: goodManifest({ slot: { x: 10, y: 10, width: 40, height: 40 } }),
    product: { id: 4242 },
    signatures: { region: richSeries(), raster: richSeries() }
  });
  assert.equal(small.checks.slotPlausible, false);
  assert.equal(small.ok, false);
  const offCanvas = qa.judge({
    manifest: goodManifest({ slot: { x: 1100, y: 1700, width: 480, height: 708 } }),
    product: { id: 4242 },
    signatures: { region: richSeries(), raster: richSeries() }
  });
  assert.equal(offCanvas.checks.slotPlausible, false);
  assert.equal(offCanvas.ok, false);
});

test('judge: without signatures the comparison is unavailable and publishing is blocked', () => {
  const v = qa.judge({ manifest: goodManifest(), product: { id: 4242 }, signatures: null });
  assert.equal(v.ok, false);
  assert.match(v.failures.join(' '), /comparison unavailable/);
});

test('judge: a no-art cover only has to prove the page landed (no tablet photo to detect)', () => {
  const v = qa.judge({
    manifest: goodManifest({ hadArt: false, adaptive: false }),
    product: { id: 4242 },
    signatures: { region: richSeries(), raster: richSeries() }
  });
  assert.equal(v.checks.screenDetected, true, 'without a photo there is no floating-page defect to detect');
  assert.equal(v.ok, true);
});

// ── verifyCover over real files ─────────────────────────────────────────────

function makeCoverFixture({ manifest, coverBytes = Buffer.from([1, 2, 3, 4]) } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-coverqa-'));
  const coverPath = path.join(dir, 'roofing-spreadsheet-1-cover-v8.jpg');
  fs.writeFileSync(coverPath, coverBytes);
  fs.writeFileSync(fileFactory.coverMasterPath(coverPath), Buffer.from([9, 9, 9]));
  if (manifest !== null) {
    fs.writeFileSync(fileFactory.coverManifestPath(coverPath), JSON.stringify(manifest === undefined ? goodManifest() : manifest));
  }
  return { dir, coverPath, cleanup: () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} } };
}

const passingDeps = {
  rasterProvider: async () => 'data:image/jpeg;base64,AAAA',
  extract: async () => ({ region: richSeries(), raster: richSeries() })
};

test('verifyCover: a verified cover passes and is cached against the exact file', async () => {
  const fx = makeCoverFixture();
  try {
    const product = { id: 4242 };
    const first = await qa.verifyCover(product, { coverPath: fx.coverPath, deps: passingDeps });
    assert.equal(first.publishAllowed, true);
    assert.equal(first.status, 'pass');
    assert.equal(first.cached, undefined);

    // The pass is cached in the manifest keyed by the cover's sha256.
    assert.equal(fileFactory.readCoverManifest(fx.coverPath).qaVerified.ok, true);

    let extractCalls = 0;
    const second = await qa.verifyCover(product, {
      coverPath: fx.coverPath,
      deps: { ...passingDeps, extract: async () => { extractCalls++; return { region: richSeries(), raster: richSeries() }; } }
    });
    assert.equal(second.cached, true);
    assert.equal(extractCalls, 0, 'an unchanged artifact must not be re-inspected');

    // Changing the artifact invalidates the cache.
    fs.writeFileSync(fx.coverPath, Buffer.from([7, 7, 7, 7]));
    const third = await qa.verifyCover(product, { coverPath: fx.coverPath, deps: passingDeps });
    assert.equal(third.cached, undefined, 'a new artifact must be re-verified');
  } finally { fx.cleanup(); }
});

test('verifyCover: a failing cover is blocked and the failure is never cached', async () => {
  const fx = makeCoverFixture();
  try {
    const product = { id: 4242 };
    const failDeps = {
      rasterProvider: async () => 'data:image/jpeg;base64,AAAA',
      extract: async () => ({ region: richSeries(11), raster: richSeries(97) })
    };
    const first = await qa.verifyCover(product, { coverPath: fx.coverPath, deps: failDeps });
    assert.equal(first.publishAllowed, false);
    assert.equal(first.status, 'fail');
    assert.match(first.reason, /does not match this product/);
    assert.equal(fileFactory.readCoverManifest(fx.coverPath).qaVerified, undefined, 'failures must not be cached as verified');
  } finally { fx.cleanup(); }
});

test('verifyCover: missing manifest, missing master and missing file all block', async () => {
  const noManifest = makeCoverFixture({ manifest: null });
  try {
    const v = await qa.verifyCover({ id: 4242 }, { coverPath: noManifest.coverPath, deps: passingDeps });
    assert.equal(v.publishAllowed, false);
    assert.match(v.reason, /no render manifest/);
  } finally { noManifest.cleanup(); }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-coverqa-'));
  try {
    const coverPath = path.join(dir, 'x-cover-v8.jpg');
    fs.writeFileSync(coverPath, Buffer.from([1]));
    const v = await qa.verifyCover({ id: 4242 }, { coverPath, deps: passingDeps });
    assert.equal(v.publishAllowed, false);
    assert.match(v.reason, /master \(2:3\) missing/);
  } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }

  const v = await qa.verifyCover({ id: 4242 }, { coverPath: path.join(os.tmpdir(), 'ng-does-not-exist.jpg') });
  assert.equal(v.publishAllowed, false);
  assert.match(v.reason, /cover file missing/);
});

test('verifyCover: a thrown dependency blocks publishing instead of crashing', async () => {
  const fx = makeCoverFixture();
  try {
    const v = await qa.verifyCover({ id: 4242 }, {
      coverPath: fx.coverPath,
      deps: { rasterProvider: async () => { throw new Error('browser exploded'); }, extract: passingDeps.extract }
    });
    assert.equal(v.publishAllowed, false);
    assert.match(v.reason, /comparison unavailable/);
  } finally { fx.cleanup(); }
});

test('assertCoverReady throws a COVER_QA_FAILED error with the verdict attached', async () => {
  const fx = makeCoverFixture();
  const failingDeps = {
    rasterProvider: async () => 'data:image/jpeg;base64,AAAA',
    extract: async () => ({ region: richSeries(11), raster: richSeries(97) })
  };
  try {
    await assert.rejects(
      () => qa.assertCoverReady({ id: 4242 }, { coverPath: fx.coverPath, deps: failingDeps }),
      (e) => e.code === 'COVER_QA_FAILED' && e.coverQa && e.coverQa.publishAllowed === false
    );
  } finally { fx.cleanup(); }

  const ok = makeCoverFixture();
  try {
    const verdict = await qa.assertCoverReady({ id: 4242 }, { coverPath: ok.coverPath, deps: passingDeps });
    assert.equal(verdict.publishAllowed, true);
  } finally { ok.cleanup(); }
});

test('the renderer and the gate agree on where the page is (data attributes round-trip)', () => {
  const ds = require('../server/services/designStudio');
  const slot = { x: 372, y: 576, width: 480, height: 708, adaptive: true };
  const html = ds.buildThumbStopperCover({ type: 'spreadsheet' }, { name: 'Roofing Contractor' }, {}, {}, {}, ['T', 'S', [], 'XLSX'], slot);
  const geometry = fileFactory.parseCoverGeometry(html);
  assert.ok(geometry, 'geometry must be parseable from the rendered HTML');
  assert.equal(geometry.adaptive, true);
  assert.deepEqual(geometry.slot, { x: 372, y: 576, width: 480, height: 708 });
  assert.equal(geometry.screen.x, 372, 'adaptive screen sits at the detected slot');
  assert.equal(geometry.screen.y, 576 + geometry.labelHeight, 'page content starts below the preview label');
  assert.equal(geometry.screen.width, 480);
  assert.equal(geometry.screen.height, 708 - geometry.labelHeight);
  assert.equal(geometry.deviceRotate, 0, 'a detected tablet is not tilted');

  // The no-photo fallback draws the page inside a tilted device frame; the gate
  // must know the angle so it can counter-rotate before comparing.
  const fallback = fileFactory.parseCoverGeometry(
    ds.buildThumbStopperCover({ type: 'spreadsheet' }, { name: 'Roofing Contractor' }, {}, {}, {}, ['T', 'S', [], 'XLSX'], null)
  );
  assert.equal(fallback.adaptive, false);
  assert.equal(fallback.deviceRotate, -1.5, 'the fallback device frame tilt must be recorded for de-rotation');
});
