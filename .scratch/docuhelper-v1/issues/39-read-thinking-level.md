# 39 — Read thinking level

Type: task
Status: resolved
Blocked by: 26

## What to build

Read runs at thinking `HIGH`. On 20 pages it takes 245–300 s and uses most of the 64k output tokens, although the Reading is only about 13k characters (see the 2026-09-27 comment on [Fixture eval harness](26-fixture-eval-harness.md)). Test whether `MEDIUM` (or `LOW`) is faster and cheaper while keeping the ADR 0003 bar.

## Acceptance criteria

- [x] `npm run eval` with Read at `MEDIUM` on fresh Readings (not cached), at least twice because Read-to-read variation is large: values x/84, Lists x/4, Needs Review recall
- [x] `fixtures/timing` (20 pages) timed at `MEDIUM`, with Read time, cost and output tokens
- [x] Decision recorded here: keep `HIGH`, or switch in `convex/lib/models.ts`. Also whether Read's `maxTokens` needs raising for 20 pages at the chosen level

## Comments

- 2026-09-27 — `READER_THINKING` (`HIGH` by default) now sets Read's thinking level in `convex/lib/models.ts`; the Proposer stays at `HIGH`. Two runs at `MEDIUM` on fresh Readings, Vertex EU, Jev live:
  - Run 1: **81/84**, verified 14/15, Lists 4/4, Needs Review precision 29%, recall 67%, $0.089.
  - Run 2: **80/84**, verified 15/15, Lists 4/4, precision 20%, recall 50%, $0.080.
  - Compared with `HIGH` (ticket 26): 82/84, verified 15/15, $0.16. Both `MEDIUM` runs meet the bar, but only just.
  - Regression: `mileageKm` in 002 is read as 229596 (want 229546) in **both** runs, and it is **MISSED**, not flagged. `HIGH` read it right. It's the kind of handwritten-digit error that Jev can't see. The other misses (`currency` null, a `null` List sub-value) are flagged, and the 002 `supplierName` also went wrong at `HIGH`.
  - Speed: Read per Document 6–22 s (`HIGH`: 13–51 s). **20 pages: 42.9 s in total, Read 35.4 s, $0.058** (`HIGH`: 306–316 s, Read 245–300 s, $0.24–0.26). At `MEDIUM`, `maxTokens` 64k is ample.
  - Readings kept in the session scratchpad, not in the repo.

## Answer

Keep Read at `HIGH` (the user's decision, 2026-09-27). `MEDIUM` meets the bar and is much faster and cheaper, but it misread a handwritten digit (`mileageKm` in 002) in both runs without flagging it, and reading handwriting correctly is the core promise. At `HIGH`, a 20-page Document (~310 s) fits the 10-minute limit, and `maxTokens` 64k holds. `READER_THINKING` stays as an override for later benchmarks.
