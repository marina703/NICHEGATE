// ═══════════════════════════════════════════════════════════════════════════
// PRODUCT TYPE REGISTRY — the single source of truth for every product
// category NicheGate can generate. Discovery, draft, SEO, and the file factory
// all read from here, so "extending far and wide" = adding one entry here plus
// (if needed) a builder in the matching generator. Kept additive and safe:
// older types keep their exact keys/labels/prices.
// ═══════════════════════════════════════════════════════════════════════════

// format: 'pdf' | 'xlsx' | 'zip' — what the file factory produces
// buyer: who the product serves (business = service pros, personal = consumers)
// cats: category hints used by discovery.productsForTrend to pick mixes
const TYPES = [
  // ── Business / service-pro documents (core) ──
  { key: 'invoice', label: 'Invoice', emoji: '🧾', price: 12, format: 'pdf', buyer: 'business', cats: ['business'] },
  { key: 'checklist', label: 'Checklist', emoji: '✅', price: 10, format: 'pdf', buyer: 'business', cats: ['business', 'home'] },
  { key: 'spreadsheet', label: 'Pricing Spreadsheet', emoji: '📊', price: 17, format: 'xlsx', buyer: 'business', cats: ['business', 'finance'] },
  { key: 'booking', label: 'Booking Tracker', emoji: '📅', price: 22, format: 'xlsx', buyer: 'business', cats: ['business'] },
  { key: 'social', label: 'Social Pack', emoji: '📱', price: 15, format: 'zip', buyer: 'business', cats: ['business'] },
  { key: 'brand', label: 'Brand Kit', emoji: '🎨', price: 19, format: 'pdf', buyer: 'business', cats: ['business', 'craft'] },
  { key: 'journal', label: 'Guided Journal', emoji: '📓', price: 15, format: 'pdf', buyer: 'personal', cats: ['wellness', 'personal'] },
  { key: 'website', label: 'One-Page Website', emoji: '🌐', price: 24, format: 'pdf', buyer: 'business', cats: ['business', 'tech'] },
  { key: 'decision-matrix', label: 'Decision Matrix', emoji: '⚖️', price: 14, format: 'pdf', buyer: 'business', cats: ['business'] },
  { key: 'roi', label: 'ROI Calculator', emoji: '📈', price: 19, format: 'xlsx', buyer: 'business', cats: ['business', 'finance'] },
  { key: 'tool', label: 'Outcome Tool', emoji: '🧰', price: 15, format: 'pdf', buyer: 'business', cats: ['business'] },

  // ── FAR & WIDE TRANCH 1 — high-demand printables/planning (personal buyers) ──
  // This tranche ships in 50/50 chunks. CHUNK 1 (live): wall-art + worksheet.
  // CHUNK 2 (this): planner + party-printable. Deferred: cut-file (SVG), budget-tracker.
  { key: 'wall-art', label: 'Wall Art Print', emoji: '🖼️', price: 9, format: 'pdf', buyer: 'personal', cats: ['personal', 'home'] },
  { key: 'worksheet', label: 'Learning Worksheet', emoji: '✏️', price: 8, format: 'pdf', buyer: 'personal', cats: ['personal', 'education'] },
  { key: 'planner', label: 'Printable Planner', emoji: '🗓️', price: 12, format: 'pdf', buyer: 'personal', cats: ['personal', 'home', 'wellness'] },
  { key: 'party-printable', label: 'Party Printable', emoji: '🎉', price: 10, format: 'pdf', buyer: 'personal', cats: ['personal', 'events'] },

  // ── PYRO MANUAL-METHOD WORKSHEETS (old-school, fill-in-by-hand) ──
  // Educational reference worksheets for pyrotechnics hobbies/enthusiasts.
  { key: 'pyro-batch', label: 'Batch Mixing Worksheet', emoji: '⚗️', price: 8, format: 'pdf', buyer: 'hobby', cats: ['pyro'] },
  { key: 'pyro-lift-fuse', label: 'Lift & Fuse Worksheet', emoji: '🎆', price: 8, format: 'pdf', buyer: 'hobby', cats: ['pyro'] },
  { key: 'pyro-shoot-log', label: 'Pre-Shoot Checklist & Log', emoji: '🧨', price: 9, format: 'pdf', buyer: 'hobby', cats: ['pyro'] }
];

const byKey = new Map(TYPES.map(t => [t.key, t]));

function getType(key) { return byKey.get(key) || null; }
function getAllTypes() { return TYPES; }
function priceFor(key) { const t = byKey.get(key); return t ? '$' + t.price : '$12'; }
function labelFor(key) { const t = byKey.get(key); return t ? t.label : (key || ''); }
function emojiFor(key) { const t = byKey.get(key); return t ? t.emoji : '🗂️'; }
function formatFor(key) { const t = byKey.get(key); return t ? t.format : 'pdf'; }
function isFormat(key, fmt) { return formatFor(key) === fmt; }

// Discovery hints: given a category string, suggest a spread of types.
const CATEGORY_MIX = {
  business: ['invoice', 'checklist', 'spreadsheet', 'booking', 'roi'],
  finance: ['spreadsheet', 'roi'],
  home: ['wall-art', 'planner', 'checklist'],
  personal: ['journal', 'planner', 'wall-art'],
  wellness: ['journal', 'planner', 'wall-art'],
  craft: ['brand', 'social', 'checklist'],
  tech: ['website', 'spreadsheet', 'social'],
  food: ['checklist', 'spreadsheet', 'booking', 'social'],
  fitness: ['booking', 'checklist', 'spreadsheet', 'social'],
  education: ['worksheet', 'checklist', 'journal'],
  events: ['party-printable', 'social', 'checklist'],
  pyro: ['pyro-batch', 'pyro-lift-fuse', 'pyro-shoot-log', 'checklist'],
  fashion: ['social', 'brand', 'checklist'],
  default: ['checklist', 'invoice', 'spreadsheet']
};

function typesForCategory(cat) {
  const key = (cat || '').toLowerCase();
  if (CATEGORY_MIX[key]) return CATEGORY_MIX[key].slice();
  return CATEGORY_MIX.default.slice();
}

module.exports = {
  TYPES, getAllTypes, getType, priceFor, labelFor, emojiFor, formatFor, isFormat, typesForCategory
};