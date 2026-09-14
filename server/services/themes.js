// ============================================================================
// DESIGN CHOICE ENGINE — theme library + niche-sentiment palette generation.
// ============================================================================

const THEMES = [
  {
    name: "Onyx Volt",
    primary: "#050505", secondary: "#2dd4bf", accent: "#5eead4", bg: "#0a0a0a",
    font: "'Space Grotesk', 'Inter', system-ui, sans-serif", dark: true,
    vibe: "edgy", tier: ["high-upside", "trend"], sentiment: ["tech", "default"]
  },
  {
    name: "Signal Pink",
    primary: "#0f0f10", secondary: "#ec4899", accent: "#f9a8d4", bg: "#ffffff",
    font: "'Space Grotesk', 'Inter', system-ui, sans-serif", dark: false,
    vibe: "bold", tier: ["passion", "trend"], sentiment: ["beauty", "fashion"]
  },
  {
    name: "Carbon White",
    primary: "#111113", secondary: "#ef4444", accent: "#f87171", bg: "#ffffff",
    font: "'Inter', system-ui, sans-serif", dark: false,
    vibe: "raw", tier: ["safe", "high-upside"], sentiment: ["trades", "default"]
  },
  {
    name: "Midnight Chrome",
    primary: "#0b1220", secondary: "#e2e8f0", accent: "#38bdf8", bg: "#0f172a",
    font: "'Space Grotesk', 'Inter', system-ui, sans-serif", dark: true,
    vibe: "premium", tier: ["high-upside", "safe"], sentiment: ["tech", "finance"]
  },
  {
    name: "Acid Strike",
    primary: "#0a0f0a", secondary: "#a3e635", accent: "#d9f99d", bg: "#ffffff",
    font: "'Space Grotesk', 'Inter', system-ui, sans-serif", dark: false,
    vibe: "energetic", tier: ["trend", "safe"], sentiment: ["fitness", "outdoor"]
  },
  {
    name: "Rose Ember",
    primary: "#1c1917", secondary: "#f59e0b", accent: "#fbbf24", bg: "#fffbeb",
    font: "'Space Grotesk', 'Inter', system-ui, sans-serif", dark: false,
    vibe: "warm", tier: ["passion"], sentiment: ["wellness", "food", "home"]
  },
  {
    name: "Violet Storm",
    primary: "#1e1b4b", secondary: "#8b5cf6", accent: "#c4b5fd", bg: "#f5f3ff",
    font: "'Space Grotesk', 'Inter', system-ui, sans-serif", dark: false,
    vibe: "mystical", tier: ["passion"], sentiment: ["recovery", "wellness", "spiritual"]
  },
  {
    name: "Emerald Edge",
    primary: "#022c22", secondary: "#10b981", accent: "#6ee7b7", bg: "#ecfdf5",
    font: "'Inter', system-ui, sans-serif", dark: false,
    vibe: "fresh", tier: ["safe"], sentiment: ["outdoor", "home", "food"]
  },
  {
    name: "Slate Circuit",
    primary: "#020617", secondary: "#22d3ee", accent: "#67e8f9", bg: "#0f172a",
    font: "'Space Grotesk', 'Inter', system-ui, sans-serif", dark: true,
    vibe: "tech", tier: ["trend", "high-upside"], sentiment: ["tech"], dynamic: true
  },
  {
    name: "Sage Haven",
    primary: "#1c1917", secondary: "#84a98c", accent: "#cad2c5", bg: "#f7f3eb",
    font: "'Inter', system-ui, sans-serif", dark: false,
    vibe: "earthy", tier: ["passion", "safe"], sentiment: ["wellness", "recovery"], dynamic: true
  },
  {
    name: "Forge Amber",
    primary: "#1c1917", secondary: "#ea580c", accent: "#fdba74", bg: "#fff7ed",
    font: "'Inter', system-ui, sans-serif", dark: false,
    vibe: "industrial", tier: ["safe", "high-upside"], sentiment: ["trades"], dynamic: true
  }
];

const SENTIMENT_KEYWORDS = {
  tech: /tech|software|ai|app|digital|cyber|code|saas|data|drone|smart home|ev |battery|solar/i,
  wellness: /wellness|yoga|massage|breath|sleep|holistic|meditation|nutrition|somatic|coach/i,
  recovery: /recovery|sober|aa |smart recovery|refuge|faith|secular|therapy|counsel/i,
  beauty: /beauty|makeup|hair|lash|brow|tanning|henna|salon|spa|skincare/i,
  fashion: /fashion|aesthetic|style|wear|clothing|boutique/i,
  fitness: /fitness|gym|train|sport|hyrox|ruck|pilates|crossfit|personal trainer/i,
  outdoor: /outdoor|fish|hunt|camp|hike|overland|vanlife|boat|garden|landscap|bee/i,
  food: /food|chef|bake|brew|cook|kitchen|cater|restaurant|coffee/i,
  home: /home|clean|organize|interior|decor|plant|compost|rainwater/i,
  finance: /finance|notary|tax|bookkeep|account|loan|audit|energy audit/i,
  trades: /trade|plumb|hvac|roof|electric|concrete|fence|locksmith|pest|pressure|junk|pool|epoxy|garage|septic|chimney|snow/i,
  spiritual: /faith|bible|dharma|prayer|church|gospel|scripture/i
};

function detectSentiment(text) {
  const blob = String(text || '');
  for (const [key, re] of Object.entries(SENTIMENT_KEYWORDS)) {
    if (re.test(blob)) return key;
  }
  return 'default';
}

function getTheme(name) {
  return THEMES.find(t => t.name === name) || THEMES[0];
}

function getAllThemes() {
  return THEMES;
}

function themesForTier(tier) {
  const tierThemes = THEMES.filter(t => t.tier.includes(tier));
  const base = tierThemes.length ? tierThemes : THEMES.filter(t => t.name === 'Onyx Volt');
  const rest = THEMES.filter(t => !base.includes(t));
  return [...base, ...rest].slice(0, 6);
}

function themesForSentiment(sentiment) {
  const s = sentiment || 'default';
  const matched = THEMES.filter(t => (t.sentiment || []).includes(s));
  if (matched.length) return matched;
  return THEMES.filter(t => (t.sentiment || []).includes('default') || t.name === 'Onyx Volt');
}

function paletteForNiche(profOrTrend) {
  const blob = [
    profOrTrend && profOrTrend.name,
    profOrTrend && profOrTrend.slug,
    profOrTrend && profOrTrend.tier,
    profOrTrend && profOrTrend.why,
    profOrTrend && profOrTrend.category,
    typeof (profOrTrend && profOrTrend.services) === 'string' ? profOrTrend.services : ''
  ].filter(Boolean).join(' ');
  const sentiment = detectSentiment(blob);
  const tier = (profOrTrend && profOrTrend.tier) || 'safe';
  const sentimentThemes = themesForSentiment(sentiment);
  const tierFit = sentimentThemes.find(t => t.tier.includes(tier));
  if (tierFit) return Object.assign({}, tierFit, { sentiment });
  if (sentimentThemes[0]) return Object.assign({}, sentimentThemes[0], { sentiment });
  const tierThemes = themesForTier(tier);
  return Object.assign({}, tierThemes[0] || THEMES[0], { sentiment });
}

function getDesignPreference(profId) {
  const { db } = require('../database');
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('design_' + profId);
  return (row && row.value) || null;
}

function setDesignPreference(profId, themeName) {
  const { db } = require('../database');
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('design_' + profId, themeName);
}

function recommendTheme(prof) {
  if (prof && prof.id) {
    const pref = getDesignPreference(prof.id);
    if (pref && getTheme(pref)) return pref;
  }
  return paletteForNiche(prof).name;
}

module.exports = {
  THEMES, getTheme, getAllThemes, themesForTier, themesForSentiment,
  paletteForNiche, detectSentiment, recommendTheme,
  setDesignPreference, getDesignPreference
};
