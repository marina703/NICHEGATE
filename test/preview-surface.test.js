// Preview surface parity: buildPreviewHTML must render REAL content for every
// registered product type — the same source of truth used by deliverable files,
// thumbnails, and the /api/products/:id/preview-html route. Regression for the
// old 7-type switch that fell through to "Preview not available".
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fileFactory = require('../server/services/fileFactory');
const productTypes = require('../server/services/productTypes');

const prof = {
  name: 'Make Money From Pinterest',
  slug: 'make-money-from-pinterest',
  emoji: '📌',
  tier: 'trend',
  services: JSON.stringify([['Affiliate Pin Campaigns', '$500']])
};

function productFor(type) {
  return {
    id: 4242,
    profession_id: 999999,
    name: `Make Money From Pinterest — ${type} Tester`,
    type,
    price: '$12',
    brief: 'A representative brief: affiliate links, sponsor pins, and idea pins.',
    theme: null,
    html_content: '<!-- auto-generated -->'
  };
}

test('buildPreviewHTML renders real content for every registered product type', () => {
  const keys = productTypes.getAllTypes().map((t) => t.key);
  assert.ok(keys.length >= 10, 'registry should list product types');
  for (const key of keys) {
    const html = fileFactory.buildPreviewHTML(productFor(key), prof);
    assert.equal(typeof html, 'string', key);
    assert.ok(html.length > 200, `${key}: preview too short (${html.length})`);
    assert.ok(!/Preview not available/i.test(html), `${key}: fell through to "not available"`);
    assert.match(html, /<!DOCTYPE html>/i, key);
  }
});

test('buildPreviewHTML uses the real profession name (no undefined in output) and wraps each spreadsheet row in <tr>', () => {
  const profWithServices = {
    ...prof,
    services: JSON.stringify([['Affiliate Pin Campaigns', '$500'], ['Sponsored Pin Packages', '$350'], ['Digital Product Sales', '$250']])
  };
  for (const key of ['spreadsheet', 'roi', 'checklist']) {
    const html = fileFactory.buildPreviewHTML(productFor(key), profWithServices);
    assert.ok(!/undefined/.test(html), `${key}: leaked "undefined" into preview`);
    assert.ok(html.includes(prof.name) || html.includes('Pinterest'), `${key}: missing niche context`);
  }
  const tableHtml = fileFactory.buildPreviewHTML(productFor('spreadsheet'), profWithServices);
  assert.equal((tableHtml.match(/<tbody><tr>/g) || []).length, 1, 'tbody must start with <tr>');
  assert.equal((tableHtml.match(/<\/tr>/g) || []).length >= 4, true, 'each service row must be wrapped in its own <tr>');
  // Innovative types must render their dedicated templates rather than falling back to the generic emoji card.
  for (const key of ['playbook', 'pricing-bible', 'interactive-tool', 'profit-calculator', 'sop-package', 'business-in-a-box']) {
    const html = fileFactory.buildPreviewHTML(productFor(key), profWithServices);
    assert.doesNotMatch(html, /class="card"><div class="emoji">/, `${key}: fell through to generic fallback card`);
  }
});
