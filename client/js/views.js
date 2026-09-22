// ═══════════════════════════════════════════════════════════════════════
// FLIGHT DECK — views
// Pure render functions: (state) -> HTML string. Interactions are wired by
// console.js through delegated [data-action] handlers, so no inline JS is
// emitted and every dynamic value is escaped.
// ═══════════════════════════════════════════════════════════════════════

import {
  esc, icon, fmtNum, fmtMoney, timeAgo, clockTime, bytes, titleCase,
  sparkline, gauge, barRow, statusPillClass, thumbFallback, reviewPage,
  isReviewable, reviewQueue
} from './ui.js';

export const NAV = [
  { group: 'operate', view: 'home', label: 'Home', icon: 'home' },
  { group: 'operate', view: 'catalog', label: 'Catalog', icon: 'catalog' },
  { group: 'operate', view: 'review', label: 'Review', icon: 'review', badge: 'review' },
  { group: 'discover', view: 'discovery', label: 'Discovery', icon: 'discovery' },
  { group: 'discover', view: 'trends', label: 'Trends', icon: 'trends' },
  { group: 'grow', view: 'social', label: 'Social', icon: 'social' },
  { group: 'grow', view: 'ads', label: 'Ads', icon: 'ads' },
  { group: 'grow', view: 'calendar', label: 'Calendar', icon: 'calendar' },
  { group: 'grow', view: 'analytics', label: 'Analytics', icon: 'analytics' },
  { group: 'system', view: 'automation', label: 'Automation', icon: 'automation', badge: 'busy' },
  { group: 'system', view: 'marketplace', label: 'Market', icon: 'marketplace' },
  { group: 'system', view: 'system', label: 'System', icon: 'system', badge: 'blockers' }
];

export const CRUMBS = {
  home: 'Command Center', catalog: 'Product Catalog', review: 'Review Queue',
  discovery: 'Discovery & Opportunity', trends: 'Trend Radar', social: 'Social Scheduler',
  ads: 'Ad Spend Ledger', calendar: 'Content Calendar', analytics: 'Sales Analytics',
  automation: 'Automation', marketplace: 'Marketplace', system: 'System & Readiness'
};

// ── shared fragments ───────────────────────────────────────────────────
function pill(status) {
  const label = String(status || 'draft').replace(/_/g, ' ').replace(/-/g, ' ');
  return `<span class="pill ${statusPillClass(status)}"><span class="dot"></span>${esc(label)}</span>`;
}
function kpi(label, value, sub, cls) {
  return `<div class="kpi ${cls || ''}"><div class="lb">${esc(label)}</div><div class="num">${esc(value)}</div>${sub ? `<div class="sb">${esc(sub)}</div>` : ''}</div>`;
}
function head(title, desc, rightHtml) {
  return `<div class="view-head"><div><h2>${esc(title)}</h2><div class="desc">${esc(desc)}</div></div><div class="sp"></div>${rightHtml || ''}</div>`;
}
function empty(msg) { return `<div class="panel"><div class="empty">${esc(msg)}</div></div>`; }
function img(p) {
  if (p && p.preview_path) {
    return `<img src="/api/products/${encodeURIComponent(p.id)}/preview-image" loading="lazy" alt="">`;
  }
  return `<span class="ph">${thumbFallback(p && p.type)}</span>`;
}
function conceptTeaser(p) {
  if (!p || !p.concept) return '';
  let c = null; try { c = JSON.parse(p.concept); } catch { c = null; }
  if (!c || !c.pitch) return '';
  const short = c.pitch.length > 96 ? c.pitch.slice(0, 93) + '…' : c.pitch;
  return `<div class="mt" title="${esc(c.pitch)}" style="color:var(--teal);opacity:.85">◆ ${esc(short)}</div>`;
}
function pager(total, page, perPage, action) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  if (pages <= 1) return '';
  return `<div class="pager">
    <button class="btn ghost sm" data-action="${action}" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>${icon('chevronLeft')} Prev</button>
    <span>Page ${page} of ${pages} · ${fmtNum(total)} items</span>
    <button class="btn ghost sm" data-action="${action}" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>Next ${icon('chevronRight')}</button>
  </div>`;
}
function activityRows(rows, limit) {
  const list = (rows || []).slice(0, limit || 12);
  if (!list.length) return '<div class="empty">No activity yet.</div>';
  return list.map(l => `<div class="logrow ${esc(l.status || 'info')}">
    <span class="t">${esc(clockTime(l.created_at))}</span>
    <span class="act">${esc(l.action)}</span>
    <span class="tx">${esc(l.details)}</span>
    <span class="hint" style="flex-shrink:0">${esc(timeAgo(l.created_at))}</span>
  </div>`).join('');
}

// ═══════════════════════════════════════════════════════════════════════
// 1 · HOME / COMMAND CENTER
// ═══════════════════════════════════════════════════════════════════════
export function home(s) {
  const o = s.overview || {};
  const c = o.counts || {};
  const f = o.funnel || {};
  const rev = o.revenue || {};
  const etsy = o.etsy || { cap: 20, published: 0, remaining: 20 };
  const ready = o.readiness || { issues: [], ok: false };
  const engine = o.engine || {};

  // "Awaiting review" means the same thing everywhere in the console: the set
  // the Review Queue lists (drafts + pending-review). The server's narrower
  // `review` bucket excludes drafts, so deriving these from the loaded products
  // keeps the badge, the funnel, the KPI and the queue itself in agreement.
  const queued = reviewQueue(s.products).length;

  // BI aggregates (health / deltas / insights) — real numbers from the BI
  // service; the view degrades silently to "—" until the first fetch lands.
  const bi = s.bi || {};
  const bh = bi.health || {};
  const ins = bi.insights || {};
  const bdl = bi.deltas || {};
  const pctText = d => (typeof d === 'number' ? (d > 0 ? '+' : '') + d + '% vs prior 7d' : 'no prior data');
  const funnelStages = [
    ['Discover', f.discover || 0, 'discover'],
    ['Generate', f.generate || 0, 'generate'],
    ['Review', queued, 'review'],
    ['Approve', f.approve || 0, 'approve'],
    ['Publish', f.publish || 0, 'publish']
  ];
  const funnel = funnelStages.map(([label, n, stage]) =>
    `<button class="st ${n > 0 ? 'on' : ''}" data-action="funnel" data-stage="${stage}" title="Filter catalog: ${esc(label)}">
      <span class="ring">${fmtNum(n)}</span><span class="l">${esc(label)}</span></button>`).join('<span class="ar">→</span>');

  const smart = (s.smartActions || []).map(a =>
    `<button class="btn ghost" data-action="smart" data-name="${esc(a.action)}" style="border-left:3px solid ${esc(a.color || 'var(--teal)')}">
      ${esc(a.icon || '⚡')} ${esc(a.title)}</button>`).join('');

  const blockers = (ready.issues || []).filter(i => i.severity === 'error');
  const warns = (ready.issues || []).filter(i => i.severity === 'warning');

  const capPct = etsy.cap > 0 ? Math.round((etsy.published / etsy.cap) * 100) : 0;

  return head('🚀 Command Center', 'Discover → generate → review → publish. Everything the engine is doing, live.',
    `<button class="btn green" data-action="make-this">${icon('sparkles')} Make this…</button>
     <button class="btn primary" data-action="palette">${icon('command')} Run a command <kbd>⌘K</kbd></button>`)
  + `<div class="kpis mb14">
      ${kpi('Products', fmtNum(c.products), `${fmtNum(c.listed)} listed · ${pctText(bdl.products && bdl.products.deltaPct)}`, 'tc')}
      ${kpi('Shop Health', typeof bh.score === 'number' ? String(bh.score) : '—', bh.grade || 'computing…', bh.score >= 80 ? 'gn' : 'am')}
      ${kpi('In Review', fmtNum(queued), 'awaiting you', 'am')}
      ${kpi('Approved', fmtNum(c.approved), 'ready to publish', 'bl')}
      ${kpi('Draft', fmtNum(c.draft), `${fmtNum(c.professions)} niches`, '')}
      ${kpi('Est. Revenue', fmtMoney(rev.estimated), `${fmtNum(rev.realSales)} real sales`, 'gn')}
      ${kpi('Real Revenue', fmtMoney(rev.realRevenue, true), 'synced from Gumroad', 'gn')}
    </div>
    <div class="panel mb14"><div class="panel-head">${icon('bolt')} Insights <span class="sp"></span>
      <span class="hint">opportunity · risk · action — rule-based on live state</span></div>
      <div class="panel-body"><div class="grid g3">
        <div>
          <div class="hint mb8">✅ Opportunities</div>
          ${(ins.opportunities || []).map(t => `<div class="mt8" style="font-size:.78rem;line-height:1.45">${esc(t)}</div>`).join('') || '<div class="hint">—</div>'}
        </div>
        <div>
          <div class="hint mb8">⚠️ Risks</div>
          ${(ins.risks || []).map(t => `<div class="mt8" style="font-size:.78rem;line-height:1.45;color:var(--amber)">${esc(t)}</div>`).join('') || '<div class="hint">no active risks</div>'}
        </div>
        <div>
          <div class="hint mb8">🎯 Do this next</div>
          ${(ins.actions || []).map(a => `<button class="btn sm mb8" style="width:100%" data-action="run" data-name="${esc(a.run)}">${icon('bolt')} ${esc(a.label)}</button>`).join('') || '<div class="hint">—</div>'}
        </div>
      </div></div></div>
    <div class="grid g2 mb14">
      <div class="panel">
        <div class="panel-head">${icon('layers')} Pipeline <span class="sp"></span>
          <span class="hint">${engine.isReviewDay ? 'review gate UP' : 'review gate open'}</span></div>
        <div class="panel-body"><div class="funnel">${funnel}</div></div>
      </div>
      <div class="panel">
        <div class="panel-head">${icon('marketplace')} Etsy Quota <span class="sp"></span>
          <span class="hint">resets daily</span></div>
        <div class="panel-body">
          ${gauge(capPct, `${etsy.published} / ${etsy.cap}`, capPct >= 100 ? 'var(--red)' : capPct >= 70 ? 'var(--amber)' : 'var(--teal)')}
          <div class="hint mt8">${fmtNum(etsy.remaining)} remaining today · cap ${fmtNum(etsy.cap)}/day (editable in Automation)</div>
        </div>
      </div>
    </div>
    <div class="grid g2">
      <div>
        <div class="panel mb14">
          <div class="panel-head">${icon('bolt')} Quick Actions</div>
          <div class="panel-body">
            ${smart ? `<div class="btn-row">${smart}</div>` : ''}
            <div class="btn-row" style="flex-direction:column;align-items:stretch">
              <button class="btn primary" data-action="run" data-name="sweep">${icon('discovery')} Discover New Niches</button>
              <button class="btn primary" data-action="run" data-name="full-cycle">${icon('play')} Run Full Automation Cycle</button>
              <button class="btn green" data-action="run" data-name="push-bundles">${icon('box')} Publish Bundles → Gumroad</button>
              <button class="btn green" data-action="run" data-name="lead-magnet">${icon('rocket')} Publish Lead Magnet</button>
              <button class="btn" data-action="run" data-name="sync-sales">${icon('refresh')} Sync Sales</button>
              <button class="btn" data-action="rebuild-covers">${icon('sparkles')} Rebuild Covers</button>
            </div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-head">${icon('shield')} Launch Readiness</div>
          <div class="panel-body">
            ${blockers.length === 0 && warns.length === 0
              ? '<div class="hint" style="color:var(--green)">No blockers. Everything configured.</div>'
              : [...blockers.map(i => `<div class="mb8" style="font-size:.78rem;color:var(--red)">✕ ${esc(i.message)}</div>`),
                 ...warns.slice(0, 4).map(i => `<div class="mb8" style="font-size:.78rem;color:var(--amber)">⚠ ${esc(i.message)}</div>`)].join('')}
            <button class="btn ghost sm mt8" data-action="go" data-view="system">Open System →</button>
          </div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head">${icon('clock')} Live Activity <span class="sp"></span>
          <span class="hint">${s.live === 'live' ? 'streaming' : s.live}</span></div>
        <div class="panel-body"><div class="logs">${activityRows(o.activity, 16)}</div></div>
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════
// 2 · CATALOG
// ═══════════════════════════════════════════════════════════════════════
export function catalog(s) {
  const f = s.filters;
  const types = [...new Set((s.products || []).map(p => p.type))].sort();
  let list = s.products || [];
  // `needs-review` is a virtual filter (no such status exists) — it resolves to
  // the same set the Review Queue shows, so the funnel's Review stage lands on
  // a populated list instead of an empty one.
  if (f.status === 'needs-review') list = list.filter(isReviewable);
  else if (f.status !== 'all') list = list.filter(p => p.status === f.status);
  if (f.type !== 'all') list = list.filter(p => p.type === f.type);
  if (f.q) {
    const q = f.q.toLowerCase();
    list = list.filter(p => (p.name || '').toLowerCase().includes(q) || (p.prof_name || '').toLowerCase().includes(q));
  }
  const per = 24;
  const page = Math.max(1, Math.min(f.page || 1, Math.ceil(list.length / per) || 1));
  const slice = list.slice((page - 1) * per, page * per);
  const sel = s.selected.size;

  const cards = slice.map(p => `
    <div class="card ${s.selected.has(p.id) ? 'sel' : ''}" data-action="open" data-id="${p.id}">
      <div class="thumb">${img(p)}<span class="ck"></span><div class="dna-strip"></div></div>
      <div class="bd">
        <div class="nm" title="${esc(p.name)}">${esc(p.name)}</div>
        <div class="mt">${esc(p.prof_name || '—')} · ${esc(titleCase(p.type))}</div>
        ${conceptTeaser(p)}
        <div class="flex-between mt8"><span>${pill(p.status)}</span><span class="pr">${esc(p.price || '')}</span></div>
        <div class="flex mt8" style="gap:5px">
          <button class="btn ghost sm" data-action="toggle-select" data-id="${p.id}" title="Select">${s.selected.has(p.id) ? '☑' : '☐'}</button>
          <button class="btn ghost sm" data-action="open" data-id="${p.id}" title="Open">${icon('eye')}</button>
          <button class="btn ghost sm" data-action="edit-product" data-id="${p.id}" title="Edit document">${icon('pencil')}</button>
        </div>
      </div>
    </div>`).join('');

  return head('📦 Product Catalog', 'Every generated product, its file, its concept and its status.',
    `<button class="btn ghost" data-action="go" data-view="home">← Overview</button>`)
  + `<div class="btn-row">
      <div class="search">${icon('search')}<input id="cat-q" placeholder="Search products or niches…" value="${esc(f.q)}" aria-label="Search products"></div>
      <select data-action="filter-status" aria-label="Status filter">
        ${['all', 'needs-review', 'draft', 'pending-review', 'approved', 'listed', 'rejected', 'archived'].map(v =>
          `<option value="${v}" ${f.status === v ? 'selected' : ''}>${v === 'all' ? 'All status' : esc(v === 'needs-review' ? 'Needs review' : titleCase(v))}</option>`).join('')}
      </select>
      <select data-action="filter-type" aria-label="Type filter">
        <option value="all">All types</option>
        ${types.map(t => `<option value="${esc(t)}" ${f.type === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
      </select>
      <button class="btn ghost sm" data-action="clear-selection" ${sel ? '' : 'disabled'}>Clear (${sel})</button>
      <button class="btn green sm" data-action="batch" data-status="approved" ${sel ? '' : 'disabled'}>Approve</button>
      <button class="btn sm" data-action="batch" data-status="listed" ${sel ? '' : 'disabled'}>Mark listed</button>
      <button class="btn red sm" data-action="batch" data-status="rejected" ${sel ? '' : 'disabled'}>Reject</button>
      <span class="hint">${fmtNum(list.length)} shown · ${types.length} types</span>
    </div>
    ${slice.length ? `<div class="cards">${cards}</div>${pager(list.length, page, per, 'cat-page')}`
      : empty('No products match. Adjust filters or run a discovery sweep.')}`;
}

// ═══════════════════════════════════════════════════════════════════════
// 3 · REVIEW QUEUE (paginated + keyboard triage)
// ═══════════════════════════════════════════════════════════════════════
export function review(s) {
  // Queue membership, ordering and pagination come from the shared helper so
  // the table, the pager and the J/K cursor always agree.
  const { items, per, page, slice } = reviewPage(s.products, s.reviewPage);

  const rows = slice.map(p => `
    <div class="rrow" data-review-id="${p.id}">
      <div class="rt">${img(p)}</div>
      <div>
        <div class="nm">${esc(p.name)}</div>
        <div class="mt">${esc(p.prof_name || '')} · ${esc(titleCase(p.type))} · ${esc(p.price || '')}</div>
        ${conceptTeaser(p)}
        <div class="flex mt8" style="gap:6px">${pill(p.status)}
          <button class="btn ghost sm" data-action="trend-vet" data-id="${p.id}" data-kind="product" title="Vetting detail">ⓘ</button>
        </div>
      </div>
      <div class="acts">
        <button class="btn ghost sm" data-action="open" data-id="${p.id}">${icon('eye')} Open</button>
        <button class="btn sm" data-action="edit-product" data-id="${p.id}">${icon('pencil')} Edit</button>
        <button class="btn amber sm" data-action="better-idea" data-id="${p.id}" title="Ask the concept engine for a more differentiated angle">${icon('brain')} Better Idea</button>
        <button class="btn green sm" data-action="approve" data-id="${p.id}">${icon('check')} Approve</button>
        <button class="btn primary sm" data-action="publish" data-id="${p.id}">${icon('rocket')} Publish</button>
        <button class="btn red sm" data-action="reject" data-id="${p.id}">${icon('x')} Reject</button>
      </div>
    </div>`).join('');

  return head('✅ Review Queue', `${fmtNum(items.length)} awaiting review. Keyboard: J/K move · A approve · R reject · Enter open.`,
    `<button class="btn ghost" data-action="go" data-view="catalog">All Products →</button>`)
  + `<div class="btn-row">
      <button class="btn" data-action="run" data-name="dedupe-queue">${icon('broom')} Dedupe Clones</button>
      <button class="btn primary" data-action="rebuild-covers">${icon('sparkles')} Rebuild Covers</button>
      <button class="btn red" data-action="confirm" data-confirm="run:reject-trash" data-message="Reject ALL pending drafts? Approved and listed products are safe.">${icon('trash')} Reject All Trash</button>
      <button class="btn green" data-action="confirm" data-confirm="run:approve-all" data-message="Approve every pending product?">${icon('check')} Approve All</button>
    </div>
    ${slice.length ? `<div class="rows">${rows}</div>${pager(items.length, page, per, 'review-page')}`
      : empty('✅ Review queue is clear.')}`;
}

// ═══════════════════════════════════════════════════════════════════════
// 4 · DISCOVERY & OPPORTUNITY (surfaces orphaned backend)
// ═══════════════════════════════════════════════════════════════════════
export function discovery(s) {
  const q = s.searchQueue || {};
  const queue = q.queue || [];
  const sources = q.sources || {};
  const opp = s.opportunity || {};
  const radar = s.radarHealth || {};
  const radarSources = radar.sources || {};
  const niches = s.passionNiches || [];

  const sourceRow = (label, info) => {
    const ok = info && (info.ok === true || info.ok === undefined);
    const last = info && info.lastSuccess ? timeAgo(info.lastSuccess) : 'never';
    return `<div class="conn ${ok ? 'ok' : 'bad'}"><span class="dv"></span>
      <span class="cx">${esc(label)}</span><span class="hint">${ok ? 'ok' : 'failing'} · ${esc(last)}</span></div>`;
  };

  const queueRows = queue.slice(0, 12).map(row => `<tr>
      <td>${esc(row.source)}</td>
      <td title="${esc(row.query)}">${esc(String(row.query || '').slice(0, 46))}</td>
      <td>${pill(row.status === 'done' ? 'approved' : row.status === 'error' ? 'rejected' : 'draft')}</td>
      <td class="num-r">${esc(row.attempts)}</td>
      <td class="hint">${esc(timeAgo(row.created_at))}</td>
    </tr>`).join('');

  // The scoring endpoint is per-phrase — it is never pre-loaded.
  const oppHtml = opp && opp.opportunity != null
    ? `<div class="trend" style="align-items:center">
        <span style="font-size:1.2rem">🎯</span>
        <div style="flex:1"><div class="nm">${esc(opp.phrase)}</div>
        <div class="mt">${esc([
          opp.volume != null ? `demand ${fmtNum(opp.volume)}` : '',
          opp.intent != null ? `intent ${opp.intent}` : '',
          opp.etsyCount != null ? `etsy listings ${fmtNum(opp.etsyCount)}` : '',
          opp.etsySaturation != null ? `saturation ${Math.round(opp.etsySaturation * 100)}%` : ''
        ].filter(Boolean).join(' · '))}</div></div>
        <span class="grade ${opp.opportunity >= 70 ? 'ACTIVATE' : opp.opportunity >= 45 ? 'WATCH' : 'SKIP'}">${esc(opp.opportunity)}</span>
      </div>
      <div class="mb14">${barRow('Opportunity score', opp.opportunity, 100, 'var(--teal)')}</div>`
    : `<div class="empty">Score any phrase to see live demand, buyer intent and Etsy saturation.</div>`;

  return head('🔭 Discovery & Opportunity', 'Live sources, the SERP search queue, Etsy saturation and the opportunity engine.',
    `<button class="btn primary" data-action="run" data-name="serp-scan">${icon('bolt')} SERP Scan</button>`)
  + `<div class="grid g3 mb14">
      ${kpi('Trends Tracked', fmtNum((s.overview && s.overview.counts && s.overview.counts.trends) || 0), `${fmtNum((s.overview && s.overview.counts && s.overview.counts.activeTrends) || 0)} activated`, 'vi')}
      ${kpi('Queue Jobs', fmtNum(queue.length), `${fmtNum(queue.filter(r => r.status === 'error').length)} errored`, 'am')}
      ${kpi('Radar Sources', fmtNum(Object.keys(radarSources).length), `${fmtNum(Object.values(radarSources).filter(v => v && v.ok === false).length)} failing`, 'tc')}
    </div>
    <div class="grid g2 mb14">
      <div class="panel"><div class="panel-head">${icon('trends')} Opportunity Engine</div>
        <div class="panel-body">
          <div class="btn-row">
            <input id="opp-q" placeholder="e.g. wedding budget spreadsheet" aria-label="Phrase to score"
              value="${esc(opp && opp.phrase || '')}">
            <button class="btn primary sm" data-action="opp-score">${icon('bolt')} Score</button>
          </div>
          ${oppHtml}
        </div></div>
      <div class="panel"><div class="panel-head">${icon('discovery')} Source Health</div>
        <div class="panel-body">
          ${Object.keys(radarSources).length
            ? Object.entries(radarSources).slice(0, 10).map(([k, v]) => sourceRow(k, v)).join('')
            : '<div class="empty">No radar health reported yet.</div>'}
        </div></div>
    </div>
    <div class="grid g2">
      <div class="panel"><div class="panel-head">${icon('clock')} SERP Queue <span class="sp"></span>
        <button class="btn ghost sm" data-action="run" data-name="drain-search-queue">Drain</button></div>
        <div class="panel-body tight">
          ${queueRows ? `<table class="data"><thead><tr><th>Source</th><th>Query</th><th>Status</th><th class="num-r">Try</th><th>When</th></tr></thead><tbody>${queueRows}</tbody></table>`
            : '<div class="empty">Queue is empty.</div>'}
        </div></div>
      <div class="panel"><div class="panel-head">${icon('sparkles')} Passion Niches</div>
        <div class="panel-body">
          <div class="btn-row">
            <input id="passion-input" placeholder="Add a niche you care about…" aria-label="New passion niche">
            <button class="btn primary sm" data-action="passion-add">${icon('plus')} Add</button>
          </div>
          <div class="flex" style="flex-wrap:wrap;gap:6px">
            ${niches.length ? niches.map(n => `<span class="tag">${esc(n)} <button class="btn ghost sm" style="padding:0 4px;border:none;background:none" data-action="passion-remove" data-niche="${esc(n)}" title="Remove">✕</button></span>`).join('')
              : '<span class="hint">No passion niches yet. Adding one biases generation toward it.</span>'}
          </div>
          <button class="btn ghost sm mt14" data-action="run" data-name="sweep">${icon('refresh')} Sweep now</button>
        </div></div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════
// 5 · TRENDS
// ═══════════════════════════════════════════════════════════════════════
export function trends(s) {
  const rows = (s.trends || []).slice(0, 60);
  const act = rows.filter(t => (t.grade || t.verdict) === 'ACTIVATE').length;
  const watch = rows.filter(t => (t.grade || t.verdict) === 'WATCH').length;

  const list = rows.map(t => {
    const grade = String(t.grade || t.verdict || 'WATCH').toUpperCase();
    const safeGrade = ['ACTIVATE', 'WATCH', 'SKIP'].includes(grade) ? grade : 'WATCH';
    return `<div class="trend">
      <span style="font-size:1.3rem">${esc(t.emoji || '🔥')}</span>
      <div style="flex:1;min-width:0">
        <div class="nm">${esc(t.name)}</div>
        <div class="mt">${esc([t.source, t.velocity, t.window ? `win ${t.window}d` : '', t.est_revenue].filter(Boolean).join(' · '))}</div>
      </div>
      <span class="grade ${safeGrade}">${esc(safeGrade)}</span>
      <button class="btn ghost sm" data-action="trend-vet" data-id="${t.id}">${icon('eye')} Vet</button>
      <button class="btn ghost sm" data-action="trend-dismiss" data-id="${t.id}" title="Dismiss">${icon('x')}</button>
      <button class="btn ghost sm" data-action="trend-archive" data-id="${t.id}" title="Archive">${icon('box')}</button>
      <button class="btn green sm" data-action="trend-activate" data-id="${t.id}" ${t.activated ? 'disabled' : ''}>${icon('check')} Activate</button>
      <button class="btn primary sm" data-action="trend-generate" data-id="${t.id}">${icon('sparkles')} Generate</button>
    </div>`;
  }).join('');

  return head('🔥 Trend Radar', 'Live discovery + multi-signal vetting. Activate a niche to lock its window.',
    `<button class="btn green" data-action="make-this">${icon('sparkles')} Make this…</button>
     <button class="btn primary" data-action="run" data-name="sweep">${icon('discovery')} Sweep</button>`)
  + `<div class="kpis mb14">
      ${kpi('Tracked', fmtNum((s.overview && s.overview.counts && s.overview.counts.trends) || rows.length), '', 'vi')}
      ${kpi('ACTIVATE', fmtNum(act), 'ready to commit', 'gn')}
      ${kpi('WATCH', fmtNum(watch), 'monitor', 'am')}
    </div>
    ${rows.length ? list : empty('No trends yet — run a sweep or SERP scan.')}`;
}

// ═══════════════════════════════════════════════════════════════════════
// 6 · SOCIAL
// ═══════════════════════════════════════════════════════════════════════
export function social(s) {
  const posts = s.social || [];
  const listed = (s.products || []).filter(p => p.status === 'listed' || p.status === 'published');
  const platforms = ['pinterest', 'instagram', 'twitter', 'facebook', 'tiktok', 'linkedin'];

  const postRows = posts.map(p => {
    const color = p.status === 'posted' ? 'var(--green)' : p.status === 'cancelled' ? 'var(--red)' : 'var(--amber)';
    return `<div class="flex" style="padding:9px 12px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:7px">
      <span style="width:9px;height:9px;border-radius:50%;background:${color};flex-shrink:0"></span>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:.8rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(String(p.content || '').slice(0, 70))}…</div>
        <div class="hint">${esc(p.platform)} · ${esc(timeAgo(p.scheduledAt))} · ${esc(p.status)}</div>
      </div>
      ${p.status === 'scheduled' ? `<button class="btn red sm" data-action="social-cancel" data-id="${p.id}">Cancel</button>` : ''}
    </div>`;
  }).join('');

  return head('📱 Social Scheduler', 'Generate, preview, schedule and log posts across six platforms.',
    `<button class="btn primary" data-action="run" data-name="sync-sales">${icon('refresh')} Sync Sales</button>`)
  + `<div class="grid g2">
      <div class="panel"><div class="panel-head">${icon('calendar')} Scheduled Posts</div>
        <div class="panel-body" style="max-height:520px;overflow:auto">
          ${posts.length ? postRows : '<div class="empty">No posts scheduled yet.</div>'}
        </div></div>
      <div>
        <div class="panel mb14"><div class="panel-head">${icon('sparkles')} Generate A Post</div>
          <div class="panel-body">
            <select id="social-product" style="width:100%;margin-bottom:8px" aria-label="Product">
              <option value="">Select a listed product…</option>
              ${listed.map(p => `<option value="${p.id}">${esc(String(p.name || '').slice(0, 44))} (${esc(p.type)})</option>`).join('')}
            </select>
            <select id="social-platform" style="width:100%;margin-bottom:8px" aria-label="Platform">
              ${platforms.map(p => `<option value="${p}">${esc(titleCase(p))}</option>`).join('')}
            </select>
            <button class="btn primary" style="width:100%" data-action="social-generate">${icon('sparkles')} Generate &amp; Preview</button>
            <div class="btn-row mt8" style="margin-bottom:0">
              <button class="btn ghost sm" style="flex:1" data-action="social-batch">${icon('bolt')} Batch (all listed)</button>
            </div>
            <div id="social-preview" class="mt14"></div>
          </div></div>
        <div class="panel"><div class="panel-head">${icon('analytics')} Quick Stats</div>
          <div class="panel-body">
            <div class="flex-between mb8"><span class="hint">Scheduled</span><b>${fmtNum(posts.filter(p => p.status === 'scheduled').length)}</b></div>
            <div class="flex-between mb8"><span class="hint">Posted</span><b style="color:var(--green)">${fmtNum(posts.filter(p => p.status === 'posted').length)}</b></div>
            <div class="flex-between"><span class="hint">Listed products</span><b style="color:var(--teal)">${fmtNum(listed.length)}</b></div>
            <div class="hint mt14">“Post Now” records intent locally — it does not call platform APIs.</div>
          </div></div>
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════
// 7 · ADS
// ═══════════════════════════════════════════════════════════════════════
export function ads(s) {
  const a = s.ads || { budget: 0, spent: 0, remaining: 0, percentUsed: 0, activeRuns: 0, recentRuns: [] };
  const pct = Math.min(100, a.percentUsed || 0);
  const color = pct > 90 ? 'var(--red)' : pct > 70 ? 'var(--amber)' : 'var(--teal)';

  const runs = (a.recentRuns || []).map(r => {
    const c = r.status === 'active' ? 'var(--green)' : r.status === 'cancelled' ? 'var(--red)' : 'var(--muted)';
    return `<div class="flex" style="padding:8px 11px;background:var(--surface);border-radius:var(--radius-xs);margin-bottom:6px">
      <span style="width:8px;height:8px;border-radius:50%;background:${c}"></span>
      <div style="flex:1"><div style="font-weight:600;font-size:.8rem">${esc(r.name || 'Campaign')}</div>
      <div class="hint">${esc(r.platform)} · ${fmtMoney(r.amount)} · ${esc(r.status)}</div></div>
      ${r.status === 'active' ? `<button class="btn red sm" data-action="ad-cancel" data-id="${r.id}">Cancel</button>` : ''}
    </div>`;
  }).join('');

  return head('💰 Ad Spend Ledger', 'Manual budget tracking across platforms. This is a ledger — it is not wired to ad APIs.', '')
  + `<div class="kpis mb14">
      ${kpi('Monthly Budget', fmtMoney(a.budget), '', 'tc')}
      ${kpi('Spent', fmtMoney(a.spent), `${pct}% used`, pct > 90 ? 'rd' : 'am')}
      ${kpi('Remaining', fmtMoney(a.remaining), '', 'gn')}
      ${kpi('Active Campaigns', fmtNum(a.activeRuns), '', 'bl')}
    </div>
    <div class="bar tall mb14"><span style="width:${pct}%;background:${color}"></span></div>
    <div class="grid g2">
      <div class="panel"><div class="panel-head">${icon('plus')} Commit Spend</div>
        <div class="panel-body">
          <input id="ad-name" placeholder="Campaign name" style="width:100%;margin-bottom:8px">
          <select id="ad-platform" style="width:100%;margin-bottom:8px">
            ${['google', 'facebook', 'pinterest', 'tiktok'].map(p => `<option value="${p}">${esc(titleCase(p))}</option>`).join('')}
          </select>
          <input id="ad-amount" type="number" min="0" step="1" placeholder="Amount ($)" style="width:100%;margin-bottom:8px">
          <button class="btn primary" style="width:100%" data-action="ad-commit">${icon('bolt')} Commit Spend</button>
        </div></div>
      <div class="panel"><div class="panel-head">${icon('analytics')} Budget &amp; Campaigns</div>
        <div class="panel-body">
          <div class="flex mb14"><input id="budget-input" type="number" min="0" step="1" value="${esc(a.budget || 0)}" style="flex:1">
            <button class="btn" data-action="ad-budget">${icon('check')} Save budget</button></div>
          ${runs || '<div class="empty">No campaigns yet.</div>'}
        </div></div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════
// 8 · CALENDAR (+ seasonal overlay)
// ═══════════════════════════════════════════════════════════════════════
export function calendar(s) {
  const month = s.calendarMonth || new Date().toISOString().slice(0, 7);
  const cal = s.calendarData || { days: {}, posts: 0, products: 0, ads: 0 };
  const seasonal = s.seasonal || {};
  const [yy, mm] = month.split('-').map(Number);
  const daysInMonth = new Date(yy, mm, 0).getDate();
  const firstDay = new Date(yy, mm - 1, 1).getDay();
  const today = new Date().toISOString().slice(0, 10);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  let cells = '';
  for (let i = 0; i < firstDay; i++) cells += '<div></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${month}-${String(d).padStart(2, '0')}`;
    const dd = (cal.days || {})[key] || { posts: 0, products: 0, ads: 0 };
    const has = dd.posts || dd.products || dd.ads;
    cells += `<div class="cell ${has ? 'activity' : ''} ${key === today ? 'today' : ''}">
      <div class="d">${d}</div>
      ${dd.posts ? `<div class="ev" style="color:var(--amber)">📱 ${dd.posts}</div>` : ''}
      ${dd.products ? `<div class="ev" style="color:var(--teal)">📦 ${dd.products}</div>` : ''}
      ${dd.ads ? `<div class="ev" style="color:var(--green)">💰 ${dd.ads}</div>` : ''}
    </div>`;
  }

  const prev = mm === 1 ? `${yy - 1}-12` : `${yy}-${String(mm - 1).padStart(2, '0')}`;
  const next = mm === 12 ? `${yy + 1}-01` : `${yy}-${String(mm + 1).padStart(2, '0')}`;

  return head('📅 Content Calendar', 'Monthly activity — posts, published products and ad commits.',
    `<button class="btn ghost" data-action="go" data-view="home">← Overview</button>`)
  + `<div class="btn-row">
      <button class="btn sm" data-action="cal-month" data-month="${prev}">${icon('chevronLeft')} Prev</button>
      <b class="mono" style="font-size:.95rem">${esc(month)}</b>
      <button class="btn sm" data-action="cal-month" data-month="${next}">Next ${icon('chevronRight')}</button>
      <span class="sp" style="flex:1"></span>
      <span class="hint"><span style="color:var(--amber)">📱 ${fmtNum(cal.posts)} posts</span> ·
      <span style="color:var(--teal)">📦 ${fmtNum(cal.products)} products</span> ·
      <span style="color:var(--green)">💰 ${fmtNum(cal.ads)} ads</span></span>
    </div>
    ${seasonal.focus || seasonal.month || seasonal.name ? `<div class="panel mb14"><div class="panel-head">${icon('trends')} Seasonal Focus</div>
      <div class="panel-body"><div class="flex-between"><b>${esc(seasonal.focus || seasonal.name || 'Current focus')}</b>
      <span class="tag">${esc(seasonal.month || month)}</span></div>
      ${(seasonal.professions || []).length ? `<div class="hint mt8">${(seasonal.professions || []).map(p => esc(p.emoji + ' ' + p.name)).join(' · ')}</div>` : ''}
      </div></div>` : ''}
    <div class="cal">${dayNames.map(d => `<div class="hd">${d}</div>`).join('')}${cells}</div>`;
}

// ═══════════════════════════════════════════════════════════════════════
// 9 · ANALYTICS
// ═══════════════════════════════════════════════════════════════════════
export function analytics(s) {
  const a = s.analytics || {};
  const byType = Object.entries(a.byType || {}).sort((x, y) => y[1].listed - x[1].listed);
  const maxType = byType.length ? Math.max(...byType.map(([, d]) => d.total)) : 1;
  const niches = a.topNiches || [];

  const conv = a.conversion || {};
  const funnel = [['Draft', conv.draft || 0, 'var(--blue)'], ['Review', conv.review || 0, 'var(--amber)'],
    ['Approved', conv.approved || 0, 'var(--teal)'], ['Listed', conv.listed || 0, 'var(--green)']];

  // Real created-per-day series from product timestamps (no invented data).
  const perDay = {};
  for (const p of (s.products || [])) {
    const d = String(p.created_at || '').slice(0, 10);
    if (d) perDay[d] = (perDay[d] || 0) + 1;
  }
  const series = Object.keys(perDay).sort().slice(-24).map(k => perDay[k]);

  const winners = [...(s.products || [])].filter(p => p.status === 'listed' || p.status === 'published').slice(0, 6);
  const duds = [...(s.products || [])].filter(p => p.status === 'rejected').slice(0, 6);

  return head('📊 Sales Analytics', 'Revenue by type and niche, conversion funnel, and what to scale or retire.', '')
  + `<div class="kpis mb14">
      ${kpi('Total Products', fmtNum(a.totalProducts), '', 'tc')}
      ${kpi('Listed', fmtNum((a.conversion || {}).listed), '', 'gn')}
      ${kpi('Catalog Value', fmtMoney(a.totalRevenue), 'sum of listed prices', 'gn')}
      ${kpi('Avg Price', fmtMoney(a.avgPrice), '', 'bl')}
    </div>
    <div class="panel mb14"><div class="panel-head">${icon('analytics')} Products Created Per Day <span class="sp"></span><span class="hint">last ${series.length} active days</span></div>
      <div class="panel-body">${sparkline(series)}</div></div>
    ${(() => {
      // Real revenue time-series + listing health from the BI service.
      const bi = s.bi || {};
      const row = bi.series || [];
      const lh = bi.listing || {};
      const revVals = row.map(d => d.revenue);
      const revTotal = revVals.reduce((a, b) => a + (Number(b) || 0), 0);
      const badges = lh.badges || {};
      const weak = lh.weakestSeo || [];
      const zero = lh.zeroSale || [];
      const badgeChip = (label, n, color) => `<span class="chip" style="border-color:${color};color:${color}">${esc(label)} ${fmtNum(n)}</span>`;
      return `
    <div class="panel mb14"><div class="panel-head">${icon('trends')} Real Revenue <span class="sp"></span>
      <span class="hint">${fmtMoney(revTotal)} across last 14 days · ${fmtNum(lh.sales7d || 0)} sales this week</span></div>
      <div class="panel-body">${row.length ? sparkline(revVals) : '<div class="empty">not enough data yet</div>'}
        <div class="flex mt8" style="gap:8px;flex-wrap:wrap">
          ${badgeChip('Hot', badges.hot || 0, 'var(--green)')}
          ${badgeChip('Rising', badges.rising || 0, 'var(--teal)')}
          ${badgeChip('Stable', badges.stable || 0, 'var(--amber)')}
          ${badgeChip('Watch', badges.watch || 0, 'var(--muted)')}
          <span class="hint">${fmtNum(lh.zeroSaleCount || 0)} listed with zero views</span>
        </div></div></div>
    ${(weak.length || zero.length) ? `<div class="grid g2 mb14">
      <div class="panel"><div class="panel-head">${icon('search')} SEO Weakness <span class="sp"></span><span class="hint">from seoEngine</span>
        ${weak.length ? `<button class="btn primary sm" data-action="optimize-weak">${icon('sparkles')} Optimize all weak</button>` : ''}</div>
        <div class="panel-body tight">${weak.length ? `<table class="data"><thead><tr><th>Listing</th><th class="num-r">Score</th><th class="num-r">Tags</th><th></th></tr></thead>
          <tbody>${weak.map(w => `<tr><td>${esc(w.name)}</td><td class="num-r" style="color:${w.score >= 70 ? 'var(--amber)' : 'var(--red)'}">${fmtNum(w.score)}</td><td class="num-r">${fmtNum(w.tagCount)}/13</td><td class="num-r"><button class="btn ghost sm" data-action="optimize-product" data-id="${w.id}">Optimize</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty">All listed products score well.</div>'}</div></div>
      <div class="panel"><div class="panel-head">${icon('catalog')} Zero-View Listings <span class="sp"></span><span class="hint">listed, no impressions yet</span></div>
        <div class="panel-body tight">${zero.length ? `<table class="data"><thead><tr><th>Listing</th><th class="num-r">Days</th></tr></thead>
          <tbody>${zero.map(z => `<tr><td>${esc(z.name)}</td><td class="num-r">${fmtNum(z.daysListed)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Every listing has impressions.</div>'}</div></div>
    </div>` : ''}`;
    })()}
    <div class="panel mb14"><div class="panel-head">${icon('layers')} Conversion Funnel</div>
      <div class="panel-body"><div class="grid g4">
        ${funnel.map(([label, n, color]) => `<div style="text-align:center">
          <div style="font-size:1.5rem;font-weight:800;color:${color}" class="mono">${fmtNum(n)}</div>
          <div class="hint">${esc(label)}</div></div>`).join('')}
      </div></div></div>
    <div class="grid g2">
      <div class="panel"><div class="panel-head">${icon('catalog')} Revenue By Type</div>
        <div class="panel-body">${byType.length ? byType.slice(0, 10).map(([t, d]) => barRow(t, d.total, maxType, 'var(--grad)')).join('') : '<div class="empty">No data.</div>'}</div></div>
      <div class="panel"><div class="panel-head">${icon('trends')} Top Niches</div>
        <div class="panel-body tight">
          ${niches.length ? `<table class="data"><thead><tr><th>Niche</th><th class="num-r">Total</th><th class="num-r">Listed</th></tr></thead>
            <tbody>${niches.slice(0, 12).map(n => `<tr><td>${esc(n.name)}</td><td class="num-r">${fmtNum(n.total)}</td><td class="num-r" style="color:var(--green)">${fmtNum(n.listed)}</td></tr>`).join('')}</tbody></table>`
            : '<div class="empty">No data.</div>'}
        </div></div>
    </div>
    <div class="grid g2 mt14">
      <div class="panel"><div class="panel-head">${icon('rocket')} Winners To Scale</div>
        <div class="panel-body">${winners.length ? winners.map(p => `<div class="flex-between mb8"><span style="font-size:.8rem">${esc(String(p.name).slice(0, 46))}</span><span class="pr">${esc(p.price || '')}</span></div>`).join('') : '<div class="empty">Nothing listed yet.</div>'}</div></div>
      <div class="panel"><div class="panel-head">${icon('trash')} Duds To Retire</div>
        <div class="panel-body">${duds.length ? duds.map(p => `<div class="flex-between mb8"><span style="font-size:.8rem">${esc(String(p.name).slice(0, 46))}</span>${pill('rejected')}</div>`).join('') : '<div class="empty">No rejected products.</div>'}</div></div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════
// 10 · AUTOMATION
// ═══════════════════════════════════════════════════════════════════════
export function automation(s) {
  const eng = s.overview ? s.overview.engine || {} : {};
  const st = s.autoStatus || {};
  // Truthful engine state: auto_generate off means the cron may tick but
  // nothing is ever generated — display "Halted", not "Live".
  const running = !!(s.overview && s.overview.engine && s.overview.engine.running);
  const cronOnly = !running && !!eng.cronScheduled && eng.autoGenerate === false;

  return head('⚙️ Automation', 'Discovery sweep every 2h · full cycle every 6h · review gate every 2 days.', '')
  + `<div class="kpis mb14">
      ${kpi('Engine', running ? 'Live' : cronOnly ? 'Halted' : 'Idle', running ? 'cron + generation on' : cronOnly ? 'auto_generate is OFF' : 'cron not scheduled', running ? 'gn' : 'am')}
      ${kpi('Cycle', eng.cycleBusy ? 'Running' : 'Idle', '6h cadence', eng.cycleBusy ? 'vi' : 'tc')}
      ${kpi('Discovery', eng.discoveryBusy ? 'Running' : 'Idle', '2h cadence', eng.discoveryBusy ? 'vi' : 'tc')}
      ${kpi('Review Gate', eng.isReviewDay ? 'UP' : 'Open', 'every 2 days', eng.isReviewDay ? 'am' : 'gn')}
      ${kpi('Auto-List', eng.autoList ? 'On' : 'Off', 'approved → live', eng.autoList ? 'gn' : '')}
    </div>
    <div class="btn-row">
      <button class="btn primary" data-action="run" data-name="full-cycle">${icon('play')} Run Full Cycle Now</button>
      <button class="btn primary" data-action="run" data-name="sweep">${icon('discovery')} Run Discovery Sweep</button>
      <button class="btn" data-action="auto-list-toggle">${icon('refresh')} Toggle Auto-List (${eng.autoList ? 'ON' : 'OFF'})</button>
      <button class="btn" data-action="scheduler" data-mode="start">${icon('play')} Start Scheduler</button>
      <button class="btn red" data-action="scheduler" data-mode="stop">${icon('stop')} Stop Scheduler</button>
      <span class="sp" style="flex:1"></span>
      <span class="hint">pending ${fmtNum(st.pendingCount || 0)}${st.lastRun ? ` · last run ${esc(timeAgo(st.lastRun))}` : ''}</span>
    </div>
    <div class="grid g2 mb14">
      <div class="panel"><div class="panel-head">${icon('marketplace')} Daily Publish Caps <span class="sp"></span><span class="hint">Gumroad 10 · Etsy 20 by default</span></div>
        <div class="panel-body">
          <div class="flex mb8" style="gap:8px;align-items:flex-end">
            <label class="hint" style="flex:1">Gumroad / day
              <input id="cap-gumroad" type="number" min="1" max="50" value="${esc((s.caps && s.caps.gumroad && s.caps.gumroad.limit) || 10)}" style="width:100%"></label>
            <label class="hint" style="flex:1">Etsy / day
              <input id="cap-etsy" type="number" min="1" max="50" value="${esc((s.caps && s.caps.etsy && s.caps.etsy.cap) || 20)}" style="width:100%"></label>
            <button class="btn green" data-action="cap-save">${icon('check')} Save caps</button>
          </div>
          <div class="hint">Gumroad hard-caps product creation (~10/day) — a higher number here won't create more there. Listing copy edits from the optimizer are updates, not creates, and never consume these caps.</div>
        </div>
      </div>
    </div>
    <div class="panel"><div class="panel-head">${icon('clock')} Activity Log <span class="sp"></span><span class="hint">live</span></div>
      <div class="panel-body"><div class="logs" style="max-height:520px">${activityRows(s.activity, 40)}</div></div></div>`;
}

// ═══════════════════════════════════════════════════════════════════════
// 11 · MARKETPLACE
// ═══════════════════════════════════════════════════════════════════════
export function marketplace(s) {
  const setup = s.setup || {};
  const etsySet = setup.etsy || {};
  const gumSet = setup.gumroad || {};
  const etsy = s.overview ? s.overview.etsy || {} : {};
  const listed = (s.products || []).filter(p => p.status === 'listed' || p.status === 'published');
  const byMarket = k => listed.filter(p => p.marketplace === k).length;
  const good = x => !!(x && (x.connected || x.configured));
  const news = s.newsletter || null;

  return head('🏪 Marketplace', 'Publish, watch quotas, and keep store credentials healthy.',
    `<a class="btn ghost" href="/setup" target="_blank" rel="noopener">${icon('external')} Setup</a>`)
  + `<div class="grid g2 mb14">
      <div class="panel"><div class="panel-head">${icon('marketplace')} Connections</div>
        <div class="panel-body">
          <div class="conn ${good(etsySet) ? 'ok' : 'bad'}"><span class="dv"></span><span class="cx">Etsy</span>
            <span class="hint">${esc(etsySet.connected ? 'connected' : etsySet.configured ? 'keys set, needs auth' : 'not configured')}</span></div>
          <div class="conn ${good(gumSet) ? 'ok' : 'bad'}"><span class="dv"></span><span class="cx">Gumroad</span>
            <span class="hint">${esc(gumSet.connected ? 'ready' : gumSet.configured ? 'configured' : 'not configured')}</span></div>
          <div class="conn ${s.overview && s.overview.model && s.overview.model.enabled ? 'ok' : 'bad'}"><span class="dv"></span><span class="cx">AI Layer</span>
            <span class="hint">${esc((s.overview && s.overview.model && s.overview.model.diagnosis) || 'unknown')}</span></div>
        </div></div>
      <div class="panel"><div class="panel-head">${icon('analytics')} Publishing Quota</div>
        <div class="panel-body">
          ${gauge(etsy.cap ? Math.round((etsy.published / etsy.cap) * 100) : 0, `${etsy.published || 0} / ${etsy.cap || 10}`)}
          <div class="hint mt8">${fmtNum(etsy.remaining || 0)} Etsy listings remaining today · Gumroad caps creation at 10/day.</div>
        </div></div>
    </div>
    <div class="btn-row">
      <button class="btn green" data-action="run" data-name="push-bundles">${icon('box')} Deploy Bundles</button>
      <button class="btn primary" data-action="run" data-name="lead-magnet">${icon('rocket')} Lead Magnet</button>
      <button class="btn" data-action="run" data-name="sync-sales">${icon('refresh')} Sync Sales</button>
    </div>
    <div class="grid g2 mb14">
      ${kpi('Listed (Etsy)', fmtNum(byMarket('etsy')), '', 'gn')}
      ${kpi('Listed (Gumroad)', fmtNum(byMarket('gumroad')), '', 'gn')}
    </div>
    <div class="panel"><div class="panel-head">${icon('social')} Weekly Newsletter <span class="sp"></span>
      <button class="btn ghost sm" data-action="newsletter-load">${icon('refresh')} Generate</button></div>
      <div class="panel-body">
        ${news ? `<div class="mb8"><b>${esc(news.subject)}</b></div>
          <pre class="hint" style="white-space:pre-wrap;font-family:var(--sans);max-height:240px;overflow:auto">${esc(news.body)}</pre>
          <button class="btn sm mt8" data-action="newsletter-copy">Copy to clipboard</button>`
          : '<div class="empty">Generate the weekly digest to preview it.</div>'}
      </div></div>`;
}

// ═══════════════════════════════════════════════════════════════════════
// 12 · SYSTEM & READINESS
// ═══════════════════════════════════════════════════════════════════════
export function system(s) {
  const ready = s.readiness || { issues: [], summary: {} };
  const model = s.modelStatus || {};
  const payments = s.payments || {};
  const branding = s.branding || {};
  const issues = ready.issues || [];
  const sev = { error: 'rd', warning: 'am', info: 'bl' };

  return head('🛡 System & Readiness', 'Launch blockers, credentials, AI layer and database operations.', '')
  + `<div class="grid g2 mb14">
      <div class="panel"><div class="panel-head">${icon('shield')} Launch Readiness <span class="sp"></span>
        <span class="pill ${ready.ok ? 'st-approved' : 'st-rejected'}"><span class="dot"></span>${ready.ok ? 'no blockers' : 'blockers'}</span></div>
        <div class="panel-body">
          ${issues.length ? issues.map(i => `<div class="mb8" style="font-size:.78rem;color:var(--${i.severity === 'error' ? 'red' : i.severity === 'warning' ? 'amber' : 'blue'})">
            ${i.severity === 'error' ? '✕' : i.severity === 'warning' ? '⚠' : 'ℹ'} ${esc(i.message)}</div>`).join('')
            : '<div class="hint" style="color:var(--green)">Everything configured.</div>'}
        </div></div>
      <div class="panel"><div class="panel-head">${icon('brain')} AI Layer</div>
        <div class="panel-body">
          <div class="flex-between mb8"><span class="hint">Enabled</span><b style="color:var(--${model.enabled ? 'green' : 'amber'})">${model.enabled ? 'yes' : 'no'}</b></div>
          <div class="flex-between mb8"><span class="hint">Key well-formed</span><b>${model.keyShape ? (model.keyShape.wellFormed ? 'yes' : 'no') : '—'}</b></div>
          <div class="flex-between mb8"><span class="hint">Diagnosis</span><span class="hint">${esc(model.diagnosis || '—')}</span></div>
          <div class="flex-between"><span class="hint">Models</span><span class="hint">${esc(model.models ? `${model.models.scan} / ${model.models.judge}` : '—')}</span></div>
        </div></div>
    </div>
    <div class="grid g2 mb14">
      <div class="panel"><div class="panel-head">${icon('db')} Database</div>
        <div class="panel-body">
          <div class="hint mb8">The SQLite file is the business. Back it up before risky operations.</div>
          <button class="btn primary" data-action="run" data-name="backup-database">${icon('download')} Backup Database</button>
          <div class="hint mt8">Backups are written to <span class="mono">runtime/backups/</span>.</div>
        </div></div>
      <div class="panel"><div class="panel-head">${icon('marketplace')} Payments &amp; Branding</div>
        <div class="panel-body">
          <div class="flex-between mb8"><span class="hint">Stripe</span><b>${esc(payments.configured ? 'configured' : 'not configured')}</b></div>
          <div class="flex-between mb8"><span class="hint">Branding assets</span><b>${esc(branding.ok === false ? 'incomplete' : branding.status || 'synced')}</b></div>
          <div class="hint mt8">${esc(payments.note || 'Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to enable direct checkout.')}</div>
        </div></div>
    </div>
    <div class="panel"><div class="panel-head">${icon('command')} Run History</div>
        <div class="panel-body tight">
          ${(s.runs || []).length ? `<table class="data"><thead><tr><th>Action</th><th>Status</th><th>Started</th><th>Result</th></tr></thead><tbody>
            ${s.runs.slice(0, 15).map(r => `<tr><td>${esc(r.label || r.action)}</td><td>${esc(r.status)}</td>
              <td class="hint">${esc(timeAgo(r.started_at))}</td>
              <td class="hint" title="${esc(r.error || r.result || '')}">${esc(String(r.error || r.result || '').slice(0, 60))}</td></tr>`).join('')}
          </tbody></table>` : '<div class="empty">No runs recorded yet.</div>'}
        </div></div>`;
}

export const VIEWS = { home, catalog, review, discovery, trends, social, ads, calendar, analytics, automation, marketplace, system };
