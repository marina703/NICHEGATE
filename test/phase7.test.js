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

  it('renders the 5 outcome tools with theme colors (no leaky tokens)', () => {
    const ts = require('../server/services/toolStudio');
    const design = require('../server/services/themes');
    assert.equal(ts.TOOLS.length, 5);
    const html = ts.buildToolHTML(ts.TOOLS[0], design.getTheme('Onyx Volt'));
    assert.match(html, /The F-U Quote/);
    assert.ok(!html.includes('${' + 'accent}'));
  });
});

describe('coverArt prompt + cache (no network)', () => {
  it('builds photo-only prompts with no text requests', () => {
    const coverArt = require('../server/services/coverArt');
    const p = coverArt.promptFor({ name: 'House Cleaning' }, { type: 'invoice' });
    assert.ok(p.length > 20);
    assert.match(p.toLowerCase(), /no text/);
  });
  it('produces stable cache paths per product', () => {
    const coverArt = require('../server/services/coverArt');
    const prof = { name: 'House Cleaning', slug: 'house-cleaning' };
    const a = coverArt.cachePath(prof, { type: 'invoice' });
    const b = coverArt.cachePath(prof, { type: 'invoice' });
    const c = coverArt.cachePath(prof, { type: 'checklist' });
    assert.equal(a, b);
    assert.notEqual(a, c);
  });
  it('rejects news/sports/politics noise (trash filter)', () => {
    const radar = require('../server/services/trendRadar');
    for (const j of ['mike lafleur', 'disney+', 'discord downdetector', 'teoscar hernandez', 'jon ossoff']) {
      assert.equal(radar.normalizeNicheName(j), null, j + ' should be rejected');
    }
  });
});
