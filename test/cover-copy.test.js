// Regression: marketplace cover copy must come from real product data (concept
// → name + brief → library), never the canned per-type headline on its own.
const test = require('node:test');
const assert = require('node:assert/strict');
const ds = require('../server/services/designStudio');
const productCopy = require('../server/services/productCopy');

const prof = { name: 'Make Money From Pinterest', slug: 'x', services: '[]' };

test('thumbCoverCopy: concept JSON wins over name and brief', () => {
  const product = {
    name: 'Make Money From Pinterest — Income Tracker',
    type: 'spreadsheet',
    brief: 'Ignored: when a concept exists.',
    concept: JSON.stringify({
      name: 'Make Money From Pinterest — Pin Revenue Dashboard',
      pitch: 'See every Pinterest income stream at a glance',
      benefits: ['Affiliate', 'Sponsors', 'Own products']
    })
  };
  const [title, sub, benefits] = ds.thumbCoverCopy(product, prof);
  assert.equal(title, 'Pin Revenue Dashboard');
  assert.equal(sub, 'See every Pinterest income stream at a glance');
  assert.deepEqual(benefits, ['Affiliate', 'Sponsors', 'Own products']);
});

test('thumbCoverCopy: product name tail + colon brief become title/sub/benefits', () => {
  const product = {
    name: 'Make Money From Pinterest — Income Tracker',
    type: 'spreadsheet',
    brief: 'Track every dollar earned from Pinterest: affiliate links, sponsor pins, idea pins, and traffic-to-sales conversion.'
  };
  const [title, sub, benefits, format] = ds.thumbCoverCopy(product, prof);
  assert.equal(title, 'Income Tracker');
  assert.equal(sub, 'Track every dollar earned from Pinterest');
  assert.equal(benefits.length, 3);
  assert.ok(benefits.includes('Affiliate links'));
  assert.equal(format, 'XLSX · Formulas');
});

test('thumbCoverCopy: colon-less brief falls to first sentence, library benefits', () => {
  const product = {
    name: 'Make Money From Pinterest — Keyword Tracker',
    type: 'roi',
    brief: 'Track keyword rankings for every board over time and watch which pins compound.'
  };
  const [title, sub, benefits] = ds.thumbCoverCopy(product, prof);
  assert.equal(title, 'Keyword Tracker');
  assert.match(sub, /^Track keyword rankings/);
  assert.deepEqual(benefits, ['Track cost vs return', 'Break-even built in', 'Instant projections']);
});

test('thumbCoverCopy: generic auto-name falls back to the per-type library', () => {
  const product = { name: 'Make Money From Pinterest Checklist', type: 'checklist' };
  const [title, sub] = ds.thumbCoverCopy(product, prof);
  assert.equal(title, 'Service Quality Checklist');
  assert.equal(sub, 'Never miss a step on the job');
});

test('thumbCoverCopy: library covers roi and decision-matrix (no "noun + type" garbage)', () => {
  for (const [type, title] of [['roi', 'ROI Calculator'], ['decision-matrix', 'Decision Matrix']]) {
    const [t, , , format] = ds.thumbCoverCopy({ name: `Make Money From Pinterest ${type}`, type }, prof);
    assert.equal(t, title, type);
    assert.ok(format && format.length > 3, type);
  }
});

test('productCopy: deriveCopy is the single owner of concept → name → brief', () => {
  const product = {
    name: 'Make Money From Pinterest — Income Tracker',
    type: 'spreadsheet',
    brief: 'Track every dollar earned from Pinterest: affiliate links, sponsor pins, idea pins.'
  };
  const copy = productCopy.deriveCopy(product, prof);
  assert.equal(copy.title, 'Income Tracker');
  assert.equal(copy.sub, 'Track every dollar earned from Pinterest');
  assert.deepEqual(copy.benefits, ['Affiliate links', 'Sponsor pins', 'Idea pins']);
  // Generic auto-name contributes no title
  assert.equal(productCopy.deriveTitle({ name: 'Make Money From Pinterest spreadsheet', type: 'spreadsheet' }, prof), null);
});

test('heroSnippetForCover: data types show REAL niche service rows', () => {
  const nicheProf = { ...prof, services: JSON.stringify([['Affiliate Pin Campaigns', '$500'], ['Sponsored Pin Packages', '$350'], ['Digital Product Sales', '$250']]) };
  const product = { name: 'Make Money From Pinterest — Income Tracker', type: 'spreadsheet', brief: 'Track every dollar earned from Pinterest: affiliate links, sponsor pins, idea pins.' };
  const hero = ds.heroSnippetForCover(product, nicheProf, {});
  assert.ok(hero.includes('Affiliate Pin Campaigns'), 'service rows missing');
  assert.ok(hero.includes('$500'), 'service price missing');
  assert.ok(!hero.includes('QUOTE IT IN 60 SECONDS'), 'canned quote table leaked');
});

test('heroSnippetForCover: checklist rows come from the brief, not canned trade steps', () => {
  const product = { name: 'Make Money From Pinterest — Monetization Checklist', type: 'checklist', brief: 'Monetize from zero: profile optimization, keyword-rich boards, pin formats.' };
  const hero = ds.heroSnippetForCover(product, prof, {});
  assert.ok(hero.includes('Profile optimization'));
  assert.ok(!hero.includes('Arrive with tools'), 'canned trade step leaked');
});
