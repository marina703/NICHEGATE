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
      'Prepare punch-list for final walkthrough',
      'Lay out drop cloths and protect surrounding surfaces',
      'Confirm job scope matches the signed work order',
      'Mark underground lines before any digging',
      'Test circuits and label the breaker panel',
      'Calibrate measuring tools before cutting',
      'Stage parts and fasteners in labeled trays',
      'Seal off work area from dust and debris',
      'Verify ladder and scaffold stability',
      'Confirm weather window for exterior work',
      'Photograph rough-in before enclosing',
      'Pressure-test lines before final connection',
      'Torque fasteners to manufacturer spec',
      'Caulk and weatherproof all penetrations',
      'Remove and dispose of old materials',
      'Label shutoffs and leave an ops manual',
      'Walk the client through maintenance tips',
      'Collect signatures on the completion form',
      'Note warranty terms and start the clock',
      'Store leftover materials for the client',
      'Schedule the 30-day follow-up call'
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
      'Process payment and send receipt',
      'Screen for contraindications before treatment',
      'Confirm hydration and pre-session prep',
      'Warm up equipment to the right temperature',
      'Position client for comfort and alignment',
      'Check in on pressure and sensation mid-session',
      'Offer water and a moment to reorient after',
      'Note any areas of tension or restriction',
      'Recommend home care between visits',
      'Track progress against the client goals',
      'Update the client care plan',
      'Sanitize all touch surfaces between clients',
      'Launder linens at proper temperature',
      'Restock retail products featured in session',
      'Log continuing-education per modality',
      'Confirm rebooking before the client leaves',
      'Send a 24-hour check-in message',
      'Flag any referral needs to a specialist',
      'Archive session notes securely',
      'Review outcome measures each month',
      'Ask for a review once results are seen'
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
      'Prepare editing workspace and presets',
      'Confirm usage rights and license scope',
      'Build a mood board with the client',
      'Pack grip, stands and clamps',
      'Check weather and golden-hour timing',
      'Charge all spare batteries and power banks',
      'Format and label cards by scene',
      'Set white balance and color references',
      'Shoot reference frames for continuity',
      'Log audio levels and run a sound check',
      'Back up footage at end of each day',
      'Cull and rate selects before editing',
      'Sync external audio to video',
      'Apply color grade to match the brief',
      'Export proxy files for client review',
      'Collect fonts and brand assets',
      'Prepare print-ready and web exports',
      'Add metadata and keyword tags',
      'Deliver via a shared gallery link',
      'Archive masters to cold storage',
      'Request a testimonial on delivery'
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
      'Archive completed work per retention policy',
      'Run a conflict check before onboarding',
      'Clarify scope, assumptions and out-of-scope',
      'Confirm point of contact on both sides',
      'Set the meeting cadence and reporting format',
      'Gather source data and validate inputs',
      'Build the working model or framework',
      'Review draft against the engagement goals',
      'Circulate for internal QA before sending',
      'Track action items and owners',
      'Summarize decisions from each call',
      'Prepare the client-facing summary',
      'Confirm e-signature and payment setup',
      'Log hours against the budget',
      'Flag risks and recommend mitigations',
      'Update the project plan weekly',
      'Store evidence for audit trails',
      'Send the invoice on completion',
      'Ask for referrals at project close',
      'Schedule the quarterly review',
      'Capture lessons learned for the team'
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
      'Practice gratitude - list 3 things',
      'Read one page from your program literature',
      'Work the step assigned for the week',
      'Inventory resentments and make amends where due',
      'Set a healthy boundary you have been avoiding',
      'Call your sponsor at a scheduled time',
      'Write down one thing you are grateful for',
      'Do a body scan and name where you hold tension',
      'Plan a sober activity for the weekend',
      'Notice urges without acting on them',
      'Share your experience at a meeting',
      'Update your relapse-prevention plan',
      'Practice a grounding technique when stressed',
      'Connect with a peer who is newer in recovery',
      'Review your reasons for staying sober',
      'Prepare a response for common triggers',
      'Spend ten minutes in quiet reflection',
      'Thank someone who supported your recovery',
      'List the people who believe in you',
      'Set one kind intention for someone else',
      'Rest and protect your early recovery sleep'
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
      'Prepare garnishes and presentation elements',
      'Label and date all prepped items',
      'Store raw and ready-to-eat separately',
      'Confirm allergen cross-contact controls',
      'Portion and weigh for consistent plating',
      'Chill hot foods within the safe window',
      'Reheat to the required internal temperature',
      'Stage servingware and linens',
      'Assign a point person for each station',
      'Photograph the final plating for records',
      'Brief the team on the run of show',
      'Confirm bar and beverage pairings',
      'Set up a hand-wash station for guests',
      'Track waste and adjust par levels',
      'Pack cold chain for transport',
      'Confirm on-site reheating capability',
      'Leave heating and serving instructions',
      'Break down and sanitize after service',
      'Reconcile inventory against the event',
      'Collect feedback from the client',
      'File the temperature logs'
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

// ═══════════════════════════════════════════════════════════════════════════
// THE CONTENT MOAT (2026-10-11) — service-keyed, trade-true depth.
// Generic templates sell the same five filler rows to every trade. The
// differentiation is SPECIFICITY AT FACTORY SCALE: a mold remediation checklist
// that follows containment → HEPA → clearance, an appliance checklist with the
// actual sealed-system checks. Groups are keyed to the profession's real
// service names so every section carries its own procedure rows.
//
// Resolution ladder: NICHE (service-keyed) → niche pool → CONTENT category →
// builder's last-resort routine. Tests in test/content-moat.test.js pin the
// no-filler rule: groups must not share rows.
// ═══════════════════════════════════════════════════════════════════════════

const NICHE = [
  {
    key: 'appliance-repair', match: /appliance/i,
    groups: [
      { match: /diagnostic|service call/i, rows: [
        'Record model and serial number from the rating plate',
        'Verify supply — voltage, gas pressure or water feed as applicable',
        'Read fault codes and run the manufacturer diagnostic cycle',
        'Run one full cycle before touching anything — observe the failure',
        'Photograph the installation and any pre-existing damage',
        'Quote the flat-rate book price before a single screw comes out'
      ] },
      { match: /refrigerat|fridge|freezer|cooling/i, rows: [
        'Measure cabinet temperatures at the fresh-food and freezer vents',
        'Clean condenser coils and verify condenser fan airflow',
        'Test the compressor start relay and overload protector',
        'Inspect door gaskets for seal and hinge alignment',
        'Check defrost heater, bi-metal and timer operation',
        'Test the water inlet valve, fill level and ice-maker harvest cycle',
        'Confirm clearance and airflow around the unit before leaving'
      ] },
      // NOTE: dishwasher BEFORE washer/dryer — "Dishwasher" contains "washer".
      { match: /dishwasher/i, rows: [
        'Check fill level, float switch and inlet valve',
        'Remove and clean spray arms, filters and the chopper screen',
        'Verify the drain loop or air gap installation',
        'Test the heater element and drying fan',
        'Inspect the door latch, gasket and steam vent',
        'Confirm supply water reaches 120°F at the tap'
      ] },
      { match: /washer|dryer|laundry/i, rows: [
        'Run a spin-and-drain test before disassembly (washers)',
        'Inspect inlet valves and screens for flow and debris',
        'Check the drain pump, hose and standpipe for restrictions',
        'Measure dryer airflow at the exterior vent hood',
        'Clean the full vent duct run — lint is the #1 dryer fire risk',
        'Test the heating element or igniter and thermal fuses',
        'Inspect drum rollers, idler pulley and belt for wear'
      ] },
      { match: /oven|range|stove|cooktop/i, rows: [
        'Verify bake and broil elements or gas burner ignition',
        'Calibrate the oven thermostat against an independent thermometer',
        'Inspect the door gasket, hinges and interior light switch',
        'Test surface element infinite switches and control knobs',
        'Confirm the anti-tip bracket is installed'
      ] },
      { match: /microwave/i, rows: [
        'Test with a cup of water — never run the microwave empty',
        'Disconnect power and discharge the high-voltage capacitor before internal work',
        'Test the door interlocks — the unit must never run with the door open',
        'Check the magnetron, high-voltage diode and capacitor for shorts',
        'Inspect the waveguide cover and turntable motor',
        'Verify thermal cutouts and the cooling fan'
      ] }
    ],
    pool: [
      'Bring the most common failure parts for this appliance class',
      'Test the unit under load before declaring it fixed',
      'Quote parts with part numbers so the client can verify',
      'Check the installation shutoffs — valves seize when never used',
      'Leave the work area cleaner than you found it',
      'Review the warranty status before quoting any repair'
    ],
    social: [
      { hook: 'Repair or replace? The 50% rule', sub: 'The honest math every homeowner deserves', cta: 'Book a diagnostic →' },
      { hook: 'The top fridge killer', sub: 'Nobody checks the coils — and it costs them the compressor', cta: 'Save this post →' },
      { hook: 'The 15-minute fire fix', sub: 'Dryer lint in the duct run is the hidden hazard', cta: 'Book a vent clean →' },
      { hook: 'What $89 of diagnostic buys', sub: 'The full test sequence, explained step by step', cta: 'Book your visit →' },
      { hook: 'Before / after', sub: 'Coil cleaning and the temperature drop on camera', cta: 'Follow for more →' },
      { hook: 'The appliance lifespan sheet', sub: 'What each kitchen appliance is really built to last', cta: 'DM for the PDF →' }
    ]
  },
  {
    key: 'hvac', match: /hvac|heating|cooling|air condition/i,
    groups: [
      // NOTE: \bac\b not bare /ac/ — "Furnace" contains "ac".
      { match: /\bac\b|tune-?up|cooling|condenser|air condition/i, rows: [
        'Measure the temperature split across the evaporator (target 15-22°F)',
        'Check charge with superheat and subcool readings — not beer-can cold',
        'Test the run capacitor microfarads against its rated value',
        'Inspect the contactor for pitted or burnt points',
        'Clean the condenser coil and verify fan rotation',
        'Clear and test the condensate drain and safety float switch'
      ] },
      { match: /furnace|inspection|heating|boiler/i, rows: [
        'Run a combustion analysis and check CO in the flue stream',
        'Inspect the heat exchanger for cracks or corrosion',
        'Test the hot surface igniter or pilot assembly',
        'Verify temperature rise against the equipment plate rating',
        'Clean the flame sensor and verify flame rectification',
        'Check inducer motor draft and pressure switch operation'
      ] },
      { match: /emergency/i, rows: [
        'Safety check first — gas leaks and CO before any repair',
        'Verify breaker, disconnect and low-voltage fuse before diagnosis',
        'Restore safe operating condition before leaving the site',
        'Document the failure with photos and meter readings',
        'Leave a written repair-vs-replace assessment with the homeowner'
      ] },
      { match: /install|replacement|system/i, rows: [
        'Perform a load calculation — never guess tonnage',
        'Verify duct capacity and static pressure for the new size',
        'Pull permits and schedule the required inspections',
        'Pressure-test and evacuate the line set to manufacturer spec',
        'Record final charge, airflow and startup readings on the invoice'
      ] },
      { match: /duct/i, rows: [
        'Inspect the air handler cabinet and blower wheel',
        'Measure total external static pressure before and after',
        'Seal accessible duct leaks with mastic — not tape',
        'Replace or clean filters and verify return-air sizing',
        'Check register boots and take-offs for disconnections'
      ] },
      { match: /maintenance/i, rows: [
        'Replace filters and record the size and date',
        'Check amp draw on the compressor and fan motors',
        'Tighten electrical terminations and inspect wiring',
        'Test thermostat calibration and program schedule',
        'Log refrigerant and airflow readings for year-over-year trends'
      ] }
    ],
    pool: [
      'Photograph the equipment plate and data tag for the file',
      'Check for code clearances around the equipment',
      'Walk the homeowner through the findings before packing up',
      'Stock the truck with the top five failure parts for this brand'
    ],
    social: [
      { hook: 'Why your AC short-cycles', sub: 'The 3 things it costs you — and the fix', cta: 'Book a tune-up →' },
      { hook: 'A real tune-up, not $99 bait', sub: 'Every test we run, listed in order', cta: 'See the checklist →' },
      { hook: 'Filter schedules that fit', sub: 'Pets, allergies, smokers — the intervals differ', cta: 'Save this →' },
      { hook: 'Setpoints that cut the bill', sub: 'The numbers to program and when to leave them alone', cta: 'Follow for more →' },
      { hook: 'The temperature split test', sub: 'Before/after coil cleaning with real readings', cta: 'Book service →' },
      { hook: 'Repair vs replace', sub: 'The rule good techs use — explained honestly', cta: 'DM for an assessment →' }
    ]
  },
  {
    key: 'roofing', match: /roof/i,
    groups: [
      { match: /inspection/i, rows: [
        'Walk every slope and photograph each face before descending',
        'Check flashing at chimneys, walls, vents and penetrations',
        'Inspect valley metal, drip edge and gutter apron',
        'Look for nail pops, lifted tabs and exposed fasteners',
        'Check the attic ventilation ratio and look for daylight or stains',
        'Document hail or wind bruising with dated close-up photos'
      ] },
      { match: /repair/i, rows: [
        'Match shingle brand, color and weathering before opening the bundle',
        'Lift surrounding shingles gently — never walk a warm roof hard',
        'Seal every new fastener and re-seal disturbed tabs',
        'Probe the deck under removed shingles for soft spots',
        'Water-test the repair area before packing up'
      ] },
      { match: /replacement|full replacement/i, rows: [
        'Tear off to the deck — never layer over failed shingles',
        'Inspect and replace soft or delaminated decking',
        'Install ice-and-water shield at eaves and valleys',
        'Nail to the manufacturer pattern — 4-6 nails for high wind',
        'Install ridge vent and verify balanced intake ventilation',
        'Magnetic nail sweep of the yard, gutters and driveway'
      ] },
      { match: /gutter/i, rows: [
        'Set slope at 1/4 inch per 10 feet toward the downspouts',
        'Space hidden hangers every 24 inches, into rafter tails',
        'Inspect fascia boards for rot before mounting anything',
        'Verify downspout discharge moves water away from the foundation',
        'Hose-test water flow to every downspout after install'
      ] },
      { match: /skylight/i, rows: [
        'Inspect the existing flashing kit before quoting',
        'Check the interior drywell for staining before opening the ceiling',
        'Replace step and apron flashing with the manufacturer kit',
        'Verify curb height and interior condensation detailing',
        'Confirm the glass unit and flashing warranty paperwork'
      ] },
      { match: /storm|damage|insurance/i, rows: [
        'Date-stamp every photo with location metadata intact',
        'Mark hit counts on a 10x10 test square for the adjuster',
        'Separate storm damage from ordinary wear in the report',
        'Compare the damage pattern to the storm date and direction',
        'Meet the adjuster on-site whenever possible'
      ] }
    ],
    pool: [
      'Caulk is not flashing — do the metalwork right',
      'Check pipe boots — the first failure point on most roofs',
      'Verify soffit intake is not painted or screened shut',
      'Leave the site magnet-swept every single day'
    ],
    social: [
      { hook: 'Storm season checklist', sub: 'What adjusters actually look for on your roof', cta: 'Book an inspection →' },
      { hook: 'Repair or replace?', sub: 'The honest answer depends on these 3 things', cta: 'Get an assessment →' },
      { hook: 'Ventilation decides lifespan', sub: 'Why the attic is the real roof killer', cta: 'Save this →' },
      { hook: '5 leak points ≠ shingles', sub: 'Where the water is actually getting in', cta: 'Book a leak check →' },
      { hook: 'What a tear-off reveals', sub: 'Layers hide rot — here is what we find underneath', cta: 'Follow for more →' },
      { hook: 'Gutters 101', sub: 'Slope, hangers, and where downspouts should end', cta: 'Book a gutter job →' }
    ]
  },
  {
    key: 'air-duct', match: /duct/i,
    groups: [
      { match: /standard|duct cleaning/i, rows: [
        'Cover registers and establish negative air with a HEPA unit',
        'Remove, wash and bag every supply and return register',
        'Agitate and source-remove debris with brush and vacuum',
        'Clean the air handler cabinet, blower wheel and drain pan',
        'Photograph before and after with the inspection camera',
        'Verify system operation and reseal all access panels'
      ] },
      { match: /deep|sanitiz/i, rows: [
        'Clean the evaporator coil and drain pan with coil-safe chemistry',
        'HEPA-vacuum every accessible duct surface',
        'Apply sanitizers only where justified — never fog by default',
        'Clean or replace the filter-rack gaskets',
        'Re-test airflow after service and document the improvement'
      ] },
      { match: /dryer|vent/i, rows: [
        'Disconnect and clean the dryer transition hose',
        'Replace foil-style transition hoses with rigid or semi-rigid',
        'Brush the entire vent run out to the exterior hood',
        'Verify the backdraft damper opens freely',
        'Measure airflow at the hood before and after the service'
      ] },
      { match: /hvac|system|air handler|coil/i, rows: [
        'Clean the blower motor and wheel; verify amp draw',
        'Clean or replace filters and check the fit',
        'Flush and treat the condensate drain',
        'Check the drain pan slope and treat the pan',
        'Inspect accessible ductwork for gaps and disconnected runs'
      ] },
      { match: /mold|remediat/i, rows: [
        'Test and document growth before disturbing anything',
        'Contain the affected area and run negative air',
        'Remove contaminated flex duct — it cannot be cleaned',
        'HEPA-clean rigid duct and verify with a post-remediation check',
        'Record spore or particulate readings before and after'
      ] },
      { match: /maintenance|annual/i, rows: [
        'Replace filters on schedule and log the date',
        'Check accessible duct connections for air leaks',
        'Clean registers and return grilles',
        'Inspect the drain pan for standing water and growth',
        'Check thermostat batteries and refresh the program schedule'
      ] }
    ],
    pool: [
      'Seal the return plenum — the leakiest part of most systems',
      'Verify no asbestos-containing material before disturbing old duct',
      'Test CO levels at the registers after servicing the furnace side'
    ],
    social: [
      { hook: 'The duct cam footage', sub: 'Before/after from inside the system', cta: 'Book a cleaning →' },
      { hook: 'How often, really?', sub: 'The filter schedule by household type', cta: 'Save this →' },
      { hook: 'The hidden fire risk', sub: 'Dryer vents: the job most homes skip', cta: 'Book a vent clean →' },
      { hook: '“Sanitizing” explained', sub: 'What fogging does, and when it is the wrong call', cta: 'Ask us →' },
      { hook: 'Leaking ducts, leaking money', sub: 'The 5 signs your ductwork is costing you', cta: 'Book a test →' },
      { hook: 'What proper includes', sub: 'The full scope of a real duct cleaning', cta: 'See the checklist →' }
    ]
  },
  {
    key: 'mold', match: /mold|remediat/i,
    groups: [
      { match: /air quality|air test/i, rows: [
        'Collect outdoor control samples before any indoor sampling',
        'Run indoor samples with the HVAC in normal operating condition',
        'Maintain chain of custody from collection to the lab',
        'Photograph every sample location before and after',
        'Report spore counts alongside the control comparison, not in isolation'
      ] },
      { match: /surface|tape|bulk|swab/i, rows: [
        'Tape-lift the suspect surface before any cleaning happens',
        'Swab visible growth and note the substrate it sits on',
        'Take bulk samples of damaged material for lab analysis',
        'Label every sample with location, date and time',
        'Compare indoor species against the outdoor control sample'
      ] },
      // NOTE: post/clearance BEFORE remediation — "Post-Remediation" contains
      // "Remediation"; moisture-mapping and full-inspection get separate rows.
      { match: /post|clearance|verification/i, rows: [
        'Verify moisture content is back to normal range first',
        'Run post-remediation air sampling inside the containment',
        'Compare clearance results against the outdoor control',
        'Hold negative pressure until the final sample is pulled',
        'Release the site in writing only after clearance passes'
      ] },
      { match: /remediation/i, rows: [
        'Set containment with poly sheeting and a negative air machine',
        'Establish airlock entry/exit and post warning signage',
        'Remove porous materials beyond cleaning — drywall, carpet, insulation',
        'HEPA vacuum and damp-wipe every remaining surface',
        'Apply antimicrobial only AFTER physical removal of growth',
        'Bag waste inside containment and dispose per local rules'
      ] },
      { match: /moisture|mapping/i, rows: [
        'Map moisture with a pin meter on a room-by-room grid',
        'Scan with thermal imaging to trace hidden moisture paths',
        'Identify the water source — growth returns until it is fixed',
        'Measure ambient humidity (the healthy range is roughly 30-50%)',
        'Separate visible growth from hidden cavity growth in the findings'
      ] },
      { match: /inspection|inspect/i, rows: [
        'Interview the occupant on history, leaks and health concerns',
        'Walk every room — including closets, attics and crawlspaces',
        'Look for condensation on windows and cold walls',
        'Check the HVAC system and ductwork for mustiness or growth',
        'Photograph and measure everything before writing the report',
        'Rank findings: immediate, short-term and monitor'
      ] }
    ],
    pool: [
      'Never paint over growth — it keeps growing behind the coating',
      'Check the HVAC air handler — it spreads spores system-wide',
      'Wear proper PPE and respiratory protection inside containment',
      'The lab reads the tape, the inspector reads the house — both matter'
    ],
    social: [
      { hook: 'Bleach does not kill it', sub: 'What actually works on drywall and why', cta: 'Book an inspection →' },
      { hook: 'The stain is not the problem', sub: 'Why the water source decides everything', cta: 'Save this →' },
      { hook: '“Black mold” demystified', sub: 'What it really means and what to do first', cta: 'Ask a pro →' },
      { hook: 'Clearance is not optional', sub: 'What post-remediation verification proves', cta: 'Book clearance →' },
      { hook: '30-50% humidity', sub: 'The number that keeps growth from returning', cta: 'Follow for more →' },
      { hook: 'Pro or DIY?', sub: 'Where the line between cleanup and remediation sits', cta: 'Get an assessment →' }
    ]
  },
  {
    key: 'energy-auditor', match: /energy|audit|hers|efficiency/i,
    groups: [
      { match: /basic|audit/i, rows: [
        'Collect 12 months of utility bills before the site visit',
        'Walk the full envelope — attic, basement, crawlspace, garage',
        'Check combustion appliances for spillage and CO risk',
        'Measure attic and wall insulation levels',
        'Prioritize fixes by cost-effectiveness — biggest savings first',
        'Deliver good/better/best options with payback estimates'
      ] },
      { match: /blower|door/i, rows: [
        'Install the blower door panel and seal the frame',
        'Set the house to 50 Pascals and record CFM50',
        'Calculate ACH50 from the home volume',
        'Walk the house with smoke to find the biggest leaks',
        'Seal the identified leaks and re-test to document improvement'
      ] },
      { match: /duct|leakage/i, rows: [
        'Block all registers and pressurize the duct system',
        'Record total duct leakage to outside',
        'Locate leaks with smoke or fog before sealing',
        'Prioritise sealing the boot connections at the register side',
        'Re-test after sealing and document the improvement'
      ] },
      { match: /infrared|scan|thermal/i, rows: [
        'Scan each room from multiple angles with the IR camera',
        'Correlate thermal anomalies with the blower door running',
        'Check for missing insulation, thermal bridging and bypasses',
        'Inspect window glazing and frame thermal bridges',
        'Include annotated IR images in the report'
      ] },
      { match: /hers|rating/i, rows: [
        'Model the home in approved rating software',
        'Verify insulation, windows and equipment by field inspection',
        'Photograph the rated assemblies — windows, insulation, nameplates',
        'Issue the rating certificate and label after verification',
        'Document modeled savings against the pre-retrofit baseline'
      ] },
      { match: /rebate|incentive|program/i, rows: [
        'Match findings to current local rebate and incentive programs',
        'Confirm eligibility before promising any rebate amount',
        'Document pre-retrofit conditions — programs require proof',
        'Sequence the work so the biggest rebate steps land first',
        'Hand over the application links and filing deadlines'
      ] }
    ],
    pool: [
      'Check bath and kitchen fans actually vent outside — not the attic',
      'Look for knob-and-tube or knobbed wiring before insulating',
      'Measure window and door leakage, not just the big holes',
      'Write the report in homeowner language, not trade language'
    ],
    social: [
      { hook: 'Blower door, decoded', sub: 'What CFM50 and ACH50 mean for comfort', cta: 'Book an audit →' },
      { hook: 'The 3 cheapest fixes', sub: 'Fastest payback weatherization wins', cta: 'Save this →' },
      { hook: 'Finding the invisible leak', sub: 'Infrared imaging on a real job', cta: 'Book a scan →' },
      { hook: 'Uneven rooms?', sub: 'It is usually the ducts — here is the proof', cta: 'Book a test →' },
      { hook: 'Rebates nobody claims', sub: 'The incentive programs homeowners miss', cta: 'Ask us →' },
      { hook: 'Audit vs estimate', sub: 'Why a real audit costs more and saves more', cta: 'Book yours →' }
    ]
  },
  {
    key: 'beekeeping', match: /bee|apiar|hive/i,
    groups: [
      { match: /hive|inspection/i, rows: [
        'Read the brood pattern before looking for the queen',
        'Confirm eggs or young larvae — the proof of a laying queen',
        'Estimate bee coverage and remaining stores frame by frame',
        'Check the bottom bars for swarm cells',
        'Record observations on the hive card before closing up',
        'Work frames gently and keep the colony covered'
      ] },
      { match: /colony|assessment/i, rows: [
        'Assess temperament on a calm day — note defensive behavior',
        'Estimate population against the season and the queen’s age',
        'Screen for disease signs: chalkbrood, dysentery, deformed wing',
        'Score the stores: honey above, pollen beside the brood nest',
        'Recommend feeding, splitting or requeening from the findings'
      ] },
      { match: /swarm|removal/i, rows: [
        'Locate the cluster and identify the primary comb',
        'Set a nuc or box with drawn comb below the cluster',
        'Shake or brush the bees in and leave an entrance',
        'Return at dusk to collect and relocate the colony',
        'Follow local requirements for removals and relocation'
      ] },
      { match: /honey|extraction/i, rows: [
        'Pull only capped frames — moisture above ~18% ferments',
        'Uncap and extract the same day to limit crystallization',
        'Filter and settle the honey before bottling',
        'Bottle and label with harvest date and yard location',
        'Return wet frames to the colony for cleanup'
      ] },
      { match: /queen|rearing/i, rows: [
        'Select breeder stock for temperament and production',
        'Graft larvae at the right age into cell builders',
        'Mark and introduce the mated queen with a slow release',
        'Keep a spare queen or cell ready in case of rejection',
        'Track mating dates and first-egg evidence on the hive card'
      ] },
      { match: /training/i, rows: [
        'Cover hive tool, smoker and protective gear basics',
        'Walk a live frame-by-frame inspection together',
        'Build the beginner an inspection-kit checklist',
        'Teach the seasonal rhythm: feed, space, treat, harvest',
        'Point to local bee clubs and mentor programs'
      ] }
    ],
    pool: [
      'Run a sugar roll or alcohol wash — treat above threshold',
      'Rotate miticide classes to prevent resistance',
      'Watch for chalkbrood, dysentery and deformed wing virus',
      'Report suspected American foulbrood to the apiary inspector',
      'Heft the hive for stores — feed 1:1 in spring, 2:1 in fall',
      'Add space before the bees feel crowded',
      'Install mouse guards before the first frost',
      'Wrap or ventilate for winter based on your climate'
    ],
    social: [
      { hook: 'Swarm season is here', sub: 'What to do the hour you spot a cluster', cta: 'Call for removal →' },
      { hook: 'Mite counts explained', sub: 'The sugar roll, the threshold, the treatment', cta: 'Save this →' },
      { hook: 'Frame by frame', sub: 'What a real hive inspection looks like', cta: 'Follow for more →' },
      { hook: 'The local flow calendar', sub: 'What is blooming and when the bees need space', cta: 'Get the calendar →' },
      { hook: 'The gear you overbuy', sub: 'What beginners actually need — and what can wait', cta: 'Ask us →' },
      { hook: 'Healthy vs failing brood', sub: 'Before/after pattern reads side by side', cta: 'Book an inspection →' }
    ]
  },
  {
    key: 'smart-recovery', match: /smart|cbt|cognitive/i,
    groups: [
      // NOTE: specific patterns first — "Change Plan Worksheet" contains
      // "Worksheet" (ABC group) and "ABC Worksheet" must not claim it.
      { match: /change|plan/i, rows: [
        'Write the change goal in observable, measurable terms',
        'List the methods, the people who help, and the obstacles',
        'Set the review date and how you will measure progress',
        'Plan the lapse response in advance — what to do if',
        'Share the plan with someone who will ask about it weekly'
      ] },
      { match: /cost|benefit/i, rows: [
        'List the short-term pros and cons of using',
        'List the long-term pros and cons of not using',
        'Keep the completed CBA where the urge actually happens',
        'Re-rate the “pros” once the craving has passed — they shrink',
        'Revisit and revise the CBA after a lapse — without shame'
      ] },
      { match: /urge|trigger|log/i, rows: [
        'Log the trigger, time, intensity (0-10) and what followed',
        'Use DEADS: delay, escape, avoid, distract, substitute',
        'Spot the pattern — urges crest and pass in minutes',
        'Track the time-of-day pattern — urges cluster around routines',
        'Pre-plan the substitute action for your top three triggers'
      ] },
      { match: /values|hierarchy/i, rows: [
        'Rank your top values — the ones you would defend out loud',
        'Score how much time each value actually got this week',
        'Close the gap: schedule one action for the top value today',
        'Hold the change plan against the values list — not against cravings',
        'Revisit the ranking each season — values drift with life stages'
      ] },
      { match: /abc|worksheet|cbt/i, rows: [
        'Name the Activating event — just the facts, no story',
        'Write the Belief — the demand you put on the event',
        'Map the Consequence — the feeling that followed the belief',
        'Dispute the belief: is it true? is it helpful? is it logical?',
        'Write the effective new belief and re-rate the feeling 0-10'
      ] }
    ],
    pool: [
      'Play the tape forward through the whole day, not the first hour',
      'Urge surfing: rate it every minute and watch it fall',
      'Fill the time the use used to fill — boredom is a trigger',
      'Self-talk check: “I choose to” beats “I have to”',
      'Bring the completed tool to the next meeting and check in'
    ],
    complete: 'Build motivation with a fresh CBA (Point 1), practise urge coping with DEADS (Point 2), dispute demand beliefs with ABC (Point 3), and rebalance lifestyle with VACI (Point 4) — one tool per week, reviewed at the weekly check-in.',
    social: []
  },
  {
    key: 'refuge-recovery', match: /refuge|buddh|dharma/i,
    groups: [
      { match: /meditation|log/i, rows: [
        'Sit 10-20 minutes — breath counting, then open awareness',
        'Note the craving as sensation: where it lives, how it moves',
        'Practise loving-kindness toward yourself and the difficult person',
        'Log sit time, posture and what came up — without judgment',
        'Close with one intention for the day'
      ] },
      { match: /mindfulness|tracker/i, rows: [
        'Track daily sits — streak, duration and time of day',
        'Note the states that showed up: restlessness, dullness, clarity',
        'Mark the moments you caught reactivity before acting on it',
        'Rate craving intensity before and after each sit',
        'Notice which practices move the needle — and do more of them'
      ] },
      { match: /dharma|study/i, rows: [
        'Read one passage and note where it lands in your life',
        'Contemplate the Four Noble Truths as they apply to you',
        'Study the Eightfold Path — one factor per week',
        'Memorise one passage that steadies you — return to it in craving',
        'Bring the reading to the sangha discussion'
      ] },
      { match: /inventory|suffering/i, rows: [
        'List today’s aversions — what you pushed away and why',
        'List today’s grasping — what you chased and why',
        'Trace both back to the underlying fear or want',
        'Sit with the feeling instead of acting on it — note what changes',
        'Share the inventory with a trusted friend or mentor'
      ] },
      { match: /practice|daily|planner/i, rows: [
        'Morning: intention, reading, and ten minutes of silence',
        'Midday: three breaths before the first reactive moment',
        'Evening: an inventory of the day without self-attack',
        'Set a regular sit time — consistency beats duration',
        'Plan tomorrow’s meeting or practice session'
      ] }
    ],
    pool: [
      'The craving is a wave — it rises, crests and falls',
      'Sangha: practice is easier in the company of others',
      'Renunciation is a gift, not a punishment',
      'Speak your truth in the meeting — being heard loosens the grip',
      'Service: set up chairs, welcome the newcomer, carry the cushions'
    ],
    complete: 'Establish the daily sitting practice (Foundation), work the inventory of suffering (Honesty), study the Eightfold Path (Understanding), and join the sangha with a service role (Community) — the four supports of the path.',
    social: []
  },
  {
    key: 'aa-12-step', match: /12-step|12 step|\baa\b|alcoholics/i,
    groups: [
      // NOTE: order matters — "10th Step Daily Inventory" contains "inventory"
      // and "Daily Reflection Journal" must not claim the 10th-step rows.
      { match: /reflection|journal/i, rows: [
        'Morning reading and a written intention for the day',
        'Pause at night: where was I selfish, dishonest, afraid?',
        'List three specific gratitudes — no repeats from yesterday',
        'Note the using thought and what preceded it',
        'End with the plan for tomorrow morning'
      ] },
      { match: /10th step|daily inventory/i, rows: [
        'Review the day: was I resentful, selfish, dishonest or afraid?',
        'Make it right the same day when someone was affected',
        'Discuss the inventory with a sponsor or trusted person',
        'Spot the fear beneath the resentment and name it plainly',
        'Close with gratitude and the plan for the morning'
      ] },
      { match: /4th step|inventory/i, rows: [
        'List the resentments — the person, the cause, what it affected',
        'Name the instinct behind each: security, social standing, pride, sex',
        'Write your honest part in each situation — without excusing others',
        'Read the inventory to a sponsor or trusted person (5th Step)',
        'Circle the repeated patterns — they point to the real defects'
      ] },
      { match: /meeting|attendance/i, rows: [
        'Log date, format and location of each meeting',
        'Note the speaker or topic and one takeaway',
        'Track 90 meetings in 90 days if that is your plan',
        'Try the formats — speaker, big book, step study — before settling',
        'Collect phone numbers — connection is the point of the room'
      ] },
      { match: /milestone|sobriety|planner/i, rows: [
        'Set the next milestone and how you will mark it',
        'Plan sober support for high-risk dates and holidays',
        'List the people you will call if the craving hits',
        'Write down the reasons you quit — reread them on hard days',
        'Mark the milestone with something sober and memorable'
      ] },
      { match: /complete|workbook|12/i, rows: [
        'Work Steps 1-3 with a sponsor, not alone',
        'Write the inventory (4th) and read it out (5th)',
        'List amends (8th) — living amends where direct ones would harm',
        'Practise the daily 10th-step review',
        'Carry the message (12th) — service keeps the sobriety'
      ] }
    ],
    pool: [
      'Keep a daily reprieve — the goal is just today',
      'HALT: hungry, angry, lonely, tired — check the basics first',
      'Call your sponsor before the decision, not after',
      'Withdrawal from alcohol or benzodiazepines can be medically dangerous — seek medical supervision',
      'Make the coffee, greet the newcomer — service is medicine'
    ],
    social: []
  }
];

function nicheFor(prof) {
  const name = String((prof && prof.name) || '');
  for (const n of NICHE) if (n.match.test(name)) return n;
  return null;
}

// Distinct procedure rows for one checklist group (service section). Resolution:
// service-keyed rows → niche pool (rotated per group) → CONTENT category
// checklist (rotated) → null (builder keeps its last resort).
// NOTE: a niche that ships checklist products MUST carry service-keyed `groups`
// OR a `pool` of at least `numGroups * count` distinct rows — otherwise two
// groups rotate onto the same window and duplicate (the builder's safety net is
// the trade-true content moat, never generic filler).
function checklistRowsFor(prof, groupTitle, groupIndex = 0, count = 5) {
  const rotate = (arr) => {
    const i = ((Number(groupIndex) || 0) * count) % Math.max(1, arr.length);
    return arr.slice(i).concat(arr.slice(0, i));
  };
  const niche = nicheFor(prof);
  if (niche) {
    const g = (niche.groups || []).find(x => x.match.test(String(groupTitle || '')));
    const rows = (g && g.rows && g.rows.length) ? g.rows : (niche.pool || []);
    if (rows.length) return rotate(rows).slice(0, count);
  }
  const cat = getContentFor(prof);
  if (cat && Array.isArray(cat.checklist) && cat.checklist.length) {
    return rotate(cat.checklist).slice(0, count);
  }
  return null;
}

// Social post angle for one variant (the social packs ship 4 posts).
function socialAngleFor(prof, variant = 0) {
  const niche = nicheFor(prof);
  const list = (niche && Array.isArray(niche.social) && niche.social.length) ? niche.social : null;
  if (!list) return null;
  const a = list[(Number(variant) || 0) % list.length];
  return a && a.hook ? a : null;
}

module.exports = { CONTENT, NICHE, getCategory, getContentFor, nicheFor, checklistRowsFor, socialAngleFor };