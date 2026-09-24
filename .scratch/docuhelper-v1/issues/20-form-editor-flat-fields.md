# 20 — Form editor with flat Fields

Type: task
Status: ready-for-agent
Blocked by: 18

## What to build

An Admin creates a **Form** with a name and an optional description, and adds **Fields** of type text, number, date, boolean or choice. Each Field has:
- a label in any language;
- a key derived from the label as English camelCase, which the Admin can edit;
- an optional description (synonyms and other languages);
- a required flag;
- for a choice, options, each with a value and an optional description.

Every save creates a new, numbered, immutable **Form Version**. The Form also carries its **Review Threshold** (0.8 by default) and the **Auto-Send** switch (off by default). These are Form settings, not part of the Form Version. Only an Admin can reach the editor. Key locking once an Integration is attached comes in ticket 33.

## Design

- Before designing, search the Mobbin MCP (`search_screens`, `search_flows`, `search_sections`) for inspiration and UX patterns for the Forms list and the Form editor (field list, field detail and choice options). List the references you used in a comment on this ticket.
- Build every component with shadcn/ui. Only hand-roll a component when shadcn has nothing for it, and compose it from shadcn primitives.

## Acceptance criteria

- [ ] An Admin can create, edit and list Forms, and a Member can't reach the editor or change Forms
- [ ] Each save creates a new Form Version with an increasing number, and earlier versions stay unchanged
- [ ] A key is derived from the label, can be edited, and is unique within the Form
- [ ] Choice options each have a value and an optional description
- [ ] The Review Threshold (0–1, default 0.8) and Auto-Send (default off) are editable and aren't part of the Form Version
- [ ] `convex-test` covers versioning, key rules and the Admin-only access
