# 32 — Auto-Send

Type: task
Status: ready-for-agent
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

- [ ] A clean, Jev-verified Document on a Form with Auto-Send on is approved automatically, with mode `auto`
- [ ] Each blocking condition on its own prevents Auto-Send
- [ ] Auto-Send is evaluated exactly once per successful Extraction and never on a later edit
- [ ] Turning Auto-Send on doesn't approve Documents that already finished
- [ ] The Document history and list show automatic approvals
- [ ] `convex-test` covers every condition and the evaluate-once rule
