# Benchmark extraction pipelines

Type: prototype
Status: open
Blocked by: 01, 02, 03

## Question

Run the 2–3 candidate pipelines from the extraction research (with Jev where it fits) against the test document set. Measure Field-level accuracy, handwriting results, cost per Document and latency, and how well the confidence scores separate right from wrong values. Link the benchmark script and results as assets. Test Jev specifically on Dutch and handwritten tyre reports, and pin the model version rather than using `jev-latest`. Candidates from the extraction research: (A) Gemini 3.8 Flash on Vertex EU, (B) Claude Sonnet 5 through Vertex or Bedrock EU, optionally Haiku-first with escalation, (C) Mistral OCR 4 plus a cheap text model. Each can be combined with Jev checks per Field. Measure latency too, since no vendor publishes it. Confirm that these models are available in the EU regions.
