// Boss channel: a decision must not appear pending unless Discord accepted
// its notification. Delivery is injected so this module is hermetic in tests.
async function createNotifiedAsk({ store, input, notify }) {
  if (typeof notify !== 'function') {
    return { error: 'Discord is not configured; the operator cannot be notified, so no pending decision was created.' };
  }

  const ask = store.ask(input || {});
  if (!ask) return { error: 'question is required' };

  let delivered = false;
  try { delivered = (await notify(ask)) === true; } catch { /* report as undelivered */ }
  if (!delivered) {
    store.dismissAsk(ask.id);
    return { error: 'Discord delivery failed; the decision was not left pending. Check the webhook and retry.' };
  }

  return { ask, discord: true };
}

module.exports = { createNotifiedAsk };
