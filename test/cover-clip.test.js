// Regression: cover copy was hard-cut at fixed character counts, which left
// unclosed parentheses on covers (e.g. "Complete Toolkit ... (11 deliverables").
const test = require('node:test');
const assert = require('node:assert/strict');
const { clipText } = require('../server/services/coverDirector');

const balanced = (s) => (s.match(/\(/g) || []).length === (s.match(/\)/g) || []).length;

test('clipText: returns short copy unchanged', () => {
  assert.equal(clipText('Roofing Spreadsheet', 60), 'Roofing Spreadsheet');
});

test('clipText: a truncated brief never ends with an unclosed parenthesis', () => {
  const brief = 'Complete Toolkit for Roofing Contractors and Property Managers (11 deliverables: checklist, invoice, quote, tracker)';
  for (let n = 40; n < brief.length; n++) {
    const out = clipText(brief, n);
    assert.ok(out.length <= n, `length ${out.length} exceeds ${n}`);
    assert.ok(balanced(out), `unbalanced parentheses at n=${n}: "${out}"`);
    assert.ok(brief.startsWith(out), `result must be a prefix of the original at n=${n}`);
  }
});

test('clipText: cuts at a word boundary, not mid-word', () => {
  assert.equal(clipText('Professional roofing estimate and invoice tracker for crews', 30), 'Professional roofing estimate');
});

// The cover subtitle came from derivePitch splitting the brief at its first colon,
// which sits inside "(11 deliverables: ...)" and left an unclosed parenthesis.
test('derivePitch: subtitle never ends inside an unclosed parenthesis', () => {
  const { derivePitch } = require('../server/services/productCopy');
  const product = { name: 'Roofing Toolkit', brief: 'Complete Toolkit for Roofing Contractors (11 deliverables: checklist, invoice, quote)' };
  const { sub } = derivePitch(product, { name: 'Roofing', services: '[]' });
  assert.equal(sub, 'Complete Toolkit for Roofing Contractors');
});
