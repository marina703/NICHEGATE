const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const schemas = require('../server/services/pipelineSchemas');
const design = require('../server/services/themes');
const xlsxGen = require('../server/services/xlsxGenerator');
const ds = require('../server/services/designStudio');
const mp = require('../server/services/marketplace');

describe('pipelineSchemas', () => {
  it('validates trend candidates', () => {
    const t = schemas.validateTrendCandidate({
      name: 'EV Charger Installer', phase: 'emerging', velocity: '+120%',
      window: 40, est_revenue: '$4k-9k', why: 'trades'
    });
    assert.equal(t.name, 'EV Charger Installer');
    assert.equal(t.window, 40);
  });

  it('rejects invalid product drafts', () => {
    assert.throws(() => schemas.validateProductDraft({ name: 'x', type: 'invoice' }), /profession_id/);
  });

  it('validates publish results', () => {
    const p = schemas.validatePublishResult({ platform: 'gumroad', listingId: 'abc' });
    assert.equal(p.platform, 'gumroad');
  });
});

describe('themes sentiment', () => {
  it('detects niche sentiment and palettes', () => {
    assert.equal(design.detectSentiment('wellness yoga breathwork'), 'wellness');
    assert.equal(design.detectSentiment('hvac roofing epoxy flooring'), 'trades');
    const tech = design.paletteForNiche({ name: 'SaaS Template Designer', tier: 'trend' });
    assert.ok(tech.name);
  });

  it('recommendTheme returns a known theme name', () => {
    const name = design.recommendTheme({ name: 'Beekeeping', tier: 'high-upside', slug: 'beekeeping' });
    assert.ok(design.getTheme(name));
  });
});

describe('xlsxGenerator multi-sheet', () => {
  it('builds multi-tab pricing workbook', () => {
    const prof = { name: 'Test Profession', slug: 'test-profession', services: JSON.stringify([['Consult', '$100'], ['Audit', '$250']]) };
    const fp = xlsxGen.generateXLSX('spreadsheet', prof, 'test-xlsx-phase3-' + Date.now() + '.xlsx');
    assert.ok(fs.existsSync(fp));
    const XLSX = require('xlsx');
    const wb = XLSX.readFile(fp);
    assert.ok(wb.SheetNames.length >= 3);
    try { fs.unlinkSync(fp); } catch {}
  });
});

describe('designStudio mockup', () => {
  it('wraps HTML in marketplace device frame', () => {
    assert.equal(typeof ds.wrapMarketplaceMockup, 'function');
    const html = ds.wrapMarketplaceMockup('<html><body><h1>Hi</h1></body></html>', { title: 'Demo Product', price: '$19' });
    assert.match(html, /device/);
    assert.match(html, /Demo Product/);
    assert.ok(html.includes(String.fromCharCode(36) + '19'));
  });
});

describe('gumroad quota helpers', () => {
  it('exposes quota API shape', () => {
    assert.equal(typeof mp.getGumroadQuota, 'function');
    const q = mp.getGumroadQuota();
    assert.ok(Number.isFinite(q.limit));
    assert.ok(Number.isFinite(q.used));
    assert.ok(Number.isFinite(q.remaining));
    assert.equal(q.limit, 10);
  });
});
