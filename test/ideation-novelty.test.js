const test = require('node:test');
const assert = require('node:assert/strict');
const router = require('../server/services/modelRouter');
const cfg = require('../server/services/modelConfig');
const { generateConcept, noveltyScore } = require('../server/services/conceptEngine');

const PROF = { id: 1, name: 'Roofing Contractor', slug: 'roofing' };
const GENERIC = { name: 'Ultimate Template Kit', pitch: 'A roofing template.', benefits: [], differentiator: '' };
const SPECIFIC = {
  name: 'Storm Damage Claim Estimate Tracker',
  pitch: 'Track each insurer adjuster quote, deposit and follow-up so no hailstorm claim goes unpaid.',
  benefits: ['Adjuster quote log', 'Deposit tracker', 'Follow-up schedule'],
  differentiator: 'Built around insurer supplement cycles that only a roofer working storm claims knows to track.'
};

// Stub the model layer for one test and always restore the real state.
async function withStubbedModel(reply, fn) {
  const origEnabled = cfg.enabled;
  const origGenerate = router.generateIdeas;
  let calls = 0;
  cfg.enabled = true;
  router.generateIdeas = async () => {
    calls++;
    return typeof reply === 'function' ? reply(calls) : reply;
  };
  try {
    await fn(() => calls);
  } finally {
    cfg.enabled = origEnabled;
    router.generateIdeas = origGenerate;
  }
}

test('P2.1: a generic "Ultimate Template Kit" concept scores below 40', () => {
  assert.ok(noveltyScore(GENERIC) < 40, `scored ${noveltyScore(GENERIC)}`);
  assert.ok(noveltyScore(SPECIFIC) >= 60, `scored ${noveltyScore(SPECIFIC)}`);
});

test('P2.1: a generic concept is regenerated twice, then rejected (1 try + 2 retries)', async () => {
  await withStubbedModel(JSON.stringify(GENERIC), async (calls) => {
    const out = await generateConcept(PROF, 'checklist', null, null);
    assert.equal(out, null, 'no template-like concept is accepted');
    assert.equal(calls(), 3);
  });
});

test('P2.1: a generic first attempt is regenerated and the specific retry is returned', async () => {
  await withStubbedModel((n) => JSON.stringify(n === 1 ? GENERIC : SPECIFIC), async (calls) => {
    const out = await generateConcept(PROF, 'checklist', null, null);
    assert.ok(out, 'the regenerated concept is accepted');
    assert.equal(out.name, SPECIFIC.name);
    assert.equal(calls(), 2);
  });
});

test('P2.1: with the AI layer off, generateConcept returns null and spends no calls', async () => {
  const origEnabled = cfg.enabled;
  cfg.enabled = false;
  const origGenerate = router.generateIdeas;
  let calls = 0;
  router.generateIdeas = async () => { calls++; return null; };
  try {
    assert.equal(await generateConcept(PROF, 'checklist', null, null), null);
    assert.equal(calls, 0);
  } finally {
    cfg.enabled = origEnabled;
    router.generateIdeas = origGenerate;
  }
});
