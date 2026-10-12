// BUFFER BRIDGE — interim Pinterest publishing channel while the NicheGate
// developer app is trial-only. Covers: settings-driven configuration, the
// unguessable pin-image URL, GraphQL payload shape, duePins channel
// precedence (direct Pinterest token wins; Buffer only as fallback), and the
// public image route guard.
process.env.ADMIN_PASSWORD = 'buffer-test-only-2026';

const assert = require('node:assert/strict');
const test = require('node:test');
const { db } = require('../server/database');
const buffer = require('../server/services/bufferBridge');
const pinEngine = require('../server/services/pinEngine');

function setSetting(key, value) {
  if (value === null) db.prepare('DELETE FROM settings WHERE key = ?').run(key);
  else db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

const DB_SETTINGS = ['buffer_api_token', 'buffer_channel_id', 'buffer_board_service_id', 'public_base_url', 'pin_share_token'];

test.after(() => {
  for (const k of DB_SETTINGS) setSetting(k, null);
  delete process.env.BUFFER_API_TOKEN;
  delete process.env.BUFFER_CHANNEL_ID;
  delete process.env.BUFFER_BOARD_SERVICE_ID;
  delete process.env.PUBLIC_BASE_URL;
});

test('bufferBridge: status reports unconfigured when nothing is set', () => {
  for (const k of ['BUFFER_API_TOKEN', 'BUFFER_CHANNEL_ID', 'BUFFER_BOARD_SERVICE_ID', 'PUBLIC_BASE_URL']) delete process.env[k];
  const s = buffer.bufferStatus();
  assert.equal(s.configured, false);
});

test('bufferBridge: settings are read and win over nothing; status becomes configured', () => {
  setSetting('buffer_api_token', 'tok_test_123');
  setSetting('buffer_channel_id', 'chan_1');
  setSetting('buffer_board_service_id', 'board_9');
  const s = buffer.bufferStatus();
  assert.equal(s.configured, true);
  assert.equal(s.token, true);
  assert.equal(s.channelId, true);
  assert.equal(s.boardId, true);
  assert.match(s.publicBaseUrl, /^https?:\/\//);
});

test('bufferBridge: pinImagePublicUrl builds route sharing an unguessable token', () => {
  setSetting('public_base_url', 'https://nichegate-production.up.railway.app');
  const url = buffer.pinImagePublicUrl(0); // product 0 has no preview → null
  assert.equal(url, null);
  // shareTokenFor is deterministic per product and embeds the product id
  const t = buffer.shareTokenFor(42);
  assert.equal(t, `${buffer.shareTokenFor(0).split('-')[0]}-42`);
});

test('bufferBridge: publishToBuffer skips cleanly when unconfigured', async () => {
  const r = await buffer.publishToBuffer({ product_id: 0, title: 'x', description: 'y', scheduled_for: new Date().toISOString() });
  assert.equal(r.skipped, true);
  assert.ok(['no_buffer_token', 'no_buffer_channel_id', 'no_buffer_board_service_id', 'no_public_pin_image'].includes(r.reason));
});

test('bufferBridge: GraphQL payload carries channel/assets/board/dueAt', async () => {
  setSetting('buffer_api_token', 'tok_graphql_test');
  setSetting('buffer_channel_id', 'chan_GQL');
  setSetting('buffer_board_service_id', 'board_GQL');
  setSetting('public_base_url', 'https://pin.example.com');

  // Temporarily point at a capture sink instead of the real API
  const axios = require('axios');
  const captured = [];
  const realPost = axios.post;
  axios.post = async (url, body, cfg) => {
    captured.push({ url, body, cfg });
    return { status: 200, data: { data: { createPost: { post: { id: 'post_abc', dueAt: '2026-10-15T15:00:00.000Z' } } } } };
  };

  const axiosPath = require.resolve('axios');
  let realPinUrl;
  try {
    // pin.product_id=0 has no image → the bridge would skip, so stub
    // pinImagePublicUrl by pointing shareToken/prod at a real file path.
    realPinUrl = buffer.pinImagePublicUrl;
    buffer.pinImagePublicUrl = () => 'https://pin.example.com/pin-image/1/fake.jpg';
    const out = await buffer.publishToBuffer({
      product_id: 1, title: 'T', description: 'D', target_url: 'https://store.example.com/x?utm_source=pinterest', scheduled_for: '2026-10-15T15:00:00.000Z'
    });
    assert.equal(out.external_post_id, 'post_abc');
    assert.equal(captured.length, 1);
    assert.equal(captured[0].url, 'https://api.buffer.com');
    assert.ok(captured[0].body.query.includes('createPost'));
    assert.equal(captured[0].body.variables.input.channelId, 'chan_GQL');
    assert.equal(captured[0].body.variables.input.assets[0].image.url, 'https://pin.example.com/pin-image/1/fake.jpg');
    assert.equal(captured[0].body.variables.input.metadata.pinterest.boardServiceId, 'board_GQL');
    assert.equal(captured[0].body.variables.input.metadata.pinterest.url, 'https://store.example.com/x?utm_source=pinterest');
    assert.equal(captured[0].body.variables.input.dueAt, '2026-10-15T15:00:00.000Z');
    assert.equal(captured[0].body.variables.input.mode, 'customScheduled');
  } finally {
    axios.post = realPost;
    buffer.pinImagePublicUrl = realPinUrl;
  }
});

test('pinEngine: duePins prefers the direct Pinterest token over Buffer', async () => {
  setSetting('buffer_api_token', 'tok_precedence');
  setSetting('buffer_channel_id', 'chan_precedence');
  setSetting('buffer_board_service_id', 'board_precedence');
  setSetting('public_base_url', 'https://pin.example.com');
  // Make the buffer bridge claim readiness regardless of image existence
  const realReady = buffer.bufferReady;
  buffer.bufferReady = () => true;
  const realPinUrl = buffer.pinImagePublicUrl;
  buffer.pinImagePublicUrl = () => 'https://pin.example.com/x.jpg';

  // Insert a fake Pinterest token so the direct path is chosen
  db.prepare("INSERT OR REPLACE INTO marketplace_tokens (platform, access_token) VALUES ('pinterest', 'tok_direct_win')").run();

  const prof = db.prepare('INSERT INTO professions (name, slug) VALUES (?, ?)').run(`Buf Prof ${Date.now()}`, `buf-prof-${Date.now()}`);
  const profId = prof.lastInsertRowid;
  const prod = db.prepare("INSERT INTO products (profession_id, name, type, price, status) VALUES (?, ?, 'checklist', '$19.00', 'listed')")
    .run(profId, 'Buffer Precedence Item').lastInsertRowid;
  db.prepare(`INSERT INTO pins (product_id, title, description, board_hint, target_url, status, scheduled_for)
              VALUES (?, 'Buf Pin', 'desc', 'general', NULL, 'scheduled', ?)`)
    .run(prod, new Date(Date.now() - 3600000).toISOString());

  try {
    const due = await pinEngine.duePins(10);
    assert.ok(Array.isArray(due));
    const status = db.prepare("SELECT status FROM pins WHERE product_id = ?").get(prod);
    assert.equal(status.status, 'posted');
  } finally {
    buffer.bufferReady = realReady;
    buffer.pinImagePublicUrl = realPinUrl;
    db.prepare('DELETE FROM pins WHERE product_id = ?').run(prod);
    db.prepare('DELETE FROM products WHERE id = ?').run(prod);
    db.prepare('DELETE FROM professions WHERE id = ?').run(profId);
    db.prepare("DELETE FROM marketplace_tokens WHERE platform = 'pinterest'").run();
  }
});

test('pin-image route is sealed for anonymous visitors with a wrong token', async () => {
  const { app } = require('../server/index');
  await new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      Promise.all([
        fetch(`http://127.0.0.1:${port}/pin-image/1/wrongtoken`),
        // valid-looking token shape but nonexistent product: still 404
        fetch(`http://127.0.0.1:${port}/pin-image/999999/${buffer.shareTokenFor(0).split('-')[0]}-999999`)
      ]).then(([bad, missing]) => {
        try {
          assert.equal(bad.status, 404);
          assert.equal(missing.status, 404);
          server.close(resolve);
        } catch (e) {
          server.close(() => reject(e));
        }
      }).catch(e => { try { server.close(() => reject(e)); } catch { reject(e); } });
    });
  });
});
