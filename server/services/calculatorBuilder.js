// ═══════════════════════════════════════════════════════════════════════════
// PROFIT & PRICING CALCULATOR — XLSX builder ($15)
// Generates spreadsheets with live Excel formulas for profit calculation,
// pricing scenarios, break-even analysis, and tax estimates.
// ═══════════════════════════════════════════════════════════════════════════

const XLSX = require('xlsx');

function buildCalculatorXLSX(prof, opts) {
  const niche = prof.name || 'Small Business';
  const services = (prof.services || '').match(/\[\[.*?\]\]/g) || [];
  const parsed = services.map(s => {
    try { return JSON.parse(s); } catch(e) { return null; }
  }).filter(Boolean).flat();
  const svcName = parsed.length ? parsed[0][0] : 'Service';
  const basePrice = parsed.length && parsed[0][1] ? parseFloat(String(parsed[0][1]).replace(/[^0-9.]/g,'')) || 100 : 100;

  const wb = XLSX.utils.book_new();

  // ── SHEET 1: PROFIT CALCULATOR ──
  const profitData = [
    [niche + ' — Profit Calculator', '', '', ''],
    ['', '', '', ''],
    ['EXPENSES', 'Monthly Cost', 'Annual Cost', 'Notes'],
    ['Insurance', 200, '=B4*12', 'General liability + professional'],
    ['Software & Tools', 150, '=B5*12', 'Scheduling, accounting, CRM'],
    ['Marketing', 300, '=B6*12', 'Google Ads, social, SEO'],
    ['Vehicle / Transport', 400, '=B7*12', 'Gas, maintenance, insurance'],
    ['Supplies & Materials', 500, '=B8*12', 'Per-job consumables'],
    ['Phone & Internet', 100, '=B9*12', 'Business line + data'],
    ['Office / Storage', 200, '=B10*12', 'Workspace or storage unit'],
    ['Miscellaneous', 150, '=B11*12', 'Unexpected costs'],
    ['TOTAL MONTHLY EXPENSES', '=SUM(B4:B11)', '=SUM(C4:C11)', ''],
    ['', '', '', ''],
    ['REVENUE SCENARIOS', 'Jobs/Month', 'Avg Price', 'Monthly Revenue'],
    ['Conservative', 8, basePrice, '=C15*B15'],
    ['Moderate', 15, Math.round(basePrice * 1.2), '=C16*B16'],
    ['Aggressive', 25, Math.round(basePrice * 1.5), '=C17*B17'],
    ['', '', '', ''],
    ['PROFIT ANALYSIS', 'Conservative', 'Moderate', 'Aggressive'],
    ['Monthly Revenue', '=D15', '=D16', '=D17'],
    ['Monthly Expenses', '=B12', '=B12', '=B12'],
    ['Monthly Profit (Before Tax)', '=B21-B22', '=C21-C22', '=D21-D22'],
    ['Tax Rate (25%)', '=B23*0.25', '=C23*0.25', '=D23*0.25'],
    ['Monthly Profit (After Tax)', '=B23-B24', '=C23-C24', '=D23-D24'],
    ['Annual Profit (After Tax)', '=B25*12', '=C25*12', '=D25*12'],
    ['', '', '', ''],
    ['BREAK-EVEN ANALYSIS', '', '', ''],
    ['Monthly Fixed Costs', '=B12', '', ''],
    ['Profit Per Job (at avg price)', '=C16-B12/B16', '', ''],
    ['Break-Even Jobs/Month', '=CEILING(B29/B30,1)', '', 'Minimum jobs to cover costs'],
    ['Break-Even Revenue', '=B31*C16', '', 'Minimum monthly revenue'],
  ];

  const wsProfit = XLSX.utils.aoa_to_sheet(profitData);
  wsProfit['!cols'] = [{ wch: 30 }, { wch: 18 }, { wch: 18 }, { wch: 35 }];
  XLSX.utils.book_append_sheet(wb, wsProfit, 'Profit Calculator');

  // ── SHEET 2: PRICING SCENARIOS ──
  const pricingData = [
    [niche + ' — Pricing Scenarios', '', '', '', ''],
    ['', '', '', '', ''],
    ['Service', 'Your Cost', 'Markup', 'Your Price', 'Competitor Range'],
    [svcName, Math.round(basePrice * 0.3), '2.5x', basePrice, (basePrice * 0.8) + ' - ' + (basePrice * 1.3)],
    ['Package: Basic', Math.round(basePrice * 0.2), '3x', Math.round(basePrice * 0.8), (basePrice * 0.6) + ' - ' + basePrice],
    ['Package: Professional', Math.round(basePrice * 0.4), '3x', Math.round(basePrice * 1.8), (basePrice * 1.2) + ' - ' + (basePrice * 2)],
    ['Package: Premium', Math.round(basePrice * 0.6), '3.5x', Math.round(basePrice * 3.2), (basePrice * 2.5) + ' - ' + (basePrice * 4)],
    ['Rush / Emergency', Math.round(basePrice * 0.5), '4x', Math.round(basePrice * 2.5), (basePrice * 2) + ' - ' + (basePrice * 3.5)],
    ['Consultation (1hr)', 25, '4x', 100, '75 - 150'],
    ['Follow-up Visit', 30, '3x', 90, '60 - 120'],
    ['', '', '', '', ''],
    ['PROFIT MARGIN BY PRICE POINT', '', '', '', ''],
    ['If you charge...', 'Revenue/Month (15 jobs)', 'Expenses', 'Profit', 'Margin'],
    [basePrice, '=B13*15', '=\'Profit Calculator\'!B12', '=B13-C13', '=D13/B13'],
    [Math.round(basePrice * 1.2), '=B14*15', '=\'Profit Calculator\'!B12', '=B14-C14', '=D14/B14'],
    [Math.round(basePrice * 1.5), '=B15*15', '=\'Profit Calculator\'!B12', '=B15-C15', '=D15/B15'],
    [Math.round(basePrice * 2), '=B16*15', '=\'Profit Calculator\'!B12', '=B16-C16', '=D16/B16'],
  ];

  const wsPricing = XLSX.utils.aoa_to_sheet(pricingData);
  wsPricing['!cols'] = [{ wch: 25 }, { wch: 22 }, { wch: 15 }, { wch: 18 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, wsPricing, 'Pricing Scenarios');

  // ── SHEET 3: GROWTH PROJECTIONS ──
  const growthData = [
    [niche + ' — 12-Month Growth Projection', '', '', '', '', ''],
    ['', '', '', '', '', ''],
    ['Month', 'Jobs', 'Avg Price', 'Revenue', 'Expenses', 'Profit'],
    ['Month 1', 5, basePrice, '=B4*C4', '=\'Profit Calculator\'!B12', '=D4-E4'],
    ['Month 2', 8, basePrice, '=B5*C5', '=\'Profit Calculator\'!B12', '=D5-E5'],
    ['Month 3', 10, Math.round(basePrice * 1.1), '=B6*C6', '=\'Profit Calculator\'!B12', '=D6-E6'],
    ['Month 4', 12, Math.round(basePrice * 1.1), '=B7*C7', '=\'Profit Calculator\'!B12', '=D7-E7'],
    ['Month 5', 15, Math.round(basePrice * 1.2), '=B8*C8', '=\'Profit Calculator\'!B12', '=D8-E8'],
    ['Month 6', 18, Math.round(basePrice * 1.2), '=B9*C9', '=\'Profit Calculator\'!B12', '=D9-E9'],
    ['Month 7', 20, Math.round(basePrice * 1.3), '=B10*C10', '=\'Profit Calculator\'!B12', '=D10-E10'],
    ['Month 8', 22, Math.round(basePrice * 1.3), '=B11*C11', '=\'Profit Calculator\'!B12', '=D11-E11'],
    ['Month 9', 25, Math.round(basePrice * 1.4), '=B12*C12', '=\'Profit Calculator\'!B12', '=D12-E12'],
    ['Month 10', 28, Math.round(basePrice * 1.4), '=B13*C13', '=\'Profit Calculator\'!B12', '=D13-E13'],
    ['Month 11', 30, Math.round(basePrice * 1.5), '=B14*C14', '=\'Profit Calculator\'!B12', '=D14-E14'],
    ['Month 12', 32, Math.round(basePrice * 1.5), '=B15*C15', '=\'Profit Calculator\'!B12', '=D15-E15'],
    ['', '', '', '', '', ''],
    ['TOTALS', '=SUM(B4:B15)', '', '=SUM(D4:D15)', '=SUM(E4:E15)', '=SUM(F4:F15)'],
    ['AVERAGES', '=AVERAGE(B4:B15)', '=AVERAGE(C4:C15)', '=AVERAGE(D4:D15)', '', '=AVERAGE(F4:F15)'],
  ];

  const wsGrowth = XLSX.utils.aoa_to_sheet(growthData);
  wsGrowth['!cols'] = [{ wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(wb, wsGrowth, 'Growth Projections');

  // ── SHEET 4: TAX ESTIMATOR ──
  const taxData = [
    [niche + ' — Tax Estimator', '', ''],
    ['', '', ''],
    ['INCOME', 'Amount', 'Notes'],
    ['Gross Annual Revenue', '=\'Growth Projections\'!D17', 'From growth projections'],
    ['Business Expenses', '=\'Profit Calculator\'!C12', 'Total annual expenses'],
    ['Net Business Income', '=B5-B6', ''],
    ['', '', ''],
    ['TAX ESTIMATES', '', ''],
    ['Self-Employment Tax (15.3%)', '=B7*0.153', 'Social Security + Medicare'],
    ['Federal Income Tax (est. 22%)', '=B7*0.22', 'Varies by total household income'],
    ['State Income Tax (est. 5%)', '=B7*0.05', 'Varies by state — adjust accordingly'],
    ['TOTAL ESTIMATED TAX', '=B10+B11+B12', ''],
    ['Effective Tax Rate', '=B13/B7', ''],
    ['', '', ''],
    ['QUARTERLY PAYMENTS', '', ''],
    ['Q1 (April 15)', '=B13/4', ''],
    ['Q2 (June 15)', '=B13/4', ''],
    ['Q3 (Sept 15)', '=B13/4', ''],
    ['Q4 (Jan 15)', '=B13/4', ''],
    ['', '', ''],
    ['SET ASIDE EACH PAYMENT', '=B13/12', 'Put this much in savings every month'],
  ];

  const wsTax = XLSX.utils.aoa_to_sheet(taxData);
  wsTax['!cols'] = [{ wch: 30 }, { wch: 18 }, { wch: 45 }];
  XLSX.utils.book_append_sheet(wb, wsTax, 'Tax Estimator');

  // Generate buffer
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return buf;
}

module.exports = { buildCalculatorXLSX };
