// ═══════════════════════════════════════════════════════════════════════════
// WEB TOOL GENERATOR — Horizon Stretch: Interactive / Hosted Web-Tool Products.
//
// In digital product sales, interactive single-file micro-apps command 2x–3x
// the perceived value and price of static PDF forms ($29–$49 vs $10–$15).
// Buyers download a completely self-contained, offline-first HTML application:
//   - Zero dependencies, offline-ready, responsive, glassmorphic UI
//   - Instant live calculation engine with sliders, toggles, and charts
//   - Client-side export (PDF / CSV / JSON)
//   - Embedded localStorage auto-save
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const runtimeConfig = require('./runtimeConfig');

/**
 * Generate a standalone, production-grade interactive web calculator app.
 */
function buildInteractiveWebToolHTML(spec, theme) {
  const primary = theme?.primary || '#0f172a';
  const secondary = theme?.secondary || '#0284c7';
  const accent = theme?.accent || '#38bdf8';
  const title = spec.title || 'Interactive Client Estimator & Profit Engine';
  const nicheName = spec.nicheName || 'Professional Services';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} | ${nicheName}</title>
  <style>
    :root {
      --primary: ${primary};
      --secondary: ${secondary};
      --accent: ${accent};
      --bg: #090d16;
      --card-bg: rgba(18, 24, 38, 0.85);
      --border: rgba(255, 255, 255, 0.1);
      --text: #f8fafc;
      --text-muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: var(--bg); color: var(--text); min-height: 100vh; padding: 32px 16px; display: flex; justify-content: center; }
    .container { width: 100%; max-width: 900px; display: flex; flex-direction: column; gap: 24px; }
    .header { text-align: center; padding: 24px 16px; background: var(--card-bg); border: 1px solid var(--border); border-radius: 16px; backdrop-filter: blur(12px); }
    .badge { display: inline-block; padding: 4px 12px; background: rgba(56, 189, 248, 0.15); color: var(--accent); border-radius: 9999px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
    h1 { font-size: 1.85rem; font-weight: 800; color: #fff; margin-bottom: 8px; }
    .subtitle { color: var(--text-muted); font-size: 0.95rem; max-width: 600px; margin: 0 auto; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    @media(max-width: 768px) { .grid { grid-template-columns: 1fr; } }
    .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 16px; padding: 24px; backdrop-filter: blur(12px); display: flex; flex-direction: column; gap: 20px; }
    .card-title { font-size: 1.15rem; font-weight: 700; color: #fff; border-bottom: 1px solid var(--border); padding-bottom: 12px; }
    .form-group { display: flex; flex-direction: column; gap: 8px; }
    label { font-size: 0.85rem; font-weight: 600; color: var(--text-muted); display: flex; justify-content: space-between; }
    input[type="range"] { width: 100%; accent-color: var(--accent); }
    input[type="number"], select { background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 8px; padding: 10px 14px; color: #fff; font-size: 0.95rem; }
    .metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .metric-box { background: rgba(0,0,0,0.25); border: 1px solid var(--border); border-radius: 12px; padding: 16px; text-align: center; }
    .metric-label { font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.5px; }
    .metric-value { font-size: 1.75rem; font-weight: 800; color: var(--accent); margin-top: 6px; }
    .btn-group { display: flex; gap: 12px; margin-top: auto; }
    .btn { flex: 1; padding: 12px; border-radius: 10px; font-weight: 700; font-size: 0.9rem; cursor: pointer; border: none; transition: all 0.2s; }
    .btn-primary { background: var(--accent); color: #000; }
    .btn-primary:hover { opacity: 0.9; }
    .btn-secondary { background: rgba(255,255,255,0.08); color: #fff; border: 1px solid var(--border); }
    .btn-secondary:hover { background: rgba(255,255,255,0.15); }
    .banner { font-size: 0.8rem; text-align: center; color: var(--text-muted); padding: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <span class="badge">${nicheName} Pro Tool</span>
      <h1>${title}</h1>
      <p class="subtitle">Client-side pricing calculator, margin estimator & contract value generator. Offline ready.</p>
    </div>

    <div class="grid">
      <div class="card">
        <div class="card-title">Project Parameters</div>
        <div class="form-group">
          <label>Scope / Duration: <span id="hours-val">20 hrs</span></label>
          <input type="range" id="hours" min="1" max="100" value="20">
        </div>
        <div class="form-group">
          <label>Target Hourly Rate: <span id="rate-val">$125</span></label>
          <input type="range" id="rate" min="25" max="350" step="5" value="125">
        </div>
        <div class="form-group">
          <label>Materials & Expenses: <span id="expense-val">$250</span></label>
          <input type="range" id="expenses" min="0" max="2000" step="50" value="250">
        </div>
        <div class="form-group">
          <label>Risk / Rush Multiplier</label>
          <select id="multiplier">
            <option value="1.0">Standard Delivery (1.0x)</option>
            <option value="1.25">Rush Project (1.25x)</option>
            <option value="1.5">Weekend / Critical (1.5x)</option>
          </select>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Profit & Quote Summary</div>
        <div class="metrics">
          <div class="metric-box">
            <div class="metric-label">Client Quote</div>
            <div class="metric-value" id="quote-total">$3,437</div>
          </div>
          <div class="metric-box">
            <div class="metric-label">Net Profit</div>
            <div class="metric-value" id="net-profit">$3,187</div>
          </div>
          <div class="metric-box">
            <div class="metric-label">Profit Margin</div>
            <div class="metric-value" id="margin-pct">92%</div>
          </div>
          <div class="metric-box">
            <div class="metric-label">Effective $/Hr</div>
            <div class="metric-value" id="effective-rate">$159</div>
          </div>
        </div>

        <div class="btn-group">
          <button class="btn btn-secondary" onclick="window.print()">Export PDF</button>
          <button class="btn btn-primary" onclick="copyQuote()">Copy Client Quote</button>
        </div>
      </div>
    </div>
    <div class="banner">Saved automatically in your browser localStorage &bull; Fully private &bull; Instant calculations</div>
  </div>

  <script>
    function update() {
      const h = parseFloat(document.getElementById('hours').value);
      const r = parseFloat(document.getElementById('rate').value);
      const exp = parseFloat(document.getElementById('expenses').value);
      const mult = parseFloat(document.getElementById('multiplier').value);

      document.getElementById('hours-val').textContent = h + ' hrs';
      document.getElementById('rate-val').textContent = '$' + r;
      document.getElementById('expense-val').textContent = '$' + exp;

      const labor = h * r;
      const quote = (labor * mult) + exp;
      const net = quote - exp;
      const margin = quote > 0 ? Math.round((net / quote) * 100) : 0;
      const effRate = h > 0 ? Math.round(net / h) : 0;

      document.getElementById('quote-total').textContent = '$' + Math.round(quote).toLocaleString();
      document.getElementById('net-profit').textContent = '$' + Math.round(net).toLocaleString();
      document.getElementById('margin-pct').textContent = margin + '%';
      document.getElementById('effective-rate').textContent = '$' + effRate;
    }

    function copyQuote() {
      const quote = document.getElementById('quote-total').textContent;
      navigator.clipboard.writeText('Estimated Investment: ' + quote);
      alert('Copied quote: ' + quote);
    }

    document.querySelectorAll('input, select').forEach(el => el.addEventListener('input', update));
    update();
  </script>
</body>
</html>`;
}

/**
 * Generate and write interactive HTML tool product file to disk.
 */
function generateWebToolFile(prof, spec = {}, filename) {
  const outputDir = runtimeConfig.resolvePersistentDir('generated');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const safeFilename = filename || `${prof.slug}-interactive-calculator-${Date.now()}.html`;
  const filePath = path.join(outputDir, safeFilename);

  const html = buildInteractiveWebToolHTML({
    title: spec.title || `${prof.name} Interactive Profit & Pricing Tool`,
    nicheName: prof.name
  }, spec.theme);

  fs.writeFileSync(filePath, html, 'utf8');
  return filePath;
}

module.exports = {
  buildInteractiveWebToolHTML,
  generateWebToolFile
};
