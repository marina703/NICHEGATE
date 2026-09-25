const { describe, it, mock } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const notifier = require('../server/services/notifier');

describe('Discord notifier delivery status', () => {
  it('returns false without making a request when no webhook is configured', async () => {
    assert.equal(await notifier.sendDiscord('', 'message'), false);
  });

  it('returns true only after Discord accepts the request', async () => {
    const stub = mock.method(axios, 'post', async () => ({ status: 204 }));
    try {
      assert.equal(await notifier.sendDiscord('https://discord.com/api/webhooks/1/token', 'message'), true);
      assert.equal(stub.mock.callCount(), 1);
    } finally {
      stub.mock.restore();
    }
  });

  it('returns false for failed delivery and never logs the webhook secret', async () => {
    const secretUrl = 'https://discord.com/api/webhooks/1/top-secret-token';
    const stub = mock.method(axios, 'post', async () => {
      throw Object.assign(new Error(`Request failed for ${secretUrl}`), { response: { status: 401 } });
    });
    const originalError = console.error;
    const logs = [];
    console.error = (...args) => logs.push(args.join(' '));
    try {
      assert.equal(await notifier.sendDiscord(secretUrl, 'message'), false);
      assert.match(logs.join('\n'), /HTTP 401/);
      assert.equal(logs.join('\n').includes('top-secret-token'), false);
    } finally {
      console.error = originalError;
      stub.mock.restore();
    }
  });
});
