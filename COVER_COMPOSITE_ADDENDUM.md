# ADDENDUM: Photoreal Composite Cover Recipe (supersedes cover-layout guidance)

**Status:** owner-approved direction. The cover concept stays: REAL product preview inside a PHOTO-REAL image. What changes is the execution recipe.

## Why current output fails its own concept

1. The AI photo contains its own document/clipboard with garbled pseudo-text → competes with the real preview card (two fake-vs-real "products" in one frame).
2. The preview is a flat rotated card over a perspective photo → reads as pasted sticker.
3. Heavy scrim (60–97%) kills the photo-real feel and is only there to rescue text contrast.

## The recipe (v1 — deterministic)

### 1. Photo generation with a BLANK slot
- FLUX prompt pattern: `top-down flat-lay photo, {niche scene description}, a blank white tablet lying flat {position}, {2-3 contextual props}, {lighting description}, shot from directly above, no text anywhere, no labels, no writing, no logos`
- The tablet/screen occupies a FIXED region of the frame (right 45%, vertically centered, ~40% width) — fixed slot means fixed composite coordinates.
- Scene library per design DNA (from design-references/MANIFEST.md), NOT per generic niche:
  - Ink-Trap Engineered → workbench/toolbox flat-lay, cool light
  - Grounded Organic → wooden desk, tea, kraft paper, warm light
  - Quiet Luxury → linen desk, minimal props, soft neutral light
  - Flash & Chrome → dark leather, stencil vibe, red accent light
  - Editorial Ink → mahogany desk, fountain pen, paper stack
  - Bold Minimalism → clean white surface, single prop, hard light
- Hard negatives: `text, letters, words, labels, watermark, logo, screen content, document`
- Generate at 2:3 native (1200×1800 min), never center-crop from square.
- **Aspect-ratio contract (final):** the PHOTO is the 2:3 master; the MARKETPLACE COVER EXPORT stays 1200×1500 (4:5) JPEG — neither Etsy nor Gumroad wants 2:3, and the `.ts` layout is built for it. Author the device slot and all text INSIDE the 4:5-safe center zone of the 2:3 frame, then the export pipeline derives both renditions from one master render: 1200×1500 JPEG (marketplaces) + 1000×1500 PNG full-frame (Pinterest). Optional 1200×1200 square crop if a card surface ever demands it.

### 2. Composite the REAL preview
- Render the product's actual HTML to an image (existing preview pipeline) at the slot's aspect ratio.
- Place into the blank slot: rotation −1° to −3°, soft drop shadow (`box-shadow: 0 30px 60px -18px rgba(0,0,0,.55)`), 5–8% warm overlay matching the photo grade so it sits IN the light.
- Flat-lay + flat composite = photoreal with zero perspective math. (v2, optional: vision-model slot detection + CSS 3D perspective match for angled shots.)

### 3. Copy layer (from the product's own data — never hardcoded)
- Kicker: niche name, small caps, no emoji.
- Title: from `products.concept.name` (the novelty-gated concept name), not the generic "{Type}" label.
- Benefits: the concept's actual 3 benefits from `concept` JSON — they passed the novelty gate; the generic defaults did not.
- Typography + accent colors: the product's design brief / DNA.
- NO price baked into the image (prices change; the launch rule would make every cover a lie).
- Scrim: only a soft local gradient behind the text band, never full-bleed.

### 4. Critique gate for covers (extend designCritic)
Render → screenshot → score with a cover-specific rubric:
- preview-composite realism (shadow/halo/plausible placement) 0–10
- zero garbled text anywhere (photo AND preview) — hard fail if violated
- single focal hierarchy (preview is the hero) 0–10
- thumbnail legibility at 250px 0–10
- DNA consistency with the product's design brief 0–10
Threshold ≥ 6.5, one revision pass, same cost caps as product critiques.

## Definition of done
- [ ] Photo prompts carry the blank-slot + no-text pattern and DNA scene library
- [ ] Real preview composited with shadow + light-matching (no pasted-sticker look)
- [ ] Cover copy sourced from concept JSON; no emoji, no baked price
- [ ] Covers pass the extended critique gate before marketplace upload
- [ ] Side-by-side: 5 consecutive covers in different niches = 5 different scenes, same family feel
