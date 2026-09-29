# 30 — "Does not fit this Form" and Change Form

Type: task
Status: resolved
Blocked by: 27, 29

## What to build

After Match, code sets the **"Does not fit this Form"** flag when the Reading is empty or fewer than half of the required Fields were matched. The cut-off is configuration. The review screen shows it as a banner with Change Form and Reject next to it; Reject comes in ticket 31. Change Form is allowed from `needs_review` and `extraction_failed`:
- it takes the new Form's current Form Version and sends the Document back to `extracting`;
- it drops all Field Values and corrections for the old Form, after a warning like "3 corrections will be lost";
- it re-runs Match, Fill and Verify on the stored Reading, or runs a full Extraction when there is no Reading;
- it sets "user touched" and records "Form changed" in the history.

After Approval, Change Form is impossible.

## Design

- Before designing, search the Mobbin MCP (`search_screens`, `search_flows`, `search_sections`) for inspiration and UX patterns for a warning banner and a destructive-change confirmation dialog. List the references you used in a comment on this ticket.
- Build every component with shadcn/ui. Only hand-roll a component when shadcn has nothing for it, and compose it from shadcn primitives.

## Acceptance criteria

- [x] The flag is set for an empty Reading and when fewer than half of the required Fields matched, with the cut-off read from configuration
- [x] The banner shows with Change Form next to it
- [x] Change Form warns with the number of corrections that will be lost, then drops them and re-runs on the stored Reading without calling the Reader
- [x] Change Form works from Extraction Failed
- [x] Change Form is refused after Approval
- [x] `convex-test` covers the flag rule, the dropped corrections, the reuse of the Reading, the user-touched flag and the post-Approval lock

## Comments

- 2026-09-24 — Built on branch `ticket-30-change-form` (stacked on `ticket-31-reject`, since the banner needs Reject). `lib/fit.ts` sets "Does not fit this Form" after Match: the Reading has no values, or the matched share of required Fields (top-level and List) is below `DOES_NOT_FIT_CUTOFF` (env, default 0.5). With no required Fields, only the empty-Reading rule applies. It's stored as `documents.doesNotFit`.
- `convex/changeForm.ts`: `impact` returns how many values are Corrected (for the warning), and `changeForm` (Member, from `needs_review` or `extraction_failed`, to another Form of the same Organisation) deletes the Field and List values, takes the new Form's current version, clears the flags, sets "user touched", logs "form_changed" ("Old → New"), moves to `extracting` and queues the Extraction. The run reuses a stored Reading, or reads in full when there's none. It is refused after Approval.
- UI: "Change Form" and "Reject" sit in the review screen's header. A Document that doesn't fit gets an amber banner with both. The Change Form dialog has a Form picker and an amber "N corrections will be lost" callout. Along the way, the boolean and choice selects in Field rows now show their labels (Yes/No) through Base UI's `items`, like the upload dialog. Mobbin references: [Customer.io destination warning](https://mobbin.com/screens/287812ba-93dc-4c00-8a3f-7e6a9c904b55) (an amber banner with the fixing action beside it) and [Klaviyo "Create object"](https://mobbin.com/screens/80261f82-b672-4894-8f45-303b269ac93d) (an amber callout inside the confirm dialog about what can't be undone).
- Tests: `convex/changeForm.test.ts` covers the flag (fewer than half, exactly enough, empty Reading, cut-off from env), the correction count, Change Form dropping values and corrections and re-running Match/Fill/Verify without Read (new Form and version, "user touched", history), Change Form from Extraction Failed without a Reading running in full, the post-Approval refusal, and refusing the same Form or another Organisation's.
- Checked in headless Chrome against dev on a seeded Document flagged as not fitting: the banner showed, a correction made the dialog warn "1 correction will be lost", and confirming moved the Document to Extracting.
