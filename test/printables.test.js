// Quick runtime check that shipped printable builders produce valid HTML.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const design = require('../server/services/designStudio');
const themes = require('../server/services/themes');
const prof = { name: 'Test Niche', slug: 'test-niche', emoji: '🖼️', tier: 'passion', services: JSON.stringify([['Basic', '$50']]) };
const theme = themes.getTheme('Rose Ember');

for (const [fnName, expected] of [
  ['buildPlannerHTML', 'Weekly Planner'],
  ['buildWallArtHTML', 'Wall Art'],
  ['buildWorksheetHTML', 'Worksheet'],
  ['buildPartyPrintableHTML', 'Party Printables']
]) {
  test(`printable builder ${fnName} emits a full HTML document`, () => {
    const html = design[fnName](prof, theme);
    assert.equal(typeof html, 'string');
    assert.ok(html.length > 200);
    assert.match(html, /<!DOCTYPE html>/i);
    assert.match(html, new RegExp(expected, 'i'));
  });
}