# 24 — Verify, Confidence and Needs Review

Type: task
Status: ready-for-agent
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

- [ ] Verify runs as one Jev request per Document, and support is only asked for text-layer pages
- [ ] Confidence is the minimum of the available signals, and the lowest signal is stored
- [ ] Every Needs Review reason is produced and stored: below threshold, required but empty, type mismatch, unsure, conflicting
- [ ] A type-invalid value becomes `null`, keeps its read text and is Needs Review
- [ ] The Document is marked Jev-verified when Verify succeeds
- [ ] Changing the threshold afterwards doesn't change existing Field Values, and the next Extraction uses the new threshold
- [ ] `convex-test` with fixture-replay fakes covers each rule above
