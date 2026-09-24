# 27 — Review screen for top-level Fields and manual Approval

Type: task
Status: ready-for-agent
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

- [ ] The review screen shows the PDF and Field rows as described. The confidence is never shown as a percentage
- [ ] Selecting a row jumps the PDF to its source page
- [ ] Correct, Check and Undo work, record who and when, and a correction sets "user touched"
- [ ] Approval is refused in the backend while anything is Needs Review. There is no "Approve anyway"
- [ ] Approval with no Integration attached marks the Document approved and records manual, by and at
- [ ] "Approve and next" opens the next Needs Review Document
- [ ] The "not verified by Jev" marker and the Extracting overlay appear when they apply
- [ ] `convex-test` covers Corrected, Checked, Undo, the Approval block and the Approval record
