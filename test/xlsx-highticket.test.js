const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const xlsx = require('../server/services/xlsxGenerator');
const XLSX = require('xlsx');

test('xlsxGenerator: builds high-ticket multi-tab spreadsheet with ROI & Cash Flow models', () => {
  const prof = {
    name: 'Luxury Event Planner',
    services: JSON.stringify([['Full Event Production', '$12000'], ['Day-of Coordination', '$3500']])
  };

  const filename = `test-highticket-${Date.now()}.xlsx`;
  const filePath = xlsx.generateXLSX('high-ticket', prof, filename);

  assert.ok(fs.existsSync(filePath));
  const wb = XLSX.readFile(filePath);

  assert.ok(wb.SheetNames.includes('Pricing'));
  assert.ok(wb.SheetNames.includes('P&L'));
  assert.ok(wb.SheetNames.includes('Client ROI'));
  assert.ok(wb.SheetNames.includes('Cash Flow'));
  assert.ok(wb.SheetNames.includes('Scenarios'));
  assert.ok(wb.SheetNames.includes('Instructions'));

  // Clean up
  try { fs.unlinkSync(filePath); } catch {}
});
