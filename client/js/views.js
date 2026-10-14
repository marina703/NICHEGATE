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
  // The landing page is pinned above the job groups — the session starts
  // here, so it should never hide at the bottom of a group.
  { group: 'top', view: 'home', label: 'Briefing', icon: 'home' },

  { group: 'work', view: 'review', label: 'Review', icon: 'review', badge: 'review' },
  { group: 'work', view: 'catalog', label: 'Catalog', icon: 'catalog' },

  { group: 'research', view: 'trends', label: 'Trends', icon: 'trends' },
  { group: 'research', view: 'discovery', label: 'Discovery', icon: 'discovery' },
  { group: 'research', view: 'analytics', label: 'Analytics', icon: 'analytics' },

  { group: 'ops', view: 'automation', label: 'Automation', icon: 'automation', badge: 'busy' },
  { group: 'ops', view: 'marketplace', label: 'Market', icon: 'marketplace' },
  { group: 'ops', view: 'system', label: 'System', icon: 'system', badge: 'blockers' },
  { group: 'ops', view: 'social', label: 'Social', icon: 'social' },
  { group: 'ops', view: 'ads', label: 'Ads', icon: 'ads' },
  { group: 'ops', view: 'calendar', label: 'Calendar', icon: 'calendar' }
];

export const CRUMBS = {
  home: 'Briefing', catalog: 'Catalog', review: 'Review',
  discovery: 'Discovery', trends: 'Trends', social: 'Social',
  ads: 'Ads', calendar: 'Calendar', analytics: 'Analytics',
  automation: 'Automation', marketplace: 'Market', system: 'System'
};

// ── shared fragments ───────────────────────────────────────────────────
function pill(status) {
  const label = String(status || 'draft').replace(/_/g, ' ').replace(/-/g, ' ');
  return `<span class="pill ${statusPillClass(status)}"><span class="dot"></span>${esc(label)}</span>`;
}
function kpi(label, value, sub, cls, view, status) {
  const inner = `<div class="lb">${esc(label)}</div><div class="num">${esc(value)}</div>${sub ? `<div class="sb">${esc(sub)}</div>` : ''}`;
  if (!view) return `<div class="kpi ${cls || ''}">${inner}</div>`;
  return `<button class="kpi ${cls || ''} clickable" data-action="kpi-go" data-view="${view}"${status ? ` data-status="${status}"` : ''} title="Open ${esc(view)}">${inner}</button>`;
}
function head(title, desc, rightHtml) {
  return `<div class="view-head"><div><h2>${esc(title)}</h2><div class="desc">${esc(desc)}</div></div><div class="sp"></div>${rightHtml || ''}</div>`;
}
function empty(msg) { return `<div class="panel"><div class="empty">${esc(msg)}</div></div>`; }
function img(p) {
  if (p && p.id != null) {
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

// ── priority brain (shared: home cards + command bar answers) ─────────────
function parseWhen(v) {
  const t = new Date(String(v || '').replace(' ', 'T') + 'Z').getTime();
  return Number.isFinite(t) ? t : null;
}
// A trend window is time-boxed: detected_at + `window` days. Returns the
// remaining days (null when the trend carries no window data) so cards can
// show real urgency instead of an unbounded list item.
export function trendWindow(t) {
  const total = Number(t && t.window) || 0;
  const start = parseWhen(t && (t.first_seen_at || t.detected_at));
  if (!total || !start) return null;
  const end = start + total * 24 * 60 * 60 * 1000;
  return { total, daysLeft: Math.ceil((end - Date.now()) / (24 * 60 * 60 * 1000)) };
}
export function activeTrendWindows(s) {
  return (s.trends || [])
    .filter(t => (t.grade || t.verdict) === 'ACTIVATE')
    .sort((a, b) => (Number(b.velocity_pct) || 0) - (Number(a.velocity_pct) || 0));
}
// The ordered answer to "what should I work on now?". home() renders the
// first cards; the command bar answers "what should I do?" from the same
// list — one brain, so the two can never disagree.
export function pickPriority(s) {
  const out = [];
  const queue = reviewQueue(s.products || []);
  if (queue.length) out.push({ kind: 'review', count: queue.length, label: 'clear the review queue', view: 'review' });
  const windows = activeTrendWindows(s);
  if (windows.length) out.push({ kind: 'trends', count: windows.length, label: 'commit to an open trend window', view: 'trends' });
  const lh = (s.bi && s.bi.listing) || {};
  const weak = (lh.weakestSeo || []).length + (lh.zeroSale || []).length;
  if (weak) out.push({ kind: 'weak', count: weak, label: 'fix weak / zero-view listings', view: 'analytics' });
  out.push({ kind: 'growth', count: 0, label: 'keep the flywheel moving', view: 'marketplace' });
  return out;
}

// ── shared UI atoms: AI spark + multi-select bars + boss channel ────────
// The 💡 spark hands the AI worker the exact product/trend the operator
// means ("this one"), so they never have to name it in the prompt.
export function sparkBtn(kind, id, label = '') {
  return `<button class="btn ghost sm ai-spark" data-action="ai-ref" data-kind="${kind}" data-id="${esc(String(id))}" title="💡 Ask the AI about this${label ? ' — ' + esc(label) : ''}">💡</button>`;
}

// One selection bar for every list surface (home, review, catalog, trends,
// social, ads, discovery). Product/trend selection is global per kind; post/
// ad/niche rows share one misc set keyed "kind:id". Pick anywhere, act anywhere.
export function selBar(s, kind = 'product', allIds = []) {
  const isTrend = kind === 'trend';
  const isProduct = kind === 'product';
  const set = isTrend ? (s.selectedTrends || new Set()) : isProduct ? (s.selected || new Set()) : (s.selectedMisc || new Set());
  const keys = allIds.map(id => (isProduct || isTrend) ? Number(id) : `${kind}:${id}`);
  // misc kinds share one set across kinds — count only this kind's rows
  const n = (isProduct || isTrend) ? set.size : [...set].filter(k => k.startsWith(kind + ':')).length;
  const allSel = keys.length && keys.every(k => set.has(k));
  const dis = n ? '' : 'disabled';
  const acts = isTrend
    ? `<button class="btn green sm" data-action="trend-batch" data-do="generate" ${dis}>${icon('sparkles')} Generate (${n})</button>
       <button class="btn sm" data-action="trend-batch" data-do="activate" ${dis}>Activate (${n})</button>
       <button class="btn red sm" data-action="trend-batch" data-do="dismiss" ${dis}>Dismiss (${n})</button>`
    : isProduct
    ? `<button class="btn sm" data-action="batch-covers" ${dis}>${icon('sparkles')} Covers (${n})</button>
       <button class="btn green sm" data-action="batch" data-status="approved" ${dis}>Approve (${n})</button>
       <button class="btn primary sm" data-action="batch" data-status="listed" ${dis}>List (${n})</button>
       <button class="btn red sm" data-action="batch" data-status="rejected" ${dis}>Reject (${n})</button>`
    : kind === 'niche'
    ? `<button class="btn green sm" data-action="misc-batch" data-kind="niche" data-do="generate" ${dis}>${icon('sparkles')} Generate (${n})</button>
       <button class="btn red sm" data-action="misc-batch" data-kind="niche" data-do="remove" ${dis}>Remove (${n})</button>`
    : `<button class="btn red sm" data-action="misc-batch" data-kind="${kind}" data-do="cancel" ${dis}>Cancel (${n})</button>`;
  const allAct = isTrend ? 'trend-select-all' : isProduct ? 'select-all' : 'misc-select-all';
  const clearAct = isTrend ? 'trend-clear' : isProduct ? 'clear-selection' : 'misc-clear';
  return `<div class="selbar">
    <button class="btn ghost sm" data-action="${allAct}" data-kind="${kind}" data-ids="${esc(allIds.join(','))}" data-keys="${keys.map(k => encodeURIComponent(String(k))).join(',')}">${allSel ? 'Deselect all' : 'Select all'}</button>
    <button class="btn ghost sm" data-action="${clearAct}" data-kind="${kind}" ${dis}>Clear (${n})</button>
    ${acts}
    <button class="btn amber sm" data-action="ai-ask" data-kind="${kind}" ${dis}>💡 Ask AI (${n})</button>
  </div>`;
}

// Boss inbox — the worker/surrogate asks, the boss answers, and an answer
// that carries an action executes through the confirmed-tool path.
export function askCard(a) {
  const opts = a.options || [];
  return `<div class="ask-card mb10">
    <div class="flex-between"><b style="font-size:.85rem">🤖 ${esc(a.question)}</b>
      <span class="hint">${a.source === 'steward' ? 'surrogate' : 'worker'} · ${esc(timeAgo(a.created_at))}</span></div>
    ${a.detail ? `<div class="hint mt8">${esc(a.detail)}</div>` : ''}
    <div class="btn-row mt8" style="margin-bottom:0">
      ${opts.map((o, i) => `<button class="btn ${o.action ? 'green' : ''} sm" data-action="ask-answer" data-id="${a.id}" data-opt="${i}">${esc(o.label)}</button>`).join('')}
      <button class="btn ghost sm" data-action="ask-answer" data-id="${a.id}" data-free="1">Reply…</button>
      <button class="btn ghost sm" data-action="ask-dismiss" data-id="${a.id}">Dismiss</button>
    </div>
  </div>`;
}

export function bossInbox(s) {
  const asks = (s.asks || []).filter(a => a.status === 'pending');
  if (!asks.length) return '';
  return `<div class="panel mb14" style="border-left:3px solid var(--amber)">
    <div class="panel-head" style="padding-left:14px">${icon('bell')} Boss inbox <span class="sp"></span>
      <span class="hint">your worker/surrogate is asking — answering runs the decision</span></div>
    <div class="panel-body">${asks.map(askCard).join('')}</div>
  </div>`;
}

export function bossChannelPanel(s) {
  const ws = s.workerStatus || {};
  return `<div class="panel"><div class="panel-head">${icon('bell')} Boss channel &amp; surrogate</div>
    <div class="panel-body">
      <div class="flex-between mb8"><span class="hint">Discord webhook</span><b style="color:var(--${ws.discordConfigured ? 'green' : 'amber'})">${ws.discordConfigured ? 'connected' : 'not set'}</b></div>
      <div class="flex-between mb8"><span class="hint">Proactive surrogate</span><b style="color:var(--${ws.stewardEnabled ? 'green' : 'amber'})">${ws.stewardEnabled ? 'on · pings at most 1/6h' : 'off'}</b></div>
      <div class="flex-between mb8"><span class="hint">Stored memories</span><b>${fmtNum(ws.memories || 0)}</b></div>
      <div class="flex mt8" style="gap:6px">
        <input id="hook-input" placeholder="https://discord.com/api/webhooks/…" style="flex:1" aria-label="Discord webhook URL">
        <button class="btn sm" data-action="webhook-save">Save</button>
      </div>
      <div class="btn-row mt8" style="margin-bottom:0">
        <button class="btn primary sm" data-action="notify-test">Test ping</button>
        <button class="btn sm" data-action="steward-run">Run surrogate pass</button>
        <button class="btn ghost sm" data-action="steward-toggle">${ws.stewardEnabled ? 'Pause surrogate' : 'Enable surrogate'}</button>
      </div>
      <div class="hint mt8">"Hey boss…" lands on Discord when the engine has an idea — a closing trend window, a queue backup, a product run worth building. Answers land in the Boss inbox.</div>
    </div></div>`;
}

export function memoryPanel(s) {
  const mems = s.memories || [];
  return `<div class="panel"><div class="panel-head">${icon('brain')} Worker memory <span class="sp"></span>
      <span class="hint">persistent — rides in every AI turn</span></div>
    <div class="panel-body tight">
      <div class="flex mb10" style="gap:6px">
        <input id="mem-input" placeholder="Teach the worker: “boss prefers wellness niches”…" style="flex:1" aria-label="New memory">
        <select id="mem-kind" aria-label="Memory kind">${['note', 'fact', 'preference', 'decision'].map(k => `<option value="${k}">${k}</option>`).join('')}</select>
        <button class="btn green sm" data-action="memory-add">Remember</button>
      </div>
      ${mems.length ? mems.slice(0, 20).map(m => `<div class="mem-row">
        <span class="hint mono">${esc(m.kind)}</span>
        <span style="flex:1;font-size:.78rem">${m.pinned ? '📌 ' : ''}${esc(m.content)}</span>
        <button class="btn ghost sm" data-action="memory-pin" data-id="${m.id}" data-pinned="${m.pinned ? 0 : 1}" title="${m.pinned ? 'Unpin' : 'Pin (always in the prompt)'}">${m.pinned ? '📌' : '📍'}</button>
        <button class="btn ghost sm" data-action="memory-del" data-id="${m.id}" title="Forget">✕</button>
      </div>`).join('') : '<div class="empty">No memories yet — the worker learns as it works; teach it anything here.</div>'}
    </div></div>`;
}

export function askPanel(s) {
  const asks = s.asks || [];
  return `<div class="panel mb14"><div class="panel-head">${icon('list')} Boss inbox — all asks <span class="sp"></span>
      <span class="hint">worker &amp; surrogate questions, newest first</span></div>
    <div class="panel-body">${asks.length ? asks.map(a => a.status === 'pending' ? askCard(a)
      : `<div class="mem-row"><span class="hint mono">${esc(a.status)}</span>
          <span style="flex:1;font-size:.78rem">${esc(a.question)}</span>
          <span class="hint">${esc(a.answer || '')}</span></div>`).join('')
      : '<div class="empty">Nothing asked yet.</div>'}</div></div>`;
}

// ═══════════════════════════════════════════════════════════════════════
// 1 · HOME — briefing + work now
// ═══════════════════════════════════════════════════════════════════════
export function home(s) {
  const o = s.overview || {};
  const c = o.counts || {};
  const f = o.funnel || {};
  const rev = o.revenue || {};
  const etsy = o.etsy || { cap: 20, published: 0, remaining: 20 };
  const ready = o.readiness || { issues: [], ok: false };
  const engine = o.engine || {};

  const queued = reviewQueue(s.products).length;
  const queue = reviewPage(s.products, 1);
  const topReview = queue.slice.slice(0, 6);
  const windows = activeTrendWindows(s).slice(0, 4);
  const priorities = pickPriority(s);

  const bi = s.bi || {};
  const bh = bi.health || {};
  const ins = bi.insights || {};
  const bdl = bi.deltas || {};
  const pctText = d => (typeof d === 'number' ? (d > 0 ? '+' : '') + d + '% vs prior 7d' : 'no prior data');

  const blockers = (ready.issues || []).filter(i => i.severity === 'error');
  const warns = (ready.issues || []).filter(i => i.severity === 'warning');
  const capPct = etsy.cap > 0 ? Math.round((etsy.published / etsy.cap) * 100) : 0;

  // The work area leads with the two things the app is actually for day to day:
  // clearing the review queue, then riding an activate-grade trend window.
  const reviewWork = topReview.length ? {
    title: `${fmtNum(queue.items.length)} awaiting review`,
    sub: 'Jump straight to the next product to triage.',
    body: `<div class="rows">${topReview.map(p => `
      <div class="rrow" data-review-id="${p.id}">
        <div class="rt">${img(p)}</div>
        <div>
          <div class="nm">${esc(p.name)}</div>
          <div class="mt">${esc(p.prof_name || '')} · ${esc(titleCase(p.type))} · ${esc(p.price || '')}</div>
        </div>
        <div class="acts">
          <button class="btn ghost sm" data-action="toggle-select" data-id="${p.id}" title="Select">${s.selected.has(p.id) ? '☑' : '☐'}</button>
          ${sparkBtn('product', p.id, p.name)}
          <button class="btn green sm" data-action="approve" data-id="${p.id}">${icon('check')} Approve</button>
          <button class="btn primary sm" data-action="publish" data-id="${p.id}">${icon('rocket')} Publish</button>
          <button class="btn red sm" data-action="reject" data-id="${p.id}">${icon('x')} Reject</button>
        </div>
      </div>`).join('')}</div>${selBar(s, 'product', topReview.map(p => p.id))}`,
    right: `<button class="btn primary" data-action="go" data-view="review">Open review queue</button>`
  } : null;

  const trendWork = windows.length ? {
    title: `${windows.length} trend window${windows.length > 1 ? 's' : ''} open`,
    sub: `Highest velocity first · Etsy quota ${fmtNum(etsy.remaining)} left today.`,
    body: `<div class="rows">${windows.map(t => {
      const w = trendWindow(t);
      const grade = String(t.grade || t.verdict || 'ACTIVATE').toUpperCase();
      const safeGrade = ['ACTIVATE', 'WATCH', 'SKIP'].includes(grade) ? grade : 'ACTIVATE';
      const win = w ? (w.daysLeft > 0 ? `closes in ${w.daysLeft}d` : 'window closed') : '';
      return `
      <div class="rrow" style="grid-template-columns:62px 1fr auto">
        <div class="rt"><span style="font-size:1.6rem">${esc(t.emoji || '🔥')}</span></div>
        <div>
          <div class="nm">${esc(t.name)}</div>
          <div class="mt">${esc([t.phase || t.velocity || 'rising', win, t.est_revenue].filter(Boolean).join(' · '))}</div>
        </div>
        <div class="acts">
          <span class="grade ${safeGrade}">${t.activated ? 'locked' : esc(safeGrade)}</span>
          <button class="btn green sm" data-action="trend-generate" data-id="${t.id}" ${t.activated ? 'disabled' : ''}>${icon('sparkles')} Generate</button>
          <button class="btn primary sm" data-action="go" data-view="trends">Trend</button>
        </div>
      </div>`;
    }).join('')}</div>`,
    right: `<button class="btn primary" data-action="go" data-view="trends">Open trends</button>`
  } : null;

  // Fallback ladder (priority brain): weak/zero-view listings, then growth
  // moves. The work area NEVER shows "nothing to do" — an empty queue is the
  // moment to sell, not to stop.
  const lh = (s.bi && s.bi.listing) || {};
  const weakSeo = lh.weakestSeo || [];
  const zeroView = lh.zeroSale || [];
  const weakRow = (name, meta, id) => `<div class="rrow" style="grid-template-columns:1fr auto">
      <div><div class="nm">${esc(name)}</div><div class="mt">${esc(meta)}</div></div>
      <div class="acts"><button class="btn green sm" data-action="optimize-product" data-id="${id}">${icon('sparkles')} Optimize</button></div>
    </div>`;
  const weakWork = (weakSeo.length || zeroView.length) ? {
    title: `${fmtNum(weakSeo.length + zeroView.length)} listing${weakSeo.length + zeroView.length > 1 ? 's' : ''} need attention`,
    sub: 'Weak SEO or zero views — retitle and re-tag them.',
    body: `<div class="rows">${[
      ...weakSeo.slice(0, 4).map(w => weakRow(w.name, `SEO ${fmtNum(w.score)}/100 · ${fmtNum(w.tagCount)}/13 tags`, w.id)),
      ...zeroView.slice(0, 4).map(z => weakRow(z.name, `listed ${fmtNum(z.daysListed)}d · 0 views`, z.id))
    ].join('')}</div>`,
    right: `<button class="btn primary" data-action="optimize-weak">${icon('sparkles')} Optimize all weak</button>`
  } : null;
  const growthWork = {
    title: 'Queue clear — keep the flywheel moving',
    sub: 'Nothing urgent is pending. Push inventory live and pull fresh demand in.',
    body: `<div class="btn-row" style="flex-direction:column;align-items:stretch;margin-bottom:0">
      <button class="btn green" data-action="run" data-name="push-bundles">${icon('box')} Publish Bundles → Gumroad</button>
      <button class="btn primary" data-action="run" data-name="sweep">${icon('discovery')} Discover New Niches</button>
      <button class="btn" data-action="run" data-name="sync-sales">${icon('refresh')} Sync Sales</button>
    </div>`,
    right: ''
  };
  const cards = { review: reviewWork, trends: trendWork, weak: weakWork, growth: growthWork };
  const workItems = priorities.map(p => cards[p.kind]).filter(Boolean).slice(0, 2);

  // Briefing triad — the BI insights engine already computes opportunities,
  // risks and next actions from real tables; present them as ONE briefing
  // instead of burying the narrative in a side panel.
  const insList = (arr, mark, color) => ((arr && arr.length)
    ? arr.map(x => `<div class="mb8" style="font-size:.78rem;color:${color}">${mark} ${esc(x)}</div>`).join('')
    : '<div class="hint">Nothing flagged.</div>');
  const moves = (ins && ins.actions) || [];
  const triad = `<div class="panel mb14" style="border-left:3px solid var(--teal)">
      <div class="panel-head" style="padding-left:14px">${icon('bullseye')} Operator briefing <span class="sp"></span>
        <span class="hint">what's working · what needs you · the next move</span></div>
      <div class="panel-body"><div class="grid g3">
        <div><div class="hint mb8">What's working</div>${insList(ins.opportunities, '▲', 'var(--green)')}</div>
        <div><div class="hint mb8">Needs attention</div>${insList(ins.risks, '●', 'var(--amber)')}</div>
        <div><div class="hint mb8">Highest-leverage move</div>
          ${moves.length
            ? `<button class="btn primary" style="width:100%" data-action="run" data-name="${esc(moves[0].run)}">${icon('bolt')} ${esc(moves[0].label)}</button>` +
              moves.slice(1, 3).map(a => `<button class="btn sm mt8" style="width:100%" data-action="run" data-name="${esc(a.run)}">${esc(a.label)}</button>`).join('')
            : '<div class="hint">No suggested moves — run a sweep to find some.</div>'}
        </div>
      </div></div></div>`;

  // Since your last visit — the daily question is "what changed?", not "what
  // are the totals?". console.js diffs real timestamps and passes the result.
  const sc = s.since;
  const sinceHtml = (sc && !sc.first) ? `<div class="panel mb14"><div class="panel-body" style="padding:10px 15px">
      <span class="hint">Since your last visit (${esc(timeAgo(sc.at))}):</span>
      ${(sc.newDrafts || sc.newSales || sc.newRevenue || sc.newActivations)
        ? `<b style="margin-left:6px">${[
            sc.newDrafts ? `+${fmtNum(sc.newDrafts)} draft${sc.newDrafts > 1 ? 's' : ''}` : '',
            sc.newRevenue ? `+${fmtMoney(sc.newRevenue, true)}` : '',
            sc.newSales ? `+${fmtNum(sc.newSales)} sale${sc.newSales > 1 ? 's' : ''}` : '',
            sc.newActivations ? `${fmtNum(sc.newActivations)} trend${sc.newActivations > 1 ? 's' : ''} activated` : ''
          ].filter(Boolean).join(' · ')}</b>`
        : '<b style="margin-left:6px">nothing changed.</b>'}
    </div></div>` : '';

  return head('🎯 Briefing', 'Shop state first. What needs your attention right now.',
    `<button class="btn green" data-action="make-this">${icon('sparkles')} Make this…</button>
     <button class="btn ghost" data-action="palette">${icon('command')} Run a command <kbd>⌘K</kbd></button>`)
  + triad
  + sinceHtml
  + bossInbox(s)
  + `<div class="grid g2 mb14">
      <div class="panel">
        <div class="panel-head">${icon('bullseye')} Shop state <span class="sp"></span>
          <span class="hint">what the dashboard thinks about the shop right now</span></div>
        <div class="panel-body">
          <div class="kpis" style="grid-template-columns:repeat(2,1fr)">
            <button class="kpi tc clickable" data-action="go" data-view="catalog">
              <div class="lb">Products</div><div class="num">${fmtNum(c.products)}</div>
              <div class="sb">${fmtNum(c.listed)} listed · ${pctText(bdl.products && bdl.products.deltaPct)}</div></button>
            <button class="kpi ${bh.score >= 80 ? 'gn' : bh.score >= 45 ? 'am' : 'am'} clickable" data-action="go" data-view="system">
              <div class="lb">Shop Health</div><div class="num">${typeof bh.score === 'number' ? String(bh.score) : '—'}</div>
              <div class="sb">${bh.grade || 'computing…'}</div></button>
            <button class="kpi am clickable" data-action="go" data-view="review">
              <div class="lb">In Review</div><div class="num">${fmtNum(queued)}</div>
              <div class="sb">awaiting you</div></button>
            <button class="kpi gn clickable" data-action="go" data-view="analytics">
              <div class="lb">Real Revenue</div><div class="num">${fmtMoney(rev.realRevenue, true)}</div>
              <div class="sb">${fmtNum(rev.realSales)} real sales</div></button>
            <button class="kpi bl clickable" data-action="go" data-view="catalog">
              <div class="lb">Approved</div><div class="num">${fmtNum(c.approved)}</div>
              <div class="sb">ready to publish</div></button>
            <div class="panel" style="border:1px solid var(--border);border-radius:var(--radius);padding:11px 13px;background:var(--panel)">
              <div class="lb">Etsy quota</div>
              <div class="num" style="margin-top:2px">${esc(etsy.published)} / ${esc(etsy.cap)}</div>
              <div class="sb">${fmtNum(etsy.remaining)} remaining · ${capPct >= 100 ? 'full' : capPct >= 70 ? 'filling up' : 'open'}</div>
            </div>
          </div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head">${icon('shield')} Readiness <span class="sp"></span>
          <span class="hint">blockers first, then warnings</span></div>
        <div class="panel-body">
          ${blockers.length === 0 && warns.length === 0
            ? '<div class="hint" style="color:var(--green)">No blockers. Everything configured.</div>'
            : [...blockers.map(i => `<div class="mb8" style="font-size:.78rem;color:var(--red)">✕ ${esc(i.message)}</div>`),
               ...warns.slice(0, 4).map(i => `<div class="mb8" style="font-size:.78rem;color:var(--amber)">⚠ ${esc(i.message)}</div>`)].join('')}
          <button class="btn ghost sm mt8" data-action="go" data-view="system">Open System →</button>
        </div>
      </div>
    </div>
    <div class="panel mb14" style="border-left:3px solid var(--teal)">
      <div class="panel-head" style="padding-left:14px">${icon('list')} Work now <span class="sp"></span>
        <span class="hint">priority order: review queue → trend windows → weak listings → growth moves</span></div>
      <div class="panel-body">
        <div class="grid g2">
          ${workItems.map(item => `<div class="panel" style="border:1px solid var(--border);border-radius:var(--radius)">
            <div class="panel-head">${esc(item.title)}</div>
            <div class="panel-body" style="padding:8px 12px 12px">
              <div class="hint mb8">${esc(item.sub)}</div>
              ${item.body}
              ${item.right ? '<div class="btn-row mt8" style="margin-bottom:0">' + item.right + '</div>' : ''}
            </div>
          </div>`).join('')}
        </div>
      </div>
    </div>
    <div class="grid g2 mb14">
      <div class="panel">
        <div class="panel-head">${icon('lightning')} Other jobs <span class="sp"></span>
          <span class="hint">one click each, full views below</span></div>
        <div class="panel-body">
          <div class="btn-row" style="flex-direction:column;align-items:stretch">
            <button class="btn primary" data-action="run" data-name="sweep">${icon('discovery')} Discover New Niches</button>
            <button class="btn primary" data-action="run" data-name="full-cycle">${icon('play')} Run Full Automation Cycle</button>
            <button class="btn green" data-action="run" data-name="push-bundles">${icon('box')} Publish Bundles → Gumroad</button>
            <button class="btn green" data-action="run" data-name="lead-magnet">${icon('rocket')} Publish Lead Magnet</button>
            <button class="btn" data-action="run" data-name="sync-sales">${icon('refresh')} Sync Sales</button>
            <button class="btn" data-action="rebuild-covers">${icon('sparkles')} Rebuild Covers</button>
          </div>
          ${ins.actions && ins.actions.length ? `<div class="btn-row mt14" style="flex-direction:column;align-items:stretch">
            <div class="hint mb8">Suggested by the system</div>
            ${(ins.actions || []).map(a => `<button class="btn sm mb8" style="width:100%" data-action="run" data-name="${esc(a.run)}">${icon('bolt')} ${esc(a.label)}</button>`).join('') || ''}
          </div>` : ''}
        </div>
      </div>
      <div class="panel">
        <div class="panel-head">${icon('clock')} Recent activity <span class="sp"></span>
          <span class="hint">${s.live === 'live' ? 'streaming' : s.live}</span></div>
        <div class="panel-body"><div class="logs">${activityRows(o.activity, 12)}</div></div>
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
      <div class="thumb">${img(p)}<span class="ck" role="checkbox" aria-checked="${s.selected.has(p.id)}" aria-label="Select ${esc(p.name)}" title="Select" data-action="toggle-select" data-id="${p.id}">${s.selected.has(p.id) ? '✓' : ''}</span><div class="dna-strip"></div></div>
      <div class="bd">
        <div class="nm" title="${esc(p.name)}">${esc(p.name)}</div>
        <div class="mt">${esc(p.prof_name || '—')} · ${esc(titleCase(p.type))}</div>
        ${conceptTeaser(p)}
        <div class="flex-between mt8"><span>${pill(p.status)}</span><span class="pr">${esc(p.price || '')}</span></div>
        <div class="flex mt8" style="gap:5px">
          <button class="btn ghost sm" data-action="toggle-select" data-id="${p.id}" title="Select">${s.selected.has(p.id) ? '☑' : '☐'}</button>
          <button class="btn ghost sm" data-action="open" data-id="${p.id}" title="Open">${icon('eye')}</button>
          ${sparkBtn('product', p.id, p.name)}
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
      <span class="hint">${fmtNum(list.length)} shown · ${types.length} types</span>
    </div>
    ${selBar(s, 'product', list.map(p => p.id))}
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
        <button class="btn ghost sm" data-action="toggle-select" data-id="${p.id}" title="Select">${s.selected.has(p.id) ? '☑' : '☐'}</button>
        ${sparkBtn('product', p.id, p.name)}
        <button class="btn ghost sm" data-action="open" data-id="${p.id}">${icon('eye')} Open</button>
        <button class="btn sm" data-action="edit-product" data-id="${p.id}">${icon('pencil')} Edit</button>
        <button class="btn amber sm" data-action="better-idea" data-id="${p.id}" title="Ask the concept engine for a more differentiated angle">${icon('brain')} Better Idea</button>
        <button class="btn green sm" data-action="approve" data-id="${p.id}">${icon('check')} Approve</button>
        <button class="btn primary sm" data-action="publish" data-id="${p.id}">${icon('rocket')} Publish</button>
        <button class="btn red sm" data-action="reject" data-id="${p.id}">${icon('x')} Reject</button>
      </div>
    </div>`).join('');

  return head('✅ Review Queue', `${fmtNum(items.length)} awaiting review. Keyboard: J/K move · A approve · R reject · X select · Enter open.`,
    `<button class="btn ghost" data-action="go" data-view="catalog">All Products →</button>`)
  + `<div class="btn-row">
      <button class="btn" data-action="run" data-name="dedupe-queue">${icon('broom')} Dedupe Clones</button>
      <button class="btn primary" data-action="rebuild-covers">${icon('sparkles')} Rebuild Covers</button>
      <button class="btn red" data-action="confirm" data-confirm="run:reject-trash" data-message="Reject ALL pending drafts? Approved and listed products are safe.">${icon('trash')} Reject All Trash</button>
      <button class="btn green" data-action="confirm" data-confirm="run:approve-all" data-message="Approve every pending product?">${icon('check')} Approve All</button>
    </div>
    ${selBar(s, 'product', items.map(p => p.id))}
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
            ${niches.length ? niches.map(n => {
              const on = (s.selectedMisc || new Set()).has(`niche:${n}`);
              return `<span class="tag${on ? ' sel' : ''}"><button class="btn ghost sm" style="padding:0 4px;border:none;background:none" data-action="misc-toggle-select" data-key="${encodeURIComponent(`niche:${n}`)}" title="Select">${on ? '☑' : '☐'}</button>${esc(n)} ${sparkBtn('niche', n, n)} <button class="btn ghost sm" style="padding:0 4px;border:none;background:none" data-action="passion-remove" data-niche="${esc(n)}" title="Remove">✕</button></span>`;
            }).join('')
              : '<span class="hint">No passion niches yet. Adding one biases generation toward it.</span>'}
          </div>
          ${niches.length ? selBar(s, 'niche', niches) : ''}
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
    const w = trendWindow(t);
    const win = w ? (w.daysLeft > 0 ? `closes in ${w.daysLeft}d` : 'window closed') : (t.window ? `win ${t.window}d` : '');
    const on = s.selectedTrends ? s.selectedTrends.has(t.id) : false;
    return `<div class="trend ${on ? 'sel' : ''}">
      <button class="btn ghost sm" data-action="trend-toggle-select" data-id="${t.id}" title="Select">${on ? '☑' : '☐'}</button>
      <span style="font-size:1.3rem">${esc(t.emoji || '🔥')}</span>
      <div style="flex:1;min-width:0">
        <div class="nm">${esc(t.name)}</div>
        <div class="mt">${esc([t.source, t.velocity, win, t.est_revenue].filter(Boolean).join(' · '))}</div>
      </div>
      <span class="grade ${safeGrade}">${esc(safeGrade)}</span>
      ${sparkBtn('trend', t.id, t.name)}
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
    ${rows.length ? selBar(s, 'trend', rows.map(t => t.id)) + list : empty('No trends yet — run a sweep or SERP scan.')}`;
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
    const on = (s.selectedMisc || new Set()).has(`post:${p.id}`);
    // Deterministic engagement forecast badge (server-side, no AI needed).
    const fc = p.forecast && p.forecast.prediction ? p.forecast : null;
    const fcBadge = fc ? `<span title="Predicted engagement: ${esc(fc.prediction)} (${esc(String(fc.score))}/100)" style="margin-left:6px">${fc.prediction === 'high' ? '🔥' : fc.prediction === 'medium' ? '⚡' : '💤'}</span>` : '';
    return `<div class="flex${on ? ' sel' : ''}" style="padding:9px 12px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:7px">
      <button class="btn ghost sm" data-action="misc-toggle-select" data-key="${encodeURIComponent(`post:${p.id}`)}" title="Select">${on ? '☑' : '☐'}</button>
      <span style="width:9px;height:9px;border-radius:50%;background:${color};flex-shrink:0"></span>
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:.8rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(String(p.content || '').slice(0, 70))}…</div>
        <div class="hint">${esc(p.platform)} · ${esc(timeAgo(p.scheduledAt))} · ${esc(p.status)}${fcBadge}</div>
      </div>
      ${sparkBtn('post', p.id, String(p.content || '').slice(0, 40))}
      ${p.status === 'scheduled' ? `<button class="btn red sm" data-action="social-cancel" data-id="${p.id}">Cancel</button>` : ''}
    </div>`;
  }).join('');

  return head('📱 Social Scheduler', 'Generate, preview, schedule and log posts across six platforms.',
    `<button class="btn primary" data-action="run" data-name="sync-sales">${icon('refresh')} Sync Sales</button>`)
  + `<div class="grid g2">
      <div class="panel"><div class="panel-head">${icon('calendar')} Scheduled Posts</div>
        <div class="panel-body" style="max-height:520px;overflow:auto">
          ${posts.length ? selBar(s, 'post', posts.map(p => p.id)) + postRows : '<div class="empty">No posts scheduled yet.</div>'}
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

  const runList = a.recentRuns || [];
  const runs = runList.map(r => {
    const c = r.status === 'active' ? 'var(--green)' : r.status === 'cancelled' ? 'var(--red)' : 'var(--muted)';
    const on = (s.selectedMisc || new Set()).has(`ad:${r.id}`);
    return `<div class="flex${on ? ' sel' : ''}" style="padding:8px 11px;background:var(--surface);border-radius:var(--radius-xs);margin-bottom:6px">
      <button class="btn ghost sm" data-action="misc-toggle-select" data-key="${encodeURIComponent(`ad:${r.id}`)}" title="Select">${on ? '☑' : '☐'}</button>
      <span style="width:8px;height:8px;border-radius:50%;background:${c}"></span>
      <div style="flex:1"><div style="font-weight:600;font-size:.8rem">${esc(r.name || 'Campaign')}</div>
      <div class="hint">${esc(r.platform)} · ${fmtMoney(r.amount)} · ${esc(r.status)}</div></div>
      ${sparkBtn('ad', r.id, r.name || 'Campaign')}
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
          ${runs ? selBar(s, 'ad', runList.map(r => r.id)) + runs : '<div class="empty">No campaigns yet.</div>'}
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
      // Design Quality (render→critique→revise). Real rows only: an unscored
      // product is reported as unscored — never as passed (hard rule).
      const d = s.designScores || null;
      if (!d) return '';
      const dist = d.distribution || {};
      const max = Math.max(1, ...Object.values(dist).map(Number));
      return `<div class="panel mb14"><div class="panel-head">${icon('sparkles')} Design Quality <span class="sp"></span>
        <span class="hint">vision critique · threshold ${fmtNum(d.threshold || 6.5)}/10 · since ${esc(String(d.since || ''))}</span></div>
        <div class="panel-body">
          <div class="flex" style="gap:14px;flex-wrap:wrap;font-size:0.8rem">
            <div><b>Avg score:</b> ${d.avg == null ? '—' : fmtNum(d.avg) + '/10'}</div>
            <div><b>Scored:</b> ${fmtNum(d.scored || 0)}</div>
            <div style="color:var(--amber)"><b>Unscored:</b> ${fmtNum(d.unscored || 0)} (not counted as passed)</div>
            <div><b>Below bar:</b> ${fmtNum(d.belowThreshold || 0)}</div>
            <div><b>Revised after critique:</b> ${fmtNum(d.rescoredWithRevision || 0)}</div>
          </div>
          <div class="mt8">${Object.entries(dist).map(([bucket, n]) => barRow(bucket, Number(n) || 0, max, 'var(--grad)')).join('')}</div>
          <div class="mt8"><button class="btn primary sm" data-action="run" data-name="design-sweep">${icon('sparkles')} Run design sweep</button></div>
        </div></div>`;
    })()}
    ${(() => {
      // Real revenue time-series + listing health from the BI service.
      const bi = s.bi || {};
      const row = bi.series || [];
      const lh = bi.listing || {};
      const pnl = bi.pnl || {};
      const revVals = row.map(d => d.revenue);
      const revTotal = revVals.reduce((a, b) => a + (Number(b) || 0), 0);
      const badges = lh.badges || {};
      const weak = lh.weakestSeo || [];
      const zero = lh.zeroSale || [];
      const badgeChip = (label, n, color) => `<span class="chip" style="border-color:${color};color:${color}">${esc(label)} ${fmtNum(n)}</span>`;
      return `
    <div class="panel mb14"><div class="panel-head">${icon('trends')} Real Revenue & Net P&L <span class="sp"></span>
      <span class="hint">${fmtMoney(revTotal)} gross 14d · ${fmtMoney(pnl.netProfit || 0)} true net (${fmtNum(pnl.netMarginPct || 0)}% margin)</span></div>
      <div class="panel-body">${row.length ? sparkline(revVals) : '<div class="empty">not enough data yet</div>'}
        <div class="flex mt8" style="gap:14px;flex-wrap:wrap;font-size:0.8rem">
          <div><b>Fees:</b> ${fmtMoney(pnl.marketplaceFees || 0)}</div>
          <div><b>AI Spend:</b> ${fmtMoney(pnl.aiCost || 0)}</div>
          <div><b>Net Profit:</b> <b style="color:var(--green)">${fmtMoney(pnl.netProfit || 0)}</b></div>
          <div><b>Avg Net/Unit:</b> ${fmtMoney((pnl.unitEconomics && pnl.unitEconomics.avgNetPerUnit) || 0)}</div>
        </div>
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
    <div class="grid g2 mb14">${bossChannelPanel(s)}${memoryPanel(s)}</div>
    ${askPanel(s)}
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
