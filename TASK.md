# Goal: NicheGate autonomous digital-product factory — discover niches, generate file-backed products, publish to Gumroad/Etsy.
# Done so far: Express+SQLite app live, File/Bundle/Discovery/Seasonal/Vetting engines done, OpenRouter router + cost caps built (MODEL_ENABLED=false by default), 23 professions / 157 products / 15 listed.
# Current file states: server/services/modelConfig.js + modelRouter.js = AI layer; server/services/discovery.js = sweep loop; .env.example has MODEL_* keys; NO TASK.md/MEMORY.md until now.
# Next 3 steps: 1) Set OPENROUTER_KEY + MODEL_ENABLED=true with cheap defaults 2) Deploy to Railway for 24/7 sweeps 3) Approve Review Queue + Deploy Bundles.
# Do NOT redo: File Factory, bundle engine, SEO engine, publish dispatcher fixes — all verified.
