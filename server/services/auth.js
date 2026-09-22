// ---------------------------------------------------------------------------
// AUTH — optional single-admin dashboard protection.
//   — Enforced ONLY when ADMIN_PASSWORD is set. Until then, requests pass
//     through untouched (zero behavior change, so existing deployments don't
//     break). Set ADMIN_PASSWORD to lock the admin surface.
//   — Login issues an httpOnly cookie bearing a random session token stored
//     in auth_sessions with an expiry.
//   — The autonomous engine runs server-side (DB/services directly), so login
//     never blocks sweeps/generation/publish — it only gates the HTTP surface.
// ---------------------------------------------------------------------------

const crypto = require('crypto');
const { db } = require('../database');

const COOKIE = 'ng_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const password = () => process.env.ADMIN_PASSWORD || '';

const enabled = () => !!password();
function safeEqual(a, b) {
  const ba = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function maturity() {
  // Never let a single config drift keep the session alive forever.
  db.prepare('DELETE FROM auth_sessions WHERE expires_at < ?').run(new Date().toISOString());
}

function createSession() {
  db.prepare('DELETE FROM auth_sessions WHERE expires_at < ?').run(new Date().toISOString());
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_TTL_MS);
  db.prepare('INSERT INTO auth_sessions (token, expires_at) VALUES (?, ?)').run(token, expires.toISOString());
  return { token, expires };
}

function tokenFrom(req) {
  const h = req.headers && req.headers.cookie;
  if (!h) return null;
  const m = h.split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '='));
  return m ? decodeURIComponent(m.split('=')[1]) : null;
}

function isValidToken(token) {
  if (!token) return false;
  const row = db.prepare('SELECT token FROM auth_sessions WHERE token = ? AND expires_at >= ?').get(token, new Date().toISOString());
  return !!row;
}

async function login(req, res) {
  if (!enabled()) return res.status(409).json({ error: 'Auth not enabled — set ADMIN_PASSWORD' });
  const { password: given } = req.body || {};
  if (!given || !safeEqual(given, password())) {
    // Short, fixed sleep to blunt brute force.
    await new Promise(r => setTimeout(r, 250 + Math.random() * 250));
    return res.status(401).json({ error: 'Invalid password' });
  }
  const sess = createSession();
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${sess.token}; HttpOnly; SameSite=Lax${secure}; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`);
  return res.json({ ok: true, expires: sess.expires });
}

function logout(req, res) {
  const token = tokenFrom(req);
  if (token) db.prepare('DELETE FROM auth_sessions WHERE token = ?').run(token);
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
  return res.json({ ok: true });
}

// Express middleware protecting a given path group. When auth is off, no-op.
function requireAuth(opts = {}) {
  return (req, res, next) => {
    if (!enabled()) return next();
    if (!isValidToken(tokenFrom(req))) {
      if (opts.json) return res.status(401).json({ error: 'Unauthorized' });
      return res.redirect('/login');
    }
    return next();
  };
}

module.exports = { enabled, login, logout, requireAuth, isValidToken, tokenFrom, createSession, COOKIE };
