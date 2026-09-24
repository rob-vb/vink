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

- [x] Uploading a PDF triggers an Extraction that runs Read, Match and Fill in order and stores the Reading
- [x] Each top-level Field gets a Field Value with value (or `null`), read text, source path, page(s) and Match probability
- [x] The Document moves from `extracting` to `needs_review` and the change shows live
- [ ] The real Vertex reader, Jev Match and Fill adapters run end-to-end on at least one fixture Document
- [x] `convex-test` with fixture-replay fakes covers the step order, the stored Reading and the Field Values for all 5 fixtures
- [ ] The outcome of build-time checks 1 and 2 is recorded in a comment on this ticket

## Comments

- 2026-09-24 — Built on branch `ticket-23-extraction`. `documents.insert` enqueues `extractionRun.run` (a Node action) on the `extractionPool` Workpool: 5 in parallel, 4 attempts (the first run and 3 retries) with backoff. The action reads the PDF only when no Reading is stored yet, stores the Reading, then reloads it for Match and Fill, so a retry resumes at Match. The Reading is stored as JSON text in its own `readings` table, because `_pages` and `_unsure` aren't valid Convex field names and the Document list shouldn't load Readings. Field Values live in `fieldValues`: one per top-level Field, with value, read text, source path, pages and Match probability. List Fields are skipped until ticket 25. State changes go through `lib/documentStates.ts` (`moveTo`), which keeps `documentCounts` in step.
- Adapters: the interfaces are in `convex/lib/pipeline.ts`. `lib/reader.ts` sends the PDF itself (the model sees page images) plus pdf-inspector's per-page markdown to Claude on Vertex, with the ticket-11 READ_CLEAN prompt. `lib/matcher.ts` asks Jev one Choice per Field over the Reading's type-filtered leaf paths plus `none`, with the whole Reading as state. `lib/filler.ts` has Haiku write the values with a JSON schema (per type, choice as an enum). Pinned models are in `lib/models.ts`: reader `claude-opus-5`, fill `claude-haiku-4-5@20251001`, Jev `jev-1.13.0`, region `eu`, each overridable by env (`READER_MODEL`, `FILL_MODEL`, `JEV_MODEL`, `VERTEX_REGION`). Credentials: `GOOGLE_VERTEX_CREDENTIALS` (service-account JSON) and `TYPESAFE_API_KEY`.
- Tests (Seam 1, agreed with the user): `convex/extraction.test.ts` uses fakes from `test.setup.ts` (`fakePipeline`, `fakeReader`, `fakeMatcher`, `fakeFiller`) that replay a Recording and log calls. It covers the Field Values and Needs Review state, step order, a retry that skips Read, and the list counts. It also replays all 5 fixtures (Reading `clean-opus.json`, Match `map-opus-clean.json`, Fill `fill-opus-clean.json`). The expected read text and pages come from the prototype's own `run2-opus-clean.json`. The fixtures are git-ignored, so those 5 tests are skipped where the data is missing. The unit seam `convex/lib/reading.test.ts` covers leaf paths and page inheritance.
- **Build-time check 1: passed.** pdf-inspector's native module loads in a Convex Node action on dev (linux-arm64, Node v24.20.0) with `convex.json` `node.externalPackages: ["@firecrawl/pdf-inspector"]`. It extracted a generated one-page PDF's text in 23 ms.
- **Build-time check 2: open.** Vertex EU availability and the pinned versions of the reader and fill models are unchecked. Neither dev nor prod has Vertex or TypeSafe credentials yet (the user chose "build now, e2e later"). The same applies to the criterion "real adapters run end-to-end on a fixture Document", which also needs R2 (see ticket 22). To do: set `GOOGLE_VERTEX_CREDENTIALS` and `TYPESAFE_API_KEY` on dev, confirm `claude-opus-5` and `claude-haiku-4-5@20251001` answer on region `eu`, and run one fixture through.
- UI: `/o/<slug>/documents/<id>` shows the Document with its state and Field Values (label and key, value, "Read on page N:" with the read text, and the Match probability to two decimals). It updates live. The list's filename now links there, and "Open PDF" moved onto that page. Checked in headless Chrome against dev: the page went from Extracting to Needs Review without a refresh when `extraction:finish` ran from the CLI, and it has no horizontal scroll at 390 px. No Mobbin search was done for this basic page. The full review screen is ticket 27.
