const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const runtimeConfig = require('./runtimeConfig');

const OUTPUT_DIR = runtimeConfig.resolvePersistentDir('generated');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Shared by the Pricing sheet formulas and the cover/preview mockup, so the
// product page shows exactly the numbers the sold file calculates.
const PRICING_MARGIN_PCT = 40;
const PRICING_TAX_RATE = 0.08;

function pricingSheetModel(prof) {
  let services = [];
  try { services = JSON.parse(prof.services || '[]'); } catch { services = []; }
  const lines = services.map(function(s) {
    const base = priceToNumber(s[1]);
    const total = base != null ? base : 0;
    return {
      name: s[0],
      basePrice: base != null ? base : s[1],
      qty: 1,
      total: total,
      marginPct: PRICING_MARGIN_PCT,
      net: total * (1 - PRICING_MARGIN_PCT / 100)
    };
  });
  const subtotal = lines.reduce(function(a, l) { return a + l.total; }, 0);
  const tax = subtotal * PRICING_TAX_RATE;
  return { lines: lines, subtotal: subtotal, tax: tax, grand: subtotal + tax, taxRate: PRICING_TAX_RATE };
}

function priceToNumber(str) {
  const m = String(str || '').replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

function coerceFormulas(ws) {
  for (const addr of Object.keys(ws)) {
    if (addr.startsWith('!')) continue;
    const cell = ws[addr];
    if (cell && cell.t === 's' && typeof cell.v === 'string' && cell.v.startsWith('=')) {
      cell.f = cell.v.slice(1); delete cell.v; delete cell.t;
    }
  }
  return ws;
}

function styleSheet(ws, headerRow, colWidths) {
  headerRow = headerRow || 3; colWidths = colWidths || [];
  if (!ws['!ref']) return ws;
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let C = range.s.c; C <= range.e.c; C++) {
    const addr = XLSX.utils.encode_cell({ r: headerRow - 1, c: C });
    if (!ws[addr]) continue;
    ws[addr].s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: '0F172A' } } };
  }
  const titleAddr = XLSX.utils.encode_cell({ r: 0, c: 0 });
  if (ws[titleAddr]) ws[titleAddr].s = { font: { bold: true, sz: 14 } };
  ws['!freeze'] = { xSplit: 0, ySplit: headerRow, topLeftCell: 'A' + (headerRow + 1), activePane: 'bottomLeft', state: 'frozen' };
  if (colWidths.length) ws['!cols'] = colWidths.map(function(wch) { return { wch: wch }; });
  return ws;
}

function safeSheetName(name, fallback) {
  fallback = fallback || 'Sheet1';
  return String(name || fallback).replace(/[:\\/?*[\]]/g, '').trim().substring(0, 31) || fallback;
}

function buildPricingSheet(prof) {
  const services = JSON.parse(prof.services || '[]');
  const last = Math.max(4, services.length + 3);
  const rows = [
    [prof.name + ' — Pricing Calculator'],
    ['Edit quantities — totals recalculate automatically'],
    ['Service', 'Base Price', 'Quantity', 'Line Total', 'Margin %', 'Net']
  ];
  services.forEach(function(s, i) {
    const r = i + 4;
    rows.push([s[0], priceToNumber(s[1]) != null ? priceToNumber(s[1]) : s[1], 1, '=B' + r + '*C' + r, PRICING_MARGIN_PCT, '=D' + r + '*(1-E' + r + '/100)']);
  });
  rows.push([]);
  rows.push(['', '', 'Subtotal', '=SUM(D4:D' + last + ')', '', '=SUM(F4:F' + last + ')']);
  rows.push(['', '', 'Tax (' + Math.round(PRICING_TAX_RATE * 100) + '%)', '=D' + (last + 2) + '*' + PRICING_TAX_RATE, '', '']);
  rows.push(['', '', 'Grand Total', '=D' + (last + 2) + '+D' + (last + 3), '', '']);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  styleSheet(ws, 3, [32, 12, 10, 12, 10, 12]);
  return coerceFormulas(ws);
}

function buildPnLSheet(prof) {
  const services = JSON.parse(prof.services || '[]');
  const serviceSum = services.reduce(function(a, s) { return a + (priceToNumber(s[1]) || 0); }, 0) || 3000;
  const rows = [
    [prof.name + ' — Monthly P&L Model'],
    ['Change monthly assumptions — annual & margins update live'],
    ['Line Item', 'Monthly', 'Annual', 'Notes'],
    ['Service revenue', serviceSum, '=B4*12', 'Sum of listed services'],
    ['Other revenue', 0, '=B5*12', ''],
    ['Total Revenue', '=B4+B5', '=C4+C5', ''],
    [],
    ['Rent / workspace', 500, '=B8*12', ''],
    ['Supplies / COGS', 250, '=B9*12', ''],
    ['Insurance', 150, '=B10*12', ''],
    ['Marketing', 120, '=B11*12', ''],
    ['Software / tools', 49, '=B12*12', ''],
    ['Total Expenses', '=SUM(B8:B12)', '=SUM(C8:C12)', ''],
    [],
    ['Net Operating Income', '=B6-B13', '=C6-C13', ''],
    ['Profit Margin %', '=IF(B6=0,0,B15/B6)', '=IF(C6=0,0,C15/C6)', '']
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  styleSheet(ws, 3, [28, 14, 14, 28]);
  return coerceFormulas(ws);
}

function buildScenariosSheet(prof) {
  const base = JSON.parse(prof.services || '[]').reduce(function(a, s) { return a + (priceToNumber(s[1]) || 0); }, 0) || 2500;
  const avg = Math.round(base / 3) || 200;
  const rows = [
    [prof.name + ' — Scenario Planner'],
    ['Three demand scenarios for capacity & cash planning'],
    ['Metric', 'Conservative', 'Base', 'Optimistic'],
    ['Monthly jobs / clients', 8, 15, 28],
    ['Avg ticket ($)', Math.round(avg * 0.75), avg, Math.round(avg * 1.35)],
    ['Gross revenue', '=B4*B5', '=C4*C5', '=D4*D5'],
    ['Variable cost %', 0.35, 0.30, 0.25],
    ['Variable costs', '=B6*B7', '=C6*C7', '=D6*D7'],
    ['Fixed costs', 900, 900, 900],
    ['Net profit', '=B6-B8-B9', '=C6-C8-C9', '=D6-D8-D9'],
    ['Break-even jobs', '=IF(B5=0,0,ROUNDUP(B9/(B5*(1-B7)),0))', '=IF(C5=0,0,ROUNDUP(C9/(C5*(1-C7)),0))', '=IF(D5=0,0,ROUNDUP(D9/(D5*(1-D7)),0))']
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  styleSheet(ws, 3, [22, 14, 12, 14]);
  return coerceFormulas(ws);
}

function buildInstructionsSheet(prof, type) {
  const rows = [
    ['NicheGate — How to use this workbook'],
    [],
    ['Product', prof.name + ' · ' + type],
    ['Generated', new Date().toISOString().slice(0, 10)],
    [],
    ['Sheets'],
    ['Pricing', 'Service menu with live line totals, margin, and tax'],
    ['P&L', 'Monthly / annual profit & loss model'],
    ['Scenarios', 'Conservative / base / optimistic capacity planning'],
    ['Instructions', 'This guide'],
    [],
    ['Tips'],
    ['1', 'Edit prices and quantities — formula columns recalculate'],
    ['2', 'Works in Excel, Google Sheets, and LibreOffice'],
    ['3', 'Commercial license — unlimited client use for your business']
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  styleSheet(ws, 6, [14, 70]);
  return ws;
}

function buildBookingSheet(prof) {
  const ws = XLSX.utils.aoa_to_sheet([
    [prof.name + ' — Booking & Appointment Tracker'],
    ['Status: Confirmed | Pending | Cancelled | Completed'],
    ['Date', 'Client Name', 'Service', 'Duration (hrs)', 'Price', 'Deposit', 'Balance Due', 'Status', 'Notes'],
    ['', '', '', 1, '', '', '=IF(OR(E4="",F4=""),"",E4-F4)', 'Pending', ''],
    ['', '', '', 1, '', '', '=IF(OR(E5="",F5=""),"",E5-F5)', 'Pending', ''],
    [],
    ['', '', '', '', 'Booked total', '=SUM(E4:E50)', 'Deposits', '=SUM(F4:F50)', '']
  ]);
  styleSheet(ws, 3, [12, 20, 24, 12, 10, 10, 12, 12, 28]);
  return coerceFormulas(ws);
}

function buildHighTicketRoiSheet(prof) {
  const ws = XLSX.utils.aoa_to_sheet([
    [prof.name + ' — High-Ticket Client ROI & Value Pricing Model'],
    ['Show high-end clients the exact return on investment from hiring your service'],
    ['Client Metric / Value Lever', 'Current Baseline', 'With Our Service', 'Financial Impact ($)', 'Annual Benefit ($)'],
    ['Monthly revenue or throughput', 50000, 62500, '=C4-B4', '=D4*12'],
    ['Lost deals / lead leakage', 8000, 2000, '=B5-C5', '=D5*12'],
    ['Wasted labor / inefficiency', 4500, 1200, '=B6-C6', '=D6*12'],
    ['Direct cost savings', 0, 3000, '=C7-B7', '=D7*12'],
    [],
    ['Total Client Value Created (Annual)', '', '', '', '=SUM(E4:E7)'],
    ['Recommended Premium Service Fee (10% of Value)', '', '', '', '=E9*0.10'],
    ['Client Net Value Realized', '', '', '', '=E9-E10'],
    ['Client 1-Year ROI Multiple', '', '', '', '=E11/E10']
  ]);
  styleSheet(ws, 3, [36, 18, 18, 22, 22]);
  return coerceFormulas(ws);
}

function buildCashFlowForecastSheet(prof) {
  const ws = XLSX.utils.aoa_to_sheet([
    [prof.name + ' — 12-Month Rolling Cash Flow Forecast'],
    ['Track liquidity, runway, and tax holdbacks month-by-month'],
    ['Month', 'Inflow (Cash Collected)', 'COGS / Direct Costs', 'Fixed Overhead', 'Tax Reserve (25%)', 'Net Cash Flow', 'Ending Cash Balance'],
    ['Starting Cash', '', '', '', '', '', 25000],
    ['Month 1', 12000, 3200, 2500, '=B5*0.25', '=B5-C5-D5-E5', '=G4+F5'],
    ['Month 2', 14500, 3800, 2500, '=B6*0.25', '=B6-C6-D6-E6', '=G5+F6'],
    ['Month 3', 18000, 4600, 2500, '=B7*0.25', '=B7-C7-D7-E7', '=G6+F7'],
    ['Month 4', 21000, 5200, 2600, '=B8*0.25', '=B8-C8-D8-E8', '=G7+F8'],
    ['Month 5', 24000, 6000, 2600, '=B9*0.25', '=B9-C9-D9-E9', '=G8+F9'],
    ['Month 6', 26000, 6500, 2600, '=B10*0.25', '=B10-C10-D10-E10', '=G9+F10']
  ]);
  styleSheet(ws, 3, [16, 24, 20, 16, 18, 16, 20]);
  return coerceFormulas(ws);
}

function generateXLSX(type, prof, filename) {
  const wb = XLSX.utils.book_new();
  if (type === 'spreadsheet' || type === 'pricing' || type === 'high-ticket') {
    XLSX.utils.book_append_sheet(wb, buildPricingSheet(prof), safeSheetName('Pricing'));
    XLSX.utils.book_append_sheet(wb, buildPnLSheet(prof), safeSheetName('P&L'));
    XLSX.utils.book_append_sheet(wb, buildHighTicketRoiSheet(prof), safeSheetName('Client ROI'));
    XLSX.utils.book_append_sheet(wb, buildCashFlowForecastSheet(prof), safeSheetName('Cash Flow'));
    XLSX.utils.book_append_sheet(wb, buildScenariosSheet(prof), safeSheetName('Scenarios'));
    XLSX.utils.book_append_sheet(wb, buildInstructionsSheet(prof, type), safeSheetName('Instructions'));
  } else if (type === 'booking') {
    XLSX.utils.book_append_sheet(wb, buildBookingSheet(prof), safeSheetName('Bookings'));
    XLSX.utils.book_append_sheet(wb, buildPricingSheet(prof), safeSheetName('Rate Card'));
    XLSX.utils.book_append_sheet(wb, buildInstructionsSheet(prof, type), safeSheetName('Instructions'));
  } else if (type === 'inventory') {
    const ws = XLSX.utils.aoa_to_sheet([
      [prof.name + ' — Inventory Tracker'],
      ['Needs Reorder flags when Qty On Hand < Reorder Level'],
      ['Item', 'Category', 'Qty On Hand', 'Reorder Level', 'Unit Cost', 'Total Value', 'Needs Reorder', 'Supplier', 'Last Ordered'],
      ['', '', 0, 5, 0, '=C4*E4', '=IF(C4<D4,"YES","")', '', ''],
      ['', '', 0, 5, 0, '=C5*E5', '=IF(C5<D5,"YES","")', '', '']
    ]);
    styleSheet(ws, 3, [24, 14, 12, 12, 10, 12, 12, 18, 14]);
    XLSX.utils.book_append_sheet(wb, coerceFormulas(ws), safeSheetName('Inventory'));
    XLSX.utils.book_append_sheet(wb, buildInstructionsSheet(prof, type), safeSheetName('Instructions'));
  } else if (type === 'shot-chart' || type === 'pyro') {
    const ws = XLSX.utils.aoa_to_sheet([
      [prof.name + ' — Shot Chart & Firing Sequence'], [],
      ['Cue #', 'Shell/Effect', 'Caliber', 'Qty', 'Cost/Shot', 'Total Cost', 'Firing Time', 'Notes'],
      ['1', 'Willow Red', '3"', 5, 8.50, '=D4*E4', '0:00', 'Opening'],
      ['2', 'Brocade Crown', '4"', 3, 12.00, '=D5*E5', '0:15', ''],
      ['3', 'Crackling Flower', '3"', 6, 7.50, '=D6*E6', '0:30', 'Build up'],
      [], ['', '', '', 'Total Cost', '', '=SUM(F4:F20)', '', '']
    ]);
    styleSheet(ws, 3, [8, 22, 8, 6, 10, 10, 12, 20]);
    XLSX.utils.book_append_sheet(wb, coerceFormulas(ws), safeSheetName('Shot Chart'));
  } else {
    XLSX.utils.book_append_sheet(wb, buildPnLSheet(prof), safeSheetName('P&L'));
    XLSX.utils.book_append_sheet(wb, buildScenariosSheet(prof), safeSheetName('Scenarios'));
    XLSX.utils.book_append_sheet(wb, buildInstructionsSheet(prof, type), safeSheetName('Instructions'));
  }
  const outputPath = path.join(OUTPUT_DIR, filename);
  XLSX.writeFile(wb, outputPath, { cellStyles: true });
  forceRecalcOnOpen(outputPath);
  return outputPath;
}

// SheetJS writes formulas without cached values, so viewers that don't
// recalculate show blank totals. Ask Excel / LibreOffice to recalc on open.
function forceRecalcOnOpen(filePath) {
  const AdmZip = require('adm-zip');
  const zip = new AdmZip(filePath);
  const entry = zip.getEntry('xl/workbook.xml');
  if (!entry) return filePath;
  const xml = zip.readAsText(entry);
  if (/<calcPr\b/.test(xml)) return filePath;
  zip.updateFile('xl/workbook.xml', Buffer.from(xml.replace('</workbook>', '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>'), 'utf8'));
  zip.writeZip(filePath);
  return filePath;
}

module.exports = {
  generateXLSX,
  OUTPUT_DIR,
  buildPricingSheet,
  buildPnLSheet,
  buildScenariosSheet,
  buildHighTicketRoiSheet,
  buildCashFlowForecastSheet,
  pricingSheetModel,
  PRICING_MARGIN_PCT,
  PRICING_TAX_RATE
};
