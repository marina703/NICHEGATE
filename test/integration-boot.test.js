// Hermetic boot integration: spawns the REAL server against a throwaway DB and
// probes the HTTP surface — health, automation status, and the preview-html
// route (the one whose 7-type switch used to fall through to "Preview not
// available" and rendered "undefined" from product columns that never existed).
//
// node:test runs each file in its own process, so setting DB_PATH before any
// server/ require keeps this fully isolated from the dev database.
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const http = require('node:http');

const DB_FILE = path.join(os.tmpdir(), `nichegate-boot-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`);
process.env.DB_PATH = DB_FILE;
process.env.MODEL_ENABLED = '';
process.env.ADMIN_PASSWORD = '';
process.env.AUTO_START_ENABLED = '';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');

const PORT = 5400 + Math.floor(Math.random() * 500);

function get(pathname) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: pathname, timeout: 5000 }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', () => resolve({ status: 0, body: '' }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: '' }); });
  });
}

test('boot integration: health, truthful automation status, preview-html parity', { skip: process.versions.bun && !process.env.NODE_BINARY ? 'requires Node.js runtime; set NODE_BINARY to run under Bun' : false, timeout: 30000 }, async () => {
  // Pre-seed the throwaway DB (schema + auto-start OFF) before the server boots,
  // so the child never fires an automation cycle (no external calls in tests).
  const { db, init } = require('../server/database');
  init();
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('auto_generate', 'false')").run();
  // Own ASCII-safe profession — deterministic content assertions (seed names
  // contain apostrophes that HTML escaping hides from naive includes()).
  const fixture = `BootTest ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const profId = db.prepare(
    "INSERT INTO professions (emoji, name, slug, status, tier, colors, services, hashtags) VALUES ('🧪', ?, ?, 'researching', 'safe', '{}', '[]', '[]')"
  ).run(fixture, fixture.toLowerCase().replace(/[^a-z0-9]+/g, '-')).lastInsertRowid;
  const prof = { id: profId, name: fixture };
  const productId = db.prepare(
    "INSERT INTO products (profession_id, name, type, price, status, theme, html_content, brief) VALUES (?, ?, 'spreadsheet', '$17', 'draft', NULL, '<!-- auto-generated -->', ?)"
  ).run(prof.id, `${prof.name} — Income Tracker`, 'Track every dollar earned from Pinterest: affiliate links, sponsor pins, idea pins.').lastInsertRowid;

  const child = spawn(process.env.NODE_BINARY || process.execPath, ['server/index.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), BIND_HOST: '127.0.0.1', NODE_ENV: 'development' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));

  try {
    // Poll until the real HTTP surface answers
    let booted = false;
    for (let i = 0; i < 80 && !booted; i++) {
      const r = await get('/api/health');
      if (r.status === 200) booted = true;
      else await new Promise((r2) => setTimeout(r2, 250));
    }
    assert.ok(booted, 'server did not answer /api/health. Log tail:\n' + log.slice(-800));

    const health = await get('/api/health');
    assert.equal(health.status, 200);
    assert.match(health.body, /"ok":true/);

    // auto_generate=false must read as NOT effectively running (truthful state)
    const status = await get('/api/automation/status');
    assert.equal(status.status, 200);
    const st = JSON.parse(status.body);
    assert.equal(st.autoGenerate, false);
    assert.equal(st.effectivelyRunning, false);

    // preview-html: real profession data, all types, never "not available"/undefined
    const preview = await get(`/api/products/${productId}/preview-html`);
    assert.equal(preview.status, 200);
    assert.ok(!/Preview not available/i.test(preview.body), 'type fell through to "not available"');
    assert.ok(!/undefined/.test(preview.body), 'undefined leaked into preview (prof columns?)');
    assert.ok(preview.body.includes(fixture), 'profession name expected in preview');
    assert.ok(preview.body.includes('Income Tracker'), 'derived product title expected, not the canned one');

    // catalog API serves the product row
    const products = await get('/api/products');
    assert.equal(products.status, 200);
    assert.ok(products.body.includes('Income Tracker'));
  } finally {
    child.kill();
    await new Promise((r) => setTimeout(r, 300));
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(DB_FILE + suffix); } catch { /* already gone */ }
    }
  }
});
