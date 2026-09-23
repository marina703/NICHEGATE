// Builds landing.html for the Gumroad profile page from real product data.
// Input:  ../.audit-tmp/gprods.json  (gumroad products list --all)
// Output: landing.html (self-contained; sanitizer-safe: no required JS)
const fs = require('fs');

const raw = JSON.parse(fs.readFileSync(__dirname + '/../.audit-tmp/gprods.json', 'utf8'));
const products = (raw.products || []).filter(p => p.published && !p.deleted);

// ---- clean doubled names: "Niche Niche Type" -> "Niche Type" -------------
function cleanName(name) {
  let n = name.replace(/\s+/g, ' ').trim();
  const words = n.split(' ');
  for (let len = 4; len >= 2; len--) {
    for (let start = 0; start <= words.length - len * 2; start++) {
      const a = words.slice(start, start + len).join(' ').toLowerCase();
      const b = words.slice(start + len, start + len * 2).join(' ').toLowerCase();
      if (a === b) return cleanName(words.slice(0, start).concat(words.slice(start + len)).join(' '));
    }
  }
  return n;
}
function pickType(n) {
  const m = n.match(/(spreadsheet|checklist|invoice|template|booking form|social media kit|social media|social kit|calculator|planner|agreement|contract|guide|kit|bundle|tracker|form)\b/i);
  const t = m ? m[1].toLowerCase() : 'kit';
  return t === 'social media' || t === 'social kit' ? 'social media kit' : t;
}

// ---- classify into collections -------------------------------------------
const RULES = [
  { key: 'property',  label: 'Property & Field Services', icon: '🏠', re: /cleaner|duct|mold|hvac|roof|appliance|landscap|energy audit|paint|pest|pool|chimney|gutter|pressure wash|handyman|electrician|plumb|tree service|window clean|construction|contractor|home inspect|septic|foundation|fence|deck|drywall|flooring|garage|junk remov|moving|organiz|staging|locksmith|weld|solar|insulation/i },
  { key: 'photo',     label: 'Photo & Video Pros',        icon: '📷', re: /photograph|drone|videograph|wedding|studio|retouch/i },
  { key: 'legal',     label: 'Legal & Notary',            icon: '⚖️', re: /notary|loan signing|legal|attorney|paralegal|court|process server/i },
  { key: 'wellness',  label: 'Recovery & Wellness',       icon: '🌿', re: /recovery|sobriety|wellness|massage|yoga|fitness|nutrition|therap|counsel/i },
  { key: 'creative',  label: 'Creative & Beauty',         icon: '✨', re: /tattoo|nail|salon|barber|beauty|artist|baker|bakery|candle|craft|jewelry|floral|event planner|dj|music/i },
  { key: 'outdoors',  label: 'Outdoor & Specialty Trades', icon: '🎯', re: /fishing|guide|charter|pyrotechnic|firework|beekeep|apiary|farm|farrier|dog train|pet|hunt/i },
];
function classify(n) {
  for (const r of RULES) if (r.re.test(n)) return r.key;
  return 'property';
}

// ---- dedupe by name+type, prefer cheapest, keep all real links -----------
const seen = new Map();
for (const p of products) {
  const name = cleanName(p.name || '');
  const type = pickType(name);
  const key = name.toLowerCase() + '|' + type;
  const item = {
    name,
    type,
    url: p.short_url || p.url,
    price: p.formatted_price || ('$' + (p.price / 100).toFixed(2)),
    priceCents: p.price || 0,
    thumb: p.preview_url || (Array.isArray(p.covers) && p.covers[0] && p.covers[0].url) || '',
    sales: p.sales_count || 0,
  };
  if (!item.url) continue;
  const prev = seen.get(key);
  if (!prev || item.priceCents < prev.priceCents) seen.set(key, item);
}
const all = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));

// Gumroad reviewer caps a page at 25 images: curate covers for the top 20
// (by real sales, then cover availability) — the rest render as deco text cards.
const FEATURE_LIMIT = 20;
const featured = new Set(
  [...all].sort((a, b) => (b.sales - a.sales) || ((b.thumb ? 1 : 0) - (a.thumb ? 1 : 0)) || a.name.localeCompare(b.name))
    .slice(0, FEATURE_LIMIT)
    .filter(i => i.thumb)
    .map(i => i.url)
);

const groups = RULES.map(r => ({ ...r, items: all.filter(i => classify(i.name) === r.key) }))
  .filter(g => g.items.length)
  .sort((a, b) => b.items.length - a.items.length);
const ungrouped = all.filter(i => !groups.some(g => g.items.includes(i)));
if (ungrouped.length) groups.push({ key: 'more', label: 'More Toolkits', icon: '🗂️', items: ungrouped });

// ---- card + section rendering --------------------------------------------
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const card = i => {
  const showThumb = i.thumb && featured.has(i.url);
  return `
        <a class="card${showThumb ? '' : ' card-text'}" href="${esc(i.url)}">
          ${showThumb
            ? `<div class="card-thumb"><img src="${esc(i.thumb)}" alt="" loading="lazy"></div>`
            : `<div class="card-blank" aria-hidden="true">◆</div>`}
          <div class="card-body">
            <span class="card-type">${esc(i.type)}</span>
            <h3>${esc(i.name)}</h3>
            <span class="card-price">${esc(i.price)}</span>
          </div>
        </a>`;
};
const section = g => `
    <section class="collection" id="${g.key}">
      <h2><span class="c-icon" aria-hidden="true">${g.icon}</span> ${esc(g.label)} <span class="c-count">${g.items.length}</span></h2>
      <div class="grid">${g.items.map(card).join('')}
      </div>
    </section>`;

const total = all.length;
const hasFree = all.some(i => i.priceCents === 0);
const TYPE_RE = /\b(spreadsheet|checklist|invoice|template|booking form|booking|social media kit|social media|social kit|calculator|planner|agreement|contract|guide|kit|bundle|tracker|form|temps|temp)\b/gi;
const nicheCount = new Set(all.map(i => i.name.replace(TYPE_RE, ' ').replace(/\s*\/\s*$/, '').replace(/\s+/g, ' ').trim().toLowerCase()).filter(Boolean)).size;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="description" content="NicheGate — plug-and-play business toolkits for ${nicheCount}+ niches. Spreadsheets, checklists, invoices & social kits, ready the day you open for business.">
<title>NicheGate — Empowerment Gateway to Growth</title>
<style>
  :root {
    --bg: #f2f0ec; --panel: #ffffff; --ink: #17130f; --ink-2: #5c554d; --ink-3: #8a8178;
    --line: #e3ddd4; --teal: #0f8b8d; --pink: #c2426d; --gold: #b98a2f;
    --chip: #f6f3ee; --shadow: 0 1px 2px rgba(23,19,15,.06), 0 10px 30px rgba(23,19,15,.07);
    --hero: #100d0b;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0d0b09; --panel: #171310; --ink: #f5efe6; --ink-2: #b3a89a; --ink-3: #7d7366;
      --line: #2a231d; --teal: #4fd1c5; --pink: #ff7fa8; --gold: #d9ab4a;
      --chip: #201a15; --shadow: 0 1px 2px rgba(0,0,0,.4), 0 12px 34px rgba(0,0,0,.5);
    }
  }
  [data-theme="light"] { --bg:#f2f0ec; --panel:#fff; --ink:#17130f; --ink-2:#5c554d; --ink-3:#8a8178; --line:#e3ddd4; --teal:#0f8b8d; --pink:#c2426d; --gold:#b98a2f; --chip:#f6f3ee; --shadow:0 1px 2px rgba(23,19,15,.06),0 10px 30px rgba(23,19,15,.07); }
  [data-theme="dark"]  { --bg:#0d0b09; --panel:#171310; --ink:#f5efe6; --ink-2:#b3a89a; --ink-3:#7d7366; --line:#2a231d; --teal:#4fd1c5; --pink:#ff7fa8; --gold:#d9ab4a; --chip:#201a15; --shadow:0 1px 2px rgba(0,0,0,.4),0 12px 34px rgba(0,0,0,.5); }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.6 Georgia, 'Times New Roman', serif; -webkit-font-smoothing: antialiased; }
  .wrap { max-width: 1080px; margin: 0 auto; padding: 0 20px; }
  a { color: inherit; }

  /* hero: the brand's black plate, banner artwork under a scrim, deco corner glows */
  .hero { position: relative; background: linear-gradient(rgba(16,13,11,.80), rgba(16,13,11,.88)), url('%%BANNER%%') center 30%/cover no-repeat, var(--hero); overflow: hidden; border-bottom: 1px solid var(--line); }
  .hero::before, .hero::after {
    content: ""; position: absolute; top: 0; bottom: 0; width: 46%;
    background:
      radial-gradient(60% 90% at 0% 100%, rgba(79,209,197,.16), transparent 60%),
      repeating-linear-gradient(115deg, rgba(79,209,197,.05) 0 2px, transparent 2px 26px);
  }
  .hero::after {
    right: 0; left: auto;
    background:
      radial-gradient(60% 90% at 100% 100%, rgba(255,127,168,.16), transparent 60%),
      repeating-linear-gradient(-115deg, rgba(255,127,168,.05) 0 2px, transparent 2px 26px);
  }
  .hero-inner { position: relative; z-index: 1; text-align: center; padding: 46px 20px 42px; }
  .hero-logo { width: 148px; height: 148px; border-radius: 18px; display: block; margin: 0 auto 20px;
    box-shadow: 0 0 0 1px rgba(255,255,255,.08), 0 18px 50px rgba(0,0,0,.55); }
  .hero h1 { margin: 0; font: 700 clamp(2rem, 5.5vw, 3rem)/1.05 Georgia, serif; letter-spacing: .14em; text-transform: uppercase; color: #fff; }
  .hero h1 .t { color: #6ee7de; }
  .hero h1 .g { color: #ff8fb2; }
  .hero .tag { margin: 10px auto 0; color: #c9bfae; font: 400 .95rem/1.5 Georgia, serif; letter-spacing: .34em; text-transform: uppercase; }
  .hero .tag b { color: #6ee7de; font-weight: 400; }
  .hero .tag i { color: #ff8fb2; font-style: normal; }
  .hero .rule { width: 220px; height: 10px; margin: 22px auto 0; color: #a89468; }
  .hero p.lede { color: #e8e1d4; max-width: 620px; margin: 18px auto 0; font-size: 1.02rem; }
  .hero .stats { display: flex; gap: 26px; justify-content: center; margin-top: 26px; flex-wrap: wrap; }
  .hero .stat { color: #c9bfae; font-size: .8rem; letter-spacing: .18em; text-transform: uppercase; }
  .hero .stat b { display: block; font: 700 1.5rem Georgia, serif; color: #fff; letter-spacing: 0; }
  .theme-toggle { position: absolute; top: 14px; right: 14px; z-index: 2; background: rgba(255,255,255,.06);
    color: #e8e1d4; border: 1px solid rgba(255,255,255,.18); border-radius: 999px; padding: 7px 14px;
    font: 600 .72rem/1 Georgia, serif; letter-spacing: .14em; text-transform: uppercase; cursor: pointer; }
  .theme-toggle:hover { background: rgba(255,255,255,.12); }

  /* collections */
  main { padding: 26px 0 10px; }
  .jump { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin: 6px 0 10px; }
  .jump a { text-decoration: none; background: var(--chip); border: 1px solid var(--line); color: var(--ink-2);
    border-radius: 999px; padding: 7px 14px; font: 600 .74rem/1 Georgia, serif; letter-spacing: .1em; text-transform: uppercase; }
  .jump a:hover { color: var(--ink); border-color: var(--ink-3); }
  .collection { margin: 34px 0; }
  .collection h2 { display: flex; align-items: center; gap: 10px; margin: 0 0 4px;
    font: 700 1.18rem/1.2 Georgia, serif; letter-spacing: .04em; }
  .c-icon { font-size: 1.1rem; }
  .c-count { color: var(--ink-3); font: 600 .72rem/1 Georgia, serif; letter-spacing: .12em;
    border: 1px solid var(--line); border-radius: 999px; padding: 4px 9px; }
  .collection .sub { margin: 0 0 16px; color: var(--ink-2); font-size: .92rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 16px; }
  .card { display: flex; flex-direction: column; background: var(--panel); border: 1px solid var(--line);
    border-radius: 12px; overflow: hidden; text-decoration: none; box-shadow: var(--shadow);
    transition: transform .15s ease, border-color .15s ease; }
  .card:hover { transform: translateY(-2px); border-color: var(--teal); }
  .card-thumb { aspect-ratio: 4/3; background: var(--chip); }
  .card-text .card-blank { aspect-ratio: auto; height: 6px; padding: 2px 14px 0; font-size: .8rem; opacity: .5; }
  .card-text .card-body { padding-top: 10px; }
  .card-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .card-blank { display: flex; align-items: center; justify-content: center; color: var(--ink-3); font-size: 1.4rem; }
  .card-body { padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 4px; flex: 1; }
  .card-type { color: var(--ink-3); font: 600 .62rem/1 Georgia, serif; letter-spacing: .16em; text-transform: uppercase; }
  .card h3 { margin: 0; font: 700 .98rem/1.35 Georgia, serif; color: var(--ink); }
  .card-price { margin-top: auto; padding-top: 6px; color: var(--teal); font: 700 .95rem Georgia, serif; }

  /* follow */
  .follow { background: var(--panel); border: 1px solid var(--line); border-radius: 16px;
    padding: 30px 24px; text-align: center; margin: 44px 0; box-shadow: var(--shadow); }
  .follow h2 { margin: 0 0 6px; font: 700 1.3rem Georgia, serif; }
  .follow p { margin: 0 auto 18px; color: var(--ink-2); max-width: 460px; font-size: .95rem; }
  .follow form { display: flex; gap: 10px; max-width: 440px; margin: 0 auto; }
  .follow input { flex: 1; min-width: 0; background: var(--bg); border: 1px solid var(--line); color: var(--ink);
    border-radius: 10px; padding: 12px 14px; font: 400 .95rem Georgia, serif; }
  .follow input:focus { outline: 2px solid var(--teal); outline-offset: 1px; }
  .follow button { background: linear-gradient(100deg, var(--teal), var(--pink)); color: #fff; border: 0;
    border-radius: 10px; padding: 12px 20px; font: 700 .8rem Georgia, serif; letter-spacing: .12em;
    text-transform: uppercase; cursor: pointer; }
  .follow-msg { margin: 12px 0 0; color: var(--teal); font-size: .9rem; min-height: 1.2em; }

  footer { border-top: 1px solid var(--line); margin-top: 30px; }
  footer .wrap { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; justify-content: space-between;
    padding: 22px 20px; color: var(--ink-3); font-size: .8rem; letter-spacing: .1em; text-transform: uppercase; }
  footer .deco { color: var(--gold); letter-spacing: .3em; }
  footer a { color: var(--ink-2); text-decoration: none; }
  footer a:hover { color: var(--ink); }

  @media (max-width: 640px) {
    .hero-logo { width: 118px; height: 118px; }
    .grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
    .follow form { flex-direction: column; }
    .hero .tag { letter-spacing: .2em; }
  }
</style>
</head>
<body>
<header class="hero">
  <button class="theme-toggle" type="button" data-theme-toggle aria-label="Toggle color theme">Theme ◐</button>
  <div class="hero-inner">
    <img class="hero-logo" src="%%LOGO%%" alt="NicheGate logo" width="148" height="148">
    <h1><span class="t">Niche</span><span class="g">Gate</span></h1>
    <p class="tag"><b>Empowerment</b> Gateway to <i>Growth</i></p>
    <svg class="rule" viewBox="0 0 220 10" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1">
      <line x1="0" y1="5" x2="86" y2="5"/><path d="M96 5l14-4v8z"/><line x1="120" y1="5" x2="220" y2="5"/>
    </svg>
    <p class="lede">Plug-and-play business toolkits for real working niches — spreadsheets, checklists, invoices, booking forms and social kits, ready the day you open for business.</p>
    <div class="stats">
      <div class="stat"><b>${total}</b> toolkits</div>
      <div class="stat"><b>${nicheCount}+</b> niches</div>
      <div class="stat"><b>${hasFree ? 'Free' : '$' + (Math.min(...all.filter(i => i.priceCents > 0).map(i => i.priceCents)) / 100).toFixed(0)}</b> ${hasFree ? 'starter pack' : 'starting'}</div>
    </div>
  </div>
</header>
<main class="wrap">
  <nav class="jump" aria-label="Collections">${groups.map(g => `<a href="#${g.key}">${esc(g.label)}</a>`).join('')}</nav>
  ${groups.map(section).join('')}

  <section class="follow">
    <h2>New toolkit drops, first</h2>
    <p>One short email when a new niche lands. No spam, unsubscribe anytime.</p>
    <form data-gumroad-follow>
      <input type="email" name="email" placeholder="you@yourbusiness.com" required aria-label="Email address">
      <button type="submit">Notify me</button>
    </form>
    <p class="follow-msg" data-gumroad-follow-message></p>
  </section>
</main>
<footer>
  <div class="wrap">
    <span class="deco">◆ ◇ ◆</span>
    <span>NicheGate — Empowerment Gateway to Growth</span>
    <a href="https://marinablow.gumroad.com/">All products →</a>
  </div>
</footer>
<script>
  // progressive enhancement only: page is fully functional without it
  (function () {
    try {
      var saved = localStorage.getItem('ng-theme');
      if (saved) document.documentElement.setAttribute('data-theme', saved);
    } catch (e) {}
    var btn = document.querySelector('[data-theme-toggle]');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme');
      var sys = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      var next = (cur || sys) === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('ng-theme', next); } catch (e) {}
    });
  })();
</script>
</body>
</html>
`;

fs.writeFileSync(__dirname + '/landing.html', html.replace('%%LOGO%%', process.env.LOGO_SRC || './assets-remote/logo.jpg').replace('%%BANNER%%', process.env.BANNER_SRC || './assets-remote/banner.jpg'));
console.log('landing.html written:', (html.length / 1024).toFixed(1) + 'KB',
  '| products:', total, '| niches:', nicheCount, '| collections:', groups.map(g => g.key + ':' + g.items.length).join(' '));
