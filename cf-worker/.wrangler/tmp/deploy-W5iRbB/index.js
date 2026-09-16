// src/index.js
var index_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true, worker: "nichegate-covers" });
    }
    if (request.method !== "POST") {
      return new Response("POST {prompt, width?, height?} required", { status: 405 });
    }
    if (env.SHARED_KEY && request.headers.get("x-ng-key") !== env.SHARED_KEY) {
      return new Response("unauthorized", { status: 401 });
    }
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response("bad json", { status: 400 });
    }
    const prompt = String(body.prompt || "").slice(0, 2048);
    if (!prompt) return new Response("prompt required", { status: 400 });
    const width = Math.min(Math.max(parseInt(body.width, 10) || 1200, 256), 2048);
    const height = Math.min(Math.max(parseInt(body.height, 10) || 1500, 256), 2048);
    try {
      const result = await env.AI.run("@cf/black-forest-labs/flux-schnell", {
        prompt,
        width,
        height,
        num_steps: 4
      });
      if (!result || !result.image) {
        return Response.json({ error: "model returned no image" }, { status: 502 });
      }
      return Response.json({ image: result.image });
    } catch (e) {
      return Response.json({ error: String(e && e.message || e) }, { status: 502 });
    }
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
