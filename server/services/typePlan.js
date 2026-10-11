// ── TYPE PLAN ── single owner of niche → product-type routing ────────────────
// Every engine that decides "which product types fit this niche" (discovery,
// freshness, fad activation) routes through here so the rules are tested once.

// Radar-written `why` values are PROVENANCE, not topic text — the radar stores
// "source · traffic-label · intent=NN" (e.g. "pinterest-rss · Pinterest/DIY buzz
// · intent=0.80"). Matching category words against the source label typed
// business niches as wall-art (the "DIY" inside "Pinterest/DIY buzz").
// A stored intent tag (vettingEngine keys on the same marker) means provenance:
// match on the trend NAME only. Seeded/test `why` values without the tag stay
// topical and still participate.
function topicalText(trend) {
  const why = String(trend.why || '');
  const provenance = /intent=\d/i.test(why);
  return `${provenance ? '' : why} ${trend.name || ''}`.toLowerCase();
}

function productsForTrend(trend) {
  const cat = topicalText(trend);
  if (/fashion|beauty|aesthetic|decor|style|wear|clothing/.test(cat)) {
    return ['social', 'brand', 'checklist', 'spreadsheet'];
  }
  // Word boundaries matter: bare "art"/"diy" also match "start", "party",
  // "smart", "cart" and source labels — false craft signals.
  if (/craft|\barts?\b|\bartist|\bartwork|\bartisan|\bdiy\b|maker|handmade|pottery|candle|soap|resin|svg|cricut|vinyl|decal|sticker|cut.?file/.test(cat)) {
    return ['wall-art', 'checklist', 'brand', 'social'];
  }
  if (/food|bake|brew|cook|chef|kitchen/.test(cat)) {
    return ['checklist', 'spreadsheet', 'booking', 'social'];
  }
  if (/fitness|sport|gym|coach|\btrain\w*\b|yoga|pilates/.test(cat)) {
    return ['booking', 'checklist', 'spreadsheet', 'social'];
  }
  if (/recovery|sober|wellness|mental|therapy|counsel/.test(cat)) {
    return ['journal', 'checklist', 'spreadsheet', 'social'];
  }
  // Money-making / business niches want money tools, not decor.
  if (/make money|\bmoney\b|income|profit|budget|finance|invest|side.?hustle|resale|flipping|entrepreneur|revenue|\bearn\w*|\bbusiness\b|pricing/.test(cat)) {
    return ['spreadsheet', 'roi', 'checklist', 'social'];
  }
  if (/tech|\bapps?\b|digital|\bai\b|software|template|online|planner|notion/.test(cat)) {
    return ['spreadsheet', 'checklist', 'social', 'brand'];
  }
  if (/school|\bkids?\b|learn|educat|homeschool|teacher|preschool|activity/.test(cat)) {
    return ['worksheet', 'checklist', 'journal', 'wall-art'];
  }
  if (/pyro|firework|pyrotechnic|\bshells?\b|\bmortar|\bfuse\w*\b|\blift\w*\b|\bbreach|\bburst\w*\b|\brocket\w*\b|novelty|class c|display shell|bottle rocket/.test(cat)) {
    return ['pyro-batch', 'pyro-lift-fuse', 'pyro-shoot-log', 'checklist'];
  }
  const personalHints = ['wall-art', 'checklist', 'journal'];
  if (/home|organiz|declutter|interior|decor|minimal|party|wedding|celebrat|invitation|birthday|shower|occasion/.test(cat)) {
    const extra = /party|wedding|celebrat|invitation|birthday|shower/.test(cat) ? ['social'] : [];
    return [...extra, ...personalHints];
  }
  return ['invoice', 'checklist', 'spreadsheet', 'booking'];
}

module.exports = { topicalText, productsForTrend };
