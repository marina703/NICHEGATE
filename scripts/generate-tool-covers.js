// Generate cover images for the 5 outcome tools
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { db, init } = require('../server/database');

init();

const COVERS_DIR = path.join(__dirname, '..', 'covers');

const TOOL_COVERS = [
  { id: 937, name: 'The F-U Quote', color: '#ef4444', icon: '💰' },
  { id: 938, name: 'Red Flag Radar', color: '#f59e0b', icon: '🚩' },
  { id: 939, name: 'The No That Pays', color: '#8b5cf6', icon: '🚫' },
  { id: 940, name: 'The Price Autopsy', color: '#06b6d4', icon: '🔍' },
  { id: 941, name: 'Subscription Slaughter', color: '#10b981', icon: '✂️' }
];

function findChrome() {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  
  // Check Puppeteer cache first
  const cacheRoot = process.env.PUPPETEER_CACHE_DIR || path.join(os.homedir(), '.cache', 'puppeteer');
  const chromeRoot = path.join(cacheRoot, 'chrome');
  if (fs.existsSync(chromeRoot)) {
    for (const dir of fs.readdirSync(chromeRoot)) {
      const exe = path.join(chromeRoot, dir, 'chrome-win64', 'chrome.exe');
      if (fs.existsSync(exe)) return exe;
    }
  }
  
  // Check system locations
  const locations = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ];
  
  for (const loc of locations) {
    if (fs.existsSync(loc)) return loc;
  }
  
  return null;
}

async function generateToolCover(tool) {
  const executablePath = findChrome();
  const launchOptions = { headless: 'new' };
  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }
  
  const browser = await puppeteer.launch(launchOptions);
  const page = await browser.newPage();
  
  await page.setViewport({ width: 1200, height: 1200 });
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          width: 1200px;
          height: 1200px;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: linear-gradient(135deg, ${tool.color} 0%, ${tool.color}dd 100%);
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          color: white;
          text-align: center;
          padding: 80px;
        }
        .icon {
          font-size: 200px;
          margin-bottom: 60px;
          filter: drop-shadow(0 10px 30px rgba(0,0,0,0.3));
        }
        .title {
          font-size: 96px;
          font-weight: 900;
          line-height: 1.1;
          margin-bottom: 40px;
          text-shadow: 0 4px 20px rgba(0,0,0,0.2);
        }
        .subtitle {
          font-size: 42px;
          font-weight: 600;
          opacity: 0.95;
          max-width: 900px;
        }
        .badge {
          position: absolute;
          top: 60px;
          right: 60px;
          background: rgba(255,255,255,0.2);
          backdrop-filter: blur(10px);
          padding: 20px 40px;
          border-radius: 100px;
          font-size: 32px;
          font-weight: 700;
        }
      </style>
    </head>
    <body>
      <div class="badge">FREELANCER'S TOOLKIT</div>
      <div class="icon">${tool.icon}</div>
      <div class="title">${tool.name}</div>
      <div class="subtitle">Essential Business Framework</div>
    </body>
    </html>
  `;
  
  await page.setContent(html);
  const coverPath = path.join(COVERS_DIR, `tool-${tool.id}-cover.png`);
  await page.screenshot({ path: coverPath, type: 'png' });
  
  await browser.close();
  return coverPath;
}

async function main() {
  console.log('Generating cover images for tools...');
  
  for (const tool of TOOL_COVERS) {
    console.log(`Generating cover for: ${tool.name}`);
    const coverPath = await generateToolCover(tool);
    console.log(`  Created: ${coverPath}`);
    
    // Update product with cover path
    db.prepare('UPDATE products SET preview_path = ? WHERE id = ?').run(coverPath, tool.id);
  }
  
  console.log('Done! All tool covers generated.');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
