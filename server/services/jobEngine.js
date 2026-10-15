// ═══════════════════════════════════════════════════════════════════════════
// JOB ENGINE — persistent multi-step projects the agent drives autonomously.
//
// A job is a natural-language prompt ("build a tax-season product line for
// bookkeepers") turned into a step plan. The cron executor advances one step
// per pass using the SAME tool dispatch the chat agent uses (generate,
// brainstorm, optimize, publish). Publish steps are GATED: the job pauses for
// human approval before anything irreversible goes live.
//
// Step plan shape (JSON array):
//   { "tool": "brainstorm", "args": {...} }
//   { "tool": "generate",  "args": {"idea": "...", "count": 3} }
//   { "tool": "optimize",  "args": {"id": "{id}"}, "forEach": "$created" }
//   { "tool": "publish",   "args": {"id": "{id}"}, "forEach": "$created", "gate": true }
//
// `forEach: "$created"` expands the step once per product the last generate
// step created; `{id}` is substituted per iteration. `gate: true` pauses the
// job for approval before that step runs.
// ═══════════════════════════════════════════════════════════════════════════

const { db } = require('../database');
const router = require('./modelRouter');

const STATUSES = ['planned', 'running', 'awaiting-approval', 'done', 'failed', 'paused'];
// Tools that touch the live marketplace — always gated behind human approval.
const GATED_TOOLS = ['publish', 'push_etsy'];

// ── PLAN ──────────────────────────────────────────────────────────────────
// Deterministic fallback plan when the AI layer is off (or returns junk).
// brainstorm → generate → optimize each → publish each (gated).
function defaultPlan(prompt, niche) {
  const idea = String(prompt || '').slice(0, 120);
  return [
    { tool: 'brainstorm', args: { niche: niche || idea, count: 3 } },
    { tool: 'generate', args: { idea, count: 3 } },
    { tool: 'optimize', args: { id: '{id}' }, forEach: '$created' },
    { tool: 'publish', args: { id: '{id}' }, forEach: '$created', gate: true },
  ];
}

// Ask the AI to turn a prompt into a step plan. Returns the parsed array, or
// the deterministic default when the model is off/unparseable.
async function planJob(prompt, niche) {
  const system = [
    'You turn a project description into a step plan for a digital-product factory.',
    'Available tools: brainstorm {niche,count}, generate {idea,count}, optimize {id}, publish {id}, push_etsy {id}.',
    'Output ONLY a JSON array of steps. Each step: {"tool":"...","args":{...}}.',
    'Use "forEach":"$created" on optimize/publish steps so they run once per generated product, with "id":"{id}".',
    'Publish and push_etsy steps MUST include "gate":true (they go live and need human approval).',
    'Keep it to 3-5 steps. Generate creates the products; optimize polishes copy; publish lists them.'
  ].join(' ');
  try {
    const raw = await router.callModel({
      model: router.cfg && router.cfg.openrouter ? router.cfg.openrouter.ideationModel : undefined,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: String(prompt || '').slice(0, 500) }
      ],
      temperature: 0.3,
      action: 'job_plan'
    });
    const plan = parsePlan(raw);
    if (plan && plan.length) return plan;
  } catch (e) { /* fall through to default */ }
  return defaultPlan(prompt, niche);
}

function parsePlan(raw) {
  if (!raw) return null;
  const cleaned = String(raw).replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('['), end = cleaned.lastIndexOf(']');
  if (start < 0 || end < start) return null;
  let arr;
  try { arr = JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
  if (!Array.isArray(arr) || !arr.length) return null;
  // Validate + sanitize: every step needs a known tool; force gates on publish.
  const known = new Set(['brainstorm', 'generate', 'optimize', 'publish', 'push_etsy', 'set_status', 'run_action']);
  const out = [];
  for (const s of arr) {
    if (!s || !known.has(String(s.tool))) continue;
    const step = { tool: String(s.tool), args: (s.args && typeof s.args === 'object') ? s.args : {} };
    if (s.forEach === '$created') step.forEach = '$created';
    if (GATED_TOOLS.includes(step.tool)) step.gate = true; // never trust the model to gate
    out.push(step);
  }
  return out.length ? out : null;
}

// ── CRUD ──────────────────────────────────────────────────────────────────
// createJob(prompt, createdBy, plan) — `plan` lets callers (and tests) supply
// a step plan explicitly; omit it and the AI planner (or its deterministic
// default) fills it in.
async function createJob(prompt, createdBy = 'operator', plan = null) {
  const steps = Array.isArray(plan) && plan.length ? plan : await planJob(prompt);
  const res = db.prepare(
    "INSERT INTO jobs (prompt, plan, status, step_index, progress, created_by) VALUES (?, ?, 'running', 0, ?, ?)"
  ).run(String(prompt || '').slice(0, 500), JSON.stringify(steps), JSON.stringify({ log: [], created: [], gate_approved: false }), createdBy);
  const id = res.lastInsertRowid;
  db.prepare('INSERT INTO automation_log (action, details, status) VALUES (?, ?, ?)')
    .run('job_created', `Job #${id}: ${String(prompt).slice(0, 120)} (${steps.length} steps)`, 'info');
  return getJob(id);
}

function getJob(id) {
  const row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
  if (!row) return null;
  return {
    ...row,
    plan: JSON.parse(row.plan),
    progress: row.progress ? JSON.parse(row.progress) : { log: [], created: [], gate_approved: false },
  };
}

function listJobs(limit = 50) {
  return db.prepare('SELECT * FROM jobs ORDER BY id DESC LIMIT ?').all(limit).map(r => ({
    ...r,
    plan: JSON.parse(r.plan),
    progress: r.progress ? JSON.parse(r.progress) : { log: [], created: [], gate_approved: false },
    stepCount: JSON.parse(r.plan).length,
  }));
}

// ── EXECUTOR ──────────────────────────────────────────────────────────────
// Substitute {id} placeholders in a step's args with a concrete product id.
// When the ENTIRE value is a single {placeholder}, return the raw typed value
// (so numeric ids stay numbers); otherwise do a string interpolation.
function substitute(args, vars) {
  const out = Array.isArray(args) ? [] : {};
  for (const k of Object.keys(args || {})) {
    const v = args[k];
    if (typeof v === 'string') {
      const whole = v.match(/^\{(\w+)\}$/);
      if (whole && vars[whole[1]] != null) { out[k] = vars[whole[1]]; continue; }
      out[k] = v.replace(/\{(\w+)\}/g, (_, name) => (vars[name] != null ? String(vars[name]) : `{${name}}`));
    } else if (v && typeof v === 'object') {
      out[k] = substitute(v, vars);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function logProgress(job, entry) {
  const progress = job.progress && job.progress.log ? job.progress : { log: [], created: [], gate_approved: false };
  progress.log.push({ at: new Date().toISOString(), ...entry });
  if (progress.log.length > 200) progress.log = progress.log.slice(-200);
  return progress;
}

// Advance every active job by one step. `dispatch(tool, args)` is the same
// tool dispatcher the chat agent uses. Runs one step per job per pass so a
// long job makes steady progress without blocking the cron.
async function runDueJobs(dispatch) {
  const jobs = db.prepare("SELECT * FROM jobs WHERE status = 'running' ORDER BY id").all();
  const summary = [];
  for (const row of jobs) {
    const job = getJob(row.id);
    const plan = job.plan;
    if (job.step_index >= plan.length) {
      db.prepare("UPDATE jobs SET status = 'done', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(job.id);
      summary.push({ id: job.id, status: 'done' });
      continue;
    }
    const step = plan[job.step_index];

    // Gate: pause BEFORE a gated step until a human approves.
    if (step.gate && !job.progress.gate_approved) {
      db.prepare("UPDATE jobs SET status = 'awaiting-approval', progress = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(JSON.stringify(logProgress(job, { step: job.step_index, tool: step.tool, note: 'paused for approval before publish' })), job.id);
      summary.push({ id: job.id, status: 'awaiting-approval', step: job.step_index, tool: step.tool });
      continue;
    }

    try {
      let created = [];
      if (step.forEach === '$created') {
        const ids = (job.progress.created || []).map(c => c.id);
        for (const id of ids) {
          const args = substitute(step.args, { id });
          await dispatch(step.tool, args);
        }
        if (!ids.length) {
          // nothing generated — skip this forEach step rather than stall
        }
      } else {
        const result = await dispatch(step.tool, step.args || {});
        if (step.tool === 'generate' && result && Array.isArray(result.created)) {
          created = result.created;
          job.progress.created = result.created;
        }
      }
      const progress = logProgress(job, {
        step: job.step_index, tool: step.tool,
        ok: true,
        note: step.forEach === '$created' ? `ran for ${(job.progress.created || []).length} product(s)` : 'done',
      });
      progress.gate_approved = false; // reset for the next gate
      const nextIndex = job.step_index + 1;
      const nextStatus = nextIndex >= plan.length ? 'done' : 'running';
      db.prepare('UPDATE jobs SET step_index = ?, status = ?, progress = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(nextIndex, nextStatus, JSON.stringify(progress), job.id);
      summary.push({ id: job.id, status: nextStatus, step: nextIndex, tool: step.tool });
    } catch (e) {
      const progress = logProgress(job, { step: job.step_index, tool: step.tool, ok: false, note: e.message });
      db.prepare("UPDATE jobs SET status = 'failed', progress = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(JSON.stringify(progress), job.id);
      summary.push({ id: job.id, status: 'failed', error: e.message });
    }
  }
  return summary;
}

// Human approval: clear the gate so the next cron pass runs the gated step.
// Approving a job is the operator's explicit sign-off on THIS job's publish,
// so we also mark the products it generated as approved — otherwise the
// publish step would skip every draft. (Products from other sources still go
// through the Review queue; only a job's own products get auto-approved here.)
function approveJob(id) {
  const job = getJob(id);
  if (!job) return { error: 'job not found' };
  if (job.status !== 'awaiting-approval') return { error: `job is ${job.status}, not awaiting approval` };
  const created = (job.progress && job.progress.created) || [];
  for (const c of created) {
    const p = db.prepare('SELECT id, status FROM products WHERE id = ?').get(c.id);
    if (p && p.status !== 'listed' && p.status !== 'approved') {
      db.prepare('UPDATE products SET status = ? WHERE id = ?').run('approved', c.id);
    }
  }
  const progress = job.progress || { log: [], created: [], gate_approved: false };
  progress.gate_approved = true;
  progress.log.push({ at: new Date().toISOString(), note: `approved by operator (${created.length} product(s) approved for publish)` });
  db.prepare("UPDATE jobs SET status = 'running', progress = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(JSON.stringify(progress), id);
  return getJob(id);
}

function rejectJob(id) {
  const job = getJob(id);
  if (!job) return { error: 'job not found' };
  const progress = logProgress(job, { note: 'rejected by operator' });
  db.prepare("UPDATE jobs SET status = 'failed', progress = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(JSON.stringify(progress), id);
  return getJob(id);
}

function pauseJob(id) {
  const job = getJob(id);
  if (!job) return { error: 'job not found' };
  if (!['running', 'awaiting-approval'].includes(job.status)) return { error: `cannot pause a ${job.status} job` };
  db.prepare("UPDATE jobs SET status = 'paused', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
  return getJob(id);
}

function resumeJob(id) {
  const job = getJob(id);
  if (!job) return { error: 'job not found' };
  if (job.status !== 'paused') return { error: `job is ${job.status}, not paused` };
  db.prepare("UPDATE jobs SET status = 'running', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
  return getJob(id);
}

function deleteJob(id) {
  db.prepare('DELETE FROM jobs WHERE id = ?').run(id);
  return { ok: true };
}

module.exports = {
  STATUSES, GATED_TOOLS,
  planJob, parsePlan, defaultPlan,
  createJob, getJob, listJobs,
  runDueJobs, approveJob, rejectJob, pauseJob, resumeJob, deleteJob,
};
