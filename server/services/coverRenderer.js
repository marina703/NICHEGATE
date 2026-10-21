// ═══════════════════════════════════════════════════════════════════════════
// COVER RENDERER — generative covers from Style-DNA. Instead of compositing a
// fixed template, this builds a full HTML cover (palette x fonts x layout x
// motif x hero modality) and rasterises it via the shared headless Chrome. This
// is what makes covers as endless as the inner pages, and it returns DOM
// overflow metrics so the invariant QA can catch clipping.
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const runtimeConfig = require('./runtimeConfig');

const COVER_VERSION = 'covdna-v1';
const COVER_DIR = runtimeConfig.resolvePersistentDir('covers-ai');
fs.mkdirSync(COVER_DIR, { recursive: true });

// ── MOTIF RENDERERS (SVG/CSS fragments) ─────────────────────────────────────
function motifSVG(motif, p) {
  const a = p.accent, ink = p.ink, base = p.base, soft = p.muted;
  switch (motif) {
    case 'corner-brackets':
      return `<div class="motif mt-brackets" style="--a:${a}"></div>`;
    case 'rule':
    case 'hairline':
    case 'thick-rule':
      return `<div class="motif mt-rule" style="--a:${a}"></div>`;
    case 'thin-grid':
      return `<div class="motif mt-grid" style="--a:${soft}"></div>`;
    case 'blueprint':
      return `<div class="motif mt-grid mt-blueprint" style="--a:${soft}"></div>`;
    case 'band':
      return `<div class="motif mt-band" style="--a:${a}"></div>`;
    case 'diagonal':
      return `<div class="motif mt-diagonal" style="--a:${a}"></div>`;
    case 'dots':
      return `<div class="motif mt-dots" style="--a:${a}"></div>`;
    case 'wave':
      return `<svg class="motif" viewBox="0 0 1200 400" preserveAspectRatio="none"><path d="M0 220 C 200 120, 400 320, 600 220 S 1000 120, 1200 220 L1200 400 L0 400 Z" fill="${a}" opacity="0.9"/></svg>`;
    case 'arc':
    case 'leaf-arc':
      return `<svg class="motif" viewBox="0 0 1200 1200" preserveAspectRatio="none"><circle cx="1050" cy="150" r="360" fill="${a}" opacity="0.92"/><circle cx="1050" cy="150" r="240" fill="${base}" opacity="0.25"/></svg>`;
    case 'blob':
      return `<svg class="motif" viewBox="0 0 1200 1200" preserveAspectRatio="none"><path d="M280 260 C 520 120, 900 200, 980 460 C 1060 720, 820 980, 520 940 C 240 900, 80 660, 140 480 C 190 320, 160 340, 280 260Z" fill="${a}" opacity="0.9"/></svg>`;
    case 'confetti':
      return `<div class="motif mt-confetti" style="--a:${a};--b:${soft}"></div>`;
    case 'monogram':
      return `<div class="motif mt-mono" style="--a:${a}">${p.monogram || ''}</div>`;
    case 'ribbon':
      return `<div class="motif mt-ribbon" style="--a:${a}"></div>`;
    default:
      return `<div class="motif mt-rule" style="--a:${a}"></div>`;
  }
}

// ── HERO LAYER ──────────────────────────────────────────────────────────────
// 'photo'/'illustration' use the injected data URI; 'abstract'/'vector'/
// 'typographic' need NO photo (avoids AI-photo garbled text entirely).
function heroLayer(dna, heroDataUri, content) {
  const p = dna.palette;
  const mode = (heroDataUri && (dna.heroModality === 'photo' || dna.heroModality === 'illustration'))
    ? dna.heroModality
    : (dna.heroModality === 'typographic' ? 'typographic'
      : dna.heroModality === 'vector' ? 'vector'
      : (heroDataUri ? dna.heroModality : 'abstract'));

  if (mode === 'photo' || mode === 'illustration') {
    return `<div class="hero hero-img" style="background-image:url('${heroDataUri}')">
      <div class="hero-scrim"></div>
      <div class="hero-type">${heroType(content, dna)}</div>
    </div>`;
  }
  if (mode === 'typographic') {
    const big = (content.title || 'NicheGate').split(/\s+/)[0].slice(0, 12).toUpperCase();
    return `<div class="hero hero-typo" style="--a:${p.accent};--base:${p.base};--on:${p.onBase}">
      <div class="typo-big">${big}</div>
      <div class="hero-type">${heroType(content, dna)}</div>
    </div>`;
  }
  if (mode === 'vector') {
    return `<div class="hero hero-vec" style="--a:${p.accent};--base:${p.base}">
      <svg viewBox="0 0 1200 620" preserveAspectRatio="xMidYMid slice" class="vec-art">
        <rect width="1200" height="620" fill="${p.base}"/>
        <circle cx="980" cy="120" r="300" fill="${p.accent}" opacity="0.95"/>
        <circle cx="980" cy="120" r="190" fill="${p.baseDeep}" opacity="0.35"/>
        <g stroke="${p.accent}" stroke-width="6" opacity="0.9">
          <line x1="80" y1="470" x2="520" y2="470"/><line x1="80" y1="500" x2="380" y2="500"/>
        </g>
      </svg>
      <div class="hero-type">${heroType(content, dna)}</div>
    </div>`;
  }
  // abstract
  return `<div class="hero hero-abs" style="--a:${p.accent};--base:${p.base};--deep:${p.baseDeep}">
    <div class="abs-a"></div><div class="abs-b"></div>
    <div class="hero-type">${heroType(content, dna)}</div>
  </div>`;
}

function heroType(content, dna) {
  const p = dna.palette;
  return `<div class="kicker">${escape(content.kicker || content.brand || 'NICHEGATE')}</div>
    <h1 style="color:var(--on)">${escape(content.title || 'Product')}</h1>
    ${content.subtitle ? `<div class="tagline" style="color:var(--on)">${escape(content.subtitle)}</div>` : ''}`;
}

function escape(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// ── BUILD COVER HTML ────────────────────────────────────────────────────────
function buildCoverHTML(dna, content = {}, heroDataUri = null, opts = {}) {
  const p = dna.palette;
  const size = opts.size || 1200;
  const bullets = (content.bullets || []).slice(0, 4);
  const fontsUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(dna.fonts.display).replace(/%20/g, '+')}:wght@400;600;700;800&family=${encodeURIComponent(dna.fonts.body).replace(/%20/g, '+')}:wght@400;500;600;700&display=swap`;

  const corner = dna.corner === 'pill' ? 26 : dna.corner === 'soft' ? 10 : 0;
  const pad = dna.density === 'dense' ? 46 : dna.density === 'airy' ? 84 : 62;

  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${fontsUrl}">
<style>
  :root{
    --base:${p.base}; --deep:${p.baseDeep}; --surface:${p.surface}; --ink:${p.ink};
    --muted:${p.muted}; --accent:${p.accent}; --accent-ink:${p.accentInk}; --on:${p.onBase};
    --r:${corner}px; --pad:${pad}px;
    --display:'${dna.fonts.display}',Georgia,serif; --body:'${dna.fonts.body}',system-ui,sans-serif;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:${size}px;height:${size}px;overflow:hidden;background:var(--surface);
    font-family:var(--body);color:var(--ink);-webkit-font-smoothing:antialiased}
  .cover{position:relative;width:${size}px;height:${size}px;overflow:hidden;background:var(--surface);
    display:flex;flex-direction:column}
  .hero{position:relative;overflow:hidden;flex:0 0 auto}
  .hero-img{height:56%;background-size:cover;background-position:center;background-color:var(--base)}
  .hero-scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,12,20,0.20) 0%,rgba(10,12,20,0.72) 100%)}
  .hero-type{position:absolute;left:var(--pad);right:var(--pad);bottom:calc(var(--pad) * 0.7);z-index:2}
  .hero-typo,.hero-vec,.hero-abs{height:56%;position:relative;display:flex;align-items:flex-end}
  .hero-typo{background:var(--base)}
  .typo-big{position:absolute;top:-4%;left:-2%;font-family:var(--display);font-weight:800;
    font-size:300px;line-height:0.8;color:var(--on);opacity:0.10;letter-spacing:-.04em;white-space:nowrap}
  .hero-vec .vec-art{position:absolute;inset:0;width:100%;height:100%}
  .hero-abs{background:linear-gradient(135deg,var(--base) 0%,var(--deep) 100%)}
  .abs-a{position:absolute;width:520px;height:520px;border-radius:50%;right:-120px;top:-140px;
    background:radial-gradient(circle at 35% 35%,var(--accent),transparent 62%);filter:blur(6px);opacity:.95}
  .abs-b{position:absolute;width:380px;height:380px;border-radius:50%;left:-80px;bottom:-160px;
    background:radial-gradient(circle at 60% 60%,var(--accent),transparent 65%);opacity:.45}
  .kicker{font-family:var(--body);font-weight:600;font-size:22px;letter-spacing:.28em;
    text-transform:uppercase;color:var(--accent);margin-bottom:14px}
  .hero h1{font-family:var(--display);font-weight:800;font-size:78px;line-height:1.02;letter-spacing:-.02em;
    max-width:88%;text-shadow:0 2px 24px rgba(0,0,0,.30)}
  .tagline{margin-top:16px;font-size:26px;font-weight:500;max-width:80%;opacity:.95}
  .body{flex:1 1 auto;min-height:0;overflow:hidden;padding:var(--pad);display:flex;flex-direction:column;justify-content:space-between;position:relative}
  .bullets{display:grid;grid-template-columns:1fr 1fr;gap:18px 26px;margin-top:6px}
  .bullet{display:flex;gap:12px;align-items:flex-start;font-size:23px;line-height:1.28;color:var(--ink)}
  .dot{flex:0 0 auto;width:16px;height:16px;border-radius:50%;margin-top:7px;background:var(--accent)}
  .foot{display:flex;align-items:center;justify-content:space-between;margin-top:auto;padding-top:22px;
    border-top:2px solid color-mix(in srgb,var(--ink) 18%,transparent)}
  .mono{font-family:var(--display);font-weight:800;font-size:34px;letter-spacing:-.02em;color:var(--base)}
  .mono small{display:block;font-family:var(--body);font-weight:600;font-size:14px;letter-spacing:.22em;
    text-transform:uppercase;color:var(--muted)}
  .chip{background:var(--accent);color:var(--accent-ink);font-weight:800;font-size:26px;
    padding:16px 28px;border-radius:var(--r);font-family:var(--body)}
  /* motifs */
  .motif{position:absolute;pointer-events:none}
  .mt-brackets{inset:22px;border:0}
  .mt-brackets::before,.mt-brackets::after,.mt-brackets span::before{content:''}
  .mt-rule{left:var(--pad);right:var(--pad);top:calc(56% + 2px);height:3px;background:var(--a);opacity:.0}
  .mt-grid{inset:0;background-image:linear-gradient(var(--a) 1px,transparent 1px),linear-gradient(90deg,var(--a) 1px,transparent 1px);
    background-size:44px 44px;opacity:.10}
  .mt-blueprint{background-size:64px 64px;opacity:.14}
  .mt-band{left:0;right:0;bottom:0;height:16px;background:var(--a)}
  .mt-diagonal{inset:0;background-image:repeating-linear-gradient(135deg,var(--a) 0 10px,transparent 10px 34px);opacity:.06}
  .mt-dots{inset:0;background-image:radial-gradient(var(--a) 2.4px,transparent 2.6px);background-size:34px 34px;opacity:.14}
  .mt-confetti{inset:0;background-image:radial-gradient(var(--a) 4px,transparent 5px),radial-gradient(var(--b) 3px,transparent 4px);
    background-size:90px 90px,70px 70px;background-position:0 0,30px 40px;opacity:.10}
  .mt-mono{right:-10px;bottom:-40px;font-family:var(--display);font-weight:800;font-size:340px;color:var(--a);opacity:.06;line-height:.7}
  .mt-ribbon{position:absolute;top:44px;right:-120px;width:420px;height:56px;background:var(--a);
    transform:rotate(38deg);opacity:.95}
  .frame{position:absolute;inset:26px;border:2px solid color-mix(in srgb,var(--ink) 30%,transparent);pointer-events:none}
  .bracket{position:absolute;width:34px;height:34px;border:3px solid var(--accent);pointer-events:none}
  .bracket.tl{left:26px;top:26px;border-right:0;border-bottom:0}
  .bracket.tr{right:26px;top:26px;border-left:0;border-bottom:0}
  .bracket.bl{left:26px;bottom:26px;border-right:0;border-top:0}
  .bracket.br{right:26px;bottom:26px;border-left:0;border-top:0}
  /* layouts */
  .layout-split .cover{flex-direction:row}
  .layout-split .hero{width:52%;height:${size}px}
  .layout-split .body{width:48%}
  .layout-poster .hero{height:74%}
  .layout-poster .hero h1{font-size:96px}
  .layout-banded .hero-img,.layout-banded .hero-typo,.layout-banded .hero-vec,.layout-banded .hero-abs{height:44%}
  .layout-banded .body{background:var(--surface)}
  .layout-sidebar .body{padding-left:calc(var(--pad) + 10px);border-left:10px solid var(--accent)}
  .layout-magazine .hero{height:62%}
  .layout-magazine .bullets{grid-template-columns:1fr}
  .layout-framed .hero{height:48%;margin:26px;width:calc(100% - 52px)}
  .layout-framed .body{padding-top:0}
  .density-dense .bullet{font-size:21px}
  .density-airy .bullets{gap:26px 30px}
</style></head>
<body class="layout-${dna.layout} density-${dna.density}">
  <div class="cover">
    ${heroLayer(dna, heroDataUri, content)}
    ${motifSVG(dna.motif, { ...p, monogram: dna.monogram })}
    <div class="body">
      <div class="bullets">
        ${bullets.map(b => `<div class="bullet"><span class="dot"></span><span>${escape(b)}</span></div>`).join('')}
      </div>
      <div class="foot">
        <div class="mono">${escape(dna.monogram)}<small>${escape(content.brand || 'NicheGate')}</small></div>
        <div class="chip">${escape(content.price || '')}</div>
      </div>
    </div>
    ${dna.motif === 'corner-brackets' ? '<span class="bracket tl"></span><span class="bracket tr"></span><span class="bracket bl"></span><span class="bracket br"></span>' : ''}
  </div>
</body></html>`;
}

// ── RENDER TO PNG (shared Chrome) ───────────────────────────────────────────
async function renderCover({ product = {}, prof = {}, dna, content = {}, heroDataUri = null, outPath = null, size = 1200 }) {
  if (!dna) throw new Error('renderCover: dna is required');
  const pdfGen = require('./pdfGenerator');
  const browser = await pdfGen.getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    const html = buildCoverHTML(dna, content, heroDataUri, { size });
    const slug = prof.slug || 'product';
    const id = product.id != null ? product.id : 'x';
    const htmlPath = outPath ? outPath.replace(/\.png$/i, '.html') : path.join(COVER_DIR, `${slug}-${id}-${COVER_VERSION}.html`);
    const pngPath = outPath || path.join(COVER_DIR, `${slug}-${id}-${COVER_VERSION}.png`);
    fs.writeFileSync(htmlPath, html);
    await page.setContent(html, { waitUntil: 'load', timeout: 30000 }).catch(() => {});
    await page.evaluate(() => (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve())).catch(() => {});
    // DOM overflow metrics for the clipping invariant.
    const dom = await page.evaluate(() => {
      const el = document.querySelector('.cover') || document.body;
      return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
    }).catch(() => null);
    await page.screenshot({ path: pngPath, type: 'png' });
    // Persist DOM overflow metrics beside the PNG so the publish gate (which
    // only sees the image file) can still run the clipping invariant.
    try {
      fs.writeFileSync(pngPath.replace(/\.png$/i, '.meta.json'), JSON.stringify({ dom, dnaHash: dna.hash, version: COVER_VERSION }));
    } catch { /* non-fatal */ }
    return { pngPath, htmlPath, dom, dnaHash: dna.hash };
  } finally {
    await page.close().catch(() => {});
  }
}

module.exports = { COVER_VERSION, buildCoverHTML, renderCover, motifSVG };
