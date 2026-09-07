const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', '..', 'generated');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// "$150" / "$0.35/sqft" → 150 / 0.35 | unparseable → null
function priceToNumber(str) {
  const m = String(str || '').replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

// aoa_to_sheet stores "=B4*C4" as TEXT. Convert those cells into real
// Excel formulas so files open with live calculations instead of literal strings.
function coerceFormulas(ws) {
  for (const addr of Object.keys(ws)) {
    if (addr.startsWith('!')) continue;
    const cell = ws[addr];
    if (cell && cell.t === 's' && typeof cell.v === 'string' && cell.v.startsWith('=')) {
      cell.f = cell.v.slice(1);
      delete cell.v;
      delete cell.t;
    }
  }
  return ws;
}

function generateXLSX(type, prof, filename) {
  const wb = XLSX.utils.book_new();
  let ws;

  if (type === 'spreadsheet' || type === 'pricing') {
    const services = JSON.parse(prof.services || '[]');
    ws = XLSX.utils.aoa_to_sheet([
      [`${prof.name} — Pricing Calculator`],
      [],
      ['Service', 'Base Price', 'Quantity', 'Total'],
      ...services.map((s, i) => [s[0], priceToNumber(s[1]) ?? s[1], 1, `=B${i+4}*C${i+4}`]),
      [],
      ['', '', 'Grand Total', `=SUM(D4:D${services.length+3})`]
    ]);
    ws['!cols'] = [{wch:30},{wch:12},{wch:10},{wch:12}];
  }

  else if (type === 'booking') {
    ws = XLSX.utils.aoa_to_sheet([
      [`${prof.name} — Booking & Appointment Tracker`],
      [],
      ['Date', 'Client Name', 'Service', 'Duration', 'Price', 'Deposit', 'Status', 'Notes'],
      ['', '', '', '', '', '', 'Confirmed | Pending | Cancelled', ''],
      ['', '', '', '', '', '', '', '']
    ]);
    ws['!cols'] = [{wch:12},{wch:20},{wch:25},{wch:10},{wch:10},{wch:10},{wch:15},{wch:30}];
  }

  else if (type === 'inventory') {
    ws = XLSX.utils.aoa_to_sheet([
      [`${prof.name} — Inventory Tracker`],
      [],
      ['Item', 'Category', 'Qty On Hand', 'Reorder Level', 'Unit Cost', 'Total Value', 'Supplier', 'Last Ordered'],
      ['', '', '', '', '', '=C4*E4', '', '']
    ]);
    ws['!cols'] = [{wch:25},{wch:15},{wch:12},{wch:12},{wch:10},{wch:12},{wch:20},{wch:14}];
  }

  else if (type === 'shot-chart' || type === 'pyro') {
    ws = XLSX.utils.aoa_to_sheet([
      [`${prof.name} — Shot Chart & Firing Sequence`],
      [],
      ['Cue #', 'Shell/Effect', 'Caliber', 'Qty', 'Cost/Shot', 'Total Cost', 'Firing Time', 'Notes'],
      ['1', 'Willow Red', '3"', 5, 8.50, '=D4*E4', '0:00', 'Opening'],
      ['2', 'Brocade Crown', '4"', 3, 12.00, '=D5*E5', '0:15', ''],
      ['3', 'Crackling Flower', '3"', 6, 7.50, '=D6*E6', '0:30', 'Build up'],
      ['', '', '', '', '', '', '', ''],
      ['', '', '', 'Total Cost', '=SUM(F4:F10)', '', '', '']
    ]);
    ws['!cols'] = [{wch:8},{wch:22},{wch:8},{wch:6},{wch:10},{wch:10},{wch:12},{wch:20}];
  }

  else {
    // Generic calculator
    ws = XLSX.utils.aoa_to_sheet([
      [`${prof.name} — Business Calculator`],
      [],
      ['Revenue Streams', 'Monthly', 'Annual'],
      ['Service A', '', '=B4*12'],
      ['Service B', '', '=B5*12'],
      ['Service C', '', '=B6*12'],
      ['', '', ''],
      ['Expenses', 'Monthly', 'Annual'],
      ['Rent/Space', '', '=B9*12'],
      ['Supplies', '', '=B10*12'],
      ['Insurance', '', '=B11*12'],
      ['Marketing', '', '=B12*12'],
      ['', '', ''],
      ['', 'Monthly Net', '=SUM(B4:B6)-SUM(B9:B12)'],
      ['', 'Annual Net', '=SUM(C4:C6)-SUM(C9:C12)']
    ]);
    ws['!cols'] = [{wch:22},{wch:14},{wch:14}];
  }

  coerceFormulas(ws);
  // Excel bans : \ / ? * [ ] in sheet names — sanitize + cap at 31 chars
  const sheetName = String(prof.name).replace(/[:\\/?*\[\]]/g, '').trim().substring(0, 31) || 'Sheet1';
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const outputPath = path.join(OUTPUT_DIR, filename);
  XLSX.writeFile(wb, outputPath);
  return outputPath;
}

module.exports = { generateXLSX, OUTPUT_DIR };
