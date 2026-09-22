// ═══════════════════════════════════════════════════════════════════════════
// PRODUCT DRAFT — single source of truth for inserting a draft product row
// with a consistent theme, type, price, and validation. Used by the auto-cycle,
// discovery, freshness pass, seasonal engine, and the manual automation endpoint.
// ═══════════════════════════════════════════════════════════════════════════

const { db } = require('../database');
const design = require('./themes');
const { validateProductDraft } = require('./pipelineSchemas');

const TYPE_PRICES = {
  invoice: '$12', checklist: '$10', spreadsheet: '$17', booking: '$22', social: '$15',
  journal: '$15', brand: '$19', website: '$24', 'decision-matrix': '$14', roi: '$19',
  bundle: '$29', leadmagnet: '$0', pricing: '$17', inventory: '$14', 'shot-chart': '$15', pyro: '$15',
  'wall-art': '$9', worksheet: '$8', planner: '$12', 'party-printable': '$10',
  'pyro-batch': '$8', 'pyro-lift-fuse': '$8', 'pyro-shoot-log': '$9'
};

function priceFor(type) {
  return TYPE_PRICES[type] || '$12';
}

// Insert a new draft for a profession+type (dedup: skips if an active draft or
// pending-review row already exists). Returns the new product id, or null when
// skipped. Theme resolution uses the design engine unless an explicit theme is
// passed, so every generator produces on-brand output consistently.
function draftProduct(prof, type, opts = {}) {
  const existing = db.prepare(
    `SELECT id FROM products WHERE profession_id = ? AND type = ? AND status IN ('draft','pending-review') LIMIT 1`
  ).get(prof.id, type);
  if (existing) return null;

  const draft = validateProductDraft({
    profession_id: prof.id,
    name: opts.name || `${prof.name} ${type.charAt(0).toUpperCase() + type.slice(1)}`,
    type,
    price: opts.price || priceFor(type),
    status: opts.status || 'draft',
    theme: opts.theme || design.recommendTheme(prof)
  });

  const ins = db.prepare(
    `INSERT INTO products (profession_id, name, type, price, status, theme, html_content, origin, brief)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(draft.profession_id, draft.name, draft.type, draft.price, draft.status, draft.theme, opts.html_content || '<!-- auto-generated -->',
    opts.origin || 'engine',
    opts.brief ? String(opts.brief).slice(0, 2000) : null);

  return ins.lastInsertRowid;
}

module.exports = { draftProduct, priceFor, TYPE_PRICES };
