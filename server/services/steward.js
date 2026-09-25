// ═══════════════════════════════════════════════════════════════════════════
// STEWARD — the proactive half of the AI worker (the operator's surrogate).
//
// Every few hours (and on demand) the server builds a brief from REAL tables
// and this module decides whether anything is worth pinging the boss about:
// a trend window closing, a review queue backing up, an idea the engine
// "came up with", or listings that need the optimizer. One question at a
// time, with a cooldown — Discord is for signal, never for spam.
//
// Everything here is pure (brief in → proposal out) so it is unit-testable
// with no database and no network. The server owns ask creation + sending.
// ═══════════════════════════════════════════════════════════════════════════

const COOLDOWN_MS = 6 * 60 * 60 * 1000; // max one proactive ping per 6h

function daysLeftInWindow(t, now = Date.now()) {
  const total = Number(t && t.window) || 0;
  const startRaw = (t && (t.first_seen_at || t.detected_at)) || null;
  if (!total || !startRaw) return null;
  const start = new Date(String(startRaw).replace(' ', 'T') + 'Z').getTime();
  if (!Number.isFinite(start)) return null;
  return Math.ceil((start + total * 24 * 60 * 60 * 1000 - now) / (24 * 60 * 60 * 1000));
}

// b (brief): {
//   pendingAsks, lastAskAtMs, queue, approved, weak, revenue7d, sales7d,
//   trends: [{ id, name, grade, velocity_pct, window, first_seen_at, detected_at, activated }]
// }
// → { question, detail, options: [{ label, action }] } | null
function planAsk(b, now = Date.now(), { force = false } = {}) {
  const brief = b || {};
  if (!force) {
    if ((brief.pendingAsks || 0) > 0) return null; // one open question at a time
    if (brief.lastAskAtMs && now - brief.lastAskAtMs < COOLDOWN_MS) return null;
  }

  const trends = (brief.trends || []).slice();
  const activatable = trends.filter(t => String(t.grade || '').toUpperCase() === 'ACTIVATE' && !t.activated);

  // 1 · A closing ACTIVATE-grade window is the most time-sensitive thing the
  //     shop has — ask before it lapses.
  const closing = activatable
    .map(t => ({ t, days: daysLeftInWindow(t, now) }))
    .filter(x => x.days != null && x.days > 0 && x.days <= 5)
    .sort((a, c) => a.days - c.days)[0];
  if (closing) {
    return {
      question: `Trend window "${closing.t.name}" closes in ${closing.days} day${closing.days === 1 ? '' : 's'} — commit before it lapses?`,
      detail: `Grade ACTIVATE${closing.t.velocity_pct != null ? `, velocity +${Math.round(closing.t.velocity_pct)}% WoW` : ''}. The engine can fill the window right now.`,
      options: [
        { label: 'Generate 3 products now', action: { tool: 'generate_for_trend', args: { trendId: closing.t.id, count: 3 } } },
        { label: 'Activate the window + generate', action: { tool: 'activate_trend', args: { trendId: closing.t.id } } },
        { label: 'Not this one' }
      ]
    };
  }

  // 2 · A backing-up queue is work the boss is deferring — surface it.
  if ((brief.queue || 0) >= 8) {
    return {
      question: `The review queue is backing up (${brief.queue} drafts). Want me to clear it?`,
      detail: 'Approve-all moves everything to approved; reject-trash drops obvious filler first. Approved and listed products are untouched either way.',
      options: [
        { label: 'Reject trash, then approve all', action: { tool: 'run_action', args: { name: 'reject-trash', input: {} } } },
        { label: 'Approve everything', action: { tool: 'run_action', args: { name: 'approve-all', input: {} } } },
        { label: 'I will review manually' }
      ]
    };
  }

  // 3 · The "engine came up with an idea" ping: the best open trend that has
  //     no products committed yet.
  const ideaTrend = activatable.sort((a, c) => (Number(c.velocity_pct) || 0) - (Number(a.velocity_pct) || 0))[0]
    || trends.filter(t => !t.activated).sort((a, c) => (Number(c.velocity_pct) || 0) - (Number(a.velocity_pct) || 0))[0];
  if (ideaTrend && (brief.products || 0) >= 0) {
    return {
      question: `Hey boss — the engine came up with an idea: a product run for "${ideaTrend.name}". What do you think?`,
      detail: `Grade ${String(ideaTrend.grade || 'WATCH')}${ideaTrend.velocity_pct != null ? `, demand +${Math.round(ideaTrend.velocity_pct)}% WoW` : ''}${brief.revenue7d != null ? `; shop did $${Number(brief.revenue7d).toFixed(2)} in the last 7d` : ''}. I can draft 3 differentiated products into the review queue.`,
      options: [
        { label: 'Build 3 drafts', action: { tool: 'generate_for_trend', args: { trendId: ideaTrend.id, count: 3 } } },
        { label: 'Not right now' }
      ]
    };
  }

  // 4 · Weak / zero-view listings — housekeeping the boss keeps skipping.
  if ((brief.weak || 0) >= 5) {
    return {
      question: `${brief.weak} listings are weak or getting zero views. Run the optimizer on them?`,
      detail: 'It rewrites title/tags/description on the worst performers first and keeps a rollback snapshot.',
      options: [
        { label: 'Optimize the weakest 20', action: { tool: 'run_action', args: { name: 'optimize-weak', input: { limit: 20 } } } },
        { label: 'Leave them' }
      ]
    };
  }

  return null;
}

// "Hey boss" Discord formatting — the ping the user asked for.
function formatAskMessage(ask) {
  const opts = (ask && ask.options) || [];
  const lines = [
    `🤖 **Hey boss** — ${ask.question}`,
    ask.detail ? `> ${ask.detail}` : '',
    opts.length ? `\n**Options:** ${opts.map((o, i) => `${i + 1}️⃣ ${o.label}`).join('   ')}` : '',
    `\nAnswer in the Flight Deck → **Briefing → Boss inbox** (ask #${ask.id}).`
  ].filter(Boolean);
  return lines.join('\n');
}

module.exports = { planAsk, formatAskMessage, daysLeftInWindow, COOLDOWN_MS };
