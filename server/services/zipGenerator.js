const AdmZip = require('adm-zip');
const fs = require('fs');
const os = require('os');
const path = require('path');
const runtimeConfig = require('./runtimeConfig');

const OUTPUT_DIR = runtimeConfig.resolvePersistentDir('generated');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function createZip(files, filename) {
  const zip = new AdmZip();
  files.forEach(f => {
    if (fs.existsSync(f.path)) {
      zip.addLocalFile(f.path, '', f.name || path.basename(f.path));
    }
  });
  const outputPath = path.join(OUTPUT_DIR, filename);
  zip.writeZip(outputPath);
  return outputPath;
}

const ds = require('./designStudio');

function buildSocialPostHTML(prof, theme, variant) { return ds.buildSocialPostHTML(prof, theme, variant || 0); }
function buildSocialStoryHTML(prof, theme) { return ds.buildSocialStoryHTML(prof, theme); }
function buildSocialCarouselHTML(prof, theme) { return ds.buildSocialCarouselHTML(prof, theme); }

// Rasterize a social post's HTML to a ready-to-post PNG (2x retina). Best-effort:
// returns null (HTML-only fallback) when Puppeteer/Chrome is unavailable.
async function renderSocialImage(html, width, height, outPath) {
  const pdfGen = require('./pdfGenerator');
  const browser = await pdfGen.getBrowser().catch(() => null);
  if (!browser) return null;
  const page = await browser.newPage();
  try {
    await page.setViewport({ width, height, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 200));
    await page.screenshot({ path: outPath, type: 'png' });
    return fs.existsSync(outPath) ? outPath : null;
  } catch (e) {
    console.error('[SOCIAL] render failed:', e.message);
    return null;
  } finally {
    await page.close().catch(() => {});
  }
}

async function createSocialPack(prof, theme) {
  const zip = new AdmZip();
  const hashtags = JSON.parse(prof.hashtags || '[]');
  const readme = `INSTANT-USE SOCIAL KIT — ${prof.name}
=========================================
What's inside (PNG ready-to-post + editable HTML):
  01 instagram-post-1.png/html   (1080x1080 quote card — main post)
  02 instagram-post-2.png/html   (1080x1080 service teaser — alternate)
  03 instagram-story.png/html    (1080x1920 full-bleed story)
  04 instagram-carousel.png/html (1080x1080 "3 quick wins" swipe slide)
  05 hashtags.txt                (copy-paste ready)

How to use:
  1. Post the .png files directly (rendered 2x for crisp uploads).
  2. Or open the matching .html in a browser to tweak and re-export.
  3. Swap in your own logo photo in the mark square before posting.
`;

  const posts = [
    { html: buildSocialPostHTML(prof, theme, 0), w: 1080, h: 1080, pngName: '01-instagram-post-1.png', htmlName: '01-instagram-post-1.html' },
    { html: buildSocialPostHTML(prof, theme, 1), w: 1080, h: 1080, pngName: '02-instagram-post-2.png', htmlName: '02-instagram-post-2.html' },
    { html: buildSocialStoryHTML(prof, theme), w: 1080, h: 1920, pngName: '03-instagram-story.png', htmlName: '03-instagram-story.html' },
    { html: buildSocialCarouselHTML(prof, theme), w: 1080, h: 1080, pngName: '04-instagram-carousel.png', htmlName: '04-instagram-carousel.html' }
  ];

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ng-social-'));
  try {
    for (const post of posts) {
      const png = await renderSocialImage(post.html, post.w, post.h, path.join(tmpDir, post.pngName));
      if (png) zip.addLocalFile(png, '', post.pngName);
      zip.addFile(post.htmlName, Buffer.from(post.html, 'utf8'));
    }
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }

  zip.addFile('05-hashtags.txt', Buffer.from(hashtags.join('\n'), 'utf8'));
  zip.addFile('readme.txt', Buffer.from(readme, 'utf8'));

  // Unique filename per generation so products with different themes don't share a file
  const outputPath = path.join(OUTPUT_DIR, `${prof.slug}-social-pack-${Date.now()}.zip`);
  zip.writeZip(outputPath);
  return outputPath;
}

module.exports = { createZip, createSocialPack, buildSocialPostHTML, buildSocialStoryHTML, buildSocialCarouselHTML, OUTPUT_DIR };
