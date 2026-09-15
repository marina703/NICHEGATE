// ═══════════════════════════════════════════════════════════════════════════
// TOOL STUDIO — "outcome" products: a single artifact that removes a specific
// painful moment (a decision, a dreaded conversation, a resentful chore).
// Unlike a blank template, each tool ends in a verdict/action the buyer can use.
// ═══════════════════════════════════════════════════════════════════════════

const ds = require('./designStudio');
const { db } = require('../database');

function esc(s) { return ds.esc(s); }

function toolCss(theme) { return `
  .tool-head .pill{margin-bottom:14px}
  .tool-head h1{font-size:2rem;font-weight:900;letter-spacing:-0.5px;margin:0 0 8px}
  .tool-head .prob{color:#64748b;font-size:0.9rem;max-width:520px}
  .promise{margin:14px 0 18px;padding:12px 16px;border-left:4px solid ${theme.accent || '#5eead4'};background:#fff;border-radius:0 12px 12px 0;font-weight:700;box-shadow:0 10px 22px -18px rgba(15,23,42,.3)}
  .steps{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:22px}
  .step{background:#fff;border:1px solid rgba(15,23,42,.07);border-radius:12px;padding:12px;font-size:0.76rem;line-height:1.4}
  .step .n{display:inline-flex;width:22px;height:22px;border-radius:8px;background:${theme.primary || '#0f172a'};color:#fff;font-weight:800;align-items:center;justify-content:center;margin-right:7px;font-size:0.68rem}
  .block-head{font-size:0.7rem;letter-spacing:1.6px;text-transform:uppercase;font-weight:800;margin:0 0 10px;color:${theme.secondary || '#2dd4bf'}}
  .score table,.calc table{width:100%;border-collapse:collapse;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 12px 30px -22px rgba(15,23,42,.5);font-size:0.8rem}
  .score th,.score td,.calc th,.calc td{text-align:left;padding:10px 12px;border-bottom:1px solid #edf1f7}
  .score th,.calc th{background:${theme.primary || '#0f172a'};color:#fff;font-size:0.6rem;letter-spacing:1.4px;text-transform:uppercase}
  .score .w{text-align:center;width:50px}
  .verdict{margin-top:14px}
  .verdict .v{display:flex;justify-content:space-between;gap:10px;padding:9px 12px;border-radius:10px;margin-bottom:6px;font-size:0.78rem;background:rgba(45,212,191,.10)}
  .script{background:#fff;border:1px solid rgba(15,23,42,.07);border-radius:12px;padding:14px;margin-bottom:10px}
  .script h3{font-size:0.9rem;margin:0 0 4px}
  .script .tone{font-size:0.6rem;letter-spacing:1.4px;text-transform:uppercase;color:${theme.secondary || '#2dd4bf'}}
  .script .body{margin-top:8px;padding:10px 12px;background:#f8fafc;border-radius:8px;font-size:0.8rem;white-space:pre-wrap;line-height:1.5}
  .note{margin-top:8px;font-size:0.72rem;color:#64748b}
  .cta{margin-top:20px;background:${theme.primary || '#0f172a'};color:#fff;border-radius:14px;padding:16px 18px;font-weight:800;font-size:0.92rem;line-height:1.4}
  .foot{text-align:center;color:#94a3b8;font-size:0.66rem;margin-top:14px}
`; }

function scorecard(heading, items, verdicts) {
  const rows = items.map(it => `<tr><td>${esc(it.text)}</td><td class="w">${it.weight}</td></tr>`).join('');
  const vs = verdicts.map(v => `<div class="v"><span>${esc(v.label)}</span><strong>${v.min}${v.max != null ? '–' + v.max : '+'}</strong></div>`).join('');
  return `<div class="score"><div class="block-head">${esc(heading)}</div>
    <table><tr><th>Signal</th><th class="w">Pts</th></tr>${rows}</table>
    <div class="verdict">${vs}</div></div>`;
}

function scripts(heading, list) {
  return `<div><div class="block-head">${esc(heading)}</div>${list.map(s =>
    `<div class="script"><h3>${esc(s.title)}</h3><span class="tone">${esc(s.tone || '')}</span><div class="body">${esc(s.body)}</div></div>`).join('')}</div>`;
}

function calc(heading, intro, rows, note) {
  return `<div class="calc"><div class="block-head">${esc(heading)}</div><p style="font-size:0.78rem;color:#64748b;margin-top:-4px">${esc(intro)}</p>
    <table><tr><th>Line item</th><th>Guide</th></tr>${rows.map(r => `<tr><td>${esc(r.label)}</td><td style="color:#94a3b8">${esc(r.hint)}</td></tr>`).join('')}</table>
    ${note ? `<div class="note">${esc(note)}</div>` : ''}</div>`;
}

function buildToolHTML(spec, theme) {
  const body = `
  <div class="page">
    <div class="tool-head"><span class="pill">${esc(spec.kicker)}</span><h1>${esc(spec.title)}</h1><p class="prob">${esc(spec.problem)}</p></div>
    <div class="promise">${esc(spec.promise)}</div>
    <div class="steps">${spec.steps.map((s, i) => `<div class="step"><span class="n">${i + 1}</span>${esc(s)}</div>`).join('')}</div>
    ${spec.core}
    <div class="cta">${esc(spec.cta)}</div>
    <div class="foot">Part of the <strong>Freelancer's Survival Kit</strong> — all 5 tools in one bundle · Commercial license · Instant download</div>
  </div>`;
  return ds.shell(spec.title, toolCss(theme), body, theme);
}

const redFlagRadar = {
  title: `Red Flag Radar`,
  kicker: `Client vetting — scored in 2 minutes`,
  problem: `You can't tell if a lead is gold or a nightmare until it's too late.`,
  promise: `Rate 12 signals → get a walk-away verdict and the exact polite reply to send.`,
  steps: [`Check every red flag that applies`, `Tally the score`, `Send the matching verdict reply`],
  price: `$12`,
  core: scorecard(`Red flags — check all that apply`, [
    { text: `Bargains before you've even quoted`, weight: 2 },
    { text: `Says "it's an easy job" (they're usually wrong)`, weight: 2 },
    { text: `Wants you to start before any payment`, weight: 3 },
    { text: `Trash-talks the last person they hired`, weight: 3 },
    { text: `Sends "quick questions" daily but never green-lights`, weight: 2 },
    { text: `Scope keeps growing mid-conversation`, weight: 3 },
    { text: `Payment terms: "we'll figure it out later"`, weight: 2 },
    { text: `Can't state what "done" looks like`, weight: 1 },
    { text: `Asks for a discount up front`, weight: 2 },
    { text: `Says your price is too high before knowing it`, weight: 2 },
    { text: `Offers "exposure" or future work instead of pay`, weight: 3 },
    { text: `Ignores your process or boundaries`, weight: 2 }
  ], [
    { min: 0, max: 3, label: `Green — normal client, quote standard` },
    { min: 4, max: 9, label: `Yellow — add a 25% PITA premium` },
    { min: 10, label: `Red — walk away (or send the F-U Quote)` }
  ]),
  cta: `Your gut was probably right. Now you have the math — and the message.`
};

const fuQuote = {
  title: `The F-U Quote`,
  kicker: `The "I don't actually want this job" pricing formula`,
  problem: `You keep quoting jobs you secretly hope you don't get — and then you land them.`,
  promise: `Price the headache so it's a win either way: they say yes (you're finally overpaid) or they fold.`,
  steps: [`Add up the headache signals`, `Apply the premium multiplier`, `Send the number you won't regret`],
  price: `$19`,
  core: scorecard(`Headache signals`, [
    { text: `Multiple decision-makers`, weight: 2 },
    { text: `Rush job ("needed it yesterday")`, weight: 2 },
    { text: `Vague spec, high expectations`, weight: 2 },
    { text: `History of scope creep`, weight: 3 },
    { text: `Known slow payer`, weight: 3 },
    { text: `Weekly "just one more thing"`, weight: 2 },
    { text: `After-hours expectations`, weight: 2 }
  ], [
    { min: 0, max: 3, label: `Standard quote` },
    { min: 4, max: 7, label: `Base × 1.5` },
    { min: 8, max: 11, label: `Base × 2.5` },
    { min: 12, label: `The F-U price — 3×, or "respectfully, I'm not a fit"` }
  ]),
  cta: `Quote it. If they say yes, the pain is finally priced correctly. If they bail, you're free.`
};

const noThatPays = {
  title: `The No That Pays`,
  kicker: `Saying no without burning the bridge`,
  problem: `The expensive "yes" usually starts as an awkward "no" you didn't know how to say.`,
  promise: `Copy-paste replies for the six most profitable refusals.`,
  steps: [`Find your situation`, `Pick your tone`, `Send it`],
  price: `$15`,
  core: scripts(`Swipe the reply`, [
    { title: `Decline scope creep`, tone: `Assertive`, body: `Thanks for the addition — that sits outside what I quoted. I'm happy to fold it in as a separate line item; I'll send an updated estimate for the new scope so we're both clear.` },
    { title: `Decline a discount`, tone: `Firm`, body: `I price by outcome, not hours, so there isn't a discount lane to open. What I can do is remove [scope item] to hit a number that works for you.` },
    { title: `Fire a nightmare client`, tone: `Professional`, body: `After reviewing our engagement, I don't think I'm the right fit for what you need next. I'll wrap [X] by [date] and hand everything over cleanly.` },
    { title: `Raise your price`, tone: `Confident`, body: `As of [date], my rate for this work is [new rate]. Existing clients are grandfathered until [date]. Want me to adjust the scope so it stays in budget?` },
    { title: `Chase a late invoice`, tone: `Direct`, body: `Quick nudge — invoice [number] from [date] is now [days] overdue. Payment link below; if anything's off on your end, tell me and I'll sort it today.` },
    { title: `Cancel a recurring meeting`, tone: `Friendly`, body: `This meeting is costing us ~[hours] a month for updates we can read async. I'm replacing it with a 3-line Friday summary — flag anything that needs a live 15.` }
  ]),
  cta: `A good "no" is a sale in disguise. These make it free to send.`
};

const priceAutopsy = {
  title: `The Price Autopsy`,
  kicker: `Find out what you ACTUALLY made last month`,
  problem: `Your "hourly rate" is a fantasy once drive time, setup, materials and rework sneak in.`,
  promise: `Log your last jobs and watch your real $/hr — it's usually brutal, and that's the point.`,
  steps: [`List every job you invoiced`, `Add the hidden time + costs`, `Face your real hourly rate`],
  price: `$9`,
  core: calc(`Line items`, `Fill in the values and let the math sting.`,
    [
      { label: `Job / project name`, hint: `one per row` },
      { label: `Quoted / invoiced ($)`, hint: `what they actually paid` },
      { label: `Actual working hours`, hint: `what it really took` },
      { label: `Drive / setup / breakdown (hrs)`, hint: `add it all` },
      { label: `Materials & subs ($)`, hint: `out of pocket` },
      { label: `Rework / free follow-ups (hrs)`, hint: `be honest` },
      { label: `Real hourly rate`, hint: `(invoice − costs) ÷ total hrs` }
    ],
    `If your real rate is below your target, the fix isn't more hours — it's a price raise or a fired client.`),
  cta: `One hour of math saves you a year of undercharging.`
};

const subSlaughter = {
  title: `Subscription Slaughter`,
  kicker: `The 5-year cost of your "just ${'$12'}/month" apps`,
  problem: `Recurring bills look tiny monthly and enormous over five years. Most people have never seen the total.`,
  promise: `List every subscription and watch the five-year number — then cancel the dead weight with a one-liner.`,
  steps: [`List every recurring charge`, `Project the 5-year cost`, `Use the cancellation script on the dead weight`],
  price: `$9`,
  core: calc(`Recurring charges`, `Monthly × 12 × 5 — the number gets real fast.`,
    [
      { label: `Service name`, hint: `software, gym, cloud, niches` },
      { label: `Monthly cost ($)`, hint: `the "small" number` },
      { label: `Annual cost`, hint: `× 12` },
      { label: `5-year cost`, hint: `× 60 (add ~5%/yr if it compounds)` },
      { label: `Actually used? (y/n)`, hint: `last time you opened it` }
    ],
    `Kill anything you haven't used in 90 days. Cancellation script: "I'd like to cancel my account effective immediately — please confirm." That's it, no survey required.`),
  cta: `The money bleeding on autopilot is usually a raise hiding in plain sight.`
};

const TOOLS = [fuQuote, redFlagRadar, noThatPays, priceAutopsy, subSlaughter];

function ensureToolProfession() {
  let prof = db.prepare("SELECT * FROM professions WHERE slug = 'solo-business'").get();
  if (prof) return prof;
  let id = 28;
  while (db.prepare('SELECT id FROM professions WHERE id = ?').get(id)) id++;
  db.prepare("INSERT OR IGNORE INTO professions (id, emoji, name, slug, status, tier, colors, services, hashtags) VALUES (?, ?, ?, ?, 'researching', ?, ?, ?, ?)")
    .run(id, '🧰', 'Freelance & Solo Business', 'solo-business', 'safe',
      '{"primary":"#0f172a","secondary":"#2dd4bf","accent":"#5eead4","bg":"#f8fafc"}',
      JSON.stringify([['Red Flag Radar','$12'],['The F-U Quote','$19'],['The No That Pays','$15'],['The Price Autopsy','$9'],['Subscription Slaughter','$9']]),
      JSON.stringify(['#freelance','#solopreneur','#smallbusiness','#freelancer','#sidehustle','#businesstools','#clients','#pricing']));
  return db.prepare("SELECT * FROM professions WHERE slug = 'solo-business'").get();
}

function createToolProducts(prof) {
  const theme = require('./themes').getTheme('Onyx Volt');
  const created = [];
  for (const spec of TOOLS) {
    const existing = db.prepare("SELECT id FROM products WHERE profession_id = ? AND type = 'tool' AND name = ?").get(prof.id, spec.title);
    if (existing) { created.push(existing.id); continue; }
    const html = buildToolHTML(spec, theme);
    const ins = db.prepare("INSERT INTO products (profession_id, name, type, price, status, theme, html_content) VALUES (?, ?, 'tool', ?, 'approved', ?, ?)")
      .run(prof.id, spec.title, spec.price, 'Onyx Volt', html);
    created.push(ins.lastInsertRowid);
  }
  return created;
}

module.exports = {
  TOOLS,
  buildToolHTML,
  ensureToolProfession,
  createToolProducts
};


