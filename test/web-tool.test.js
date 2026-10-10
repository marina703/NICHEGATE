const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const webTool = require('../server/services/webToolGenerator');
const productTypes = require('../server/services/productTypes');

test('webToolGenerator: buildInteractiveWebToolHTML outputs self-contained HTML app', () => {
  const html = webTool.buildInteractiveWebToolHTML({
    title: 'Custom Drone Photography Quote Estimator',
    nicheName: 'Drone Photography'
  }, { primary: '#0f172a', accent: '#38bdf8' });

  assert.ok(html.includes('<!DOCTYPE html>'));
  assert.ok(html.includes('Custom Drone Photography Quote Estimator'));
  assert.ok(html.includes('Drone Photography Pro Tool'));
  assert.ok(html.includes('<input type="range" id="hours"'));
  assert.ok(html.includes('function update()'));
  assert.ok(html.includes('localStorage'));
});

test('webToolGenerator: generateWebToolFile writes real valid HTML deliverable to disk', () => {
  const prof = { name: 'Energy Auditor', slug: 'energy-auditor' };
  const filePath = webTool.generateWebToolFile(prof, { title: 'Energy Audit ROI Calculator' });

  assert.ok(fs.existsSync(filePath));
  const content = fs.readFileSync(filePath, 'utf8');
  assert.ok(content.length > 500);
  assert.ok(content.includes('Energy Audit ROI Calculator'));

  // Clean up
  try { fs.unlinkSync(filePath); } catch (_) {}
});

test('productTypes: registers interactive-tool type as format html and price $29', () => {
  const t = productTypes.getType('interactive-tool');
  assert.ok(t);
  assert.equal(t.format, 'html');
  assert.equal(t.price, 29);
  assert.equal(productTypes.formatFor('interactive-tool'), 'html');
});
