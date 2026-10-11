// ── PRODUCT COPY ── single owner of "what does this product say" ─────────────
// Derivation priority: AI concept JSON → product name tail + brief → nothing.
// Renderers (cover templates, fallback cards, listings) supply their own
// per-type fallback and only use what comes back here.

/** Human headline for a product: concept name tail, else informative name tail. */
function deriveTitle(product, prof) {
  let concept = null;
  try { concept = product && product.concept ? JSON.parse(product.concept) : null; } catch { /* not JSON — ignore */ }
  if (concept && concept.name) {
    const t = String(concept.name).replace(/^.*[—–]\s*/, '').trim();
    if (t) return t;
  }
  const name = String((product && product.name) || '').trim();
  if (!name) return null;
  // Auto-draft names are just "{prof} {type}" — callers already show the
  // profession, so only a name that adds information becomes the headline.
  const noun = String((prof && prof.name) || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const autoName = `${noun} ${String((product && product.type) || '')}`.toLowerCase().replace(/\s+/g, ' ').trim();
  if (name.toLowerCase().replace(/\s+/g, ' ').trim() === autoName) return null;
  const dash = Math.max(name.lastIndexOf('—'), name.lastIndexOf('–'));
  return ((dash >= 0 ? name.slice(dash + 1) : name).trim() || null);
}

/** Pitch line + benefit bullets: concept pitch/benefits, else brief parsing. */
function derivePitch(product, prof) {
  let concept = null;
  try { concept = product && product.concept ? JSON.parse(product.concept) : null; } catch { /* not JSON — ignore */ }
  let sub = concept && concept.pitch ? String(concept.pitch).trim() : null;
  let benefits = null;
  if (concept && Array.isArray(concept.benefits)) {
    benefits = concept.benefits.map(String).map((s) => s.trim()).filter(Boolean);
  }
  const brief = String((product && product.brief) || '').trim();
  if (brief) {
    const colon = brief.indexOf(':');
    if (colon > 0 && colon < 140) {
      if (!sub) sub = brief.slice(0, colon).trim();
      if (!benefits) {
        benefits = brief.slice(colon + 1)
          .split(/,|\band\b/i).map((s) => s.trim().replace(/\.$/, ''))
          .filter((s) => s.length > 2 && s.length < 60)
          .map((s) => s.charAt(0).toUpperCase() + s.slice(1));
      }
    } else if (!sub) {
      const first = brief.split(/(?<=[.!?])\s/)[0];
      sub = first.length <= 120 ? first : brief.slice(0, 117).trim() + '…';
    }
  }
  return { sub, benefits: (benefits && benefits.length ? benefits : null) };
}

/** Full derivation: { title, sub, benefits } — any field may be null. */
function deriveCopy(product, prof) {
  const pitch = derivePitch(product, prof);
  return { title: deriveTitle(product, prof), sub: pitch.sub, benefits: pitch.benefits };
}

module.exports = { deriveCopy, deriveTitle, derivePitch };
