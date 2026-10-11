// ═══════════════════════════════════════════════════════════════════════════
// ACTION REGISTRY — the deterministic command spine behind the Flight Deck.
//
// Every console command is a NAMED action with a declared input schema. The
// registry validates input, guards against duplicate long-running jobs, writes
// an auditable run record (action_runs + action_run_steps), and streams events
// to the UI. It never runs arbitrary code — only handlers the server registers.
//
// AI is never required: the command bar can paraphrase a request into one of
// these names, but each action works on its own.
// ═══════════════════════════════════════════════════════════════════════════

const { db } = require('../database');

// name → { label, description, input, singleton }
// input spec: { field: { type:'string'|'number'|'boolean', required, default, min, max } }
const ACTIONS = {
  'sweep': {
    label: 'Discovery Sweep',
    description: 'Run the live radar + niche-universe + seasonal sweep, then refresh active niches.',
    input: {}, singleton: true
  },
  'full-cycle': {
    label: 'Full Automation Cycle',
    description: 'Run the whole pipeline: sales sync → review gate → generate → publish.',
    input: {}, singleton: true
  },
  'generate-for-niche': {
    label: 'Generate For Niche',
    description: 'Create file-backed drafts for a niche (creates the niche if it is new).',
    input: { niche: { type: 'string', required: true }, count: { type: 'number', min: 1, max: 10, default: 3 } },
    singleton: false
  },
  'approve-all': {
    label: 'Approve All Pending',
    description: 'Approve every draft / pending-review product.',
    input: {}, singleton: true
  },
  'reject-trash': {
    label: 'Reject Trash Drafts',
    description: 'Reject pending drafts, optionally filtered by name.',
    input: { q: { type: 'string' } }, singleton: true
  },
  'dedupe-queue': {
    label: 'Dedupe Review Queue',
    description: 'Collapse identical clone drafts, keeping one file-backed keeper each.',
    input: {}, singleton: true
  },
  'push-bundles': {
    label: 'Publish Bundles',
    description: 'Build + publish queued $29 toolkits (Gumroad caps at 10/day).',
    input: {}, singleton: true
  },
  'lead-magnet': {
    label: 'Deploy Lead Magnet',
    description: 'Build and publish the free starter pack.',
    input: {}, singleton: true
  },
  'sync-sales': {
    label: 'Sync Sales',
    description: 'Pull Gumroad sales into metrics.',
    input: {}, singleton: true
  },
  'amplify-winners': {
    label: 'Amplify Winners',
    description: 'Auto-generate sequels, bundles, and sibling formats for best-selling products.',
    input: { minSales: { type: 'number', min: 1, max: 20, default: 2 } },
    singleton: true
  },
  'promote-pricing-winners': {
    label: 'Promote Pricing Winners',
    description: 'Auto-adopt statistically winning price variants and deploy to live listings.',
    input: {}, singleton: true
  },
  'scrape-competitor': {
    label: 'Scrape Competitor & Counter',
    description: 'Analyze competitor listing URL or query and generate counter-positioned products.',
    input: { target: { type: 'string', required: true }, count: { type: 'number', min: 1, max: 5, default: 2 } },
    singleton: false
  },
  'rebuild-covers': {
    label: 'Rebuild Covers',
    description: 'Regenerate product preview covers in batches.',
    input: {
      limit: { type: 'number', min: 1, max: 50, default: 10 },
      force: { type: 'boolean', default: true }
    },
    singleton: true
  },
  'set-auto-list': {
    label: 'Toggle Auto-List',
    description: 'Enable or disable automatic listing of approved products.',
    input: { value: { type: 'boolean', required: true } }, singleton: false
  },
  'serp-scan': {
    label: 'SERP Scan',
    description: 'Run the live SERP discovery sources.',
    input: {}, singleton: true
  },
  'drain-search-queue': {
    label: 'Drain Search Queue',
    description: 'Retry errored SERP queue jobs.',
    input: {}, singleton: true
  },
  'expand-discovery': {
    label: 'Expand Term Discovery',
    description: 'Recursively expand autocomplete (Serper + Etsy) to surface new productizable search terms; first-seen tracked.',
    input: {
      depth: { type: 'number', min: 0, max: 2, default: 1 },
      maxNew: { type: 'number', min: 1, max: 60, default: 30 }
    },
    singleton: true
  },
  'backup-database': {
    label: 'Backup Database',
    description: 'Write a timestamped SQLite backup under runtime/backups.',
    input: {}, singleton: true
  },
  'quality-audit': {
    label: 'FAANG/SpaceX Quality Audit',
    description: 'Inspect deliverables against physical, content, polish, and hallucination quality gates.',
    input: {
      status: { type: 'string', default: 'draft' },
      limit: { type: 'number', min: 1, max: 100, default: 50 }
    },
    singleton: true
  },
  'optimize-weak': {
    label: 'Optimize Weak Listings',
    description: 'Rewrite title/tags/description for the weakest SEO listings.',
    input: {
      limit: { type: 'number', min: 1, max: 50, default: 20 }
    },
    singleton: true
  },
  'wipe-catalog': {
    label: 'Wipe Slate Clean',
    description: 'Safe wipe of all catalog products with an automatic 30-minute undo restore snapshot.',
    input: {
      restoreWindowMinutes: { type: 'number', min: 5, max: 120, default: 30 }
    },
    singleton: true
  },
  'restore-catalog': {
    label: 'Restore Catalog Snapshot',
    description: 'Undo a catalog wipe within the 30-minute recovery window.',
    input: {},
    singleton: true
  }
};

class ActionError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'ActionError';
    this.code = code || 'ACTION_ERROR';
  }
}

function list() {
  return Object.entries(ACTIONS).map(([name, a]) => ({
    name, label: a.label, description: a.description, singleton: !!a.singleton, input: a.input || {}
  }));
}

function get(name) { return ACTIONS[name] || null; }

function coerce(field, spec, raw) {
  if (spec.type === 'number') {
    if (raw === undefined || raw === null || raw === '') {
      if (spec.required) throw new ActionError(`${field} is required`, 'VALIDATION');
      return spec.default;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new ActionError(`${field} must be a number`, 'VALIDATION');
    if (spec.min != null && n < spec.min) throw new ActionError(`${field} must be >= ${spec.min}`, 'VALIDATION');
    if (spec.max != null && n > spec.max) throw new ActionError(`${field} must be <= ${spec.max}`, 'VALIDATION');
    return n;
  }
  if (spec.type === 'boolean') {
    if (raw === undefined || raw === null || raw === '') {
      if (spec.required) throw new ActionError(`${field} is required`, 'VALIDATION');
      return spec.default;
    }
    if (typeof raw === 'boolean') return raw;
    const s = String(raw).toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(s)) return true;
    if (['false', '0', 'no', 'off'].includes(s)) return false;
    throw new ActionError(`${field} must be a boolean`, 'VALIDATION');
  }
  // string
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    if (spec.required) throw new ActionError(`${field} is required`, 'VALIDATION');
    return spec.default;
  }
  return String(raw).trim().slice(0, 200);
}

// Validate + coerce raw input into a clean object. Throws ActionError.
function validate(name, input) {
  const action = ACTIONS[name];
  if (!action) throw new ActionError(`Unknown action: ${name}`, 'UNKNOWN_ACTION');
  const clean = {};
  for (const [field, spec] of Object.entries(action.input || {})) {
    clean[field] = coerce(field, spec, input ? input[field] : undefined);
  }
  return clean;
}

function runningRun(name) {
  return db.prepare("SELECT id, started_at FROM action_runs WHERE action = ? AND status = 'running' ORDER BY id DESC LIMIT 1").get(name);
}

function isRunning(name) { return !!runningRun(name); }

function recentRuns(limit = 20) {
  const runs = db.prepare('SELECT id, action, label, input, status, result, error, started_at, finished_at FROM action_runs ORDER BY id DESC LIMIT ?').all(limit);
  const steps = db.prepare('SELECT step, status, detail, created_at FROM action_run_steps WHERE run_id = ? ORDER BY id ASC');
  return runs.map(r => ({ ...r, steps: steps.all(r.id) }));
}

// Execute a named action. Returns a run summary; never throws for handler
// failures (they are recorded). Throws ActionError only for bad input/duplicates.
async function execute(name, handlers, rawInput, onEvent = () => {}) {
  const action = ACTIONS[name];
  if (!action) throw new ActionError(`Unknown action: ${name}`, 'UNKNOWN_ACTION');
  const input = validate(name, rawInput);

  const handler = handlers && handlers[name];
  if (typeof handler !== 'function') throw new ActionError(`No handler registered for "${name}"`, 'NO_HANDLER');

  if (action.singleton) {
    const existing = runningRun(name);
    if (existing) {
      const err = new ActionError(`${action.label} is already running (run #${existing.id}).`, 'ALREADY_RUNNING');
      err.runId = existing.id;
      throw err;
    }
  }

  const runId = db.prepare('INSERT INTO action_runs (action, label, input, status) VALUES (?, ?, ?, ?)')
    .run(name, action.label, JSON.stringify(input), 'running').lastInsertRowid;

  onEvent({ type: 'run', phase: 'start', runId, action: name, label: action.label, input });

  const stepStmt = db.prepare('INSERT INTO action_run_steps (run_id, step, status, detail) VALUES (?, ?, ?, ?)');
  const step = (text, status = 'info', detail = null) => {
    stepStmt.run(runId, String(text).slice(0, 200), status, detail ? String(detail).slice(0, 500) : null);
    onEvent({ type: 'run', phase: 'step', runId, action: name, step: String(text), status, detail });
  };

  try {
    const result = (await handler(input, step)) || {};
    db.prepare("UPDATE action_runs SET status = 'success', result = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(JSON.stringify(result).slice(0, 4000), runId);
    step('done', 'success');
    onEvent({ type: 'run', phase: 'finish', runId, action: name, status: 'success', result });
    return { runId, action: name, status: 'success', result };
  } catch (e) {
    db.prepare("UPDATE action_runs SET status = 'error', error = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(String(e.message).slice(0, 1000), runId);
    step('failed', 'error', e.message);
    onEvent({ type: 'run', phase: 'finish', runId, action: name, status: 'error', error: e.message });
    return { runId, action: name, status: 'error', error: e.message };
  }
}

module.exports = { ACTIONS, list, get, validate, execute, recentRuns, isRunning, ActionError };
