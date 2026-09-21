// ═══════════════════════════════════════════════════════════════════════════
// MODEL CONFIG — cheap-but-serious settings for the NicheGate idea layer.
// All values come from env; nothing here is a secret. Safe to commit.
// ═══════════════════════════════════════════════════════════════════════════

// Master switch: when off, every model call returns null instantly (zero cost).
// Set MODEL_ENABLED=true in .env to turn the AI layer on.
const ENABLED = String(process.env.MODEL_ENABLED || 'false').toLowerCase() === 'true' && !!process.env.OPENROUTER_API_KEY;

module.exports = {
  enabled: ENABLED,

  // Primary router (OpenRouter) — one endpoint, many models
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    // cheap, fast, reliable → routine scanning/summarizing
    defaultModel: process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash-lite',
    // cheap + low temperature → scoring/ranking ideas
    judgeModel: process.env.JUDGE_MODEL || 'anthropic/claude-3-haiku',
    // stronger value reasoning → product concept generation (still cheap)
    ideationModel: process.env.IDEATION_MODEL || 'deepseek/deepseek-chat',
    siteUrl: process.env.OPENROUTER_SITE_URL || 'https://nichegate.app',
    siteName: process.env.OPENROUTER_SITE_NAME || 'NicheGate'
  },

  // Optional fallback direct providers (used only if OpenRouter fails)
  fallback: {
    baseUrl: process.env.FALLBACK_BASE_URL || 'https://api.openai.com/v1',
    apiKey: process.env.FALLBACK_API_KEY || process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY || '',
    model: process.env.FALLBACK_MODEL || 'gpt-4o-mini'
  },

  // Hard stops so one bad call can't stall the pipeline or drain the wallet
  limits: {
    timeoutMs: Number(process.env.MODEL_TIMEOUT_MS || 25000),
    maxTokens: Number(process.env.MODEL_MAX_TOKENS || 1024),
    maxOutputTokensIdeation: Number(process.env.MODEL_MAX_OUTPUT_TOKENS_IDEATION || 2048),
    maxRetries: Number(process.env.MODEL_MAX_RETRIES || 2)
  },

  // Per-cycle budgets: how many model calls each stage may spend
  caps: {
    maxCallsPerScan: Number(process.env.MODEL_MAX_CALLS_PER_SCAN || 3),
    maxCallsPerIdeaBatch: Number(process.env.MODEL_MAX_CALLS_PER_IDEA_BATCH || 4)
  }
};