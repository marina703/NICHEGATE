// ═══════════════════════════════════════════════════════════════════════════
// DESIGN CHOICE ENGINE — expands the theme library and intelligently selects
// the best design for each profession based on tier, niche, and preference.
// ═══════════════════════════════════════════════════════════════════════════

const THEMES = [
  {
    name: "Onyx Volt",
    primary: "#050505", secondary: "#2dd4bf", accent: "#5eead4", bg: "#0a0a0a",
    font: "'Space Grotesk', 'Inter', system-ui, sans-serif", dark: true,
    vibe: "edgy", tier: ["high-upside", "trend"]
  },
  {
    name: "Signal Pink",
    primary: "#0f0f10", secondary: "#ec4899", accent: "#f9a8d4", bg: "#ffffff",
    font: "'Space Grotesk', 'Inter', system-ui, sans-serif", dark: false,
    vibe: "bold", tier: ["passion", "trend"]
  },
  {
    name: "Carbon White",
    primary: "#111113", secondary: "#ef4444", accent: "#f87171", bg: "#ffffff",
    font: "'Inter', system-ui, sans-serif", dark: false,
    vibe: "raw", tier: ["safe", "high-upside"]
  },
  {
    name: "Midnight Chrome",
    primary: "#0b1220", secondary: "#e2e8f0", accent: "#38bdf8", bg: "#0f172a",
    font: "'Space Grotesk', 'Inter', system-ui, sans-serif", dark: true,
    vibe: "premium", tier: ["high-upside", "safe"]
  },
  {
    name: "Acid Strike",
    primary: "#0a0f0a", secondary: "#a3e635", accent: "#d9f99d", bg: "#ffffff",
    font: "'Space Grotesk', 'Inter', system-ui, sans-serif", dark: false,
    vibe: "energetic", tier: ["trend", "safe"]
  },
  {
    name: "Rose Ember",
    primary: "#1c1917", secondary: "#f59e0b", accent: "#fbbf24", bg: "#fffbeb",
    font: "'Space Grotesk', 'Inter', system-ui, sans-serif", dark: false,
    vibe: "warm", tier: ["passion"]
  },
  {
    name: "Violet Storm",
    primary: "#1e1b4b", secondary: "#8b5cf6", accent: "#c4b5fd", bg: "#f5f3ff",
    font: "'Space Grotesk', 'Inter', system-ui, sans-serif", dark: false,
    vibe: "mystical", tier: ["passion"]
  },
  {
    name: "Emerald Edge",
    primary: "#022c22", secondary: "#10b981", accent: "#6ee7b7", bg: "#ecfdf5",
    font: "'Inter', system-ui, sans-serif", dark: false,
    vibe: "fresh", tier: ["safe"]
  }
];

function getTheme(name) {
  return THEMES.find(t => t.name === name) || THEMES[0];
}

function getAllThemes() {
  return THEMES;
}

// Pick the best themes for a profession based on its tier
function themesForTier(tier) {
  const tierThemes = THEMES.filter(t => t.tier.includes(tier));
  // Always include the flagship Onyx Volt
  const base = tierThemes.length ? tierThemes : THEMES.filter(t => t.name === 'Onyx Volt');
  const rest = THEMES.filter(t => !base.includes(t));
  return [...base, ...rest].slice(0, 5);
}

// Recommend a primary theme for a profession
function recommendTheme(prof) {
  const tier = prof.tier || 'safe';
  const tierThemes = THEMES.filter(t => t.tier.includes(tier));
  return (tierThemes[0] || THEMES[0]).name;
}

// Store/retrieve per-profession design preference
function setDesignPreference(profId, themeName) {
  const { db } = require('../database');
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    .run(`design_${profId}`, themeName);
}

function getDesignPreference(profId) {
  const { db } = require('../database');
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(`design_${profId}`);
  return row?.value || null;
}

module.exports = {
  THEMES, getTheme, getAllThemes, themesForTier, recommendTheme,
  setDesignPreference, getDesignPreference
};
