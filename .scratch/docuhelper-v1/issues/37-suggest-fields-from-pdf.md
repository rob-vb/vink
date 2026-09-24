# 37 — "Suggest Fields from PDF" on an existing Form

Type: task
Status: ready-for-agent
Blocked by: 36

## What to build

In the Form editor an Admin uses "Suggest Fields from PDF" to extend a Form with a second supplier's layout. The new sample is Read, Jev matches the Reading against the current Form Version, and only the parts of the Reading that matched `none` are proposed as new Fields, the same way as in ticket 36. Saving creates a new Form Version. Documents already in progress keep their own Form Version.

## Design

- Before designing, search the Mobbin MCP (`search_screens`, `search_flows`, `search_sections`) for inspiration and UX patterns for suggesting additions inside an existing editor. List the references you used in a comment on this ticket.
- Build every component with shadcn/ui. Only hand-roll a component when shadcn has nothing for it, and compose it from shadcn primitives.

## Acceptance criteria

- [ ] "Suggest Fields from PDF" is available in the Form editor for Admins
- [ ] Only Reading parts that matched `none` are proposed, and Fields the Form already places are never proposed again
- [ ] Saving the ticked suggestions creates a new Form Version and leaves existing Documents on their own version
- [ ] `convex-test` covers the `none`-only rule with fixture-replay fakes
