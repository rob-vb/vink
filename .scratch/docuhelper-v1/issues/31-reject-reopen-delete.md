# 31 — Reject, Reopen and Delete

Type: task
Status: resolved
Blocked by: 27

## What to build

A Member can Reject a Document in `needs_review` or `extraction_failed` with an optional reason; it then moves to `rejected` and is never sent. Rejected Documents are hidden behind a Rejected filter in the Document list, off by default, and are still listed with who, when and why. Reopen moves a Rejected Document back to its prior state with its values and corrections intact, while its PDF is still kept, and sets "user touched". An Admin can Delete a Rejected Document outright. This removes the PDF from R2 together with the Reading, Field Values and Payload, and leaves only metadata and a "Deleted by X" history line. After Approval, Reject and Delete are impossible.

## Design

- Before designing, search the Mobbin MCP (`search_screens`, `search_flows`, `search_sections`) for inspiration and UX patterns for reject-with-reason dialogs, filtered lists and destructive-action confirmation. List the references you used in a comment on this ticket.
- Build every component with shadcn/ui. Only hand-roll a component when shadcn has nothing for it, and compose it from shadcn primitives.

## Acceptance criteria

- [x] Reject with an optional reason works from Needs Review and Extraction Failed, and is recorded in the history
- [x] The Rejected filter is off by default and shows who, when and why
- [x] Reopen restores the prior state and corrections and sets "user touched". It is unavailable once the PDF is gone
- [x] Delete is Admin-only, works only from `rejected`, removes the R2 object and the data, and leaves "Deleted by X"
- [x] Reject and Delete are refused after Approval
- [x] `convex-test` covers every transition and refusal above

## Comments

- 2026-09-24 — Built on branch `ticket-31-reject` (stacked on `ticket-29-failures`). `convex/rejection.ts` has `reject` (Member, from `needs_review` or `extraction_failed`, optional reason; stores `documents.rejection` with who, when, reason and the prior state, logs "rejected"), `reopen` (back to the prior state with values and corrections intact, sets "user touched", logs "reopened", refused once `dataDeletedAt` is set), and `remove` (Admin only, only from `rejected`; `deleteData` removes the R2 object, the Reading, Field Values and List values, sets `dataDeletedAt`, moves to `deleted` and logs "deleted"). All of them refuse an approved Document. `deleteData` is exported for the retention cron (ticket 38). `documents.pdfUrl` refuses a Document whose PDF is gone. The Document list's Rejected view also lists Documents deleted after rejection, with who, when and why. Rejected has its own count, and deleted ones aren't counted.
- UI: a "Reject" button in the review screen's header opens a dialog with an optional reason. A Rejected Document shows an Alert with who, when and why, plus Reopen and (for an Admin) Delete behind an AlertDialog confirmation. A deleted one shows "Rejected and deleted" and "The PDF was deleted". The Document list has a "Show rejected" switch, off by default, that adds a Rejected tab. Its rows show "Rejected by X, date: reason". Mobbin references: [Klaviyo "Reject published review?"](https://mobbin.com/screens/8604e99d-97f4-48a1-9d3e-9d1de71ffd10) (a question as the title, what happens next, a reason, a red confirm button) and [Xero confirm cancellation](https://mobbin.com/screens/4dbed775-0129-4618-a3f0-2730c586370a) (spelling out what goes away before a destructive step).
- Also from ticket 29's dev check: the stored Extraction error is cut to 300 characters and clamped to two lines on screen, not a whole stack trace.
- Tests: `convex/rejection.test.ts` covers Reject with and without a reason (history, list, counts), Reject from Extraction Failed and Reopen back to it, Reopen keeping corrections and setting "user touched", the post-Approval refusals, reopen/delete only from Rejected, Delete being Admin-only, Delete removing the R2 object and data while keeping metadata and a "deleted" history line, deleted Documents staying under Rejected, and tenancy.
- Checked in headless Chrome against dev. A Document with a missing PDF reached Extraction Failed by itself through the Workpool `onComplete` (ticket 29), showed the Retry alert, and was rejected through the dialog. It then appeared under "Show rejected" → Rejected with who, when and why. Delete wasn't tried on dev, because deleting the R2 object needs R2 settings (still deferred).
