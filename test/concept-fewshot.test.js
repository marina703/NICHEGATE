const test = require('node:test');
const assert = require('node:assert/strict');
const conceptEngine = require('../server/services/conceptEngine');
const { db, init } = require('../server/database');
init();

test('conceptEngine: getFewShotExamples provides high-performing concept models', () => {
  const examples = conceptEngine.getFewShotExamples(2);
  assert.ok(Array.isArray(examples));
  assert.ok(examples.length >= 1);
  const parsed = JSON.parse(examples[0]);
  assert.ok(parsed.name);
  assert.ok(parsed.pitch);
  assert.ok(Array.isArray(parsed.benefits));
  assert.ok(parsed.differentiator);
});
