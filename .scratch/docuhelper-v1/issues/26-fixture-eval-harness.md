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
- [x] The chosen models reach the ADR 0003 bar of 80/84 values and Lists 4/4. The pinned versions are recorded in configuration
- [x] The harness can rewrite the recorded responses used by the Seam 1 fakes
- [x] Reader cost and latency, and 20-page timing against the 10-minute limit, are recorded in a comment on this ticket

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
- 2026-09-25 — First real run, with Jev live and Claude Code standing in for Vertex through the Claude bridge (`scripts/claude-bridge`; reader `claude-opus-5`, fill `claude-haiku-4-5`, run by `claude -p` on the user's account). **These numbers say nothing yet about pinning the Vertex models.**
  - The first run failed tire-service-001 (and later 004) at Match with Jev's `max_tokens_exceeded`. Measured on jev-1.13.0, the Reading costs about 1 token per character and criteria about 1.5–2 characters per token, not the 3 assumed, and a Form without List Fields was never split. Fixed: `matchRequests` now spreads Fields over as many requests as the cap needs (commit 5c7ffc5).
  - A/B on the same cached Readings: listing each leaf in a Field's Choice by path only, without its value (which is in Jev's state already), roughly halves Match's tokens with identical results. Adopted.
  - Result: **values 76/84, verified 11/14, Lists 4/4**; Needs Review precision 30%, recall 100% at 0.8. Every wrong value is flagged. Per Document 25–110 s in total (read 12–55 s); nothing near the 10-minute limit. Fill through Claude Code is slow (11–65 s) because each call starts a new `claude` process, so it says nothing about Vertex latency.
  - Wrong values: 3 List sub-values `null` where the brand is only implied (e.g. "R168" → Bridgestone, mounted "Giti GTR955"), a serial digit misread (6135366935), `serviceLocation` filled with "Vianor Trailer", a mounted brand with extra markings ("m+s TL"), and `vatAmount` got the total where it should be 0 (reverse charge).
  - Still open: the 80/84 bar on Vertex, low Needs Review precision (List key probabilities from Jev often land at 0.67–0.8), reader cost and latency on Vertex, 20-page timing, and pointing the replay test at `recording.json`.
- 2026-09-26 — Two changes, each measured on cached Readings (Claude bridge, so still not the Vertex numbers):
  - **Match can pick an object** (commit 08944b4): a Choice also offers the Reading's objects (and the objects inside a List's elements), for a value that needs several of their values together, like brand + pattern → "Westlake WTR1". Fill gets the object as `key: value` lines. On the same Readings: 76 → **80/84, Lists 4/4, recall 100%** (on a second set of Readings: 73 → 77). This is the first time the ADR 0003 bar is met.
  - **Read: unambiguous keys** (commit a5ed9ee): `taxableAmount` / `vatAmount` / `totalInclVat` instead of a bare `amount`. It fixed `vatAmount` on the new Readings. A tried rule to also write a product `name` (brand + model) was dropped: Match's objects cover it, and on 001 it steered Match to a misread handwritten name.
  - Read-to-read variation is large (73 vs 76 on the same prompt and model), so compare Match and Fill changes on cached Readings only.
  - What's left: a serial misread from handwriting, "Bridgestone" not being on the paper (003), `serviceLocation` in 001 (should be empty; Match takes the workshop or supplier address), `documentNumber` in bundled papers (002, sometimes), and Needs Review precision falling to 14–21%.
- 2026-09-26 — **The user chose Gemini 3.8 Flash on Vertex EU for every Claude step** (Read, Fill, Proposer), not Claude. `convex/lib/models.ts` now calls `gemini-3.8-flash` through `@google/genai` on the `eu` multi-region (`aiplatform.eu.rep.googleapis.com`); thinking is `HIGH` for Read and Proposer and `LOW` for Fill, and Fill's schema goes in `responseJsonSchema`. `READER_MODEL` / `FILL_MODEL` / `PROPOSER_MODEL` still override it. The Claude bridge keeps running Claude (Opus for PDF steps, Haiku for Fill) and records the model that actually ran. Eval prices: $0.75 / $3.75 per million tokens (Gemini API list price until 2026-12-31, doubling on 2027-01-01). Setup: `scripts/setup-vertex.sh`. The first real Gemini run still has to show the 80/84 bar; the Claude-bridge numbers above don't carry over.
- 2026-09-27 — **First real run on Vertex EU: Gemini 3.8 Flash for Read and Fill, Jev live.**
  - **Values 82/84, verified 15/15, Lists 4/4**: the ADR 0003 bar is met. A second Match/Fill pass on the same Readings gave the same result. Needs Review: precision 13%, recall 50%. The missed wrong value is `supplierName` in 002 ("QTeam Bandenbedrijf Vandekerckhove NV"); `documentNumber` in 002 is wrong but flagged. The handwritten serial that Claude misread in every run (`6135366435`) is read correctly.
  - **Cost and latency** (Gemini API list prices, $0.75/$3.75 per M tokens until 2026-12-31): $0.16 for the 5 Documents, of which Read $0.13 (~$0.012 per page) and Match/Fill/Verify $0.03. Per Document 16–55 s in total: Read 13–51 s, Match 0.3–1.4 s, Fill 2–3 s, Verify 0.3–0.5 s. Still to check against the Vertex EU bill.
  - **20 pages** (`fixtures/timing`, the tyre fixtures merged twice; the PDF is git-ignored, rebuild it with `pdfunite` from 001, 002, 004, 003 twice over): 306–316 s in total, of which Read 245–300 s and $0.24–0.26. Under the 10-minute limit, but half of it. The Reading is only 13k characters; the time goes to thinking at `HIGH`, which on 20 pages uses most of the 64k output tokens (thinking counts toward them). A plain transcription of the same PDF takes 138 s at `HIGH` and 95 s at `LOW`. Open: whether Read at `MEDIUM` keeps 80/84 and is faster, and whether `maxTokens` for Read needs raising.
  - Gemini calls now stream, so Node's 5-minute wait for a first byte can't cut a long Read off.
  - Pinned: `gemini-3.8-flash` for Read, Fill and Proposer (the GA model id from the docs), `jev-1.13.0`.
  - The fixture-replay test in `convex/extraction.test.ts` now replays `recording.json` and checks the app stores what the harness's run produced (`extracted.json`, which the harness now writes too).
