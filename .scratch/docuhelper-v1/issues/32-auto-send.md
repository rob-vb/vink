# 32 — Auto-Send

Type: task
Status: resolved
Blocked by: 30, 31

## What to build

Right after an Extraction succeeds (including a successful manual retry), and only then, the Document is approved automatically when all of these hold:
- the Form's Auto-Send is on;
- nothing on it is Needs Review;
- it is Jev-verified;
- "Does not fit this Form" isn't set;
- "user touched" isn't set (no correction, Change Form or Reopen).

The Approval records mode `auto` with `by` null. Auto-Send changes apply only to Extractions that finish afterwards.

## Acceptance criteria

- [x] A clean, Jev-verified Document on a Form with Auto-Send on is approved automatically, with mode `auto`
- [x] Each blocking condition on its own prevents Auto-Send
- [x] Auto-Send is evaluated exactly once per successful Extraction and never on a later edit
- [x] Turning Auto-Send on doesn't approve Documents that already finished
- [x] The Document history and list show automatic approvals
- [x] `convex-test` covers every condition and the evaluate-once rule

## Comments

- 2026-09-24 — Built on branch `ticket-32-auto-send` (stacked on `ticket-35-delivery-retries`, since an automatic Approval sends). Auto-Send is evaluated in `extraction.finish`, the one place an Extraction succeeds (first run, Workpool retry, manual retry or Change Form re-run), and nowhere else. It reads the Form's `autoSend` at that moment and approves when the Document is Jev-verified, doesn't carry "Does not fit this Form", isn't "user touched", and `openReviews` (the same count as the Approve button) is 0. The Approval is `{ mode: "auto", by: null }`, logged as "approved" by DocuHelper with the detail "Auto-Send", and `createDeliveries` sends it like a manual one (the envelope's `approval.by` is `null`). Otherwise the Document goes to Needs Review as before, and nothing re-evaluates it later.
- UI: approved rows in the Document list show an "Auto-Send" badge (`documents.list` returns `approvalMode`). The review screen's Approved banner already says "Automatically". The Form settings text now spells out the conditions and that the setting applies to Documents read from then on. There's no new screen, so no Mobbin search.
- Tests: `convex/autoSend.test.ts` covers an automatic Approval (mode, `by` null, history, list), its Delivery, each blocking condition on its own (off, Needs Review, not verified, doesn't fit with nothing Needs Review, user touched through Change Form), evaluate-once (turning Auto-Send on and checking the last value approve nothing), and a successful manual retry being evaluated.
