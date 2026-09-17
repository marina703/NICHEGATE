// Lightweight payload validators between pipeline stages (no external deps).

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function requireString(obj, key, opts = {}) {
  const v = obj[key];
  if (typeof v !== 'string' || !v.trim()) {
    if (opts.optional) return null;
    throw new Error(`Missing string field: ${key}`);
  }
  if (opts.max && v.length > opts.max) throw new Error(`Field ${key} exceeds ${opts.max} chars`);
  return v.trim();
}

function validateTrendCandidate(input) {
  if (!isPlainObject(input)) throw new Error('TrendCandidate must be an object');
  const name = requireString(input, 'name', { max: 120 });
  const phase = input.phase || 'emerging';
  const velocity = String(input.velocity || '+80%');
  const window = Number(input.window || input.window_days || 30);
  const est_revenue = String(input.est_revenue || input.estRevenue || '$2k-6k');
  const why = String(input.why || '');
  if (!Number.isFinite(window) || window < 1) throw new Error('TrendCandidate.window invalid');
  return {
    name,
    emoji: input.emoji || '🔎',
    phase,
    velocity,
    window: Math.round(window),
    est_revenue,
    why,
    source: input.source || null
  };
}

function validateVetResult(input) {
  if (!isPlainObject(input)) throw new Error('VetResult must be an object');
  const score = Number(input.score);
  if (!Number.isFinite(score)) throw new Error('VetResult.score invalid');
  const verdict = String(input.verdict || '').toUpperCase();
  if (!['ACTIVATE', 'WATCH', 'SKIP'].includes(verdict)) throw new Error('VetResult.verdict invalid');
  return {
    score: Math.round(score),
    grade: input.grade || null,
    verdict,
    signals: isPlainObject(input.signals) ? input.signals : {}
  };
}

const PRODUCT_TYPES = new Set([
  'invoice', 'checklist', 'spreadsheet', 'booking', 'social', 'journal',
  'brand', 'website', 'decision-matrix', 'roi', 'bundle', 'leadmagnet',
  'pricing', 'inventory', 'shot-chart', 'pyro', 'tool', 'wall-art', 'worksheet'
]);

function validatePrice(price) {
  const s = String(price == null ? '' : price).trim();
  if (!s) return '$12';
  if (!/^\$?\d+(?:\.\d{1,2})?$/.test(s)) throw new Error(`ProductDraft.price invalid: ${s}`);
  return s.startsWith('$') ? s : '$' + s;
}

function validateProductDraft(input) {
  if (!isPlainObject(input)) throw new Error('ProductDraft must be an object');
  const profession_id = Number(input.profession_id);
  if (!Number.isInteger(profession_id) || profession_id < 1) throw new Error('ProductDraft.profession_id invalid');
  const name = requireString(input, 'name', { max: 200 });
  const type = requireString(input, 'type', { max: 40 }).toLowerCase();
  if (!PRODUCT_TYPES.has(type)) throw new Error(`ProductDraft.type unsupported: ${type}`);
  const price = validatePrice(input.price);
  return {
    profession_id,
    name,
    type,
    price,
    status: input.status || 'draft',
    theme: input.theme || 'Onyx Volt',
    html_content: input.html_content || '<!-- auto-generated -->'
  };
}

function validatePublishResult(input) {
  if (!isPlainObject(input)) throw new Error('PublishResult must be an object');
  const platform = requireString(input, 'platform', { max: 40 });
  const listingId = input.listingId != null
    ? String(input.listingId)
    : (input.listing_id != null ? String(input.listing_id) : '');
  if (!listingId) throw new Error('PublishResult.listingId required');
  return { platform, listingId, url: input.url || null };
}

module.exports = {
  validateTrendCandidate,
  validateVetResult,
  validateProductDraft,
  validatePublishResult,
  validatePrice,
  isPlainObject,
  PRODUCT_TYPES
};
