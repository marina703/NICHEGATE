const fs = require('fs');
const path = require('path');

function isProduction(env = process.env) {
  return env.NODE_ENV === 'production' || !!env.RAILWAY_ENVIRONMENT;
}

function isRailway(env = process.env) {
  return !!env.RAILWAY_ENVIRONMENT;
}

function resolveDatabasePath(env = process.env, projectRoot = path.resolve(__dirname, '..', '..')) {
  if (env.DB_PATH) {
    const configured = String(env.DB_PATH);
    return path.isAbsolute(configured) ? path.normalize(configured) : path.resolve(projectRoot, configured);
  }
  if (isRailway(env) && env.RAILWAY_VOLUME_MOUNT_PATH) {
    return path.join(path.resolve(env.RAILWAY_VOLUME_MOUNT_PATH), 'profession-box.db');
  }
  return path.join(projectRoot, 'data', 'profession-box.db');
}

function resolvePersistentDir(name, env = process.env, projectRoot = path.resolve(__dirname, '..', '..')) {
  const relativeName = String(name || '');
  if (path.isAbsolute(relativeName) || relativeName.split(/[\\/]+/).includes('..')) {
    throw new Error('Persistent directory name must stay within the configured storage root.');
  }
  if (isRailway(env) && env.RAILWAY_VOLUME_MOUNT_PATH) {
    return path.join(path.resolve(env.RAILWAY_VOLUME_MOUNT_PATH), relativeName);
  }
  return path.join(projectRoot, relativeName);
}

function isDiscordWebhookUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:' &&
      ['discord.com', 'discordapp.com'].includes(url.hostname.toLowerCase()) &&
      /^\/api(?:\/v\d+)?\/webhooks\/\d+\/[^/]+\/?$/.test(url.pathname);
  } catch {
    return false;
  }
}

function productionConfigProblems(env = process.env, fsImpl = fs) {
  if (!isProduction(env)) return [];

  const problems = [];
  const password = String(env.ADMIN_PASSWORD || '').trim();
  if (password.length < 16) {
    problems.push('ADMIN_PASSWORD must be set to at least 16 characters before serving a production console.');
  }
  if (!isDiscordWebhookUrl(env.DISCORD_WEBHOOK_URL)) {
    problems.push('DISCORD_WEBHOOK_URL must be a valid HTTPS Discord webhook URL in production so surrogate decisions can reach the operator.');
  }
  if (isRailway(env)) {
    const mountPath = String(env.RAILWAY_VOLUME_MOUNT_PATH || '').trim();
    if (!mountPath) {
      problems.push('Railway persistent storage is not attached; mount a Volume at /app/data.');
    } else {
      const root = path.resolve(mountPath);
      const generatedPath = resolvePersistentDir('generated', env);
      const relativeGenerated = path.relative(root, generatedPath);
      if (relativeGenerated === '..' || relativeGenerated.startsWith(`..${path.sep}`) || path.isAbsolute(relativeGenerated)) {
        problems.push('Generated assets must stay inside RAILWAY_VOLUME_MOUNT_PATH on Railway.');
      }
      const dbPath = resolveDatabasePath(env);
      const relative = path.relative(root, dbPath);
      if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        problems.push('DB_PATH must stay inside RAILWAY_VOLUME_MOUNT_PATH on Railway.');
      }
      try {
        if (!fsImpl.statSync(root).isDirectory()) problems.push(`Railway volume mount is not a directory: ${root}`);
        else fsImpl.accessSync(root, fs.constants.W_OK);
      } catch {
        problems.push(`Railway volume mount is missing or not writable: ${root}`);
      }
    }
  }
  return problems;
}

function assertProductionConfig(env = process.env, fsImpl = fs) {
  const problems = productionConfigProblems(env, fsImpl);
  if (problems.length) {
    throw new Error(`[STARTUP] Unsafe production configuration:\n- ${problems.join('\n- ')}`);
  }
}

function integrationWarnings(env = process.env) {
  if (!isProduction(env)) return [];
  const warnings = [];
  if (!env.GUMROAD_ACCESS_TOKEN) warnings.push('GUMROAD_ACCESS_TOKEN is missing — Gumroad publishing and sales sync are unavailable.');
  if (!env.ETSY_CLIENT_ID || !env.ETSY_CLIENT_SECRET) warnings.push('ETSY_CLIENT_ID and/or ETSY_CLIENT_SECRET are missing — Etsy integration is unavailable.');
  if (!isDiscordWebhookUrl(env.DISCORD_WEBHOOK_URL)) {
    warnings.push(String(env.DISCORD_WEBHOOK_URL || '').trim()
      ? 'DISCORD_WEBHOOK_URL is not a valid HTTPS Discord webhook URL — surrogate alerts may fail.'
      : 'DISCORD_WEBHOOK_URL is missing — the surrogate cannot contact you on Discord.');
  }
  if (String(env.MODEL_ENABLED || '').toLowerCase() === 'true' && !env.OPENROUTER_API_KEY) {
    warnings.push('MODEL_ENABLED=true but OPENROUTER_API_KEY is missing — the AI worker will use its deterministic fallback.');
  }
  if (String(env.COVER_ART_PROVIDER || '').toLowerCase() === 'cloudflare' && !env.COVER_WORKER_URL) {
    warnings.push('COVER_WORKER_URL is missing — AI cover generation will fall back to plain covers.');
  }
  if (String(env.AUTO_PUBLISH_ENABLED || '').toLowerCase() !== 'true') {
    warnings.push('Automatic marketplace publishing is safety-locked; set AUTO_PUBLISH_ENABLED=true only after verifying production settings.');
  }
  return warnings;
}

function logIntegrationWarnings(env = process.env, logger = console) {
  for (const warning of integrationWarnings(env)) logger.warn(`[CONFIG] ${warning}`);
}

module.exports = {
  isProduction,
  isRailway,
  isDiscordWebhookUrl,
  resolveDatabasePath,
  resolvePersistentDir,
  productionConfigProblems,
  assertProductionConfig,
  integrationWarnings,
  logIntegrationWarnings
};
