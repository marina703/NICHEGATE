// NicheGate cover worker — Leonardo Lucid Origin via Workers AI.
// POST { prompt, width, height } -> { image: "<base64 image>" }
// GET /health -> { ok: true }
// Required shared-secret: send header x-ng-key matching SHARED_KEY secret.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return Response.json({ ok: true, worker: 'nichegate-covers' });
    }
    if (request.method !== 'POST') {
      return new Response('POST {prompt, width, height} required', { status: 405 });
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
    try {
      const result = await env.AI.run('@cf/leonardo/lucid-origin', {
        prompt, width, height, guidance: 5, num_steps: 24, ...(seed === undefined ? {} : { seed })
      });
      if (!result || !result.image) {
        return Response.json({ error: 'model returned no image' }, { status: 502 });
      }
      return Response.json({ image: result.image, width, height, model: '@cf/leonardo/lucid-origin' });
    } catch (e) {
      return Response.json({ error: String((e && e.message) || e) }, { status: 502 });
    }
  }
};