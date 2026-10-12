# TASK: COVER MODEL FLEXIBILITY — end the cover-quota ceiling (F1 + F2)

**Priority:** HIGH — ships NOW (blocks the sprint's cover-regeneration step; tiny blast radius).
**Origin:** BIONIC_E2E_AUDIT.md F1/F2. Root cause verified: worker hardcodes `@cf/leonardo/lucid-origin` — 636 neurons per 512×512 tile ≈ **7,600 neurons per 1200×1800 cover ≈ $0.084** — so the 10k/day free allocation ≈ **1 cover/day** (exhausted 2026-10-12, error `4006` passed through as opaque 502).
**The fix is model choice, not a subscription:** Cloudflare's own catalog offers the same worker a ~24× cheaper path (see [pricing docs](https://developers.cloudflare.com/workers-ai/platform/pricing/)).

---

## 1. Worker changes (`cf-worker/src/index.js`)

1. **Model from env with allowlist:** `env.COVER_MODEL` (default `@cf/black-forest-labs/flux-2-klein-4b`); optional per-request `model` field accepted ONLY from the allowlist:
   `flux-2-klein-4b` (default/standard) · `flux-1-schnell` (draft/cheap) · `flux-2-klein-9b` (hero) · `leonardo/lucid-origin` (legacy/premium).
   Non-allowlisted values → 400. (Also honors `wrangler.toml` var so deploys pin the default.)
2. **Per-model dimension validation:** keep the ≥1200×1800 / ≤2500×2500 contract; reject model/dimension pairs the model can't serve (check at request time, fail with 400 + clear message).
3. **Error taxonomy:** map Cloudflare error `4006` (quota) → HTTP **429** with body `{error:'quota_exhausted', resets_at:'00:00 UTC'}`; upstream auth/model errors → 502 with the upstream message preserved. Callers must be able to distinguish "quota" from "transient."
4. `num_steps` per model default: klein-4b per its recommended steps; schnell ≤ 4 (it rejects more); lucid-origin keeps 24. Move `guidance`/`num_steps` into the same per-model config object.
5. Keep the response contract identical (`{image, width, height, model}`) so the server-side compositor is untouched by the switch.

## 2. Server changes (`coverArt.js` + minor)

1. **Cover class → model mapping** (settings-backed, env-overridable): `standard → flux-2-klein-4b` (default), `draft → flux-1-schnell`, `hero → flux-2-klein-9b` (used sparingly — niche-brand hero images only). Existing call sites pass class, not model.
2. **Per-item error surfacing (F2):** `POST /api/covers/generate` items must include `{id, ok:false, reason}` on failure — `quota_exhausted` (429), `upstream_error` (502), etc. No more silent `items:[]`.
3. **Health note:** source health / console shows cover-provider capacity state (`quota_exhausted` until 00:00 UTC when it happens) instead of silent plain-layout fallback.
4. **Retry policy:** on 429 do NOT retry; defer to the next automation cycle (attempts after quota are pure noise — see audit). On 502-transient, one retry as today.

## 3. Verification

1. Worker tests: allowlist enforcement, per-model dimension pairs, 4006→429 mapping, response contract unchanged.
2. Server tests: class→model mapping, per-item error surfacing, 429 no-retry.
3. **Live E2E (after deploy):** generate 2 covers (standard class) → verify both are 1200×1800 masters + 1200×1500 4:5 exports, slot inside safe rect, `cover_reviews` rows persisted against image hashes. This closes the "4:5 never exercised live" audit gap.
4. Visual check on first klein-4b renders through the critique gate (model switch = new aesthetic; the gate is the safety net).

## 4. Economics after this change

- Free tier: **~30 covers/day** (10k ÷ ~330 neurons) at klein-4b rates — sprint-scale cover regeneration fits INSIDE the free tier.
- Paid overage when needed: ~$0.004/cover; Workers Paid ($5/mo base) only becomes relevant around 1,000+ covers/month.
- Legacy note: existing cached covers remain valid; `cover-v5`-style cache key should include model name to avoid mixing model outputs.

## 3b. Quality benchmark set (model-adoption control)

Any model change (adoption or class promotion) regenerates a fixed benchmark gallery BEFORE mass use, so quality is measured, not remembered:
- **Inputs:** one fixed flat-lay prompt per design DNA (15 total, drawn from `COVER_SCENES`/the DNA library) + 3 stress prompts (dense props, low light, reflective surfaces).
- **Storage:** `design-references/model-benchmarks/<model-name>/` — one immutable gallery per model, plus its critique-gate scores saved alongside.
- **Adoption rule:** a new default model must average within 1.0 point of the incumbent's stored scores AND pass `zero_garbled_text` on every render. Promotions to hero-class additionally require owner eyeball sign-off on the gallery.
- **Reuse:** the same gallery re-renders against any future model — every future switch becomes a 15-minute measured decision instead of a taste debate.

## 5. Constraints

- No compositing/critique/publish-gate changes — this task only changes WHICH model renders the background photo.
- Nothing pushed or deployed without owner audit (standing rule). Worker deploy requires owner go.
