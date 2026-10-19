// ═══════════════════════════════════════════════════════════════════════════
// COVER CRITIC — vision-based quality gate for composited marketplace covers.
//
// Mirrors the n8n "Critique Cover" + "Passes Quality Gate?" steps:
//   1. A vision-capable model scores the final cover image on 6 dimensions
//      (hero_realism, typography, composition, palette, thumbnail_legibility,
//      desirability) and checks for garbled text.
//   2. A strict threshold (≥8 overall + zero garbled text) gates the cover.
//
// Unlike designCritic.js (which scores full product pages, not covers), this
// module scores ONLY the cover image. It reuses modelRouter.js for the
// actual API call so auth, retries, and budget caps are shared.
//
// Hard rules (same as designCritic):
//   • Never throws upstream. MODEL_ENABLED=false → skip, return null.
//   • One critique per cover per hash (cached via sha256).
//   • All vision spend lands in ai_usage (action='cover_critique').
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { db } = require('../database');
const router = require('./modelRouter');
const cfg = require('./modelConfig');
const coverArt = require('./coverArt');

// ── THRESHOLD ───────────────────────────────────────────────────────────────
// n8n uses ≥8 overall + no garbled text. We match that bar.
const THRESHOLD = Number(process.env.COVER_CRITIC_THRESHOLD || 8);
const ENABLED = cfg.enabled;

// ── VISION RUBRIC ───────────────────────────────────────────────────────────
// Matches the n8n "Critique Cover" rubric exactly.
const COVER_CRITIQUE_PROMPT = `
You are a harsh senior art director judging a marketplace cover for a digital product.
The bar is top Creative Market / Dribbble product shots: one photoreal hero object,
dramatic type-size contrast, restrained palette with one accent, generous negative
space, and realistic materials and light.

Score each from 0 to 10:
- hero_realism: does the hero object look like a real photograph, not CGI or clipart?
- typography: is the text crisp, well-spaced, and using at most two fonts with dramatic size contrast?
- composition: is the layout balanced with generous negative space and a clear hero + text area split?
- palette: exactly three colors (background, ink, accent) with strong contrast and one accent?
- thumbnail_legibility: readable at 250px-wide thumbnail?
- desirability: would a designer stop scrolling and click on this?

garbled_text = true if ANY malformed, misspelled, or fake text appears anywhere in the image.

overall = your honest overall score (not an average). Be strict: 8 means it would hold
its own on Creative Market's front page.

Return ONLY JSON: {"hero_realism":n,"typography":n,"composition":n,"palette":n,"thumbnail_legibility":n,"desirability":n,"garbled_text":bool,"overall":n,"critique":"2-3 sentences with specific fixes"}
`;

// ── PARSING ───────────────────────────────────────────────────────────────────

function clampScore(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(10, n));
}

/** Parse the vision model's JSON reply defensively. Returns null on any failure. */
function parseCoverCritique(text) {
  if (!text) return null;
  const cleaned = String(text)
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  let obj;
  try {
    obj = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }

  const scores = {};
  for (const key of ['hero_realism', 'typography', 'composition', 'palette', 'thumbnail_legibility', 'desirability']) {
    const v = clampScore(obj[key]);
    if (v === null) return null; // every rubric leg must be present and sane
    scores[key] = v;
  }

  const provided = clampScore(obj.overall);
  const mean = Object.values(scores).reduce((a, v) => a + v, 0) / Object.keys(scores).length;
  scores.overall = provided !== null ? provided : Math.round(mean * 10) / 10;

  return {
    scores,
    garbled_text: obj.garbled_text === true,
    critique: String(obj.critique || '').slice(0, 500).trim()
  };
}

// ── IMAGE DATA URI ────────────────────────────────────────────────────────────

function imageToDataUri(filePath) {
  const data = fs.readFileSync(filePath);
  return coverArt.imageDataUri(data);
}

/**
 * Score a single cover variant. Returns the parsed critique or null.
 * Never throws. Uses modelRouter.callVision for the vision API call.
 */
async function scoreCoverVariant(imageDataUri) {
  if (!ENABLED) return null;
  if (!router.underCap(cfg.caps.maxCallsPerDesignSweep)) return null;

  try {
    const res = await router.callVision({
      prompt: 'Critique this marketplace cover:',
      images: [imageDataUri],
      system: COVER_CRITIQUE_PROMPT,
      temperature: 0.3,
      maxTokens: 600,
      action: 'cover_critique'
    });
    return parseCoverCritique(res);
  } catch (e) {
    console.error('[COVER_CRITIC] vision call failed:', e.message);
    return null;
  }
}

// ── CACHE ────────────────────────────────────────────────────────────────────

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function latestCoverScore(productId) {
  try {
    const row = db.prepare('SELECT * FROM cover_scores WHERE product_id = ? ORDER BY id DESC LIMIT 1').get(productId);
    if (!row) return null;
    return { ...row, scores: safeParse(row.scores) };
  } catch {
    return null;
  }
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

function persistCoverScore(productId, scores, critique, meta = {}) {
  try {
    db.prepare(`
      INSERT INTO cover_scores (product_id, scores, critique, overall, zero_garbled_text, status, quality_passed, hash, revised)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      productId,
      JSON.stringify(scores),
      critique || '',
      scores.overall || 0,
      scores.garbled_text ? 0 : 1,
      meta.status || 'scored',
      scores.overall >= THRESHOLD && !scores.garbled_text ? 1 : 0,
      meta.hash || '',
      meta.revised ? 1 : 0
    );
  } catch (e) {
    // Table might not exist yet — create it and retry
    try {
      db.prepare(`
        CREATE TABLE IF NOT EXISTS cover_scores (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id INTEGER,
          scores TEXT,
          critique TEXT,
          overall REAL,
          zero_garbled_text INTEGER,
          status TEXT,
          quality_passed INTEGER,
          hash TEXT,
          revised INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `).run();
      db.prepare(`
        INSERT INTO cover_scores (product_id, scores, critique, overall, zero_garbled_text, status, quality_passed, hash, revised)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        productId,
        JSON.stringify(scores),
        critique || '',
        scores.overall || 0,
        scores.garbled_text ? 0 : 1,
        meta.status || 'scored',
        scores.overall >= THRESHOLD && !scores.garbled_text ? 1 : 0,
        meta.hash || '',
        meta.revised ? 1 : 0
      );
    } catch (e2) {
      console.error('[COVER_CRITIC] persist failed:', e2.message);
    }
  }
}

// ── QUALITY DECISION ───────────────────────────────────────────────────────────

/**
 * Given parsed scores, decide whether the cover passes the quality gate.
 * Pass = overall >= THRESHOLD AND zero garbled text.
 */
function coverDecision(scores) {
  const publishAllowed = scores &&
    scores.scores &&
    scores.scores.overall >= THRESHOLD &&
    !scores.garbled_text;

  return {
    publishAllowed: !!publishAllowed,
    quality_score: scores ? scores.scores.overall : 0,
    zeroGarbledText: scores ? !scores.garbled_text : false,
    threshold: THRESHOLD,
    scores: scores ? scores.scores : null,
    critique: scores ? scores.critique : null
  };
}

// ── MAIN ENTRY ───────────────────────────────────────────────────────────────

/**
 * Critique a cover image file and decide if it passes the quality gate.
 *
 * @param {string|number} coverOrProductId — file path or product ID
 * @param {object} opts — { force, productId, concept }
 * @returns {object} { publishAllowed, quality_score, zeroGarbledText, threshold, scores, critique }
 *
 * Never throws — returns a fail-closed decision on any error.
 */
async function critiqueCover(coverOrId, opts = {}) {
  try {
    // Support being called with either a product ID or a file path
    let coverPath, productId;

    if (typeof coverOrId === 'string' && (coverOrId.endsWith('.jpg') || coverOrId.endsWith('.png') || coverOrId.endsWith('.jpeg'))) {
      // File path
      coverPath = coverOrId;
      productId = opts.productId || null;
    } else {
      // Product ID — look up preview_path
      const id = Number(coverOrId);
      productId = id;
      const row = db.prepare('SELECT id, preview_path FROM products WHERE id = ?').get(id);
      if (!row || !row.preview_path) return coverDecision(null);
      coverPath = row.preview_path;
    }

    if (!coverPath || !fs.existsSync(coverPath)) {
      return { ...coverDecision(null), reason: 'cover file not found' };
    }

    // AI disabled — skip (never throws, fail-closed)
    if (!ENABLED) {
      return { ...coverDecision(null), reason: 'ai-disabled', productId };
    }

    // Check cache
    if (!opts.force) {
      const hash = sha256(coverPath);
      const existing = latestCoverScore(productId || 0);
      if (existing && existing.hash === hash && ['pass', 'fail'].includes(existing.status || '')) {
        const cached = existing.scores ? safeParse(existing.scores) : null;
        if (cached) {
          return coverDecision({ scores: cached, garbled_text: existing.zero_garbled_text !== 1, critique: existing.critique });
        }
      }
    }

    // Score the cover
    const dataUri = imageToDataUri(coverPath);
    const result = await scoreCoverVariant(dataUri);

    if (!result) {
      persistCoverScore(productId || 0, { overall: 0 }, 'Vision critique unavailable — AI layer off or call failed', {
        status: 'unscored', quality_passed: 0, hash: sha256(coverPath)
      });
      return { ...coverDecision(null), reason: 'critique unavailable', productId };
    }

    const decision = coverDecision(result);
    persistCoverScore(productId || 0, result.scores, result.critique, {
      status: decision.publishAllowed ? 'pass' : 'fail',
      quality_passed: decision.publishAllowed ? 1 : 0,
      hash: sha256(coverPath)
    });

    return { ...decision, productId, coverPath };
  } catch (e) {
    console.error('[COVER_CRITIC] failed:', e.message);
    return { ...coverDecision(null), reason: e.message };
  }
}

// ── REGENERATE-UNTIL-PASS (C3.3) ─────────────────────────────────────────────

const MAX_REGEN_TRIES = 3;

/**
 * Run build → critique until a candidate clears the gate.
 *
 * @param {(attempt:number)=>Promise<string|null>} build  renders ONE candidate
 *        and resolves to its file path (or null when rendering failed).
 * @param {object} opts { maxTries, critique }  critique(path) → verdict with
 *        publishAllowed; defaults to critiqueCover.
 * @returns {Promise<{coverPath:string|null, verdict:object|null, attempts:number}>}
 *
 * Never throws. Only a passing candidate is returned — failed files are never
 * handed back for persistence. Stops early when AI is off, because a retry
 * cannot change a deterministic "unscored" outcome.
 */
async function critiqueUntilPass(build, { maxTries = MAX_REGEN_TRIES, critique = critiqueCover } = {}) {
  let lastVerdict = null;
  let attempts = 0;
  for (let attempt = 1; attempt <= maxTries; attempt++) {
    attempts = attempt;
    let coverPath = null;
    try {
      coverPath = await build(attempt);
    } catch (e) {
      console.error(`[COVER_CRITIC] candidate ${attempt} render failed:`, e.message);
      coverPath = null;
    }
    if (!coverPath || !fs.existsSync(coverPath)) continue;

    const verdict = await critique(coverPath);
    lastVerdict = verdict;
    if (verdict && verdict.publishAllowed) return { coverPath, verdict, attempts };
    if (verdict && verdict.reason === 'ai-disabled') break;
    console.warn(`[COVER_CRITIC] candidate ${attempt}/${maxTries} below gate (score ${verdict ? verdict.quality_score : 'n/a'}) — regenerating`);
  }
  return { coverPath: null, verdict: lastVerdict, attempts };
}

// ── EXPORTS ───────────────────────────────────────────────────────────────────

module.exports = {
  THRESHOLD,
  ENABLED,
  MAX_REGEN_TRIES,
  COVER_CRITIQUE_PROMPT,
  parseCoverCritique,
  coverDecision,
  critiqueCover,
  critiqueUntilPass,
  scoreCoverVariant,
  persistCoverScore,
  latestCoverScore
};
