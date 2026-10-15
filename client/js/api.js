// ═══════════════════════════════════════════════════════════════════════
// FLIGHT DECK — API client
// Thin JSON wrapper + console endpoints + action runner + SSE subscription.
// All calls are same-origin, so the admin session cookie travels with them.
// ═══════════════════════════════════════════════════════════════════════

const BASE = '/api';

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code || null;
  }
}

async function request(path, opts = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts
  });
  const text = await res.text();
  let body = null;
  if (text) { try { body = JSON.parse(text); } catch { body = { raw: text }; } }
  if (!res.ok) {
    const msg = (body && (body.error || body.message)) || `Request failed (${res.status})`;
    throw new ApiError(msg, res.status, body && body.code);
  }
  return body;
}

export const api = {
  get: (p) => request(p),
  post: (p, data) => request(p, { method: 'POST', body: JSON.stringify(data || {}) }),
  patch: (p, data) => request(p, { method: 'PATCH', body: JSON.stringify(data || {}) }),
  del: (p) => request(p, { method: 'DELETE' })
};

// ── console ────────────────────────────────────────────────────────────
export const consoleApi = {
  overview: () => request('/console/overview'),
  bi: () => request('/console/bi'),
  actions: () => request('/console/actions'),
  runs: (limit = 20) => request(`/console/runs?limit=${limit}`),
  run: (action, input) => request('/console/run', { method: 'POST', body: JSON.stringify({ action, input: input || {} }) }),
  assistant: (question) => request('/console/assistant', { method: 'POST', body: JSON.stringify({ question }) }),
  // The AI worker: executes real tasks through the server-side tool loop.
  // `confirmCall` round-trips a gated destructive call after operator approval.
  agent: (message, opts = {}) => request('/console/agent', {
    method: 'POST',
    body: JSON.stringify({
      message,
      history: opts.history || [],
      confirmCall: opts.confirmCall || null,
      productRef: opts.productRef || null,
      selection: opts.selection || []
    })
  })
};

// ── worker memory + boss channel (surrogate) ───────────────────────────
export const workerApi = {
  status: () => request('/worker/status'),
  memory: () => request('/worker/memory'),
  remember: (kind, content, pinned) => request('/worker/memory', { method: 'POST', body: JSON.stringify({ kind, content, pinned }) }),
  pin: (id, pinned) => request(`/worker/memory/${id}/pin`, { method: 'POST', body: JSON.stringify({ pinned }) }),
  forget: (id) => request(`/worker/memory/${id}`, { method: 'DELETE' }),
  asks: (status) => request(`/worker/asks${status ? '?status=' + encodeURIComponent(status) : ''}`),
  answer: (id, payload) => request(`/worker/asks/${id}/answer`, { method: 'POST', body: JSON.stringify(payload || {}) }),
  dismiss: (id) => request(`/worker/asks/${id}/dismiss`, { method: 'POST', body: '{}' }),
  notifyTest: () => request('/worker/notify-test', { method: 'POST', body: '{}' }),
  stewardRun: () => request('/worker/steward/run', { method: 'POST', body: '{}' })
};

// ── data ───────────────────────────────────────────────────────────────
// Binary endpoint: /api/export/render returns a PDF blob, not JSON.
export async function renderExport(html, type, filename) {
  const res = await fetch(BASE + '/export/render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html, type, filename })
  });
  if (!res.ok) {
    let msg = `Export failed (${res.status})`;
    try { const j = await res.json(); if (j && j.error) msg = j.error; } catch { /* non-JSON error body */ }
    throw new ApiError(msg, res.status);
  }
  return res.blob();
}

export const dataApi = {
  professions: () => request('/professions'),
  products: () => request('/products'),
  product: (id) => request(`/products/${id}`),
  trends: () => request('/trends'),
  activity: () => request('/automation/log'),
  automationStatus: () => request('/automation/status'),
  analytics: () => request('/analytics/sales'),
  revenue: () => request('/revenue/summary'),
  etsyCap: () => request('/etsy/cap'),
  smartActions: () => request('/smart-actions'),
  setup: () => request('/setup/status'),
  readiness: () => request('/health/readiness'),
  modelStatus: () => request('/model/status'),
  payments: () => request('/payments/status'),
  branding: () => request('/branding/status'),
  calendar: (month) => request(`/calendar?month=${encodeURIComponent(month || '')}`),
  seasonal: () => request('/seasonal'),
  social: () => request('/social/calendar'),
  ads: () => request('/ads/summary'),
  settings: () => request('/settings'),
  newsletter: () => request('/newsletter/generate'),
  passionNiches: () => request('/niches/passion'),
  searchQueue: () => request('/discovery/search-queue'),
  scoreOpportunity: (q) => request('/discovery/opportunity?q=' + encodeURIComponent(q)),
  radarHealth: () => request('/trends/radar-health'),
  vetTrend: (id) => request(`/trends/vet/${id}`),
  seo: (productId) => request(`/seo/${productId}`),
  caps: () => request('/caps'),
  optimization: (id) => request(`/products/${id}/optimization`),
  designScore: (id) => request(`/products/${id}/design-score`),
  designScores: () => request('/design/scores'),
  jobs: () => request('/jobs')
};

export const dataActions = {
  setProductStatus: (id, status) => api.patch(`/products/${id}/status`, { status }),
  regenerateIdea: (id) => api.post(`/products/${id}/regenerate-idea`),
  publishProduct: (id) => api.post(`/marketplace/publish/${id}`),
  pushEtsy: (id) => api.post(`/etsy/push/${id}`),
  pushEtsyBatch: (ids) => api.post('/etsy/push-batch', { ids }),
  deleteProduct: (id) => api.del(`/products/${id}`),
  saveHtml: (id, html) => api.patch(`/products/${id}/html`, { html_content: html }),
  activateTrend: (id) => api.post(`/trends/${id}/activate`),
  dismissTrend: (id) => api.post(`/trends/${id}/dismiss`),
  archiveTrend: (id) => api.post(`/trends/${id}/archive`),
  generateFromTrend: (id, payload) => api.post(`/trends/${id}/generate`, payload || {}),
  generateCustom: (payload) => api.post('/products/generate-custom', payload),
  optimizeProduct: (id) => api.post(`/products/${id}/optimization/apply`, {}),
  rollbackOptimization: (id) => api.post(`/products/${id}/optimization/rollback`, {}),
  optimizeWeak: (limit) => api.post('/optimize/weak', { limit: limit || 20 }),
  saveCaps: (payload) => api.post('/caps', payload),
  schedulePost: (payload) => api.post('/social/schedule', payload),
  cancelPost: (id) => api.post('/social/cancel', { id }),
  postNow: (productId, platform) => api.post('/social/post-now', { productId, platform }),
  generateSocial: (productId, platform) => api.post('/social/generate', { productId, platform }),
  batchSocial: (platform, limit) => api.post('/social/batch-generate', { platform, limit }),
  setAdBudget: (budget) => api.post('/ads/budget', { budget }),
  commitAdSpend: (payload) => api.post('/ads/commit', payload),
  cancelAd: (id) => api.post('/ads/cancel', { id }),
  addPassionNiche: (niche) => api.post('/niches/passion', { action: 'add', niche }),
  removePassionNiche: (niche) => api.post('/niches/passion', { action: 'remove', niche }),
  // The batch endpoint takes a settings object; POST /settings takes {key,value}.
  saveSettings: (payload) => api.post('/settings/batch', payload),
  rebuildPreviews: (limit, force) => {
    const q = new URLSearchParams({ limit: String(limit || 10), force: force ? '1' : '0' });
    return api.post('/previews/generate?' + q.toString());
  },
  generateCovers: (payload) => api.post('/covers/generate', payload || {}),
  serpScan: () => api.post('/discovery/serp-scan'),
  drainQueue: () => api.post('/discovery/search-queue/drain'),
  designCritique: (id, opts) => api.post(`/products/${id}/design-critique`, opts || {}),
  reskinProduct: (id, opts) => api.post(`/products/${id}/reskin`, opts || {}),
  // Jobs — persistent multi-step projects the agent drives autonomously.
  createJob: (prompt) => api.post('/jobs', { prompt }),
  runJobs: () => api.post('/jobs/run'),
  approveJob: (id) => api.post(`/jobs/${id}/approve`),
  rejectJob: (id) => api.post(`/jobs/${id}/reject`),
  pauseJob: (id) => api.post(`/jobs/${id}/pause`),
  resumeJob: (id) => api.post(`/jobs/${id}/resume`),
  deleteJob: (id) => api.del(`/jobs/${id}`)
};

// ── live run stream (SSE, with polling fallback signalled to caller) ────
export function connectStream({ onEvent, onStatus } = {}) {
  if (typeof EventSource === 'undefined') {
    if (onStatus) onStatus('unsupported');
    return { close() {} };
  }
  let es = null, closed = false, retry = 0;
  const open = () => {
    if (closed) return;
    es = new EventSource(BASE + '/console/stream');
    es.addEventListener('open', () => { retry = 0; if (onStatus) onStatus('live'); });
    es.addEventListener('run', e => { try { onEvent && onEvent(JSON.parse(e.data)); } catch { /* ignore */ } });
    es.addEventListener('error', () => {
      if (onStatus) onStatus('reconnecting');
      try { es.close(); } catch { /* ignore */ }
      if (closed) return;
      retry = Math.min(retry + 1, 6);
      setTimeout(open, 1000 * retry);
    });
  };
  open();
  return { close() { closed = true; try { es && es.close(); } catch { /* ignore */ } } };
}
