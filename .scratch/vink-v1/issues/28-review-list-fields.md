# 28 — Review of List Fields

Type: task
Status: resolved
Blocked by: 25, 27

## What to build

On the review screen each List Field shows its entries, with a row per sub-Field in each entry. A completeness row shows the completeness confidence and reason. A Member can add an entry, remove an entry and mark "Entries are complete", which clears the List Field's completeness Needs Review. Each of these actions can be undone and is recorded in the history.

## Design

- Before designing, search the Mobbin MCP (`search_screens`, `search_flows`, `search_sections`) for inspiration and UX patterns for editing repeating groups and line items in a review context. List the references you used in a comment on this ticket.
- Build every component with shadcn/ui. Only hand-roll a component when shadcn has nothing for it, and compose it from shadcn primitives.

## Acceptance criteria

- [x] List Fields render per entry with sub-Field rows, using the same row layout as top-level Fields
- [x] The completeness row shows its confidence with a threshold tick and the reason
- [x] Add entry, remove entry and "Entries are complete" work, set "user touched", and can be undone
- [x] The "Approve (N left)" count includes List completeness and sub-Field Needs Review
- [x] `convex-test` covers adding and removing entries, the completeness confirmation and Approval blocking

## Comments

- 2026-09-24 — Built on branch `ticket-28-review-lists` (stacked on `ticket-27-review-screen`). Entries keep their numbers: `removeEntry` lists an entry in `listValues.removedEntries` (and `restoreEntry` takes it out), so Undo of a removal is Restore. `addEntry` appends an entry with an empty Field Value per sub-Field (a required one is `required_empty`) and lists it in `addedEntries`. Undo of an add is removing it. `confirmEntries` stores who and when in `listValues.complete`, and `undoConfirmEntries` clears it. All five set "user touched" and write history events (`entry_added`, `entry_removed`, `entry_restored`, `entries_confirmed`, `entries_unconfirmed`). A required List with no entries left is `required_empty` whatever the confirmation says, and can't be confirmed complete. Sub-Field values are corrected and checked with ticket 27's `correct`/`check`/`undo`.
- `lib/reviewState.ts` holds the one rule for what still waits: Field Values with reasons and no review, except in removed entries, plus List Fields whose completeness is unconfirmed or that are required and empty. `documents.get` (the "Approve (N left)" count) and `approve` both use it.
- **Worth knowing:** because a sub-Field's Match probability is `min(array, key)` (ticket 25), a List with completeness below the threshold also puts every sub-Field value below the threshold. Confirming "Entries are complete" clears only the List row, so a reviewer then also checks each value. That's the spec as written. If it's too much clicking in practice, one option is to leave the array probability out of the sub-Field's confidence once the entries are confirmed.
- UI: `list-group.tsx` shows the completeness row (confidence bar with the threshold tick, reason, "Entries are complete"/Undo), then each entry with a header ("Entry N", an "Added by hand" badge, Remove or Restore) and the same `FieldRow` per sub-Field. A hand-added value shows "Filled in by hand" and no confidence bar. "Add entry" goes at the bottom. The Needs Review filter applies to entries too.
- Mobbin references: [Shopify edit order](https://mobbin.com/screens/ff1a8733-4b99-493a-bbe6-6256158d797f) (an "Added" badge on new lines and × to remove), and [Toggl Track invoice](https://mobbin.com/screens/39ad28fc-59b0-47b0-a5f9-478e2a6ed0ad) and [Midday invoice](https://mobbin.com/screens/329ed15f-fa35-45f1-b0d3-4f2dfde44213) (a trailing "+ Add item").
- Tests: `convex/listReview.test.ts` covers the entries and count, "Entries are complete" and its Undo, remove and restore, add (empty, required sub-Field Needs Review until filled), undoing an add, a required List with no entries left, Approval blocking and then succeeding, and tenancy. `lists.test.ts` and the fixture replays now read `entries[i].fieldValues`.
- Checked in headless Chrome against dev on a seeded tyre Document: Add entry raised the count from 5 to 6, removing entries and confirming completeness brought it to 2, and the history shows each step.
