// Regression: harvested marketplace demand (demandSignals) must flow into the
// SEO tag list and the design-token palette, and degrade HONESTLY (empty + a
// health note) when the Serper key is missing or the fetch fails — never invent
// demand. Also pins the merge rules: ≤13 tags, ≤20 chars, demand outranks our
// own hashtags, generic fillers come last.
const test = require('node:test');
const assert = require('node:assert/strict');
require('../server/database').init();

const demand = require('../server/services/demandSignals');
const seo = require('../server/services/seoEngine');
const themes = require('../server/services/themes');

test('mergeDemandTags: demand first, dedupes, caps at 13, truncates to 20 chars', () => {
  const base = ['invoice template', 'service invoice', 'editable'];
  const harvested = ['bookkeeping sheet', 'invoice template', 'a-really-long-demand-tag-that-exceeds-twenty-characters'];
  const out = demand.mergeDemandTags(base, harvested);
  assert.ok(Array.isArray(out) && out.length <= 13);
  // Harvested demand precedes our own base tags.
  assert.equal(out[0], 'bookkeeping sheet');
  // Dedupe across sources (invoice template is in both).
  assert.equal(out.filter((t) => t === 'invoice template').length, 1);
  // Every tag fits Etsy's 20-char limit (the long one is truncated, not dropped).
  for (const t of out) assert.ok(t.length <= 20, `tag too long: ${t}`);
  const clamped = out.find((t) => t.startsWith('a-really-long'));
  assert.equal(clamped, 'a-really-long-demand'); // first 20 chars, kept not dropped
});

test('fitTag: cuts on a word/hyphen boundary and never ships a mid-word fragment', () => {
  assert.equal(demand.fitTag('sustainablelandscaping'), '', 'one unbreakable word that cannot fit is dropped');
  assert.equal(demand.fitTag('native plant landscaping pros'), 'native plant');
  assert.equal(demand.fitTag('short tag'), 'short tag');
  assert.equal(demand.fitTag('a-really-long-demand-tag-that-exceeds-twenty-characters'), 'a-really-long-demand');
});

test('mergeDemandTags: drops tags shorter than 3 chars and tolerates empty inputs', () => {
  const out = demand.mergeDemandTags([], ['ab', 'valid tag', 'ok'], 13);
  assert.deepEqual(out, ['valid tag']);
  assert.deepEqual(demand.mergeDemandTags(null, null), []);
});

test('designTokens: derives sentiment + accent from real demand language', () => {
  const fin = demand.designTokens(['bookkeeping spreadsheet', 'tax tracker']);
  assert.equal(fin.sentiment, 'finance');
  assert.match(fin.accent, /^#[0-9a-f]{6}$/i);

  const well = demand.designTokens(['gratitude journal', 'mindfulness planner']);
  assert.equal(well.sentiment, 'wellness');

  const none = demand.designTokens(['random words', 'nothing relevant here']);
  assert.equal(none.sentiment, 'default');
  assert.match(none.accent, /^#[0-9a-f]{6}$/i);
});

test('etsyDemandTags degrades honestly: no niche → empty with a health note', async () => {
  const r = await demand.etsyDemandTags('');
  assert.deepEqual(r.tags, []);
  assert.equal(typeof r.health, 'string');
  assert.ok(r.health.length > 0);
});

test('etsyDemandTags with no Serper key returns [] + health, never invented tags', async () => {
  const saved = process.env.SERPER_API_KEY;
  delete process.env.SERPER_API_KEY;
  try {
    const r = await demand.etsyDemandTags('mobile notary');
    assert.deepEqual(r.tags, []);
    assert.match(r.health, /serper key not configured/);
  } finally {
    if (saved !== undefined) process.env.SERPER_API_KEY = saved;
  }
});

test('getCachedDemandTags: unknown niche is empty, cached harvest degrades to empty', async () => {
  assert.deepEqual(demand.getCachedDemandTags('__never_harvested_niche__'), []);
  const saved = process.env.SERPER_API_KEY;
  delete process.env.SERPER_API_KEY;
  try {
    await demand.etsyDemandTags('Test Niche', { forceRefresh: true });
    assert.deepEqual(demand.getCachedDemandTags('test niche'), []);
  } finally {
    if (saved !== undefined) process.env.SERPER_API_KEY = saved;
  }
});

test('buildTags merges explicit demand tags ahead of hashtags and fillers', () => {
  const prof = { name: 'Mobile Notary', tier: 'safe', hashtags: JSON.stringify(['#notary', '#loansigning']) };
  const out = seo.buildTags(prof, 'invoice', ['bookkeeping sheet', 'loan signing kit']);
  assert.ok(out.length <= 13 && out.length > 0);
  // Demand tags present and positioned before the generic filler bucket.
  assert.ok(out.includes('bookkeeping sheet'), 'demand tag missing');
  const demandIdx = out.indexOf('bookkeeping sheet');
  const fillerIdx = out.indexOf('digital download');
  assert.ok(fillerIdx === -1 || demandIdx < fillerIdx, 'demand should outrank generic fillers');
  for (const t of out) assert.ok(t.length <= 20);
});

test('buildTags caps demand so hashtags/fillers still get slots (≤13, no dupes)', () => {
  const prof = { name: 'X', tier: 'safe', hashtags: JSON.stringify(['#one', '#two']) };
  const flood = Array.from({ length: 20 }, (_, i) => `demand term ${i}`);
  const out = seo.buildTags(prof, 'checklist', flood);
  assert.ok(out.length <= 13, `too many tags: ${out.length}`);
  assert.equal(new Set(out).size, out.length, 'duplicate tags leaked through');
});

test('generateSEO accepts demandTags and stays within Etsy limits', () => {
  const prof = { name: 'House Cleaning', tier: 'safe', services: 'Cleaning', hashtags: '#cleaning' };
  const out = seo.generateSEO(prof, 'invoice', 'sage', ['cleaning checklist']);
  assert.ok(out.title.length > 0 && out.title.length <= 140);
  assert.ok(out.tags.length <= 13);
  assert.ok(out.tags.includes('cleaning checklist'));
  // Without demand the call still works (cache fallback, no throw).
  const plain = seo.generateSEO(prof, 'invoice', 'sage');
  assert.ok(plain.tags.length <= 13 && plain.tags.length > 0);
});

test('paletteForNiche biases the design tokens toward demand language', () => {
  const prof = { name: 'Generic Services', slug: 'generic', tier: 'safe', services: '' };
  const baseline = themes.paletteForNiche(prof);
  const withDemand = themes.paletteForNiche(prof, ['gratitude journal', 'mindfulness planner']);
  // Demand-driven sentiment routes to a wellness/recovery-flavored theme.
  assert.equal(withDemand.sentiment, 'wellness');
  assert.ok(typeof withDemand.name === 'string' && withDemand.name.length > 0);
  assert.ok(baseline.name, 'baseline palette still resolves without demand');
  // A finance demand signal flips the palette to a finance/trustworthy theme.
  const fin = themes.paletteForNiche(prof, ['tax deduction tracker', 'bookkeeping sheet']);
  assert.equal(fin.sentiment, 'finance');
});
