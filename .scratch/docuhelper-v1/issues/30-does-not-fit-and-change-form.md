# 30 — "Does not fit this Form" and Change Form

Type: task
Status: ready-for-agent
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

- [ ] The flag is set for an empty Reading and when fewer than half of the required Fields matched, with the cut-off read from configuration
- [ ] The banner shows with Change Form next to it
- [ ] Change Form warns with the number of corrections that will be lost, then drops them and re-runs on the stored Reading without calling the Reader
- [ ] Change Form works from Extraction Failed
- [ ] Change Form is refused after Approval
- [ ] `convex-test` covers the flag rule, the dropped corrections, the reuse of the Reading, the user-touched flag and the post-Approval lock
