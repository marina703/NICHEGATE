const test = require('node:test');
const assert = require('node:assert/strict');
const mp = require('../server/services/marketplace');
const { db, init } = require('../server/database');
init();
const originalEtsyClientId = process.env.ETSY_CLIENT_ID;
const originalEtsyClientSecret = process.env.ETSY_CLIENT_SECRET;
process.env.ETSY_CLIENT_ID = 'test_client_id';
process.env.ETSY_CLIENT_SECRET = 'test_client_secret';
test.after(() => {
  if (originalEtsyClientId === undefined) delete process.env.ETSY_CLIENT_ID;
  else process.env.ETSY_CLIENT_ID = originalEtsyClientId;
  if (originalEtsyClientSecret === undefined) delete process.env.ETSY_CLIENT_SECRET;
  else process.env.ETSY_CLIENT_SECRET = originalEtsyClientSecret;
});

test('exchangeEtsyToken sends the authorization grant as URL-encoded form data', async () => {
  const keys = ['etsy_code_verifier', 'etsy_redirect_uri', 'etsy_oauth_state'];
  const previous = Object.fromEntries(keys.map((key) => [key, db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value]));
  const axios = require('axios');
  const originalPost = axios.post;
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('etsy_code_verifier', 'verifier_test')").run();
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('etsy_redirect_uri', 'https://example.test/callback')").run();
  axios.post = async (url, body, config) => {
    assert.match(String(url), /\/public\/oauth\/token$/);
    assert.equal(typeof body, 'string');
    assert.equal(config.headers['Content-Type'], 'application/x-www-form-urlencoded');
    const fields = new URLSearchParams(body);
    assert.equal(fields.get('grant_type'), 'authorization_code');
    assert.equal(fields.get('client_id'), process.env.ETSY_CLIENT_ID);
    assert.equal(fields.get('redirect_uri'), 'https://example.test/callback');
    assert.equal(fields.get('code'), 'authorization-code');
    assert.equal(fields.get('code_verifier'), 'verifier_test');
    assert.equal(fields.has('client_secret'), false);
    return { data: { access_token: 'test_access', refresh_token: 'test_refresh', expires_in: 3600 } };
  };
  try {
    const result = await mp.exchangeEtsyToken('authorization-code');
    assert.equal(result.access_token, 'test_access');
    assert.equal(db.prepare("SELECT refresh_token FROM marketplace_tokens WHERE platform = 'etsy'").get()?.refresh_token, 'test_refresh');
  } finally {
    axios.post = originalPost;
    for (const key of keys) {
      if (previous[key] === undefined) db.prepare('DELETE FROM settings WHERE key = ?').run(key);
      else db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, previous[key]);
    }
    db.prepare("DELETE FROM marketplace_tokens WHERE platform = 'etsy' AND access_token = 'test_access'").run();
  }
});

test('autoRefreshEtsyTokenIfExpiring: handles missing token cleanly', async () => {
  const existing = db.prepare("SELECT * FROM marketplace_tokens WHERE platform = 'etsy'").get();
  try {
    db.prepare("DELETE FROM marketplace_tokens WHERE platform = 'etsy'").run();
    const res = await mp.autoRefreshEtsyTokenIfExpiring();
    assert.equal(res.refreshed, false);
    assert.equal(res.reason, 'no_token');
  } finally {
    if (existing) {
      db.prepare("INSERT OR REPLACE INTO marketplace_tokens (platform, access_token, refresh_token, expires_at) VALUES (?, ?, ?, ?)")
        .run(existing.platform, existing.access_token, existing.refresh_token, existing.expires_at);
    }
  }
});

test('autoRefreshEtsyTokenIfExpiring: skips if token is fresh', async () => {
  const existing = db.prepare("SELECT * FROM marketplace_tokens WHERE platform = 'etsy'").get();
  try {
    const future = new Date(Date.now() + 3 * 3600 * 1000).toISOString();
    db.prepare("INSERT OR REPLACE INTO marketplace_tokens (platform, access_token, refresh_token, expires_at) VALUES ('etsy', 'a1', 'r1', ?)")
      .run(future);
    const res = await mp.autoRefreshEtsyTokenIfExpiring(30);
    assert.equal(res.refreshed, false);
    assert.equal(res.reason, 'not_expiring_soon');
  } finally {
    if (existing) {
      db.prepare("INSERT OR REPLACE INTO marketplace_tokens (platform, access_token, refresh_token, expires_at) VALUES (?, ?, ?, ?)")
        .run(existing.platform, existing.access_token, existing.refresh_token, existing.expires_at);
    } else {
      db.prepare("DELETE FROM marketplace_tokens WHERE platform = 'etsy'").run();
    }
  }
});
