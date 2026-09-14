// Seed the 5 "outcome" tool products into a "Freelance & Solo Business" profession.
const { init } = require('../server/database');
const ts = require('../server/services/toolStudio');

init();
const prof = ts.ensureToolProfession();
const ids = ts.createToolProducts(prof);
console.log('Tool profession:', prof.slug, '(id ' + prof.id + ')');
console.log('Tool products (ids):', ids.join(', '));
console.log('Done —', ids.length, 'tool(s) seeded.');
