// Pre-paint the saved theme before first render (no flash of wrong theme).
// External file on purpose: the CSP keeps script-src 'self' with no inline
// scripts and no hash pinning (see helmet config in server/index.js).
try {
  var t = localStorage.getItem('ng_theme');
  if (t === 'dark') { document.documentElement.setAttribute('data-theme', 'dark'); }
} catch (e) { /* private mode: light default */ }
var meta = document.createElement('meta');
meta.name = 'color-scheme';
meta.content = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
document.head.appendChild(meta);
