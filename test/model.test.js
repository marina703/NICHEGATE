require('dotenv').config();
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const router = require('../server/services/modelRouter');
const cfg = require('../server/services/modelConfig');

// Live API calls only run when explicitly enabled — keeps `npm test` free/fast.
const liveRun = cfg.enabled && String(process.env.RUN_MODEL_TESTS || '') === '1';

describe('modelRouter (shape, no network)', () => {
  it('exports the expected API', () => {
    assert.equal(typeof router.cheapSummarize, 'function');
    assert.equal(typeof router.scoreOptions, 'function');
    assert.equal(typeof router.generateIdeas, 'function');
    assert.equal(typeof router.fallbackChat, 'function');
    assert.equal(typeof router.resetCycleCounter, 'function');
    assert.equal(typeof router.status, 'function');
  });

  it('reports status without leaking the key', () => {
    const s = router.status();
    assert.equal(typeof s.enabled, 'boolean');
    assert.equal(typeof s.hasKey, 'boolean');
    assert.ok(s.models && typeof s.models.ideation === 'string');
    assert.ok(!JSON.stringify(s).includes('sk-'), 'status must not contain a key');
  });

  it('redacts key-shaped strings', () => {
    assert.ok(!router.redact('failed with sk-or-v1-abcdef123456').includes('abcdef'));
  });

  it('returns null immediately when the model layer is disabled', { skip: cfg.enabled }, async () => {
    assert.equal(await router.cheapSummarize('hello'), null);
    assert.equal(await router.generateIdeas('hello'), null);
    assert.equal(await router.scoreOptions(['a', 'b']), null);
  });
});

describe('modelRouter (live OpenRouter — guarded)', () => {
  it('summarizes a trend snippet', { skip: !liveRun }, async () => {
    router.resetCycleCounter();
    const out = await router.cheapSummarize('Trend: AI resume builders are spiking. Remote workers want one-click resume styling. Why now?');
    assert.ok(out && out.length > 0, 'expected a summary');
  });

  it('scores and ranks ideas', { skip: !liveRun }, async () => {
    const out = await router.scoreOptions([
      'Generic invoice template for plumbers',
      'Red Flag Radar: a scorecard that flags nightmare clients before you quote'
    ]);
    assert.ok(out && out.length > 0, 'expected a judgment');
  });

  it('generates differentiated concepts', { skip: !liveRun }, async () => {
    const out = await router.generateIdeas('Niche: non-religious recovery journals. Give 3 differentiated product concepts.');
    assert.ok(out && out.length > 0, 'expected concepts');
  });
});