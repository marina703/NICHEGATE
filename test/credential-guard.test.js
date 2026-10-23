// Credential guard — the single definition of "is this a real secret?".
//
// Regression coverage for the bug that let PLACEHOLDER_FILL_IN masquerade as a
// live token: every channel's configured() check used to read the env var
// directly, so the marketing dashboard reported channels as "connected" that
// had never authenticated.
const test = require('node:test');
const assert = require('node:assert/strict');
const { isRealSecret, envIsReal, rowIsReal } = require('../server/services/credentialGuard');

test('isRealSecret accepts genuine-looking credentials', () => {
  for (const v of ['5EwtbQxYz9abc123DEF', 'pina_A1b2C3d4E5', 'gho_16C7e42F292c6912E7710c838347Ae17B8a', 'sec_tok_4eC39HqLyjWDarjtT1zdp7dc']) {
    assert.equal(isRealSecret(v), true, `${v} should count as real`);
  }
});

test('isRealSecret rejects every template sentinel shape', () => {
  for (const v of [
    'PLACEHOLDER_FILL_IN', 'PLACEHOLDER', 'placeh',
    'your_gumroad_token', 'your_etsy_client_id',
    '<your-token-here>', '<fill-in>',
    'xxxx', 'XXXX', 'example_token', 'dummy_secret',
    'test', 'test_token',
    '', '   ', null, undefined, 42,
  ]) {
    assert.equal(isRealSecret(v), false, `${JSON.stringify(v)} should NOT count as real`);
  }
});

test('isRealSecret does not over-reject real values that merely contain a keyword', () => {
  // Conservative guard: only whole-value shapes are rejected. A real token that
  // happens to contain "test" mid-string stays real.
  assert.equal(isRealSecret('tok_test_9f8a7b6c5d4e'), true);
  assert.equal(isRealSecret('a1b2c3d4e5f6'), true);
});

test('rowIsReal checks a DB token row, not its presence', () => {
  assert.equal(rowIsReal(null), false);
  assert.equal(rowIsReal({}), false);
  assert.equal(rowIsReal({ access_token: 'PLACEHOLDER_FILL_IN' }), false);
  assert.equal(rowIsReal({ access_token: 'tok_real_12345' }), true);
});

test('envIsReal reads process.env through the same rules', () => {
  const KEY = 'CREDENTIAL_GUARD_TEST_KEY';
  const saved = process.env[KEY];
  try {
    process.env[KEY] = 'real_token_abc123';
    assert.equal(envIsReal(KEY), true);
    process.env[KEY] = 'PLACEHOLDER_FILL_IN';
    assert.equal(envIsReal(KEY), false);
    process.env[KEY] = '';
    assert.equal(envIsReal(KEY), false);
    delete process.env[KEY];
    assert.equal(envIsReal(KEY), false);
  } finally {
    if (saved === undefined) delete process.env[KEY];
    else process.env[KEY] = saved;
  }
});

test('channel configured() checks reject placeholder credentials', () => {
  // These are the live checks the marketing dashboard reads. Set every relevant
  // env var to a placeholder and confirm each channel reports NOT configured.
  const KEYS = ['TIKTOK_ACCESS_TOKEN', 'REDDIT_ACCESS_TOKEN', 'X_BEARER_TOKEN',
    'PINTEREST_ACCESS_TOKEN', 'BUFFER_API_TOKEN', 'ESP_WEBHOOK_URL'];
  const saved = {};
  for (const k of KEYS) { saved[k] = process.env[k]; process.env[k] = 'PLACEHOLDER_FILL_IN'; }
  try {
    delete require.cache[require.resolve('../server/services/tiktokAds')];
    delete require.cache[require.resolve('../server/services/socialPoster')];
    delete require.cache[require.resolve('../server/services/bufferBridge')];
    delete require.cache[require.resolve('../server/services/sequenceEngine')];

    const tiktokAds = require('../server/services/tiktokAds');
    const socialPoster = require('../server/services/socialPoster');
    const bufferBridge = require('../server/services/bufferBridge');
    const seqEngine = require('../server/services/sequenceEngine');

    assert.equal(tiktokAds.tiktokConfigured(), false, 'TikTok placeholder must not read as configured');
    assert.equal(socialPoster.redditConfigured(), false, 'Reddit placeholder must not read as configured');
    assert.equal(socialPoster.xConfigured(), false, 'X placeholder must not read as configured');
    assert.equal(bufferBridge.bufferStatus().configured, false, 'Buffer placeholder must not read as configured');
    assert.equal(seqEngine.espWebhook(), null, 'ESP placeholder must not read as a webhook');
  } finally {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    delete require.cache[require.resolve('../server/services/tiktokAds')];
    delete require.cache[require.resolve('../server/services/socialPoster')];
    delete require.cache[require.resolve('../server/services/bufferBridge')];
    delete require.cache[require.resolve('../server/services/sequenceEngine')];
  }
});
