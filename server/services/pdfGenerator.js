const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const runtimeConfig = require('./runtimeConfig');

const OUTPUT_DIR = runtimeConfig.resolvePersistentDir('generated');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

let browserPromise = null;
let shuttingDown = false;

function findInstalledChrome() {
  const candidates = [];
  try {
    const os = require('os');
    const cacheRoot = process.env.PUPPETEER_CACHE_DIR || path.join(os.homedir(), '.cache', 'puppeteer');
    const chromeRoot = path.join(cacheRoot, 'chrome');
    for (const dir of fs.readdirSync(chromeRoot)) {
      const exe = path.join(chromeRoot, dir, 'chrome-win64', 'chrome.exe');
      if (fs.existsSync(exe)) candidates.push(exe);
    }
  } catch { /* cache scan best-effort */ }
  for (const exe of [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
  ]) {
    if (fs.existsSync(exe)) candidates.push(exe);
  }
  return candidates.sort().pop();
}

function attachBrowserGuards(browser) {
  browser.on('disconnected', () => {
    console.error('[PDF] browser disconnected - will relaunch on next request');
    browserPromise = null;
  });
  return browser;
}

async function launchBrowser() {
  const args = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'];
  try {
    return attachBrowserGuards(await puppeteer.launch({ headless: 'new', args }));
  } catch (err) {
    const exe = findInstalledChrome();
    if (!exe) throw err;
    console.error('[PDF] puppeteer default launch failed - using local Chrome:', exe);
    return attachBrowserGuards(await puppeteer.launch({ headless: 'new', executablePath: exe, args }));
  }
}

async function getBrowser() {
  if (shuttingDown) throw new Error('PDF browser is shutting down');
  if (!browserPromise) {
    browserPromise = launchBrowser().catch((err) => {
      browserPromise = null;
      throw err;
    });
  }
  const browser = await browserPromise;
  if (!browser || !browser.connected) {
    browserPromise = launchBrowser();
    return browserPromise;
  }
  return browser;
}

async function generatePDF(htmlContent, filename) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    page.setDefaultTimeout(30000);
    await page.setContent(htmlContent, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const outputPath = path.join(OUTPUT_DIR, filename);
    await page.pdf({
      path: outputPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' }
    });
    return outputPath;
  } finally {
    await page.close().catch(() => {});
  }
}

async function closeBrowser() {
  shuttingDown = true;
  const pending = browserPromise;
  browserPromise = null;
  if (!pending) return;
  try {
    const b = await pending.catch(() => null);
    if (b) await b.close().catch(() => {});
  } catch { /* ignore */ }
}

function installShutdownHooks() {
  const handler = () => { closeBrowser().finally(() => {}); };
  process.once('SIGINT', handler);
  process.once('SIGTERM', handler);
  process.once('beforeExit', handler);
}
installShutdownHooks();

const ds = require('./designStudio');
function buildInvoiceHTML(prof, theme, opts) { return ds.buildInvoiceHTML(prof, theme, opts); }
function buildChecklistHTML(prof, theme) { return ds.buildChecklistHTML(prof, theme); }
function buildJournalHTML(prof, theme, prompts) { return ds.buildJournalHTML(prof, theme, prompts); }
function buildBrandKitHTML(prof, theme) { return ds.buildBrandKitHTML(prof, theme); }
function buildPlannerHTML(prof, theme) { return ds.buildPlannerHTML(prof, theme); }
function buildWallArtHTML(prof, theme) { return ds.buildWallArtHTML(prof, theme); }
function buildWorksheetHTML(prof, theme) { return ds.buildWorksheetHTML(prof, theme); }
function buildPartyPrintableHTML(prof, theme) { return ds.buildPartyPrintableHTML(prof, theme); }
function buildPyroBatchHTML(prof, theme) { return ds.buildPyroBatchHTML(prof, theme); }
function buildPyroLiftFuseHTML(prof, theme) { return ds.buildPyroLiftFuseHTML(prof, theme); }
function buildPyroShootLogHTML(prof, theme) { return ds.buildPyroShootLogHTML(prof, theme); }

module.exports = {
  generatePDF,
  getBrowser,
  closeBrowser,
  buildInvoiceHTML,
  buildChecklistHTML,
  buildJournalHTML,
  buildBrandKitHTML,
  buildPlannerHTML,
  buildWallArtHTML,
  buildWorksheetHTML,
  buildPartyPrintableHTML,
  buildPyroBatchHTML,
  buildPyroLiftFuseHTML,
  buildPyroShootLogHTML,
  OUTPUT_DIR
};
