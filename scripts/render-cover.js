// Render a single product's thumb-stopper cover for inspection.
// Usage: node scripts/render-cover.js [productId] [--type bundle]
require('dotenv').config();
const { db } = require('../server/database');
const fileFactory = require('../server/services/fileFactory');

(async () => {
  const coverArt = require('../server/services/coverArt');
  console.log('provider:', coverArt.provider());
  const args = process.argv.slice(2);
  const id = parseInt(args[0], 10);
  const typeIdx = args.indexOf('--type');
  const type = typeIdx >= 0 ? args[typeIdx + 1] : null;

  const product = id > 0
    ? db.prepare('SELECT * FROM products WHERE id = ?').get(id)
    : type
      ? db.prepare('SELECT * FROM products WHERE type = ? LIMIT 1').get(type)
      : db.prepare('SELECT * FROM products LIMIT 1').get();

  if (!product) {
    console.log('No matching product.');
    process.exit(0);
  }
  delete product.preview_path;
  console.log(`Rendering cover for #${product.id} ${product.name} (${product.type})…`);
  const out = await fileFactory.ensureProductThumbnail(product);
  console.log(out ? `OK -> ${out}` : 'FAILED (no browser or render error)');
  process.exit(0);
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});