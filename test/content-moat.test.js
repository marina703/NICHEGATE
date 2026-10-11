'use strict';
// Content moat (2026-10-11): trade-true, service-keyed deliverable content.
// The NO-FILLER RULE is pinned here: every checklist group must resolve its own
// distinct procedure rows — the old hardcoded routine ("Arrive prepared…")
// appears only when the library has nothing, and for moat niches it must NEVER
// appear. Covered end-to-end: library resolution + checklist HTML + social posts.
const test = require('node:test');
const assert = require('node:assert/strict');

const lib = require('../server/services/contentLibrary');
const ds = require('../server/services/designStudio');

const THEME = { name: 'test', primary: '#111111', secondary: '#222222', accent: '#333333', bg: '#ffffff', font: 'sans-serif' };

// The real service groups of the ten live Gumroad professions — the moat is
// keyed to these exact section titles.
const LIVE = [
  { name: 'Appliance Repair', services: [['Diagnostic Fee', '$89'], ['Refrigerator Repair', '$250'], ['Washer/Dryer Repair', '$200'], ['Dishwasher Repair', '$180'], ['Oven Repair', '$220'], ['Microwave Repair', '$150']] },
  { name: 'HVAC Technician', services: [['AC Tune-up', '$99'], ['Furnace Inspection', '$99'], ['Emergency Repair', '$250+'], ['System Install', '$4500'], ['Duct Cleaning', '$350'], ['Maintenance Plan', '$200/yr']] },
  { name: 'Roofing Contractor', services: [['Roof Inspection', '$150'], ['Roof Repair', '$500+'], ['Full Replacement', '$8000+'], ['Gutter Install', '$1200'], ['Skylight Install', '$800'], ['Storm Damage Assessment', '$200']] },
  { name: 'Air Duct Cleaning', services: [['Standard Duct Cleaning', '$350'], ['Deep Clean + Sanitize', '$550'], ['Dryer Vent Cleaning', '$150'], ['HVAC System Clean', '$450'], ['Mold Remediation', '$800'], ['Annual Maintenance', '$200']] },
  { name: 'Mold Inspector / Remediator', services: [['Air Quality Test', '$200'], ['Surface Sampling', '$150'], ['Remediation Plan', '$500'], ['Post-Remediation', '$175'], ['Moisture Mapping', '$250'], ['Full Inspection', '$400']] },
  { name: 'Home Energy Auditor', services: [['Basic Energy Audit', '$250'], ['HERS Rating', '$600'], ['Blower Door Test', '$300'], ['Duct Leakage Test', '$250'], ['Infrared Scan', '$200'], ['Rebate Consult', '$150']] },
  { name: 'Beekeeping / Apiary', services: [['Hive Inspection', '$50'], ['Colony Assessment', '$100'], ['Swarm Removal', '$200'], ['Honey Extraction', '$150'], ['Queen Rearing Consult', '$250'], ['Beekeeper Training', '$100/hr']] },
  { name: 'SMART Recovery (CBT)', services: [['ABC Worksheet (CBT)', '$12'], ['Cost-Benefit Analysis', '$10'], ['Urge Log / Trigger Tracker', '$12'], ['Hierarchy of Values', '$10'], ['Change Plan Worksheet', '$12'], ['Complete SMART Toolkit', '$35']] },
  { name: 'Refuge Recovery (Buddhist)', services: [['Meditation Log & Guide', '$14'], ['Dharma Study Workbook', '$15'], ['Mindfulness Tracker', '$12'], ['Inventory of Suffering Guide', '$15'], ['Daily Practice Planner', '$12'], ['Complete Refuge Toolkit', '$39']] },
  { name: 'AA / 12-Step Recovery', services: [['4th Step Inventory Guide', '$12'], ['Daily Reflection Journal', '$15'], ['Meeting Attendance Tracker', '$8'], ['Sobriety Milestone Planner', '$19'], ['10th Step Daily Inventory', '$10'], ['Complete 12-Step Workbook', '$39']] }
];

const prof = (n) => ({ name: n.name, services: JSON.stringify(n.services), hashtags: '[]', emoji: '✦' });

// The generic filler this whole moat exists to eliminate.
const SENTINELS = ['Arrive prepared', 'Confirm scope, date', 'Complete "', 'Collect payment, send the receipt'];

// ── resolution: every group gets its own trade-true rows ─────────────────

test('moat: every live service group resolves >=5 distinct rows', () => {
  for (const n of LIVE) {
    const p = prof(n);
    n.services.forEach(([title], g) => {
      const rows = lib.checklistRowsFor(p, title, g, 5);
      assert.ok(rows && rows.length >= 5, `${n.name} / "${title}" needs 5+ rows, got ${rows && rows.length}`);
      assert.equal(new Set(rows).size, rows.length, `${n.name} / "${title}" rows must be distinct`);
    });
  }
});

test('moat: NO-FILLER GATE — groups within one product never share rows', () => {
  for (const n of LIVE) {
    const p = prof(n);
    const seen = new Map();
    n.services.forEach(([title], g) => {
      const rows = lib.checklistRowsFor(p, title, g, 5);
      for (const r of rows) {
        assert.ok(!seen.has(r), `${n.name}: row shared between "${seen.get(r)}" and "${title}" — filler detected: ${r}`);
        seen.set(r, title);
      }
    });
  }
});

test('moat: filler sentinel rows never appear when the moat answers', () => {
  for (const n of LIVE) {
    const p = prof(n);
    n.services.forEach(([title], g) => {
      const rows = lib.checklistRowsFor(p, title, g, 5).join('\n');
      for (const s of SENTINELS) {
        assert.ok(!rows.includes(s), `${n.name} / "${title}" still ships filler: "${s}"`);
      }
    });
  }
});

// ── correct routing: group titles land on the right procedures ───────────

test('moat: service-keyed routing avoids substring collisions', () => {
  const appliance = prof(LIVE[0]);
  const dishwasher = lib.checklistRowsFor(appliance, 'Dishwasher Repair', 3, 5).join('\n');
  assert.ok(dishwasher.includes('spray arms'), 'dishwasher group gets dishwasher rows');
  assert.ok(!dishwasher.includes('dryer'), 'dishwasher must NOT get washer/dryer rows');

  const hvac = prof(LIVE[1]);
  const furnace = lib.checklistRowsFor(hvac, 'Furnace Inspection', 1, 5).join('\n');
  assert.ok(furnace.includes('heat exchanger'), 'furnace group gets combustion rows');
  assert.ok(!furnace.includes('superheat'), 'furnace must NOT get AC charge rows');

  const aa = prof(LIVE[9]);
  const daily = lib.checklistRowsFor(aa, '10th Step Daily Inventory', 4, 5).join('\n');
  assert.ok(daily.includes('Review the day'), '10th-step group gets daily inventory rows');
  assert.ok(!daily.includes('List the resentments'), '10th-step must NOT get 4th-step rows');

  const smart = prof(LIVE[7]);
  const changePlan = lib.checklistRowsFor(smart, 'Change Plan Worksheet', 4, 5).join('\n');
  assert.ok(changePlan.includes('change goal'), 'change-plan group gets plan rows');
  assert.ok(!changePlan.includes('Activating'), 'change-plan must NOT get ABC rows');
});

// ── social angles ────────────────────────────────────────────────────────

test('moat: social packs get distinct trade-true angles per variant', () => {
  for (const name of ['HVAC Technician', 'Air Duct Cleaning', 'Beekeeping / Apiary']) {
    const p = prof(LIVE.find(n => n.name === name));
    const hooks = [];
    for (let v = 0; v < 4; v++) {
      const a = lib.socialAngleFor(p, v);
      assert.ok(a && a.hook && a.sub && a.cta, `${name} variant ${v} needs a real angle`);
      hooks.push(a.hook);
    }
    assert.equal(new Set(hooks).size, 4, `${name}: 4 posts must not repeat angles`);
    assert.ok(!hooks.includes('Professional service, every single week.'), 'generic phrase must be gone');
  }
});

test('moat: niches without social angles return null (builder falls back safely)', () => {
  assert.equal(lib.socialAngleFor(prof(LIVE[9]), 0), null); // AA
  assert.equal(lib.socialAngleFor({ name: 'Totamente Oficioso' }, 0), null); // unknown
});

// ── builder end-to-end: the render actually carries the moat ─────────────

test('moat: checklist HTML renders trade-true rows, no filler, distinct groups', () => {
  const html = ds.buildChecklistHTML(prof(LIVE[0]), THEME);
  assert.ok(html.includes('rating plate'), 'appliance checklist shows real diagnostic steps');
  assert.ok(html.includes('spray arms'), '…and real dishwasher steps');
  for (const s of SENTINELS) assert.ok(!html.includes(s), `render still contains filler: "${s}"`);
});

test('moat: social post HTML renders moat angles, not the generic phrase', () => {
  const html = ds.buildSocialPostHTML(prof(LIVE[1]), THEME, 0);
  assert.ok(html.includes('short-cycles') || html.includes('tune-up'), 'hvac post carries a real angle');
  assert.ok(!html.includes('Professional service, every single week.'), 'generic phrase must not render');
});

// ── fallback ladder: never throws, never empty ───────────────────────────

test('moat: unknown professions fall back to category content without throwing', () => {
  const p = { name: 'Generic Business Coach', services: '[]', hashtags: '[]' };
  const rows = lib.checklistRowsFor(p, 'Consulting Session', 0, 5);
  assert.ok(rows === null || (Array.isArray(rows) && rows.length > 0), 'fallback returns rows or null');
  assert.doesNotThrow(() => ds.buildChecklistHTML(p, THEME));
  assert.doesNotThrow(() => ds.buildSocialPostHTML(p, THEME, 2));
});
