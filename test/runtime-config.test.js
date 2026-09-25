const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const runtimeConfig = require('../server/services/runtimeConfig');
const automationCycle = require('../server/services/automationCycle');

describe('production runtime configuration', () => {
  it('leaves local development config unrestricted', () => {
    assert.deepEqual(runtimeConfig.productionConfigProblems({ NODE_ENV: 'development' }), []);
  });

  it('requires strong admin auth, Discord delivery, and a mounted Railway volume', () => {
    const problems = runtimeConfig.productionConfigProblems({
      NODE_ENV: 'production',
      RAILWAY_ENVIRONMENT: 'production',
      ADMIN_PASSWORD: 'short'
    });
    assert.ok(problems.some(p => p.includes('ADMIN_PASSWORD')));
    assert.ok(problems.some(p => p.includes('DISCORD_WEBHOOK_URL')));
    assert.ok(problems.some(p => p.includes('Volume')));
  });

  it('maps the Railway database and all persistent output directories to its volume', () => {
    const env = { RAILWAY_ENVIRONMENT: 'production', RAILWAY_VOLUME_MOUNT_PATH: '/app/data' };
    const mount = path.resolve('/app/data');
    assert.equal(runtimeConfig.resolveDatabasePath(env), path.join(mount, 'profession-box.db'));
    for (const name of ['generated', 'uploads', 'previews', 'covers', 'backups']) {
      assert.equal(runtimeConfig.resolvePersistentDir(name, env), path.join(mount, name));
    }
  });

  it('rejects malformed or non-Discord webhook URLs', () => {
    for (const url of ['', 'https://example.com/webhook/secret', 'http://discord.com/api/webhooks/1/token', 'https://discord.com/api/webhooks/not-an-id/token']) {
      assert.equal(runtimeConfig.isDiscordWebhookUrl(url), false, url);
    }
    const problems = runtimeConfig.productionConfigProblems({
      NODE_ENV: 'production',
      ADMIN_PASSWORD: 'a'.repeat(24),
      DISCORD_WEBHOOK_URL: 'https://example.com/not-a-webhook'
    });
    assert.ok(problems.some(p => p.includes('DISCORD_WEBHOOK_URL')));
  });

  it('rejects persistent directory traversal names', () => {
    assert.throws(() => runtimeConfig.resolvePersistentDir('../outside', { RAILWAY_ENVIRONMENT: 'production', RAILWAY_VOLUME_MOUNT_PATH: '/app/data' }), /must stay within/);
    assert.throws(() => runtimeConfig.resolvePersistentDir('/outside', { NODE_ENV: 'development' }), /must stay within/);
  });

  it('rejects Railway DB_PATH overrides outside the mounted volume', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-volume-'));
    try {
      const problems = runtimeConfig.productionConfigProblems({
        NODE_ENV: 'production',
        RAILWAY_ENVIRONMENT: 'production',
        RAILWAY_VOLUME_MOUNT_PATH: dir,
        DB_PATH: path.join(os.tmpdir(), 'outside.db'),
        ADMIN_PASSWORD: 'a'.repeat(24),
        DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/123456789012345678/secret-token'
      });
      assert.ok(problems.some(p => p.includes('inside RAILWAY_VOLUME_MOUNT_PATH')));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('accepts safe Railway config and never reports secret values', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-volume-'));
    try {
      const env = {
        NODE_ENV: 'production',
        RAILWAY_ENVIRONMENT: 'production',
        RAILWAY_VOLUME_MOUNT_PATH: dir,
        ADMIN_PASSWORD: 'a'.repeat(24),
        DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/123456789012345678/secret-token',
        GUMROAD_ACCESS_TOKEN: 'gumroad-secret',
        ETSY_CLIENT_ID: 'etsy-id',
        ETSY_CLIENT_SECRET: 'etsy-secret',
        MODEL_ENABLED: 'true',
        OPENROUTER_API_KEY: 'model-secret',
        AUTO_START_ENABLED: 'true',
        AUTO_PUBLISH_ENABLED: 'true'
      };
      assert.deepEqual(runtimeConfig.productionConfigProblems(env), []);
      assert.equal(runtimeConfig.isDiscordWebhookUrl(env.DISCORD_WEBHOOK_URL), true);
      const warnings = runtimeConfig.integrationWarnings(env);
      const report = JSON.stringify(warnings);
      for (const secret of ['gumroad-secret', 'etsy-secret', 'model-secret']) {
        assert.equal(report.includes(secret), false);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports missing optional production integrations without exposing values', () => {
    const warnings = runtimeConfig.integrationWarnings({ NODE_ENV: 'production', MODEL_ENABLED: 'true' });
    assert.ok(warnings.some(w => w.includes('GUMROAD_ACCESS_TOKEN')));
    assert.ok(warnings.some(w => w.includes('DISCORD_WEBHOOK_URL')));
    assert.ok(warnings.some(w => w.includes('OPENROUTER_API_KEY')));
    assert.ok(!JSON.stringify(warnings).includes('secret'));
  });

  it('requires both explicit production automation and publish opt-ins', async () => {
    const oldNodeEnv = process.env.NODE_ENV;
    const oldRailway = process.env.RAILWAY_ENVIRONMENT;
    const oldAutoStart = process.env.AUTO_START_ENABLED;
    const oldAutoPublish = process.env.AUTO_PUBLISH_ENABLED;
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.RAILWAY_ENVIRONMENT;
      delete process.env.AUTO_START_ENABLED;
      process.env.AUTO_PUBLISH_ENABLED = 'true';
      const result = await automationCycle.taskPublishQueue({});
      assert.equal(result.listed, 0);
      assert.match(result.publishSkipped, /both AUTO_START_ENABLED.*AUTO_PUBLISH_ENABLED/);
    } finally {
      if (oldNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldNodeEnv;
      if (oldRailway === undefined) delete process.env.RAILWAY_ENVIRONMENT; else process.env.RAILWAY_ENVIRONMENT = oldRailway;
      if (oldAutoStart === undefined) delete process.env.AUTO_START_ENABLED; else process.env.AUTO_START_ENABLED = oldAutoStart;
      if (oldAutoPublish === undefined) delete process.env.AUTO_PUBLISH_ENABLED; else process.env.AUTO_PUBLISH_ENABLED = oldAutoPublish;
    }
  });
});
