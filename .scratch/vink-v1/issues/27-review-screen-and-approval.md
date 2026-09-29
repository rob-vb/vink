# 27 — Review screen for top-level Fields and manual Approval

Type: task
Status: resolved
Blocked by: 24

## What to build

A Member opens a Document in `needs_review` and gets the review screen (the review screen prototype, variant A):
- the PDF on the left with page n/N and zoom, and the grouped Fields on the right. The two panes stack on mobile;
- a filter between "All fields" and "Needs Review only";
- each row shows:
  - the label and key and the editable value;
  - "Read on page N:" with the read text;
  - a confidence bar with a tick at the threshold and the number to two decimals, never a percentage;
  - the Needs Review label with its reason and lowest signal.

Selecting a row jumps the PDF to its source page. Editing a value marks it Corrected, and "Value is right" marks it Checked; both clear Needs Review, both can be undone, and both record who and when. Approval is blocked while anything is Needs Review: the button reads "Approve (N left)", then "Approve and send". "Approve and next" moves to the next Document that needs review. With no Integration attached, Approval just marks the Document `approved` (mode manual, by, at). The screen also shows:
- the "not verified by Jev" marker;
- an Extracting overlay with the fields disabled;
- the Document history (uploaded, extracted, corrected, approved).

The Document list's Needs Review tab links into the screen.

## Design

- Before designing, search the Mobbin MCP (`search_screens`, `search_flows`, `search_sections`) for inspiration and UX patterns for side-by-side document review, confidence indicators and approval queues. Use the review-screen prototype (variant A, branch `prototype/review-screen`) as the baseline, and use Mobbin to refine it. List the references you used in a comment on this ticket.
- Build every component with shadcn/ui. Only hand-roll a component when shadcn has nothing for it, and compose it from shadcn primitives.

## Acceptance criteria

- [x] The review screen shows the PDF and Field rows as described. The confidence is never shown as a percentage
- [x] Selecting a row jumps the PDF to its source page
- [x] Correct, Check and Undo work, record who and when, and a correction sets "user touched"
- [x] Approval is refused in the backend while anything is Needs Review. There is no "Approve anyway"
- [x] Approval with no Integration attached marks the Document approved and records manual, by and at
- [x] "Approve and next" opens the next Needs Review Document
- [x] The "not verified by Jev" marker and the Extracting overlay appear when they apply
- [x] `convex-test` covers Corrected, Checked, Undo, the Approval block and the Approval record

## Comments

- 2026-09-24 — Built on branch `ticket-27-review-screen` (stacked on `ticket-25-list-fields`). Backend in `convex/review.ts`: `correct` (the value must fit the Field's type, a required Field can't be emptied; keeps the extracted value for Undo, sets `userTouched`, logs "corrected" with the Field's label), `check`, `undo` (restores the extracted value and Needs Review), and `approve` (refused with "N values still need review"; with no Integration it records `approval: { mode: "manual", by, byEmail, at }`, moves to `approved`, logs it, and returns the oldest other Needs Review Document for "Approve and next"). All four refuse an approved Document ("This Document is approved") and another Organisation's data. A Field Value is Needs Review while it has reasons and no review; List Fields with reasons count too until ticket 28 lets a user clear them. An Extraction now logs "extracted" (by Vink).
- UI: `/o/<slug>/documents/<id>` is now the review screen (`review-screen.tsx`, `field-row.tsx`, `pdf-pane.tsx`), replacing the basic Document page. The PDF pane uses `react-pdf` (pdf.js, loaded client-only) with page n/N and zoom from 75% to 300%. Selecting or focusing a row jumps it to the value's first page. Each row has the label, key, editable value (text/number/date input, or a select for choice and boolean; saved on blur or Enter, Escape resets), "Read on page N:", the confidence bar with a threshold tick and two decimals, the Needs Review reasons with the lowest signal, and "Value is right"/Undo. There's a filter toggle for All fields / Needs Review only, a sticky approve bar ("Approve (N left)" → "Approve and send", plus "Approve and next"), the "Not verified by Jev" badge with a tooltip, an Extracting overlay over skeleton rows, an Approved banner, and the history. Only top-level Fields are shown; List Fields come in ticket 28.
- Mobbin references: [Shopify Bill Pay review](https://mobbin.com/screens/da5e592d-9e0a-4217-9e9e-e6c3556f780f) (the "review the details" banner with the document next to the fields) and [Toggl Track approvals](https://mobbin.com/screens/63244d17-fb82-4ddb-b1d8-bbfe4b5ed31e) (state badge plus approve in the header), on top of ticket 10's Airwallex/Xero/QuickBooks/Revolut scan (page n/N and zoom toolbar, the Extracting overlay, QuickBooks' "Save and next"). The prototype's variant A stays the layout.
- Tests: `convex/review.test.ts` (Seam 1) covers the Needs Review count, Corrected (who, when, `userTouched`, history), the type and required checks on a correction, Checked, Undo of both, the Approval block, the Approval record and counts, the post-Approval lock, "Approve and next" and the end of the queue, a Member reviewing, and tenancy.
- Checked in headless Chrome against dev (a seeded Document; R2 is still missing, so the PDF pane showed "The PDF couldn't be loaded"). Check, Correct and the label change to "Approve and send" worked live, "Approve and next" opened the next Document, and there was no horizontal scroll at 390 px. The PDF pane itself (paging, zoom, text layer) was checked on a throwaway route with a generated PDF, since removed.
- **Open real-service check (R2):** pdf.js fetches the signed URL from the browser, so the R2 bucket's CORS rule needs `GET` (as well as `PUT`) from the app origins.
