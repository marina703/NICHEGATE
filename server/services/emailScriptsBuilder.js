var ds = require("./designStudio"); var shell = ds.shell; var shellDNA = ds.shellDNA; var esc = ds.esc;

function buildEmailScriptsHTML(prof, theme, opts) {
  var _sh = (theme && theme.dna) ? shellDNA : shell;
  var niche = prof.name || 'Small Business';
  var emoji = prof.emoji || '\u2709\uFE0F';
  var year = new Date().getFullYear();
  var services = (prof.services || '').match(/\[\[.*?\]\]/g) || [];
  var parsed = services.map(function(s) { try { return JSON.parse(s); } catch(e) { return null; } }).filter(Boolean).flat();
  var svc = parsed.length ? parsed[0][0] : 'service';
  var price = parsed.length && parsed[0][1] ? parsed[0][1] : '$150';
  var n = niche.toLowerCase();

  var emails = generateEmailScripts(prof);

  var css = '.cover{height:1123px;background:' + theme.primary + ';color:#fff;padding:80px 60px;display:flex;flex-direction:column;justify-content:space-between}'
    + '.cover h1{font-size:2.6rem;font-weight:900;line-height:1.1;margin:20px 0 10px}'
    + '.cover .sub{font-size:1rem;opacity:0.8;max-width:460px;line-height:1.5}'
    + '.toc{padding:50px 60px}.toc h2{font-size:1.6rem;font-weight:900;margin-bottom:20px}'
    + '.email-section{page-break-before:always;padding:50px 60px}'
    + '.email-card{background:#fff;border:1px solid #e8ecf2;border-radius:12px;padding:20px;margin-bottom:16px}'
    + '.email-card .email-subject{font-size:0.95rem;font-weight:800;margin-bottom:10px}'
    + '.email-card .email-body{font-size:0.82rem;line-height:1.65;white-space:pre-line;background:#f8fafc;border-radius:8px;padding:14px 16px;border-left:3px solid ' + theme.accent + '}'
    + '.email-card .email-tip{font-size:0.76rem;color:#64748b;margin-top:8px;font-style:italic}'
    + '.placeholder{color:' + theme.accent + ';font-weight:700}';

  var catLabels = {booking:'First Contact & Booking', service:'During Service', followup:'Follow-Up & Reviews', retention:'Retention & Referrals'};
  var cats = ['booking','service','followup','retention'];

  var body = '<div class="page" style="padding:0"><div class="cover">'
    + '<h1>' + esc(niche) + '<br>Client Email Scripts</h1>'
    + '<div class="sub">30 ready-to-send email templates for every stage of the client lifecycle.</div>'
    + '</div></div>';

  // TOC
  body += '<div class="page toc"><h2>Contents</h2>';
  cats.forEach(function(cat) {
    body += '<div style="font-size:0.72rem;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:' + theme.accent + ';margin:16px 0 8px">' + catLabels[cat] + '</div>';
    emails.filter(function(e) { return e.category === cat; }).forEach(function(e, i) {
      body += '<div style="padding:6px 0;font-size:0.84rem;border-bottom:1px dashed #e8ecf2">' + (i+1) + '. ' + esc(e.title) + '</div>';
    });
  });
  body += '</div>';

  // Email sections
  cats.forEach(function(cat) {
    var catEmails = emails.filter(function(e) { return e.category === cat; });
    body += '<div class="page email-section"><div style="font-size:0.7rem;font-weight:800;letter-spacing:3px;text-transform:uppercase;color:' + theme.accent + ';margin-bottom:6px">' + catLabels[cat] + '</div>'
      + '<h2 style="font-size:1.4rem;font-weight:900;margin-bottom:20px">' + catLabels[cat] + '</h2>';
    catEmails.forEach(function(e, i) {
      var bodyText = e.body.replace(/\[([\w\s]+)\]/g, '<span class="placeholder">[$1]</span>');
      body += '<div class="email-card">'
        + '<div style="font-size:0.66rem;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:' + theme.accent + ';margin-bottom:4px">Email ' + (i+1) + '</div>'
        + '<div class="email-subject">' + esc(e.title) + '</div>'
        + '<div class="email-body">' + bodyText + '</div>'
        + (e.tip ? '<div class="email-tip">' + esc(e.tip) + '</div>' : '')
        + '</div>';
    });
    body += '</div>';
  });

  // Final page
  body += '<div class="page" style="page-break-before:always;padding:80px 60px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;background:' + theme.primary + ';color:#fff;min-height:1050px">'
    + '<div style="font-size:3rem;margin-bottom:20px">' + emoji + '</div>'
    + '<h2 style="font-size:2rem;font-weight:900;margin-bottom:16px">Never Stare at a Blank Inbox Again</h2>'
    + '<p style="font-size:1rem;opacity:0.8;max-width:400px;line-height:1.6">30 templates. Every situation covered.</p>'
    + '</div>';

  return _sh(niche + ' - Client Email Scripts ' + year, css, body, theme);
}


function generateEmailScripts(prof) {
  var niche = prof.name || 'Small Business';
  var n = niche.toLowerCase();
  var services = (prof.services || '').match(/\[\[.*?\]\]/g) || [];
  var parsed = services.map(function(s) { try { return JSON.parse(s); } catch(e) { return null; } }).filter(Boolean).flat();
  var svc = parsed.length ? parsed[0][0] : 'service';
  var price = parsed.length && parsed[0][1] ? parsed[0][1] : '$150';

  return [
    {category:'booking', title:'Initial Inquiry Response',
     body:'Hi [Client Name],\n\nThank you for reaching out about your ' + n + ' needs! I would love to help.\n\nHere is what I can do for you:\n- [Service 1]\n- [Service 2]\n- [Service 3]\n\nMy rates start at ' + price + ' for [basic package].\n\nWould you like to schedule a quick call?\n\nBest,\n[Your Name]',
     tip:'Respond within 1 hour. Speed wins clients.'},

    {category:'booking', title:'Follow-Up After No Response',
     body:'Hi [Client Name],\n\nJust checking in on my previous email about your ' + n + ' project.\n\nI still have [Date] available. Would that work?\n\nBest,\n[Your Name]',
     tip:'Only send one follow-up.'},

    {category:'booking', title:'Booking Confirmation',
     body:'Hi [Client Name],\n\nYour ' + svc + ' is confirmed!\n\nDate: [Date]\nTime: [Time]\nTotal: [Price]\n\nPlease reply to confirm.\n\nBest,\n[Your Name]',
     tip:'Send immediately after booking.'},

    {category:'booking', title:'Reminder Email (24 Hours Before)',
     body:'Hi [Client Name],\n\nFriendly reminder: your ' + svc + ' is tomorrow at [Time].\n\nQuick checklist:\n- [Preparation step]\n- [Access details]\n\nSee you tomorrow!\n\nBest,\n[Your Name]',
     tip:'Reduces no-shows by 40%.'},

    {category:'booking', title:'Quote / Proposal Email',
     body:'Hi [Client Name],\n\nHere is my proposal:\n\nScope: [Description]\nInvestment: ' + price + '\nTimeline: [Duration]\n\nTo move forward, reply "Lets do it" and I will send confirmation.\n\nBest,\n[Your Name]',
     tip:'Use "investment" not "cost".'},

    {category:'booking', title:'Deposit / Payment Request',
     body:'Hi [Client Name],\n\nTo secure your booking, I need a [amount] deposit.\n\nPayment: [Methods]\n\nRemaining balance due upon completion.\n\nBest,\n[Your Name]',
     tip:'Always collect a deposit before starting.'},

    {category:'booking', title:'Rescheduling Request',
     body:'Hi [Client Name],\n\nI need to reschedule from [Original Date] to [New Date].\n\nApologies for the inconvenience. Does the new date work?\n\nBest,\n[Your Name]',
     tip:'Always offer a specific alternative.'},

    {category:'service', title:'Day-Of Arrival Notification',
     body:'Hi [Client Name],\n\nOn my way! Arriving at [Time].\n\nSee you shortly.\n\nBest,\n[Your Name]',
     tip:'Short and professional.'},

    {category:'service', title:'Mid-Service Update',
     body:'Hi [Client Name],\n\nQuick update: everything is going great with your ' + svc + '. On track for [Date] delivery.\n\nBest,\n[Your Name]',
     tip:'Proactive communication builds trust.'},

    {category:'service', title:'Scope Change Notification',
     body:'Hi [Client Name],\n\nI discovered [issue] during your ' + svc + '. Options:\n\n1. [Option A] - [Price]\n2. [Option B] - [Price]\n\nI recommend Option [X]. Let me know.\n\nBest,\n[Your Name]',
     tip:'Present options, not just problems.'},

    {category:'service', title:'Completion Notification',
     body:'Hi [Client Name],\n\nYour ' + svc + ' is complete!\n\nDeliverables:\n- [Item 1]\n- [Item 2]\n\nPlease review and let me know.\n\nBest,\n[Your Name]',
     tip:'Attach photos when possible.'},

    {category:'service', title:'Invoice Attached',
     body:'Hi [Client Name],\n\nPlease find your invoice for the ' + svc + '.\n\nTotal: [Price]\nDue: [Date]\nPay via: [Link]\n\nThank you!\n\nBest,\n[Your Name]',
     tip:'Send invoice within 24 hours.'},

    {category:'followup', title:'Thank You (Same Day)',
     body:'Hi [Client Name],\n\nThank you for choosing me for your ' + svc + '! It was a pleasure.\n\nIf you have questions, reach out anytime.\n\nBest,\n[Your Name]',
     tip:'Send within 2 hours of completion.'},

    {category:'followup', title:'Review Request (Day 3)',
     body:'Hi [Client Name],\n\nI hope you are enjoying the results!\n\nIf you have a moment, a quick review would mean the world: [Link]\n\nThank you!\n\nBest,\n[Your Name]',
     tip:'Day 3 is the sweet spot.'},

    {category:'followup', title:'Review Request Follow-Up (Day 7)',
     body:'Hi [Client Name],\n\nGentle follow-up on my review request. No worries if busy!\n\n[Link]\n\nBest,\n[Your Name]',
     tip:'Only follow up once more.'},

    {category:'followup', title:'How Is Everything? (Day 7)',
     body:'Hi [Client Name],\n\nIt has been a week since your ' + svc + '. How is everything?\n\nHappy to help with any questions.\n\nBest,\n[Your Name]',
     tip:'Catches problems early.'},

    {category:'followup', title:'Satisfaction Survey',
     body:'Hi [Client Name],\n\n3 quick questions:\n1. Rate your experience (1-10)?\n2. What did you like most?\n3. What could I improve?\n\nJust reply with answers.\n\nBest,\n[Your Name]',
     tip:'Private feedback is gold.'},

    {category:'followup', title:'Addressing a Negative Experience',
     body:'Hi [Client Name],\n\nI am sorry your experience did not meet expectations.\n\nI would like to make this right:\n1. [Solution A]\n2. [Solution B]\n3. [Solution C]\n\nPlease let me know.\n\nSincerely,\n[Your Name]',
     tip:'Lead with empathy. Never get defensive.'},

    {category:'followup', title:'Post-Service Maintenance Reminder',
     body:'Hi [Client Name],\n\nIt has been [30/60/90] days. For best results, I recommend [maintenance step].\n\nWant to schedule your next appointment?\n\nBest,\n[Your Name]',
     tip:'Recurring maintenance is most profitable.'},

    {category:'followup', title:'Seasonal Check-In',
     body:'Hi [Client Name],\n\n[Season] is here! Perfect time to [seasonal action].\n\nWould you like to schedule?\n\nBest,\n[Your Name]',
     tip:'Seasonal emails have 2x higher open rates.'},

    {category:'followup', title:'Problem Resolution Follow-Up',
     body:'Hi [Client Name],\n\nFollowing up on [the issue]. Has everything been resolved?\n\nYour satisfaction is my priority.\n\nBest,\n[Your Name]',
     tip:'Always close the loop on complaints.'},

    {category:'retention', title:'Referral Request',
     body:'Hi [Client Name],\n\nI am growing through word of mouth.\n\nIf you know anyone who could use ' + svc + ', I would love the introduction. As a thank you: [incentive].\n\nBest,\n[Your Name]',
     tip:'Referral incentives work best when mutual.'},

    {category:'retention', title:'Upsell / Add-On Offer',
     body:'Hi [Client Name],\n\nYour ' + svc + ' is complete! Related service: [Add-On] at [Price].\n\nReturning client rate: [discount].\n\nInterested? Just reply.\n\nBest,\n[Your Name]',
     tip:'Upselling existing clients costs 5x less.'},

    {category:'retention', title:'Reactivation (90 Days)',
     body:'Hi [Client Name],\n\nIt has been a while! I would like to offer [special offer].\n\nJust reply to schedule.\n\nBest,\n[Your Name]',
     tip:'Reactivation emails have 12% response rate.'},

    {category:'retention', title:'Holiday / Year-End Thank You',
     body:'Hi [Client Name],\n\nAs the year wraps up, thank you for your trust. Working with you has been a highlight.\n\n[Greeting]\n\nLooking forward to another great year!\n\nBest,\n[Your Name]',
     tip:'Send in mid-December.'},

    {category:'retention', title:'Milestone Celebration',
     body:'Hi [Client Name],\n\nYou have been a client for [milestone]!\n\nAs a thank you: [special offer].\n\nThank you for your loyalty!\n\nBest,\n[Your Name]',
     tip:'Milestone emails strengthen emotional connection.'},

    {category:'retention', title:'Win-Back (6 Months)',
     body:'Hi [Client Name],\n\nI noticed it has been a while. A lot has changed: [update].\n\nReturning client offer: [incentive].\n\nNo obligation - just wanted you to know I am here.\n\nBest,\n[Your Name]',
     tip:'Win-back works best with a concrete incentive.'},
  ];
}

module.exports = { buildEmailScriptsHTML };
