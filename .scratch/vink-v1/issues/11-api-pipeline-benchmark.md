# API pipeline benchmark

Type: prototype
Status: resolved
Blocked by: 08, 13

## Question

Run the pipeline chosen in [Extraction pipeline design](08-extraction-pipeline.md) through the real API against `fixtures/documents` and its `expected.json`. Measure cost per Document, latency, Field-level accuracy against the local Claude results from [Benchmark extraction pipelines](07-pipeline-benchmark.md), and List completeness on bundles; tire-service-002 has two handwritten sheets for two separate tyre changes. The route is probably Gemini Flash on Vertex EU. Confirm that the chosen models are available in the EU regions, and pin the model versions. If the design uses Jev, test Jev's per-Field checks on the Dutch and handwritten tyre reports with a pinned version, not `jev-latest`.

## Comments

**2026-09-23 (from Extraction pipeline design):** The design is fixed in ADR 0002. What to run and measure:
- **Models:** Gemini Flash **and** Claude Sonnet/Opus, all on Vertex EU, with exactly the same prompt and schema. Send the whole PDF plus its pdf.js text layer.
- **Completeness:** check that the `pages[]` inventory with per-entry source pages keeps the two sheets of tire-service-002 apart. If not, try a separate inventory call.
- **Jev:** run the per-Field Nouls (fit and plausibility, plus source support on text-layer pages) in one request per Document, with a pinned version, and record their cost and latency too.

Decide the model on accuracy and completeness first, cost second.

**2026-09-23 (from Confidence semantics and auto-send rules):** Confidence is the minimum of the self-report and the Jev Nouls, and code checks are separate flags. Report the raw signals per Field Value, and check whether the default Review Threshold of 0.8 separates right from wrong values on the fixtures for the chosen model.

**2026-09-23 (from Firecrawl as a PDF extraction route):** Hosted Firecrawl is not a candidate. Test pdf-inspector as the triage and text-layer step:
- Is its per-page markdown a better text layer for the model and for Jev than a plain pdf.js extraction?
- Does its native Node module load in a Convex Node action (`externalPackages`)? If not, fall back to the WASM build or run it on the VPS.
- Is per-page coverage complete on 9–20-page PDFs? Its default check samples 8 pages.

**2026-09-23 (scope change, user):** Test locally first, with Claude Code subagents as the vision model instead of Vertex. Vertex comes only once everything is built. Jev runs for real (key in the prototype's git-ignored `.env`, pinned `jev-1.13.0`).

## Answer

Settled with the user on 2026-09-24. The pipeline changes: [ADR 0003](../../../docs/adr/0003-reading-then-jev-matching.md) supersedes ADR 0002 on how Field Values are produced. `CONTEXT.md` now defines **Reading**, **Match** and **Fill**, and redefines **Extraction** and **Needs Review**.

- **Chosen pipeline (the user's design):**
  1. Opus reads the PDF plus the text layer into a **Reading**: clean JSON with one object per real-world thing, duplicates merged, conflicts kept.
  2. Jev matches Fields to paths, List Fields to arrays and sub-Fields to keys.
  3. A small model (Haiku) fills the values from those sources.
  4. Jev verifies.

  Score: **80/84 values, Lists 4/4**, List completeness 0.97–1.00, and 3 of the 4 wrong values caught at 0.8. The fourth wrong value was a reading conflict the Reading had recorded, which the Needs Review rule in ADR 0003 now catches. Matching costs $0.0004–0.0023 per Document and takes about 1 s.
- **ADR 0002's single vision call** scored 84/84 with Lists 4/4. It lost on the user's call, because the Reading is independent of the Form: a wrong Form is re-matched without re-reading, the Form proposal can start from the same Reading, and every value gets a Jev probability and a traceable source.
- **Rejected: Jev mapping the papers as printed** (tables per paper). Jev has to build List entries itself there (merge rows across papers, split a quantity-2 line, drop measurements that aren't changes), and that gave 2/4. Asking over the whole JSON made it worse (1/2, 5/1, 2/1).
- **Ground truth corrected:** tire-service-002 is **one** tyre change, not two. Both handwritten sheets carry the same removed and mounted serials, and the invoice bills 1 tyre. The user thinks so but isn't sure, so the count is unverified. The "merged List entries" weak spot from ticket 07 was this error.
- **Jev as verifier:** stable (mean |Δ| 0.008 between identical requests). On planted errors it caught 9 of 10: values under the wrong Field, implausible values, made-up values and digit misreads on text-layer pages. It is blind to misreads in handwriting (0.81 → 0.79), which Needs Review from `_unsure`/conflicts and review have to cover.
- **Text layer:** pdf-inspector's markdown beats pdf.js (label and value stay together), and with it Opus got brand names right that it missed in ticket 07.
- **Review burden at 0.8:** about a quarter of the right values are flagged, and no fixture Document would be auto-sent. We keep 0.8 until the larger test set.
- **Not done here** (at build time, on Vertex EU, see Out of scope on the map): cost and latency of the real reader, Gemini vs Claude as the reader, EU availability and pinned versions, and pdf-inspector in a Convex Node action.

Prototype: branch `prototype/api-pipeline-benchmark`, `prototypes/api-pipeline-benchmark/` (README has all scores). Document data and run output stay git-ignored in `fixtures/documents`. `tire-service-002/expected.before-ticket11.json` keeps the old ground truth.
