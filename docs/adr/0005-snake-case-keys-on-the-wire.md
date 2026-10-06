# Every key Vink sends is snake_case: Field keys and the Payload envelope

Field keys are the names a customer's system receives under `data`, and the envelope around them (`delivery_id`, `document.uploaded_at`, …) is what that system parses first. Until 2026-10-06 both were camelCase. We switched both to snake_case, so one Payload uses one style, and it matches what most webhook senders (Stripe, GitHub, Slack) and database columns use.

A key is lowercase letters and digits in words joined by single underscores, starting with a letter (`convex/lib/fieldKeys.ts`). A key derived from a label is its words joined by `_` ("VAT number" → `vat_number`), numbered on with `_2` when the Form already uses it. The Form Proposal prompt asks for the same style.

## Consequences

- No migration: the only Forms at the time of the switch were test Forms. A Form saved with a camelCase key no longer saves until its keys are changed.
- Receivers built against the old envelope must read `delivery_id` and `document.uploaded_at` (the Van Dijk demo back-office reads both styles).
- The Reading keeps its own camelCase keys. It is never sent, and its keys are the Reader's choice; only Field keys and the envelope are on the wire.
- The recorded fixture runs in `fixtures/` still hold camelCase Field keys; `convex/extraction.test.ts` converts them when it replays them.
