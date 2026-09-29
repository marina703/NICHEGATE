const test = require('node:test');
const assert = require('node:assert/strict');
const mp = require('../server/services/marketplace');
const { db, init } = require('../server/database');
init();

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
