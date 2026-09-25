// ═══════════════════════════════════════════════════════════════════════
// FLIGHT DECK — console shell
// Owns state, routing, the command palette, the live run stream, the product
// drawer and every delegated interaction. Views are pure (views.js).
// ═══════════════════════════════════════════════════════════════════════

import {
  esc, icon, toast, openDrawer, closeDrawer, openModal, closeModal, confirmAction,
  debounce, fmtNum, fmtMoney,  timeAgo, clockTime, titleCase, statusPillClass, thumbFallback, reviewPage, reviewQueue,
  barRow, gauge
} from './ui.js';
import { consoleApi, dataApi, dataActions, workerApi, connectStream, renderExport } from './api.js';
import { NAV, CRUMBS, VIEWS, pickPriority } from './views.js';
import { createCoverRebuild } from './rebuild.js';

const state = {
  view: 'home',
  live: 'connecting',
  overview: null,
  products: [], professions: [], trends: [],
  activity: [], analytics: null, smartActions: [],
  setup: null, readiness: null, modelStatus: null, payments: null, branding: null,
  social: [], ads: null, calendarData: null, seasonal: null, passionNiches: [],
  searchQueue: null, opportunity: null, radarHealth: null,
  bi: null,
  newsletter: null, autoStatus: null, runs: [], actions: [],
  calendarMonth: new Date().toISOString().slice(0, 7),
  filters: { status: 'all', type: 'all', q: '', page: 1 },
  reviewPage: 1,
  reviewIndex: 0,
  selected: new Set(),
  selectedTrends: new Set(),
  // string keys "kind:id" for non-product rows: social posts, ad runs, niches
  selectedMisc: new Set(),
  aiRef: null,
  asks: [],
  memories: [],
  workerStatus: {},
  lastSocialContent: null,
  caps: null,
  since: null,
  pendingAgentConfirm: null,
  busy: false
};

// ── error handling ─────────────────────────────────────────────────────
function fail(e) {
  if (e && e.status === 401) {
    toast('warning', 'Session expired', 'Redirecting to sign-in…');
    setTimeout(() => { location.href = '/login'; }, 800);
    return;
  }
  toast('error', 'Request failed', (e && e.message) || 'Unknown error');
  console.error(e);
}

async function safe(fn, label) {
  try { return await fn(); } catch (e) { fail(e); return null; }
}

// ── data loading ───────────────────────────────────────────────────────
async function loadCore() {
  const [overview, products, trends, activity, smart, actions, asks, ws] = await Promise.all([
    safe(() => consoleApi.overview()), safe(() => dataApi.products()), safe(() => dataApi.trends()),
    safe(() => dataApi.activity()), safe(() => dataApi.smartActions()), safe(() => consoleApi.actions()),
    safe(() => workerApi.asks('pending')), safe(() => workerApi.status())
  ]);
  if (overview) state.overview = overview;
  if (products) state.products = products;
  if (trends) state.trends = trends.all || [];
  if (activity) state.activity = activity;
  if (smart) state.smartActions = smart.actions || [];
  if (actions) state.actions = actions.actions || [];
  if (asks) state.asks = asks.asks || [];
  if (ws) state.workerStatus = ws;
}

async function loadViewData(view) {
  switch (view) {
    case 'discovery': {
      const [q, radar, niches] = await Promise.all([
        safe(() => dataApi.searchQueue()),
        safe(() => dataApi.radarHealth()), safe(() => dataApi.passionNiches())
      ]);
      if (q) state.searchQueue = q;
      if (radar) state.radarHealth = radar;
      if (niches) state.passionNiches = niches.niches || [];
      break;
    }
    case 'trends': { const r = await safe(() => dataApi.trends()); if (r) state.trends = r.all || []; break; }
    case 'social': { const r = await safe(() => dataApi.social()); if (r) state.social = r.posts || []; break; }
    case 'ads': { const r = await safe(() => dataApi.ads()); if (r) state.ads = r; break; }
    case 'calendar': {
      const [c, se] = await Promise.all([safe(() => dataApi.calendar(state.calendarMonth)), safe(() => dataApi.seasonal())]);
      if (c) state.calendarData = c;
      if (se) state.seasonal = se;
      break;
    }
    // Product-backed views must refetch. Without this, Review/Catalog/Home
    // render whatever was in memory at boot and miss anything created later
    // (products made via the API, by the engine, or by another tab).
    case 'home':
    case 'catalog':
    case 'review': {
      const [products, activity, bi] = await Promise.all([safe(() => dataApi.products()), safe(() => dataApi.activity()), safe(() => consoleApi.bi())]);
      if (products) state.products = products;
      if (activity) state.activity = activity;
      if (bi) state.bi = bi;
      if (state.view === 'home') computeSince();
      break;
    }
    case 'analytics': {
      const [r, bi] = await Promise.all([safe(() => dataApi.analytics()), safe(() => consoleApi.bi())]);
      if (r) state.analytics = r;
      if (bi) state.bi = bi;
      break;
    }
    case 'automation': {
      const [r, caps] = await Promise.all([safe(() => dataApi.automationStatus()), safe(() => dataApi.caps())]);
      if (r) state.autoStatus = r;
      if (caps) state.caps = caps;
      break;
    }
    case 'marketplace': { const r = await safe(() => dataApi.setup()); if (r) state.setup = r; break; }
    case 'system': {
      const [rd, ms, pay, br, runs, mem, allAsks, ws] = await Promise.all([
        safe(() => dataApi.readiness()), safe(() => dataApi.modelStatus()),
        safe(() => dataApi.payments()), safe(() => dataApi.branding()), safe(() => consoleApi.runs(20)),
        safe(() => workerApi.memory()), safe(() => workerApi.asks()), safe(() => workerApi.status())
      ]);
      if (rd) state.readiness = rd;
      if (ms) state.modelStatus = ms;
      if (pay) state.payments = pay;
      if (br) state.branding = br;
      if (runs) state.runs = runs.runs || [];
      if (mem) state.memories = mem.memories || [];
      if (allAsks) state.asks = allAsks.asks || [];
      if (ws) state.workerStatus = ws;
      break;
    }
    default: break;
  }
}

// ── since-your-last-visit ──────────────────────────────────────────────
// Diffs REAL timestamps against the last session: new drafts (products),
// sales + revenue (bi.series days after the visit), trend activations.
const LAST_SEEN_KEY = 'ng_lastseen';
let sinceTimer = null;
function lastSeenMs() {
  try { return Number(localStorage.getItem(LAST_SEEN_KEY)) || 0; } catch { return 0; }
}
function saveLastSeen() {
  try { localStorage.setItem(LAST_SEEN_KEY, String(Date.now())); } catch { /* private mode */ }
}
function computeSince() {
  const at = lastSeenMs();
  if (!at) { state.since = { first: true }; return; }
  const since = { first: false, at: new Date(at).toISOString(), newDrafts: 0, newSales: 0, newRevenue: 0, newActivations: 0 };
  const when = v => { const t = new Date(String(v || '').replace(' ', 'T') + 'Z').getTime(); return Number.isFinite(t) ? t : 0; };
  for (const p of state.products) {
    if ((p.status === 'draft' || p.status === 'pending-review') && when(p.created_at) > at) since.newDrafts++;
  }
  const afterDay = new Date(at).toISOString().slice(0, 10);
  for (const d of ((state.bi && state.bi.series) || [])) {
    if (String(d.date) > afterDay) {
      since.newSales += Number(d.sales) || 0;
      since.newRevenue += Number(d.revenue) || 0;
    }
  }
  for (const t of (state.trends || [])) if (when(t.activated_at) > at) since.newActivations++;
  state.since = since;
  // Mark the visit "seen" shortly after — a quick reload still shows the diff.
  clearTimeout(sinceTimer);
  sinceTimer = setTimeout(saveLastSeen, 30000);
}
window.addEventListener('beforeunload', saveLastSeen);

// ── rendering ──────────────────────────────────────────────────────────
function railExpanded() {
  try { return localStorage.getItem('ng_rail') === 'expanded'; } catch { return false; }
}
function toggleRail() {
  const next = railExpanded() ? 'collapsed' : 'expanded';
  try { localStorage.setItem('ng_rail', next); } catch { /* private mode */ }
  renderNav();
}
function renderNav() {
  const rail = document.getElementById('rail');
  const c = (state.overview && state.overview.counts) || {};
  const eng = (state.overview && state.overview.engine) || {};
  const blockers = ((state.readiness && state.readiness.issues) || (state.overview && state.overview.readiness && state.overview.readiness.issues) || [])
    .filter(i => i.severity === 'error').length;
  // The badge counts the queue the Review view actually shows; the server's
  // `counts.review` is a narrower status bucket that excludes drafts, so using
  // it made the rail say 0 while the queue held a dozen drafts.
  const queued = state.products.length ? reviewQueue(state.products).length : (c.review || 0);
  const expanded = railExpanded();
  rail.classList.toggle('expanded', expanded);

  let html = `<button class="rail-mark" data-action="rail-toggle" title="${expanded ? 'Collapse' : 'Expand'} menu" aria-label="${expanded ? 'Collapse' : 'Expand'} menu">${expanded ? '‹ NG' : 'NG'}</button><div class="rail-sep"></div>`;
  let lastGroup = null;
  for (const item of NAV) {
    if (lastGroup && item.group !== lastGroup) html += '<div class="rail-sep"></div>';
    lastGroup = item.group;
    let badge = '';
    if (item.badge === 'review' && queued) badge = `<span class="badge">${queued > 99 ? '99+' : queued}</span>`;
    if (item.badge === 'busy' && (eng.cycleBusy || eng.discoveryBusy)) badge = '<span class="badge" style="background:var(--violet);color:#fff">●</span>';
    if (item.badge === 'blockers' && blockers) badge = `<span class="badge" style="background:var(--red);color:#fff">${blockers}</span>`;
    html += `<button class="rail-link ${state.view === item.view ? 'active' : ''}" data-action="go" data-view="${item.view}"
      title="${esc(item.label)}" aria-label="${esc(item.label)}">${icon(item.icon)}<span class="rail-text">${esc(item.label)}</span>${badge}</button>`;
  }
  rail.innerHTML = html;
}

function renderTopbar() {
  const o = state.overview || {};
  const eng = o.engine || {};
  const etsy = o.etsy || {};
  const ready = o.readiness || {};
  const blockers = (ready.issues || []).filter(i => i.severity === 'error').length;
  const warns = (ready.issues || []).filter(i => i.severity === 'warning').length;

  document.getElementById('crumb').textContent = CRUMBS[state.view] || state.view;

  // Theme toggle (light-first; preference persisted in localStorage).
  const themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    themeBtn.innerHTML = `${icon(dark ? 'sun' : 'moon')}<span class="rail-text" style="display:inline">${dark ? 'Light' : 'Dark'}</span>`;
  }

  const chips = [
    `<button class="chip ${eng.running ? 'live' : ''}" data-action="go" data-view="automation" title="Engine status">
      <span class="dot"></span>${eng.running ? 'Engine Live' : (eng.cronScheduled && eng.autoGenerate === false ? 'Engine Halted' : 'Engine Idle')}</button>`,
    eng.cycleBusy || eng.discoveryBusy
      ? `<button class="chip busy" data-action="go" data-view="automation"><span class="dot"></span>${eng.cycleBusy ? 'Cycle running' : 'Sweeping'}</button>`
      : '',
    `<button class="chip ${etsy.remaining > 0 ? '' : 'warn'}" data-action="go" data-view="marketplace" title="Etsy daily quota">
      Etsy ${esc(etsy.published || 0)}/${esc(etsy.cap || 20)}</button>`,
    blockers ? `<button class="chip err" data-action="go" data-view="system"><span class="dot"></span>${blockers} blocker${blockers > 1 ? 's' : ''}</button>`
      : warns ? `<button class="chip warn" data-action="go" data-view="system"><span class="dot"></span>${warns} warning${warns > 1 ? 's' : ''}</button>`
      : `<button class="chip" data-action="go" data-view="system">All clear</button>`,
    o.model ? `<button class="chip ${o.model.enabled ? 'live' : 'warn'}" data-action="go" data-view="system" title="${esc(o.model.diagnosis || '')}">
      AI ${o.model.enabled ? 'on' : 'off'}</button>` : '',
    `<button class="chip ${state.live === 'live' ? 'live' : ''}" data-action="runs-open" title="Live run stream">
      <span class="dot"></span>${esc(state.live === 'live' ? 'streaming' : state.live)}</button>`,
    (state.asks || []).filter(x => x.status === 'pending').length
      ? `<button class="chip warn" data-action="go" data-view="home" title="Your worker/surrogate has questions">🔔 Boss (${(state.asks || []).filter(x => x.status === 'pending').length})</button>`
      : '',
    `<button class="chip" data-action="palette" title="Command palette (Ctrl/Cmd+K)">${icon('command')} ⌘K</button>`
  ].join('');
  document.getElementById('status').innerHTML = chips;
}

function render() {
  clampReviewCursor();
  renderNav();
  renderTopbar();
  const content = document.getElementById('content');
  content.innerHTML = (VIEWS[state.view] || VIEWS.home)(state);
  afterRender();
}

function afterRender() {
  // The J/K cursor highlights triage rows on BOTH work surfaces: the Review
  // table and the Home work-now card show the same queue in the same order.
  if (state.view === 'review' || state.view === 'home') {
    const rows = document.querySelectorAll('.rrow[data-review-id]');
    rows.forEach((r, i) => r.classList.toggle('hl', i === state.reviewIndex));
  }
}

async function go(view) {
  if (!VIEWS[view]) view = 'home';
  if (state.view === 'home' && view !== 'home') saveLastSeen();
  state.view = view;
  state.reviewIndex = 0;
  render();
  await loadViewData(view);
  render();
}

// The rows the keyboard cursor walks: the Review table's page, or the Home
// work-now card's top slice (same queue, same order).
function triageItems() {
  if (state.view === 'home') return reviewPage(state.products, 1).slice.slice(0, 6);
  return reviewPage(state.products, state.reviewPage).slice;
}

// Clamp the cursor and the page against the queue that actually exists, so
// approving the last row on page 3 lands on page 2 instead of a blank table.
function clampReviewCursor() {
  const { page } = reviewPage(state.products, state.reviewPage);
  state.reviewPage = page;
  state.reviewIndex = Math.max(0, Math.min(state.reviewIndex, triageItems().length - 1));
}

// ── actions ────────────────────────────────────────────────────────────
async function runAction(name, input, opts = {}) {
  if (state.busy) { toast('warning', 'Busy', 'Another action is already running.'); return; }
  state.busy = true;
  const label = (state.actions.find(a => a.name === name) || {}).label || name;
  toast('info', label, 'Running…');
  try {
    const res = await consoleApi.run(name, input);
    if (res.ok) toast('success', label + ' complete', summarize(res.result));
    else toast('error', label + ' failed', res.error || 'Unknown error');
  } catch (e) {
    fail(e);
  } finally {
    state.busy = false;
    await loadCore();
    await loadViewData(state.view);
    render();
  }
}

function summarize(result) {
  if (!result) return '';
  const parts = [];
  for (const [k, v] of Object.entries(result)) {
    if (typeof v === 'number' || typeof v === 'string') parts.push(`${k}: ${v}`);
    else if (Array.isArray(v)) parts.push(`${k}: ${v.length}`);
  }
  return parts.slice(0, 4).join(' · ');
}

// ── visual HTML editor ─────────────────────────────────────────────────
// Parity with the old inline editor, hardened: the document is sanitised
// before it ever reaches the live DOM (no <script>, no on* handlers, no
// javascript: URLs), and it is sanitised again on save so nothing unsafe can
// be persisted and re-rendered later.
const editor = { id: null, name: '', type: '', colors: {}, font: '' };

const EDITOR_FONTS = [
  ["'Space Grotesk','Inter',system-ui,sans-serif", 'Space Grotesk'],
  ["'Inter',system-ui,sans-serif", 'Inter'],
  ['Georgia,serif', 'Georgia'],
  ["'Courier New',monospace", 'Courier']
];

function sanitizeForEditor(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = String(html || '');
  tpl.content.querySelectorAll('script, iframe, object, embed, link').forEach(n => n.remove());
  tpl.content.querySelectorAll('*').forEach(n => {
    for (const a of [...n.attributes]) {
      const name = a.name.toLowerCase();
      const val = String(a.value || '').replace(/[\s\u0000-\u0020]+/g, '');
      if (name.startsWith('on') || /^javascript:/i.test(val)) n.removeAttribute(a.name);
    }
  });
  return tpl.content;
}

function fallbackHtml(p) {
  return `<div style="font-family:'Space Grotesk','Inter',system-ui,sans-serif;padding:60px;background:#f8f7f4;color:#14110f">
    <h1 style="font-size:40px">${esc(p.name || 'Product')}</h1>
    <p style="font-size:18px;color:#57534e">${esc(p.prof_name || '')} · ${esc(p.type)} · ${esc(p.price || '')}</p>
    <div style="margin-top:24px;color:#78716c">Premium digital template — edit to customize.</div></div>`;
}

async function openEditor(id) {
  const p = await safe(() => dataApi.product(id));
  if (!p) return;
  const html = (p.html_content && p.html_content.length > 40) ? p.html_content : fallbackHtml(p);
  editor.id = p.id;
  editor.name = p.name || p.type;
  editor.type = p.type;
  editor.colors = { primary: '#0f172a', accent: '#2dd4bf' };
  editor.font = EDITOR_FONTS[0][0];

  const fontOpts = EDITOR_FONTS.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
  openModal('Editing: ' + esc(editor.name), `
    <div class="btn-row" style="align-items:center">
      <label class="hint">Primary <input type="color" id="ed-primary" value="#0f172a" data-action="editor-color" data-key="primary"></label>
      <label class="hint">Accent <input type="color" id="ed-accent" value="#2dd4bf" data-action="editor-color" data-key="accent"></label>
      <select id="ed-font" data-action="editor-font" aria-label="Font">${fontOpts}</select>
      <span style="flex:1"></span>
      <button class="btn sm" data-action="editor-export">${icon('download')} Export PDF</button>
      <button class="btn green sm" data-action="editor-save">${icon('check')} Save</button>
    </div>
    <div class="edbody"><div class="pv" id="ed-preview" contenteditable="true" spellcheck="false"></div></div>
    <div class="hint mt8">Click into the document to edit it directly. Colour and font changes rewrite matching values in the markup.</div>`, {
    className: 'editor',
    onMount(root) {
      root.querySelector('#ed-preview').replaceChildren(sanitizeForEditor(html));
    }
  });
}

function editorRecolor(key, value) {
  const pre = document.getElementById('ed-preview');
  if (!pre) return;
  const prev = editor.colors[key];
  const next = String(value || '').trim();
  if (!/^#[0-9a-f]{6}$/i.test(next)) return;
  if (prev && prev.toLowerCase() !== next.toLowerCase()) {
    const rx = new RegExp(prev.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    pre.innerHTML = pre.innerHTML.replace(rx, next);
  }
  editor.colors[key] = next;
}

// The first element that is real content rather than document head metadata.
function editorContentRoot(pre) {
  const skip = new Set(['META', 'TITLE', 'LINK', 'STYLE', 'BASE', 'SCRIPT']);
  for (const el of pre.children) if (!skip.has(el.tagName)) return el;
  return pre.querySelector('div,main,article,section,body');
}

function editorFont(value) {
  const pre = document.getElementById('ed-preview');
  if (!pre || !EDITOR_FONTS.some(([v]) => v === value)) return;
  const before = pre.innerHTML;
  pre.innerHTML = before.replace(/font-family:[^;"']+/gi, 'font-family:' + value);
  // If the document declared no font-family at all the replace is a no-op. Set
  // it on the content root instead, so the choice is part of what gets saved
  // rather than a live-only style on the preview container.
  if (pre.innerHTML === before) {
    const root = editorContentRoot(pre);
    if (root) root.style.fontFamily = value;
    else pre.style.fontFamily = value;
  }
  editor.font = value;
}

async function editorSave() {
  const pre = document.getElementById('ed-preview');
  if (!editor.id || !pre) return;
  const clean = document.createElement('div');
  clean.appendChild(sanitizeForEditor(pre.innerHTML));
  const r = await safe(() => dataActions.saveHtml(editor.id, clean.innerHTML));
  if (r) toast('success', 'Saved', 'Template updated.');
  closeModal();
}

async function editorExport() {
  const pre = document.getElementById('ed-preview');
  if (!editor.id || !pre) return;
  const name = (editor.name || editor.type || 'product').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + editor.type;
  toast('info', 'Exporting…', 'Generating PDF');
  const blob = await safe(() => renderExport(pre.innerHTML, editor.type, name));
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name + '.pdf';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast('success', 'Exported', 'PDF ready.');
}

// ── product drawer ─────────────────────────────────────────────────────
async function openProduct(id) {
  const p = state.products.find(x => x.id === Number(id));
  const status = p ? p.status : 'draft';
  const body = `
    <div class="btn-row">
      <button class="btn green sm" data-action="approve" data-id="${id}">${icon('check')} Approve</button>
      <button class="btn primary sm" data-action="publish" data-id="${id}">${icon('rocket')} Publish</button>
      <button class="btn sm" data-action="push-etsy" data-id="${id}">${icon('marketplace')} Push to Etsy</button>
      <button class="btn amber sm" data-action="better-idea" data-id="${id}">${icon('brain')} Better Idea</button>
      <button class="btn amber sm" data-action="ai-ref" data-kind="product" data-id="${id}">💡 Ask AI</button>
      <button class="btn sm" data-action="edit-product" data-id="${id}">${icon('pencil')} Edit</button>
      <button class="btn sm" data-action="seo-load" data-id="${id}">${icon('search')} SEO</button>
      <button class="btn sm" data-action="optimize-product" data-id="${id}">${icon('sparkles')} Optimize listing</button>
      <button class="btn amber sm" data-action="rollback-optimization" data-id="${id}">${icon('history')} Rollback copy</button>
      <button class="btn sm" data-action="cover-generate" data-id="${id}">${icon('sparkles')} New cover</button>
      <a class="btn sm" href="/api/export/product/${id}" download>${icon('download')} File</a>
      <button class="btn red sm" data-action="confirm" data-confirm="delete:${id}" data-message="Delete this product permanently?">${icon('trash')} Delete</button>
    </div>
    <div class="mb8">${p ? `<span class="pill ${statusPillClass(status)}"><span class="dot"></span>${esc(status)}</span>` : ''}</div>
    <div class="grid g2 mb14">
      <div class="panel"><div class="panel-head">Details</div><div class="panel-body">
        <div class="flex-between mb8"><span class="hint">Name</span><b style="text-align:right">${esc(p ? p.name : '')}</b></div>
        <div class="flex-between mb8"><span class="hint">Niche</span><b>${esc(p ? p.prof_name || '—' : '')}</b></div>
        <div class="flex-between mb8"><span class="hint">Type</span><b>${esc(p ? titleCase(p.type) : '')}</b></div>
        <div class="flex-between mb8"><span class="hint">Price</span><b>${esc(p ? p.price || '' : '')}</b></div>
        <div class="flex-between mb8"><span class="hint">Marketplace</span><b>${esc((p && p.marketplace) || '—')}</b></div>
        <div class="flex-between mb8"><span class="hint">Origin</span><b>${esc((p && p.origin) || 'engine')}${p && p.origin === 'manual' ? ' · manual publish' : ''}</b></div>
        <div class="flex-between"><span class="hint">Created</span><b>${esc(p ? timeAgo(p.created_at) : '')}</b></div>
      </div></div>
      <div class="panel"><div class="panel-head">Preview</div><div class="panel-body tight" style="padding:0">
        <iframe src="/api/products/${id}/preview" title="Product preview" style="width:100%;height:340px;border:none;border-radius:var(--radius-sm);background:#fff"></iframe>
      </div></div>
    </div>
    <div id="drawer-seo"></div>`;
  openDrawer(p ? p.name : 'Product', body);
}

async function loadSeo(id) {
  const host = document.getElementById('drawer-seo');
  if (!host) return;
  host.innerHTML = '<div class="hint">Loading SEO…</div>';
  const seo = await safe(() => dataApi.seo(id));
  if (!seo) { host.innerHTML = '<div class="hint">SEO unavailable.</div>'; return; }
  const tags = seo.tags || [];
  host.innerHTML = `<div class="panel"><div class="panel-head">${icon('search')} SEO</div><div class="panel-body">
    <div class="hint">Title</div><div class="mb8">${esc(seo.title || '—')}</div>
    <div class="hint">Description</div><div class="mb8" style="font-size:.8rem">${esc(seo.description || '—')}</div>
    <div class="flex" style="flex-wrap:wrap;gap:5px">${tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
  </div></div>`;
}

// ── run stream ─────────────────────────────────────────────────────────
function runItem(r) {
  const steps = (r.steps || []).slice(-6).map(st => `<div class="run-step ${esc(st.status)}">
      <span class="dt">•</span><span>${esc(st.step)}</span>
      ${st.detail ? `<span class="hint">${esc(String(st.detail).slice(0, 60))}</span>` : ''}
      <span class="tt">${esc(clockTime(st.created_at))}</span></div>`).join('');
  return `<div class="run">
    <div class="run-head">
      <span class="st ${esc(r.status)}">${esc(r.status)}</span>
      <span class="nm">${esc(r.label || r.action)}</span>
      <span class="hint">${esc(timeAgo(r.started_at))}</span>
    </div>
    ${r.error ? `<div class="run-steps"><div class="run-step error"><span class="dt">✕</span><span>${esc(r.error)}</span></div></div>` : ''}
    ${steps ? `<div class="run-steps">${steps}</div>` : ''}
  </div>`;
}

function openRuns() {
  openDrawer('Run Stream', `<div id="runs-host">${(state.runs || []).map(runItem).join('') || '<div class="empty">No runs yet.</div>'}</div>`);
  refreshRuns();
}
function updateRunsHost() {
  const host = document.getElementById('runs-host');
  if (host) host.innerHTML = (state.runs || []).map(runItem).join('') || '<div class="empty">No runs yet.</div>';
}
async function refreshRuns() {
  const r = await safe(() => consoleApi.runs(20));
  if (r) { state.runs = r.runs || []; updateRunsHost(); }
}

// ── theme (light-first, persisted) ─────────────────────────────────────
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light');
  try { localStorage.setItem('ng_theme', t === 'dark' ? 'dark' : 'light'); } catch { /* private mode */ }
  renderTopbar();
}
function toggleTheme() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  applyTheme(dark ? 'light' : 'dark');
  toast('info', `Theme → ${dark ? 'light' : 'dark'}`, 'Preference saved in this browser.');
}

// ── command bar / AI worker chat ──────────────────────────────────────
// One always-visible prompt bar in front of the in-app AI WORKER. Quick
// intents (nav, help, questions) resolve locally; everything actionable goes
// to POST /api/console/agent, which executes real tasks through the same
// action spine as the console and reports each tool call here as a step.
const CMD_SUGGESTIONS = [
  'what should I do now?',
  'make a dog bakery price list',
  "what's trending?",
  'optimize my weak listings',
  'show sales',
  'sync sales',
  'publish my approved bundles',
  'Why did sales dip this week?'
];
let cmdLog = [];

function cmdPush(role, text) {
  cmdLog.push({ role, text, at: new Date() });
  if (cmdLog.length > 60) cmdLog.shift();
  try { localStorage.setItem('ng_cmdlog', JSON.stringify(cmdLog.slice(-30))); } catch { /* private mode */ }
  drawCmdLog();
}

function drawCmdLog() {
  const log = document.getElementById('cmd-log');
  if (!log) return;
  log.innerHTML = cmdLog.map(m => m.role === 'step'
    ? `<div class="cmd-msg step"><span class="who">worker</span><div class="bubble">${esc(m.text)}</div></div>`
    : `<div class="cmd-msg ${m.role === 'you' ? 'you' : 'ng'}">
      <span class="who">${m.role === 'you' ? 'You' : 'NicheGate'}</span>
      <div class="bubble">${esc(m.text)}</div>
    </div>`).join('') || '<div class="cmd-chips" style="padding:6px">' +
      CMD_SUGGESTIONS.map(s => `<button class="cmd-chip" data-cmd="${esc(s)}">${esc(s)}</button>`).join('') + '</div>';
  const chips = log.querySelectorAll('.cmd-chip');
  chips.forEach(c => c.addEventListener('click', () => { const input = document.getElementById('cmd-input'); if (input) { input.value = c.dataset.cmd; runCommand(); } }));
  log.scrollTop = log.scrollHeight;
}

function ensureCmdBar() {
  if (document.getElementById('cmdbar')) return;
  const bar = document.createElement('div');
  bar.id = 'cmdbar';
  bar.innerHTML = `
    <div class="cmd-log" id="cmd-log"></div>
    <div class="cmd-ctx" id="cmd-ctx"></div>
    <div class="cmdbar-input">
      <span class="ic">${icon('sparkles')}</span>
      <input id="cmd-input" placeholder="Ask the AI worker: make a dog bakery price list · clear my review queue · what should I do?" aria-label="Command NicheGate" autocomplete="off">
      <button class="btn primary sm" data-action="cmd-run">Send</button>
      <button class="btn ghost sm" data-action="cmd-close" title="Close chat" aria-label="Close chat">✕</button>
    </div>
    <div class="cmd-chips" id="cmd-chips">
      ${CMD_SUGGESTIONS.map(s => `<button class="cmd-chip" data-cmd="${esc(s)}">${esc(s)}</button>`).join('')}
    </div>`;
  document.body.appendChild(bar);
  bar.querySelector('#cmd-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); runCommand(); }
  });
  bar.querySelectorAll('#cmd-chips .cmd-chip').forEach(c => c.addEventListener('click', () => {
    const input = document.getElementById('cmd-input');
    if (input) { input.value = c.dataset.cmd; runCommand(); }
  }));
  try { cmdLog = JSON.parse(localStorage.getItem('ng_cmdlog') || '[]'); } catch { cmdLog = []; }
  drawCmdLog();
  drawCmdCtx();
}

async function runCommand() {
  const input = document.getElementById('cmd-input');
  const q = ((input || {}).value || '').trim();
  if (!q) return;
  if (input) input.value = '';
  const log = document.getElementById('cmd-log');
  if (log) log.classList.add('open');
  cmdPush('you', q);

  // A pending destructive worker call is confirmed by replying "confirm".
  if (state.pendingAgentConfirm) {
    if (/^(confirm|yes|do it|go ahead|yep|y|proceed)[.!]?$/i.test(q)) {
      const call = state.pendingAgentConfirm;
      state.pendingAgentConfirm = null;
      cmdPush('step', `confirmed · executing ${call.tool}`);
      const res = await safe(() => consoleApi.agent('', { confirmCall: call }));
      for (const st of ((res && res.steps) || [])) cmdPush('step', stepLine(st));
      cmdPush('ng', (res && res.answer) || 'The worker did not respond.');
      await loadCore(); await loadViewData(state.view); render();
    } else {
      state.pendingAgentConfirm = null;
      cmdPush('ng', 'Cancelled the pending operation.');
    }
    return;
  }

  const reply = await routeCommand(q);
  for (const st of (reply.steps || [])) cmdPush('step', stepLine(st));
  cmdPush('ng', reply.text);
  if (reply.needsConfirm) state.pendingAgentConfirm = reply.needsConfirm;
  if (reply.goTo) await go(reply.goTo);
  if (reply.ran) { await loadCore(); await loadViewData(state.view); render(); }
}

// One transcript line per executed worker tool call.
function stepLine(st) {
  const label = (state.actions.find(a => a.name === ((st.args || {}).name)) || {}).label || st.tool;
  const r = st.result || {};
  const detail = r.error ? `✕ ${String(r.error).slice(0, 90)}` : summarize(r);
  return `${st.ok === false ? '✕' : '✓'} ${label}${detail ? ' — ' + detail : ''}`;
}

// Intent router — order matters: most specific first. Quick intents answer
// locally (nav, help, questions); EVERYTHING actionable goes to the AI worker
// (POST /api/console/agent), which executes real tasks through the same
// action registry as the console and reports each tool call back as a step.
async function routeCommand(q) {
  const t = q.toLowerCase();
  const has = (...ws) => ws.some(w => t.includes(w));

  // what should I do? → the same priority brain Home renders
  if (has('what should i do', 'what now', 'priorit', 'next step')) {
    const p = pickPriority(state)[0];
    return { text: p.kind === 'growth'
      ? 'Nothing urgent — keep the flywheel moving: publish bundles, run a sweep, or sync sales.'
      : `Highest leverage right now: ${p.label} (${fmtNum(p.count)} waiting).`, goTo: p.view };
  }

  // what needs review? → the queue count + where to go
  if (has('needs review', 'review queue', 'awaiting review')) {
    const n = reviewQueue(state.products).length;
    return { text: `${fmtNum(n)} product${n === 1 ? '' : 's'} awaiting review. J/K move · A approve · R reject.`, goTo: 'review' };
  }

  // help
  if (has('help', 'what can you do')) {
    return { text: 'I am the NicheGate AI worker — I execute, not just chat:\n• make <thing> — draft a product\n• sweep / full cycle / sync sales — run the engine\n• approve all · optimize my weak listings · publish bundles\n• what should I do? — the current priority\n• show sales / what\'s trending? — real numbers\n• anything else — I use tools to act on the answer.' };
  }

  // navigation
  if (has('open ', 'show me', 'go to', 'take me')) {
    const NAV_INTENTS = [
      [['review', 'pending', 'queue'], 'review'], [['catalog', 'products'], 'catalog'],
      [['discover', 'niche'], 'discovery'], [['trend'], 'trends'], [['analytic'], 'analytics'],
      [['automation', 'engine'], 'automation'], [['marketplace', 'etsy', 'gumroad'], 'marketplace'],
      [['social'], 'social'], [['ad spend', 'ads', 'budget'], 'ads'], [['calendar'], 'calendar'],
      [['system', 'readiness'], 'system'], [['home', 'briefing'], 'home']
    ];
    for (const [words, view] of NAV_INTENTS) {
      if (words.some(w => t.includes(w))) return { text: `Opening ${CRUMBS[view] || view}.`, goTo: view };
    }
  }

  // make … / sweeps / automation / approvals → the AI worker below executes
  // them through the same action registry (it works with the AI layer off).

  // trends / discovery questions
  if (has('trend', 'what\'s hot', 'whats hot', 'trending')) {
    const rows = (state.trends || []).slice(0, 5);
    if (!rows.length) return { text: 'No trends cached yet — run a discovery sweep first and I will surface what is rising.', goTo: 'trends' };
    return { text: 'Top trends right now:\n' + rows.map(x => `• ${x.name} — ${x.phase || 'rising'}${x.velocity_pct != null ? ` (+${x.velocity_pct}% WoW)` : ''}`).join('\n'), goTo: 'trends' };
  }

  // sales / analytics questions → real BI deltas (state.bi, not overview.bi)
  if (has('sale', 'revenue', 'money', 'analytics')) {
    const d = (state.bi && state.bi.deltas) || {};
    const rev = d.revenue || {}; const sales = d.sales || {};
    const o = state.overview || {};
    const pct = v => (typeof v === 'number' ? `${v >= 0 ? '+' : ''}${v}%` : 'n/a');
    return {
      text: `Revenue 7d: $${(rev.value || 0).toFixed(2)} (${pct(rev.deltaPct)} vs prior week)\nSales 7d: ${sales.value || 0} (${pct(sales.deltaPct)})\nLifetime real revenue: ${fmtMoney((o.revenue || {}).realRevenue || 0, true)} · catalog: ${(state.products || []).length} products.`,
      goTo: 'analytics'
    };
  }

  // everything else → the AI worker. It executes real tasks (run_action,
  // generate, publish, optimize, trend ops) via the server-side tool loop and
  // still works with the AI layer off through its deterministic planner.
  // 💡 context handoff: whatever the operator pointed at or selected rides
  // along, so "fix this one" needs no further identification.
  const ref = state.aiRef;
  const res = await safe(() => consoleApi.agent(q, {
    history: cmdLog.filter(m => m.role === 'you' || m.role === 'ng').slice(-6)
      .map(m => ({ role: m.role, text: m.text })),
    productRef: ref && ref.id ? { id: ref.id, kind: ref.kind, label: ref.name } : null,
    selection: [...state.selected]
  }));
  state.aiRef = null;
  drawCmdCtx();
  if (!res) return { text: 'The AI worker is unreachable. Try "help" for the commands that always work.' };
  const steps = res.steps || [];
  return {
    text: res.answer || 'Done.',
    steps,
    needsConfirm: res.needsConfirm || null,
    goTo: res.nav || (steps.some(s => s.tool === 'generate' || s.tool === 'generate_for_trend') ? 'review' : null),
    ran: steps.length > 0
  };
}

// ── command palette ────────────────────────────────────────────────────
function paletteItems() {
  const items = [];
  items.push({ kind: 'command', key: 'Make this…', hint: 'describe anything, get product drafts', run: () => openMakeThis({}) });
  items.push({ kind: 'command', key: 'Optimize all weak listings', hint: 'bulk listing optimizer', run: () => optimizeAllWeak() });
  for (const n of NAV) items.push({ kind: 'view', key: 'Go to ' + n.label, run: () => go(n.view) });
  // Actions come from the server registry — never hardcode them here, or the
  // palette shows duplicates of whatever the registry already exposes.
  for (const a of state.actions) items.push({ kind: 'action', key: a.label, hint: a.description, input: a.input, action: a.name });
  return items;
}

function openPalette() {
  let host = document.getElementById('fd-palette');
  if (!host) {
    host = document.createElement('div');
    host.id = 'fd-palette';
    host.className = 'palette';
    host.innerHTML = `<div class="palette-card">
      <div class="palette-input">${icon('command')}<input id="palette-q" placeholder="Type a command… (approve all, sweep, generate for niche)" aria-label="Command">
      <kbd>Esc</kbd></div>
      <div class="palette-list" id="palette-list"></div>
      <div class="palette-hint">Deterministic actions — no AI required. <kbd>↑</kbd><kbd>↓</kbd> move · <kbd>Enter</kbd> run</div>
    </div>`;
    document.body.appendChild(host);
    host.addEventListener('click', e => { if (e.target === host) closePalette(); });
    host.querySelector('#palette-q').addEventListener('input', drawPalette);
    host.querySelector('#palette-q').addEventListener('keydown', paletteKeys);
  }
  host.classList.add('open');
  const input = host.querySelector('#palette-q');
  input.value = '';
  drawPalette();
  setTimeout(() => input.focus(), 20);
}
function closePalette() { const h = document.getElementById('fd-palette'); if (h) h.classList.remove('open'); }

let paletteSel = 0;
function drawPalette() {
  const q = (document.getElementById('palette-q').value || '').toLowerCase();
  const items = paletteItems().filter(i => !q || i.key.toLowerCase().includes(q) || (i.hint || '').toLowerCase().includes(q));
  paletteSel = Math.min(paletteSel, Math.max(0, items.length - 1));
  const host = document.getElementById('palette-list');
  host.innerHTML = items.length ? items.map((i, idx) => `<div class="palette-item ${idx === paletteSel ? 'sel' : ''}" data-palette="${idx}">
      <span class="ic">${i.kind === 'view' ? icon('chevronRight') : icon('bolt')}</span>
      <span>${esc(i.key)}</span>${i.hint ? `<span class="hint" style="font-size:.68rem">${esc(String(i.hint).slice(0, 48))}</span>` : ''}
      ${i.kind === 'action' ? '<span class="k">action</span>' : i.kind === 'command' ? '<span class="k">command</span>' : '<span class="k">view</span>'}
    </div>`).join('') : '<div class="empty">No matching command.</div>';
  host.querySelectorAll('[data-palette]').forEach(el => {
    el.addEventListener('click', () => { paletteSel = Number(el.dataset.palette); paletteRun(items); });
  });
  host._items = items;
}
function paletteKeys(e) {
  const items = document.getElementById('palette-list')._items || [];
  if (e.key === 'ArrowDown') { e.preventDefault(); paletteSel = Math.min(paletteSel + 1, items.length - 1); drawPalette(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); paletteSel = Math.max(paletteSel - 1, 0); drawPalette(); }
  else if (e.key === 'Enter') { e.preventDefault(); paletteRun(items); }
  else if (e.key === 'Escape') { closePalette(); }
}
function paletteRun(items) {
  const item = items[paletteSel];
  if (!item) return;
  closePalette();
  if (item.run) { item.run(); return; }
  if (item.action === 'rebuild-covers') { rebuildCovers(); return; }
  if (item.action === 'generate-for-niche') {
    const niche = prompt('Which niche?'); if (!niche) return;
    runAction('generate-for-niche', { niche, count: 3 });
    return;
  }
  runAction(item.action, {});
}

// ── delegated events ───────────────────────────────────────────────────
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  const id = el.dataset.id;
  try {
    switch (a) {
      case 'go': await go(el.dataset.view); break;
      case 'theme-toggle': toggleTheme(); break;
      case 'cmd-run': await runCommand(); break;
      case 'cmd-close': {
        const log2 = document.getElementById('cmd-log');
        if (log2) log2.classList.remove('open');
        break;
      }
      case 'rail-toggle': toggleRail(); break;
      case 'palette': openPalette(); break;
      case 'runs-open': openRuns(); break;
      case 'run': {
        // Actions with required input ask for it here (same as ⌘K does).
        const runName = el.dataset.name;
        if (runName === 'generate-for-niche') {
          const niche = prompt('Which niche?');
          if (!niche) break;
          await runAction(runName, { niche, count: 3 });
        } else {
          await runAction(runName);
        }
        break;
      }
      case 'rebuild-covers': rebuildCovers(); break;
      case 'edit-product': await openEditor(id); break;
      case 'editor-save': await editorSave(); break;
      case 'editor-export': await editorExport(); break;
      case 'confirm': {
        const spec = String(el.dataset.confirm || '');
        const msg = el.dataset.message || 'Are you sure?';
        confirmAction(msg, () => {
          const [kind, val] = spec.split(':');
          if (kind === 'run') runAction(val);
          else if (kind === 'delete') deleteProduct(val);
        });
        break;
      }
      case 'funnel': {
        const map = { discover: 'all', generate: 'draft', review: 'needs-review', approve: 'approved', publish: 'listed' };
        state.filters.status = map[el.dataset.stage] || 'all';
        await go('catalog');
        break;
      }
      case 'smart': await dispatchSmart(el.dataset.name); break;
      case 'kpi-go': {
        state.filters.status = el.dataset.status || 'all';
        await go(el.dataset.view);
        break;
      }
      case 'open': await openProduct(id); break;
      case 'toggle-select': {
        const n = Number(id);
        state.selected.has(n) ? state.selected.delete(n) : state.selected.add(n);
        render(); break;
      }
      case 'select-all': {
        const ids = String(el.dataset.ids || '').split(',').filter(Boolean).map(Number);
        const every = ids.length && ids.every(n => state.selected.has(n));
        ids.forEach(n => every ? state.selected.delete(n) : state.selected.add(n));
        render(); break;
      }
      case 'clear-selection': state.selected.clear(); render(); break;
      case 'batch': await batchStatus(el.dataset.status); break;
      case 'batch-covers': await batchCovers(); break;
      case 'ai-ref': setAiRef(el.dataset.kind, Number(id)); break;
      case 'ai-clear': setAiRef(null); break;
      case 'ai-ask': aiAskSelection(el.dataset.kind); break;
      case 'trend-toggle-select': {
        const tn = Number(id);
        state.selectedTrends.has(tn) ? state.selectedTrends.delete(tn) : state.selectedTrends.add(tn);
        render(); break;
      }
      case 'trend-select-all': {
        const ids = String(el.dataset.ids || '').split(',').filter(Boolean).map(Number);
        const every = ids.length && ids.every(n => state.selectedTrends.has(n));
        ids.forEach(n => every ? state.selectedTrends.delete(n) : state.selectedTrends.add(n));
        render(); break;
      }
      case 'trend-clear': state.selectedTrends.clear(); render(); break;
      case 'trend-batch': await trendBatch(el.dataset.do); break;
      case 'misc-toggle-select': {
        const k = decodeURIComponent(el.dataset.key || '');
        if (k) {
          state.selectedMisc.has(k) ? state.selectedMisc.delete(k) : state.selectedMisc.add(k);
          render();
        }
        break;
      }
      case 'misc-select-all': {
        const keys = String(el.dataset.keys || '').split(',').filter(Boolean).map(decodeURIComponent);
        const every = keys.length && keys.every(k => state.selectedMisc.has(k));
        keys.forEach(k => every ? state.selectedMisc.delete(k) : state.selectedMisc.add(k));
        render(); break;
      }
      case 'misc-clear': {
        const kind = el.dataset.kind;
        [...state.selectedMisc].forEach(k => { if (!kind || k.startsWith(kind + ':')) state.selectedMisc.delete(k); });
        render(); break;
      }
      case 'misc-batch': await miscBatch(el.dataset.kind, el.dataset.do); break;
      case 'ask-answer': await askAnswer(el.dataset.id, el.dataset.opt != null ? Number(el.dataset.opt) : null, el.dataset.free === '1'); break;
      case 'ask-dismiss': await askDismiss(el.dataset.id); break;
      case 'memory-add': await memoryAdd(); break;
      case 'memory-pin': await memoryPin(el.dataset.id, el.dataset.pinned === '1'); break;
      case 'memory-del': await memoryDel(el.dataset.id); break;
      case 'webhook-save': await webhookSave(); break;
      case 'notify-test': await notifyTest(); break;
      case 'steward-run': await stewardRun(); break;
      case 'steward-toggle': await stewardToggle(); break;
      case 'cat-page': state.filters.page = Number(el.dataset.page); render(); break;
      case 'review-page': state.reviewPage = Number(el.dataset.page); render(); break;
      case 'approve': await setStatus(id, 'approved'); break;
      case 'reject': await setStatus(id, 'rejected'); break;
      case 'publish': await publish(id); break;
      case 'push-etsy': await pushEtsy(id); break;
      case 'better-idea': await betterIdea(id); break;
      case 'seo-load': await loadSeo(id); break;
      case 'cover-generate': await coverGenerate(id); break;
      case 'trend-activate': await trendOp('activate', id); break;
      case 'trend-dismiss': await trendOp('dismiss', id); break;
      case 'trend-archive': await trendOp('archive', id); break;
      case 'trend-generate': openGenerateTrend(id); break;
      case 'trend-generate-run': await trendGenerateRun(id); break;
      case 'make-this': openMakeThis({}); break;
      case 'make-this-run': await makeThisRun(); break;
      case 'optimize-product': await optimizeProduct(id); break;
      case 'rollback-optimization': await rollbackOptimization(id); break;
      case 'optimize-weak': await optimizeAllWeak(); break;
      case 'cap-save': await saveCaps(); break;
      case 'trend-vet':
        if (el.dataset.kind === 'product') { await openProduct(id); }
        else { await showVet(id); }
        break;
      case 'social-generate': await socialGenerate(); break;
      case 'social-batch': await socialBatch(); break;
      case 'social-schedule': await socialSchedule(el.dataset.product, el.dataset.platform); break;
      case 'social-postnow': await socialPostNow(el.dataset.product, el.dataset.platform); break;
      case 'social-cancel': await socialCancel(el.dataset.id); break;
      case 'ad-budget': await adBudget(); break;
      case 'ad-commit': await adCommit(); break;
      case 'ad-cancel': await adCancel(el.dataset.id); break;
      case 'cal-month': state.calendarMonth = el.dataset.month; await loadViewData('calendar'); render(); break;
      case 'scheduler': await scheduler(el.dataset.mode); break;
      case 'auto-list-toggle': await toggleAutoList(); break;
      case 'opp-score': await scoreOpportunity(); break;
      case 'passion-add': await passionAdd(); break;
      case 'passion-remove': await passionRemove(el.dataset.niche); break;
      case 'newsletter-load': await newsletterLoad(); break;
      case 'newsletter-copy': await newsletterCopy(); break;
      default: break;
    }
  } catch (err) { fail(err); }
});

document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  if (a === 'filter-status') { state.filters.status = el.value; state.filters.page = 1; render(); }
  else if (a === 'filter-type') { state.filters.type = el.value; state.filters.page = 1; render(); }
  else if (a === 'editor-color') editorRecolor(el.dataset.key, el.value);
  else if (a === 'editor-font') editorFont(el.value);
});

const onSearch = debounce((v) => { state.filters.q = v; state.filters.page = 1; render(); }, 220);
document.addEventListener('input', (e) => {
  if (e.target && e.target.id === 'cat-q') onSearch(e.target.value);
  if (e.target && e.target.id === 'palette-q') return; // handled directly
});

document.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|SELECT|TEXTAREA)$/.test((e.target && e.target.tagName) || '');
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
  if (e.key === 'Escape') { closePalette(); closeDrawer(); closeModal(); return; }
  if (typing) return;
  if (state.view === 'review' || state.view === 'home') {
    const pageItems = triageItems();
    if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); state.reviewIndex = Math.min(state.reviewIndex + 1, Math.max(0, pageItems.length - 1)); afterRender(); }
    else if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); state.reviewIndex = Math.max(0, state.reviewIndex - 1); afterRender(); }
    else {
      const cur = pageItems[state.reviewIndex];
      if (!cur) return;
      if (e.key === 'a') { e.preventDefault(); setStatus(cur.id, 'approved'); }
      else if (e.key === 'r') { e.preventDefault(); setStatus(cur.id, 'rejected'); }
      else if (e.key === 'x') { e.preventDefault(); state.selected.has(cur.id) ? state.selected.delete(cur.id) : state.selected.add(cur.id); render(); }
      else if (e.key === 'l') { e.preventDefault(); setStatus(cur.id, 'listed'); }
      else if (e.key === 'Enter') { e.preventDefault(); openProduct(cur.id); }
    }
  }
});

// ── AI spark + selection + boss channel ops ───────────────────────────────
// 💡 spark: point the worker at "this product/trend" without typing it.
function findRefItem(kind, id) {
  if (kind === 'trend') return (state.trends || []).find(x => Number(x.id) === Number(id));
  if (kind === 'post') return (state.social || []).find(x => String(x.id) === String(id));
  if (kind === 'ad') return ((state.ads && state.ads.recentRuns) || []).find(x => String(x.id) === String(id));
  if (kind === 'niche') return (state.passionNiches || []).find(x => String(x) === String(id));
  return (state.products || []).find(x => Number(x.id) === Number(id));
}
function refLabel(kind, item, id) {
  if (!item) return `#${id}`;
  if (kind === 'post') return String(item.content || '').slice(0, 48) || `post #${item.id}`;
  if (kind === 'ad') return item.name || `campaign #${item.id}`;
  if (kind === 'niche') return String(item);
  return item.name || `#${item.id}`;
}
function setAiRef(kind, id) {
  if (!kind) { state.aiRef = null; drawCmdCtx(); return; }
  const item = findRefItem(kind, id);
  state.aiRef = { kind, id, name: refLabel(kind, item, id) };
  ensureCmdBar();
  const log = document.getElementById('cmd-log');
  if (log) log.classList.add('open');
  drawCmdCtx();
  const input = document.getElementById('cmd-input');
  if (input) input.focus();
  toast('success', 'AI context set', `The worker knows you mean "${state.aiRef.name}".`);
}

function drawCmdCtx() {
  const host = document.getElementById('cmd-ctx');
  if (!host) return;
  const r = state.aiRef;
  host.innerHTML = r
    ? `<span class="ctx-chip">💡 ${esc(r.kind)}: <b>${esc(r.name)}</b><button class="x" data-action="ai-clear" aria-label="Clear AI context">✕</button></span>`
    : '';
  host.style.display = host.innerHTML ? 'flex' : 'none';
}

function aiAskSelection(kind) {
  const misc = kind !== 'product' && kind !== 'trend';
  const ids = misc
    ? [...(state.selectedMisc || [])].filter(k => k.startsWith(kind + ':')).map(k => k.slice(kind.length + 1))
    : kind === 'trend' ? [...state.selectedTrends] : [...state.selected];
  if (!ids.length) return;
  ensureCmdBar();
  const log = document.getElementById('cmd-log');
  if (log) log.classList.add('open');
  const input = document.getElementById('cmd-input');
  if (!input) return;
  const labels = misc ? ids.map(id => `"${refLabel(kind, findRefItem(kind, id), id)}"`) : [];
  input.value = kind === 'trend' ? `My selected trends (#${ids.join(', #')}) — which should I commit to and why?`
    : kind === 'product' ? `Look at my selected products (#${ids.join(', #')}) and tell me what to do with them`
    : kind === 'post' ? `Review my selected social posts (${labels.join(', ')}) — what should I improve?`
    : kind === 'ad' ? `Look at my selected ad campaigns (${labels.join(', ')}) — which is working and what should I change?`
    : `Of my selected niches (${labels.join(', ')}) — which should I generate from first and why?`;
  input.focus();
}

// Batch ops over the misc selection (social posts, ad runs, passion niches).
// Niche "Generate" drafts one product per niche through the same custom
// generator the "Make this…" modal uses.
async function miscBatch(kind, op) {
  const keys = [...(state.selectedMisc || [])].filter(k => k.startsWith(kind + ':'));
  if (!keys.length) return;
  const ids = keys.map(k => k.slice(kind.length + 1));
  if (op === 'generate') {
    toast('warning', 'Generating', `${ids.length} niche(s) queued…`);
    let made = 0;
    for (const n of ids) {
      const r = await safe(() => dataActions.generateCustom({ idea: n, count: 1 }));
      if (r && (r.created || []).length) made += r.created.length;
    }
    state.selectedMisc.clear();
    toast('success', 'Drafted', `${made} product(s) in the review queue.`);
    await loadCore(); render(); return;
  }
  let done = 0;
  for (const id of ids) {
    const r = await safe(() =>
      kind === 'post' ? dataActions.cancelPost(Number(id))
      : kind === 'ad' ? dataActions.cancelAd(Number(id))
      : dataActions.removePassionNiche(id));
    if (r !== null && r !== undefined) done++;
  }
  state.selectedMisc.clear();
  toast('info', op === 'remove' ? 'Removed' : 'Cancelled', `${done}/${ids.length} done.`);
  if (kind === 'post') await loadViewData('social');
  else if (kind === 'ad') await loadViewData('ads');
  else await loadViewData('discovery');
  render();
}

async function batchCovers() {
  const ids = [...state.selected];
  if (!ids.length) return;
  toast('warning', 'Generating covers', `${ids.length} covers queued…`);
  const r = await safe(() => dataActions.generateCovers({ ids }));
  if (r) {
    const okCount = (r.results || []).filter(x => x.ok !== false).length;
    toast('success', 'Covers done', `${okCount}/${ids.length} generated`);
  }
  await refreshAfterMutation();
}

async function trendBatch(op) {
  const ids = [...state.selectedTrends];
  if (!ids.length) return;
  let done = 0;
  for (const id of ids) {
    const r = await safe(() => op === 'generate' ? dataActions.generateFromTrend(id, { count: 3 })
      : op === 'activate' ? dataActions.activateTrend(id) : dataActions.dismissTrend(id));
    if (r) done++;
  }
  state.selectedTrends.clear();
  toast('success', `Trends ${op === 'generate' ? 'generated' : op + 'd'}`, `${done}/${ids.length} done`);
  await refreshAfterMutation();
}

// Boss answers. An option with an action replays it through the confirmed
// tool path (the answer IS the approval); free text goes back to the worker.
async function askAnswer(id, optIndex, free) {
  let text = '';
  if (free) {
    text = (prompt('Your answer to the worker:') || '').trim();
    if (!text) return;
  }
  const r = await safe(() => workerApi.answer(id, { answer: text, optionIndex: optIndex }));
  if (!r) return;
  if (r.action) {
    toast('success', 'Decision accepted', 'Executing your decision…');
    cmdPush('step', `boss decided · executing ${r.action.tool}`);
    const res = await safe(() => consoleApi.agent('', { confirmCall: r.action }));
    for (const st of ((res && res.steps) || [])) cmdPush('step', stepLine(st));
    cmdPush('ng', (res && res.answer) || 'Decision executed.');
  } else if (text) {
    const ask = r.ask || {};
    const res = await safe(() => consoleApi.agent(`Boss answered your ask #${id} ("${ask.question}"): "${text}" — act on it.`));
    if (res && res.answer) cmdPush('ng', res.answer);
  } else {
    toast('success', 'Answer sent', 'The worker will pick it up.');
  }
  await loadCore(); render();
}

async function askDismiss(id) {
  await safe(() => workerApi.dismiss(id));
  await loadCore(); render();
}

async function memoryAdd() {
  const input = document.getElementById('mem-input');
  const kind = (document.getElementById('mem-kind') || {}).value || 'note';
  const content = ((input || {}).value || '').trim();
  if (!content) return;
  await safe(() => workerApi.remember(kind, content, false));
  if (input) input.value = '';
  toast('success', 'Remembered', 'It rides in every AI turn from now on.');
  await loadViewData('system'); render();
}

async function memoryPin(id, pinned) {
  await safe(() => workerApi.pin(id, pinned));
  await loadViewData('system'); render();
}

async function memoryDel(id) {
  await safe(() => workerApi.forget(id));
  await loadViewData('system'); render();
}

async function webhookSave() {
  const v = ((document.getElementById('hook-input') || {}).value || '').trim();
  if (!v) return;
  await safe(() => dataActions.saveSettings({ webhook_url: v }));
  toast('success', 'Saved', 'Discord webhook stored — try a test ping.');
  await loadViewData('system'); render();
}

async function notifyTest() {
  const r = await safe(() => workerApi.notifyTest());
  if (r && r.sent) toast('success', '🤖 Ping sent', 'Check Discord — the boss has been notified.');
}

async function stewardRun() {
  const r = await safe(() => workerApi.stewardRun());
  if (!r) return;
  if (r.skipped) toast('warning', 'Nothing to ask', r.skipped);
  else toast('success', '🤖 Asked the boss', (r.ask && r.ask.question) || 'Question posted.');
  await loadCore(); render();
}

async function stewardToggle() {
  const on = !(state.workerStatus || {}).stewardEnabled;
  await safe(() => dataActions.saveSettings({ steward_enabled: on ? 'true' : 'false' }));
  state.workerStatus = { ...(state.workerStatus || {}), stewardEnabled: on };
  render();
}

// ── individual operations ──────────────────────────────────────────────
async function setStatus(id, status) {
  await safe(() => dataActions.setProductStatus(id, status));
  toast('success', 'Updated', `Status → ${status}`);
  await refreshAfterMutation();
}
async function publish(id) {
  const r = await safe(() => dataActions.publishProduct(id));
  if (r) toast('success', '🚀 Published', `Live on ${r.platform || 'marketplace'}`);
  await refreshAfterMutation();
}
async function pushEtsy(id) {
  const r = await safe(() => dataActions.pushEtsy(id));
  if (r) toast('success', 'Pushed to Etsy', r.listing_id ? `Listing ${r.listing_id}` : 'Created');
  await refreshAfterMutation();
}
async function betterIdea(id) {
  const r = await safe(() => dataActions.regenerateIdea(id));
  if (!r) return;
  if (r.regenerated) toast('success', 'Better idea applied', 'The product was retitled with a sharper angle.');
  else toast('warning', 'No upgrade', r.message || 'The idea did not clear the novelty bar.');
  await refreshAfterMutation();
}
// Cursor-paged rebuild with live progress (client-driven so batches stream in;
// the server-side `rebuild-covers` action stays for headless/cron use).
const coverRebuild = createCoverRebuild({
  notify: (kind, title, msg) => toast(kind, title, msg),
  onFinish: async () => { await loadCore(); render(); }
});
function rebuildCovers() {
  if (coverRebuild.isRunning()) { toast('warning', 'Already running', 'A cover rebuild is in flight.'); return; }
  coverRebuild.regenerateAll();
}

async function coverGenerate(id) {
  await safe(() => dataActions.generateCovers({ productId: Number(id) }));
  toast('info', 'Cover requested', 'Regenerating in the background.');
}
async function deleteProduct(id) {
  await safe(() => dataActions.deleteProduct(id));
  toast('success', 'Deleted', 'Product removed.');
  closeDrawer();
  await refreshAfterMutation();
}
async function batchStatus(status) {
  const ids = [...state.selected];
  if (!ids.length) return;
  let ok = 0, bad = 0;
  for (const id of ids) {
    try { await dataActions.setProductStatus(id, status); ok++; } catch { bad++; }
  }
  state.selected.clear();
  toast(bad ? 'warning' : 'success', 'Batch update', `${ok} set to ${status}${bad ? `, ${bad} failed` : ''}`);
  await refreshAfterMutation();
}
async function refreshAfterMutation() {
  await loadCore();
  // Reload the view's data too (BI especially) — otherwise Shop Health and
  // the briefing keep stale numbers after an approve/reject on the same page.
  await loadViewData(state.view);
  render();
}
async function dispatchSmart(name) {
  const map = {
    'approve-all': () => runAction('approve-all'),
    'generate-drafts': () => runAction('full-cycle'),
    'auto-list': () => toggleAutoList(),
    'run-sweep': () => runAction('sweep'),
    'rebuild-all': () => rebuildCovers(),
    'batch-social': () => go('social'),
    'passion-generate': () => go('discovery')
  };
  if (map[name]) await map[name]();
  else toast('info', name, 'No handler for this suggestion.');
}
async function trendOp(op, id) {
  if (op === 'activate') { const r = await safe(() => dataActions.activateTrend(id)); if (r) toast('success', 'Activated', `${r.productsGenerated || 0} products generated`); }
  if (op === 'dismiss') { await safe(() => dataActions.dismissTrend(id)); toast('info', 'Dismissed', 'Trend dismissed.'); }
  if (op === 'archive') { await safe(() => dataActions.archiveTrend(id)); toast('info', 'Archived', 'Trend archived.'); }
  await loadCore(); render();
}
async function showVet(id) {
  const v = await safe(() => dataApi.vetTrend(id));
  if (!v) return;
  // Structured panel: signals are real numbers, so they render as bars. (This
  // used to JSON.stringify every object straight into the modal.)
  const sig = v.signals || {};
  const rows = Object.entries(sig).map(([k, val]) =>
    barRow(titleCase(String(k).replace(/_/g, ' ')), Number(val) || 0, 100, 'var(--grad)')).join('');
  const verdict = String(v.verdict || 'WATCH');
  const safeVerdict = ['ACTIVATE', 'WATCH', 'SKIP'].includes(verdict) ? verdict : 'WATCH';
  const score = Number(v.score) || 0;
  openModal('Vetting Detail', `
    <div class="grid g2">
      <div class="panel"><div class="panel-body">
        ${gauge(score, `Score ${score}/100 · Grade ${esc(v.grade || '—')}`, score >= 65 ? 'var(--green)' : score >= 45 ? 'var(--amber)' : 'var(--red)')}
        <div class="mt8" style="text-align:center"><span class="grade ${safeVerdict}">${esc(safeVerdict)}</span></div>
      </div></div>
      <div class="panel"><div class="panel-head">Signals</div><div class="panel-body">${rows || '<div class="hint">no signal data</div>'}</div></div>
    </div>
    <div class="hint mt8">Weighted score: demand, competition, margin, seasonality, longevity, specificity, shopping intent. Verdict: ≥65 ACTIVATE · ≥45 WATCH · below SKIP.</div>`);
}

// ── Make-this / custom generation dialog ──────────────────────────────────
// One shared modal for the product customizer: the "Make this" button, the ⌘K
// palette entry, and Trend rows' Generate button (pre-filled + locked to the
// trend) all render this. #mk-brief is the details/prompts input.
function openMakeThis(preset = {}) {
  const isTrend = preset.mode === 'trend';
  openModal(isTrend ? 'Generate from trend' : '✨ Make this', `
    <div class="hint mb8">${isTrend
      ? 'Generate products for this trend. Add details or prompts to steer the output.'
      : 'Describe anything — the engine drafts it as a product you can edit and publish.'}</div>
    <input id="mk-idea" value="${esc(preset.idea || '')}" ${preset.lockIdea ? 'readonly' : ''}
      placeholder="e.g. dog bakery price list template" aria-label="Idea" style="width:100%;margin-bottom:8px">
    <textarea id="mk-brief" rows="3" placeholder="Details / prompts — audience, tone, must-haves, what to avoid (optional)" aria-label="Details or prompts" style="width:100%;margin-bottom:8px"></textarea>
    <div class="flex mb8" style="gap:8px">
      <select id="mk-type" aria-label="Product type" style="flex:1">
        <option value="">Auto-pick type</option>
        ${['checklist', 'spreadsheet', 'invoice', 'planner', 'worksheet', 'journal', 'social', 'brand', 'website', 'booking', 'pricing', 'inventory', 'tool', 'bundle'].map(t => `<option value="${t}">${titleCase(t)}</option>`).join('')}
      </select>
      <input id="mk-price" type="number" min="0" step="1" placeholder="Price $" aria-label="Price" style="width:90px">
      <input id="mk-count" type="number" min="1" max="6" value="${esc(preset.count || 1)}" aria-label="How many" style="width:70px">
    </div>
    <div class="btn-row" style="margin-bottom:0">
      <button class="btn primary" data-action="${isTrend ? 'trend-generate-run' : 'make-this-run'}" data-id="${esc(preset.id || '')}">${icon('sparkles')} Generate</button>
      <span class="hint" style="flex:1;align-self:center">${isTrend
        ? 'Engine products — optimizer updates may auto-deploy to live listings.'
        : 'Manual product — local only; you publish it yourself.'}</span>
    </div>`);
}

function openGenerateTrend(id) {
  const t = state.trends.find(x => String(x.id) === String(id));
  openMakeThis({ mode: 'trend', id, idea: (t && (t.name || t.niche)) || '', lockIdea: true, count: 3 });
}

async function makeThisRun() {
  const idea = ((document.getElementById('mk-idea') || {}).value || '').trim();
  if (!idea) { toast('warning', 'Describe it first', 'Type what you want made.'); return; }
  const brief = ((document.getElementById('mk-brief') || {}).value || '').trim();
  const type = (document.getElementById('mk-type') || {}).value || undefined;
  const price = parseFloat((document.getElementById('mk-price') || {}).value) || undefined;
  const count = Math.max(1, Math.min(6, parseInt((document.getElementById('mk-count') || {}).value) || 1));
  closeModal();
  const r = await safe(() => dataActions.generateCustom({ idea, brief, type, price, count }));
  if (!r) return;
  toast('success', 'Drafted', `${(r.created || []).length} product(s) in the review queue — manual products stay local until you publish.`);
  await loadCore(); render();
}

async function trendGenerateRun(id) {
  const brief = ((document.getElementById('mk-brief') || {}).value || '').trim();
  const count = Math.max(1, Math.min(6, parseInt((document.getElementById('mk-count') || {}).value) || 3));
  closeModal();
  const r = await safe(() => dataActions.generateFromTrend(id, { brief, count }));
  if (!r) return;
  toast('success', 'Generated', `${r.generated || 0} products from this trend`);
  await loadCore(); render();
}

// ── listing optimizer ─────────────────────────────────────────────────
async function optimizeProduct(id) {
  const r = await safe(() => dataActions.optimizeProduct(id));
  if (!r) return;
  const d = r.deploy || {};
  const tail = d.ok ? 'New copy pushed to the live listing.' : (d.reason || d.error || 'Copy stored locally.');
  toast('success', 'Listing optimized', `score ${r.scoreBefore} → ${r.scoreAfter} · ${tail}`);
  await loadCore(); render();
}

async function rollbackOptimization(id) {
  const r = await safe(() => dataActions.rollbackOptimization(id));
  if (!r) return;
  if (!r.ok) { toast('warn', 'Nothing to roll back', r.reason || 'No optimization applied yet.'); return; }
  const d = r.deploy || {};
  const tail = d.ok ? ' · restored copy pushed to live listing' : (d.reason ? ' · copy restored locally' : '');
  toast('success', 'Copy rolled back', `restored ${r.targetKind} listing copy (score ${r.score})${tail}`);
  await loadCore(); render();
}

async function optimizeAllWeak() {
  const r = await safe(() => dataActions.optimizeWeak(20));
  if (!r) return;
  toast('success', 'Weak listings optimized', `${r.optimized || 0} rewritten · ${r.deployed || 0} deployed to live listings`);
  await loadCore(); render();
}

async function saveCaps() {
  const etsy = parseInt((document.getElementById('cap-etsy') || {}).value) || 20;
  const gumroad = parseInt((document.getElementById('cap-gumroad') || {}).value) || 10;
  const r = await safe(() => dataActions.saveCaps({ etsy, gumroad }));
  if (!r) return;
  toast('success', 'Caps saved', `Gumroad ${r.gumroad}/day · Etsy ${r.etsy}/day`);
  await loadViewData('automation'); render();
}
async function socialGenerate() {
  const pid = document.getElementById('social-product').value;
  const platform = document.getElementById('social-platform').value;
  if (!pid) { toast('warning', 'Pick a product', 'Select a listed product first.'); return; }
  const r = await safe(() => dataActions.generateSocial(Number(pid), platform));
  if (!r) return;
  state.lastSocialContent = r.content;
  const host = document.getElementById('social-preview');
  if (host) {
    host.innerHTML = `<div class="panel"><div class="panel-body">
      <div style="white-space:pre-wrap;font-size:.8rem;max-height:220px;overflow:auto">${esc(r.content)}</div>
      <div class="btn-row mt8" style="margin-bottom:0">
        <button class="btn primary sm" data-action="social-schedule" data-product="${pid}" data-platform="${esc(platform)}">Schedule</button>
        <button class="btn green sm" data-action="social-postnow" data-product="${pid}" data-platform="${esc(platform)}">Post Now</button>
      </div></div></div>`;
  }
}
async function socialSchedule(pid, platform) {
  await safe(() => dataActions.schedulePost({
    productId: Number(pid), platform,
    content: state.lastSocialContent || '',
    scheduledAt: new Date(Date.now() + 3600000).toISOString()
  }));
  toast('success', 'Scheduled', 'Post scheduled for 1 hour from now.');
  await loadViewData('social'); render();
}
async function socialPostNow(pid, platform) {
  await safe(() => dataActions.postNow(Number(pid), platform));
  toast('success', 'Logged', `Recorded a ${platform} post (local ledger — no platform API call).`);
  await loadViewData('social'); render();
}
async function socialBatch() {
  const platform = (document.getElementById('social-platform') || {}).value || 'instagram';
  const r = await safe(() => dataActions.batchSocial(platform, 10));
  if (r) toast('success', 'Batch generated', `${r.generated} posts scheduled`);
  await loadViewData('social'); render();
}
async function socialCancel(id) {
  await safe(() => dataActions.cancelPost(Number(id)));
  toast('info', 'Cancelled', 'Scheduled post removed.');
  await loadViewData('social'); render();
}
async function adBudget() {
  const v = parseFloat(document.getElementById('budget-input').value) || 0;
  await safe(() => dataActions.setAdBudget(v));
  toast('success', 'Budget saved', `Monthly budget set to ${fmtMoney(v)}`);
  await loadViewData('ads'); render();
}
async function adCommit() {
  const name = document.getElementById('ad-name').value || 'Untitled';
  const platform = document.getElementById('ad-platform').value;
  const amount = parseFloat(document.getElementById('ad-amount').value) || 0;
  if (!amount) { toast('warning', 'Enter an amount', ''); return; }
  await safe(() => dataActions.commitAdSpend({ name, platform, amount }));
  toast('success', 'Committed', `${fmtMoney(amount)} to ${platform}`);
  await loadViewData('ads'); render();
}
async function adCancel(id) {
  await safe(() => dataActions.cancelAd(Number(id)));
  toast('info', 'Cancelled', 'Campaign cancelled and spend refunded.');
  await loadViewData('ads'); render();
}
async function scheduler(mode) {
  await safe(() => window.fetch(`/api/automation/scheduler/${mode}`, { method: 'POST' }));
  toast('success', 'Scheduler', mode === 'start' ? 'Cron started.' : 'Cron stopped.');
  await loadCore(); render();
}
async function toggleAutoList() {
  const cur = !!(state.overview && state.overview.engine && state.overview.engine.autoList);
  await safe(() => dataActions.saveSettings({ auto_list: cur ? 'false' : 'true' }));
  toast('success', 'Auto-List', cur ? 'Turned off.' : 'Turned on.');
  await loadCore(); render();
}
// On-demand idea scorer: the endpoint takes a phrase, so it can never be
// pre-loaded — it is fetched per query and rendered inline.
async function scoreOpportunity() {
  const input = document.getElementById('opp-q');
  const phrase = ((input && input.value) || '').trim();
  if (!phrase) { toast('warning', 'Enter a phrase', 'Type a niche or product idea to score.'); return; }
  const r = await safe(() => dataApi.scoreOpportunity(phrase));
  if (!r) return;
  state.opportunity = r.score || null;
  render();
}

async function passionAdd() {
  const input = document.getElementById('passion-input');
  const niche = (input && input.value || '').trim();
  if (!niche) return;
  await safe(() => dataActions.addPassionNiche(niche));
  toast('success', 'Niche added', niche);
  await loadViewData('discovery'); render();
}
async function passionRemove(niche) {
  await safe(() => dataActions.removePassionNiche(niche));
  await loadViewData('discovery'); render();
}
async function newsletterLoad() {
  const r = await safe(() => dataApi.newsletter());
  if (r) { state.newsletter = r; render(); toast('success', 'Newsletter ready', r.subject); }
}
async function newsletterCopy() {
  if (!state.newsletter) return;
  try { await navigator.clipboard.writeText(`${state.newsletter.subject}\n\n${state.newsletter.body}`); toast('success', 'Copied', 'Newsletter copied to clipboard.'); }
  catch { toast('warning', 'Copy failed', 'Clipboard unavailable.'); }
}

// ── live stream ────────────────────────────────────────────────────────
function startStream() {
  connectStream({
    onStatus: (s) => { state.live = s === 'live' ? 'live' : s; renderTopbar(); },
    onEvent: async (evt) => {
      if (!evt || evt.type !== 'run') return;
      refreshRuns();
      if (evt.phase === 'finish') {
        await loadCore();
        render();
      }
    }
  });
}

// ── boot ───────────────────────────────────────────────────────────────
async function init() {
  ensureCmdBar();
  render();
  await loadCore();
  await loadViewData('home');
  render();
  startStream();
  setInterval(async () => { await loadCore(); renderTopbar(); }, 60000);
}

init();
