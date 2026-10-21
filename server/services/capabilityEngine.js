// ═══════════════════════════════════════════════════════════════════════════
// CAPABILITY ENGINE — the factory's self-expansion + escalation loop.
//
// A ~95% autonomous factory must not be boxed in by whatever product types a
// human hard-coded. This module lets the factory:
//   1. PROPOSE + REGISTER new product types at runtime (product_types_dynamic),
//      so the "list" grows on its own when it finds demand worth serving.
//   2. RAISE A CAPABILITY REQUEST when it sees demand it can't serve with the
//      tools/infrastructure it has — and NOTIFY the operator, so the human gets
//      the "we need to be making THIS, but I don't have the tools" message.
//
// Everything is additive and reversible: registering a type never edits the
// hard-coded registry; raising a request never fabricates a capability.
// ═══════════════════════════════════════════════════════════════════════════

const { db } = require('../database');
const notifier = require('./notifier');

const CAPABILITY_VERSION = 'cap-v1';

// Formats the file factory can actually emit today. A proposed type whose
// format is NOT here is the canonical "I don't have the tooling" case → it
// becomes a capability request instead of a silent no-op.
const SUPPORTED_FORMATS = new Set(['pdf', 'xlsx', 'zip', 'html']);

// The fileFactory branches that map a type to a concrete builder. If a proposed
// type's format is supported but no branch renders it, we still register it and
// record which builder it needs (so the request is specific and actionable).
const BUILDER_FOR_FORMAT = {
  pdf: 'pdfGenerator.buildChecklistHTML (or a type-specific buildX HTML)',
  xlsx: 'xlsxGenerator.generateXLSX',
  zip: 'zipGenerator.createSocialPack (or a type-specific pack)',
  html: 'webToolGenerator.generateWebToolFile',
};

// ── DYNAMIC TYPE REGISTRY ───────────────────────────────────────────────────

// Merge the hard-coded registry with any runtime-registered types. The dynamic
// set can ADD new keys and OVERRIDE hard-coded ones (source='factory' wins over
// the static file only for keys it explicitly claims), but never removes keys —
// old types keep working exactly as before.
function getAllTypes() {
  const pt = require('./productTypes');
  const map = new Map(pt.TYPES.map(t => [t.key, { ...t, source: 'static' }]));
  for (const row of db.prepare("SELECT * FROM product_types_dynamic WHERE status = 'active'").all()) {
    const cats = safeParse(row.cats);
    map.set(row.key, {
      key: row.key,
      label: row.label,
      emoji: row.emoji || '🗂️',
      price: row.price ?? 12,
      format: row.format,
      buyer: row.buyer || 'business',
      cats: cats || ['business'],
      builder: row.builder || null,
      source: 'dynamic',
      reason: row.reason || null,
    });
  }
  return Array.from(map.values());
}

function getType(key) {
  return getAllTypes().find(t => t.key === key) || null;
}

// Validate a proposed type spec. Returns { ok, error, clean } where clean is the
// sanitized record ready to store. Validation is strict so a hallucinated type
// can never silently enter the registry.
function validateTypeSpec(spec) {
  if (!spec || typeof spec !== 'object') return { ok: false, error: 'spec is required' };
  const key = String(spec.key || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  if (!key || key.length < 2 || key.length > 40) {
    return { ok: false, error: 'key must be 2-40 chars, lowercase letters/digits/hyphens' };
  }
  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(key)) {
    return { ok: false, error: 'key must be kebab-case (e.g. "permit-checklist")' };
  }
  const label = String(spec.label || '').trim();
  if (!label || label.length > 80) return { ok: false, error: 'label is required (≤80 chars)' };
  const format = String(spec.format || '').toLowerCase();
  if (!SUPPORTED_FORMATS.has(format)) {
    return { ok: false, error: `format "${format}" is not supported by the file factory` };
  }
  const buyers = new Set(['business', 'personal', 'hobby']);
  const buyer = String(spec.buyer || 'business').toLowerCase();
  if (!buyers.has(buyer)) return { ok: false, error: `buyer must be one of ${[...buyers].join(', ')}` };
  const price = parseInt(spec.price, 10);
  if (!Number.isFinite(price) || price < 1 || price > 999) {
    return { ok: false, error: 'price must be an integer 1-999' };
  }
  const cats = Array.isArray(spec.cats)
    ? spec.cats.map(c => String(c).toLowerCase().slice(0, 24)).filter(Boolean).slice(0, 8)
    : [buyer];
  return {
    ok: true,
    clean: {
      key, label,
      emoji: String(spec.emoji || '🗂️').slice(0, 8),
      price, format, buyer,
      cats,
      builder: spec.builder ? String(spec.builder).slice(0, 200) : BUILDER_FOR_FORMAT[format],
      reason: spec.reason ? String(spec.reason).slice(0, 500) : null,
    },
  };
}

// Register a new product type (or override an existing dynamic one). Idempotent
// on key. Returns { ok, key, registered, alreadyExisted }.
function registerType(spec, source = 'factory') {
  const v = validateTypeSpec(spec);
  if (!v.ok) return { ok: false, error: v.error };
  const c = v.clean;
  const existing = db.prepare('SELECT key, status FROM product_types_dynamic WHERE key = ?').get(c.key);
  if (existing) {
    db.prepare(
      `UPDATE product_types_dynamic SET label=?, emoji=?, price=?, format=?, buyer=?, cats=?, builder=?, reason=?, status='active', updated_at=CURRENT_TIMESTAMP WHERE key=?`
    ).run(c.label, c.emoji, c.price, c.format, c.buyer, JSON.stringify(c.cats), c.builder, c.reason, c.key);
    return { ok: true, key: c.key, registered: true, alreadyExisted: true };
  }
  db.prepare(
    `INSERT INTO product_types_dynamic (key, label, emoji, price, format, buyer, cats, builder, source, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(c.key, c.label, c.emoji, c.price, c.format, c.buyer, JSON.stringify(c.cats), c.builder, source, c.reason);
  db.prepare("INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)")
    .run('type_registered', `Dynamic product type registered: ${c.key} (${c.format}) by ${source}`, 'success');
  return { ok: true, key: c.key, registered: true, alreadyExisted: false };
}

function listDynamicTypes() {
  return db.prepare('SELECT * FROM product_types_dynamic ORDER BY created_at DESC').all();
}

// ── CAPABILITY REQUESTS (the "tell the human" loop) ─────────────────────────

// When the factory wants to serve demand it can't (unsupported format, missing
// builder, missing integration/API, missing knowledge), it records a request and
// pings the operator. `notify` is injected so this stays hermetic in tests; in
// production it defaults to the Discord webhook.
async function requestCapability({ kind, title, detail, needed, proposal, notify }) {
  kind = String(kind || 'other').toLowerCase();
  const allowed = new Set(['type', 'builder', 'integration', 'tool', 'knowledge', 'other']);
  if (!allowed.has(kind)) kind = 'other';
  title = String(title || '').trim().slice(0, 160);
  if (!title) return { ok: false, error: 'title is required' };
  detail = detail ? String(detail).slice(0, 2000) : null;
  needed = needed ? String(needed).slice(0, 500) : null;
  const proposalJson = proposal ? JSON.stringify(proposal) : null;

  const res = db.prepare(
    `INSERT INTO capability_requests (kind, title, detail, needed, proposal, status, notified)
     VALUES (?, ?, ?, ?, ?, 'open', ?)`
  ).run(kind, title, detail, needed, proposalJson, 0);
  const id = res.lastInsertRowid;

  // Deliver the ping. If delivery fails we still keep the request (status open,
  // notified=0) so nothing is lost and the operator can see it in the console.
  let delivered = false;
  const notifyFn = typeof notify === 'function' ? notify : defaultNotify;
  try {
    delivered = await notifyFn({ id, kind, title, detail, needed });
  } catch (e) { /* report as undelivered */ }
  db.prepare('UPDATE capability_requests SET notified = ? WHERE id = ?').run(delivered ? 1 : 0, id);

  db.prepare("INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)")
    .run('capability_request', `Capability request #${id}: ${title} (${kind})`, delivered ? 'success' : 'info');

  return { ok: true, id, delivered };
}

// The default operator ping: Discord (primary) + email mirror if configured.
// Format is a capability-specific alert so the operator knows exactly what the
// factory needs and why.
async function defaultNotify({ kind, title, detail, needed }) {
  const verb = {
    type: 'wants to make a NEW product type',
    builder: 'needs a new file builder',
    integration: 'needs a new integration/API',
    tool: 'needs a new tool',
    knowledge: 'needs research/knowledge',
    other: 'needs something',
  }[kind] || 'needs something';
  const data = {
    kind,
    title,
    message: `🧠 **Factory escalation** — the factory ${verb}: "${title}". ${detail ? 'Detail: ' + detail : ''}${needed ? ' Needed: ' + needed : ''}`,
  };
  const text = notifier.formatAlert('capability', data);
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  const [discord] = await Promise.all([
    webhook ? notifier.sendDiscord(webhook, text) : Promise.resolve(false),
    notifier.sendAlertEmail('capability', data),
  ]);
  return discord;
}

function listCapabilityRequests({ status = 'open' } = {}) {
  if (status && status !== 'all') {
    return db.prepare('SELECT * FROM capability_requests WHERE status = ? ORDER BY created_at DESC').all(status);
  }
  return db.prepare('SELECT * FROM capability_requests ORDER BY created_at DESC').all();
}

function getCapabilityRequest(id) {
  return db.prepare('SELECT * FROM capability_requests WHERE id = ?').get(id);
}

// Approve a capability request. If it carries a proposal (a new type spec),
// approving ALSO registers that type so the factory can immediately act on it.
function approveCapabilityRequest(id, resolvedBy = 'operator') {
  const row = getCapabilityRequest(id);
  if (!row) return { ok: false, error: 'capability request not found' };
  if (row.status !== 'open') return { ok: false, error: `request is ${row.status}, not open` };
  let registeredType = null;
  try {
    const proposal = row.proposal ? JSON.parse(row.proposal) : null;
    if (proposal && proposal.type) registeredType = registerType(proposal.type, 'approved-request');
  } catch (e) { /* proposal may be malformed — still approve the request */ }
  db.prepare(
    `UPDATE capability_requests SET status='approved', resolved_by=?, resolved_at=CURRENT_TIMESTAMP WHERE id=?`
  ).run(resolvedBy, id);
  db.prepare("INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)")
    .run('capability_approved', `Capability request #${id} approved by ${resolvedBy}` + (registeredType ? ` → registered type ${registeredType.key}` : ''), 'success');
  return { ok: true, request: getCapabilityRequest(id), registeredType };
}

function rejectCapabilityRequest(id, resolvedBy = 'operator') {
  const row = getCapabilityRequest(id);
  if (!row) return { ok: false, error: 'capability request not found' };
  if (row.status !== 'open') return { ok: false, error: `request is ${row.status}, not open` };
  db.prepare(
    `UPDATE capability_requests SET status='rejected', resolved_by=?, resolved_at=CURRENT_TIMESTAMP WHERE id=?`
  ).run(resolvedBy, id);
  return { ok: true, request: getCapabilityRequest(id) };
}

function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }

module.exports = {
  CAPABILITY_VERSION,
  SUPPORTED_FORMATS,
  getAllTypes,
  getType,
  validateTypeSpec,
  registerType,
  listDynamicTypes,
  requestCapability,
  defaultNotify,
  listCapabilityRequests,
  getCapabilityRequest,
  approveCapabilityRequest,
  rejectCapabilityRequest,
};
