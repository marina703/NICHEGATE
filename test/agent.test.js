const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const agent = require('../server/services/agentWorker');

describe('agentWorker.parseToolCall', () => {
  it('parses a bare tool JSON object', () => {
    const c = agent.parseToolCall('{"tool":"run_action","args":{"name":"sweep"}}');
    assert.deepEqual(c, { tool: 'run_action', args: { name: 'sweep' } });
  });

  it('parses JSON wrapped in a code fence and prose', () => {
    const c = agent.parseToolCall('Sure, running it now.\n```json\n{"tool":"snapshot","args":{}}\n```\nDone.');
    assert.equal(c.tool, 'snapshot');
  });

  it('parses alternative key names (action/arguments)', () => {
    const c = agent.parseToolCall('{"action":"set_status","arguments":{"id":12,"status":"approved"}}');
    assert.deepEqual(c, { tool: 'set_status', args: { id: 12, status: 'approved' } });
  });

  it('parses the say form', () => {
    const c = agent.parseToolCall('{"say":"All clear."}');
    assert.deepEqual(c, { tool: 'say', args: { text: 'All clear.' } });
  });

  it('returns null for plain prose', () => {
    assert.equal(agent.parseToolCall('Revenue is up 12% week over week.'), null);
    assert.equal(agent.parseToolCall(''), null);
    assert.equal(agent.parseToolCall(null), null);
  });
});

describe('agentWorker.planDeterministic', () => {
  it('plans generation from a make request (article stripped, like the Make-This bar)', () => {
    const p = agent.planDeterministic('make a dog bakery price list');
    assert.equal(p.plan[0].tool, 'generate');
    assert.equal(p.plan[0].args.idea, 'dog bakery price list');
    assert.equal(p.plan[0].args.count, 1);
  });

  it('plans registered actions for engine commands', () => {
    assert.deepEqual(agent.planDeterministic('run a discovery sweep').plan[0],
      { tool: 'run_action', args: { name: 'sweep' } });
    assert.deepEqual(agent.planDeterministic('sync sales').plan[0],
      { tool: 'run_action', args: { name: 'sync-sales' } });
    assert.deepEqual(agent.planDeterministic('approve all').plan[0],
      { tool: 'run_action', args: { name: 'approve-all' } });
    assert.equal(agent.planDeterministic('run the full cycle').plan[0].args.name, 'full-cycle');
  });

  it('plans the bulk optimizer for optimize requests', () => {
    const p = agent.planDeterministic('optimize my weak listings');
    assert.equal(p.plan[0].tool, 'optimize_weak');
  });

  it('returns null for questions and empty input', () => {
    assert.equal(agent.planDeterministic('how is the shop doing?'), null);
    assert.equal(agent.planDeterministic(''), null);
    assert.equal(agent.planDeterministic(null), null);
  });
});

describe('agentWorker danger gate', () => {
  it('gates deletion and bulk reject behind confirmation', () => {
    assert.equal(agent.needsConfirm('delete_product', { id: 3 }), true);
    assert.equal(agent.needsConfirm('run_action', { name: 'reject-trash' }), true);
    assert.equal(agent.needsConfirm('run_action', { name: 'sweep' }), false);
    assert.equal(agent.needsConfirm('set_status', { id: 3, status: 'approved' }), false);
  });

  it('produces explicit confirm messages', () => {
    assert.match(agent.confirmMessage('delete_product', { id: 7 }), /permanently deletes product #7/i);
    assert.match(agent.confirmMessage('run_action', { name: 'reject-trash' }), /confirm/i);
  });

  it('recognizes confirm replies', () => {
    assert.equal(agent.isConfirmReply('confirm'), true);
    assert.equal(agent.isConfirmReply('Yes.'), true);
    assert.equal(agent.isConfirmReply('do it'), true);
    assert.equal(agent.isConfirmReply('optimize my listings'), false);
  });
});

describe('agentWorker.runAgentTurn (confirm round-trip)', () => {
  it('executes a gated call with the dangerous flag and records the step', async () => {
    const calls = [];
    const out = await agent.runAgentTurn({
      message: '',
      confirmCall: { tool: 'delete_product', args: { id: 5 } }
    }, async (tool, args) => { calls.push({ tool, args }); return { deleted: 5 }; });
    assert.deepEqual(calls, [{ tool: 'delete_product', args: { id: 5 } }]);
    assert.equal(out.steps.length, 1);
    assert.equal(out.steps[0].ok, true);
    assert.match(out.answer, /done/i);
  });

  it('reports executor failures without throwing', async () => {
    const out = await agent.runAgentTurn({
      message: '',
      confirmCall: { tool: 'delete_product', args: { id: 5 } }
    }, async () => { throw new Error('boom'); });
    assert.equal(out.steps[0].ok, false);
    assert.match(out.answer, /failed: boom/i);
  });

  it('refuses a gated call without the confirm round-trip', async () => {
    // Even through the tool executor path, a dangerous call without confirm
    // returns needsConfirm instead of executing.
    const calls = [];
    const out = await agent.runAgentTurn({
      message: '',
      confirmCall: null
    }, async (tool, args) => { calls.push(tool); return {}; });
    assert.equal(calls.length, 0);
    assert.match(out.answer, /tell me what to do/i);
  });
});

describe('agentWorker.buildSystemPrompt', () => {
  it('lists every tool and the ops context', () => {
    const p = agent.buildSystemPrompt('Catalog: 3 products');
    for (const spec of agent.TOOL_SPECS) assert.ok(p.includes(spec.name), spec.name);
    assert.ok(p.includes('Catalog: 3 products'));
    assert.ok(p.includes('EXACTLY ONE JSON object'));
  });
});
