const test = require('node:test');
const assert = require('node:assert/strict');
const seo = require('../server/services/seoEngine');
const mp = require('../server/services/marketplace');

const PROF = {
  name: 'HVAC Technician', slug: 'hvac', tier: 'safe',
  services: '[["AC Tune-up","99"],["Diagnostic Fee","89"]]',
  hashtags: '["hvac","hvactech"]'
};

test('generateSEO leads with moat specifics and passes the copy gate', () => {
  const out = seo.generateSEO(PROF, 'checklist', 'Auto Theme', []);
  assert.equal(out.copyGate.verdict, 'pass');
  assert.ok(out.specifics.length >= 2, 'expected moat specifics from contentLibrary');
  assert.ok(!/look elite|clean, modern layout|Auto Theme|customize colors, text, and fonts/i.test(out.description));
  assert.ok(/WHAT'S INSIDE:/.test(out.description));
  assert.ok(/BUILT FOR: HVAC Technician/.test(out.description));
  assert.ok(!/Theme: /i.test(out.description), 'internal Theme line must not leak into listings');
});

test('copy gate rejects the old boilerplate template verbatim', () => {
  const old = `HVAC Technician Invoice Template — a Professional invoice template designed to make your business look elite.\n\nWHAT'S INCLUDED:\n• Quality Checklist with a clean, modern layout\n• Fully editable — customize colors, text, and fonts\n• Instant download, use forever\n\nPERFECT FOR: HVAC Technician professionals.\n\nTheme: Auto Theme | Format: PDF`;
  const gate = seo.listingCopyGate(old, seo.moatSpecifics(PROF, 'checklist'));
  assert.equal(gate.verdict, 'fail');
  assert.ok(gate.reasons.includes('boilerplate phrases'));
});

test('copy gate catches the grammar-agreement bug pattern', () => {
  const gate = seo.listingCopyGate('a Professional instagram templates pack for your business', ['specific one', 'specific two']);
  assert.equal(gate.verdict, 'fail');
  assert.ok(gate.reasons.includes('grammar/agreement bug'));
});

test('social copy embeds real moat hooks (short-cycle angle)', () => {
  const out = seo.generateSEO(PROF, 'social', '', []);
  assert.ok(out.specifics.length >= 2);
  assert.equal(out.copyGate.verdict, 'pass');
  assert.ok(out.description.toLowerCase().includes(out.specifics[0].toLowerCase().slice(0, 24)));
});

test('mapGumroadAnchor maps niche, type, price and marketplace id', () => {
  const a = mp.mapGumroadAnchor({ id: 987654, name: 'Beekeeping / Apiary Social Media Templates', price: 1200 });
  assert.equal(a.profession_id, 3);
  assert.equal(a.type, 'social');
  assert.equal(a.price, 12);
  assert.equal(a.marketplace, 'gumroad');
  assert.equal(a.marketplace_id, '987654');
  const b = mp.mapGumroadAnchor({ id: 111, name: 'Mold Inspector / Remediator Spreadsheet Template', price: 1200 });
  assert.equal(b.profession_id, 7);
  assert.equal(b.type, 'spreadsheet');
  const c = mp.mapGumroadAnchor({ id: 222, name: 'Refuge Recovery (Buddhist) Checklist Template' });
  assert.equal(c.profession_id, 23);
  assert.equal(c.type, 'checklist');
  const d = mp.mapGumroadAnchor({ id: 333, name: 'Something Unmapped' });
  assert.equal(d.profession_id, 28);
});
