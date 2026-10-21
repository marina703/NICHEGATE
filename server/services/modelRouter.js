// ═══════════════════════════════════════════════════════════════════════════
// MODEL ROUTER — one place for every AI call in NicheGate.
//   • OpenRouter is the primary router (many models, one endpoint)
//   • Cheap model for scanning/scoring, stronger model for ideation
//   • Hard timeouts + retries + per-cycle call caps
//   • Degrades gracefully: any failure returns null, never throws upstream
//   • Keys come from env ONLY — never hardcoded, never logged
// ═══════════════════════════════════════════════════════════════════════════

const axios = require('axios');
const cfg = require('./modelConfig');
const { db } = require('../database');

const TIMEOUT_MS = () => cfg.limits.timeoutMs;
const MAX_RETRIES = () => cfg.limits.maxRetries;

// Per-cycle call counter so a single cycle can't run away with spend.
let cycleCalls = 0;

function resetCycleCounter() {
  cycleCalls = 0;
}

function callsUsed() {
  return cycleCalls;
}

function underCap(cap) {
  return cycleCalls < cap;
}

function redact(s) {
  // Never let a key-shaped string reach a log line.
  return String(s || '').replace(/sk-[A-Za-z0-9\-_]{8,}/g, 'sk-***');
}

function headers() {
  return {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY || ''}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': cfg.openrouter.siteUrl,
    'X-Title': cfg.openrouter.siteName
  };
}

// Single source of truth for provider routing. When VISION_PROVIDER=nous and a
// Nous key is present, EVERY call goes to Nous Portal (OpenAI-compatible)
// instead of OpenRouter — whose endpoint 402s with no credits. Keeping this in
// one place means no call site can accidentally hit the dead endpoint.
function defaultTarget() {
  const useNous = String(process.env.VISION_PROVIDER || '').toLowerCase() === 'nous'
    && !!process.env.NOUSPORTAL_API_KEY;
  if (!useNous) return undefined;
  return {
    baseUrl: process.env.VISION_BASE_URL || 'https://inference-api.nousresearch.com/v1',
    headers: {
      Authorization: `Bearer ${process.env.NOUSPORTAL_API_KEY}`,
      'Content-Type': 'application/json'
    }
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// One chat completion with retry + backoff. Returns text or null. Never throws.
// `action` labels the ai_usage ledger row (chat_completion, design_critique, …).
// `messages` pass through verbatim, so content arrays (vision image parts) work.
async function callModel({ model, messages, temperature = 0.7, maxTokens, action, target, timeoutMs }) {
  if (!cfg.enabled) return null;

  // `target` = { baseUrl, headers } lets a caller route one call to another
  // OpenAI-compatible provider (e.g. Nous Portal for vision). Default: OpenRouter.
  const endpoint = target || defaultTarget() || { baseUrl: cfg.openrouter.baseUrl, headers: headers() };
  const body = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens || cfg.limits.maxTokens
  };

  const timeout = timeoutMs || TIMEOUT_MS();
  let lastErr = null;
  for (let attempt = 0; attempt <= MAX_RETRIES(); attempt++) {
    try {
      const res = await axios.post(`${endpoint.baseUrl}/chat/completions`, body, {
        headers: endpoint.headers,
        timeout,
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      });
      const text = res.data && res.data.choices && res.data.choices[0] &&
        res.data.choices[0].message && res.data.choices[0].message.content;
      
      // Track AI token usage and estimated cost into ai_usage ledger
      if (res.data && res.data.usage) {
        try {
          const u = res.data.usage;
          const promptTokens = u.prompt_tokens || 0;
          const compTokens = u.completion_tokens || 0;
          const totalTokens = u.total_tokens || (promptTokens + compTokens);
          // Pricing estimate (default ~$0.20/1M tokens prompt, $0.80/1M comp for Gemini Flash/Claude Haiku scale)
          const costEst = (promptTokens * 0.0000002) + (compTokens * 0.0000008);
          db.prepare('INSERT INTO ai_usage (model, prompt_tokens, completion_tokens, total_tokens, cost_usd, action) VALUES (?, ?, ?, ?, ?, ?)')
            .run(model || 'unknown', promptTokens, compTokens, totalTokens, costEst, action || 'chat_completion');
        } catch (ue) {
          // Non-blocking
        }
      }

      return text ? String(text).trim() : null;
    } catch (e) {
      lastErr = e;
      const status = e.response && e.response.status;
      // 4xx (except 429) won't get better on retry — bail immediately.
      if (status && status >= 400 && status < 500 && status !== 429) break;
      if (attempt < MAX_RETRIES()) await sleep(600 * (attempt + 1));
    }
  }
  console.error('[MODEL] call failed:', redact(lastErr && lastErr.message));
  return null;
}

// ─── PUBLIC API ────────────────────────────────────────────────────────────

// Cheap: summarize/scan a trend snippet. Returns short text or null.
async function cheapSummarize(text, system) {
  if (!underCap(cfg.caps.maxCallsPerScan)) return null;
  cycleCalls++;
  return callModel({
    model: cfg.openrouter.defaultModel,
    messages: [
      { role: 'system', content: system || 'You are a concise market analyst. Reply with only the requested output.' },
      { role: 'user', content: String(text || '').slice(0, 4000) }
    ],
    temperature: 0.2
  });
}

// Cheap + deterministic-ish: score/rank a list of idea strings. Returns text or null.
async function scoreOptions(items, system) {
  if (!underCap(cfg.caps.maxCallsPerIdeaBatch)) return null;
  if (!Array.isArray(items) || !items.length) return null;
  cycleCalls++;
  const userText = items.map((it, i) => `Option ${i + 1}: ${it}`).join('\n\n').slice(0, 6000);
  return callModel({
    model: cfg.openrouter.judgeModel,
    messages: [
      { role: 'system', content: system || 'You are a product-strategy judge. Score each option 1-10 for differentiation and revenue potential, then name the single best option. Be blunt about weak ideas.' },
      { role: 'user', content: userText }
    ],
    temperature: 0.1
  });
}

// Stronger: generate differentiated product concepts. Returns text or null.
async function generateIdeas(prompt, system) {
  if (!underCap(cfg.caps.maxCallsPerIdeaBatch)) return null;
  cycleCalls++;
  return callModel({
    model: cfg.openrouter.ideationModel,
    messages: [
      { role: 'system', content: system || 'You are a product strategist. Give 3 concise, specific, differentiated product concepts. For each: target user, core pain, the artifact, and why it is NOT a generic template. No filler.' },
      { role: 'user', content: String(prompt || '').slice(0, 4000) }
    ],
    temperature: 0.8,
    maxTokens: cfg.limits.maxOutputTokensIdeation
  });
}

// Vision: send screenshots (data URIs or http URLs) with a text prompt.
// Returns text or null; never throws. Used by the design critic (Phase 1).
async function callVision({ prompt, images = [], system, temperature = 0.2, maxTokens, action = 'design_critique' }) {
  if (!cfg.enabled) return null;
  const content = [
    { type: 'text', text: String(prompt || '').slice(0, 6000) },
    ...images.filter(Boolean).slice(0, 4).map(url => ({ type: 'image_url', image_url: { url } }))
  ];
  if (content.length < 2) return null; // no image, nothing to look at
  // VISION_PROVIDER=nous routes vision through Nous Portal (OpenAI-compatible,
  // key in NOUSPORTAL_API_KEY). Anything else keeps the OpenRouter default.
  const useNous = String(process.env.VISION_PROVIDER || '').toLowerCase() === 'nous' && process.env.NOUSPORTAL_API_KEY;
  const target = useNous ? {
    baseUrl: process.env.VISION_BASE_URL || 'https://inference-api.nousresearch.com/v1',
    headers: { Authorization: `Bearer ${process.env.NOUSPORTAL_API_KEY}`, 'Content-Type': 'application/json' }
  } : undefined;
  return callModel({
    target,
    model: useNous ? (process.env.VISION_MODEL || 'anthropic/claude-haiku-5.5') : cfg.openrouter.visionModel,
    messages: [
      ...(system ? [{ role: 'system', content: String(system).slice(0, 2000) }] : []),
      { role: 'user', content }
    ],
    temperature,
    maxTokens: maxTokens || cfg.limits.maxTokens,
    action
  });
}

// Direct fallback provider (only used if OpenRouter is down). Returns text or null.
async function fallbackChat({ messages, temperature = 0.7, maxTokens } = {}) {
  if (!cfg.enabled) return null;
  const key = cfg.fallback.apiKey;
  if (!key || !cfg.fallback.baseUrl) return null;
  try {
    const res = await axios.post(`${cfg.fallback.baseUrl}/chat/completions`, {
      model: cfg.fallback.model,
      messages,
      temperature,
      max_tokens: maxTokens || cfg.limits.maxTokens
    }, {
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      timeout: TIMEOUT_MS()
    });
    const text = res.data && res.data.choices && res.data.choices[0] &&
      res.data.choices[0].message && res.data.choices[0].message.content;
    return text ? String(text).trim() : null;
  } catch (e) {
    console.error('[MODEL] fallback failed:', redact(e.message));
    return null;
  }
}

// Health/shape info for the readiness report (never exposes keys).
function status() {
  return {
    enabled: cfg.enabled,
    hasKey: !!process.env.OPENROUTER_API_KEY,
    models: {
      scan: cfg.openrouter.defaultModel,
      judge: cfg.openrouter.judgeModel,
      ideation: cfg.openrouter.ideationModel
    },
    callsThisCycle: cycleCalls,
    caps: cfg.caps,
    limits: cfg.limits
  };
}

module.exports = {
  resetCycleCounter,
  callsUsed,
  underCap,
  defaultTarget,
  cheapSummarize,
  scoreOptions,
  generateIdeas,
  fallbackChat,
  callModel,
  callVision,
  status,
  redact
};