const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const AdmZip = require('adm-zip');

const velocity = require('../server/services/velocityEngine');
const vetting = require('../server/services/vettingEngine');
const radar = require('../server/services/trendRadar');
const schemas = require('../server/services/pipelineSchemas');
const design = require('../server/services/themes');
const { draftProduct, priceFor } = require('../server/services/productDraft');
const zipGen = require('../server/services/zipGenerator');
const pdfGen = require('../server/services/pdfGenerator');

describe('trend detection accuracy upgrades', () => {
  it('parseRevenue ignores digit noise inside words', () => {
    assert.deepEqual(velocity.parseRevenue('$5k-12k'), { low: 5000, high: 12000, mid: 8500 });
    assert.deepEqual(velocity.parseRevenue('$500'), { low: 500, high: 750, mid: 625 });
    // "day 30 window" carries no $ or k → not revenue
    assert.deepEqual(velocity.parseRevenue('peak demand day 30 window'), { low: 0, high: 0, mid: 0 });
    assert.deepEqual(velocity.parseRevenue('$1.5k-5k').low, 1500);
  });

  it('normalizeNicheKey collapses equivalent niche names for dedup', () => {
    assert.equal(radar.normalizeNicheKey('Beekeeping Tips'), 'beekeeping tips');
    assert.equal(radar.normalizeNicheKey('  Beekeeping  TIPS '), 'beekeeping tips');
    assert.equal(radar.normalizeNicheKey('Beekeeping (seasonal)'), 'beekeeping');
  });

  it('phaseForVelocity infers lifecycle phase from momentum', () => {
    assert.equal(radar.phaseForVelocity(300), 'hot');
    assert.equal(radar.phaseForVelocity(180), 'rising');
    assert.equal(radar.phaseForVelocity(90), 'emerging');
  });

  it('fuseShoppingIntent boosts productizable names and dampens noise', () => {
    const boost = radar.fuseShoppingIntent({ name: 'Invoice Template Bundle', shoppingIntent: 0.5 });
    assert.ok(boost > 0.5);
    const damp = radar.fuseShoppingIntent({ name: 'Celebrity news score', shoppingIntent: 0.5 });
    assert.ok(damp < 0.5);
  });

  it('scoreShoppingIntent reads stored radar intent tags', () => {
    const v = vetting.scoreShoppingIntent({ why: 'google-trends · 200K · intent=0.85' });
    assert.equal(v, 85);
    const fallback = vetting.scoreShoppingIntent({ why: 'Discovery · trades · EV adoption', source: '' });
    assert.ok(fallback >= 40);
  });
});

describe('pipeline schema + draft helper', () => {
  it('validates product type whitelist and price', () => {
    const ok = schemas.validateProductDraft({ profession_id: 1, name: 'X', type: 'INVOICE', price: '17' });
    assert.equal(ok.type, 'invoice');
    assert.equal(ok.price, '$17');

    assert.throws(() => schemas.validateProductDraft({ profession_id: 1, name: 'X', type: 'nonsense' }), /type unsupported/);
    assert.throws(() => schemas.validateProductDraft({ profession_id: 1, name: 'X', type: 'invoice', price: 'free' }), /price invalid/);
    assert.equal(schemas.validatePrice(''), '$12');
  });

  it('priceFor returns sensible defaults', () => {
    assert.equal(priceFor('spreadsheet'), '$17');
    assert.equal(priceFor('bundle'), '$29');
    assert.equal(priceFor('unknown-type'), '$12');
  });

  it('drafts a product with a valid theme and dedupes re-drafts', () => {
    const { db } = require('../server/database');
    const prof = db.prepare('SELECT * FROM professions WHERE id = 1').get();
    const id = draftProduct(prof, 'shot-chart');
    try {
      assert.ok(id > 0, 'expected a new draft id');
      const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
      assert.equal(row.type, 'shot-chart');
      assert.ok(design.getTheme(row.theme), 'theme should resolve to a known design');
      assert.equal(draftProduct(prof, 'shot-chart'), null, 'duplicate type should dedupe');
    } finally {
      if (id) db.prepare('DELETE FROM products WHERE id = ?').run(id);
    }
  });
});

describe('social pack delivers editable HTML fallback', () => {
  it('zips HTML + hashtags even when no browser is available', async () => {
    const prof = {
      name: 'Test Coach', slug: 'test-coach', emoji: '🧪',
      hashtags: JSON.stringify(['#test', '#coach'])
    };
    const theme = design.getTheme('Onyx Volt');

    const orig = pdfGen.getBrowser;
    pdfGen.getBrowser = async () => null; // simulate no Chrome
    let zp = null;
    try {
      zp = await zipGen.createSocialPack(prof, theme);
      const zip = new AdmZip(zp);
      const names = zip.getEntries().map(e => e.entryName);
      assert.ok(names.includes('01-instagram-post-1.html'));
      assert.ok(names.includes('03-instagram-story.html'));
      assert.ok(names.includes('05-hashtags.txt'));
      assert.ok(names.includes('readme.txt'));
      // No PNGs are produced in the browser-less fallback path
      assert.ok(!names.some(n => n.endsWith('.png')));
    } finally {
      pdfGen.getBrowser = orig;
      if (zp) { try { fs.unlinkSync(zp); } catch {} }
    }
  });
});
