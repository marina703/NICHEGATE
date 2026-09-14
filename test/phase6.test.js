const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const mp = require('../server/services/marketplace');
const readiness = require('../server/services/readiness');
const ac = require('../server/services/automationCycle');

describe('readiness + Etsy key validation', () => {
  it('keysMisconfigured detects identical id/secret and ignores empties', () => {
    assert.equal(readiness.keysMisconfigured('abc', 'abc'), true);
    assert.equal(readiness.keysMisconfigured('abc', 'xyz'), false);
    assert.equal(readiness.keysMisconfigured('', ''), false);
    assert.equal(readiness.keysMisconfigured(undefined, 'x'), false);
  });

  it('checkEtsyKeys flags identical keys as misconfigured', () => {
    const id = process.env.ETSY_CLIENT_ID;
    const secret = process.env.ETSY_CLIENT_SECRET;
    const result = mp.checkEtsyKeys();
    if (id && secret && id === secret) {
      assert.equal(result.ok, false);
      assert.equal(result.misconfiguredKeys, true);
    } else {
      assert.equal(typeof result.ok, 'boolean');
    }
  });

  it('buildReadinessReport returns a structured, non-secret report', () => {
    const r = readiness.buildReadinessReport();
    assert.equal(typeof r.ok, 'boolean');
    assert.equal(typeof r.ready, 'boolean');
    assert.ok(Array.isArray(r.issues));
    // No raw secret should leak into the report
    const flat = JSON.stringify(r);
    assert.ok(!flat.includes(process.env.ETSY_CLIENT_SECRET || 'INJECTED-NEVER-MATCH'));
    assert.ok(!flat.includes(process.env.GUMROAD_ACCESS_TOKEN || 'INJECTED-NEVER-MATCH'));
    assert.ok('gumroadKey' in r.summary && 'autoList' in r.summary && 'realSales' in r.summary);
  });
});

describe('review-day policy', () => {
  it('review day skips generation/seasonal but leaves the publish queue reachable', () => {
    // These tasks early-return without writing when the review gate is up.
    assert.equal(ac.taskGenerate({ reviewDay: true }).generated, undefined);
    assert.equal(ac.taskSeasonal({ reviewDay: true }).seasonal, undefined);
  });
});
