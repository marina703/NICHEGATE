// ═══════════════════════════════════════════════════════════════════════════
// BRAND ASSETS — single source of truth for NicheGate visual identity.
// The canonical artwork lives in the "nichegate designs" folder; this module
// hot-syncs it into covers/ (the app's stable asset dir) and exposes the
// platform-appropriate asset for each use:
//
//   • Gumroad product covers  → logo / logo-on-black
//   • Etsy shop icon          → logo mark (square)
//   • Etsy shop banner        → nichegate_etsy_banner
//   • Lead magnet / bundle    → logo-on-black cover
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DESIGNS_DIR = path.join(ROOT, 'nichegate designs'); // user's source folder
const COVERS_DIR = path.join(ROOT, 'covers');

// Canonical map: source file (in designs) → canonical copy (in covers)
const ASSETS = {
  'nichegate_logo_on_black.png': 'nichegate_logo_on_black.png',   // 1600x700 logo (dark) — covers + console
  'nichegate_profile_icon.png':  'nichegate_profile_icon.png',    // 1920x1920 square icon — Etsy icon / Gumroad profile
  'nichegate_social_icon.png':   'nichegate_social_icon.png',     // 1920x1920 square social avatar
  'nichegate_etsy_banner.png':   'nichegate_etsy_banner.png',     // 2304x1536 Etsy hero/announcement banner
  'nichegate_gumroad_banner.png':'nichegate_gumroad_banner.png',  // 2304x1536 Gumroad store banner
  'nichegate_logo_wordmark.png': 'nichegate_logo_wordmark.png',   // 2304x1536 wordmark
  'nichegate_logo_primary.png':  'nichegate_logo_primary.png',    // 2304x1536 primary logo
  'nichegate_hero_logo.png':     'nichegate_hero_logo.png',       // 2304x1536 hero logo
  'nichegate_logo_final_badge.png': 'nichegate_logo_final_badge.png', // 1920x1920 badge
  'nichegate_product_watermark.png': 'nichegate_product_watermark.png', // 1200x360 watermark
};

let lastSync = 0;

// Copy any missing/older asset from the designs folder into covers/ so the
// app always uses the designer's latest artwork wherever it is run.
function syncDesignsToCovers() {
  if (!fs.existsSync(DESIGNS_DIR)) return 0;
  let copied = 0;
  for (const [src, dst] of Object.entries(ASSETS)) {
    const from = path.join(DESIGNS_DIR, src);
    const to = path.join(COVERS_DIR, dst);
    if (!fs.existsSync(from)) continue;
    const srcMtime = fs.statSync(from).mtimeMs;
    const needs = !fs.existsSync(to) || (fs.statSync(to).mtimeMs < srcMtime) || fs.statSync(to).size !== fs.statSync(from).size;
    if (needs) {
      fs.mkdirSync(COVERS_DIR, { recursive: true });
      fs.copyFileSync(from, to);
      copied++;
    }
  }
  lastSync = Date.now();
  return copied;
}

function coversFile(name) {
  const p = path.join(COVERS_DIR, name);
  return fs.existsSync(p) ? p : null;
}

const assetPath = {
  logo: () => coversFile('nichegate_logo_on_black.png'),
  logoPrimary: () => coversFile('nichegate_logo_primary.png'),
  logoWordmark: () => coversFile('nichegate_logo_wordmark.png'),
  profileIcon: () => coversFile('nichegate_profile_icon.png'),
  socialIcon: () => coversFile('nichegate_social_icon.png'),
  etsyBanner: () => coversFile('nichegate_etsy_banner.png'),
  gumroadBanner: () => coversFile('nichegate_gumroad_banner.png'),
  watermark: () => coversFile('nichegate_product_watermark.png'),
  heroLogo: () => coversFile('nichegate_hero_logo.png'),
  badge: () => coversFile('nichegate_logo_final_badge.png')
};

// Human-readable status for /api/branding/status
function status() {
  syncDesignsToCovers();
  const out = {};
  for (const [key, fn] of Object.entries(assetPath)) {
    const p = fn();
    out[key] = p ? { file: path.basename(p), sizeKB: Math.round(fs.statSync(p).size / 1024), url: `/covers/${path.basename(p)}` } : null;
  }
  return {
    sourceDir: DESIGNS_DIR,
    sourceExists: fs.existsSync(DESIGNS_DIR),
    coversDir: COVERS_DIR,
    assets: out,
    lastSync
  };
}

// Public URL a browser can reference for an asset key.
function urlFor(key) {
  return assetPath[key]?.() ? `/covers/${path.basename(assetPath[key]())}` : null;
}

module.exports = { syncDesignsToCovers, assetPath, status, urlFor, COVERS_DIR, DESIGNS_DIR };
