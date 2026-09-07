// ═══════════════════════════════════════════════════════════════════════════
// NICHE UNIVERSE — a broad, curated discovery space spanning many industries,
// hobbies, professions, spaces and groups. The discovery engine samples from
// this continuously so we're always hunting NEW opportunities, not just the
// handful already queued. Each entry: name, emoji, category, phase, velocity,
// window (days), est_revenue, and a short "why" (the angle).
// ═══════════════════════════════════════════════════════════════════════════

const UNIVERSE = [
  // ── TRADES & SERVICES ──
  { name: 'Pressure Washing', emoji: '💦', category: 'trades', phase: 'rising', velocity: '+90%', window: 40, estRevenue: '$2k-6k', why: 'Curb-appeal boom, spring/summer service demand' },
  { name: 'Junk Removal', emoji: '🗑️', category: 'trades', phase: 'rising', velocity: '+70%', window: 45, estRevenue: '$2k-5k', why: 'Decluttering movement, estate cleanouts' },
  { name: 'Pool Cleaning', emoji: '🏊', category: 'trades', phase: 'rising', velocity: '+80%', window: 40, estRevenue: '$2k-5k', why: 'Backyard pool ownership rising, recurring service' },
  { name: 'Smart Home Installer', emoji: '🏠', category: 'trades', phase: 'emerging', velocity: '+120%', window: 50, estRevenue: '$3k-8k', why: 'Smart locks/cams/thermostats mainstream' },
  { name: 'EV Charger Installer', emoji: '🔌', category: 'trades', phase: 'emerging', velocity: '+150%', window: 60, estRevenue: '$4k-9k', why: 'EV adoption + home charging incentives' },
  { name: 'Solar Panel Cleaner', emoji: '☀️', category: 'trades', phase: 'emerging', velocity: '+100%', window: 40, estRevenue: '$2k-6k', why: 'Solar installs growing, maintenance niche' },
  { name: 'Tiny House Builder', emoji: '🏡', category: 'trades', phase: 'rising', velocity: '+90%', window: 50, estRevenue: '$3k-8k', why: 'Affordable housing trend, ADU boom' },
  { name: 'Fence & Gate Installer', emoji: '🚧', category: 'trades', phase: 'stable', velocity: '+50%', window: 60, estRevenue: '$2k-5k', why: 'Pet owners + privacy demand' },
  { name: 'Septic & Drain Service', emoji: '🪠', category: 'trades', phase: 'stable', velocity: '+40%', window: 60, estRevenue: '$2k-5k', why: 'Essential recurring home service' },
  { name: 'Water Damage Restoration', emoji: '💧', category: 'trades', phase: 'rising', velocity: '+70%', window: 35, estRevenue: '$3k-7k', why: 'Extreme weather, insurance claims' },
  { name: 'Epoxy Flooring', emoji: '🟦', category: 'trades', phase: 'emerging', velocity: '+110%', window: 45, estRevenue: '$3k-7k', why: 'Garage/warehouse epoxy trend' },
  { name: 'Concrete Contractor', emoji: '🧱', category: 'trades', phase: 'stable', velocity: '+45%', window: 60, estRevenue: '$2k-6k', why: 'Patios/driveways, home improvement spend' },
  { name: 'Garage Door Repair', emoji: '🚪', category: 'trades', phase: 'stable', velocity: '+40%', window: 60, estRevenue: '$2k-5k', why: 'Always-needed home repair' },
  { name: 'Locksmith', emoji: '🔐', category: 'trades', phase: 'stable', velocity: '+35%', window: 60, estRevenue: '$2k-5k', why: 'Essential service, smart-lock installs' },
  { name: 'Pest Control', emoji: '🪳', category: 'trades', phase: 'rising', velocity: '+60%', window: 50, estRevenue: '$2k-5k', why: 'Recurring residential service' },
  { name: 'Landscaping Maintenance', emoji: '🌳', category: 'trades', phase: 'stable', velocity: '+50%', window: 55, estRevenue: '$2k-5k', why: 'Recurring lawn/yard service' },
  { name: 'Snow Removal', emoji: '❄️', category: 'trades', phase: 'seasonal', velocity: '+80%', window: 25, estRevenue: '$2k-5k', why: 'Winter seasonal, contract-based' },
  { name: 'Chimney Sweep', emoji: '🏭', category: 'trades', phase: 'seasonal', velocity: '+60%', window: 30, estRevenue: '$2k-4k', why: 'Fall/winter fireplace prep' },
  { name: 'Window Cleaning', emoji: '🪟', category: 'trades', phase: 'stable', velocity: '+45%', window: 50, estRevenue: '$2k-4k', why: 'Curb appeal, spring cleaning' },
  { name: 'Handyman Services', emoji: '🛠️', category: 'trades', phase: 'stable', velocity: '+55%', window: 60, estRevenue: '$2k-5k', why: 'General repair demand' },

  // ── BEAUTY & WELLNESS ──
  { name: 'Lash Extensions', emoji: '👁️', category: 'beauty', phase: 'hot', velocity: '+140%', window: 30, estRevenue: '$3k-8k', why: 'Lash tech demand, salon add-on' },
  { name: 'Brow Lamination', emoji: '🪞', category: 'beauty', phase: 'hot', velocity: '+160%', window: 25, estRevenue: '$3k-7k', why: 'Low-maintenance brow trend' },
  { name: 'Microneedling', emoji: '🧖', category: 'beauty', phase: 'rising', velocity: '+130%', window: 35, estRevenue: '$3k-8k', why: 'At-home + spa skin treatments' },
  { name: 'IV Hydration Therapy', emoji: '💉', category: 'wellness', phase: 'emerging', velocity: '+170%', window: 30, estRevenue: '$4k-9k', why: 'Wellness IV bars, hangover/hydration' },
  { name: 'Cryotherapy', emoji: '🧊', category: 'wellness', phase: 'emerging', velocity: '+120%', window: 35, estRevenue: '$3k-7k', why: 'Recovery + wellness trend' },
  { name: 'Infrared Sauna Studio', emoji: '🌡️', category: 'wellness', phase: 'rising', velocity: '+110%', window: 40, estRevenue: '$3k-8k', why: 'Sauna wellness boom' },
  { name: 'Float Therapy', emoji: '🛁', category: 'wellness', phase: 'rising', velocity: '+90%', window: 40, estRevenue: '$3k-6k', why: 'Sensory deprivation wellness' },
  { name: 'Nail Tech (Gel-X)', emoji: '💅', category: 'beauty', phase: 'hot', velocity: '+150%', window: 25, estRevenue: '$3k-7k', why: 'Gel-X/extensions nail trend' },
  { name: 'Waxing & Sugaring', emoji: '🍯', category: 'beauty', phase: 'stable', velocity: '+60%', window: 40, estRevenue: '$2k-5k', why: 'Recurring beauty service' },
  { name: 'Tanning (Spray)', emoji: '🌞', category: 'beauty', phase: 'stable', velocity: '+55%', window: 40, estRevenue: '$2k-5k', why: 'Sunless tanning demand' },
  { name: 'Scalp & Hair Treatment', emoji: '💆‍♀️', category: 'beauty', phase: 'emerging', velocity: '+120%', window: 30, estRevenue: '$3k-6k', why: 'Hair-loss/health scalp care trend' },
  { name: 'Med Spa Services', emoji: '✨', category: 'beauty', phase: 'rising', velocity: '+140%', window: 35, estRevenue: '$4k-9k', why: 'Injectables + skin treatments' },

  // ── FITNESS & SPORTS ──
  { name: 'Pickleball Coach', emoji: '🏓', category: 'fitness', phase: 'hot', velocity: '+220%', window: 30, estRevenue: '$3k-8k', why: 'Fastest-growing sport, coaching demand' },
  { name: 'Padel Court Operator', emoji: '🎾', category: 'fitness', phase: 'emerging', velocity: '+200%', window: 35, estRevenue: '$5k-12k', why: 'Padel exploding globally' },
  { name: 'Hyrox / Functional Fitness', emoji: '🏋️', category: 'fitness', phase: 'emerging', velocity: '+180%', window: 30, estRevenue: '$3k-8k', why: 'Hyrox race participation boom' },
  { name: 'Cold Plunge / Ice Bath', emoji: '🧊', category: 'fitness', phase: 'hot', velocity: '+190%', window: 25, estRevenue: '$4k-9k', why: 'Recovery biohacking trend' },
  { name: 'Rucking', emoji: '🎒', category: 'fitness', phase: 'emerging', velocity: '+150%', window: 30, estRevenue: '$2k-6k', why: 'Walking-with-weight fitness trend' },
  { name: 'Yoga Teacher (Hot)', emoji: '🧘', category: 'fitness', phase: 'stable', velocity: '+60%', window: 45, estRevenue: '$2k-5k', why: 'Hot yoga studio demand' },
  { name: 'Personal Trainer (Online)', emoji: '💪', category: 'fitness', phase: 'rising', velocity: '+90%', window: 45, estRevenue: '$3k-7k', why: 'Remote coaching + app demand' },
  { name: 'Boxing / Kickboxing Gym', emoji: '🥊', category: 'fitness', phase: 'rising', velocity: '+80%', window: 40, estRevenue: '$3k-7k', why: 'Combat fitness popularity' },
  { name: 'Golf Simulator Lounge', emoji: '⛳', category: 'fitness', phase: 'emerging', velocity: '+130%', window: 35, estRevenue: '$4k-9k', why: 'Indoor golf sims, social venue' },
  { name: 'Cycling Coach (Indoor)', emoji: '🚴', category: 'fitness', phase: 'rising', velocity: '+70%', window: 40, estRevenue: '$2k-6k', why: 'Zwift/indoor cycling community' },
  { name: 'Dance Fitness', emoji: '🕺', category: 'fitness', phase: 'rising', velocity: '+80%', window: 35, estRevenue: '$2k-5k', why: 'Zumba/heels dance class trend' },
  { name: 'Pilates Studio', emoji: '🤸', category: 'fitness', phase: 'hot', velocity: '+160%', window: 30, estRevenue: '$3k-8k', why: 'Reformer pilates boom' },

  // ── PETS & ANIMALS ──
  { name: 'Dog Grooming', emoji: '🐕', category: 'pets', phase: 'stable', velocity: '+60%', window: 50, estRevenue: '$2k-5k', why: 'Recurring pet service' },
  { name: 'Dog Training (Behavior)', emoji: '🦮', category: 'pets', phase: 'rising', velocity: '+90%', window: 40, estRevenue: '$2k-6k', why: 'Behavior training demand' },
  { name: 'Pet Sitting / Boarding', emoji: '🐾', category: 'pets', phase: 'rising', velocity: '+80%', window: 45, estRevenue: '$2k-5k', why: 'Travel rebound, pet care' },
  { name: 'Pet Photography', emoji: '📷', category: 'pets', phase: 'rising', velocity: '+70%', window: 40, estRevenue: '$2k-5k', why: 'Pet parents spend on portraits' },
  { name: 'Exotic Pet Care', emoji: '🦎', category: 'pets', phase: 'emerging', velocity: '+60%', window: 45, estRevenue: '$2k-5k', why: 'Reptile/amphibian hobby growth' },
  { name: 'Aquarium / Reef Setup', emoji: '🐠', category: 'pets', phase: 'rising', velocity: '+70%', window: 40, estRevenue: '$2k-6k', why: 'Planted tank + reef hobby' },
  { name: 'Horse Care / Equestrian', emoji: '🐎', category: 'pets', phase: 'stable', velocity: '+50%', window: 50, estRevenue: '$2k-6k', why: 'Equestrian niche, boarding/training' },
  { name: 'Pet Waste Removal', emoji: '💩', category: 'pets', phase: 'rising', velocity: '+80%', window: 40, estRevenue: '$2k-4k', why: 'Low-cost recurring service' },

  // ── FOOD & CULINARY ──
  { name: 'Meal Prep Service', emoji: '🥗', category: 'food', phase: 'rising', velocity: '+90%', window: 40, estRevenue: '$3k-7k', why: 'Health + convenience demand' },
  { name: 'Private Chef', emoji: '👨‍🍳', category: 'food', phase: 'rising', velocity: '+80%', window: 45, estRevenue: '$4k-9k', why: 'Experience dining trend' },
  { name: 'Sourdough / Artisan Bakery', emoji: '🍞', category: 'food', phase: 'rising', velocity: '+70%', window: 40, estRevenue: '$2k-6k', why: 'Homemade bread culture' },
  { name: 'Food Truck', emoji: '🚚', category: 'food', phase: 'stable', velocity: '+60%', window: 45, estRevenue: '$3k-8k', why: 'Mobile dining, events' },
  { name: 'Specialty Coffee Roaster', emoji: '☕', category: 'food', phase: 'rising', velocity: '+80%', window: 45, estRevenue: '$3k-7k', why: 'Third-wave coffee boom' },
  { name: 'Fermentation / Kombucha', emoji: '🫙', category: 'food', phase: 'emerging', velocity: '+70%', window: 40, estRevenue: '$2k-5k', why: 'Gut-health food trend' },
  { name: 'Charcuterie Boards', emoji: '🧀', category: 'food', phase: 'hot', velocity: '+120%', window: 30, estRevenue: '$2k-6k', why: 'Grazing board catering trend' },
  { name: 'Hot Sauce / Condiments', emoji: '🌶️', category: 'food', phase: 'rising', velocity: '+90%', window: 40, estRevenue: '$2k-6k', why: 'Craft hot sauce boom' },
  { name: 'Microgreens Farming', emoji: '🌱', category: 'food', phase: 'emerging', velocity: '+80%', window: 45, estRevenue: '$2k-5k', why: 'Local gourmet greens' },
  { name: 'Catering (Event)', emoji: '🍽️', category: 'food', phase: 'stable', velocity: '+55%', window: 45, estRevenue: '$3k-8k', why: 'Event/wedding catering' },

  // ── TECH & DIGITAL ──
  { name: 'AI Prompt Engineering', emoji: '🤖', category: 'tech', phase: 'hot', velocity: '+240%', window: 30, estRevenue: '$4k-10k', why: 'GenAI adoption, prompt courses/templates' },
  { name: 'No-Code App Builder', emoji: '🧩', category: 'tech', phase: 'rising', velocity: '+150%', window: 45, estRevenue: '$4k-9k', why: 'Bubble/Glide app demand' },
  { name: 'Notion Template Creator', emoji: '📓', category: 'tech', phase: 'hot', velocity: '+180%', window: 30, estRevenue: '$3k-8k', why: 'Notion marketplace growth' },
  { name: 'Canva Template Designer', emoji: '🎨', category: 'tech', phase: 'hot', velocity: '+170%', window: 30, estRevenue: '$3k-8k', why: 'Creator economy templates' },
  { name: 'Website Accessibility Auditor', emoji: '♿', category: 'tech', phase: 'emerging', velocity: '+130%', window: 50, estRevenue: '$4k-8k', why: 'ADA compliance lawsuits driving demand' },
  { name: 'Cybersecurity Consultant', emoji: '🛡️', category: 'tech', phase: 'rising', velocity: '+110%', window: 55, estRevenue: '$5k-12k', why: 'SMB cyber threats' },
  { name: 'Data Privacy Consultant', emoji: '🔒', category: 'tech', phase: 'emerging', velocity: '+120%', window: 50, estRevenue: '$4k-9k', why: 'GDPR/CCPA compliance' },
  { name: '3D Printing Service', emoji: '🖨️', category: 'tech', phase: 'rising', velocity: '+100%', window: 45, estRevenue: '$3k-7k', why: 'Prototyping + custom parts' },
  { name: 'Drone Photography (Real Estate)', emoji: '🚁', category: 'tech', phase: 'rising', velocity: '+90%', window: 45, estRevenue: '$3k-7k', why: 'Aerial listing content' },
  { name: 'Video Editing (Short-form)', emoji: '🎬', category: 'tech', phase: 'hot', velocity: '+160%', window: 35, estRevenue: '$3k-8k', why: 'Reels/TikTok/Shorts demand' },
  { name: 'Podcast Production', emoji: '🎙️', category: 'tech', phase: 'rising', velocity: '+90%', window: 45, estRevenue: '$3k-7k', why: 'Podcast boom, editing services' },
  { name: 'Esports Coaching', emoji: '🎮', category: 'tech', phase: 'rising', velocity: '+80%', window: 40, estRevenue: '$2k-6k', why: 'Competitive gaming coaching' },

  // ── HOME & LIFESTYLE ──
  { name: 'Home Staging', emoji: '🏺', category: 'home', phase: 'rising', velocity: '+80%', window: 45, estRevenue: '$3k-8k', why: 'Real estate staging demand' },
  { name: 'Interior Design (Virtual)', emoji: '🛋️', category: 'home', phase: 'emerging', velocity: '+120%', window: 40, estRevenue: '$3k-8k', why: 'Online design services' },
  { name: 'Closet Organization', emoji: '👗', category: 'home', phase: 'hot', velocity: '+140%', window: 30, estRevenue: '$3k-7k', why: 'Marie Kondo + organizing trend' },
  { name: 'Smart Home Setup', emoji: '🏠', category: 'home', phase: 'rising', velocity: '+100%', window: 45, estRevenue: '$3k-7k', why: 'Smart home adoption' },
  { name: 'Decluttering / Downsizing', emoji: '📦', category: 'home', phase: 'rising', velocity: '+90%', window: 40, estRevenue: '$2k-6k', why: 'Minimalism + estate downsizing' },
  { name: 'Plant Styling / Interior Plants', emoji: '🪴', category: 'home', phase: 'rising', velocity: '+80%', window: 40, estRevenue: '$2k-5k', why: 'Houseplant trend' },
  { name: 'Custom Furniture Refinishing', emoji: '🪑', category: 'home', phase: 'emerging', velocity: '+70%', window: 45, estRevenue: '$2k-6k', why: 'Upcycling trend' },
  { name: 'Window Tinting (Home)', emoji: '🪟', category: 'home', phase: 'emerging', velocity: '+60%', window: 45, estRevenue: '$2k-5k', why: 'Energy efficiency + privacy' },

  // ── EVENTS & CELEBRATION ──
  { name: 'Balloon Artistry', emoji: '🎈', category: 'events', phase: 'rising', velocity: '+90%', window: 35, estRevenue: '$2k-6k', why: 'Balloon garlands for events' },
  { name: 'Event Planning', emoji: '🎉', category: 'events', phase: 'stable', velocity: '+60%', window: 45, estRevenue: '$3k-8k', why: 'Weddings/corporate events' },
  { name: 'Party Rental', emoji: '🎪', category: 'events', phase: 'rising', velocity: '+70%', window: 40, estRevenue: '$3k-7k', why: 'Bounce houses, photo booths' },
  { name: 'Photo Booth Rental', emoji: '📸', category: 'events', phase: 'rising', velocity: '+80%', window: 40, estRevenue: '$2k-6k', why: 'Event photo booths' },
  { name: 'Mobile Bartending', emoji: '🍸', category: 'events', phase: 'rising', velocity: '+80%', window: 40, estRevenue: '$3k-7k', why: 'Craft cocktail events' },
  { name: 'Face Painting', emoji: '🎨', category: 'events', phase: 'stable', velocity: '+50%', window: 40, estRevenue: '$1k-4k', why: 'Kids events, festivals' },
  { name: 'Wedding Officiant', emoji: '💒', category: 'events', phase: 'stable', velocity: '+50%', window: 45, estRevenue: '$1k-4k', why: 'Non-traditional weddings' },
  { name: 'Holiday Light Installation', emoji: '🎄', category: 'events', phase: 'seasonal', velocity: '+90%', window: 25, estRevenue: '$3k-8k', why: 'Christmas light services' },

  // ── EDUCATION & CREATIVE ──
  { name: 'Tutoring (STEM)', emoji: '📚', category: 'education', phase: 'rising', velocity: '+80%', window: 50, estRevenue: '$2k-6k', why: 'Tutoring demand' },
  { name: 'Music Lessons', emoji: '🎹', category: 'education', phase: 'stable', velocity: '+50%', window: 50, estRevenue: '$2k-5k', why: 'Instrument lessons' },
  { name: 'Language Tutoring', emoji: '🗣️', category: 'education', phase: 'rising', velocity: '+70%', window: 50, estRevenue: '$2k-5k', why: 'Online language learning' },
  { name: 'Calligraphy / Hand Lettering', emoji: '🖋️', category: 'creative', phase: 'rising', velocity: '+70%', window: 40, estRevenue: '$1k-4k', why: 'Wedding + stationery demand' },
  { name: 'Candle Making', emoji: '🕯️', category: 'creative', phase: 'rising', velocity: '+80%', window: 40, estRevenue: '$2k-5k', why: 'Handmade candle boom' },
  { name: 'Soap Making', emoji: '🧼', category: 'creative', phase: 'rising', velocity: '+70%', window: 40, estRevenue: '$2k-5k', why: 'Natural skincare DIY' },
  { name: 'Resin Art', emoji: '🟣', category: 'creative', phase: 'emerging', velocity: '+90%', window: 35, estRevenue: '$2k-5k', why: 'Resin crafts trend' },
  { name: 'Pottery / Ceramics', emoji: '🏺', category: 'creative', phase: 'hot', velocity: '+130%', window: 30, estRevenue: '$2k-6k', why: 'Ceramics studio trend' },
  { name: 'Embroidery / Cross-stitch', emoji: '🧵', category: 'creative', phase: 'rising', velocity: '+70%', window: 40, estRevenue: '$1k-4k', why: 'Handcraft revival' },
  { name: 'Digital Art Commissions', emoji: '🎨', category: 'creative', phase: 'rising', velocity: '+90%', window: 40, estRevenue: '$2k-6k', why: 'Creator economy commissions' },

  // ── FINANCE & BUSINESS ──
  { name: 'Bookkeeping (Remote)', emoji: '🧾', category: 'finance', phase: 'rising', velocity: '+80%', window: 50, estRevenue: '$3k-7k', why: 'SMB bookkeeping demand' },
  { name: 'Tax Prep', emoji: '💵', category: 'finance', phase: 'seasonal', velocity: '+90%', window: 30, estRevenue: '$3k-8k', why: 'Tax season' },
  { name: 'Virtual Assistant', emoji: '💻', category: 'finance', phase: 'rising', velocity: '+90%', window: 50, estRevenue: '$2k-6k', why: 'Remote VA demand' },
  { name: 'Financial Coaching', emoji: '📈', category: 'finance', phase: 'rising', velocity: '+80%', window: 45, estRevenue: '$3k-7k', why: 'Personal finance coaching' },
  { name: 'Social Media Management', emoji: '📱', category: 'finance', phase: 'rising', velocity: '+100%', window: 50, estRevenue: '$3k-8k', why: 'SMB social demand' },
  { name: 'Grant Writing', emoji: '✍️', category: 'finance', phase: 'rising', velocity: '+70%', window: 50, estRevenue: '$3k-8k', why: 'Nonprofit grant demand' },
  { name: 'Copywriting', emoji: '✒️', category: 'finance', phase: 'stable', velocity: '+60%', window: 50, estRevenue: '$2k-6k', why: 'Marketing copy demand' },
  { name: 'Business Consulting', emoji: '💼', category: 'finance', phase: 'stable', velocity: '+50%', window: 55, estRevenue: '$4k-10k', why: 'SMB consulting' },

  // ── HEALTH & MEDICAL ──
  { name: 'Medical Billing / Coding', emoji: '🏥', category: 'health', phase: 'rising', velocity: '+70%', window: 50, estRevenue: '$3k-7k', why: 'Healthcare admin demand' },
  { name: 'Telehealth Assistant', emoji: '🩺', category: 'health', phase: 'emerging', velocity: '+110%', window: 45, estRevenue: '$3k-7k', why: 'Telehealth growth' },
  { name: 'Home Health Aide', emoji: '🛌', category: 'health', phase: 'rising', velocity: '+80%', window: 55, estRevenue: '$3k-7k', why: 'Aging population care' },
  { name: 'Physical Therapy (Mobile)', emoji: '🦵', category: 'health', phase: 'rising', velocity: '+70%', window: 45, estRevenue: '$3k-8k', why: 'Mobile PT demand' },
  { name: 'Occupational Therapy', emoji: '🖐️', category: 'health', phase: 'stable', velocity: '+50%', window: 50, estRevenue: '$3k-8k', why: 'Rehab demand' },
  { name: 'Speech Therapy', emoji: '🗨️', category: 'health', phase: 'stable', velocity: '+50%', window: 50, estRevenue: '$3k-8k', why: 'Speech therapy demand' },

  // ── OUTDOOR & ADVENTURE ──
  { name: 'Overlanding / Van Life', emoji: '🚐', category: 'outdoor', phase: 'hot', velocity: '+140%', window: 35, estRevenue: '$3k-8k', why: 'Van life + overland trend' },
  { name: 'Rock Climbing Gym', emoji: '🧗', category: 'outdoor', phase: 'rising', velocity: '+100%', window: 40, estRevenue: '$3k-8k', why: 'Climbing gym growth' },
  { name: 'Kayak / Paddleboard Rental', emoji: '🛶', category: 'outdoor', phase: 'rising', velocity: '+80%', window: 35, estRevenue: '$2k-6k', why: 'Water sports rental' },
  { name: 'Camping Gear Rental', emoji: '⛺', category: 'outdoor', phase: 'emerging', velocity: '+70%', window: 40, estRevenue: '$2k-5k', why: 'Outdoor recreation' },
  { name: 'Guided Hiking Tours', emoji: '🥾', category: 'outdoor', phase: 'rising', velocity: '+70%', window: 40, estRevenue: '$2k-6k', why: 'Experience travel' },
  { name: 'Bike Repair / Mobile', emoji: '🚲', category: 'outdoor', phase: 'rising', velocity: '+70%', window: 45, estRevenue: '$2k-5k', why: 'E-bike + cycling boom' },
  { name: 'Fishing Guide', emoji: '🎣', category: 'outdoor', phase: 'stable', velocity: '+60%', window: 40, estRevenue: '$2k-6k', why: 'Recreational fishing' },
  { name: 'Birdwatching Tours', emoji: '🦅', category: 'outdoor', phase: 'emerging', velocity: '+60%', window: 40, estRevenue: '$1k-4k', why: 'Nature tourism niche' },

  // ── RECOVERY & WELLNESS (beyond current) ──
  { name: 'Recovery Coaching', emoji: '🤝', category: 'recovery', phase: 'rising', velocity: '+80%', window: 45, estRevenue: '$2k-6k', why: 'Sober coaching demand' },
  { name: 'Sober Curious Movement', emoji: '🍹', category: 'recovery', phase: 'hot', velocity: '+120%', window: 35, estRevenue: '$2k-6k', why: 'Sober-curious lifestyle trend' },
  { name: 'Grief Counseling', emoji: '🕊️', category: 'wellness', phase: 'rising', velocity: '+70%', window: 45, estRevenue: '$2k-6k', why: 'Mental health awareness' },
  { name: 'Sleep Coaching', emoji: '😴', category: 'wellness', phase: 'emerging', velocity: '+100%', window: 40, estRevenue: '$2k-6k', why: 'Sleep optimization trend' },
  { name: 'Breathwork Facilitator', emoji: '🌬️', category: 'wellness', phase: 'emerging', velocity: '+110%', window: 35, estRevenue: '$2k-5k', why: 'Breathwork wellness trend' },

  // ── NICHES & GROUPS ──
  { name: 'Senior Move Management', emoji: '👵', category: 'niches', phase: 'emerging', velocity: '+80%', window: 45, estRevenue: '$3k-7k', why: 'Aging population downsizing' },
  { name: 'Pet Bereavement', emoji: '🐾', category: 'niches', phase: 'emerging', velocity: '+70%', window: 40, estRevenue: '$1k-4k', why: 'Pet loss support services' },
  { name: 'Wedding Day Coordinator', emoji: '💍', category: 'niches', phase: 'stable', velocity: '+60%', window: 45, estRevenue: '$3k-7k', why: 'Wedding planning' },
  { name: 'Destination Elopement Planner', emoji: '🌍', category: 'niches', phase: 'rising', velocity: '+90%', window: 40, estRevenue: '$4k-8k', why: 'Elopement trend' },
  { name: 'RV / Camper Maintenance', emoji: '🚐', category: 'niches', phase: 'rising', velocity: '+80%', window: 40, estRevenue: '$2k-6k', why: 'RV lifestyle growth' },
  { name: 'Boat Detailing / Cleaning', emoji: '⛵', category: 'niches', phase: 'rising', velocity: '+70%', window: 40, estRevenue: '$2k-6k', why: 'Marine maintenance' },
  { name: 'Golf Cart Repair', emoji: '🛺', category: 'niches', phase: 'emerging', velocity: '+80%', window: 45, estRevenue: '$2k-5k', why: 'Golf cart communities' },
  { name: 'Comic Book Grading', emoji: '💎', category: 'niches', phase: 'emerging', velocity: '+90%', window: 40, estRevenue: '$2k-6k', why: 'Collectibles grading boom' },
  { name: 'Vinyl Record Grading', emoji: '🎧', category: 'niches', phase: 'rising', velocity: '+80%', window: 40, estRevenue: '$2k-5k', why: 'Vinyl revival' },
  { name: 'Sports Card Grading', emoji: '🃏', category: 'niches', phase: 'rising', velocity: '+90%', window: 40, estRevenue: '$2k-6k', why: 'Trading card boom' },
  { name: 'Furniture Flipping', emoji: '🪑', category: 'niches', phase: 'rising', velocity: '+80%', window: 40, estRevenue: '$2k-5k', why: 'Upcycling resale' },
  { name: 'Thrift / Vintage Reseller', emoji: '👖', category: 'niches', phase: 'hot', velocity: '+130%', window: 30, estRevenue: '$2k-6k', why: 'Vintage resale trend' },
  { name: 'Plant Nursery (Specialty)', emoji: '🌿', category: 'niches', phase: 'rising', velocity: '+70%', window: 45, estRevenue: '$2k-6k', why: 'Specialty plants demand' },
  { name: 'Mushroom Farming', emoji: '🍄', category: 'niches', phase: 'emerging', velocity: '+110%', window: 45, estRevenue: '$3k-7k', why: 'Gourmet mushroom demand' },
  { name: 'Hydroponics / Vertical Farm', emoji: '🥬', category: 'niches', phase: 'emerging', velocity: '+100%', window: 45, estRevenue: '$3k-7k', why: 'Indoor farming trend' },
  { name: 'Beekeeping', emoji: '🐝', category: 'niches', phase: 'rising', velocity: '+70%', window: 45, estRevenue: '$2k-5k', why: 'Hobby beekeeping + honey' },
  { name: 'Composting Service', emoji: '♻️', category: 'niches', phase: 'emerging', velocity: '+80%', window: 40, estRevenue: '$2k-5k', why: 'Sustainability demand' },
  { name: 'Rainwater Harvesting', emoji: '🌧️', category: 'niches', phase: 'emerging', velocity: '+60%', window: 45, estRevenue: '$2k-5k', why: 'Water conservation' },
  { name: 'Solar Panel Installation', emoji: '☀️', category: 'niches', phase: 'rising', velocity: '+120%', window: 50, estRevenue: '$5k-12k', why: 'Solar incentives' },
  { name: 'Heat Pump Installer', emoji: '🔥', category: 'niches', phase: 'emerging', velocity: '+130%', window: 50, estRevenue: '$4k-9k', why: 'Electrification incentives' },
  { name: 'Battery Storage Installer', emoji: '🔋', category: 'niches', phase: 'emerging', velocity: '+140%', window: 50, estRevenue: '$5k-12k', why: 'Home battery backup' }
];

module.exports = { UNIVERSE };
