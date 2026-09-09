// ═══════════════════════════════════════════════════════════════════════════
// DECISION ENGINE — "decision support" products. The highest-converting digital
// product category in 2026: tools bought at the exact moment a buyer is about
// to make an expensive mistake. The edge over the generic Etsy worksheets:
//   1. SPECIFICITY — every tool targets ONE concrete, costly decision per niche
//      ("repair vs replace my roof"), not "make better decisions".
//   2. IMPLEMENTATION — the spreadsheets contain REAL formulas that auto-score,
//      auto-total, and auto-recommend a winner. Not a blank grid.
//   3. DUAL AUDIENCE — tools serve both the professional (close the sale) and
//      their customer (decide without a sales call).
// ═══════════════════════════════════════════════════════════════════════════

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const pdfGen = require('./pdfGenerator');
const { coerceFormulas } = require('./xlsxGenerator');
const { db } = require('../database');

const OUTPUT_DIR = path.join(__dirname, '..', '..', 'generated');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ── TYPE REGISTRY ──
const DECISION_TYPES = {
  'decision-matrix': { label: 'Decision Matrix', format: 'xlsx', price: '$19', blurb: 'Weighted scoring that auto-recommends the winner' },
  'comparison':      { label: 'Comparison Tool', format: 'xlsx', price: '$17', blurb: 'Side-by-side scoring across every option' },
  'cost-benefit':    { label: 'Cost-Benefit Analysis', format: 'xlsx', price: '$19', blurb: 'Net benefit + break-even, auto-calculated' },
  'roi':             { label: 'ROI Calculator', format: 'xlsx', price: '$22', blurb: 'Payback period + return %, live formulas' },
  'risk-matrix':     { label: 'Risk Assessment Matrix', format: 'xlsx', price: '$19', blurb: 'Likelihood × impact with auto-priority' },
  'decision-tree':   { label: 'Decision Tree', format: 'pdf', price: '$15', blurb: 'Printable yes/no path to a confident call' },
  'selector':        { label: 'Which Is Right For You?', format: 'pdf', price: '$17', blurb: 'Scored quiz that maps you to the best option' },
  'swot':            { label: 'SWOT Analysis', format: 'pdf', price: '$12', blurb: 'Strengths / Weaknesses / Opportunities / Threats' },
  'priority-matrix': { label: 'Priority Matrix', format: 'pdf', price: '$12', blurb: 'Impact × effort 2×2 to decide what to do first' }
};

// ── SCENARIO LIBRARY — the "expensive mistake" moment per niche ──
// Each scenario: question, context, options[], criteria[] (weights sum to 100),
// features[] (for comparison), and a selector quiz for the 'selector' type.
const RECOVERY_SELECTOR = {
  key: 'which-recovery-program',
  question: 'Which recovery program is right for you?',
  context: 'The wrong program is the most common reason people quit early. This scores the six major paths against your own beliefs and needs.',
  options: [
    { name: 'AA / 12-Step', blurb: 'Spiritual, sponsor-led, meetings' },
    { name: 'SMART Recovery', blurb: 'Science-based, CBT tools, self-directed' },
    { name: 'Refuge Recovery', blurb: 'Buddhist, meditation, mindfulness' },
    { name: 'Women for Sobriety', blurb: 'Women-only, affirmations, empowerment' },
    { name: 'Secular (LifeRing/SOS)', blurb: 'Non-spiritual, self-empowered' },
    { name: 'Faith-Based (Biblical)', blurb: 'Christian, scripture, prayer' }
  ],
  criteria: [
    { name: 'Spiritual / higher-power fit', weight: 25 },
    { name: 'Structure & step-work', weight: 20 },
    { name: 'Community & meetings', weight: 20 },
    { name: 'Science / CBT approach', weight: 20 },
    { name: 'Cost & accessibility', weight: 15 }
  ],
  features: ['Spiritual basis', 'Structure', 'Meeting style', 'Cost', 'Best for'],
  quiz: [
    { q: 'A higher power or spiritual framework is important to my recovery.', high: 'Faith-Based (Biblical)', low: 'Secular (LifeRing/SOS)' },
    { q: 'I want a clear, step-by-step structure with a sponsor.', high: 'AA / 12-Step', low: 'SMART Recovery' },
    { q: 'I prefer a science-based, self-directed approach with CBT tools.', high: 'SMART Recovery', low: 'AA / 12-Step' },
    { q: 'Meditation and mindfulness resonate with me.', high: 'Refuge Recovery', low: 'SMART Recovery' },
    { q: 'A women-only, affirmation-based space feels safest.', high: 'Women for Sobriety', low: 'Secular (LifeRing/SOS)' },
    { q: 'I want scripture and prayer woven into my recovery.', high: 'Faith-Based (Biblical)', low: 'Secular (LifeRing/SOS)' }
  ]
};

const SCENARIOS = {
  'roofing': [{
    key: 'repair-vs-replace', question: 'Repair, patch, or replace your roof?',
    context: 'You found a leak. Before you spend thousands, score the three paths so you don\'t overpay — or under-fix.',
    options: [{ name: 'Patch the leak', blurb: 'Lowest cost, shortest fix' }, { name: 'Partial re-roof', blurb: 'Replace the worst section' }, { name: 'Full replacement', blurb: 'New roof, full warranty' }],
    criteria: [{ name: 'Upfront cost (lower = better)', weight: 25 }, { name: 'Years of protection gained', weight: 30 }, { name: 'Home resale value', weight: 20 }, { name: 'Risk of future leaks (lower = better)', weight: 15 }, { name: 'Disruption (lower = better)', weight: 10 }],
    features: ['Typical cost', 'Lifespan gained', 'Warranty', 'Disruption', 'Best when']
  }],
  'hvac': [{
    key: 'repair-vs-replace', question: 'Repair or replace your AC / furnace?',
    context: 'The unit is acting up. The 50% rule: if repair costs exceed half the replacement price, replace. This tool does that math for you.',
    options: [{ name: 'Repair it', blurb: 'Cheapest now' }, { name: 'Repair + tune-up', blurb: 'Fix and extend life' }, { name: 'Replace unit', blurb: 'New efficiency + warranty' }],
    criteria: [{ name: 'Upfront cost (lower = better)', weight: 25 }, { name: 'Remaining lifespan', weight: 25 }, { name: 'Energy savings', weight: 20 }, { name: 'Repair vs 50% rule', weight: 20 }, { name: 'Comfort / reliability', weight: 10 }],
    features: ['Cost', 'Lifespan', 'Efficiency (SEER)', 'Warranty', 'Best when']
  }],
  'appliance-repair': [{
    key: 'repair-vs-replace', question: 'Repair or replace the appliance?',
    context: 'The 50% rule for appliances: if the repair is more than half the cost of a new unit, replace. Score it before you call the tech.',
    options: [{ name: 'Repair', blurb: 'Cheapest now' }, { name: 'Repair + warranty', blurb: 'Fix with coverage' }, { name: 'Replace', blurb: 'New unit, new warranty' }],
    criteria: [{ name: 'Repair cost vs 50% rule', weight: 30 }, { name: 'Age of appliance', weight: 25 }, { name: 'Energy savings', weight: 15 }, { name: 'Reliability history', weight: 15 }, { name: 'Replacement cost', weight: 15 }],
    features: ['Repair cost', 'Appliance age', 'New-unit cost', 'Energy savings', 'Best when']
  }],
  'drone-surveying': [{
    key: 'which-drone', question: 'Which drone should you buy?',
    context: 'The wrong drone costs you jobs. Score budget vs pro vs enterprise against the work you actually book.',
    options: [{ name: 'Entry (sub-$1k)', blurb: 'Hobby + light jobs' }, { name: 'Prosumer ($1k–3k)', blurb: 'Real estate + inspection' }, { name: 'Enterprise ($3k+)', blurb: 'Mapping + thermal' }],
    criteria: [{ name: 'Camera / sensor quality', weight: 25 }, { name: 'Flight time & range', weight: 20 }, { name: 'Upfront cost (lower = better)', weight: 20 }, { name: 'Mapping / thermal capability', weight: 20 }, { name: 'Regulatory fit (Part 107)', weight: 15 }],
    features: ['Price', 'Camera', 'Flight time', 'Thermal/mapping', 'Best for']
  }],
  'mobile-notary': [{
    key: 'which-service', question: 'Which notary service should you lead with?',
    context: 'Loan signing pays more but needs certification + E&O. General notary is easier to start. Score where to focus first.',
    options: [{ name: 'General notary', blurb: 'Fast start, lower pay' }, { name: 'Loan signing agent', blurb: 'Higher pay, more setup' }, { name: 'Both (hybrid)', blurb: 'Diversify from day one' }],
    criteria: [{ name: 'Earning potential', weight: 30 }, { name: 'Startup cost & time', weight: 25 }, { name: 'Demand in your area', weight: 20 }, { name: 'Recurring / repeat clients', weight: 15 }, { name: 'Risk & liability', weight: 10 }],
    features: ['Avg fee', 'Startup cost', 'Certification', 'Demand', 'Best for']
  }],
  'beekeeping': [{
    key: 'which-hive', question: 'Which hive type should you start with?',
    context: 'Langstroth, top-bar, Warre, or Flow — each suits a different beekeeper. Score them against your goals.',
    options: [{ name: 'Langstroth', blurb: 'Standard, scalable' }, { name: 'Top-bar', blurb: 'Natural, low-cost' }, { name: 'Warre', blurb: 'Minimal intervention' }, { name: 'Flow Hive', blurb: 'Easy honey harvest' }],
    criteria: [{ name: 'Honey yield', weight: 25 }, { name: 'Ease for beginners', weight: 25 }, { name: 'Upfront cost (lower = better)', weight: 20 }, { name: 'Bee health / natural fit', weight: 15 }, { name: 'Scalability', weight: 15 }],
    features: ['Cost', 'Honey yield', 'Difficulty', 'Maintenance', 'Best for']
  }],
  'energy-auditor': [{
    key: 'which-upgrade', question: 'Which home upgrade has the best ROI?',
    context: 'Insulation, windows, HVAC, or solar — the right order saves the most. Score each upgrade\'s payback.',
    options: [{ name: 'Air sealing + insulation', blurb: 'Cheapest, fastest payback' }, { name: 'Windows', blurb: 'Comfort + curb appeal' }, { name: 'HVAC upgrade', blurb: 'Efficiency + comfort' }, { name: 'Solar + battery', blurb: 'Long-term, incentives' }],
    criteria: [{ name: 'Payback period (shorter = better)', weight: 30 }, { name: 'Upfront cost (lower = better)', weight: 25 }, { name: 'Comfort improvement', weight: 20 }, { name: 'Rebates / incentives', weight: 15 }, { name: 'Home value', weight: 10 }],
    features: ['Cost', 'Payback', 'Savings/yr', 'Incentives', 'Best for']
  }],
  'post-construction-cleaning': [{
    key: 'which-package', question: 'Which cleaning package should you quote?',
    context: 'Rough, final, or deep clean — quote the wrong scope and you eat the margin. Score the job to price it right.',
    options: [{ name: 'Rough clean', blurb: 'Debris + dust, pre-finish' }, { name: 'Final clean', blurb: 'Move-in ready' }, { name: 'Deep / detail clean', blurb: 'Premium, highest margin' }],
    criteria: [{ name: 'Labor hours', weight: 25 }, { name: 'Margin per job', weight: 25 }, { name: 'Client expectations', weight: 20 }, { name: 'Equipment needed', weight: 15 }, { name: 'Repeat potential', weight: 15 }],
    features: ['Price/sqft', 'Hours', 'Margin', 'Equipment', 'Best for']
  }],
  'native-landscaping': [{
    key: 'which-design', question: 'Which native landscape design fits your yard?',
    context: 'Rain garden, prairie, pollinator, or woodland — the right one depends on your site. Score it before you plant.',
    options: [{ name: 'Rain garden', blurb: 'Handles runoff' }, { name: 'Prairie / meadow', blurb: 'Low-maintenance, bold' }, { name: 'Pollinator garden', blurb: 'Bees + butterflies' }, { name: 'Woodland shade', blurb: 'Under trees' }],
    criteria: [{ name: 'Site conditions (sun/soil)', weight: 30 }, { name: 'Maintenance level', weight: 25 }, { name: 'Install cost (lower = better)', weight: 20 }, { name: 'Wildlife benefit', weight: 15 }, { name: 'Curb appeal', weight: 10 }],
    features: ['Cost', 'Maintenance', 'Sun/shade', 'Wildlife', 'Best for']
  }],
  'mold-inspector': [{
    key: 'test-vs-remediate', question: 'Test, remediate, or DIY?',
    context: 'Mold is scary and remediation is expensive. Score the right response so you don\'t overpay — or under-react.',
    options: [{ name: 'DIY test + clean', blurb: 'Small, visible patches' }, { name: 'Professional test', blurb: 'Know what you\'re dealing with' }, { name: 'Full remediation', blurb: 'Large or hidden growth' }],
    criteria: [{ name: 'Area size', weight: 25 }, { name: 'Health symptoms', weight: 25 }, { name: 'Moisture source found?', weight: 20 }, { name: 'Budget (lower = better)', weight: 15 }, { name: 'Property value / sale', weight: 15 }],
    features: ['Cost', 'When to use', 'Time', 'Risk', 'Best for']
  }],
  'air-duct-cleaning': [{
    key: 'clean-vs-replace', question: 'Clean or replace your ducts?',
    context: 'Cleaning is cheap; replacement is costly. Score age, damage, and air quality to decide.',
    options: [{ name: 'Clean ducts', blurb: 'Routine maintenance' }, { name: 'Clean + sanitize', blurb: 'Add antimicrobial' }, { name: 'Replace ductwork', blurb: 'Old or damaged' }],
    criteria: [{ name: 'Duct age', weight: 25 }, { name: 'Visible damage / leaks', weight: 25 }, { name: 'Air quality complaints', weight: 20 }, { name: 'Cost (lower = better)', weight: 15 }, { name: 'Energy loss', weight: 15 }],
    features: ['Cost', 'When to use', 'Duration', 'Result', 'Best for']
  }],
  'fishing-guide': [{
    key: 'which-charter', question: 'Which charter package should you book?',
    context: 'Half-day, full-day, or group — the right trip depends on your goals and budget. Score it before you book.',
    options: [{ name: 'Half-day', blurb: 'Budget, quick trip' }, { name: 'Full-day', blurb: 'Best value, more water' }, { name: 'Group / private', blurb: 'Events, split cost' }],
    criteria: [{ name: 'Budget (lower = better)', weight: 25 }, { name: 'Target species / season', weight: 25 }, { name: 'Group size', weight: 20 }, { name: 'Experience level', weight: 15 }, { name: 'Time available', weight: 15 }],
    features: ['Price', 'Duration', 'Best season', 'Group size', 'Best for']
  }],
  'massage-therapy': [{
    key: 'which-modality', question: 'Which massage modality should you specialize in?',
    context: 'Swedish, deep tissue, sports, or hot stone — the right specialty attracts the clients you want. Score it.',
    options: [{ name: 'Swedish / relaxation', blurb: 'Broad appeal' }, { name: 'Deep tissue', blurb: 'Therapeutic, loyal clients' }, { name: 'Sports / recovery', blurb: 'Athletes, premium' }, { name: 'Hot stone / specialty', blurb: 'Spa, higher ticket' }],
    criteria: [{ name: 'Client demand', weight: 25 }, { name: 'Price per session', weight: 25 }, { name: 'Physical toll (lower = better)', weight: 20 }, { name: 'Repeat bookings', weight: 15 }, { name: 'Training required', weight: 15 }],
    features: ['Price', 'Demand', 'Physical toll', 'Repeat rate', 'Best for']
  }],
  'tattoo-artist': [{
    key: 'which-style', question: 'Which tattoo style should you specialize in?',
    context: 'The style you lead with defines your clientele. Score realism, traditional, fine-line, and neo-trad.',
    options: [{ name: 'Realism', blurb: 'High ticket, slow' }, { name: 'Traditional', blurb: 'Bold, timeless' }, { name: 'Fine-line', blurb: 'Trending, delicate' }, { name: 'Neo-traditional', blurb: 'Illustrative, colorful' }],
    criteria: [{ name: 'Demand in your market', weight: 25 }, { name: 'Price per piece', weight: 25 }, { name: 'Time per piece', weight: 20 }, { name: 'Your skill fit', weight: 20 }, { name: 'Trend longevity', weight: 10 }],
    features: ['Price', 'Demand', 'Time', 'Skill', 'Best for']
  }],
  'wedding-photography': [{
    key: 'which-package', question: 'Which photography package is right for you?',
    context: 'Engagement, half-day, full-day, or elopement — the right package matches your day and budget. Score it.',
    options: [{ name: 'Elopement', blurb: 'Intimate, affordable' }, { name: 'Half-day', blurb: 'Ceremony + portraits' }, { name: 'Full-day', blurb: 'Full coverage' }, { name: 'Full-day + album', blurb: 'Premium, heirloom' }],
    criteria: [{ name: 'Budget (lower = better)', weight: 25 }, { name: 'Coverage needed', weight: 25 }, { name: 'Guest count', weight: 20 }, { name: 'Deliverables (album)', weight: 15 }, { name: 'Timeline length', weight: 15 }],
    features: ['Price', 'Coverage', 'Deliverables', 'Best for', 'Notes']
  }],
  'pyrotechnics': [{
    key: 'which-show', question: 'Which fireworks show fits your budget?',
    context: 'Shell mix, duration, and budget — the right show maximizes "wow" per dollar. Score your options.',
    options: [{ name: 'Backyard pack', blurb: 'Consumer, $200–500' }, { name: 'Pro 1.4G show', blurb: 'Choreographed, $1k–5k' }, { name: 'Full pyro-musical', blurb: 'Large display, $5k+' }],
    criteria: [{ name: 'Budget (lower = better)', weight: 30 }, { name: 'Show duration', weight: 20 }, { name: 'Effect variety', weight: 20 }, { name: 'Crew / setup effort', weight: 15 }, { name: 'Venue & safety', weight: 15 }],
    features: ['Cost', 'Duration', 'Effect variety', 'Crew', 'Best for']
  }]
};

// Recovery slugs all share the "which program" selector + a program-specific matrix
const RECOVERY_SLUGS = ['aa-recovery', 'smart-recovery', 'refuge-recovery', 'womens-recovery', 'secular-recovery', 'faith-recovery'];

function scenarioFor(prof) {
  if (RECOVERY_SLUGS.includes(prof.slug)) return RECOVERY_SELECTOR;
  const list = SCENARIOS[prof.slug];
  if (list && list.length) return list[0];
  return genericScenario(prof);
}

// Generic fallback: derive a decision from the profession's own services
function genericScenario(prof) {
  const services = JSON.parse(prof.services || '[]');
  const options = (services.length ? services : [['Core service', '$100'], ['Premium service', '$200'], ['Starter service', '$50']])
    .slice(0, 4)
    .map(s => ({ name: s[0], blurb: s[1] || '—' }));
  return {
    key: 'which-service',
    question: `Which ${prof.name} service should you lead with?`,
    context: `Score your top services against demand, margin, and effort to decide where to focus first.`,
    options,
    criteria: [
      { name: 'Profit margin', weight: 30 },
      { name: 'Client demand', weight: 25 },
      { name: 'Effort / time (lower = better)', weight: 20 },
      { name: 'Repeat business', weight: 15 },
      { name: 'Competition (lower = better)', weight: 10 }
    ],
    features: ['Price', 'Demand', 'Margin', 'Effort', 'Best for'],
    quiz: [
      { q: 'I want the highest-margin service even if it takes longer to sell.', high: options[0]?.name, low: options[2]?.name },
      { q: 'I want fast, high-volume work with low setup.', high: options[2]?.name, low: options[0]?.name }
    ]
  };
}

// ── COLUMN LETTERS ──
function col(n) { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

// ── XLSX BUILDERS ──

// Weighted decision matrix: criteria × options, auto weighted-total + auto winner
function buildDecisionMatrixXLSX(prof, scenario, filename) {
  const opts = scenario.options;
  const crits = scenario.criteria;
  const nOpt = opts.length;
  const nCrit = crits.length;

  const header = ['Criterion', 'Weight %', ...opts.map(o => o.name)];
  const rows = [
    [`${prof.name} — ${scenario.question}`],
    [scenario.context],
    [],
    header
  ];
  // criteria rows (score cells left blank for the buyer to fill 1–5)
  for (const c of crits) {
    rows.push([c.name, c.weight, ...opts.map(() => '')]);
  }
  const firstCritRow = 5; // 1-indexed
  const lastCritRow = firstCritRow + nCrit - 1;
  const wsRow = lastCritRow + 1;

  // Weighted score row (formula per option)
  const wsRowArr = ['Weighted Score', '=SUM(B' + firstCritRow + ':B' + lastCritRow + ')'];
  for (let o = 0; o < nOpt; o++) {
    const c = col(2 + o); // C, D, E...
    wsRowArr.push(`=SUMPRODUCT($B$${firstCritRow}:$B$${lastCritRow},${c}${firstCritRow}:${c}${lastCritRow})/SUM($B$${firstCritRow}:$B$${lastCritRow})`);
  }
  rows.push(wsRowArr);

  // Recommendation row (auto-picks the highest-scoring option)
  const recRow = ['✅ Recommendation', ''];
  const firstOptCol = col(2);
  const lastOptCol = col(2 + nOpt - 1);
  for (let o = 0; o < nOpt; o++) {
    const c = col(2 + o);
    recRow.push(`=IF(${c}${wsRow}=MAX(${firstOptCol}${wsRow}:${lastOptCol}${wsRow}),"★ WINNER","")`);
  }
  rows.push(recRow);
  rows.push([]);
  rows.push(['How to use:', 'Score each option 1–5 against each criterion. The weighted score and winner update automatically.']);

  return writeXLSX(rows, prof, filename, [34, 12, ...opts.map(() => 16)]);
}

// Side-by-side comparison with auto-scoring
function buildComparisonXLSX(prof, scenario, filename) {
  const opts = scenario.options;
  const feats = scenario.features || ['Price', 'Quality', 'Speed', 'Support', 'Best for'];
  const rows = [
    [`${prof.name} — ${scenario.question}`],
    [scenario.context],
    [],
    ['Feature', ...opts.map(o => o.name)]
  ];
  const firstRow = 5;
  for (let i = 0; i < feats.length; i++) {
    rows.push([feats[i], ...opts.map(() => '')]);
  }
  const lastRow = firstRow + feats.length - 1;
  const totalRow = lastRow + 1;
  rows.push(['Total Score (1–5 each)', ...opts.map((o, oi) => `=SUM(${col(1 + oi)}${firstRow}:${col(1 + oi)}${lastRow})`)]);
  const recRow = totalRow + 1;
  const firstOptCol = col(1);
  const lastOptCol = col(1 + opts.length - 1);
  rows.push(['✅ Best Match', ...opts.map((o, oi) => `=IF(${col(1 + oi)}${totalRow}=MAX(${firstOptCol}${totalRow}:${lastOptCol}${totalRow}),"★ WINNER","")`)]);
  rows.push([]);
  rows.push(['How to use:', 'Score each option 1–5 per feature. Totals and the best match update automatically.']);
  return writeXLSX(rows, prof, filename, [26, ...opts.map(() => 16)]);
}

// Cost-benefit / break-even analysis
function buildCostBenefitXLSX(prof, scenario, filename) {
  const opts = scenario.options;
  const rows = [
    [`${prof.name} — ${scenario.question}`],
    [scenario.context],
    [],
    ['Cost / Benefit Item', ...opts.map(o => o.name)]
  ];
  const costItems = ['Upfront cost', 'Ongoing / maintenance', 'Time investment'];
  const benefitItems = ['Financial benefit', 'Time saved', 'Risk avoided'];
  let r = 5;
  rows.push(['— COSTS —', ...opts.map(() => '')]);
  for (const c of costItems) { rows.push([c, ...opts.map(() => '')]); r++; }
  const costStart = 6, costEnd = 6 + costItems.length - 1;
  const costTotalRow = costEnd + 1;
  rows.push(['Total Cost', ...opts.map((o, oi) => `=SUM(${col(1 + oi)}${costStart}:${col(1 + oi)}${costEnd})`)]);
  rows.push([]);
  rows.push(['— BENEFITS —', ...opts.map(() => '')]);
  const benStart = costTotalRow + 3;
  for (const b of benefitItems) { rows.push([b, ...opts.map(() => '')]); }
  const benEnd = benStart + benefitItems.length - 1;
  const benTotalRow = benEnd + 1;
  rows.push(['Total Benefit', ...opts.map((o, oi) => `=SUM(${col(1 + oi)}${benStart}:${col(1 + oi)}${benEnd})`)]);
  const netRow = benTotalRow + 1;
  rows.push(['NET (Benefit − Cost)', ...opts.map((o, oi) => `=${col(1 + oi)}${benTotalRow}-${col(1 + oi)}${costTotalRow}`)]);
  const recRow = netRow + 1;
  const firstOptCol = col(1);
  const lastOptCol = col(1 + opts.length - 1);
  rows.push(['✅ Best Value', ...opts.map((o, oi) => `=IF(${col(1 + oi)}${netRow}=MAX(${firstOptCol}${netRow}:${lastOptCol}${netRow}),"★ WINNER","")`)]);
  rows.push([]);
  rows.push(['How to use:', 'Enter dollar/time values per option. Net benefit and best value update automatically.']);
  return writeXLSX(rows, prof, filename, [26, ...opts.map(() => 16)]);
}

// ROI / payback calculator
function buildROIXLSX(prof, scenario, filename) {
  const opts = scenario.options;
  const rows = [
    [`${prof.name} — ${scenario.question}`],
    [scenario.context],
    [],
    ['Metric', ...opts.map(o => o.name)]
  ];
  const invRow = 5, retRow = 6, roiRow = 7, payRow = 8;
  rows.push(['Upfront investment ($)', ...opts.map(() => '')]);
  rows.push(['Annual return / savings ($)', ...opts.map(() => '')]);
  rows.push(['ROI %', ...opts.map((o, oi) => `=IF(${col(1 + oi)}${invRow}=0,"",${col(1 + oi)}${retRow}/${col(1 + oi)}${invRow}*100)`)]);
  rows.push(['Payback period (years)', ...opts.map((o, oi) => `=IF(${col(1 + oi)}${retRow}=0,"",${col(1 + oi)}${invRow}/${col(1 + oi)}${retRow})`)]);
  const recRow = 9;
  const firstOptCol = col(1);
  const lastOptCol = col(1 + opts.length - 1);
  rows.push(['✅ Fastest Payback', ...opts.map((o, oi) => `=IF(${col(1 + oi)}${payRow}=MIN(${firstOptCol}${payRow}:${lastOptCol}${payRow}),"★ WINNER","")`)]);
  rows.push([]);
  rows.push(['How to use:', 'Enter investment + annual return per option. ROI % and payback update automatically.']);
  return writeXLSX(rows, prof, filename, [26, ...opts.map(() => 16)]);
}

// Risk assessment matrix: likelihood × impact with auto-priority
function buildRiskMatrixXLSX(prof, scenario, filename) {
  const risks = [
    ['Pricing / margin pressure', 'Competitors undercutting'],
    ['Demand drop', 'Seasonal or trend reversal'],
    ['Regulatory / compliance', 'Licensing or legal changes'],
    ['Cash flow', 'Late payments or slow months'],
    ['Reputation', 'Bad review or dispute'],
    ['Burnout / capacity', 'Too much or too little work']
  ];
  const rows = [
    [`${prof.name} — Risk Assessment Matrix`],
    ['Score each risk 1–5 on likelihood and impact. Priority updates automatically.'],
    [],
    ['Risk', 'Likelihood (1–5)', 'Impact (1–5)', 'Risk Score', 'Priority']
  ];
  const firstRow = 5;
  for (let i = 0; i < risks.length; i++) {
    const r = firstRow + i;
    rows.push([risks[i][0] + ' — ' + risks[i][1], '', '', `=B${r}*C${r}`, `=IF(D${r}>=15,"🔴 Critical",IF(D${r}>=8,"🟠 High","🟢 Low"))`]);
  }
  rows.push([]);
  rows.push(['How to use:', 'Score each risk. Critical (≥15) risks need a mitigation plan now.']);
  return writeXLSX(rows, prof, filename, [30, 14, 12, 12, 16]);
}

function writeXLSX(rows, prof, filename, colWidths) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  coerceFormulas(ws);
  ws['!cols'] = colWidths.map(w => ({ wch: w }));
  const sheetName = String(prof.name).replace(/[:\\/?*\[\]]/g, '').trim().substring(0, 31) || 'Decision';
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const out = path.join(OUTPUT_DIR, filename);
  XLSX.writeFile(wb, out);
  return out;
}

// ── PDF / HTML BUILDERS ──

function themeFor(prof, override) {
  let colors = {};
  try { colors = JSON.parse(prof.colors || '{}'); } catch {}
  const o = override || {};
  return {
    primary: o.primary || colors.primary || '#0f172a',
    secondary: o.secondary || colors.secondary || '#2dd4bf',
    accent: o.accent || colors.accent || '#ec4899',
    bg: '#ffffff',
    font: o.font || "'Space Grotesk','Inter',system-ui,sans-serif"
  };
}

function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function buildDecisionTreeHTML(prof, scenario, theme) {
  const t = themeFor(prof, theme);
  const opts = scenario.options;
  const branches = opts.map((o, i) => `
    <div class="node option">
      <div class="q">Option ${i + 1}: <strong>${esc(o.name)}</strong></div>
      <div class="sub">${esc(o.blurb)}</div>
      <div class="line"></div>
      <div class="node check">Meets your top criterion? <span class="yes">YES → Proceed</span> / <span class="no">NO → Reconsider</span></div>
      <div class="line"></div>
      <div class="node final">Decision: <span class="blank">____________________</span> · Why: <span class="blank">____________________</span></div>
    </div>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
body{font-family:${t.font};margin:0;padding:40px;background:${t.bg};color:${t.primary};}
h1{font-size:1.7rem;margin:0 0 6px;}
.context{color:#64748b;font-size:0.9rem;margin-bottom:28px;}
.node{background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid ${t.secondary};border-radius:10px;padding:14px 16px;margin:10px 0;}
.node.option{border-left-color:${t.accent};}
.node .q{font-weight:700;font-size:0.95rem;}
.node .sub{font-size:0.8rem;color:#64748b;margin-top:3px;}
.node.check{background:#fff;}
.node.final{background:#f0fdfa;border-left-color:#22c55e;}
.line{height:16px;border-left:2px dashed #cbd5e1;margin-left:18px;}
.yes{color:#16a34a;font-weight:700;}.no{color:#dc2626;font-weight:700;}
.blank{color:#94a3b8;}
.footer{margin-top:28px;font-size:0.78rem;color:#94a3b8;}
</style></head><body>
<h1>${esc(prof.name)} — ${esc(scenario.question)}</h1>
<div class="context">${esc(scenario.context)}</div>
${branches}
<div class="footer">Walk each option top-to-bottom. Circle YES/NO at each check, then commit your decision and the reason.</div>
</body></html>`;
}

function buildSelectorHTML(prof, scenario, theme) {
  const t = themeFor(prof, theme);
  const quiz = scenario.quiz || [];
  const opts = scenario.options;
  const questions = quiz.map((q, i) => `
    <div class="q"><div class="qn">${i + 1}. ${esc(q.q)}</div>
    <div class="scale"><span>1 — Strongly disagree</span><span class="boxes">${Array(5).fill(0).map(() => '<span class="box"></span>').join('')}</span><span>5 — Strongly agree</span></div></div>`).join('');
  const key = opts.map((o, i) => `<div class="key"><strong>${esc(o.name)}</strong> — ${esc(o.blurb)}</div>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
body{font-family:${t.font};margin:0;padding:40px;background:${t.bg};color:${t.primary};}
h1{font-size:1.7rem;margin:0 0 6px;}
.context{color:#64748b;font-size:0.9rem;margin-bottom:24px;}
.q{border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin:10px 0;background:#f8fafc;}
.qn{font-weight:700;font-size:0.92rem;margin-bottom:10px;}
.scale{display:flex;justify-content:space-between;align-items:center;font-size:0.72rem;color:#64748b;gap:10px;}
.boxes{display:flex;gap:8px;}
.box{width:26px;height:26px;border:2px solid ${t.secondary};border-radius:6px;}
.key{margin-top:26px;}
.key strong{color:${t.accent};}
.footer{margin-top:24px;font-size:0.78rem;color:#94a3b8;}
</style></head><body>
<h1>${esc(prof.name)} — ${esc(scenario.question)}</h1>
<div class="context">${esc(scenario.context)}</div>
${questions}
<div class="key"><h2 style="font-size:1rem;">Your options</h2>${key}</div>
<div class="footer">Score each statement 1–5. The statements you rate highest point to the option that fits you best.</div>
</body></html>`;
}

function buildSWOTHTML(prof, theme) {
  const t = themeFor(prof, theme);
  const quad = (title, color, prompts) => `
    <div class="quad" style="border-top:4px solid ${color};">
      <h3>${title}</h3>
      ${prompts.map(p => `<div class="prompt">${esc(p)}</div>`).join('')}
    </div>`;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
body{font-family:${t.font};margin:0;padding:40px;background:${t.bg};color:${t.primary};}
h1{font-size:1.6rem;margin:0 0 4px;}
.context{color:#64748b;font-size:0.85rem;margin-bottom:24px;}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
.quad{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;}
.quad h3{font-size:1rem;margin:0 0 10px;}
.prompt{font-size:0.8rem;color:#64748b;border-bottom:1px dashed #e2e8f0;padding:8px 0;}
.footer{margin-top:24px;font-size:0.78rem;color:#94a3b8;}
</style></head><body>
<h1>${esc(prof.name)} — SWOT Analysis</h1>
<div class="context">Map your business honestly. Use strengths to seize opportunities and neutralize threats.</div>
<div class="grid">
${quad('Strengths', '#22c55e', ['What do you do better than competitors?', 'What do clients praise you for?', 'What resources or skills do you have?'])}
${quad('Weaknesses', '#ef4444', ['Where do you lose deals or time?', 'What do you avoid or lack?', 'What would a competitor exploit?'])}
${quad('Opportunities', '#2dd4bf', ['What market trends favor you?', 'What underserved needs can you fill?', 'What partnerships could grow you?'])}
${quad('Threats', '#f59e0b', ['What competitors are rising?', 'What could shrink demand?', 'What costs or rules could hurt?'])}
</div>
<div class="footer">Revisit quarterly. Turn 2 strengths + 1 opportunity into a concrete 30-day action.</div>
</body></html>`;
}

function buildPriorityMatrixHTML(prof, theme) {
  const t = themeFor(prof, theme);
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
body{font-family:${t.font};margin:0;padding:40px;background:${t.bg};color:${t.primary};}
h1{font-size:1.6rem;margin:0 0 4px;}
.context{color:#64748b;font-size:0.85rem;margin-bottom:24px;}
.matrix{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:10px;height:420px;}
.cell{border:1px solid #e2e8f0;border-radius:10px;padding:14px;display:flex;flex-direction:column;}
.cell h3{font-size:0.9rem;margin:0 0 6px;}
.cell p{font-size:0.72rem;color:#64748b;margin:0 0 8px;}
.cell .list{flex:1;border-top:1px dashed #e2e8f0;margin-top:6px;padding-top:6px;font-size:0.78rem;color:#94a3b8;}
.qw{background:#f0fdfa;border-top:4px solid #22c55e;}
.bb{background:#eff6ff;border-top:4px solid #3b82f6;}
.fi{background:#f8fafc;border-top:4px solid #94a3b8;}
.ts{background:#fef2f2;border-top:4px solid #ef4444;}
.axis-y{writing-mode:vertical-rl;transform:rotate(180deg);font-size:0.7rem;color:#94a3b8;text-align:center;}
.footer{margin-top:20px;font-size:0.78rem;color:#94a3b8;}
</style></head><body>
<h1>${esc(prof.name)} — Priority Matrix</h1>
<div class="context">Plot each task/idea by impact and effort, then work the quadrants in order.</div>
<div class="matrix">
<div class="cell qw"><h3>✅ Quick Wins</h3><p>High impact, low effort — do these first.</p><div class="list">1. ______ 2. ______ 3. ______</div></div>
<div class="cell bb"><h3>🎯 Big Bets</h3><p>High impact, high effort — schedule &amp; resource these.</p><div class="list">1. ______ 2. ______</div></div>
<div class="cell fi"><h3>📎 Fill-ins</h3><p>Low impact, low effort — batch when time allows.</p><div class="list">1. ______ 2. ______</div></div>
<div class="cell ts"><h3>⏳ Time Sinks</h3><p>Low impact, high effort — drop or delegate.</p><div class="list">1. ______ 2. ______</div></div>
</div>
<div class="footer">X-axis = Effort (low → high) · Y-axis = Impact (low → high).</div>
</body></html>`;
}

// ── DISPATCH ──

// HTML for mockup preview (and the PDF source for pdf types)
function buildHTML(prof, type, theme) {
  const s = scenarioFor(prof);
  switch (type) {
    case 'decision-tree': return buildDecisionTreeHTML(prof, s, theme);
    case 'selector': return buildSelectorHTML(prof, s, theme);
    case 'swot': return buildSWOTHTML(prof, theme);
    case 'priority-matrix': return buildPriorityMatrixHTML(prof, theme);
    // XLSX types → render an HTML table preview so the buyer can SEE the tool
    default: return buildXLSXPreviewHTML(prof, type, s, theme);
  }
}

// HTML preview of an XLSX decision tool (what the spreadsheet will contain)
function buildXLSXPreviewHTML(prof, type, scenario, theme) {
  const t = themeFor(prof, theme);
  const opts = scenario.options;
  const crits = scenario.criteria;
  const label = DECISION_TYPES[type]?.label || 'Decision Tool';
  let table = '';
  if (type === 'decision-matrix') {
    table = `<table><thead><tr><th>Criterion</th><th>Wt</th>${opts.map(o => `<th>${esc(o.name)}</th>`).join('')}</tr></thead><tbody>
      ${crits.map(c => `<tr><td>${esc(c.name)}</td><td>${c.weight}</td>${opts.map(() => '<td class="in">1–5</td>').join('')}</tr>`).join('')}
      <tr class="tot"><td>Weighted Score</td><td></td>${opts.map(() => '<td>auto</td>').join('')}</tr>
      <tr class="win"><td>✅ Recommendation</td><td></td>${opts.map(() => '<td>auto</td>').join('')}</tr></tbody></table>`;
  } else if (type === 'comparison') {
    const feats = scenario.features || [];
    table = `<table><thead><tr><th>Feature</th>${opts.map(o => `<th>${esc(o.name)}</th>`).join('')}</tr></thead><tbody>
      ${feats.map(f => `<tr><td>${esc(f)}</td>${opts.map(() => '<td class="in">1–5</td>').join('')}</tr>`).join('')}
      <tr class="win"><td>✅ Best Match</td>${opts.map(() => '<td>auto</td>').join('')}</tr></tbody></table>`;
  } else if (type === 'cost-benefit') {
    table = `<table><thead><tr><th>Item</th>${opts.map(o => `<th>${esc(o.name)}</th>`).join('')}</tr></thead><tbody>
      <tr><td>Total Cost</td>${opts.map(() => '<td>auto</td>').join('')}</tr>
      <tr><td>Total Benefit</td>${opts.map(() => '<td>auto</td>').join('')}</tr>
      <tr class="win"><td>✅ Best Value (Net)</td>${opts.map(() => '<td>auto</td>').join('')}</tr></tbody></table>`;
  } else if (type === 'roi') {
    table = `<table><thead><tr><th>Metric</th>${opts.map(o => `<th>${esc(o.name)}</th>`).join('')}</tr></thead><tbody>
      <tr><td>Investment ($)</td>${opts.map(() => '<td class="in">—</td>').join('')}</tr>
      <tr><td>Annual Return ($)</td>${opts.map(() => '<td class="in">—</td>').join('')}</tr>
      <tr><td>ROI %</td>${opts.map(() => '<td>auto</td>').join('')}</tr>
      <tr class="win"><td>✅ Fastest Payback</td>${opts.map(() => '<td>auto</td>').join('')}</tr></tbody></table>`;
  } else {
    table = `<table><thead><tr><th>Risk</th><th>Likelihood</th><th>Impact</th><th>Score</th><th>Priority</th></tr></thead><tbody>
      ${['Pricing pressure','Demand drop','Regulatory','Cash flow','Reputation','Burnout'].map(r => `<tr><td>${r}</td><td class="in">1–5</td><td class="in">1–5</td><td>auto</td><td>auto</td></tr>`).join('')}</tbody></table>`;
  }
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
body{font-family:${t.font};margin:0;padding:36px;background:${t.bg};color:${t.primary};}
h1{font-size:1.5rem;margin:0 0 4px;}
.context{color:#64748b;font-size:0.85rem;margin-bottom:20px;}
table{width:100%;border-collapse:collapse;font-size:0.8rem;}
th{background:${t.primary};color:#fff;padding:10px;text-align:left;}
td{padding:9px;border-bottom:1px solid #e2e8f0;}
td.in{color:#94a3b8;}
tr.tot td,tr.win td{font-weight:700;}
tr.win td{background:#f0fdfa;color:#16a34a;}
.badge{display:inline-block;background:${t.secondary};color:#000;padding:3px 10px;border-radius:20px;font-size:0.7rem;font-weight:700;margin-bottom:12px;}
</style></head><body>
<div class="badge">${esc(label)} · Live Formulas</div>
<h1>${esc(prof.name)} — ${esc(scenario.question)}</h1>
<div class="context">${esc(scenario.context)}</div>
${table}
<p style="font-size:0.72rem;color:#94a3b8;margin-top:14px;">Delivered as an editable spreadsheet with real formulas — scores, totals, and the recommendation update automatically.</p>
</body></html>`;
}

// The actual deliverable file (XLSX or PDF)
async function buildFile(prof, type, filename) {
  const s = scenarioFor(prof);
  switch (type) {
    case 'decision-matrix': return buildDecisionMatrixXLSX(prof, s, filename);
    case 'comparison': return buildComparisonXLSX(prof, s, filename);
    case 'cost-benefit': return buildCostBenefitXLSX(prof, s, filename);
    case 'roi': return buildROIXLSX(prof, s, filename);
    case 'risk-matrix': return buildRiskMatrixXLSX(prof, s, filename);
    case 'decision-tree': return pdfGen.generatePDF(buildDecisionTreeHTML(prof, s), filename);
    case 'selector': return pdfGen.generatePDF(buildSelectorHTML(prof, s), filename);
    case 'swot': return pdfGen.generatePDF(buildSWOTHTML(prof), filename);
    case 'priority-matrix': return pdfGen.generatePDF(buildPriorityMatrixHTML(prof), filename);
    default: return null;
  }
}

module.exports = {
  DECISION_TYPES,
  scenarioFor,
  buildHTML,
  buildFile,
  buildDecisionMatrixXLSX,
  buildComparisonXLSX,
  buildCostBenefitXLSX,
  buildROIXLSX,
  buildRiskMatrixXLSX,
  buildDecisionTreeHTML,
  buildSelectorHTML,
  buildSWOTHTML,
  buildPriorityMatrixHTML
};
