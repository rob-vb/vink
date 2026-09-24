# 26 — Fixture eval harness (Seam 2)

Type: task
Status: ready-for-agent
Blocked by: 25

## What to build

A script, not run in CI, runs the real pipeline on `fixtures/documents/*`: the Vertex reader, Jev Match and Verify, and the Fill model. It scores the results against each `expected.json`, counting only `verified` paths, and reports:
- values correct out of 84 and List entries out of 4;
- Needs Review precision and recall at the threshold;
- cost and latency per Document.

It is used to choose and pin the reader and fill models on Vertex EU, and to catch prompt regressions. Its outputs refresh the recorded responses that Seam 1 replays. Start from the scoring in the `prototype/extraction-benchmark` and `prototype/api-pipeline-benchmark` branches. Build-time check 3: measure the reader's real cost and latency, and whether the 10-minute action limit holds at 20 pages.

## Acceptance criteria

- [x] One command runs the real pipeline on every fixture and prints the scores above
- [ ] The chosen models reach the ADR 0003 bar of 80/84 values and Lists 4/4. The pinned versions are recorded in configuration
- [x] The harness can rewrite the recorded responses used by the Seam 1 fakes
- [ ] Reader cost and latency, and 20-page timing against the 10-minute limit, are recorded in a comment on this ticket

## Comments

- 2026-09-24 — Built on branch `ticket-26-eval-harness` (stacked on `ticket-38-retention`). Tested on the Seam 1 fakes only. **The real run is still open**, because Vertex and Jev testing is saved for the end of v1.
  - `npm run eval` runs `scripts/eval/run.ts` with the real Reader, Matcher, Filler and Verifier. It reads `GOOGLE_VERTEX_CREDENTIALS` and `TYPESAFE_API_KEY` from `.env.eval` (git-ignored) or the environment. `READER_MODEL`, `FILL_MODEL` and `JEV_MODEL` try other versions. `--threshold 0.85` changes the threshold, and `--no-record` stops it rewriting the recordings.
  - Per Document it prints values right, verified values right, Lists right, every wrong value (caught by Needs Review, or MISSED), cost, and the time per step. It warns when a Document runs past the 10-minute action limit. The totals give values x/84, verified x/14, Lists x/4, Needs Review precision and recall at the threshold, total cost, and a verdict against the ADR 0003 bar. A Document that fails is listed with its error, and any failure counts as missing the bar.
  - Scoring: a path counts unless it is `unknown`. That gives 84 values across the 5 fixtures (14 of them verified, reported on their own). A List is right when its entry count matches. When the count is off, the entries can't be aligned, so each of that List's expected values counts as wrong. A value is flagged for Needs Review by the same rule `extraction.finish` uses, or because its List is flagged.
  - With `record` on (the default), each fixture gets a `recording.json` in the `Recording` shape the Seam 1 fakes replay. The fixture-replay test in `convex/extraction.test.ts` still reads the old ticket 11 files. It can switch to `recording.json` after the first real run.
  - Refactor: Match, Fill and Verify moved from `extractionRun.ts` to `convex/lib/extract.ts`, so the Convex action and the harness run the same code. The adapters now report token usage to `convex/lib/usage.ts`; nothing in the app listens to it.
  - Tests: `scripts/eval/score.test.ts`, `harness.test.ts` and `report.test.ts`.
  - Replaying ticket 11's recordings through the harness gave 77/84, Lists 4/4, and Needs Review precision 21% and recall 86% at 0.8. The 3-value gap to ticket 11's 80/84 is three List sub-values that replay as `null`. Seam 1's conversion of the old files is lossy (one key per sub-Field, taken from the first entry). The real run will show whether the production Matcher does better.
- **Open for the final real-service run:**
  1. Run `npm run eval` against Vertex EU and Jev, and check 80/84 values and Lists 4/4. If the bar isn't met, try other versions with `READER_MODEL` / `FILL_MODEL`, then pin the winners in `convex/lib/models.ts` and in the deployment env.
  2. Record the reader's cost and latency here. Check the prices in `scripts/eval/run.ts` against the Vertex EU bill. They are first-party list prices (Opus 5 $5/$25, Haiku 4.5 $1/$5 per million tokens), and Vertex bills separately.
  3. For the 20-page timing, add a 20-page Document to `fixtures/documents/` (it can be one merged from the fixtures) and check its total against the 10-minute limit. The report warns when a Document runs over.
  4. Point the fixture-replay test at the new `recording.json` files.
