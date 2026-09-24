# 23 — Extraction tracer: Read → Match → Fill for top-level Fields

Type: task
Status: ready-for-agent
Blocked by: 22

## What to build

After upload, an **Extraction** runs in the background as a Node-runtime Convex action through `@convex-dev/workpool` with bounded concurrency (ADR 0003):
1. **Read:** the vision model on Vertex AI EU gets every page image plus the pdf-inspector text layer and writes the **Reading**. The Reading is stored with the Document.
2. **Match:** Jev (`jev-1.13.0`) picks, for each top-level Field, a Choice over the Reading's leaf paths, `none` included.
3. **Fill:** a small text model writes each Field Value from the chosen source only.

Each **Field Value** stores the value, the read text, its source path, the source page(s) and the Match probability. The Document moves to `needs_review`, and a basic Document page lists its Field Values.

The Reader, Matcher and Filler each sit behind a thin provider interface. The real adapters are built here, along with fakes that replay the recorded fixture responses (Readings, Jev choices, fills) for `convex-test`. Jev is always part of the pipeline and has no fallback. Model choices are configuration with pinned versions.

Build-time checks (spec, Further Notes):
1. pdf-inspector's native module loads in a Convex Node action. If it doesn't, extract the text layer outside Convex.
2. Vertex EU has the chosen reader and fill models, and their versions are pinned.

## Acceptance criteria

- [ ] Uploading a PDF triggers an Extraction that runs Read, Match and Fill in order and stores the Reading
- [ ] Each top-level Field gets a Field Value with value (or `null`), read text, source path, page(s) and Match probability
- [ ] The Document moves from `extracting` to `needs_review` and the change shows live
- [ ] The real Vertex reader, Jev Match and Fill adapters run end-to-end on at least one fixture Document
- [ ] `convex-test` with fixture-replay fakes covers the step order, the stored Reading and the Field Values for all 5 fixtures
- [ ] The outcome of build-time checks 1 and 2 is recorded in a comment on this ticket
