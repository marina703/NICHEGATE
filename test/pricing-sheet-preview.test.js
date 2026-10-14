// The cover's tablet mockup must show the same numbers the sold XLSX calculates.
// Both read xlsxGenerator.pricingSheetModel, and the sheet's Tax/Margin formulas
// use the same constants, so this test pins the mirror in place.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fileFactory = require('../server/services/fileFactory');
const xlsxGen = require('../server/services/xlsxGenerator');

const prof = {
  id: 1,
  name: 'Mobile Notary',
  slug: 'mobile-notary',
  emoji: '✍️',
  tier: 'safe',
  services: JSON.stringify([['Loan Signing', '$150'], ['General Notary', '$75']])
};

const product = {
  id: 9001,
  profession_id: 1,
  name: 'Mobile Notary Spreadsheet',
  type: 'spreadsheet',
  price: '$17',
  brief: 'Pricing calculator for mobile notaries.',
  theme: null,
  html_content: '<!-- auto-generated -->'
};

test('pricingSheetModel totals match the sheet formulas (subtotal, tax, grand)', () => {
  const m = xlsxGen.pricingSheetModel(prof);
  assert.equal(m.lines.length, 2);
  assert.equal(m.subtotal, 225);
  assert.equal(m.taxRate, xlsxGen.PRICING_TAX_RATE);
  assert.ok(Math.abs(m.tax - 225 * 0.08) < 1e-9);
  assert.ok(Math.abs(m.grand - 225 * 1.08) < 1e-9);
  // Net = line total after the sheet's margin column (40%).
  assert.ok(Math.abs(m.lines[0].net - 150 * 0.6) < 1e-9);
});

test('spreadsheet preview renders the sheet columns and the same totals', () => {
  const html = fileFactory.buildPreviewHTML(product, prof);
  assert.ok(!/Preview not available/i.test(html));
  assert.ok(!/undefined/.test(html));
  for (const col of ['Base Price', 'Qty', 'Line Total', 'Margin %', 'Net', 'Subtotal', 'Tax (8%)', 'Grand Total']) {
    assert.ok(html.includes(col), `missing column/row: ${col}`);
  }
  assert.ok(html.includes('Loan Signing') && html.includes('General Notary'));
  assert.ok(html.includes('$243'), 'grand total 225 + 8% tax = $243');
});

test('pricing-sheet preview with no services shows no invented rows', () => {
  const html = fileFactory.buildPreviewHTML(product, { ...prof, services: '[]' });
  assert.ok(!html.includes('Professional Consultation'), 'must mirror the sold file, not a fallback');
});
