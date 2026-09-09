// ═══════════════════════════════════════════════════════════════════════════
// SEO ENGINE — generates keyword-optimized titles, descriptions, and tags
// for marketplace listings (Etsy 140-char title / 13 tags, Gumroad title).
// ═══════════════════════════════════════════════════════════════════════════

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
  // Decision-support family (real formulas / printable tools)
  'decision-matrix': ['Decision Matrix', 'Decision Maker', 'Weighted Scoring Tool', 'Decision Template'],
  'comparison':      ['Comparison Tool', 'Compare Options', 'Side-by-Side Comparison', 'Comparison Chart'],
  'cost-benefit':    ['Cost-Benefit Analysis', 'Break-Even Calculator', 'Cost Analysis', 'Benefit Calculator'],
  'roi':             ['ROI Calculator', 'Return on Investment', 'Payback Calculator', 'ROI Template'],
  'risk-matrix':     ['Risk Assessment Matrix', 'Risk Matrix', 'Risk Analysis', 'Risk Template'],
  'decision-tree':   ['Decision Tree', 'Decision Flowchart', 'Decision Guide', 'Decision Path'],
  'selector':        ['Which Is Right For You', 'Decision Quiz', 'Selection Guide', 'Choice Quiz'],
  'swot':            ['SWOT Analysis', 'SWOT Template', 'Strengths Weaknesses', 'SWOT'],
  'priority-matrix': ['Priority Matrix', 'Eisenhower Matrix', 'Task Prioritization', 'Priority Planner']
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

// Build an SEO description with keyword-rich structure
function buildDescription(prof, type, theme) {
  const base = PRODUCT_TERMS[type] || PRODUCT_TERMS.invoice;
  const services = JSON.parse(prof.services || '[]').slice(0, 4);
  const serviceList = services.map(s => s[0]).join(', ');

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
    `Theme: ${theme} | Format: ${formatForType(type)}`,
    `Instant download after purchase.`
  ].join('\n');
}

// XLSX decision tools ship as spreadsheets; PDF decision tools ship as PDFs
function formatForType(type) {
  if (type === 'social') return 'ZIP';
  if (['spreadsheet', 'decision-matrix', 'comparison', 'cost-benefit', 'roi', 'risk-matrix'].includes(type)) return 'XLSX';
  return 'PDF';
}

// Build Etsy tags (max 13, ≤20 chars each)
function buildTags(prof, type) {
  const hashtags = JSON.parse(prof.hashtags || '[]');
  const base = PRODUCT_TERMS[type] || PRODUCT_TERMS.invoice;
  const tags = [];

  // Product type terms
  tags.push(base[0].toLowerCase().substring(0, 20));
  tags.push(base[1].toLowerCase().substring(0, 20));

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

// Full SEO bundle for a product
function generateSEO(prof, type, theme) {
  return {
    title: buildTitle(prof, type),
    shortTitle: buildShortTitle(prof, type),
    description: buildDescription(prof, type, theme),
    tags: buildTags(prof, type)
  };
}

module.exports = { generateSEO, buildTitle, buildDescription, buildTags };
