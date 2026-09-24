# 38 — Retention cron

Type: task
Status: resolved
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

- [x] Each of the four rules deletes the right data at the right time (tested with a fake clock), including the R2 objects
- [x] Metadata, history and Delivery logs survive deletion
- [x] An Admin can change the retention days per Organisation, and a Member can't
- [x] Reopen and the PDF viewer handle deleted data with a clear message
- [x] `convex-test` covers every rule above

## Comments

- 2026-09-24 — Built on branch `ticket-38-retention` (stacked on `ticket-37-suggest-fields`). `convex/crons.ts` runs `retention.run` daily at 02:30 UTC. For each Organisation it deletes:
  - approved Documents whose `retentionClockAt` is more than N days old. The clock is set at Approval when nothing is sent, and moved forward on every successful Delivery. N is `organisations.retentionDays`, default 30.
  - Documents in Extracting, Needs Review or Extraction Failed more than 90 days after upload. These also move to `deleted`, so they leave the queue and counts.
  - Rejected Documents 30 days after Reject.
  - Form Proposals more than 7 days old, with their PDF and Reading.

  It works in batches of 50 per rule and Organisation, and reschedules itself when a batch is full. The deletion is `rejection.deleteData` (shared with the Admin's Delete). It removes the R2 object, the Reading, Field Values and List values, and now also the frozen envelope (the Payload) on each Delivery. It keeps the Document's metadata, history (a "data_deleted" line by DocuHelper with the reason) and Delivery attempt log. A Delivery without its envelope can't be re-sent, and Reopen and the PDF viewer already refuse once data is gone.
- Settings: `organisations.settings` and `organisations.updateRetention` (Admin only, whole days from 1 to 3650). There's a new "Settings" page (Admin nav) with the Organisation name (the existing `rename`, which had no screen yet) and "Data retention": days after sending, plus the three fixed rules spelled out. The review screen shows a "Data deleted" alert with the date for Documents cleaned up by retention. Mobbin references: [Supabase Organization Settings](https://mobbin.com/screens/b4b535e2-bf49-4c74-9075-daa46c2d9456) (a details card with Save, then a separate data section) and [Devin "Data controls & privacy"](https://mobbin.com/screens/d756de60-9851-4443-88fe-84de19a718cf).
- Tests: `convex/retention.test.ts` with a fake clock covers each rule just before and just after its deadline, and that the R2 objects are gone: Approval without an Integration (30 days, metadata and history kept, PDF refused), with an Integration (7 days set by the Admin, counted from the successful retry, the Delivery log kept and no re-send), never approved (90 days, moved to deleted and out of the counts), Rejected (30 days, Reopen refused), a Form Proposal (7 days), and the setting (Admin only, validated).
- Checked in headless Chrome against dev: the Settings page saved 45 days, and it was still there after a reload.
- **Note for dev and prod:** until R2 is set up, a cleanup that has something to delete fails (removing the R2 object needs R2 settings), and the whole run rolls back. The first data due on dev are this session's seeded Form Proposals, 7 days from now. Nothing is lost, but the cron will log errors until R2 exists.
