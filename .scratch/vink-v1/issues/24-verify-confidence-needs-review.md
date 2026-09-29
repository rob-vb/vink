# 24 — Verify, Confidence and Needs Review

Type: task
Status: resolved
Blocked by: 23

## What to build

After Fill, the Verify step runs: Jev checks every filled value for fit and plausibility. On pages with a text layer it also checks whether the page text supports the value. All questions for one Document go in one request. Each top-level Field Value then gets:
- a **Confidence**: the minimum of the Match probability, Jev fit and Jev support (support only on text-layer pages), with the lowest signal recorded;
- the raw signals, stored for later calibration and never sent;
- **Needs Review**, with reasons, when any of these holds:
  - the confidence is below the Form's **Review Threshold**;
  - the Field is required and empty;
  - the value failed type validation in code (a number that won't parse, a non-ISO date, a choice outside its options). Such a value becomes `null` and keeps its read text;
  - the source is in `_unsure`, or the Reading holds a conflicting reading for it.

An empty optional Field whose Match chose `none` counts with its `none` probability. The Document gets a Jev-verified flag. The Review Threshold in force is the one when the Extraction finished: later threshold changes apply only to later Extractions. The basic Document page shows each value's confidence and Needs Review reasons.

## Acceptance criteria

- [x] Verify runs as one Jev request per Document, and support is only asked for text-layer pages
- [x] Confidence is the minimum of the available signals, and the lowest signal is stored
- [x] Every Needs Review reason is produced and stored: below threshold, required but empty, type mismatch, unsure, conflicting
- [x] A type-invalid value becomes `null`, keeps its read text and is Needs Review
- [x] The Document is marked Jev-verified when Verify succeeds
- [x] Changing the threshold afterwards doesn't change existing Field Values, and the next Extraction uses the new threshold
- [x] `convex-test` with fixture-replay fakes covers each rule above

## Comments

- 2026-09-24 — Built on branch `ticket-24-verify` (stacked on `ticket-23-extraction`). After Fill, `extractionRun.run` checks each value's type in code (`lib/fieldTypes.ts`: a number must parse, a date must be a real ISO date, a choice one of its options; text takes numbers as strings). A misfit becomes `null` and keeps its read text. Then one Verify request (`lib/verifier.ts`, Jev `noul` questions as in the ticket-11 prototype) covers every non-empty value, with a support question only when one of the value's pages has a text layer. The Reader now returns the text layer too, and it is stored with the Reading (`readings.textLayer`), so a retry or a later Change Form still has it. A Verify error is caught: the Extraction succeeds with `jevVerified: false` and Match as the only signal.
- `extraction.finish` computes the Confidence (`lib/confidence.ts`: the lowest of Match, fit and support, and which one) and the Needs Review reasons, in the order `below_threshold`, `required_empty`, `type_mismatch`, `unsure`, `conflicting`. It reads the Form's Review Threshold at that moment and stores it on the Document, and the reasons are stored per Field Value, so later threshold changes don't touch finished Documents. Unsure: the value's path (relative to any object around it) is in that object's `_unsure`. Conflicting: an `…Alt` sibling on the path (`position`/`positionAlt`), or a `conflicts` note on any object around it that names the key (as written or as words, `licensePlate` → "license plate").
- Field Values now store `signals` (`match`, `fit`, `support`), `confidence`, `lowestSignal` and `reviewReasons`, replacing `matchProbability`. The 3 old Field Value rows on dev were rewritten into the new shape (backup: a dev snapshot export).
- Tests (Seam 1 plus the agreed unit seam for type validation): `convex/confidence.test.ts` covers the one-request Verify with support only for text-layer pages, the minimum and lowest signal, `none` for an empty optional Field, each Needs Review reason, several at once, a type-invalid value, Jev-verified, a Verify failure, and a threshold change. `convex/lib/fieldTypes.test.ts` covers type validation. The fixture replays now also replay the recorded Jev verifications (`jev-opus-clean-fill.json`) and text layers.
- UI: the basic Document page shows the Confidence to two decimals (never a percentage), the lowest signal and the Needs Review reasons as badges. Not checked in a browser; the full review screen is ticket 27.
- **Open real-service check:** the real Verifier adapter hasn't run against Jev yet (no `TYPESAFE_API_KEY`). To do at the end-of-v1 run: one fixture Document through Verify, checking that fit and support come back per value and that a scan-only Document asks no support questions.
