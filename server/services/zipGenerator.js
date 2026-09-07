const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', '..', 'generated');
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

function createSocialPack(prof, theme) {
  const zip = new AdmZip();
  const hashtags = JSON.parse(prof.hashtags || '[]');
  
  // Generate HTML files for each social asset
  const instagramPost = `<!DOCTYPE html><html><head><style>body{margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:${theme.bg};font-family:${theme.font};}
.card{width:1080px;height:1080px;background:${theme.primary};display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;padding:60px;box-sizing:border-box;text-align:center;}
.emoji{font-size:6rem;margin-bottom:20px;}
h1{font-size:3rem;margin-bottom:16px;}
p{font-size:1.4rem;opacity:0.9;}
.hashtags{font-size:1rem;margin-top:30px;opacity:0.7;}</style></head><body>
<div class="card"><div class="emoji">${prof.emoji}</div><h1>${prof.name}</h1><p>Professional services you can trust</p><div class="hashtags">${hashtags.slice(0,5).join(' ')}</div></div>
</body></html>`;

  const story = `<!DOCTYPE html><html><head><style>body{margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:${theme.bg};font-family:${theme.font};}
.story{width:1080px;height:1920px;background:linear-gradient(135deg,${theme.primary},${theme.secondary});display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;padding:80px;box-sizing:border-box;text-align:center;}
.emoji{font-size:8rem;margin-bottom:40px;}
h1{font-size:4rem;margin-bottom:30px;}
.cta{font-size:1.8rem;background:${theme.accent};color:${theme.primary};padding:20px 40px;border-radius:50px;margin-top:40px;font-weight:700;}</style></head><body>
<div class="story"><div class="emoji">${prof.emoji}</div><h1>${prof.name}</h1><div class="cta">Book Now</div></div>
</body></html>`;

  zip.addFile('instagram-post.html', Buffer.from(instagramPost, 'utf8'));
  zip.addFile('instagram-story.html', Buffer.from(story, 'utf8'));
  zip.addFile('hashtags.txt', Buffer.from(hashtags.join('\n'), 'utf8'));
  
  // Unique filename per generation so products with different themes don't share a file
  const outputPath = path.join(OUTPUT_DIR, `${prof.slug}-social-pack-${Date.now()}.zip`);
  zip.writeZip(outputPath);
  return outputPath;
}

module.exports = { createZip, createSocialPack, OUTPUT_DIR };
