const test = require('node:test');
const assert = require('node:assert/strict');
const mp = require('../server/services/marketplace');
const critic = require('../server/services/designCritic');
const { db, init } = require('../server/database');
init();

test('conceptFor returns null when no concept / not JSON / unnamed', () => {
  assert.equal(mp.conceptFor({}), null);
  assert.equal(mp.conceptFor({ concept: 'not json' }), null);
  assert.equal(mp.conceptFor({ concept: JSON.stringify({ pitch: 'x' }) }), null);
  assert.ok(mp.conceptFor({ concept: JSON.stringify({ name: 'Cool Title', pitch: 'p' }) }));
});

test('listingCopyFor falls back to SEO copy without a concept', () => {
  const prof = { name: 'Plumbing', tier: 'safe' };
  const product = { type: 'invoice' };
  const seo = { title: 'Plumbing Invoice Template', shortTitle: 'Plumbing Invoice Template', description: 'SEO DESC', tags: ['a', 'b'] };
  const out = mp.listingCopyFor(product, prof, seo);
  assert.ok(out.title.includes('Plumbing'));
  assert.equal(out.title.length <= 140, true);
  assert.match(out.description, /SEO DESC/);
  assert.equal(out.tags.length, 2);
});

test('listingCopyFor uses the AI concept name + pitch + benefits when present', () => {
  const prof = { name: 'Plumbing', tier: 'safe' };
  const product = { type: 'invoice', concept: JSON.stringify({
    name: 'ScopeLock Quote Builder',
    pitch: 'Locks your quote to scope before deposit.',
    benefits: ['Deposit trigger', 'Change-order pricing', 'Referral capture'],
    differentiator: 'Turns the quote into a signed scope checklist.'
  }) };
  const seo = { title: 'Plumbing Invoice Template', shortTitle: 'Plumbing Invoice Template', description: 'SEO DESC', tags: ['a', 'b'] };
  const out = mp.listingCopyFor(product, prof, seo);
  assert.equal(out.title, 'ScopeLock Quote Builder');
  assert.ok(out.description.includes('Locks your quote'));
  assert.ok(out.description.includes('Deposit trigger'));
  assert.ok(out.description.includes('signed scope checklist'));
  assert.ok(out.description.includes('SEO DESC'));  // SEO base still present for keywords
  assert.ok(out.description.length <= 4999);
});

test('marketplace publish guard blocks fail, unscored, and missing persisted review before uploads', async () => {
  const product = { id: 987654321 };
  const original = critic.critiqueCover;
  const outcomes = [
    { status: 'fail', publishAllowed: false, reason: 'text violation' },
    { status: 'unscored', publishAllowed: false, reason: 'model unavailable' },
    null
  ];
  try {
    for (const outcome of outcomes) {
      critic.critiqueCover = async () => outcome;
      await assert.rejects(mp.requirePublishableCover(product), error => error.code === 'COVER_REVIEW_FAILED');
    }
    critic.critiqueCover = async () => ({ status: 'pass', publishAllowed: true, reviewId: 11 });
    assert.equal((await mp.requirePublishableCover(product)).reviewId, 11);
  } finally {
    critic.critiqueCover = original;
  }
});

test('cover_reviews migration is available to the marketplace review flow', () => {
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'cover_reviews'").get().name, 'cover_reviews');
});

test('listingCopyFor truncates long titles to 140 chars and collapses whitespace', () => {
  const prof = { name: 'X', tier: 'safe' };
  const longName = 'A'.repeat(180);
  const product = { type: 'invoice', concept: JSON.stringify({ name: longName, pitch: 'p' }) };
  const seo = { title: 'T', shortTitle: 'T', description: 'D', tags: [] };
  const out = mp.listingCopyFor(product, prof, seo);
  assert.ok(out.title.length <= 140);
  assert.ok(!/\s\s/.test(out.title));
});