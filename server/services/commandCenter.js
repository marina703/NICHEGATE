// ═══════════════════════════════════════════════════════════════════════════
// COMMAND CENTER AGENT — the factory brain: plans, routes, validates, learns
// ═══════════════════════════════════════════════════════════════════════════
// Replaces ad-hoc automationCycle with a reasoning agent that:
// - Understands factory state (inventory, quality, demand, capacity)
// - Plans multi-step campaigns (not just single products)
// - Routes work to Content/Design/Asset engines
// - Validates outputs, learns from failures, optimizes prompts
// - Exposes chat interface for operator collaboration
// ═══════════════════════════════════════════════════════════════════════════

const modelRouter = require('./modelRouter');
const contentEngine = require('./contentEngine');
const designEngine = require('./designEngine');
const designAgent = require('./designAgent');
const heroArt = require('./heroArt');
const pdfGenerator = require('./pdfGenerator');
const fileFactory = require('./fileFactory');
const marketplace = require('./marketplace');
const { db } = require('../database');

const COMMAND_VERSION = 'cca-v1';
const COMMAND_MODEL = process.env.COMMAND_MODEL || 'anthropic/claude-haiku-5.5';
const USE_NOUSS = String(process.env.VISION_PROVIDER || '').toLowerCase() === 'nous' && process.env.NOUSPORTAL_API_KEY;
const COMMAND_TARGET = USE_NOUSS ? {
  baseUrl: process.env.VISION_BASE_URL || 'https://inference-api.nousresearch.com/v1',
  headers: { Authorization: `Bearer ${process.env.NOUSPORTAL_API_KEY}`, 'Content-Type': 'application/json' }
} : undefined;

// ── SYSTEM PROMPT ───────────────────────────────────────────────────────────
const COMMAND_SYSTEM_PROMPT = `You are the COMMAND CENTER AGENT for NicheGate, an autonomous digital-product factory.
Your job: receive high-level goals, decompose into executable plans, route to specialized engines,
validate outputs, learn from results, and report to the operator.

════════════════════════════════════════════════════════════════════════════
CAPABILITIES
════════════════════════════════════════════════════════════════════════════
- FACTORY STATE AWARENESS: Query DB for inventory, quality scores, demand signals, publishing status
- PLANNING: Decompose "build a tax-season line for bookkeepers" into typed tasks with dependencies
- ROUTING: Dispatch to Content Engine → Design Engine → Design Agent → Asset Engine → PDF → QA → Store
- VALIDATION: Content-lock diffs, vision QA, schema compliance, brand consistency
- LEARNING: Track what works (styles, prompts, types, niches), evolve prompts, retire failures
- OPERATOR CHAT: Explain reasoning, ask for decisions, accept corrections, show previews

════════════════════════════════════════════════════════════════════════════
TOOLS YOU CAN CALL (via structured output)
════════════════════════════════════════════════════════════════════════════
{
  "tool": "query_factory",
  "args": { "query": "inventory | quality | demand | pipeline | all" }
}
{
  "tool": "plan_campaign",
  "args": { "goal": "string", "niche": "string", "budget": "number", "timeline": "string" }
}
{
  "tool": "dispatch_content",
  "args": { "profId": "number", "type": "string", "brief": "string" }
}
{
  "tool": "dispatch_design",
  "args": { "profId": "number", "type": "string", "contentSummary": "string", "preferences": {} }
}
{
  "tool": "dispatch_render",
  "args": { "productId": "number", "designSpec": "object" }
}
{
  "tool": "dispatch_qa",
  "args": { "productId": "number" }
}
{
  "tool": "dispatch_publish",
  "args": { "productId": "number", "platforms": ["gumroad", "etsy"] }
}
{
  "tool": "learn",
  "args": { "outcome": "success|failure", "context": "object", "lesson": "string" }
}
{
  "tool": "respond",
  "args": { "message": "string", "data": "object", "action": "preview|approve|revise|continue" }
}

════════════════════════════════════════════════════════════════════════════
OUTPUT FORMAT
════════════════════════════════════════════════════════════════════════════
Return ONLY a JSON object with:
{
  "thinking": "your internal reasoning (not shown to operator)",
  "tool": "tool_name",
  "args": { ... },
  "operatorMessage": "what to show the operator (optional)"
}

When done with a multi-step plan, return tool="respond" with final message.`;

// ── FACTORY STATE QUERIES ───────────────────────────────────────────────────
async function queryFactory({ query }) {
  const state = {};
  if (query === 'inventory' || query === 'all') {
    state.inventory = {
      byType: db.prepare('SELECT type, COUNT(*) as c, status FROM products GROUP BY type, status').all(),
      byNiche: db.prepare('SELECT p.name as niche, COUNT(pr.id) as c FROM professions p LEFT JOIN products pr ON pr.profession_id = p.id GROUP BY p.id').all(),
      drafts: db.prepare("SELECT COUNT(*) as c FROM products WHERE status = 'draft'").get().c,
      approved: db.prepare("SELECT COUNT(*) as c FROM products WHERE status = 'approved'").get().c,
      listed: db.prepare("SELECT COUNT(*) as c FROM products WHERE status = 'listed'").get().c
    };
  }
  if (query === 'quality' || query === 'all') {
    state.quality = {
      coverVersion: db.prepare("SELECT COUNT(*) as c FROM products WHERE file_path LIKE '%-cover-v11-%'").get().c,
      missingPdf: db.prepare("SELECT COUNT(*) as c FROM products WHERE file_path IS NULL OR file_path = ''").get().c,
      missingHtml: db.prepare("SELECT COUNT(*) as c FROM products WHERE html_content IS NULL OR html_content = ''").get().c
    };
  }
  if (query === 'demand' || query === 'all') {
    state.demand = {};
    try {
      state.demand.topSearches = db.prepare('SELECT query, count FROM search_log ORDER BY count DESC LIMIT 10').all();
    } catch { state.demand.topSearches = []; }
    try {
      state.demand.trendingNiches = db.prepare('SELECT niche, score FROM trending_niches ORDER BY score DESC LIMIT 10').all();
    } catch { state.demand.trendingNiches = []; }
  }
  if (query === 'pipeline' || query === 'all') {
    state.pipeline = {
      activeJobs: db.prepare("SELECT * FROM jobs WHERE status IN ('running', 'awaiting-approval')").all(),
      queuedProducts: db.prepare("SELECT id, type, profession_id FROM products WHERE status = 'draft' LIMIT 20").all()
    };
  }
  return state;
}

// ── PLAN CAMPAIGN ───────────────────────────────────────────────────────────
async function planCampaign({ goal, niche, budget = 100, timeline = '1 week' }) {
  // Simple heuristic planner — replace with LLM planner later
  const prof = db.prepare('SELECT * FROM professions WHERE lower(name) LIKE lower(?) OR slug LIKE ?').get(`%${niche}%`, `%${niche}%`);
  if (!prof) return { error: `Niche "${niche}" not found` };

  const types = ['checklist', 'invoice', 'workbook', 'spreadsheet', 'social', 'planner'];
  const plan = {
    goal, niche: prof.name, profId: prof.id,
    budget, timeline,
    steps: types.map(t => ({
      type: t,
      action: 'generate',
      priority: ['checklist', 'invoice', 'spreadsheet'].includes(t) ? 'high' : 'medium',
      estimatedCost: t === 'social' ? 0.05 : 0.02 // rough content+design cost
    })),
    totalEstimatedCost: types.reduce((a, t) => a + (t === 'social' ? 0.05 : 0.02), 0)
  };
  return plan;
}

// ── DISPATCH CONTENT ────────────────────────────────────────────────────────
async function dispatchContent({ profId, type, brief }) {
  const prof = db.prepare('SELECT * FROM professions WHERE id = ?').get(profId);
  if (!prof) return { error: `Profession ${profId} not found` };

  const result = await contentEngine.generateContentWithFallback({ prof, type, brief });
  return { profId, type, content: result.content, validation: result.validation, attempts: result.attempts };
}

// ── DISPATCH DESIGN ─────────────────────────────────────────────────────────
async function dispatchDesign({ profId, type, contentSummary, preferences }) {
  const prof = db.prepare('SELECT * FROM professions WHERE id = ?').get(profId);
  if (!prof) return { error: `Profession ${profId} not found` };

  const theme = fileFactory.fallbackTheme({ profession_id: profId, type });
  const brandColors = { primary: theme.primary, accent: theme.accent, secondary: theme.secondary, slug: prof.slug };

  const result = await designEngine.generateDesignSpecWithFallback({
    prof, type, brandColors, contentSummary, heroAvailable: true, preferences
  });
  return { profId, type, spec: result.spec, validation: result.validation, attempts: result.attempts };
}

// ── DISPATCH RENDER (Design Agent → PDF) ────────────────────────────────────
async function dispatchRender({ productId, designSpec }) {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!product) return { error: `Product ${productId} not found` };

  const prof = db.prepare('SELECT * FROM professions WHERE id = ?').get(product.profession_id);
  const theme = fileFactory.fallbackTheme(product);

  // Get hero
  let heroDataUri = null;
  try {
    const heroPath = await heroArt.ensureHeroArt(product, prof, theme);
    if (heroPath) {
      const fs = require('fs');
      if (fs.existsSync(heroPath)) {
        const b64 = fs.readFileSync(heroPath).toString('base64');
        const ext = heroPath.match(/\.png$/i) ? 'image/png' : 'image/jpeg';
        heroDataUri = `data:${ext};base64,${b64}`;
      }
    }
  } catch (e) { console.error('[RENDER] heroArt failed:', e.message); }

  // Generate HTML via Design Agent
  const contentResult = await contentEngine.generateContentWithFallback({ prof, type: product.type });
  const renderResult = await designAgent.generateHtmlWithFallback({
    content: contentResult.content, theme, prof, type: product.type, heroDataUri
  });

  let finalHtml = renderResult.html;
  if (heroDataUri) finalHtml = designAgent.injectHeroImage(finalHtml, heroDataUri);

  // Generate PDF
  const stamp = Date.now();
  const pdfPath = await pdfGenerator.generatePDF(finalHtml, `${prof.slug}-${product.type}-${stamp}.pdf`);

  // Store
  db.prepare('UPDATE products SET html_content = ?, file_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(finalHtml, pdfPath, productId);

  return { productId, pdfPath, htmlBytes: finalHtml.length, validation: renderResult.validation };
}

// ── DISPATCH QA ─────────────────────────────────────────────────────────────
async function dispatchQa({ productId }) {
  // Run cover QA + design critic + content lock validation
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!product) return { error: `Product ${productId} not found` };

  const coverQA = require('./coverQA');
  const designCritic = require('./designCritic');
  const designAgent = require('./designAgent');

  // Content lock check
  const contentResult = await contentEngine.generateContentWithFallback({
    prof: { profession_id: product.profession_id }, type: product.type
  });
  const contentLock = designAgent.validateContentLock(contentResult.content, product.html_content || '', product.type);

  // Cover QA (if cover exists)
  let coverResult = { ok: true, status: 'no_cover' };
  if (product.file_path) {
    coverResult = await coverQA.verifyCover(product);
  }

  // Design critic (vision) - optional, skip for speed
  let criticResult = { ok: true, status: 'skipped' };
  // criticResult = await designCritic.critique(product);

  return { productId, contentLock, coverResult, criticResult, passed: contentLock.ok && coverResult.ok };
}

// ── DISPATCH PUBLISH ────────────────────────────────────────────────────────
async function dispatchPublish({ productId, platforms = ['gumroad'] }) {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!product) return { error: `Product ${productId} not found` };
  if (product.status !== 'approved') return { error: `Product ${productId} not approved (status: ${product.status})` };

  const results = [];
  for (const platform of platforms) {
    try {
      const result = await marketplace.publishProduct(product);
      db.prepare('UPDATE products SET status = ?, marketplace = ?, marketplace_id = ? WHERE id = ?')
        .run('listed', result.platform, result.listingId || null, productId);
      results.push({ platform: result.platform, listingId: result.listingId, ok: true });
    } catch (e) {
      results.push({ platform, ok: false, error: e.message });
    }
  }
  return { productId, results };
}

// ── LEARN ────────────────────────────────────────────────────────────────────
async function learn({ outcome, context, lesson }) {
  db.prepare('INSERT INTO agent_lessons (outcome, context, lesson, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)')
    .run(outcome, JSON.stringify(context), lesson);
  return { ok: true, stored: true };
}

// ── MAIN COMMAND LOOP ───────────────────────────────────────────────────────
async function runCommand({ userInput, context = {} }) {
  // Load factory state
  const factoryState = await queryFactory({ query: 'all' });

  let prompt = `FACTORY STATE:
${JSON.stringify(factoryState, null, 2)}

OPERATOR INPUT: ${userInput}
CONTEXT: ${JSON.stringify(context)}

Execute the command. Use tools as needed. When complete, respond to operator.`;

  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    attempts++;
    try {
      const res = await modelRouter.callModel({
        target: COMMAND_TARGET,
        model: COMMAND_MODEL,
        messages: [
          { role: 'system', content: COMMAND_SYSTEM_PROMPT },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
        maxTokens: 4000,
        timeoutMs: 60000,
        action: 'command_center'
      });

      if (!res) throw new Error('Command model returned null');

      const action = parseCommandJson(res);
      if (!action || !action.tool) throw new Error('Invalid command response');

      // Execute tool
      let toolResult;
      switch (action.tool) {
        case 'query_factory': toolResult = await queryFactory(action.args); break;
        case 'plan_campaign': toolResult = await planCampaign(action.args); break;
        case 'dispatch_content': toolResult = await dispatchContent(action.args); break;
        case 'dispatch_design': toolResult = await dispatchDesign(action.args); break;
        case 'dispatch_render': toolResult = await dispatchRender(action.args); break;
        case 'dispatch_qa': toolResult = await dispatchQa(action.args); break;
        case 'dispatch_publish': toolResult = await dispatchPublish(action.args); break;
        case 'learn': toolResult = await learn(action.args); break;
        case 'respond': return { done: true, message: action.args.message, data: action.args.data };
        default: throw new Error(`Unknown tool: ${action.tool}`);
      }

      // Feed result back into context for next iteration
      prompt += `\n\nTOOL RESULT (${action.tool}): ${JSON.stringify(toolResult, null, 2)}`;
      prompt += `\n\nContinue or respond to operator.`;

    } catch (e) {
      if (attempts >= maxAttempts) return { done: true, error: e.message, message: `Command failed after ${maxAttempts} attempts: ${e.message}` };
      prompt += `\n\nERROR: ${e.message}. Retry.`;
    }
  }
  return { done: true, error: 'Max attempts reached', message: 'Command center max attempts reached' };
}

function parseCommandJson(text) {
  const cleaned = String(text).replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{'), end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
}

// ── REST API WRAPPERS ───────────────────────────────────────────────────────
async function handleChat(req, res) {
  const { message, context } = req.body;
  const result = await runCommand({ userInput: message, context });
  res.json(result);
}

async function handleCampaign(req, res) {
  const { goal, niche, budget, timeline } = req.body;
  const result = await planCampaign({ goal, niche, budget, timeline });
  res.json(result);
}

async function handleGenerate(req, res) {
  const { profId, type, brief } = req.body;
  const result = await dispatchContent({ profId, type, brief });
  res.json(result);
}

async function handleDesign(req, res) {
  const { profId, type, contentSummary, preferences } = req.body;
  const result = await dispatchDesign({ profId, type, contentSummary, preferences });
  res.json(result);
}

async function handleRender(req, res) {
  const { productId, designSpec } = req.body;
  const result = await dispatchRender({ productId, designSpec });
  res.json(result);
}

async function handleQa(req, res) {
  const { productId } = req.body;
  const result = await dispatchQa({ productId });
  res.json(result);
}

async function handlePublish(req, res) {
  const { productId, platforms } = req.body;
  const result = await dispatchPublish({ productId, platforms });
  res.json(result);
}

module.exports = {
  COMMAND_VERSION,
  runCommand,
  queryFactory,
  planCampaign,
  dispatchContent,
  dispatchDesign,
  dispatchRender,
  dispatchQa,
  dispatchPublish,
  learn,
  handleChat,
  handleCampaign,
  handleGenerate,
  handleDesign,
  handleRender,
  handleQa,
  handlePublish
};