// COVER QA — structural verification of a rendered marketplace cover.
//
// The AI design critique scores a cover on taste. It cannot tell you whether the
// product page actually landed in the tablet, or whether the page shown belongs
// to a DIFFERENT product — both defects have shipped. This module checks the
// artifact itself, deterministically, with no AI and no network:
//
//   1. tablet screen detected — the render found the photo's blank tablet screen
//      (a fixed-slot fallback means the page floats over the photo).
//   2. page actually composited — the screen region is not blank; it carries
//      real content rather than an empty white panel.
//   3. page belongs to this product — the region is re-derived from THIS
//      product's own design and compared against what was rendered.
//
// publishAllowed is false unless every applicable check passes, and the verdict
// is cached in the render manifest (keyed by the cover file's sha256) so repeat
// calls are free while the artifact is unchanged.
const fs = require('fs');
const crypto = require('crypto');
const fileFactory = require('./fileFactory');

// Re-rendered page raster is 800x1040 (see renderProductCoverPreview).
const RASTER_ASPECT = 1040 / 800;
const SIGNATURE_GRID = 32;
// Trim from each side of the screen before sampling: the rounded corners and the
// hero's soft inner vignette live at the very edge, and they are not part of the
// page raster we compare against.
const EDGE_INSET_FRAC = 0.06;
// Trim the bottom clip edge (the screen can cut the page off mid-row).
const BOTTOM_TRIM_FRAC = 0.03;

// Ownership is decided by two metrics, calibrated on real renders. Take a
// roofing spreadsheet cover and compare its page region against candidate page
// rasters (32x32 grayscale, mean absolute difference on a 0..255 scale):
//
//   candidate                          correlation   mean abs diff
//   #678 the product itself            0.967         5.98   <- must pass
//   #681 same template, sibling niche  0.962         6.08
//   #919 different niche, same template 0.959        8.50   <- must fail
//   #682 different niche, same template 0.959        8.79
//   #922 different content             0.953         10.73
//
// Correlation alone cannot decide this — every candidate scores ~0.96 because
// they share one template. Mean-abs-diff carries the decision; correlation is
// only a sanity floor. z-normalising the signatures first was measured and made
// the gap worse (0.141 own vs 0.155 nearest foreign), so it is not used.
//
// MEANINGFUL LIMITATION, stated plainly: this proves the tablet shows a page
// that matches THIS product's design, and it rejects a page that differs
// appreciably. It cannot resolve text, so two products built from the same
// template with similar palettes are not separable (see #681 above). It is a
// strong safety net, not an identity proof.
const MIN_CORRELATION = 0.90;
// Sits between the worst passing case (5.98) and the best failing case (8.50).
// Env-overridable so the owner can tune in production without a code change.
const DEFAULT_MAX_MEAN_ABS_DIFF = 7.5;
function maxMeanAbsDiff() {
  const v = Number(process.env.COVER_QA_MAX_MAD);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_MAX_MEAN_ABS_DIFF;
}
// A blank white screen (or a solid colour) has almost no variance. Real pages
// measure in the hundreds; an empty panel measures near 0.
const MIN_REGION_VARIANCE = 8;

function mean(values) {
  if (!values.length) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

function variance(values) {
  if (values.length < 2) return 0;
  const m = mean(values);
  let acc = 0;
  for (const v of values) acc += (v - m) * (v - m);
  return acc / values.length;
}

/** Pearson correlation of two equal-length sample arrays. Returns 0 when either
 *  side is constant (a flat image carries no matchable signal). */
function correlation(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length < 2) return 0;
  const ma = mean(a), mb = mean(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] - ma, y = b[i] - mb;
    num += x * y; da += x * x; db += y * y;
  }
  if (da <= 0 || db <= 0) return 0;
  return num / Math.sqrt(da * db);
}

/** Mean absolute per-cell difference of two signatures (0..255 scale). */
function meanAbsDiff(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

function clampToBounds(rect, width, height) {
  const x = Math.max(0, Math.min(rect.x, width - 1));
  const y = Math.max(0, Math.min(rect.y, height - 1));
  return {
    x,
    y,
    w: Math.max(1, Math.min(rect.w, width - x)),
    h: Math.max(1, Math.min(rect.h, height - y))
  };
}

/**
 * The two windows that must correspond sample-for-sample:
 *   cover  — pixel rect inside the rendered 2:3 master image
 *   raster — the same window as fractions (0..1) of the page raster
 * Getting this correspondence right is what makes the comparison meaningful:
 * the raster is drawn at the screen's full width and clipped at its bottom, so
 * comparing a cropped cover window against the whole raster would compare
 * different pictures.
 */
function pageCrops(manifest = {}, master = { width: 1200, height: 1800 }) {
  const screen = manifest.screen || {};
  const slot = manifest.slot || {};
  const wVis = Number(screen.width != null ? screen.width : slot.width) || 0;
  const fullH = Math.round(wVis * RASTER_ASPECT);
  const screenH = Number(screen.height != null ? screen.height : slot.height) || fullH;
  const hVis = Math.max(8, Math.min(fullH, screenH));
  const insetX = Math.round(wVis * EDGE_INSET_FRAC);
  const coverW = Math.max(8, wVis - insetX * 2);
  const coverH = Math.max(8, Math.round(hVis * (1 - BOTTOM_TRIM_FRAC)));
  // The composite scales the raster by COVER_PREVIEW_SCALE (top-center anchor),
  // so the cover window shows a SMALLER, centered slice of the raster than its
  // own dimensions suggest. Sample the matching raster region: horizontally
  // centered at 1/scale width, vertically the top coverH/scale of the raster.
  const scale = Math.max(1, Number(manifest.previewScale) || 1);
  const rasterW = Math.min(1, (coverW / scale) / wVis);
  const rasterH = Math.min(1, (coverH / scale) / fullH);
  const rasterX = (1 - rasterW) / 2;
  const cover = clampToBounds({
    x: (Number(screen.x != null ? screen.x : slot.x) || 0) + insetX,
    y: Number(screen.y != null ? screen.y : slot.y) || 0,
    w: coverW,
    h: coverH
  }, master.width || 1200, master.height || 1800);
  return {
    cover,
    raster: wVis > 0
      ? { x: rasterX, y: 0, w: rasterW, h: rasterH }
      : { x: 0, y: 0, w: 1, h: 1 }
  };
}

/** Back-compat helper: just the cover-side rect. */
function pageRegion(manifest, master) {
  return pageCrops(manifest, master).cover;
}

/** Downsample the cover's page region and the freshly re-rendered page into
 *  comparable 16x16 luminance signatures, in one browser pass. */
async function extractSignatures({ coverPath, crops, rasterDataUri, deviceRotate = 0 }) {
  const pdfGen = require('./pdfGenerator');
  const coverArt = require('./coverArt');
  const browser = await pdfGen.getBrowser();
  if (!browser) return null;
  const page = await browser.newPage();
  // The renderer tilts the fallback device frame; undo that tilt when sampling.
  const deRotateDeg = deviceRotate ? -Number(deviceRotate) : 0;
  try {
    const coverUri = coverArt.imageDataUri(fs.readFileSync(fileFactory.coverMasterPath(coverPath)));
    return await page.evaluate(async (coverSrc, rasterSrc, clip, rasterFrac, GRID, deRotateDeg) => {
      const load = (src) => new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });
      const signature = (img, sx, sy, sw, sh, deRotateDeg) => {
        const canvas = document.createElement('canvas');
        canvas.width = GRID; canvas.height = GRID;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (deRotateDeg) {
          // The no-photo fallback draws the page inside a deliberately tilted
          // device frame. Counter-rotate about the crop centre before sampling so
          // the comparison is like-for-like; the origin error versus the true
          // frame centre is sub-pixel at this angle.
          ctx.translate(GRID / 2, GRID / 2);
          ctx.rotate((deRotateDeg * Math.PI) / 180);
          ctx.scale(GRID / sw, GRID / sh);
          ctx.translate(-(sx + sw / 2), -(sy + sh / 2));
          ctx.drawImage(img, 0, 0);
        } else {
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, GRID, GRID);
        }
        const data = ctx.getImageData(0, 0, GRID, GRID).data;
        const out = new Array(GRID * GRID);
        for (let i = 0, p = 0; p < out.length; i += 4, p++) {
          out[p] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
        }
        return out;
      };
      const cover = await load(coverSrc);
      const raster = await load(rasterSrc);
      const rw = raster.naturalWidth, rh = raster.naturalHeight;
      return {
        region: signature(cover, clip.x, clip.y, clip.w, clip.h, deRotateDeg),
        raster: signature(raster, rasterFrac.x * rw, rasterFrac.y * rh, rasterFrac.w * rw, rasterFrac.h * rh, 0)
      };
    }, coverUri, rasterDataUri, crops.cover, crops.raster, SIGNATURE_GRID, deRotateDeg);
  } finally {
    await page.close().catch(() => {});
  }
}

/** Pure decision step — no I/O — so it is hermetically testable. */
function judge({ manifest, product, master, signatures }) {
  const checks = {};
  const failures = [];

  const expectedMaster = { width: 1200, height: 1800 };
  const bounds = master || expectedMaster;

  // 1. Provenance: the manifest must describe THIS product.
  const manifestMatches = !!manifest && Number(manifest.productId) === Number(product && product.id);
  checks.manifest = manifestMatches;
  if (!manifest) failures.push('no render manifest for this cover (render it again)');
  else if (!manifestMatches) failures.push(`cover manifest belongs to product ${manifest.productId}, not ${product && product.id}`);

  // 2. Tablet screen detected. A photo background with no detected screen means
  //    the page was drawn at the fixed slot and floats over the photograph.
  const adaptive = !!(manifest && manifest.adaptive);
  const hadArt = !!(manifest && manifest.hadArt);
  const screenDetected = adaptive || !hadArt;
  checks.screenDetected = screenDetected;
  if (hadArt && !adaptive) failures.push('no tablet screen detected in the background photo — the page floats instead of sitting in the device');

  const slot = manifest && manifest.slot;
  const slotPlausible = !!slot && Number.isFinite(slot.x) && Number.isFinite(slot.y) &&
    slot.width >= 120 && slot.height >= 150 &&
    slot.x + slot.width <= bounds.width + 4 && slot.y + slot.height <= bounds.height + 4;
  checks.slotPlausible = slotPlausible;
  if (manifest && !slotPlausible) failures.push('recorded screen slot is outside the cover or implausibly small');

  // 3. The page was actually composited — the region carries real content.
  const regionSig = signatures && signatures.region;
  const rasterSig = signatures && signatures.raster;
  const regionVariance = regionSig ? variance(regionSig) : 0;
  const composited = regionVariance >= MIN_REGION_VARIANCE;
  checks.pageComposited = composited;
  if (signatures && !composited) failures.push(`screen region looks blank (variance ${regionVariance.toFixed(1)}) — the product page was not composited`);

  // 4. The composited page belongs to this product.
  const r = (regionSig && rasterSig) ? correlation(regionSig, rasterSig) : 0;
  const mad = (regionSig && rasterSig) ? meanAbsDiff(regionSig, rasterSig) : Infinity;
  const madLimit = maxMeanAbsDiff();
  // Correlation is unreliable for SPARSE content (a cover page of text on a flat
  // gradient has few cells to align, so even a correct composite correlates
  // poorly). A wrong product, by contrast, always shows a HIGH mad. So a strong
  // absolute match (mad well within the limit) is sufficient evidence on its
  // own; correlation is required only when the mad is merely borderline.
  const MAD_STRONG = 6.5;
  const strongMatch = Number.isFinite(mad) && mad <= MAD_STRONG;
  const belongs = Number.isFinite(mad) && mad <= madLimit && (r >= MIN_CORRELATION || strongMatch);
  checks.pageBelongsToProduct = belongs;
  if (signatures && !belongs) {
    failures.push(`composited page does not match this product's design (match ${r.toFixed(3)}/${MIN_CORRELATION}, difference ${Number.isFinite(mad) ? mad.toFixed(1) : 'n/a'}/${madLimit})`);
  }

  const comparable = !!signatures;
  if (!comparable) failures.push('page comparison unavailable (renderer busy)');

  return {
    ok: manifestMatches && screenDetected && slotPlausible && composited && belongs && comparable,
    checks,
    failures,
    metrics: {
      correlation: Number(r.toFixed(4)),
      meanAbsDiff: Number.isFinite(mad) ? Number(mad.toFixed(2)) : null,
      meanAbsDiffLimit: madLimit,
      regionVariance: Number(regionVariance.toFixed(2))
    }
  };
}

function sha256File(path) {
  try { return crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex'); }
  catch { return null; }
}

/**
 * Verify a rendered cover. Returns { ok, publishAllowed, status, reason, checks }.
 * Never throws — a verifier that breaks must block publishing, not crash it.
 * `deps` is injectable for tests (extract / rasterProvider).
 */
async function verifyCover(product, opts = {}) {
  const deps = opts.deps || {};
  try {
    const coverPath = opts.coverPath || (product && product.preview_path);
    if (!coverPath || !fs.existsSync(coverPath)) {
      return { ok: false, publishAllowed: false, status: 'fail', reason: 'cover file missing', checks: {}, productId: product && product.id };
    }
    const masterPath = fileFactory.coverMasterPath(coverPath);
    if (!fs.existsSync(masterPath)) {
      return { ok: false, publishAllowed: false, status: 'fail', reason: 'cover master (2:3) missing — the crop alone cannot be verified', checks: {}, productId: product && product.id };
    }
    const manifest = fileFactory.readCoverManifest(coverPath);
    const sha = sha256File(coverPath);

    // Cached pass for an unchanged artifact.
    if (!opts.force && manifest && manifest.qaVerified && manifest.qaVerified.ok === true && manifest.qaVerified.sha256 === sha) {
      return { ...manifest.qaVerified, cached: true, productId: product && product.id, coverPath };
    }

    if (!manifest) {
      return { ok: false, publishAllowed: false, status: 'fail', reason: 'no render manifest for this cover — re-render it so the page placement can be verified', checks: {}, productId: product && product.id, coverPath };
    }

    const crops = pageCrops(manifest, { width: 1200, height: 1800 });
    let signatures = null;
    const rasterProvider = deps.rasterProvider || (() => fileFactory.productPageRaster(product));
    const extract = deps.extract || extractSignatures;
    try {
      const rasterDataUri = await rasterProvider(product);
      if (rasterDataUri) {
        signatures = await extract({ coverPath, crops, region: crops.cover, rasterDataUri, deviceRotate: manifest.deviceRotate || 0 });
      }
    } catch (e) {
      console.error('[COVER QA] signature extraction failed:', e.message);
    }

    const verdict = judge({ manifest, product, signatures });
    const result = {
      ok: verdict.ok,
      publishAllowed: verdict.ok,
      status: verdict.ok ? 'pass' : 'fail',
      reason: verdict.ok ? null : verdict.failures.join('; '),
      checks: verdict.checks,
      metrics: verdict.metrics,
      productId: product && product.id,
      coverPath
    };

    // Cache only passes — a failure should be re-checked after a re-render.
    if (result.ok && sha) {
      try {
        const next = { ...manifest, qaVerified: { ok: true, sha256: sha, at: new Date().toISOString(), metrics: result.metrics } };
        fs.writeFileSync(fileFactory.coverManifestPath(coverPath), JSON.stringify(next));
      } catch (e) { console.error('[COVER QA] manifest cache write:', e.message); }
    }
    return result;
  } catch (e) {
    console.error('[COVER QA] verify failed:', e.message);
    return { ok: false, publishAllowed: false, status: 'fail', reason: `cover verification error: ${e.message}`, checks: {}, productId: product && product.id };
  }
}

/** Throwing form for direct call sites. */
async function assertCoverReady(product, opts = {}) {
  const verdict = await verifyCover(product, opts);
  if (!verdict.publishAllowed) {
    const error = new Error(`Cover QA failed: ${verdict.reason}`);
    error.code = 'COVER_QA_FAILED';
    error.coverQa = verdict;
    throw error;
  }
  return verdict;
}

module.exports = {
  verifyCover,
  assertCoverReady,
  judge,
  correlation,
  meanAbsDiff,
  variance,
  pageRegion,
  pageCrops,
  DEFAULT_MAX_MEAN_ABS_DIFF,
  MIN_CORRELATION,
  MIN_REGION_VARIANCE,
  SIGNATURE_GRID
};
