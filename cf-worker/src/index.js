// NicheGate cover worker — FLUX.schnell via the Workers AI binding.
// POST { prompt, width?, height? } -> { image: "<base64 jpeg>" }
// GET /health -> { ok: true }
// Required shared-secret: send header x-ng-key matching SHARED_KEY secret.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return Response.json({ ok: true, worker: 'nichegate-covers' });
    }
    if (request.method !== 'POST') {
      return new Response('POST {prompt, width?, height?} required', { status: 405 });
    }
    if (!env.SHARED_KEY) {
      return Response.json({ error: 'generation unavailable' }, { status: 503 });
    }
    if (request.headers.get('x-ng-key') !== env.SHARED_KEY) {
      return new Response('unauthorized', { status: 401 });
    }
    let body;
    try { body = await request.json(); } catch { return new Response('bad json', { status: 400 }); }
    const prompt = String(body.prompt || '').slice(0, 2048);
    if (!prompt) return new Response('prompt required', { status: 400 });
    const width = Math.min(Math.max(parseInt(body.width, 10) || 1200, 256), 2048);
    const height = Math.min(Math.max(parseInt(body.height, 10) || 1500, 256), 2048);
    try {
      // flux-1-schnell schema: prompt + steps only (fixed-size output).
      // The Node side cover-crops the square into the 4:5 frame.
      const result = await env.AI.run('@cf/black-forest-labs/flux-1-schnell', {
        prompt, steps: 4
      });
      if (!result || !result.image) {
        return Response.json({ error: 'model returned no image' }, { status: 502 });
      }
      return Response.json({ image: result.image });
    } catch (e) {
      return Response.json({ error: String((e && e.message) || e) }, { status: 502 });
    }
  }
};