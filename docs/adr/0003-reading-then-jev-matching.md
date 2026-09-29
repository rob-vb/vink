# A vision model writes a Reading, Jev matches it to the Form, a small model fills the values

Supersedes [ADR 0002](0002-vision-extraction-with-jev-verification.md) on how Field Values are produced. Vertex EU as the provider route, Jev as verifier and TypeSafe as a US subprocessor all still hold.

An Extraction runs in four steps:
1. **Read:** a vision model gets every page image plus the pdf-inspector text layer and writes a **Reading**, a clean JSON description of the Document that doesn't depend on any Form. It has one object per real-world thing (supplier, vehicle, each tyre change, each invoice line) and its own key names. Duplicates across bundled papers are merged, conflicting readings are kept side by side, and every object carries `_pages` and `_unsure`.
2. **Match:** Jev matches the Reading to the Form Version. Each top-level Field gets a Choice over the Reading's leaf paths, each List Field a Choice over its arrays of objects, and each sub-Field a Choice over the keys inside the chosen array. Every Choice includes `none`.
3. **Fill:** a small text model writes each Field Value from the source Jev picked, in the form the Field asks for (an ISO code, a brand written out in full, a formatted size). It may only use that source.
4. **Verify:** Jev checks each filled value, as in ADR 0002: whether it fits and is plausible, and whether the page text supports it on pages that have a text layer.

We chose this over one vision call that fills the Form directly (ADR 0002). The local benchmark in [API pipeline benchmark](../../.scratch/vink-v1/issues/11-api-pipeline-benchmark.md) scored 80/84 values for it, against 84/84 for ADR 0002, with List entries 4/4 for both. In return:
- **The Reading is independent of the Form.** Choosing another Form re-runs Match and Fill only, for fractions of a cent and without reading the PDF again. The Form proposal can start from the same Reading.
- **Every Field Value gets a real probability** from Jev's Choice, not just the vision model's self-report.
- **Every Field Value gets a traceable source:** a path in the Reading, plus its pages.

We rejected letting Jev map a Reading that copies the papers as printed (tables per paper). Then Jev has to build List entries itself: merging rows across papers, splitting a quantity-2 line, dropping measurements that aren't changes. As a chooser it can't do that; entries came out 2/4. The vision model does the grouping, because it sees the pages. Jev only matches meaning to meaning, where it scored 0.97–1.00.

## Consequences

- Jev is on the critical path: without Jev there is no Match. Decided in [Extraction without Jev](../../.scratch/vink-v1/issues/15-extraction-without-jev.md): there is no fallback matcher, and the Organisation setting from ADR 0002 that let an Admin switch Jev off is dropped, so Jev is required in v1. If Match still fails after the Workpool retries, the Extraction is Extraction Failed. A manual retry resumes from the stored Reading. If Verify fails, the Extraction still succeeds without Auto-Send.
- TypeSafe now receives the whole Reading, personal data included (names, plates, addresses), but never the PDF. Its zero-retention quote and the transfer impact assessment block launch.
- The Reading is stored with the Document (same retention as the PDF). It stays internal and never goes in the Payload.
- A Field Value whose source object lists it in `_unsure`, or has a conflicting reading, is Needs Review, whatever its confidence.
- Confidence is the lowest of: Jev's Match probability (for a sub-Field, the lower of the array choice and the key choice), Jev fit, and Jev support. The vision model's self-report is gone. The raw signals are stored for calibration.
  - Amended 2026-09-26: Jev's Match probability is taken per value, not per source. Jev splits its probability over sources that give the same value (a total in `totals` and in the VAT breakdown, a key and the object around it), which put correct values under the Review Threshold. So Fill also fills the other sources Jev gave at least 0.05, and the value with the most probability in total wins, with that total as its Match probability. It roughly doubles Fill's items.
- The page-inventory completeness check from ADR 0002 is dropped. A List Field's completeness is Jev's probability for the array choice.
- The text layer comes from pdf-inspector, not pdf.js: it keeps label and value together in reading order. Whether its native module loads in a Convex Node action is a build-time check.
- Jev is pinned (`jev-1.13.0`). A request is capped at 64k tokens, so large Readings are split into one request for the top-level Fields and one for the List Fields. Cost is about $0.0004–0.0023 per Document for Match and $0.0003 for Verify, and about 1 s.
- Which vision model reads and which small model fills are configuration with pinned versions, chosen when the pipeline runs on Vertex EU.
