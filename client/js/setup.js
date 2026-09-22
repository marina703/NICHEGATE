// ─────────────────────────────────────────────────────────────────────────
// SETUP WIZARD — no inline handlers (CSP-safe). All interaction goes through
// delegated [data-action] clicks; every dynamic value uses textContent or
// esc() before it may touch innerHTML.
// ─────────────────────────────────────────────────────────────────────────
const API = '/api';

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function showToast(type, title, msg) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;bottom:20px;right:20px;padding:12px 18px;border-radius:8px;color:#e2e8f0;font-size:0.82rem;font-weight:600;z-index:999;background:#1a1a2e;border-left:3px solid ' + (type === 'success' ? '#22c55e' : type === 'error' ? '#ef4444' : '#3b82f6') + ';';
  el.textContent = title + ': ' + msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

async function connectEtsy() {
  try {
    // Pass our exact origin so Etsy's redirect_uri matches what's registered
    const callback = window.location.origin + '/api/marketplace/etsy/callback';
    const res = await fetch(`${API}/marketplace/etsy/auth?redirectUri=${encodeURIComponent(callback)}`);
    const data = await res.json();
    if (data.authUrl) {
      window.location.href = data.authUrl;
    } else {
      showToast('error', 'Auth URL Error', data.error || 'Could not get auth URL');
    }
  } catch (e) {
    showToast('error', 'Failed', e.message);
  }
}

async function applyBranding(target) {
  const logEl = document.getElementById('branding-log');
  const statusEl = document.getElementById('branding-status');
  logEl.textContent = '';
  statusEl.textContent = '⏳ Working…';
  statusEl.className = 'status-pill pending';
  try {
    const res = await fetch(`${API}/branding/apply-${target}`, { method: 'POST' });
    const d = await res.json();
    if (target === 'gumroad') {
      const lines = [`Attached logo covers: ${d.attached ?? 0} ✓ / ${d.failed ?? 0} ✗`];
      if (d.errors && d.errors.length) lines.push('Errors:\n' + d.errors.join('\n'));
      logEl.textContent = lines.join('\n');
      statusEl.textContent = d.success ? '✅ Logo applied to Gumroad' : '⚠️ Partial — see log';
      statusEl.className = 'status-pill ' + (d.success ? 'done' : 'error');
      showToast(d.success ? 'success' : 'error', 'Gumroad Branding', `${d.attached} attached / ${d.failed} failed`);
    } else {
      const lines = (d.steps || [])
        .filter(s => s.step !== 'assets')
        .map(s => `${s.ok ? '✅' : '❌'} ${s.step}: ${s.ok ? 'ok' : (s.message || ('HTTP ' + s.status) || 'failed')}`);
      logEl.textContent = lines.join('\n') || (d.error || 'No steps ran');
      statusEl.textContent = d.success ? '✅ Etsy branding applied' : '⚠️ Blocked — see log (usually .env Etsy API keys)';
      statusEl.className = 'status-pill ' + (d.success ? 'done' : 'error');
      showToast(d.success ? 'success' : 'error', 'Etsy Branding', d.success ? 'Icon + banner applied!' : 'Blocked — check .env keys');
    }
  } catch (e) {
    statusEl.textContent = '❌ ' + e.message;
    statusEl.className = 'status-pill error';
  }
}

async function loadBrandingStatus() {
  try {
    const res = await fetch(`${API}/branding/status`);
    const d = await res.json();
    const assets = (d.assets?.assets ? Object.values(d.assets.assets).filter(Boolean) : []);
    // Asset filenames come from the filesystem — escape before innerHTML.
    const names = assets.map(a => esc(a.file)).join(', ');
    const el = document.getElementById('branding-assets');
    el.innerHTML = assets.length
      ? `✅ <strong>${assets.length} brand assets</strong> synced from <code>nichegate designs</code> → <code>covers/</code><br>${names}`
      : `⚠️ No assets found in covers/. Put the PNGs from the "nichegate designs" folder into covers/.`;
    if (d.etsy && d.etsy.tokenPresent && d.etsyKeyOk === false) {
      el.innerHTML += '<br><span style="color:#f59e0b;">⚠️ ETSY_CLIENT_ID and ETSY_CLIENT_SECRET are identical — replace with your real Etsy keystring + secret, then reconnect via “Connect Etsy”.</span>';
    }
  } catch (e) { /* non-fatal */ }
}

async function checkStatus() {
  try {
    const res = await fetch(`${API}/setup/status`);
    const data = await res.json();

    // Etsy
    const etsyStep = document.getElementById('step-etsy');
    const etsyStatus = document.getElementById('etsy-status');
    if (data.etsy.connected) {
      etsyStep.classList.add('done');
      etsyStatus.className = 'status-pill done';
      etsyStatus.textContent = '✅ Etsy is fully connected and ready to list products.';
    } else {
      etsyStep.classList.remove('done');
      etsyStatus.className = 'status-pill error';
      etsyStatus.textContent = '❌ OAuth not completed — click Connect Etsy below';
    }

    // Gumroad
    const gumroadStep = document.getElementById('step-gumroad');
    const gumroadStatus = document.getElementById('gumroad-status');
    if (data.gumroad.connected) {
      gumroadStep.classList.add('done');
      gumroadStatus.className = 'status-pill done';
      gumroadStatus.textContent = '✅ Gumroad is fully connected and ready to list products.';
      document.getElementById('gumroad-content').innerHTML = '<p style="color:#22c55e;">✅ Gumroad is connected and ready to list products.</p>';
    } else {
      gumroadStatus.textContent = '❌ ' + data.gumroad.message;
      gumroadStatus.className = 'status-pill error';
    }

    // Discord
    const discordStep = document.getElementById('step-discord');
    const discordStatus = document.getElementById('discord-status');
    if (data.discord.configured) {
      discordStep.classList.add('done');
      discordStatus.className = 'status-pill done';
      discordStatus.textContent = '✅ Notifications active';
      document.getElementById('discord-content').innerHTML = '<p style="color:#22c55e;">✅ Discord notifications are active.</p>';
    }

    // Ready banner
    if (data.allReady) {
      document.getElementById('ready-banner').classList.add('show');
    }
  } catch (e) {
    console.error(e);
  }
}

function copyText(elementId) {
  const text = document.getElementById(elementId).textContent;
  navigator.clipboard.writeText(text).then(() => showToast('success', 'Copied', 'Redirect URI copied to clipboard.'));
}

// One delegated click handler replaces every former inline onclick.
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  if (a === 'connect-etsy') connectEtsy();
  else if (a === 'check-status') checkStatus();
  else if (a === 'apply-branding') applyBranding(el.dataset.target);
  else if (a === 'copy') copyText(el.dataset.copy);
});

// Set callback URL + surface OAuth result when redirected back
fetch(`${API}/setup/status`).then(() => {
  document.getElementById('etsy-callback').textContent = window.location.origin + '/api/marketplace/etsy/callback';
});

const params = new URLSearchParams(window.location.search);
if (params.get('etsy') === 'connected') {
  showToast('success', 'Etsy Connected', 'NicheGate can now list products on Etsy.');
}

checkStatus();
loadBrandingStatus();
