// ─────────────────────────────────────────────────────────────────────────
// STOREFRONT — live products + design showcase. CSP-safe: no inline handlers,
// every dynamic value escaped, every remote URL scheme-validated before it is
// placed in an href/src (defeats javascript:/data: injection via server data).
// ─────────────────────────────────────────────────────────────────────────

const FALLBACK = [
  { emoji: '🧾', cat: 'Invoice', name: 'Premium Service Invoice', desc: 'Clean, editable invoice template with payment terms.', price: '$12' },
  { emoji: '🌐', cat: 'Website', name: 'One-Page Business Site', desc: 'Sleek single-page website template, fully editable.', price: '$24' },
  { emoji: '🎨', cat: 'Brand Kit', name: 'Complete Brand Identity Kit', desc: 'Logo marks, color palette, typography, social cards.', price: '$19' },
  { emoji: '📊', cat: 'Tool', name: 'Pricing Calculator', desc: 'Smart spreadsheet that does the math for you.', price: '$17' },
  { emoji: '📓', cat: 'Journal', name: 'Recovery Journal', desc: '30-day guided reflection journal with daily prompts.', price: '$15' },
  { emoji: '📱', cat: 'Social', name: 'Social Media Content Pack', desc: 'Branded Instagram + TikTok template pack.', price: '$15' },
  { emoji: '✅', cat: 'Checklist', name: 'Service Quality Checklist', desc: 'Professional pre/post job checklist for any trade.', price: '$10' },
  { emoji: '📅', cat: 'Booking', name: 'Appointment Booking Form', desc: 'Clean booking + scheduling template.', price: '$22' }
];

const TYPE_LABEL = {
  invoice: 'Invoice', checklist: 'Checklist', spreadsheet: 'Spreadsheet', booking: 'Booking',
  social: 'Social', journal: 'Journal', brand: 'Brand Kit', 'decision-matrix': 'Decision Matrix',
  roi: 'ROI Calculator', bundle: 'Complete Toolkit'
};

let STORE_URL = 'https://gumroad.com';

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Only http(s) absolute or same-origin relative URLs may become href/src.
function safeUrl(u) {
  const s = String(u || '');
  if (/^https:\/\//i.test(s) || /^http:\/\//i.test(s)) return s;
  if (s.startsWith('/')) return s;
  return '';
}

// Live product card — real design preview image + buy link when live
function productCard(p) {
  const src = safeUrl(p.previewUrl);
  const thumb = src
    ? `<img src="${esc(src)}" alt="${esc(p.name)}" loading="lazy">`
    : `<span>${esc(p.emoji || '📦')}</span>`;
  const buy = safeUrl(p.buyUrl);
  const action = buy
    ? `<a class="buy" href="${esc(buy)}" target="_blank" rel="noopener noreferrer">Buy →</a>`
    : `<span class="soon">Coming soon</span>`;
  return `
  <div class="card">
    <div class="thumb"><span class="cat">${esc(p.category || p.type || '')}</span>${thumb}</div>
    <div class="body">
      <h3>${esc(p.name)}</h3>
      <p>${esc(TYPE_LABEL[p.type] || p.type || '')} — instant download, fully editable.</p>
      <div class="foot">
        <span class="price">${esc(p.price)}</span>
        ${action}
      </div>
    </div>
  </div>`;
}

// Showcase card — click opens the lightbox via delegation (no inline JS).
function showCard(d) {
  const src = safeUrl(d.previewUrl);
  return `
  <div class="show-card" data-action="lightbox" data-name="${esc(d.name)}" data-src="${esc(src)}" role="button" tabindex="0" aria-label="Preview ${esc(d.name)}">
    <div class="thumb">
      <span class="stamp ${d.live ? 'live' : ''}">${d.live ? 'Live' : 'Preview'}</span>
      <img src="${esc(src)}" alt="${esc(d.name)}" loading="lazy">
    </div>
    <div class="body">
      <h3>${esc(d.name)}</h3>
      <p><span class="prof">${d.emoji ? esc(d.emoji) + ' ' : ''}${esc(d.prof || '')}</span><span class="price">${esc(d.price || '')}</span></p>
    </div>
  </div>`;
}

function openLightbox(name, src) {
  if (!src) return;
  document.getElementById('lb-img').src = src;
  document.getElementById('lb-name').textContent = name;
  document.getElementById('lightbox').classList.add('open');
}
function closeLightbox() { document.getElementById('lightbox').classList.remove('open'); }

// One delegated handler covers cards, the ✕ button and overlay self-clicks.
document.addEventListener('click', (e) => {
  const closer = e.target.closest('[data-action="lightbox-close"]');
  if (closer) { closeLightbox(); return; }
  const overlay = e.target.closest('[data-action="lightbox-overlay"]');
  if (overlay && e.target === overlay) { closeLightbox(); return; }
  const card = e.target.closest('[data-action="lightbox"]');
  if (card) openLightbox(card.dataset.name, card.dataset.src);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'Enter' && document.activeElement?.dataset?.action === 'lightbox') {
    openLightbox(document.activeElement.dataset.name, document.activeElement.dataset.src);
  }
});

const grid = document.getElementById('product-grid');
const showGrid = document.getElementById('showcase-grid');

(async () => {
  let designs = [];
  try {
    const res = await fetch('/api/store/products');
    const data = await res.json();

    // Real store URL + lead magnet banner when available
    const storeUrl = safeUrl(data.storeUrl);
    if (storeUrl) {
      STORE_URL = storeUrl;
      document.querySelectorAll('a[data-store]').forEach(a => { a.href = STORE_URL; });
    }
    const magnetUrl = safeUrl(data.leadmagnetUrl);
    if (magnetUrl) {
      document.getElementById('leadmagnet-slot').innerHTML = `
        <div style="max-width:900px;margin:0 auto;background:linear-gradient(135deg,rgba(45,212,191,0.12),rgba(236,72,153,0.10));border:1px solid var(--teal);border-radius:16px;padding:36px 40px;display:flex;align-items:center;justify-content:space-between;gap:24px;flex-wrap:wrap;">
          <div>
            <div style="font-family:'Space Grotesk';font-size:1.3rem;font-weight:700;margin-bottom:6px;">🎁 Free Starter Pack</div>
            <div style="color:var(--muted);font-size:0.9rem;max-width:520px;">3 professional templates — invoice, checklist, pricing calculator. Enter $0 at checkout. See the quality before you buy anything.</div>
          </div>
          <a class="btn btn-primary" href="${esc(magnetUrl)}" target="_blank" rel="noopener noreferrer">Get it Free →</a>
        </div>`;
    }

    const live = (data.products || []).map(p => ({ ...p, category: p.category || p.type || '' }));
    grid.innerHTML = live.length ? live.map(productCard).join('') : FALLBACK.map(productCard).join('');
  } catch {
    grid.innerHTML = FALLBACK.map(productCard).join('');
  }

  try {
    const res = await fetch('/api/store/showcase');
    const data = await res.json();
    designs = [
      ...(data.designs || []),
      ...(data.bundles || []).map(b => ({ ...b, live: true, prof: b.prof_name, emoji: b.prof_emoji, previewUrl: `/api/products/${encodeURIComponent(b.id)}/preview-image` }))
    ];
    renderShowcase('all');
  } catch { /* showcase is optional */ }

  const chips = document.querySelectorAll('#showcase-filter .chip');
  chips.forEach(chip => chip.addEventListener('click', () => {
    chips.forEach(c => c.classList.remove('on'));
    chip.classList.add('on');
    renderShowcase(chip.dataset.t);
  }));

  function renderShowcase(filter) {
    const list = filter === 'all' ? designs : designs.filter(d => d.type === (filter === 'toolkit' ? 'bundle' : filter));
    showGrid.innerHTML = list.length
      ? list.map(showCard).join('')
      : `<div style="color:var(--muted);text-align:center;padding:40px;">More ${esc(TYPE_LABEL[filter] || filter)} designs are on the bench — check back soon.</div>`;
  }
})();
