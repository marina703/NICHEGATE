const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ownsDbPath = !process.env.DB_PATH;
if (ownsDbPath) {
  process.env.DB_PATH = path.join(os.tmpdir(), `nichegate-publish-queue-${process.pid}.db`);
}
const DB_PATH = process.env.DB_PATH;
const previousEnv = {
  nodeEnv: process.env.NODE_ENV,
  railway: process.env.RAILWAY_ENVIRONMENT,
  autoStart: process.env.AUTO_START_ENABLED,
  autoPublish: process.env.AUTO_PUBLISH_ENABLED,
  autoPublishManual: process.env.AUTO_PUBLISH_MANUAL
};
process.env.NODE_ENV = 'development';
delete process.env.RAILWAY_ENVIRONMENT;
delete process.env.AUTO_START_ENABLED;
delete process.env.AUTO_PUBLISH_ENABLED;
delete process.env.AUTO_PUBLISH_MANUAL;

const { db, init } = require('../server/database');
const automationCycle = require('../server/services/automationCycle');

// This isolated DB contains no approved products, so the test exercises the
// query without invoking any marketplace or notification integrations.
init();
db.prepare("INSERT INTO settings (key, value) VALUES ('auto_list', 'true') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();

test('publish queue query runs with manual auto-publish left disabled', async () => {
  const result = await automationCycle.taskPublishQueue({});
  assert.equal(result.listed, 0);
  assert.equal(result.publishSkipped, undefined);
});

after(() => {
  db.close();
  for (const [key, value] of Object.entries({
    NODE_ENV: previousEnv.nodeEnv,
    RAILWAY_ENVIRONMENT: previousEnv.railway,
    AUTO_START_ENABLED: previousEnv.autoStart,
    AUTO_PUBLISH_ENABLED: previousEnv.autoPublish,
    AUTO_PUBLISH_MANUAL: previousEnv.autoPublishManual
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  if (ownsDbPath) {
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.rmSync(DB_PATH + suffix, { force: true }); } catch {}
    }
  }
});
