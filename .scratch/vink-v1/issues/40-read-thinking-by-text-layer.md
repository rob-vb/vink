# 40 — Read thinking level by text layer

Type: task
Status: ready-for-agent
Blocked by: 39

## What to build

Read runs at thinking `HIGH` for every Document. [Read thinking level](39-read-thinking-level.md) measured `MEDIUM` as about half the cost and 3–7× faster (20 pages: 43 s against 310 s), but `MEDIUM` misread a handwritten digit that Jev can't catch. Handwriting only appears on scanned pages. So Read picks its thinking level per Document from the text layer it already reads:
- every page has a reliable text layer (a digital PDF) → `MEDIUM`;
- any page is scanned or image-based → `HIGH`.

pdf-inspector already tells this per page: `extractPagesMarkdown` gives `needsOcr` per page (Read uses it in `textLayerOf`, `convex/lib/reader.ts`), and `detectPdf` gives `pagesNeedingOcr` with reasons (`scanned`). On the fixtures: `invoice-001`, `tire-service-003` and `tire-service-004` are `TextBased` with no page needing OCR; `tire-service-001` and `-002` are `Scanned` on every page; `pages-20` is `Mixed`.

`READER_THINKING` stays as an override: when it is set, it wins over the rule, so benchmarks can still force a level.

The Proposer (ticket 36) stays at `HIGH`.

## Why not a model

A Clef spike (branch `spike/clef-vision`, 2026-10-03 to 2026-10-05) asked Clef Flash per page whether it holds handwriting. On the 11 real fixture pages it was right every time, but on 14 test pages with handwriting pasted onto printed pages, the clearest "no handwriting" page (a printed stamp) scored 0.05 and a scanned page with a small handwritten note 0.06. That margin is too thin for a rule that must never send handwriting to `MEDIUM`. The text layer costs nothing and has no such edge.

## Risk: scans with an OCR text layer

Some scanners add an OCR text layer to a scan. If pdf-inspector reads such a page as text-based, a handwritten scan goes to `MEDIUM`. Check this before relying on the rule: make an OCR'd copy of `tire-service-002` (for example with `ocrmypdf`, outside the repo) and see what `needsOcr` and `pagesNeedingOcr` say. If it passes as text-based, also count a page as scanned when an image covers most of it.

## Acceptance criteria

- [x] Read uses `MEDIUM` when no page needs OCR and `HIGH` otherwise; `READER_THINKING`, when set, overrides it
- [x] The level used is stored with the Extraction's usage (or logged), so a bill can be traced to it
- [x] Tests cover: all pages text-based, one scanned page in a digital PDF, all pages scanned, and the override
- [x] An OCR'd scan is checked as described under Risk, and the rule handles it
- [x] `npm run eval` on fresh Readings (not cached), twice: values x/84 (bar 80/84), Lists x/4, Needs Review recall, and cost and Read time per Document, against the `HIGH` runs in ticket 39
- [x] `fixtures/timing` (20 pages, `Mixed`) still runs at `HIGH`, so its timing doesn't change

## Comments

- 2026-10-05 — Built on branch `read-thinking-by-text-layer`. `convex/lib/readThinking.ts` gives the level and the scanned pages; Read logs both (`Read at MEDIUM; scanned pages: none`). `READER_THINKING` moved out of `models.ts` and is read per call, so it still overrides.
  - **OCR'd scans:** pdf-inspector already catches a real OCR layer, invisible text over the image (`needsOcr`, reason `invisible_text_layer`). It reads text placed *under* a page-sized image as a text layer, though (some tools write it that way). So a page also counts as scanned when images cover at least half of it; the logos and banners on the digital fixtures cover at most 16%. Both kinds have a test, built with pdf-lib so the tests don't need the git-ignored fixtures.
  - **The rule on the fixtures:** `invoice-001`, `tire-service-003` and `-004` → `MEDIUM`; `tire-service-001`, `-002` and `pages-20` → `HIGH` (so the 20-page timing doesn't change; not re-timed).
  - **Eval, fresh Readings, Vertex EU, Jev live:**
    - Run 1: **81/84**, verified 14/15, Lists 4/4, Needs Review precision 17%, recall 33%, $0.12.
    - Run 2: **82/84**, verified 15/15, Lists 4/4, precision 17%, recall 50%, $0.13.
    - All at `HIGH` (ticket 26): 82/84, verified 15/15, $0.16. Read on the three digital Documents took 7–19 s.
  - **Regression on a digital Document:** `currency` in `invoice-001` is `null` in both runs (want `EUR`). It is flagged, not missed. The `MEDIUM` runs in ticket 39 had the same miss.
  - **Handwriting at `HIGH`:** `mileageKm` in 002 is 229596 (want 229546) and missed in **both** runs, although 002 is read at `HIGH`. Ticket 39 put this misread down to `MEDIUM`; it is read-to-read variation at `HIGH` too. This ticket doesn't change how 002 is read.

