const test = require('node:test');
const assert = require('node:assert/strict');
const designStudio = require('../server/services/designStudio');

test('designStudio: buildLifestyleMockupHTML creates rich multi-device lifestyle mockup', () => {
  const product = { name: 'Pool Care Route Manager', price: '$29.00', type: 'spreadsheet' };
  const prof = { name: 'Pool Maintenance', emoji: '🏊' };
  const html = designStudio.buildLifestyleMockupHTML(product, prof, { primary: '#0284c7', accent: '#06b6d4' });

  assert.ok(html.includes('NICHEGATE LIFESTYLE STUDIO'));
  assert.ok(html.includes('Pool Care Route Manager'));
  assert.ok(html.includes('$29.00'));
  assert.ok(html.includes('laptop-frame'));
  assert.ok(html.includes('tablet-frame'));
  assert.ok(html.includes('desk-shadow'));
});
