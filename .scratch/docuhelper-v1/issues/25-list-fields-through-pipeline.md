# 25 — List Fields through the pipeline

Type: task
Status: resolved
Blocked by: 21, 24

## What to build

List Fields are extracted end to end. Match makes each List Field a Choice over the Reading's arrays of objects, and each sub-Field a Choice over the keys inside the chosen array. Fill writes one Field Value per sub-Field per entry, and Verify checks them. A sub-Field's Match probability is the lower of the array choice and the key choice. A List Field's completeness confidence is Jev's probability for the array choice. A List Field is Needs Review when its completeness is below the threshold, or when it is required and has no entries. A required sub-Field that is empty in any entry is Needs Review. When a Reading would exceed the 64k-token request cap, Match is split into one request for top-level Fields and one for List Fields.

## Acceptance criteria

- [x] A List Field on the tyre-service fixtures produces one entry per tyre change, with a Field Value per sub-Field
- [x] A sub-Field's Match probability is the lower of the array and key choices
- [x] The List Field stores its completeness confidence, and the List Needs Review rules are applied
- [x] A Reading over the 64k cap is matched in two requests, and the results equal a single-request match on the same fixture
- [x] `convex-test` covers all of the above with fixture-replay fakes, including a required List Field with no entries

## Comments

- 2026-09-24 — Built on branch `ticket-25-list-fields` (stacked on `ticket-24-verify`). The Matcher now takes `{ fields, lists }` and answers per List Field with the chosen array, its probability, and per sub-Field a key inside the array's elements (`ListMatch`). The real adapter asks this as in the ticket-11 prototype: one Jev request with a Choice per top-level Field and per List Field (over `readingArrays`, the Reading's non-empty arrays of objects), then one request with a Choice per sub-Field over the chosen array's keys.
- `extractionRun.ts` turns the Match result into slots: one per top-level Field, and one per sub-Field per element of the chosen array, with id `list[entry].key`. Fill and Verify are keyed by that id (the real Filler names its JSON-schema properties `v0…` and maps them back). A sub-Field's Match probability is `min(array, key)`. Its source is the leaf `array[i].<key path>`, so unsure/conflicting and pages work as for top-level values.
- Storage: sub-Field values are `fieldValues` rows with `list: { key, entry }`. Each List Field gets a `listValues` row with the chosen array path, entry count, completeness (the array choice's probability) and its reasons: `below_threshold` for completeness, `required_empty` for a required List with no entries. `documents.get` returns `lists` with `entries` (each an array of sub-Field values in Form order).
- 64k split: `lib/matchPlan.ts` estimates the request size (Reading JSON plus every Choice's criteria, at 3 characters a token) and splits into a top-level request and a List request when it is over `MATCH_TOKEN_CAP` (default 64000, overridable by env). It lives above the adapter so Seam 1 can see it.
- Tests: `convex/lists.test.ts` covers entries and sub-Field values, `min(array, key)`, the calls to Match/Fill/Verify, sub-Field Needs Review, completeness, the List rules (below threshold, required with no entries, optional with none, required sub-Field empty in one entry), the split, and that split and single requests give the same values. The fixture replays now build List matches from `map-opus-clean.json` (array, key, key probability) and the completeness from `run2-opus-clean.json`, and check each tyre fixture's entries against the recorded run.
- Not in the UI yet: the basic Document page shows top-level values only. Lists appear on the review screen (ticket 28).
- **Open real-service check:** the real two-request List Match hasn't run against Jev. To do at the end-of-v1 run: a tyre fixture through Match, checking the array and key choices against `map-opus-clean.json`.
