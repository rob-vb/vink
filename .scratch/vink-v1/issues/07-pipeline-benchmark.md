# Benchmark extraction pipelines

Type: prototype
Status: resolved
Blocked by: 01, 02, 03

## Question

Run the 2–3 candidate pipelines from the extraction research (with Jev where it fits) against the test document set. Measure Field-level accuracy, handwriting results, cost per Document and latency, and how well the confidence scores separate right from wrong values. Link the benchmark script and results as assets. Test Jev specifically on Dutch and handwritten tyre reports, and pin the model version rather than using `jev-latest`. Candidates from the extraction research: (A) Gemini 3.8 Flash on Vertex EU, (B) Claude Sonnet 5 through Vertex or Bedrock EU, optionally Haiku-first with escalation, (C) Mistral OCR 4 plus a cheap text model. Each can be combined with Jev checks per Field. Measure latency too, since no vendor publishes it. Confirm that these models are available in the EU regions. Approach: run the benchmark locally with a Claude Code agent (Sonnet and/or Opus) reading the PDFs, to judge accuracy, handwriting and confidence behaviour without any API integration. Measure cost and latency of the API route (probably Gemini on Vertex EU) only later, when the production pipeline is built.

## Comments

**2026-09-23 (from Test document set):** There are 5 Documents, not 10–20, and no `expected.json` up front. The user corrects the output of the first run against the PDF, and those corrections become the ground truth. So this ticket includes a correction step with the user. With 5 Documents, judge confidence behaviour qualitatively only.

**2026-09-23 (from Field model):** The pipeline output should follow the Field model: a normalised value, the read text and a confidence per Field Value, plus a completeness confidence per List Field. Missing values are `null`, and an empty list is `[]`. Also judge how well the model finds all tyre entries and invents none.

## Answer

Resolved 2026-09-23 with the local approach: Claude Code subagents (Sonnet 5 and Opus 5.5) read each PDF visually, without any API, text layer or Jev. Prototype and scores: branch `prototype/extraction-benchmark` (`prototypes/extraction-benchmark/README.md`). Ground truth is `fixtures/documents/*/expected.json` (git-ignored), built from the Opus run plus the user's corrections.

**Results (5 Documents, qualitative):**
- **Reading is not the bottleneck.** Opus got 78/81 scored Field Values right and Sonnet 75/81. Every scored error is brand normalisation ("Bridge R179", "AP ENDURACE RT2"), not a misread, and that is fixed in the Form description. Handwritten tread depths, positions and serials were read correctly wherever the user could verify them.
- **The real failure is List completeness in bundles.** tire-service-002 holds two handwritten sheets for two separate tyre changes. Both models merged them into one entry and reported a conflict, with a completeness confidence of 0.80–0.85. That is overconfident, and it is the most important signal for confidence and the review screen.
- **Confidence roughly ranks right above wrong.** Mean confidence was Opus 0.90 on right values vs 0.70 on wrong ones, and Sonnet 0.86 vs 0.62. Both models also flagged doubtful values themselves, such as a guessed PO, an implausible mileage of 99 and 0/O ambiguity in a serial. They are not calibrated, and 5 Documents can't show calibration.
- **Opus beats Sonnet** on both accuracy and confidence separation, and it was faster in the agent harness (22–34s against 30–164s). Agent wall-clock time says nothing about API latency.
- **Caveats:**
  - Ground truth leans towards Opus, because it was built from the Opus run and the user checked only disputed values ("probably fine" for the rest).
  - 2 Sonnet runs peeked at the Opus output.
  - Values the user couldn't judge (tire-service-003: PO, mileage, serial; tire-service-002: PO, date and most per-sheet values) are `unknown` and left out of the score.

**Not done here, deferred:** cost and latency on the API, EU availability of the models, and Jev checks. The ticket's own approach defers these to the production pipeline. They graduate to [API pipeline benchmark](11-api-pipeline-benchmark.md).

**User calls:**
- Brand names are written out in full.
- A bundle can hold several handwritten sheets, each for a different tyre change, so one entry per sheet.
