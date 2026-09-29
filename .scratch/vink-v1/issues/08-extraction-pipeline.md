# Extraction pipeline design

Type: grilling
Status: resolved
Blocked by: 07

## Question

Given the benchmark, which pipeline do we build: triage step (text layer vs scanned vs handwritten), extraction method per branch, how Field Values are assigned (LLM, Jev, or both), and fallbacks. Record as an ADR. Also decide whether US-hosted Jev is acceptable under GDPR for our tenants: its data processing agreement has EU standard contractual clauses, but TypeSafe keeps a perpetual right to derive logs and statistics from our data, and zero retention is enterprise-only.

## Comments

**2026-09-23 (user's starting idea):** "The PDF is read, and then Jev looks at what belongs to which Field." That fits the Jev research: a reader (vision model or OCR) produces the Extraction, and Jev judges which text belongs to which Field. Jev picks a candidate; it doesn't write the value. Weigh this against one vision call that returns the Fields directly.

**2026-09-23 (from Stack, hosting and tenancy):** Extraction runs as a Node-runtime Convex action through Workpool, with a limit of 10 minutes per run, so split long PDFs if needed. The PDF bytes come from R2, since there is no GCS URI. The subprocessors so far are Convex, Cloudflare, Google and Resend, so adding US-hosted TypeSafe would be the only non-EU one.


**2026-09-23 (from Benchmark extraction pipelines):** One visual pass per PDF with a strong vision model (Opus) read every Field correctly, including handwriting, apart from brand normalisation, which is now fixed in the Form description. The weak spot is List completeness: two handwritten sheets for separate tyre changes in one bundle were merged into one entry at 0.8+ completeness confidence. Design for this, for example with a separate pass that enumerates entries, or a completeness check per sheet or page. Cost, latency and Jev were not measured; they move to [API pipeline benchmark](11-api-pipeline-benchmark.md), which is blocked by this ticket.

## Answer

Settled with the user on 2026-09-23. Recorded in [ADR 0002](../../../docs/adr/0002-vision-extraction-with-jev-verification.md). **Extraction** is redefined in `CONTEXT.md` as one run that reads a Document against its Form Version. A Field Value now also stores its source page(s), and a Document is never split.

- **Shape:** one vision call per Document. The model returns every Field Value (normalised value, read text, confidence, source page(s)) through structured output with a JSON schema derived from the Form Version. There is no separate OCR step, and no Mistral.
- **Provider:** Vertex AI in the EU only, rather than the plain Gemini API, because only Vertex guarantees EU processing and it serves Gemini and Claude under one contract. The model sits behind a thin adapter and is pinned by configuration. [API pipeline benchmark](11-api-pipeline-benchmark.md) chooses between Gemini Flash and Claude Sonnet/Opus, on accuracy and List completeness first and cost second. There is no model cascade in v1.
- **Triage:** there are no separate routes. The text layer, extracted with pdf.js, always goes along as extra input to the same vision call. That helps with exact numbers and serials such as 0/O.
- **Bundles and length:** one PDF is one Document, filled from all its pages, with no splitting. Irrelevant pages like terms and conditions are ignored by the model. Uploads over **20 pages** are refused.
- **List completeness:** it all happens in one call. The output schema starts with `pages[]`, which says what each page holds and whether it contains a List entry. Every List entry then cites its source page(s). Code checks that every page with an entry is covered and that no two entries claim the same single sheet. If the check fails, the List Field's completeness confidence is capped, which triggers Needs Review. If the benchmark still shows merged entries on tire-service-002, we fall back to a separate inventory call.
- **Jev (verification only):** every filled Field Value gets a Noul asking whether the value fits the Field's meaning and is plausible given the rest of the Document. Values on pages with a text layer get a second Noul asking whether the source text supports them. All questions for one Document go in one request, with a pinned model version. Dates, numbers, ranges and counting stay in code. The Jev probability is one input to confidence. How the inputs combine is decided in [Confidence semantics and auto-send rules](09-confidence-and-auto-send.md). A low score means Needs Review, not escalation to another model.
- **GDPR:** TypeSafe is added as a US subprocessor under the SCCs in its data processing agreement. It receives only short text per Field (label, description, value, read text, nearby page text) and never the PDF. There is an Organisation setting "External verification (Jev)", on by default, that an Admin can switch off. Before the first paying customer, we request an enterprise zero-retention quote and do a transfer impact assessment.
- **Failures:** the output is enforced by the schema, and Workpool retries 3 times with backoff. If it still fails, the Document gets **Extraction Failed** with a manual retry. There is no automatic provider failover. If Jev fails after its retries, the Extraction still succeeds without the Jev signal, and that Document is never approved automatically.

