# 19 — Invitations and Memberships

Type: task
Status: ready-for-agent
Blocked by: 18

## What to build

An Admin invites colleagues by email (sent through Resend EU) with the role Admin or Member. The invited person accepts through the link and lands in that Organisation. A user with **Memberships** in several Organisations switches between them, and the active one is always visible in the URL. An Admin can change a Member's role or remove their Membership. Members are refused every Admin-only function.

## Design

- Before designing, search the Mobbin MCP (`search_screens`, `search_flows`, `search_sections`) for inspiration and UX patterns for the invite dialog, the members table and the Organisation switcher. List the references you used in a comment on this ticket.
- Build every component with shadcn/ui. Only hand-roll a component when shadcn has nothing for it, and compose it from shadcn primitives.

## Acceptance criteria

- [ ] An Admin can invite by email with a role, and the Invitation carries a token and an expiry
- [ ] Accepting a valid link creates the Membership and lands the user in `/o/<slug>`. An expired or used link shows a clear error
- [ ] A user with several Memberships can switch Organisation, and the slug in the URL changes with it
- [ ] An Admin can change a role or remove a Membership. The last Admin can't be removed or demoted
- [ ] `convex-test`: a Member calling an Admin-only function is refused, and a removed user loses access at once
