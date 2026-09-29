# Firecrawl /parse as the Read step, then Jev

Type: grilling
Status: resolved
Blocked by: 

## Question

Proposal from the user: Firecrawl's `/v2/parse` parses the uploaded PDF, and Jev maps that parsed output to the Form's Fields. Decide:
- **What it replaces.** Does `/parse` replace the vision model's Read step in [ADR 0003](../../../docs/adr/0003-reading-then-jev-matching.md) completely, or does it feed it (for example in place of pdf-inspector's text layer)? Is Fill by the small model still needed after Jev's Match, or does Jev's Choice supply the value directly?
- **What Jev gets.** `/parse` returns markdown per page as printed, or JSON from its own LLM over that markdown. ADR 0003 rejected Jev mapping a Reading that copies the papers as printed: List entries came out 2/4, because Jev would have to merge rows across bundled papers itself. Which Firecrawl output would Jev get, and how do bundles (tire-service-002) still produce the right List entries?
- **Handwriting.** Scanned regions go through GLM-OCR, which doesn't list Dutch or claim handwriting (see [Firecrawl as a PDF extraction route](13-firecrawl-pdf-extraction.md)). What happens to the handwritten tyre sheets? Is there a vision fallback per page?
- **Confidence and sources.** Firecrawl gives confidence per layout block only, and no source pages per value. What do Needs Review, `_unsure` and jump-to-page in review rely on?
- **Cost and data.** About $0.021 per 5-page Document for `/parse`, against about $0.004 for Gemini Flash. Firecrawl stores data in the US with no EU region, and ZDR and a DPA are Enterprise-only. That would make it a second US subprocessor next to TypeSafe, now with the whole PDF. Is that acceptable, given that [Firecrawl as a PDF extraction route](13-firecrawl-pdf-extraction.md) ruled hosted Firecrawl out on cost?
- **Proof.** Does this route need a local benchmark on `fixtures/` with real Firecrawl and Jev calls, against `expected.json` and the ADR 0003 result (80/84, Lists 4/4), before it can replace ADR 0003?

## Comments

## Answer

Resolved 2026-09-24 with the user. We're pursuing the Firecrawl route. The goal is **no vision model in the pipeline**: `/parse` in `mode: auto` uses pdf-inspector to decide per page whether OCR is needed, so pages with a text layer cost almost nothing. The route replaces ADR 0003's Read step only if it wins [Firecrawl route benchmark](17-firecrawl-route-benchmark.md).

- **Two variants, benchmarked side by side:**
  - **A, the user's proposal as stated:** `/parse` markdown per page goes straight to Jev, which picks a source per Field. Its known risk is bundles, which scored 2/4 List entries in ADR 0003.
  - **B:** a cheap text model (not vision) turns the `/parse` markdown into the usual Form-independent Reading, with bundles merged, `_pages` and `_unsure`. Match, Fill and Verify then run as in ADR 0003.
- **Fill stays.** Jev picks the source, and the small model writes the value in the form the Field asks for.
- **Handwriting:** we try GLM-OCR as it is and let the benchmark decide. We don't plan a vision fallback per page up front.
- **Bar to replace ADR 0003:** at least 80/84 values, Lists 4/4, and the handwritten Fields of both handwriting fixtures correct. If the route falls short, ADR 0003 stands and Firecrawl drops out.
- **Confidence and sources:** these fall out of the variant that wins the benchmark. `/parse` gives page markers and a confidence per layout block, but no per-value source. The benchmark ticket records what each variant can supply for `_pages` and `_unsure`.
- **Data:** Firecrawl becomes a second US subprocessor and receives the whole PDF. The user chose this knowingly and doesn't want Enterprise. The paperwork comes later, before launch:
  - a paid plan from Standard up (it includes a countersigned DPA; request it from help@firecrawl.com);
  - SCCs in that DPA (Firecrawl isn't DPF-certified and names no transfer mechanism);
  - confirmation of how long parse results stay in their GCS;
  - a transfer impact assessment.

  Always send `maxPages` (our 20-page cap), because that skips Firecrawl's PDF cache.
- **Self-hosting isn't possible:** OCR runs in Firecrawl's closed Fire-PDF service. The open-source pieces are pdf-inspector (MIT) and the GLM-OCR weights (MIT).
- **Test data:** the user approved sending the 5 fixtures to Firecrawl. The key is in `.env` as `FIRECRAWL_API_KEY`, with 1,400 credits left on 2026-09-24.
