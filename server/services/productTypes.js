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
  { key: 'pyro-shoot-log', label: 'Pre-Shoot Checklist & Log', emoji: '🧨', price: 9, format: 'pdf', buyer: 'hobby', cats: ['pyro'] },
  // ═══════════════════════════════════════════════════════════════════════════
  // INNOVATIVE PRODUCT TYPES — high-value, low-competition, genuinely useful.
  // These are what separate NicheGate from every other template shop.
  // ═══════════════════════════════════════════════════════════════════════════

  // ── DATA-DRIVEN GUIDES (highest value, hard to copy) ──
  { key: 'playbook', label: 'Niche Business Playbook', emoji: '📘', price: 24, format: 'pdf', buyer: 'business', cats: ['business'] },
  { key: 'pricing-bible', label: 'Pricing Bible', emoji: '💰', price: 19, format: 'pdf', buyer: 'business', cats: ['business', 'finance'] },
  { key: 'seasonal-calendar', label: 'Seasonal Activity Calendar', emoji: '📅', price: 12, format: 'pdf', buyer: 'business', cats: ['business', 'home'] },
  { key: 'email-scripts', label: 'Client Email Script Kit', emoji: '✉️', price: 15, format: 'pdf', buyer: 'business', cats: ['business'] },
  { key: 'certification-guide', label: 'Certification Roadmap', emoji: '🎓', price: 17, format: 'pdf', buyer: 'business', cats: ['business', 'education'] },

  // ── OPERATIONAL TOOLS (medium value, unique) ──
  { key: 'sop-package', label: 'SOP Procedure Package', emoji: '📋', price: 19, format: 'pdf', buyer: 'business', cats: ['business'] },
  { key: 'equipment-guide', label: 'Equipment Buying Guide', emoji: '🔧', price: 14, format: 'pdf', buyer: 'business', cats: ['business'] },
  { key: 'compliance-checklist', label: 'Compliance & Permits Guide', emoji: '⚖️', price: 15, format: 'pdf', buyer: 'business', cats: ['business'] },
  { key: 'first-year-roadmap', label: 'First-Year Business Roadmap', emoji: '🗺️', price: 17, format: 'pdf', buyer: 'business', cats: ['business'] },
  { key: 'client-onboarding', label: 'Client Onboarding Kit', emoji: '🤝', price: 19, format: 'zip', buyer: 'business', cats: ['business'] },

  // ── PREMIUM KITS (highest value, bundled) ──
  { key: 'business-in-a-box', label: 'Business-in-a-Box Starter Kit', emoji: '🚀', price: 49, format: 'zip', buyer: 'business', cats: ['business'] },
  { key: 'marketing-kit', label: 'Social Media Marketing Kit', emoji: '📣', price: 19, format: 'zip', buyer: 'business', cats: ['business'] },
  { key: 'prompt-library', label: 'AI Prompt Library', emoji: '🤖', price: 12, format: 'pdf', buyer: 'business', cats: ['business', 'tech'] },

  // ── NICHE-SPECIFIC (high value, low competition) ──
  { key: 'client-emails', label: 'Client Communication Templates', emoji: '💌', price: 14, format: 'pdf', buyer: 'business', cats: ['business'] },
  { key: 'profit-calculator', label: 'Profit & Pricing Calculator', emoji: '🧮', price: 15, format: 'xlsx', buyer: 'business', cats: ['business', 'finance'] },

  // ── INTERACTIVE WEB-TOOL PRODUCTS (Horizon stretch: highest value, interactive) ──
  { key: 'interactive-tool', label: 'Interactive Web Calculator', emoji: '⚡', price: 29, format: 'html', buyer: 'business', cats: ['business', 'tech', 'finance'] },

  // ── RECOVERY / 12-STEP TRANSCHE (personal, high-empathy printables) ──
  // Peer-support recovery is non-commercial, but the PEOPLE in recovery buy
  // personal tools: daily journals, affirmation labels, nutrition guides and
  // meeting-facilitation cards. These are niche-specific, genuinely useful,
  // and carry the "Just for Today" / Serenity Prayer language the programs use.
  { key: 'recovery-journal', label: '"Just for Today" Recovery Journal', emoji: '📔', price: 15, format: 'pdf', buyer: 'personal', cats: ['wellness', 'recovery'] },
  { key: 'affirmation-labels', label: 'Recovery Affirmation Labels', emoji: '🏷️', price: 8, format: 'pdf', buyer: 'personal', cats: ['wellness', 'recovery'] },
  { key: 'recovery-nutrition', label: 'Recovery Cleanse & Nutrition Guide', emoji: '🥗', price: 14, format: 'pdf', buyer: 'personal', cats: ['wellness', 'recovery'] },
  { key: 'meeting-flashcards', label: 'Meeting Facilitator Flashcards', emoji: '🗂️', price: 12, format: 'pdf', buyer: 'personal', cats: ['wellness', 'recovery'] },
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
  innovative: ['playbook', 'pricing-bible', 'sop-package', 'business-in-a-box', 'first-year-roadmap'],
  data: ['playbook', 'pricing-bible', 'certification-guide', 'equipment-guide', 'compliance-checklist'],
  premium: ['business-in-a-box', 'client-onboarding', 'marketing-kit', 'sop-package'],
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