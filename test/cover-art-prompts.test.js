// Prompt style-token factory + off-niche scene quality gate.
const test = require('node:test');
const assert = require('node:assert/strict');
const coverArt = require('../server/services/coverArt');

const creatorProf = { name: 'Make Money From Pinterest', slug: 'make-money-from-pinterest' };
const product = { type: 'spreadsheet' };

test('buildArtPrompt: photo-cover profile appends the strict style tokens', () => {
  const p = coverArt.buildArtPrompt(creatorProf, product, 'photo-cover');
  for (const token of coverArt.STYLE_PROFILES['photo-cover']) {
    assert.ok(p.includes(token), `missing style token: ${token}`);
  }
});

test('buildArtPrompt: creator niches never get circuit-board / trading-floor scenes', () => {
  for (const type of ['spreadsheet', 'roi', 'checklist']) {
    const p = coverArt.buildArtPrompt(creatorProf, { type });
    assert.ok(!/circuit board|holographic|stock market|trading floor|candlestick|ticker tape/i.test(p),
      `off-niche scene leaked for ${type}: ${p}`);
  }
});

test('buildArtPrompt: vector-asset profile targets flat cutout assets', () => {
  const p = coverArt.buildArtPrompt(creatorProf, product, 'vector-asset');
  assert.ok(p.includes('transparent background'));
  assert.ok(p.includes('flat vector illustration'));
  assert.ok(!p.includes('photorealistic'));
});

test('buildArtPrompt: deterministic and byte-compatible for clean prompts', () => {
  const a = coverArt.buildArtPrompt(creatorProf, product);
  assert.equal(a, coverArt.buildArtPrompt(creatorProf, product));
  assert.equal(a, coverArt.promptFor(creatorProf, product), 'promptFor must alias buildArtPrompt');
});
