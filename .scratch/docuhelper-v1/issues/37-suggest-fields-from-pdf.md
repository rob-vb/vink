# 37 — "Suggest Fields from PDF" on an existing Form

Type: task
Status: resolved
Blocked by: 36

## What to build

In the Form editor an Admin uses "Suggest Fields from PDF" to extend a Form with a second supplier's layout. The new sample is Read, Jev matches the Reading against the current Form Version, and only the parts of the Reading that matched `none` are proposed as new Fields, the same way as in ticket 36. Saving creates a new Form Version. Documents already in progress keep their own Form Version.

## Design

- Before designing, search the Mobbin MCP (`search_screens`, `search_flows`, `search_sections`) for inspiration and UX patterns for suggesting additions inside an existing editor. List the references you used in a comment on this ticket.
- Build every component with shadcn/ui. Only hand-roll a component when shadcn has nothing for it, and compose it from shadcn primitives.

## Acceptance criteria

- [x] "Suggest Fields from PDF" is available in the Form editor for Admins
- [x] Only Reading parts that matched `none` are proposed, and Fields the Form already places are never proposed again
- [x] Saving the ticked suggestions creates a new Form Version and leaves existing Documents on their own version
- [x] `convex-test` covers the `none`-only rule with fixture-replay fakes

## Comments

- 2026-09-24 — Built on branch `ticket-37-suggest-fields` (stacked on `ticket-36-form-proposal`). A Form Proposal can carry `formId`. Its run (`proposalRun.ts`) then Reads the sample and runs Jev Match against the Form's current Version (the same `matchRequests`, so the 64k split applies). It removes every part the Form places from the Reading (`lib/reading.ts` `withoutPaths`: the matched leaves and the matched List arrays, plus objects left with only `_pages`/`_unsure`) and gives the Proposer only what's left. With nothing left, it proposes nothing and calls no model. `saveFields` renumbers a key the Form or an earlier suggestion already uses (`licensePlate` → `licensePlate2`), so a suggestion never replaces a Field. `formProposals.saveToForm` (Admin) saves the Form with the kept suggestions as its next Version through the new `forms.saveVersion` (shared with `forms.save`, so the Integration key lock still holds), then deletes the sample PDF and the proposal. Documents in progress keep their Version.
- UI: the Form editor (for an existing Form) has "Suggest Fields from PDF", a dialog with the sample drop zone that opens the proposal page. There it's titled "New Fields for <Form>" and says only what the Form can't place is listed. "Nothing new" appears when the Form already places everything. "Continue" opens the editor with the current Fields plus the kept suggestions, and Save creates the next Version. Mobbin references: [Descript "Continue in editor"](https://mobbin.com/screens/ee6bcb01-04ba-40f1-b108-4ad5f83adc62) (handing an AI proposal over to the editor) and [Magnific AI Writer](https://mobbin.com/screens/3fb76c75-fcb5-4ea9-8338-2a309c0fa916) (AI suggestions started from inside the editor).
- Tests: `convex/suggestFields.test.ts` with fixture-style fakes covers the `none`-only rule (the Proposer gets the Reading without the matched plate and the matched tyre list), the clashing key renumbered, nothing proposed when everything is placed (no Proposer call), saving the suggestions as Version 2 while an existing Document stays on Version 1 (and the sample PDF is deleted), and Admin-only access.
- Checked in headless Chrome against dev on a seeded suggest proposal: the editor's dialog, the proposal page with `purchaseOrderNumber` and the renumbered `licensePlate2`, and the editor with the Form's Fields plus the kept suggestion all showed. Saving failed on dev only because deleting the sample from R2 needs R2 settings (the same known gap as Delete in ticket 31). The save itself is covered by convex-test.
