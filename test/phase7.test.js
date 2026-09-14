const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const discovery = require('../server/services/discovery');
const ac = require('../server/services/automationCycle');

describe('core niches + trend retirement', () => {
  it('pins the evergreen core niches (pyro + recovery + drywall)', () => {
    const expected = ['pyrotechnics', 'aa-recovery', 'smart-recovery', 'refuge-recovery', 'womens-recovery', 'secular-recovery', 'faith-recovery', 'drywall'];
    for (const slug of expected) {
      assert.ok(discovery.CORE_SLUGS.has(slug), 'missing core slug: ' + slug);
    }
    assert.equal(discovery.isCoreProfession({ slug: 'drywall' }), true);
    assert.equal(discovery.isCoreProfession({ slug: 'drone-surveying' }), false);
    assert.equal(discovery.isCoreProfession(null), false);
  });

  it('exposes the cold-trend retirement pass in the cycle', () => {
    assert.equal(typeof discovery.retireColdTrends, 'function');
    assert.equal(typeof ac.taskRetire, 'function');
  });

  it('detects consumer-product fads ("burrito blanket" pattern)', () => {
    const radar = require('../server/services/trendRadar');
    assert.ok(radar.detectFad({ name: 'burrito blanket', shoppingIntent: 0.9 }) >= 45);
    assert.equal(radar.detectFad({ name: 'how to fix drywall', shoppingIntent: 0.4 }), 0);
    assert.equal(radar.detectFad({ name: 'single' }), 0);
  });

  it('exposes fad auto-activation + winner scaling', () => {
    assert.equal(typeof discovery.autoActivateHotFads, 'function');
    assert.equal(typeof discovery.scaleWinners, 'function');
    assert.equal(typeof ac.taskScale, 'function');
  });
});
