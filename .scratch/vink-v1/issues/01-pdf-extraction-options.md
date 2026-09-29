# PDF extraction options and cost

Type: research
Status: resolved
Blocked by: 

## Question

Which ways exist to get content out of a PDF — embedded text layer, classic OCR (e.g. Tesseract, Azure Document Intelligence, AWS Textract, Google Document AI), dedicated OCR models (e.g. Mistral OCR), and vision LLMs (Claude, Gemini, GPT) — and how do they compare on: handwriting quality, layout/table preservation, per-page cost, latency, EU data residency / GDPR processing terms? Include how cheaply we can detect up front whether a PDF has a usable text layer or is scanned/handwritten (triage step). Output: a comparison table plus 2–3 candidate pipelines worth benchmarking.

## Answer

None of the classic OCR services reads Dutch handwriting: Azure, Google Document AI, AWS Textract and Tesseract all fall short. For handwritten Documents that leaves vision models (Claude, Gemini, GPT) and Mistral OCR 4. Every serious option is cheap: about $0.002–0.017 for a 1-page Document and $0.004–0.066 for 5 pages, with EU routing. So the choice comes down to handwriting accuracy and how trustworthy the confidence scores are, not price.

- **Triage:** check each page locally with pdf.js. It costs nothing, but it can't tell handwriting apart from a printed scan, so every image page goes to a model that can read handwriting.
- **One call per Document:** a vision model can return the Form's Fields as JSON directly, so no separate paid Extraction step.
- **EU data residency:** Claude only through Vertex EU or Bedrock EU (+10%). Gemini through Vertex `eu`. Mistral is EU by default and has zero retention. Anthropic's own API processes data in the US.
- **Candidate pipelines**, all starting with the local check:
  - A: Gemini 3.8 Flash on Vertex EU, the cheapest. Introductory price until 2026-12-31, then roughly double.
  - B: Claude Sonnet 5 through Vertex or Bedrock EU, likely the strongest on handwriting. Cheaper variant: Haiku first, escalate low-confidence Fields.
  - C: Mistral OCR 4, then a cheap text model maps it to Fields. Word-level confidence and page coordinates, useful for Needs Review and for highlighting source text in the review screen.
- **Batch APIs** could halve all of these costs.

Findings: branch `research/pdf-extraction-options`, file `.scratch/vink-v1/research/pdf-extraction-options.md`.
