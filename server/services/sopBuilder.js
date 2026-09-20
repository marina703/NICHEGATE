// SOP Package builder - Standard Operating Procedures - $19 product
var ds = require('./designStudio');
var shell = ds.shell; var shellDNA = ds.shellDNA; var esc = ds.esc;
var parseServices = ds.parseServices;

function buildSOPPackageHTML(prof, theme, opts) {
  var _sh = (theme && theme.dna) ? shellDNA : shell;
  var niche = prof.name || 'Small Business';
  var emoji = prof.emoji || '\u2709\uFE0F';
  var year = new Date().getFullYear();
  var services = parseServices(prof);
  var svc = services.length ? services[0][0] : 'Service';

  var sops = generateSOPs(prof);

  var css = '.cover{height:1123px;background:' + theme.primary + ';color:#fff;padding:80px 60px;display:flex;flex-direction:column;justify-content:space-between;position:relative;overflow:hidden}'
    + '.cover h1{font-size:2.6rem;font-weight:900;line-height:1.1;margin:20px 0 10px}'
    + '.cover .sub{font-size:1rem;opacity:0.8;max-width:460px;line-height:1.5}'
    + '.cover .meta{font-size:0.72rem;opacity:0.5;letter-spacing:1px;text-transform:uppercase}'
    + '.toc{padding:50px 60px}.toc h2{font-size:1.6rem;font-weight:900;margin-bottom:20px}'
    + '.sop{page-break-before:always;padding:50px 60px}'
    + '.sop-num{font-size:0.7rem;font-weight:800;letter-spacing:3px;text-transform:uppercase;color:' + theme.accent + ';margin-bottom:6px}'
    + '.sop h2{font-size:1.5rem;font-weight:900;margin-bottom:8px}'
    + '.sop .intro{font-size:0.88rem;color:#64748b;margin-bottom:20px;line-height:1.6}'
    + '.step{display:grid;grid-template-columns:36px 1fr;gap:12px;margin-bottom:14px;padding:12px;background:#fff;border:1px solid #e8ecf2;border-radius:10px}'
    + '.step-num{width:36px;height:36px;border-radius:10px;background:' + theme.accent + ';color:#fff;font-weight:900;font-size:0.85rem;display:flex;align-items:center;justify-content:center}'
    + '.step-text{font-size:0.85rem;line-height:1.5}'
    + '.step-text strong{color:' + theme.primary + '}'
    + '.checklist{list-style:none;padding:0;margin:12px 0}'
    + '.checklist li{padding:8px 0 8px 28px;position:relative;font-size:0.85rem;border-bottom:1px dashed #e8ecf2}'
    + '.checklist li::before{content:"\2610";position:absolute;left:0;color:' + theme.accent + ';font-size:1.1rem}'
    + '.freq-badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:0.65rem;font-weight:800;letter-spacing:1px;text-transform:uppercase}'
    + '.freq-daily{background:#fef3c7;color:#92400e}'
    + '.freq-weekly{background:#dbeafe;color:#1e40af}'
    + '.freq-monthly{background:#d1fae5;color:#065f46}'
    + '.freq-seasonal{background:#ede9fe;color:#5b21b6}'
    + '.tip-box{background:rgba(0,0,0,0.03);border-left:4px solid ' + theme.accent + ';border-radius:0 10px 10px 0;padding:14px 18px;margin:16px 0}'
    + '.tip-box p{font-size:0.84rem;line-height:1.5}'
    + '.final{page-break-before:always;padding:80px 60px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;background:' + theme.primary + ';color:#fff;min-height:1050px}'
  ;

  // Build body
  var body = '<div class="page" style="padding:0"><div class="cover">'
    + '<h1>' + esc(niche) + '<br>Standard Operating<br>Procedures</h1>'
    + '<div class="sub">Every task documented. Every step repeatable. Every job consistent. Print these SOPs, train your team, and deliver the same quality every single time.</div>'
    + '<div class="meta">A NicheGate Publication \u00B7 ' + year + ' Edition \u00B7 ' + sops.length + ' Procedures</div>'
    + '</div></div>';

  // TOC
  body += '<div class="page toc"><h2>Procedures Index</h2>';
  sops.forEach(function(sop, i) {
    var freqClass = sop.freq === 'Daily' ? 'freq-daily' : sop.freq === 'Weekly' ? 'freq-weekly' : sop.freq === 'Monthly' ? 'freq-monthly' : 'freq-seasonal';
    body += '<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #e8ecf2">'
      + '<span style="font-weight:900;color:' + theme.accent + ';width:30px">' + String(i+1).padStart(2,'0') + '</span>'
      + '<span style="flex:1;font-weight:600;font-size:0.9rem">' + esc(sop.title) + '</span>'
      + '<span class="freq-badge ' + freqClass + '">' + sop.freq + '</span>'
      + '</div>';
  });
  body += '</div>';

  // SOP pages
  sops.forEach(function(sop, i) {
    body += '<div class="page sop">'
      + '<div class="sop-num">SOP ' + String(i+1).padStart(2,'0') + ' \u00B7 ' + sop.freq + '</span>'
      + '<h2>' + esc(sop.title) + '</h2>'
      + '<div class="intro">' + esc(sop.intro) + '</div>'
      + '<div class="tip-box"><p><strong>Purpose:</strong> ' + esc(sop.purpose) + '</p></div>'
      + '<div style="margin-top:16px">'
      + sop.steps.map(function(step, si) {
        return '<div class="step"><div class="step-num">' + (si+1) + '</div><div class="step-text"><strong>' + esc(step.title) + '</strong><br>' + esc(step.detail) + '</div></div>';
      }).join('')
      + '</div>'
      + (sop.checklist ? '<div style="margin-top:20px"><div style="font-size:0.72rem;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:' + theme.accent + ';margin-bottom:8px">Quality Check</div><ul class="checklist">' + sop.checklist.map(function(c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul></div>' : '')
      + '</div>';
  });

  // Final page
  body += '<div class="page final">'
    + '<div style="font-size:3rem;margin-bottom:20px">' + emoji + '</div>'
    + '<h2 style="font-size:2rem;font-weight:900;margin-bottom:16px">Consistency Is Your Brand</h2>'
    + '<p style="font-size:1rem;opacity:0.8;max-width:400px;line-height:1.6">Print these SOPs. Train your team. Deliver the same quality every single time. That is how you build a reputation.</p>'
    + '<div style="margin-top:40px;font-size:0.7rem;opacity:0.4">Created by NicheGate \u00B7 nichegate.com</div>'
    + '</div>';

  return _sh(niche + ' - Standard Operating Procedures ' + year, css, body, theme);
}

// SOP Content Generator
function generateSOPs(prof) {
  var niche = prof.name || 'Business';
  var n = niche.toLowerCase();
  var services = parseServices(prof);
  var svc = services.length ? services[0][0] : 'service';

  return [
    {freq:'Daily', title:'Daily Opening Procedure',
     intro:'Complete these steps every morning before taking your first client.',
     purpose:'Ensures you are prepared, organized, and professional from the start of every day.',
     steps:[
       {title:'Review Today Schedule', detail:'Check your calendar for confirmed appointments, travel times, and any special requirements.'},
       {title:'Check Equipment', detail:'Inspect all tools and equipment. Replace anything worn, broken, or low on supplies.'},
       {title:'Review Client Notes', detail:'Read any notes from previous visits or special instructions for today clients.'},
       {title:'Prepare Vehicle', detail:'Load equipment in reverse order of use. Ensure vehicle is clean and presentable.'},
       {title:'Confirm Appointments', detail:'Send confirmation messages to any clients you have not heard back from.'}
     ],
     checklist:['Calendar is up to date','All equipment inspected','Vehicle loaded and clean','Client notes reviewed','Phone is charged']
    },
    {freq:'Daily', title:'Daily Closing Procedure',
     intro:'Complete these steps at the end of every work day.',
     purpose:'Ensures nothing falls through the cracks and tomorrow starts smoothly.',
     steps:[
       {title:'Update Job Records', detail:'Log all completed jobs, hours worked, materials used, and any notes for follow-up.'},
       {title:'Process Payments', detail:'Send invoices for completed work. Follow up on any outstanding payments.'},
       {title:'Clean and Store Equipment', detail:'Clean all tools, restock supplies, and return everything to its designated spot.'},
       {title:'Review Tomorrow Schedule', detail:'Confirm tomorrow appointments and prep any special materials needed.'},
       {title:'Plan Marketing Tasks', detail:'Schedule social media posts, respond to reviews, and update your pipeline.'}
     ],
     checklist:['All jobs logged','Invoices sent','Equipment cleaned','Tomorrow prepped','Marketing tasks queued']
    },
    {freq:'Weekly', title:'Weekly Quality Review',
     intro:'Every Friday, review the week performance and identify improvements.',
     purpose:'Continuous improvement happens through regular reflection, not annual reviews.',
     steps:[
       {title:'Review Client Feedback', detail:'Read all reviews, survey responses, and direct messages from this week.'},
       {title:'Check Financials', detail:'Compare actual revenue vs target. Identify any pricing or efficiency issues.'},
       {title:'Assess Team Performance', detail:'If you have helpers, review their work quality and client feedback.'},
       {title:'Identify Bottlenecks', detail:'What slowed you down this week? Equipment issues? Scheduling gaps?'},
       {title:'Plan Next Week', detail:'Block time for marketing, admin, and any process improvements.'}
     ],
     checklist:['Revenue on track','All reviews addressed','Team performance noted','Bottlenecks identified','Next week planned']
    },
    {freq:'Weekly', title:'Marketing & Social Media Routine',
     intro:'The weekly marketing tasks that keep your pipeline full.',
     purpose:'Consistent marketing prevents feast-or-famine cycles.',
     steps:[
       {title:'Post on Social Media', detail:'Share 3-5 posts this week: project photos, tips, before/after, client testimonials.'},
       {title:'Engage with Community', detail:'Respond to comments, join local groups, answer questions in your niche.'},
       {title:'Request Reviews', detail:'Follow up with any clients from this week who have not left a review yet.'},
       {title:'Update Google Business', detail:'Post an update, add new photos, respond to any new reviews.'},
       {title:'Check Ad Performance', detail:'Review any running ads. Pause underperformers, scale winners.'}
     ],
     checklist:['3+ social posts published','Community engagement done','Review requests sent','Google Business updated','Ads reviewed']
    },
    {freq:'Monthly', title:'Monthly Business Review',
     intro:'The first Monday of every month, step back and assess the big picture.',
     purpose:'Monthly reviews catch trends before they become problems.',
     steps:[
       {title:'Financial Summary', detail:'Total revenue, total expenses, profit margin, cash flow. Compare to last month and target.'},
       {title:'Client Analysis', detail:'How many new clients? How many repeat? What is your client retention rate?'},
       {title:'Pricing Review', detail:'Are your prices still competitive? Are you leaving money on the table?'},
       {title:'Process Efficiency', detail:'Where are you losing time? What can be automated, delegated, or eliminated?'},
       {title:'Goal Check', detail:'Are you on track for your quarterly and annual goals? Adjust if needed.'}
     ],
     checklist:['Financials reviewed','Client metrics calculated','Pricing evaluated','Processes optimized','Goals assessed']
    },
    {freq:'Monthly', title:'Equipment Maintenance Schedule',
     intro:'Monthly equipment checks prevent expensive breakdowns.',
     purpose:'Well-maintained equipment lasts longer, performs better, and keeps you safe.',
     steps:[
       {title:'Full Equipment Inventory', detail:'Account for every tool and piece of equipment. Note condition and age.'},
       {title:'Clean and Lubricate', detail:'Deep clean all equipment. Lubricate moving parts. Replace filters as needed.'},
       {title:'Calibrate Instruments', detail:'Check accuracy of any measuring or testing instruments.'},
       {title:'Update Consumables List', detail:'Note anything that needs replacing soon. Order before you run out.'},
       {title:'Safety Equipment Check', detail:'Inspect PPE, first aid kit, fire extinguisher. Replace expired items.'}
     ],
     checklist:['All equipment inventoried','Cleaning completed','Instruments calibrated','Supplies ordered','Safety gear inspected']
    },
    {freq:'Seasonal', title:'Seasonal Preparation Checklist',
     intro:'Before each season changes, prepare your business for what is coming.',
     purpose:'Seasonal preparation prevents scramble and captures seasonal demand.',
     steps:[
       {title:'Review Seasonal Trends', detail:'What services are in demand this season? What products should you promote?'},
       {title:'Update Marketing Materials', detail:'Refresh seasonal photos, adjust ad copy, update website messaging.'},
       {title:'Adjust Pricing', detail:'Seasonal demand may justify price adjustments. Plan promotions in advance.'},
       {title:'Stock Seasonal Supplies', detail:'Order materials specific to this season before prices go up or stock runs out.'},
       {title:'Client Outreach', detail:'Contact past clients with seasonal offers. Schedule maintenance appointments.'}
     ],
     checklist:['Seasonal trends reviewed','Marketing updated','Pricing adjusted','Supplies stocked','Client outreach done']
    },
    {freq:'Daily', title:'Client Communication Protocol',
     intro:'How to handle every type of client communication, from first contact to resolution.',
     purpose:'Consistent communication builds trust and prevents misunderstandings.',
     steps:[
       {title:'First Response (Under 1 Hour)', detail:'Acknowledge receipt, ask qualifying questions, set expectations for next steps.'},
       {title:'During Service (Proactive Updates)', detail:'Send mid-job updates for longer projects. Never let a client wonder what is happening.'},
       {title:'Completion (Within 2 Hours)', detail:'Summarize what was done, attach documentation, request feedback.'},
       {title:'Follow-Up (Day 3 and Day 7)', detail:'Check satisfaction, request review, offer additional services.'},
       {title:'Complaint Resolution (Under 24 Hours)', detail:'Listen, acknowledge, offer solutions. Never argue. Always follow up.'}
     ],
     checklist:['Response time under 1 hour','Proactive updates sent','Completion summary delivered','Follow-up scheduled','Complaints resolved in 24h']
    },
    {freq:'Weekly', title:'Inventory & Supply Management',
     intro:'Weekly inventory checks prevent running out of critical supplies.',
     purpose:'Running out mid-job is unprofessional and costly.',
     steps:[
       {title:'Count Critical Supplies', detail:'Check levels of your top 10 most-used consumables.'},
       {title:'Review Usage Trends', detail:'Are you using more of anything than usual? Adjust reorder quantities.'},
       {title:'Check Supplier Pricing', detail:'Compare prices across suppliers quarterly. Negotiate bulk discounts.'},
       {title:'Place Reorders', detail:'Order before you hit minimum levels. Allow for delivery time.'},
       {title:'Update Inventory Log', detail:'Record what was used, what was ordered, and current stock levels.'}
     ],
     checklist:['Critical supplies counted','Usage trends noted','Pricing compared','Reorders placed','Log updated']
    },
    {freq:'Monthly', title:'Client Database Cleanup',
     intro:'Keep your client records accurate and actionable.',
     purpose:'Clean data leads to better marketing, faster response times, and fewer errors.',
     steps:[
       {title:'Verify Contact Information', detail:'Update phone numbers, emails, and addresses for active clients.'},
       {title:'Archive Inactive Clients', detail:'Move clients with no activity in 12+ months to archive. They can be reactivated later.'},
       {title:'Update Service History', detail:'Ensure all completed jobs are logged with dates, services, and amounts.'},
       {title:'Tag Clients for Marketing', detail:'Tag by service type, location, value, and last contact date for targeted outreach.'},
       {title:'Back Up Your Data', detail:'Export your client database to a backup file. Store it securely.'}
     ],
     checklist:['Contacts verified','Inactive archived','History updated','Clients tagged','Data backed up']
    },
  ];
}

module.exports = { buildSOPPackageHTML };