const axios = require('axios');
const nodemailer = require('nodemailer');

async function sendDiscord(webhookUrl, message) {
  if (!webhookUrl) return false;
  try {
    await axios.post(webhookUrl, {
      content: message,
      username: 'NicheGate'
    }, { timeout: 5000 });
    return true;
  } catch (e) {
    // Axios includes the full webhook URL (including its secret token) in some
    // error messages. Never log the raw error or webhook URL.
    const status = e.response && e.response.status;
    console.error('[NOTIFY] Discord failed' + (status ? ` (HTTP ${status})` : ' (network/timeout)'));
    return false;
  }
}

// Email is off unless SMTP_USER, SMTP_PASS and ALERT_EMAIL_TO are all set. The
// default host is Google Workspace (smtp.gmail.com); SMTP_PASS is a Workspace
// app password, never the account password.
function emailConfig(env = process.env) {
  const user = env.SMTP_USER;
  const pass = env.SMTP_PASS;
  const to = env.ALERT_EMAIL_TO;
  if (!user || !pass || !to) return null;
  const port = Number(env.SMTP_PORT) || 587;
  return {
    host: env.SMTP_HOST || 'smtp.gmail.com',
    port,
    secure: port === 465,
    auth: { user, pass },
    from: env.SMTP_FROM || user,
    to
  };
}

async function sendEmail(config, subject, body) {
  if (!config) return false;
  try {
    const transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth
    });
    await transport.sendMail({ from: config.from, to: config.to, subject, text: body });
    return true;
  } catch (e) {
    // Log only transport codes: SMTP error text can echo credentials.
    console.error('[NOTIFY] Email failed' + (e.code ? ` (${e.code})` : ''));
    return false;
  }
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

// Mirror one alert to email. Returns false (no network) when SMTP is not configured.
async function sendAlertEmail(type, data, config = emailConfig()) {
  if (!config) return false;
  const subject = `NicheGate · ${type.replace(/_/g, ' ')}`;
  const body = formatAlert(type, data).replace(/\*\*/g, '');
  return sendEmail(config, subject, body);
}

// Discord is the primary channel; email carries the same alert when configured.
// Resolves to the Discord delivery result.
async function sendAlert(webhookUrl, type, data) {
  const [discord] = await Promise.all([
    sendDiscord(webhookUrl, formatAlert(type, data)),
    sendAlertEmail(type, data)
  ]);
  return discord;
}

module.exports = { sendDiscord, sendEmail, emailConfig, sendAlertEmail, sendAlert, formatAlert };
