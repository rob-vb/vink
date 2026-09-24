# 25 — List Fields through the pipeline

Type: task
Status: ready-for-agent
Blocked by: 21, 24

## What to build

List Fields are extracted end to end. Match makes each List Field a Choice over the Reading's arrays of objects, and each sub-Field a Choice over the keys inside the chosen array. Fill writes one Field Value per sub-Field per entry, and Verify checks them. A sub-Field's Match probability is the lower of the array choice and the key choice. A List Field's completeness confidence is Jev's probability for the array choice. A List Field is Needs Review when its completeness is below the threshold, or when it is required and has no entries. A required sub-Field that is empty in any entry is Needs Review. When a Reading would exceed the 64k-token request cap, Match is split into one request for top-level Fields and one for List Fields.

## Acceptance criteria

- [ ] A List Field on the tyre-service fixtures produces one entry per tyre change, with a Field Value per sub-Field
- [ ] A sub-Field's Match probability is the lower of the array and key choices
- [ ] The List Field stores its completeness confidence, and the List Needs Review rules are applied
- [ ] A Reading over the 64k cap is matched in two requests, and the results equal a single-request match on the same fixture
- [ ] `convex-test` covers all of the above with fixture-replay fakes, including a required List Field with no entries
