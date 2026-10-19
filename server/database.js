const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const runtimeConfig = require('./services/runtimeConfig');

// Keep every entry point (including setup/maintenance scripts) from opening a
// production database outside its required persistent storage or without auth.
runtimeConfig.assertProductionConfig();
const DB_PATH = runtimeConfig.resolveDatabasePath();
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);

// Enforce WAL + sensible lock wait so concurrent cron/API writers don't fail fast.
// busy_timeout MUST be set first: the WAL switch takes a lock, and without this
// wait it fails instantly whenever another process (parallel test file, cron,
// API) holds the file — leaving the connection with no lock wait at all.
db.exec('PRAGMA busy_timeout = 5000;');
db.exec('PRAGMA synchronous = NORMAL;');
db.exec('PRAGMA foreign_keys = ON;');
try {
  db.exec('PRAGMA journal_mode = WAL;');
} catch (e) {
  console.error('[DB] pragma init:', e.message);
}

function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS professions (
      id INTEGER PRIMARY KEY,
      emoji TEXT,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      status TEXT DEFAULT 'researching',
      tier TEXT,
      colors TEXT,
      services TEXT,
      hashtags TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profession_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      price TEXT,
      status TEXT DEFAULT 'draft',
      theme TEXT,
      html_content TEXT,
      file_path TEXT,
      preview_path TEXT,
      marketplace_id TEXT,
      marketplace TEXT,
      origin TEXT,
      brief TEXT,
      dedupe_key TEXT,
      listing_json TEXT,
      previous_listing_json TEXT,
      parent_product_id INTEGER,
      amplified INTEGER DEFAULT 0,
      design_brief TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profession_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      theme TEXT,
      html_content TEXT,
      css_content TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS trends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      emoji TEXT,
      phase TEXT,
      velocity TEXT,
      window INTEGER,
      est_revenue TEXT,
      why TEXT,
      activated INTEGER DEFAULT 0,
      detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      activated_at DATETIME,
      outcome TEXT
    );

    CREATE TABLE IF NOT EXISTS metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profession_id INTEGER,
      product_id INTEGER,
      views INTEGER DEFAULT 0,
      sales INTEGER DEFAULT 0,
      revenue REAL DEFAULT 0,
      favorites INTEGER DEFAULT 0,
      recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chat_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profession_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      text TEXT,
      mockups TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS inspiration_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profession_id INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS automation_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      profession_id INTEGER,
      product_id INTEGER,
      details TEXT,
      status TEXT DEFAULT 'info',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sales_seen (
      sale_id TEXT PRIMARY KEY,
      seen_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS marketplace_tokens (
      platform TEXT PRIMARY KEY,
      access_token TEXT,
      refresh_token TEXT,
      expires_at DATETIME,
      shop_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      token TEXT PRIMARY KEY,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS ai_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      model TEXT,
      prompt_tokens INTEGER DEFAULT 0,
      completion_tokens INTEGER DEFAULT 0,
      total_tokens INTEGER DEFAULT 0,
      cost_usd REAL DEFAULT 0,
      action TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);


  // Durable SERP discovery search queue (throttled/retried SERP calls)
  db.exec(`
    CREATE TABLE IF NOT EXISTS search_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      query TEXT NOT NULL,
      payload TEXT,
      status TEXT DEFAULT 'pending',
      result TEXT,
      attempts INTEGER DEFAULT 0,
      last_error TEXT,
      next_run DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Flight Deck run stream — every console action/automation step is a "run".
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prompt TEXT NOT NULL,
      plan TEXT,
      status TEXT DEFAULT 'running',
      step_index INTEGER DEFAULT 0,
      progress INTEGER DEFAULT 0,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS action_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      label TEXT,
      input TEXT,
      status TEXT DEFAULT 'running',
      result TEXT,
      error TEXT,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      finished_at DATETIME
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS action_run_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      step TEXT NOT NULL,
      status TEXT DEFAULT 'info',
      detail TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ── PHASE 5: DISTRIBUTION LAYER ──────────────────────────────────────
  // Pin Engine: scheduled pins with optional store URLs for sale attribution.
  db.exec(`
    CREATE TABLE IF NOT EXISTS pins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER,
      title TEXT NOT NULL,
      description TEXT,
      board_hint TEXT,
      target_url TEXT,
      utm TEXT,
      keywords TEXT,
      status TEXT DEFAULT 'scheduled',
      scheduled_for DATETIME,
      posted_at DATETIME,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Sequences: per-niche email launch sequences, delivered by an ESP.
  db.exec(`
    CREATE TABLE IF NOT EXISTS sequences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profession_id INTEGER,
      trend_key TEXT,
      name TEXT NOT NULL,
      purpose TEXT DEFAULT 'launch',
      emails TEXT,
      status TEXT DEFAULT 'ready',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Swipe File: competitor ads with longevity as the performance proxy.
  db.exec(`
    CREATE TABLE IF NOT EXISTS swipe_ads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      advertiser TEXT,
      ad_id TEXT,
      body TEXT,
      cta TEXT,
      formats TEXT,
      first_seen TEXT,
      last_seen TEXT,
      times_seen INTEGER DEFAULT 1,
      angle TEXT,
      hooks TEXT,
      niche_key TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(platform, ad_id)
      )
  `);

  // Migration tracking table (prevents re-applying migrations)
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migration: raster preview thumbnails (older DBs won't have this column)
  try { db.exec('ALTER TABLE products ADD COLUMN preview_path TEXT'); } catch (e) { /* column already exists */ }

  // Migration: AI product concept (differentiated name + pitch + why-not-generic)
  try { db.exec('ALTER TABLE products ADD COLUMN concept TEXT'); } catch (e) { /* column already exists */ }
  // Origin tag: 'manual' (Make-this / hand-fed) vs 'engine' (auto-generated).
  // The deploy policy reads it — manual products never auto-publish.
  try { db.exec('ALTER TABLE products ADD COLUMN origin TEXT'); } catch (e) { /* column already exists */ }
  // Optimized listing copy (title/tags/description) written by the optimizer.
  try { db.exec('ALTER TABLE products ADD COLUMN listing_json TEXT'); } catch (e) { /* column already exists */ }
  // Copy that was live/local BEFORE the last optimization — the one-click
  // rollback restore point (null means rollback targets the original copy).
  try { db.exec('ALTER TABLE products ADD COLUMN previous_listing_json TEXT'); } catch (e) { /* column already exists */ }
  // Buyer-supplied details/prompts captured at generation time.
  try { db.exec('ALTER TABLE products ADD COLUMN brief TEXT'); } catch (e) { /* column already exists */ }
  // Winner Amplification genealogy: parent product ID and amplified flag.
  try { db.exec('ALTER TABLE products ADD COLUMN parent_product_id INTEGER'); } catch (e) { /* column already exists */ }
  try { db.exec('ALTER TABLE products ADD COLUMN amplified INTEGER DEFAULT 0'); } catch (e) { /* column already exists */ }
  // Generative art direction: the product's design brief (the "skin" — content
  // lives in concept/brief/services). JSON: mood, palette, fonts, motif, …
  try { db.exec('ALTER TABLE products ADD COLUMN design_brief TEXT'); } catch (e) { /* column already exists */ }
  try { db.exec('ALTER TABLE products ADD COLUMN dedupe_key TEXT'); } catch (e) { /* column already exists */ }

  // ── DESIGN QUALITY (Design Quality Upgrade, Phases 1-3) ───────────────────
  // Render→critique→revise scores. `scores` is strict JSON
  // {hierarchy, whitespace, typography, color, uniqueness, scrollStop, overall};
  // an UNSCORED product has NO row here — never treat missing as passing.
  db.exec(`
    CREATE TABLE IF NOT EXISTS design_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      scores TEXT,
      critique TEXT,
      revised INTEGER DEFAULT 0,
      kept_variant TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_design_scores_product ON design_scores (product_id, id DESC)'); } catch (e) { /* exists */ }
  db.exec(`
    CREATE TABLE IF NOT EXISTS cover_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      artifact_path TEXT NOT NULL,
      artifact_sha256 TEXT NOT NULL,
      scores TEXT,
      critique TEXT,
      zero_garbled_text INTEGER,
      status TEXT NOT NULL,
      revised INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_cover_reviews_product ON cover_reviews (product_id, id DESC)'); } catch (e) { /* exists */ }

  // Curated design references (Phase 3): extracted design DNA only — palette
  // hexes, font names, layout grid, motif, a taste note. Seed rows come from
  // public-domain print/editorial traditions; winners auto-enter via the
  // critique loop (source='winner'). Brief-level transfer, never pixel-copy.
  db.exec(`
    CREATE TABLE IF NOT EXISTS design_references (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      source TEXT DEFAULT 'seed',
      niche_key TEXT,
      palette TEXT,
      fonts TEXT,
      layout TEXT,
      motif TEXT,
      taste_note TEXT,
      product_id INTEGER,
      score REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ── PHASE 1: real growth data ────────────────────────────────────────────
  // Per-trend measured history. Every discovery sweep writes one row per
  // tracked trend; velocity/phase/revenue derive from this series (replacing
  // the synthetic rank-based formula).
  db.exec(`
    CREATE TABLE IF NOT EXISTS trend_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trend_key TEXT NOT NULL,
      week TEXT NOT NULL,
      volume REAL,
      cpc REAL,
      competition REAL,
      score INTEGER,
      source TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(trend_key, week)
    )
  `);
  try { db.exec('CREATE INDEX IF NOT EXISTS idx_trend_snapshots_key_week ON trend_snapshots (trend_key, week DESC)'); } catch (e) { /* exists */ }

  // Newer trend columns (older DBs get them via additive ALTERs).
  try { db.exec('ALTER TABLE trends ADD COLUMN trend_key TEXT'); } catch (e) { /* column already exists */ }
  try { db.exec('ALTER TABLE trends ADD COLUMN first_seen_at DATETIME'); } catch (e) { /* column already exists */ }
  try { db.exec('ALTER TABLE trends ADD COLUMN measured_velocity REAL'); } catch (e) { /* column already exists */ }
  try { db.exec('ALTER TABLE trends ADD COLUMN last_volume REAL'); } catch (e) { /* column already exists */ }
  try { db.exec('ALTER TABLE trends ADD COLUMN last_cpc REAL'); } catch (e) { /* column already exists */ }

  // Backfill: existing rows keep their detected_at as first-seen.
  try { db.exec("UPDATE trends SET first_seen_at = detected_at WHERE first_seen_at IS NULL AND detected_at IS NOT NULL"); } catch (e) { /* non-fatal */ }

  const count = db.prepare('SELECT COUNT(*) as c FROM professions').get();
  if (count.c === 0) {
    try {
      seedProfessions();
    } catch (e) {
      // Concurrent init (parallel test workers / multiple boots) can race the
      // seed. A UNIQUE or BUSY error here must never crash the process.
      console.error('[DB] seed skipped (concurrent init):', e.message);
    }
  }
  try {
    migrateProfessions();
  } catch (e) {
    console.error('[DB] migrate skipped (concurrent init):', e.message);
  }
  try {
    fixProfessionEmoji();
  } catch (e) {
    console.error('[DB] emoji repair skipped:', e.message);
  }
}

// Repairs profession emojis that an earlier encoding pass wrote as "??"/"?".
// Safe on every boot: only touches rows whose emoji is still a placeholder.
function fixProfessionEmoji() {
  const EMOJI = {
    'drone-surveying': '🚁',
    'mobile-notary': '🖊️',
    'beekeeping': '🐝',
    'energy-auditor': '⚡',
    'post-construction-cleaning': '🧹',
    'native-landscaping': '🌿',
    'mold-inspector': '🦠',
    'air-duct-cleaning': '🌬️',
    'appliance-repair': '🔧',
    'fishing-guide': '🎣',
    'roofing': '🏠',
    'hvac': '❄️',
    'massage-therapy': '💆',
    'tattoo-artist': '🖋️',
    'wedding-photography': '📸',
    'pyrotechnics': '🎆',
    'aa-recovery': '🔷',
    'smart-recovery': '🧠',
    'refuge-recovery': '🧘',
    'womens-recovery': '🌸',
    'secular-recovery': '⚓',
    'faith-recovery': '✝️',
    'drywall': '🧱'
  };
  const stmt = db.prepare('UPDATE professions SET emoji = ? WHERE slug = ? AND (emoji IS NULL OR emoji = ? OR emoji = ?)');
  for (const [slug, emoji] of Object.entries(EMOJI)) stmt.run(emoji, slug, '??', '?');
}

// Adds professions introduced after initial seed (safe on every boot)
function migrateProfessions() {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO professions (id, emoji, name, slug, status, tier, colors, services, hashtags)
    VALUES (?, ?, ?, ?, 'researching', ?, ?, ?, ?)
  `);

  if (!db.prepare('SELECT id FROM professions WHERE id = 26').get()) {
    insert.run(26, "✝️", "Faith-Based Recovery (Biblical)", "faith-recovery", "passion",
      '{"primary":"#1c1917","secondary":"#d4a017","accent":"#fbbf24","bg":"#fffbeb"}',
      '[["Bible Verse Recovery Journal","$15"],["Scripture Memory Cards","$12"],["Faith-Based Relapse Prevention Plan","$19"],["12-Step + Scripture Workbook","$24"],["Serenity Prayer Reflection Journal","$12"],["Complete Faith Recovery Toolkit","$39"]]',
      '["#christianrecovery","#biblejournaling","#faithrecovery","#soberchristian","#scripturerecovery","#recoverywithgod","#christiansobriety","#bibleverses"]'
    );
  }
  if (!db.prepare('SELECT id FROM professions WHERE id = 27').get()) {
    insert.run(27, "🧱", "Drywall Contractor / Finisher", "drywall", "passion",
      '{"primary":"#292524","secondary":"#a8a29e","accent":"#f59e0b","bg":"#fafaf9"}',
      '[["Hang & Finish (per sheet)","$45"],["Tape & Mud","$350"],["Texture Match","$400"],["Patch & Repair","$150"],["Soundproofing Upgrade","$650"],["Complete Drywall Toolkit","$29"]]',
      '["#drywall","#drywallcontractor","#drywallfinisher","#taping","#mudding","#sheetrock","#drywallrepair","#smoothfinish"]'
    );
  }

}

function seedProfessions() {
  const professions = [
    {id:1,emoji:"🚁",name:"Drone Photography & Surveying",slug:"drone-surveying",tier:"high-upside",colors:'{"primary":"#0c4a6e","secondary":"#0284c7","accent":"#38bdf8","bg":"#f0f9ff"}',services:'[["Real Estate Photos","$150"],["Roof Inspection","$200"],["Construction Progress","$250"],["Agricultural Survey","$300"],["Event Coverage","$175"],["Mapping (per acre)","$15"]]',hashtags:'["#dronephotography","#drones","#aerialphotography","#dronepilot","#part107","#dronelife","#aerialsurvey","#uav"]'},
    {id:2,emoji:"🖊️",name:"Mobile Notary / Loan Signing",slug:"mobile-notary",tier:"high-upside",colors:'{"primary":"#1e3a5f","secondary":"#2563eb","accent":"#60a5fa","bg":"#eff6ff"}',services:'[["Loan Signing","$150"],["General Notary","$75"],["Apostille","$200"],["Estate Documents","$100"],["Power of Attorney","$50"],["Real Estate Closing","$175"]]',hashtags:'["#notary","#loansigningagent","#mobilenotary","#notarysigningagent","#notarylife","#nna","#signingservice","#notarybusiness"]'},
    {id:3,emoji:"🐝",name:"Beekeeping / Apiary",slug:"beekeeping",tier:"high-upside",colors:'{"primary":"#78350f","secondary":"#f59e0b","accent":"#fcd34d","bg":"#fffbeb"}',services:'[["Hive Inspection","$50"],["Colony Assessment","$100"],["Swarm Removal","$200"],["Honey Extraction","$150"],["Queen Rearing Consult","$250"],["Beekeeper Training","$100/hr"]]',hashtags:'["#beekeeping","#beekeeper","#apiary","#savethebees","#backyardbees","#honeybee","#beehive","#pollinator"]'},
    {id:4,emoji:"⚡",name:"Home Energy Auditor",slug:"energy-auditor",tier:"high-upside",colors:'{"primary":"#064e3b","secondary":"#10b981","accent":"#6ee7b7","bg":"#ecfdf5"}',services:'[["Basic Energy Audit","$250"],["HERS Rating","$600"],["Blower Door Test","$300"],["Duct Leakage Test","$250"],["Infrared Scan","$200"],["Rebate Consult","$150"]]',hashtags:'["#energyaudit","#homeenergy","#greenbuilding","#energystar","#hersrater","#blowerdoortest","#insulation","#energyefficiency"]'},
    {id:5,emoji:"🧹",name:"Post-Construction Cleaner",slug:"post-construction-cleaning",tier:"high-upside",colors:'{"primary":"#1c1917","secondary":"#57534e","accent":"#a8a29e","bg":"#fafaf9"}',services:'[["Rough Clean","$0.35/sqft"],["Final Clean","$0.45/sqft"],["Window Cleaning","$8/pane"],["Floor Polish","$0.25/sqft"],["Dust Removal","$300"],["Debris Haul","$150"]]',hashtags:'["#postconstructioncleaning","#constructioncleanup","#newhomecleaning","#buildersclean","#renovationcleanup","#commercialcleaning","#moveincleaning","#deepcleaning"]'},
    {id:6,emoji:"🌿",name:"Native Plant Landscaper",slug:"native-landscaping",tier:"high-upside",colors:'{"primary":"#3f6212","secondary":"#84cc16","accent":"#bef264","bg":"#f7fee7"}',services:'[["Rain Garden Design","$800"],["Prairie Seed Mix","$250"],["Native Tree Install","$150"],["Pollinator Plan","$500"],["Sustainable Lawn","$600"],["Consultation","$100/hr"]]',hashtags:'["#nativelandscaping","#nativeplants","#pollinatorgarden","#raingarden","#sustainablelandscaping","#xeriscaping","#nativeplantsofinstagram","#ecologicalgardening"]'},
    {id:7,emoji:"🦠",name:"Mold Inspector / Remediator",slug:"mold-inspector",tier:"high-upside",colors:'{"primary":"#171717","secondary":"#525252","accent":"#a3a3a3","bg":"#fafafa"}',services:'[["Air Quality Test","$200"],["Surface Sampling","$150"],["Remediation Plan","$500"],["Post-Remediation","$175"],["Moisture Mapping","$250"],["Full Inspection","$400"]]',hashtags:'["#moldinspection","#moldremediation","#indoorairquality","#moldtesting","#waterdamage","#blackmold","#healthyhome","#airqualitytesting"]'},
    {id:8,emoji:"🌬️",name:"Air Duct Cleaning",slug:"air-duct-cleaning",tier:"safe",colors:'{"primary":"#1e3a5f","secondary":"#3b82f6","accent":"#93c5fd","bg":"#eff6ff"}',services:'[["Standard Duct Cleaning","$350"],["Deep Clean + Sanitize","$550"],["Dryer Vent Cleaning","$150"],["HVAC System Clean","$450"],["Mold Remediation","$800"],["Annual Maintenance","$200"]]',hashtags:'["#airductcleaning","#ductcleaning","#airquality","#hvaccleaning","#ductclean","#cleanair","#ventcleaning","#indoorairquality"]'},
    {id:9,emoji:"🔧",name:"Appliance Repair",slug:"appliance-repair",tier:"safe",colors:'{"primary":"#374151","secondary":"#6b7280","accent":"#9ca3af","bg":"#f9fafb"}',services:'[["Diagnostic Fee","$89"],["Refrigerator Repair","$250"],["Washer/Dryer Repair","$200"],["Dishwasher Repair","$180"],["Oven Repair","$220"],["Microwave Repair","$150"]]',hashtags:'["#appliancerepair","#appliancetechnician","#repair","#homerepair","#fixit","#appliancefix","#washerrepair","#refrigeratorrepair"]'},
    {id:10,emoji:"🎣",name:"Fishing Guide / Charter",slug:"fishing-guide",tier:"safe",colors:'{"primary":"#0c4a6e","secondary":"#0891b2","accent":"#22d3ee","bg":"#ecfeff"}',services:'[["Half Day Charter","$350"],["Full Day Charter","$600"],["Fly Fishing Guide","$400"],["Ice Fishing Guide","$300"],["Group Trip","$800"],["Equipment Rental","$100"]]',hashtags:'["#fishingguide","#fishingcharter","#flyfishing","#fishinglife","#guidedfishing","#fishingtrip","#charterfishing","#outfitter"]'},
    {id:11,emoji:"🏠",name:"Roofing Contractor",slug:"roofing",tier:"safe",colors:'{"primary":"#1c1917","secondary":"#57534e","accent":"#a8a29e","bg":"#fafaf9"}',services:'[["Roof Inspection","$150"],["Roof Repair","$500+"],["Full Replacement","$8000+"],["Gutter Install","$1200"],["Skylight Install","$800"],["Storm Damage Assessment","$200"]]',hashtags:'["#roofing","#roofingcontractor","#roofrepair","#roofer","#roofinglife","#construction","#homeimprovement","#roofingcompany"]'},
    {id:12,emoji:"❄️",name:"HVAC Technician",slug:"hvac",tier:"safe",colors:'{"primary":"#0c4a6e","secondary":"#0284c7","accent":"#7dd3fc","bg":"#f0f9ff"}',services:'[["AC Tune-up","$99"],["Furnace Inspection","$99"],["Emergency Repair","$250+"],["System Install","$4500"],["Duct Cleaning","$350"],["Maintenance Plan","$200/yr"]]',hashtags:'["#hvac","#hvactech","#hvacservice","#airconditioning","#heating","#cooling","#hvaccontractor","#hvacrepair"]'},
    {id:13,emoji:"💆",name:"Massage Therapy",slug:"massage-therapy",tier:"safe",colors:'{"primary":"#134e4a","secondary":"#0d9488","accent":"#5eead4","bg":"#f0fdfa"}',services:'[["Swedish 60min","$90"],["Deep Tissue 60min","$110"],["Hot Stone 90min","$150"],["Couples Massage","$180"],["Sports Recovery","$120"],["4-Pack Sessions","$340"]]',hashtags:'["#massagetherapy","#massage","#massagetherapist","#wellness","#relaxation","#selfcare","#spaday","#massagelife"]'},
    {id:14,emoji:"🖋️",name:"Tattoo Artist",slug:"tattoo-artist",tier:"safe",colors:'{"primary":"#1e1b4b","secondary":"#7c3aed","accent":"#c4b5fd","bg":"#faf5ff"}',services:'[["Custom Design","$200/hr"],["Flash Tattoo","$150"],["Cover-up Consult","$100"],["Touch-up","$80"],["Half Sleeve","$1200"],["Full Sleeve","$2500"]]',hashtags:'["#tattooartist","#tattoo","#tattooart","#inked","#tattoodesign","#tattoostudio","#customtattoo","#tattoocommunity"]'},
    {id:15,emoji:"📸",name:"Wedding Photography",slug:"wedding-photography",tier:"safe",colors:'{"primary":"#831843","secondary":"#ec4899","accent":"#f9a8d4","bg":"#fdf2f8"}',services:'[["Engagement Session","$400"],["Full Wedding Day","$2800"],["Half Day","$1800"],["Album Add-on","$450"],["Elopement Package","$1200"],["Destination","$3500"]]',hashtags:'["#weddingphotography","#weddingphotographer","#wedding","#weddings","#brideandgroom","#weddingday","#photography","#weddinginspiration"]'},
    {id:20,emoji:"🎆",name:"Pyrotechnics / Fireworks",slug:"pyrotechnics",tier:"passion",colors:'{"primary":"#0c0a09","secondary":"#f59e0b","accent":"#ef4444","bg":"#fafaf9"}',services:'[["Shot Chart / Firing Sequence","$25"],["Firework Inventory Tracker","$19"],["Cost Per Shot Calculator","$15"],["ATF Compliance Checklist","$29"],["Show Budget Calculator","$22"],["Complete Pyro Toolkit","$49"]]',hashtags:'["#pyrotechnics","#fireworks","#pyrotechnician","#fireworksshow","#atflicensed","#specialfx","#pyrotechnician","#aerialshells"]'},
    {id:21,emoji:"🔷",name:"AA / 12-Step Recovery",slug:"aa-recovery",tier:"passion",colors:'{"primary":"#1e3a5f","secondary":"#2563eb","accent":"#93c5fd","bg":"#eff6ff"}',services:'[["4th Step Inventory Guide","$12"],["Daily Reflection Journal","$15"],["Meeting Attendance Tracker","$8"],["Sobriety Milestone Planner","$19"],["10th Step Daily Inventory","$10"],["Complete 12-Step Workbook","$39"]]',hashtags:'["#aa","#alcoholicsanonymous","#12step","#recovery","#sobriety","#soberlife","#12steps","#recoveryjourney","#bigbook","#aaorg"]'},
    {id:22,emoji:"🧠",name:"SMART Recovery (CBT)",slug:"smart-recovery",tier:"passion",colors:'{"primary":"#374151","secondary":"#0ea5e9","accent":"#38bdf8","bg":"#f0f9ff"}',services:'[["ABC Worksheet (CBT)","$12"],["Cost-Benefit Analysis","$10"],["Urge Log / Trigger Tracker","$12"],["Hierarchy of Values","$10"],["Change Plan Worksheet","$12"],["Complete SMART Toolkit","$35"]]',hashtags:'["#smartrecovery","#cbt","#addictionrecovery","#selfempowerment","#addictionhelp","#sober","#cognitivebehavioraltherapy","#recoveryscience"]'},
    {id:23,emoji:"🧘",name:"Refuge Recovery (Buddhist)",slug:"refuge-recovery",tier:"passion",colors:'{"primary":"#5b21b6","secondary":"#8b5cf6","accent":"#c4b5fd","bg":"#f5f3ff"}',services:'[["Meditation Log & Guide","$14"],["Dharma Study Workbook","$15"],["Mindfulness Tracker","$12"],["Inventory of Suffering Guide","$15"],["Daily Practice Planner","$12"],["Complete Refuge Toolkit","$39"]]',hashtags:'["#refugerecovery","#buddhistrecovery","#meditation","#mindfulness","#dharma","#recoverydharma","#soberbuddhist","#mindfulrecovery"]'},
    {id:24,emoji:"🌸",name:"Women's Recovery (WFS)",slug:"womens-recovery",tier:"passion",colors:'{"primary":"#831843","secondary":"#ec4899","accent":"#f9a8d4","bg":"#fdf2f8"}',services:'[["13 Statements Study Guide","$15"],["Daily Affirmation Journal","$12"],["Emotional Growth Tracker","$14"],["Self-Esteem Worksheets","$10"],["Milestone Celebration Kit","$19"],["Complete WFS Toolkit","$35"]]',hashtags:'["#womenforsobriety","#womensrecovery","#soberwomen","#13statements","#newlifeprogram","#soberlife","#womeninrecovery","#selfacceptance"]'},
    {id:25,emoji:"⚓",name:"Secular Recovery (LifeRing/SOS)",slug:"secular-recovery",tier:"passion",colors:'{"primary":"#134e4a","secondary":"#0d9488","accent":"#5eead4","bg":"#f0fdfa"}',services:'[["Personal Recovery Plan","$15"],["Weekly Check-In Worksheet","$10"],["Sober Activity Planner","$12"],["Community Connection Tracker","$10"],["Sobriety Priority Guide","$10"],["Complete Secular Toolkit","$35"]]',hashtags:'["#lifering","#secularrecovery","#sos","#soberwithoutgod","#recoverywithoutreligion","#sobriety","#secularsober","#empoweredrecovery"]'}
  ];

  const insert = db.prepare(`
    INSERT INTO professions (id, emoji, name, slug, status, tier, colors, services, hashtags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const p of professions) {
    insert.run(p.id, p.emoji, p.name, p.slug, 'researching', p.tier, p.colors, p.services, p.hashtags);
  }
}

// Test runs use an empty throwaway database (see runtimeConfig), so the schema
// must exist before any suite queries it. init() is idempotent.
if (process.env.NODE_TEST_CONTEXT && !process.env.USE_DEV_DB_IN_TEST) init();

module.exports = { db, init, DB_PATH };

