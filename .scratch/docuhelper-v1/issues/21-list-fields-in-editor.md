# 21 — List Fields in the Form editor

Type: task
Status: ready-for-agent
Blocked by: 20

## What to build

An Admin adds a **List Field** with sub-Fields, for example one entry per changed tyre or per invoice line. Sub-Fields use the same types and properties as top-level Fields, but a sub-Field can never be a list itself. List Fields are saved in the Form Version like any other Field.

## Design

- Before designing, search the Mobbin MCP (`search_screens`, `search_flows`, `search_sections`) for inspiration and UX patterns for editing nested and repeating fields. List the references you used in a comment on this ticket.
- Build every component with shadcn/ui. Only hand-roll a component when shadcn has nothing for it, and compose it from shadcn primitives.

## Acceptance criteria

- [ ] An Admin can add a List Field and give it sub-Fields of type text, number, date, boolean or choice
- [ ] A list sub-Field is refused in both the UI and the backend
- [ ] Sub-Field keys are unique within their List Field
- [ ] Saving creates a new Form Version that contains the List Field and its sub-Fields
