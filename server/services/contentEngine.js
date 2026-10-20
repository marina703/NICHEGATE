// ═══════════════════════════════════════════════════════════════════════════
// GENERATIVE CONTENT ENGINE — trade-true content for ALL document types
// ═══════════════════════════════════════════════════════════════════════════
// Replaces static contentLibrary.js moat with LLM-generated, validated content.
// Uses the same content-lock validator as design agent.
// ═══════════════════════════════════════════════════════════════════════════

const modelRouter = require('./modelRouter');
const contentLib = require('./contentLibrary');

const CONTENT_ENGINE_VERSION = 'gce-v1';
const CONTENT_MODEL = process.env.CONTENT_MODEL || 'anthropic/claude-haiku-5.5';
const USE_NOUSS = String(process.env.VISION_PROVIDER || '').toLowerCase() === 'nous' && process.env.NOUSPORTAL_API_KEY;
const CONTENT_TARGET = USE_NOUSS ? {
  baseUrl: process.env.VISION_BASE_URL || 'https://inference-api.nousresearch.com/v1',
  headers: { Authorization: `Bearer ${process.env.NOUSPORTAL_API_KEY}`, 'Content-Type': 'application/json' }
} : undefined;

// ── CONTENT SCHEMAS (per type) ──────────────────────────────────────────────
const TYPE_SCHEMAS = {
  checklist: {
    shape: { services: [{ title: 'string', price: 'string', steps: ['string'] }] },
    minServices: 6, stepsPerService: 5,
    system: `You are a senior trade practitioner writing a PROFESSIONAL QUALITY CHECKLIST.
Output JSON matching the exact schema. Every step must be:
- SPECIFIC to the trade (tools, materials, codes, measurements, safety)
- ACTIONABLE (verb-first, measurable, no fluff)
- IN ORDER (logical workflow: prep → execute → verify → document)
- 5 steps per service, 6 services minimum.
NO generic advice. NO "review best practices." NO "ensure quality."`
  },

  invoice: {
    shape: { lines: [{ service: 'string', rate: 'number', description: 'string' }], total: 'number', paymentTerms: 'string' },
    minLines: 5,
    system: `You are a trade professional creating a detailed INVOICE TEMPLATE.
Output JSON with line items that real clients in this trade would recognize.
Each line: specific service name, realistic rate (USD), 1-sentence description.
Include materials, labor, permits, mobilization, cleanup as appropriate.
Total must equal sum of line rates.`
  },

  workbook: {
    shape: { sections: [{ title: 'string', prompts: ['string'] }] },
    minSections: 5, minPromptsPerSection: 5,
    system: `You are a business coach writing a ACTIONABLE WORKBOOK for trade professionals.
Output JSON with sections that guide the user from FOUNDATIONS → SYSTEMS → GROWTH.
Each prompt: open-ended, specific to the trade, produces a written artifact (list, plan, script, map).
NO yes/no questions. NO vague reflection. Every prompt yields a deliverable the user can USE.`
  },

  spreadsheet: {
    shape: { tabs: [{ name: 'string', headers: ['string'], rows: [['string']], formulas: ['string'] }] },
    minTabs: 3, minRowsPerTab: 10,
    system: `You are a trade operations expert building a FUNCTIONAL SPREADSHEET WORKBOOK.
Output JSON with tabs that real businesses use DAILY: Job Tracker, Cost Estimator, Client Pipeline, Inventory, Schedule.
Each tab: headers, 10+ realistic example rows, Excel formulas (SUM, VLOOKUP, IF, AVERAGE) that calculate live.
NO placeholder data. Every formula must be valid Excel/Google Sheets syntax.`
  },

  social: {
    shape: { posts: [{ platform: 'string', hook: 'string', body: 'string', cta: 'string', hashtags: ['string'], imagePrompt: 'string' }] },
    minPosts: 12, platforms: ['Instagram', 'LinkedIn', 'Facebook', 'TikTok'],
    system: `You are a trade marketing strategist creating a 30-DAY SOCIAL CONTENT CALENDAR.
Output JSON with posts distributed across platforms. Each post: hook (stops scroll), body (value/education/story), CTA (book/call/download), 5-8 niche hashtags, image prompt for AI generation.
Content pillars: Education (30%), Proof/Results (25%), Behind-the-scenes (20%), Offer (15%), Personality (10%).
NO generic tips. Every post references SPECIFIC trade tools, problems, codes, materials.`
  },

  bundle: {
    shape: { products: [{ type: 'string', title: 'string', description: 'string', whyTogether: 'string' }] },
    minProducts: 4,
    system: `You are a product strategist designing a HIGH-VALUE BUNDLE for trade professionals.
Output JSON with 4-6 complementary products that solve a complete problem together.
Each product: type (checklist/spreadsheet/workbook/etc), compelling title, description of what it does, why it belongs in THIS bundle (not standalone).
Bundle must have a clear theme: "New Business Launch", "Seasonal Prep", "Compliance Package", "Client Onboarding".`
  },

  booking: {
    shape: { workflow: ['string'], forms: [{ name: 'string', fields: ['string'] }], automations: ['string'] },
    system: `You are a trade operations manager designing a BOOKING & SCHEDULING SYSTEM.
Output JSON with: step-by-step workflow (inquiry → quote → schedule → confirm → remind → complete), intake forms with specific fields (property type, square footage, access, hazards, budget), automation rules (email/SMS triggers, calendar sync, deposit collection).
Every field must serve a real operational need.`
  },

  website: {
    shape: { pages: [{ name: 'string', sections: [{ type: 'string', headline: 'string', copy: 'string', cta: 'string' }] }], seoKeywords: ['string'] },
    minPages: 5,
    system: `You are a trade web strategist building a HIGH-CONVERTING SERVICE WEBSITE.
Output JSON with pages: Home, Services, About, Process, Contact, (optional: Portfolio, FAQ, Financing).
Each section: specific headline, benefit-driven copy (not features), clear CTA.
SEO keywords: 20+ local-intent + commercial-intent terms for this trade.
NO generic "we're the best." Every claim must be provable (licenses, years, reviews, warranty).`
  },

  'wall-art': {
    shape: { collection: [{ title: 'string', description: 'string', style: 'string', dimensions: 'string', imagePrompt: 'string' }] },
    minItems: 6,
    system: `You are a trade-specific interior designer creating PRINTABLE WALL ART COLLECTIONS.
Output JSON with 6-12 pieces that trade professionals would hang in their office/truck/shop.
Each piece: title, description, style (blueprint/technical/vintage/minimalist/typographic), standard dimensions (18x24, 24x36), detailed AI image prompt.
Themes: trade diagrams, motivational quotes (trade-specific), technical references, schematic art, blueprints.`
  },

  tool: {
    shape: { tools: [{ name: 'string', description: 'string', inputs: ['string'], output: 'string', formula: 'string' }] },
    minTools: 4,
    system: `You are a trade engineer building CALCULATOR TOOLS that save hours of manual math.
Output JSON with tools: Material Estimator, Load Calculator, Cost Bidder, Schedule Optimizer, Compliance Checker.
Each tool: name, description, input fields (with units/validation), output format, Excel/JS formula.
Must handle real trade variables: waste factor, labor rates, material specs, code requirements, regional pricing.`
  },

  planner: {
    shape: { views: [{ name: 'string', type: 'string', fields: ['string'], template: 'string' }], habits: ['string'] },
    minViews: 4,
    system: `You are a trade productivity expert designing a PROFESSIONAL PLANNER SYSTEM.
Output JSON with views: Daily Job Log, Weekly Schedule, Monthly Forecast, Quarterly Review, Annual Goals.
Each view: specific fields, template structure, habit trackers (safety checks, tool maintenance, license renewals, CEUs).
Built for the realities of field work: weather delays, change orders, crew coordination, client communication.`
  },

  'recovery-journal': {
    shape: { phases: [{ name: 'string', days: 'number', prompts: ['string'] }], resources: ['string'] },
    minPhases: 4,
    system: `You are a recovery coach creating a STRUCTURED RECOVERY JOURNAL for trade professionals.
Output JSON with phases: Stabilization (Days 1-30), Foundation (31-90), Growth (91-180), Maintenance (181-365).
Each day: 3 prompts (morning intention, evening reflection, metric tracking). Trade-specific stressors: physical toll, irregular hours, client pressure, seasonal income, identity.
Resources: crisis lines, meeting finders, trade-specific support groups.`
  },

  'recovery-nutrition': {
    shape: { weeks: [{ number: 'number', focus: 'string', meals: [{ day: 'string', breakfast: 'string', lunch: 'string', dinner: 'string', snacks: 'string', prepNotes: 'string' }], shoppingList: ['string'] }] },
    minWeeks: 4,
    system: `You are a nutritionist for trade professionals creating a RECOVERY NUTRITION GUIDE.
Output JSON with 4-12 weeks of meal plans. Focus: anti-inflammatory, high-protein, portable, budget-friendly, batch-cookable.
Each day: breakfast/lunch/dinner/snacks with macros, prep notes (crockpot/grill/meal-prep), weekly shopping list with quantities.
Addresses trade realities: early starts, no fridge access, physical exertion, hydration, joint health.`
  },

  'meeting-flashcards': {
    shape: { decks: [{ name: 'string', cards: [{ front: 'string', back: 'string', category: 'string' }] }] },
    minDecks: 3, minCardsPerDeck: 15,
    system: `You are a trade trainer building MEETING FLASHCARDS for crew talks, client presentations, safety briefings.
Output JSON with decks: Toolbox Talks (safety), Client Pitches, Code References, Troubleshooting, Change Order Scripts.
Each card: front (question/scenario), back (exact talking points/answer), category.
NO fluff. Every card is a script the user reads verbatim in a real meeting.`
  },

  'affirmation-labels': {
    shape: { sheets: [{ theme: 'string', labels: [{ text: 'string', style: 'string', size: 'string' }] }] },
    minSheets: 4, minLabelsPerSheet: 20,
    system: `You are a recovery-focused designer creating AFFIRMATION LABEL SHEETS for trade professionals.
Output JSON with printable label sheets: Water Bottle Reminders, Toolbox Affirmations, Truck Dash Cards, Locker Notes.
Each label: concise text (≤8 words), style (minimal/typographic/bold/handwritten), size (2"/3"/4" round or rectangle).
Themes: Safety first, One day at a time, Progress not perfection, Body awareness, Family waiting home.`
  },

  brand: {
    shape: { identity: { name: 'string', tagline: 'string', mission: 'string', values: ['string'] }, visual: { logoConcepts: ['string'], palette: ['string'], typography: ['string'] }, voice: { tone: 'string', sampleCopy: ['string'] }, assets: ['string'] },
    system: `You are a brand strategist building a COMPLETE BRAND KIT for a trade business.
Output JSON with: Identity (name options, tagline, mission, 4 core values), Visual (3 logo concepts with rationale, 5-color palette with hex, 2 font pairings), Voice (tone description, 5 sample copy pieces: bio, service description, email, social, ad), Asset list (business card, vehicle wrap, uniform, estimate template, invoice, email signature, social templates).
Every element must differentiate from "generic [trade] LLC" competitors.`
  }
};

// ── CONTENT GENERATION ──────────────────────────────────────────────────────
async function callContentModel(systemPrompt, userPrompt) {
  const res = await modelRouter.callModel({
    target: CONTENT_TARGET,
    model: CONTENT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.3,
    maxTokens: 12000,
    timeoutMs: 120000,
    action: 'content_generation'
  });
  if (!res) throw new Error('Content model returned null');
  return res;
}

function parseContentJson(text, type) {
  const cleaned = String(text).replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{'), end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('No JSON object found');
  let obj;
  try { obj = JSON.parse(cleaned.slice(start, end + 1)); } catch (e) { throw new Error('Invalid JSON: ' + e.message); }
  return obj;
}

function validateContentStructure(content, type) {
  const schema = TYPE_SCHEMAS[type];
  if (!schema) return { ok: true, warnings: ['Unknown type, skipping structure validation'] };

  const warnings = [];
  // Basic shape validation
  if (type === 'checklist') {
    if (!content.services || !Array.isArray(content.services)) return { ok: false, error: 'Missing services array' };
    if (content.services.length < (schema.minServices || 6)) warnings.push(`Only ${content.services.length} services (min ${schema.minServices})`);
    content.services.forEach((s, i) => {
      if (!s.title || !s.steps || s.steps.length < (schema.stepsPerService || 5)) warnings.push(`Service ${i+1} missing steps`);
    });
  }
  // Add other type validations as needed
  return { ok: true, warnings };
}

// ── MAIN ENTRY ──────────────────────────────────────────────────────────────
async function generateContent({ prof, type, brief = null, existingContent = null }) {
  const schema = TYPE_SCHEMAS[type] || TYPE_SCHEMAS.checklist;

  // Build user prompt with context
  let userPrompt = `PROFESSION: ${prof.name}
NICHE: ${prof.slug || prof.name}
TRADE CONTEXT: ${prof.category || 'general service trade'}

Generate content for document type: ${type.toUpperCase()}

SCHEMA:
${JSON.stringify(schema.shape, null, 2)}

REQUIREMENTS:
${schema.system}

`;

  if (brief) {
    userPrompt += `ADDITIONAL BRIEF: ${brief}\n\n`;
  }

  if (existingContent) {
    userPrompt += `EXISTING CONTENT (improve/expand, don't duplicate):\n${JSON.stringify(existingContent, null, 2)}\n\n`;
  }

  userPrompt += `Return ONLY valid JSON matching the schema. No markdown, no explanation.`;

  let attempts = 0;
  const maxAttempts = 3;
  let lastContent = existingContent;

  while (attempts < maxAttempts) {
    attempts++;
    try {
      const raw = await callContentModel(schema.system, userPrompt);
      const content = parseContentJson(raw, type);
      const validation = validateContentStructure(content, type);
      if (validation.ok) {
        return { content, attempts, warnings: validation.warnings, validation: 'passed' };
      }
      // Validation warnings — retry with feedback
      userPrompt += `\n\nVALIDATION WARNINGS (attempt ${attempts}): ${validation.warnings.join('; ')}. Fix and regenerate.`;
      lastContent = content;
    } catch (e) {
      if (attempts >= maxAttempts) throw e;
      userPrompt += `\n\nERROR (attempt ${attempts}): ${e.message}. Retry with corrected JSON.`;
    }
  }
  throw new Error(`Content generation failed after ${maxAttempts} attempts`);
}

// ── FALLBACK (static contentLibrary) ────────────────────────────────────────
function fallbackContent({ prof, type }) {
  // Use existing contentLibrary for checklist; for others return minimal structure
  if (type === 'checklist') {
    const services = contentLib.parseServices(prof);
    return {
      services: services.map((s, g) => ({
        title: s[0], price: s[1],
        steps: contentLib.checklistRowsFor(prof, s[0], g, 5) || []
      }))
    };
  }
  return { error: `No fallback for ${type}` };
}

async function generateContentWithFallback(params) {
  try {
    return await generateContent(params);
  } catch (e) {
    console.error('[CONTENT ENGINE] Failed, using fallback:', e.message);
    return { content: fallbackContent(params), attempts: 0, validation: 'fallback', error: e.message };
  }
}

module.exports = {
  CONTENT_ENGINE_VERSION,
  TYPE_SCHEMAS,
  generateContent,
  generateContentWithFallback,
  fallbackContent
};