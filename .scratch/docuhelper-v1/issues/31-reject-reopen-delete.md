# 31 — Reject, Reopen and Delete

Type: task
Status: ready-for-agent
Blocked by: 27

## What to build

A Member can Reject a Document in `needs_review` or `extraction_failed` with an optional reason; it then moves to `rejected` and is never sent. Rejected Documents are hidden behind a Rejected filter in the Document list, off by default, and are still listed with who, when and why. Reopen moves a Rejected Document back to its prior state with its values and corrections intact, while its PDF is still kept, and sets "user touched". An Admin can Delete a Rejected Document outright. This removes the PDF from R2 together with the Reading, Field Values and Payload, and leaves only metadata and a "Deleted by X" history line. After Approval, Reject and Delete are impossible.

## Design

- Before designing, search the Mobbin MCP (`search_screens`, `search_flows`, `search_sections`) for inspiration and UX patterns for reject-with-reason dialogs, filtered lists and destructive-action confirmation. List the references you used in a comment on this ticket.
- Build every component with shadcn/ui. Only hand-roll a component when shadcn has nothing for it, and compose it from shadcn primitives.

## Acceptance criteria

- [ ] Reject with an optional reason works from Needs Review and Extraction Failed, and is recorded in the history
- [ ] The Rejected filter is off by default and shows who, when and why
- [ ] Reopen restores the prior state and corrections and sets "user touched". It is unavailable once the PDF is gone
- [ ] Delete is Admin-only, works only from `rejected`, removes the R2 object and the data, and leaves "Deleted by X"
- [ ] Reject and Delete are refused after Approval
- [ ] `convex-test` covers every transition and refusal above
