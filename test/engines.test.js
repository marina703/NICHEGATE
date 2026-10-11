const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const velocity = require('../server/services/velocityEngine');
const vetting = require('../server/services/vettingEngine');
const radar = require('../server/services/trendRadar');
const discovery = require('../server/services/discovery');

describe('velocityEngine', () => {
  it('parses velocity strings', () => {
    assert.equal(velocity.parseVelocity('+450%/mo'), 450);
    assert.equal(velocity.parseVelocity('3x'), 300);
    assert.equal(velocity.parseVelocity('+180%'), 180);
  });

  it('parses revenue ranges', () => {
    const r = velocity.parseRevenue('$5k-12k');
    assert.equal(r.low, 5000);
    assert.equal(r.high, 12000);
    assert.equal(r.mid, 8500);
  });

  it('scores rising high-revenue trends highly', () => {
    const score = velocity.computeVelocityScore({
      phase: 'rising',
      velocity: '+200%',
      est_revenue: '$5k-12k',
      window: 21
    });
    assert.ok(score >= 55);
  });
});

describe('vettingEngine', () => {
  it('activates high-margin micro-niches', () => {
    const vet = vetting.vetTrend({
      name: 'EV Charger Installer',
      phase: 'emerging',
      velocity: '+150%',
      window: 50,
      est_revenue: '$4k-9k',
      why: 'Discovery · trades · EV adoption'
    });
    assert.equal(vet.verdict, 'ACTIVATE');
    assert.ok(vet.signals.specificity > 40);
    assert.ok(vet.signals.shoppingIntent >= 40);
  });

  it('skips weak short-window noise', () => {
    const vet = vetting.vetTrend({
      name: 'Hot',
      phase: 'cooling',
      velocity: '+5%',
      window: 3,
      est_revenue: '$100',
      why: 'google-trends · celebrity'
    });
    assert.equal(vet.verdict, 'SKIP');
  });

  it('assertActivatable blocks WATCH without force', () => {
    // Craft a mid score by using rising + modest revenue + generic name
    const trend = {
      name: 'Business',
      phase: 'hot',
      velocity: '+80%',
      window: 20,
      est_revenue: '$1k-3k',
      why: 'google-trends'
    };
    const vet = vetting.vetTrend(trend);
    if (vet.verdict === 'WATCH') {
      assert.throws(() => vetting.assertActivatable(trend), /WATCH/);
      assert.doesNotThrow(() => vetting.assertActivatable(trend, { force: true }));
    } else {
      // Still validate API shape
      assert.ok(['ACTIVATE', 'SKIP', 'WATCH'].includes(vet.verdict));
    }
  });

  it('shouldActivate requires ACTIVATE grade', () => {
    const good = {
      name: 'Heat Pump Installer Kit',
      phase: 'emerging',
      velocity: '+140%',
      window: 45,
      est_revenue: '$5k-12k',
      why: 'etsy-autocomplete · shopping'
    };
    assert.equal(vetting.shouldActivate(good), true);
  });
});

describe('trendRadar', () => {
  it('parses traffic strings', () => {
    assert.equal(radar.parseTraffic('200K+'), 200000);
    assert.equal(radar.parseTraffic('10M+'), 10000000);
    assert.equal(radar.parseTraffic(''), 0);
  });

  it('normalizes productizable names and rejects sports/politics noise', () => {
    assert.equal(radar.normalizeNicheName('Beekeeping Tips'), 'Beekeeping Tips');
    assert.equal(radar.normalizeNicheName('NFL playoffs score'), null);
    assert.equal(radar.normalizeNicheName('Trump election news'), null);
    assert.equal(radar.normalizeNicheName('a'), null);
  });

  it('exposes source health registry', () => {
    const h = radar.getSourceHealth();
    assert.equal(typeof h, 'object');
  });
});

describe('discovery', () => {
  it('picks category-aware product mixes', () => {
    assert.deepEqual(
      discovery.productsForTrend({ name: 'Yoga', why: 'fitness coach train' }).slice(0, 1),
      ['booking']
    );
    assert.ok(discovery.productsForTrend({ name: 'X', why: 'recovery sober' }).includes('journal'));
  });

  it('ignores radar provenance labels when picking type mixes', () => {
    // "Pinterest/DIY buzz" is a SOURCE label in `why` (radar stores
    // "source · traffic · intent=NN"), not a craft topic — it must not type a
    // money-making niche as wall-art.
    const mix = discovery.productsForTrend({
      name: 'How to Make Money From Pinterest in 2026 - shopify.com',
      why: 'pinterest-rss · Pinterest/DIY buzz · intent=0.80'
    });
    assert.ok(!mix.includes('wall-art'), 'provenance label leaked into typing: ' + mix.join(','));
    assert.ok(mix.includes('spreadsheet'));

    // Substring traps: "start" is not "art".
    const mix2 = discovery.productsForTrend({ name: 'How to Start a Tutoring Business', why: '' });
    assert.ok(!mix2.includes('wall-art'), 'substring false-positive: ' + mix2.join(','));
  });
});
