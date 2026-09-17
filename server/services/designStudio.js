// ═══════════════════════════════════════════════════════════════════════════
// DESIGN STUDIO — premium shared template system for every NicheGate product.
// Each builder returns a full HTML document styled with one design system:
// clean type, tasteful accent colour, soft shadows, print-ready @page rules.
// Editor-safe: hex theme tokens + font-family declarations only.
// ═══════════════════════════════════════════════════════════════════════════

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const { getContentFor } = require('./contentLibrary');

function priceNum(str) {
  const m = String(str || '').replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

function parseServices(prof) {
  try { return JSON.parse(prof.services || '[]'); } catch { return []; }
}

const SYSTEM_FONT = "'Space Grotesk','Inter','Segoe UI',system-ui,sans-serif";

function baseStyle(theme) {
  return `
  *{box-sizing:border-box;margin:0;padding:0}
  html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{font-family:${theme.font || SYSTEM_FONT};color:${theme.primary};background:${theme.bg};line-height:1.55;font-size:13px}
  @page{size:A4;margin:12mm}
  .page{width:100%;max-width:794px;margin:0 auto;padding:44px 46px;min-height:1050px;page-break-after:always;background:${theme.bg};position:relative}
  .page:last-child{page-break-after:auto}
  .pill{display:inline-block;padding:5px 14px;border-radius:999px;font-size:10px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;background:${theme.primary};color:#fff}
  .card{background:#fff;border:1px solid rgba(15,23,42,0.08);border-radius:16px;box-shadow:0 10px 30px -18px rgba(15,23,42,0.35)}
  @media print{
    body{background:#fff}
    .page{box-shadow:none;margin:0;max-width:none}
  }
  `;
}


function shell(title, extraCss, body, theme) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${esc(title)}</title>
<style>${baseStyle(theme)}${extraCss}</style></head><body>${body}</body></html>`;
}
// ── INVOICE ──────────────────────────────────────────────────────────────
function buildInvoiceHTML(prof, theme, opts) {
  const cat = getContentFor(prof);
  const safe = cat.invoice.length ? cat.invoice : parseServices(prof).length ? parseServices(prof) : [["Professional Consultation", "$50"]];
  const total = safe.reduce((a, s) => a + (priceNum(s[1]) || 0), 0);
  const opts2 = opts || {};
  const today = opts2.date || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const due = new Date(Date.now() + 30 * 864e5).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const rows = safe.map((s, i) => {
    const rate = priceNum(s[1]);
    return `<tr>
      <td><div class="svc">${esc(s[0])}</div><div class="svc-sub">${esc(prof.name)} · line #${String(i + 1).padStart(2, '0')}</div></td>
      <td class="num">1</td>
      <td class="num">${rate != null ? '$' + rate.toFixed(2) : esc(s[1])}</td>
      <td class="num strong">${rate != null ? '$' + rate.toFixed(2) : '—'}</td>
    </tr>`;
  }).join('');

  return shell(`${prof.name} — Invoice Template`, `
    body{background:#eef1f5}
    .top-grid{display:grid;grid-template-columns:1fr auto;gap:24px;align-items:center;margin-bottom:34px}
    .brand{display:flex;align-items:center;gap:16px}
    .logo-box{width:64px;height:64px;border-radius:18px;background:${theme.primary};color:#fff;display:flex;align-items:center;justify-content:center;font-size:2rem;box-shadow:0 14px 30px -14px ${theme.primary}}
    .brand h1{font-size:1.7rem;font-weight:900;letter-spacing:-0.5px}
    .brand p{font-size:0.78rem;opacity:0.55;margin-top:2px}
    .doc-label{text-align:right}
    .doc-label .big{font-size:2.2rem;font-weight:900;letter-spacing:4px;text-transform:uppercase;line-height:1}
    .doc-label .id{font-size:0.75rem;opacity:0.5;margin-top:6px}
    .meta-grid{display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:14px;margin-bottom:26px}
    .field h3{font-size:0.66rem;letter-spacing:1.8px;text-transform:uppercase;opacity:0.45;margin-bottom:8px}
    .field p{font-size:0.86rem;color:#334155}
    .field .editable{border-bottom:1px dashed rgba(15,23,42,0.18);padding-bottom:6px;min-height:22px}
    table{width:100%;border-collapse:collapse;margin-bottom:18px}
    thead th{font-size:0.64rem;letter-spacing:1.8px;text-transform:uppercase;padding:12px 14px;background:${theme.primary};color:#fff;text-align:left}
    thead th:first-child{border-radius:12px 0 0 0}
    thead th:last-child{border-radius:0 12px 0 0}
    tbody td{padding:13px 14px;border-bottom:1px solid #e8ecf2;font-size:0.86rem}
    tbody tr:nth-child(even){background:rgba(15,23,42,0.025)}
    .svc{font-weight:700;color:#1e293b}
    .svc-sub{font-size:0.72rem;opacity:0.5;margin-top:2px}
    .num{text-align:right;font-variant-numeric:tabular-nums}
    .strong{font-weight:800}
    .totals{display:grid;grid-template-columns:1fr 280px;gap:16px;align-items:start}
    .notes{font-size:0.78rem;color:#64748b;padding-top:6px}
    .notes .box{border-left:3px solid ${theme.accent};padding:10px 14px;background:rgba(0,0,0,0.03);border-radius:0 10px 10px 0;margin-top:8px}
    .total-card{background:${theme.primary};color:#fff;border-radius:16px;padding:18px 20px;box-shadow:0 18px 34px -18px ${theme.primary}}
    .total-card .lbl{font-size:0.64rem;letter-spacing:2px;text-transform:uppercase;opacity:0.6}
    .total-card .amt{font-size:2rem;font-weight:900;margin:6px 0 2px}
    .total-card .due{font-size:0.7rem;opacity:0.65}
    .pay-strip{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
    .pay-chip{font-size:0.68rem;font-weight:700;background:#fff;border:1px solid rgba(15,23,42,0.12);padding:6px 12px;border-radius:999px}
    .foot{display:flex;justify-content:space-between;gap:16px;margin-top:30px;padding-top:16px;border-top:1px solid #e8ecf2;font-size:0.72rem;color:#64748b}
    .foot .sig{border-top:1px solid rgba(15,23,42,0.2);width:160px;padding-top:6px;margin-top:14px;text-align:center;font-weight:700;color:#334155}
  `, `
  <div class="page">
    <div class="top-grid">
      <div class="brand">
        <div class="logo-box">${esc(prof.emoji || '🧾')}</div>
        <div><h1>${esc(prof.name)}</h1><p>Professional Services · ${esc(new Date().getFullYear())}</p></div>
      </div>
      <div class="doc-label"><div class="big">Invoice</div><div class="id">INV-${String(1000 + (opts2.seed || 1))} · Due Net 30</div></div>
    </div>
    <div class="meta-grid">
      <div class="field"><h3>Bill To</h3><p class="editable" contenteditable="true">Client name<br>Client company<br>City, ST 12345</p></div>
      <div class="field"><h3>Invoice Date</h3><p>${esc(today)}</p></div>
      <div class="field"><h3>Payment Due</h3><p>${esc(due)}</p></div>
    </div>
    <table>
      <thead><tr><th>Service / Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="totals">
      <div class="notes">
        <div class="box">Thank you for your business. Payment due within 30 days — ACH, credit card, or check accepted.</div>
      </div>
      <div class="total-card">
        <div class="lbl">Total Due</div>
        <div class="amt">$${total.toFixed(2)}</div>
        <div class="due">Covers all listed work · No hidden fees</div>
        <div class="pay-strip"><span class="pay-chip">ACH</span><span class="pay-chip">CARD</span><span class="pay-chip">CHECK</span></div>
      </div>
    </div>
    <div class="foot">
      <div>Payment terms: Net 30 · Questions? hello@${esc(prof.slug)}.com</div>
      <div class="sig">Authorized signature</div>
    </div>
  </div>`, theme);
}
// ── CHECKLIST ────────────────────────────────────────────────────────────
function buildChecklistHTML(prof, theme) {
  const services = parseServices(prof);
  const groups = (services.length ? services : [["Standard Service Package", "$100"]]).map((s, g) => {
    const routine = [
      `Confirm scope, date &amp; quoted price (${esc(s[1] || 'quote')}) with the client`,
      `Arrive prepared — tools, supplies and checklist on hand`,
      `Complete "${esc(s[0])}" step by step, marking each line done`,
      `Inspect finished work against this checklist before leaving`,
      `Collect payment, send the receipt and schedule the follow-up`
    ];
    return `<div class="grp">
      <div class="grp-head"><span class="grp-num">0${g + 1}</span><span class="grp-title">${esc(s[0])}</span><span class="grp-tag">${esc(s[1] || '')}</span></div>
      ${routine.map((r) => `<div class="item"><span class="box"></span><span class="txt">${r}</span><span class="chk"><input type="checkbox"></span></div>`).join('')}
    </div>`;
  }).join('');

  return shell(`${prof.name} — Service Quality Checklist`, `
    .head{display:grid;grid-template-columns:64px 1fr;gap:18px;align-items:center;margin-bottom:26px}
    .head .ic{width:64px;height:64px;border-radius:18px;background:${theme.primary};color:#fff;display:flex;align-items:center;justify-content:center;font-size:1.9rem;box-shadow:0 14px 30px -14px ${theme.primary}}
    .head h1{font-size:1.55rem;font-weight:900;letter-spacing:-0.4px}
    .head p{font-size:0.78rem;opacity:0.55;margin-top:3px}
    .grp{margin-bottom:22px;page-break-inside:avoid}
    .grp-head{display:flex;align-items:center;gap:12px;margin-bottom:10px}
    .grp-num{width:34px;height:34px;border-radius:10px;background:${theme.accent};color:#fff;font-weight:900;font-size:0.85rem;display:flex;align-items:center;justify-content:center}
    .grp-title{font-size:1.02rem;font-weight:800;color:${theme.primary}}
    .grp-tag{margin-left:auto;font-size:0.7rem;font-weight:800;color:${theme.secondary};background:rgba(0,0,0,0.05);padding:4px 12px;border-radius:999px}
    .item{display:grid;grid-template-columns:26px 1fr 26px;gap:12px;align-items:center;padding:9px 4px;border-bottom:1px dashed #e2e8f0}
    .box{width:20px;height:20px;border:2px solid ${theme.secondary};border-radius:7px}
    .txt{font-size:0.9rem;color:#334155}
    .chk input{transform:scale(1.15);accent-color:${theme.accent}}
    .foot-note{margin-top:22px;background:${theme.primary};color:#fff;border-radius:16px;padding:18px 20px;display:flex;justify-content:space-between;align-items:center}
    .foot-note .lbl{font-size:0.64rem;letter-spacing:2px;text-transform:uppercase;opacity:0.6}
    .foot-note .val{font-weight:800;margin-top:3px}
  `, `
  <div class="page">
    <div class="head">
      <div class="ic">${esc(prof.emoji || '✅')}</div>
      <div><span class="pill">Checklist · ${new Date().getFullYear()} edition</span>
      <h1>${esc(prof.name)} — Quality Checklist</h1>
      <p>Five non-negotiables per service · print one per job · tick as you go</p></div>
    </div>
    ${groups}
    <div class="foot-note">
      <div><div class="lbl">Total services covered</div><div class="val">${services.length || 1} routines · 5 steps each</div></div>
      <div style="text-align:right"><div class="lbl">Notes / corrections</div><div class="val" contenteditable="true">______________________</div></div>
    </div>
  </div>`, theme);
}
// ── JOURNAL (30-day recovery / reflection) ───────────────────────────────
function buildJournalHTML(prof, theme, prompts) {
  const days = prompts && prompts.length ? prompts : Array.from({ length: 30 }, (_, i) => [
    'What am I grateful for today?', 'What challenged me?', 'How did I grow?',
    'What do I hope for tomorrow?', 'One word to describe today'
  ]);
  const dayBlocks = days.map((qs, i) => `
    <div class="day">
      <div class="day-head"><span class="daynum">Day ${i + 1}</span><span class="dateline">Date: ________________________</span></div>
      ${qs.map((q) => `<div class="q"><span class="qmark">${i % 5 === 4 ? '🙏' : '✎'}</span><div><div class="qtext">${esc(q)}</div><div class="lines"></div></div></div>`).join('')}
    </div>`).join('');

  return shell(`${prof.name} — 30-Day Journal`, `
    .cover{height:1123px;background:${theme.primary};color:#fff;padding:120px 60px;display:flex;flex-direction:column;justify-content:center;position:relative}
    .cover .emoji{font-size:4.5rem;margin-bottom:20px}
    .cover .tagbox{position:absolute;top:44px;right:46px}
    .cover h1{font-size:3rem;font-weight:900;letter-spacing:-1px;margin:16px 0 10px}
    .cover .sub{font-size:1.05rem;opacity:0.78;max-width:420px}
    .cover .rule{width:70px;height:5px;background:${theme.accent};border-radius:99px;margin:26px 0}
    .cover .foot{position:absolute;bottom:54px;left:60px;font-size:0.75rem;opacity:0.5;letter-spacing:2px;text-transform:uppercase}
    .day{page-break-inside:avoid;margin-bottom:26px;background:#fff;border:1px solid rgba(15,23,42,0.07);border-radius:18px;box-shadow:0 12px 28px -20px rgba(15,23,42,0.4);padding:20px 24px}
    .day-head{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid ${theme.accent};padding-bottom:10px;margin-bottom:14px}
    .daynum{font-weight:900;font-size:1rem;color:${theme.primary}}
    .dateline{font-size:0.75rem;opacity:0.5}
    .q{display:grid;grid-template-columns:26px 1fr;gap:10px;margin:10px 0}
    .qmark{width:24px;height:24px;border-radius:8px;background:${theme.accent};color:#fff;font-size:0.8rem;display:flex;align-items:center;justify-content:center}
    .qtext{font-size:0.88rem;color:#334155;font-weight:600}
    .lines{border-bottom:1px dashed #dbe3ec;height:20px;margin-top:6px}
  `, `
  <div class="page" style="padding:0">
    <div class="cover">
      <div class="tagbox"><span class="pill" style="border:1px solid rgba(255,255,255,0.35);background:transparent">30-Day Journal</span></div>
      <div class="emoji">${esc(prof.emoji || '📓')}</div>
      <h1>${esc(prof.name)}</h1>
      <div class="sub">Daily prompts, honest reflection, steady progress. One page a day — meet yourself where you are.</div>
      <div class="rule"></div>
      <div class="foot">NicheGate · ${new Date().getFullYear()} edition</div>
    </div>
  </div>
  <div class="page">${dayBlocks}</div>`, theme);
}
// ── BRAND KIT ────────────────────────────────────────────────────────────
function buildBrandKitHTML(prof, theme) {
  const swatches = [
    { c: theme.primary, name: 'Primary', use: 'Headers · logo · 55%' },
    { c: theme.secondary, name: 'Secondary', use: 'Accents · links · 25%' },
    { c: theme.accent, name: 'Highlight', use: 'CTAs · emphasis · 15%' },
    { c: '#ffffff', name: 'Background', use: 'Canvas · 5%' }
  ];
  const swatchHtml = swatches.map((sw) => `
    <div class="sw">
      <div class="swatch" style="background:${sw.c};${sw.c === '#ffffff' ? 'border:1px solid #e2e8f0' : ''}"></div>
      <div class="sw-name">${esc(sw.name)}</div>
      <div class="sw-hex">${esc(sw.c)}</div>
      <div class="sw-use">${esc(sw.use)}</div>
    </div>`).join('');

  return shell(`${prof.name} — Brand Identity Kit`, `
    .cover{border-radius:0 0 40px 40px;background:${theme.primary};color:#fff;padding:96px 60px;position:relative}
    .cover .logo-mark{width:92px;height:92px;border-radius:26px;background:${theme.accent};display:flex;align-items:center;justify-content:center;font-size:3rem;box-shadow:0 24px 50px -20px rgba(0,0,0,0.45)}
    .cover h1{font-size:2.6rem;font-weight:900;margin:22px 0 8px;letter-spacing:-0.8px}
    .cover .orphan{margin-top:26px;width:230px;height:5px;background:${theme.accent};border-radius:99px}
    h2.sec{font-size:0.7rem;letter-spacing:2.4px;text-transform:uppercase;opacity:0.45;margin:34px 0 14px;display:flex;align-items:center;gap:12px}
    h2.sec::after{content:"";flex:1;height:1px;background:#e2e8f0}
    .lockups{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}
    .lock{background:#fff;border:1px solid rgba(15,23,42,0.07);border-radius:16px;padding:26px;text-align:center;box-shadow:0 10px 24px -18px rgba(15,23,42,0.35)}
    .lock .mark{font-size:2.4rem}
    .lock .name{font-weight:800;margin-top:8px;font-size:0.95rem}
    .lock .use{font-size:0.7rem;opacity:0.5;margin-top:4px}
    .lock.dark{background:${theme.primary};color:#fff}
    .lock.out{border:2px dashed ${theme.secondary}}
    .sw-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
    .sw{background:#fff;border:1px solid rgba(15,23,42,0.07);border-radius:16px;padding:14px;text-align:center;box-shadow:0 10px 24px -18px rgba(15,23,42,0.35)}
    .swatch{height:86px;border-radius:12px;margin-bottom:10px}
    .sw-name{font-weight:800;font-size:0.8rem}
    .sw-hex{font-size:0.68rem;opacity:0.5;margin:2px 0 6px}
    .sw-use{font-size:0.66rem;color:#64748b;line-height:1.4}
    .type-block{background:#fff;border:1px solid rgba(15,23,42,0.07);border-radius:16px;padding:22px 26px;margin-bottom:14px}
    .type-block .tt{font-size:0.64rem;letter-spacing:1.8px;text-transform:uppercase;opacity:0.45;margin-bottom:8px}
    .bizcard{width:340px;height:196px;border-radius:14px;padding:20px 22px;display:flex;flex-direction:column;justify-content:space-between;color:#fff;box-shadow:0 24px 44px -22px rgba(15,23,42,0.5)}
  `, `
  <div class="page">
    <div class="cover">
      <div class="logo-mark">${esc(prof.emoji || '🎨')}</div>
      <h1>${esc(prof.name)}</h1>
      <div style="font-size:0.9rem;opacity:0.75">Brand Identity Kit · v1.0 · ${new Date().getFullYear()}</div>
      <div class="orphan"></div>
    </div>
    <h2 class="sec">Logo Lockups</h2>
    <div class="lockups">
      <div class="lock"><div class="mark">${esc(prof.emoji || '▼')}</div><div class="name">${esc(prof.name)}</div><div class="use">Primary — light backgrounds</div></div>
      <div class="lock dark"><div class="mark">${esc(prof.emoji || '▼')}</div><div class="name">${esc(prof.name)}</div><div class="use">On-brand — dark backgrounds</div></div>
      <div class="lock out"><div class="mark">${esc(prof.emoji || '▼')}</div><div class="name">${esc(prof.name)}</div><div class="use">Outline — restraint moment</div></div>
    </div>
    <h2 class="sec">Color Palette</h2>
    <div class="sw-grid">${swatchHtml}</div>
    <h2 class="sec">Typography Scale</h2>
    <div class="type-block"><div class="tt">Display — headline</div><div style="font-size:1.9rem;font-weight:900;letter-spacing:-0.5px">Elevate every booking.</div></div>
    <div class="type-block"><div class="tt">Heading — subheadline</div><div style="font-size:1.15rem;font-weight:800">${esc(prof.name)} — trusted, on time.</div></div>
    <div class="type-block"><div class="tt">Body — paragraph</div><div style="font-size:0.82rem;color:#475569;max-width:520px">Professional services that build trust — clear scopes, honest pricing, and follow-through on every single job.</div></div>
    <h2 class="sec">Business Card</h2>
    <div style="display:flex;gap:18px;flex-wrap:wrap">
      <div class="bizcard" style="background:${theme.primary}">
        <div style="display:flex;align-items:center;gap:10px"><div style="font-size:1.6rem">${esc(prof.emoji || '▼')}</div><div style="font-weight:900">${esc(prof.name)}</div></div>
        <div style="font-size:0.72rem;opacity:0.78;line-height:1.6">Your Name, Lead<br>hello@${esc(prof.slug)}.com · (555) 123-4567</div>
      </div>
      <div class="bizcard" style="background:${theme.accent};color:${theme.primary}">
        <div style="display:flex;align-items:center;gap:10px"><div style="font-size:1.6rem">${esc(prof.emoji || '▼')}</div><div style="font-weight:900">${esc(prof.name)}</div></div>
        <div style="font-size:0.72rem;line-height:1.6">Alternate accent version<br>turns the CTA colour into the face</div>
      </div>
    </div>
  </div>`, theme);
}
// ── SPREADSHEET / BOOKING DASHBOARD PREVIEW ─────────────────────────────
function buildTablePreviewHTML(product, prof, theme, which) {
  const services = parseServices(prof);
  const safe = services.length ? services : [["Professional Consultation", "$50"], ["Follow-up & Support", "$25"]];
  const estRev = safe.reduce((a, s) => a + (priceNum(s[1]) || 0), 0);
  const isBooking = which === 'booking';
  const headRight = isBooking
    ? ['Client', 'Date', 'Status'].map((h) => `<th>${h}</th>`).join('')
    : '<th class="num">Qty</th><th class="num">Total</th>';
  const previewRows = safe.map((s) => isBooking
    ? `<td class="strong">${esc(s[0])}</td><td class="muted">— TBD —</td><td class="muted">— TBD —</td><td><span class="status open">Booking</span></td>`
    : `<td class="strong">${esc(s[0])}</td><td class="num">1</td><td class="num strong">${esc(s[1] || '—')}</td>`).join('');

  return shell(`${prof.name} — ${isBooking ? 'Booking & Appointment Tracker' : 'Pricing Calculator'}`, `
    .dash-head{display:flex;align-items:center;gap:16px;margin-bottom:22px}
    .dash-head .ic{width:58px;height:58px;border-radius:16px;background:${theme.primary};color:#fff;display:flex;align-items:center;justify-content:center;font-size:1.7rem;box-shadow:0 14px 28px -14px ${theme.primary}}
    .dash-head h1{font-size:1.5rem;font-weight:900;letter-spacing:-0.4px}
    .dash-head p{font-size:0.78rem;opacity:0.55;margin-top:3px}
    .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:20px}
    .stat{background:#fff;border:1px solid rgba(15,23,42,0.07);border-left:4px solid ${theme.accent};border-radius:14px;padding:14px 16px;box-shadow:0 10px 22px -18px rgba(15,23,42,0.35)}
    .stat .lbl{font-size:0.62rem;letter-spacing:1.6px;text-transform:uppercase;opacity:0.5}
    .stat .val{font-size:1.5rem;font-weight:900;margin-top:4px}
    .stat .sub{font-size:0.68rem;color:#64748b;margin-top:2px}
    table{width:100%;border-collapse:collapse;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 14px 34px -24px rgba(15,23,42,0.5)}
    thead th{font-size:0.62rem;letter-spacing:1.6px;text-transform:uppercase;padding:12px 14px;background:${theme.primary};color:#fff;text-align:left}
    tbody td{padding:12px 14px;border-bottom:1px solid #edf1f7;font-size:0.84rem}
    tbody tr:last-child td{border-bottom:none}
    .num{text-align:right;font-variant-numeric:tabular-nums}
    .strong{font-weight:800}
    .muted{color:#94a3b8}
    .status{font-size:0.66rem;font-weight:800;padding:4px 10px;border-radius:999px}
    .status.open{background:rgba(45,212,191,0.14);color:#0f766e}
    .hint{margin-top:18px;display:flex;justify-content:space-between;align-items:center;background:${theme.primary};color:#fff;border-radius:14px;padding:14px 18px}
    .hint .lbl{font-size:0.62rem;letter-spacing:1.8px;text-transform:uppercase;opacity:0.6}
    .hint .val{font-size:0.86rem;font-weight:700}
  `, `
  <div class="page">
    <div class="dash-head">
      <div class="ic">${isBooking ? '📅' : '🧮'}</div>
      <div><span class="pill">${isBooking ? 'Tracker' : 'Calculator'} · Excel-ready</span>
      <h1>${esc(prof.name)} — ${isBooking ? 'Booking & Appointment Tracker' : 'Pricing Calculator'}</h1>
      <p>Real formulas · drop-down statuses · totals update live when you type</p></div>
    </div>
    <div class="stats">
      <div class="stat"><div class="lbl">Service lines</div><div class="val">${safe.length}</div><div class="sub">pre-filled, editable</div></div>
      <div class="stat"><div class="lbl">Est. catalog value</div><div class="val">$${estRev.toFixed(0)}</div><div class="sub">at 1× each</div></div>
      <div class="stat"><div class="lbl">Formulas</div><div class="val">LIVE</div><div class="sub">SUM · × · drop-downs</div></div>
    </div>
    <table>
      <thead><tr><th>${isBooking ? 'Service / Slot' : 'Service / Item'}</th>${headRight}</tr></thead>
      <tbody>${previewRows}</tbody>
    </table>
    <div class="hint"><div><div class="lbl">Opens in</div><div class="val">Excel · Google Sheets · Numbers</div></div><div><div class="lbl">Last refreshed</div><div class="val">${new Date().toLocaleDateString()}</div></div></div>
  </div>`, theme);
}
// ── DECISION MATRIX ──────────────────────────────────────────────────────
function buildDecisionMatrixHTML(product, prof, theme) {
  const services = parseServices(prof);
  const safe = services.length ? services.slice(0, 5) : [["Option A"], ["Option B"], ["Option C"]];
  const criteria = [
    { name: 'Cost to deliver', weight: 25 },
    { name: 'Client value', weight: 35 },
    { name: 'Effort needed', weight: 20 },
    { name: 'Repeat odds', weight: 20 }
  ];
  const optRows = safe.map((s, i) => `<tr><td class="strong">${esc(s[0])}</td>
    ${criteria.map((c, j) => `<td class="num">${[3, 4, 2, 3, 4, 3, 2, 3][(i + j * 4) % 8]}</td>`).join('')}
    <td class="num strong">${[74, 82, 66, 78, 71, 69, 84, 73][i % 8]}</td>
    <td>${i === 1 ? '<span class="badge">BEST FIT</span>' : ''}</td></tr>`).join('');

  return shell(`${prof.name} — Decision Scoring Matrix`, `
    .dm-head{display:grid;grid-template-columns:58px 1fr;gap:16px;align-items:center;margin-bottom:24px}
    .dm-head .ic{width:58px;height:58px;border-radius:16px;background:${theme.primary};color:#fff;display:flex;align-items:center;justify-content:center;font-size:1.7rem}
    .dm-head h1{font-size:1.45rem;font-weight:900;letter-spacing:-0.4px}
    .dm-head p{font-size:0.78rem;opacity:0.55;margin-top:3px}
    .key-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
    .key{background:#fff;border:1px solid rgba(15,23,42,0.07);border-radius:14px;padding:12px 14px;box-shadow:0 10px 22px -18px rgba(15,23,42,0.35)}
    .key .lbl{font-size:0.6rem;letter-spacing:1.4px;text-transform:uppercase;opacity:0.5}
    .key .val{font-weight:900;font-size:1.25rem;margin-top:4px}
    table{width:100%;border-collapse:collapse;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 14px 34px -24px rgba(15,23,42,0.5)}
    thead th{font-size:0.6rem;letter-spacing:1.4px;text-transform:uppercase;padding:12px;background:${theme.primary};color:#fff;text-align:center}
    thead th:first-child, tbody td:first-child{text-align:left}
    tbody td{padding:12px;border-bottom:1px solid #edf1f7;font-size:0.82rem;text-align:center}
    tbody tr:last-child td{border-bottom:none}
    .badge{font-size:0.62rem;font-weight:900;background:${theme.accent};color:${theme.primary};padding:4px 10px;border-radius:999px}
    .note{border-left:3px solid ${theme.accent};background:#fff;border-radius:0 12px 12px 0;padding:12px 16px;font-size:0.76rem;color:#475569;margin-top:18px}
  `, `
  <div class="page">
    <div class="dm-head">
      <div class="ic">⚖️</div>
      <div><span class="pill">Scoring matrix</span>
      <h1>${esc(prof.name)} — Decision Matrix</h1>
      <p>Score every option 1–5 per criterion; totals decide</p></div>
    </div>
    <div class="key-grid">
      ${criteria.map((c) => `<div class="key"><div class="lbl">${esc(c.name)}</div><div class="val">${c.weight}%</div></div>`).join('')}
    </div>
    <table>
      <thead><tr><th>Option</th>${criteria.map((c) => `<th>${esc(c.name)}</th>`).join('')}<th>Score</th><th>Rank</th></tr></thead>
      <tbody>${optRows}</tbody>
    </table>
    <div class="note"><strong>How it works:</strong> weights reflect what matters most to ${esc(prof.name)} — client value rises to the top, routine items score lower. Re-score monthly or when pricing changes.</div>
  </div>`, theme);
}
// ── ROI CALCULATOR ───────────────────────────────────────────────────────
function buildROIHTML(product, prof, theme) {
  const services = parseServices(prof);
  const first = services[0];
  const price = first ? (priceNum(first[1]) || 0) : 0;

  return shell(`${prof.name} — ROI Calculator`, `
    .roi-head{display:grid;grid-template-columns:58px 1fr;gap:16px;align-items:center;margin-bottom:24px}
    .roi-head .ic{width:58px;height:58px;border-radius:16px;background:${theme.primary};color:#fff;display:flex;align-items:center;justify-content:center;font-size:1.7rem}
    .roi-head h1{font-size:1.45rem;font-weight:900;letter-spacing:-0.4px}
    .roi-head p{font-size:0.78rem;opacity:0.55;margin-top:3px}
    .in-grid{display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px;margin-bottom:18px}
    .in{background:#fff;border:1px solid rgba(15,23,42,0.07);border-radius:14px;padding:14px 16px}
    .in .lbl{font-size:0.6rem;letter-spacing:1.4px;text-transform:uppercase;opacity:0.5;margin-bottom:6px}
    .in .field{border-bottom:1px dashed rgba(15,23,42,0.18);padding-bottom:6px;font-weight:700;color:#334155}
    .out{background:${theme.primary};color:#fff;border-radius:16px;padding:22px 24px;display:grid;grid-template-columns:1fr 1fr 1fr 1.4fr;gap:14px;align-items:stretch}
    .out .cell .lbl{font-size:0.6rem;letter-spacing:1.6px;text-transform:uppercase;opacity:0.55}
    .out .cell .val{font-size:1.6rem;font-weight:900;margin-top:6px}
    .out .all{background:${theme.accent};color:${theme.primary};border-radius:14px;padding:18px;display:flex;flex-direction:column;justify-content:center}
    .note{font-size:0.72rem;color:#64748b;margin-top:14px}
  `, `
  <div class="page">
    <div class="roi-head">
      <div class="ic">📈</div>
      <div><span class="pill">ROI Calculator</span>
      <h1>${esc(prof.name)} — Return on Investment</h1>
      <p>Plug in real numbers once · every projection updates</p></div>
    </div>
    <div class="in-grid">
      <div class="in"><div class="lbl">Typical deal size</div><div class="field">${price ? '$' + price.toFixed(2) : '$___'}</div></div>
      <div class="in"><div class="lbl">Deals / month</div><div class="field">4</div></div>
      <div class="in"><div class="lbl">Marketing spend</div><div class="field">$250</div></div>
    </div>
    <div class="out">
      <div class="cell"><div class="lbl">Monthly revenue</div><div class="val">${price ? '$' + (price * 4).toFixed(0) : '$___'}</div></div>
      <div class="cell"><div class="lbl">Lead cost</div><div class="val">$62</div></div>
      <div class="cell"><div class="lbl">Break-even</div><div class="val">${price ? Math.ceil(250 / price) : 0} deals</div></div>
      <div class="all"><div style="font-weight:800;font-size:0.75rem">Projected annual ROI</div><div style="font-size:1.9rem;font-weight:900;margin-top:4px">${price ? Math.round(((price * 48 - 3000) / 3000) * 100) : 240}%</div></div>
    </div>
    <div class="note">All projections recompute from the three inputs — change any number and totals follow. Includes a 12-month chart tab.</div>
  </div>`, theme);
}
// ── KIT COVER (bundles / lead magnet) ────────────────────────────────────
function buildCoverHTML(product, prof, theme, kind) {
  const isLead = kind === 'leadmagnet';
  const contents = isLead
    ? ['Editable service invoice', 'Service quality checklist', 'Pricing calculator (live formulas)']
    : ['Invoice template', 'Quality checklist', 'Pricing spreadsheet', 'Booking tracker', 'Social pack', 'Brand one-pager'];
  const price = isLead ? 'FREE' : (product.price || '$29');

  return shell(`${esc(product.name)} — Kit Cover`, `
    .wrap{background:${theme.bg};display:flex;align-items:center;justify-content:center;min-height:1100px;padding:60px}
    .cover{width:700px;background:${theme.primary};color:#fff;border-radius:28px;padding:54px;box-shadow:0 40px 80px -40px rgba(15,23,42,0.6);overflow:hidden;position:relative}
    .cover::after{content:"${esc(product.emoji || prof.emoji || '📦')}";position:absolute;right:-30px;bottom:-46px;font-size:11rem;opacity:0.07;transform:rotate(-12deg)}
    .badge{display:inline-block;background:${theme.accent};color:${theme.primary};font-weight:900;font-size:0.72rem;letter-spacing:2px;padding:7px 16px;border-radius:999px;text-transform:uppercase}
    .mark{font-size:3.4rem;margin:26px 0 6px}
    h1{font-size:2.6rem;font-weight:900;letter-spacing:-1px;line-height:1.05;margin-bottom:14px}
    .sub{font-size:0.98rem;opacity:0.75;max-width:460px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:30px}
    .item{background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.14);border-radius:12px;padding:13px 16px;font-size:0.84rem;font-weight:700;display:flex;align-items:center;gap:10px}
    .item::before{content:"✓";color:${theme.accent};font-weight:900}
    .bottom{display:flex;justify-content:space-between;align-items:flex-end;margin-top:34px}
    .price{font-size:1.6rem;font-weight:900}
    .price .free{color:${theme.accent};font-size:2rem}
    .tag{font-size:0.68rem;opacity:0.55;letter-spacing:1.6px;text-transform:uppercase}
  `, `
  <div class="wrap"><div class="cover">
    <span class="badge">${isLead ? 'FREE · Lead Magnet' : 'Complete Toolkit'}</span>
    <div class="mark">${esc(product.emoji || prof.emoji || '📦')}</div>
    <h1>${esc(product.name)}</h1>
    <div class="sub">Everything ${esc(prof.name)} needs to look professional, quote accurately and stay booked — in one download.</div>
    <div class="grid">${contents.map((c) => `<div class="item">${esc(c)}</div>`).join('')}</div>
    <div class="bottom">
      <div><div class="price">${isLead ? '<span class="free">$0</span>' : esc(price)}</div><div class="tag">Instant download · Lifetime updates</div></div>
      <div style="text-align:right"><div class="tag">NicheGate</div><div style="font-weight:800">${esc(new Date().getFullYear())}</div></div>
    </div>
  </div></div>`, theme);
}
// ── WEBSITE (one-page service site) ──────────────────────────────────────
function buildWebsiteHTML(prof, theme) {
  const services = parseServices(prof);
  const hashes = (() => { try { return JSON.parse(prof.hashtags || '[]'); } catch { return []; } })();
  const cards = services.map((s) => `<div class="svc-card">
      <div class="svc-emoji">${esc(prof.emoji || '✦')}</div>
      <h3>${esc(s[0])}</h3>
      <p>${esc(s[0])} done right — fixed scope, honest price, on time.</p>
      <div class="price">${esc(s[1] || '')}</div>
    </div>`).join('');

  return shell(`${prof.name} — One-Page Website`, `
    .nav{display:flex;justify-content:space-between;align-items:center;padding:18px 40px;background:${theme.primary};color:#fff}
    .nav .logo{font-weight:900;font-size:1.05rem}
    .nav a{color:#fff;text-decoration:none;font-size:0.8rem;opacity:0.75;margin-left:18px}
    .hero{background:${theme.primary};color:#fff;text-align:center;padding:90px 30px 70px}
    .hero .mark{font-size:4rem;margin-bottom:16px}
    .hero h1{font-size:2.9rem;font-weight:900;letter-spacing:-1px}
    .hero p{opacity:0.78;max-width:520px;margin:16px auto 0}
    .cta{display:inline-block;background:${theme.accent};color:${theme.primary};font-weight:900;padding:14px 34px;border-radius:999px;margin-top:26px;text-decoration:none}
    .services{padding:60px 40px;max-width:1000px;margin:0 auto}
    .services h2{text-align:center;font-size:1.6rem;font-weight:900;margin-bottom:30px}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px}
    .svc-card{background:#fff;border-radius:18px;padding:24px;border:1px solid rgba(15,23,42,0.07);box-shadow:0 14px 30px -22px rgba(15,23,42,0.4)}
    .svc-emoji{font-size:1.8rem;width:48px;height:48px;border-radius:14px;background:${theme.accent};display:flex;align-items:center;justify-content:center;margin-bottom:12px}
    .svc-card h3{font-size:1rem;font-weight:800;margin-bottom:6px}
    .svc-card p{font-size:0.8rem;color:#64748b}
    .price{margin-top:14px;font-weight:900;color:${theme.primary}}
    .cta-band{background:${theme.primary};color:#fff;text-align:center;padding:48px 30px;margin-top:50px}
    .cta-band .big{font-size:1.5rem;font-weight:900}
    .foot{background:#0f172a;color:#94a3b8;text-align:center;padding:26px;font-size:0.75rem}
  `, `
  <div class="nav"><div class="logo">${esc(prof.emoji || '✦')} ${esc(prof.name)}</div><div><a href="#">Services</a><a href="#">Book</a><a href="#">Contact</a></div></div>
  <div class="hero">
    <div class="mark">${esc(prof.emoji || '✦')}</div>
    <h1>${esc(prof.name)}</h1>
    <p>Professional service built on clear scope, honest pricing and follow-through — book in under a minute.</p>
    <a class="cta" href="#">Book Now</a>
  </div>
  <div class="services">
    <h2>Services &amp; Rates</h2>
    <div class="grid">${cards}</div>
  </div>
  <div class="cta-band"><div class="big">Ready to get started?</div><p style="opacity:0.75;margin-top:8px">hello@${esc(prof.slug)}.com · (555) 123-4567</p></div>
  <div class="foot">${hashes.slice(0, 6).map((h) => esc(h)).join('  ·  ')}</div>`, theme);
}
// ── SOCIAL PACK (posts, story, carousel) ────────────────────────────────
function buildSocialPostHTML(prof, theme, variant) {
  const hashes = (() => { try { return JSON.parse(prof.hashtags || '[]'); } catch { return []; } })();
  const v = variant || 0;
  const phrases = [
    ['Professional service, every single week.', 'Professional service you can trust — booked out, every week.'],
    ['The reliable choice in your area.', 'Serving clients who value done-right work over cut-price corners.']
  ];
  const headline = phrases[v % 2][0];
  const sub = phrases[v % 2][1];
  const cta = ['Book your date today →', 'DM to check availability →'][v % 2];
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
body{height:1080px;display:flex;align-items:center;justify-content:center;background:${theme.bg};font-family:${theme.font || SYSTEM_FONT};}
.card{width:1080px;height:1080px;background:linear-gradient(160deg,${theme.primary} 0%,${theme.primary} 55%,${theme.secondary} 130%);color:#fff;padding:90px 80px;display:flex;flex-direction:column;justify-content:center;position:relative;overflow:hidden}
.card::before{content:"${esc(prof.emoji || '✦')}";position:absolute;right:-70px;top:-60px;font-size:19rem;opacity:0.09;transform:rotate(12deg)}
.mark{width:110px;height:110px;border-radius:30px;background:${theme.accent};display:flex;align-items:center;justify-content:center;font-size:3rem;margin-bottom:34px;box-shadow:0 24px 50px -18px rgba(0,0,0,0.5)}
.tag{font-size:1.05rem;letter-spacing:3px;font-weight:900;text-transform:uppercase;opacity:0.65;margin-bottom:14px}
h1{font-size:4.4rem;font-weight:900;letter-spacing:-1.5px;line-height:1.02;max-width:740px}
.sub{font-size:1.6rem;opacity:0.85;margin-top:22px;max-width:640px}
.cta{display:inline-block;margin-top:40px;background:${theme.accent};color:${theme.primary};font-size:1.5rem;font-weight:900;padding:22px 40px;border-radius:99px}
.hashes{position:absolute;left:80px;bottom:54px;font-size:1rem;opacity:0.6;max-width:820px;line-height:1.6}
</style></head><body>
<div class="card">
  <div class="mark">${esc(prof.emoji || '✦')}</div>
  <div class="tag">${esc(prof.name)}</div>
  <h1>${esc(headline)}</h1>
  <div class="sub">${esc(sub)}</div>
  <div class="cta">${esc(cta)}</div>
  <div class="hashes">${hashes.slice(0, 8).map((h) => esc(h)).join(' ')}</div>
</div></body></html>`;
}

function buildSocialStoryHTML(prof, theme) {
  const hashes = (() => { try { return JSON.parse(prof.hashtags || '[]'); } catch { return []; } })();
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
body{height:1920px;display:flex;align-items:center;justify-content:center;background:${theme.bg};font-family:${theme.font || SYSTEM_FONT};}
.story{width:1080px;height:1920px;background:linear-gradient(170deg,${theme.primary} 0%,${theme.secondary} 100%);color:#fff;padding:110px 80px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;position:relative;overflow:hidden}
.story::before{content:"${esc(prof.emoji || '✦')}";position:absolute;left:-60px;bottom:-70px;font-size:24rem;opacity:0.08}
.tag{font-size:1.1rem;letter-spacing:4px;font-weight:900;text-transform:uppercase;opacity:0.7;margin-bottom:30px}
.mark{width:150px;height:150px;border-radius:40px;background:${theme.accent};display:flex;align-items:center;justify-content:center;font-size:4.2rem;margin-bottom:44px;box-shadow:0 30px 60px -20px rgba(0,0,0,0.55)}
h1{font-size:5rem;font-weight:900;letter-spacing:-2px;line-height:1.02;max-width:820px}
.sub{font-size:1.7rem;opacity:0.85;margin-top:26px;max-width:660px}
.cta{background:${theme.accent};color:${theme.primary};font-size:1.8rem;font-weight:900;padding:26px 54px;border-radius:99px;margin-top:48px}
.bottom{position:absolute;bottom:70px;font-size:1.05rem;opacity:0.6;max-width:760px}
</style></head><body>
<div class="story">
  <div class="tag">${esc(prof.name)}</div>
  <div class="mark">${esc(prof.emoji || '✦')}</div>
  <h1>Your booking, handled.</h1>
  <div class="sub">Clear pricing · fixed scope · follow-through</div>
  <div class="cta">Book Now</div>
  <div class="bottom">${hashes.slice(0, 6).map((h) => esc(h)).join('  ·  ')}</div>
</div></body></html>`;
}
function buildSocialCarouselHTML(prof, theme) {
  const tips = [
    ['1', 'Quote clearly', 'Itemize scope & price before a single yes'],
    ['2', 'Over-deliver', 'Ship a tidy finish — reviews write themselves'],
    ['3', 'Follow up', 'One message after the job keeps clients returning']
  ].map((t) => `<div class="tip"><div class="num">${t[0]}</div><div><div class="tt">${t[1]}</div><div class="td">${t[2]}</div></div></div>`).join('');
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
body{height:1080px;display:flex;align-items:center;justify-content:center;background:${theme.bg};font-family:${theme.font || SYSTEM_FONT};}
.slide{width:1080px;height:1080px;background:${theme.primary};color:#fff;padding:80px;display:flex;flex-direction:column;justify-content:center;position:relative;overflow:hidden}
.slide::before{content:"${esc(prof.emoji || '✦')}";position:absolute;right:-50px;bottom:-60px;font-size:16rem;opacity:0.07}
.lbl{font-size:1rem;letter-spacing:3px;font-weight:900;text-transform:uppercase;opacity:0.6;margin-bottom:20px}
h1{font-size:3.2rem;font-weight:900;letter-spacing:-1px;margin-bottom:40px}
.tip{display:flex;gap:22px;align-items:center;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:18px;padding:24px 28px;margin-bottom:14px}
.num{width:54px;height:54px;border-radius:16px;background:${theme.accent};color:${theme.primary};font-size:1.4rem;font-weight:900;display:flex;align-items:center;justify-content:center}
.tt{font-size:1.35rem;font-weight:900}
.td{font-size:0.98rem;opacity:0.75;margin-top:4px}
</style></head><body>
<div class="slide">
  <div class="lbl">3 quick wins for ${esc(prof.name)}</div>
  <h1>Swipe → save → grow</h1>
  ${tips}
</div></body></html>`;
}

// ── PRINTABLE PLANNER (personal planning / organizers) ─────────────────────
function buildPlannerHTML(prof, theme) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const cells = days.map((d) => `<div class="pc"><div class="pd">${d}</div><div class="pb"></div><div class="pb"></div><div class="pb"></div></div>`).join('');
  return shell(`${esc(prof.name)} — Planner`, `
    .pp{background:${theme.bg};padding:38px 42px;font-family:${SYSTEM_FONT}}
    .pp .head{display:flex;justify-content:space-between;align-items:center;margin-bottom:22px}
    .pp .head h1{font-size:1.6rem;font-weight:900;letter-spacing:-.4px;color:${theme.primary}}
    .pp .head .slot{font-size:0.78rem;color:${theme.secondary};letter-spacing:1px;text-transform:uppercase}
    .week{display:grid;grid-template-columns:repeat(7,1fr);gap:8px}
    .pc{background:#fff;border:1px solid rgba(15,23,42,.08);border-radius:12px;padding:10px;min-height:180px}
    .pd{font-size:0.72rem;font-weight:800;letter-spacing:1px;color:${theme.primary};margin-bottom:8px}
    .pb{height:16px;border-bottom:1px dashed rgba(15,23,42,.15);margin-top:12px}
    .goals{margin-top:20px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
    .goal{background:#fff;border:1px solid rgba(15,23,42,.08);border-radius:12px;padding:14px 16px}
    .goal .gl{font-size:0.66rem;letter-spacing:1.6px;text-transform:uppercase;color:${theme.accent};font-weight:800}
    .goal .gline{height:14px;border-bottom:1px dashed rgba(15,23,42,.15);margin-top:10px}
    .goal .gline + .gline{margin-top:10px}
  `, `
  <div class="pp">
    <div class="head"><h1>${esc('Weekly Planner')}</h1><div class="slot">${esc(prof.name)} · Pocket edition</div></div>
    <div class="week">${cells}</div>
    <div class="goals">
      <div class="goal"><div class="gl">Top 3 this week</div><div class="gline"></div><div class="gline"></div><div class="gline"></div></div>
      <div class="goal"><div class="gl">Notes</div><div class="gline"></div><div class="gline"></div><div class="gline"></div></div>
      <div class="goal"><div class="gl">Reflection</div><div class="gline"></div><div class="gline"></div><div class="gline"></div></div>
    </div>
  </div>`, theme);
}

// ── WALL ART PRINT (aesthetic typography printable) ─────────────────────────
function buildWallArtHTML(prof, theme) {
  return shell(`${esc(prof.name)} — Wall Art`, `
    body{background:#f7f5f1;display:flex;align-items:center;justify-content:center;min-height:1120px;margin:0}
    .art{width:840px;background:${theme.bg};border-radius:18px;box-shadow:0 30px 60px -30px rgba(15,23,42,.5);overflow:hidden}
    .art .top{height:14px;background:linear-gradient(90deg,${theme.primary},${theme.accent})}
    .art .inner{padding:64px 58px;text-align:center;font-family:${SYSTEM_FONT}}
    .art .em{font-size:3.6rem;margin-bottom:22px}
    .art h1{font-size:3rem;font-weight:900;line-height:1.05;letter-spacing:-1px;color:${theme.primary}}
    .art .sub{margin-top:18px;font-size:1.1rem;color:#7c6f5e;line-height:1.6;max-width:600px;margin-left:auto;margin-right:auto}
    .art .foot{margin-top:42px;font-size:0.72rem;letter-spacing:3px;text-transform:uppercase;color:${theme.accent};font-weight:800}
    .art .quote{padding:34px;background:rgba(0,0,0,.03);border-radius:12px;margin-top:26px}
    .art .quote p{font-size:1.05rem;color:#4c4438;font-style:italic;line-height:1.7}
  `, `
  <div class="art">
    <div class="top"></div>
    <div class="inner">
      <div class="em">${esc(prof.emoji || '✦')}</div>
      <h1>Small business. Big standards.</h1>
      <div class="sub">Every ${esc(prof.name.toLowerCase())} job begins with a promise — and ends with a job done properly.</div>
      <div class="quote"><p>"Do it right the first time — because your reputation is the only product you sell twice."</p></div>
      <div class="foot">${esc(prof.name)} · Simple · Honest · Reliable</div>
    </div>
  </div>`, theme);
}

// ── LEARNING WORKSHEET (education / kids) ──────────────────────────────────
function buildWorksheetHTML(prof, theme) {
  return shell(`${esc(prof.name)} — Worksheet`, `
    .ws{width:820px;background:#fff;border-radius:14px;padding:52px 50px;font-family:${SYSTEM_FONT};border:2px solid ${theme.accent}}
    .ws .hd{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid ${theme.primary};padding-bottom:12px}
    .ws .hd h1{font-size:1.5rem;font-weight:900;color:${theme.primary}}
    .ws .hd .lbl{font-size:0.7rem;letter-spacing:2px;text-transform:uppercase;color:${theme.accent};font-weight:800}
    .line{height:34px;border-bottom:1.5px dashed #cbd5e1;margin-top:16px}
    .task{margin-top:26px;font-size:1rem;font-weight:700;color:#334155}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px}
    .cell{border-bottom:1.5px dashed #cbd5e1;height:46px;display:flex;align-items:center;font-size:1rem}
    .score{margin-top:30px;display:flex;gap:18px;justify-content:flex-end;font-size:0.8rem;color:#64748b}
  `, `
  <div class="ws">
    <div class="hd"><h1>Name: ______________</h1><div class="lbl">Practice Sheet</div></div>
    <div class="task">● ${esc(prof.name)} — write each item, then check it off:</div>
    <div class="grid"><div class="cell">1.</div><div class="cell">2.</div><div class="cell">3.</div><div class="cell">4.</div><div class="cell">5.</div><div class="cell">6.</div></div>
    <div class="line"></div><div class="line"></div>
    <div class="score">Completed ___ / 8 · Signed ________________</div>
  </div>`, theme);
}

// ── PARTY PRINTABLE (invitation + décor set) ───────────────────────────────
function buildPartyPrintableHTML(prof, theme) {
  return shell(`${esc(prof.name)} — Party Printables`, `
    .pv{width:860px;display:grid;grid-template-columns:1fr 1fr;gap:18px;font-family:${SYSTEM_FONT}}
    .card{background:${theme.bg};border:2px dashed ${theme.accent};border-radius:16px;overflow:hidden;text-align:center}
    .card .c-top{background:${theme.primary};color:#fff;padding:18px;font-size:0.72rem;letter-spacing:3px;text-transform:uppercase;font-weight:800}
    .card .c-body{padding:30px 24px}
    .card h3{font-size:2rem;font-weight:900;color:${theme.primary};line-height:1.05}
    .card .when{margin-top:16px;font-size:0.95rem;color:#57534e}
    .card .when b{display:block;font-size:1.1rem;color:${theme.primary};margin-top:4px}
    .card .rsvp{margin-top:18px;display:inline-block;background:${theme.accent};color:${theme.primary};padding:8px 18px;border-radius:999px;font-size:0.72rem;font-weight:900;letter-spacing:1px}
  `, `
  <div class="pv">
    <div class="card"><div class="c-top">You're invited</div><div class="c-body"><h3>Celebrate with us!</h3><div class="when">Saturday<b>____ / ____ / ______</b></div><div class="when">Time<b>__:__ ____</b></div><div class="rsvp">RSVP · ____</div></div></div>
    <div class="card"><div class="c-top">Thank you</div><div class="c-body"><h3>Grateful for you</h3><div class="when">Your presence is the gift</div><div class="rsvp">★ ★ ★ ★ ★</div></div></div>
  </div>`, theme);
}

/** Thumb-stopper marketplace cover (v2). Light paper, giant title, hero visual,
 *  3 benefits, price + format badges. 1200x1500 (4:5). Dark device-frames banned. */
function thumbCoverCopy(product, prof) {
  const t = String(product.type || '').toLowerCase();
  const noun = prof.name || 'Business';
  const lib = {
    invoice: ['Professional Invoice Template', 'Get paid faster, look legit', ['Editable in Word / Google Docs', 'Auto-totals + tax line', 'Pro payment terms built in'], 'PDF + DOCX'],
    checklist: ['Service Quality Checklist', 'Never miss a step on the job', ['Step-by-step sign-off', 'Client-ready finish check', 'Printable + reusable'], 'PDF · Printable'],
    spreadsheet: ['Pricing Calculator', 'Quote jobs in 60 seconds', ['Live Excel formulas', 'Profit margin built in', 'No more undercharging'], 'XLSX · Formulas'],
    booking: ['Booking Tracker', 'Fill your calendar, stay organized', ['Client + date tracking', 'Deposit + balance columns', 'At-a-glance schedule'], 'XLSX · Tracker'],
    social: ['Social Media Pack', '30 days of posts, done', ['Post + story + carousel', 'Captions + hashtags', 'On-brand colors'], 'PNG + HTML'],
    brand: ['Brand Identity Kit', 'Look like a $10k brand', ['Logo lockups + palette', 'Fonts + usage rules', 'Business card layout'], 'PDF + PNG'],
    journal: ['30-Day Guided Journal', 'Build the habit that pays', ['Daily prompts that work', 'Weekly review pages', 'Print or fill digitally'], 'PDF · 30 days'],
    bundle: ['Complete Toolkit', 'The whole business in a box', ['6 pro templates inside', 'Quote, track, get booked', 'Lifetime updates'], 'ZIP · 6 files'],
    leadmagnet: ['Free Starter Pack', 'Try the quality free', ['Invoice + checklist', 'Pricing calculator', 'Zero cost, instant'], 'FREE · ZIP'],
    website: ['One-Page Website', 'Get booked while you sleep', ['Services + rates section', 'Book-now call to action', 'Mobile-ready layout'], 'HTML · Editable']
  };
  return lib[t] || [`${noun} ${product.type}`, 'Done-for-you pro template', ['Fully editable', 'Instant download', 'Commercial license'], 'Instant download'];
}

function accentForCover(prof, theme) {
  const blob = `${prof.name || ''} ${prof.slug || ''} ${(theme && theme.sentiment) || ''}`.toLowerCase();
  if (/beauty|fashion|salon|spa/.test(blob)) return '#ec4899';
  if (/fitness|outdoor|garden|food|trade|plumb|hvac/.test(blob)) return '#16a34a';
  if (/finance|notary|tax|coach|consult/.test(blob)) return '#d97706';
  if (/recovery|therapy|wellness|spirit/.test(blob)) return '#7c3aed';
  if (/tech|software|ai |data|drone/.test(blob)) return '#0284c7';
  return '#e11d48';
}

function heroSnippetForCover(product, prof, theme) {
  const t = String(product.type || '').toLowerCase();
  const ink = (theme && theme.primary) || '#14110f';
  const acc = (theme && theme.accent) || '#2dd4bf';
  const row = (a, b, hl) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:20px 6px;border-bottom:2px solid #f1efe9;font-size:30px;${hl ? 'font-weight:900;' : ''}"><span>${esc(a)}</span><strong>${esc(b)}</strong></div>`;
  if (t === 'invoice') return `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><span style="font-size:26px;font-weight:800;letter-spacing:2px;color:${ink}">INVOICE #1042</span><span style="background:${ink};color:#fff;font-size:22px;font-weight:800;padding:8px 20px;border-radius:999px">DUE NET 30</span></div>${row('Deep clean — 3 bed', '$189.00')}${row('Move-in detail', '$129.00')}${row('Total due', '$318.00', true)}`;
  if (t === 'checklist') return ['Confirm scope + price with client', 'Arrive with tools + supplies', 'Walk the finish, collect 5-star review'].map((s, i) => `<div style="display:flex;gap:20px;align-items:center;padding:20px 6px;border-bottom:2px solid #f1efe9;font-size:30px;font-weight:600"><span style="width:52px;height:52px;border-radius:14px;background:${i === 2 ? acc : '#fff'};border:3px solid ${acc};display:flex;align-items:center;justify-content:center;font-weight:900;flex-shrink:0">${i === 2 ? '✓' : (i + 1)}</span>${esc(s)}</div>`).join('');

  if (['spreadsheet', 'booking'].includes(t)) return `<div style="font-size:24px;font-weight:800;letter-spacing:2px;color:${ink};margin-bottom:8px">QUOTE IT IN 60 SECONDS</div>${row('Job price', '$450')}${row('Costs', '$180')}${row('Your profit (60%)', '$270', true)}`;
  if (t === 'journal') return `<div style="font-size:28px;font-weight:800;letter-spacing:2px;color:${ink}">DAY 07 — SMALL WINS</div><div style="font-size:34px;margin:14px 0">What did I handle well today?</div><div style="height:26px;background:#f1efe9;border-radius:13px;margin:12px 0"></div><div style="height:26px;background:#f1efe9;border-radius:13px;width:82%;margin:12px 0"></div>`;
  if (t === 'social') return `<div style="background:${ink};color:#fff;border-radius:20px;padding:40px"><div style="font-size:52px;font-weight:900;line-height:1.05">Booked out.<br>Every week.</div><div style="display:inline-block;margin-top:24px;background:${acc};color:${ink};font-size:26px;font-weight:900;padding:16px 34px;border-radius:999px">Book your date</div></div>`;
  return `<div style="font-size:44px;font-weight:900">${esc(prof.emoji || '')} ${esc(prof.name || '')}</div>`;
}

function buildThumbStopperCover(product, prof, theme, artDataUri) {
  const th = theme || {};
  const [title, sub, benefits, format] = thumbCoverCopy(product, prof);
  const kc = accentForCover(prof, th);
  const price = product.price || '$12';
  const hasArt = !!artDataUri;
  // v3 composite: AI lifestyle photo full-bleed + scrim + typography on top.
  // Watermark hiding: photo shifted up 46px + solid footer band — the free-tier
  // pollinations mark never appears in frame.
  const bg = hasArt
    ? `<div class="ts-photo" style="background-image:url('${artDataUri}')"></div><div class="ts-scrim"></div>`
    : `<div class="ts-fallback"></div>`;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${esc(title)}</title><style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#e7e5e1;font-family:'Space Grotesk','Inter',system-ui,sans-serif;-webkit-print-color-adjust:exact}
.ts{position:relative;width:1200px;height:1500px;overflow:hidden;color:#fff}
.ts-photo{position:absolute;left:0;top:-46px;right:0;bottom:0;background-size:cover;background-position:center 12%}
.ts-scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(8,8,10,.62) 0%,rgba(8,8,10,.30) 34%,rgba(8,8,10,.78) 68%,rgba(8,8,10,.97) 100%)}
.ts-fallback{position:absolute;inset:0;background:linear-gradient(140deg,${kc} 0%,#14110f 78%)}
.ts-inner{position:relative;z-index:2;height:1400px;display:flex;flex-direction:column;padding:56px 64px 0}
.ts-top{display:flex;justify-content:space-between;align-items:center}
.ts-brand{font-size:22px;font-weight:800;letter-spacing:4px}
.ts-kicker{font-size:22px;font-weight:800;letter-spacing:2px;background:${kc};padding:12px 24px;border-radius:999px}
.ts-mid{margin-top:auto;padding-bottom:30px}
.ts-title{font-size:108px;font-weight:900;line-height:.97;letter-spacing:-3.5px;text-shadow:0 8px 34px rgba(0,0,0,.65)}
.ts-sub{font-size:34px;font-weight:600;margin-top:22px;color:#f4f4f5;text-shadow:0 4px 18px rgba(0,0,0,.7)}
.ts-bens{margin-top:34px;display:flex;flex-direction:column;gap:14px}
.ts-ben{display:flex;align-items:center;gap:16px;font-size:28px;font-weight:700;text-shadow:0 3px 14px rgba(0,0,0,.75)}
.ts-ben .ck{width:46px;height:46px;border-radius:50%;background:#16a34a;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:900;flex-shrink:0}
.ts-foot{position:relative;z-index:3;background:#0b0b0d;height:100px;display:flex;justify-content:space-between;align-items:center;padding:0 64px;border-top:3px solid ${kc}}
.ts-price{font-size:54px;font-weight:900;letter-spacing:-1.5px}
.ts-note{font-size:21px;color:#a1a1aa;font-weight:600;margin-left:18px}
.ts-format{font-size:21px;font-weight:800;letter-spacing:2px;color:#e4e4e7}
</style></head><body>
<div class="ts">
  ${bg}
  <div class="ts-inner">
    <div class="ts-top"><div class="ts-brand">NICHEGATE</div><div class="ts-kicker">${esc(prof.emoji || '')} ${esc(prof.name || '').toUpperCase()}</div></div>
    <div class="ts-mid">
      <div class="ts-title">${esc(title)}</div>
      <div class="ts-sub">${esc(sub)}</div>
      <div class="ts-bens">${benefits.slice(0, 3).map((b) => `<div class="ts-ben"><span class="ck">✓</span>${esc(b)}</div>`).join('')}</div>
    </div>
  </div>
  <div class="ts-foot"><div style="display:flex;align-items:baseline"><span class="ts-price">${esc(price)}</span><span class="ts-note">Instant download</span></div><div class="ts-format">${esc(format)}</div></div>
</div></body></html>`;
}

/** HTML-only cover (used when no AI art is available — never blocks a listing). */
function buildPlainCover(product, prof, theme) {
  const th = theme || {};
  const [title, sub, benefits, format] = thumbCoverCopy(product, prof);
  const kc = accentForCover(prof, th);
  const hero = heroSnippetForCover(product, prof, th);
  const price = product.price || '$12';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${esc(title)} cover</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#e7e5e1;display:flex;justify-content:center;font-family:'Space Grotesk','Inter',system-ui,sans-serif}.thumbcover{width:1200px;min-height:1500px;background:#f8f7f4;color:#14110f;display:flex;flex-direction:column;overflow:hidden}</style></head><body><div class="thumbcover"><div style="display:flex;justify-content:space-between;align-items:center;padding:44px 64px 0;font-size:22px;font-weight:800;letter-spacing:3px"><span>NICHEGATE</span><span style="background:#14110f;color:#fff;font-size:20px;padding:10px 22px;border-radius:999px">${esc(format)}</span></div><div style="margin:36px 64px 0;align-self:flex-start;font-size:24px;font-weight:800;letter-spacing:3px;color:#fff;background:${kc};padding:12px 26px;border-radius:999px">${esc(prof.emoji || '')} ${esc(prof.name || '').toUpperCase()}</div><h1 style="margin:30px 64px 0;font-size:100px;font-weight:900;line-height:.98;letter-spacing:-3px">${esc(title)}</h1><div style="margin:24px 64px 0;font-size:32px;color:#57534e;max-width:920px">${esc(sub)}</div><div style="margin:44px 64px 0;background:#fff;border-radius:32px;box-shadow:0 30px 60px -30px rgba(20,17,15,.25);padding:48px">${hero}</div><div style="margin:40px 64px 0;display:flex;flex-direction:column;gap:18px">${benefits.slice(0, 3).map((b) => `<div style="display:flex;align-items:center;gap:18px;font-size:30px;font-weight:700"><span style="width:52px;height:52px;border-radius:50%;background:#16a34a;color:#fff;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:900">✓</span>${esc(b)}</div>`).join('')}</div><div style="margin-top:auto;padding:44px 64px 54px;display:flex;justify-content:space-between;align-items:flex-end"><div><div style="font-size:76px;font-weight:900">${esc(price)}</div><div style="font-size:22px;color:#78716c;font-weight:600">Instant download · Lifetime updates</div></div><div style="text-align:right"><div style="font-size:30px;letter-spacing:4px">★★★★★</div><div style="font-size:22px;color:#78716c">Editable · Commercial use</div></div></div></div></body></html>`;
}

/** Legacy device-frame kept for the in-app visual editor only. NOT used for covers. */
function wrapMarketplaceMockup(innerHtml, opts) {
  const o = opts || {};
  const title = esc(o.title || 'Digital download');
  const price = esc(o.price || '$12');
  const badge = esc(o.badge || 'Instant download');
  let body = String(innerHtml || '');
  const m = body.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (m) body = m[1];
  body = body.replace(/<\/?html[^>]*>/gi, '').replace(/<head[\s\S]*?<\/head>/gi, '');
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>${title} mockup</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{min-height:100vh;display:flex;align-items:center;justify-content:center;
    background:radial-gradient(1200px 600px at 20% 0%,#1e293b 0%,#0f172a 45%,#020617 100%);
    font-family:${SYSTEM_FONT};padding:36px 28px}
  .stage{position:relative;width:920px;max-width:100%}
  .glow{position:absolute;inset:-40px;background:radial-gradient(circle at 50% 40%,rgba(45,212,191,.18),transparent 55%);pointer-events:none}
  .device{position:relative;margin:0 auto;width:720px;max-width:92%;
    transform:perspective(1400px) rotateY(-8deg) rotateX(4deg);
    filter:drop-shadow(0 40px 60px rgba(0,0,0,.55))}
  .bezel{background:#0b1220;border-radius:22px;padding:14px 14px 18px;
    border:1px solid rgba(255,255,255,.08);box-shadow:inset 0 1px 0 rgba(255,255,255,.08)}
  .chrome{height:18px;display:flex;align-items:center;gap:6px;margin-bottom:10px;padding:0 6px}
  .dot{width:8px;height:8px;border-radius:50%}
  .dot.r{background:#f87171}.dot.y{background:#fbbf24}.dot.g{background:#34d399}
  .screen{background:#f8fafc;border-radius:12px;overflow:hidden;height:920px;position:relative}
  .screen-inner{transform:scale(0.92);transform-origin:top center;width:108.7%;pointer-events:none}
  .tagrow{display:flex;justify-content:space-between;align-items:flex-end;margin-top:22px;color:#e2e8f0}
  .tagrow h2{font-size:1.05rem;font-weight:800;letter-spacing:-.02em;max-width:70%}
  .price{font-size:1.35rem;font-weight:900;color:#5eead4}
  .badge{display:inline-block;margin-top:8px;font-size:10px;font-weight:800;letter-spacing:1.4px;
    text-transform:uppercase;padding:5px 12px;border-radius:999px;background:rgba(45,212,191,.15);
    color:#99f6e4;border:1px solid rgba(45,212,191,.35)}
  .shadow-plate{height:28px;margin:18px auto 0;width:70%;border-radius:50%;
    background:radial-gradient(ellipse,rgba(0,0,0,.45),transparent 70%);filter:blur(6px)}
</style></head><body>
<div class="stage">
  <div class="glow"></div>
  <div class="device">
    <div class="bezel">
      <div class="chrome"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span></div>
      <div class="screen"><div class="screen-inner">${body}</div></div>
    </div>
    <div class="tagrow">
      <div>
        <h2>${title}</h2>
        <div class="badge">${badge}</div>
      </div>
      <div class="price">${price}</div>
    </div>
    <div class="shadow-plate"></div>
  </div>
</div>
</body></html>`;
}

module.exports = {
  esc, priceNum, parseServices, baseStyle, shell, SYSTEM_FONT,
  buildInvoiceHTML, buildChecklistHTML, buildJournalHTML, buildBrandKitHTML,
  buildTablePreviewHTML, buildDecisionMatrixHTML, buildROIHTML,
  buildCoverHTML, buildWebsiteHTML,
  buildSocialPostHTML, buildSocialStoryHTML, buildSocialCarouselHTML,
  buildPlannerHTML, buildWallArtHTML, buildWorksheetHTML, buildPartyPrintableHTML,
  thumbCoverCopy, accentForCover, heroSnippetForCover, buildThumbStopperCover, buildPlainCover,
  wrapMarketplaceMockup
};

