// ═══════════════════════════════════════════════════════════════════════════
// SEO ENGINE — generates keyword-optimized titles, descriptions, and tags
// for marketplace listings (Etsy 140-char title / 13 tags, Gumroad title).
// ═══════════════════════════════════════════════════════════════════════════

const demandSignals = require('./demandSignals');

const PRODUCT_TERMS = {
  invoice:    ['Invoice Template', 'Editable Invoice', 'Service Invoice', 'Invoice'],
  website:    ['Website Template', 'One-Page Website', 'Business Website', 'Website'],
  social:     ['Social Media Templates', 'Instagram Templates', 'Content Pack', 'Social Pack'],
  brand:      ['Brand Kit', 'Brand Identity', 'Logo Template', 'Branding Package'],
  spreadsheet:['Spreadsheet Template', 'Calculator', 'Pricing Tool', 'Excel Template'],
  booking:    ['Booking Form', 'Appointment Template', 'Scheduling Form', 'Booking Template'],
  checklist:  ['Checklist Template', 'Service Checklist', 'Quality Checklist', 'Checklist'],
  journal:    ['Journal Template', 'Recovery Journal', 'Guided Journal', 'Journal'],
  bundle:     ['Complete Toolkit', 'Template Bundle', 'Business Toolkit', 'Bundle'],
  leadmagnet: ['Free Template Pack', 'Starter Pack', 'Free Templates', 'Freebie'],
  tool:       ['Business Tool', 'Decision Framework', 'Outcome Tool', 'Business Framework'],
  'wall-art': ['Wall Art Print', 'Printable Wall Art', 'Quote Print', 'Art Printable'],
  worksheet:  ['Worksheet Printable', 'Learning Worksheet', 'Practice Sheet', 'Worksheet'],
  planner:    ['Printable Planner', 'Weekly Planner', 'Digital Planner', 'Planner'],
  'party-printable': ['Party Printable', 'Invitation Template', 'Party Printables', 'Printable Invitation'],
  'pyro-batch': ['Batch Mixing Worksheet', 'Pyro Batch Sheet', 'Mixing Worksheet', 'Pyro Worksheet'],
  'pyro-lift-fuse': ['Lift & Fuse Worksheet', 'Pyro Lift Charge', 'Fuse Cut Sheet', 'Pyro Worksheet'],
  'pyro-shoot-log': ['Pre-Shoot Checklist', 'Launch Log', 'Pyro Safety Checklist', 'Pyro Log']
};

const TIER_TERMS = {
  'high-upside': ['Premium', 'Professional', 'Modern', 'Clean'],
  'safe':        ['Professional', 'Easy to Use', 'Time-Saving', 'Streamlined'],
  'passion':     ['Guided', 'Meaningful', 'Supportive', 'Personal'],
  'trend':       ['Trending', 'Viral', 'Hot', 'Must-Have']
};

// Build an Etsy-optimized title (≤140 chars) with keyword front-loading
function buildTitle(prof, type) {
  const base = PRODUCT_TERMS[type] || PRODUCT_TERMS.invoice;
  const tier = TIER_TERMS[prof.tier] || ['Professional'];
  const name = prof.name;
  const core = `${name} ${base[0]}`;

  // Front-load the strongest keyword, then add qualifiers
  const candidates = [
    core,
    `${tier[0]} ${core}`,
    `${core} | ${base[1]}`,
    `${name} ${base[1]} — ${tier[1]}`,
    `${tier[0]} ${name} ${base[2]}`
  ];

  // Return first candidate that fits within 140 chars (Etsy limit)
  for (const c of candidates) {
    if (c.length <= 140) return c;
  }
  return core.substring(0, 140);
}

// Build a Gumroad-friendly title (shorter, cleaner)
function buildShortTitle(prof, type) {
  const base = PRODUCT_TERMS[type] || PRODUCT_TERMS.invoice;
  if (type === 'bundle') return `${base[0]} — ${prof.name}`.substring(0, 120);
  if (type === 'leadmagnet') return base[0];
  return `${prof.name} ${base[0]}`.substring(0, 120);
}

// Legacy profession rows store plain text ("#tag #tag2" / "a, b, c") where new
// rows store JSON — and one malformed value used to throw (500s on /api/console/bi).
// Parse defensively: JSON arrays win, plain text falls back to splitting.
function safeJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === '') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return String(value).split(/[,#]/).map(s => s.trim()).filter(Boolean);
  }
}

// Build an SEO description with keyword-rich structure
function buildDescription(prof, type, theme) {
  const base = PRODUCT_TERMS[type] || PRODUCT_TERMS.invoice;
  const services = safeJsonArray(prof.services).slice(0, 4);
  const serviceList = services.map(s => (Array.isArray(s) ? s[0] : s)).filter(Boolean).join(', ');


  return [
    `${prof.name} ${base[0]} — a ${TIER_TERMS[prof.tier]?.[0] || 'professional'} ${base[1].toLowerCase()} designed to make your business look elite.`,
    ``,
    `WHAT'S INCLUDED:`,
    `• ${base[2]} with a clean, modern layout`,
    `• Fully editable — customize colors, text, and fonts`,
    `• Instant download, use forever`,
    `• Commercial license for unlimited client projects`,
    ``,
    `PERFECT FOR: ${prof.name} professionals, ${serviceList}`,
    ``,
    `Theme: ${theme} | Format: ${type === 'spreadsheet' ? 'XLSX' : type === 'social' ? 'ZIP' : 'PDF'}`,
    `Instant download after purchase.`
  ].join('\n');
}

// Build Etsy tags (max 13, ≤20 chars each). Harvested marketplace demand
// (demandSignals) outranks our own hashtags — real shopper language wins.
function buildTags(prof, type, demandTags) {
  const hashtags = safeJsonArray(prof.hashtags);
  const base = PRODUCT_TERMS[type] || PRODUCT_TERMS.invoice;
  const tags = [];

  // Product type terms
  tags.push(base[0].toLowerCase().substring(0, 20));
  tags.push(base[1].toLowerCase().substring(0, 20));

  // Live demand terms (explicit arg, else whatever the last harvest cached)
  const demand = (demandTags && demandTags.length)
    ? demandTags
    : demandSignals.getCachedDemandTags((prof && prof.name) || '');
  for (const d of demand) {
    const clean = String(d).trim().toLowerCase().substring(0, 20);
    if (clean.length >= 3 && !tags.includes(clean)) tags.push(clean);
    if (tags.length >= 11) break; // leave ≥2 slots for hashtags/fillers
  }

  // Profession hashtags (strip #, truncate to 20 chars)
  for (const h of hashtags) {
    const clean = h.replace('#', '').substring(0, 20);
    if (clean.length >= 3 && !tags.includes(clean)) tags.push(clean);
    if (tags.length >= 13) break;
  }

  // Fill with generic high-value tags
  const fillers = ['digital download', 'printable', 'template', 'editable', 'instant download', 'small business', 'etsy', 'customizable'];
  for (const f of fillers) {
    if (tags.length >= 13) break;
    if (!tags.includes(f)) tags.push(f);
  }

  return tags.slice(0, 13);
}

// Full SEO bundle for a product. demandTags (optional) = harvested marketplace
// demand; omitted → the demandSignals cache is consulted instead.
function generateSEO(prof, type, theme, demandTags) {
  prof = prof || { name: 'Small Business', tier: 'safe' };
  return {
    title: buildTitle(prof, type),
    shortTitle: buildShortTitle(prof, type),
    description: buildDescription(prof, type, theme),
    tags: buildTags(prof, type, demandTags)
  };
}

module.exports = { generateSEO, buildTitle, buildDescription, buildTags, safeJsonArray };
