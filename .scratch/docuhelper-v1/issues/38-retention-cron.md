# 38 — Retention cron

Type: task
Status: ready-for-agent
Blocked by: 31, 35, 36

## What to build

A daily Convex cron deletes data, including the R2 objects:
- A Document's PDF, Reading, Field Values and Payload go N days after its last successful Delivery (default 30, set per Organisation). The same applies to a Document approved without an Integration, counting from its Approval.
- Documents that never get Approval go after 90 days.
- A Rejected Document's data goes 30 days after Reject.
- An unsaved Form Proposal goes after 7 days, with its PDF and Reading.

Metadata, history and Delivery logs are kept. An Admin can change the number of days after Delivery in the Organisation settings. After deletion, Reopen is no longer possible and the PDF can no longer be viewed.

## Design

- Before designing, search the Mobbin MCP (`search_screens`, `search_flows`, `search_sections`) for inspiration and UX patterns for the Organisation settings screen for retention. List the references you used in a comment on this ticket.
- Build every component with shadcn/ui. Only hand-roll a component when shadcn has nothing for it, and compose it from shadcn primitives.

## Acceptance criteria

- [ ] Each of the four rules deletes the right data at the right time (tested with a fake clock), including the R2 objects
- [ ] Metadata, history and Delivery logs survive deletion
- [ ] An Admin can change the retention days per Organisation, and a Member can't
- [ ] Reopen and the PDF viewer handle deleted data with a clear message
- [ ] `convex-test` covers every rule above
