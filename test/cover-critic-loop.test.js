const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { critiqueUntilPass, MAX_REGEN_TRIES } = require('../server/services/coverCritic');

function candidateFile(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cover-loop-'));
  const file = path.join(dir, `${name}.jpg`);
  fs.writeFileSync(file, 'x');
  return file;
}

const PASS = { publishAllowed: true, quality_score: 9 };
const FAIL = { publishAllowed: false, quality_score: 6 };

test('C3.3: fail, fail, pass → third candidate is returned after exactly 3 renders', async () => {
  const built = [];
  const verdicts = [FAIL, FAIL, PASS];
  const out = await critiqueUntilPass(async (attempt) => {
    const file = candidateFile(`c${attempt}`);
    built.push(file);
    return file;
  }, { critique: async () => verdicts.shift() });
  assert.equal(built.length, 3);
  assert.equal(out.attempts, 3);
  assert.equal(out.coverPath, built[2]);
  assert.equal(out.verdict.publishAllowed, true);
});

test('C3.3: never hands back a sub-gate candidate once the try cap is reached', async () => {
  let renders = 0;
  const out = await critiqueUntilPass(async (attempt) => {
    renders++;
    return candidateFile(`f${attempt}`);
  }, { critique: async () => FAIL });
  assert.equal(MAX_REGEN_TRIES, 3);
  assert.equal(renders, 3);
  assert.equal(out.coverPath, null);
  assert.equal(out.attempts, 3);
  assert.equal(out.verdict.quality_score, 6);
});

test('C3.3: AI disabled stops after one candidate — a retry cannot change an unscored outcome', async () => {
  let renders = 0;
  const out = await critiqueUntilPass(async () => {
    renders++;
    return candidateFile('disabled');
  }, { critique: async () => ({ publishAllowed: false, reason: 'ai-disabled' }) });
  assert.equal(renders, 1);
  assert.equal(out.coverPath, null);
});

test('C3.3: a render that throws or returns null is skipped, not fatal', async () => {
  const out = await critiqueUntilPass(async (attempt) => {
    if (attempt === 1) throw new Error('render boom');
    if (attempt === 2) return null;
    return candidateFile('third');
  }, { critique: async () => PASS });
  assert.equal(out.attempts, 3);
  assert.ok(out.coverPath && fs.existsSync(out.coverPath));
});
