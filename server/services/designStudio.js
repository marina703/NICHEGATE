// ═══════════════════════════════════════════════════════════════════════════
// DESIGN STUDIO — premium shared template system for every NicheGate product.
// Each builder returns a full HTML document styled with one design system:
// clean type, tasteful accent colour, soft shadows, print-ready @page rules.
// Editor-safe: hex theme tokens + font-family declarations only.

// ═══════════════════════════════════════════════════════════════════════════
// PRICING BIBLE — data-driven pricing guide ($19).
// ═══════════════════════════════════════════════════════════════════════════

function buildPricingBibleHTML(prof, theme, opts) {
  const _sh = (theme && theme.dna) ? shellDNA : shell;
  const niche = prof.name || 'Small Business';
  const emoji = prof.emoji || '\u{1F4B0}';
  const services = parseServices(prof);
  const basePrice = services.length && services[0][1] ? priceNum(services[0][1]) : 100;
  const year = new Date().getFullYear();
  const bp = basePrice; // shorthand

  const title = niche + ' \u2014 Pricing Bible ' + year;

  const css = [
    '.cover{height:1123px;background:linear-gradient(160deg, ' + theme.primary + ' 0%, ' + theme.bg + ' 60%);color:#fff;padding:80px 60px;display:flex;flex-direction:column;justify-content:space-between;position:relative;overflow:hidden}',
    '.cover::before{content:"";position:absolute;top:-80px;right:-80px;width:350px;height:350px;border-radius:50%;background:rgba(255,255,255,0.04)}',
    '.cover .badge{display:inline-block;padding:6px 18px;border-radius:999px;background:rgba(255,255,255,0.15);font-size:0.75rem;font-weight:700;letter-spacing:2px;text-transform:uppercase}',
    '.cover h1{font-size:2.6rem;font-weight:900;line-height:1.1;letter-spacing:-1px;margin:20px 0 10px}',
    '.cover .sub{font-size:1rem;opacity:0.8;max-width:460px;line-height:1.5}',
    '.cover .meta{font-size:0.72rem;opacity:0.5;letter-spacing:1px;text-transform:uppercase}',
    '.section{page-break-before:always;padding:50px 60px}',
    '.section-num{font-size:0.7rem;font-weight:800;letter-spacing:3px;text-transform:uppercase;color:' + theme.accent + ';margin-bottom:8px}',
    '.section h2{font-size:1.7rem;font-weight:900;color:' + theme.primary + ';margin-bottom:6px}',
    '.section .intro{font-size:0.88rem;color:#64748b;margin-bottom:24px;line-height:1.6;max-width:580px}',
    '.formula-box{background:' + theme.primary + ';color:#fff;border-radius:16px;padding:24px 28px;margin:20px 0}',
    '.formula-box .label{font-size:0.68rem;font-weight:800;letter-spacing:2px;text-transform:uppercase;opacity:0.6;margin-bottom:8px}',
    '.formula-box .formula{font-size:1.3rem;font-weight:800;font-family:monospace;letter-spacing:1px}',
    '.formula-box .example{font-size:0.82rem;opacity:0.75;margin-top:10px;line-height:1.5}',
    '.rate-table{width:100%;border-collapse:collapse;margin:16px 0}',
    '.rate-table th{background:' + theme.accent + ';color:#fff;padding:10px 14px;text-align:left;font-size:0.7rem;letter-spacing:1.5px;text-transform:uppercase}',
    '.rate-table td{padding:10px 14px;border-bottom:1px solid #e8ecf2;font-size:0.85rem}',
    '.rate-table tr:nth-child(even){background:rgba(0,0,0,0.02)}',
    '.tier-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin:20px 0}',
    '.tier-card{border:2px solid #e8ecf2;border-radius:16px;padding:20px;text-align:center}',
    '.tier-card.featured{border-color:' + theme.accent + ';background:rgba(0,0,0,0.02)}',
    '.tier-card .tier-name{font-size:0.68rem;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:' + theme.accent + ';margin-bottom:8px}',
    '.tier-card .tier-price{font-size:1.8rem;font-weight:900;color:' + theme.primary + ';margin-bottom:6px}',
    '.tier-card .tier-desc{font-size:0.78rem;color:#64748b;line-height:1.4}',
    '.tier-card ul{list-style:none;padding:0;text-align:left;margin-top:12px}',
    '.tier-card li{padding:4px 0;font-size:0.78rem;color:#334155}',
    '.tier-card li::before{content:"\2713 ";color:' + theme.accent + ';font-weight:700}',
    '.tip-box{background:rgba(0,0,0,0.03);border-left:4px solid ' + theme.accent + ';border-radius:0 12px 12px 0;padding:14px 18px;margin:16px 0}',
    '.tip-box .label{font-size:0.66rem;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:' + theme.accent + ';margin-bottom:6px}',
    '.tip-box p{font-size:0.84rem;color:#334155;line-height:1.5}',
    '.checklist{list-style:none;padding:0}',
    '.checklist li{padding:10px 0 10px 28px;position:relative;font-size:0.86rem;color:#334155;border-bottom:1px dashed #e8ecf2}',
    '.checklist li::before{content:"\2610";position:absolute;left:0;color:' + theme.accent + ';font-size:1.1rem}',
    '.compare-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:16px 0}',
    '.compare-card{background:#fff;border:1px solid #e8ecf2;border-radius:12px;padding:18px}',
    '.compare-card h4{font-size:0.9rem;font-weight:800;color:' + theme.primary + ';margin-bottom:8px}',
    '.compare-card p{font-size:0.82rem;color:#64748b;line-height:1.5}',
  ].join('\n');

  // Rate card values computed from basePrice
  const r1lo = Math.round(bp * 0.7), r1hi = bp;
  const r2lo = bp, r2hi = Math.round(bp * 1.5);
  const r3lo = Math.round(bp * 1.5), r3hi = Math.round(bp * 2.5);
  const r4lo = Math.round(bp * 1.5), r4hi = Math.round(bp * 2.5);
  const r5lo = Math.round(bp * 2.5), r5hi = Math.round(bp * 4);
  const r6lo = Math.round(bp * 2.5), r6hi = Math.round(bp * 4);
  const r7lo = Math.round(bp * 4), r7hi = Math.round(bp * 6);
  const tBasic = Math.round(bp * 0.8);
  const tPro = Math.round(bp * 1.8);
  const tPremium = Math.round(bp * 3.2);

  const body = [
    // COVER
    '<div class="page" style="padding:0"><div class="cover">',
    '<div class="badge">Pricing Guide & Rate Card ' + year + '</div>',
    '<h1>' + esc(niche) + '<br>Pricing Bible</h1>',
    '<div class="sub">Stop guessing what to charge. This guide gives you the formulas, rate cards, and pricing strategies used by six- and seven-figure service businesses.</div>',
    '<div class="meta">A NicheGate Publication \u00B7 ' + year + ' Edition</div>',
    '</div></div>',

    // SECTION 1: MARKUP FORMULA
    '<div class="page section">',
    '<div class="section-num">Section 01</div>',
    '<h2>The Markup Formula</h2>',
    '<div class="intro">Every price you quote should start with a formula, not a gut feeling.</div>',
    '<div class="formula-box"><div class="label">The Core Formula</div>',
    '<div class="formula">Price = (Materials \u00D7 1.8) + (Labor Hours \u00D7 Rate \u00D7 3) + Overhead + Profit</div>',
    '<div class="example">A job with $200 in materials and 4 hours at $50/hr: $200\u00D71.8=$360 | 4\u00D7$50\u00D73=$600 | Overhead $100 | Profit $140 = <strong>$1,200</strong></div></div>',
    '<div class="tip-box"><div class="label">Why 3x Labor?</div><p>The 3x multiplier covers taxes (25-30%), insurance, vehicle, software, marketing, and profit margin. Without it, you lose money on every job.</p></div>',
    '<div class="compare-grid">',
    '<div class="compare-card"><h4>Hourly Pricing</h4><p>Pro: Easy, transparent. Con: Caps your income. Best for: consulting.</p></div>',
    '<div class="compare-card"><h4>Project-Based</h4><p>Pro: Rewards efficiency. Con: Scope creep risk. Best for: defined-scope work.</p></div>',
    '<div class="compare-card"><h4>Value-Based</h4><p>Pro: Highest margin. Con: Requires sales skills. Best for: high-impact services.</p></div>',
    '<div class="compare-card"><h4>Package Pricing</h4><p>Pro: Simple for clients. Con: May underprice. Best for: recurring services.</p></div>',
    '</div></div>',

    // SECTION 2: RATE CARDS
    '<div class="page section">',
    '<div class="section-num">Section 02</div>',
    '<h2>Rate Card Templates</h2>',
    '<div class="intro">Adjust based on your market, experience, and competition.</div>',
    '<table class="rate-table"><thead><tr><th>Service Tier</th><th>Starting</th><th>Experienced</th><th>Premium</th></tr></thead><tbody>',
    '<tr><td><strong>Basic</strong></td><td>$' + r1lo + ' - $' + r1hi + '</td><td>$' + r2lo + ' - $' + r2hi + '</td><td>$' + r3lo + ' - $' + r3hi + '</td></tr>',
    '<tr><td><strong>Standard</strong></td><td>$' + r2lo + ' - $' + r2hi + '</td><td>$' + r4lo + ' - $' + r4hi + '</td><td>$' + r5lo + ' - $' + r5hi + '</td></tr>',
    '<tr><td><strong>Premium</strong></td><td>$' + r4lo + ' - $' + r4hi + '</td><td>$' + r6lo + ' - $' + r6hi + '</td><td>$' + r7lo + ' - $' + r7hi + '</td></tr>',
    '<tr><td><strong>Emergency / Rush</strong></td><td colspan="3" style="background:' + theme.accent + ';color:#fff;font-weight:800">Add 50-100% premium to any base rate</td></tr>',
    '</tbody></table>',
    '<div class="tip-box"><div class="label">The Anchor Effect</div><p>Always present your highest price first. When a client sees $2,500 before $1,200, the $1,200 feels like a deal.</p></div>',
    '</div>',

    // SECTION 3: PACKAGE TIERS
    '<div class="page section">',
    '<div class="section-num">Section 03</div>',
    '<h2>Package Tier Strategy</h2>',
    '<div class="intro">Offer three tiers. Most clients pick the middle one.</div>',
    '<div class="tier-grid">',
    '<div class="tier-card"><div class="tier-name">Basic</div><div class="tier-price">$' + tBasic + '</div><div class="tier-desc">The essentials.</div><ul><li>Core service</li><li>Standard turnaround</li><li>Email support</li></ul></div>',
    '<div class="tier-card featured"><div class="tier-name">Professional</div><div class="tier-price">$' + tPro + '</div><div class="tier-desc">Best value.</div><ul><li>Priority scheduling</li><li>Phone + email</li><li>Detailed docs</li><li>30-day follow-up</li></ul></div>',
    '<div class="tier-card"><div class="tier-name">Premium</div><div class="tier-price">$' + tPremium + '</div><div class="tier-desc">Zero compromises.</div><ul><li>Same-day response</li><li>Dedicated contact</li><li>90-day maintenance</li><li>Priority rebooking</li></ul></div>',
    '</div></div>',

    // SECTION 4: MISTAKES
    '<div class="page section">',
    '<div class="section-num">Section 04</div>',
    '<h2>7 Pricing Mistakes That Kill Service Businesses</h2>',
    '<div class="intro">If you are making even one, you are leaving money on the table.</div>',
    '<ul class="checklist">',
    '<li><strong>Charging by the hour instead of by value.</strong> A 30-min fix saving $10K is worth more than $25.</li>',
    '<li><strong>Not raising prices annually.</strong> Raise 5-10% every January. New clients never knew the old price.</li>',
    '<li><strong>Quoting without discovery.</strong> Never price before understanding scope.</li>',
    '<li><strong>Discounts instead of added value.</strong> "Free follow-up" beats "10% off" every time.</li>',
    '<li><strong>Being the cheapest.</strong> Low price = low trust. Price shoppers leave for price.</li>',
    '<li><strong>Not tracking costs.</strong> If you don\u2019t know your cost per job, you don\u2019t know if you\u2019re profitable.</li>',
    '<li><strong>Fear of quoting your real price.</strong> Build more value, don\u2019t lower the number.</li>',
    '</ul></div>',

    // SECTION 5: RAISING PRICES
    '<div class="page section">',
    '<div class="section-num">Section 05</div>',
    '<h2>How to Raise Prices Without Losing Clients</h2>',
    '<div class="intro">The fastest path to more profit.</div>',
    '<div class="formula-box"><div class="label">The 30-Day Notice</div>',
    '<div class="formula">Send notice \u2192 Explain value added \u2192 Grandfather loyal clients \u2192 Offer annual prepay lock</div></div>',
    '<ul class="checklist">',
    '<li><strong>Fully booked 2+ weeks out?</strong> Raise 15-20%. You are underpriced.</li>',
    '<li><strong>20+ five-star reviews?</strong> Your reputation justifies a premium.</li>',
    '<li><strong>Costs increased?</strong> Pass it through. Clients understand.</li>',
    '<li><strong>It is January?</strong> Annual increases are expected and normal.</li>',
    '<li><strong>New skills or certs?</strong> You are worth more now.</li>',
    '</ul></div>',

    // SECTION 6: QUOTE TEMPLATES
    '<div class="page section">',
    '<div class="section-num">Section 06</div>',
    '<h2>Quote & Proposal Templates</h2>',
    '<div class="formula-box"><div class="label">The Confidence Frame</div>',
    '<div class="formula">"For [scope], the investment is [price]. This includes [3 deliverables]. I can start [date]."</div></div>',
    '<div class="formula-box" style="background:' + theme.secondary + '"><div class="label">The Value Justification</div>',
    '<div class="formula">"This service saves [amount] in [risk/cost]. My fee pays for itself within [timeframe]."</div></div>',
    '<div class="tip-box"><div class="label">Never Do This</div><p>Never say "It depends" or "I can probably do it for..." Always lead with a specific number and let the client respond.</p></div>',
    '</div>',

    // FINAL PAGE
    '<div class="page" style="page-break-before:always;padding:80px 60px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;background:' + theme.primary + ';color:#fff;min-height:1050px">',
    '<div style="font-size:3rem;margin-bottom:20px">' + emoji + '</div>',
    '<h2 style="font-size:2rem;font-weight:900;margin-bottom:16px">Price With Confidence</h2>',
    '<p style="font-size:1rem;opacity:0.8;max-width:400px;line-height:1.6">You have the formulas, the rate cards, and the scripts. Say the number out loud.</p>',
    '<div style="margin-top:30px;padding:12px 24px;border:2px solid rgba(255,255,255,0.3);border-radius:999px;font-weight:700;letter-spacing:1px;text-transform:uppercase;font-size:0.8rem">Know Your Worth. Then Add Tax.</div>',
    '<div style="margin-top:40px;font-size:0.7rem;opacity:0.4">Created by NicheGate \u00B7 nichegate.com</div>',
    '</div>',
  ].join('\n');

  return _sh(title, css, body, theme);
}

// ═══════════════════════════════════════════════════════════════════════════
// NICHE PLAYBOOK — comprehensive multi-page business guide ($24).
// Each playbook is a 30-40 page PDF with 8 chapters covering everything
// a beginner needs to start and grow a business in a specific niche.
// ═══════════════════════════════════════════════════════════════════════════

function buildPlaybookHTML(prof, theme, opts) {
  const _sh = (theme && theme.dna) ? shellDNA : shell;
  const o = opts || {};
  const niche = prof.name || 'Small Business';
  const emoji = prof.emoji || '📘';
  const slug = prof.slug || 'business';
  const year = new Date().getFullYear();
  const services = parseServices(prof);
  const serviceName = services.length ? services[0][0] : niche;
  const priceRange = services.length && services[0][1] ? services[0][1] : '$50-200';

  // Generate chapter content based on niche
  const chapters = generatePlaybookChapters(prof, o);

  return _sh(`${niche} — The Complete Business Playbook ${year}`, `
    /* ── PLAYBOOK STYLES ── */
    .playbook-cover{height:1123px;background:linear-gradient(135deg, ${theme.primary} 0%, ${theme.bg} 100%);color:#fff;padding:80px 60px;display:flex;flex-direction:column;justify-content:space-between;position:relative;overflow:hidden}
    .playbook-cover::before{content:'';position:absolute;top:-100px;right:-100px;width:400px;height:400px;border-radius:50%;background:rgba(255,255,255,0.05)}
    .playbook-cover::after{content:'';position:absolute;bottom:-50px;left:-50px;width:300px;height:300px;border-radius:50%;background:rgba(255,255,255,0.03)}
    .playbook-cover .badge{display:inline-block;padding:6px 18px;border-radius:999px;background:rgba(255,255,255,0.15);font-size:0.75rem;font-weight:700;letter-spacing:2px;text-transform:uppercase;backdrop-filter:blur(10px)}
    .playbook-cover h1{font-size:2.8rem;font-weight:900;line-height:1.1;letter-spacing:-1px;margin:24px 0 12px}
    .playbook-cover .sub{font-size:1.1rem;opacity:0.8;max-width:480px;line-height:1.5}
    .playbook-cover .meta{font-size:0.75rem;opacity:0.5;letter-spacing:1px;text-transform:uppercase}
    .playbook-cover .emoji{font-size:4rem;position:absolute;top:60px;right:60px}

    .toc{padding:60px}
    .toc h2{font-size:1.6rem;font-weight:900;margin-bottom:24px;color:${theme.primary}}
    .toc-item{display:flex;justify-content:space-between;align-items:baseline;padding:12px 0;border-bottom:1px dashed #e2e8f0}
    .toc-num{font-weight:900;color:${theme.accent};font-size:1.1rem;width:40px}
    .toc-title{flex:1;font-weight:600;color:${theme.primary}}
    .toc-page{font-size:0.85rem;color:#64748b;font-variant-numeric:tabular-nums}

    .chapter{page-break-before:always;padding:50px 60px}
    .chapter-num{font-size:0.7rem;font-weight:800;letter-spacing:3px;text-transform:uppercase;color:${theme.accent};margin-bottom:8px}
    .chapter h2{font-size:1.8rem;font-weight:900;color:${theme.primary};margin-bottom:6px;letter-spacing:-0.5px}
    .chapter .intro{font-size:0.9rem;color:#64748b;margin-bottom:24px;line-height:1.6;max-width:600px}

    .playbook-section{margin-bottom:32px}
    .playbook-section h3{font-size:1.1rem;font-weight:800;color:${theme.primary};margin-bottom:12px;padding-bottom:6px;border-bottom:2px solid ${theme.accent}}
    .playbook-section p{font-size:0.88rem;color:#334155;line-height:1.65;margin-bottom:10px}
    .playbook-section ul{list-style:none;padding:0}
    .playbook-section li{padding:8px 0 8px 20px;position:relative;font-size:0.86rem;color:#334155;line-height:1.5}
    .playbook-section li::before{content:'▸';position:absolute;left:0;color:${theme.accent};font-weight:700}

    .cost-table{width:100%;border-collapse:collapse;margin:16px 0}
    .cost-table th{background:${theme.primary};color:#fff;padding:10px 14px;text-align:left;font-size:0.72rem;letter-spacing:1.5px;text-transform:uppercase}
    .cost-table td{padding:10px 14px;border-bottom:1px solid #e8ecf2;font-size:0.85rem}
    .cost-table tr:nth-child(even){background:rgba(0,0,0,0.02)}
    .cost-table .total{font-weight:800;background:${theme.accent};color:#fff}

    .tip-box{background:rgba(0,0,0,0.03);border-left:4px solid ${theme.accent};border-radius:0 12px 12px 0;padding:16px 20px;margin:16px 0}
    .tip-box .label{font-size:0.68rem;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:${theme.accent};margin-bottom:6px}
    .tip-box p{font-size:0.85rem;color:#334155;line-height:1.5}

    .roadmap-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0}
    .roadmap-card{background:#fff;border:1px solid #e8ecf2;border-radius:12px;padding:16px}
    .roadmap-card .month{font-size:0.68rem;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:${theme.accent};margin-bottom:6px}
    .roadmap-card .task{font-size:0.82rem;color:#334155;line-height:1.5}

    .final-page{page-break-before:always;padding:80px 60px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;background:${theme.primary};color:#fff;min-height:1050px}
    .final-page h2{font-size:2rem;font-weight:900;margin-bottom:16px}
    .final-page p{font-size:1rem;opacity:0.8;max-width:400px;line-height:1.6}
  `, `
  <div class="page" style="padding:0">
    <!-- COVER -->
    <div class="playbook-cover">
      <div class="badge">The Complete Business Guide · ${year}</div>
      <div class="emoji">${emoji}</div>
      <div>
        <h1>The Complete<br>${esc(niche)}<br>Business Playbook</h1>
        <div class="sub">Everything you need to know to start, grow, and profit from a ${esc(niche.toLowerCase())} business — from zero to your first $10,000 month.</div>
      </div>
      <div class="meta">A NicheGate Publication · ${year} Edition · 30+ Pages of Actionable Guidance</div>
    </div>
  </div>

  <!-- TABLE OF CONTENTS -->
  <div class="page">
    <div class="toc">
      <h2>What's Inside</h2>
      ${chapters.map((ch, i) => `
        <div class="toc-item">
          <span class="toc-num">${String(i + 1).padStart(2, '0')}</span>
          <span class="toc-title">${esc(ch.title)}</span>
          <span class="toc-page">${i + 3}</span>
        </div>
      `).join('')}
    </div>
  </div>

  <!-- CHAPTERS -->
  ${chapters.map((ch, i) => `
    <div class="page chapter">
      <div class="chapter-num">Chapter ${String(i + 1).padStart(2, '0')}</div>
      <h2>${esc(ch.title)}</h2>
      <div class="intro">${esc(ch.intro)}</div>
      ${ch.sections.map(s => `
        <div class="playbook-section">
          ${s.heading ? `<h3>${esc(s.heading)}</h3>` : ''}
          ${s.content}
        </div>
      `).join('')}
    </div>
  `).join('')}

  <!-- FINAL PAGE -->
  <div class="page final-page">
    <div style="font-size:3rem;margin-bottom:20px">${emoji}</div>
    <h2>You're Ready to Launch</h2>
    <p>You now have the knowledge, tools, and roadmap to build a successful ${esc(niche.toLowerCase())} business. The only thing left is to take action.</p>
    <div style="margin-top:30px;padding:12px 24px;border:2px solid rgba(255,255,255,0.3);border-radius:999px;font-weight:700;letter-spacing:1px;text-transform:uppercase;font-size:0.8rem">Start Today · Not Tomorrow</div>
    <div style="margin-top:40px;font-size:0.7rem;opacity:0.4">Created by NicheGate · nichegate.com</div>
  </div>
  `, theme);
}

// ═══════════════════════════════════════════════════════════════════════════
// PLAYBOOK CONTENT GENERATOR — generates niche-specific chapter content
// based on profession data, services, and pricing.
// ═══════════════════════════════════════════════════════════════════════════

function generatePlaybookChapters(prof, opts) {
  const niche = prof.name || 'Small Business';
  const services = parseServices(prof);
  const svcName = services.length ? services[0][0] : 'professional services';
  const priceStr = services.length && services[0][1] ? services[0][1] : '$50-200';

  return [
    // ── CHAPTER 1: Getting Started ──
    {
      title: `Getting Started: Your ${niche} Business Blueprint`,
      intro: `Starting a ${niche.toLowerCase()} business doesn't require a fortune — but it does require a plan. This chapter covers exactly what you need to get off the ground.`,
      sections: [
        { heading: 'Startup Costs Breakdown', content: `
          <table class="cost-table">
            <thead><tr><th>Category</th><th>Budget Option</th><th>Pro Option</th></tr></thead>
            <tbody>
              <tr><td>Essential Equipment</td><td>$500 — $1,500</td><td>$2,000 — $5,000</td></tr>
              <tr><td>Insurance & Licenses</td><td>$300 — $800</td><td>$800 — $2,000</td></tr>
              <tr><td>Marketing & Branding</td><td>$200 — $500</td><td>$1,000 — $3,000</td></tr>
              <tr><td>Software & Tools</td><td>$50 — $150/mo</td><td>$200 — $500/mo</td></tr>
              <tr><td>Working Capital</td><td>$1,000 — $3,000</td><td>$5,000 — $15,000</td></tr>
              <tr class="total"><td>TOTAL TO START</td><td>$2,050 — $5,950</td><td>$9,000 — $25,000</td></tr>
            </tbody>
          </table>
        ` },
        { heading: 'Your First 30 Days', content: `
          <ul>
            <li><strong>Week 1:</strong> Register your business, get an EIN, open a business bank account</li>
            <li><strong>Week 2:</strong> Purchase essential equipment, set up insurance, create your brand identity</li>
            <li><strong>Week 3:</strong> Build your online presence — website, Google Business, social media profiles</li>
            <li><strong>Week 4:</strong> Launch with 3-5 pilot clients at discounted rates in exchange for reviews</li>
          </ul>
        ` },
        { heading: 'Critical Certifications', content: `
          <p>Most ${niche.toLowerCase()} businesses require specific certifications. Research your state and local requirements early — they vary significantly by region. Common requirements include business licenses, professional certifications, and specialized insurance.</p>
        ` }
      ]
    },

    // ── CHAPTER 2: Pricing Strategy ──
    {
      title: `Pricing Strategy: What to Charge (and How to Justify It)`,
      intro: `Most new business owners undercharge. Here's how to price for profit while staying competitive.`,
      sections: [
        { heading: 'Pricing Models', content: `
          <ul>
            <li><strong>Hourly Rate:</strong> Best for ongoing consulting. Start at $50-75/hr, increase as demand grows</li>
            <li><strong>Project-Based:</strong> Best for defined scopes. Price at 2.5-3x your hourly estimate</li>
            <li><strong>Package Pricing:</strong> Best for recurring services. Offer Good/Better/Best tiers</li>
            <li><strong>Value-Based:</strong> Best for premium positioning. Price based on the value you deliver, not the time you spend</li>
          </ul>
          <div class="tip-box"><div class="label">Pro Tip</div><p>Never quote your first price out loud. Ask the client's budget first. Most people will reveal a number higher than what you were going to charge.</p></div>
        ` },
        { heading: 'The Markup Formula', content: `
          <p><strong>Your Price = (Cost × Markup) + Overhead + Profit Margin</strong></p>
          <p>A typical service business uses a 2.5-3x markup. If a job costs you $100 in materials and 2 hours of labor, you should charge $500-600 minimum.</p>
          <ul>
            <li>Materials: multiply by 1.5-2x (covers waste, delivery, admin)</li>
            <li>Labor: multiply by 2.5-3x (covers overhead, profit, taxes)</li>
            <li>Overhead: add 15-25% for insurance, vehicle, software, marketing</li>
          </ul>
        ` }
      ]
    },

    // ── CHAPTER 3: Equipment Guide ──
    {
      title: `Equipment Guide: What You Actually Need (vs. What Salespeople Tell You)`,
      intro: `Don't blow your budget on gear you won't use for months. Here's the honest equipment list.`,
      sections: [
        { heading: 'Essential (Buy Now)', content: `
          <ul>
            <li>Core operational equipment — the tools that directly deliver your service</li>
            <li>Basic safety gear — PPE, first aid kit, fire extinguisher as applicable</li>
            <li>Transportation — reliable vehicle for getting to clients</li>
            <li>Communication — professional phone, email, scheduling software</li>
          </ul>
        ` },
        { heading: 'Nice to Have (Month 3-6)', content: `
          <ul>
            <li>Upgraded tools — as revenue justifies the investment</li>
            <li>Vehicle branding — wraps, magnets, or signs for mobile advertising</li>
            <li>Additional safety equipment — as job complexity increases</li>
          </ul>
        ` },
        { heading: 'Skip for Now', content: `
          <ul>
            <li>Premium equipment you haven't mastered yet</li>
            <li>Redundant tools (you don't need two of everything)</li>
            <li>Expensive software subscriptions you won't use daily</li>
          </ul>
        ` }
      ]
    },

    // ── CHAPTER 4: Marketing Playbook ──
    {
      title: `Marketing Playbook: Getting Your First 50 Clients`,
      intro: `Marketing doesn't have to be expensive. It has to be consistent and targeted.`,
      sections: [
        { heading: 'The Client Acquisition Funnel', content: `
          <ul>
            <li><strong>Strangers → Visitors:</strong> Google Business Profile, social media, referral links</li>
            <li><strong>Visitors → Leads:</strong> Website with clear CTA, free consultation offer, lead magnet</li>
            <li><strong>Leads → Clients:</strong> Fast follow-up (within 1 hour), professional proposal, social proof</li>
            <li><strong>Clients → Repeat:</strong> Follow-up emails, maintenance plans, referral incentives</li>
          </ul>
        ` },
        { heading: 'Free Marketing Channels (Do These First)', content: `
          <ul>
            <li><strong>Google Business Profile:</strong> Complete your profile, post weekly, respond to every review</li>
            <li><strong>Nextdoor:</strong> Join your local neighborhood, answer questions, offer expertise</li>
            <li><strong>Facebook Groups:</strong> Join local community groups, be helpful (not salesy)</li>
            <li><strong>Referral Program:</strong> Offer $25-50 for every referral that converts</li>
            <li><strong>Yelp:</strong> Claim your listing, respond to reviews, post photos of your work</li>
          </ul>
        ` },
        { heading: 'Paid Marketing (Start at Month 2)', content: `
          <ul>
            <li><strong>Google Ads:</strong> Start with $10-20/day targeting "near me" searches</li>
            <li><strong>Facebook/Instagram Ads:</strong> Target homeowners in your service area, $5-10/day</li>
            <li><strong>Vehicle Wrap:</strong> One-time investment that generates leads 24/7</li>
          </ul>
        ` }
      ]
    },

    // ── CHAPTER 5: Client Management ──
    {
      title: `Client Management: From First Call to Five-Star Review`,
      intro: `Your client experience is your brand. Here's how to deliver it consistently.`,
      sections: [
        { heading: 'The Perfect Client Flow', content: `
          <ul>
            <li><strong>1. First Contact:</strong> Respond within 1 hour. Ask 3 qualifying questions. Set expectations.</li>
            <li><strong>2. Proposal:</strong> Send within 24 hours. Include scope, timeline, price, and terms.</li>
            <li><strong>3. Confirmation:</strong> Send booking confirmation with date, time, what to expect.</li>
            <li><strong>4. Execution:</strong> Arrive early. Communicate throughout. Document your work.</li>
            <li><strong>5. Follow-Up:</strong> Thank-you email within 24 hours. Request review at day 3. Follow up at day 30.</li>
          </ul>
        ` },
        { heading: 'Handling Complaints', content: `
          <p>The 3-step recovery: <strong>Listen → Acknowledge → Fix.</strong></p>
          <ul>
            <li>Never argue, even if you're right</li>
            <li>Offer a concrete solution within 24 hours</li>
            <li>Follow up to confirm satisfaction</li>
          </ul>
          <div class="tip-box"><div class="label">The 10x Rule</div><p>If a client has a bad experience and you fix it exceptionally well, they become more loyal than a client who never had a problem. A complaint handled well is a gift.</p></div>
        ` }
      ]
    },

    // ── CHAPTER 6: Financial Management ──
    {
      title: `Financial Management: Keeping More of What You Earn`,
      intro: `Revenue is vanity, profit is sanity. Here's how to actually make money.`,
      sections: [
        { heading: 'The 50/30/20 Rule for Service Businesses', content: `
          <ul>
            <li><strong>50% — Operations:</strong> Materials, equipment, insurance, software</li>
            <li><strong>30% — Owner's Pay:</strong> Your salary (pay yourself first!)</li>
            <li><strong>20% — Growth:</strong> Marketing, training, emergency fund, taxes</li>
          </ul>
        ` },
        { heading: 'Tax Essentials', content: `
          <ul>
            <li>Set aside 25-30% of every payment for taxes</li>
            <li>Track every business expense (receipts, mileage, home office)</li>
            <li>Consider forming an LLC for liability protection</li>
            <li>File quarterly estimated taxes (April 15, June 15, Sept 15, Jan 15)</li>
            <li>Hire a CPA at $200-500/year — they'll save you more than they cost</li>
          </ul>
        ` }
      ]
    },

    // ── CHAPTER 7: Scaling ──
    {
      title: `Scaling: From Solo to Team (and Beyond)`,
      intro: `When you're turning away work, it's time to scale. But scaling wrong will kill your business.`,
      sections: [
        { heading: "Signs You're Ready to Scale", content: `
          <ul>
            <li>You're turning away 3+ jobs per month</li>
            <li>You've been consistently profitable for 6+ months</li>
            <li>You have documented processes for your core services</li>
            <li>You have a steady pipeline of leads (not just referrals)</li>
          </ul>
        ` },
        { heading: 'Scaling Options (Pick One)', content: `
          <ul>
            <li><strong>Hire a helper:</strong> Start part-time. Train them on YOUR standards before they see clients.</li>
            <li><strong>Raise prices:</strong> If you're fully booked, you're too cheap. Raise prices 10-20%.</li>
            <li><strong>Add services:</strong> New services to existing clients costs nothing to acquire.</li>
            <li><strong>Productize:</strong> Create digital products (guides, checklists, templates) for passive income.</li>
          </ul>
        ` }
      ]
    },

    // ── CHAPTER 8: First-Year Roadmap ──
    {
      title: `First-Year Roadmap: Your Month-by-Month Action Plan`,
      intro: `Here's exactly what to focus on each month of your first year.`,
      sections: [
        { heading: 'Quarter 1: Foundation', content: `
          <div class="roadmap-grid">
            <div class="roadmap-card"><div class="month">Month 1</div><div class="task">Register business, get insurance, buy core equipment, set up accounts. Goal: Be legally operational.</div></div>
            <div class="roadmap-card"><div class="month">Month 2</div><div class="task">Launch website, Google Business, social media. Get first 3-5 pilot clients. Goal: First revenue.</div></div>
            <div class="roadmap-card"><div class="month">Month 3</div><div class="task">Collect reviews, refine pricing, start referral program. Goal: 5+ reviews, consistent leads.</div></div>
          </div>
        ` },
        { heading: 'Quarter 2: Momentum', content: `
          <div class="roadmap-grid">
            <div class="roadmap-card"><div class="month">Month 4</div><div class="task">Increase prices 10-15%. Start paid ads. Goal: $2,000+ revenue.</div></div>
            <div class="roadmap-card"><div class="month">Month 5</div><div class="task">Systemize operations. Create SOPs. Goal: Work ON the business, not just IN it.</div></div>
            <div class="roadmap-card"><div class="month">Month 6</div><div class="task">Evaluate first half. Cut what isn't working. Double down on what is. Goal: Profitable and growing.</div></div>
          </div>
        ` },
        { heading: 'Quarter 3-4: Growth', content: `
          <div class="roadmap-grid">
            <div class="roadmap-card"><div class="month">Months 7-9</div><div class="task">Consider first hire or subcontractor. Expand service area. Goal: $5,000+ monthly revenue.</div></div>
            <div class="roadmap-card"><div class="month">Months 10-12</div><div class="task">Build recurring revenue. Create digital products. Plan year two expansion. Goal: $8,000-10,000/month.</div></div>
          </div>
        ` }
      ]
    }
  ];
}


// ═══════════════════════════════════════════════════════════════════════════

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const { getContentFor, checklistRowsFor, socialAngleFor } = require('./contentLibrary');
const designDNA = require('./designStyles');

function priceNum(str) {
  const m = String(str || '').replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

function parseServices(prof) {
  try { return JSON.parse(prof.services || '[]'); } catch { return []; }
}

const SYSTEM_FONT = "'Space Grotesk','Inter','Segoe UI',system-ui,sans-serif";

function baseStyle(theme) {
  const t = theme || {};
  // Dark palettes are art direction for covers, not for paper. Rendering a dark
  // theme's near-black ink on its own near-black page made every raster preview
  // and PDF illegible (e.g. "Onyx Volt": #050505 text on a #0a0a0a page), so a
  // document page always sits on a light surface and keeps the theme's ink and
  // accents. Cover art (thumb-stoppers, playbook covers) still uses theme.bg.
  const dark = !!t.dark;
  const paper = dark ? ((t.brief && t.brief.palette && t.brief.palette.surface) || '#ffffff') : (t.bg || '#ffffff');
  const wash = dark ? '#eef1f5' : (t.bg || '#ffffff');
  return `
  *{box-sizing:border-box;margin:0;padding:0}
  html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{font-family:${t.font || SYSTEM_FONT};color:${t.primary};background:${wash};line-height:1.55;font-size:13px}
  @page{size:A4;margin:12mm}
  .page{width:100%;max-width:794px;margin:0 auto;padding:44px 46px;min-height:1050px;page-break-after:always;background:${paper};position:relative}
  .page:last-child{page-break-after:auto}
  .pill{display:inline-block;padding:5px 14px;border-radius:999px;font-size:10px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;background:${theme.primary};color:#fff}
  .card{background:#fff;border:1px solid rgba(15,23,42,0.08);border-radius:16px;box-shadow:0 10px 30px -18px rgba(15,23,42,0.35)}
  @media print{
    body{background:#fff}
    .page{box-shadow:none;margin:0;max-width:none}
  }
  `;
}


function shell(title, extraCss, body, theme) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${esc(title)}</title>
<style>${baseStyle(theme)}${extraCss}</style></head><body>${body}</body></html>`;
}
// ── INVOICE ──────────────────────────────────────────────────────────────
function buildInvoiceHTML(prof, theme, opts) {
  const _sh = (theme && theme.dna) ? shellDNA : shell;
  const cat = getContentFor(prof);
  const safe = cat.invoice.length ? cat.invoice : parseServices(prof).length ? parseServices(prof) : [["Professional Consultation", "$50"]];
  const total = safe.reduce((a, s) => a + (priceNum(s[1]) || 0), 0);
  const opts2 = opts || {};
  const today = opts2.date || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const due = new Date(Date.now() + 30 * 864e5).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const rows = safe.map((s, i) => {
    const rate = priceNum(s[1]);
    return `<tr>
      <td><div class="svc">${esc(s[0])}</div><div class="svc-sub">${esc(prof.name)} · line #${String(i + 1).padStart(2, '0')}</div></td>
      <td class="num">1</td>
      <td class="num">${rate != null ? '$' + rate.toFixed(2) : esc(s[1])}</td>
      <td class="num strong">${rate != null ? '$' + rate.toFixed(2) : '—'}</td>
    </tr>`;
  }).join('');

  return _sh(`${prof.name} — Invoice Template`, `
    body{background:#eef1f5}
    .top-grid{display:grid;grid-template-columns:1fr auto;gap:24px;align-items:center;margin-bottom:34px}
    .brand{display:flex;align-items:center;gap:16px}
    .logo-box{width:64px;height:64px;border-radius:18px;background:${theme.primary};color:#fff;display:flex;align-items:center;justify-content:center;font-size:2rem;box-shadow:0 14px 30px -14px ${theme.primary}}
    .brand h1{font-size:1.7rem;font-weight:900;letter-spacing:-0.5px}
    .brand p{font-size:0.78rem;opacity:0.55;margin-top:2px}
    .doc-label{text-align:right}
    .doc-label .big{font-size:2.2rem;font-weight:900;letter-spacing:4px;text-transform:uppercase;line-height:1}
    .doc-label .id{font-size:0.75rem;opacity:0.5;margin-top:6px}
    .meta-grid{display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:14px;margin-bottom:26px}
    .field h3{font-size:0.66rem;letter-spacing:1.8px;text-transform:uppercase;opacity:0.45;margin-bottom:8px}
    .field p{font-size:0.86rem;color:#334155}
    .field .editable{border-bottom:1px dashed rgba(15,23,42,0.18);padding-bottom:6px;min-height:22px}
    table{width:100%;border-collapse:collapse;margin-bottom:18px}
    thead th{font-size:0.64rem;letter-spacing:1.8px;text-transform:uppercase;padding:12px 14px;background:${theme.primary};color:#fff;text-align:left}
    thead th:first-child{border-radius:12px 0 0 0}
    thead th:last-child{border-radius:0 12px 0 0}
    tbody td{padding:13px 14px;border-bottom:1px solid #e8ecf2;font-size:0.86rem}
    tbody tr:nth-child(even){background:rgba(15,23,42,0.025)}
    .svc{font-weight:700;color:#1e293b}
    .svc-sub{font-size:0.72rem;opacity:0.5;margin-top:2px}
    .num{text-align:right;font-variant-numeric:tabular-nums}
    .strong{font-weight:800}
    .totals{display:grid;grid-template-columns:1fr 280px;gap:16px;align-items:start}
    .notes{font-size:0.78rem;color:#64748b;padding-top:6px}
    .notes .box{border-left:3px solid ${theme.accent};padding:10px 14px;background:rgba(0,0,0,0.03);border-radius:0 10px 10px 0;margin-top:8px}
    .total-card{background:${theme.primary};color:#fff;border-radius:16px;padding:18px 20px;box-shadow:0 18px 34px -18px ${theme.primary}}
    .total-card .lbl{font-size:0.64rem;letter-spacing:2px;text-transform:uppercase;opacity:0.6}
    .total-card .amt{font-size:2rem;font-weight:900;margin:6px 0 2px}
    .total-card .due{font-size:0.7rem;opacity:0.65}
    .pay-strip{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
    .pay-chip{font-size:0.68rem;font-weight:700;background:#fff;border:1px solid rgba(15,23,42,0.12);padding:6px 12px;border-radius:999px}
    .foot{display:flex;justify-content:space-between;gap:16px;margin-top:30px;padding-top:16px;border-top:1px solid #e8ecf2;font-size:0.72rem;color:#64748b}
    .foot .sig{border-top:1px solid rgba(15,23,42,0.2);width:160px;padding-top:6px;margin-top:14px;text-align:center;font-weight:700;color:#334155}
  `, `
  <div class="page">
    <div class="top-grid">
      <div class="brand">
        <div class="logo-box">${esc(prof.emoji || '🧾')}</div>
        <div><h1>${esc(prof.name)}</h1><p>Professional Services · ${esc(new Date().getFullYear())}</p></div>
      </div>
      <div class="doc-label"><div class="big">Invoice</div><div class="id">INV-${String(1000 + (opts2.seed || 1))} · Due Net 30</div></div>
    </div>
    <div class="meta-grid">
      <div class="field"><h3>Bill To</h3><p class="editable" contenteditable="true">Client name<br>Client company<br>City, ST 12345</p></div>
      <div class="field"><h3>Invoice Date</h3><p>${esc(today)}</p></div>
      <div class="field"><h3>Payment Due</h3><p>${esc(due)}</p></div>
    </div>
    <table>
      <thead><tr><th>Service / Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="totals">
      <div class="notes">
        <div class="box">Thank you for your business. Payment due within 30 days — ACH, credit card, or check accepted.</div>
      </div>
      <div class="total-card">
        <div class="lbl">Total Due</div>
        <div class="amt">$${total.toFixed(2)}</div>
        <div class="due">Covers all listed work · No hidden fees</div>
        <div class="pay-strip"><span class="pay-chip">ACH</span><span class="pay-chip">CARD</span><span class="pay-chip">CHECK</span></div>
      </div>
    </div>
    <div class="foot">
      <div>Payment terms: Net 30 · Questions? hello@${esc(prof.slug)}.com</div>
      <div class="sig">Authorized signature</div>
    </div>
  </div>`, theme);
}
// ── CHECKLIST ────────────────────────────────────────────────────────────
function buildChecklistHTML(prof, theme) {
  const _sh = (theme && theme.dna) ? shellDNA : shell;
  const services = parseServices(prof);
  const groups = (services.length ? services : [["Standard Service Package", "$100"]]).map((s, g) => {
    // Last-resort routine — only reached when the content moat has nothing.
    const routine = [
      `Confirm scope, date &amp; quoted price (${esc(s[1] || 'quote')}) with the client`,
      `Arrive prepared — tools, supplies and checklist on hand`,
      `Complete "${esc(s[0])}" step by step, marking each line done`,
      `Inspect finished work against this checklist before leaving`,
      `Collect payment, send the receipt and schedule the follow-up`
    ];
    // Content moat: trade-true, service-keyed rows — distinct per group.
    const moatRows = checklistRowsFor(prof, s[0], g, 5);
    const rows = moatRows ? moatRows.map((r) => esc(r)) : routine;
    return `<div class="grp">
      <div class="grp-head"><span class="grp-num">0${g + 1}</span><span class="grp-title">${esc(s[0])}</span><span class="grp-tag">${esc(s[1] || '')}</span></div>
      ${rows.map((r) => `<div class="item"><span class="box"></span><span class="txt">${r}</span><span class="chk"><input type="checkbox"></span></div>`).join('')}
    </div>`;
  }).join('');

  return _sh(`${prof.name} — Service Quality Checklist`, `
    .head{display:grid;grid-template-columns:64px 1fr;gap:18px;align-items:center;margin-bottom:26px}
    .head .ic{width:64px;height:64px;border-radius:18px;background:${theme.primary};color:#fff;display:flex;align-items:center;justify-content:center;font-size:1.9rem;box-shadow:0 14px 30px -14px ${theme.primary}}
    .head h1{font-size:1.55rem;font-weight:900;letter-spacing:-0.4px}
    .head p{font-size:0.78rem;opacity:0.55;margin-top:3px}
    .grp{margin-bottom:22px;page-break-inside:avoid}
    .grp-head{display:flex;align-items:center;gap:12px;margin-bottom:10px}
    .grp-num{width:34px;height:34px;border-radius:10px;background:${theme.accent};color:#fff;font-weight:900;font-size:0.85rem;display:flex;align-items:center;justify-content:center}
    .grp-title{font-size:1.02rem;font-weight:800;color:${theme.primary}}
    .grp-tag{margin-left:auto;font-size:0.7rem;font-weight:800;color:${theme.secondary};background:rgba(0,0,0,0.05);padding:4px 12px;border-radius:999px}
    .item{display:grid;grid-template-columns:26px 1fr 26px;gap:12px;align-items:center;padding:9px 4px;border-bottom:1px dashed #e2e8f0}
    .box{width:20px;height:20px;border:2px solid ${theme.secondary};border-radius:7px}
    .txt{font-size:0.9rem;color:#334155}
    .chk input{transform:scale(1.15);accent-color:${theme.accent}}
    .foot-note{margin-top:22px;background:${theme.primary};color:#fff;border-radius:16px;padding:18px 20px;display:flex;justify-content:space-between;align-items:center}
    .foot-note .lbl{font-size:0.64rem;letter-spacing:2px;text-transform:uppercase;opacity:0.6}
    .foot-note .val{font-weight:800;margin-top:3px}
  `, `
  <div class="page">
    <div class="head">
      <div class="ic">${esc(prof.emoji || '✅')}</div>
      <div><span class="pill">Checklist · ${new Date().getFullYear()} edition</span>
      <h1>${esc(prof.name)} — Quality Checklist</h1>
      <p>Five non-negotiables per service · print one per job · tick as you go</p></div>
    </div>
    ${groups}
    <div class="foot-note">
      <div><div class="lbl">Total services covered</div><div class="val">${services.length || 1} routines · 5 steps each</div></div>
      <div style="text-align:right"><div class="lbl">Notes / corrections</div><div class="val" contenteditable="true">______________________</div></div>
    </div>
  </div>`, theme);
}
// ── JOURNAL (30-day recovery / reflection) ───────────────────────────────
function buildJournalHTML(prof, theme, prompts) {
  const _sh = (theme && theme.dna) ? shellDNA : shell;
  const days = prompts && prompts.length ? prompts : Array.from({ length: 30 }, (_, i) => [
    'What am I grateful for today?', 'What challenged me?', 'How did I grow?',
    'What do I hope for tomorrow?', 'One word to describe today'
  ]);
  const dayBlocks = days.map((qs, i) => `
    <div class="day">
      <div class="day-head"><span class="daynum">Day ${i + 1}</span><span class="dateline">Date: ________________________</span></div>
      ${qs.map((q) => `<div class="q"><span class="qmark">${i % 5 === 4 ? '🙏' : '✎'}</span><div><div class="qtext">${esc(q)}</div><div class="lines"></div></div></div>`).join('')}
    </div>`).join('');

  return _sh(`${prof.name} — 30-Day Journal`, `
    .cover{height:1123px;background:${theme.primary};color:#fff;padding:120px 60px;display:flex;flex-direction:column;justify-content:center;position:relative}
    .cover .emoji{font-size:4.5rem;margin-bottom:20px}
    .cover .tagbox{position:absolute;top:44px;right:46px}
    .cover h1{font-size:3rem;font-weight:900;letter-spacing:-1px;margin:16px 0 10px}
    .cover .sub{font-size:1.05rem;opacity:0.78;max-width:420px}
    .cover .rule{width:70px;height:5px;background:${theme.accent};border-radius:99px;margin:26px 0}
    .cover .foot{position:absolute;bottom:54px;left:60px;font-size:0.75rem;opacity:0.5;letter-spacing:2px;text-transform:uppercase}
    .day{page-break-inside:avoid;margin-bottom:26px;background:#fff;border:1px solid rgba(15,23,42,0.07);border-radius:18px;box-shadow:0 12px 28px -20px rgba(15,23,42,0.4);padding:20px 24px}
    .day-head{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid ${theme.accent};padding-bottom:10px;margin-bottom:14px}
    .daynum{font-weight:900;font-size:1rem;color:${theme.primary}}
    .dateline{font-size:0.75rem;opacity:0.5}
    .q{display:grid;grid-template-columns:26px 1fr;gap:10px;margin:10px 0}
    .qmark{width:24px;height:24px;border-radius:8px;background:${theme.accent};color:#fff;font-size:0.8rem;display:flex;align-items:center;justify-content:center}
    .qtext{font-size:0.88rem;color:#334155;font-weight:600}
    .lines{border-bottom:1px dashed #dbe3ec;height:20px;margin-top:6px}
  `, `
  <div class="page" style="padding:0">
    <div class="cover">
      <div class="tagbox"><span class="pill" style="border:1px solid rgba(255,255,255,0.35);background:transparent">30-Day Journal</span></div>
      <div class="emoji">${esc(prof.emoji || '📓')}</div>
      <h1>${esc(prof.name)}</h1>
      <div class="sub">Daily prompts, honest reflection, steady progress. One page a day — meet yourself where you are.</div>
      <div class="rule"></div>
      <div class="foot">NicheGate · ${new Date().getFullYear()} edition</div>
    </div>
  </div>
  <div class="page">${dayBlocks}</div>`, theme);
}
// ═══════════════════════════════════════════════════════════════════════════
// RECOVERY / 12-STEP PRODUCT BUILDERS
// Peer-support recovery is non-commercial, but people IN recovery buy personal
// tools. These carry the program's own language ("Just for Today", the
// Serenity Prayer) and a calm, sophisticated, cute aesthetic — a set that
// looks intentional together, not random per-niche DNA.
// ═══════════════════════════════════════════════════════════════════════════
const RECOVERY_PALETTE = {
  primary: '#2c4a3e',   // deep forest sage
  accent: '#6f9384',    // soft sage
  bg: '#f6f1e7',        // warm cream
  ink: '#2b2620',
  gold: '#b08d57',      // warm brass
  rose: '#c48b8b',      // dusty rose
  line: '#d9cfc0',
};
const SERENITY_PRAYER = 'God, grant me the serenity to accept the things I cannot change, courage to change the things I can, and wisdom to know the difference.';

// ── "JUST FOR TODAY" RECOVERY JOURNAL ────────────────────────────────────
function buildRecoveryJournalHTML(prof, theme, prompts) {
  const _sh = (theme && theme.dna) ? shellDNA : shell;
  const P = RECOVERY_PALETTE;
  const niche = prof.name.replace(/\s*\(.*?\)\s*/g, '').trim();
  const daySets = prompts && prompts.length ? prompts : [
    ['What am I grateful for today?', 'What challenged me and how did I respond?', 'How did I practice acceptance today?', 'One thing I learned about myself', 'My intention for tomorrow'],
    ['What fear did I face today?', 'How was I of service to someone?', 'What am I holding onto that I can release?', 'What spiritual principle did I practice?', 'What do I need for tomorrow?']
  ];
  // Build 30 days cycling through the prompt sets.
  const days = Array.from({ length: 30 }, (_, i) => daySets[i % daySets.length]);
  const dayBlocks = days.map((qs, i) => `
    <div class="jpage">
      <div class="jpage-head">
        <div class="jft">Just for Today</div>
        <div class="serenity">${esc(SERENITY_PRAYER)}</div>
      </div>
      <div class="dateline">Date: ______________________&nbsp;&nbsp;·&nbsp;&nbsp;Day ${i + 1} of 30</div>
      ${qs.map((q) => `<div class="q"><div class="qtext">${esc(q)}</div><div class="lines"></div><div class="lines"></div></div>`).join('')}
      <div class="grat">
        <div class="grat-head">Three things I'm grateful for</div>
        <div class="grat-lines"><span>1.</span><span>2.</span><span>3.</span></div>
      </div>
      <div class="jpage-foot">${esc(niche)} · One day at a time</div>
    </div>`).join('');

  return _sh(`${niche} — Just for Today Journal`, `
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Georgia,'Times New Roman',serif;color:${P.ink};background:${P.bg};line-height:1.6;font-size:13px}
    @page{size:A4;margin:10mm}
    .cover{min-height:1080px;background:linear-gradient(165deg,${P.primary} 0%,#1f382e 100%);color:#f6f1e7;padding:90px 60px;display:flex;flex-direction:column;justify-content:center;position:relative;page-break-after:always}
    .cover::before{content:"";position:absolute;inset:18px;border:1px solid rgba(246,241,231,.22);border-radius:6px;pointer-events:none}
    .cover .orn{font-size:1.6rem;color:${P.gold};letter-spacing:8px;margin-bottom:18px}
    .cover h1{font-size:3.4rem;font-weight:400;letter-spacing:2px;line-height:1.05;margin:0 0 8px;font-style:italic}
    .cover .sub{font-size:1.05rem;opacity:.82;max-width:440px;margin-top:14px;font-style:italic}
    .cover .rule{width:90px;height:2px;background:${P.gold};margin:30px 0}
    .cover .niche{font-size:.8rem;letter-spacing:4px;text-transform:uppercase;color:${P.accent}}
    .cover .foot{position:absolute;bottom:48px;left:60px;right:60px;display:flex;justify-content:space-between;font-size:.7rem;letter-spacing:2px;text-transform:uppercase;opacity:.6}
    .jpage{page-break-inside:avoid;background:#fffdf8;border:1px solid ${P.line};border-radius:14px;padding:26px 30px;margin-bottom:22px;min-height:940px;position:relative}
    .jpage-head{text-align:center;border-bottom:2px solid ${P.accent};padding-bottom:14px;margin-bottom:16px}
    .jft{font-size:1.7rem;font-style:italic;color:${P.primary};letter-spacing:1px}
    .serenity{font-size:.8rem;color:${P.accent};font-style:italic;margin-top:6px;max-width:520px;margin-left:auto;margin-right:auto}
    .dateline{font-size:.72rem;color:#9a8f7d;letter-spacing:1px;margin-bottom:16px}
    .q{margin:12px 0}
    .qtext{font-size:.86rem;color:#3a342c;font-weight:600;margin-bottom:4px}
    .lines{border-bottom:1px dotted #b3a48c;height:22px}
    .grat{margin-top:18px;border-top:1px dashed ${P.line};padding-top:12px}
    .grat-head{font-size:.78rem;color:${P.primary};font-weight:700;letter-spacing:.5px;margin-bottom:8px}
    .grat-lines{display:flex;gap:10px}
    .grat-lines span{flex:1;border-bottom:1px dotted #b3a48c;height:26px;font-size:.8rem;color:#9a8f7d}
    .jpage-foot{position:absolute;bottom:14px;left:30px;right:30px;text-align:center;font-size:.62rem;letter-spacing:2px;text-transform:uppercase;color:#b8ac97}
  `, `
  <div class="cover">
    <div class="orn">❦</div>
    <h1>Just for Today</h1>
    <div class="sub">A daily recovery journal — one page a day, honest reflection, steady progress. Meet yourself where you are.</div>
    <div class="rule"></div>
    <div class="niche">${esc(prof.name)}</div>
    <div class="foot"><span>30 Days of Reflection</span><span>NicheGate</span></div>
  </div>
  ${dayBlocks}`, { primary: P.primary, accent: P.accent, bg: P.bg });
}

// ── RECOVERY AFFIRMATION LABELS ──────────────────────────────────────────
const RECOVERY_AFFIRMATIONS = [
  'Just for today', 'One day at a time', 'Progress, not perfection',
  'I am enough', 'This too shall pass', 'Breathe. You are safe.',
  'I choose recovery', 'Let go and let God', 'Keep coming back',
  'Easy does it', 'First things first', 'I am stronger than my urges',
  'Today I am honest', 'Growth over comfort', 'I deserve this healing',
  'Act as if', 'One moment at a time', 'I am not alone'
];
function buildAffirmationLabelsHTML(prof, theme) {
  const _sh = (theme && theme.dna) ? shellDNA : shell;
  const P = RECOVERY_PALETTE;
  const niche = prof.name.replace(/\s*\(.*?\)\s*/g, '').trim();
  // Two sheets: 12 round labels (2.5") + 10 rectangular labels (2"x4").
  const round = RECOVERY_AFFIRMATIONS.slice(0, 12).map(a => `<div class="lbl round"><span>${esc(a)}</span></div>`).join('');
  const rect = RECOVERY_AFFIRMATIONS.map(a => `<div class="lbl rect"><span>${esc(a)}</span></div>`).join('');
  return _sh(`${niche} — Recovery Affirmation Labels`, `
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Georgia,'Times New Roman',serif;color:${P.ink};background:${P.bg};line-height:1.5;font-size:13px}
    @page{size:A4;margin:8mm}
    .sheet{page-break-after:always;background:#fff;padding:18px}
    .sheet:last-child{page-break-after:auto}
    .sheet-head{text-align:center;margin-bottom:14px}
    .sheet-head .t{font-size:1.3rem;font-style:italic;color:${P.primary}}
    .sheet-head .h{font-size:.68rem;letter-spacing:2px;text-transform:uppercase;color:#9a8f7d;margin-top:4px}
    .grid-round{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;padding:10px 20px}
    .grid-rect{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;padding:10px 20px}
    .lbl{display:flex;align-items:center;justify-content:center;text-align:center;border:1px dashed ${P.line}}
    .lbl.round{aspect-ratio:1;border-radius:50%;background:linear-gradient(160deg,#fbf7ee,#f1ead9)}
    .lbl.rect{aspect-ratio:2/1;border-radius:8px;background:linear-gradient(160deg,#fbf7ee,#f3ecdc)}
    .lbl span{font-size:.82rem;color:${P.primary};font-weight:600;padding:0 10px;font-style:italic}
    .cut{height:1px;background:${P.line};margin:6px 0}
    .tips{margin-top:16px;padding:14px 18px;background:#fbf7ee;border:1px solid ${P.line};border-radius:10px;font-size:.74rem;color:#6b6252}
    .tips b{color:${P.primary}}
  `, `
  <div class="sheet">
    <div class="sheet-head"><div class="t">Just for Today</div><div class="h">${esc(prof.name)} · Round Labels · cut on the dashed circles</div></div>
    <div class="grid-round">${round}</div>
    <div class="tips"><b>How to use:</b> print on sticker paper or cardstock. Stick them on your mirror, fridge, wallet, planner or water bottle — anywhere a reminder of your intention helps you through the day.</div>
  </div>
  <div class="sheet">
    <div class="sheet-head"><div class="t">One Day at a Time</div><div class="h">${esc(prof.name)} · Rectangle Labels · cut on the dashed lines</div></div>
    <div class="grid-rect">${rect}</div>
    <div class="tips"><b>Tip:</b> these 2×4 labels fit standard Avery 2"×4" shipping labels. Print, cut, and place one in each spot you'll see it — a gentle nudge toward your recovery, all day long.</div>
  </div>`, { primary: P.primary, accent: P.accent, bg: P.bg });
}

// ── RECOVERY CLEANSE & NUTRITION GUIDE ───────────────────────────────────
function buildRecoveryNutritionHTML(prof, theme) {
  const _sh = (theme && theme.dna) ? shellDNA : shell;
  const P = RECOVERY_PALETTE;
  const niche = prof.name.replace(/\s*\(.*?\)\s*/g, '').trim();
  const smoothies = [
    ['Green Reset', 'Spinach, banana, almond milk, ginger, chia', 'Iron + steady energy without the sugar spike'],
    ['Berry Calm', 'Blueberries, Greek yogurt, oats, honey, flax', 'Antioxidants + protein to steady mood'],
    ['Tropical Gut', 'Pineapple, coconut water, mint, lime', 'Digestive enzymes + hydration'],
    ['Chocolate Heal', 'Cacao, banana, peanut butter, oat milk, dates', 'Curbs chocolate cravings the healthy way']
  ];
  const snacks = [
    'Apple slices with almond butter', 'Hummus with carrot & cucumber sticks', 'Hard-boiled egg + everything seasoning',
    'Trail mix (nuts, seeds, dark chocolate)', 'Greek yogurt with berries & honey', 'Rice cake with avocado & sea salt',
    'Celery with peanut butter & raisins', 'Whole-grain toast with mashed banana', 'Cottage cheese with pineapple'
  ];
  const days = ['Day 1 — Reset', 'Day 2 — Hydrate', 'Day 3 — Greens', 'Day 4 — Protein', 'Day 5 — Balance', 'Day 6 — Comfort', 'Day 7 — Maintain'];
  return _sh(`${niche} — Recovery Cleanse & Nutrition Guide`, `
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Georgia,'Times New Roman',serif;color:${P.ink};background:${P.bg};line-height:1.6;font-size:13px}
    @page{size:A4;margin:12mm}
    .cover{min-height:1080px;background:linear-gradient(165deg,${P.primary} 0%,#1f382e 100%);color:#f6f1e7;padding:90px 60px;display:flex;flex-direction:column;justify-content:center;position:relative;page-break-after:always}
    .cover::before{content:"";position:absolute;inset:18px;border:1px solid rgba(246,241,231,.22);border-radius:6px;pointer-events:none}
    .cover .orn{font-size:2rem;margin-bottom:16px}
    .cover h1{font-size:2.8rem;font-weight:400;font-style:italic;line-height:1.08;margin:0 0 10px}
    .cover .sub{font-size:1rem;opacity:.82;max-width:430px;margin-top:12px;font-style:italic}
    .cover .rule{width:90px;height:2px;background:${P.gold};margin:26px 0}
    .cover .niche{font-size:.78rem;letter-spacing:4px;text-transform:uppercase;color:${P.accent}}
    .pg{page-break-inside:avoid;background:#fffdf8;border:1px solid ${P.line};border-radius:14px;padding:28px 32px;margin-bottom:22px}
    .pg h2{font-size:1.3rem;font-style:italic;color:${P.primary};margin-bottom:10px}
    .pg p{font-size:.88rem;color:#3a342c;margin-bottom:10px}
    .pg .lead{font-size:.92rem;color:#4a4438}
    .row{display:grid;grid-template-columns:1fr 2fr 1.4fr;gap:10px;padding:8px 0;border-bottom:1px dotted ${P.line};font-size:.8rem}
    .row.head{font-weight:700;color:${P.primary};letter-spacing:.5px;text-transform:uppercase;font-size:.68rem;border-bottom:2px solid ${P.accent}}
    .row .n{font-weight:600}
    .row .d{color:#5c5546}
    .row .b{color:${P.accent};font-style:italic}
    .chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
    .chip{background:#f1ead9;border:1px solid ${P.line};border-radius:999px;padding:5px 12px;font-size:.76rem;color:#3a342c}
    .dayplan{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-top:10px}
    .day{background:#f6f1e7;border:1px solid ${P.line};border-radius:10px;padding:10px;text-align:center;font-size:.74rem}
    .day b{display:block;color:${P.primary};font-size:.8rem;margin-bottom:4px}
    .note{margin-top:14px;padding:12px 16px;background:#fbf7ee;border-left:3px solid ${P.accent};font-size:.78rem;color:#5c5546;font-style:italic}
  `, `
  <div class="cover">
    <div class="orn">🥗</div>
    <h1>Nourish Your Recovery</h1>
    <div class="sub">A gentle cleanse and real-food nutrition guide for the body that's healing — because what you eat shapes how you feel.</div>
    <div class="rule"></div>
    <div class="niche">${esc(prof.name)}</div>
  </div>
  <div class="pg">
    <h2>Why food matters in recovery</h2>
    <p class="lead">Early recovery is hard on the body. Blood sugar swings, caffeine crashes and sugar cravings can mimic anxiety and trigger urges. Eating real food on a steady rhythm is one of the most powerful, underrated tools you have.</p>
    <p>This guide is <b>not</b> a restrictive diet. It's a way to steady your energy, calm your nervous system and give your body what it needs to heal — while you do the deeper work.</p>
    <div class="note">Always check with your doctor or a registered dietitian before starting any cleanse, especially if you're on medication or in early recovery.</div>
  </div>
  <div class="pg">
    <h2>The sugar-craving buster</h2>
    <p>When a craving hits, your body is usually asking for <b>protein, water or steady energy</b> — not sugar. Reach for one of these first:</p>
    <div class="chips">${snacks.map(s => `<span class="chip">${esc(s)}</span>`).join('')}</div>
    <p style="margin-top:12px">Then drink a full glass of water and wait 10 minutes. Most cravings pass.</p>
  </div>
  <div class="pg">
    <h2>Healing smoothies</h2>
    <p>Four simple blends that steady blood sugar and taste like a treat:</p>
    <div class="row head"><span>Smoothie</span><span>Ingredients</span><span>Why it helps</span></div>
    ${smoothies.map(s => `<div class="row"><span class="n">${esc(s[0])}</span><span class="d">${esc(s[1])}</span><span class="b">${esc(s[2])}</span></div>`).join('')}
  </div>
  <div class="pg">
    <h2>A gentle 7-day rhythm</h2>
    <p>No deprivation — just a simple daily focus to build the habit:</p>
    <div class="dayplan">${days.map(d => { const [day, focus] = d.split(' — '); return `<div class="day"><b>${esc(day)}</b>${esc(focus)}</div>`; }).join('')}</div>
    <div class="note">Day 1: cut refined sugar & processed snacks. Day 2: double your water. Day 3: add a green to every meal. Day 4: protein at breakfast. Day 5: balance each plate. Day 6: a comforting real-food meal. Day 7: pick the habits that felt good and keep going.</div>
  </div>`, { primary: P.primary, accent: P.accent, bg: P.bg });
}

// ── MEETING FACILITATOR FLASHCARDS ───────────────────────────────────────
const MEETING_ROLES = [
  { role: 'Chair / President', icon: '🎙️', duties: ['Opens the meeting on time and sets the tone', 'Keeps discussion focused and respectful', 'Manages the speaker list fairly', 'Closes the meeting on time'], tip: 'A good chair serves the meeting, not their own opinion.' },
  { role: 'Vice President', icon: '🤝', duties: ['Steps in when the chair is absent', 'Coordinates speakers and topics for the month', 'Supports newcomers and greeters', 'Helps plan special events'], tip: 'Learn the chair role — you are the backup every single week.' },
  { role: 'Secretary', icon: '📝', duties: ['Takes accurate, brief meeting notes', 'Tracks attendance and anniversaries', 'Manages the literature and supplies', 'Handles correspondence and the meeting list'], tip: 'Notes should capture decisions and commitments, not every word.' },
  { role: 'Treasurer', icon: '💰', duties: ['Collects and counts the contributions', 'Keeps a clear, simple ledger', 'Pays the rent and group expenses', 'Reports the balance honestly each month'], tip: 'Prudent reserves — the group\'s tradition of self-support depends on you.' },
  { role: 'Greeter', icon: '👋', duties: ['Welcomes every person at the door', 'Offers a hand to newcomers', 'Shares literature and meeting info', 'Connects newcomers with a temporary sponsor'], tip: 'The greeter sets whether someone ever comes back.' },
  { role: 'Coffee & Setup', icon: '☕', duties: ['Arrives early to set up chairs', 'Makes the coffee and tidies the space', 'Resets the room after the meeting', 'Keeps supplies stocked'], tip: 'The invisible job that makes every meeting feel cared-for.' }
];
function buildMeetingFlashcardsHTML(prof, theme) {
  const _sh = (theme && theme.dna) ? shellDNA : shell;
  const P = RECOVERY_PALETTE;
  const niche = prof.name.replace(/\s*\(.*?\)\s*/g, '').trim();
  const card = r => `
    <div class="fc">
      <div class="fc-role"><span class="fc-icon">${r.icon}</span>${esc(r.role)}</div>
      <div class="fc-label">Your duties</div>
      <ul class="fc-duties">${r.duties.map(d => `<li>${esc(d)}</li>`).join('')}</ul>
      <div class="fc-tip">${esc(r.tip)}</div>
    </div>`;
  // One card per page — large, spacious, unambiguously legible at thumbnail
  // scale (the design critic flags dense small text as "garbled"). Each card
  // fills the page so the cover preview shows one clean, complete role card.
  const pages = MEETING_ROLES.map(r => `<div class="fpage">${card(r)}</div>`);
  return _sh(`${niche} — Meeting Facilitator Flashcards`, `
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Georgia,'Times New Roman',serif;color:${P.ink};background:${P.bg};line-height:1.55;font-size:13px}
    @page{size:A4;margin:10mm}
    .fpage{page-break-after:always;display:flex;flex-direction:column;padding:10px}
    .fpage:last-child{page-break-after:auto}
    .fc{background:linear-gradient(165deg,#fffdf8,#f6f1e7);border:1px solid ${P.line};border-radius:18px;padding:40px 44px;position:relative;min-height:920px;box-shadow:0 8px 22px -16px rgba(43,38,32,.4)}
    .fc::after{content:"cut here";position:absolute;bottom:14px;left:0;right:0;text-align:center;font-size:.66rem;letter-spacing:2px;text-transform:uppercase;color:#c4b89f}
    .fc-role{font-size:2rem;font-style:italic;color:${P.primary};border-bottom:3px solid ${P.accent};padding-bottom:14px;margin-bottom:22px;display:flex;align-items:center;gap:14px}
    .fc-icon{font-size:2.2rem}
    .fc-label{font-size:.8rem;letter-spacing:2px;text-transform:uppercase;color:#9a8f7d;margin-bottom:12px}
    .fc-duties{list-style:none;margin:0 0 20px}
    .fc-duties li{font-size:1.25rem;color:#3a342c;padding:11px 0 11px 30px;position:relative;line-height:1.4}
    .fc-duties li::before{content:"✓";position:absolute;left:0;color:${P.accent};font-weight:700;font-size:1.3rem}
    .fc-tip{position:absolute;bottom:44px;left:44px;right:44px;font-size:1.05rem;font-style:italic;color:${P.primary};background:#f1ead9;border-radius:10px;padding:12px 16px}
    .intro{background:#fffdf8;border:1px solid ${P.line};border-radius:14px;padding:26px 30px;margin-bottom:20px}
    .intro h1{font-size:1.7rem;font-style:italic;color:${P.primary};margin-bottom:10px}
    .intro p{font-size:1rem;color:#3a342c}
  `, `
  <div class="intro">
    <h1>Meeting Facilitator Flashcards</h1>
    <p>One card per service position — print on cardstock and cut on the lines.</p>
  </div>
  ${pages.join('')}`, { primary: P.primary, accent: P.accent, bg: P.bg });
}

// ── BRAND KIT ────────────────────────────────────────────────────────────
function buildBrandKitHTML(prof, theme) {
  const _sh = (theme && theme.dna) ? shellDNA : shell;
  const swatches = [
    { c: theme.primary, name: 'Primary', use: 'Headers · logo · 55%' },
    { c: theme.secondary, name: 'Secondary', use: 'Accents · links · 25%' },
    { c: theme.accent, name: 'Highlight', use: 'CTAs · emphasis · 15%' },
    { c: '#ffffff', name: 'Background', use: 'Canvas · 5%' }
  ];
  const swatchHtml = swatches.map((sw) => `
    <div class="sw">
      <div class="swatch" style="background:${sw.c};${sw.c === '#ffffff' ? 'border:1px solid #e2e8f0' : ''}"></div>
      <div class="sw-name">${esc(sw.name)}</div>
      <div class="sw-hex">${esc(sw.c)}</div>
      <div class="sw-use">${esc(sw.use)}</div>
    </div>`).join('');

  return _sh(`${prof.name} — Brand Identity Kit`, `
    .cover{border-radius:0 0 40px 40px;background:${theme.primary};color:#fff;padding:96px 60px;position:relative}
    .cover .logo-mark{width:92px;height:92px;border-radius:26px;background:${theme.accent};display:flex;align-items:center;justify-content:center;font-size:3rem;box-shadow:0 24px 50px -20px rgba(0,0,0,0.45)}
    .cover h1{font-size:2.6rem;font-weight:900;margin:22px 0 8px;letter-spacing:-0.8px}
    .cover .orphan{margin-top:26px;width:230px;height:5px;background:${theme.accent};border-radius:99px}
    h2.sec{font-size:0.7rem;letter-spacing:2.4px;text-transform:uppercase;opacity:0.45;margin:34px 0 14px;display:flex;align-items:center;gap:12px}
    h2.sec::after{content:"";flex:1;height:1px;background:#e2e8f0}
    .lockups{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}
    .lock{background:#fff;border:1px solid rgba(15,23,42,0.07);border-radius:16px;padding:26px;text-align:center;box-shadow:0 10px 24px -18px rgba(15,23,42,0.35)}
    .lock .mark{font-size:2.4rem}
    .lock .name{font-weight:800;margin-top:8px;font-size:0.95rem}
    .lock .use{font-size:0.7rem;opacity:0.5;margin-top:4px}
    .lock.dark{background:${theme.primary};color:#fff}
    .lock.out{border:2px dashed ${theme.secondary}}
    .sw-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
    .sw{background:#fff;border:1px solid rgba(15,23,42,0.07);border-radius:16px;padding:14px;text-align:center;box-shadow:0 10px 24px -18px rgba(15,23,42,0.35)}
    .swatch{height:86px;border-radius:12px;margin-bottom:10px}
    .sw-name{font-weight:800;font-size:0.8rem}
    .sw-hex{font-size:0.68rem;opacity:0.5;margin:2px 0 6px}
    .sw-use{font-size:0.66rem;color:#64748b;line-height:1.4}
    .type-block{background:#fff;border:1px solid rgba(15,23,42,0.07);border-radius:16px;padding:22px 26px;margin-bottom:14px}
    .type-block .tt{font-size:0.64rem;letter-spacing:1.8px;text-transform:uppercase;opacity:0.45;margin-bottom:8px}
    .bizcard{width:340px;height:196px;border-radius:14px;padding:20px 22px;display:flex;flex-direction:column;justify-content:space-between;color:#fff;box-shadow:0 24px 44px -22px rgba(15,23,42,0.5)}
  `, `
  <div class="page">
    <div class="cover">
      <div class="logo-mark">${esc(prof.emoji || '🎨')}</div>
      <h1>${esc(prof.name)}</h1>
      <div style="font-size:0.9rem;opacity:0.75">Brand Identity Kit · v1.0 · ${new Date().getFullYear()}</div>
      <div class="orphan"></div>
    </div>
    <h2 class="sec">Logo Lockups</h2>
    <div class="lockups">
      <div class="lock"><div class="mark">${esc(prof.emoji || '▼')}</div><div class="name">${esc(prof.name)}</div><div class="use">Primary — light backgrounds</div></div>
      <div class="lock dark"><div class="mark">${esc(prof.emoji || '▼')}</div><div class="name">${esc(prof.name)}</div><div class="use">On-brand — dark backgrounds</div></div>
      <div class="lock out"><div class="mark">${esc(prof.emoji || '▼')}</div><div class="name">${esc(prof.name)}</div><div class="use">Outline — restraint moment</div></div>
    </div>
    <h2 class="sec">Color Palette</h2>
    <div class="sw-grid">${swatchHtml}</div>
    <h2 class="sec">Typography Scale</h2>
    <div class="type-block"><div class="tt">Display — headline</div><div style="font-size:1.9rem;font-weight:900;letter-spacing:-0.5px">Elevate every booking.</div></div>
    <div class="type-block"><div class="tt">Heading — subheadline</div><div style="font-size:1.15rem;font-weight:800">${esc(prof.name)} — trusted, on time.</div></div>
    <div class="type-block"><div class="tt">Body — paragraph</div><div style="font-size:0.82rem;color:#475569;max-width:520px">Professional services that build trust — clear scopes, honest pricing, and follow-through on every single job.</div></div>
    <h2 class="sec">Business Card</h2>
    <div style="display:flex;gap:18px;flex-wrap:wrap">
      <div class="bizcard" style="background:${theme.primary}">
        <div style="display:flex;align-items:center;gap:10px"><div style="font-size:1.6rem">${esc(prof.emoji || '▼')}</div><div style="font-weight:900">${esc(prof.name)}</div></div>
        <div style="font-size:0.72rem;opacity:0.78;line-height:1.6">Your Name, Lead<br>hello@${esc(prof.slug)}.com · (555) 123-4567</div>
      </div>
      <div class="bizcard" style="background:${theme.accent};color:${theme.primary}">
        <div style="display:flex;align-items:center;gap:10px"><div style="font-size:1.6rem">${esc(prof.emoji || '▼')}</div><div style="font-weight:900">${esc(prof.name)}</div></div>
        <div style="font-size:0.72rem;line-height:1.6">Alternate accent version<br>turns the CTA colour into the face</div>
      </div>
    </div>
  </div>`, theme);
}
// ── SPREADSHEET / BOOKING DASHBOARD PREVIEW ─────────────────────────────
function buildTablePreviewHTML(product, prof, theme, which) {
  const services = parseServices(prof);
  const safe = services.length ? services : [["Professional Consultation", "$50"], ["Follow-up & Support", "$25"]];
  const estRev = safe.reduce((a, s) => a + (priceNum(s[1]) || 0), 0);
  const isBooking = which === 'booking';
  const headRight = isBooking
    ? ['Client', 'Date', 'Status'].map((h) => `<th>${h}</th>`).join('')
    : '<th class="num">Qty</th><th class="num">Total</th>';
  const previewRows = safe.map((s) => `
    <tr>
      <td class="strong">${esc(s[0])}</td>
      <td class="num">1</td>
      <td class="num strong">${esc(s[1] || '—')}</td>
      <td>${isBooking ? '<span class="status open">Booking</span>' : ''}</td>
    </tr>`
  ).join('');

  return shell(`${prof.name} — ${productCopy.deriveTitle(product, prof) || (isBooking ? 'Booking & Appointment Tracker' : 'Pricing Calculator')}`, `
    .dash-head{display:flex;align-items:center;gap:16px;margin-bottom:22px}
    .dash-head .ic{width:58px;height:58px;border-radius:16px;background:${theme.primary};color:#fff;display:flex;align-items:center;justify-content:center;font-size:1.7rem;box-shadow:0 14px 28px -14px ${theme.primary}}
    .dash-head h1{font-size:1.5rem;font-weight:900;letter-spacing:-0.4px}
    .dash-head p{font-size:0.78rem;opacity:0.55;margin-top:3px}
    .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:20px}
    .stat{background:#fff;border:1px solid rgba(15,23,42,0.07);border-left:4px solid ${theme.accent};border-radius:14px;padding:14px 16px;box-shadow:0 10px 22px -18px rgba(15,23,42,0.35)}
    .stat .lbl{font-size:0.62rem;letter-spacing:1.6px;text-transform:uppercase;opacity:0.5}
    .stat .val{font-size:1.5rem;font-weight:900;margin-top:4px}
    .stat .sub{font-size:0.68rem;color:#64748b;margin-top:2px}
    table{width:100%;border-collapse:collapse;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 14px 34px -24px rgba(15,23,42,0.5)}
    thead th{font-size:0.62rem;letter-spacing:1.6px;text-transform:uppercase;padding:12px 14px;background:${theme.primary};color:#fff;text-align:left}
    tbody td{padding:12px 14px;border-bottom:1px solid #edf1f7;font-size:0.84rem}
    tbody tr:last-child td{border-bottom:none}
    .num{text-align:right;font-variant-numeric:tabular-nums}
    .strong{font-weight:800}
    .muted{color:#94a3b8}
    .status{font-size:0.66rem;font-weight:800;padding:4px 10px;border-radius:999px}
    .status.open{background:rgba(45,212,191,0.14);color:#0f766e}
    .hint{margin-top:18px;display:flex;justify-content:space-between;align-items:center;background:${theme.primary};color:#fff;border-radius:14px;padding:14px 18px}
    .hint .lbl{font-size:0.62rem;letter-spacing:1.8px;text-transform:uppercase;opacity:0.6}
    .hint .val{font-size:0.86rem;font-weight:700}
  `, `
  <div class="page">
    <div class="dash-head">
      <div class="ic">${isBooking ? '📅' : '🧮'}</div>
      <div><span class="pill">${isBooking ? 'Tracker' : 'Calculator'} · Excel-ready</span>
      <h1>${esc(prof.name)} — ${isBooking ? 'Booking & Appointment Tracker' : 'Pricing Calculator'}</h1>
      <p>Real formulas · drop-down statuses · totals update live when you type</p></div>
    </div>
    <div class="stats">
      <div class="stat"><div class="lbl">Service lines</div><div class="val">${safe.length}</div><div class="sub">pre-filled, editable</div></div>
      <div class="stat"><div class="lbl">Est. catalog value</div><div class="val">$${estRev.toFixed(0)}</div><div class="sub">at 1× each</div></div>
      <div class="stat"><div class="lbl">Formulas</div><div class="val">LIVE</div><div class="sub">SUM · × · drop-downs</div></div>
    </div>
    <table>
      <thead><tr><th>${isBooking ? 'Service / Slot' : 'Service / Item'}</th>${headRight}</tr></thead>
      <tbody>${previewRows}</tbody>
    </table>
    <div class="hint"><div><div class="lbl">Opens in</div><div class="val">Excel · Google Sheets · Numbers</div></div><div><div class="lbl">Last refreshed</div><div class="val">${new Date().toLocaleDateString()}</div></div></div>
  </div>`, theme);
}
// ── PRICING SHEET PREVIEW (exact mirror of the sold file's Pricing tab) ──
// Uses the same row model as xlsxGenerator.buildPricingSheet, so the cover's
// tablet shows the columns, quantities and totals the buyer actually receives.
function buildPricingSheetPreviewHTML(product, prof, theme) {
  const xlsxGen = require('./xlsxGenerator');
  const m = xlsxGen.pricingSheetModel(prof);
  const money = (v) => (typeof v === 'number'
    ? '$' + v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    : esc(v));
  const rows = m.lines.map((l) => `<tr>
      <td class="strong">${esc(l.name)}</td>
      <td class="num">${money(l.basePrice)}</td>
      <td class="num">${l.qty}</td>
      <td class="num strong">${money(l.total)}</td>
      <td class="num">${l.marginPct}%</td>
      <td class="num">${money(Math.round(l.net * 100) / 100)}</td></tr>`).join('');
  const taxPct = Math.round(m.taxRate * 100);

  return shell(`${prof.name} — ${productCopy.deriveTitle(product, prof) || 'Pricing Calculator'}`, `
    .dash-head{display:flex;align-items:center;gap:16px;margin-bottom:20px}
    .dash-head .ic{width:52px;height:52px;border-radius:14px;background:${theme.primary};color:#fff;display:flex;align-items:center;justify-content:center;font-size:1.5rem}
    .dash-head h1{font-size:1.4rem;font-weight:900;letter-spacing:-0.4px}
    .dash-head p{font-size:0.74rem;opacity:0.55;margin-top:3px}
    .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:18px}
    .stat{background:#fff;border:1px solid rgba(15,23,42,0.07);border-left:4px solid ${theme.accent};border-radius:12px;padding:12px 14px}
    .stat .lbl{font-size:0.6rem;letter-spacing:1.4px;text-transform:uppercase;opacity:0.5}
    .stat .val{font-size:1.3rem;font-weight:900;margin-top:4px}
    .stat .sub{font-size:0.66rem;color:#64748b;margin-top:2px}
    table{width:100%;border-collapse:collapse;background:#fff;border-radius:14px;overflow:hidden}
    thead th{font-size:0.85rem;letter-spacing:1px;text-transform:uppercase;padding:12px 14px;background:${theme.primary};color:#fff;text-align:left}
    tbody td{padding:12px 14px;border-bottom:1px solid #edf1f7;font-size:1.05rem}
    .num{text-align:right;font-variant-numeric:tabular-nums}
    .strong{font-weight:800}
    tfoot td{padding:12px 14px;font-size:1.05rem;background:#f8fafc}
    tfoot .grand td{font-weight:900;font-size:0.92rem;background:${theme.primary};color:#fff}
    .hint{margin-top:16px;display:flex;justify-content:space-between;align-items:center;background:${theme.primary};color:#fff;border-radius:12px;padding:12px 16px}
    .hint .lbl{font-size:0.6rem;letter-spacing:1.6px;text-transform:uppercase;opacity:0.6}
    .hint .val{font-size:0.82rem;font-weight:700}
  `, `
  <div class="page">
    <div class="dash-head">
      <div class="ic">🧮</div>
      <div><h1>${esc(prof.name)} — Pricing Calculator</h1>
      <p>Edit quantities — totals recalculate automatically</p></div>
    </div>
    <div class="stats">
      <div class="stat"><div class="lbl">Service lines</div><div class="val">${m.lines.length}</div><div class="sub">pre-filled, editable</div></div>
      <div class="stat"><div class="lbl">Grand total</div><div class="val">${money(Math.round(m.grand * 100) / 100)}</div><div class="sub">incl. ${taxPct}% tax</div></div>
      <div class="stat"><div class="lbl">Margin</div><div class="val">${m.lines.length ? m.lines[0].marginPct + '%' : '—'}</div><div class="sub">built into every line</div></div>
    </div>
    <table>
      <thead><tr><th>Service</th><th class="num">Base Price</th><th class="num">Qty</th><th class="num">Line Total</th><th class="num">Margin %</th><th class="num">Net</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr><td colspan="3"></td><td class="num">Subtotal</td><td></td><td class="num">${money(Math.round(m.subtotal * 100) / 100)}</td></tr>
        <tr><td colspan="3"></td><td class="num">Tax (${taxPct}%)</td><td></td><td class="num">${money(Math.round(m.tax * 100) / 100)}</td></tr>
        <tr class="grand"><td colspan="3"></td><td class="num">Grand Total</td><td></td><td class="num">${money(Math.round(m.grand * 100) / 100)}</td></tr>
      </tfoot>
    </table>
    <div class="hint"><div><div class="lbl">Opens in</div><div class="val">Excel · Google Sheets · Numbers</div></div><div><div class="lbl">Formulas</div><div class="val">LIVE</div></div></div>
  </div>`, theme);
}
// ── DECISION MATRIX ──────────────────────────────────────────────────────
function buildDecisionMatrixHTML(product, prof, theme) {
  const services = parseServices(prof);
  const safe = services.length ? services.slice(0, 5) : [["Option A"], ["Option B"], ["Option C"]];
  const criteria = [
    { name: 'Cost to deliver', weight: 25 },
    { name: 'Client value', weight: 35 },
    { name: 'Effort needed', weight: 20 },
    { name: 'Repeat odds', weight: 20 }
  ];
  const optRows = safe.map((s, i) => `<tr><td class="strong">${esc(s[0])}</td>
    ${criteria.map((c, j) => `<td class="num">${[3, 4, 2, 3, 4, 3, 2, 3][(i + j * 4) % 8]}</td>`).join('')}
    <td class="num strong">${[74, 82, 66, 78, 71, 69, 84, 73][i % 8]}</td>
    <td>${i === 1 ? '<span class="badge">BEST FIT</span>' : ''}</td></tr>`).join('');

  return shell(`${prof.name} — Decision Scoring Matrix`, `
    .dm-head{display:grid;grid-template-columns:58px 1fr;gap:16px;align-items:center;margin-bottom:24px}
    .dm-head .ic{width:58px;height:58px;border-radius:16px;background:${theme.primary};color:#fff;display:flex;align-items:center;justify-content:center;font-size:1.7rem}
    .dm-head h1{font-size:1.45rem;font-weight:900;letter-spacing:-0.4px}
    .dm-head p{font-size:0.78rem;opacity:0.55;margin-top:3px}
    .key-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
    .key{background:#fff;border:1px solid rgba(15,23,42,0.07);border-radius:14px;padding:12px 14px;box-shadow:0 10px 22px -18px rgba(15,23,42,0.35)}
    .key .lbl{font-size:0.6rem;letter-spacing:1.4px;text-transform:uppercase;opacity:0.5}
    .key .val{font-weight:900;font-size:1.25rem;margin-top:4px}
    table{width:100%;border-collapse:collapse;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 14px 34px -24px rgba(15,23,42,0.5)}
    thead th{font-size:0.6rem;letter-spacing:1.4px;text-transform:uppercase;padding:12px;background:${theme.primary};color:#fff;text-align:center}
    thead th:first-child, tbody td:first-child{text-align:left}
    tbody td{padding:12px;border-bottom:1px solid #edf1f7;font-size:0.82rem;text-align:center}
    tbody tr:last-child td{border-bottom:none}
    .badge{font-size:0.62rem;font-weight:900;background:${theme.accent};color:${theme.primary};padding:4px 10px;border-radius:999px}
    .note{border-left:3px solid ${theme.accent};background:#fff;border-radius:0 12px 12px 0;padding:12px 16px;font-size:0.76rem;color:#475569;margin-top:18px}
  `, `
  <div class="page">
    <div class="dm-head">
      <div class="ic">⚖️</div>
      <div><span class="pill">Scoring matrix</span>
      <h1>${esc(prof.name)} — Decision Matrix</h1>
      <p>Score every option 1–5 per criterion; totals decide</p></div>
    </div>
    <div class="key-grid">
      ${criteria.map((c) => `<div class="key"><div class="lbl">${esc(c.name)}</div><div class="val">${c.weight}%</div></div>`).join('')}
    </div>
    <table>
      <thead><tr><th>Option</th>${criteria.map((c) => `<th>${esc(c.name)}</th>`).join('')}<th>Score</th><th>Rank</th></tr></thead>
      <tbody>${optRows}</tbody>
    </table>
    <div class="note"><strong>How it works:</strong> weights reflect what matters most to ${esc(prof.name)} — client value rises to the top, routine items score lower. Re-score monthly or when pricing changes.</div>
  </div>`, theme);
}
// ── ROI CALCULATOR ───────────────────────────────────────────────────────
function buildROIHTML(product, prof, theme) {
  const services = parseServices(prof);
  const first = services[0];
  const price = first ? (priceNum(first[1]) || 0) : 0;

  return shell(`${prof.name} — ROI Calculator`, `
    .roi-head{display:grid;grid-template-columns:58px 1fr;gap:16px;align-items:center;margin-bottom:24px}
    .roi-head .ic{width:58px;height:58px;border-radius:16px;background:${theme.primary};color:#fff;display:flex;align-items:center;justify-content:center;font-size:1.7rem}
    .roi-head h1{font-size:1.45rem;font-weight:900;letter-spacing:-0.4px}
    .roi-head p{font-size:0.78rem;opacity:0.55;margin-top:3px}
    .in-grid{display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px;margin-bottom:18px}
    .in{background:#fff;border:1px solid rgba(15,23,42,0.07);border-radius:14px;padding:14px 16px}
    .in .lbl{font-size:0.6rem;letter-spacing:1.4px;text-transform:uppercase;opacity:0.5;margin-bottom:6px}
    .in .field{border-bottom:1px dashed rgba(15,23,42,0.18);padding-bottom:6px;font-weight:700;color:#334155}
    .out{background:${theme.primary};color:#fff;border-radius:16px;padding:22px 24px;display:grid;grid-template-columns:1fr 1fr 1fr 1.4fr;gap:14px;align-items:stretch}
    .out .cell .lbl{font-size:0.6rem;letter-spacing:1.6px;text-transform:uppercase;opacity:0.55}
    .out .cell .val{font-size:1.6rem;font-weight:900;margin-top:6px}
    .out .all{background:${theme.accent};color:${theme.primary};border-radius:14px;padding:18px;display:flex;flex-direction:column;justify-content:center}
    .note{font-size:0.72rem;color:#64748b;margin-top:14px}
  `, `
  <div class="page">
    <div class="roi-head">
      <div class="ic">📈</div>
      <div><span class="pill">ROI Calculator</span>
      <h1>${esc(prof.name)} — Return on Investment</h1>
      <p>Plug in real numbers once · every projection updates</p></div>
    </div>
    <div class="in-grid">
      <div class="in"><div class="lbl">Typical deal size</div><div class="field">${price ? '$' + price.toFixed(2) : '$___'}</div></div>
      <div class="in"><div class="lbl">Deals / month</div><div class="field">4</div></div>
      <div class="in"><div class="lbl">Marketing spend</div><div class="field">$250</div></div>
    </div>
    <div class="out">
      <div class="cell"><div class="lbl">Monthly revenue</div><div class="val">${price ? '$' + (price * 4).toFixed(0) : '$___'}</div></div>
      <div class="cell"><div class="lbl">Lead cost</div><div class="val">$62</div></div>
      <div class="cell"><div class="lbl">Break-even</div><div class="val">${price ? Math.ceil(250 / price) : 0} deals</div></div>
      <div class="all"><div style="font-weight:800;font-size:0.75rem">Projected annual ROI</div><div style="font-size:1.9rem;font-weight:900;margin-top:4px">${price ? Math.round(((price * 48 - 3000) / 3000) * 100) : 240}%</div></div>
    </div>
    <div class="note">All projections recompute from the three inputs — change any number and totals follow. Includes a 12-month chart tab.</div>
  </div>`, theme);
}
// ── KIT COVER (bundles / lead magnet) ────────────────────────────────────
function buildCoverHTML(product, prof, theme, kind) {
  const isLead = kind === 'leadmagnet';
  const contents = isLead
    ? ['Editable service invoice', 'Service quality checklist', 'Pricing calculator (live formulas)']
    : ['Invoice template', 'Quality checklist', 'Pricing spreadsheet', 'Booking tracker', 'Social pack', 'Brand one-pager'];
  const price = isLead ? 'FREE' : (product.price || '$29');

  return shell(`${esc(product.name)} — Kit Cover`, `
    .wrap{background:${theme.bg};display:flex;align-items:center;justify-content:center;min-height:1100px;padding:60px}
    .cover{width:700px;background:${theme.primary};color:#fff;border-radius:28px;padding:54px;box-shadow:0 40px 80px -40px rgba(15,23,42,0.6);overflow:hidden;position:relative}
    .cover::after{content:"${esc(product.emoji || prof.emoji || '📦')}";position:absolute;right:-30px;bottom:-46px;font-size:11rem;opacity:0.07;transform:rotate(-12deg)}
    .badge{display:inline-block;background:${theme.accent};color:${theme.primary};font-weight:900;font-size:0.72rem;letter-spacing:2px;padding:7px 16px;border-radius:999px;text-transform:uppercase}
    .mark{font-size:3.4rem;margin:26px 0 6px}
    h1{font-size:2.6rem;font-weight:900;letter-spacing:-1px;line-height:1.05;margin-bottom:14px}
    .sub{font-size:0.98rem;opacity:0.75;max-width:460px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:30px}
    .item{background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.14);border-radius:12px;padding:13px 16px;font-size:0.84rem;font-weight:700;display:flex;align-items:center;gap:10px}
    .item::before{content:"✓";color:${theme.accent};font-weight:900}
    .bottom{display:flex;justify-content:space-between;align-items:flex-end;margin-top:34px}
    .price{font-size:1.6rem;font-weight:900}
    .price .free{color:${theme.accent};font-size:2rem}
    .tag{font-size:0.68rem;opacity:0.55;letter-spacing:1.6px;text-transform:uppercase}
  `, `
  <div class="wrap"><div class="cover">
    <span class="badge">${isLead ? 'FREE · Lead Magnet' : 'Complete Toolkit'}</span>
    <div class="mark">${esc(product.emoji || prof.emoji || '📦')}</div>
    <h1>${esc(product.name)}</h1>
    <div class="sub">Everything ${esc(prof.name)} needs to look professional, quote accurately and stay booked — in one download.</div>
    <div class="grid">${contents.map((c) => `<div class="item">${esc(c)}</div>`).join('')}</div>
    <div class="bottom">
      <div><div class="price">${isLead ? '<span class="free">$0</span>' : esc(price)}</div><div class="tag">Instant download · Lifetime updates</div></div>
      <div style="text-align:right"><div class="tag">NicheGate</div><div style="font-weight:800">${esc(new Date().getFullYear())}</div></div>
    </div>
  </div></div>`, theme);
}
// ── WEBSITE (one-page service site) ──────────────────────────────────────
function buildWebsiteHTML(prof, theme) {
  const services = parseServices(prof);
  const hashes = (() => { try { return JSON.parse(prof.hashtags || '[]'); } catch { return []; } })();
  const cards = services.map((s) => `<div class="svc-card">
      <div class="svc-emoji">${esc(prof.emoji || '✦')}</div>
      <h3>${esc(s[0])}</h3>
      <p>${esc(s[0])} done right — fixed scope, honest price, on time.</p>
      <div class="price">${esc(s[1] || '')}</div>
    </div>`).join('');

  return shell(`${prof.name} — One-Page Website`, `
    .nav{display:flex;justify-content:space-between;align-items:center;padding:18px 40px;background:${theme.primary};color:#fff}
    .nav .logo{font-weight:900;font-size:1.05rem}
    .nav a{color:#fff;text-decoration:none;font-size:0.8rem;opacity:0.75;margin-left:18px}
    .hero{background:${theme.primary};color:#fff;text-align:center;padding:90px 30px 70px}
    .hero .mark{font-size:4rem;margin-bottom:16px}
    .hero h1{font-size:2.9rem;font-weight:900;letter-spacing:-1px}
    .hero p{opacity:0.78;max-width:520px;margin:16px auto 0}
    .cta{display:inline-block;background:${theme.accent};color:${theme.primary};font-weight:900;padding:14px 34px;border-radius:999px;margin-top:26px;text-decoration:none}
    .services{padding:60px 40px;max-width:1000px;margin:0 auto}
    .services h2{text-align:center;font-size:1.6rem;font-weight:900;margin-bottom:30px}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px}
    .svc-card{background:#fff;border-radius:18px;padding:24px;border:1px solid rgba(15,23,42,0.07);box-shadow:0 14px 30px -22px rgba(15,23,42,0.4)}
    .svc-emoji{font-size:1.8rem;width:48px;height:48px;border-radius:14px;background:${theme.accent};display:flex;align-items:center;justify-content:center;margin-bottom:12px}
    .svc-card h3{font-size:1rem;font-weight:800;margin-bottom:6px}
    .svc-card p{font-size:0.8rem;color:#64748b}
    .price{margin-top:14px;font-weight:900;color:${theme.primary}}
    .cta-band{background:${theme.primary};color:#fff;text-align:center;padding:48px 30px;margin-top:50px}
    .cta-band .big{font-size:1.5rem;font-weight:900}
    .foot{background:#0f172a;color:#94a3b8;text-align:center;padding:26px;font-size:0.75rem}
  `, `
  <div class="nav"><div class="logo">${esc(prof.emoji || '✦')} ${esc(prof.name)}</div><div><a href="#">Services</a><a href="#">Book</a><a href="#">Contact</a></div></div>
  <div class="hero">
    <div class="mark">${esc(prof.emoji || '✦')}</div>
    <h1>${esc(prof.name)}</h1>
    <p>Professional service built on clear scope, honest pricing and follow-through — book in under a minute.</p>
    <a class="cta" href="#">Book Now</a>
  </div>
  <div class="services">
    <h2>Services &amp; Rates</h2>
    <div class="grid">${cards}</div>
  </div>
  <div class="cta-band"><div class="big">Ready to get started?</div><p style="opacity:0.75;margin-top:8px">hello@${esc(prof.slug)}.com · (555) 123-4567</p></div>
  <div class="foot">${hashes.slice(0, 6).map((h) => esc(h)).join('  ·  ')}</div>`, theme);
}
// ── SOCIAL PACK (posts, story, carousel) ────────────────────────────────
function buildSocialPostHTML(prof, theme, variant) {
  const hashes = (() => { try { return JSON.parse(prof.hashtags || '[]'); } catch { return []; } })();
  const v = variant || 0;
  const phrases = [
    ['Professional service, every single week.', 'Professional service you can trust — booked out, every week.'],
    ['The reliable choice in your area.', 'Serving clients who value done-right work over cut-price corners.']
  ];
  // Content moat: trade-true social angles (distinct per variant) when the
  // niche has them; the generic phrases are only the last resort.
  const angle = socialAngleFor(prof, v);
  const headline = angle ? angle.hook : phrases[v % 2][0];
  const sub = angle ? angle.sub : phrases[v % 2][1];
  const cta = angle ? angle.cta : ['Book your date today →', 'DM to check availability →'][v % 2];
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
body{height:1080px;display:flex;align-items:center;justify-content:center;background:${theme.bg};font-family:${theme.font || SYSTEM_FONT};}
.card{width:1080px;height:1080px;background:linear-gradient(160deg,${theme.primary} 0%,${theme.primary} 55%,${theme.secondary} 130%);color:#fff;padding:90px 80px;display:flex;flex-direction:column;justify-content:center;position:relative;overflow:hidden}
.card::before{content:"${esc(prof.emoji || '✦')}";position:absolute;right:-70px;top:-60px;font-size:19rem;opacity:0.09;transform:rotate(12deg)}
.mark{width:110px;height:110px;border-radius:30px;background:${theme.accent};display:flex;align-items:center;justify-content:center;font-size:3rem;margin-bottom:34px;box-shadow:0 24px 50px -18px rgba(0,0,0,0.5)}
.tag{font-size:1.05rem;letter-spacing:3px;font-weight:900;text-transform:uppercase;opacity:0.65;margin-bottom:14px}
h1{font-size:4.4rem;font-weight:900;letter-spacing:-1.5px;line-height:1.02;max-width:740px}
.sub{font-size:1.6rem;opacity:0.85;margin-top:22px;max-width:640px}
.cta{display:inline-block;margin-top:40px;background:${theme.accent};color:${theme.primary};font-size:1.5rem;font-weight:900;padding:22px 40px;border-radius:99px}
.hashes{position:absolute;left:80px;bottom:54px;font-size:1rem;opacity:0.6;max-width:820px;line-height:1.6}
</style></head><body>
<div class="card">
  <div class="mark">${esc(prof.emoji || '✦')}</div>
  <div class="tag">${esc(prof.name)}</div>
  <h1>${esc(headline)}</h1>
  <div class="sub">${esc(sub)}</div>
  <div class="cta">${esc(cta)}</div>
  <div class="hashes">${hashes.slice(0, 8).map((h) => esc(h)).join(' ')}</div>
</div></body></html>`;
}

function buildSocialStoryHTML(prof, theme) {
  const hashes = (() => { try { return JSON.parse(prof.hashtags || '[]'); } catch { return []; } })();
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
body{height:1920px;display:flex;align-items:center;justify-content:center;background:${theme.bg};font-family:${theme.font || SYSTEM_FONT};}
.story{width:1080px;height:1920px;background:linear-gradient(170deg,${theme.primary} 0%,${theme.secondary} 100%);color:#fff;padding:110px 80px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;position:relative;overflow:hidden}
.story::before{content:"${esc(prof.emoji || '✦')}";position:absolute;left:-60px;bottom:-70px;font-size:24rem;opacity:0.08}
.tag{font-size:1.1rem;letter-spacing:4px;font-weight:900;text-transform:uppercase;opacity:0.7;margin-bottom:30px}
.mark{width:150px;height:150px;border-radius:40px;background:${theme.accent};display:flex;align-items:center;justify-content:center;font-size:4.2rem;margin-bottom:44px;box-shadow:0 30px 60px -20px rgba(0,0,0,0.55)}
h1{font-size:5rem;font-weight:900;letter-spacing:-2px;line-height:1.02;max-width:820px}
.sub{font-size:1.7rem;opacity:0.85;margin-top:26px;max-width:660px}
.cta{background:${theme.accent};color:${theme.primary};font-size:1.8rem;font-weight:900;padding:26px 54px;border-radius:99px;margin-top:48px}
.bottom{position:absolute;bottom:70px;font-size:1.05rem;opacity:0.6;max-width:760px}
</style></head><body>
<div class="story">
  <div class="tag">${esc(prof.name)}</div>
  <div class="mark">${esc(prof.emoji || '✦')}</div>
  <h1>Your booking, handled.</h1>
  <div class="sub">Clear pricing · fixed scope · follow-through</div>
  <div class="cta">Book Now</div>
  <div class="bottom">${hashes.slice(0, 6).map((h) => esc(h)).join('  ·  ')}</div>
</div></body></html>`;
}
function buildSocialCarouselHTML(prof, theme) {
  const tips = [
    ['1', 'Quote clearly', 'Itemize scope & price before a single yes'],
    ['2', 'Over-deliver', 'Ship a tidy finish — reviews write themselves'],
    ['3', 'Follow up', 'One message after the job keeps clients returning']
  ].map((t) => `<div class="tip"><div class="num">${t[0]}</div><div><div class="tt">${t[1]}</div><div class="td">${t[2]}</div></div></div>`).join('');
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
body{height:1080px;display:flex;align-items:center;justify-content:center;background:${theme.bg};font-family:${theme.font || SYSTEM_FONT};}
.slide{width:1080px;height:1080px;background:${theme.primary};color:#fff;padding:80px;display:flex;flex-direction:column;justify-content:center;position:relative;overflow:hidden}
.slide::before{content:"${esc(prof.emoji || '✦')}";position:absolute;right:-50px;bottom:-60px;font-size:16rem;opacity:0.07}
.lbl{font-size:1rem;letter-spacing:3px;font-weight:900;text-transform:uppercase;opacity:0.6;margin-bottom:20px}
h1{font-size:3.2rem;font-weight:900;letter-spacing:-1px;margin-bottom:40px}
.tip{display:flex;gap:22px;align-items:center;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:18px;padding:24px 28px;margin-bottom:14px}
.num{width:54px;height:54px;border-radius:16px;background:${theme.accent};color:${theme.primary};font-size:1.4rem;font-weight:900;display:flex;align-items:center;justify-content:center}
.tt{font-size:1.35rem;font-weight:900}
.td{font-size:0.98rem;opacity:0.75;margin-top:4px}
</style></head><body>
<div class="slide">
  <div class="lbl">3 quick wins for ${esc(prof.name)}</div>
  <h1>Swipe → save → grow</h1>
  ${tips}
</div></body></html>`;
}

// ── PRINTABLE PLANNER (personal planning / organizers) ─────────────────────
function buildPlannerHTML(prof, theme) {
  const _sh = (theme && theme.dna) ? shellDNA : shell;
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const cells = days.map((d) => `<div class="pc"><div class="pd">${d}</div><div class="pb"></div><div class="pb"></div><div class="pb"></div></div>`).join('');
  return _sh(`${esc(prof.name)} — Planner`, `
    .pp{background:${theme.bg};padding:38px 42px;font-family:${SYSTEM_FONT}}
    .pp .head{display:flex;justify-content:space-between;align-items:center;margin-bottom:22px}
    .pp .head h1{font-size:1.6rem;font-weight:900;letter-spacing:-.4px;color:${theme.primary}}
    .pp .head .slot{font-size:0.78rem;color:${theme.secondary};letter-spacing:1px;text-transform:uppercase}
    .week{display:grid;grid-template-columns:repeat(7,1fr);gap:8px}
    .pc{background:#fff;border:1px solid rgba(15,23,42,.08);border-radius:12px;padding:10px;min-height:180px}
    .pd{font-size:0.72rem;font-weight:800;letter-spacing:1px;color:${theme.primary};margin-bottom:8px}
    .pb{height:16px;border-bottom:1px dashed rgba(15,23,42,.15);margin-top:12px}
    .goals{margin-top:20px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
    .goal{background:#fff;border:1px solid rgba(15,23,42,.08);border-radius:12px;padding:14px 16px}
    .goal .gl{font-size:0.66rem;letter-spacing:1.6px;text-transform:uppercase;color:${theme.accent};font-weight:800}
    .goal .gline{height:14px;border-bottom:1px dashed rgba(15,23,42,.15);margin-top:10px}
    .goal .gline + .gline{margin-top:10px}
  `, `
  <div class="pp">
    <div class="head"><h1>${esc('Weekly Planner')}</h1><div class="slot">${esc(prof.name)} · Pocket edition</div></div>
    <div class="week">${cells}</div>
    <div class="goals">
      <div class="goal"><div class="gl">Top 3 this week</div><div class="gline"></div><div class="gline"></div><div class="gline"></div></div>
      <div class="goal"><div class="gl">Notes</div><div class="gline"></div><div class="gline"></div><div class="gline"></div></div>
      <div class="goal"><div class="gl">Reflection</div><div class="gline"></div><div class="gline"></div><div class="gline"></div></div>
    </div>
  </div>`, theme);
}

// ── WALL ART PRINT (aesthetic typography printable) ─────────────────────────
function buildWallArtHTML(prof, theme) {
  const _sh = (theme && theme.dna) ? shellDNA : shell;
  return _sh(`${esc(prof.name)} — Wall Art`, `
    body{background:#f7f5f1;display:flex;align-items:center;justify-content:center;min-height:1120px;margin:0}
    .art{width:840px;background:${theme.bg};border-radius:18px;box-shadow:0 30px 60px -30px rgba(15,23,42,.5);overflow:hidden}
    .art .top{height:14px;background:linear-gradient(90deg,${theme.primary},${theme.accent})}
    .art .inner{padding:64px 58px;text-align:center;font-family:${SYSTEM_FONT}}
    .art .em{font-size:3.6rem;margin-bottom:22px}
    .art h1{font-size:3rem;font-weight:900;line-height:1.05;letter-spacing:-1px;color:${theme.primary}}
    .art .sub{margin-top:18px;font-size:1.1rem;color:#7c6f5e;line-height:1.6;max-width:600px;margin-left:auto;margin-right:auto}
    .art .foot{margin-top:42px;font-size:0.72rem;letter-spacing:3px;text-transform:uppercase;color:${theme.accent};font-weight:800}
    .art .quote{padding:34px;background:rgba(0,0,0,.03);border-radius:12px;margin-top:26px}
    .art .quote p{font-size:1.05rem;color:#4c4438;font-style:italic;line-height:1.7}
  `, `
  <div class="art">
    <div class="top"></div>
    <div class="inner">
      <div class="em">${esc(prof.emoji || '✦')}</div>
      <h1>Small business. Big standards.</h1>
      <div class="sub">Every ${esc(prof.name.toLowerCase())} job begins with a promise — and ends with a job done properly.</div>
      <div class="quote"><p>"Do it right the first time — because your reputation is the only product you sell twice."</p></div>
      <div class="foot">${esc(prof.name)} · Simple · Honest · Reliable</div>
    </div>
  </div>`, theme);
}

// ── LEARNING WORKSHEET (education / kids) ──────────────────────────────────
function buildWorksheetHTML(prof, theme) {
  const _sh = (theme && theme.dna) ? shellDNA : shell;
  return _sh(`${esc(prof.name)} — Worksheet`, `
    .ws{width:820px;background:#fff;border-radius:14px;padding:52px 50px;font-family:${SYSTEM_FONT};border:2px solid ${theme.accent}}
    .ws .hd{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid ${theme.primary};padding-bottom:12px}
    .ws .hd h1{font-size:1.5rem;font-weight:900;color:${theme.primary}}
    .ws .hd .lbl{font-size:0.7rem;letter-spacing:2px;text-transform:uppercase;color:${theme.accent};font-weight:800}
    .line{height:34px;border-bottom:1.5px dashed #cbd5e1;margin-top:16px}
    .task{margin-top:26px;font-size:1rem;font-weight:700;color:#334155}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px}
    .cell{border-bottom:1.5px dashed #cbd5e1;height:46px;display:flex;align-items:center;font-size:1rem}
    .score{margin-top:30px;display:flex;gap:18px;justify-content:flex-end;font-size:0.8rem;color:#64748b}
  `, `
  <div class="ws">
    <div class="hd"><h1>Name: ______________</h1><div class="lbl">Practice Sheet</div></div>
    <div class="task">● ${esc(prof.name)} — write each item, then check it off:</div>
    <div class="grid"><div class="cell">1.</div><div class="cell">2.</div><div class="cell">3.</div><div class="cell">4.</div><div class="cell">5.</div><div class="cell">6.</div></div>
    <div class="line"></div><div class="line"></div>
    <div class="score">Completed ___ / 8 · Signed ________________</div>
  </div>`, theme);
}

// ── PARTY PRINTABLE (invitation + décor set) ───────────────────────────────
function buildPartyPrintableHTML(prof, theme) {
  const _sh = (theme && theme.dna) ? shellDNA : shell;
  return _sh(`${esc(prof.name)} — Party Printables`, `
    .pv{width:860px;display:grid;grid-template-columns:1fr 1fr;gap:18px;font-family:${SYSTEM_FONT}}
    .card{background:${theme.bg};border:2px dashed ${theme.accent};border-radius:16px;overflow:hidden;text-align:center}
    .card .c-top{background:${theme.primary};color:#fff;padding:18px;font-size:0.72rem;letter-spacing:3px;text-transform:uppercase;font-weight:800}
    .card .c-body{padding:30px 24px}
    .card h3{font-size:2rem;font-weight:900;color:${theme.primary};line-height:1.05}
    .card .when{margin-top:16px;font-size:0.95rem;color:#57534e}
    .card .when b{display:block;font-size:1.1rem;color:${theme.primary};margin-top:4px}
    .card .rsvp{margin-top:18px;display:inline-block;background:${theme.accent};color:${theme.primary};padding:8px 18px;border-radius:999px;font-size:0.72rem;font-weight:900;letter-spacing:1px}
  `, `
  <div class="pv">
    <div class="card"><div class="c-top">You're invited</div><div class="c-body"><h3>Celebrate with us!</h3><div class="when">Saturday<b>____ / ____ / ______</b></div><div class="when">Time<b>__:__ ____</b></div><div class="rsvp">RSVP · ____</div></div></div>
    <div class="card"><div class="c-top">Thank you</div><div class="c-body"><h3>Grateful for you</h3><div class="when">Your presence is the gift</div><div class="rsvp">★ ★ ★ ★ ★</div></div></div>
  </div>`, theme);
}

// ── PYRO BATCH MIXING WORKSHEET (manual method) ────────────────────────────
function buildPyroBatchHTML(prof, theme) {
  const _sh = (theme && theme.dna) ? shellDNA : shell;
  return _sh(`${esc(prof.name)} — Batch Mixing Worksheet`, `
    body{background:#f7f5f1;display:flex;align-items:center;justify-content:center;min-height:1120px;margin:0}
    .ws{width:840px;background:#fff;border-radius:14px;padding:52px 50px;font-family:${SYSTEM_FONT};border:2px solid ${theme.accent}}
    .ws .hd{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid ${theme.primary};padding-bottom:12px}
    .ws .hd h1{font-size:1.5rem;font-weight:900;color:${theme.primary}}
    .ws .hd .lbl{font-size:0.7rem;letter-spacing:2px;text-transform:uppercase;color:${theme.accent};font-weight:800}
    .rule{margin-top:18px;font-size:0.9rem;color:#4c4438;background:rgba(0,0,0,.04);border-left:3px solid ${theme.accent};padding:12px 14px;border-radius:0 8px 8px 0}
    .rule b{color:${theme.primary}}
    .grid{margin-top:24px}
    .row{display:grid;grid-template-columns:1fr 140px 140px;gap:12px;align-items:center;padding:10px 4px;border-bottom:1px dashed #cbd5e1}
    .row .pct{font-weight:700;color:#334155}
    .row .pct em{font-size:0.68rem;color:#8a7a5e;font-style:normal;font-weight:600;display:block}
    .row .blank{height:32px;border-bottom:1.5px solid #cbd5e1}
    .total{display:flex;justify-content:space-between;align-items:center;margin-top:22px;padding-top:14px;border-top:2px solid ${theme.primary}}
    .total .l{font-weight:800;color:${theme.primary}}
    .total .v{font-weight:900;color:${theme.accent};font-size:1.2rem}
    .note{margin-top:26px;font-size:0.78rem;color:#7c8aa0;line-height:1.6}
  `, `
  <div class="ws">
    <div class="hd"><h1>Batch Mixing Worksheet</h1><div class="lbl">Manual Method · ${esc(prof.name)}</div></div>
    <div class="rule"><b>The Golden Rule:</b> the total of all parts must equal <b>100%</b>, and the batch weight equals the sum of every ingredient weight. Work one line at a time — never scale two chemicals from the same measurement.</div>
    <div class="grid">
      <div class="row"><div class="pct">Oxidizer <em>______ %</em></div><div class="blank"></div><div class="blank"></div></div>
      <div class="row"><div class="pct">Fuel <em>______ %</em></div><div class="blank"></div><div class="blank"></div></div>
      <div class="row"><div class="pct">Binder <em>______ %</em></div><div class="blank"></div><div class="blank"></div></div>
      <div class="row"><div class="pct">Color / Additive <em>______ %</em></div><div class="blank"></div><div class="blank"></div></div>
      <div class="row"><div class="pct">Other <em>______ %</em></div><div class="blank"></div><div class="blank"></div></div>
    </div>
    <div class="total"><div class="l">Total batch weight</div><div class="v">_________ g</div></div>
    <div class="note">Tips: measure dry ingredients first, then binder. Batch by weight (grams), not volume — density varies. Keep a written record of every batch: date, formula, batch size, and result. Always complete the batch worksheet <b>before</b> mastering. Educational reference only — observe all local regulations.</div>
  </div>`, theme);
}

// ── PYRO LIFT & FUSE WORKSHEET (manual method) ─────────────────────────────
function buildPyroLiftFuseHTML(prof, theme) {
  const _sh = (theme && theme.dna) ? shellDNA : shell;
  return _sh(`${esc(prof.name)} — Lift & Fuse Worksheet`, `
    body{background:#f7f5f1;display:flex;align-items:center;justify-content:center;min-height:1120px;margin:0}
    .ws{width:840px;background:#fff;border-radius:14px;padding:46px 48px;font-family:${SYSTEM_FONT};border:2px solid ${theme.accent}}
    .ws .hd{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid ${theme.primary};padding-bottom:12px}
    .ws .hd h1{font-size:1.45rem;font-weight:900;color:${theme.primary}}
    .ws .hd .lbl{font-size:0.7rem;letter-spacing:2px;text-transform:uppercase;color:${theme.accent};font-weight:800}
    .rule{margin-top:16px;font-size:0.86rem;color:#4c4438;background:rgba(0,0,0,.04);border-left:3px solid ${theme.accent};padding:10px 14px;border-radius:0 8px 8px 0}
    .rule b{color:${theme.primary}}
    .sec{margin-top:22px}
    .sec h3{font-size:0.8rem;letter-spacing:1.6px;text-transform:uppercase;color:${theme.primary};font-weight:800;margin-bottom:8px}
    .row{display:grid;grid-template-columns:1fr 150px 150px;gap:12px;align-items:center;padding:9px 4px;border-bottom:1px dashed #cbd5e1}
    .row .k{font-weight:600;color:#334155;font-size:0.88rem}
    .row .blank{height:30px;border-bottom:1.5px solid #cbd5e1}
    .ref{margin-top:20px;padding:16px 18px;background:#fbf7ef;border:1px solid rgba(0,0,0,.06);border-radius:12px}
    .ref .tt{font-size:0.72rem;letter-spacing:1.4px;text-transform:uppercase;color:#8a7a5e;font-weight:800;margin-bottom:8px}
    .ref .row{grid-template-columns:1fr 1fr 1fr 1fr;border-bottom:none;padding:6px 0}
    .ref .row .cell{text-align:center;font-size:0.8rem}
    .ref .row .cell b{display:block;font-size:1rem;color:${theme.primary}}
    .note{margin-top:24px;font-size:0.76rem;color:#7c8aa0;line-height:1.6}
  `, `
  <div class="ws">
    <div class="hd"><h1>Lift &amp; Fuse Worksheet</h1><div class="lbl">Manual Method · ${esc(prof.name)}</div></div>
    <div class="rule"><b>Lift rule of thumb:</b> more shell weight = more lift powder. <b>Fuse rule:</b> delay in seconds ÷ burn rate (sec/inch) = inches to cut. Always cut a little long and trim — never short.</div>
    <div class="sec">
      <h3>Lift Charge</h3>
      <div class="row"><div class="k">Shell weight (g)</div><div class="blank"></div><div class="blank"></div></div>
      <div class="row"><div class="k">Lift powder (g)</div><div class="blank"></div><div class="blank"></div></div>
    </div>
    <div class="sec">
      <h3>Fuse Cut / Delay</h3>
      <div class="row"><div class="k">Target delay (seconds)</div><div class="blank"></div><div class="blank"></div></div>
      <div class="row"><div class="k">Burn rate (sec/inch)</div><div class="blank"></div><div class="blank"></div></div>
      <div class="row"><div class="k">Inches to cut</div><div class="blank"></div><div class="blank"></div></div>
    </div>
    <div class="ref">
      <div class="tt">Quick Reference</div>
      <div class="row">
        <div class="cell">Shell 2"<b>~30g</b></div>
        <div class="cell">Shell 3"<b>~60g</b></div>
        <div class="cell">Shell 4"<b>~110g</b></div>
        <div class="cell">Shell 5"<b>~200g</b></div>
      </div>
    </div>
    <div class="note">Do not exceed the lift for your shell size. Test fuse burn rate on a scrap length before cutting the real run. Write down every value. Educational reference only — observe all local regulations and never work alone.</div>
  </div>`, theme);
}

// ── PYRO PRE-SHOOT CHECKLIST & LAUNCH LOG (manual method) ──────────────────
function buildPyroShootLogHTML(prof, theme) {
  const _sh = (theme && theme.dna) ? shellDNA : shell;
  const checks = [
    'Verify minimum spectator separation distance (NFPA 1123)',
    'Secure and stabilize all mortar racks (sandbags/stakes)',
    'Confirm wind speeds are below 20 mph',
    'Place minimum two 2.5-gal pressurized water extinguishers at ready',
    'Cover all loaded mortars with foil/plastic to prevent cross-ignition',
    'Conduct final continuity test on electronic firing system'
  ];
  const rows = checks.map((c, i) => `<div class="chk"><span class="box">${i + 1}</span><span class="t">${c}</span><span class="tick"></span></div>`).join('');
  return _sh(`${esc(prof.name)} — Pre-Shoot Checklist & Log`, `
    body{background:#f7f5f1;display:flex;align-items:center;justify-content:center;min-height:1120px;margin:0}
    .ws{width:840px;background:#fff;border-radius:14px;padding:44px 46px;font-family:${SYSTEM_FONT};border:2px solid ${theme.accent}}
    .ws .hd{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid ${theme.primary};padding-bottom:12px}
    .ws .hd h1{font-size:1.4rem;font-weight:900;color:${theme.primary}}
    .ws .hd .lbl{font-size:0.7rem;letter-spacing:2px;text-transform:uppercase;color:${theme.accent};font-weight:800}
    .meta{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:18px}
    .meta .f .lab{font-size:0.64rem;letter-spacing:1.4px;text-transform:uppercase;color:#8a7a5e;font-weight:700}
    .meta .f .blank{height:26px;border-bottom:1.5px solid #cbd5e1;margin-top:4px}
    .chk{display:grid;grid-template-columns:26px 1fr 34px;gap:12px;align-items:center;padding:11px 4px;border-bottom:1px solid #eef0f2}
    .chk .box{width:22px;height:22px;border-radius:6px;background:${theme.accent};color:#fff;display:flex;align-items:center;justify-content:center;font-size:0.72rem;font-weight:800}
    .chk .t{font-size:0.88rem;color:#334155;font-weight:600}
    .chk .tick{width:30px;height:30px;border:2px solid #cbd5e1;border-radius:6px}
    .loghead{margin-top:22px;font-size:0.78rem;letter-spacing:1.6px;text-transform:uppercase;color:${theme.primary};font-weight:800}
    .lg{display:grid;grid-template-columns:1.6fr 1fr 1fr 1fr 1fr;gap:6px;margin-top:10px}
    .lg .h{font-size:0.68rem;text-transform:uppercase;letter-spacing:1px;color:#8a7a5e;font-weight:700;padding:6px 4px}
    .lg .bl{border-bottom:1.5px solid #cbd5e1;height:30px}
    .note{margin-top:22px;font-size:0.76rem;color:#7c8aa0;line-height:1.6}
  `, `
  <div class="ws">
    <div class="hd"><h1>Pre-Shoot Checklist &amp; Launch Log</h1><div class="lbl">Manual Method · ${esc(prof.name)}</div></div>
    <div class="meta">
      <div class="f"><div class="lab">Date</div><div class="blank"></div></div>
      <div class="f"><div class="lab">Site / Location</div><div class="blank"></div></div>
      <div class="f"><div class="lab">Wind Speed</div><div class="blank"></div></div>
    </div>
    <div class="chkbox" style="margin-top:18px">${rows}</div>
    <div class="loghead">Launch Log</div>
    <div class="lg">
      <div class="h">Shell</div><div class="h">Size</div><div class="h">Lift</div><div class="h">Fuse</div><div class="h">Result</div>
      <div class="bl"></div><div class="bl"></div><div class="bl"></div><div class="bl"></div><div class="bl"></div>
      <div class="bl"></div><div class="bl"></div><div class="bl"></div><div class="bl"></div><div class="bl"></div>
      <div class="bl"></div><div class="bl"></div><div class="bl"></div><div class="bl"></div><div class="bl"></div>
      <div class="bl"></div><div class="bl"></div><div class="bl"></div><div class="bl"></div><div class="bl"></div>
    </div>
    <div class="note">Complete every checklist item before the first launch. Log each shell as you go. Never launch into crowds, near structures, or in dry/static-risk conditions. Educational reference only — observe all local regulations.</div>
  </div>`, theme);
}

/** Thumb-stopper marketplace cover (v2). Light paper, giant title, hero visual,
 *  3 benefits, price + format badges. 2:3 master with 4:5 marketplace-safe composition. Dark device-frames banned. */
const productCopy = require('./productCopy');

function thumbCoverCopy(product, prof) {
  const t = String(product.type || '').toLowerCase();
  const noun = prof.name || 'Business';
  const concept = (() => { try { return product && product.concept ? JSON.parse(product.concept) : null; } catch { return null; } })();
  const hasConcept = !!(concept && concept.name);
  const safeFormat = ({ invoice: 'PDF + DOCX', checklist: 'PDF · Printable', spreadsheet: 'XLSX · Formulas', booking: 'XLSX · Tracker', social: 'PNG + HTML', brand: 'PDF + PNG', journal: 'PDF · 30 days', bundle: 'ZIP · Files', leadmagnet: 'FREE · ZIP', website: 'HTML · Editable', roi: 'XLSX · Formulas', 'decision-matrix': 'PDF · Printable' })[t] || 'Instant download';
  const lib = {
    invoice: ['Professional Invoice Template', 'Get paid faster, look legit', ['Editable in Word / Google Docs', 'Auto-totals + tax line', 'Pro payment terms built in'], 'PDF + DOCX'],
    checklist: ['Service Quality Checklist', 'Never miss a step on the job', ['Step-by-step sign-off', 'Client-ready finish check', 'Printable + reusable'], 'PDF · Printable'],
    spreadsheet: ['Pricing Calculator', 'Quote jobs in 60 seconds', ['Live Excel formulas', 'Profit margin built in', 'No more undercharging'], 'XLSX · Formulas'],
    booking: ['Booking Tracker', 'Fill your calendar, stay organized', ['Client + date tracking', 'Deposit + balance columns', 'At-a-glance schedule'], 'XLSX · Tracker'],
    social: ['Social Media Pack', '30 days of posts, done', ['Post + story + carousel', 'Captions + hashtags', 'On-brand colors'], 'PNG + HTML'],
    brand: ['Brand Identity Kit', 'Look like a $10k brand', ['Logo lockups + palette', 'Fonts + usage rules', 'Business card layout'], 'PDF + PNG'],
    journal: ['30-Day Guided Journal', 'Build the habit that pays', ['Daily prompts that work', 'Weekly review pages', 'Print or fill digitally'], 'PDF · 30 days'],
    bundle: ['Complete Toolkit', 'The whole business in a box', ['6 pro templates inside', 'Quote, track, get booked', 'Lifetime updates'], 'ZIP · 6 files'],
    leadmagnet: ['Free Starter Pack', 'Try the quality free', ['Invoice + checklist', 'Pricing calculator', 'Zero cost, instant'], 'FREE · ZIP'],
    website: ['One-Page Website', 'Get booked while you sleep', ['Services + rates section', 'Book-now call to action', 'Mobile-ready layout'], 'HTML · Editable'],
    roi: ['ROI Calculator', 'Prove what your effort is earning', ['Track cost vs return', 'Break-even built in', 'Instant projections'], 'XLSX · Formulas'],
    'decision-matrix': ['Decision Matrix', 'Choose with confidence, not guesswork', ['Weighted scoring grid', 'Compare options side-by-side', 'Printable + reusable'], 'PDF · Printable']
  };
  const fallback = lib[t] || [`${noun} ${product.type}`, 'Done-for-you pro template', ['Fully editable', 'Instant download', 'Commercial license'], 'Instant download'];

  // Real product copy beats the generic per-type library — single owner:
  // productCopy derives concept → name tail → brief. The library is only the
  // fallback for generic auto-drafts.
  const derived = productCopy.deriveCopy(product, prof);
  if (hasConcept) return [
    productCopy.deriveTitle(product, prof) || String(concept.name).trim(),
    String(concept.pitch || '').trim(),
    Array.isArray(concept.benefits) ? concept.benefits.map(String).map(s => s.trim()).filter(Boolean).slice(0, 3) : [],
    safeFormat
  ];
  const name = String(product.name || '').trim();
  const nounNormalized = String(prof.name || '').trim().toLowerCase();
  const genericAutoName = name.toLowerCase() === `${nounNormalized} ${t}`;
  const explicitBrief = String(product.brief || '').trim();
  const title = derived.title || (genericAutoName ? fallback[0] : name) || fallback[0];
  const hasSpecificName = !!derived.title;
  return [title, derived.sub || (genericAutoName ? fallback[1] : ''), (derived.benefits || (!hasSpecificName && (genericAutoName || explicitBrief.includes(':')) ? fallback[2] : [])).slice(0, 3), safeFormat];
}

function accentForCover(prof, theme) {
  const blob = `${prof.name || ''} ${prof.slug || ''} ${(theme && theme.sentiment) || ''}`.toLowerCase();
  if (/beauty|fashion|salon|spa/.test(blob)) return '#ec4899';
  if (/fitness|outdoor|garden|food|trade|plumb|hvac/.test(blob)) return '#16a34a';
  if (/finance|notary|tax|coach|consult/.test(blob)) return '#d97706';
  if (/recovery|therapy|wellness|spirit/.test(blob)) return '#7c3aed';
  if (/tech|software|ai |data|drone/.test(blob)) return '#0284c7';
  return '#e11d48';
}

function heroSnippetForCover(product, prof, theme) {
  const t = String(product.type || '').toLowerCase();
  const ink = (theme && theme.primary) || '#14110f';
  const acc = (theme && theme.accent) || '#2dd4bf';
  const row = (a, b, hl) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:20px 6px;border-bottom:2px solid #f1efe9;font-size:30px;${hl ? 'font-weight:900;' : ''}"><span>${esc(a)}</span><strong>${esc(b)}</strong></div>`;
  if (t === 'invoice') return `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><span style="font-size:26px;font-weight:800;letter-spacing:2px;color:${ink}">INVOICE #1042</span><span style="background:${ink};color:#fff;font-size:22px;font-weight:800;padding:8px 20px;border-radius:999px">DUE NET 30</span></div>${row('Deep clean — 3 bed', '$189.00')}${row('Move-in detail', '$129.00')}${row('Total due', '$318.00', true)}`;
  if (t === 'checklist') {
    // Real checklist rows from the product's own brief — canned trade steps read
    // wrong on e.g. a Pinterest monetization checklist.
    const items = (productCopy.deriveCopy(product, prof).benefits || ['Confirm scope + price with client', 'Arrive with tools + supplies', 'Walk the finish, collect 5-star review']).slice(0, 3);
    return items.map((s, i) => `<div style="display:flex;gap:20px;align-items:center;padding:20px 6px;border-bottom:2px solid #f1efe9;font-size:30px;font-weight:600"><span style="width:52px;height:52px;border-radius:14px;background:${i === items.length - 1 ? acc : '#fff'};border:3px solid ${acc};display:flex;align-items:center;justify-content:center;font-weight:900;flex-shrink:0">${i === items.length - 1 ? '✓' : (i + 1)}</span>${esc(s)}</div>`).join('');
  }

  // Data-type heroes show REAL niche service rows — never the canned quote
  // table on a product that isn't a quote calculator.
  const heroLabel = String(productCopy.deriveTitle(product, prof) || product.type || '').toUpperCase();
  if (['spreadsheet', 'booking', 'pricing', 'inventory', 'shot-chart', 'roi', 'decision-matrix'].includes(t)) {
    const services = (() => { try { return JSON.parse(prof.services || '[]'); } catch { return []; } })();
    const rows = (services.length ? services.slice(0, 3) : [['Consultation', '$95'], ['Core Service', '$250'], ['Complete Package', '$450']]);
    return `<div style="font-size:24px;font-weight:800;letter-spacing:2px;color:${ink};margin-bottom:8px">${esc(heroLabel)}</div>${rows.map(([n, p], i) => row(n, p, i === rows.length - 1)).join('')}`;
  }
  if (t === 'journal') return `<div style="font-size:28px;font-weight:800;letter-spacing:2px;color:${ink}">DAY 07 — SMALL WINS</div><div style="font-size:34px;margin:14px 0">What did I handle well today?</div><div style="height:26px;background:#f1efe9;border-radius:13px;margin:12px 0"></div><div style="height:26px;background:#f1efe9;border-radius:13px;width:82%;margin:12px 0"></div>`;
  if (t === 'social') return `<div style="background:${ink};color:#fff;border-radius:20px;padding:40px"><div style="font-size:52px;font-weight:900;line-height:1.05">Booked out.<br>Every week.</div><div style="display:inline-block;margin-top:24px;background:${acc};color:${ink};font-size:26px;font-weight:900;padding:16px 34px;border-radius:999px">Book your date</div></div>`;
  const copy = productCopy.deriveCopy(product, prof);
  if (copy.benefits) {
    return `<div style="font-size:24px;font-weight:800;letter-spacing:2px;color:${ink};margin-bottom:8px">${esc(heroLabel)}</div>${copy.benefits.slice(0, 3).map((b) => `<div style="padding:16px 6px;border-bottom:2px solid #f1efe9;font-size:28px;font-weight:600">✓ ${esc(b)}</div>`).join('')}`;
  }
  return `<div style="font-size:44px;font-weight:900">${esc(prof.emoji || '')} ${esc(prof.name || '')}</div>`;
}

function coverPreviewStyles(labelHeight, screenHeight, fontSize) {
  // No browser chrome on covers: the composited surface shows the clean
  // product document only — no traffic-light dots, no "ACTUAL PRODUCT PAGE"
  // bar, no title strip. (labelHeight/fontSize are kept in the signature so
  // existing call sites stay unchanged; they are no longer rendered.)
  return `.product-preview-screen{height:${screenHeight}px;overflow:hidden;background:#fff}.product-preview-screen iframe{display:block;width:100%;height:100%;border:0;background:#fff}.product-preview-screen img{display:block;width:100%;height:auto;border:0;background:#fff;transform:scale(${COVER_PREVIEW_SCALE});transform-origin:top center}`;
}

function coverProductPreview(productHtml, title, zoom) {
  if (/^data:image\/(?:jpeg|png|webp);base64,/i.test(String(productHtml || ''))) {
    return `<div class="product-preview-screen"><img class="product-preview-raster" src="${esc(productHtml)}" alt="${esc(title)}"></div>`;
  }
  const source = String(productHtml || '<!doctype html><html><body><main><h1>Product preview unavailable</h1><p>Regenerate this cover to include the real deliverable.</p></main></body></html>');
  const viewport = `<meta name="viewport" content="width=700"><style>html{zoom:${zoom};transform-origin:top left;overflow:hidden}body{max-width:700px!important;overflow:hidden}</style>`;
  const withViewport = /<head\b[^>]*>/i.test(source)
    ? source.replace(/<head\b[^>]*>/i, (head) => `${head}${viewport}`)
    : `<!doctype html><html><head>${viewport}</head><body>${source}</body></html>`;
  // Escaping the full document keeps </iframe> and quotes inside the srcdoc
  // attribute. The empty sandbox deliberately disables scripts and privileges.
  return `<div class="product-preview-screen"><iframe title="${esc(title)} — actual product preview" sandbox="" srcdoc="${esc(withViewport)}"></iframe></div>`;
}

const COVER_MASTER = Object.freeze({ width: 1200, height: 1800 });
// The product preview raster is scaled up slightly and top-center anchored so
// it fills the composited slot edge-to-edge. The cover QA gate must know this
// scale to sample the matching raster region (otherwise it compares a wider/
// taller raster crop than the cover actually shows, and tall dark cover pages
// like the recovery journal fail the correlation check).
const COVER_PREVIEW_SCALE = 1.16;
const MARKETPLACE_SAFE_RECT = Object.freeze({ x: 0, y: 150, width: 1200, height: 1500 });
const DEVICE_SLOT = Object.freeze({ x: 660, y: 300, width: 480, height: 600 });

function buildThumbStopperCover(product, prof, theme, artDataUri, productHtml, coverCopy = null, slot = null) {
  const th = theme || {};
  const [title, sub, benefits, format] = coverCopy || thumbCoverCopy(product, prof);
  const realPreview = coverProductPreview(productHtml, title, 0.78);
  const kc = (th.brief && th.brief.palette && th.brief.palette.accent) || th.accent || accentForCover(prof, th);
  const hasArt = !!artDataUri;
  // Adaptive placement: when the caller detected the photo's blank tablet
  // screen, the template lands ON that rectangle; otherwise the fixed safe slot.
  const S = (slot && slot.width > 120 && slot.height > 150) ? slot : DEVICE_SLOT;
  const adaptive = !!(slot && slot.adaptive && S !== DEVICE_SLOT);
  const insetX = Math.max(12, Math.round(S.width * 0.035));
  const insetY = Math.max(16, Math.round(S.height * 0.05));
  const screenW = adaptive ? S.width : S.width - insetX * 2;
  const screenH = adaptive ? S.height : S.height - insetY * 2;
  // Corner radius for the composited page. On a detected tablet the page sits
  // inside the real screen, so matching the photo screen's own corner curvature
  // (and letting the tablet's matte screen show through the corner) makes it read
  // as glass rather than a pasted-on rectangle.
  const screenRadius = adaptive ? Math.max(18, Math.round(S.width * 0.06)) : 4;
  // No label bar on covers (browser chrome removed) — the product document
  // fills the whole composited slot.
  const labelH = 0;
  // Exact rectangle the product page raster occupies, in 1200x1800 master
  // coordinates. Emitted as data attributes so the cover QA gate can re-locate
  // the page without re-deriving the layout math (and without drifting from it).
  const contentX = adaptive ? S.x : S.x + insetX;
  const contentY = adaptive ? S.y : S.y + insetY;
  const contentW = screenW;
  const contentH = Math.max(0, screenH);
  const previewCss = coverPreviewStyles(labelH, Math.max(100, screenH), 11);
  // Avoid text colliding with a centered or left-leaning detected tablet screen:
  // when the screen's vertical span overlaps the bottom copy band and its
  // horizontal span enters the left copy column, constrain or compact the copy block.
  const screenBottom = S.y + S.height;
  const overlapsVertical = screenBottom > 920;
  const availableLeftWidth = S.x > 460 ? (S.x - 96) : 1072;
  const compactCopy = overlapsVertical && S.x <= 540;
  const titleSize = compactCopy ? 54 : (availableLeftWidth < 620 ? 74 : 108);
  const subSize = compactCopy ? 22 : (availableLeftWidth < 620 ? 28 : 34);
  const benSize = compactCopy ? 19 : (availableLeftWidth < 620 ? 24 : 28);
  const copyMaxWidth = (overlapsVertical && S.x > 460 && S.x < 1000) ? `${Math.max(420, S.x - 88)}px` : '100%';
  const shownBenefits = compactCopy ? benefits.slice(0, 2) : benefits.slice(0, 3);
  // Copy must clear the footer band (bottom 180px, 96px tall) with a margin.
  const midBottomPad = compactCopy ? 150 : 160;
  const kicker = `${String(prof.name || '').toUpperCase()}`;
  const headingFont = (th.brief && th.brief.fonts && th.brief.fonts.heading) || 'Space Grotesk';
  const fontCss = `font-family:'${String(headingFont).replace(/[^a-zA-Z0-9 -]/g, '')}', 'Inter', system-ui, sans-serif;`;
  // Photo remains atmospheric. The rendered product page is supplied as a
  // separate image in the fixed composition slot; only copy gets a local scrim.
  const bg = hasArt
    ? `<div class="ts-photo" style="background-image:url('${artDataUri}')"></div><div class="ts-copy-scrim"></div>`
    : `<div class="ts-fallback"></div>`;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${esc(title)}</title><style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#e7e5e1;${fontCss}-webkit-print-color-adjust:exact}
.ts{position:relative;width:1200px;height:1800px;overflow:hidden;color:#fff}
.ts-photo{position:absolute;inset:0;background-size:cover;background-position:center 40%}
.ts-copy-scrim{position:absolute;left:0;right:0;top:${compactCopy ? 1180 : 1080}px;height:${compactCopy ? 420 : 520}px;background:linear-gradient(180deg,transparent 0%,rgba(12,12,13,.16) 18%,rgba(12,12,13,.82) 100%)}
.ts-fallback{position:absolute;inset:0;background:linear-gradient(140deg,${kc} 0%,#14110f 78%)}
.ts-inner{position:relative;z-index:3;height:1650px;display:flex;flex-direction:column;padding:206px 64px 0;pointer-events:none}
.ts-top{display:flex;justify-content:space-between;align-items:center}
.ts-brand{align-self:flex-start;font-size:17px;font-weight:800;letter-spacing:3px;color:#5eead4;background:rgba(9,9,11,.92);padding:9px 16px;border-radius:3px;box-shadow:0 2px 12px rgba(0,0,0,.45)}
.ts-kicker{font-size:22px;font-weight:800;letter-spacing:2px;text-transform:uppercase;background:${kc};padding:12px 24px;border-radius:0}
.ts-mid{margin-top:auto;padding-bottom:${midBottomPad}px;max-width:${copyMaxWidth}}
.ts-title{font-size:${titleSize}px;font-weight:900;line-height:.97;letter-spacing:-3px;text-shadow:0 8px 34px rgba(0,0,0,.65)}
.ts-sub{font-size:${subSize}px;font-weight:600;margin-top:${compactCopy ? 12 : 22}px;color:#f4f4f5;text-shadow:0 4px 18px rgba(0,0,0,.7)}
.ts-bens{margin-top:${compactCopy ? 14 : 34}px;display:flex;flex-direction:column;gap:${compactCopy ? 10 : 14}px}
.ts-ben{display:flex;align-items:center;gap:16px;font-size:${benSize}px;font-weight:700;text-shadow:0 3px 14px rgba(0,0,0,.75)}
.ts-ben .ck{width:${compactCopy ? 34 : 46}px;height:${compactCopy ? 34 : 46}px;border-radius:50%;background:#16a34a;display:flex;align-items:center;justify-content:center;font-size:${compactCopy ? 18 : 26}px;font-weight:900;flex-shrink:0}
.ts-foot{position:absolute;z-index:3;left:0;right:0;bottom:180px;background:rgba(12,12,13,.72);height:96px;display:flex;justify-content:space-between;align-items:center;padding:0 64px;border-top:1px solid rgba(255,255,255,.16)}
.ts-format{font-size:21px;font-weight:800;letter-spacing:2px;color:#e4e4e7}
  .ts-hero{position:absolute;left:${S.x}px;top:${S.y}px;width:${S.width}px;height:${S.height}px;z-index:2;${adaptive ? 'box-shadow:inset 0 0 26px rgba(15,23,42,.10);' : 'transform:rotate(-1.5deg);'}overflow:hidden;border-radius:${adaptive ? screenRadius + 'px' : '10px'}}
  .ts-device{${adaptive ? 'display:none' : `position:absolute;inset:0;background:#f4f4f5;border-radius:22px;box-shadow:0 30px 60px -18px rgba(0,0,0,.55),inset 0 0 0 2px #d4d4d8;overflow:hidden`}}
  .ts-screen{position:absolute;left:${adaptive ? 0 : insetX}px;top:${adaptive ? 0 : insetY}px;width:${screenW}px;height:${screenH}px;background:#fff;border-radius:${screenRadius}px;overflow:hidden}
  ${previewCss}
</style></head><body>
<div class="ts">
  ${bg}
  <div class="ts-hero" data-slot-x="${S.x}" data-slot-y="${S.y}" data-slot-width="${S.width}" data-slot-height="${S.height}" data-adaptive="${adaptive ? '1' : '0'}" data-screen-x="${contentX}" data-screen-y="${contentY}" data-screen-width="${contentW}" data-screen-height="${contentH}" data-label-height="${labelH}" data-preview-scale="${COVER_PREVIEW_SCALE}" data-device-rotate="${adaptive ? 0 : -1.5}"><div class="ts-device"></div><div class="ts-screen">${realPreview}</div></div>
  <div class="ts-inner">
    <div class="ts-top"><div class="ts-brand">NICHEGATE</div><div class="ts-kicker">${esc(kicker)}</div></div>
    <div class="ts-mid">
      <div class="ts-title">${esc(title)}</div>
      <div class="ts-sub">${esc(sub)}</div>
      <div class="ts-bens">${shownBenefits.map((b) => `<div class="ts-ben"><span class="ck">✓</span>${esc(b)}</div>`).join('')}</div>
    </div>
  </div>
  <div class="ts-foot"><div></div><div class="ts-format">${esc(format)}</div></div>
</div></body></html>`;
}

/**
 * CONTENT-FORWARD COVER — the product content IS the hero.
 *
 * Matches the reference style (planner marketplaces, device-mockup listings):
 * a clean themed background, bold editorial typography, and the REAL product
 * pages large — the cover page as the front hero, interior spreads fanned
 * behind it — so a buyer sees exactly what they're getting (the grid/ruled/
 * tracker layouts), not a stock lifestyle scene with a postage-stamp thumbnail.
 * Deterministic: no AI art required.
 *
 * The front hero reuses the exact cover-page raster the QA gate re-derives
 * (coverRaster) and emits `.ts-hero` geometry, so the publish gate's
 * page-belongs-to-product check passes the same way the composite cover did.
 * The fanned interior cards are decorative peeks (iframes of the real doc).
 *
 * @param coverRaster data:image URI of the cover page (from renderProductCoverPreview)
 */
function buildContentForwardCover(product, prof, theme, realProductHtml, coverCopy = null, coverRaster = null) {
  const th = theme || {};
  const [title, sub, benefits, format] = coverCopy || thumbCoverCopy(product, prof);
  const kc = (th.brief && th.brief.palette && th.brief.palette.accent) || th.accent || accentForCover(prof, th);
  const primary = th.primary || '#0f172a';
  const bg = th.bg || '#f8fafc';
  const headingFont = (th.brief && th.brief.fonts && th.brief.fonts.heading) || 'Space Grotesk';
  const fontCss = `font-family:'${String(headingFont).replace(/[^a-zA-Z0-9 -]/g, '')}', 'Inter', system-ui, sans-serif;`;
  const kicker = String(prof.name || '').toUpperCase();
  // Light ink on dark covers, dark ink on light covers — decided by the theme bg.
  const bgIsDark = (() => {
    const hex = String(bg).replace('#', '');
    if (hex.length < 6) return false;
    const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) < 128;
  })();
  const ink = bgIsDark ? '#f8fafc' : '#14110f';
  const inkSub = bgIsDark ? 'rgba(248,250,252,.78)' : '#57534e';

  // Front hero card geometry in 1200x1800 master coordinates (axis-aligned so
  // the QA gate samples it straight on). The cover-page raster sits inside.
  const HX = 430, HY = 620, HW = 540, HH = 700;
  const insetX = Math.max(12, Math.round(HW * 0.035));
  const insetY = Math.max(16, Math.round(HH * 0.05));
  const screenW = HW - insetX * 2;
  const screenH = HH - insetY * 2;

  // Front hero: the cover-page raster (same one the QA gate re-renders).
  const heroScreen = coverProductPreview(coverRaster || realProductHtml, title, 0.78);

  // One interior page peek (iframe of the real doc, scrolled to a page).
  const peek = (topPx, zoom) => {
    const source = String(realProductHtml || '<!doctype html><html><body><main><h1>Product preview unavailable</h1></main></body></html>');
    const viewport = `<meta name="viewport" content="width=760"><style>html{zoom:${zoom};transform-origin:top left;overflow:hidden}body{max-width:760px!important;overflow:hidden}</style>`;
    const withViewport = /<head\b[^>]*>/i.test(source)
      ? source.replace(/<head\b[^>]*>/i, (head) => `${head}${viewport}`)
      : `<!doctype html><html><head>${viewport}</head><body>${source}</body></html>`;
    return `<div class="cf-page" style="top:${-topPx}px"><iframe title="interior page" sandbox="" srcdoc="${esc(withViewport)}"></iframe></div>`;
  };

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${esc(title)}</title><style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#e7e5e1;${fontCss}-webkit-print-color-adjust:exact}
.cf{position:relative;width:1200px;height:1800px;overflow:hidden;background:${bg};color:${ink}}
.cf-bgtint{position:absolute;inset:0;background:radial-gradient(120% 80% at 80% 0%,${kc}22 0%,transparent 55%),radial-gradient(100% 70% at 0% 100%,${primary}18 0%,transparent 50%)}
.cf-top{position:absolute;left:72px;right:72px;top:96px;display:flex;justify-content:space-between;align-items:center;z-index:4}
.cf-kicker{font-size:22px;font-weight:800;letter-spacing:3px;text-transform:uppercase;color:#fff;background:${kc};padding:12px 24px;border-radius:999px}
.cf-format{font-size:20px;font-weight:800;letter-spacing:2px;padding:11px 22px;border-radius:999px;border:2px solid ${bgIsDark ? 'rgba(255,255,255,.35)' : 'rgba(20,17,15,.18)'};color:${ink}}
.cf-title{position:absolute;left:72px;top:200px;width:1056px;font-size:100px;font-weight:900;line-height:.95;letter-spacing:-3px;z-index:4}
.cf-sub{position:absolute;left:72px;top:470px;width:900px;font-size:32px;font-weight:600;color:${inkSub};line-height:1.25;z-index:4}
.cf-stack{position:absolute;left:0;top:560px;width:1200px;height:820px;z-index:2}
.cf-card{position:absolute;width:460px;height:620px;border-radius:16px;overflow:hidden;background:#fff;box-shadow:0 34px 70px -28px rgba(15,15,20,.4),0 4px 14px rgba(15,15,20,.12)}
.cf-card .cf-page{position:absolute;left:0;width:100%;height:100%}
.cf-card iframe{display:block;width:100%;height:100%;border:0;background:#fff}
.cf-card.p1{left:150px;top:40px;transform:rotate(-8deg) scale(.9);transform-origin:bottom center;z-index:1}
.cf-card.p2{left:640px;top:20px;transform:rotate(7deg) scale(.9);transform-origin:bottom center;z-index:1}
.cf-hero,.ts-hero{position:absolute;left:${HX}px;top:${HY - 560}px;width:${HW}px;height:${HH}px;z-index:3;border-radius:14px;overflow:hidden;background:#fff;box-shadow:0 44px 90px -30px rgba(15,15,20,.5),0 6px 18px rgba(15,15,20,.14)}
.cf-hero .cf-screen,.ts-hero .cf-screen{position:absolute;left:${insetX}px;top:${insetY}px;width:${screenW}px;height:${screenH}px;background:#fff;border-radius:6px;overflow:hidden}
${coverPreviewStyles(0, screenH, 11)}
.cf-bens{position:absolute;left:72px;right:72px;top:1430px;display:flex;gap:22px;flex-wrap:wrap;z-index:4}
.cf-ben{display:flex;align-items:center;gap:14px;font-size:26px;font-weight:700;background:${bgIsDark ? 'rgba(255,255,255,.08)' : 'rgba(20,17,15,.05)'};padding:16px 24px;border-radius:14px}
.cf-ben .ck{width:40px;height:40px;border-radius:50%;background:#16a34a;color:#fff;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:900;flex-shrink:0}
.cf-foot{position:absolute;left:72px;right:72px;bottom:64px;display:flex;justify-content:space-between;align-items:flex-end;z-index:4}
.cf-dl{font-size:30px;font-weight:800;letter-spacing:2px}
.cf-dl small{display:block;font-size:20px;font-weight:600;color:${inkSub};letter-spacing:0;margin-top:6px}
.cf-stars{font-size:28px;letter-spacing:4px}
</style></head><body>
<div class="cf">
  <div class="cf-bgtint"></div>
  <div class="cf-top"><div class="cf-kicker">${esc(kicker)}</div><div class="cf-format">${esc(format)}</div></div>
  <h1 class="cf-title">${esc(title)}</h1>
  <div class="cf-sub">${esc(sub)}</div>
  <div class="cf-stack">
    <div class="cf-card p1">${peek(0, 0.82)}</div>
    <div class="cf-card p2">${peek(1240, 0.82)}</div>
    <div class="ts-hero" data-slot-x="${HX}" data-slot-y="${HY}" data-slot-width="${HW}" data-slot-height="${HH}" data-adaptive="0" data-screen-x="${HX + insetX}" data-screen-y="${HY + insetY}" data-screen-width="${screenW}" data-screen-height="${screenH}" data-label-height="0" data-preview-scale="${COVER_PREVIEW_SCALE}" data-device-rotate="0"><div class="cf-screen">${heroScreen}</div></div>
  </div>
  <div class="cf-bens">${benefits.slice(0, 3).map((b) => `<div class="cf-ben"><span class="ck">✓</span>${esc(b)}</div>`).join('')}</div>
  <div class="cf-foot">
    <div class="cf-dl">INSTANT DOWNLOAD<small>Lifetime updates · Commercial use</small></div>
    <div class="cf-stars">★★★★★</div>
  </div>
</div></body></html>`;
}

/**
 * HTML-only cover (used when no AI art is available — never blocks a listing).
 */
function buildPlainCover(product, prof, theme, productHtml) {
  const th = theme || {};
  const [title, sub, benefits, format] = thumbCoverCopy(product, prof);
  const kc = accentForCover(prof, th);
  const hero = coverProductPreview(productHtml, title, 1);
  const price = product.price || '$12';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${esc(title)} cover</title><style>*{box-sizing:border-box;margin:0;padding:0}body{background:#e7e5e1;display:flex;justify-content:center;font-family:'Space Grotesk','Inter',system-ui,sans-serif}.thumbcover{width:1200px;height:1800px;padding:150px 0;background:#f8f7f4;color:#14110f;display:flex;flex-direction:column;overflow:hidden}${coverPreviewStyles(42, 620, 12)}</style></head><body><div class="thumbcover"><div style="display:flex;justify-content:space-between;align-items:center;padding:44px 64px 0;font-size:22px;font-weight:800;letter-spacing:3px"><span style="color:#2dd4bf;background:rgba(9,9,11,.86);padding:7px 14px;border-radius:3px;font-size:15px;letter-spacing:3px">NICHEGATE</span><span style="background:#14110f;color:#fff;font-size:20px;padding:10px 22px;border-radius:999px">${esc(format)}</span></div><div style="margin:36px 64px 0;align-self:flex-start;font-size:24px;font-weight:800;letter-spacing:3px;color:#fff;background:${kc};padding:12px 26px;border-radius:999px">${esc((prof.name || '').toUpperCase())}</div><h1 style="margin:30px 64px 0;font-size:100px;font-weight:900;line-height:.98;letter-spacing:-3px">${esc(title)}</h1><div style="margin:24px 64px 0;font-size:32px;color:#57534e;max-width:920px">${esc(sub)}</div><div class="product-preview-card" style="margin:44px 64px 0;background:#fff;border-radius:24px;box-shadow:0 30px 60px -30px rgba(20,17,15,.25);overflow:hidden">${hero}</div><div style="margin:40px 64px 0;display:flex;flex-direction:column;gap:18px">${benefits.slice(0, 3).map((b) => `<div style="display:flex;align-items:center;gap:18px;font-size:30px;font-weight:700"><span style="width:52px;height:52px;border-radius:50%;background:#16a34a;color:#fff;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:900">✓</span>${esc(b)}</div>`).join('')}</div><div style="margin-top:auto;padding:44px 64px 54px;display:flex;justify-content:space-between;align-items:flex-end"><div><div style="font-size:34px;font-weight:800;letter-spacing:2px">INSTANT DOWNLOAD</div><div style="font-size:22px;color:#78716c;font-weight:600">Lifetime updates</div></div><div style="text-align:right"><div style="font-size:30px;letter-spacing:4px">★★★★★</div><div style="font-size:22px;color:#78716c">Editable · Commercial use</div></div></div></div></body></html>`;
}

/**
 * Multi-device lifestyle mockup studio:
 * Renders realistic workspace/desk environments with tablet, laptop, and phone views,
 * drop shadows, ambient lighting, and high-converting trust badges.
 */
function buildLifestyleMockupHTML(product, prof, theme = {}) {
  const p = product || {};
  const pr = prof || { name: 'Professional Services', emoji: '✨' };
  const th = theme.primary ? theme : { primary: '#0f172a', accent: '#0d9488', bg: '#f8fafc' };
  const title = esc(p.name || 'Professional Digital Toolkit');
  const price = esc(p.price || '$29');
  const type = esc((p.type || 'Toolkit').toUpperCase());

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title} Lifestyle Mockup</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      background: radial-gradient(circle at 50% 20%, #1e293b 0%, #0f172a 60%, #020617 100%);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 40px 20px;
    }
    .studio-stage {
      position: relative;
      width: 1100px;
      max-width: 100%;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 28px;
      padding: 50px 40px;
      box-shadow: 0 40px 100px -20px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.1);
      overflow: hidden;
    }
    .ambient-glow {
      position: absolute;
      top: -120px;
      right: -100px;
      width: 450px;
      height: 450px;
      background: radial-gradient(circle, ${th.accent}33, transparent 70%);
      pointer-events: none;
    }
    .top-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 40px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      padding-bottom: 20px;
    }
    .brand-tag {
      font-size: 0.8rem;
      font-weight: 800;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: #94a3b8;
    }
    .format-pill {
      background: ${th.accent};
      color: #fff;
      padding: 6px 14px;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 1px;
    }
    .desk-composition {
      display: flex;
      align-items: flex-end;
      justify-content: center;
      gap: 30px;
      margin: 40px 0;
      position: relative;
    }
    .laptop-frame {
      width: 560px;
      height: 350px;
      background: #1e293b;
      border-radius: 16px 16px 4px 4px;
      border: 2px solid #334155;
      padding: 12px;
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.7);
      position: relative;
    }
    .screen-content {
      background: #ffffff;
      border-radius: 8px;
      height: 100%;
      padding: 24px;
      color: #0f172a;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .tablet-frame {
      width: 240px;
      height: 310px;
      background: #0f172a;
      border-radius: 20px;
      border: 3px solid #475569;
      padding: 10px;
      box-shadow: 0 20px 40px -10px rgba(0,0,0,0.6);
      transform: rotate(3deg);
    }
    .tablet-screen {
      background: #f8fafc;
      border-radius: 12px;
      height: 100%;
      padding: 16px;
      color: #1e293b;
      font-size: 0.75rem;
    }
    .desk-shadow {
      position: absolute;
      bottom: -15px;
      width: 90%;
      height: 30px;
      background: radial-gradient(ellipse at center, rgba(0,0,0,0.6) 0%, transparent 70%);
      filter: blur(8px);
    }
    .info-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 35px;
      padding-top: 20px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
    }
    .item-title {
      font-size: 1.4rem;
      font-weight: 800;
      color: #f8fafc;
      letter-spacing: -0.5px;
    }
    .item-badges {
      display: flex;
      gap: 12px;
      margin-top: 6px;
      font-size: 0.8rem;
      color: #94a3b8;
    }
    .item-price {
      font-size: 2rem;
      font-weight: 900;
      color: #2dd4bf;
    }
  </style>
</head>
<body>
  <div class="studio-stage">
    <div class="ambient-glow"></div>
    <div class="top-bar">
      <div class="brand-tag">NICHEGATE LIFESTYLE STUDIO · ${esc(pr.name)}</div>
      <div class="format-pill">${type}</div>
    </div>
    <div class="desk-composition">
      <div class="laptop-frame">
        <div class="screen-content">
          <div style="font-size:0.8rem;font-weight:800;color:${th.accent}">${esc(pr.emoji)} ${esc(pr.name).toUpperCase()}</div>
          <div style="font-size:1.6rem;font-weight:900;margin:12px 0">${title}</div>
          <div style="font-size:0.85rem;color:#64748b;line-height:1.5">Complete plug-and-play solution engineered specifically for high-ticket service operations.</div>
          <div style="display:flex;gap:8px;margin-top:auto">
            <span style="background:#f1f5f9;padding:4px 10px;border-radius:6px;font-size:0.75rem;font-weight:600">✓ Excel & Sheets</span>
            <span style="background:#f1f5f9;padding:4px 10px;border-radius:6px;font-size:0.75rem;font-weight:600">✓ Instant Delivery</span>
            <span style="background:#f1f5f9;padding:4px 10px;border-radius:6px;font-size:0.75rem;font-weight:600">✓ Commercial License</span>
          </div>
        </div>
      </div>
      <div class="tablet-frame">
        <div class="tablet-screen">
          <div style="font-weight:800;margin-bottom:8px">Quick Field Guide</div>
          <div style="color:#64748b;line-height:1.4">Mobile-optimized reference cards & formulas ready for client jobs.</div>
          <div style="margin-top:20px;font-size:1.2rem;font-weight:900;color:${th.accent}">★★★★★</div>
        </div>
      </div>
      <div class="desk-shadow"></div>
    </div>
    <div class="info-footer">
      <div>
        <div class="item-title">${title}</div>
        <div class="item-badges">
          <span>Editable Template</span> · <span>Zero Subscriptions</span> · <span>Instant Setup</span>
        </div>
      </div>
      <div class="item-price">${price}</div>
    </div>
  </div>
</body>
</html>`;
}

/** Legacy device-frame kept for the in-app visual editor only. NOT used for covers. */
function wrapMarketplaceMockup(innerHtml, opts) {
  const o = opts || {};
  const title = esc(o.title || 'Digital download');
  const price = esc(o.price || '$12');
  const badge = esc(o.badge || 'Instant download');
  let body = String(innerHtml || '');
  const m = body.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (m) body = m[1];
  body = body.replace(/<\/?html[^>]*>/gi, '').replace(/<head[\s\S]*?<\/head>/gi, '');
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>${title} mockup</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{min-height:100vh;display:flex;align-items:center;justify-content:center;
    background:radial-gradient(1200px 600px at 20% 0%,#1e293b 0%,#0f172a 45%,#020617 100%);
    font-family:${SYSTEM_FONT};padding:36px 28px}
  .stage{position:relative;width:920px;max-width:100%}
  .glow{position:absolute;inset:-40px;background:radial-gradient(circle at 50% 40%,rgba(45,212,191,.18),transparent 55%);pointer-events:none}
  .device{position:relative;margin:0 auto;width:720px;max-width:92%;
    transform:perspective(1400px) rotateY(-8deg) rotateX(4deg);
    filter:drop-shadow(0 40px 60px rgba(0,0,0,.55))}
  .bezel{background:#0b1220;border-radius:22px;padding:14px 14px 18px;
    border:1px solid rgba(255,255,255,.08);box-shadow:inset 0 1px 0 rgba(255,255,255,.08)}
  .chrome{height:18px;display:flex;align-items:center;gap:6px;margin-bottom:10px;padding:0 6px}
  .dot{width:8px;height:8px;border-radius:50%}
  .dot.r{background:#f87171}.dot.y{background:#fbbf24}.dot.g{background:#34d399}
  .screen{background:#f8fafc;border-radius:12px;overflow:hidden;height:920px;position:relative}
  .screen-inner{transform:scale(0.92);transform-origin:top center;width:108.7%;pointer-events:none}
  .tagrow{display:flex;justify-content:space-between;align-items:flex-end;margin-top:22px;color:#e2e8f0}
  .tagrow h2{font-size:1.05rem;font-weight:800;letter-spacing:-.02em;max-width:70%}
  .price{font-size:1.35rem;font-weight:900;color:#5eead4}
  .badge{display:inline-block;margin-top:8px;font-size:10px;font-weight:800;letter-spacing:1.4px;
    text-transform:uppercase;padding:5px 12px;border-radius:999px;background:rgba(45,212,191,.15);
    color:#99f6e4;border:1px solid rgba(45,212,191,.35)}
  .shadow-plate{height:28px;margin:18px auto 0;width:70%;border-radius:50%;
    background:radial-gradient(ellipse,rgba(0,0,0,.45),transparent 70%);filter:blur(6px)}
</style></head><body>
<div class="stage">
  <div class="glow"></div>
  <div class="device">
    <div class="bezel">
      <div class="chrome"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span></div>
      <div class="screen"><div class="screen-inner">${body}</div></div>
    </div>
    <div class="tagrow">
      <div>
        <h2>${title}</h2>
        <div class="badge">${badge}</div>
      </div>
      <div class="price">${price}</div>
    </div>
    <div class="shadow-plate"></div>
  </div>
</div>
</body></html>`;
}



// ═══════════════════════════════════════════════════════════════════════════
// DESIGN DNA — Google Fonts, style CSS, niche patterns
// ═══════════════════════════════════════════════════════════════════════════

function dnaHeadExtras(theme) {
  if (!theme || !theme.dna) return '';
  // Brief-driven builds carry their own font URL (base library + the brief's
  // proposed families); deterministic builds use the fixed library URL.
  const url = theme.dna.fontsUrl || designDNA.GOOGLE_FONTS_URL;
  return '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="' + url + '" rel="stylesheet">';
}

function dnaBodyClass(theme) {
  if (!theme || !theme.dna) return '';
  return 'dna-style-' + theme.dna.styleKey + ' dna-niche-' + theme.dna.niche;
}

function dnaCSS(theme) {
  if (!theme || !theme.dna) return '';
  var d = theme.dna;
  var nl = d.nicheLanguage || {};
  var css = d.css || '';

  // Niche background pattern
  if (nl.bgOverlay && nl.bgOverlay !== 'none') {
    css += '.page::before{content:"";position:absolute;inset:0;background:' + nl.bgOverlay + ';pointer-events:none;z-index:0}';
  }

  // Corner decoration
  var deco = d.decorRules || {};
  if (deco.cornerDecoration === 'grid') {
    css += '.corner-deco{position:absolute;top:12px;right:12px;width:40px;height:40px;background-image:linear-gradient(' + d.colors.primary + ' 1px,transparent 1px),linear-gradient(90deg,' + d.colors.primary + ' 1px,transparent 1px);background-size:8px 8px;opacity:.12}';
  } else if (deco.cornerDecoration === 'diamond') {
    css += '.corner-deco::after{content:"◆";font-size:1rem;color:' + d.colors.accent + ';opacity:.25}';
  } else if (deco.cornerDecoration === 'ornate') {
    css += '.page{border:2px solid ' + d.colors.secondary + '}';
  }

  return css;
}

function shellDNA(title, extraCss, body, theme) {
  var he = dnaHeadExtras(theme);
  var bc = dnaBodyClass(theme);
  var dc = dnaCSS(theme);
  return '<!DOCTYPE html>\n<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">\n<title>' + esc(title) + '</title>\n' + he + '\n<style>' + baseStyle(theme) + dc + (extraCss || '') + '</style></head>\n<body class="' + bc + '">' + body + '</body></html>';
}

function buildDNAHTML(prof, productType, title, extraCss, body) {
  var theme = designDNA.resolveDesign(prof, productType);
  return shellDNA(title, extraCss || '', body, theme);
}

module.exports = {
  esc, priceNum, parseServices, baseStyle, shell, SYSTEM_FONT,
  buildInvoiceHTML, buildChecklistHTML, buildJournalHTML, buildBrandKitHTML,
  buildTablePreviewHTML, buildPricingSheetPreviewHTML, buildDecisionMatrixHTML, buildROIHTML,
  buildCoverHTML, buildWebsiteHTML,
  buildSocialPostHTML, buildSocialStoryHTML, buildSocialCarouselHTML,
  buildPlannerHTML, buildWallArtHTML, buildWorksheetHTML, buildPartyPrintableHTML,
  buildPyroBatchHTML, buildPyroLiftFuseHTML, buildPyroShootLogHTML,
  buildRecoveryJournalHTML, buildAffirmationLabelsHTML, buildRecoveryNutritionHTML, buildMeetingFlashcardsHTML,
  thumbCoverCopy, accentForCover, heroSnippetForCover, buildThumbStopperCover, buildPlainCover, buildContentForwardCover,
  COVER_MASTER, MARKETPLACE_SAFE_RECT, DEVICE_SLOT,
  buildLifestyleMockupHTML,
  wrapMarketplaceMockup
,
  shellDNA, buildDNAHTML, dnaCSS, dnaHeadExtras, designDNA ,
  buildPlaybookHTML ,
  buildPricingBibleHTML };

