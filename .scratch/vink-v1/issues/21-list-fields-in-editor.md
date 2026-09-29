# 21 — List Fields in the Form editor

Type: task
Status: resolved
Blocked by: 20

## What to build

An Admin adds a **List Field** with sub-Fields, for example one entry per changed tyre or per invoice line. Sub-Fields use the same types and properties as top-level Fields, but a sub-Field can never be a list itself. List Fields are saved in the Form Version like any other Field.

## Design

- Before designing, search the Mobbin MCP (`search_screens`, `search_flows`, `search_sections`) for inspiration and UX patterns for editing nested and repeating fields. List the references you used in a comment on this ticket.
- Build every component with shadcn/ui. Only hand-roll a component when shadcn has nothing for it, and compose it from shadcn primitives.

## Acceptance criteria

- [x] An Admin can add a List Field and give it sub-Fields of type text, number, date, boolean or choice
- [x] A list sub-Field is refused in both the UI and the backend
- [x] Sub-Field keys are unique within their List Field
- [x] Saving creates a new Form Version that contains the List Field and its sub-Fields

## Comments

- 2026-09-24 — Built on branch `ticket-21-list-fields`. The schema's `field` union gains a `list` variant whose `fields` are `flatField`s (the five other types), so the validator refuses a list sub-Field before any code runs. `forms.checkContent` now checks sub-Fields with the same rules as top-level Fields (valid key, label, choice options), with keys unique among siblings only: a sub-Field may reuse a top-level key, since it sits inside the List's entry objects in the Payload. A List Field needs at least one sub-Field. Tests: 3 new at Seam 1 in `convex/forms.test.ts`.
- Editor: sub-Fields show indented under their List in the Field list, with "Add sub-Field" inside the group and in the List's detail panel. A selected sub-Field uses the same detail panel, and its Type picker leaves out List. Like choice options, sub-Fields are kept while a List's type changes and are saved only for a list.
- Checked end to end in headless Chrome against the dev deployment: a List with no sub-Fields is flagged, sub-Field types exclude List, a duplicate sub-Field key blocks the save, a sub-Field may reuse a top-level key, and the Form is created as v1 and saved as v2 with the List intact after a reload. Phone width has no horizontal scroll.
- Mobbin references used:
  - Child fields nested under their group, with an add action inside the group: [Workable](https://mobbin.com/screens/cd8485f7-6990-44df-9b9f-3881b683dec9), [Vercel](https://mobbin.com/screens/c089621f-8c90-402c-98a5-56febb945d18), [HubSpot](https://mobbin.com/screens/6a9b406a-bd55-4824-9d0c-f5b3673d86ee)
  - Type picker that includes an array or list type: [Vapi](https://mobbin.com/screens/f4b1652f-c51e-4d27-a6da-2b16b5525c49), [Google AI Studio](https://mobbin.com/screens/00be6d5c-4d69-42f0-a39d-3a3800875f51)
