// ═══════════════════════════════════════════════════════════════════════════
// CREDENTIAL GUARD — one shared definition of "is this a real secret?".
//
// The .env ships with PLACEHOLDER_FILL_IN / your_xxx / <fill-in> sentinels.
// Every channel's `configured()` check used to read the env var directly, so a
// placeholder was indistinguishable from a real token — the marketing dashboard
// reported channels as "connected" that had never authenticated. This module is
// the single place that decides, so every channel reports the same truth.
//
// Pure functions only: no DB, no network. Import anywhere.
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

// Patterns that mark a value as a template sentinel rather than a credential.
// Keep this list deliberately conservative: an over-eager pattern silently
// disables a working channel, which is worse than the placeholder false positive.
const PLACEHOLDER_PATTERNS = [
  /^your[_-]/i,          // your_gumroad_token, your_etsy_client_id
  /^placeh/i,            // PLACEHOLDER_FILL_IN, PLACEHOLDER...
  /^changeme/i,          // CHANGEME
  /^todo[_-]/i,          // TODO_FILL_IN
  /^<.*>$/,              // <your-token-here>
  /^xxx+$/i,             // xxx, XXXX
  /^example/i,           // example_token
  /^dummy/i,             // dummy
  /^test[_-]?(token|key|secret)?$/i,  // bare "test"/"test_token"
];

/**
 * True when `value` is a non-empty string that is NOT an obvious placeholder.
 * Whitespace-only and undefined count as absent.
 */
function isRealSecret(value) {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (!v) return false;
  if (PLACEHOLDER_PATTERNS.some((re) => re.test(v))) return false;
  return true;
}

/** True when env var `key` holds a real secret (same rules as isRealSecret). */
function envIsReal(key) {
  return isRealSecret(process.env[key]);
}

/**
 * True when a DB token row holds a real secret. `row` may be undefined.
 * Some rows store an expiry; a missing/expired expiry is not a secret problem
 * (the caller decides refresh policy), so this only guards the token string.
 */
function rowIsReal(row) {
  return !!(row && isRealSecret(row.access_token));
}

module.exports = { isRealSecret, envIsReal, rowIsReal, PLACEHOLDER_PATTERNS };
