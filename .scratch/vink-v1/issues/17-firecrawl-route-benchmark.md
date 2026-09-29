# Firecrawl route benchmark

Type: prototype
Status: resolved
Blocked by: 16

## Question

Does the Firecrawl route from [Firecrawl /parse as the Read step, then Jev](16-firecrawl-parse-then-jev.md) match ADR 0003 on `fixtures/documents` and their `expected.json`? Run it locally with real calls: Firecrawl `/v2/parse` (`mode: auto`, `maxPages` set, key `FIRECRAWL_API_KEY` in `.env`) and Jev pinned to `jev-1.13.0`. Test both variants:
- **A:** `/parse` markdown per page → Jev Match → Fill → Verify.
- **B:** `/parse` markdown → a cheap text model writes the Reading → Jev Match → Fill → Verify (as in ADR 0003).

Build on the harness from [API pipeline benchmark](11-api-pipeline-benchmark.md) (branch `prototype/api-pipeline-benchmark`). Measure:
- Field-level accuracy, and List entries on the bundles (tire-service-002 is one tyre change);
- the handwritten Fields specifically, including what GLM-OCR makes of them;
- credits and cost per Document, and latency;
- what each variant can supply for `_pages`, `_unsure` and jump-to-page.

**Bar:** at least 80/84 values, Lists 4/4, and the handwritten Fields correct. Meeting it means a new ADR that supersedes ADR 0003's Read step. Missing it means ADR 0003 stands.

## Answer

Resolved 2026-09-24. **Firecrawl misses the bar on every count, so ADR 0003 stands and Firecrawl drops out**, as agreed in [Firecrawl /parse as the Read step, then Jev](16-firecrawl-parse-then-jev.md). No new ADR.

| | Values | Lists | Handwritten Fields |
|---|---|---|---|
| ADR 0003 (ticket 11) | 80/84 | 4/4 | right |
| A: markdown → Jev → fill | 53/84 | 1/4 | wrong or missing |
| B: markdown → Haiku Reading → Jev → fill | 57/84 | 2/4 | missing |

- **Handwriting is lost at GLM-OCR, before any model sees it.** On tire-service-002 both serials are misread (`6135366936`, `BP10930529`), the removed tread depth is missing, the columns are shifted, and the page-3 handwriting is dropped entirely. On tire-service-001 the axle chart comes out as loose numbers. Neither variant produced one correct handwritten tyre change, and variant B found no tyre-change array at all on either handwritten Document.
- **Printed pages work, but not better than ADR 0003.** Variant A repeats ticket 11's finding: mapping the papers as printed gets Lists wrong (2 entries instead of 1 on bundles).
- **Confidence and sources:** `blocks[].confidence.ocr` was `null` on every block, so `_unsure` has no OCR signal. Page numbers are available (`pages[]`, `pageMarkers`), and blocks carry bounding boxes, but nothing links them to individual values.
- **Cost and latency:** 1 credit per page in `mode: auto` (11 credits for the fixtures, about $0.0009 per page at Standard). `/parse` took 1.3–5 s, and 20.5 s on tire-service-002. Jev cost $0.0003–0.0065 per Document, in under 1.2 s.
- **Consequences:** Firecrawl is no longer a subprocessor, so the DPA/SCC to-do for Firecrawl disappears. pdf-inspector (local, MIT) stays as the text-layer step in ADR 0003.

Prototype: branch `prototype/firecrawl-route-benchmark`, `prototypes/firecrawl-route-benchmark/` (README has the full scores and run commands). Firecrawl output and run files stay git-ignored in `fixtures/documents/<doc>/` (`parse-firecrawl.json`, `*-fc*.json`).
