// ═══════════════════════════════════════════════════════════════════════════
// COVER ART — AI lifestyle backgrounds for marketplace thumb-stoppers.
//   Image 1 = v2 HTML title cover (clean text, always local, always free)
//   Image 2 = AI lifestyle photo (stops the scroll — this file)
//   Image 3 = inside-page preview (proof of quality, Puppeteer HTML shot)
// Photorealism wins on Etsy/Gumroad; HTML screenshots never do. AI text
// garbles, so prompts are photo-only (NO TEXT). Title composites in UI.
//   Pollinations.ai: $0, no key, 20-60s. fal.ai FLUX: ~$0.003, 2-5s.
// Never throws — returns null on any failure so callers degrade gracefully.
// ═══════════════════════════════════════════════════════════════════════════

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OUT_DIR = path.join(__dirname, '..', '..', 'covers', 'ai');
fs.mkdirSync(OUT_DIR, { recursive: true });

function provider() {
  return String(process.env.COVER_ART_PROVIDER || 'pollinations').toLowerCase();
}

// Photo-only scene per niche — styled props, morning light, no text.
function promptFor(prof, product) {
  const niche = prof.name || 'small business';
  const t = String(product.type || '').toLowerCase();
  const scenes = {
    invoice: `overhead desk flat-lay, printed invoice on clipboard, ${niche} workspace, pen, calculator, coffee cup`,
    checklist: `close-up of hands checking off a printed checklist on a wooden desk, ${niche} tools nearby`,
    spreadsheet: `laptop showing a clean pricing spreadsheet on a bright desk, ${niche} notebook, pen, coffee`,
    booking: `open planner calendar with pen on a styled desk, ${niche} workspace, small plant`,
    social: `smartphone showing social posts on a styled desk, ${niche} props, soft morning light`,
    brand: `brand identity stationery suite flat-lay, business cards, color swatches, ${niche} mood`,
    journal: `open guided journal with pen on a cozy desk, morning coffee, soft window light, ${niche} calm`,
    bundle: `stack of printed workbooks and binders tied with twine on a desk, ${niche} toolkit, styled props`,
    leadmagnet: `free starter pack printables fanned on a bright desk, ${niche}, coffee, plant`,
    website: `laptop showing a clean service website on a styled desk, ${niche} branding, notebook`
  };
  const scene = scenes[t] || `styled ${niche} workspace flat-lay, bright morning light`;
  return `${scene}, photorealistic, shallow depth of field, professional product photography, no text, no words, no letters, no watermark`;
}

function cachePath(prof, product) {
  const h = crypto.createHash('sha1')
    .update(`${provider()}|${prof.slug || prof.name}|${product.type}|${promptFor(prof, product)}`)
    .digest('hex').slice(0, 16);
  return path.join(OUT_DIR, `${prof.slug || 'cover'}-${product.type || 'art'}-${h}.jpg`);
}

async function viaPollinations(prompt, outPath) {
  const base = process.env.POLLINATIONS_BASE_URL || 'https://image.pollinations.ai/prompt';
  const url = `${base}/${encodeURIComponent(prompt)}?width=1200&height=1500&nologo=true`;
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 120000, maxBodyLength: Infinity });
  if (!res.data || !res.data.length) throw new Error('empty image response');
  fs.writeFileSync(outPath, Buffer.from(res.data));
  return outPath;
}

// Cloudflare Workers AI (FLUX.schnell) via the nichegate-covers worker.
// Free tier: 10k neurons/day. 1024x1024 output — cover-crops into 4:5.
async function viaCloudflare(prompt, outPath) {
  const url = process.env.COVER_WORKER_URL;
  if (!url) throw new Error('COVER_WORKER_URL missing');
  const res = await axios.post(url, { prompt }, {
    timeout: 180000,
    headers: process.env.COVER_WORKER_KEY ? { 'x-ng-key': process.env.COVER_WORKER_KEY } : {}
  });
  const b64 = res.data && res.data.image;
  if (!b64) throw new Error(`worker returned no image: ${JSON.stringify(res.data).slice(0, 200)}`);
  fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
  return outPath;
}

async function viaFal(prompt, outPath) {
  const key = process.env.FAL_API_KEY;
  if (!key) throw new Error('FAL_API_KEY missing');
  const model = process.env.FAL_MODEL || 'fal-ai/flux/schnell';
  const sub = await axios.post(`https://queue.fal.run/${model}`, {
    prompt, image_size: 'portrait_4_3', num_images: 1, enable_safety_checker: true
  }, { headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' }, timeout: 60000 });
  const reqId = sub.data && sub.data.request_id;
  if (!reqId) throw new Error('fal queue rejected');
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const st = await axios.get(`https://queue.fal.run/${model}/requests/${reqId}/status`,
      { headers: { Authorization: `Key ${key}` }, timeout: 30000 });
    if (st.data && st.data.status === 'COMPLETED') break;
    if (st.data && (st.data.status === 'FAILED')) throw new Error('fal render failed');
  }
  const done = await axios.get(`https://queue.fal.run/${model}/requests/${reqId}`,
    { headers: { Authorization: `Key ${key}` }, timeout: 30000 });
  const imgs = done.data && (done.data.images || (done.data.data && done.data.data.images)) || [];
  const imgUrl = imgs[0] && (imgs[0].url || imgs[0]);
  if (!imgUrl) throw new Error('fal returned no image');
  const bin = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 120000, maxBodyLength: Infinity });
  fs.writeFileSync(outPath, Buffer.from(bin.data));
  return outPath;
}

// Ensure a lifestyle background exists for this product. Returns path or null.
async function ensureCoverArt(product, prof) {
  try {
    const out = cachePath(prof, product);
    if (fs.existsSync(out) && fs.statSync(out).size > 20000) return out;
    const prompt = promptFor(prof, product);
    const prov = provider();
    if (prov === 'cloudflare') return await viaCloudflare(prompt, out);
    if (prov === 'fal') return await viaFal(prompt, out);
    return await viaPollinations(prompt, out);
  } catch (e) {
    console.error('[COVERART] failed:', e.message);
    return null;
  }
}

module.exports = { promptFor, cachePath, ensureCoverArt, provider, OUT_DIR };
