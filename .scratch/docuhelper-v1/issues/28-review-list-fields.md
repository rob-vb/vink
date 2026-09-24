# 28 — Review of List Fields

Type: task
Status: ready-for-agent
Blocked by: 25, 27

## What to build

On the review screen each List Field shows its entries, with a row per sub-Field in each entry. A completeness row shows the completeness confidence and reason. A Member can add an entry, remove an entry and mark "Entries are complete", which clears the List Field's completeness Needs Review. Each of these actions can be undone and is recorded in the history.

## Design

- Before designing, search the Mobbin MCP (`search_screens`, `search_flows`, `search_sections`) for inspiration and UX patterns for editing repeating groups and line items in a review context. List the references you used in a comment on this ticket.
- Build every component with shadcn/ui. Only hand-roll a component when shadcn has nothing for it, and compose it from shadcn primitives.

## Acceptance criteria

- [ ] List Fields render per entry with sub-Field rows, using the same row layout as top-level Fields
- [ ] The completeness row shows its confidence with a threshold tick and the reason
- [ ] Add entry, remove entry and "Entries are complete" work, set "user touched", and can be undone
- [ ] The "Approve (N left)" count includes List completeness and sub-Field Needs Review
- [ ] `convex-test` covers adding and removing entries, the completeness confirmation and Approval blocking
