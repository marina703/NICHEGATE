// ═══════════════════════════════════════════════════════════════════════════
// WORKER MEMORY — persistent memory + boss inbox for the AI worker (surrogate).
//
// Two tables, one store:
//   agent_memory — durable facts / preferences / decisions / notes the worker
//                  accumulates across sessions ("the boss prefers X", "we agreed
//                  to Y"). `pinned` memories always ride in the prompt.
//   boss_asks    — questions the worker (or the scheduled steward) asks the
//                  boss: "engine came up with X idea, what do you think?".
//                  Answers come back through the console and can carry an
//                  action the client replays through the confirmed-tool path.
//
// The store is a factory over an injected db handle, so tests run against an
// in-memory SQLite and never touch the real business database.
// ═══════════════════════════════════════════════════════════════════════════

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS agent_memory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL DEFAULT 'note',
    content TEXT NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS boss_asks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question TEXT NOT NULL,
    detail TEXT DEFAULT '',
    options TEXT,
    source TEXT DEFAULT 'worker',
    status TEXT NOT NULL DEFAULT 'pending',
    answer TEXT,
    answered_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`;

const KINDS = new Set(['fact', 'preference', 'decision', 'note', 'log']);
const MAX_LOGS = 40;

function createWorkerStore(db) {
  db.exec(SCHEMA);

  // ── memories ─────────────────────────────────────────────────────────
  function getMemory(id) {
    return db.prepare('SELECT * FROM agent_memory WHERE id = ?').get(id) || null;
  }

  function remember({ kind = 'note', content, pinned = false }) {
    const text = String(content || '').trim().slice(0, 400);
    if (!text) return null;
    const k = KINDS.has(kind) ? kind : 'note';
    const id = db.prepare('INSERT INTO agent_memory (kind, content, pinned) VALUES (?, ?, ?)')
      .run(k, text, pinned ? 1 : 0).lastInsertRowid;
    return getMemory(Number(id));
  }

  function recall(query, limit = 8) {
    const q = String(query || '').trim().slice(0, 100);
    const n = Math.min(20, Math.max(1, parseInt(limit) || 8));
    if (!q) return db.prepare('SELECT * FROM agent_memory WHERE kind != ? ORDER BY pinned DESC, id DESC LIMIT ?').all('log', n);
    return db.prepare('SELECT * FROM agent_memory WHERE content LIKE ? ORDER BY pinned DESC, id DESC LIMIT ?')
      .all(`%${q}%`, n);
  }

  function listMemories(limit = 50) {
    return db.prepare('SELECT * FROM agent_memory WHERE kind != ? ORDER BY pinned DESC, id DESC LIMIT ?')
      .all('log', Math.min(200, Math.max(1, parseInt(limit) || 50)));
  }

  function forgetMemory(id) {
    return db.prepare('DELETE FROM agent_memory WHERE id = ?').run(Number(id)).changes > 0;
  }

  function pinMemory(id, pinned) {
    db.prepare('UPDATE agent_memory SET pinned = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(pinned ? 1 : 0, Number(id));
    return getMemory(Number(id));
  }

  // Compressed block for the worker prompt: pinned first, then the newest
  // durable memories. Bounded so it can never bloat the context window.
  function buildMemoryContext(maxChars = 1500) {
    const rows = db.prepare('SELECT * FROM agent_memory WHERE kind != ? ORDER BY pinned DESC, id DESC LIMIT ?')
      .all('log', 12);
    if (!rows.length) return '';
    const lines = [];
    let used = 0;
    for (const r of rows) {
      const line = `${r.pinned ? '[pinned] ' : ''}[${r.kind}] ${r.content}`;
      if (used + line.length > maxChars) break;
      lines.push(line);
      used += line.length + 1;
    }
    return lines.join('\n');
  }

  // One compressed record per worker turn, pruned — the raw transcript lives
  // in the client; this is the worker's own recall trail.
  function logTurn({ message, answer }) {
    const text = `Asked: ${String(message || '').slice(0, 120)} → ${String(answer || '').slice(0, 160)}`;
    db.prepare('INSERT INTO agent_memory (kind, content) VALUES (?, ?)').run('log', text);
    db.prepare(`DELETE FROM agent_memory WHERE kind = 'log' AND id NOT IN (
      SELECT id FROM agent_memory WHERE kind = 'log' ORDER BY id DESC LIMIT ${MAX_LOGS})`).run();
  }

  // ── boss asks ────────────────────────────────────────────────────────
  function getAsk(id) {
    const row = db.prepare('SELECT * FROM boss_asks WHERE id = ?').get(Number(id)) || null;
    return row ? { ...row, options: row.options ? JSON.parse(row.options) : null } : null;
  }

  function ask({ question, detail = '', options = null, source = 'worker' }) {
    const q = String(question || '').trim().slice(0, 300);
    if (!q) return null;
    const opts = Array.isArray(options) ? options.slice(0, 4).map(o => ({
      label: String((o && o.label) != null ? o.label : o).slice(0, 120),
      action: (o && typeof o === 'object' && o.action && typeof o.action === 'object') ? o.action : null
    })) : null;
    const id = db.prepare('INSERT INTO boss_asks (question, detail, options, source) VALUES (?, ?, ?, ?)')
      .run(q, String(detail || '').slice(0, 600), opts ? JSON.stringify(opts) : null,
        source === 'steward' ? 'steward' : 'worker').lastInsertRowid;
    return getAsk(Number(id));
  }

  function listAsks(status = null, limit = 20) {
    const rows = status
      ? db.prepare('SELECT * FROM boss_asks WHERE status = ? ORDER BY id DESC LIMIT ?').all(status, Math.min(100, limit))
      : db.prepare('SELECT * FROM boss_asks ORDER BY id DESC LIMIT ?').all(Math.min(100, limit));
    return rows.map(r => ({ ...r, options: r.options ? JSON.parse(r.options) : null }));
  }

  function answerAsk(id, { answer = '', optionIndex = null } = {}) {
    const a = getAsk(id);
    if (!a || a.status !== 'pending') return null;
    let text = String(answer || '').trim().slice(0, 400);
    let action = null;
    if (optionIndex != null && a.options && a.options[Number(optionIndex)]) {
      const opt = a.options[Number(optionIndex)];
      if (!text) text = opt.label;
      action = opt.action || null;
    }
    db.prepare("UPDATE boss_asks SET status = 'answered', answer = ?, answered_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(text, Number(id));
    remember({ kind: 'decision', content: `Boss answered ask #${id} ("${a.question}"): ${text || '(no comment)'}` });
    return { ask: getAsk(Number(id)), action };
  }

  function dismissAsk(id) {
    const changed = db.prepare("UPDATE boss_asks SET status = 'dismissed', answered_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'")
      .run(Number(id)).changes > 0;
    return changed ? getAsk(Number(id)) : null;
  }

  function pendingCount() {
    return db.prepare("SELECT COUNT(*) AS c FROM boss_asks WHERE status = 'pending'").get().c;
  }

  function lastAskAtMs() {
    const row = db.prepare("SELECT created_at FROM boss_asks ORDER BY id DESC LIMIT 1").get();
    if (!row || !row.created_at) return 0;
    const t = new Date(String(row.created_at).replace(' ', 'T') + 'Z').getTime();
    return Number.isFinite(t) ? t : 0;
  }

  return {
    remember, recall, listMemories, forgetMemory, pinMemory, buildMemoryContext, logTurn,
    ask, getAsk, listAsks, answerAsk, dismissAsk, pendingCount, lastAskAtMs
  };
}

module.exports = { createWorkerStore, SCHEMA, KINDS };
