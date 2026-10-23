// ─────────────────────────────────────────────────────────────────────────────
// BUFFER BRIDGE — interim Pinterest publishing via Buffer while NicheGate's
// own developer app is trial-only (trial pins are sandbox-hidden from the
// public). Buffer posts through Buffer's Standard-access app, so pins are
// PUBLIC immediately. Once the NicheGate app gains Standard access, duePins()
// prefers the direct Pinterest API path and this bridge goes unused.
//
// Buffer API (2026): GraphQL over POST https://api.buffer.com with a
// Personal Access Token (Settings → API in the Buffer dashboard).
// Requirements for a Pinterest post:
//   • channelId of the connected Pinterest channel
//   • an image asset with a PUBLIC url (Buffer fetches it server-side —
//     login-gated NicheGate files would fail)
//   • metadata.pinterest.boardServiceId (the board's serviceId)
// Scheduling: mode 'customScheduled' + dueAt ISO timestamp, or
// 'addToQueue' for Buffer's own queue.
// ─────────────────────────────────────────────────────────────────────────────

const { db } = require('../database');
const { isRealSecret } = require('./credentialGuard');

function bufferToken() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'buffer_api_token'").get();
  if (row && isRealSecret(row.value)) return row.value.trim();
  return isRealSecret(process.env.BUFFER_API_TOKEN) ? process.env.BUFFER_API_TOKEN : null;
}

function bufferChannelId() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'buffer_channel_id'").get();
  if (row && isRealSecret(row.value)) return row.value.trim();
  return isRealSecret(process.env.BUFFER_CHANNEL_ID) ? process.env.BUFFER_CHANNEL_ID : null;
}

function bufferBoardServiceId() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'buffer_board_service_id'").get();
  if (row && isRealSecret(row.value)) return row.value.trim();
  return isRealSecret(process.env.BUFFER_BOARD_SERVICE_ID) ? process.env.BUFFER_BOARD_SERVICE_ID : null;
}

// Public base URL for serving pin images to Buffer (must be reachable from
// Buffer's servers without a session).
function publicBaseUrl() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'public_base_url'").get();
  if (row && row.value) return String(row.value).replace(/\/+$/, '');
  return process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
}

// Buffer may not persist the pin's destination link; NicheGate's UTM-attributed
// URL is requested as metadata.pinterest.url anyway (best effort).
// Internal calls route through module.exports so tests can stub cleanly.
function bufferReady(pin) {
  return !!(bufferToken() && bufferChannelId() && bufferBoardServiceId() && module.exports.pinImagePublicUrl(pin.product_id));
}

// Public URL for the pin image via the unguessable pin-share token.
function pinImagePublicUrl(productId) {
  if (!productId) return null;
  const prod = db.prepare('SELECT preview_path FROM products WHERE id = ?').get(productId);
  if (!prod || !prod.preview_path) return null;
  if (!require('node:fs').existsSync(prod.preview_path)) return null;
  const token = shareTokenFor(productId);
  return `${publicBaseUrl()}/pin-image/${productId}/${token}.jpg`;
}

// Deterministic per-product secret stored once in settings — unguessable URL
// for the ONE image Buffer needs to fetch. Rotating it revokes prior links.
function shareTokenFor(productId) {
  let token = null;
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'pin_share_token'").get();
    if (row && row.value) token = row.value;
  } catch { /* fresh db */ }
  if (!token) {
    token = require('node:crypto').randomBytes(18).toString('hex');
    db.prepare("INSERT INTO settings (key, value) VALUES ('pin_share_token', ?)").run(token);
  }
  return `${token}-${productId}`;
}

// ── Buffer dispatch ──────────────────────────────────────────────────────────
// Returns { external_post_id } on success, { skipped, reason } when the
// bridge is unconfigured, or throws on real API errors (caller logs it).
async function publishToBuffer(pin, { useQueue = false } = {}) {
  const token = bufferToken();
  const channelId = bufferChannelId();
  const boardId = bufferBoardServiceId();
  if (!token) return { skipped: true, reason: 'no_buffer_token' };
  if (!channelId) return { skipped: true, reason: 'no_buffer_channel_id' };
  if (!boardId) return { skipped: true, reason: 'no_buffer_board_service_id' };

  const imageUrl = module.exports.pinImagePublicUrl(pin.product_id);
  if (!imageUrl) return { skipped: true, reason: 'no_public_pin_image' };

  const input = {
    channelId,
    text: `${pin.title || ''}${pin.title && pin.description ? ' — ' : ''}${pin.description || ''}`.slice(0, 480),
    schedulingType: 'automatic',
    mode: useQueue ? 'addToQueue' : 'customScheduled',
    assets: [{ image: { url: imageUrl } }],
    metadata: {
      pinterest: {
        boardServiceId: boardId,
        ...(pin.target_url ? { url: pin.target_url } : {})
      }
    }
  };
  if (!useQueue) {
    if (!pin.scheduled_for) return { skipped: true, reason: 'no_scheduled_time' };
    input.dueAt = new Date(pin.scheduled_for).toISOString();
  }

  const axios = require('axios');
  const res = await axios.post(
    'https://api.buffer.com',
    {
      query: `mutation CreatePost($input: CreatePostInput!) { createPost(input: $input) { ... on PostActionSuccess { post { id channelId dueAt status } } ... on MutationError { message } } }`,
      variables: { input }
    },
    {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 15000
    }
  );

  const payload = res.data && res.data.data && res.data.data.createPost;
  if (payload && payload.post) {
    return { external_post_id: payload.post.id, dueAt: payload.post.dueAt || null };
  }
  // A GraphQL mutation "error" still resolves HTTP 200 — surface the message.
  const message = (payload && payload.message) || (res.data.errors && res.data.errors[0] && res.data.errors[0].message) || 'unknown Buffer error';
  throw new Error(`Buffer createPost failed: ${message}`);
}

// ── Diagnostics (status endpoint, never throws) ─────────────────────────────
function bufferStatus() {
  const token = !!bufferToken();
  const channelId = !!bufferChannelId();
  const boardId = !!bufferBoardServiceId();
  return {
    configured: token && channelId && boardId,
    token, channelId, boardId,
    publicBaseUrl: publicBaseUrl()
  };
}

module.exports = { publishToBuffer, bufferReady, bufferStatus, pinImagePublicUrl, bufferToken, bufferChannelId, bufferBoardServiceId, publicBaseUrl, shareTokenFor };
