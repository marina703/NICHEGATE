// ═══════════════════════════════════════════════════════════════════════
// FLIGHT DECK — UI primitives (no dependencies, native ES module)
// Escaping, icons, toasts, drawers, formatting and hand-rolled SVG charts.
// ═══════════════════════════════════════════════════════════════════════

// ── escaping ───────────────────────────────────────────────────────────
// Every dynamic value that reaches innerHTML goes through esc() or attr().
export function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
export function attr(v) { return esc(v); }

// ── formatting ─────────────────────────────────────────────────────────
export function fmtNum(n) {
  const v = Number(n) || 0;
  return v.toLocaleString();
}
export function fmtMoney(n, cents = false) {
  const v = Number(n) || 0;
  return '$' + v.toLocaleString(undefined, { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
}
export function timeAgo(iso) {
  if (!iso) return '—';
  const t = new Date(String(iso).replace(' ', 'T') + (String(iso).includes('Z') ? '' : 'Z')).getTime();
  if (!Number.isFinite(t)) return '—';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
export function clockTime(iso) {
  if (!iso) return '';
  const d = new Date(String(iso).replace(' ', 'T') + (String(iso).includes('Z') ? '' : 'Z'));
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
export function bytes(n) {
  const v = Number(n) || 0;
  if (v < 1024) return v + ' B';
  if (v < 1048576) return (v / 1024).toFixed(1) + ' KB';
  return (v / 1048576).toFixed(1) + ' MB';
}
export function titleCase(s) {
  return String(s || '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── review queue (single source of truth) ──────────────────────────────
// The Queue view, its pagination, its keyboard triage and the rail badge all
// read from here, so they can never disagree about what is awaiting review —
// a bug class the old single-file UI had (badge said 3, table showed 0).
export const REVIEW_STATUSES = ['draft', 'pending-review', 'pending_review'];
export const REVIEW_PER_PAGE = 10;
export function isReviewable(p) { return !!p && REVIEW_STATUSES.includes(p.status); }
export function reviewQueue(products) { return (products || []).filter(isReviewable); }
export function reviewPage(products, page) {
  const items = reviewQueue(products);
  const per = REVIEW_PER_PAGE;
  const pages = Math.max(1, Math.ceil(items.length / per));
  const current = Math.max(1, Math.min(Number(page) || 1, pages));
  return { items, per, pages, page: current, slice: items.slice((current - 1) * per, current * per) };
}

// ── icons (inline SVG, feather-style) ──────────────────────────────────
const PATHS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  catalog: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  review: '<path d="M9 11.5 12 14.5 20 6"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/>',
  discovery: '<circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4.5 4.5"/><path d="M11 8v6M8 11h6"/>',
  trends: '<path d="M3 17l5-6 4 4 5-8 4 5"/><path d="M3 21h18"/>',
  social: '<path d="M4 5h16v11H8l-4 4z"/><path d="M8 9h8M8 12.5h5"/>',
  ads: '<path d="M3 11v3a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z"/><path d="M17 8.5a5 5 0 0 1 0 7"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  analytics: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  automation: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>',
  marketplace: '<path d="M3 9h18l-1.5 11H4.5z"/><path d="M8 9V6a4 4 0 0 1 8 0v3"/>',
  system: '<path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.6 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 11.5 4a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 22 11a2 2 0 1 1 0 4z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m16.5 16.5 4.5 4.5"/>',
  play: '<path d="M5 3l14 9-14 9z"/>',
  stop: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  sparkles: '<path d="M12 3l1.8 4.6L18 9.4l-4.2 1.8L12 16l-1.8-4.8L6 9.4l4.2-1.8z"/><path d="M18.5 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  sun: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8"/>',
  moon: '<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"/>',
  bolt: '<path d="M13 2 4 14h6l-1 8 9-12h-6z"/>',
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  external: '<path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/>',
  rocket: '<path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2"/><path d="M9 15l-3-3c4-8 9-9 13-9 0 4-1 9-9 13z"/><circle cx="14.5" cy="9.5" r="1.5"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 21V13"/>',
  shield: '<path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6z"/><path d="m9 12 2 2 4-4"/>',
  brain: '<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 3 3 3 3 0 0 0 3-2V6a2 2 0 0 0-3-2z"/><path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-3 3 3 3 0 0 1-3-2V6a2 2 0 0 1 3-2z"/>',
  chevronLeft: '<path d="m15 6-6 6 6 6"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  command: '<path d="M9 3a3 3 0 1 0 0 6h6a3 3 0 1 0 0-6 3 3 0 0 0-3 3v12a3 3 0 1 0 3-3H9a3 3 0 1 0 0 6 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3z"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  pencil: '<path d="M4 20h4L20 8l-4-4L4 16z"/><path d="m14 6 4 4"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M6 7l1 13h10l1-13"/>',
  broom: '<path d="M14 4 9 9"/><path d="M12 6 6 12l-3 9 9-3 6-6z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  db: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
};
export function icon(name, size) {
  const p = PATHS[name] || PATHS.box;
  // Always declare a size: an SVG with only a viewBox stretches to fill
  // whatever flex/grid box it lands in (e.g. a .panel-head row).
  const s = Number(size) || 16;
  return `<svg viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true">${p}</svg>`;
}

// ── toasts ─────────────────────────────────────────────────────────────
export function toast(kind, title, message, ms) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = 'toast ' + (kind || 'info');
  el.innerHTML = `<div class="tt">${esc(title)}</div>${message ? `<div class="tm">${esc(message)}</div>` : ''}`;
  host.appendChild(el);
  while (host.children.length > 4) host.firstChild.remove();
  const life = ms || (kind === 'error' ? 6200 : kind === 'success' ? 3800 : 5000);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 200); }, life);
}

// ── drawers / modals ───────────────────────────────────────────────────
export function openDrawer(title, bodyHtml, opts = {}) {
  let d = document.getElementById('fd-drawer');
  if (!d) {
    d = document.createElement('aside');
    d.id = 'fd-drawer';
    d.className = 'drawer';
    d.innerHTML = '<div class="drawer-head"><span class="title"></span><span class="sp" style="flex:1"></span><button class="btn ghost sm" data-close-drawer>&#10005; Close</button></div><div class="drawer-body"></div>';
    document.body.appendChild(d);
    d.addEventListener('click', e => { if (e.target.closest('[data-close-drawer]')) closeDrawer(); });
  }
  d.querySelector('.title').textContent = title;
  d.querySelector('.drawer-body').innerHTML = bodyHtml;
  d.classList.add('open');
  if (typeof opts.onMount === 'function') opts.onMount(d.querySelector('.drawer-body'));
  return d;
}
export function closeDrawer() {
  const d = document.getElementById('fd-drawer');
  if (d) d.classList.remove('open');
}
export function openModal(title, bodyHtml, opts = {}) {
  let m = document.getElementById('fd-modal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'fd-modal';
    m.className = 'overlay';
    m.innerHTML = '<div class="modal-card"><div class="drawer-head"><span class="title"></span><span style="flex:1"></span><button class="btn ghost sm" data-close-modal>&#10005; Close</button></div><div class="drawer-body"></div></div>';
    document.body.appendChild(m);
    m.addEventListener('click', e => { if (e.target.closest('[data-close-modal]') || e.target === m) closeModal(); });
  }
  m.className = 'overlay' + (opts.className ? ' ' + opts.className : '');
  m.querySelector('.title').textContent = title;
  m.querySelector('.drawer-body').innerHTML = bodyHtml;
  m.classList.add('open');
  if (typeof opts.onMount === 'function') opts.onMount(m.querySelector('.drawer-body'));
  return m;
}
export function closeModal() {
  const m = document.getElementById('fd-modal');
  if (m) m.classList.remove('open');
}
export function confirmAction(message, onYes) {
  openModal('Confirm', `<div class="hint" style="font-size:.86rem;color:var(--text)">${esc(message)}</div>
    <div class="btn-row mt14"><button class="btn red" data-confirm-yes>Yes, do it</button>
    <button class="btn ghost" data-close-modal>Cancel</button></div>`, {
    onMount(root) {
      root.querySelector('[data-confirm-yes]').addEventListener('click', () => { closeModal(); onYes(); });
    }
  });
}

// ── charts (hand-rolled SVG) ───────────────────────────────────────────
export function sparkline(values, opts = {}) {
  const w = 220, h = 38, pad = 3;
  const nums = (values || []).map(Number).filter(Number.isFinite);
  if (nums.length < 2) return `<div class="hint" style="font-size:.7rem">not enough data yet</div>`;
  const min = Math.min(...nums), max = Math.max(...nums);
  const span = max - min || 1;
  const step = (w - pad * 2) / (nums.length - 1);
  const pts = nums.map((n, i) => [pad + i * step, h - pad - ((n - min) / span) * (h - pad * 2)]);
  const line = pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `M${pad},${h - pad} L${line.replace(/ /g, ' L')} L${(pad + (nums.length - 1) * step).toFixed(1)},${h - pad} Z`;
  const color = opts.color || 'var(--teal)';
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="trend">
    <path class="fill" d="${area}" style="fill:${color};opacity:.12"></path>
    <polyline points="${line}" style="stroke:${color}"></polyline>
  </svg>`;
}
export function gauge(percent, label, color) {
  const pct = Math.max(0, Math.min(100, Number(percent) || 0));
  const r = 30, c = 2 * Math.PI * r;
  const off = c - (pct / 100) * c;
  const col = color || (pct >= 90 ? 'var(--red)' : pct >= 70 ? 'var(--amber)' : 'var(--teal)');
  return `<div class="gauge">
    <svg viewBox="0 0 74 74" role="img" aria-label="${esc(label)} ${pct}%">
      <circle cx="37" cy="37" r="${r}" fill="none" stroke="#111a28" stroke-width="7"></circle>
      <circle cx="37" cy="37" r="${r}" fill="none" stroke="${col}" stroke-width="7" stroke-linecap="round"
        stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 37 37)"></circle>
      <text x="37" y="42" text-anchor="middle" fill="#e8eef8" font-size="14" font-weight="700" font-family="Space Grotesk, monospace">${pct}%</text>
    </svg>
    <div><div class="val" style="color:${col}">${esc(label)}</div></div>
  </div>`;
}
export function barRow(label, value, max, color) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return `<div class="mb8">
    <div class="flex-between"><span style="font-size:.76rem">${esc(label)}</span>
    <span class="mono" style="font-size:.74rem;color:var(--text2)">${fmtNum(value)}</span></div>
    <div class="bar mt8" style="height:6px"><span style="width:${pct}%;background:${color || 'var(--grad)'}"></span></div>
  </div>`;
}

// ── misc ───────────────────────────────────────────────────────────────
export function debounce(fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
export function statusPillClass(status) {
  return 'st-' + String(status || 'draft').replace(/_/g, '-');
}
export function thumbFallback(type) {
  const map = {
    invoice: '🧾', checklist: '✅', spreadsheet: '📊', booking: '📅', social: '📱', brand: '🎨',
    journal: '📓', website: '🌐', 'decision-matrix': '⚖️', roi: '📈', tool: '🧰', 'wall-art': '🖼️',
    worksheet: '✏️', planner: '🗓️', 'party-printable': '🎉', 'pyro-batch': '⚗️', 'pyro-lift-fuse': '🎆',
    'pyro-shoot-log': '🧨', playbook: '📘', 'pricing-bible': '💰', 'email-scripts': '✉️',
    'sop-package': '📋', bundle: '📦', leadmagnet: '🧲'
  };
  return map[type] || '🗂️';
}
