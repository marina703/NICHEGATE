const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', '..', 'generated');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Cache browser instance — launch once, reuse forever
let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  }
  return browserPromise;
}

async function generatePDF(htmlContent, filename) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });
  
  const outputPath = path.join(OUTPUT_DIR, filename);
  await page.pdf({
    path: outputPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' }
  });
  
  await page.close();
  return outputPath;
}

// Cleanup on exit
process.on('exit', async () => {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    if (b) await b.close();
  }
});

// ── TEMPLATES ──

function buildInvoiceHTML(prof, theme) {
  const services = JSON.parse(prof.services || '[]');
  const total = services.reduce((a,s)=>a+(parseFloat(s[1].replace(/[^0-9.]/g,''))||0),0);
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
body{font-family:${theme.font||'Arial'};margin:0;padding:40px;background:${theme.bg||'#fff'};color:${theme.primary||'#1e293b'};}
.header{display:flex;justify-content:space-between;align-items:center;margin-bottom:30px;border-bottom:3px solid ${theme.accent};padding-bottom:20px;}
.header h1{font-size:1.8rem;margin:0;color:${theme.primary};text-transform:uppercase;letter-spacing:2px;font-weight:800;}
.header .logo-placeholder{width:80px;height:80px;border:2px dashed ${theme.secondary};border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:2rem;}
.row{display:flex;justify-content:space-between;}
.row>div{flex:1;}
table{width:100%;border-collapse:collapse;margin-bottom:30px;}
th{text-align:left;padding:12px;background:${theme.primary};color:white;font-size:0.85rem;}
td{padding:12px;border-bottom:1px solid #e2e8f0;font-size:0.9rem;}
.total{text-align:right;font-size:1.3rem;font-weight:700;color:${theme.primary};margin-top:10px;}
.footer{margin-top:40px;font-size:0.8rem;color:#94a3b8;text-align:center;}
</style></head><body>
<div class="header"><h1>${prof.name} Invoice</h1><div class="logo-placeholder">${prof.emoji}</div></div>
<div class="row"><div class="client-info"><h3>Bill To</h3><p contenteditable>Client Name<br>Address Line 1<br>City, ST 12345</p></div>
<div class="invoice-details" style="text-align:right;"><h3>Invoice #001</h3><p contenteditable>Date: ${new Date().toLocaleDateString()}<br>Due: Net 30</p></div></div>
<table><thead><tr><th>Service</th><th style="text-align:right;">Price</th></tr></thead><tbody>
${services.map(s=>`<tr><td>${s[0]}</td><td style="text-align:right;">${s[1]}</td></tr>`).join('')}
</tbody></table>
<div class="total">Total: $${total.toFixed(2)}</div>
<div class="footer" contenteditable>Payment terms: Net 30 | Thank you for your business!</div>
</body></html>`;
}

function buildChecklistHTML(prof, theme) {
  const items = JSON.parse(prof.services||'[]').map((s,i)=>s[0]);
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
body{font-family:${theme.font||'Arial'};margin:0;padding:40px;background:${theme.bg||'#fff'};color:${theme.primary||'#1e293b'};}
.header{text-align:center;margin-bottom:30px;}
.header h1{font-size:1.6rem;margin-bottom:8px;color:${theme.primary};text-transform:uppercase;letter-spacing:2px;font-weight:800;}
.header p{color:#94a3b8;font-size:0.9rem;}
.checklist{max-width:600px;margin:0 auto;}
.item{display:flex;align-items:center;gap:14px;padding:14px 0;border-bottom:1px solid #e2e8f0;}
.checkbox{width:24px;height:24px;border:2px solid ${theme.secondary};border-radius:6px;flex-shrink:0;}
.item-text{flex:1;font-size:0.95rem;}
.item-note{font-size:0.75rem;color:#94a3b8;margin-top:4px;}
</style></head><body>
<div class="header"><h1>${prof.name} Service Checklist</h1><p contenteditable>Client: _________________ | Date: _________________</p></div>
<div class="checklist">
${items.map((it,i)=>`<div class="item"><div class="checkbox"></div><div><div class="item-text" contenteditable>${it}</div><div class="item-note" contenteditable>Notes:</div></div></div>`).join('')}
<div class="item" style="border:none;margin-top:20px;"><div style="flex:1;text-align:center;font-size:0.85rem;color:#94a3b8;">Technician Signature: _____________________</div></div>
</div>
</body></html>`;
}

function buildJournalHTML(prof, theme, prompts) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
body{font-family:${theme.font||'Georgia,serif'};margin:0;padding:40px;background:${theme.bg||'#fff'};color:${theme.primary||'#1e293b'};}
.cover{text-align:center;padding:60px 20px;border:3px solid ${theme.accent};border-radius:16px;margin-bottom:40px;}
.cover h1{font-size:2rem;margin-bottom:10px;color:${theme.primary};}
.cover p{color:${theme.secondary};font-size:0.95rem;}
.page{page-break-before:always;margin-bottom:40px;}
.page-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;border-bottom:2px solid ${theme.accent};padding-bottom:10px;}
.page-header h2{font-size:1.2rem;color:${theme.primary};}
.prompt-box{margin-bottom:30px;}
.prompt-box h3{font-size:0.9rem;color:${theme.secondary};margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;}
.lines{border:1px solid #e2e8f0;border-radius:8px;padding:16px;min-height:120px;background:#fafafa;}
.line{border-bottom:1px dashed #cbd5e1;height:32px;}
.footer{text-align:center;font-size:0.8rem;color:#94a3b8;margin-top:60px;}
</style></head><body>
<div class="cover"><h1>${prof.name}</h1><p>Daily Reflection & Recovery Journal</p></div>
${prompts.map((promptSet,day)=>`<div class="page"><div class="page-header"><h2>Day ${day+1}</h2><span style="font-size:0.8rem;color:#94a3b8;">Date: ______ / ______ / ______</span></div>
${promptSet.map(q=>`<div class="prompt-box"><h3>${q}</h3><div class="lines">${Array(6).fill(0).map(()=>'<div class="line"></div>').join('')}</div></div>`).join('')}
</div>`).join('')}
<div class="footer">This journal is a tool for your recovery journey. Be gentle with yourself.</div>
</body></html>`;
}

function buildBrandKitHTML(prof, theme) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
body{font-family:${theme.font||'Arial'};margin:0;padding:40px;background:${theme.bg||'#fff'};color:${theme.primary||'#1e293b'};}
.page{page-break-after:always;margin-bottom:40px;}
h1{font-size:2rem;color:${theme.primary};margin-bottom:8px;}
h2{font-size:1.2rem;color:${theme.secondary};margin-top:30px;margin-bottom:12px;border-bottom:2px solid ${theme.accent};padding-bottom:6px;}
.color-swatch{display:inline-block;width:80px;height:80px;border-radius:12px;margin:8px;text-align:center;line-height:80px;font-size:0.7rem;color:white;font-weight:600;text-shadow:0 1px 2px rgba(0,0,0,0.3);}
.font-sample{font-size:1.3rem;margin:12px 0;padding:16px;border:1px solid #e2e8f0;border-radius:8px;}
.social-card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin:12px 0;}
.logo-marks{display:flex;gap:20px;margin:20px 0;}
.logo-box{width:120px;height:120px;border:2px dashed #cbd5e1;border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:3rem;}
</style></head><body>
<div class="page">
<h1>${prof.name} Brand Kit</h1>
<p style="color:#94a3b8;font-size:0.9rem;">Your complete brand identity guide</p>
<h2>Logo Marks</h2>
<div class="logo-marks"><div class="logo-box">${prof.emoji}</div><div class="logo-box" style="background:${theme.primary};color:white;border:none;">${prof.emoji}</div><div class="logo-box" style="background:${theme.bg};border:2px solid ${theme.primary};">${prof.emoji}</div></div>
<h2>Color Palette</h2>
<div><span class="color-swatch" style="background:${theme.primary};">${theme.primary}</span><span class="color-swatch" style="background:${theme.secondary};">${theme.secondary}</span><span class="color-swatch" style="background:${theme.accent};">${theme.accent}</span></div>
<h2>Typography</h2>
<div class="font-sample" style="font-family:${theme.font};">The quick brown fox jumps over the lazy dog.<br><strong>Bold weight for headlines</strong><br><em>Italic for emphasis</em></div>
</div>
<div class="page">
<h2>Social Media Templates</h2>
<div class="social-card"><h3 style="margin:0 0 8px;">Instagram Post</h3><p style="font-size:0.85rem;color:#64748b;margin:0;">1080 x 1080px | Use primary color for backgrounds, accent for CTAs</p></div>
<div class="social-card"><h3 style="margin:0 0 8px;">Instagram Story</h3><p style="font-size:0.85rem;color:#64748b;margin:0;">1080 x 1920px | Full-screen branded templates with logo watermark</p></div>
<div class="social-card"><h3 style="margin:0 0 8px;">Facebook Cover</h3><p style="font-size:0.85rem;color:#64748b;margin:0;">820 x 312px | Header image with service headline overlay</p></div>
</div>
<div class="page">
<h2>Business Card</h2>
<div style="width:350px;height:200px;border:1px solid #e2e8f0;border-radius:8px;padding:20px;display:flex;flex-direction:column;justify-content:space-between;margin:20px 0;">
<div style="font-size:1.2rem;font-weight:700;color:${theme.primary};">${prof.name}</div>
<div style="font-size:0.8rem;color:#64748b;"><div contenteditable>Your Name, Title</div><div contenteditable>Phone: (555) 123-4567</div><div contenteditable>Email: hello@yourbusiness.com</div></div>
<div style="font-size:0.7rem;color:#94a3b8;">www.yourbusiness.com</div>
</div>
</div>
</body></html>`;
}

module.exports = {
  generatePDF,
  buildInvoiceHTML,
  buildChecklistHTML,
  buildJournalHTML,
  buildBrandKitHTML,
  OUTPUT_DIR
};
