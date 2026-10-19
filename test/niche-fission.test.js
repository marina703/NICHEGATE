const test = require('node:test');
const assert = require('node:assert/strict');
const router = require('../server/services/modelRouter');
const cfg = require('../server/services/modelConfig');
const { fission, parseFission, SEEDS } = require('../server/services/nicheFission');

test('N1.1 parseFission: strips code fences and drops generic, short and duplicate names', () => {
  const reply = '```json\n' + JSON.stringify([
    { name: 'Hospice Chaplain Note Keeper', buyer: 'chaplains', intent: 'log visits', why_underserved: 'no tools' },
    { name: 'Hospice Chaplain Note Keeper', buyer: 'dup', intent: '', why_underserved: '' },
    { name: 'Generic Template Pack', buyer: 'x', intent: '', why_underserved: '' },
    { name: 'Hi', buyer: 'x', intent: '', why_underserved: '' },
    { name: 'Night-Shift Dental Hygienist Sleep Log', buyer: 'hygienists', intent: 'sleep', why_underserved: 'shift work' }
  ]) + '\n```';
  const out = parseFission(reply);
  assert.deepEqual(out.map((n) => n.name), [
    'Hospice Chaplain Note Keeper',
    'Night-Shift Dental Hygienist Sleep Log'
  ]);
});

test('N1.1 parseFission: malformed or non-array replies return []', () => {
  assert.deepEqual(parseFission(null), []);
  assert.deepEqual(parseFission('not json at all'), []);
  assert.deepEqual(parseFission('[{"name": "unterminated'), []);
  assert.deepEqual(parseFission('{"name":"object not array"}'), []);
});

test('N1.1 fission: AI off returns [] and makes no model call', async () => {
  const origEnabled = cfg.enabled;
  const origGenerate = router.generateIdeas;
  let calls = 0;
  cfg.enabled = false;
  router.generateIdeas = async () => { calls++; return '[]'; };
  try {
    assert.deepEqual(await fission('fitness', 5), []);
    assert.equal(calls, 0);
  } finally {
    cfg.enabled = origEnabled;
    router.generateIdeas = origGenerate;
  }
});

test('N1.1 fission: output is parsed from one model call and capped at count', async () => {
  const origEnabled = cfg.enabled;
  const origGenerate = router.generateIdeas;
  let calls = 0;
  cfg.enabled = true;
  router.generateIdeas = async () => {
    calls++;
    return JSON.stringify([
      { name: 'Pet Hospice Medication Calendar' },
      { name: 'Retired Racehorse Retraining Log' },
      { name: 'Dyslexic Adult Learner Reading Tracker' },
      { name: 'Retired Racehorse Retraining Log' }
    ]);
  };
  try {
    const out = await fission('pet care', 2);
    assert.equal(calls, 1);
    assert.equal(out.length, 2);
    assert.equal(out[0].name, 'Pet Hospice Medication Calendar');
  } finally {
    cfg.enabled = origEnabled;
    router.generateIdeas = origGenerate;
  }
});

test('N1.1 SEEDS covers at least 10 broad domains', () => {
  assert.ok(SEEDS.length >= 10);
  assert.equal(new Set(SEEDS).size, SEEDS.length);
});
