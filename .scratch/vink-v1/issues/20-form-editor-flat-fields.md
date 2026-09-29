# 20 — Form editor with flat Fields

Type: task
Status: resolved
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

- [x] An Admin can create, edit and list Forms, and a Member can't reach the editor or change Forms
- [x] Each save creates a new Form Version with an increasing number, and earlier versions stay unchanged
- [x] A key is derived from the label, can be edited, and is unique within the Form
- [x] Choice options each have a value and an optional description
- [x] The Review Threshold (0–1, default 0.8) and Auto-Send (default off) are editable and aren't part of the Form Version
- [x] `convex-test` covers versioning, key rules and the Admin-only access

## Comments

- 2026-09-24 — Built on branch `ticket-20-form-editor`. Backend in `convex/forms.ts` (`list`, `get`, `create`, `save`, `updateSettings`); tables `forms` (with `reviewThreshold`, `autoSend` and the current `version`) and `formVersions` (immutable, one row per save). `create` is the first save (version 1); every `save` inserts the next version, even when nothing changed. `list` is open to Members (upload will need it); `get` and every change are Admin-only, and the `/o/<slug>/forms` pages 404 for a Member. Tests: 21 at Seam 1 (`convex/forms.test.ts`) and 4 for `keyFromLabel` (`convex/lib/fieldKeys.test.ts`).
- Key rules: a key is `^[a-z][A-Za-z0-9]*$` and unique within the Form. `keyFromLabel` transliterates rather than translates ("Datum van levering" → `datumVanLevering`), prefixes `field` when the label doesn't start with a letter, and numbers on when the key is taken (`date2`). A key follows its label only until the Admin edits it or the Field is saved; saved keys never move when a label changes. English keys from a model come with the Form Proposal (ticket 36). Ticket 33 adds the key lock in `forms.save`.
- Choice option values must be non-empty and unique within the Field, and a choice needs at least one option. The editor keeps options while the type changes, but only a choice saves them.
- Checked end to end in headless Chrome against the dev deployment: create, add text and choice Fields, duplicate-key feedback, save as v2, settings, list, and phone width.
- Mobbin references used:
  - Field list with a detail panel: [Retool](https://mobbin.com/screens/c30858cb-3842-4897-ad07-1cd27e231760), [Jira](https://mobbin.com/screens/0e55862e-71dc-4385-9115-fa1b9535f95c), [Tines](https://mobbin.com/screens/2acbc288-1a6e-48dd-8ae5-de80e45fa16f), [Wix](https://mobbin.com/screens/b5169b76-d7d1-4a29-a5b0-94eb54a5a52c)
  - Choice options as rows with add and remove: [Plain](https://mobbin.com/screens/246327c9-933f-48aa-ab7b-6e06e6e5a958), [Coda](https://mobbin.com/screens/d085bc38-7a20-4dfd-b3e1-0e853c8fbe75), [Frame.io](https://mobbin.com/screens/bbae7099-7d2b-4547-8a2c-752c8a503cb3)
  - Forms list as a table with a New button: [Otter](https://mobbin.com/screens/3e46b455-979f-4eb9-bb77-700588ef95db), [1Password](https://mobbin.com/screens/ac09bf65-0c0f-4afb-89cf-6ac35a57d332), [Typeform](https://mobbin.com/screens/edfffb3c-92b1-409e-be89-6872b1b0050a)
