// ── NICHE SERVICES ── single owner of the "what does this niche sell" plan ────
// Used whenever a profession is auto-created (trend activation, competitor
// import, custom-niche generation). Deterministic and offline — hard rule:
// nothing may require the AI layer. Replaces the old placeholder junk
// ("Digital Template $15", "Complete Kit $29") that rendered as generic filler
// inside every deliverable.
const designStyles = require('./designStyles');

// Real, niche-plausible offerings per category: [service, price] rows that the
// deliverable builders render as service line items.
const SERVICE_PLANS = {
  creator: [
    ['Content Strategy Session', '$150'], ['Growth & Monetization Audit', '$95'],
    ['Sponsorship Media Kit', '$120'], ['30-Day Content Calendar', '$175'],
    ['Affiliate Setup Playbook', '$60'], ['Full Growth Toolkit', '$249']
  ],
  tech: [
    ['Automation Setup', '$450'], ['Workflow Audit', '$250'], ['Integration Build', '$800'],
    ['Training Session', '$350'], ['Monthly Retainer', '$600'], ['Starter Package', '$299']
  ],
  trades: [
    ['Service Call', '$150'], ['Full Inspection', '$250'], ['Standard Repair', '$450'],
    ['Major Repair', '$950'], ['Maintenance Visit', '$180'], ['Emergency Callout', '$350']
  ],
  wellness: [
    ['Discovery Session', '$80'], ['60-Min Session', '$120'], ['Package of 4', '$420'],
    ['Lifestyle Plan', '$190'], ['Follow-Up Check-In', '$60'], ['Full Program', '$650']
  ],
  recovery: [
    ['1:1 Coaching Session', '$75'], ['Weekly Check-In', '$50'], ['Personal Recovery Plan', '$140'],
    ['Workbook Set', '$35'], ['Milestone Package', '$120'], ['Full Program', '$390']
  ],
  food: [
    ['Tasting Menu', '$45/pp'], ['Private Event', '$600'], ['Meal Prep Week', '$220'],
    ['Custom Cake', '$180'], ['Cooking Class', '$95'], ['Catering Package', '$1200']
  ],
  beauty: [
    ['Consultation', '$40'], ['Standard Service', '$85'], ['Premium Service', '$150'],
    ['Bridal Package', '$350'], ['Monthly Membership', '$120'], ['Full Glam Package', '$220']
  ],
  fashion: [
    ['Style Edit', '$250'], ['Wardrobe Audit', '$350'], ['Personal Shopping', '$450'],
    ['Seasonal Lookbook', '$150'], ['Event Styling', '$220'], ['Full Package', '$800']
  ],
  fitness: [
    ['Fitness Assessment', '$60'], ['Single Session', '$85'], ['8-Week Program', '$480'],
    ['Nutrition Add-On', '$150'], ['Group Class', '$25'], ['Coaching Package', '$699']
  ],
  outdoor: [
    ['Half-Day Trip', '$250'], ['Full-Day Trip', '$450'], ['Guided Tour', '$180'],
    ['Gear Rental', '$75'], ['Season Package', '$900'], ['Private Charter', '$1200']
  ],
  home: [
    ['Consultation', '$120'], ['Single Room', '$450'], ['Full Home', '$1800'],
    ['Organization Visit', '$250'], ['Seasonal Refresh', '$350'], ['Complete Package', '$2400']
  ],
  finance: [
    ['Bookkeeping Month', '$350'], ['Tax Prep', '$450'], ['Advisory Session', '$200'],
    ['Payroll Setup', '$300'], ['Quarterly Review', '$250'], ['Full Service Plan', '$900']
  ],
  spiritual: [
    ['Study Session', '$40'], ['Ceremony', '$300'], ['Guided Practice', '$60'],
    ['Workshop', '$95'], ['Retreat Day', '$250'], ['Full Program', '$450']
  ],
  craft: [
    ['Custom Piece', '$85'], ['Workshop Seat', '$65'], ['Pattern Pack', '$18'],
    ['Materials Kit', '$45'], ['Commission — Large', '$320'], ['Complete Bundle', '$129']
  ],
  pyro: [
    ['Show Design', '$450'], ['Permit Filing', '$250'], ['Firing System Setup', '$600'],
    ['On-Site Crew', '$900'], ['Cleanup & Inspection', '$200'], ['Full Production', '$2800']
  ],
  default: [
    ['Consultation', '$95'], ['Starter Package', '$149'], ['Core Service', '$250'],
    ['Premium Package', '$450'], ['Monthly Retainer', '$300'], ['Complete Toolkit', '$299']
  ]
};

/** Services JSON ([[name, price], …]) for an auto-created niche profession. */
function servicesForNiche(name) {
  const cat = designStyles.detectNicheCategory({ name: String(name || '') });
  return JSON.stringify(SERVICE_PLANS[cat] || SERVICE_PLANS.default);
}

module.exports = { servicesForNiche, SERVICE_PLANS };
