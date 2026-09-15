// Create the "Freelancer's Survival Kit" bundle — all 5 outcome tools in one ZIP
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { db, init } = require('../server/database');
const { ensureProductFile } = require('../server/services/fileFactory');

init();

const SOLO_BUSINESS_ID = 28;
const BUNDLE_NAME = "Freelancer's Survival Kit — 5 Essential Tools";
const BUNDLE_PRICE = '$49';

async function createFreelancerBundle() {
  // Check if bundle already exists
  const existing = db.prepare(`
    SELECT * FROM products 
    WHERE profession_id = ? AND type = 'bundle' AND name LIKE '%Freelancer%'
    LIMIT 1
  `).get(SOLO_BUSINESS_ID);
  
  if (existing) {
    console.log('Bundle already exists:', existing.name, '(id:', existing.id + ')');
    return existing;
  }

  // Find all 5 tool products
  const tools = db.prepare(`
    SELECT * FROM products 
    WHERE profession_id = ? AND type = 'tool' AND status = 'approved'
    ORDER BY id
  `).all(SOLO_BUSINESS_ID);

  if (tools.length < 5) {
    console.error('Expected 5 tools, found:', tools.length);
    process.exit(1);
  }

  console.log('Found', tools.length, 'tools:');
  tools.forEach(t => console.log('  -', t.name));

  // Generate PDFs for each tool
  const pdfPaths = [];
  for (const tool of tools) {
    console.log('Generating PDF for:', tool.name);
    const pdfPath = await ensureProductFile(tool);
    if (!pdfPath || !fs.existsSync(pdfPath)) {
      console.error('Failed to generate PDF for:', tool.name);
      process.exit(1);
    }
    pdfPaths.push(pdfPath);
  }

  // Create ZIP
  const zip = new AdmZip();
  for (const pdfPath of pdfPaths) {
    zip.addLocalFile(pdfPath, '', path.basename(pdfPath));
  }

  const OUTPUT_DIR = path.join(__dirname, '..', 'generated');
  const zipPath = path.join(OUTPUT_DIR, `freelancers-survival-kit-${Date.now()}.zip`);
  zip.writeZip(zipPath);

  console.log('Created ZIP:', zipPath);

  // Create bundle product
  const ins = db.prepare(`
    INSERT INTO products (profession_id, name, type, price, status, theme, html_content, file_path)
    VALUES (?, ?, 'bundle', ?, 'approved', 'Onyx Volt', '<!-- freelancer bundle -->', ?)
  `).run(SOLO_BUSINESS_ID, BUNDLE_NAME, BUNDLE_PRICE, zipPath);

  const bundle = db.prepare('SELECT * FROM products WHERE id = ?').get(ins.lastInsertRowid);
  console.log('Created bundle:', bundle.name, '(id:', bundle.id + ', price:', bundle.price + ')');
  
  return bundle;
}

createFreelancerBundle()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
