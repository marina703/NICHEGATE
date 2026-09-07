const axios = require('axios');

async function sendDiscord(webhookUrl, message) {
  if (!webhookUrl) return;
  try {
    await axios.post(webhookUrl, {
      content: message,
      username: 'NicheGate'
    }, { timeout: 5000 });
  } catch (e) {
    console.error('[NOTIFY] Discord failed:', e.message);
  }
}

async function sendEmail(smtpConfig, to, subject, body) {
  // Placeholder for SMTP integration
  // In production: use nodemailer or SendGrid API
  console.log(`[NOTIFY] Email to ${to}: ${subject}`);
}

function formatAlert(type, data) {
  const templates = {
    review_day: `⏸️ **Review Day** — ${data.count} products awaiting approval. Open the app to review before auto-listing resumes.`,
    trend_detected: `🔥 **Trend Alert** — "${data.name}" detected! Velocity: ${data.velocity}. Window: ~${data.window} days.`,
    product_generated: `🤖 **Products Generated** — ${data.count} new products created across ${data.professions} professions.`,
    auto_listed: `📤 **Auto-Listed** — ${data.count} approved products pushed to marketplace.`,
    error: `❌ **Error** — ${data.message}. Check automation log for details.`,
    sale: `💰 **Sale!** — ${data.product} sold for ${data.price}. Total revenue: ${data.revenue}.`
  };
  return templates[type] || `**Alert**: ${type} — ${JSON.stringify(data)}`;
}

module.exports = { sendDiscord, sendEmail, formatAlert };
