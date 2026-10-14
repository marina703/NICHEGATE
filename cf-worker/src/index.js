// NicheGate cover worker — Workers AI text-to-image with model flexibility.
// POST { prompt, width, height, model? } -> { image: "<base64 image>", width, height, model }
// GET /health -> { ok: true, worker, model }
// Required shared-secret: send header x-ng-key matching SHARED_KEY secret.
//
// Model allowlist — neuron costs differ ~24x between models (see
// COVER_MODEL_FLEXIBILITY.md / BIONIC_E2E_AUDIT.md F1): lucid-origin bills
// 636 neurons per 512x512 tile (~7.6k per 1200x1800 cover) while
// flux-2-klein-4b bills ~26 per output tile (~330 per cover). The cheap no-arg
// default below holds; premium models stay available per-request for hero covers.
//
// INPUT SHAPE IS PER-MODEL (this was the 502: one flat shape was sent to every
// model). FLUX.2 Klein declares a `multipart` root schema, so a flat prompt
// object is rejected with "5006: required properties at '/' are 'multipart'",
// and it rejects `num_steps` (inference is fixed at 4 steps). FLUX.1 Schnell has
// no width/height fields at all, so width/height are rejected there.
const MODELS = {
  // kind: 'multipart' → prompt fields go in a FormData body.
  '@cf/black-forest-labs/flux-2-klein-4b': { kind: 'multipart', guidance: 3, maxDim: 1920 },
  '@cf/black-forest-labs/flux-2-klein-9b': { kind: 'multipart', guidance: 3.5, maxDim: 1920 },
  // kind: 'flat' → a plain JSON object is the correct input shape.
  '@cf/leonardo/lucid-origin': { kind: 'flat', num_steps: 24, guidance: 5, maxDim: 2500 },
  // Schnell takes prompt/steps/seed only; it has no width/height control and
  // returns its own fixed square resolution, so it cannot produce a 2:3 cover.
  '@cf/black-forest-labs/flux-1-schnell': { kind: 'flat', steps: 4, supportsDims: false }
};
const DEFAULT_MODEL = '@cf/black-forest-labs/flux-2-klein-4b';

function json(body, status = 200) {
  return Response.json(body, { status });
}

async function runImageModel(env, model, spec, { prompt, width, height, seed }) {
  if (spec.kind === 'multipart') {
    // FLUX.2 Klein: the binding expects a serialized multipart body.
    const form = new FormData();
    form.set('prompt', prompt);
    form.set('width', String(width));
    form.set('height', String(height));
    if (spec.guidance !== undefined) form.set('guidance', String(spec.guidance));
    if (seed !== undefined) form.set('seed', String(seed));
    const serialized = new Response(form);
    return env.AI.run(model, {
      multipart: {
        body: serialized.body,
        contentType: serialized.headers.get('content-type')
      }
    });
  }
  const input = { prompt };
  if (spec.supportsDims !== false) {
    input.width = width;
    input.height = height;
  }
  if (spec.num_steps !== undefined) input.num_steps = spec.num_steps;
  if (spec.steps !== undefined) input.steps = spec.steps;
  if (spec.guidance !== undefined) input.guidance = spec.guidance;
  if (seed !== undefined) input.seed = seed;
  return env.AI.run(model, input);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, worker: 'nichegate-covers', model: env.COVER_MODEL || DEFAULT_MODEL });
    }
    if (request.method !== 'POST') {
      return new Response('POST {prompt, width, height, model?} required', { status: 405 });
    }
    if (!env.SHARED_KEY) {
      return json({ error: 'generation unavailable' }, 503);
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
      return json({ error: 'native portrait dimensions must be at least 1200x1800 and no more than 2500x2500' }, 400);
    }
    const requested = body.model || env.COVER_MODEL || DEFAULT_MODEL;
    const spec = MODELS[requested];
    if (!spec) {
      return json({ error: `model not allowed: ${String(requested).slice(0, 80)}`, allowed: Object.keys(MODELS) }, 400);
    }
    if (spec.maxDim && Math.max(width, height) > spec.maxDim) {
      return json({ error: `${requested} supports at most ${spec.maxDim}px per side; requested ${width}x${height}` }, 400);
    }
    if (spec.supportsDims === false) {
      return json({ error: `${requested} cannot produce a ${width}x${height} native portrait (fixed square output)` }, 400);
    }
    try {
      const result = await runImageModel(env, requested, spec, { prompt, width, height, seed });
      if (!result || !result.image) {
        return json({ error: 'model returned no image' }, 502);
      }
      return json({ image: result.image, width, height, model: requested });
    } catch (e) {
      const message = String((e && e.message) || e);
      // Cloudflare quota errors (4006 daily neuron allocation) are a capacity
      // state, not a transient failure — surface as 429 so callers defer
      // instead of burning retries (see BIONIC_E2E_AUDIT.md F2).
      if (/4006|free allocation|quota/i.test(message)) {
        return json({ error: 'quota_exhausted', message }, 429);
      }
      return json({ error: message }, 502);
    }
  }
};
