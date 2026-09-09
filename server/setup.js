const { init, db } = require('./database');
init();
const count = db.prepare('SELECT COUNT(*) as c FROM professions').get().c;
console.log(`Database initialized and seeded with ${count} professions.`);
