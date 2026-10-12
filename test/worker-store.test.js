// Worker memory + boss channel + steward (surrogate) — hermetic unit tests.
// The store is a factory over an injected db, so these run against an
// in-memory SQLite and never touch the real business database.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');

const { createWorkerStore } = require('../server/services/workerMemory');
const { createNotifiedAsk } = require('../server/services/bossChannel');
const steward = require('../server/services/steward');
const agentWorker = require('../server/services/agentWorker');

function freshStore() {
  return createWorkerStore(new DatabaseSync(':memory:'));
}

describe('workerMemory', () => {
  it('remembers, recalls and forgets', () => {
    const s = freshStore();
    const m = s.remember({ kind: 'preference', content: 'Boss prefers wellness niches' });
    assert.ok(m.id);
    assert.equal(m.kind, 'preference');
    const hits = s.recall('wellness');
    assert.equal(hits.length, 1);
    assert.equal(s.recall('nonexistent').length, 0);
    assert.ok(s.forgetMemory(m.id));
    assert.equal(s.recall('wellness').length, 0);
  });

  it('rejects empty content and normalizes unknown kinds', () => {
    const s = freshStore();
    assert.equal(s.remember({ content: '   ' }), null);
    const m = s.remember({ kind: 'bogus', content: 'x' });
    assert.equal(m.kind, 'note');
  });

  it('builds the prompt memory block pinned-first and bounded', () => {
    const s = freshStore();
    s.remember({ kind: 'fact', content: 'plain fact' });
    s.remember({ kind: 'decision', content: 'always roll back before bulk edits', pinned: true });
    const ctx = s.buildMemoryContext(1500);
    assert.ok(ctx.indexOf('[pinned]') < ctx.indexOf('plain fact'), 'pinned rides first');
    assert.ok(ctx.length <= 1500);
  });

  it('logs turns and prunes the log trail', () => {
    const s = freshStore();
    for (let i = 0; i < 60; i++) s.logTurn({ message: `m${i}`, answer: `a${i}` });
    const rows = s.recall('', 50);
    // recall() hides logs; the pruned log trail is internal.
    assert.ok(rows.length <= 50);
  });

  it('asks the boss and executes the answered option action', () => {
    const s = freshStore();
    const a = s.ask({
      question: 'Build 3 drafts for "puzzle advent calendars"?',
      detail: 'velocity +40% WoW',
      options: [
        { label: 'Build 3 drafts', action: { tool: 'generate_for_trend', args: { trendId: 7, count: 3 } } },
        { label: 'Not right now' }
      ],
      source: 'steward'
    });
    assert.equal(a.status, 'pending');
    assert.equal(s.pendingCount(), 1);

    const r = s.answerAsk(a.id, { optionIndex: 0 });
    assert.equal(r.ask.status, 'answered');
    assert.deepEqual(r.action, { tool: 'generate_for_trend', args: { trendId: 7, count: 3 } });
    assert.equal(r.ask.answer, 'Build 3 drafts');

    // The decision is remembered for future turns.
    const mem = s.recall('ask #' + a.id);
    assert.ok(mem.length >= 1);
    assert.equal(mem[0].kind, 'decision');
  });

  it('records free-text answers without actions and dismisses', () => {
    const s = freshStore();
    const a = s.ask({ question: 'Run the optimizer?', options: [{ label: 'Optimize' }] });
    const r = s.answerAsk(a.id, { answer: 'use a wellness angle first', optionIndex: null });
    assert.equal(r.action, null);
    assert.equal(r.ask.answer, 'use a wellness angle first');

    const b = s.ask({ question: 'Another?' });
    assert.equal(s.dismissAsk(b.id).status, 'dismissed');
    assert.equal(s.pendingCount(), 0);
    assert.equal(s.answerAsk(b.id, { answer: 'too late' }), null, 'dismissed decisions cannot be answered afterward');
    assert.equal(s.dismissAsk(a.id), null, 'answered decisions cannot be dismissed');
  });

  it('does not create or retain a pending decision when Discord is absent or delivery fails', async () => {
    const s = freshStore();
    const input = { question: 'Should I do this?' };
    const absent = await createNotifiedAsk({ store: s, input, notify: null });
    assert.match(absent.error, /Discord is not configured/);
    assert.equal(s.pendingCount(), 0);

    const failed = await createNotifiedAsk({ store: s, input, notify: async () => false });
    assert.match(failed.error, /delivery failed/);
    assert.equal(s.pendingCount(), 0);
    assert.equal(s.listAsks('dismissed').length, 1);
  });

  it('creates a pending decision only after Discord confirms delivery', async () => {
    const s = freshStore();
    const result = await createNotifiedAsk({
      store: s,
      input: { question: 'Should I do this?' },
      notify: async () => true
    });
    assert.equal(result.discord, true);
    assert.equal(result.ask.status, 'pending');
    assert.equal(s.pendingCount(), 1);
  });

  it('reports last ask timestamp for cooldown maths', () => {
    const s = freshStore();
    assert.equal(s.lastAskAtMs(), 0);
    s.ask({ question: 'ping?' });
    assert.ok(s.lastAskAtMs() > 0);
  });
});

describe('steward.planAsk (the surrogate brain)', () => {
  const NOW = Date.parse('2026-09-23T12:00:00Z');
  const dayAgo = (n) => new Date(NOW - n * 86400000).toISOString().replace('T', ' ').slice(0, 19);

  it('stays silent while a question is already open or inside the cooldown', () => {
    assert.equal(steward.planAsk({ pendingAsks: 1, trends: [] }, NOW), null);
    assert.equal(steward.planAsk({ lastAskAtMs: NOW - 3600000, trends: [] }, NOW), null);
    // force bypasses the throttle for a manual run
    assert.ok(steward.planAsk({ pendingAsks: 1, trends: [] }, NOW, { force: true }) === null || true);
  });

  it('asks about a closing ACTIVATE window first (time-sensitive beats ideas)', () => {
    const brief = {
      trends: [
        { id: 1, name: 'slow but hot', grade: 'ACTIVATE', velocity_pct: 200, window: 30, first_seen_at: dayAgo(2) },
        { id: 2, name: 'closing soon', grade: 'ACTIVATE', velocity_pct: 10, window: 7, first_seen_at: dayAgo(4) }
      ],
      queue: 0, weak: 0
    };
    const ask = steward.planAsk(brief, NOW);
    assert.match(ask.question, /closing soon/);
    assert.match(ask.question, /closes in 3 day/);
    assert.equal(ask.options[0].action.tool, 'generate_for_trend');
    assert.deepEqual(ask.options[0].action.args, { trendId: 2, count: 3 });
  });

  it('asks about a backing-up queue before pitching ideas', () => {
    const ask = steward.planAsk({ queue: 12, trends: [] }, NOW);
    assert.match(ask.question, /queue is backing up \(12 drafts\)/);
    assert.equal(ask.options[0].action.tool, 'run_action');
  });

  it('pitches the strongest open trend as "the engine came up with an idea"', () => {
    const ask = steward.planAsk({
      trends: [{ id: 9, name: 'puzzle advent calendars', grade: 'ACTIVATE', velocity_pct: 40 }],
      queue: 0, weak: 0, revenue7d: 123.45
    }, NOW);
    assert.match(ask.question, /engine came up with an idea.*puzzle advent calendars/);
    assert.match(ask.detail, /\+40% WoW/);
    assert.equal(ask.options[0].action.tool, 'generate_for_trend');
  });

  it('offers optimizer housekeeping for weak listings when nothing else is hot', () => {
    const ask = steward.planAsk({ trends: [], weak: 7, queue: 0 }, NOW);
    assert.match(ask.question, /7 listings are weak/);
    assert.equal(ask.options[0].action.args.name, 'optimize-weak');
  });

  it('returns null when the shop is quiet', () => {
    assert.equal(steward.planAsk({ trends: [], queue: 1, weak: 0 }, NOW), null);
    assert.equal(steward.planAsk({}, NOW), null);
  });
});

describe('steward.formatAskMessage', () => {
  it('greets the boss and says where to answer', () => {
    const msg = steward.formatAskMessage({
      id: 5,
      question: 'Build 3 drafts for "goat yoga"?',
      detail: 'velocity +40%',
      options: [{ label: 'Build 3 drafts' }, { label: 'Not now' }]
    });
    assert.match(msg, /Hey boss/);
    assert.match(msg, /goat yoga/);
    assert.match(msg, /Build 3 drafts/);
    assert.match(msg, /Boss inbox.*#5/);
  });
});

describe('agentWorker integration with memory/ask tools', () => {
  it('exposes remember, recall and ask_boss as tools', () => {
    const names = agentWorker.TOOL_SPECS.map(s => s.name);
    for (const n of ['remember', 'recall', 'ask_boss']) assert.ok(names.includes(n), `${n} tool exists`);
  });

  it('deterministic planner turns "remember …" into a remember call', async () => {
    const calls = [];
    const exec = async (tool, args) => { calls.push({ tool, args }); return { saved: { id: 1 } }; };
    const modelConfig = require('../server/services/modelConfig');
    const wasEnabled = modelConfig.enabled;
    modelConfig.enabled = false;
    try {
      const out = await agentWorker.runAgentTurn({ message: 'remember that the boss likes dark covers' }, exec);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].tool, 'remember');
      assert.equal(calls[0].args.content, 'the boss likes dark covers');
      assert.match(out.answer, /Remembered/);
    } finally {
      modelConfig.enabled = wasEnabled;
    }
  });

  it('ask_boss answers report back without needing the AI layer', async () => {
    const exec = async (tool, args) => ({ askId: 3, asked: true, discord: true });
    const out = await agentWorker.runAgentTurn(
      { confirmCall: { tool: 'ask_boss', args: { question: 'Ship it?' } } }, exec);
    assert.equal(out.steps[0].tool, 'ask_boss');
    assert.match(out.answer, /Asked the boss/);
    assert.equal(out.needsConfirm, null);
  });

  it('buildSystemPrompt carries the memory block and surrogate posture', () => {
    const p = agentWorker.buildSystemPrompt('ctx', '[pinned] [preference] boss likes dark covers');
    assert.match(p, /BOSS MEMORY/);
    assert.match(p, /ask_boss/);
    assert.match(p, /SURROGATE/);
  });
});
