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

test('buildPreviewHTML uses the real profession name (no undefined in output)', () => {
  for (const key of ['spreadsheet', 'roi', 'checklist']) {
    const html = fileFactory.buildPreviewHTML(productFor(key), prof);
    assert.ok(!/undefined/.test(html), `${key}: leaked "undefined" into preview`);
    assert.ok(html.includes(prof.name) || html.includes('Pinterest'), `${key}: missing niche context`);
  }
});
