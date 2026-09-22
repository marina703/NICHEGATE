// ─────────────────────────────────────────────────────────────────────────
// LOGIN — form handler extracted from inline script (CSP-safe).
// ─────────────────────────────────────────────────────────────────────────
const form = document.getElementById('login-form');
const err = document.getElementById('err');
const btn = document.getElementById('btn');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  err.classList.remove('show');
  btn.disabled = true; btn.textContent = 'Signing in…';
  try {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: document.getElementById('pass').value })
    });
    const d = await r.json();
    if (r.ok && d.ok) { location.href = '/'; return; }
    err.textContent = d.error || 'Sign-in failed'; err.classList.add('show');
  } catch (ex) {
    err.textContent = 'Network error'; err.classList.add('show');
  }
  btn.disabled = false; btn.textContent = 'Sign In';
});
