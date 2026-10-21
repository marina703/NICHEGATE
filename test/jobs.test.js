const test = require('node:test');
const assert = require('node:assert/strict');
const { db, init } = require('../server/database');
const engine = require('../server/services/jobEngine');

init(); // ensure the jobs table (and all others) exist on this DB

// ── Hermetic fixtures ──────────────────────────────────────────────────────
// The job engine writes to the shared `jobs` table (and, on approval, touches
// `products`). Every test here clears jobs + the job_created log entries +
// its own test products before and after so the suite stays independent of
// production rows.
const TEST_PRODUCT_IDS = [99001, 99002];

function clearJobs() {
  db.prepare('DELETE FROM jobs').run();
  db.prepare("DELETE FROM automation_log WHERE action = 'job_created'").run();
  db.prepare('DELETE FROM products WHERE id IN (?, ?)').run(...TEST_PRODUCT_IDS);
}

function seedTestProducts() {
  for (const id of TEST_PRODUCT_IDS) {
    db.prepare(`INSERT INTO products (id, profession_id, name, type, price, status, html_content, origin)
                VALUES (?, 1, ?, 'checklist', '12', 'draft', '<html></html>', 'test')`)
      .run(id, `Job-test product ${id}`);
  }
}

// A mock tool dispatcher that records calls and fakes a generate result so we
// can drive the full plan without touching the real generation pipeline.
function makeDispatch(opts = {}) {
  const calls = [];
  const created = opts.created || [{ id: 101 }, { id: 102 }];
  return {
    calls,
    async dispatch(tool, args) {
      calls.push({ tool, args: JSON.parse(JSON.stringify(args)) });
      if (tool === 'generate') return { niche: args.idea || 'x', created };
      if (tool === 'brainstorm') return { niche: args.niche, directions: [] };
      if (tool === 'optimize') return { id: args.id, changes: 2 };
      if (tool === 'publish') return { id: args.id, platform: 'gumroad', listingId: `L-${args.id}` };
      return { ok: true };
    }
  };
}

test('defaultPlan produces a gated brainstorm→generate→optimize→design→publish plan', () => {
  const plan = engine.defaultPlan('tax season for bookkeepers');
  assert.equal(plan.length, 5);
  assert.equal(plan[0].tool, 'brainstorm');
  assert.equal(plan[1].tool, 'generate');
  assert.equal(plan[2].tool, 'optimize');
  assert.equal(plan[2].forEach, '$created');
  assert.equal(plan[3].tool, 'design');
  assert.equal(plan[3].forEach, '$created');
  assert.equal(plan[4].tool, 'publish');
  assert.equal(plan[4].gate, true, 'publish must always be gated');
  assert.equal(plan[4].forEach, '$created');
});

test('parsePlan sanitizes AI output and force-gates publish steps', () => {
  const raw = JSON.stringify([
    { tool: 'generate', args: { idea: 'x', count: 2 } },
    { tool: 'publish', args: { id: '{id}' }, forEach: '$created' }, // no gate flag
    { tool: 'evil_tool', args: {} },                               // unknown → dropped
    { tool: 'publish', args: { id: 5 } }                           // single, still gated
  ]);
  const plan = engine.parsePlan(raw);
  assert.equal(plan.length, 3, 'unknown tool dropped');
  assert.equal(plan[1].gate, true, 'publish gate forced even when the model omits it');
  assert.equal(plan[2].gate, true);
});

test('parsePlan returns null for junk', () => {
  assert.equal(engine.parsePlan('not json at all'), null);
  assert.equal(engine.parsePlan('[]'), null);
  assert.equal(engine.parsePlan('[{"tool":"unknown"}]'), null);
});

test('createJob inserts a running job with the default plan (AI off)', async () => {
  clearJobs();
  const job = await engine.createJob('build a holiday line for bakers', 'tester', engine.defaultPlan('build a holiday line for bakers'));
  assert.ok(job.id > 0);
  assert.equal(job.status, 'running');
  assert.equal(job.step_index, 0);
  assert.equal(job.plan.length, 5);
  clearJobs();
});

test('runDueJobs drives brainstorm→generate, captures created ids, then optimizes each', async () => {
  clearJobs();
  const job = await engine.createJob('expand the drywall niche', 'tester', engine.defaultPlan('expand the drywall niche'));
  const { calls, dispatch } = makeDispatch();

  // Pass 1: brainstorm
  let summary = await engine.runDueJobs(dispatch);
  assert.equal(summary[0].tool, 'brainstorm');
  assert.equal(calls.length, 1);

  // Pass 2: generate → captures created ids
  summary = await engine.runDueJobs(dispatch);
  assert.equal(summary[0].tool, 'generate');
  const afterGen = engine.getJob(job.id);
  assert.equal(afterGen.progress.created.length, 2, 'created ids captured from generate');
  assert.deepEqual(afterGen.progress.created.map(c => c.id), [101, 102]);

  // Pass 3: optimize runs once per created id
  summary = await engine.runDueJobs(dispatch);
  assert.equal(summary[0].tool, 'optimize');
  const optimizeCalls = calls.filter(c => c.tool === 'optimize');
  assert.equal(optimizeCalls.length, 2, 'optimize ran for both created products');
  assert.deepEqual(optimizeCalls.map(c => c.args.id).sort(), [101, 102]);
  clearJobs();
});

test('runDueJobs pauses before the publish gate, then publishes after approval', async () => {
  clearJobs();
  const job = await engine.createJob('list the new bakers line', 'tester', engine.defaultPlan('list the new bakers line'));
  const { calls, dispatch } = makeDispatch();

  await engine.runDueJobs(dispatch); // brainstorm
  await engine.runDueJobs(dispatch); // generate
  await engine.runDueJobs(dispatch); // optimize (forEach)
  await engine.runDueJobs(dispatch); // design (forEach)

  // Pass 5: publish is gated → must pause for approval
  let summary = await engine.runDueJobs(dispatch);
  assert.equal(summary[0].status, 'awaiting-approval');
  assert.equal(summary[0].tool, 'publish');
  assert.equal(calls.filter(c => c.tool === 'publish').length, 0, 'nothing published while gated');

  // Approving clears the gate
  const approved = engine.approveJob(job.id);
  assert.equal(approved.status, 'running');

  // Pass 5: publish now runs once per created id
  summary = await engine.runDueJobs(dispatch);
  assert.equal(summary[0].status, 'done');
  const publishCalls = calls.filter(c => c.tool === 'publish');
  assert.equal(publishCalls.length, 2, 'published both products after approval');
  assert.deepEqual(publishCalls.map(c => c.args.id).sort(), [101, 102]);

  const done = engine.getJob(job.id);
  assert.equal(done.status, 'done');
  assert.equal(done.step_index, done.plan.length);
  clearJobs();
});

test('approveJob rejects when the job is not awaiting approval', async () => {
  clearJobs();
  const job = await engine.createJob('x', 'tester', engine.defaultPlan('x'));
  const r = engine.approveJob(job.id);
  assert.ok(r.error);
  assert.match(r.error, /not awaiting approval/);
  clearJobs();
});

test('approveJob marks the job\'s own generated products approved so publish can run', async () => {
  clearJobs();
  seedTestProducts();
  const job = await engine.createJob('approve my products', 'tester', engine.defaultPlan('approve my products'));
  // Simulate a job that generated the seeded products and is parked at the gate.
  db.prepare("UPDATE jobs SET status = 'awaiting-approval', progress = ? WHERE id = ?")
    .run(JSON.stringify({ log: [], created: [{ id: 99001 }, { id: 99002 }], gate_approved: false }), job.id);

  const before = db.prepare('SELECT status FROM products WHERE id = 99001').get().status;
  assert.equal(before, 'draft');

  engine.approveJob(job.id);

  const after1 = db.prepare('SELECT status FROM products WHERE id = 99001').get().status;
  const after2 = db.prepare('SELECT status FROM products WHERE id = 99002').get().status;
  assert.equal(after1, 'approved', 'job approval auto-approves its generated products');
  assert.equal(after2, 'approved');
  clearJobs();
});

test('pause / resume / reject / delete transition job status correctly', async () => {
  clearJobs();
  const job = await engine.createJob('pausable job', 'tester', engine.defaultPlan('pausable job'));

  const paused = engine.pauseJob(job.id);
  assert.equal(paused.status, 'paused');

  const resumed = engine.resumeJob(job.id);
  assert.equal(resumed.status, 'running');

  const rejected = engine.rejectJob(job.id);
  assert.equal(rejected.status, 'failed');

  engine.deleteJob(job.id);
  assert.equal(engine.getJob(job.id), null);
  clearJobs();
});

test('a gated job that is never approved stays paused (nothing leaks live)', async () => {
  clearJobs();
  await engine.createJob('never approve me', 'tester', engine.defaultPlan('never approve me'));
  const { calls, dispatch } = makeDispatch();
  await engine.runDueJobs(dispatch); // brainstorm
  await engine.runDueJobs(dispatch); // generate
  await engine.runDueJobs(dispatch); // optimize
  await engine.runDueJobs(dispatch); // design
  await engine.runDueJobs(dispatch); // publish gate → pause
  await engine.runDueJobs(dispatch); // still paused, no publish
  assert.equal(calls.filter(c => c.tool === 'publish').length, 0);
  clearJobs();
});
