// ═══════════════════════════════════════════════════════════════════════════
// CONTENT LIBRARY — niche-specific content that transforms generic templates
// into genuinely useful tools. Each category has real checklist items,
// invoice line items, spreadsheet structures, and social post angles.
// ═══════════════════════════════════════════════════════════════════════════

const CONTENT = {
  trades: {
    label: 'Trades & Home Services',
    keywords: /hvac|plumb|electric|roof|drywall|carpent|concrete|fence|locksmith|pest|pressure|junk|pool|epoxy|garage|septic|chimney|snow|landscap|appliance|air.?duct|mold|energy.?audit|solar/i,
    checklist: [
      'Verify all permits and licenses are current',
      'Inspect tools and equipment for wear or damage',
      'Document site conditions with before photos',
      'Confirm material delivery and staging area',
      'Review safety protocols with all crew members',
      'Check local building code requirements for the job',
      'Verify utility shutoff locations (water, gas, electric)',
      'Confirm client access and parking arrangements',
      'Schedule waste disposal / dumpster delivery',
      'Prepare punch-list for final walkthrough'
    ],
    invoice: [
      { item: 'Service call / diagnostic fee', price: 85 },
      { item: 'Labor — first hour', price: 125 },
      { item: 'Labor — additional hours', price: 95 },
      { item: 'Materials & parts (at cost + 20%)', price: 0 },
      { item: 'Emergency / after-hours surcharge', price: 175 },
      { item: 'Permit & inspection fees', price: 0 }
    ],
    spreadsheet: {
      columns: ['Job Name', 'Client', 'Quoted Price', 'Actual Hours', 'Material Cost', 'Subcontractors', 'Total Cost', 'Invoice Amount', 'Gross Profit', 'Margin %'],
      formulas: [
        'Material markup calculator: materials × 1.20',
        'Break-even rate: (overhead ÷ billable hours) + hourly cost',
        'Quote generator: labor + materials + 25% margin',
        'Cash flow projection: monthly recurring × 12'
      ]
    },
    social: [
      'Before/after transformation photo (job site)',
      'Pro tip: the #1 mistake homeowners make with this repair',
      'Seasonal maintenance reminder (preventative care)',
      'Behind-the-scenes: what a day on the job looks like',
      'Client testimonial or 5-star review showcase',
      'Meet the crew / team introduction',
      'Common DIY fail (and how to avoid it)',
      'New tool or equipment showcase'
    ]
  },
  wellness: {
    label: 'Health & Wellness',
    keywords: /massage|yoga|pilates|train|fitness|gym|nutrition|chiropract|physical.?therapy|wellness|breath|somatic|holistic|acupuncture|spa/i,
    checklist: [
      'Review client intake form and health history',
      'Confirm appointment time and send reminder',
      'Sanitize and prepare treatment space',
      'Check inventory of supplies (oils, linens, props)',
      'Review session plan based on client goals',
      'Set up music, lighting, and temperature',
      'Prepare post-session recommendations',
      'Document session notes and progress',
      'Schedule follow-up if needed',
      'Process payment and send receipt'
    ],
    invoice: [
      { item: 'Initial consultation & assessment', price: 95 },
      { item: '60-minute session', price: 110 },
      { item: '90-minute session', price: 155 },
      { item: 'Package of 5 sessions (save 10%)', price: 495 },
      { item: 'Add-on: targeted treatment', price: 45 }
    ],
    spreadsheet: {
      columns: ['Client Name', 'Session Date', 'Session Type', 'Duration', 'Price', 'Package?', 'Payment Status', 'Notes', 'Next Session'],
      formulas: [
        'Monthly revenue: SUM of sessions in month',
        'Client retention rate: returning ÷ total clients',
        'Average session value: total revenue ÷ sessions',
        'Package utilization: sessions used ÷ sessions purchased'
      ]
    },
    social: [
      'Self-care tip related to your specialty',
      'Client success story (with permission)',
      'Behind-the-scenes: your treatment space',
      'Myth-busting post about your field',
      'Quick stretch/exercise they can do at home',
      'Your personal wellness journey',
      'FAQ: common question clients ask',
      'Before/after or progress photo'
    ]
  },
  creative: {
    label: 'Creative & Design',
    keywords: /photo|tattoo|design|art|illustrat|film|video|music|writ|brand|craft|jewel|ceramic|pottery|paint|draw|architect/i,
    checklist: [
      'Charge and format all memory cards / devices',
      'Clean and inspect all equipment',
      'Confirm shot list or project brief with client',
      'Scout location and check lighting conditions',
      'Prepare backup equipment and batteries',
      'Review portfolio for style reference',
      'Confirm deliverable timeline with client',
      'Set up backup storage and file organization',
      'Test all settings before starting',
      'Prepare editing workspace and presets'
    ],
    invoice: [
      { item: 'Creative fee / session rate', price: 350 },
      { item: 'Additional hours', price: 125 },
      { item: 'Editing & post-production (per hour)', price: 85 },
      { item: 'Print rights / licensing', price: 150 },
      { item: 'Rush delivery (48-hour turnaround)', price: 200 }
    ],
    spreadsheet: {
      columns: ['Project', 'Client', 'Quote', 'Shoot Hours', 'Edit Hours', 'Expenses', 'License Type', 'Invoice', 'Profit', 'Usage Rights'],
      formulas: [
        'Effective hourly rate: (quote - expenses) / total hours',
        'License value multiplier by usage type',
        'Annual revenue by service type',
        'Client lifetime value tracker'
      ]
    },
    social: [
      'Latest work showcase (best shot from recent project)',
      'Behind-the-scenes of a shoot or creative process',
      'Before/after editing transformation',
      'Gear or tool you cant live without',
      'Client reaction or testimonial',
      'Your creative philosophy or process',
      'Time-lapse or workflow video',
      'Mistake you made and what you learned'
    ]
  },
  business: {
    label: 'Business & Professional',
    keywords: /notary|bookkeep|consult|account|freelanc|coach|real.?estate|insur|loan|legal|attorney|market|seo|virtual/i,
    checklist: [
      'Review client file and engagement letter',
      'Confirm all required documents received',
      'Verify compliance with state/federal requirements',
      'Prepare engagement timeline and milestones',
      'Set up client communication channel',
      'Document billable time and expenses',
      'Prepare deliverable draft for review',
      'Schedule progress check-in with client',
      'Confirm filing or submission deadlines',
      'Archive completed work per retention policy'
    ],
    invoice: [
      { item: 'Initial consultation', price: 150 },
      { item: 'Professional services (per hour)', price: 175 },
      { item: 'Document preparation', price: 250 },
      { item: 'Rush processing (24-hour)', price: 300 },
      { item: 'Travel / mobile service fee', price: 75 }
    ],
    spreadsheet: {
      columns: ['Client', 'Service Type', 'Engagement Date', 'Billable Hours', 'Rate', 'Expenses', 'Invoice Total', 'Payment Due', 'Paid', 'Profit'],
      formulas: [
        'Billable rate: target income / billable hours',
        'Client profitability: revenue - cost to serve',
        'Pipeline value: open engagements x average fee',
        'Utilization rate: billable hours / available hours'
      ]
    },
    social: [
      'Industry insight or tip your clients need',
      'Common misconception about your field',
      'Case study (anonymized client win)',
      'The process behind your service',
      'Answer to a FAQ you get asked',
      'Behind-the-scenes of your workday',
      'Trending news in your industry (and your take)',
      'Motivational post for fellow professionals'
    ]
  },
  recovery: {
    label: 'Recovery & Support',
    keywords: /recovery|sober|aa |na |smart|refuge|faith|secular|addict|alcohol|substance|12.?step|sobriety/i,
    checklist: [
      'Review daily intention and commitment',
      'Check in with sponsor or accountability partner',
      'Attend scheduled meeting (in-person or online)',
      'Complete daily reflection or journaling',
      'Practice one coping skill from your toolkit',
      'Reach out to one person in your support network',
      'Review triggers and plan for high-risk situations',
      'Celebrate one small win from today',
      'Prepare tomorrows priorities',
      'Practice gratitude - list 3 things'
    ],
    invoice: [],
    spreadsheet: {
      columns: ['Date', 'Days Sober', 'Meeting Attended', 'Step Work', 'Gratitude (3 things)', 'Trigger Encountered', 'Coping Skill Used', 'Mood (1-10)', 'Notes'],
      formulas: [
        'Milestone tracker: consecutive days',
        'Meeting attendance: meetings per week',
        'Mood trend: rolling 7-day average'
      ]
    },
    social: [
      'Daily affirmation or reflection',
      'Recovery milestone celebration',
      'A lesson learned in recovery',
      'Book or resource recommendation',
      'Gratitude practice share',
      'Meeting topic that resonated',
      'Hope message for the newcomer',
      'Self-care reminder'
    ]
  },
  food: {
    label: 'Food & Beverage',
    keywords: /chef|bake|brew|cook|kitchen|cater|restaurant|coffee|food|meal|diet|nutrition|cake|chocolate/i,
    checklist: [
      'Verify food handler certifications are current',
      'Check inventory and freshness of ingredients',
      'Review health department inspection requirements',
      'Confirm dietary restrictions and allergens',
      'Prepare prep list and station assignments',
      'Sanitize all work surfaces and equipment',
      'Check equipment temperature calibration',
      'Review recipe scaling for event size',
      'Confirm delivery/pickup timeline',
      'Prepare garnishes and presentation elements'
    ],
    invoice: [
      { item: 'Menu design & tasting consultation', price: 150 },
      { item: 'Per-person catering (base package)', price: 45 },
      { item: 'Premium protein / specialty upgrade', price: 25 },
      { item: 'Service staff (per server, per hour)', price: 35 },
      { item: 'Equipment rental (chafing, linens)', price: 120 },
      { item: 'Delivery & setup fee', price: 85 }
    ],
    spreadsheet: {
      columns: ['Event', 'Client', 'Date', 'Guest Count', 'Menu Package', 'Food Cost', 'Labor Cost', 'Total Cost', 'Quote', 'Profit'],
      formulas: [
        'Cost per person: total food cost / guest count',
        'Food cost percentage: food cost / menu price',
        'Labor percentage: labor cost / total revenue',
        'Break-even guest count: fixed costs / (price - variable cost)'
      ]
    },
    social: [
      'Signature dish or new menu item showcase',
      'Behind-the-scenes: prep work or plating',
      'Seasonal ingredient spotlight',
      'Client event photo (with permission)',
      'Recipe teaser or how-to',
      'Meet the chef / kitchen team',
      'Food styling or presentation tip',
      'Review or feature from a happy client'
    ]
  }
};

function getCategory(prof) {
  const text = [prof.name || '', prof.slug || '', prof.tier || '', String(prof.services || '').substring(0, 200)].join(' ').toLowerCase();
  for (const [key, cat] of Object.entries(CONTENT)) {
    if (cat.keywords.test(text)) return key;
  }
  return 'business';
}

function getContentFor(prof) {
  const cat = getCategory(prof);
  return { category: cat, label: CONTENT[cat].label, ...CONTENT[cat] };
}

module.exports = { CONTENT, getCategory, getContentFor };