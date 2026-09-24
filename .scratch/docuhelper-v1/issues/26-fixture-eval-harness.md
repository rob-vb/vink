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

- [ ] One command runs the real pipeline on every fixture and prints the scores above
- [ ] The chosen models reach the ADR 0003 bar of 80/84 values and Lists 4/4. The pinned versions are recorded in configuration
- [ ] The harness can rewrite the recorded responses used by the Seam 1 fakes
- [ ] Reader cost and latency, and 20-page timing against the 10-minute limit, are recorded in a comment on this ticket
