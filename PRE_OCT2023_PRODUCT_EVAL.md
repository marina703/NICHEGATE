# Pre-Oct-2023 Product Evaluation — NicheGate

## Inventory (profession-box.db, 230 products)
- Listed/live on Gumroad (marketplace_id present): 10 → KEEP/STASH
- Approved: 29 (27 manual + 2 engine)
- Drafts: 191 (165 manual + 26 engine-origin)

## Recommendation (autonomous path)
1. KEEP/STASH the 10 listed products — already live on Gumroad with valid marketplace IDs. Do not trash or redo.
2. REDO through whole pipeline: the 26 engine-origin drafts — produced by autonomous engine, never published; prior failure was model-provider, not task. Re-run full pipeline.
3. LEAVE the 165 manual drafts + 27 manual approved as-is.
4. TRASH: none.

## Autonomous execution plan
- Queue engine-origin drafts for pipeline (concept→brief→html→cover→listing→publish).
- Do not touch listed/approved manual rows.
- On provider failure: retry with backoff; never delete.
" path="C:/Users/linde/OneDrive/Desktop/NICHEGATE-main/PRE_OCT2023_PRODUCT_EVAL.md