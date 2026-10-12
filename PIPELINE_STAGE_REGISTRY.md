# TASK: PIPELINE_STAGE_REGISTRY — pipeline-as-data + explicit stage-error semantics

**Priority:** PARKED — build ONLY after the revenue sprint has produced real sales data. Architecture upgrades don't sell checklists; this is post-sprint work.
**Origin:** competitive analysis (Etsy-Printables-AI-Agent on GitHub). Its only genuine structural advantage is pipeline-as-data + inherited orchestration reliability. NicheGate already owns the reliability (search_queue, action_runs, WAL SQLite); this spec adopts the one idea worth stealing — stages as editable data — and the explicit stage-error semantics.

**Why this and not their stack:** Make.com (per-operation cost, external dependency), Sheets-as-DB (antipattern), Canva/Placeit (would outsource the proprietary design/moat layer), draft-only posture (we publish). None of it gets recreated. This spec takes the *pattern*, not the stack.

---

## 1. Goal

Turn the generation pipeline's stages into **editable data** — each stage's model assignment, prompt template, and input/output contract become DB-backed, console-visible, swappable without a code deploy — and give every product an **explicit stage-error state machine** during automated runs.

## 2. Scope — 4 Phases

### PHASE 1 — Stage registry (data model + read path)
1. New additive table `pipeline_stages`: key, display_name, enabled, model_role (maps into existing modelRouter roles), prompt_template (versioned text with `{{variables}}`), input_schema_ref, output_schema_ref, updated_at.
2. Seed rows = exactly today's hardcoded behavior (scan/judge/ideation/concept/social/video/etc.), so enabling the registry changes NOTHING by default (Prime Directive #3).
3. `modelRouter`/`conceptEngine`/`sequenceEngine` read stage config through a single accessor with fallback to current hardcoded values if the table is empty — zero behavior change on day one.
4. Console panel (System view) showing stages read-only in v1.

### PHASE 2 — Editable stages + per-stage A/B
1. Console editor for prompt templates + model role per stage, with **editor-safety validation** (same posture as design briefs: no injection surfaces; templates validated against declared variables).
2. Versioned prompt history (stage_versions table): every change keeps the previous version; one-click rollback — same pattern as the listing optimizer rollback.
3. Per-stage A/B: variant assignment persisted per product (reuse the pricingEngine A/B round-robin pattern), so two prompt variants can compete on real outcomes.

### PHASE 3 — Stage-error state machine in automationCycle
1. Per-product stage tracking during runs: each product carries `stage_status` (pending/running/done/error) + `stage_error` as it moves through discovery→vet→draft→build→review.
2. Halt-on-error semantics (the GitHub project's one clean idea): an errored product halts ITS pipeline, records the error visibly, and never silently skips ahead. The cycle continues with OTHER products (no global stall).
3. Reset/retry action per errored product in the console (reuses action registry), with the error message surfaced in run history (action_run_steps already stores steps — extend, don't duplicate).

### PHASE 4 (optional, multi-tenant prep) — Pipeline profiles
1. Export/import the full stage registry as JSON ("pipeline profile") — the artifact that would make the pipeline a configurable product for other operators later.
2. Profile-per-niche overrides if data justifies it.

## 3. Hard Constraints

1. **Zero behavior change by default:** seeding = current behavior; deleting the table = current behavior. Full suite must pass unchanged after Phase 1 with no test edits.
2. Deterministic fallback intact: registry applies to AI stages only; MODEL_ENABLED=false still never throws.
3. Editor-safety: prompt templates are data, but their rendered output passes the existing concept/content validation paths (novelty gate etc.) — the registry does not bypass any quality gate.
4. Additive migrations only; no destructive changes; cost ledger (`ai_usage`) unchanged.
5. Tests per phase; full suite green before handoff; nothing pushed or deployed without owner audit.

## 4. Definition of Done

- [ ] Swapping one stage's model or prompt via console changes that stage's behavior with NO code deploy
- [ ] Stage prompt A/B runs two variants on real products and reports which wins (post-sprint: wins on sales; pre-sales: wins on critique/novelty scores, honestly labeled as proxy)
- [ ] An intentionally broken stage halts its product with a visible, retryable error — and does not stall the cycle
- [ ] Phase 1 shipped with zero test edits proving no behavior change
- [ ] TASK.md session summary in the existing format

## 5. Out of Scope

- Make.com / Canva / Placeit / any external orchestration or design dependency — explicitly never
- Multi-tenant runtime, billing, external operator onboarding (this spec only prepares the artifact)
- Any change to pricing, publishing caps, marketplace integrations
