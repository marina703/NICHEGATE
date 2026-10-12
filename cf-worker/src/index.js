// NicheGate cover worker — Workers AI text-to-image with model flexibility.
// POST { prompt, width, height, model? } -> { image: "<base64 image>", width, height, model }
// GET /health -> { ok: true, worker, model }
// Required shared-secret: send header x-ng-key matching SHARED_KEY secret.
//
// Model allowlist — neuron costs differ ~24x between models (see
// COVER_MODEL_FLEXIBILITY.md / BIONIC_E2E_AUDIT.md F1): lucid-origin bills
// 636 neurons per 512x512 tile (~7.6k per 1200x1800 cover) while
// flux-2-klein-4b bills ~26 per output tile (~330 per cover). Default is the
// cheap standard; premium models stay available per-request for hero covers.
const MODELS = {
  '@cf/black-forest-labs/flux-2-klein-4b': { num_steps: 8, guidance: 3 },
  '@cf/black-forest-labs/flux-1-schnell': { num_steps: 4, guidance: 3.5 },
  '@cf/black-forest-labs/flux-2-klein-9b': { num_steps: 12, guidance: 3.5 },
  '@cf/leonardo/lucid-origin': { num_steps: 24, guidance: 5 }
};
const DEFAULT_MODEL = '@cf/black-forest-labs/flux-2-klein-4b';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return Response.json({ ok: true, worker: 'nichegate-covers', model: env.COVER_MODEL || DEFAULT_MODEL });
    }
    if (request.method !== 'POST') {
      return new Response('POST {prompt, width, height, model?} required', { status: 405 });
    }
    if (!env.SHARED_KEY) {
      return Response.json({ error: 'generation unavailable' }, { status: 503 });
    }
    if (request.headers.get('x-ng-key') !== env.SHARED_KEY) {
      return new Response('unauthorized', { status: 401 });
    }
    let body;
    try { body = await request.json(); } catch { return new Response('bad json', { status: 400 }); }
    const prompt = String(body.prompt || '').slice(0, 6000);
    if (!prompt) return new Response('prompt required', { status: 400 });
    const width = Number(body.width);
    const height = Number(body.height);
    const seed = Number.isInteger(body.seed) ? body.seed : undefined;
    if (!Number.isInteger(width) || width < 1200 || width > 2500 || !Number.isInteger(height) || height < 1800 || height > 2500) {
      return Response.json({ error: 'native portrait dimensions must be at least 1200x1800 and no more than 2500x2500' }, { status: 400 });
    }
    const requested = body.model || env.COVER_MODEL || DEFAULT_MODEL;
    if (!MODELS[requested]) {
      return Response.json({ error: `model not allowed: ${String(requested).slice(0, 80)}`, allowed: Object.keys(MODELS) }, { status: 400 });
    }
    try {
      const result = await env.AI.run(requested, {
        prompt, width, height, ...MODELS[requested], ...(seed === undefined ? {} : { seed })
      });
      if (!result || !result.image) {
        return Response.json({ error: 'model returned no image' }, { status: 502 });
      }
      return Response.json({ image: result.image, width, height, model: requested });
    } catch (e) {
      const message = String((e && e.message) || e);
      // Cloudflare quota errors (4006 daily neuron allocation) are a capacity
      // state, not a transient failure — surface as 429 so callers defer
      // instead of burning retries (see BIONIC_E2E_AUDIT.md F2).
      if (/4006|free allocation|quota/i.test(message)) {
        return Response.json({ error: 'quota_exhausted', message }, { status: 429 });
      }
      return Response.json({ error: message }, { status: 502 });
    }
  }
};
