# One vision call per Document on Vertex EU, verified by Jev

Status: superseded by [ADR 0003](0003-reading-then-jev-matching.md) on how Field Values are produced (2026-09-24). Vertex EU, Jev as verifier and TypeSafe as a US subprocessor still hold.

An Extraction sends the whole PDF (every page, plus its text layer when there is one) to one vision model on Vertex AI in the EU. The model returns every Field Value directly, following a JSON schema derived from the Form Version. Jev (TypeSafe) then checks each Field Value, but it never writes a value. We rejected the obvious "OCR first, then map text to Fields" pipeline. The local benchmark showed that reading, handwriting included, is not the bottleneck. Jev can't see pages, so letting it assign text to Fields would add a step and put a US service on the critical path without fixing the real failure, which is List completeness in bundled PDFs. We use Vertex instead of the plain Gemini API because only Vertex keeps processing in the EU, and it serves Gemini and Claude behind one contract.

## Consequences

- TypeSafe becomes the only subprocessor outside the EU (US, with SCCs). Jev receives only short text per Field and never the PDF. An Admin can switch Jev off per Organisation.
- When Jev fails or is switched off, the Extraction still succeeds. A Document without a Jev result is never approved automatically.
- List completeness is checked in code. The model first reports what is on each page, and every List entry cites its source pages. That check does not rely on the model's own confidence.
- Which model to use (Gemini Flash or Claude) is configuration with a pinned version. The API pipeline benchmark picks it.
